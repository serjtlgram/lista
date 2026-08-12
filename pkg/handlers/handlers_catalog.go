package handlers

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/google/uuid"

	"lista-backend/pkg/models"
	"lista-backend/pkg/parser"
)

// GET /api/catalog/search?q=Title&category=Category
func (h *Handler) SearchCatalog(w http.ResponseWriter, r *http.Request) {
	// 1. Rate limiting: 1 request per 2 seconds per user/IP
	rateKey := getRateLimitKey(r)
	if allowed, wait := h.RateLimiter.Allow("search:"+rateKey, 2*time.Second); !allowed {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Retry-After", "2")
		w.WriteHeader(http.StatusTooManyRequests)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":                "Слишком много запросов. Пожалуйста, подождите 2 секунды перед следующим поиском.",
			"retry_after_seconds": 2,
			"wait_ms":              wait.Milliseconds(),
		})
		return
	}

	q := strings.TrimSpace(r.URL.Query().Get("q"))
	if len(q) < 2 {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode([]models.CatalogSearchResult{})
		return
	}
	if len(q) > 150 {
		q = q[:150]
	}

	category := strings.TrimSpace(r.URL.Query().Get("category"))
	catEn := mapCategoryToEn(category)

	langParam := strings.TrimSpace(r.URL.Query().Get("lang"))
	if langParam == "" {
		langParam = r.Header.Get("Accept-Language")
	}
	targetLang := parser.DetectTargetLanguage(q, langParam)

	// If no category specified or "all", check if search query contains category trigger words
	if catEn == "" || catEn == "all" {
		if parsedCat, cleanedQ := parseSearchQuery(q); parsedCat != "" {
			catEn = parsedCat
			q = cleanedQ
		}
	}

	// 2. Check Search Cache
	cacheKey := fmt.Sprintf("catalog:%s:%s:%s", strings.ToLower(q), catEn, targetLang)
	if cachedResults, found := h.SearchCache.GetCatalogResults(cacheKey); found {
		w.Header().Set("Content-Type", "application/json")
		json.NewEncoder(w).Encode(cachedResults)
		return
	}

	// 3. DB catalog search filtered by category
	dbResults := h.searchDBCatalog(r.Context(), q, catEn)

	// 4. Online search filtered by category
	onlineResults := h.searchOnlineCatalog(q, catEn, dbResults, targetLang)

	// 5. Merge results adhering strictly to category order & limits
	finalResults := mergeSearchResults(dbResults, onlineResults, catEn, targetLang)

	// Cache final results
	h.SearchCache.Set(cacheKey, finalResults)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(finalResults)
}

func (h *Handler) searchDBCatalog(ctx context.Context, q string, catEn string) []models.CatalogSearchResult {
	if h.DB == nil || h.DB.Pool == nil {
		return nil
	}

	query := `
		SELECT DISTINCT ON (LOWER(title), category) id::text, title, category, genre, duration, release_year, poster_url, description, youtube_url, director, cast_members, author, isbn, public_rating, country
		FROM items
		WHERE 1=1
	`
	var args []interface{}
	argIdx := 1

	if strings.TrimSpace(q) != "" {
		query += fmt.Sprintf(" AND LOWER(title) LIKE $%d", argIdx)
		args = append(args, "%"+strings.ToLower(strings.TrimSpace(q))+"%")
		argIdx++
	}

	if catEn == "movie" {
		query += " AND LOWER(category) IN ('movie', 'movies', 'фильм', 'фильмы')"
	} else if catEn == "show" {
		query += " AND LOWER(category) IN ('show', 'shows', 'series', 'сериал', 'сериалы')"
	} else if catEn == "book" {
		query += " AND LOWER(category) IN ('book', 'books', 'книга', 'книги')"
	} else if catEn == "game" {
		query += " AND LOWER(category) IN ('game', 'games', 'игра', 'игры')"
	} else if catEn == "movies_and_shows" || catEn == "" {
		query += " AND LOWER(category) IN ('movie', 'movies', 'фильм', 'фильмы', 'show', 'shows', 'series', 'сериал', 'сериалы')"
	}

	query += " ORDER BY LOWER(title), category, created_at DESC LIMIT 30;"

	var results []models.CatalogSearchResult
	rows, err := h.DB.Pool.Query(ctx, query, args...)
	if err == nil && rows != nil {
		defer rows.Close()
		for rows.Next() {
			var res models.CatalogSearchResult
			if err := rows.Scan(&res.ID, &res.Title, &res.Category, &res.Genre, &res.Duration, &res.ReleaseYear, &res.PosterURL, &res.Description, &res.YoutubeURL, &res.Director, &res.Cast, &res.Author, &res.ISBN, &res.PublicRating, &res.Country); err == nil {
				res.Source = "db"
				res.Category = mapCategoryToEn(res.Category)
				results = append(results, res)
			}
		}
	}

	if len(results) > 0 {
		var wg sync.WaitGroup
		for i := range results {
			cat := results[i].Category
			needsEnrichment := false
			if cat == "movie" || cat == "show" {
				if results[i].Director == "" || results[i].Cast == "" || results[i].Duration == "" || results[i].PublicRating == "" || results[i].Country == "" {
					needsEnrichment = true
				}
			} else if cat == "book" {
				if results[i].Author == "" || results[i].ISBN == "" || results[i].PublicRating == "" {
					needsEnrichment = true
				}
			}
			if needsEnrichment {
				wg.Add(1)
				go func(idx int) {
					defer wg.Done()
					h.enrichDBCatalogResult(&results[idx])
				}(i)
			}
		}
		wg.Wait()
	}

	return results
}

func (h *Handler) enrichDBCatalogResult(item *models.CatalogSearchResult) bool {
	cat := mapCategoryToEn(item.Category)
	title := strings.TrimSpace(item.Title)
	if title == "" {
		return false
	}

	updated := false

	if cat == "movie" || cat == "show" {
		if item.Director == "" || item.Cast == "" || item.Duration == "" || item.Genre == "" || item.ReleaseYear == "" || item.PublicRating == "" || item.Country == "" {
			if h.KinopoiskAPIKey != "" {
				kp := fetchKinopoiskInline(title, h.KinopoiskAPIKey, cat)
				if len(kp) > 0 {
					best := kp[0]
					if item.Director == "" && best.Director != "" {
						item.Director = best.Director
						updated = true
					}
					if item.Cast == "" && best.Cast != "" {
						item.Cast = best.Cast
						updated = true
					}
					if item.Duration == "" && best.Duration != "" {
						item.Duration = best.Duration
						updated = true
					}
					if item.Genre == "" && best.Genre != "" {
						item.Genre = best.Genre
						updated = true
					}
					if item.ReleaseYear == "" && best.ReleaseYear != "" {
						item.ReleaseYear = best.ReleaseYear
						updated = true
					}
					if item.PosterURL == "" && best.PosterURL != "" {
						item.PosterURL = best.PosterURL
						updated = true
					}
					if item.Description == "" && best.Description != "" {
						item.Description = best.Description
						updated = true
					}
					if item.PublicRating == "" && best.PublicRating != "" {
						item.PublicRating = best.PublicRating
						updated = true
					}
					if item.Country == "" && best.Country != "" {
						item.Country = best.Country
						updated = true
					}
				}
			}
			if (item.Director == "" || item.Cast == "" || item.PublicRating == "" || item.Country == "") && h.TMDBAPIKey != "" {
				targetLang := parser.DetectTargetLanguage(title, "")
				tmdb := fetchTMDbInline(title, h.TMDBAPIKey, cat, targetLang)
				if len(tmdb) > 0 {
					best := tmdb[0]
					if item.Director == "" && best.Director != "" {
						item.Director = best.Director
						updated = true
					}
					if item.Cast == "" && best.Cast != "" {
						item.Cast = best.Cast
						updated = true
					}
					if item.Duration == "" && best.Duration != "" {
						item.Duration = best.Duration
						updated = true
					}
					if item.Genre == "" && best.Genre != "" {
						item.Genre = best.Genre
						updated = true
					}
					if item.ReleaseYear == "" && best.ReleaseYear != "" {
						item.ReleaseYear = best.ReleaseYear
						updated = true
					}
					if item.PosterURL == "" && best.PosterURL != "" {
						item.PosterURL = best.PosterURL
						updated = true
					}
					if item.Description == "" && best.Description != "" {
						item.Description = best.Description
						updated = true
					}
					if item.PublicRating == "" && best.PublicRating != "" {
						item.PublicRating = best.PublicRating
						updated = true
					}
					if item.Country == "" && best.Country != "" {
						item.Country = best.Country
						updated = true
					}
				}
			}
		}
	} else if cat == "book" {
		if item.Author == "" || item.ISBN == "" || item.Duration == "" || item.Genre == "" || item.ReleaseYear == "" || item.PublicRating == "" {
			books := parser.SearchBooksMultiSource(title)
			if len(books) > 0 {
				best := books[0]
				if item.Author == "" && best.Author != "" {
					item.Author = best.Author
					updated = true
				}
				if item.ISBN == "" && best.ISBN != "" {
					item.ISBN = best.ISBN
					updated = true
				}
				if item.Duration == "" && best.Duration != "" {
					item.Duration = best.Duration
					updated = true
				}
				if item.Genre == "" && best.Genre != "" {
					item.Genre = best.Genre
					updated = true
				}
				if item.ReleaseYear == "" && best.ReleaseYear != "" {
					item.ReleaseYear = best.ReleaseYear
					updated = true
				}
				if item.PosterURL == "" && best.PosterURL != "" {
					item.PosterURL = best.PosterURL
					updated = true
				}
				if item.Description == "" && best.Description != "" {
					item.Description = best.Description
					updated = true
				}
				if item.PublicRating == "" && best.PublicRating != "" {
					item.PublicRating = best.PublicRating
					updated = true
				}
			}
		}
	}

	if updated {
		go h.updateItemMetadataInDB(item.Title, cat, item.Director, item.Cast, item.Duration, item.Genre, item.ReleaseYear, item.PosterURL, item.Description, item.Author, item.ISBN, item.PublicRating, mapCountryToFlag(item.Country))
	}

	return updated
}

func (h *Handler) updateItemMetadataInDB(title string, cat string, director string, cast string, duration string, genre string, releaseYear string, posterURL string, description string, author string, isbn string, publicRating string, country string) {
	if h.DB == nil || h.DB.Pool == nil {
		return
	}
	ctx := context.Background()

	posterURL = strings.TrimSpace(posterURL)
	if posterURL != "" {
		posterURL = parser.OptimizePosterURL(nil, posterURL)
	}

	query := `
		UPDATE items
		SET
			director = CASE WHEN director = '' THEN $1 ELSE director END,
			cast_members = CASE WHEN cast_members = '' THEN $2 ELSE cast_members END,
			duration = CASE WHEN duration = '' THEN $3 ELSE duration END,
			genre = CASE WHEN genre = '' THEN $4 ELSE genre END,
			release_year = CASE WHEN release_year = '' THEN $5 ELSE release_year END,
			poster_url = CASE WHEN poster_url = '' THEN $6 ELSE poster_url END,
			description = CASE WHEN description = '' THEN $7 ELSE description END,
			author = CASE WHEN author = '' THEN $8 ELSE author END,
			isbn = CASE WHEN isbn = '' THEN $9 ELSE isbn END,
			public_rating = CASE WHEN public_rating = '' THEN $10 ELSE public_rating END,
			country = CASE WHEN country = '' THEN $11 ELSE country END,
			updated_at = CURRENT_TIMESTAMP
		WHERE LOWER(TRIM(title)) = LOWER(TRIM($12))
		  AND (category = $13 OR category = $14)
	`
	
	catEn := mapCategoryToEn(cat)
	args := []interface{}{director, cast, duration, genre, releaseYear, posterURL, description, author, isbn, publicRating, country, title, cat, catEn}
	
	if releaseYear != "" {
		query += ` AND release_year = $15;`
		args = append(args, releaseYear)
	} else {
		query += `;`
	}

	_, err := h.DB.Pool.Exec(ctx, query, args...)
	if err != nil {
		log.Printf("[UpdateItemMetadata] Error updating DB item %s: %v", title, err)
	}
}

func (h *Handler) searchOnlineCatalog(q string, catEn string, dbResults []models.CatalogSearchResult, targetLang string) []models.CatalogSearchResult {
	var items []models.CatalogSearchResult

	parsedCat, cleanedQ := parseSearchQuery(q)
	if catEn == "" || catEn == "all" {
		if parsedCat != "" {
			catEn = parsedCat
			q = cleanedQ
		}
	}

	if targetLang == "" {
		targetLang = parser.DetectTargetLanguage(q, "")
	}

	switch catEn {
	case "book":
		items = parser.SearchBooksMultiSource(q)

	case "game":
		items = parser.SearchGamesMultiSource(q)

	case "movie":
		var kinopoisk []models.CatalogSearchResult
		if targetLang == "ru-RU" {
			kinopoisk = fetchKinopoiskInline(q, h.KinopoiskAPIKey, "movie")
		}
		tmdb := fetchTMDbInline(q, h.TMDBAPIKey, "movie", targetLang)
		itunes := fetchITunesInline(q, "movie")
		wiki := fetchWikiInline(q, "movie")
		for _, item := range append(append(append(kinopoisk, tmdb...), itunes...), wiki...) {
			cat := mapCategoryToEn(item.Category)
			if cat == "movie" {
				item.Source = "online"
				items = append(items, item)
			}
		}

	case "show":
		var kinopoisk []models.CatalogSearchResult
		if targetLang == "ru-RU" {
			kinopoisk = fetchKinopoiskInline(q, h.KinopoiskAPIKey, "show")
		}
		tmdb := fetchTMDbInline(q, h.TMDBAPIKey, "show", targetLang)
		tvmaze := fetchTVMazeInline(q, h.TMDBAPIKey)
		wiki := fetchWikiInline(q, "show")
		for _, item := range append(append(append(kinopoisk, tmdb...), tvmaze...), wiki...) {
			cat := mapCategoryToEn(item.Category)
			if cat == "show" {
				item.Source = "online"
				items = append(items, item)
			}
		}

	default: // "all" or empty -> Movies and TV series
		var kinopoisk []models.CatalogSearchResult
		if targetLang == "ru-RU" {
			kinopoisk = fetchKinopoiskInline(q, h.KinopoiskAPIKey, "all")
		}
		tmdb := fetchTMDbInline(q, h.TMDBAPIKey, "all", targetLang)
		itunes := fetchITunesInline(q, "movie")
		tvmaze := fetchTVMazeInline(q, h.TMDBAPIKey)

		rawList := append(append(append(kinopoisk, tmdb...), itunes...), tvmaze...)
		for _, item := range rawList {
			cat := mapCategoryToEn(item.Category)
			if cat == "movie" || cat == "show" {
				item.Source = "online"
				items = append(items, item)
			}
		}
	}

	// 1. Build map of existing DB posters by title
	dbPosterMap := make(map[string]string)
	for _, dbItem := range dbResults {
		titleKey := strings.ToLower(strings.TrimSpace(dbItem.Title))
		if titleKey != "" && strings.TrimSpace(dbItem.PosterURL) != "" {
			dbPosterMap[titleKey] = dbItem.PosterURL
		}
	}

	// 2. Reuse DB poster if available, or optimize raw poster URL concurrently
	var wg sync.WaitGroup
	client := &http.Client{Timeout: 3 * time.Second}

	for i := range items {
		titleKey := strings.ToLower(strings.TrimSpace(items[i].Title))
		if existingPoster, ok := dbPosterMap[titleKey]; ok && strings.TrimSpace(existingPoster) != "" {
			items[i].PosterURL = existingPoster
			continue
		}

		pURL := strings.TrimSpace(items[i].PosterURL)
		if pURL == "" || strings.HasPrefix(pURL, "data:image/") {
			continue
		}

		wg.Add(1)
		go func(idx int, rawURL string) {
			defer wg.Done()
			opt := parser.OptimizePosterURL(client, rawURL)
			if opt != "" {
				items[idx].PosterURL = opt
			}
		}(i, pURL)
	}

	wg.Wait()

	for i := range items {
		if items[i].Country != "" {
			items[i].Country = mapCountryToFlag(items[i].Country)
		}
		go h.saveCatalogItemToDB(items[i])
	}

	return items
}

func mergeSearchResults(dbItems, onlineItems []models.CatalogSearchResult, catEn string, targetLang string) []models.CatalogSearchResult {
	movieBucket := []models.CatalogSearchResult{}
	showBucket := []models.CatalogSearchResult{}
	bookBucket := []models.CatalogSearchResult{}
	gameBucket := []models.CatalogSearchResult{}

	seenMovie := make(map[string]int)
	seenShow := make(map[string]int)
	seenBook := make(map[string]int)
	seenGame := make(map[string]int)

	var allRaw []models.CatalogSearchResult
	if targetLang != "ru-RU" && len(onlineItems) > 0 {
		allRaw = append(onlineItems, dbItems...)
	} else {
		allRaw = append(dbItems, onlineItems...)
	}

	for _, item := range allRaw {
		normCat := mapCategoryToEn(item.Category)
		titleKey := strings.ToLower(strings.TrimSpace(item.Title))
		if titleKey == "" {
			continue
		}

		mergeItem := func(bucket []models.CatalogSearchResult, idx int) []models.CatalogSearchResult {
			if bucket[idx].Country == "" && item.Country != "" {
				bucket[idx].Country = item.Country
			}
			if bucket[idx].Description == "" && item.Description != "" {
				bucket[idx].Description = item.Description
			}
			if bucket[idx].PosterURL == "" && item.PosterURL != "" {
				bucket[idx].PosterURL = item.PosterURL
			}
			if bucket[idx].PublicRating == "" && item.PublicRating != "" {
				bucket[idx].PublicRating = item.PublicRating
			}
			if bucket[idx].Director == "" && item.Director != "" {
				bucket[idx].Director = item.Director
			}
			if bucket[idx].Cast == "" && item.Cast != "" {
				bucket[idx].Cast = item.Cast
			}
			if bucket[idx].Duration == "" && item.Duration != "" {
				bucket[idx].Duration = item.Duration
			}
			if bucket[idx].ReleaseYear == "" && item.ReleaseYear != "" {
				bucket[idx].ReleaseYear = item.ReleaseYear
			}
			if bucket[idx].Genre == "" && item.Genre != "" {
				bucket[idx].Genre = item.Genre
			}
			return bucket
		}

		switch normCat {
		case "movie":
			if idx, ok := seenMovie[titleKey]; !ok {
				seenMovie[titleKey] = len(movieBucket)
				movieBucket = append(movieBucket, item)
			} else {
				movieBucket = mergeItem(movieBucket, idx)
			}
		case "show":
			if idx, ok := seenShow[titleKey]; !ok {
				seenShow[titleKey] = len(showBucket)
				showBucket = append(showBucket, item)
			} else {
				showBucket = mergeItem(showBucket, idx)
			}
		case "book":
			if idx, ok := seenBook[titleKey]; !ok {
				seenBook[titleKey] = len(bookBucket)
				bookBucket = append(bookBucket, item)
			} else {
				if bookBucket[idx].Author == "" && item.Author != "" {
					bookBucket[idx].Author = item.Author
				}
				if bookBucket[idx].Genre == "" && item.Genre != "" {
					bookBucket[idx].Genre = item.Genre
				}
				if bookBucket[idx].ISBN == "" && item.ISBN != "" {
					bookBucket[idx].ISBN = item.ISBN
				}
				if bookBucket[idx].Duration == "" && item.Duration != "" {
					bookBucket[idx].Duration = item.Duration
				}
				if bookBucket[idx].Description == "" && item.Description != "" {
					bookBucket[idx].Description = item.Description
				}
				if bookBucket[idx].PosterURL == "" && item.PosterURL != "" {
					bookBucket[idx].PosterURL = item.PosterURL
				}
			}
		case "game":
			if idx, ok := seenGame[titleKey]; !ok {
				seenGame[titleKey] = len(gameBucket)
				gameBucket = append(gameBucket, item)
			} else {
				gameBucket = mergeItem(gameBucket, idx)
			}
		}
	}

	var results []models.CatalogSearchResult

	switch catEn {
	case "movie":
		if len(movieBucket) > 10 {
			movieBucket = movieBucket[:10]
		}
		if len(showBucket) > 5 {
			showBucket = showBucket[:5]
		}
		results = append(results, movieBucket...)
		results = append(results, showBucket...)

	case "show":
		if len(showBucket) > 10 {
			showBucket = showBucket[:10]
		}
		if len(movieBucket) > 5 {
			movieBucket = movieBucket[:5]
		}
		results = append(results, showBucket...)
		results = append(results, movieBucket...)

	case "book":
		if len(bookBucket) > 15 {
			bookBucket = bookBucket[:15]
		}
		results = append(results, bookBucket...)

	case "game":
		if len(gameBucket) > 15 {
			gameBucket = gameBucket[:15]
		}
		results = append(results, gameBucket...)

	default: // "all" or empty
		// Order: Top 5 Movies -> Top 5 Series -> Top 5 Books -> Top 5 Games
		if len(movieBucket) > 5 {
			movieBucket = movieBucket[:5]
		}
		if len(showBucket) > 5 {
			showBucket = showBucket[:5]
		}
		if len(bookBucket) > 5 {
			bookBucket = bookBucket[:5]
		}
		if len(gameBucket) > 5 {
			gameBucket = gameBucket[:5]
		}
		results = append(results, movieBucket...)
		results = append(results, showBucket...)
		results = append(results, bookBucket...)
		results = append(results, gameBucket...)
	}

	return results
}


func fetchITunesInline(query string, targetCat string) []models.CatalogSearchResult {
	var list []models.CatalogSearchResult
	entity := "movie"
	if targetCat == "book" {
		entity = "ebook"
	} else if targetCat == "all" {
		entity = "movie,ebook"
	}

	apiURL := fmt.Sprintf("https://itunes.apple.com/search?term=%s&entity=%s&limit=6&lang=ru_ru", url.QueryEscape(query), entity)

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return list
	}
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Do(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return list
	}
	defer resp.Body.Close()

	var data struct {
		Results []struct {
			TrackName        string `json:"trackName"`
			CollectionName   string `json:"collectionName"`
			ArtistName       string `json:"artistName"`
			ArtworkUrl100    string `json:"artworkUrl100"`
			Kind             string `json:"kind"`
			WrapperType      string `json:"wrapperType"`
			PrimaryGenreName string `json:"primaryGenreName"`
			ReleaseDate      string `json:"releaseDate"`
			TrackTimeMillis  int    `json:"trackTimeMillis"`
			LongDescription  string `json:"longDescription"`
		} `json:"results"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
		for _, r := range data.Results {
			title := r.TrackName
			if title == "" {
				title = r.CollectionName
			}
			if title == "" {
				continue
			}

			cat := "movie"
			if r.WrapperType == "ebook" || r.Kind == "ebook" {
				cat = "book"
			}

			if targetCat != "" && targetCat != "all" && cat != targetCat {
				continue
			}

			year := ""
			if len(r.ReleaseDate) >= 4 {
				year = r.ReleaseDate[:4]
			}

			duration := ""
			if r.TrackTimeMillis > 0 {
				totalMin := r.TrackTimeMillis / 60000
				if totalMin > 0 {
					duration = fmt.Sprintf("%d мин", totalMin)
				}
			}

			director := ""
			if cat == "movie" && r.ArtistName != "" {
				director = r.ArtistName
			}

			poster := strings.ReplaceAll(r.ArtworkUrl100, "100x100bb", "600x600bb")
			rawID := fmt.Sprintf("itunes_%s_%s", cat, title)
			itemID := uuid.NewSHA1(uuid.NameSpaceURL, []byte(rawID)).String()

			list = append(list, models.CatalogSearchResult{
				ID:          itemID,
				Title:       title,
				Category:    cat,
				Genre:       r.PrimaryGenreName,
				Duration:    duration,
				ReleaseYear: year,
				PosterURL:   poster,
				Description: r.LongDescription,
				Director:    director,
			})
		}
	}
	return list
}

func mapEnglishGenreToRu(g string) string {
	switch strings.ToLower(strings.TrimSpace(g)) {
	case "action":
		return "Боевик"
	case "adventure":
		return "Приключения"
	case "comedy":
		return "Комедия"
	case "crime", "mystery":
		return "Детектив"
	case "drama":
		return "Драма"
	case "fantasy":
		return "Фэнтези"
	case "science-fiction", "sci-fi":
		return "Фантастика"
	case "thriller":
		return "Триллер"
	case "horror":
		return "Ужасы"
	case "anime", "animation":
		return "Мультфильмы"
	default:
		return g
	}
}

func fetchTVMazeInline(query string, tmdbKey string) []models.CatalogSearchResult {
	var list []models.CatalogSearchResult
	apiURL := fmt.Sprintf("https://api.tvmaze.com/search/shows?q=%s", url.QueryEscape(query))

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return list
	}
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Do(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return list
	}
	defer resp.Body.Close()

	var data []struct {
		Show struct {
			ID        int      `json:"id"`
			Name      string   `json:"name"`
			Premiered string   `json:"premiered"`
			Runtime   int      `json:"runtime"`
			Genres    []string `json:"genres"`
			Summary   string   `json:"summary"`
			Image     *struct {
				Medium   string `json:"medium"`
				Original string `json:"original"`
			} `json:"image"`
		} `json:"show"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
		for i, item := range data {
			if i >= 6 {
				break
			}
			show := item.Show
			if show.Name == "" {
				continue
			}

			year := ""
			if len(show.Premiered) >= 4 {
				year = show.Premiered[:4]
			}
			poster := ""
			if show.Image != nil {
				poster = show.Image.Original
				if poster == "" {
					poster = show.Image.Medium
				}
			}
			genre := "Сериал"
			if len(show.Genres) > 0 {
				genre = mapEnglishGenreToRu(show.Genres[0])
			}
			cleanDesc := regexp.MustCompile(`<[^>]*>`).ReplaceAllString(show.Summary, "")

			duration := ""
			if show.Runtime > 0 {
				duration = fmt.Sprintf("%d мин", show.Runtime)
			}

			rawID := fmt.Sprintf("tvmaze_%d", show.ID)
			itemID := uuid.NewSHA1(uuid.NameSpaceURL, []byte(rawID)).String()

			list = append(list, models.CatalogSearchResult{
				ID:          itemID,
				Title:       show.Name,
				Category:    "show",
				Genre:       genre,
				Duration:    duration,
				ReleaseYear: year,
				PosterURL:   poster,
				Description: cleanDesc,
			})
		}
	}
	return list
}

func fetchWikiInline(query string, targetCat string) []models.CatalogSearchResult {
	var list []models.CatalogSearchResult
	apiURL := fmt.Sprintf("https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch=%s&utf8=1&format=json", url.QueryEscape(query))

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return list
	}
	client := &http.Client{Timeout: 2 * time.Second}
	resp, err := client.Do(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return list
	}
	defer resp.Body.Close()

	var data struct {
		Query struct {
			Search []struct {
				Title   string `json:"title"`
				Snippet string `json:"snippet"`
			} `json:"search"`
		} `json:"query"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
		for i, item := range data.Query.Search {
			if i >= 4 || item.Title == "" {
				break
			}
			cleanDesc := regexp.MustCompile(`<[^>]*>`).ReplaceAllString(item.Snippet, "")

			cat := "movie"
			tLower := strings.ToLower(item.Title + " " + cleanDesc)
			if strings.Contains(tLower, "игра") || strings.Contains(tLower, "game") {
				cat = "game"
			} else if strings.Contains(tLower, "книга") || strings.Contains(tLower, "роман") || strings.Contains(tLower, "повесть") {
				cat = "book"
			} else if strings.Contains(tLower, "сериал") || strings.Contains(tLower, "телесериал") {
				cat = "show"
			}

			if targetCat != "" && cat != targetCat {
				continue
			}

			rawID := fmt.Sprintf("wiki_%s_%s", cat, item.Title)
			itemID := uuid.NewSHA1(uuid.NameSpaceURL, []byte(rawID)).String()

			list = append(list, models.CatalogSearchResult{
				ID:          itemID,
				Title:       item.Title,
				Category:    cat,
				Description: cleanDesc,
			})
		}
	}
	return list
}

var tmdbGenreMap = map[int]string{
	28: "Боевик", 12: "Приключения", 16: "Мультфильмы", 35: "Комедия",
	80: "Детектив", 99: "Другое", 18: "Драма", 10751: "Мультфильмы",
	14: "Фэнтези", 36: "Другое", 27: "Ужасы", 10402: "Другое",
	9648: "Детектив", 10749: "Драма", 878: "Фантастика", 10770: "Шоу",
	53: "Триллер", 10752: "Боевик", 37: "Приключения", 10759: "Боевик",
	10762: "Мультфильмы", 10763: "Шоу", 10764: "Шоу", 10765: "Фантастика",
}

func fetchTMDbInline(query string, tmdbKey string, targetCat string, targetLang string) []models.CatalogSearchResult {
	var list []models.CatalogSearchResult
	tmdbKey = strings.TrimSpace(tmdbKey)
	if tmdbKey == "" {
		tmdbKey = "b5f8997a3cfc68383f7a40b3c6628b03"
	}

	if targetLang == "" {
		targetLang = parser.DetectTargetLanguage(query, "")
	}

	endpoint := "search/multi"
	if targetCat == "movie" {
		endpoint = "search/movie"
	} else if targetCat == "show" || targetCat == "tv" {
		endpoint = "search/tv"
	}

	apiURL := fmt.Sprintf(
		"https://api.themoviedb.org/3/%s?query=%s&language=%s&include_adult=false&page=1",
		endpoint,
		url.QueryEscape(query),
		url.QueryEscape(targetLang),
	)
	if len(tmdbKey) < 50 {
		apiURL += "&api_key=" + tmdbKey
	}

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return list
	}

	if len(tmdbKey) >= 50 {
		req.Header.Set("Authorization", "Bearer "+tmdbKey)
	}
	req.Header.Set("accept", "application/json")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return list
	}
	defer resp.Body.Close()

	var data struct {
		Results []struct {
			ID           int     `json:"id"`
			Title        string  `json:"title"`
			Name         string  `json:"name"`
			MediaType    string  `json:"media_type"`
			PosterPath   string  `json:"poster_path"`
			Overview     string  `json:"overview"`
			ReleaseDate  string  `json:"release_date"`
			FirstAirDate string  `json:"first_air_date"`
			VoteAverage  float64 `json:"vote_average"`
			GenreIDs     []int   `json:"genre_ids"`
		} `json:"results"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
		type tmdbRes struct {
			idx  int
			item models.CatalogSearchResult
		}
		resCh := make(chan tmdbRes, len(data.Results))
		var wg sync.WaitGroup

		candidateCount := 0
		for i, r := range data.Results {
			if candidateCount >= 20 {
				break
			}
			title := r.Title
			if title == "" {
				title = r.Name
			}
			if title == "" || r.MediaType == "person" {
				continue
			}

			cat := "movie"
			if r.MediaType == "tv" || targetCat == "show" || targetCat == "tv" {
				cat = "show"
			}

			if targetCat == "movie" && cat != "movie" {
				continue
			}
			if (targetCat == "show" || targetCat == "tv") && cat != "show" {
				continue
			}

			candidateCount++

			year := ""
			if len(r.ReleaseDate) >= 4 {
				year = r.ReleaseDate[:4]
			} else if len(r.FirstAirDate) >= 4 {
				year = r.FirstAirDate[:4]
			}

			poster := ""
			if r.PosterPath != "" {
				poster = "https://image.tmdb.org/t/p/w500" + r.PosterPath
			}

			genre := ""
			for _, gID := range r.GenreIDs {
				if gName, ok := tmdbGenreMap[gID]; ok {
					genre = gName
					break
				}
			}

			mediaType := r.MediaType
			if mediaType == "" {
				if cat == "show" {
					mediaType = "tv"
				} else {
					mediaType = "movie"
				}
			}

			rawID := fmt.Sprintf("tmdb_%s_%d", mediaType, r.ID)
			itemID := uuid.NewSHA1(uuid.NameSpaceURL, []byte(rawID)).String()

			pubRating := ""
			if r.VoteAverage > 0 {
				pubRating = fmt.Sprintf("%.1f", r.VoteAverage)
			}

			baseItem := models.CatalogSearchResult{
				ID:           itemID,
				Title:        title,
				Category:     cat,
				Genre:        genre,
				ReleaseYear:  year,
				PosterURL:    poster,
				Description:  r.Overview,
				PublicRating: pubRating,
			}

			wg.Add(1)
			go func(idx int, tmdbID int, mType string, bItem models.CatalogSearchResult) {
				defer wg.Done()
				if details, err := parser.FetchTMDbDetails(client, tmdbKey, strconv.Itoa(tmdbID), mType, targetLang); err == nil && details != nil {
					if details.Director != "" {
						bItem.Director = details.Director
					}
					if details.Cast != "" {
						bItem.Cast = details.Cast
					}
					if details.Duration != "" {
						bItem.Duration = details.Duration
					}
					if details.Genre != "" {
						bItem.Genre = details.Genre
					}
					if details.ReleaseYear != "" {
						bItem.ReleaseYear = details.ReleaseYear
					}
					if details.PosterURL != "" {
						bItem.PosterURL = details.PosterURL
					}
					if details.Description != "" {
						bItem.Description = details.Description
					}
					if details.YoutubeURL != "" {
						bItem.YoutubeURL = details.YoutubeURL
					}
					if details.PublicRating != "" {
						bItem.PublicRating = details.PublicRating
					}
					if details.Country != "" {
						bItem.Country = details.Country
					}
				}
				resCh <- tmdbRes{idx: idx, item: bItem}
			}(i, r.ID, r.MediaType, baseItem)
		}

		wg.Wait()
		close(resCh)

		itemsMap := make(map[int]models.CatalogSearchResult)
		for res := range resCh {
			itemsMap[res.idx] = res.item
		}
		for i := 0; i < len(data.Results); i++ {
			if item, ok := itemsMap[i]; ok {
				list = append(list, item)
			}
		}
	}

	return list
}

func (h *Handler) saveCatalogItemToDB(item models.CatalogSearchResult) {
	if h.DB == nil || h.DB.Pool == nil || item.ID == "" || strings.TrimSpace(item.Title) == "" {
		return
	}
	ctx := context.Background()
	catEn := mapCategoryToEn(item.Category)

	itemID := item.ID
	if _, err := uuid.Parse(item.ID); err != nil {
		itemID = uuid.NewSHA1(uuid.NameSpaceURL, []byte(item.ID)).String()
	}

	poster := strings.TrimSpace(item.PosterURL)
	if poster != "" {
		poster = parser.OptimizePosterURL(nil, poster)
	}

	query := `
		INSERT INTO items (id, user_id, title, category, status, rating, genre, duration, release_year, poster_url, description, youtube_url, director, cast_members, author, isbn, public_rating, country, created_at, updated_at)
		VALUES ($1, 0, $2, $3, 'planned', 0, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
		ON CONFLICT (id) DO NOTHING;
	`
	mappedCountry := mapCountryToFlag(item.Country)
	_, err := h.DB.Pool.Exec(ctx, query, itemID, item.Title, catEn, item.Genre, item.Duration, item.ReleaseYear, poster, item.Description, item.YoutubeURL, item.Director, item.Cast, item.Author, item.ISBN, item.PublicRating, mappedCountry)
	if err != nil {
		log.Printf("[SaveCatalogItem] Error saving catalog item %s (%s): %v", itemID, item.Title, err)
	}
}

func fetchKinopoiskInline(query string, kpKey string, targetCat string) []models.CatalogSearchResult {
	var list []models.CatalogSearchResult
	if strings.TrimSpace(kpKey) == "" {
		return list
	}

	apiURL := fmt.Sprintf(
		"https://kinopoiskapiunofficial.tech/api/v2.1/films/search-by-keyword?keyword=%s",
		url.QueryEscape(query),
	)

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return list
	}
	req.Header.Set("X-API-KEY", kpKey)
	req.Header.Set("Content-Type", "application/json")

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return list
	}
	defer resp.Body.Close()

	var data struct {
		Films []struct {
			FilmID      int    `json:"filmId"`
			NameRu      string `json:"nameRu"`
			NameEn      string `json:"nameEn"`
			Type        string `json:"type"`
			Year        string `json:"year"`
			FilmLength  string `json:"filmLength"`
			Rating      string `json:"rating"`
			Description string `json:"description"`
			PosterUrl   string `json:"posterUrl"`
			Genres      []struct {
				Genre string `json:"genre"`
			} `json:"genres"`
			Countries []struct {
				Country string `json:"country"`
			} `json:"countries"`
		} `json:"films"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err == nil {
		type kpRes struct {
			idx  int
			item models.CatalogSearchResult
		}
		resCh := make(chan kpRes, len(data.Films))
		var wg sync.WaitGroup

		candidateCount := 0
		for i, film := range data.Films {
			if candidateCount >= 6 {
				break
			}
			title := film.NameRu
			if title == "" {
				title = film.NameEn
			}
			if title == "" {
				continue
			}

			cat := "movie"
			tUpper := strings.ToUpper(film.Type)
			if strings.Contains(tUpper, "SERIES") || strings.Contains(tUpper, "SHOW") {
				cat = "show"
			}

			if targetCat == "movie" && cat != "movie" {
				continue
			}
			if targetCat == "show" && cat != "show" {
				continue
			}

			candidateCount++

			genre := ""
			if len(film.Genres) > 0 {
				genre = strings.Title(film.Genres[0].Genre)
			}

			country := ""
			if len(film.Countries) > 0 {
				country = film.Countries[0].Country
			}

			duration := parseKinopoiskLength(film.FilmLength)
			poster := film.PosterUrl
			rawID := fmt.Sprintf("kp_%d", film.FilmID)
			itemID := uuid.NewSHA1(uuid.NameSpaceURL, []byte(rawID)).String()

			pubRating := ""
			if film.Rating != "" && film.Rating != "null" && !strings.Contains(film.Rating, "%") {
				pubRating = film.Rating
			}

			baseItem := models.CatalogSearchResult{
				ID:           itemID,
				Title:        title,
				Category:     cat,
				Genre:        genre,
				Duration:     duration,
				ReleaseYear:  film.Year,
				PosterURL:    poster,
				Description:  film.Description,
				PublicRating: pubRating,
				Country:      country,
			}

			wg.Add(1)
			go func(idx int, fID int, bItem models.CatalogSearchResult) {
				defer wg.Done()
				dir, cast := parser.FetchKinopoiskStaff(client, kpKey, fID)
				bItem.Director = dir
				bItem.Cast = cast
				if bItem.PublicRating == "" || bItem.Country == "" {
					if kpMedia, err := parser.FetchKinopoiskFilmByID(client, kpKey, strconv.Itoa(fID)); err == nil && kpMedia != nil {
						if bItem.PublicRating == "" && kpMedia.PublicRating != "" {
							bItem.PublicRating = kpMedia.PublicRating
						}
						if bItem.Country == "" && kpMedia.Country != "" {
							bItem.Country = kpMedia.Country
						}
					}
				}
				resCh <- kpRes{idx: idx, item: bItem}
			}(i, film.FilmID, baseItem)
		}

		wg.Wait()
		close(resCh)

		itemsMap := make(map[int]models.CatalogSearchResult)
		for res := range resCh {
			itemsMap[res.idx] = res.item
		}
		for i := 0; i < len(data.Films); i++ {
			if item, ok := itemsMap[i]; ok {
				list = append(list, item)
			}
		}
	}

	return list
}

func parseKinopoiskLength(length string) string {
	if length == "" {
		return ""
	}
	parts := strings.Split(length, ":")
	if len(parts) == 2 {
		h, _ := strconv.Atoi(parts[0])
		m, _ := strconv.Atoi(parts[1])
		total := h*60 + m
		if total > 0 {
			return fmt.Sprintf("%d мин", total)
		}
	} else if len(parts) == 3 {
		h, _ := strconv.Atoi(parts[0])
		m, _ := strconv.Atoi(parts[1])
		total := h*60 + m
		if total > 0 {
			return fmt.Sprintf("%d мин", total)
		}
	}
	if num, err := strconv.Atoi(length); err == nil && num > 0 {
		return fmt.Sprintf("%d мин", num)
	}
	return length
}


func mapCountryToFlag(country string) string {
	raw := strings.ToLower(strings.TrimSpace(country))
	if raw == "" {
		return ""
	}

	// Russian country names mapping
	countryRU := []struct {
		keys []string
		code string
	}{
		{[]string{"ссср", "советский союз"}, "USSR"},
		{[]string{"сша", "соединенные штаты", "соединённые штаты", "америка"}, "US"},
		{[]string{"великобритания", "соединенное королевство", "соединённое королевство", "англия"}, "GB"},
		{[]string{"россия", "российская федерация"}, "RU"},
		{[]string{"украина"}, "UA"},
		{[]string{"япония"}, "JP"},
		{[]string{"южная корея", "республика корея", "корея"}, "KR"},
		{[]string{"франция"}, "FR"},
		{[]string{"германия"}, "DE"},
		{[]string{"испания"}, "ES"},
		{[]string{"италия"}, "IT"},
		{[]string{"китай"}, "CN"},
		{[]string{"канада"}, "CA"},
		{[]string{"австралия"}, "AU"},
		{[]string{"индия"}, "IN"},
		{[]string{"мексика"}, "MX"},
		{[]string{"бразилия"}, "BR"},
		{[]string{"ирландия"}, "IE"},
		{[]string{"швеция"}, "SE"},
		{[]string{"дания"}, "DK"},
		{[]string{"норвегия"}, "NO"},
		{[]string{"финляндия"}, "FI"},
		{[]string{"нидерланды", "голландия"}, "NL"},
		{[]string{"бельгия"}, "BE"},
		{[]string{"швейцария"}, "CH"},
		{[]string{"австрия"}, "AT"},
		{[]string{"польша"}, "PL"},
		{[]string{"чехия", "чехословакия"}, "CZ"},
		{[]string{"турция"}, "TR"},
		{[]string{"новая зеландия"}, "NZ"},
		{[]string{"гонконг"}, "HK"},
		{[]string{"тайвань"}, "TW"},
		{[]string{"аргентина"}, "AR"},
		{[]string{"оаэ", "объединенные арабские эмираты"}, "AE"},
		{[]string{"юар", "южно-африканская республика"}, "ZA"},
		{[]string{"беларусь"}, "BY"},
		{[]string{"казахстан"}, "KZ"},
		{[]string{"португалия"}, "PT"},
		{[]string{"румыния"}, "RO"},
		{[]string{"венгрия"}, "HU"},
		{[]string{"греция"}, "GR"},
		{[]string{"израиль"}, "IL"},
		{[]string{"таиланд"}, "TH"},
		{[]string{"сингапур"}, "SG"},
		{[]string{"индонезия"}, "ID"},
		{[]string{"малайзия"}, "MY"},
		{[]string{"вьетнам"}, "VN"},
		{[]string{"колумбия"}, "CO"},
		{[]string{"чили"}, "CL"},
		{[]string{"перу"}, "PE"},
		{[]string{"египет"}, "EG"},
		{[]string{"нигерия"}, "NG"},
		{[]string{"пакистан"}, "PK"},
		{[]string{"иран"}, "IR"},
		{[]string{"алжир"}, "DZ"},
		{[]string{"марокко"}, "MA"},
		{[]string{"эфиопия"}, "ET"},
	}

	// English names / ISO codes mapping
	countryEN := []struct {
		keys []string
		code string
	}{
		{[]string{"ussr", "ussr_flag", "soviet union", "su", "suhh"}, "USSR"},
		{[]string{"usa", "us", "united states", "united states of america", "america"}, "US"},
		{[]string{"gb", "uk", "united kingdom", "great britain", "england", "britain"}, "GB"},
		{[]string{"ru", "rus", "russia", "russian federation"}, "RU"},
		{[]string{"ua", "ukr", "ukraine"}, "UA"},
		{[]string{"jp", "jpn", "japan"}, "JP"},
		{[]string{"kr", "kor", "south korea", "korea"}, "KR"},
		{[]string{"fr", "fra", "france"}, "FR"},
		{[]string{"de", "deu", "germany"}, "DE"},
		{[]string{"es", "esp", "spain"}, "ES"},
		{[]string{"it", "ita", "italy"}, "IT"},
		{[]string{"cn", "chn", "china"}, "CN"},
		{[]string{"ca", "can", "canada"}, "CA"},
		{[]string{"au", "aus", "australia"}, "AU"},
		{[]string{"in", "ind", "india"}, "IN"},
		{[]string{"mx", "mex", "mexico"}, "MX"},
		{[]string{"br", "bra", "brazil"}, "BR"},
		{[]string{"ie", "irl", "ireland"}, "IE"},
		{[]string{"se", "swe", "sweden"}, "SE"},
		{[]string{"dk", "dnk", "denmark"}, "DK"},
		{[]string{"no", "nor", "norway"}, "NO"},
		{[]string{"fi", "fin", "finland"}, "FI"},
		{[]string{"nl", "nld", "netherlands", "holland"}, "NL"},
		{[]string{"be", "bel", "belgium"}, "BE"},
		{[]string{"ch", "che", "switzerland"}, "CH"},
		{[]string{"at", "aut", "austria"}, "AT"},
		{[]string{"pl", "pol", "poland"}, "PL"},
		{[]string{"cz", "cze", "czech republic", "czechia"}, "CZ"},
		{[]string{"tr", "tur", "turkey"}, "TR"},
		{[]string{"nz", "nzl", "new zealand"}, "NZ"},
		{[]string{"hk", "hkg", "hong kong"}, "HK"},
		{[]string{"tw", "twn", "taiwan"}, "TW"},
		{[]string{"ar", "arg", "argentina"}, "AR"},
		{[]string{"ae", "uae", "united arab emirates"}, "AE"},
		{[]string{"za", "rsa", "south africa"}, "ZA"},
		{[]string{"by", "blr", "belarus"}, "BY"},
		{[]string{"kz", "kaz", "kazakhstan"}, "KZ"},
		{[]string{"pt", "prt", "portugal"}, "PT"},
		{[]string{"ro", "rou", "romania"}, "RO"},
		{[]string{"hu", "hun", "hungary"}, "HU"},
		{[]string{"gr", "grc", "greece"}, "GR"},
		{[]string{"il", "isr", "israel"}, "IL"},
		{[]string{"th", "tha", "thailand"}, "TH"},
		{[]string{"sg", "sgp", "singapore"}, "SG"},
		{[]string{"id", "idn", "indonesia"}, "ID"},
		{[]string{"my", "mys", "malaysia"}, "MY"},
		{[]string{"vn", "vnm", "vietnam"}, "VN"},
		{[]string{"co", "col", "colombia"}, "CO"},
		{[]string{"cl", "chl", "chile"}, "CL"},
		{[]string{"pe", "per", "peru"}, "PE"},
		{[]string{"eg", "egy", "egypt"}, "EG"},
		{[]string{"ng", "nga", "nigeria"}, "NG"},
		{[]string{"pk", "pak", "pakistan"}, "PK"},
		{[]string{"ir", "iri", "iran"}, "IR"},
		{[]string{"dz", "dza", "algeria"}, "DZ"},
		{[]string{"ma", "mar", "morocco"}, "MA"},
		{[]string{"et", "eth", "ethiopia"}, "ET"},
	}

	parts := strings.FieldsFunc(raw, func(r rune) bool {
		return r == ',' || r == '/'
	})
	for i, p := range parts {
		parts[i] = strings.TrimSpace(p)
	}

	// Check Russian names (substring match)
	for _, item := range countryRU {
		for _, key := range item.keys {
			if strings.Contains(raw, key) {
				return item.code
			}
		}
	}

	// Exact match English names/codes
	for _, item := range countryEN {
		for _, p := range parts {
			for _, k := range item.keys {
				if p == k {
					return item.code
				}
			}
		}
	}

	// Substring match for longer English keys
	for _, item := range countryEN {
		for _, key := range item.keys {
			if len(key) > 2 && strings.Contains(raw, key) {
				return item.code
			}
		}
	}

	return country
}

func (h *Handler) GetPoster(w http.ResponseWriter, r *http.Request) {
	itemID := chi.URLParam(r, "id")
	if itemID == "" {
		http.Error(w, "Missing id", http.StatusBadRequest)
		return
	}

	var posterURL string
	err := h.DB.Pool.QueryRow(r.Context(), "SELECT poster_url FROM items WHERE id = $1", itemID).Scan(&posterURL)
	if err != nil {
		http.Error(w, "Not found", http.StatusNotFound)
		return
	}

	if strings.HasPrefix(posterURL, "data:image/") {
		parts := strings.SplitN(posterURL, ",", 2)
		if len(parts) == 2 {
			contentType := "image/jpeg"
			if strings.Contains(parts[0], "png") {
				contentType = "image/png"
			} else if strings.Contains(parts[0], "webp") {
				contentType = "image/webp"
			}

			data, err := base64.StdEncoding.DecodeString(parts[1])
			if err == nil && len(data) > 0 {
				w.Header().Set("Content-Type", contentType)
				w.Header().Set("Cache-Control", "public, max-age=31536000")
				w.Write(data)
				return
			}
		}
	}

	if posterURL != "" && strings.HasPrefix(posterURL, "http") {
		http.Redirect(w, r, posterURL, http.StatusFound)
		return
	}

	http.Error(w, "No poster", http.StatusNotFound)
}
