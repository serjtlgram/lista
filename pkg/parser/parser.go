package parser

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
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
	YoutubeURL  string `json:"youtube_url"`
	SourceURL   string `json:"source_url"`
}

var (
	urlRegex     = regexp.MustCompile(`https?://[^\s<">]+`)
	imdbIDRegex  = regexp.MustCompile(`(tt\d{6,10})`)
	tmdbIDRegex  = regexp.MustCompile(`themoviedb\.org/(movie|tv)/(\d+)`)
	yearRegex    = regexp.MustCompile(`\b(19\d\d|20\d\d)\b`)
	ogTagRegex   = regexp.MustCompile(`(?i)<meta\s+(?:property|name)=["'](?:og:|twitter:)?([^"']+)["']\s+content=["']([^"']*)["']`)
	ogTagRegex2  = regexp.MustCompile(`(?i)<meta\s+content=["']([^"']*)["']\s+(?:property|name)=["'](?:og:|twitter:)?([^"']+)["']`)
	scriptLDJson = regexp.MustCompile(`(?s)<script\s+type=["']application/ld\+json["']\s*>(.*?)</script>`)
)

// ExtractFirstURL extracts the first HTTP/HTTPS URL from a text message
func ExtractFirstURL(text string) string {
	loc := urlRegex.FindString(text)
	if loc != "" {
		return strings.TrimRight(loc, ".,);]}>")
	}
	return ""
}

// ParseMediaURL attempts to extract rich metadata from a URL using TMDb API, OpenGraph, JSON-LD, and YouTube
func ParseMediaURL(rawURL string, tmdbKey string, youtubeKey string) (*ExtractedMedia, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return nil, fmt.Errorf("empty URL")
	}

	media := &ExtractedMedia{
		Category:  "movie",
		SourceURL: rawURL,
	}

	client := &http.Client{Timeout: 10 * time.Second}

	// 1. Check if IMDb ID is in URL
	if matches := imdbIDRegex.FindStringSubmatch(rawURL); len(matches) > 1 {
		imdbID := matches[1]
		if tmdbKey != "" {
			if tmdbMedia, err := fetchTMDbByExternalID(client, tmdbKey, imdbID); err == nil && tmdbMedia != nil && tmdbMedia.Title != "" {
				enrichYouTubeTrailer(youtubeKey, tmdbMedia)
				return tmdbMedia, nil
			}
		}
	}

	// 2. Check if TMDb URL
	if matches := tmdbIDRegex.FindStringSubmatch(rawURL); len(matches) > 2 {
		mediaType := matches[1] // "movie" or "tv"
		tmdbID := matches[2]
		if tmdbKey != "" {
			if tmdbMedia, err := fetchTMDbDetails(client, tmdbKey, tmdbID, mediaType); err == nil && tmdbMedia != nil && tmdbMedia.Title != "" {
				enrichYouTubeTrailer(youtubeKey, tmdbMedia)
				return tmdbMedia, nil
			}
		}
	}

	// 3. OpenGraph & JSON-LD Web Scraper (Kinopoisk, Netflix, Apple TV, Wikipedia, etc.)
	scrapedMedia, err := scrapeWebPage(client, rawURL)
	if err == nil && scrapedMedia != nil && scrapedMedia.Title != "" {
		media = scrapedMedia
	}

	// 4. TMDb Search Fallback: If we have a Title, query TMDb to get official poster, duration, director, cast
	if media.Title != "" && tmdbKey != "" {
		if enriched, err := searchTMDbByTitle(client, tmdbKey, media.Title, media.ReleaseYear); err == nil && enriched != nil {
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

	// Clean up title
	media.Title = cleanTitle(media.Title)

	if media.Title == "" {
		return nil, fmt.Errorf("could not extract media metadata from URL")
	}

	// 5. YouTube trailer enrichment
	enrichYouTubeTrailer(youtubeKey, media)

	return media, nil
}

func cleanTitle(t string) string {
	t = strings.TrimSpace(t)
	// Remove common site suffix patterns
	suffixes := []string{
		"— Кинопоиск", "- Кинопоиск", "| Кинопоиск",
		"— Netflix", "- Netflix", "| Netflix",
		"— Википедия", "- Википедия", "| Википедия",
		" (фильм)", " (сериал)", " (TV series)", " (Movie)",
	}
	for _, s := range suffixes {
		if idx := strings.Index(t, s); idx > 0 {
			t = t[:idx]
		}
	}
	return strings.TrimSpace(t)
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

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, 2*1024*1024)) // 2MB max
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
		media.PosterURL = image
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
				parseJSONLD(ldData, media)
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

func parseJSONLD(data map[string]interface{}, media *ExtractedMedia) {
	tp, _ := data["@type"].(string)
	if tp == "Movie" || tp == "TVSeries" || tp == "TVEpisode" {
		if tp == "TVSeries" || tp == "TVEpisode" {
			media.Category = "show"
		}
		if name, ok := data["name"].(string); ok && name != "" {
			media.Title = name
		}
		if image, ok := data["image"].(string); ok && image != "" {
			media.PosterURL = image
		}
		if desc, ok := data["description"].(string); ok && desc != "" {
			media.Description = desc
		}
		if date, ok := data["datePublished"].(string); ok && date != "" {
			if len(date) >= 4 {
				media.ReleaseYear = date[:4]
			}
		}

		// Director
		if directorObj, ok := data["director"]; ok {
			media.Director = extractPersonNames(directorObj, 1)
		}
		// Actors (limit 4)
		if actorObj, ok := data["actor"]; ok {
			media.Cast = extractPersonNames(actorObj, 4)
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
	var genreNames []string
	for _, g := range data.Genres {
		genreNames = append(genreNames, g.Name)
	}
	if len(genreNames) > 0 {
		media.Genre = strings.Join(genreNames, ", ")
	}

	// Director
	for _, c := range data.Credits.Crew {
		if c.Job == "Director" {
			media.Director = c.Name
			break
		}
	}

	// Cast (1-4 max)
	var castNames []string
	for i, c := range data.Credits.Cast {
		if i >= 4 {
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
