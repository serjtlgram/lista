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

// httpGet is a helper for simple GET requests with User-Agent
func bookHTTPGet(rawURL string, timeoutSec int) (*http.Response, error) {
	client := &http.Client{Timeout: time.Duration(timeoutSec) * time.Second}
	req, err := http.NewRequest("GET", rawURL, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("User-Agent", "TrackListBot/1.0")
	return client.Do(req)
}

// SearchGoogleBooks queries Google Books API with langRestrict=ru
func SearchGoogleBooks(query string) ([]models.CatalogSearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}

	apiURL := fmt.Sprintf("https://www.googleapis.com/books/v1/volumes?q=%s&langRestrict=ru&maxResults=5", url.QueryEscape(query))
	resp, err := bookHTTPGet(apiURL, 6)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google books API status %d", resp.StatusCode)
	}

	return parseGoogleBooksResponse(resp.Body, "gbooks_ru_")
}

// SearchGoogleBooksAny queries Google Books API without language restriction (catches all languages)
func SearchGoogleBooksAny(query string) ([]models.CatalogSearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}

	// Use intitle: prefix for better precision, no langRestrict
	apiURL := fmt.Sprintf("https://www.googleapis.com/books/v1/volumes?q=%s&maxResults=5", url.QueryEscape(query))
	resp, err := bookHTTPGet(apiURL, 6)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("google books intitle API status %d", resp.StatusCode)
	}

	return parseGoogleBooksResponse(resp.Body, "gbooks_any_")
}

// parseGoogleBooksResponse parses a Google Books API JSON response body
func parseGoogleBooksResponse(body io.Reader, idPrefix string) ([]models.CatalogSearchResult, error) {
	var data struct {
		Items []struct {
			ID         string `json:"id"`
			VolumeInfo struct {
				Title         string   `json:"title"`
				Authors       []string `json:"authors"`
				PublishedDate string   `json:"publishedDate"`
				Description   string   `json:"description"`
				PageCount     int      `json:"pageCount"`
				ImageLinks    struct {
					Thumbnail      string `json:"thumbnail"`
					SmallThumbnail string `json:"smallThumbnail"`
					ExtraLarge     string `json:"extraLarge"`
					Large          string `json:"large"`
					Medium         string `json:"medium"`
				} `json:"imageLinks"`
				IndustryIdentifiers []struct {
					Type       string `json:"type"`
					Identifier string `json:"identifier"`
				} `json:"industryIdentifiers"`
			} `json:"volumeInfo"`
		} `json:"items"`
	}

	if err := json.NewDecoder(body).Decode(&data); err != nil {
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

		// Best quality cover: ExtraLarge > Large > Medium > Thumbnail > SmallThumbnail
		cover := info.ImageLinks.ExtraLarge
		if cover == "" {
			cover = info.ImageLinks.Large
		}
		if cover == "" {
			cover = info.ImageLinks.Medium
		}
		if cover == "" {
			cover = info.ImageLinks.Thumbnail
		}
		if cover == "" {
			cover = info.ImageLinks.SmallThumbnail
		}
		if cover != "" {
			// High-res hack: upgrade zoom and strip edge=curl
			cover = strings.ReplaceAll(cover, "http://", "https://")
			cover = strings.ReplaceAll(cover, "zoom=1", "zoom=5")
			cover = strings.ReplaceAll(cover, "&edge=curl", "")
		}

		results = append(results, models.CatalogSearchResult{
			ID:          idPrefix + item.ID,
			Title:       info.Title,
			Category:    "book",
			Author:      author,
			ReleaseYear: year,
			Duration:    pagesStr,
			ISBN:        isbn,
			Description: info.Description,
			PosterURL:   cover, // Return raw URL directly — no OptimizePosterURL to avoid extra HTTP calls
			Source:      "online",
		})
	}

	return results, nil
}

// SearchFantLab queries FantLab API (Russian sci-fi / fantasy database)
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
		Image        string      `json:"image"`
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

		// Use cover from search result (available immediately), avoid second HTTP request
		coverURL := ""
		if item.Image != "" {
			if strings.HasPrefix(item.Image, "http") {
				coverURL = item.Image
			} else {
				coverURL = "https://fantlab.ru" + item.Image
			}
		}

		// Optionally fetch extended details for description (with a short timeout)
		desc := ""
		extURL := fmt.Sprintf("https://api.fantlab.ru/work/%s/extended", workIDStr)
		extReq, _ := http.NewRequest("GET", extURL, nil)
		extReq.Header.Set("User-Agent", "TrackListBot/1.0")
		extClient := &http.Client{Timeout: 3 * time.Second}
		extResp, extErr := extClient.Do(extReq)
		if extErr == nil && extResp.StatusCode == http.StatusOK {
			var extData struct {
				WorkDescription string `json:"work_description"`
				Image           string `json:"image"`
			}
			if json.NewDecoder(extResp.Body).Decode(&extData) == nil {
				desc = extData.WorkDescription
				if coverURL == "" && extData.Image != "" {
					if strings.HasPrefix(extData.Image, "http") {
						coverURL = extData.Image
					} else {
						coverURL = "https://fantlab.ru" + extData.Image
					}
				}
			}
			extResp.Body.Close()
		}

		results = append(results, models.CatalogSearchResult{
			ID:          "fantlab_" + workIDStr,
			Title:       title,
			Category:    "book",
			Author:      item.AutorName,
			ReleaseYear: yearStr,
			Description: desc,
			PosterURL:   coverURL,
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

	apiURL := fmt.Sprintf("https://openlibrary.org/search.json?q=%s&limit=5&fields=title,author_name,first_publish_year,cover_i,isbn", url.QueryEscape(query))
	resp, err := bookHTTPGet(apiURL, 6)
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

		// Use cover directly without OptimizePosterURL
		coverURL := ""
		if doc.CoverI > 0 {
			coverURL = fmt.Sprintf("https://covers.openlibrary.org/b/id/%d-L.jpg", doc.CoverI)
		} else if isbn != "" {
			coverURL = fmt.Sprintf("https://covers.openlibrary.org/b/isbn/%s-L.jpg", isbn)
		}

		itemID := "ol_" + isbn
		if isbn == "" {
			itemID = "ol_" + url.QueryEscape(doc.Title)
		}

		results = append(results, models.CatalogSearchResult{
			ID:          itemID,
			Title:       doc.Title,
			Category:    "book",
			Author:      author,
			ReleaseYear: year,
			ISBN:        isbn,
			PosterURL:   coverURL,
			Source:      "online",
		})
	}

	return results, nil
}

// SearchITunesEBooks queries iTunes API specifically for ebooks
func SearchITunesEBooks(query string) ([]models.CatalogSearchResult, error) {
	query = strings.TrimSpace(query)
	if query == "" {
		return nil, nil
	}

	apiURL := fmt.Sprintf("https://itunes.apple.com/search?term=%s&entity=ebook&limit=5&lang=ru_ru", url.QueryEscape(query))
	resp, err := bookHTTPGet(apiURL, 4)
	if err != nil || resp == nil || resp.StatusCode != http.StatusOK {
		if resp != nil {
			resp.Body.Close()
		}
		return nil, nil
	}
	defer resp.Body.Close()

	var data struct {
		Results []struct {
			TrackName        string `json:"trackName"`
			ArtistName       string `json:"artistName"`
			ArtworkUrl100    string `json:"artworkUrl100"`
			PrimaryGenreName string `json:"primaryGenreName"`
			ReleaseDate      string `json:"releaseDate"`
			Description      string `json:"description"`
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
		year := ""
		if len(r.ReleaseDate) >= 4 {
			year = r.ReleaseDate[:4]
		}
		// Upgrade artwork resolution
		poster := strings.ReplaceAll(r.ArtworkUrl100, "100x100bb", "600x600bb")

		results = append(results, models.CatalogSearchResult{
			ID:          "itunes_ebook_" + url.QueryEscape(r.TrackName),
			Title:       r.TrackName,
			Category:    "book",
			Author:      r.ArtistName,
			Genre:       r.PrimaryGenreName,
			ReleaseYear: year,
			Description: r.Description,
			PosterURL:   poster,
			Source:      "online",
		})
	}
	return results, nil
}

// SearchBooksMultiSource queries ALL book sources CONCURRENTLY and returns combined results quickly
func SearchBooksMultiSource(query string) []models.CatalogSearchResult {
	type resultSet struct {
		items []models.CatalogSearchResult
	}

	ch := make(chan resultSet, 5)

	// Run all 5 sources in parallel goroutines
	go func() { items, _ := SearchGoogleBooks(query); ch <- resultSet{items} }()
	go func() { items, _ := SearchGoogleBooksAny(query); ch <- resultSet{items} }()
	go func() { items, _ := SearchFantLab(query); ch <- resultSet{items} }()
	go func() { items, _ := SearchOpenLibrary(query); ch <- resultSet{items} }()
	go func() { items, _ := SearchITunesEBooks(query); ch <- resultSet{items} }()

	// Collect all results, wait max 6 seconds
	timer := time.NewTimer(6 * time.Second)
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
