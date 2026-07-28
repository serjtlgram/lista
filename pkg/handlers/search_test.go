package handlers

import (
	"testing"
)

func TestParseSearchQuery(t *testing.T) {
	tests := []struct {
		input       string
		expectedCat string
		expectedQ   string
	}{
		{
			input:       "король артур",
			expectedCat: "",
			expectedQ:   "король артур",
		},
		{
			input:       "книга король артур",
			expectedCat: "book",
			expectedQ:   "король артур",
		},
		{
			input:       "король артур книга",
			expectedCat: "book",
			expectedQ:   "король артур",
		},
		{
			input:       "игра ведьмак",
			expectedCat: "game",
			expectedQ:   "ведьмак",
		},
		{
			input:       "ведьмак 3 игра",
			expectedCat: "game",
			expectedQ:   "ведьмак 3",
		},
		{
			input:       "фильм матрица",
			expectedCat: "movie",
			expectedQ:   "матрица",
		},
		{
			input:       "сериал клон",
			expectedCat: "show",
			expectedQ:   "клон",
		},
		{
			input:       "книга",
			expectedCat: "book",
			expectedQ:   "книга",
		},
		{
			input:       "игра",
			expectedCat: "game",
			expectedQ:   "игра",
		},
	}

	for _, tt := range tests {
		t.Run(tt.input, func(t *testing.T) {
			cat, q := parseSearchQuery(tt.input)
			if cat != tt.expectedCat {
				t.Errorf("parseSearchQuery(%q) category = %q; want %q", tt.input, cat, tt.expectedCat)
			}
			if q != tt.expectedQ {
				t.Errorf("parseSearchQuery(%q) query = %q; want %q", tt.input, q, tt.expectedQ)
			}
		})
	}
}
