package parser

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"lista-backend/pkg/models"
)

// SearchRAWGGames queries RAWG Video Games Database API
func SearchRAWGGames(query string) ([]models.CatalogSearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}

	rawgKey := os.Getenv("RAWG_API_KEY")
	apiURL := fmt.Sprintf("https://api.rawg.io/api/games?search=%s&page_size=5", url.QueryEscape(query))
	if rawgKey != "" {
		apiURL += "&key=" + rawgKey
	}

	client := &http.Client{Timeout: 5 * time.Second}
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "TrackListBot/1.0")

	resp, err := client.Do(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return nil, err
	}
	defer resp.Body.Close()

	var data struct {
		Results []struct {
			ID              int     `json:"id"`
			Name            string  `json:"name"`
			Released        string  `json:"released"`
			BackgroundImage string  `json:"background_image"`
			Rating          float64 `json:"rating"`
			Genres          []struct {
				Name string `json:"name"`
			} `json:"genres"`
		} `json:"results"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	var results []models.CatalogSearchResult
	for _, game := range data.Results {
		if strings.TrimSpace(game.Name) == "" {
			continue
		}

		year := ""
		if len(game.Released) >= 4 {
			year = game.Released[:4]
		}

		genre := "Игра"
		if len(game.Genres) > 0 {
			genre = game.Genres[0].Name
		}

		results = append(results, models.CatalogSearchResult{
			ID:          fmt.Sprintf("rawg_%d", game.ID),
			Title:       game.Name,
			Category:    "game",
			Genre:       genre,
			ReleaseYear: year,
			PosterURL:   game.BackgroundImage,
			Source:      "online",
		})
	}

	return results, nil
}

// SearchITunesGames queries iTunes Software API for video games
func SearchITunesGames(query string) ([]models.CatalogSearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}

	apiURL := fmt.Sprintf("https://itunes.apple.com/search?term=%s&entity=software,iPadSoftware,macSoftware&limit=5&lang=ru_ru", url.QueryEscape(query))
	client := &http.Client{Timeout: 4 * time.Second}
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return nil, nil
	}
	defer resp.Body.Close()

	var data struct {
		Results []struct {
			TrackName        string   `json:"trackName"`
			ArtworkUrl100    string   `json:"artworkUrl100"`
			PrimaryGenreName string   `json:"primaryGenreName"`
			Genres           []string `json:"genres"`
			ReleaseDate      string   `json:"releaseDate"`
			Description      string   `json:"description"`
		} `json:"results"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	var results []models.CatalogSearchResult
	for _, r := range data.Results {
		if strings.TrimSpace(r.TrackName) == "" {
			continue
		}

		isGame := false
		for _, g := range r.Genres {
			if strings.Contains(strings.ToLower(g), "game") || strings.Contains(strings.ToLower(g), "игра") || strings.Contains(strings.ToLower(g), "игры") {
				isGame = true
				break
			}
		}
		if !isGame && !strings.Contains(strings.ToLower(r.PrimaryGenreName), "game") && !strings.Contains(strings.ToLower(r.PrimaryGenreName), "игра") {
			continue
		}

		year := ""
		if len(r.ReleaseDate) >= 4 {
			year = r.ReleaseDate[:4]
		}
		poster := strings.ReplaceAll(r.ArtworkUrl100, "100x100bb", "512x512bb")

		results = append(results, models.CatalogSearchResult{
			ID:          "itunes_game_" + url.QueryEscape(r.TrackName),
			Title:       r.TrackName,
			Category:    "game",
			Genre:       "Игра",
			ReleaseYear: year,
			Description: r.Description,
			PosterURL:   poster,
			Source:      "online",
		})
	}
	return results, nil
}

// SearchWikiGames queries Wikipedia API specifically for video games
func SearchWikiGames(query string) ([]models.CatalogSearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}

	apiURL := fmt.Sprintf("https://ru.wikipedia.org/w/api.php?action=query&list=search&srsearch=%s+компьютерная+игра&utf8=1&format=json", url.QueryEscape(query))
	client := &http.Client{Timeout: 4 * time.Second}
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return nil, nil
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

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	var results []models.CatalogSearchResult
	for i, item := range data.Query.Search {
		if i >= 4 || item.Title == "" {
			break
		}
		title := item.Title
		title = strings.ReplaceAll(title, "(компьютерная игра)", "")
		title = strings.ReplaceAll(title, "(игра)", "")
		title = strings.TrimSpace(title)

		cleanDesc := stripHTML(item.Snippet)

		results = append(results, models.CatalogSearchResult{
			ID:          "wiki_game_" + url.QueryEscape(title),
			Title:       title,
			Category:    "game",
			Genre:       "Игра",
			Description: cleanDesc,
			Source:      "online",
		})
	}
	return results, nil
}

// SearchGamesMultiSource runs game searches concurrently and returns combined game results
func SearchGamesMultiSource(query string) []models.CatalogSearchResult {
	type resultSet struct {
		items []models.CatalogSearchResult
	}

	ch := make(chan resultSet, 5)

	go func() { items, _ := SearchIGDBGames(query); ch <- resultSet{items} }()
	go func() { items, _ := SearchSteamGames(query); ch <- resultSet{items} }()
	go func() { items, _ := SearchRAWGGames(query); ch <- resultSet{items} }()
	go func() { items, _ := SearchITunesGames(query); ch <- resultSet{items} }()
	go func() { items, _ := SearchWikiGames(query); ch <- resultSet{items} }()

	timer := time.NewTimer(5 * time.Second)
	defer timer.Stop()

	var combined []models.CatalogSearchResult
	seenTitles := make(map[string]bool)
	received := 0
	total := 5

	for received < total {
		select {
		case res := <-ch:
			for _, item := range res.items {
				key := strings.ToLower(strings.TrimSpace(item.Title))
				if key != "" && !seenTitles[key] {
					seenTitles[key] = true
					combined = append(combined, item)
				}
			}
			received++
		case <-timer.C:
			return combined
		}
	}

	return combined
}

// SearchSteamGames queries the Steam Store search API
func SearchSteamGames(query string) ([]models.CatalogSearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}

	apiURL := fmt.Sprintf("https://store.steampowered.com/api/storesearch/?term=%s&l=russian&cc=RU", url.QueryEscape(query))
	client := &http.Client{Timeout: 4 * time.Second}
	req, err := http.NewRequest("GET", apiURL, nil)
	if err != nil {
		return nil, err
	}

	resp, err := client.Do(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return nil, nil
	}
	defer resp.Body.Close()

	var data struct {
		Items []struct {
			ID        int    `json:"id"`
			Name      string `json:"name"`
			TinyImage string `json:"tiny_image"`
		} `json:"items"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	var results []models.CatalogSearchResult
	for i, item := range data.Items {
		if i >= 5 {
			break
		}
		if strings.TrimSpace(item.Name) == "" {
			continue
		}

		poster := item.TinyImage
		// Try to get a better resolution image
		poster = strings.ReplaceAll(poster, "capsule_231x87.jpg", "header.jpg")

		results = append(results, models.CatalogSearchResult{
			ID:          fmt.Sprintf("steam_%d", item.ID),
			Title:       item.Name,
			Category:    "game",
			Genre:       "Игра",
			PosterURL:   poster,
			Source:      "online",
		})
	}
	return results, nil
}

var igdbAccessToken string
var igdbTokenExpiry time.Time

func getIGDBToken(clientID, clientSecret string) (string, error) {
	if igdbAccessToken != "" && time.Now().Before(igdbTokenExpiry) {
		return igdbAccessToken, nil
	}
	apiURL := fmt.Sprintf("https://id.twitch.tv/oauth2/token?client_id=%s&client_secret=%s&grant_type=client_credentials", clientID, clientSecret)
	resp, err := http.Post(apiURL, "application/json", nil)
	if err != nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return "", fmt.Errorf("auth error")
	}
	defer resp.Body.Close()
	var data struct {
		AccessToken string `json:"access_token"`
		ExpiresIn   int    `json:"expires_in"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return "", err
	}
	igdbAccessToken = data.AccessToken
	igdbTokenExpiry = time.Now().Add(time.Duration(data.ExpiresIn-60) * time.Second)
	return igdbAccessToken, nil
}

func SearchIGDBGames(query string) ([]models.CatalogSearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}
	clientID := os.Getenv("IGDB_CLIENT_ID")
	clientSecret := os.Getenv("IGDB_CLIENT_SECRET")
	if clientID == "" || clientSecret == "" {
		return nil, nil
	}
	token, err := getIGDBToken(clientID, clientSecret)
	if err != nil {
		return nil, err
	}

	apiURL := "https://api.igdb.com/v4/games"
	body := fmt.Sprintf(`search "%s"; fields name,first_release_date,cover.url,genres.name; limit 5;`, query)
	req, err := http.NewRequest("POST", apiURL, strings.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Client-ID", clientID)
	req.Header.Set("Authorization", "Bearer "+token)

	client := &http.Client{Timeout: 4 * time.Second}
	resp, err := client.Do(req)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return nil, nil
	}
	defer resp.Body.Close()

	var data []struct {
		ID               int    `json:"id"`
		Name             string `json:"name"`
		FirstReleaseDate int64  `json:"first_release_date"`
		Cover            struct {
			URL string `json:"url"`
		} `json:"cover"`
		Genres []struct {
			Name string `json:"name"`
		} `json:"genres"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	var results []models.CatalogSearchResult
	for _, game := range data {
		if strings.TrimSpace(game.Name) == "" {
			continue
		}
		year := ""
		if game.FirstReleaseDate > 0 {
			year = time.Unix(game.FirstReleaseDate, 0).Format("2006")
		}
		genre := "Игра"
		if len(game.Genres) > 0 {
			genre = game.Genres[0].Name
		}
		poster := game.Cover.URL
		if poster != "" {
			if strings.HasPrefix(poster, "//") {
				poster = "https:" + poster
			}
			poster = strings.ReplaceAll(poster, "t_thumb", "t_cover_big")
		}

		results = append(results, models.CatalogSearchResult{
			ID:          fmt.Sprintf("igdb_%d", game.ID),
			Title:       game.Name,
			Category:    "game",
			Genre:       genre,
			ReleaseYear: year,
			PosterURL:   poster,
			Source:      "online",
		})
	}
	return results, nil
}
