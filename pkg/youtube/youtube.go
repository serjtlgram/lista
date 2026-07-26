package youtube

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strings"
	"time"
)

type youtubeSearchResponse struct {
	Items []struct {
		ID struct {
			Kind       string `json:"kind"`
			VideoID    string `json:"videoId"`
			PlaylistID string `json:"playlistId"`
		} `json:"id"`
		Snippet struct {
			Title string `json:"title"`
		} `json:"snippet"`
	} `json:"items"`
}

var (
	videoRendererRegex    = regexp.MustCompile(`"videoRenderer":\{"videoId":"([a-zA-Z0-9_-]{11})".*?"title":\{"runs":\[\{"text":"([^"]+)"`)
	playlistRendererRegex = regexp.MustCompile(`"playlistRenderer":\{"playlistId":"([a-zA-Z0-9_-]{18,34})".*?"title":\{"simpleText":"([^"]+)"`)
	fallbackVideoIDRegex  = regexp.MustCompile(`"videoId":"([a-zA-Z0-9_-]{11})"`)
	fallbackPlaylistRegex = regexp.MustCompile(`"playlistId":"([a-zA-Z0-9_-]{18,34})"`)
)

func isPromoTitle(title string) bool {
	t := strings.ToLower(title)
	promoKeywords := []string{"трейлер", "тизер", "анонс", "клип", "промо", "отрывок", "обзор", "trailer", "teaser"}
	for _, kw := range promoKeywords {
		if strings.Contains(t, kw) {
			return true
		}
	}
	return false
}

func isVideoEmbeddable(client *http.Client, targetURL string) bool {
	if targetURL == "" {
		return false
	}
	oembedURL := fmt.Sprintf("https://www.youtube.com/oembed?url=%s&format=json", url.QueryEscape(targetURL))
	req, err := http.NewRequest("GET", oembedURL, nil)
	if err != nil {
		return false
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	resp, err := client.Do(req)
	if err != nil {
		return false
	}
	defer resp.Body.Close()
	return resp.StatusCode == http.StatusOK
}

// SearchYouTube searches YouTube for a video or playlist matching title and category.
// Prioritizes full series / playlists / episode 1 over trailers, and verifies video is embeddable.
func SearchYouTube(apiKey, title, category string) (string, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return "", nil
	}

	catLower := strings.ToLower(category)
	isSeries := false
	if strings.Contains(catLower, "show") || strings.Contains(catLower, "series") || strings.Contains(catLower, "сериал") {
		isSeries = true
	}

	var searchQueries []string
	if isSeries {
		searchQueries = []string{
			title + " все серии подряд",
			title + " все серии",
			title + " 1 серия",
			title + " плейлист",
			title + " трейлер",
		}
	} else {
		searchQueries = []string{
			title + " фильм",
			title + " смотреть полностью",
			title,
			title + " трейлер",
		}
	}

	client := &http.Client{Timeout: 6 * time.Second}

	for _, query := range searchQueries {
		isTrailerQuery := strings.Contains(strings.ToLower(query), "трейлер")

		// 1. Try official YouTube Data API v3 if API key is configured
		if apiKey != "" {
			resultURL, err := searchViaOfficialAPI(client, apiKey, query, isTrailerQuery)
			if err == nil && resultURL != "" {
				return resultURL, nil
			}
		}

		// 2. Fallback: Search YouTube via public web search parser
		resultURL, err := searchViaWebParser(client, query, isTrailerQuery)
		if err == nil && resultURL != "" {
			return resultURL, nil
		}
	}

	return "", nil
}

func searchViaOfficialAPI(client *http.Client, apiKey, query string, allowPromo bool) (string, error) {
	apiURL := fmt.Sprintf(
		"https://www.googleapis.com/youtube/v3/search?part=snippet&q=%s&type=video,playlist&maxResults=5&key=%s",
		url.QueryEscape(query),
		apiKey,
	)

	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return "", err
	}

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("youtube API returned status %d", resp.StatusCode)
	}

	var data youtubeSearchResponse
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", err
	}

	for _, item := range data.Items {
		videoTitle := item.Snippet.Title
		if !allowPromo && isPromoTitle(videoTitle) {
			continue
		}
		var candidateURL string
		if item.ID.PlaylistID != "" {
			candidateURL = "https://www.youtube.com/playlist?list=" + item.ID.PlaylistID
		} else if item.ID.VideoID != "" {
			candidateURL = "https://www.youtube.com/watch?v=" + item.ID.VideoID
		}
		if candidateURL != "" && isVideoEmbeddable(client, candidateURL) {
			return candidateURL, nil
		}
	}

	return "", nil
}

func searchViaWebParser(client *http.Client, query string, allowPromo bool) (string, error) {
	searchURL := fmt.Sprintf("https://www.youtube.com/results?search_query=%s", url.QueryEscape(query))
	req, err := http.NewRequest("GET", searchURL, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")
	req.Header.Set("Accept-Language", "ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7")

	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("web search returned status %d", resp.StatusCode)
	}

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", err
	}
	bodyStr := string(bodyBytes)

	// Check playlistRenderer matches first
	if playlistMatches := playlistRendererRegex.FindAllStringSubmatch(bodyStr, -1); len(playlistMatches) > 0 {
		for _, match := range playlistMatches {
			if len(match) > 2 {
				pID := match[1]
				pTitle := match[2]
				if !allowPromo && isPromoTitle(pTitle) {
					continue
				}
				candidateURL := "https://www.youtube.com/playlist?list=" + pID
				if isVideoEmbeddable(client, candidateURL) {
					return candidateURL, nil
				}
			}
		}
	}

	// Check videoRenderer matches with title inspection
	if videoMatches := videoRendererRegex.FindAllStringSubmatch(bodyStr, -1); len(videoMatches) > 0 {
		for _, match := range videoMatches {
			if len(match) > 2 {
				vID := match[1]
				vTitle := match[2]
				if !allowPromo && isPromoTitle(vTitle) {
					continue
				}
				candidateURL := "https://www.youtube.com/watch?v=" + vID
				if isVideoEmbeddable(client, candidateURL) {
					return candidateURL, nil
				}
			}
		}
	}

	// Fallback playlist
	if matches := fallbackPlaylistRegex.FindStringSubmatch(bodyStr); len(matches) > 1 {
		candidateURL := "https://www.youtube.com/playlist?list=" + matches[1]
		if isVideoEmbeddable(client, candidateURL) {
			return candidateURL, nil
		}
	}

	// Fallback raw videoId
	if matches := fallbackVideoIDRegex.FindStringSubmatch(bodyStr); len(matches) > 1 {
		candidateURL := "https://www.youtube.com/watch?v=" + matches[1]
		if isVideoEmbeddable(client, candidateURL) {
			return candidateURL, nil
		}
	}

	return "", nil
}
