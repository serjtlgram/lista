package parser

import (
	"testing"
)

func TestParseDurationString(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		// ISO 8601 formats
		{"PT0H0M", ""},
		{"PT0M", ""},
		{"PT0S", ""},
		{"PT0H0M0S", ""},
		{"PT", ""},
		{"P0Y0M0DT0H0M0S", ""},
		{"P0DT0H0M0S", ""},
		{"PT43M", "43 мин"},
		{"PT45M", "45 мин"},
		{"PT1H30M", "90 мин"},
		{"PT1H", "60 мин"},
		{"PT2H15M", "135 мин"},
		{"PT90M", "90 мин"},
		{"PT0H45M", "45 мин"},
		{"PT0H45M0S", "45 мин"},
		{"P0DT0H45M0S", "45 мин"},
		{"P0Y0M0DT0H45M0S", "45 мин"},
		{"PT3600S", "60 мин"},
		{"PT2700S", "45 мин"},

		// Russian text formats
		{"43 минуты", "43 мин"},
		{"45 минут", "45 мин"},
		{"1 минута", "1 мин"},
		{"45 мин", "45 мин"},
		{"1 час 30 минут", "90 мин"},
		{"2 часа 15 минут", "135 мин"},
		{"1 ч 30 мин", "90 мин"},
		{"1 ч", "60 мин"},
		{"1ч", "60 мин"},
		{"2 ч 49 мин", "169 мин"},

		// Ukrainian text formats
		{"45 хв", "45 мин"},
		{"1 год 30 хв", "90 мин"},
		{"2 години 10 хвилин", "130 мин"},

		// English text formats
		{"45 min", "45 мин"},
		{"45 minutes", "45 мин"},
		{"1 hr 30 mins", "90 мин"},
		{"2 hours 15 min", "135 мин"},

		// Colon time format
		{"01:30:00", "90 мин"},
		{"01:30", "90 мин"},
		{"00:43:00", "43 мин"},
		{"00:45", "45 мин"},
		{"00:00:00", ""},
		{"00:00", ""},
		{"0:00", ""},

		// Plain numbers
		{"45", "45 мин"},
		{"120", "120 мин"},
		{"0", ""},
		{"0 мин", ""},
		{"0 min", ""},

		// Invalid / empty / placeholder
		{"", ""},
		{"-", ""},
		{"—", ""},
		{"null", ""},
		{"undefined", ""},
	}

	for _, tt := range tests {
		actual := ParseDurationString(tt.input)
		if actual != tt.expected {
			t.Errorf("ParseDurationString(%q) = %q; want %q", tt.input, actual, tt.expected)
		}
	}
}
