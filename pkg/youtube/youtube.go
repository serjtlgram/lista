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
)

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

// SearchYouTube searches YouTube specifically for the official trailer of a movie/series
func SearchYouTube(apiKey, title, category string) (string, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return "", nil
	}

	catLower := strings.ToLower(strings.TrimSpace(category))
	isBook := strings.Contains(catLower, "book") || strings.Contains(catLower, "книг")

	var searchQueries []string
	if isBook {
		searchQueries = []string{
			title + " книга",
			title + " обзор книги",
			title + " book trailer",
			title + " буктрейлер",
		}
	} else {
		searchQueries = []string{
			title + " официальный трейлер",
			title + " трейлер",
			title + " official trailer",
		}
	}

	client := &http.Client{Timeout: 6 * time.Second}

	for _, query := range searchQueries {
		// 1. Try official YouTube Data API v3 if API key is configured
		if apiKey != "" {
			if resultURL, err := searchViaOfficialAPI(client, apiKey, query); err == nil && resultURL != "" {
				return resultURL, nil
			}
		}

		// 2. Fallback: Search YouTube via public web search parser
		if resultURL, err := searchViaWebParser(client, query); err == nil && resultURL != "" {
			return resultURL, nil
		}
	}

	return "", nil
}

func searchViaOfficialAPI(client *http.Client, apiKey, query string) (string, error) {
	apiURL := fmt.Sprintf(
		"https://www.googleapis.com/youtube/v3/search?part=snippet&q=%s&type=video&maxResults=5&key=%s",
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
		if item.ID.VideoID != "" {
			candidateURL := "https://www.youtube.com/watch?v=" + item.ID.VideoID
			if isVideoEmbeddable(client, candidateURL) {
				return candidateURL, nil
			}
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

	// Check videoRenderer matches
	if videoMatches := videoRendererRegex.FindAllStringSubmatch(bodyStr, -1); len(videoMatches) > 0 {
		for _, match := range videoMatches {
			if len(match) > 1 {
				vID := match[1]
				candidateURL := "https://www.youtube.com/watch?v=" + vID
				if isVideoEmbeddable(client, candidateURL) {
					return candidateURL, nil
				}
			}
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
