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

	// 1. Try parsing structured JSON object with "items" field
	var structuredResp struct {
		Analysis string   `json:"analysis"`
		Items    []string `json:"items"`
	}
	if err := json.Unmarshal([]byte(raw), &structuredResp); err == nil && len(structuredResp.Items) > 0 {
		return cleanTitlesList(structuredResp.Items)
	}

	// 2. Try extracting JSON object substring {...} if surrounded by text/codeblocks
	if startObj := strings.Index(raw, "{"); startObj != -1 {
		if endObj := strings.LastIndex(raw, "}"); endObj != -1 && endObj > startObj {
			objStr := raw[startObj : endObj+1]
			if err := json.Unmarshal([]byte(objStr), &structuredResp); err == nil && len(structuredResp.Items) > 0 {
				return cleanTitlesList(structuredResp.Items)
			}
		}
	}

	// 3. Fallback: Extract JSON array slice [...] if surrounded by text or code blocks
	arrayStr := raw
	if idx := strings.Index(raw, "["); idx != -1 {
		if endIdx := strings.LastIndex(raw, "]"); endIdx != -1 && endIdx > idx {
			arrayStr = raw[idx : endIdx+1]
		}
	}

	var titles []string
	if err := json.Unmarshal([]byte(arrayStr), &titles); err == nil && len(titles) > 0 {
		return cleanTitlesList(titles)
	}

	// Retry after replacing literal newlines
	cleaned := strings.ReplaceAll(arrayStr, "\n", " ")
	if err := json.Unmarshal([]byte(cleaned), &titles); err == nil && len(titles) > 0 {
		return cleanTitlesList(titles)
	}

	// Fallback regex to extract quoted strings
	re := regexp.MustCompile(`"([^"]+)"`)
	matches := re.FindAllStringSubmatch(arrayStr, -1)
	for _, m := range matches {
		if len(m) > 1 {
			t := strings.TrimSpace(m[1])
			if t != "" && t != "[" && t != "]" && t != "items" && t != "analysis" {
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

type ItemInputData struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	Category    string `json:"category"`
	ReleaseYear string `json:"release_year"`
	Genre       string `json:"genre"`
	Country     string `json:"country"`
	Director    string `json:"director"`
	Author      string `json:"author"`
	Description string `json:"description"`
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
		ItemIDs    string          `json:"item_ids"`
		ItemTitles string          `json:"item_titles"`
		ItemsData  []ItemInputData `json:"items_data"`
		Category   string          `json:"category"`
		Title      string          `json:"title"`
		Lang       string          `json:"lang"`
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

	// 1. Collect all user DB titles + incoming titles for comprehensive deduplication (entire user collection)
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

	if len(bodyParams.ItemsData) > 0 {
		for _, it := range bodyParams.ItemsData {
			addExistingTitle(it.Title)
		}
	} else if itemTitlesParam != "" {
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

	// 2. Gather top 15 ordered items with rich metadata & plot descriptions (strictly preserving sort order)
	var orderedItems []ItemInputData

	if len(bodyParams.ItemsData) > 0 {
		for _, it := range bodyParams.ItemsData {
			if strings.TrimSpace(it.Title) == "" {
				continue
			}
			orderedItems = append(orderedItems, it)
			if len(orderedItems) == 15 {
				break
			}
		}
	}

	if len(orderedItems) == 0 && itemIDsParam != "" && userID != 0 && h.DB != nil && h.DB.Pool != nil {
		ids := strings.Split(itemIDsParam, ",")
		validIDs := []string{}
		for _, id := range ids {
			idClean := strings.TrimSpace(id)
			if idClean != "" {
				validIDs = append(validIDs, idClean)
				if len(validIDs) == 15 {
					break
				}
			}
		}
		if len(validIDs) > 0 {
			query := `SELECT id, title, category, release_year, genre, country, director, author, description FROM items WHERE user_id = $1 AND id = ANY($2)`
			rows, err := h.DB.Pool.Query(r.Context(), query, userID, validIDs)
			if err == nil && rows != nil {
				defer rows.Close()
				dbItemsMap := make(map[string]ItemInputData)
				for rows.Next() {
					var id, t, c, y, g, cnt, dir, aut, desc string
					if err := rows.Scan(&id, &t, &c, &y, &g, &cnt, &dir, &aut, &desc); err == nil && t != "" {
						dbItemsMap[id] = ItemInputData{
							ID:          id,
							Title:       t,
							Category:    c,
							ReleaseYear: y,
							Genre:       g,
							Country:     cnt,
							Director:    dir,
							Author:      aut,
							Description: desc,
						}
					}
				}
				// Preserve EXACT slice order of validIDs!
				for _, id := range validIDs {
					if item, found := dbItemsMap[id]; found {
						orderedItems = append(orderedItems, item)
					}
				}
			}
		}
	}

	// Fallback if neither ItemsData nor valid DB IDs found
	if len(orderedItems) == 0 && itemTitlesParam != "" {
		rawTitles := strings.Split(itemTitlesParam, "|")
		for _, rawT := range rawTitles {
			rawT = strings.TrimSpace(rawT)
			if rawT == "" {
				continue
			}
			it := ItemInputData{Title: rawT}
			if idx := strings.Index(rawT, "["); idx != -1 && strings.HasSuffix(rawT, "]") {
				it.Title = strings.TrimSpace(rawT[:idx])
				inner := rawT[idx+1 : len(rawT)-1]
				parts := strings.Split(inner, ",")
				for _, p := range parts {
					p = strings.TrimSpace(p)
					pLower := strings.ToLower(p)
					if strings.HasPrefix(pLower, "страна:") || strings.HasPrefix(pLower, "country:") || strings.HasPrefix(pLower, "país:") || strings.HasPrefix(pLower, "pais:") || strings.HasPrefix(pLower, "країна:") {
						idx := strings.Index(p, ":")
						it.Country = strings.TrimSpace(p[idx+1:])
					} else if strings.HasPrefix(pLower, "режиссер:") || strings.HasPrefix(pLower, "director:") || strings.HasPrefix(pLower, "режисер:") {
						idx := strings.Index(p, ":")
						it.Director = strings.TrimSpace(p[idx+1:])
					} else if strings.HasPrefix(pLower, "автор:") || strings.HasPrefix(pLower, "author:") || strings.HasPrefix(pLower, "autor:") {
						idx := strings.Index(p, ":")
						it.Author = strings.TrimSpace(p[idx+1:])
					} else if _, e := strconv.Atoi(p); e == nil {
						it.ReleaseYear = p
					} else if p != "" {
						if it.Genre == "" {
							it.Genre = p
						} else {
							it.Genre += ", " + p
						}
					}
				}
			}
			orderedItems = append(orderedItems, it)
			if len(orderedItems) == 15 {
				break
			}
		}
	}

	// Determine primary category
	catEn := mapCategoryToEn(categoryParam)
	if catEn == "" || catEn == "all" {
		for _, it := range orderedItems {
			if mapped := mapCategoryToEn(it.Category); mapped != "" && mapped != "all" {
				catEn = mapped
				break
			}
		}
		if catEn == "" || catEn == "all" {
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

	// Format top 15 ordered items with plot summaries for semantic LLM comprehension
	var itemLines []string
	for idx, it := range orderedItems {
		var metaParts []string
		if it.ReleaseYear != "" {
			metaParts = append(metaParts, it.ReleaseYear)
		}
		if it.Country != "" {
			metaParts = append(metaParts, it.Country)
		}
		if it.Genre != "" {
			metaParts = append(metaParts, it.Genre)
		}

		line := fmt.Sprintf("%d. «%s»", idx+1, it.Title)
		if userLang == "en" || userLang == "es" {
			line = fmt.Sprintf("%d. \"%s\"", idx+1, it.Title)
		}

		if len(metaParts) > 0 {
			line += fmt.Sprintf(" (%s)", strings.Join(metaParts, ", "))
		}

		var extra []string
		if it.Director != "" {
			switch userLang {
			case "en", "es":
				extra = append(extra, fmt.Sprintf("Director: %s", it.Director))
			case "uk":
				extra = append(extra, fmt.Sprintf("Режисер: %s", it.Director))
			default:
				extra = append(extra, fmt.Sprintf("Режиссер: %s", it.Director))
			}
		}
		if it.Author != "" {
			switch userLang {
			case "en":
				extra = append(extra, fmt.Sprintf("Author: %s", it.Author))
			case "es":
				extra = append(extra, fmt.Sprintf("Autor: %s", it.Author))
			case "uk", "ru":
				extra = append(extra, fmt.Sprintf("Автор: %s", it.Author))
			}
		}
		if descTrim := strings.TrimSpace(it.Description); descTrim != "" {
			descRunes := []rune(descTrim)
			if len(descRunes) > 250 {
				descTrim = string(descRunes[:250]) + "..."
			}
			switch userLang {
			case "en":
				extra = append(extra, fmt.Sprintf("Plot/Summary: %s", descTrim))
			case "es":
				extra = append(extra, fmt.Sprintf("Trama/Sinopsis: %s", descTrim))
			case "uk":
				extra = append(extra, fmt.Sprintf("Сюжет/суть: %s", descTrim))
			default:
				extra = append(extra, fmt.Sprintf("Сюжет/суть: %s", descTrim))
			}
		}

		if len(extra) > 0 {
			line += ". " + strings.Join(extra, ". ")
		}

		itemLines = append(itemLines, line)
	}

	itemsListStr := strings.Join(itemLines, "\n")
	if itemsListStr == "" {
		switch userLang {
		case "en":
			itemsListStr = "- (list is empty, recommend top essential works)"
		case "es":
			itemsListStr = "- (la lista está vacía, recomienda las mejores obras fundamentales)"
		case "uk":
			itemsListStr = "- (список порожній, порекомендуй найкращі базові твори)"
		default:
			itemsListStr = "- (список пуст, порекомендуй лучшие базовые произведения)"
		}
	}

	var prompt string
	switch userLang {
	case "en":
		prompt = fmt.Sprintf(`You are a world-class curator and recommendation expert in movies, TV series, books, and games.
Your task: deeply analyze the user's list, identify the underlying semantic thread (atmosphere, narrative tone, plot tropes, character conflicts, cinematic style), and recommend 25 top works in the category "%s".

Context:
- List topic: "%s"
- Category: %s

First 15 works in the list (order is crucial for context):
%s

ANALYSIS PRINCIPLES & PRIORITIES:
1. Semantic Core & Atmosphere (Highest priority): Why were these specific works grouped together? What emotional resonance, conflict type, and storytelling mechanisms unite them (e.g., paranoid suspense, search for truth in a corrupt system, warm nostalgia, existential solitude)?
2. Cultural & Regional Context: Treat the country of origin and filmmaking tradition as part of the artistic style and aesthetic (humor, pacing, character psychology). If a specific country/region dominates (e.g., Nordic noir, British mystery, French art-house, Korean thriller), prioritize works from the same cultural sphere, while still allowing brilliant international matches that hit the core essence.
3. Plot & Description over tags: Do not rely mechanically on release years or broad genre labels. Recommendations must match the true spirit and narrative depth.
4. Diversity: Provide 25 diverse angles of the discovered theme (e.g., investigation, courtroom drama, psychological thriller, intimate character study), all tied to the shared core thread.

RULES:
1. Recommend ONLY real, officially released works. Never invent nonexistent titles, sequels, or fake seasons.
2. Strictly forbidden: do not recommend any works from the same franchise/universe/series already in the user's list.
3. Diversity: Each recommendation must be from an independent, separate franchise.
4. Provide only the main official title in English (without season numbers or episode subtitles).
5. Strictly adhere to category (%s).

RESPONSE FORMAT:
Return STRICTLY raw valid JSON without markdown formatting (no `+"```json"+`).
{
  "analysis": "Briefly in 2-3 sentences: what defines the core essence/vibe of the user's list and how the recommendations were selected.",
  "items": [
    "Title 1",
    "Title 2"
  ]
}`,
			catLangName, listTitleDisplay, catLangName, itemsListStr, catLangName)

	case "es":
		prompt = fmt.Sprintf(`Eres un destacado experto y curador de contenido multimedia (películas, series, libros, videojuegos).
Tu tarea: analizar a fondo la lista del usuario, identificar el hilo conductor esencial (atmósfera, tono narrativo, tropos de la trama, conflictos de personajes, estilo cinematográfico) y recomendar 25 obras excelentes en la categoría "%s".

Contexto:
- Tema de la lista: "%s"
- Categoría: %s

Primeras 15 obras de la lista (el orden es determinante para el contexto):
%s

PRINCIPIOS Y PRIORIDADES DE ANÁLISIS:
1. Núcleo temático y atmósfera (Máxima prioridad): ¿Por qué estas obras están reunidas? ¿Qué resonancia emocional, tipo de conflicto y narrativa las une (ej. suspenso paranoico, búsqueda de la verdad en un sistema corrupto, nostalgia cálida, soledad existencial)?
2. Contexto cultural y regional: Considera el país de origen y la escuela cinematográfica como parte del estilo artístico y estético. Si predomina un país/región específico, da prioridad a obras del mismo contexto cultural, permitiendo también coincidencias internacionales excepcionales.
3. La trama sobre las etiquetas: No te limites mecánicamente al año o género formal. La recomendación debe encajar con la verdadera esencia narrativa.
4. Diversidad: Ofrece 25 facetas diversas del tema encontrado, todas conectadas por el mismo hilo conductor.

REGLAS:
1. Recomienda ÚNICAMENTE obras reales, lanzadas oficialmente. Prohibido inventar títulos falsos o temporadas inexistentes.
2. Está terminantemente prohibido recomendar obras de la misma franquicia/universo/serie ya presentes en la lista del usuario.
3. Cada recomendación debe ser de una franquicia independiente y diferente.
4. Indica solo el título principal oficial en español o su título internacional reconocido (sin números de temporada ni subtítulos).
5. Respeta estrictamente la categoría (%s).

FORMATO DE RESPUESTA:
Devuelve ESTRICTAMENTE JSON crudo y válido sin formato markdown (sin `+"```json"+`).
{
  "analysis": "Brevemente en 2-3 oraciones: cuál es la esencia central de la lista y el principio de selección de las recomendaciones.",
  "items": [
    "Título 1",
    "Título 2"
  ]
}`,
			catLangName, listTitleDisplay, catLangName, itemsListStr, catLangName)

	case "uk":
		prompt = fmt.Sprintf(`Ти — видатний експерт і куратор медіаконтенту (фільми, серіали, книги, ігри).
Твоє завдання — глибоко проаналізувати список користувача, знайти глибинну змістовну нитку (атмосферу, драматургічний нерв, сюжетні тропи, мотиви героїв, стиль оповіді) та дібрати 25 найкращих творів у категорії "%s".

Вхідний контекст:
- Тема списку: "%s"
- Категорія: %s

Перші 15 творів списку (порядок має визначальне значення для контексту):
%s

ПРИНЦИПИ ТА ПРІОРИТЕТИ АНАЛІЗУ:
1. Змістовне ядро й атмосфера (Найвищий пріоритет): Чому ці твори зібрані разом? Який емоційний посмак, тип конфлікту та механізми сюжету їх об'єднують (наприклад: параноїдальний саспенс, пошуки правди в корумпованій системі, тепла ностальгія, екзистенційна самотність)?
2. Культурний і регіональний код: Сприймай країну виробництва та кіношколу як частину художньої мови й естетики (гумор, подача, менталітет персонажів). Якщо домінує певна країна/регіон, надавай високий пріоритет творам із цього ж культурного контексту, не відкидаючи влучні світові шедеври.
3. Сюжет важливіший за теги: Не орієнтуйся механічно на роки чи формальні жанри. Рекомендація має відповідати глибинній суті твору.
4. Різноманітність: Запропонуй 25 різних граней знайденої теми, об'єднаних спільною ниткою.

ПРАВИЛА:
1. Рекомендуй ТІЛЬКИ реально існуючі, офіційно випущені твори. Заборонено вигадувати назви чи неіснуючі сезони.
2. Категорично заборонено рекомендувати твори з тієї самої франшизи/всесвіту/серіалу, які вже є в списку користувача.
3. Кожна рекомендація повинна бути самостійним твором з ІНШОЇ франшизи.
4. Вказуй лише основну офіційну назву твору українською мовою або в оригіналі (без номерів сезонів і підзаголовків).
5. Суворо дотримуйся категорії (%s).

ФОРМАТ ВІДПОВІДІ:
Поверни СУВОРО сирий валідний JSON без markdown-розмітки (без `+"```json"+`).
{
  "analysis": "Коротко у 2-3 реченнях: у чому глибинна суть списку користувача та за яким принципом підібрані рекомендації.",
  "items": [
    "Назва 1",
    "Назва 2"
  ]
}`,
			catLangName, listTitleDisplay, catLangName, itemsListStr, catLangName)

	default: // "ru"
		prompt = fmt.Sprintf(`Ты — выдающийся эксперт и куратор медиаконтента (кино, сериалы, книги, игры).
Твоя задача — глубоко проанализировать список произведений пользователя, найти неочевидную смысловую нить (атмосферу, драматургический нерв, сюжетные тропы, мотивы героев, кинематографический стиль) и подобрать 25 лучших произведений в категории "%s".

Входной контекст:
- Тема списка: "%s"
- Категория: %s

Первые 15 произведений списка (порядок имеет определяющее значение для контекста):
%s

ПРИНЦИПЫ И ПРИОРИТЕТЫ АНАЛИЗА:
1. Смысловое ядро и атмосфера (Высший приоритет): Почему эти произведения собраны вместе? Какое эмоциональное послевкусие, тип конфликта и сюжетные механизмы их объединяют (например: параноидальный саспенс, поиски правды в коррумпированной системе, теплая ностальгия, экзистенциальное одиночество)?
2. Культурный и региональный код: Воспринимай страну и школу кино как часть художественного языка и эстетики (юмор, подача, менталитет персонажей). Если в списке доминирует определенная страна/регион (например, скандинавский нуар, российская криминальная драма, французский арт-детектив), отдавай высокий приоритет произведениям из этого же культурного контекста, но не делай это слепым фильтром, если зарубежное произведение идеально бьет в суть.
3. Описания важнее тегов: Не ориентируйся механически на годы и формальные жанры. Рекомендация должна подходить по глубинной сути, а не просто иметь похожую цифру года.
4. Разнообразие: Предложи 25 разных граней найденной темы (например: расследование, закрытый судебный процесс, личная драма, психологический триллер), но объединенных общей нитью.

ПРАВИЛА ИСКЛЮЧЕНИЙ:
1. Только реально существующие, официально вышедшие произведения. Запрещено придумывать несуществующие части, сезоны или спин-оффы.
2. Категорически запрещено рекомендовать произведения из тех же франшиз/вселенных/сериалов, которые уже есть в списке пользователя.
3. Каждая из 25 рекомендаций должна быть из уникальной, отдельной франшизы. Не включай несколько частей одной франшизы.
4. Указывай только основное официальное название на русском языке (без номеров сезонов и подзаголовков).
5. Строго соблюдай категорию (%s).

ФОРМАТ ОТВЕТА:
Верни СТРОГО сырой валидный JSON без markdown-разметки (без `+"```json"+`).
{
  "analysis": "Кратко в 2-3 предложениях: в чем глубинная суть и общая нить списка пользователя, и по какому принципу подобраны рекомендации.",
  "items": [
    "Название 1",
    "Название 2"
  ]
}`,
			catLangName, listTitleDisplay, catLangName, itemsListStr, catLangName)
	}

	// 4. Rate Limiting & Quotas (10 min cooldown, max 3 per hour per user - bypassed for admin)
	rateKey := getRateLimitKey(r)
	isAdmin := false
	if user, ok := auth.GetUserFromContext(r); ok && user != nil {
		isAdmin = (user.ID == 214993606 || strings.EqualFold(user.Username, "neznayca") || strings.EqualFold(user.Username, "znayca"))
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
			name:            "accounts/fireworks/models/minimax-m3",
			reasoningEffort: "none",
			maxTokens:       2048,
		},
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
			"temperature":      0.55,
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


