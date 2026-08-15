package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"
	"unicode"

	"lista-backend/pkg/auth"
	"lista-backend/pkg/models"
	"lista-backend/pkg/parser"
)

var (
	reParenBrackets  = regexp.MustCompile(`[\(\[\{][^\)\]\}]*[\)\]\}]`)
	reSeasonPatterns = regexp.MustCompile(`(?i)(?:[.:\-—–/|]\s*)?(?:дело\s*(?:№|no)?|сезон|season|часть|part|эпизод|episode|глава|chapter|vol|volume|выпуск|книга|book|фильм|film)\s*(?:№|no)?\s*[\dIVXLCDMivxlcdm]+(?:\s*[:.\-—–]\s*.*)?$`)
	reTrailingSeason = regexp.MustCompile(`(?i)\s+(?:дело\s*(?:№|no)?|сезон|season|часть|part|эпизод|episode|глава|chapter|vol|volume|выпуск|книга|book)\s*(?:№|no)?\s*[\dIVXLCDMivxlcdm]+.*$`)
	reTrailingDigits = regexp.MustCompile(`(?i)\s+[\dIVXLCDMivxlcdm]+$`)
)

func normalizeTitleForComparison(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, "ё", "е")
	s = strings.ReplaceAll(s, "Ё", "е")
	s = reParenBrackets.ReplaceAllString(s, " ")
	var sb strings.Builder
	for _, r := range s {
		// Keep letters, numbers and spaces, ignore punctuation/quotes
		if unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.IsSpace(r) {
			sb.WriteRune(r)
		}
	}
	return strings.Join(strings.Fields(sb.String()), " ")
}

func extractFranchiseRoots(title string) []string {
	trimmed := strings.TrimSpace(title)
	if trimmed == "" {
		return nil
	}
	s := trimmed
	s = strings.ReplaceAll(s, "ё", "е")
	s = strings.ReplaceAll(s, "Ё", "е")
	s = reParenBrackets.ReplaceAllString(s, " ")

	rootsMap := make(map[string]bool)
	normFull := normalizeTitleForComparison(s)
	if normFull != "" {
		rootsMap[normFull] = true
	}

	stripped := reSeasonPatterns.ReplaceAllString(s, "")
	stripped = reTrailingSeason.ReplaceAllString(stripped, "")

	parts := strings.FieldsFunc(stripped, func(r rune) bool {
		return r == '.' || r == ':' || r == '-' || r == '—' || r == '–' || r == '/' || r == '|' || r == ','
	})
	for _, p := range parts {
		pClean := reTrailingDigits.ReplaceAllString(strings.TrimSpace(p), "")
		pNorm := normalizeTitleForComparison(pClean)
		if len(pNorm) >= 3 {
			rootsMap[pNorm] = true
		}
	}

	// Check prefix before conjunctions (" и ", " and ", " y ", " i ", " та ")
	lowerStripped := strings.ToLower(stripped)
	conjunctions := []string{" и ", " and ", " y ", " i ", " та "}
	for _, conj := range conjunctions {
		if idx := strings.Index(lowerStripped, conj); idx != -1 {
			prefix := strings.TrimSpace(stripped[:idx])
			pNorm := normalizeTitleForComparison(prefix)
			if len(pNorm) >= 4 {
				rootsMap[pNorm] = true
			}
		}
	}

	var res []string
	for k := range rootsMap {
		res = append(res, k)
	}
	return res
}

func extractFranchiseKey(title string) string {
	roots := extractFranchiseRoots(title)
	if len(roots) == 0 {
		return normalizeTitleForComparison(title)
	}
	best := roots[0]
	for _, r := range roots {
		if len(r) >= 3 && (len(r) < len(best) || len(best) < 3) {
			best = r
		}
	}
	return best
}

func parseTitlesFromAIResponse(raw string) []string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return nil
	}

	// Extract JSON array slice if surrounded by text or code blocks
	if idx := strings.Index(raw, "["); idx != -1 {
		if endIdx := strings.LastIndex(raw, "]"); endIdx != -1 && endIdx > idx {
			raw = raw[idx : endIdx+1]
		}
	}

	var titles []string
	if err := json.Unmarshal([]byte(raw), &titles); err == nil && len(titles) > 0 {
		return cleanTitlesList(titles)
	}

	// Retry after replacing literal newlines
	cleaned := strings.ReplaceAll(raw, "\n", " ")
	if err := json.Unmarshal([]byte(cleaned), &titles); err == nil && len(titles) > 0 {
		return cleanTitlesList(titles)
	}

	// Fallback regex to extract quoted strings
	re := regexp.MustCompile(`"([^"]+)"`)
	matches := re.FindAllStringSubmatch(raw, -1)
	for _, m := range matches {
		if len(m) > 1 {
			t := strings.TrimSpace(m[1])
			if t != "" && t != "[" && t != "]" {
				titles = append(titles, t)
			}
		}
	}

	return cleanTitlesList(titles)
}

func cleanTitlesList(titles []string) []string {
	var result []string
	seen := make(map[string]bool)
	for _, t := range titles {
		trimmed := strings.TrimSpace(t)
		if trimmed != "" {
			norm := normalizeTitleForComparison(trimmed)
			if norm != "" && !seen[norm] {
				seen[norm] = true
				result = append(result, trimmed)
			} else if norm == "" && !seen[trimmed] {
				// Fallback if title is purely punctuation
				seen[trimmed] = true
				result = append(result, trimmed)
			}
		}
	}
	return result
}

func selectBestCatalogMatch(query string, candidates []models.CatalogSearchResult) (models.CatalogSearchResult, bool) {
	if len(candidates) == 0 {
		return models.CatalogSearchResult{}, false
	}
	normQuery := normalizeTitleForComparison(query)

	bestIdx := -1
	bestScore := -1

	for i, c := range candidates {
		if strings.TrimSpace(c.Title) == "" {
			continue
		}
		score := 0
		normTitle := normalizeTitleForComparison(c.Title)

		// Exact title match gets highest score
		if normTitle == normQuery {
			score += 100
		} else if strings.HasPrefix(normTitle, normQuery) || strings.HasPrefix(normQuery, normTitle) {
			score += 50
		}

		// Real poster check: strong bonus if real poster, penalty if placeholder
		if c.PosterURL != "" && !strings.Contains(c.PosterURL, "no-poster") && !strings.HasPrefix(c.PosterURL, "data:image") {
			score += 40
		} else if strings.Contains(c.PosterURL, "no-poster") {
			score -= 20
		}

		// Rich metadata bonuses
		if c.Description != "" {
			score += 15
		}
		if c.ReleaseYear != "" {
			score += 10
		}
		if c.PublicRating != "" {
			score += 5
		}

		if score > bestScore {
			bestScore = score
			bestIdx = i
		}
	}

	if bestIdx >= 0 && bestScore >= 20 {
		card := candidates[bestIdx]
		if strings.Contains(card.PosterURL, "no-poster") {
			card.PosterURL = ""
		}
		return card, true
	}
	return models.CatalogSearchResult{}, false
}

// GET /api/lists/{id}/recommendations
func (h *Handler) GetListRecommendations(w http.ResponseWriter, r *http.Request) {
	user, _ := auth.GetUserFromContext(r)
	var userID int64
	if user != nil {
		userID = user.ID
	}

	// Try reading from JSON body first (for POST requests)
	var bodyParams struct {
		ItemIDs    string `json:"item_ids"`
		ItemTitles string `json:"item_titles"`
		Category   string `json:"category"`
		Title      string `json:"title"`
		Lang       string `json:"lang"`
	}
	if r.Method == "POST" {
		_ = json.NewDecoder(r.Body).Decode(&bodyParams)
	}

	itemIDsParam := r.URL.Query().Get("item_ids")
	if bodyParams.ItemIDs != "" {
		itemIDsParam = bodyParams.ItemIDs
	}

	itemTitlesParam := r.URL.Query().Get("item_titles")
	if bodyParams.ItemTitles != "" {
		itemTitlesParam = bodyParams.ItemTitles
	}

	categoryParam := r.URL.Query().Get("category")
	if bodyParams.Category != "" {
		categoryParam = bodyParams.Category
	}

	rawLang := strings.ToLower(strings.TrimSpace(r.URL.Query().Get("lang")))
	if bodyParams.Lang != "" {
		rawLang = strings.ToLower(strings.TrimSpace(bodyParams.Lang))
	}
	if rawLang == "" {
		rawLang = strings.ToLower(strings.TrimSpace(r.Header.Get("Accept-Language")))
	}
	if rawLang == "" && user != nil && user.LanguageCode != "" {
		rawLang = strings.ToLower(strings.TrimSpace(user.LanguageCode))
	}

	userLang := "ru"
	switch {
	case strings.HasPrefix(rawLang, "en"):
		userLang = "en"
	case strings.HasPrefix(rawLang, "es"):
		userLang = "es"
	case strings.HasPrefix(rawLang, "uk") || strings.HasPrefix(rawLang, "ua"):
		userLang = "uk"
	default:
		userLang = "ru"
	}

	defaultListTitle := "Мои рекомендации"
	if userLang == "en" {
		defaultListTitle = "My Recommendations"
	} else if userLang == "es" {
		defaultListTitle = "Mis Recomendaciones"
	} else if userLang == "uk" {
		defaultListTitle = "Мої рекомендації"
	}

	listTitleDisplay := defaultListTitle
	if bodyParams.Title != "" {
		listTitleDisplay = bodyParams.Title
	} else if tQuery := r.URL.Query().Get("title"); tQuery != "" {
		listTitleDisplay = tQuery
	}

	// 1. Collect all user DB titles + incoming titles for deduplication
	userExistingTitles := make(map[string]bool)
	userExistingFranchises := make(map[string]bool)

	addExistingTitle := func(title string) {
		tTrim := strings.TrimSpace(title)
		if tTrim == "" {
			return
		}
		for _, root := range extractFranchiseRoots(tTrim) {
			userExistingFranchises[root] = true
		}
		userExistingTitles[strings.ToLower(tTrim)] = true
		norm := normalizeTitleForComparison(tTrim)
		if norm != "" {
			userExistingTitles[norm] = true
		}
	}

	if userID != 0 && h.DB != nil && h.DB.Pool != nil {
		rowsAll, errAll := h.DB.Pool.Query(r.Context(), `SELECT title FROM items WHERE user_id = $1`, userID)
		if errAll == nil && rowsAll != nil {
			defer rowsAll.Close()
			for rowsAll.Next() {
				var dbTitle string
				if err := rowsAll.Scan(&dbTitle); err == nil {
					addExistingTitle(dbTitle)
				}
			}
		}
	}

	if itemTitlesParam != "" {
		rawTitles := strings.Split(itemTitlesParam, "|")
		for _, rawT := range rawTitles {
			cleanT := strings.TrimSpace(rawT)
			if idx := strings.Index(cleanT, "["); idx != -1 {
				cleanT = strings.TrimSpace(cleanT[:idx])
			}
			addExistingTitle(cleanT)
		}
	}

	isTitleAlreadyExisting := func(title string) bool {
		tClean := strings.ToLower(strings.TrimSpace(title))
		if tClean != "" && userExistingTitles[tClean] {
			return true
		}
		norm := normalizeTitleForComparison(title)
		if norm != "" && userExistingTitles[norm] {
			return true
		}
		for _, root := range extractFranchiseRoots(title) {
			if userExistingFranchises[root] {
				return true
			}
		}
		return false
	}

	// 2. Gather context metadata (genres, countries, years, directors, authors) SPECIFICALLY for items in THIS list
	itemDescriptions := []string{}
	categoriesFound := []string{}
	yearsFound := []int{}
	genresFound := []string{}
	countriesFound := []string{}
	directorsFound := []string{}
	authorsFound := []string{}

	if itemIDsParam != "" && userID != 0 && h.DB != nil && h.DB.Pool != nil {
		ids := strings.Split(itemIDsParam, ",")
		validIDs := []string{}
		for _, id := range ids {
			idClean := strings.TrimSpace(id)
			if idClean != "" {
				validIDs = append(validIDs, idClean)
			}
		}
		if len(validIDs) > 0 {
			query := `SELECT title, category, release_year, genre, country, director, author FROM items WHERE user_id = $1 AND id = ANY($2)`
			rows, err := h.DB.Pool.Query(r.Context(), query, userID, validIDs)
			if err == nil && rows != nil {
				defer rows.Close()
				for rows.Next() {
					var t, c, y, g, cnt, dir, aut string
					if err := rows.Scan(&t, &c, &y, &g, &cnt, &dir, &aut); err == nil && t != "" {
						desc := t
						meta := []string{}
						if y != "" {
							meta = append(meta, y)
							if yVal, e := strconv.Atoi(y); e == nil {
								yearsFound = append(yearsFound, yVal)
							}
						}
						if g != "" {
							meta = append(meta, g)
							genresFound = append(genresFound, g)
						}
						if cnt != "" {
							meta = append(meta, cnt)
							countriesFound = append(countriesFound, cnt)
						}
						if dir != "" {
							meta = append(meta, dir)
							directorsFound = append(directorsFound, dir)
						}
						if aut != "" {
							meta = append(meta, aut)
							authorsFound = append(authorsFound, aut)
						}
						if len(meta) > 0 {
							desc += fmt.Sprintf(" [%s]", strings.Join(meta, ", "))
						}
						itemDescriptions = append(itemDescriptions, desc)
						categoriesFound = append(categoriesFound, mapCategoryToEn(c))
					}
				}
			}
		}
	}

	if len(itemDescriptions) == 0 && itemTitlesParam != "" {
		rawTitles := strings.Split(itemTitlesParam, "|")
		for _, rawT := range rawTitles {
			rawT = strings.TrimSpace(rawT)
			if rawT == "" {
				continue
			}
			itemDescriptions = append(itemDescriptions, rawT)
			if idx := strings.Index(rawT, "["); idx != -1 && strings.HasSuffix(rawT, "]") {
				inner := rawT[idx+1 : len(rawT)-1]
				parts := strings.Split(inner, ",")
				for _, p := range parts {
					p = strings.TrimSpace(p)
					pLower := strings.ToLower(p)
					if strings.HasPrefix(pLower, "страна:") || strings.HasPrefix(pLower, "country:") || strings.HasPrefix(pLower, "país:") || strings.HasPrefix(pLower, "pais:") || strings.HasPrefix(pLower, "країна:") {
						idx := strings.Index(p, ":")
						cntVal := strings.TrimSpace(p[idx+1:])
						if cntVal != "" {
							countriesFound = append(countriesFound, cntVal)
						}
					} else if strings.HasPrefix(pLower, "режиссер:") || strings.HasPrefix(pLower, "director:") || strings.HasPrefix(pLower, "режисер:") {
						idx := strings.Index(p, ":")
						dirVal := strings.TrimSpace(p[idx+1:])
						if dirVal != "" {
							directorsFound = append(directorsFound, dirVal)
						}
					} else if strings.HasPrefix(pLower, "автор:") || strings.HasPrefix(pLower, "author:") || strings.HasPrefix(pLower, "autor:") {
						idx := strings.Index(p, ":")
						autVal := strings.TrimSpace(p[idx+1:])
						if autVal != "" {
							authorsFound = append(authorsFound, autVal)
						}
					} else if yVal, e := strconv.Atoi(p); e == nil {
						yearsFound = append(yearsFound, yVal)
					} else if p != "" {
						genresFound = append(genresFound, p)
					}
				}
			}
		}
	}

	// 2. Determine primary category in user language
	catEn := mapCategoryToEn(categoryParam)
	if catEn == "" || catEn == "all" {
		if len(categoriesFound) > 0 {
			catEn = categoriesFound[0]
		} else {
			catEn = "movie"
		}
	}

	var catLangName string
	switch userLang {
	case "en":
		switch catEn {
		case "movie":
			catLangName = "movies"
		case "tv", "show":
			catLangName = "TV series"
		case "book":
			catLangName = "books"
		case "game":
			catLangName = "games"
		default:
			catLangName = "movies/TV series/books/games"
		}
	case "es":
		switch catEn {
		case "movie":
			catLangName = "películas"
		case "tv", "show":
			catLangName = "series de TV"
		case "book":
			catLangName = "libros"
		case "game":
			catLangName = "videojuegos"
		default:
			catLangName = "películas/series/libros/videojuegos"
		}
	case "uk":
		switch catEn {
		case "movie":
			catLangName = "фільми"
		case "tv", "show":
			catLangName = "серіали"
		case "book":
			catLangName = "книги"
		case "game":
			catLangName = "ігри"
		default:
			catLangName = "фільми/серіали/книги/ігри"
		}
	default: // "ru"
		switch catEn {
		case "movie":
			catLangName = "фильмы"
		case "tv", "show":
			catLangName = "сериалы"
		case "book":
			catLangName = "книги"
		case "game":
			catLangName = "игры"
		default:
			catLangName = "фильмы/сериалы/книги/игры"
		}
	}

	// Deduplicate found metadata for prompt
	uniqYears := []string{}
	if len(yearsFound) > 0 {
		minY, maxY := yearsFound[0], yearsFound[0]
		for _, y := range yearsFound {
			if y < minY {
				minY = y
			}
			if y > maxY {
				maxY = y
			}
		}
		if minY == maxY {
			uniqYears = append(uniqYears, strconv.Itoa(minY))
		} else {
			uniqYears = append(uniqYears, fmt.Sprintf("%d-%d", minY, maxY))
		}
	}

	uniqGenres := cleanTitlesList(genresFound)
	uniqCountries := cleanTitlesList(countriesFound)
	uniqDirectors := cleanTitlesList(directorsFound)
	uniqAuthors := cleanTitlesList(authorsFound)

	// Build exact user prompt with language-specific text
	var itemsListStr, genresStr, yearsLine, countriesLine, directorsLine, authorsLine string

	switch userLang {
	case "en":
		itemsListStr = strings.Join(itemDescriptions, "\n- ")
		if itemsListStr != "" {
			itemsListStr = "- " + itemsListStr
		} else {
			itemsListStr = "- (list is empty, give general recommendations)"
		}
		genresStr = strings.Join(uniqGenres, ", ")
		if genresStr == "" {
			genresStr = "popular"
		}
		if len(uniqYears) > 0 {
			yearsLine = fmt.Sprintf("\nPeriod: %s", strings.Join(uniqYears, ", "))
		}
		if len(uniqCountries) > 0 {
			countriesLine = fmt.Sprintf("\nCountries: %s", strings.Join(uniqCountries, ", "))
		}
		if len(uniqDirectors) > 0 {
			directorsLine = fmt.Sprintf("\nDirectors: %s", strings.Join(uniqDirectors, ", "))
		}
		if len(uniqAuthors) > 0 {
			authorsLine = fmt.Sprintf("\nAuthors: %s", strings.Join(uniqAuthors, ", "))
		}

	case "es":
		itemsListStr = strings.Join(itemDescriptions, "\n- ")
		if itemsListStr != "" {
			itemsListStr = "- " + itemsListStr
		} else {
			itemsListStr = "- (la lista está vacía, proporciona recomendaciones generales)"
		}
		genresStr = strings.Join(uniqGenres, ", ")
		if genresStr == "" {
			genresStr = "populares"
		}
		if len(uniqYears) > 0 {
			yearsLine = fmt.Sprintf("\nPeríodo: %s", strings.Join(uniqYears, ", "))
		}
		if len(uniqCountries) > 0 {
			countriesLine = fmt.Sprintf("\nPaíses: %s", strings.Join(uniqCountries, ", "))
		}
		if len(uniqDirectors) > 0 {
			directorsLine = fmt.Sprintf("\nDirectores: %s", strings.Join(uniqDirectors, ", "))
		}
		if len(uniqAuthors) > 0 {
			authorsLine = fmt.Sprintf("\nAutores: %s", strings.Join(uniqAuthors, ", "))
		}

	case "uk":
		itemsListStr = strings.Join(itemDescriptions, "\n- ")
		if itemsListStr != "" {
			itemsListStr = "- " + itemsListStr
		} else {
			itemsListStr = "- (список порожній, надай загальні рекомендації)"
		}
		genresStr = strings.Join(uniqGenres, ", ")
		if genresStr == "" {
			genresStr = "популярні"
		}
		if len(uniqYears) > 0 {
			yearsLine = fmt.Sprintf("\nПеріод: %s", strings.Join(uniqYears, ", "))
		}
		if len(uniqCountries) > 0 {
			countriesLine = fmt.Sprintf("\nКраїни: %s", strings.Join(uniqCountries, ", "))
		}
		if len(uniqDirectors) > 0 {
			directorsLine = fmt.Sprintf("\nРежисери: %s", strings.Join(uniqDirectors, ", "))
		}
		if len(uniqAuthors) > 0 {
			authorsLine = fmt.Sprintf("\nАвтори: %s", strings.Join(uniqAuthors, ", "))
		}

	default: // "ru"
		itemsListStr = strings.Join(itemDescriptions, "\n- ")
		if itemsListStr != "" {
			itemsListStr = "- " + itemsListStr
		} else {
			itemsListStr = "- (список пуст, дай общие рекомендации)"
		}
		genresStr = strings.Join(uniqGenres, ", ")
		if genresStr == "" {
			genresStr = "популярные"
		}
		if len(uniqYears) > 0 {
			yearsLine = fmt.Sprintf("\nПериод: %s", strings.Join(uniqYears, ", "))
		}
		if len(uniqCountries) > 0 {
			countriesLine = fmt.Sprintf("\nСтраны: %s", strings.Join(uniqCountries, ", "))
		}
		if len(uniqDirectors) > 0 {
			directorsLine = fmt.Sprintf("\nРежиссеры: %s", strings.Join(uniqDirectors, ", "))
		}
		if len(uniqAuthors) > 0 {
			authorsLine = fmt.Sprintf("\nАвторы: %s", strings.Join(uniqAuthors, ", "))
		}
	}

	var prompt string
	switch userLang {
	case "en":
		prompt = fmt.Sprintf(`You are an expert in movies, TV series, books, and games recommendation. Your task: analyze the user context and recommend 25 top works that perfectly match the mood, theme, genre, and category (%s) of "%s" and align with the user's preferences inside their list.
List topic: "%s"
Category: %s
Genres: %s%s%s%s%s
User's current list:
%s

Generate EXACTLY 25 recommendations (no more and no less) that perfectly match the spirit, meaning, genre, and category (%s) of the list topic and match the user's preferences.

RULES:
1. Recommend ONLY REAL, officially released works (movies/TV shows/books/games).
2. NEVER invent fake titles, unreleased parts, or nonexistent seasons (e.g. do NOT invent "Season 5", "Part 12", etc.).
3. STRICTLY FORBIDDEN: do not recommend any works from the same franchise/universe/series that are already in the user's list.
4. DIVERSITY: Each recommendation must be an independent, standalone work from a DIFFERENT franchise. Do not include multiple seasons or sequels of the same franchise.
5. Provide ONLY the main official title in English (without season numbers or episode subtitles, e.g. "Breaking Bad", "Fargo", "True Detective", "Mindhunter", "Sherlock").
6. Strictly adhere to category (%s).
7. Response format: STRICTLY raw JSON array of 25 strings. Example: ["Title 1", "Title 2", ...]. No markdown formatting and no conversational text.`,
			catLangName, listTitleDisplay, listTitleDisplay, catLangName, genresStr, yearsLine, countriesLine, directorsLine, authorsLine, itemsListStr, catLangName, catLangName)

	case "es":
		prompt = fmt.Sprintf(`Eres un experto en recomendación de películas, series, libros y videojuegos. Tu tarea: analizar el contexto del usuario y recomendar 25 obras excelentes que se adapten perfectamente por espíritu, significado, género y categoría (%s) a "%s" y reflejen las preferencias del usuario dentro de su lista.
Tema de la lista: "%s"
Categoría: %s
Géneros: %s%s%s%s%s
Lista actual del usuario:
%s

Genera EXACTAMENTE 25 recomendaciones (ni más ni menos) que coincidan perfectamente con el espíritu, significado, género y categoría (%s) del tema de la lista y se ajusten a las preferencias del usuario.

REGLAS:
1. Recomienda ÚNICAMENTE obras REALES, lanzadas oficialmente (películas/series/libros/videojuegos).
2. ESTÁ TERMINANTEMENTE PROHIBIDO inventar títulos falsos, partes no estrenadas o temporadas inexistentes.
3. ESTÁ TERMINANTEMENTE PROHIBIDO recomendar cualquier obra de la misma franquicia/universo/serie que ya esté en la lista del usuario.
4. DIVERSIDAD: Cada recomendación debe ser una obra independiente de una franquicia DIFERENTE. No incluyas múltiples temporadas o secuelas de la misma franquicia.
5. Indica solo el título principal oficial en español o su título internacional reconocido (sin números de temporada ni subtítulos de episodios, ej. "La casa de papel", "Narcos", "Fargo", "True Detective", "Sherlock").
6. Respeta estrictamente la categoría (%s).
7. Formato de respuesta: ESTRICTAMENTE un array JSON crudo de 25 cadenas. Ejemplo: ["Título 1", "Título 2", ...]. Sin formato markdown ni texto adicional.`,
			catLangName, listTitleDisplay, listTitleDisplay, catLangName, genresStr, yearsLine, countriesLine, directorsLine, authorsLine, itemsListStr, catLangName, catLangName)

	case "uk":
		prompt = fmt.Sprintf(`Ти — експерт у підборі фільмів, серіалів, книг та ігор. Твоє завдання: проаналізувати контекст користувача та порекомендувати 25 найкращих творів, які ідеально підходять за духом, сенсом, жанром та категорією (%s) до "%s" та схожі на вподобання користувача всередині списку.
Тема списку: "%s"
Категорія: %s
Жанри: %s%s%s%s%s
Поточний список користувача:
%s

Згенеруй РІВНО 25 рекомендацій (не більше і не менше), які ідеально підходять за духом, сенсом, жанром та категорією (%s) до теми списку та схожі на вподобання користувача.

ПРАВИЛА:
1. Рекомендуй ТІЛЬКИ РЕАЛЬНО ІСНУЮЧІ, офіційно випущені твори (фільми/серіали/книги/ігри).
2. КАТЕГОРИЧНО ЗАБОРОНЕНО вигадувати неіснуючі назви, невипущені частини або фейкові сезони.
3. КАТЕГОРИЧНО ЗАБОРОНЕНО рекомендувати будь-які твори з тієї самої франшизи/всесвіту/серіалу, які вже є в списку користувача.
4. РІЗНОМАНІТНІСТЬ: Кожна рекомендація повинна бути самостійним, окремим твором з ІНШОЇ франшизи. Не додавай кілька частин або сезонів однієї франшизи.
5. Вказуй лише основну офіційну назву твору українською мовою або в оригіналі (без номерів сезонів і підзаголовків серій, наприклад «Слуга народу», «Спіймати Кайдаша», «Шерлок», «Метод», «Фарґо»).
6. Суворо дотримуйся категорії (%s).
7. Формат відповіді: СУВОРО сирий JSON-масив із 25 рядків. Приклад: ["Назва 1", "Назва 2", ...]. Без markdown-розмітки та супровідного тексту.`,
			catLangName, listTitleDisplay, listTitleDisplay, catLangName, genresStr, yearsLine, countriesLine, directorsLine, authorsLine, itemsListStr, catLangName, catLangName)

	default: // "ru"
		prompt = fmt.Sprintf(`Ты — эксперт в подборе фильмов, сериалов, книг и игр. Твоя задача: проанализировать контекст пользователя и порекомендовать 25 лучших произведений, которые идеально подходят по духу, смыслу, жанру и категории (%s) к "%s" и похожи на предпочтения пользователя внутри списка.
Тема списка: "%s"
Категория: %s
Жанры: %s%s%s%s%s
Текущий список пользователя:
%s

Сгенерируй РОВНО 25 рекомендаций (не больше и не меньше), которые идеально подходят по духу, смыслу, жанру и категории (%s) к теме списка и похожи на предпочтения пользователя.

ПРАВИЛА:
1. Рекомендуй ТОЛЬКО РЕАЛЬНО СУЩЕСТВУЮЩИЕ, официально выпущенные произведения (фильмы/сериалы/книги/игры).
2. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО выдумывать несуществующие названия, невышедшие части или фейковые сезоны (например, нельзя придумывать «Дело № 12», «Сезон 5» и т.д.).
3. КАТЕГОРИЧЕСКИ ЗАПРЕЩЕНО рекомендовать любые произведения из той же франшизы/вселенной/сериала, которые уже есть в списке пользователя (например, если в списке есть сериал «Мосгаз» или любое его дело/сезон, ЗАПРЕЩЕНО включать любые другие дела или сезоны сериала «Мосгаз»).
4. РАЗНООБРАЗИЕ: Каждая рекомендация должна быть самостоятельным, отдельным произведением из ДРУГОЙ франшизы. Не включай несколько частей или сезонов одной франшизы.
5. Указывай только основное официальное название произведения на русском языке (без номеров сезонов и без подзаголовков серий, например «Ликвидация», «Крик совы», «Художник», «Метод», «Шеф»).
6. Строго соблюдай категорию (%s).
7. Формат ответа: СТРОГО сырой JSON-массив из 25 строк. Пример: ["Название 1", "Название 2", ...]. Без markdown-разметки и без сопроводительного текста.`,
			catLangName, listTitleDisplay, listTitleDisplay, catLangName, genresStr, yearsLine, countriesLine, directorsLine, authorsLine, itemsListStr, catLangName, catLangName)
	}

	// 4. Rate Limiting & Quotas (5 min cooldown, max 5 per day per user - bypassed for @neznayca)
	rateKey := getRateLimitKey(r)
	isAdmin := false
	if user, ok := auth.GetUserFromContext(r); ok && user != nil {
		isAdmin = (user.ID == 214993606 || strings.EqualFold(user.Username, "neznayca"))
	}
	if !isAdmin && (rateKey == "user_214993606" || userID == 214993606) {
		isAdmin = true
	}

	if !isAdmin {
		if h.AutoJail != nil {
			if jailed, rem := h.AutoJail.IsJailed(rateKey); jailed {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", strconv.Itoa(int(rem.Seconds())))
				w.WriteHeader(http.StatusTooManyRequests)
				json.NewEncoder(w).Encode(map[string]interface{}{
					"error":   "rate_limit_exceeded",
					"message": fmt.Sprintf("Доступ временно ограничен за превышение лимитов. Пожалуйста, подождите %d мин.", int(rem.Minutes())+1),
				})
				return
			}
		}

		if h.RecommendationsLimiter != nil && userID != 0 {
			if allowed, errCode, msg, retryAfter := h.RecommendationsLimiter.CheckAndConsume(userID); !allowed {
				if h.AutoJail != nil {
					h.AutoJail.Record429(rateKey)
				}
				w.Header().Set("Content-Type", "application/json")
				if retryAfter > 0 {
					w.Header().Set("Retry-After", strconv.Itoa(int(retryAfter.Seconds())))
				}
				w.WriteHeader(http.StatusTooManyRequests)
				json.NewEncoder(w).Encode(map[string]interface{}{
					"error":               errCode,
					"message":             msg,
					"retry_after_seconds": int(retryAfter.Seconds()),
				})
				return
			}
		}
	}

	// 5. Query Fireworks AI API
	apiKey := strings.TrimSpace(h.FireworksAPIKey)
	if apiKey == "" {
		apiKey = "fw_R9nn6yvzVv8txadL2FLqC2"
	}

	type modelConfig struct {
		name            string
		reasoningEffort string
		maxTokens       int
	}

	modelsToTry := []modelConfig{
		{
			name:            "accounts/fireworks/models/deepseek-v4-flash-0731",
			reasoningEffort: "none",
			maxTokens:       2048,
		},
		{
			name:            "accounts/fireworks/models/gpt-oss-120b",
			reasoningEffort: "low",
			maxTokens:       4096,
		},
	}

	var recommendedTitles []string
	httpClient := &http.Client{}

	ctxTotal, cancelTotal := context.WithTimeout(r.Context(), 300*time.Second)
	defer cancelTotal()

	for _, mCfg := range modelsToTry {
		modelName := mCfg.name
		if ctxTotal.Err() != nil {
			break
		}

		reqBodyMap := map[string]interface{}{
			"model":            modelName,
			"messages": []map[string]string{
				{"role": "user", "content": prompt},
			},
			"reasoning_effort": mCfg.reasoningEffort,
			"temperature":      0.2,
			"max_tokens":       mCfg.maxTokens,
		}

		bodyBytes, err := json.Marshal(reqBodyMap)
		if err != nil {
			continue
		}

		var resp *http.Response
		var respBody []byte
		var readErr error

		ctxModel, cancelModel := context.WithTimeout(ctxTotal, 180*time.Second)
		req, err := http.NewRequestWithContext(ctxModel, "POST", "https://api.fireworks.ai/inference/v1/chat/completions", bytes.NewBuffer(bodyBytes))
		if err != nil {
			cancelModel()
			continue
		}

		req.Header.Set("Accept", "application/json")
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer "+apiKey)

		resp, err = httpClient.Do(req)
		if err != nil {
			cancelModel()
			log.Printf("[FireworksAI] Model %s chat completions error: %v", modelName, err)
			if ctxTotal.Err() != nil {
				log.Printf("[FireworksAI] Total timeout reached (%v), aborting further model queries.", ctxTotal.Err())
				break
			}
			continue
		}

		respBody, readErr = io.ReadAll(resp.Body)
		resp.Body.Close()
		cancelModel()

		if resp.StatusCode == http.StatusOK && readErr == nil {
			var fireworksResp struct {
				Choices []struct {
					Text    string `json:"text"`
					Message struct {
						Content          string `json:"content"`
						ReasoningContent string `json:"reasoning_content"`
					} `json:"message"`
				} `json:"choices"`
			}

			if err := json.Unmarshal(respBody, &fireworksResp); err == nil && len(fireworksResp.Choices) > 0 {
				rawContent := strings.TrimSpace(fireworksResp.Choices[0].Message.Content)
				if rawContent == "" {
					rawContent = strings.TrimSpace(fireworksResp.Choices[0].Text)
				}
				if rawContent == "" {
					rawContent = strings.TrimSpace(fireworksResp.Choices[0].Message.ReasoningContent)
				}

				if rawContent == "" {
					log.Printf("[FireworksAI] Warning: Model %s returned empty content. Raw response: %s", modelName, string(respBody))
				} else {
					parsedTitles := parseTitlesFromAIResponse(rawContent)
					if len(parsedTitles) > 0 {
						var filteredTitles []string
						seenBatchFranchises := make(map[string]bool)
						for _, pt := range parsedTitles {
							if !isTitleAlreadyExisting(pt) {
								key := extractFranchiseKey(pt)
								if key != "" && seenBatchFranchises[key] {
									continue
								}
								if key != "" {
									seenBatchFranchises[key] = true
								}
								filteredTitles = append(filteredTitles, pt)
							}
						}
						recommendedTitles = filteredTitles
						log.Printf("[FireworksAI] Successfully generated %d recommendations using model %s (filtered out %d existing/duplicates)", len(recommendedTitles), modelName, len(parsedTitles)-len(filteredTitles))
						break
					} else {
						log.Printf("[FireworksAI] Could not parse JSON array from model %s response. rawContent: %s", modelName, rawContent)
					}
				}
			} else {
				log.Printf("[FireworksAI] Error unmarshaling Fireworks response from %s: %v. Raw body: %s", modelName, err, string(respBody))
			}
		} else {
			log.Printf("[FireworksAI] Model %s chat status %d: %s", modelName, resp.StatusCode, string(respBody))
		}
	}

	// 5. Fallback if AI call failed
	if len(recommendedTitles) == 0 {
		log.Printf("[FireworksAI] All models failed or no key set, returning error to client instead of fallback")
		http.Error(w, "Не удалось получить рекомендации от нейросети. Пожалуйста, попробуйте еще раз.", http.StatusInternalServerError)
		return
	}

	// 6. Enrich recommended titles with external search (TMDb, Kinopoisk, Google Books, Steam, etc.)
	type enrichedResult struct {
		index int
		card  models.CatalogSearchResult
		valid bool
	}

	resultChan := make(chan enrichedResult, len(recommendedTitles))
	var wg sync.WaitGroup

	for i, title := range recommendedTitles {
		tClean := strings.TrimSpace(title)
		if tClean == "" {
			continue
		}
		wg.Add(1)
		go func(idx int, tName string) {
			defer wg.Done()
			targetLang := parser.DetectTargetLanguage(tName, userLang)
			onlineRes := h.searchOnlineCatalog(tName, catEn, nil, targetLang)
			if card, ok := selectBestCatalogMatch(tName, onlineRes); ok {
				resultChan <- enrichedResult{index: idx, card: card, valid: true}
				return
			}

			// Try searching with cleaned base title (without brackets/subtitles) if initial search returned empty
			baseTitle := reParenBrackets.ReplaceAllString(tName, "")
			baseTitle = strings.TrimSpace(strings.Split(baseTitle, ":")[0])
			if baseTitle != "" && !strings.EqualFold(baseTitle, tName) {
				onlineResBase := h.searchOnlineCatalog(baseTitle, catEn, nil, targetLang)
				if card, ok := selectBestCatalogMatch(baseTitle, onlineResBase); ok {
					resultChan <- enrichedResult{index: idx, card: card, valid: true}
					return
				}
			}

			dbRes := h.searchDBCatalog(r.Context(), tName, catEn)
			if card, ok := selectBestCatalogMatch(tName, dbRes); ok {
				resultChan <- enrichedResult{index: idx, card: card, valid: true}
				return
			}

			// If no match in online catalogs or DB, discard hallucinated/empty card
			resultChan <- enrichedResult{
				index: idx,
				valid: false,
			}
		}(i, tClean)
	}

	wg.Wait()
	close(resultChan)

	cardsMap := make(map[int]enrichedResult)
	for res := range resultChan {
		cardsMap[res.index] = res
	}

	var finalCards []models.CatalogSearchResult
	seenFinalFranchises := make(map[string]bool)

	for i := 0; i < len(recommendedTitles); i++ {
		if len(finalCards) >= 20 {
			break
		}
		if res, ok := cardsMap[i]; ok && res.valid {
			card := res.card
			if card.Title == "" {
				continue
			}
			if card.Category == "" {
				card.Category = catEn
			}
			if card.Country != "" {
				card.Country = mapCountryToFlag(card.Country)
			}
			if !isTitleAlreadyExisting(card.Title) {
				key := extractFranchiseKey(card.Title)
				if key != "" && seenFinalFranchises[key] {
					continue // Skip duplicate franchise in final cards
				}
				if key != "" {
					seenFinalFranchises[key] = true
				}
				finalCards = append(finalCards, card)
			}
		}
	}

	if finalCards == nil {
		finalCards = []models.CatalogSearchResult{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(finalCards)
}


