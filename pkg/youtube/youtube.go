package youtube

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"sort"
	"strconv"
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
	numeralRegex          = regexp.MustCompile(`(?i)\b(1|2|3|4|5|6|7|8|9|10|i|ii|iii|iv|v|vi|vii|viii|ix|x)\b`)
)

func normalizeNumeral(token string) string {
	switch strings.ToLower(token) {
	case "1", "i":
		return "1"
	case "2", "ii":
		return "2"
	case "3", "iii":
		return "3"
	case "4", "iv":
		return "4"
	case "5", "v":
		return "5"
	case "6", "vi":
		return "6"
	case "7", "vii":
		return "7"
	case "8", "viii":
		return "8"
	case "9", "ix":
		return "9"
	case "10", "x":
		return "10"
	default:
		return strings.ToLower(token)
	}
}

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
	isGame := strings.Contains(catLower, "game") || strings.Contains(catLower, "игр")

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
	} else if isGame {
		searchQueries = append(searchQueries,
			title+" official game trailer",
			title+" official trailer",
			title+" gameplay trailer",
			title+" launch trailer",
			title+" трейлер игры",
		)
		if origTitle != "" && origTitle != title {
			searchQueries = append(searchQueries,
				origTitle+" official game trailer",
				origTitle+" official trailer",
			)
		}
		if year != "" {
			searchQueries = append(searchQueries,
				title+" "+year+" official game trailer",
			)
		}
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
	catLower := strings.ToLower(strings.TrimSpace(targetCat))
	isGame := strings.Contains(catLower, "game") || strings.Contains(catLower, "игр")

	// Year matching / conflict check
	if year != "" {
		if strings.Contains(candTitle, year) {
			score += 50
		} else {
			candYears := yearRegex.FindAllString(candTitle, -1)
			hasConflict := false
			for _, cy := range candYears {
				if cy != year {
					if isGame {
						yTarget, _ := strconv.Atoi(year)
						yCand, _ := strconv.Atoi(cy)
						diff := yTarget - yCand
						if diff < -4 || diff > 4 {
							hasConflict = true
							break
						}
					} else {
						hasConflict = true
						break
					}
				}
			}
			if hasConflict {
				score -= 100 // Strong penalty for explicitly different release year!
			}
		}
	}

	// Sequel / number matching & conflict check (e.g. Witcher 3 vs Witcher 2, GTA 6 vs GTA 5)
	targetNumerals := numeralRegex.FindAllString(targetTitle, -1)
	if len(targetNumerals) > 0 {
		candNumerals := numeralRegex.FindAllString(candTitle, -1)
		matchedNumeral := false
		for _, tn := range targetNumerals {
			normT := normalizeNumeral(tn)
			for _, cn := range candNumerals {
				normC := normalizeNumeral(cn)
				if normT == normC {
					matchedNumeral = true
					break
				}
			}
		}
		if matchedNumeral {
			score += 35
		} else if len(candNumerals) > 0 {
			score -= 120 // Different sequel number
		}
	}

	// Title & word matching
	targetLower := strings.ToLower(targetTitle)
	origLower := strings.ToLower(origTitle)
	if strings.Contains(titleLower, targetLower) {
		score += 40
	} else if origTitle != "" && strings.Contains(titleLower, origLower) {
		score += 40
	} else {
		words := strings.FieldsFunc(targetLower, func(r rune) bool {
			return r == ' ' || r == ':' || r == '-' || r == '.' || r == ',' || r == '!' || r == '?' || r == '\'' || r == '"'
		})
		matchedWords := 0
		totalSigWords := 0
		stopwords := map[string]bool{"the": true, "a": true, "an": true, "of": true, "and": true, "in": true, "on": true, "at": true, "to": true, "for": true, "part": true, "и": true, "в": true, "на": true, "с": true, "по": true, "из": true, "о": true, "часть": true}
		for _, w := range words {
			if len([]rune(w)) >= 3 && !stopwords[w] {
				totalSigWords++
				if strings.Contains(titleLower, w) {
					matchedWords++
				}
			}
		}
		if totalSigWords > 0 {
			if matchedWords == totalSigWords {
				score += 30
			} else if matchedWords == 0 {
				score -= 150 // Candidate does not even contain any name words!
			}
		}
	}

	// Original / alternative title matching
	if origTitle != "" && len([]rune(origTitle)) >= 3 {
		if strings.Contains(titleLower, origLower) {
			score += 25
		}
	}

	// Director / Developer matching
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

	if isGame {
		// Movie / TV Series Disqualification for games
		movieSeriesDisqualifiers := []string{
			"фильм целиком", "полный фильм", "full movie", "фильм", "фильма", "фильме",
			"movie", "film", "cinema", "кино", "в кино", "кинотеатр",
			"сериал", "сериала", "сериале", "series", "tv series", "season", "сезон",
			"hbo", "netflix", "prime video", "amazon prime", "apple tv",
			"дублированный трейлер фильма", "русский трейлер фильма", "трейлер фильма",
		}
		for _, disq := range movieSeriesDisqualifiers {
			if strings.Contains(titleLower, disq) {
				score -= 180
			}
		}

		// Playthrough / Review / Spoilers / OST / Fan-made Disqualification
		gameNegativeKeywords := []string{
			"прохождение", "walkthrough", "let's play", "lets play", "летсплей", "полное прохождение",
			"стрим", "stream", "longplay", "no commentary", "без комментариев",
			"обзор", "review", "реакция", "reaction", "разбор", "стоит ли играть", "before you buy",
			"пародия", "parody", "fan made", "concept trailer", "фанатский",
			"soundtrack", "ost", "саундтрек", "музыка из игры",
			"все боссы", "all bosses", "final boss", "ending", "концовка", "финал",
			"speedrun", "спидран", "100%", "гайд", "guide", "how to", "как пройти",
			"пасхалки", "секреты", "secrets", "easter eggs",
			"mods", "моды", "modded", "compilation", "подборка", "shorts", "tiktok",
		}
		for _, neg := range gameNegativeKeywords {
			if strings.Contains(titleLower, neg) {
				score -= 80
			}
		}

		// "gameplay" without trailer/тизер is usually a raw playthrough
		if strings.Contains(titleLower, "gameplay") || strings.Contains(titleLower, "геймплей") {
			if !strings.Contains(titleLower, "trailer") && !strings.Contains(titleLower, "трейлер") && !strings.Contains(titleLower, "тизер") && !strings.Contains(titleLower, "teaser") {
				score -= 60
			}
		}

		// Game trailer bonus keywords
		if strings.Contains(titleLower, "official game trailer") || strings.Contains(titleLower, "официальный трейлер игры") {
			score += 50
		} else if strings.Contains(titleLower, "game trailer") || strings.Contains(titleLower, "трейлер игры") {
			score += 40
		}
		if strings.Contains(titleLower, "gameplay trailer") || strings.Contains(titleLower, "геймплейный трейлер") {
			score += 45
		}
		if strings.Contains(titleLower, "launch trailer") || strings.Contains(titleLower, "релизный трейлер") {
			score += 45
		}
		if strings.Contains(titleLower, "reveal trailer") || strings.Contains(titleLower, "announcement trailer") || strings.Contains(titleLower, "анонсирующий трейлер") {
			score += 40
		}
		if strings.Contains(titleLower, "cinematic trailer") || strings.Contains(titleLower, "синематик") || strings.Contains(titleLower, "story trailer") || strings.Contains(titleLower, "сюжетный трейлер") {
			score += 40
		}
		if strings.Contains(titleLower, "официальный") || strings.Contains(titleLower, "official") {
			score += 25
		}
		if strings.Contains(titleLower, "трейлер") || strings.Contains(titleLower, "trailer") || strings.Contains(titleLower, "тизер") || strings.Contains(titleLower, "teaser") {
			score += 20
		}

		// Platform / Gaming channel bonus
		platforms := []string{"playstation", "ps5", "ps4", "xbox", "nintendo", "steam", "pc", "ign", "gamespot"}
		for _, plat := range platforms {
			if strings.Contains(titleLower, plat) {
				score += 15
				break
			}
		}
	} else {
		// Trailer keywords bonus for movies/series
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
		// Reject candidates with score <= 0 (penalties, conflicting sequels/years, or wrong category)
		if cand.score <= 0 {
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
			if cand.score <= 0 {
				continue
			}
			candidateURL := "https://www.youtube.com/watch?v=" + cand.videoID
			if IsVideoEmbeddable(client, candidateURL) {
				return candidateURL, nil
			}
		}
	}

	// Fallback raw videoId if no videoRenderer parsed and year is not specified (only for non-games)
	isGame := strings.Contains(strings.ToLower(targetCat), "game") || strings.Contains(strings.ToLower(targetCat), "игр")
	if year == "" && !isGame {
		if matches := fallbackVideoIDRegex.FindStringSubmatch(bodyStr); len(matches) > 1 {
			candidateURL := "https://www.youtube.com/watch?v=" + matches[1]
			if IsVideoEmbeddable(client, candidateURL) {
				return candidateURL, nil
			}
		}
	}

	return "", nil
}
