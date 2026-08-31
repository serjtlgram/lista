package parser

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"lista-backend/pkg/models"
)

// EnrichedBookDetails contains the enriched metadata fields for a book.
type EnrichedBookDetails struct {
	Author       string `json:"author"`
	ISBN         string `json:"isbn"`
	Pages        int    `json:"pages"`
	Duration     string `json:"duration"`
	Description  string `json:"description"`
	Genre        string `json:"genre"`
	ReleaseYear  string `json:"release_year"`
	Country      string `json:"country"`
	PosterURL    string `json:"poster_url"`
	PublicRating string `json:"public_rating"`
}

var (
	// Regexes to detect and remove Russian legal / bookstore boilerplate disclaimers from book annotations
	reDrugDisclaimerFull  = regexp.MustCompile(`(?i)(?:внимание!\s*)?\(?\s*незаконное\s+потребление\s+наркотических\s+средств[\s\S]*?ответственност(?:ь|и)[.!?;:\s]*\)?\s*`)
	reDrugDisclaimerShort = regexp.MustCompile(`(?i)(?:внимание!\s*)?\(?\s*незаконное\s+потребление\s+наркотических\s+средств[\s\S]*?причиняет\s+вред\s+здоровью[.!?;:\s]*\)?\s*`)
	reDrugDisclaimerAlt   = regexp.MustCompile(`(?i)(?:внимание!\s*)?\(?\s*(?:их\s+)?незаконный\s+оборот\s+(?:наркотических\s+средств|психотропных\s+веществ|их\s+аналогов\s+)?запрещен[\s\S]*?ответственност(?:ь|и)[.!?;:\s]*\)?\s*`)
	reForeignAgent        = regexp.MustCompile(`(?i)настоящий\s+материал\s*\(информация\)[\s\S]*?(?:иностранным\s+агентом|иноагентом)[.!?;:\s]*\s*`)
	reAgeProfanity        = regexp.MustCompile(`(?i)^\s*(?:содержит\s+нецензурную\s+брань|книга\s+содержит\s+нецензурную\s+брань|возрастное\s+ограничение\s*:\s*18\+|18\+\.?)[.!?;:\s]*\s*`)
)

// CleanBookDescription removes legislative boilerplate notices (drug consumption warnings, foreign agent disclaimers, 18+ notices) from a book annotation.
func CleanBookDescription(desc string) string {
	desc = strings.TrimSpace(desc)
	if desc == "" {
		return ""
	}

	// 1. Remove drug consumption disclaimers
	desc = reDrugDisclaimerFull.ReplaceAllString(desc, "")
	desc = reDrugDisclaimerShort.ReplaceAllString(desc, "")
	desc = reDrugDisclaimerAlt.ReplaceAllString(desc, "")

	// 2. Remove foreign agent disclaimer
	desc = reForeignAgent.ReplaceAllString(desc, "")

	// 3. Remove leading age/profanity notices
	desc = reAgeProfanity.ReplaceAllString(desc, "")

	// 4. Strip leftover leading/trailing punctuation / whitespaces
	desc = strings.TrimLeft(desc, " \t\r\n-—–:;.,")
	desc = strings.TrimRight(desc, " \t\r\n")

	// Collapse multiple consecutive newlines
	reMultiNL := regexp.MustCompile(`\n{3,}`)
	desc = reMultiNL.ReplaceAllString(desc, "\n\n")

	return strings.TrimSpace(desc)
}

// CleanISBN sanitizes and validates an ISBN string.
func CleanISBN(isbn string) string {
	isbn = strings.TrimSpace(isbn)
	if isbn == "" {
		return ""
	}

	// Remove common "ISBN:" or "ISBN " prefix
	rePrefix := regexp.MustCompile(`(?i)^isbn(?:-1[03])?\s*[:\s]*`)
	isbn = rePrefix.ReplaceAllString(isbn, "")

	// Standard ISBN-13
	re13 := regexp.MustCompile(`\b(97[89][\d\-]{10,14}\d)\b`)
	if m := re13.FindStringSubmatch(isbn); len(m) > 1 {
		return m[1]
	}

	// Standard ISBN-10
	re10 := regexp.MustCompile(`\b([\d\-]{9,13}[\dX])\b`)
	if m := re10.FindStringSubmatch(isbn); len(m) > 1 {
		return m[1]
	}

	// Fallback cleanup: keep digits, hyphens, and X
	var sb strings.Builder
	for _, r := range isbn {
		if (r >= '0' && r <= '9') || r == '-' || r == 'X' || r == 'x' {
			sb.WriteRune(r)
		}
	}
	clean := sb.String()
	digitsOnly := strings.ReplaceAll(strings.ReplaceAll(clean, "-", ""), " ", "")
	if len(digitsOnly) == 10 || len(digitsOnly) == 13 {
		return clean
	}
	return clean
}

// FetchEnrichedBookDetails searches external book APIs and Fireworks AI to enrich book metadata.
func FetchEnrichedBookDetails(title, author, currentISBN, currentYear, lang, currentDescription, currentDuration, fireworksKey string) *EnrichedBookDetails {
	title = strings.TrimSpace(title)
	if title == "" {
		return nil
	}

	result := &EnrichedBookDetails{
		Author:      strings.TrimSpace(author),
		ISBN:        CleanISBN(currentISBN),
		Description: CleanBookDescription(currentDescription),
		ReleaseYear: strings.TrimSpace(currentYear),
	}

	targetLang := "ru-RU"
	switch lang {
	case "en":
		targetLang = "en-US"
	case "es":
		targetLang = "es-ES"
	case "uk":
		targetLang = "uk-UA"
	}

	// 1. Search external sources (Google Books, FantLab, OpenLibrary, ITunes)
	var searchResults []models.CatalogSearchResult

	// If we already have an ISBN, search by ISBN first
	if result.ISBN != "" {
		if gbRes, err := SearchGoogleBooks(result.ISBN); err == nil && len(gbRes) > 0 {
			searchResults = append(searchResults, gbRes...)
		}
		if olRes, err := SearchOpenLibrary(result.ISBN); err == nil && len(olRes) > 0 {
			searchResults = append(searchResults, olRes...)
		}
	}

	// Search by Title + Author or Title
	query := title
	if result.Author != "" && !strings.Contains(strings.ToLower(title), strings.ToLower(result.Author)) {
		query = title + " " + result.Author
	}

	apiRes := SearchBooksMultiSource(query, targetLang)
	searchResults = append(searchResults, apiRes...)

	// Also search by clean title if different
	if len(searchResults) == 0 && query != title {
		searchResults = append(searchResults, SearchBooksMultiSource(title, targetLang)...)
	}

	// Extract data from best matches
	for _, item := range searchResults {
		if result.ISBN == "" && item.ISBN != "" {
			result.ISBN = CleanISBN(item.ISBN)
		}
		if result.Author == "" && item.Author != "" {
			result.Author = item.Author
		}
		if result.Genre == "" && item.Genre != "" {
			result.Genre = cleanFirstGenre(item.Genre)
		}
		if result.ReleaseYear == "" && item.ReleaseYear != "" {
			result.ReleaseYear = item.ReleaseYear
		}
		if result.PosterURL == "" && item.PosterURL != "" {
			result.PosterURL = item.PosterURL
		}
		if result.PublicRating == "" && item.PublicRating != "" {
			result.PublicRating = item.PublicRating
		}
		if result.Description == "" && item.Description != "" {
			result.Description = CleanBookDescription(item.Description)
		}
		if result.Pages == 0 && item.Duration != "" {
			digits := regexp.MustCompile(`\d+`).FindString(item.Duration)
			if p, err := strconv.Atoi(digits); err == nil && p > 0 {
				result.Pages = p
			}
		}
	}

	// 2. Enhance & Verify with Fireworks AI (if key available)
	if fireworksKey != "" {
		enrichBookWithAI(fireworksKey, lang, title, result.Author, result.ISBN, result.ReleaseYear, result.Description, result.Pages, result)
	}

	// Final cleanup
	result.Description = CleanBookDescription(result.Description)
	result.ISBN = CleanISBN(result.ISBN)

	if result.Pages > 0 {
		result.Duration = fmt.Sprintf("%d стр.", result.Pages)
	}

	return result
}

func enrichBookWithAI(fireworksKey, lang, title, author, currentISBN, year, description string, pages int, details *EnrichedBookDetails) {
	if fireworksKey == "" || details == nil {
		return
	}

	var prompt string
	switch lang {
	case "uk":
		prompt = fmt.Sprintf(`Ти — експерт з літератури та метаданих книг. Твоє завдання — перевірити, доповнити та очистити метадані для книги "%s" (автор: "%s", рік: "%s") українською мовою.

Контекст картки:
- Назва: %s
- Автор: %s
- Поточний ISBN: %s
- Поточна кількість сторінок: %d
- Поточна анотація: %s

Обов'язкові правила:
1. ISBN: Знайди або підтвердь офіційний номер видання ISBN (наприклад, 978-617-12-3456-7 або 978-5-17-090845-6). Не вигадуй неіснуючі номери! Якщо точний ISBN відомий — поверни його.
2. Кількість сторінок (pages): Якщо сторінки не вказані (0), знайди реальну середню кількість сторінок стандартного паперового видання книги (ціле число, наприклад 352). Не вигадуй випадкові цифри!
3. Очищення анотації (description):
   - КАТЕГОРИЧНО ВИДАЛИ з анотації будь-які попередження про наркотики (наприклад: "НЕЗАКОННЕ ПОТРЕБЛЕНИЕ НАРКОТИЧЕСКИХ СРЕДСТВ..."), юридичні дисклеймери, вікові обмеження на початку та помітки іноагентів.
   - Залиш ТІЛЬКИ сам зміст/анотацію книги українською мовою.
4. Автор (author): Вкажи ім'я та прізвище автора українською мовою (кирилицею).
5. Жанр (genre): Вкажи основний літературний жанр українською мовою (наприклад: "Фантастика", "Роман", "Детектив").

Поверни результат виключно у форматі JSON без markdown-розмітки:
{
  "isbn": "978-617-12-3456-7",
  "pages": 352,
  "description": "Чиста анотація книги...",
  "author": "Ім'я Автора",
  "genre": "Жанр",
  "release_year": "1967",
  "country": "Країна"
}`, title, author, year, title, author, currentISBN, pages, description)

	case "es":
		prompt = fmt.Sprintf(`Eres un experto en literatura y metadatos de libros. Tu tarea es verificar, completar y limpiar los metadatos para el libro "%s" (autor: "%s", año: "%s") en español.

Contexto:
- Título: %s
- Autor: %s
- ISBN actual: %s
- Páginas actuales: %d
- Sinopsis actual: %s

Reglas obligatorias:
1. ISBN: Encuentra o confirma el número de edición ISBN oficial (ej. 978-84-450-7487-9). ¡No inventes números!
2. Páginas (pages): Si las páginas son 0, busca el número real de páginas de la edición estándar del libro.
3. Limpieza de sinopsis (description): Elimina cualquier aviso legal, advertencia sobre drogas o marcas de distribuidor. Conserva solo la sinopsis real en español.
4. Autor y género en español.

Devuelve únicamente un objeto JSON válido sin markdown:
{
  "isbn": "978-84-450-7487-9",
  "pages": 352,
  "description": "Sinopsis limpia...",
  "author": "Nombre del autor",
  "genre": "Género",
  "release_year": "1967",
  "country": "País"
}`, title, author, year, title, author, currentISBN, pages, description)

	case "en":
		prompt = fmt.Sprintf(`You are a book and publishing metadata expert. Your task is to verify, complete, and clean metadata for the book "%s" (author: "%s", year: "%s") in English.

Card Context:
- Title: %s
- Author: %s
- Current ISBN: %s
- Current page count: %d
- Current synopsis: %s

Mandatory Rules:
1. ISBN: Find or confirm the official ISBN (e.g. 978-0-14-118776-1). Do not invent fictitious numbers!
2. Page count (pages): If pages is 0, find the factual page count of standard print edition.
3. Clean description (description): Remove any legal disclaimers, drug warnings, publisher notices. Preserve only the genuine book synopsis.
4. Author & Genre in English.

Return only a valid JSON object without markdown:
{
  "isbn": "978-0-14-118776-1",
  "pages": 352,
  "description": "Clean book synopsis...",
  "author": "Author Name",
  "genre": "Genre",
  "release_year": "1967",
  "country": "Country"
}`, title, author, year, title, author, currentISBN, pages, description)

	default: // "ru"
		prompt = fmt.Sprintf(`Ты — эксперт по литературе и книжным метаданным. Твоя задача — проверить, дополнить и очистить данные для книги "%s" (автор: "%s", год: "%s") на русском языке.

Контекстные данные карточки:
- Название: %s
- Автор: %s
- Текущий ISBN: %s
- Текущее количество страниц: %d
- Текущая аннотация: %s

Обязательные правила:
1. ISBN: Найди или подтверди официальный номер издания книги ISBN (например: 978-5-17-090845-6 или 978-5-699-12345-6). Не выдумывай номер! Если точный номер известен для стандартного русскоязычного или оригинального издания — укажи его.
2. Количество страниц (pages): Если количество страниц не указано (0), найди реальное количество страниц стандартного печатного издания этой книги (целое число, например 384). Не выдумывай отсебятину, пиши точное фактическое значение!
3. Очистка аннотации (description):
   - КАТЕГОРИЧЕСКИ УДАЛИ из аннотации дисклеймер о наркотиках:
     "НЕЗАКОННОЕ ПОТРЕБЛЕНИЕ НАРКОТИЧЕСКИХ СРЕДСТВ, ПСИХОТРОПНЫХ ВЕЩЕСТВ, ИХ АНАЛОГОВ ПРИЧИНЯЕТ ВРЕД ЗДОРОВЬЮ, ИХ НЕЗАКОННЫЙ ОБОРОТ ЗАПРЕЩЕН И ВЛЕЧЕТ УСТАНОВЛЕННУЮ ЗАКОНОДАТЕЛЬСТВОМ ОТВЕТСТВЕННОСТЬ" и любые подобные предупреждения, пометки об иноагентах, возрастные плашки 18+ в начале.
   - Оставь ТОЛЬКО саму художественную или описательную аннотацию книги на русском языке.
4. Автор (author): Укажи имя и фамилию автора на русском языке (кириллицей).
5. Жанр (genre): Укажи основной жанр книги на русском языке (например: "Роман", "Фантастика", "Детектив", "Классика").

Формат ответа:
Верни результат строго в формате JSON без markdown-тегов:
{
  "isbn": "978-5-17-090845-6",
  "pages": 384,
  "description": "Чистая аннотация книги без дисклеймеров...",
  "author": "Имя Автора",
  "genre": "Классика",
  "release_year": "1967",
  "country": "СССР"
}`, title, author, year, title, author, currentISBN, pages, description)
	}

	reqBodyMap := map[string]interface{}{
		"model": "accounts/fireworks/models/minimax-m3",
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
		"response_format": map[string]string{"type": "json_object"},
		"temperature":     0.1,
		"max_tokens":      1024,
	}

	bodyBytes, _ := json.Marshal(reqBodyMap)
	req, err := http.NewRequest("POST", "https://api.fireworks.ai/inference/v1/chat/completions", bytes.NewBuffer(bodyBytes))
	if err != nil {
		return
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+fireworksKey)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var fireworksResp struct {
		Choices []struct {
			Message struct {
				Content string `json:"content"`
			} `json:"message"`
		} `json:"choices"`
	}

	if err := json.Unmarshal(respBody, &fireworksResp); err == nil && len(fireworksResp.Choices) > 0 {
		rawContent := strings.TrimSpace(fireworksResp.Choices[0].Message.Content)
		var parsed struct {
			ISBN        string `json:"isbn"`
			Pages       int    `json:"pages"`
			Description string `json:"description"`
			Author      string `json:"author"`
			Genre       string `json:"genre"`
			ReleaseYear string `json:"release_year"`
			Country     string `json:"country"`
		}
		if err := json.Unmarshal([]byte(rawContent), &parsed); err == nil {
			if parsed.ISBN != "" && (details.ISBN == "" || len(parsed.ISBN) > len(details.ISBN)) {
				details.ISBN = CleanISBN(parsed.ISBN)
			}
			if parsed.Pages > 0 && details.Pages == 0 {
				details.Pages = parsed.Pages
			}
			if parsed.Description != "" {
				cleanDesc := CleanBookDescription(parsed.Description)
				if cleanDesc != "" {
					details.Description = cleanDesc
				}
			}
			if parsed.Author != "" && details.Author == "" {
				details.Author = parsed.Author
			}
			if parsed.Genre != "" && details.Genre == "" {
				details.Genre = cleanFirstGenre(parsed.Genre)
			}
			if parsed.ReleaseYear != "" && details.ReleaseYear == "" {
				details.ReleaseYear = parsed.ReleaseYear
			}
			if parsed.Country != "" && details.Country == "" {
				details.Country = parsed.Country
			}
		}
	}
}
