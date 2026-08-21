package parser

import (
	"bytes"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"image"
	"image/color"
	"image/draw"
	_ "image/gif"
	"image/jpeg"
	_ "image/png"
	_ "golang.org/x/image/webp"
	"io"
	"net/http"
	"net/url"
	"os"
	"regexp"
	"strconv"
	"strings"
	"time"
	"unicode"

	"lista-backend/pkg/models"
	"lista-backend/pkg/youtube"
)

type ExtractedMedia struct {
	Title        string `json:"title"`
	Category     string `json:"category"` // "movie" or "show"
	Genre        string `json:"genre"`
	Duration     string `json:"duration"`
	ReleaseYear  string `json:"release_year"`
	PosterURL    string `json:"poster_url"`
	Description  string `json:"description"`
	Director     string `json:"director"`
	Cast         string `json:"cast"` // 1-4 main actors
	Author       string `json:"author,omitempty"`
	ISBN         string `json:"isbn,omitempty"`
	PublicRating string `json:"public_rating,omitempty"`
	Country      string `json:"country,omitempty"`
	YoutubeURL   string `json:"youtube_url"`
	SourceURL    string `json:"source_url"`
}

var (
	urlRegex        = regexp.MustCompile(`https?://[^\s<">]+`)
	imdbIDRegex     = regexp.MustCompile(`(tt\d{6,10})`)
	tmdbIDRegex     = regexp.MustCompile(`themoviedb\.org/(movie|tv)/(\d+)`)
	yearRegex       = regexp.MustCompile(`\b(19\d\d|20\d\d)\b`)
	ogTagRegex      = regexp.MustCompile(`(?i)<meta\s+(?:property|name)=["'](?:og:|twitter:)?([^"']+)["']\s+content=["']([^"']*)["']`)
	ogTagRegex2     = regexp.MustCompile(`(?i)<meta\s+content=["']([^"']*)["']\s+(?:property|name)=["'](?:og:|twitter:)?([^"']+)["']`)
	scriptLDJson    = regexp.MustCompile(`(?s)<script\s+type=["']application/ld\+json["']\s*>(.*?)</script>`)
	isoDurationRegex = regexp.MustCompile(`(?i)PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?`)
	minDurationRegex = regexp.MustCompile(`(?i)(\d+)\s*(?:мин|минут|minutes|min)\b`)
	hrsDurationRegex = regexp.MustCompile(`(?i)(\d+)\s*(?:ч|час|часа|часов|h|hrs?)\.?\s*(\d+)?\s*(?:мин|минут|m)?`)
	timeColonRegex   = regexp.MustCompile(`\b(\d{1,2}):(\d{2})(?::(\d{2}))?\b`)
	kinopoiskURLRegex = regexp.MustCompile(`(?i)kinopoisk\.ru/(?:film|series)/(?:[a-zA-Z0-9_-]+-)?(\d+)`)
)

// ExtractFirstURL extracts the first HTTP/HTTPS URL from a text message
func ExtractFirstURL(text string) string {
	loc := urlRegex.FindString(text)
	if loc != "" {
		return strings.TrimRight(loc, ".,);]}>")
	}
	return ""
}

// ParseMediaURL attempts to extract rich metadata from a URL using TMDb API, Kinopoisk API, OpenGraph, JSON-LD, and YouTube
func ParseMediaURL(rawURL string, tmdbKey string, youtubeKey string, kinopoiskKey ...string) (*ExtractedMedia, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return nil, fmt.Errorf("empty URL")
	}

	if strings.TrimSpace(tmdbKey) == "" {
		// Proceed without TMDB if key is empty
		tmdbKey = ""
	}

	media := &ExtractedMedia{
		Category:  "movie",
		SourceURL: rawURL,
	}

	client := &http.Client{Timeout: 10 * time.Second}

	// 0a. Check if Google Books URL
	if strings.Contains(strings.ToLower(rawURL), "google.") && strings.Contains(strings.ToLower(rawURL), "books") {
		if gbMedia, err := ParseGoogleBooksURL(client, rawURL); err == nil && gbMedia != nil && gbMedia.Title != "" {
			return gbMedia, nil
		}
	}

	// 0b. Check if Flibusta URL
	if strings.Contains(strings.ToLower(rawURL), "flibusta") {
		if flMedia, err := ParseFlibustaURL(client, rawURL); err == nil && flMedia != nil && flMedia.Title != "" {
			return flMedia, nil
		}
	}

	// 0c. Check if Kinopoisk URL
	if matches := kinopoiskURLRegex.FindStringSubmatch(rawURL); len(matches) > 1 {
		kpID := matches[1]
		kpKey := ""
		if len(kinopoiskKey) > 0 {
			kpKey = kinopoiskKey[0]
		}
		if kpKey == "" {
			kpKey = os.Getenv("KINOPOISK_API_KEY")
		}
		if kpKey != "" {
			if kpMedia, err := FetchKinopoiskFilmByID(client, kpKey, kpID); err == nil && kpMedia != nil && kpMedia.Title != "" {
				kpMedia.SourceURL = rawURL
				enrichYouTubeTrailer(youtubeKey, kpMedia)
				return kpMedia, nil
			}
		}
	}

	// 1. Check if IMDb ID is in URL
	if matches := imdbIDRegex.FindStringSubmatch(rawURL); len(matches) > 1 {
		imdbID := matches[1]
		if tmdbMedia, err := fetchTMDbByExternalID(client, tmdbKey, imdbID, ""); err == nil && tmdbMedia != nil && tmdbMedia.Title != "" {
			enrichYouTubeTrailer(youtubeKey, tmdbMedia)
			tmdbMedia.PosterURL = OptimizePosterURL(client, tmdbMedia.PosterURL)
			return tmdbMedia, nil
		}
	}

	// 2. Check if TMDb URL
	if matches := tmdbIDRegex.FindStringSubmatch(rawURL); len(matches) > 2 {
		mediaType := matches[1] // "movie" or "tv"
		tmdbID := matches[2]
		if tmdbMedia, err := fetchTMDbDetails(client, tmdbKey, tmdbID, mediaType, ""); err == nil && tmdbMedia != nil && tmdbMedia.Title != "" {
			enrichYouTubeTrailer(youtubeKey, tmdbMedia)
			tmdbMedia.PosterURL = OptimizePosterURL(client, tmdbMedia.PosterURL)
			return tmdbMedia, nil
		}
	}

	// 3. OpenGraph & JSON-LD Web Scraper (Kinopoisk, Netflix, Apple TV, Wikipedia, pirate sites, book stores etc.)
	scrapedMedia, err := scrapeWebPage(client, rawURL)
	if err == nil && scrapedMedia != nil && scrapedMedia.Title != "" {
		media = scrapedMedia
	}

	// Clean up title and detect category
	if media.Category == "book" || isBookSiteOrKeywords(rawURL, media.Title, media.Description, "") {
		media.Category = "book"
		cTitle, cAuthor, cISBN := cleanBookTitle(media.Title, "")
		if cTitle != "" {
			media.Title = cTitle
		}
		if media.Author == "" && cAuthor != "" {
			media.Author = cAuthor
		}
		if media.ISBN == "" && cISBN != "" {
			media.ISBN = cISBN
		}
	} else {
		if media.ReleaseYear == "" {
			yearMatch := regexp.MustCompile(`\(\s*((?:19|20)\d\d)\s*\)`).FindStringSubmatch(media.Title)
			if len(yearMatch) > 1 {
				media.ReleaseYear = yearMatch[1]
			}
		}

		cleanedTitle := cleanTitle(media.Title)
		if cleanedTitle != "" {
			media.Title = cleanedTitle
		}

		if isSeriesKeywords(rawURL) || isSeriesKeywords(media.Title) || isSeriesKeywords(media.Description) {
			media.Category = "show"
		}
	}

	// 4a. TMDb Search Fallback: Query TMDb search API ONLY for movies/shows
	if media.Category != "book" && media.Title != "" {
		targetLang := DetectTargetLanguage(media.Title, "")
		if enriched, err := searchTMDbByTitle(client, tmdbKey, media.Title, media.ReleaseYear, targetLang); err == nil && enriched != nil && enriched.Title != "" {
			if enriched.PosterURL != "" {
				media.PosterURL = enriched.PosterURL
			}
			if enriched.Description != "" && len(enriched.Description) > len(media.Description) {
				media.Description = enriched.Description
			}
			if enriched.Duration != "" {
				media.Duration = enriched.Duration
			}
			if enriched.Director != "" {
				media.Director = enriched.Director
			}
			if enriched.Cast != "" {
				media.Cast = enriched.Cast
			}
			if enriched.Genre != "" {
				media.Genre = enriched.Genre
			}
			if enriched.ReleaseYear != "" {
				media.ReleaseYear = enriched.ReleaseYear
			}
			if enriched.Category != "" {
				media.Category = enriched.Category
			}
			if enriched.YoutubeURL != "" {
				media.YoutubeURL = enriched.YoutubeURL
			}
		}
	}

	// 4b. Book Search Fallback: Query Google Books / MultiSource for books
	if media.Category == "book" && media.Title != "" {
		var bookRef []models.CatalogSearchResult
		if media.ISBN != "" {
			bookRef, _ = SearchGoogleBooks(media.ISBN)
		}
		if len(bookRef) == 0 {
			bookRef = SearchBooksMultiSource(media.Title)
		}
		if len(bookRef) > 0 {
			best := bookRef[0]
			if media.Author == "" && best.Author != "" {
				media.Author = best.Author
			}
			if media.ISBN == "" && best.ISBN != "" {
				media.ISBN = best.ISBN
			}
			if media.PosterURL == "" && best.PosterURL != "" {
				media.PosterURL = best.PosterURL
			}
			if media.Description == "" && best.Description != "" {
				media.Description = best.Description
			}
			if media.ReleaseYear == "" && best.ReleaseYear != "" {
				media.ReleaseYear = best.ReleaseYear
			}
		}
	}

	if media.Title == "" {
		return nil, fmt.Errorf("could not extract media metadata from URL")
	}

	// Clean genre to strictly take the first genre if multiple exist
	media.Genre = cleanFirstGenre(media.Genre)

	// 5. YouTube trailer enrichment
	enrichYouTubeTrailer(youtubeKey, media)

	// 6. Optimize and compress poster image to <= 50KB Data URL
	media.PosterURL = OptimizePosterURL(client, media.PosterURL)

	return media, nil
}

func cleanFirstGenre(genreStr string) string {
	if genreStr == "" {
		return ""
	}
	parts := strings.FieldsFunc(genreStr, func(r rune) bool {
		return r == ',' || r == '/' || r == ';' || r == '|'
	})
	if len(parts) > 0 {
		return strings.TrimSpace(parts[0])
	}
	return strings.TrimSpace(genreStr)
}

func isSeriesKeywords(str string) bool {
	s := strings.ToLower(str)
	keywords := []string{
		"сериал", "сезоны", "серия", "серии", "сезон", "tv_show", "tvseries", "tvepisode",
		"series", "season", "episodes", "anime", "аниме", "дорама", "dorama",
	}
	for _, kw := range keywords {
		if strings.Contains(s, kw) {
			return true
		}
	}
	return false
}

func cleanTitle(t string) string {
	t = strings.TrimSpace(t)
	if t == "" {
		return ""
	}

	// Remove common site suffix & garbage patterns
	suffixes := []string{
		"— Кинопоиск", "- Кинопоиск", "| Кинопоиск",
		"— Netflix", "- Netflix", "| Netflix",
		"— Википедия", "- Википедия", "| Википедия",
		"— HDrezka", "- HDrezka", "| HDrezka",
		"— Kinogo", "- Kinogo", "| Kinogo",
		"— Lordfilm", "- Lordfilm", "| Lordfilm",
		"— Кинобейс", "- Кинобейс", "| Кинобейс",
		" (фильм)", " (сериал)", " (TV series)", " (Movie)",
	}
	for _, s := range suffixes {
		if idx := strings.Index(t, s); idx > 0 {
			t = t[:idx]
		}
	}

	// Remove year in parentheses e.g. (2026) or (1994)
	t = regexp.MustCompile(`\(\s*(?:19|20)\d\d\s*\)`).ReplaceAllString(t, "")

	// Remove Russian noise phrases for streaming sites
	noiseRegex := regexp.MustCompile(`(?i)(?:смотреть\s+онлайн|смотреть\s+бесплатно|бесплатно\s+в|в\s+хорошем\s+качестве|в\s+hd|hd\s+1080p?|hd\s+720p?|4k|все\s+серии\s+подряд|все\s+серии|все\s+сезоны|\d+(?:-\d+)?\s*(?:сезон|сезоны|серия|серии)|фильм|сериал|смотреть|онлайн|бесплатно)`)
	t = noiseRegex.ReplaceAllString(t, "")

	// Remove any trailing or empty parentheses
	t = regexp.MustCompile(`\(\s*\)`).ReplaceAllString(t, "")
	t = regexp.MustCompile(`\s+`).ReplaceAllString(t, " ")
	t = strings.Trim(t, " ()[]-—|/\\:;,.")

	return strings.TrimSpace(t)
}

func parseDurationString(raw string) string {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return ""
	}

	// 1. ISO 8601 Duration (e.g. PT169M, PT2H49M, PT1H)
	if matches := isoDurationRegex.FindStringSubmatch(raw); len(matches) > 0 && (matches[1] != "" || matches[2] != "") {
		var totalMin int
		if matches[1] != "" {
			h, _ := strconv.Atoi(matches[1])
			totalMin += h * 60
		}
		if matches[2] != "" {
			m, _ := strconv.Atoi(matches[2])
			totalMin += m
		}
		if totalMin > 0 {
			return fmt.Sprintf("%d мин", totalMin)
		}
	}

	// 2. Russian & English Hours + Min (e.g. 1 час, 1 ч, 1ч, 1h, 2 ч 49 мин, 1 час 30 минут)
	if matches := hrsDurationRegex.FindStringSubmatch(raw); len(matches) > 1 {
		h, _ := strconv.Atoi(matches[1])
		m := 0
		if len(matches) > 2 && matches[2] != "" {
			m, _ = strconv.Atoi(matches[2])
		}
		totalMin := h*60 + m
		if totalMin > 0 {
			return fmt.Sprintf("%d мин", totalMin)
		}
	}

	// 3. Minutes match (e.g. 169 мин, 60 мин)
	if matches := minDurationRegex.FindStringSubmatch(raw); len(matches) > 1 {
		if m, err := strconv.Atoi(matches[1]); err == nil && m > 0 {
			return fmt.Sprintf("%d мин", m)
		}
	}

	// 4. Time format (e.g. 02:49:00 or 1:49)
	if matches := timeColonRegex.FindStringSubmatch(raw); len(matches) > 2 {
		h, _ := strconv.Atoi(matches[1])
		m, _ := strconv.Atoi(matches[2])
		totalMin := h*60 + m
		if totalMin > 0 {
			return fmt.Sprintf("%d мин", totalMin)
		}
	}

	// 5. Bare number fallback (e.g. "60" -> "60 мин")
	if m, err := strconv.Atoi(raw); err == nil && m > 0 {
		return fmt.Sprintf("%d мин", m)
	}

	return raw
}

func enrichYouTubeTrailer(youtubeKey string, media *ExtractedMedia) {
	if media.YoutubeURL == "" && media.Title != "" {
		if ytURL, err := youtube.SearchYouTube(youtubeKey, media.Title, media.Category); err == nil && ytURL != "" {
			media.YoutubeURL = ytURL
		}
	}
}

// Scrape HTML page for OpenGraph & JSON-LD metadata
func scrapeWebPage(client *http.Client, pageURL string) (*ExtractedMedia, error) {
	req, err := http.NewRequest("GET", pageURL, nil)
	if err != nil {
		return nil, err
	}

	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept-Language", "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("HTTP status %d", resp.StatusCode)
	}

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 3*1024*1024)) // 3MB max
	if err != nil {
		return nil, err
	}
	html := string(bodyBytes)

	media := &ExtractedMedia{
		Category:  "movie",
		SourceURL: pageURL,
	}

	// 1. Extract OpenGraph tags
	ogMap := make(map[string]string)
	for _, m := range ogTagRegex.FindAllStringSubmatch(html, -1) {
		if len(m) > 2 {
			ogMap[strings.ToLower(m[1])] = m[2]
		}
	}
	for _, m := range ogTagRegex2.FindAllStringSubmatch(html, -1) {
		if len(m) > 2 {
			ogMap[strings.ToLower(m[2])] = m[1]
		}
	}

	if title, ok := ogMap["title"]; ok {
		media.Title = title
	}
	if image, ok := ogMap["image"]; ok {
		media.PosterURL = resolveURL(pageURL, image)
	}
	if desc, ok := ogMap["description"]; ok {
		media.Description = desc
	}
	if ogType, ok := ogMap["type"]; ok {
		if strings.Contains(ogType, "tv_show") || strings.Contains(ogType, "episode") || strings.Contains(ogType, "series") {
			media.Category = "show"
		} else if strings.Contains(ogType, "book") {
			media.Category = "book"
		}
	}
	if author, ok := ogMap["book:author"]; ok && media.Author == "" {
		media.Author = author
	}
	if author, ok := ogMap["author"]; ok && media.Author == "" {
		media.Author = author
	}
	if isbn, ok := ogMap["book:isbn"]; ok && media.ISBN == "" {
		media.ISBN = isbn
	}
	if isbn, ok := ogMap["isbn"]; ok && media.ISBN == "" {
		media.ISBN = isbn
	}

	// 2. Extract JSON-LD structured data
	ldMatches := scriptLDJson.FindAllStringSubmatch(html, -1)
	for _, m := range ldMatches {
		if len(m) > 1 {
			var ldData map[string]interface{}
			if err := json.Unmarshal([]byte(m[1]), &ldData); err == nil {
				parseJSONLD(ldData, media, pageURL)
			}
		}
	}

	// Check if book site or keywords
	if isBookSiteOrKeywords(pageURL, media.Title, media.Description, html) {
		media.Category = "book"
	}

	if media.Category == "book" {
		cTitle, cAuthor, cISBN := cleanBookTitle(media.Title, html)
		if cTitle != "" {
			media.Title = cTitle
		}
		if media.Author == "" && cAuthor != "" {
			media.Author = cAuthor
		}
		if media.ISBN == "" && cISBN != "" {
			media.ISBN = cISBN
		}
	}

	// Fallback HTML Scraper for Book Author
	if media.Author == "" && media.Category == "book" {
		authorRegex := regexp.MustCompile(`(?i)(?:itemprop=["']author["']|class=["'][^"']*author[^"']*["'])[^>]*>(.*?)</`)
		if m := authorRegex.FindStringSubmatch(html); len(m) > 1 {
			media.Author = stripHTML(m[1])
		}
	}

	// 3. Fallback HTML Scrapers for image, duration, genre if still empty
	if media.PosterURL == "" {
		imgRegex := regexp.MustCompile(`(?i)<img[^>]+(?:class|id)=["'][^"']*(?:poster|cover|thumb)[^"']*["'][^>]+src=["']([^"']+)["']`)
		if m := imgRegex.FindStringSubmatch(html); len(m) > 1 {
			media.PosterURL = resolveURL(pageURL, m[1])
		}
	}

	if media.Duration == "" {
		durAttrRegex := regexp.MustCompile(`(?i)(?:itemprop=["']duration["']|class=["'][^"']*duration[^"']*["'])[^>]*>(.*?)</`)
		if m := durAttrRegex.FindStringSubmatch(html); len(m) > 1 {
			media.Duration = parseDurationString(m[1])
		}
	}

	// 4. Fallback HTML Microdata Scraper for Director & Cast (Kinobase, Kinopoisk, Lordfilm, etc.)
	if media.Director == "" {
		directorSectionRegex := regexp.MustCompile(`(?i)(?:itemprop=["']director["']|<div[^>]*class=["'][^"']*key[^"']*["'][^>]*>\s*Режисс[ёе]р\s*</div>)[^>]*>(.*?)(?:</div>\s*</div>|</td>|</tr|itemprop=["']actor|$)`)
		if m := directorSectionRegex.FindStringSubmatch(html); len(m) > 1 {
			nameTagRegex := regexp.MustCompile(`(?i)<[^>]+itemprop=["']name["'][^>]*>([^<]+)</`)
			names := nameTagRegex.FindAllStringSubmatch(m[1], -1)
			var directorList []string
			for _, n := range names {
				if len(n) > 1 && strings.TrimSpace(n[1]) != "" {
					directorList = append(directorList, strings.TrimSpace(n[1]))
				}
			}
			if len(directorList) > 0 {
				media.Director = strings.Join(directorList, ", ")
			}
		}
	}

	if media.Cast == "" {
		actorSectionRegex := regexp.MustCompile(`(?i)(?:itemprop=["']actor["']|<div[^>]*class=["'][^"']*key[^"']*["'][^>]*>\s*Акте?ры\s*</div>)[^>]*>(.*?)(?:</div>\s*</div>|</td>|</tr|itemprop=["']description|$)`)
		if m := actorSectionRegex.FindStringSubmatch(html); len(m) > 1 {
			nameTagRegex := regexp.MustCompile(`(?i)<[^>]+itemprop=["']name["'][^>]*>([^<]+)</`)
			names := nameTagRegex.FindAllStringSubmatch(m[1], -1)
			var castList []string
			for _, n := range names {
				if len(castList) >= 6 {
					break
				}
				if len(n) > 1 && strings.TrimSpace(n[1]) != "" {
					castList = append(castList, strings.TrimSpace(n[1]))
				}
			}
			if len(castList) > 0 {
				media.Cast = strings.Join(castList, ", ")
			}
		}
	}

	// Extract year from title if not set
	if media.ReleaseYear == "" && media.Title != "" {
		if yMatch := yearRegex.FindStringSubmatch(media.Title); len(yMatch) > 1 {
			media.ReleaseYear = yMatch[1]
		}
	}

	return media, nil
}

func resolveURL(baseURLStr string, targetURLStr string) string {
	targetURLStr = strings.TrimSpace(targetURLStr)
	if targetURLStr == "" {
		return ""
	}
	if strings.HasPrefix(targetURLStr, "http://") || strings.HasPrefix(targetURLStr, "https://") || strings.HasPrefix(targetURLStr, "data:image/") {
		return targetURLStr
	}

	base, err := url.Parse(baseURLStr)
	if err != nil {
		return targetURLStr
	}
	ref, err := url.Parse(targetURLStr)
	if err != nil {
		return targetURLStr
	}

	return base.ResolveReference(ref).String()
}

func parseJSONLD(data map[string]interface{}, media *ExtractedMedia, baseURL string) {
	tp, _ := data["@type"].(string)
	if tp == "Movie" || tp == "TVSeries" || tp == "TVEpisode" {
		if tp == "TVSeries" || tp == "TVEpisode" {
			media.Category = "show"
		}
		if name, ok := data["name"].(string); ok && name != "" {
			media.Title = name
		}
		if image, ok := data["image"].(string); ok && image != "" {
			media.PosterURL = resolveURL(baseURL, image)
		}
		if desc, ok := data["description"].(string); ok && desc != "" {
			media.Description = desc
		}
		if date, ok := data["datePublished"].(string); ok && date != "" {
			if len(date) >= 4 {
				media.ReleaseYear = date[:4]
			}
		}
		if dur, ok := data["duration"].(string); ok && dur != "" {
			media.Duration = parseDurationString(dur)
		}
		if genreObj, ok := data["genre"]; ok {
			switch g := genreObj.(type) {
			case string:
				media.Genre = cleanFirstGenre(g)
			case []interface{}:
				var genres []string
				for _, item := range g {
					if str, ok := item.(string); ok {
						genres = append(genres, str)
					}
				}
				if len(genres) > 0 {
					media.Genre = cleanFirstGenre(genres[0])
				}
			}
		}

		// Director
		if directorObj, ok := data["director"]; ok {
			media.Director = extractPersonNames(directorObj, 1)
		}
		// Actors (limit 6)
		if actorObj, ok := data["actor"]; ok {
			media.Cast = extractPersonNames(actorObj, 6)
		}
	} else if tp == "Book" || tp == "Product" {
		media.Category = "book"
		if name, ok := data["name"].(string); ok && name != "" {
			media.Title = name
		}
		if image, ok := data["image"].(string); ok && image != "" {
			media.PosterURL = resolveURL(baseURL, image)
		}
		if desc, ok := data["description"].(string); ok && desc != "" {
			media.Description = desc
		}
		if isbn, ok := data["isbn"].(string); ok && isbn != "" {
			media.ISBN = isbn
		}
		if authorObj, ok := data["author"]; ok {
			media.Author = extractPersonNames(authorObj, 3)
		}
		if brandObj, ok := data["brand"]; ok && media.Author == "" {
			media.Author = extractPersonNames(brandObj, 3)
		}
	}

	if aggRating, ok := data["aggregateRating"].(map[string]interface{}); ok {
		if rVal, ok := aggRating["ratingValue"]; ok {
			switch v := rVal.(type) {
			case float64:
				if v > 0 {
					media.PublicRating = fmt.Sprintf("%.1f", v)
				}
			case string:
				if v != "" {
					media.PublicRating = strings.TrimSpace(v)
				}
			}
		}
	}
}

func extractPersonNames(obj interface{}, maxCount int) string {
	var names []string

	switch v := obj.(type) {
	case map[string]interface{}:
		if name, ok := v["name"].(string); ok && name != "" {
			names = append(names, name)
		}
	case []interface{}:
		for _, item := range v {
			if len(names) >= maxCount {
				break
			}
			if itemMap, ok := item.(map[string]interface{}); ok {
				if name, ok := itemMap["name"].(string); ok && name != "" {
					names = append(names, name)
				}
			}
		}
	}

	return strings.Join(names, ", ")
}

// DetectTargetLanguage determines the target locale (uk-UA, ru-RU, es-ES, en-US) based on query content and user language code.
func DetectTargetLanguage(query string, userLangCode string) string {
	uLang := strings.ToLower(strings.TrimSpace(userLangCode))

	// 1. Check for specific Ukrainian letters (і, ї, є, ґ in any case)
	for _, r := range query {
		switch r {
		case 'і', 'І', 'ї', 'Ї', 'є', 'Є', 'ґ', 'Ґ':
			return "uk-UA"
		}
	}

	// 2. Check for general Cyrillic
	hasCyrillic := false
	for _, r := range query {
		if unicode.Is(unicode.Cyrillic, r) {
			hasCyrillic = true
			break
		}
	}

	if hasCyrillic {
		if uLang == "uk" || strings.HasPrefix(uLang, "uk") || uLang == "ua" {
			return "uk-UA"
		}
		return "ru-RU"
	}

	// 3. No Cyrillic found -> Latin / non-Cyrillic
	switch {
	case strings.HasPrefix(uLang, "es"):
		return "es-ES"
	case strings.HasPrefix(uLang, "uk") || uLang == "ua":
		return "uk-UA"
	case strings.HasPrefix(uLang, "ru"):
		return "ru-RU"
	case strings.HasPrefix(uLang, "en"):
		return "en-US"
	default:
		return "en-US"
	}
}

// TMDb API Integration
func FetchTMDbByExternalID(client *http.Client, tmdbKey string, externalID string, targetLang string) (*ExtractedMedia, error) {
	return fetchTMDbByExternalID(client, tmdbKey, externalID, targetLang)
}

func fetchTMDbByExternalID(client *http.Client, tmdbKey string, externalID string, targetLang string) (*ExtractedMedia, error) {
	if targetLang == "" {
		targetLang = "ru-RU"
	}
	findURL := fmt.Sprintf(
		"https://api.themoviedb.org/3/find/%s?external_source=imdb_id&language=%s",
		externalID, url.QueryEscape(targetLang),
	)
	if len(tmdbKey) < 50 {
		findURL += "&api_key=" + tmdbKey
	}

	req, err := http.NewRequest("GET", findURL, nil)
	if err != nil {
		return nil, err
	}
	if len(tmdbKey) >= 50 {
		req.Header.Set("Authorization", "Bearer "+tmdbKey)
	}
	req.Header.Set("accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("TMDb status %d", resp.StatusCode)
	}

	var res struct {
		MovieResults []struct {
			ID int `json:"id"`
		} `json:"movie_results"`
		TVResults []struct {
			ID int `json:"id"`
		} `json:"tv_results"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		return nil, err
	}

	if len(res.MovieResults) > 0 {
		return fetchTMDbDetails(client, tmdbKey, strconv.Itoa(res.MovieResults[0].ID), "movie", targetLang)
	}
	if len(res.TVResults) > 0 {
		return fetchTMDbDetails(client, tmdbKey, strconv.Itoa(res.TVResults[0].ID), "tv", targetLang)
	}

	return nil, fmt.Errorf("no TMDb match found for %s", externalID)
}

func FetchTMDbDetails(client *http.Client, tmdbKey string, tmdbID string, mediaType string, targetLang string) (*ExtractedMedia, error) {
	return fetchTMDbDetails(client, tmdbKey, tmdbID, mediaType, targetLang)
}

func fetchTMDbDetails(client *http.Client, tmdbKey string, tmdbID string, mediaType string, targetLang string) (*ExtractedMedia, error) {
	if targetLang == "" {
		targetLang = "ru-RU"
	}
	detailsURL := fmt.Sprintf(
		"https://api.themoviedb.org/3/%s/%s?language=%s&append_to_response=credits,videos",
		mediaType, tmdbID, url.QueryEscape(targetLang),
	)
	if len(tmdbKey) < 50 {
		detailsURL += "&api_key=" + tmdbKey
	}

	req, err := http.NewRequest("GET", detailsURL, nil)
	if err != nil {
		return nil, err
	}
	if len(tmdbKey) >= 50 {
		req.Header.Set("Authorization", "Bearer "+tmdbKey)
	}
	req.Header.Set("accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("TMDb status %d", resp.StatusCode)
	}

	var data struct {
		Title        string  `json:"title"`
		Name         string  `json:"name"`
		Overview     string  `json:"overview"`
		PosterPath   string  `json:"poster_path"`
		ReleaseDate  string  `json:"release_date"`
		FirstAirDate string  `json:"first_air_date"`
		Runtime      int     `json:"runtime"`
		VoteAverage  float64 `json:"vote_average"`
		EpisodeRun   []int   `json:"episode_run_time"`
		CreatedBy    []struct {
			Name string `json:"name"`
		} `json:"created_by"`
		Genres       []struct {
			Name string `json:"name"`
		} `json:"genres"`
		ProductionCountries []struct {
			Iso31661 string `json:"iso_3166_1"`
			Name     string `json:"name"`
		} `json:"production_countries"`
		OriginCountry []string `json:"origin_country"`
		Credits struct {
			Crew []struct {
				Job  string `json:"job"`
				Name string `json:"name"`
			} `json:"crew"`
			Cast []struct {
				Name string `json:"name"`
			} `json:"cast"`
		} `json:"credits"`
		Videos struct {
			Results []struct {
				Key  string `json:"key"`
				Site string `json:"site"`
				Type string `json:"type"`
			} `json:"results"`
		} `json:"videos"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	media := &ExtractedMedia{
		Category: "movie",
	}
	if data.VoteAverage > 0 {
		media.PublicRating = fmt.Sprintf("%.1f", data.VoteAverage)
	}
	if mediaType == "tv" {
		media.Category = "show"
		media.Title = data.Name
		if len(data.FirstAirDate) >= 4 {
			media.ReleaseYear = data.FirstAirDate[:4]
		}
		if len(data.EpisodeRun) > 0 {
			media.Duration = fmt.Sprintf("%d мин", data.EpisodeRun[0])
		}
	} else {
		media.Title = data.Title
		if len(data.ReleaseDate) >= 4 {
			media.ReleaseYear = data.ReleaseDate[:4]
		}
		if data.Runtime > 0 {
			media.Duration = fmt.Sprintf("%d мин", data.Runtime)
		}
	}

	media.Description = data.Overview
	if data.PosterPath != "" {
		media.PosterURL = "https://image.tmdb.org/t/p/w500" + data.PosterPath
	}

	// Genres
	if len(data.Genres) > 0 {
		media.Genre = cleanFirstGenre(data.Genres[0].Name)
	}

	// Country of production
	if len(data.ProductionCountries) > 0 {
		if data.ProductionCountries[0].Iso31661 != "" {
			media.Country = data.ProductionCountries[0].Iso31661
		} else {
			media.Country = data.ProductionCountries[0].Name
		}
	} else if len(data.OriginCountry) > 0 {
		media.Country = data.OriginCountry[0]
	}

	// Director / Creator
	for _, c := range data.Credits.Crew {
		if c.Job == "Director" {
			media.Director = c.Name
			break
		}
	}
	if media.Director == "" && mediaType == "tv" {
		for _, c := range data.Credits.Crew {
			if c.Job == "Creator" || c.Job == "Executive Producer" {
				media.Director = c.Name
				break
			}
		}
	}
	if media.Director == "" && len(data.CreatedBy) > 0 {
		media.Director = data.CreatedBy[0].Name
	}

	// Cast (1-6 max)
	var castNames []string
	for i, c := range data.Credits.Cast {
		if i >= 6 {
			break
		}
		castNames = append(castNames, c.Name)
	}
	media.Cast = strings.Join(castNames, ", ")

	// YouTube Video / Trailer
	for _, v := range data.Videos.Results {
		if v.Site == "YouTube" && (v.Type == "Trailer" || v.Type == "Teaser") {
			candidateURL := "https://www.youtube.com/watch?v=" + v.Key
			if youtube.IsVideoEmbeddable(client, candidateURL) {
				media.YoutubeURL = candidateURL
				break
			}
		}
	}

	return media, nil
}

func searchTMDbByTitle(client *http.Client, tmdbKey string, title string, year string, targetLang string) (*ExtractedMedia, error) {
	if targetLang == "" {
		targetLang = DetectTargetLanguage(title, "")
	}
	queryURL := fmt.Sprintf(
		"https://api.themoviedb.org/3/search/multi?language=%s&query=%s",
		url.QueryEscape(targetLang),
		url.QueryEscape(title),
	)
	if len(tmdbKey) < 50 {
		queryURL += "&api_key=" + tmdbKey
	}

	req, err := http.NewRequest("GET", queryURL, nil)
	if err != nil {
		return nil, err
	}
	if len(tmdbKey) >= 50 {
		req.Header.Set("Authorization", "Bearer "+tmdbKey)
	}
	req.Header.Set("accept", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("TMDb status %d", resp.StatusCode)
	}

	var searchRes struct {
		Results []struct {
			ID           int    `json:"id"`
			MediaType    string `json:"media_type"`
			ReleaseDate  string `json:"release_date"`
			FirstAirDate string `json:"first_air_date"`
		} `json:"results"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&searchRes); err != nil {
		return nil, err
	}

	if year != "" {
		yearInt, _ := strconv.Atoi(year)
		for _, item := range searchRes.Results {
			if item.MediaType == "movie" || item.MediaType == "tv" {
				itemYear := ""
				if len(item.ReleaseDate) >= 4 {
					itemYear = item.ReleaseDate[:4]
				} else if len(item.FirstAirDate) >= 4 {
					itemYear = item.FirstAirDate[:4]
				}
				
				if itemYear == year {
					return fetchTMDbDetails(client, tmdbKey, strconv.Itoa(item.ID), item.MediaType, targetLang)
				}
				
				if itemYearInt, err := strconv.Atoi(itemYear); err == nil && yearInt > 0 {
					if itemYearInt == yearInt-1 || itemYearInt == yearInt+1 {
						return fetchTMDbDetails(client, tmdbKey, strconv.Itoa(item.ID), item.MediaType, targetLang)
					}
				}
			}
		}
		// If year is provided but no match within +/- 1 year is found, do not fall back to an arbitrary year.
		return nil, fmt.Errorf("no TMDb match found for year %s", year)
	}

	for _, item := range searchRes.Results {
		if item.MediaType == "movie" || item.MediaType == "tv" {
			return fetchTMDbDetails(client, tmdbKey, strconv.Itoa(item.ID), item.MediaType, targetLang)
		}
	}

	return nil, fmt.Errorf("no TMDb match found")
}

// OptimizePosterURL downloads, resizes, and encodes poster to JPEG <= 50KB Data URL
// OptimizePosterURL downloads, resizes, and encodes poster to JPEG <= 50KB Data URL
func OptimizePosterURL(client *http.Client, rawPosterURL string) string {
	rawPosterURL = strings.TrimSpace(rawPosterURL)
	if rawPosterURL == "" {
		return ""
	}
	if strings.HasPrefix(rawPosterURL, "data:image/") {
		if len(rawPosterURL) <= 65000 {
			return rawPosterURL
		}
		idx := strings.Index(rawPosterURL, ",")
		if idx != -1 {
			b64Data := rawPosterURL[idx+1:]
			dec, err := base64.StdEncoding.DecodeString(b64Data)
			if err == nil {
				if img, _, err := image.Decode(bytes.NewReader(dec)); err == nil {
					if compressed := compressImageToDataURL(img); compressed != "" {
						return compressed
					}
				}
			}
		}
		return rawPosterURL
	}

	if client == nil {
		client = &http.Client{Timeout: 5 * time.Second}
	}

	req, err := http.NewRequest("GET", rawPosterURL, nil)
	if err != nil {
		return rawPosterURL
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

	resp, err := client.Do(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return rawPosterURL
	}
	defer resp.Body.Close()

	imgData, err := io.ReadAll(io.LimitReader(resp.Body, 10*1024*1024)) // 10MB max
	if err != nil || len(imgData) == 0 {
		return rawPosterURL
	}

	img, _, err := image.Decode(bytes.NewReader(imgData))
	if err != nil {
		return rawPosterURL
	}

	if compressed := compressImageToDataURL(img); compressed != "" {
		return compressed
	}

	return rawPosterURL
}

func compressImageToDataURL(img image.Image) string {
	bounds := img.Bounds()
	srcW := bounds.Dx()
	srcH := bounds.Dy()
	if srcW == 0 || srcH == 0 {
		return ""
	}

	targetW := 300
	if srcW < targetW {
		targetW = srcW
	}
	targetH := (srcH * targetW) / srcW

	dst := image.NewRGBA(image.Rect(0, 0, targetW, targetH))
	// Fill background with solid dark color so transparent PNGs/WebPs don't render white/black noise
	draw.Draw(dst, dst.Bounds(), &image.Uniform{color.RGBA{18, 18, 20, 255}}, image.Point{}, draw.Src)

	for y := 0; y < targetH; y++ {
		for x := 0; x < targetW; x++ {
			srcX := bounds.Min.X + (x*srcW)/targetW
			srcY := bounds.Min.Y + (y*srcH)/targetH
			c := img.At(srcX, srcY)
			_, _, _, a := c.RGBA()
			if a > 1000 {
				dst.Set(x, y, c)
			}
		}
	}

	qualities := []int{75, 60, 45, 35}
	for _, q := range qualities {
		var buf bytes.Buffer
		if err := jpeg.Encode(&buf, dst, &jpeg.Options{Quality: q}); err == nil {
			if buf.Len() <= 51200 { // 50KB limit
				return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
			}
		}
	}

	// If still over 50KB at Q=35, scale down width to 240px
	targetW = 240
	targetH = (srcH * targetW) / srcW
	dstSmall := image.NewRGBA(image.Rect(0, 0, targetW, targetH))
	draw.Draw(dstSmall, dstSmall.Bounds(), &image.Uniform{color.RGBA{18, 18, 20, 255}}, image.Point{}, draw.Src)

	for y := 0; y < targetH; y++ {
		for x := 0; x < targetW; x++ {
			srcX := bounds.Min.X + (x*srcW)/targetW
			srcY := bounds.Min.Y + (y*srcH)/targetH
			c := img.At(srcX, srcY)
			_, _, _, a := c.RGBA()
			if a > 1000 {
				dstSmall.Set(x, y, c)
			}
		}
	}

	var buf bytes.Buffer
	if err := jpeg.Encode(&buf, dstSmall, &jpeg.Options{Quality: 60}); err == nil {
		return "data:image/jpeg;base64," + base64.StdEncoding.EncodeToString(buf.Bytes())
	}

	return ""
}

func FetchKinopoiskFilmByID(client *http.Client, kpKey string, filmIDStr string) (*ExtractedMedia, error) {
	filmID, err := strconv.Atoi(filmIDStr)
	if err != nil || filmID == 0 {
		return nil, fmt.Errorf("invalid kinopoisk id")
	}

	apiURL := fmt.Sprintf("https://kinopoiskapiunofficial.tech/api/v2.2/films/%d", filmID)
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("X-API-KEY", kpKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return nil, fmt.Errorf("kinopoisk api error")
	}
	defer resp.Body.Close()

	var film struct {
		NameRu           string  `json:"nameRu"`
		NameEn           string  `json:"nameEn"`
		NameOriginal     string  `json:"nameOriginal"`
		Type             string  `json:"type"`
		Year             int     `json:"year"`
		FilmLength       int     `json:"filmLength"`
		RatingKinopoisk  float64 `json:"ratingKinopoisk"`
		RatingImdb       float64 `json:"ratingImdb"`
		Description      string  `json:"description"`
		PosterUrl        string  `json:"posterUrl"`
		Genres           []struct {
			Genre string `json:"genre"`
		} `json:"genres"`
		Countries []struct {
			Country string `json:"country"`
		} `json:"countries"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&film); err != nil {
		return nil, err
	}

	title := film.NameRu
	if title == "" {
		title = film.NameEn
	}
	if title == "" {
		title = film.NameOriginal
	}
	if title == "" {
		return nil, fmt.Errorf("empty title")
	}

	cat := "movie"
	tUpper := strings.ToUpper(film.Type)
	if strings.Contains(tUpper, "SERIES") || strings.Contains(tUpper, "SHOW") {
		cat = "show"
	}

	yearStr := ""
	if film.Year > 0 {
		yearStr = strconv.Itoa(film.Year)
	}

	durationStr := ""
	if film.FilmLength > 0 {
		durationStr = fmt.Sprintf("%d мин", film.FilmLength)
	}

	genreStr := ""
	if len(film.Genres) > 0 {
		genreStr = strings.Title(film.Genres[0].Genre)
	}

	countryStr := ""
	if len(film.Countries) > 0 {
		countryStr = film.Countries[0].Country
	}

	pubRating := ""
	if film.RatingKinopoisk > 0 {
		pubRating = fmt.Sprintf("%.1f", film.RatingKinopoisk)
	} else if film.RatingImdb > 0 {
		pubRating = fmt.Sprintf("%.1f", film.RatingImdb)
	}

	director, cast := FetchKinopoiskStaff(client, kpKey, filmID)

	return &ExtractedMedia{
		Title:        title,
		Category:     cat,
		ReleaseYear:  yearStr,
		Duration:     durationStr,
		Genre:        genreStr,
		Country:      countryStr,
		PosterURL:    film.PosterUrl,
		Description:  film.Description,
		Director:     director,
		Cast:         cast,
		PublicRating: pubRating,
	}, nil
}

func FetchKinopoiskStaff(client *http.Client, kpKey string, filmID int) (string, string) {
	if filmID == 0 || kpKey == "" {
		return "", ""
	}
	staffURL := fmt.Sprintf("https://kinopoiskapiunofficial.tech/api/v1/staff?filmId=%d", filmID)
	req, err := http.NewRequest("GET", staffURL, nil)
	if err != nil {
		return "", ""
	}
	req.Header.Set("X-API-KEY", kpKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return "", ""
	}
	defer resp.Body.Close()

	var staffList []struct {
		NameRu        string `json:"nameRu"`
		NameEn        string `json:"nameEn"`
		ProfessionKey string `json:"professionKey"`
	}

	director := ""
	var castList []string

	if err := json.NewDecoder(resp.Body).Decode(&staffList); err == nil {
		for _, s := range staffList {
			name := s.NameRu
			if name == "" {
				name = s.NameEn
			}
			if name == "" {
				continue
			}

			if s.ProfessionKey == "DIRECTOR" && director == "" {
				director = name
			} else if s.ProfessionKey == "ACTOR" && len(castList) < 6 {
				castList = append(castList, name)
			}
		}
	}

	return director, strings.Join(castList, ", ")
}

// ParseGoogleBooksURL extracts book details from a Google Books link
func ParseGoogleBooksURL(client *http.Client, rawURL string) (*ExtractedMedia, error) {
	volumeID := ""
	u, err := url.Parse(rawURL)
	if err == nil {
		volumeID = u.Query().Get("id")
	}
	if volumeID == "" {
		re := regexp.MustCompile(`(?i)(?:id=|=|/)([a-zA-Z0-9_-]{10,12})`)
		m := re.FindStringSubmatch(rawURL)
		if len(m) > 1 {
			volumeID = m[1]
		}
	}

	if volumeID == "" {
		return nil, fmt.Errorf("volume ID not found in Google Books URL")
	}

	apiURL := fmt.Sprintf("https://www.googleapis.com/books/v1/volumes/%s", volumeID)
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "TrackListBot/1.0")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google books API returned status %d", resp.StatusCode)
	}

	var item struct {
		VolumeInfo struct {
			Title         string   `json:"title"`
			Authors       []string `json:"authors"`
			PublishedDate string   `json:"publishedDate"`
			Description   string   `json:"description"`
			PageCount     int      `json:"pageCount"`
			ImageLinks    struct {
				Thumbnail      string `json:"thumbnail"`
				SmallThumbnail string `json:"smallThumbnail"`
			} `json:"imageLinks"`
			IndustryIdentifiers []struct {
				Type       string `json:"type"`
				Identifier string `json:"identifier"`
			} `json:"industryIdentifiers"`
		} `json:"volumeInfo"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&item); err != nil {
		return nil, err
	}

	info := item.VolumeInfo
	if strings.TrimSpace(info.Title) == "" {
		return nil, fmt.Errorf("empty title in google books")
	}

	author := strings.Join(info.Authors, ", ")
	year := ""
	if len(info.PublishedDate) >= 4 {
		year = info.PublishedDate[:4]
	}

	pagesStr := ""
	if info.PageCount > 0 {
		pagesStr = strconv.Itoa(info.PageCount)
	}

	isbn := ""
	for _, id := range info.IndustryIdentifiers {
		if id.Type == "ISBN_13" || id.Type == "ISBN_10" {
			isbn = id.Identifier
			break
		}
	}

	cover := info.ImageLinks.Thumbnail
	if cover == "" {
		cover = info.ImageLinks.SmallThumbnail
	}
	if cover != "" {
		cover = strings.ReplaceAll(cover, "http://", "https://")
		cover = strings.ReplaceAll(cover, "zoom=1", "zoom=0")
		cover = strings.ReplaceAll(cover, "&edge=curl", "")
	}

	return &ExtractedMedia{
		Title:       info.Title,
		Category:    "book",
		Author:      author,
		ReleaseYear: year,
		Duration:    pagesStr,
		ISBN:        isbn,
		Description: info.Description,
		PosterURL:   OptimizePosterURL(client, cover),
		SourceURL:   rawURL,
	}, nil
}

// ParseFlibustaURL extracts book details from a Flibusta link
func ParseFlibustaURL(client *http.Client, rawURL string) (*ExtractedMedia, error) {
	req, err := http.NewRequest("GET", rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept-Language", "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7")

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("flibusta page status %d", resp.StatusCode)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, err
	}
	bodyStr := string(bodyBytes)

	title := ""
	h1Regex := regexp.MustCompile(`(?i)<h1[^>]*>(.*?)</h1>`)
	if m := h1Regex.FindStringSubmatch(bodyStr); len(m) > 1 {
		title = stripHTML(m[1])
	}
	if title == "" {
		titleRegex := regexp.MustCompile(`(?i)<title>(.*?)</title>`)
		if m := titleRegex.FindStringSubmatch(bodyStr); len(m) > 1 {
			title = stripHTML(m[1])
			if idx := strings.Index(title, "|"); idx != -1 {
				title = strings.TrimSpace(title[:idx])
			}
		}
	}

	if title == "" {
		return nil, fmt.Errorf("failed to parse title from flibusta")
	}

	author := ""
	authorRegex := regexp.MustCompile(`(?i)<a\s+href=["']/a/\d+["'][^>]*>(.*?)</a>`)
	if m := authorRegex.FindStringSubmatch(bodyStr); len(m) > 1 {
		author = stripHTML(m[1])
	}

	desc := ""
	descRegex := regexp.MustCompile(`(?s)<h2>Аннотация</h2>\s*<p>(.*?)</p>`)
	if m := descRegex.FindStringSubmatch(bodyStr); len(m) > 1 {
		desc = stripHTML(m[1])
	} else {
		desc = extractOGTag(bodyStr, "description")
	}

	coverURL := ""
	imgRegex := regexp.MustCompile(`(?i)<img[^>]+src=["'](/b/\d+/cover[^"']*)["']`)
	if m := imgRegex.FindStringSubmatch(bodyStr); len(m) > 1 {
		parsedURL, _ := url.Parse(rawURL)
		coverURL = parsedURL.Scheme + "://" + parsedURL.Host + m[1]
	} else {
		coverURL = extractOGTag(bodyStr, "image")
	}

	year := ""
	if m := yearRegex.FindStringSubmatch(bodyStr); len(m) > 1 {
		year = m[1]
	}

	return &ExtractedMedia{
		Title:       title,
		Category:    "book",
		Author:      author,
		ReleaseYear: year,
		Description: desc,
		PosterURL:   OptimizePosterURL(client, coverURL),
		SourceURL:   rawURL,
	}, nil
}

// stripHTML removes HTML tags from a string
func stripHTML(s string) string {
	re := regexp.MustCompile(`<[^>]+>`)
	s = re.ReplaceAllString(s, "")
	s = strings.ReplaceAll(s, "&amp;", "&")
	s = strings.ReplaceAll(s, "&lt;", "<")
	s = strings.ReplaceAll(s, "&gt;", ">")
	s = strings.ReplaceAll(s, "&quot;", "\"")
	s = strings.ReplaceAll(s, "&#39;", "'")
	s = strings.ReplaceAll(s, "&nbsp;", " ")
	return strings.TrimSpace(s)
}

// extractOGTag extracts the content of an Open Graph meta tag from HTML
func extractOGTag(html, property string) string {
	re := regexp.MustCompile(`(?i)<meta[^>]+property=["']og:` + regexp.QuoteMeta(property) + `["'][^>]+content=["']([^"']+)["']`)
	if m := re.FindStringSubmatch(html); len(m) > 1 {
		return strings.TrimSpace(m[1])
	}
	// Try alternate attribute order
	re2 := regexp.MustCompile(`(?i)<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:` + regexp.QuoteMeta(property) + `["']`)
	if m := re2.FindStringSubmatch(html); len(m) > 1 {
		return strings.TrimSpace(m[1])
	}
	return ""
}

func isBookSiteOrKeywords(rawURL string, title string, desc string, html string) bool {
	rawURLLower := strings.ToLower(rawURL)
	titleLower := strings.ToLower(title)
	descLower := strings.ToLower(desc)
	htmlLower := strings.ToLower(html)

	bookSites := []string{
		"book24", "yakaboo", "vivat", "labirint", "litres", "flibusta",
		"books.google", "openlibrary", "fantlab", "book", "kniga",
	}
	for _, site := range bookSites {
		if strings.Contains(rawURLLower, site) {
			return true
		}
	}

	bookKeywords := []string{
		"купити книгу", "купить книгу", "купить книжку", "купити книжку",
		"isbn", "видавництво", "издательство",
	}
	for _, kw := range bookKeywords {
		if strings.Contains(titleLower, kw) || strings.Contains(descLower, kw) || strings.Contains(htmlLower, kw) {
			return true
		}
	}

	return false
}

// cleanBookTitle cleans garbage phrases from book titles and extracts title in quotes, author, and ISBN if present
func cleanBookTitle(rawTitle string, htmlBody string) (string, string, string) {
	title := strings.TrimSpace(rawTitle)
	extractedAuthor := ""
	extractedISBN := ""

	// 1. Extract ISBN from raw title or html body
	isbnRegex := regexp.MustCompile(`(?i)(?:ISBN(?:-1[03])?:?\s*)(97[89][-\s]?[0-9][-\s]?[0-9]{2,5}[-\s]?[0-9]{2,5}[-\s]?[0-9X]|97[89][0-9]{10}|[0-9]{9}[0-9X])`)
	if m := isbnRegex.FindStringSubmatch(title); len(m) > 1 {
		extractedISBN = strings.TrimSpace(m[1])
	} else if htmlBody != "" {
		if m := isbnRegex.FindStringSubmatch(htmlBody); len(m) > 1 {
			extractedISBN = strings.TrimSpace(m[1])
		}
	}

	// 2. Extract quotes «...», "...", “...”, ‘...’
	quoteRegexes := []*regexp.Regexp{
		regexp.MustCompile(`«([^»]+)»`),
		regexp.MustCompile(`“([^”]+)”`),
		regexp.MustCompile(`"([^"]{3,100})"`),
		regexp.MustCompile(`’([^’]+)’`),
	}

	var matchTitle string
	for _, re := range quoteRegexes {
		if m := re.FindStringSubmatch(title); len(m) > 1 {
			candidate := strings.TrimSpace(m[1])
			if len(candidate) >= 2 && !strings.HasPrefix(strings.ToLower(candidate), "http") {
				matchTitle = candidate
				break
			}
		}
	}

	if matchTitle != "" {
		outside := title
		outside = strings.ReplaceAll(outside, "«"+matchTitle+"»", "")
		outside = strings.ReplaceAll(outside, "“"+matchTitle+"”", "")
		outside = strings.ReplaceAll(outside, "\""+matchTitle+"\"", "")

		outside = cleanBookNoise(outside)
		if len(outside) > 2 && len(strings.Fields(outside)) <= 4 {
			extractedAuthor = outside
		}
		title = matchTitle
	} else {
		title = cleanBookNoise(title)

		if idx := strings.Index(title, " — "); idx != -1 {
			part1 := strings.TrimSpace(title[:idx])
			part2 := strings.TrimSpace(title[idx+3:])
			if isLikelyAuthorName(part2) {
				title = part1
				extractedAuthor = part2
			} else if isLikelyAuthorName(part1) {
				title = part2
				extractedAuthor = part1
			}
		} else if idx := strings.Index(title, " - "); idx != -1 {
			part1 := strings.TrimSpace(title[:idx])
			part2 := strings.TrimSpace(title[idx+3:])
			if isLikelyAuthorName(part2) {
				title = part1
				extractedAuthor = part2
			} else if isLikelyAuthorName(part1) {
				title = part2
				extractedAuthor = part1
			}
		}
	}

	title = strings.Trim(title, " «»\"'”’()[]-—|/\\:;,.")
	return title, extractedAuthor, extractedISBN
}

func cleanBookNoise(s string) string {
	noiseSuffixes := []string{
		"|", "•", "in Ukraine", "в Києві", "в Киеве", "в Украине", "в Україні",
		"ціни", "цены", "відгуки", "отзывы", "интернет-магазин", "інтернет-магазин",
		"купити в", "купить в", "Book24", "Yakaboo", "Vivat", "Labirint", "Litres", "ЛитРес",
		"ISBN", "издательство", "видавництво", "доставка", "купить книжку", "купити книжку",
	}
	for _, suf := range noiseSuffixes {
		if idx := strings.Index(strings.ToLower(s), strings.ToLower(suf)); idx != -1 {
			s = s[:idx]
		}
	}

	prefixRegex := regexp.MustCompile(`(?i)^(?:купити\s+книгу|купить\s+книгу|купить\s+книжку|купити\s+книжку|книга|скачать\s+книгу|читать\s+онлайн)\s+`)
	s = prefixRegex.ReplaceAllString(s, "")

	s = regexp.MustCompile(`\s+`).ReplaceAllString(s, " ")
	return strings.Trim(s, " «»\"'”’()[]-—|/\\:;,.")
}

func isLikelyAuthorName(s string) bool {
	words := strings.Fields(s)
	if len(words) >= 1 && len(words) <= 3 {
		for _, w := range words {
			runes := []rune(w)
			if len(runes) > 0 && runes[0] >= 'A' && runes[0] <= 'Z' {
				return true
			}
		}
	}
	return false
}

// EnrichedDetails holds extended metadata fetched by the AI Wand button
type EnrichedDetails struct {
	// Series-specific
	Seasons       int    `json:"seasons"`
	EpisodesTotal int    `json:"episodes_total"`
	AirStatus     string `json:"air_status"`     // e.g. "Ended", "Returning Series", "Cancelled"
	EpisodesList  string `json:"episodes_list"`  // JSON array of episode objects
	// Both movies and shows
	Director   string `json:"director"`   // Director name(s)
	Cast       string `json:"cast"`       // Cleaned Cyrillic cast list comma-separated
	CastRoles  string `json:"cast_roles"`  // "Actor — Role" comma-separated, max 8
	Country    string `json:"country"`     // e.g. "RU", "US"
	Budget     string `json:"budget"`      // "$120,000,000" or empty if unknown
	Duration   string `json:"duration"`    // e.g. "45 мин"
}

// TranslateAndFillWithAI uses Fireworks AI to translate metadata into the requested language, transliterate Latin names, and fill gaps.
func TranslateAndFillWithAI(fireworksKey, lang, title, releaseYear, country, existingDirector, existingCast, existingDescription string, details *EnrichedDetails) {
	if fireworksKey == "" || details == nil {
		return
	}

	directorContext := existingDirector
	if directorContext == "" {
		directorContext = details.Director
	}

	castRolesContext := details.CastRoles
	if castRolesContext == "" && existingCast != "" {
		castRolesContext = existingCast
	}

	var prompt string
	switch lang {
	case "uk":
		prompt = fmt.Sprintf(`Ти — експерт з метаданих фільмів та серіалів. Твоє завдання — перекласти, перевірити та заповнити дані для фільму або серіалу "%s" (%s року виходу, країна: %s) українською мовою.

Контекстні дані картки:
- Назва: %s
- Рік виходу: %s
- Країна: %s
- Поточний режисер: %s
- Поточний акторський склад: %s
- Опис: %s

Правила обробки:
1. Мовний стандарт: Усі імена акторів, імена персонажів (ролей) та ім'я режисера мають бути перекладені українською мовою (строго кирилиця).
   - Якщо в іменах присутня латиниця (наприклад: 'Timur Bekmambetov', 'Christopher Nolan', 'Greg Plageman'), обов'язково транслітеруй або переклади їх на українську кирилицю ('Тимур Бекмамбетов', 'Крістофер Нолан', 'Грег Плейджман').
   - У рядках director, cast та cast_roles не допускається наявність англійських або латинських літер. Усі імена мають складатися виключно з кирилиці.
2. Режисер: Якщо в карточці вже зазначений режисер ("%s"), обов'язково збережи його в полі director. Якщо він вказаний латиницею (англійською) або російською, обов'язково переклади/транслітеруй його ім'я українською мовою (наприклад: 'Тимур Бекмамбетов', 'Крістофер Нолан'). Не замінюй відомого режисера картки на інших людей.
3. Поле cast: Сформуй чистий список акторів фільму українською мовою через кому, без латиниці та без ролей.
4. Поле cast_roles: Форматуй строго за шаблоном "Актор — Роль, Актор — Роль" (максимум до 8 пар) виключно кирилицею. Важливо! Визначити правильну роль кожного актора і прописати її навпроти актора замість слова "Роль"! Крім дійсної ролі нічого писати не потрібно, вигадувати не можна.
5. Статус: Переклади air_status українською мовою ("Завершено", "Виходить", "Скасовано").
6. Тривалість: Вкажи duration у хвилинах (наприклад: "92 хв").

Вимоги до формату відповіді:
Поверни результат виключно у форматі валідного JSON без розмітки:
{
  "director": "Ім'я Режисера",
  "cast": "Актор 1, Актор 2, Актор 3",
  "cast_roles": "Актор — Роль, Актор — Роль",
  "budget": "Бюджет",
  "air_status": "Завершено",
  "duration": "92 хв",
  "seasons": 0,
  "episodes_total": 0
}

Вхідні дані для обробки:
director: %s
cast_roles: %s
budget: %s
air_status: %s
duration: %s
seasons: %d
episodes_total: %d`, title, releaseYear, country, title, releaseYear, country, directorContext, existingCast, existingDescription, directorContext, directorContext, castRolesContext, details.Budget, details.AirStatus, details.Duration, details.Seasons, details.EpisodesTotal)

	case "es":
		prompt = fmt.Sprintf(`Eres un experto en metadatos de películas y series. Tu tarea es traducir y completar los datos para la película o serie "%s" (año %s, país: %s) en español.

Contexto de la tarjeta:
- Título: %s
- Año: %s
- País: %s
- Director actual: %s
- Reparto actual: %s
- Descripción: %s

Reglas obligatorias:
1. Traduce todos los nombres de actores, personajes/roles y del director al español. No dejes nombres en inglés si hay traducción o transcripción.
2. Si ya se conoce el director ("%s"), consérvalo en el campo director (traduce/transcribe si es necesario). No lo reemplaces por otra persona.
3. Formato de cast_roles: Actor — Rol, Actor — Rol (máximo 8 pares). ¡Importante! Determina el rol real de cada actor y escríbelo junto al actor en lugar de la palabra "Rol". No inventes roles ni agregues texto extra.
4. Formato de cast: lista de actores separados por comas.
5. Traduce air_status al español ("Finalizada", "En emisión", "Cancelada").
6. La duración duration debe estar en minutos (ejemplo: "92 min").

Formato de respuesta:
Devuelve únicamente un objeto JSON válido sin markdown:
{
  "director": "Nombre del director",
  "cast": "Actor 1, Actor 2, Actor 3",
  "cast_roles": "Actor — Rol, Actor — Rol",
  "budget": "Presupuesto",
  "air_status": "Finalizada",
  "duration": "92 min",
  "seasons": 0,
  "episodes_total": 0
}

Datos de entrada:
director: %s
cast_roles: %s
budget: %s
air_status: %s
duration: %s
seasons: %d
episodes_total: %d`, title, releaseYear, country, title, releaseYear, country, directorContext, existingCast, existingDescription, directorContext, directorContext, castRolesContext, details.Budget, details.AirStatus, details.Duration, details.Seasons, details.EpisodesTotal)

	case "en":
		prompt = fmt.Sprintf(`You are a movie and TV show metadata expert. Your task is to complete and clean metadata for "%s" (%s release year, country: %s) in English.

Card Context:
- Title: %s
- Year: %s
- Country: %s
- Current Director: %s
- Current Cast: %s
- Description: %s

Mandatory Rules:
1. All actor names, character/role names, and director names must be in English / Latin script.
2. If the director is known ("%s"), preserve it in the director field (transliterate to Latin/English if in Cyrillic). Do not replace the director with other people.
3. Format cast_roles as: Actor — Role, Actor — Role (up to 8 pairs). Important! Determine the actual role/character for each actor and write it next to the actor instead of the literal word "Role". Do not fabricate roles.
4. Format cast as: comma-separated list of actors.
5. Translate air_status to English ("Ended", "Returning Series", "Canceled").
6. Set duration in minutes (e.g. "92 min").

Response Format:
Return only a valid JSON object without markdown:
{
  "director": "Director Name",
  "cast": "Actor 1, Actor 2, Actor 3",
  "cast_roles": "Actor — Role, Actor — Role",
  "budget": "Budget",
  "air_status": "Ended",
  "duration": "92 min",
  "seasons": 0,
  "episodes_total": 0
}

Input Data:
director: %s
cast_roles: %s
budget: %s
air_status: %s
duration: %s
seasons: %d
episodes_total: %d`, title, releaseYear, country, title, releaseYear, country, directorContext, existingCast, existingDescription, directorContext, directorContext, castRolesContext, details.Budget, details.AirStatus, details.Duration, details.Seasons, details.EpisodesTotal)

	default: // "ru" or any other
		prompt = fmt.Sprintf(`Ты — эксперт по метаданным фильмов и сериалов. Твоя задача — проверить, дополнить и перевести данные для фильма или сериала "%s" (%s года выхода, страна: %s) на русский язык.

Контекстные данные карточки:
- Название: %s
- Год выхода: %s
- Страна: %s
- Текущий режиссер: %s
- Текущий список актеров: %s
- Описание: %s

Правила обработки:
1. Языковой стандарт: Все имена актёров, имена персонажей (ролей) и имя режиссёра должны быть переведены на русский язык (строго кириллица).
   - Если в списке актёров или режиссёров присутствуют имена на латинице (например: 'Timur Bekmambetov' -> 'Тимур Бекмамбетов', 'Christopher Nolan' -> 'Кристофер Нолан', 'Greg Plageman' -> 'Грег Плейджман'), выполни их точную транслитерацию или перевод на русский язык.
   - В строках director, cast и cast_roles не допускается наличие английских букв или латиницы. Все имена должны состоять исключительно из кириллицы.
2. Режиссер: Если в карточке указан текущий режиссер ("%s"), обязательно сохрани его в поле director. Если он указан на латинице (английском), обязательно выполни его перевод/транслитерацию на русский язык (кириллицу). Не заменяй известного режиссера карточки на других людей.
3. Поле cast: Сформируй чистый список актёров фильма на русском языке через запятую, без латиницы и без указания ролей (например: "Иван Забелин, Дарья Пугачева, Петр Рыков, Лукерья Ильяшенко").
4. Поле cast_roles: Форматируй строго по шаблону "Актёр — Роль, Актёр — Роль" (максимум до 8 пар) на русском языке. Важно! Определить правильную роль каждого актёра и прописать её напротив актёра вместо слова "Роль"! Кроме действительной роли ничего писать не нужно, выдумывать нельзя.
5. Статус: Переведи значение air_status на русский язык (например: "Завершён", "Выходит", "Отменён").
6. Длительность: Укажи значение duration в минутах (например: "92 мин"). Если поле пустое или содержит "-", укажи среднее время серии или фильма в минутах.

Требования к формату ответа:
Верни результат исключительно в формате валидного JSON без использования markdown-разметки (без тегов кода):
{
  "director": "Александр Селиверстов",
  "cast": "Иван Забелин, Дарья Пугачева, Петр Рыков, Лукерья Ильяшенко, Валерия Кожевникова, Светлана Степанковская",
  "cast_roles": "Иван Забелин — Роль, Дарья Пугачева — Роль",
  "budget": "",
  "air_status": "Завершён",
  "duration": "92 мин",
  "seasons": 0,
  "episodes_total": 0
}

Входные данные для обработки:
director: %s
cast_roles: %s
budget: %s
air_status: %s
duration: %s
seasons: %d
episodes_total: %d`, title, releaseYear, country, title, releaseYear, country, directorContext, existingCast, existingDescription, directorContext, directorContext, castRolesContext, details.Budget, details.AirStatus, details.Duration, details.Seasons, details.EpisodesTotal)
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
		fmt.Printf("[FireworksAI] Error creating request: %v\n", err)
		return
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+fireworksKey)

	client := &http.Client{Timeout: 15 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		fmt.Printf("[FireworksAI] Request failed: %v\n", err)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		fmt.Printf("[FireworksAI] Bad status %d: %s\n", resp.StatusCode, string(respBody))
		return
	}

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
			Director      string `json:"director"`
			Cast          string `json:"cast"`
			CastRoles     string `json:"cast_roles"`
			Budget        string `json:"budget"`
			AirStatus     string `json:"air_status"`
			Duration      string `json:"duration"`
			Country       string `json:"country"`
			Seasons       int    `json:"seasons"`
			EpisodesTotal int    `json:"episodes_total"`
		}
		if err := json.Unmarshal([]byte(rawContent), &parsed); err == nil {
			if parsed.Director != "" {
				details.Director = parsed.Director
			}
			if parsed.Cast != "" {
				details.Cast = parsed.Cast
			}
			if parsed.CastRoles != "" {
				details.CastRoles = parsed.CastRoles
			}
			if parsed.Budget != "" {
				details.Budget = parsed.Budget
			}
			if parsed.AirStatus != "" {
				details.AirStatus = parsed.AirStatus
			}
			if parsed.Duration != "" {
				details.Duration = parsed.Duration
			}
			if parsed.Country != "" && details.Country == "" {
				details.Country = parsed.Country
			}
			if parsed.Seasons > 0 && details.Seasons == 0 {
				details.Seasons = parsed.Seasons
			}
			if parsed.EpisodesTotal > 0 && details.EpisodesTotal == 0 {
				details.EpisodesTotal = parsed.EpisodesTotal
			}
		}
	}
}

// EpisodeInfo represents one episode in the serialised list
type EpisodeInfo struct {
	Season      int    `json:"s"`
	Episode     int    `json:"e"`
	Title       string `json:"title"`
	AirDate     string `json:"air_date"`
	Overview    string `json:"overview"`
	RuntimeMin  int    `json:"runtime"`
}

// ResolveOriginalTitleWithAI determines the original / English title of a movie or TV show using AI when localized title is not found in TMDB
func ResolveOriginalTitleWithAI(fireworksKey, title, year, director, cast, description string) string {
	if fireworksKey == "" || strings.TrimSpace(title) == "" {
		return ""
	}

	prompt := fmt.Sprintf(`You are a film and TV database expert.
Given this movie or TV show:
- Title: %s
- Year: %s
- Director: %s
- Cast: %s
- Description: %s

Identify the official original or international English title (e.g. for "Казнить нельзя помиловать" 2026 with Chris Pratt directed by Timur Bekmambetov, the original title is "Mercy").
Return only a valid JSON object without markdown:
{
  "original_title": "Mercy"
}
If the title is already in its original language or no different title exists, return empty string in original_title.`, title, year, director, cast, description)

	reqBodyMap := map[string]interface{}{
		"model": "accounts/fireworks/models/minimax-m3",
		"messages": []map[string]string{
			{"role": "user", "content": prompt},
		},
		"response_format": map[string]string{"type": "json_object"},
		"temperature":     0.1,
		"max_tokens":      256,
	}

	bodyBytes, _ := json.Marshal(reqBodyMap)
	req, err := http.NewRequest("POST", "https://api.fireworks.ai/inference/v1/chat/completions", bytes.NewBuffer(bodyBytes))
	if err != nil {
		return ""
	}

	req.Header.Set("Accept", "application/json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", "Bearer "+fireworksKey)

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return ""
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
		var parsed struct {
			OriginalTitle string `json:"original_title"`
		}
		if err := json.Unmarshal([]byte(strings.TrimSpace(fireworksResp.Choices[0].Message.Content)), &parsed); err == nil {
			return strings.TrimSpace(parsed.OriginalTitle)
		}
	}
	return ""
}

// FetchEnrichedDetails searches TMDB by title+year, then pulls extended fields.
// Returns nil if nothing useful was found.
func FetchEnrichedDetails(tmdbKey string, title string, year string, category string, lang string, fireworksKey string, existingDirector string, existingCast string, existingDescription string) *EnrichedDetails {
	if tmdbKey == "" || strings.TrimSpace(title) == "" {
		return nil
	}

	langParam := "ru-RU"
	switch lang {
	case "en":
		langParam = "en-US"
	case "es":
		langParam = "es-ES"
	case "uk":
		langParam = "uk-UA"
	}

	client := &http.Client{Timeout: 15 * time.Second}

	// Determine media type
	mediaTypeHint := "movie"
	catLower := strings.ToLower(strings.TrimSpace(category))
	if strings.Contains(catLower, "show") || strings.Contains(catLower, "series") ||
		strings.Contains(catLower, "сериал") || strings.Contains(catLower, "сериалы") {
		mediaTypeHint = "tv"
	}

	// --- Step 1: search TMDB for the TMDB ID ---
	tmdbID, mediaType := searchTMDbForID(client, tmdbKey, title, year, mediaTypeHint, langParam)
	if tmdbID == 0 && fireworksKey != "" {
		origTitle := ResolveOriginalTitleWithAI(fireworksKey, title, year, existingDirector, existingCast, existingDescription)
		if origTitle != "" && !strings.EqualFold(origTitle, title) {
			tmdbID, mediaType = searchTMDbForID(client, tmdbKey, origTitle, year, mediaTypeHint, langParam)
		}
	}
	if tmdbID == 0 {
		return nil
	}

	result := &EnrichedDetails{}

	// --- Step 2: fetch detailed data ---
	detailURL := fmt.Sprintf(
		"https://api.themoviedb.org/3/%s/%d?language=%s&append_to_response=credits,content_ratings,release_dates",
		mediaType, tmdbID, langParam,
	)
	if len(tmdbKey) < 50 {
		detailURL += "&api_key=" + tmdbKey
	}
	req, err := http.NewRequest("GET", detailURL, nil)
	if err != nil {
		return nil
	}
	if len(tmdbKey) >= 50 {
		req.Header.Set("Authorization", "Bearer "+tmdbKey)
	}
	req.Header.Set("accept", "application/json")
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return nil
	}
	defer resp.Body.Close()

	var detail struct {
		Status           string  `json:"status"`
		NumberOfSeasons  int     `json:"number_of_seasons"`
		NumberOfEpisodes int     `json:"number_of_episodes"`
		Budget           int64   `json:"budget"`
		Runtime          int     `json:"runtime"`
		EpisodeRunTime   []int   `json:"episode_run_time"`
		CreatedBy []struct {
			Name string `json:"name"`
		} `json:"created_by"`
		ProductionCountries []struct {
			Iso31661 string `json:"iso_3166_1"`
			Name     string `json:"name"`
		} `json:"production_countries"`
		OriginCountry []string `json:"origin_country"`
		Credits struct {
			Cast []struct {
				Name      string `json:"name"`
				Character string `json:"character"`
				Order     int    `json:"order"`
			} `json:"cast"`
			Crew []struct {
				Name string `json:"name"`
				Job  string `json:"job"`
			} `json:"crew"`
		} `json:"credits"`
		ContentRatings struct {
			Results []contentRatingResult `json:"results"`
		} `json:"content_ratings"`
		ReleaseDates struct {
			Results []releaseDateResult `json:"results"`
		} `json:"release_dates"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&detail); err != nil {
		return nil
	}

	// Air status
	if detail.Status != "" {
		result.AirStatus = mapTMDbStatus(detail.Status)
	}

	// Country of production
	if len(detail.ProductionCountries) > 0 {
		if detail.ProductionCountries[0].Iso31661 != "" {
			result.Country = detail.ProductionCountries[0].Iso31661
		} else {
			result.Country = detail.ProductionCountries[0].Name
		}
	} else if len(detail.OriginCountry) > 0 {
		result.Country = detail.OriginCountry[0]
	}

	// Seasons / episodes (TV only)
	if mediaType == "tv" {
		if detail.NumberOfSeasons > 0 {
			result.Seasons = detail.NumberOfSeasons
		}
		if detail.NumberOfEpisodes > 0 {
			result.EpisodesTotal = detail.NumberOfEpisodes
		}
		if len(detail.EpisodeRunTime) > 0 && detail.EpisodeRunTime[0] > 0 {
			result.Duration = fmt.Sprintf("%d мин", detail.EpisodeRunTime[0])
		} else if detail.Runtime > 0 {
			if result.EpisodesTotal > 0 && detail.Runtime > 300 {
				result.Duration = fmt.Sprintf("%d мин", detail.Runtime/result.EpisodesTotal)
			} else {
				result.Duration = fmt.Sprintf("%d мин", detail.Runtime)
			}
		}
	} else if mediaType == "movie" {
		if detail.Runtime > 0 {
			result.Duration = fmt.Sprintf("%d мин", detail.Runtime)
		}
	}

	// Director from crew or created_by (support multiple directors)
	var directors []string
	seenDir := make(map[string]bool)
	for _, c := range detail.Credits.Crew {
		if strings.EqualFold(c.Job, "Director") && c.Name != "" {
			nameClean := strings.TrimSpace(c.Name)
			if !seenDir[nameClean] {
				seenDir[nameClean] = true
				directors = append(directors, nameClean)
			}
		}
	}
	if len(directors) == 0 {
		for _, creator := range detail.CreatedBy {
			if creator.Name != "" {
				nameClean := strings.TrimSpace(creator.Name)
				if !seenDir[nameClean] {
					seenDir[nameClean] = true
					directors = append(directors, nameClean)
				}
			}
		}
	}
	if len(directors) > 0 {
		result.Director = strings.Join(directors, ", ")
	}

	// Budget (movies)
	if detail.Budget > 0 {
		result.Budget = formatBudget(detail.Budget)
	}

	// Cast with characters (max 8)
	var roleLines []string
	for i, c := range detail.Credits.Cast {
		if i >= 8 {
			break
		}
		name := strings.TrimSpace(c.Name)
		char := strings.TrimSpace(c.Character)
		if name == "" {
			continue
		}
		if char != "" && char != name {
			roleLines = append(roleLines, name+" — "+char)
		} else {
			roleLines = append(roleLines, name)
		}
	}
	result.CastRoles = strings.Join(roleLines, ", ")

	// --- Step 3: fetch episodes for TV shows ---
	if mediaType == "tv" && result.Seasons > 0 {
		var allEpisodes []EpisodeInfo
		for s := 1; s <= result.Seasons; s++ {
			eps := fetchTMDbSeasonEpisodes(client, tmdbKey, tmdbID, s)
			allEpisodes = append(allEpisodes, eps...)
		}
		if len(allEpisodes) > 0 {
			if b, err := json.Marshal(allEpisodes); err == nil {
				result.EpisodesList = string(b)
			}
			if result.Duration == "" {
				tot := 0
				cnt := 0
				for _, ep := range allEpisodes {
					if ep.RuntimeMin > 0 {
						tot += ep.RuntimeMin
						cnt++
					}
				}
				if cnt > 0 {
					result.Duration = fmt.Sprintf("%d мин", tot/cnt)
				}
			}
		}
	}

	return result
}

func normalizeTitleForMatch(s string) string {
	s = strings.ToLower(strings.TrimSpace(s))
	s = strings.ReplaceAll(s, "ё", "е")
	reYear := regexp.MustCompile(`[\(\[\{]\s*\d{4}\s*[\)\]\}]`)
	s = reYear.ReplaceAllString(s, "")
	rePunct := regexp.MustCompile(`[^\p{L}\p{N}\s]`)
	s = rePunct.ReplaceAllString(s, "")
	return strings.Join(strings.Fields(s), " ")
}

// searchTMDbForID finds a TMDB ID by title+year with strict title and year matching, returns (id, mediaType).
func searchTMDbForID(client *http.Client, tmdbKey string, title string, year string, hint string, langParam string) (int, string) {
	normQuery := normalizeTitleForMatch(title)
	if normQuery == "" {
		return 0, ""
	}

	queryURL := fmt.Sprintf(
		"https://api.themoviedb.org/3/search/multi?language=%s&query=%s",
		langParam, url.QueryEscape(title),
	)
	if len(tmdbKey) < 50 {
		queryURL += "&api_key=" + tmdbKey
	}
	req, err := http.NewRequest("GET", queryURL, nil)
	if err != nil {
		return 0, ""
	}
	if len(tmdbKey) >= 50 {
		req.Header.Set("Authorization", "Bearer "+tmdbKey)
	}
	req.Header.Set("accept", "application/json")
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return 0, ""
	}
	defer resp.Body.Close()

	var searchRes struct {
		Results []struct {
			ID            int      `json:"id"`
			MediaType     string   `json:"media_type"`
			Title         string   `json:"title"`
			OriginalTitle string   `json:"original_title"`
			Name          string   `json:"name"`
			OriginalName  string   `json:"original_name"`
			ReleaseDate   string   `json:"release_date"`
			FirstAirDate  string   `json:"first_air_date"`
			Popularity    float64  `json:"popularity"`
			VoteCount     int      `json:"vote_count"`
			OriginCountry []string `json:"origin_country"`
		} `json:"results"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&searchRes); err != nil {
		return 0, ""
	}

	var bestID int
	var bestType string
	var maxScore float64 = -1.0

	yearInt, _ := strconv.Atoi(year)
	// Pass: strict title match, year match (if year is specified), and media type hint
	for _, item := range searchRes.Results {
		if item.MediaType != "movie" && item.MediaType != "tv" {
			continue
		}

		normT1 := normalizeTitleForMatch(item.Title)
		normT2 := normalizeTitleForMatch(item.OriginalTitle)
		normT3 := normalizeTitleForMatch(item.Name)
		normT4 := normalizeTitleForMatch(item.OriginalName)

		titleMatches := (normT1 != "" && normT1 == normQuery) ||
			(normT2 != "" && normT2 == normQuery) ||
			(normT3 != "" && normT3 == normQuery) ||
			(normT4 != "" && normT4 == normQuery)

		if !titleMatches {
			continue
		}

		itemYear := ""
		if len(item.ReleaseDate) >= 4 {
			itemYear = item.ReleaseDate[:4]
		} else if len(item.FirstAirDate) >= 4 {
			itemYear = item.FirstAirDate[:4]
		}
		itemYearInt, _ := strconv.Atoi(itemYear)
		yearMatch := yearInt == 0 || (itemYearInt > 0 && abs(itemYearInt-yearInt) <= 1)
		typeMatch := hint == "" || item.MediaType == hint
		if yearMatch && typeMatch {
			score := item.Popularity + float64(item.VoteCount)
			if score > maxScore {
				maxScore = score
				bestID = item.ID
				bestType = item.MediaType
			}
		}
	}
	if bestID > 0 {
		return bestID, bestType
	}

	// Only if year was NOT provided (yearInt == 0), allow matching without year constraint
	if yearInt == 0 {
		for _, item := range searchRes.Results {
			if item.MediaType != "movie" && item.MediaType != "tv" {
				continue
			}

			normT1 := normalizeTitleForMatch(item.Title)
			normT2 := normalizeTitleForMatch(item.OriginalTitle)
			normT3 := normalizeTitleForMatch(item.Name)
			normT4 := normalizeTitleForMatch(item.OriginalName)

			titleMatches := (normT1 != "" && normT1 == normQuery) ||
				(normT2 != "" && normT2 == normQuery) ||
				(normT3 != "" && normT3 == normQuery) ||
				(normT4 != "" && normT4 == normQuery)

			if !titleMatches {
				continue
			}

			typeMatch := hint == "" || item.MediaType == hint
			if typeMatch {
				score := item.Popularity + float64(item.VoteCount)
				if score > maxScore {
					maxScore = score
					bestID = item.ID
					bestType = item.MediaType
				}
			}
		}
		if bestID > 0 {
			return bestID, bestType
		}
	}

	return 0, ""
}

func abs(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

// fetchTMDbSeasonEpisodes fetches episode list for a given season.
func fetchTMDbSeasonEpisodes(client *http.Client, tmdbKey string, showID int, season int) []EpisodeInfo {
	epURL := fmt.Sprintf(
		"https://api.themoviedb.org/3/tv/%d/season/%d?language=ru-RU",
		showID, season,
	)
	if len(tmdbKey) < 50 {
		epURL += "&api_key=" + tmdbKey
	}
	req, err := http.NewRequest("GET", epURL, nil)
	if err != nil {
		return nil
	}
	if len(tmdbKey) >= 50 {
		req.Header.Set("Authorization", "Bearer "+tmdbKey)
	}
	req.Header.Set("accept", "application/json")
	resp, err := client.Do(req)
	if err != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return nil
	}
	defer resp.Body.Close()

	var seasonData struct {
		Episodes []struct {
			EpisodeNumber int    `json:"episode_number"`
			Name          string `json:"name"`
			Overview      string `json:"overview"`
			AirDate       string `json:"air_date"`
			Runtime       int    `json:"runtime"`
		} `json:"episodes"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&seasonData); err != nil {
		return nil
	}

	var result []EpisodeInfo
	for _, ep := range seasonData.Episodes {
		overview := ep.Overview
		if len([]rune(overview)) > 200 {
			runes := []rune(overview)
			overview = string(runes[:200]) + "…"
		}
		result = append(result, EpisodeInfo{
			Season:     season,
			Episode:    ep.EpisodeNumber,
			Title:      ep.Name,
			AirDate:    ep.AirDate,
			Overview:   overview,
			RuntimeMin: ep.Runtime,
		})
	}
	return result
}

func mapTMDbStatus(s string) string {
	switch strings.ToLower(strings.TrimSpace(s)) {
	case "ended":
		return "Завершён"
	case "returning series":
		return "Выходит"
	case "canceled", "cancelled":
		return "Отменён"
	case "in production":
		return "В производстве"
	case "planned":
		return "Планируется"
	case "pilot":
		return "Пилот"
	case "released":
		return "Вышел"
	default:
		return s
	}
}

func formatBudget(b int64) string {
	if b <= 0 {
		return ""
	}
	s := fmt.Sprintf("%d", b)
	// Insert commas every 3 digits from right
	var result []byte
	for i, c := range s {
		if i > 0 && (len(s)-i)%3 == 0 {
			result = append(result, ',')
		}
		result = append(result, byte(c))
	}
	return "$" + string(result)
}

type contentRatingResult struct {
	ISO3166 string `json:"iso_3166_1"`
	Rating  string `json:"rating"`
}

type releaseDateResult struct {
	ISO3166      string `json:"iso_3166_1"`
	ReleaseDates []struct {
		Certification string `json:"certification"`
	} `json:"release_dates"`
}

func extractAgeRating(tvRatings []contentRatingResult, movieDates []releaseDateResult, mediaType string) string {
	if mediaType == "tv" {
		// TV: prefer RU, then US
		for _, r := range tvRatings {
			if r.ISO3166 == "RU" && r.Rating != "" {
				return normalizeRating(r.Rating)
			}
		}
		for _, r := range tvRatings {
			if r.ISO3166 == "US" && r.Rating != "" {
				return normalizeRating(r.Rating)
			}
		}
	} else {
		// Movies: prefer RU, then US
		for _, r := range movieDates {
			if r.ISO3166 == "RU" {
				for _, rd := range r.ReleaseDates {
					if rd.Certification != "" {
						return normalizeRating(rd.Certification)
					}
				}
			}
		}
		for _, r := range movieDates {
			if r.ISO3166 == "US" {
				for _, rd := range r.ReleaseDates {
					if rd.Certification != "" {
						return normalizeRating(rd.Certification)
					}
				}
			}
		}
	}
	return ""
}

func normalizeRating(r string) string {
	r = strings.TrimSpace(r)
	switch strings.ToUpper(r) {
	case "G", "TP", "E":
		return "0+"
	case "PG", "6", "6+", "TV-G", "TV-Y", "TV-Y7":
		return "6+"
	case "PG-13", "12", "12+", "12A", "TV-PG":
		return "12+"
	case "TV-14", "14", "14+":
		return "14+"
	case "R", "16", "16+", "TV-MA", "NC-17", "18", "18+", "M":
		return "18+"
	default:
		if r != "" {
			return r
		}
		return ""
	}
}

