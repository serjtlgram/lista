package parser

import (
	"testing"
)

func TestCleanBookDescription(t *testing.T) {
	tests := []struct {
		name     string
		input    string
		expected string
	}{
		{
			name: "Exact user prompt disclaimer at beginning",
			input: "НЕЗАКОННОЕ ПОТРЕБЛЕНИЕ НАРКОТИЧЕСКИХ СРЕДСТВ, ПСИХОТРОПНЫХ ВЕЩЕСТВ, ИХ АНАЛОГОВ ПРИЧИНЯЕТ ВРЕД ЗДОРОВЬЮ, ИХ НЕЗАКОННЫЙ ОБОРОТ ЗАПРЕЩЕН И ВЛЕЧЕТ УСТАНОВЛЕННУЮ ЗАКОНОДАТЕЛЬСТВОМ ОТВЕТСТВЕННОСТЬ " +
				"Знаменитый роман Михаила Булгакова «Мастер и Маргарита».",
			expected: "Знаменитый роман Михаила Булгакова «Мастер и Маргарита».",
		},
		{
			name: "Disclaimer with attention prefix and period",
			input: "Внимание! Незаконное потребление наркотических средств, психотропных веществ, их аналогов причиняет вред здоровью, их незаконный оборот запрещен и влечет установленную законодательством ответственность.\n\nЗахватывающая история о приключениях.",
			expected: "Захватывающая история о приключениях.",
		},
		{
			name: "Disclaimer in parentheses",
			input: "(Незаконное потребление наркотических средств, психотропных веществ, их аналогов причиняет вред здоровью, их незаконный оборот запрещен и влечет установленную законодательством ответственность) Описание книги.",
			expected: "Описание книги.",
		},
		{
			name: "Foreign agent disclaimer + 18+ at start",
			input: "18+ НАСТОЯЩИЙ МАТЕРИАЛ (ИНФОРМАЦИЯ) ПРОИЗВЕДЕН, РАСПРОСТРАНЕН И (ИЛИ) НАПРАВЛЕН ИНОСТРАННЫМ АГЕНТОМ. Замечательная книга про космос.",
			expected: "Замечательная книга про космос.",
		},
		{
			name:     "Only disclaimer in text",
			input:    "НЕЗАКОННОЕ ПОТРЕБЛЕНИЕ НАРКОТИЧЕСКИХ СРЕДСТВ, ПСИХОТРОПНЫХ ВЕЩЕСТВ, ИХ АНАЛОГОВ ПРИЧИНЯЕТ ВРЕД ЗДОРОВЬЮ, ИХ НЕЗАКОННЫЙ ОБОРОТ ЗАПРЕЩЕН И ВЛЕЧЕТ УСТАНОВЛЕННУЮ ЗАКОНОДАТЕЛЬСТВОМ ОТВЕТСТВЕННОСТЬ.",
			expected: "",
		},
		{
			name:     "Clean description untouched",
			input:    "Классический детектив с элементами триллера.",
			expected: "Классический детектив с элементами триллера.",
		},
		{
			name:     "Empty string",
			input:    "",
			expected: "",
		},
	}

	for _, tc := range tests {
		t.Run(tc.name, func(t *testing.T) {
			actual := CleanBookDescription(tc.input)
			if actual != tc.expected {
				t.Errorf("expected: %q, got: %q", tc.expected, actual)
			}
		})
	}
}

func TestCleanISBN(t *testing.T) {
	tests := []struct {
		input    string
		expected string
	}{
		{"978-5-17-090845-6", "978-5-17-090845-6"},
		{"ISBN: 978-5-17-090845-6", "978-5-17-090845-6"},
		{"ISBN-13: 978-5-17-090845-6", "978-5-17-090845-6"},
		{"9785170908456", "9785170908456"},
		{"0-452-28423-4", "0-452-28423-4"},
		{"ISBN 0-452-28423-4", "0-452-28423-4"},
		{"0-8044-2957-X", "0-8044-2957-X"},
	}

	for _, tc := range tests {
		actual := CleanISBN(tc.input)
		if actual != tc.expected {
			t.Errorf("CleanISBN(%q) = %q; expected %q", tc.input, actual, tc.expected)
		}
	}
}
