package genres

import (
	_ "embed"
	"encoding/json"
	"strings"
)

//go:embed genres.json
var genresJSON []byte

type GenreItem struct {
	ID string `json:"id"`
	RU string `json:"ru"`
	EN string `json:"en"`
	UK string `json:"uk"`
	ES string `json:"es"`
}

type GenresData struct {
	Movies []GenreItem `json:"movies"`
	Books  []GenreItem `json:"books"`
	Games  []GenreItem `json:"games"`
}

var Data GenresData

func init() {
	if err := json.Unmarshal(genresJSON, &Data); err != nil {
		panic("Failed to parse genres.json: " + err.Error())
	}
}

// GetGenresList returns a list of Russian labels for Telegram inline keyboards based on category
func GetGenresList(category string) []struct {
	Label string
	Val   string
} {
	cat := strings.ToLower(category)
	var list []GenreItem

	if cat == "book" || cat == "books" || cat == "книги" || cat == "книга" {
		list = Data.Books
	} else if cat == "game" || cat == "games" || cat == "игры" || cat == "игра" {
		list = Data.Games
	} else {
		list = Data.Movies
	}

	var result []struct {
		Label string
		Val   string
	}
	for _, g := range list {
		result = append(result, struct {
			Label string
			Val   string
		}{Label: g.RU, Val: g.RU})
	}
	return result
}
