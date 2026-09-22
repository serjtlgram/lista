package youtube

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
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
	yearRegex             = regexp.MustCompile(`\b(19\d\d|20\d\d)\b`)
)

func IsVideoEmbeddable(client *http.Client, targetURL string) bool {
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

// SearchYouTube searches YouTube specifically for the official trailer of a movie/series/book.
// Optional extra arguments: year, director, original/alternative title.
func SearchYouTube(apiKey, title, category string, extra ...string) (string, error) {
	title = strings.TrimSpace(title)
	if title == "" {
		return "", nil
	}

	catLower := strings.ToLower(strings.TrimSpace(category))
	isBook := strings.Contains(catLower, "book") || strings.Contains(catLower, "книг")

	var year, director, origTitle string
	for _, arg := range extra {
		arg = strings.TrimSpace(arg)
		if arg == "" {
			continue
		}
		if year == "" && yearRegex.MatchString(arg) && len(arg) == 4 {
			year = arg
		} else if director == "" {
			parts := strings.Split(arg, ",")
			director = strings.TrimSpace(parts[0])
		} else if origTitle == "" && !strings.EqualFold(arg, title) {
			origTitle = arg
		}
	}

	var searchQueries []string
	if isBook {
		if director != "" {
			searchQueries = append(searchQueries,
				title+" "+director+" книга",
				title+" "+director+" буктрейлер",
				title+" "+director+" book trailer",
			)
		}
		searchQueries = append(searchQueries,
			title+" книга",
			title+" обзор книги",
			title+" буктрейлер",
			title+" book trailer",
		)
	} else {
		if year != "" && director != "" {
			searchQueries = append(searchQueries, title+" "+year+" "+director+" трейлер")
		}
		if year != "" {
			searchQueries = append(searchQueries, title+" "+year+" официальный трейлер")
			searchQueries = append(searchQueries, title+" "+year+" трейлер")
		}
		if director != "" {
			searchQueries = append(searchQueries, title+" "+director+" трейлер")
		}
		if origTitle != "" && year != "" {
			searchQueries = append(searchQueries, origTitle+" "+year+" official trailer")
		}
		if origTitle != "" && director != "" {
			searchQueries = append(searchQueries, origTitle+" "+director+" trailer")
		}
		if origTitle != "" {
			searchQueries = append(searchQueries, origTitle+" official trailer")
		}
		searchQueries = append(searchQueries,
			title+" официальный трейлер",
			title+" трейлер",
			title+" official trailer",
		)
	}

	client := &http.Client{Timeout: 6 * time.Second}

	for _, query := range searchQueries {
		// 1. Try official YouTube Data API v3 if API key is configured
		if apiKey != "" {
			if resultURL, err := searchViaOfficialAPI(client, apiKey, query, title, catLower, year, director, origTitle); err == nil && resultURL != "" {
				return resultURL, nil
			}
		}

		// 2. Fallback: Search YouTube via public web search parser
		if resultURL, err := searchViaWebParser(client, query, title, catLower, year, director, origTitle); err == nil && resultURL != "" {
			return resultURL, nil
		}
	}

	return "", nil
}

type candidateItem struct {
	videoID string
	title   string
	score   int
}

func scoreCandidate(candTitle, targetTitle, targetCat, year, director, origTitle string) int {
	score := 0
	titleLower := strings.ToLower(candTitle)

	// Year matching / conflict check
	if year != "" {
		if strings.Contains(candTitle, year) {
			score += 50
		} else {
			candYears := yearRegex.FindAllString(candTitle, -1)
			hasConflict := false
			for _, cy := range candYears {
				if cy != year {
					hasConflict = true
					break
				}
			}
			if hasConflict {
				score -= 100 // Strong penalty for explicitly different release year!
			}
		}
	}

	// Director matching
	if director != "" {
		dParts := strings.FieldsFunc(director, func(r rune) bool {
			return r == ' ' || r == ',' || r == '.' || r == '-'
		})
		for _, part := range dParts {
			pTrim := strings.ToLower(strings.TrimSpace(part))
			if len([]rune(pTrim)) >= 3 && strings.Contains(titleLower, pTrim) {
				score += 35
				break
			}
		}
	}

	// Original / alternative title matching
	if origTitle != "" && len([]rune(origTitle)) >= 3 {
		if strings.Contains(titleLower, strings.ToLower(origTitle)) {
			score += 25
		}
	}

	// Target title match
	if strings.Contains(titleLower, strings.ToLower(targetTitle)) {
		score += 20
	}

	// Trailer keywords bonus
	if strings.Contains(titleLower, "трейлер") || strings.Contains(titleLower, "trailer") || strings.Contains(titleLower, "тизер") || strings.Contains(titleLower, "teaser") {
		score += 15
	}
	if strings.Contains(titleLower, "официальный") || strings.Contains(titleLower, "official") {
		score += 10
	}

	// Negative keywords (full movie, reaction, review, parody, gameplay, soundtrack)
	negativeKeywords := []string{
		"фильм целиком", "полный фильм", "full movie", "обзор", "реакция", "разбор", "пародия", "remake", "gameplay", "soundtrack", "ost",
	}
	for _, neg := range negativeKeywords {
		if strings.Contains(titleLower, neg) {
			score -= 40
		}
	}

	return score
}

func searchViaOfficialAPI(client *http.Client, apiKey, query, targetTitle, targetCat, year, director, origTitle string) (string, error) {
	apiURL := fmt.Sprintf(
		"https://www.googleapis.com/youtube/v3/search?part=snippet&q=%s&type=video&videoEmbeddable=true&videoSyndicated=true&maxResults=5&key=%s",
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

	var candidates []candidateItem
	for _, item := range data.Items {
		if item.ID.VideoID != "" {
			sc := scoreCandidate(item.Snippet.Title, targetTitle, targetCat, year, director, origTitle)
			candidates = append(candidates, candidateItem{
				videoID: item.ID.VideoID,
				title:   item.Snippet.Title,
				score:   sc,
			})
		}
	}

	sort.SliceStable(candidates, func(i, j int) bool {
		return candidates[i].score > candidates[j].score
	})

	for _, cand := range candidates {
		// If a year is specified, reject candidates with conflicting year (score < 0)
		if year != "" && cand.score < 0 {
			continue
		}
		candidateURL := "https://www.youtube.com/watch?v=" + cand.videoID
		if IsVideoEmbeddable(client, candidateURL) {
			return candidateURL, nil
		}
	}

	return "", nil
}

func searchViaWebParser(client *http.Client, query, targetTitle, targetCat, year, director, origTitle string) (string, error) {
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

	var candidates []candidateItem

	// Check videoRenderer matches
	if videoMatches := videoRendererRegex.FindAllStringSubmatch(bodyStr, -1); len(videoMatches) > 0 {
		for _, match := range videoMatches {
			if len(match) > 1 {
				vID := match[1]
				vTitle := ""
				if len(match) > 2 {
					vTitle = match[2]
				}
				sc := scoreCandidate(vTitle, targetTitle, targetCat, year, director, origTitle)
				candidates = append(candidates, candidateItem{
					videoID: vID,
					title:   vTitle,
					score:   sc,
				})
			}
		}
	}

	// Sort candidates by score descending
	if len(candidates) > 0 {
		sort.SliceStable(candidates, func(i, j int) bool {
			return candidates[i].score > candidates[j].score
		})

		for _, cand := range candidates {
			if year != "" && cand.score < 0 {
				continue
			}
			candidateURL := "https://www.youtube.com/watch?v=" + cand.videoID
			if IsVideoEmbeddable(client, candidateURL) {
				return candidateURL, nil
			}
		}
	}

	// Fallback raw videoId if no videoRenderer parsed and year is not specified
	if year == "" {
		if matches := fallbackVideoIDRegex.FindStringSubmatch(bodyStr); len(matches) > 1 {
			candidateURL := "https://www.youtube.com/watch?v=" + matches[1]
			if IsVideoEmbeddable(client, candidateURL) {
				return candidateURL, nil
			}
		}
	}

	return "", nil
}
