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

	"lista-backend/pkg/youtube"
)

type ExtractedMedia struct {
	Title       string `json:"title"`
	Category    string `json:"category"` // "movie" or "show"
	Genre       string `json:"genre"`
	Duration    string `json:"duration"`
	ReleaseYear string `json:"release_year"`
	PosterURL   string `json:"poster_url"`
	Description string `json:"description"`
	Director    string `json:"director"`
	Cast        string `json:"cast"` // 1-4 main actors
	Author      string `json:"author,omitempty"`
	ISBN        string `json:"isbn,omitempty"`
	YoutubeURL  string `json:"youtube_url"`
	SourceURL   string `json:"source_url"`
}

const defaultTMDbKey = "b5f8997a3cfc68383f7a40b3c6628b03"

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
		tmdbKey = defaultTMDbKey
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
		if tmdbMedia, err := fetchTMDbByExternalID(client, tmdbKey, imdbID); err == nil && tmdbMedia != nil && tmdbMedia.Title != "" {
			enrichYouTubeTrailer(youtubeKey, tmdbMedia)
			tmdbMedia.PosterURL = OptimizePosterURL(client, tmdbMedia.PosterURL)
			return tmdbMedia, nil
		}
	}

	// 2. Check if TMDb URL
	if matches := tmdbIDRegex.FindStringSubmatch(rawURL); len(matches) > 2 {
		mediaType := matches[1] // "movie" or "tv"
		tmdbID := matches[2]
		if tmdbMedia, err := fetchTMDbDetails(client, tmdbKey, tmdbID, mediaType); err == nil && tmdbMedia != nil && tmdbMedia.Title != "" {
			enrichYouTubeTrailer(youtubeKey, tmdbMedia)
			tmdbMedia.PosterURL = OptimizePosterURL(client, tmdbMedia.PosterURL)
			return tmdbMedia, nil
		}
	}

	// 3. OpenGraph & JSON-LD Web Scraper (Kinopoisk, Netflix, Apple TV, Wikipedia, pirate sites, etc.)
	scrapedMedia, err := scrapeWebPage(client, rawURL)
	if err == nil && scrapedMedia != nil && scrapedMedia.Title != "" {
		media = scrapedMedia
	}

	// Clean up title for searching
	cleanedTitle := cleanTitle(media.Title)
	if cleanedTitle != "" {
		media.Title = cleanedTitle
	}

	// Detect Category from URL, Title, and HTML body
	if isSeriesKeywords(rawURL) || isSeriesKeywords(media.Title) || isSeriesKeywords(media.Description) {
		media.Category = "show"
	}

	// 4. TMDb Search Fallback: Query TMDb search API with clean title & year
	if media.Title != "" {
		if enriched, err := searchTMDbByTitle(client, tmdbKey, media.Title, media.ReleaseYear); err == nil && enriched != nil && enriched.Title != "" {
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
		}
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

// TMDb API Integration
func FetchTMDbByExternalID(client *http.Client, tmdbKey string, externalID string) (*ExtractedMedia, error) {
	return fetchTMDbByExternalID(client, tmdbKey, externalID)
}

func fetchTMDbByExternalID(client *http.Client, tmdbKey string, externalID string) (*ExtractedMedia, error) {
	findURL := fmt.Sprintf(
		"https://api.themoviedb.org/3/find/%s?api_key=%s&external_source=imdb_id&language=ru-RU",
		externalID, tmdbKey,
	)

	req, err := http.NewRequest("GET", findURL, nil)
	if err != nil {
		return nil, err
	}

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
		return fetchTMDbDetails(client, tmdbKey, strconv.Itoa(res.MovieResults[0].ID), "movie")
	}
	if len(res.TVResults) > 0 {
		return fetchTMDbDetails(client, tmdbKey, strconv.Itoa(res.TVResults[0].ID), "tv")
	}

	return nil, fmt.Errorf("no TMDb match found for %s", externalID)
}

func FetchTMDbDetails(client *http.Client, tmdbKey string, tmdbID string, mediaType string) (*ExtractedMedia, error) {
	return fetchTMDbDetails(client, tmdbKey, tmdbID, mediaType)
}

func fetchTMDbDetails(client *http.Client, tmdbKey string, tmdbID string, mediaType string) (*ExtractedMedia, error) {
	detailsURL := fmt.Sprintf(
		"https://api.themoviedb.org/3/%s/%s?api_key=%s&language=ru-RU&append_to_response=credits,videos",
		mediaType, tmdbID, tmdbKey,
	)

	req, err := http.NewRequest("GET", detailsURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("TMDb status %d", resp.StatusCode)
	}

	var data struct {
		Title        string `json:"title"`
		Name         string `json:"name"`
		Overview     string `json:"overview"`
		PosterPath   string `json:"poster_path"`
		ReleaseDate  string `json:"release_date"`
		FirstAirDate string `json:"first_air_date"`
		Runtime      int    `json:"runtime"`
		EpisodeRun   []int  `json:"episode_run_time"`
		Genres       []struct {
			Name string `json:"name"`
		} `json:"genres"`
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

	// Director
	for _, c := range data.Credits.Crew {
		if c.Job == "Director" {
			media.Director = c.Name
			break
		}
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
			media.YoutubeURL = "https://www.youtube.com/watch?v=" + v.Key
			break
		}
	}

	return media, nil
}

func searchTMDbByTitle(client *http.Client, tmdbKey string, title string, year string) (*ExtractedMedia, error) {
	queryURL := fmt.Sprintf(
		"https://api.themoviedb.org/3/search/multi?api_key=%s&language=ru-RU&query=%s",
		tmdbKey, url.QueryEscape(title),
	)

	req, err := http.NewRequest("GET", queryURL, nil)
	if err != nil {
		return nil, err
	}

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
			ID        int    `json:"id"`
			MediaType string `json:"media_type"`
		} `json:"results"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&searchRes); err != nil {
		return nil, err
	}

	for _, item := range searchRes.Results {
		if item.MediaType == "movie" || item.MediaType == "tv" {
			return fetchTMDbDetails(client, tmdbKey, strconv.Itoa(item.ID), item.MediaType)
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
		NameRu       string `json:"nameRu"`
		NameEn       string `json:"nameEn"`
		NameOriginal string `json:"nameOriginal"`
		Type         string `json:"type"`
		Year         int    `json:"year"`
		FilmLength   int    `json:"filmLength"`
		Description  string `json:"description"`
		PosterUrl    string `json:"posterUrl"`
		Genres       []struct {
			Genre string `json:"genre"`
		} `json:"genres"`
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

	director, cast := FetchKinopoiskStaff(client, kpKey, filmID)

	return &ExtractedMedia{
		Title:       title,
		Category:    cat,
		ReleaseYear: yearStr,
		Duration:    durationStr,
		Genre:       genreStr,
		PosterURL:   film.PosterUrl,
		Description: film.Description,
		Director:    director,
		Cast:        cast,
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
