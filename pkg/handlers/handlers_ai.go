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
)

func normalizeTitleForComparison(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	var sb strings.Builder
	for _, r := range s {
		// Keep letters, numbers and spaces, ignore punctuation/quotes
		if unicode.IsLetter(r) || unicode.IsDigit(r) || unicode.IsSpace(r) {
			sb.WriteRune(r)
		}
	}
	return strings.Join(strings.Fields(sb.String()), " ")
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

	// 1. Collect all user DB titles for deduplication (prevent recommending items user already has anywhere in DB)
	userExistingTitles := make(map[string]bool)
	if userID != 0 && h.DB != nil && h.DB.Pool != nil {
		rowsAll, errAll := h.DB.Pool.Query(r.Context(), `SELECT title FROM items WHERE user_id = $1`, userID)
		if errAll == nil && rowsAll != nil {
			defer rowsAll.Close()
			for rowsAll.Next() {
				var dbTitle string
				if err := rowsAll.Scan(&dbTitle); err == nil && strings.TrimSpace(dbTitle) != "" {
					norm := normalizeTitleForComparison(dbTitle)
					if norm != "" {
						userExistingTitles[norm] = true
					}
					// also store exact lowercase trim just in case
					userExistingTitles[strings.ToLower(strings.TrimSpace(dbTitle))] = true
				}
			}
		}
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

	metaStr := ""
	metaParts := []string{}
	if len(uniqYears) > 0 {
		metaParts = append(metaParts, "Годы: "+strings.Join(uniqYears, ", "))
	}
	if len(uniqCountries) > 0 {
		metaParts = append(metaParts, "Страны: "+strings.Join(uniqCountries, ", "))
	}
	if len(uniqGenres) > 0 {
		metaParts = append(metaParts, "Жанры: "+strings.Join(uniqGenres, ", "))
	}
	if len(metaParts) > 0 {
		metaStr = "\nАналитика по входящему списку (" + strings.Join(metaParts, "; ") + ")."
	}
	_ = metaStr

	// Build exact user prompt
	itemsListStr := strings.Join(itemDescriptions, "\n- ")
	if itemsListStr != "" {
		itemsListStr = "- " + itemsListStr
	} else {
		itemsListStr = "- (список пуст, дай общие рекомендации)"
	}

	yearsStr := strings.Join(uniqYears, ", ")
	countriesStr := strings.Join(uniqCountries, ", ")
	genresStr := strings.Join(uniqGenres, ", ")
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

	prompt := fmt.Sprintf(`Ты — эксперт в подборе фильмов, сериалов, книг и игр. Твоя задача: проанализировать контекст пользователя и сгенерировать 30 новых рекомендаций.
Тема списка: "%s"
Категория: %s
Годы: %s
Страны: %s
Жанры: %s%s%s
Текущий список пользователя:
%s

Сгенерируй РОВНО 30 рекомендаций (не больше и не меньше), которые идеально подходят по духу, смыслу, категории (%s), эпохе и жанру к "Теме списка" и похожи на элементы из Текущего списка пользователя.

ПРАВИЛА:
1. Тема списка и текущие элементы задают смысловой вектор, а не ключевые слова для поиска.
2. Строго соблюдай категорию (%s), историческую эпоху и страны.
3. Разнообразие: все 30 элементов должны быть самостоятельными произведениями из разных франшиз (без сиквелов, приквелов и спин-оффов).
4. Категорически ЗАПРЕЩЕНО указывать произведения, которые уже присутствуют во входящем списке пользователя.
5. Формат ответа: только сырой JSON-массив из 30 строк с официальными русскими названиями. Пример: ["Название 1", "Название 2", ...]. 
6. Без markdown-разметки и без сопроводительного текста.
7. ВАЖНО: Список должен состоять строго из 30 позиций. Выдай ровно 30 названий.`,
		listTitleDisplay, catRuName, yearsStr, countriesStr, genresStr, directorsLine, authorsLine, itemsListStr, catRuName, catRuName)

	// 4. Query Fireworks AI API
	apiKey := strings.TrimSpace(h.FireworksAPIKey)
	if apiKey == "" {
		apiKey = "fw_R9nn6yvzVv8txadL2FLqC2"
	}

	modelsToTry := []string{
		"accounts/fireworks/models/qwen3p7-plus",
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
			"thinking": map[string]interface{}{
				"type": "disabled",
			},
			"reasoning_effort": "none",
			"temperature":      0.3,
			"max_tokens":       2048,
		}

		bodyBytes, err := json.Marshal(reqBodyMap)
		if err != nil {
			continue
		}

		var resp *http.Response
		err = func() error {
			// Each model gets up to 180s (3 minutes) to respond
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
						for _, pt := range parsedTitles {
							ptClean := strings.ToLower(strings.TrimSpace(pt))
							norm := normalizeTitleForComparison(pt)
							
							if norm != "" {
								if !userExistingTitles[norm] && !userExistingTitles[ptClean] {
									filteredTitles = append(filteredTitles, pt)
								}
							} else {
								if !userExistingTitles[ptClean] {
									filteredTitles = append(filteredTitles, pt)
								}
							}
						}
						recommendedTitles = filteredTitles
						log.Printf("[FireworksAI] Successfully generated %d recommendations using model %s (filtered out %d existing)", len(recommendedTitles), modelName, len(parsedTitles)-len(filteredTitles))
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

	// 5. Fallback if AI call failed (REMOVED per user request)
	if len(recommendedTitles) == 0 {
		log.Printf("[FireworksAI] All models failed or no key set, returning error to client instead of fallback")
		http.Error(w, "Не удалось получить рекомендации от нейросети. Пожалуйста, попробуйте еще раз.", http.StatusInternalServerError)
		return
	}

	// 6. Enrich recommended titles with external search (TMDb, Kinopoisk, Google Books, Steam, etc.)
	if len(recommendedTitles) > 20 {
		recommendedTitles = recommendedTitles[:20]
	}

	type enrichedResult struct {
		index int
		card  models.CatalogSearchResult
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
			onlineRes := h.searchOnlineCatalog(tName, catEn, nil)
			if len(onlineRes) > 0 {
				bestIdx := 0
				for j, res := range onlineRes {
					if res.PosterURL != "" && !strings.HasPrefix(res.PosterURL, "data:image") {
						bestIdx = j
						break
					}
				}
				resultChan <- enrichedResult{index: idx, card: onlineRes[bestIdx]}
				return
			}
			dbRes := h.searchDBCatalog(r.Context(), tName, catEn)
			if len(dbRes) > 0 {
				resultChan <- enrichedResult{index: idx, card: dbRes[0]}
				return
			}
			// Fallback card if online search has no match
			resultChan <- enrichedResult{
				index: idx,
				card: models.CatalogSearchResult{
					Title:       tName,
					Category:    catEn,
					Source:      "ai",
					ReleaseYear: "",
				},
			}
		}(i, tClean)
	}

	wg.Wait()
	close(resultChan)

	cardsMap := make(map[int]models.CatalogSearchResult)
	for res := range resultChan {
		cardsMap[res.index] = res.card
	}

	var finalCards []models.CatalogSearchResult
	for i := 0; i < len(recommendedTitles); i++ {
		if card, ok := cardsMap[i]; ok {
			if card.Category == "" {
				card.Category = catEn
			}
			finalCards = append(finalCards, card)
		}
	}

	if finalCards == nil {
		finalCards = []models.CatalogSearchResult{}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(finalCards)
}

