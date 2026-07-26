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
	videoIDRegex    = regexp.MustCompile(`"videoId":"([a-zA-Z0-9_-]{11})"`)
	playlistIDRegex = regexp.MustCompile(`"playlistId":"([a-zA-Z0-9_-]{18,34})"`)
)

// SearchYouTube searches YouTube for a video or playlist matching title and category.
// Returns canonical YouTube URL (watch or playlist) or empty string if not found.
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
			title + " все серии",
			title + " 1 серия",
			title + " трейлер",
		}
	} else {
		searchQueries = []string{
			title + " фильм",
			title,
			title + " трейлер",
		}
	}

	client := &http.Client{Timeout: 8 * time.Second}

	for _, query := range searchQueries {
		// 1. Try official YouTube Data API v3 if API key is configured
		if apiKey != "" {
			resultURL, err := searchViaOfficialAPI(client, apiKey, query)
			if err == nil && resultURL != "" {
				return resultURL, nil
			}
		}

		// 2. Fallback: Search YouTube via public web search parser if API key is missing or failed
		resultURL, err := searchViaWebParser(client, query)
		if err == nil && resultURL != "" {
			return resultURL, nil
		}
	}

	return "", nil
}

func searchViaOfficialAPI(client *http.Client, apiKey, query string) (string, error) {
	apiURL := fmt.Sprintf(
		"https://www.googleapis.com/youtube/v3/search?part=snippet&q=%s&type=video,playlist&maxResults=1&key=%s",
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

	if len(data.Items) > 0 {
		item := data.Items[0]
		if item.ID.VideoID != "" {
			return "https://www.youtube.com/watch?v=" + item.ID.VideoID, nil
		}
		if item.ID.PlaylistID != "" {
			return "https://www.youtube.com/playlist?list=" + item.ID.PlaylistID, nil
		}
	}

	return "", nil
}

func searchViaWebParser(client *http.Client, query string) (string, error) {
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

	// Search for playlist match first if series
	if matches := playlistIDRegex.FindStringSubmatch(bodyStr); len(matches) > 1 {
		return "https://www.youtube.com/playlist?list=" + matches[1], nil
	}

	// Search for videoId match
	if matches := videoIDRegex.FindStringSubmatch(bodyStr); len(matches) > 1 {
		return "https://www.youtube.com/watch?v=" + matches[1], nil
	}

	return "", nil
}
