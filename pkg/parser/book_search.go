package parser

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"lista-backend/pkg/models"
)

// SearchGoogleBooks queries Google Books API and formats CatalogSearchResult items
func SearchGoogleBooks(query string) ([]models.CatalogSearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}

	client := &http.Client{Timeout: 6 * time.Second}
	apiURL := fmt.Sprintf("https://www.googleapis.com/books/v1/volumes?q=%s&langRestrict=ru&maxResults=5", url.QueryEscape(query))

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
		return nil, fmt.Errorf("google books API status %d", resp.StatusCode)
	}

	var data struct {
		Items []struct {
			ID         string `json:"id"`
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
		} `json:"items"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	var results []models.CatalogSearchResult
	for _, item := range data.Items {
		info := item.VolumeInfo
		if strings.TrimSpace(info.Title) == "" {
			continue
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

		rawCover := info.ImageLinks.Thumbnail
		if rawCover == "" {
			rawCover = info.ImageLinks.SmallThumbnail
		}
		if rawCover != "" {
			// High-res Google Books cover hack: replace zoom=1 with zoom=0 and strip &edge=curl
			rawCover = strings.ReplaceAll(rawCover, "http://", "https://")
			rawCover = strings.ReplaceAll(rawCover, "zoom=1", "zoom=0")
			rawCover = strings.ReplaceAll(rawCover, "&edge=curl", "")
		}

		optimizedPoster := OptimizePosterURL(client, rawCover)

		results = append(results, models.CatalogSearchResult{
			ID:          item.ID,
			Title:       info.Title,
			Category:    "book",
			Author:      author,
			ReleaseYear: year,
			ISBN:        isbn,
			Description: info.Description,
			PosterURL:   optimizedPoster,
			Source:      "online",
		})
	}

	return results, nil
}

// SearchFantLab queries FantLab API (for Sci-Fi / Fantasy)
func SearchFantLab(query string) ([]models.CatalogSearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}

	client := &http.Client{Timeout: 6 * time.Second}
	searchURL := fmt.Sprintf("https://api.fantlab.ru/search-works?q=%s", url.QueryEscape(query))

	req, err := http.NewRequest("GET", searchURL, nil)
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
		return nil, fmt.Errorf("fantlab search API status %d", resp.StatusCode)
	}

	var searchResults []struct {
		WorkID       interface{} `json:"work_id"`
		WorkName     string      `json:"work_name"`
		WorkNameOrig string      `json:"work_name_orig"`
		AutorName    string      `json:"autor_name"`
		WorkYear     interface{} `json:"work_year"`
	}

	bodyBytes, _ := io.ReadAll(resp.Body)
	if err := json.Unmarshal(bodyBytes, &searchResults); err != nil {
		return nil, err
	}

	var results []models.CatalogSearchResult
	limit := 3
	if len(searchResults) < limit {
		limit = len(searchResults)
	}

	for i := 0; i < limit; i++ {
		item := searchResults[i]
		workIDStr := fmt.Sprintf("%v", item.WorkID)
		if workIDStr == "" || workIDStr == "<nil>" {
			continue
		}

		title := item.WorkName
		if title == "" {
			title = item.WorkNameOrig
		}
		if title == "" {
			continue
		}

		yearStr := ""
		if item.WorkYear != nil {
			yearStr = fmt.Sprintf("%v", item.WorkYear)
		}

		// Fetch extended work details for description and cover image
		extURL := fmt.Sprintf("https://api.fantlab.ru/work/%s/extended", workIDStr)
		extReq, _ := http.NewRequest("GET", extURL, nil)
		extReq.Header.Set("User-Agent", "TrackListBot/1.0")
		extResp, extErr := client.Do(extReq)

		desc := ""
		coverURL := ""
		if extErr == nil && extResp.StatusCode == http.StatusOK {
			var extData struct {
				WorkDescription string `json:"work_description"`
				Image           string `json:"image"`
				Rating          struct {
					Rating interface{} `json:"rating"`
				} `json:"rating"`
			}
			if json.NewDecoder(extResp.Body).Decode(&extData) == nil {
				desc = extData.WorkDescription
				if extData.Image != "" {
					if strings.HasPrefix(extData.Image, "http") {
						coverURL = extData.Image
					} else {
						coverURL = "https://fantlab.ru" + extData.Image
					}
				}
			}
			extResp.Body.Close()
		}

		optimizedPoster := OptimizePosterURL(client, coverURL)

		results = append(results, models.CatalogSearchResult{
			ID:          "fantlab_" + workIDStr,
			Title:       title,
			Category:    "book",
			Author:      item.AutorName,
			ReleaseYear: yearStr,
			Description: desc,
			PosterURL:   optimizedPoster,
			Source:      "online",
		})
	}

	return results, nil
}

// SearchOpenLibrary queries Open Library API
func SearchOpenLibrary(query string) ([]models.CatalogSearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}

	client := &http.Client{Timeout: 6 * time.Second}
	apiURL := fmt.Sprintf("https://openlibrary.org/search.json?q=%s&limit=5", url.QueryEscape(query))

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
		return nil, fmt.Errorf("openlibrary API status %d", resp.StatusCode)
	}

	var data struct {
		Docs []struct {
			Title            string   `json:"title"`
			AuthorName       []string `json:"author_name"`
			FirstPublishYear int      `json:"first_publish_year"`
			CoverI           int      `json:"cover_i"`
			ISBN             []string `json:"isbn"`
		} `json:"docs"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return nil, err
	}

	var results []models.CatalogSearchResult
	for _, doc := range data.Docs {
		if strings.TrimSpace(doc.Title) == "" {
			continue
		}

		author := strings.Join(doc.AuthorName, ", ")
		year := ""
		if doc.FirstPublishYear > 0 {
			year = strconv.Itoa(doc.FirstPublishYear)
		}

		isbn := ""
		if len(doc.ISBN) > 0 {
			isbn = doc.ISBN[0]
		}

		coverURL := ""
		if doc.CoverI > 0 {
			coverURL = fmt.Sprintf("https://covers.openlibrary.org/b/id/%d-L.jpg", doc.CoverI)
		} else if isbn != "" {
			coverURL = fmt.Sprintf("https://covers.openlibrary.org/b/isbn/%s-L.jpg", isbn)
		}

		optimizedPoster := OptimizePosterURL(client, coverURL)

		results = append(results, models.CatalogSearchResult{
			Title:       doc.Title,
			Category:    "book",
			Author:      author,
			ReleaseYear: year,
			ISBN:        isbn,
			PosterURL:   optimizedPoster,
			Source:      "online",
		})
	}

	return results, nil
}

// SearchBooksMultiSource queries Google Books, FantLab, and Open Library concurrently
func SearchBooksMultiSource(query string) []models.CatalogSearchResult {
	var combined []models.CatalogSearchResult
	seenTitles := make(map[string]bool)

	addItems := func(items []models.CatalogSearchResult) {
		for _, item := range items {
			key := strings.ToLower(strings.TrimSpace(item.Title))
			if key != "" && !seenTitles[key] {
				seenTitles[key] = true
				combined = append(combined, item)
			}
		}
	}

	// 1. Google Books
	if gbResults, err := SearchGoogleBooks(query); err == nil && len(gbResults) > 0 {
		addItems(gbResults)
	}

	// 2. FantLab
	if flResults, err := SearchFantLab(query); err == nil && len(flResults) > 0 {
		addItems(flResults)
	}

	// 3. Open Library
	if olResults, err := SearchOpenLibrary(query); err == nil && len(olResults) > 0 {
		addItems(olResults)
	}

	return combined
}
