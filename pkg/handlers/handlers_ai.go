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
	reSeasonPatterns = regexp.MustCompile(`(?i)(?:[.:\-\—\/|]\s*)?(?:дело\s*(?:№|no)?|сезон|season|часть|part|эпизод|episode|глава|chapter|vol|volume|выпуск|книга|book|фильм|film)\s*(?:№|no)?\s*[\dIVXLCDMivxlcdm]+(?:\s*[:.\-\—]\s*.*)?$`)
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

	// Check prefix before " и " (e.g. "Гарри Поттер и...", "Перси Джексон и...")
	lowerStripped := strings.ToLower(stripped)
	if idx := strings.Index(lowerStripped, " и "); idx != -1 {
		prefix := strings.TrimSpace(stripped[:idx])
		pNorm := normalizeTitleForComparison(prefix)
		if len(pNorm) >= 4 {
			rootsMap[pNorm] = true
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

	listTitleDisplay := "Мои рекомендации"
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
							meta = append(meta, "Страна: "+cnt)
							countriesFound = append(countriesFound, cnt)
						}
						if dir != "" {
							meta = append(meta, "Режиссер: "+dir)
							directorsFound = append(directorsFound, dir)
						}
						if aut != "" {
							meta = append(meta, "Автор: "+aut)
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
					if strings.HasPrefix(p, "Страна:") {
						cntVal := strings.TrimSpace(strings.TrimPrefix(p, "Страна:"))
						if cntVal != "" {
							countriesFound = append(countriesFound, cntVal)
						}
					} else if strings.HasPrefix(p, "Режиссер:") {
						dirVal := strings.TrimSpace(strings.TrimPrefix(p, "Режиссер:"))
						if dirVal != "" {
							directorsFound = append(directorsFound, dirVal)
						}
					} else if strings.HasPrefix(p, "Автор:") {
						autVal := strings.TrimSpace(strings.TrimPrefix(p, "Автор:"))
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

	// 2. Determine primary category
	catEn := mapCategoryToEn(categoryParam)
	if catEn == "" || catEn == "all" {
		if len(categoriesFound) > 0 {
			catEn = categoriesFound[0]
		} else {
			catEn = "movie"
		}
	}

	catRuName := "фильмы/сериалы/книги/игры"
	switch catEn {
	case "movie":
		catRuName = "фильмы"
	case "tv", "show":
		catRuName = "сериалы"
	case "book":
		catRuName = "книги"
	case "game":
		catRuName = "игры"
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

	// Build exact user prompt
	itemsListStr := strings.Join(itemDescriptions, "\n- ")
	if itemsListStr != "" {
		itemsListStr = "- " + itemsListStr
	} else {
		itemsListStr = "- (список пуст, дай общие рекомендации)"
	}

	genresStr := strings.Join(uniqGenres, ", ")
	if genresStr == "" {
		genresStr = "популярные"
	}
	directorsStr := strings.Join(uniqDirectors, ", ")
	authorsStr := strings.Join(uniqAuthors, ", ")

	directorsLine := ""
	if directorsStr != "" {
		directorsLine = fmt.Sprintf("\nРежиссеры: %s", directorsStr)
	}
	authorsLine := ""
	if authorsStr != "" {
		authorsLine = fmt.Sprintf("\nАвторы: %s", authorsStr)
	}

	prompt := fmt.Sprintf(`Ты — эксперт в подборе фильмов, сериалов, книг и игр. Твоя задача: проанализировать контекст пользователя и порекомендовать 25 лучших произведений.
Тема списка: "%s"
Категория: %s
Жанры: %s%s%s
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
		listTitleDisplay, catRuName, genresStr, directorsLine, authorsLine, itemsListStr, catRuName, catRuName)

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

	modelsToTry := []string{
		"accounts/fireworks/models/deepseek-v4-flash-0731",
		"accounts/fireworks/models/gpt-oss-120b",
	}

	var recommendedTitles []string
	httpClient := &http.Client{}

	ctxTotal, cancelTotal := context.WithTimeout(r.Context(), 300*time.Second)
	defer cancelTotal()

	for _, modelName := range modelsToTry {
		if ctxTotal.Err() != nil {
			break
		}

		reqBodyMap := map[string]interface{}{
			"model": modelName,
			"messages": []map[string]string{
				{"role": "user", "content": prompt},
			},
			"temperature": 0.2,
			"max_tokens":  4096,
		}

		bodyBytes, err := json.Marshal(reqBodyMap)
		if err != nil {
			continue
		}

		var resp *http.Response
		err = func() error {
			ctxModel, cancelModel := context.WithTimeout(ctxTotal, 180*time.Second)
			defer cancelModel()

			req, err := http.NewRequestWithContext(ctxModel, "POST", "https://api.fireworks.ai/inference/v1/chat/completions", bytes.NewBuffer(bodyBytes))
			if err != nil {
				return err
			}

			req.Header.Set("Accept", "application/json")
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("Authorization", "Bearer "+apiKey)

			resp, err = httpClient.Do(req)
			return err
		}()

		if err != nil {
			log.Printf("[FireworksAI] Model %s chat completions error: %v", modelName, err)
			if ctxTotal.Err() != nil {
				log.Printf("[FireworksAI] Total timeout reached (%v), aborting further model queries.", ctxTotal.Err())
				break
			}
			continue
		}

		respBody, readErr := io.ReadAll(resp.Body)
		resp.Body.Close()

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
			targetLang := parser.DetectTargetLanguage(tName, "")
			onlineRes := h.searchOnlineCatalog(tName, catEn, nil, targetLang)
			if len(onlineRes) > 0 {
				bestIdx := 0
				for j, res := range onlineRes {
					if res.PosterURL != "" && !strings.HasPrefix(res.PosterURL, "data:image") {
						bestIdx = j
						break
					}
				}
				resultChan <- enrichedResult{index: idx, card: onlineRes[bestIdx], valid: true}
				return
			}

			// Try searching with cleaned base title (without brackets/subtitles) if initial search returned empty
			baseTitle := reParenBrackets.ReplaceAllString(tName, "")
			baseTitle = strings.TrimSpace(strings.Split(baseTitle, ":")[0])
			if baseTitle != "" && !strings.EqualFold(baseTitle, tName) {
				onlineResBase := h.searchOnlineCatalog(baseTitle, catEn, nil, targetLang)
				if len(onlineResBase) > 0 {
					bestIdx := 0
					for j, res := range onlineResBase {
						if res.PosterURL != "" && !strings.HasPrefix(res.PosterURL, "data:image") {
							bestIdx = j
							break
						}
					}
					resultChan <- enrichedResult{index: idx, card: onlineResBase[bestIdx], valid: true}
					return
				}
			}

			dbRes := h.searchDBCatalog(r.Context(), tName, catEn)
			if len(dbRes) > 0 {
				resultChan <- enrichedResult{index: idx, card: dbRes[0], valid: true}
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


