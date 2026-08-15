package parser

import (
	"regexp"
	"strings"
	"unicode"
)

// Russian-specific letters that never occur in standard Ukrainian words
var russianLetters = map[rune]bool{
	'ы': true, 'Ы': true,
	'э': true, 'Э': true,
	'ъ': true, 'Ъ': true,
	'ё': true, 'Ё': true,
}

// Ukrainian-specific letters that never occur in standard Russian words
var ukrainianLetters = map[rune]bool{
	'і': true, 'І': true,
	'ї': true, 'Ї': true,
	'є': true, 'Є': true,
	'ґ': true, 'Ґ': true,
}

// Russian-exclusive words (prepositions, conjunctions, pronouns, common title words)
var russianExclusiveWords = map[string]bool{
	// Conjunctions & Prepositions
	"и": true, "или": true, "как": true, "что": true, "где": true,
	"когда": true, "почему": true, "зачем": true, "из": true, "от": true,
	"об": true, "обо": true, "со": true, "ко": true, "во": true,
	"уже": true, "еще": true, "ещё": true, "всегда": true, "никогда": true,
	"только": true, "очень": true, "снова": true, "вместе": true, "между": true,
	"после": true, "около": true, "против": true, "внутри": true, "снаружи": true,
	"сквозь": true, "среди": true, "ввиду": true, "насчет": true, "на счёт": true,
	"это": true, "этот": true, "эта": true, "эти": true, "этого": true, "этому": true,

	// Common nouns & adjectives in media titles
	"приключения": true, "приключение": true, "приключениях": true, "приключениями": true,
	"знакомство": true, "знакомства": true, "знакомством": true,
	"сокровища": true, "сокровище": true, "сокровищ": true,
	"человек": true, "человека": true, "человеке": true, "люди": true,
	"время": true, "времени": true,
	"жизнь": true, "жизни": true,
	"город": true, "города": true, "городе": true,
	"ночь": true, "ночи": true,
	"дело": true, "дела": true, "деле": true,
	"конец": true, "конца": true, "конце": true,
	"начало": true, "начала": true, "начале": true,
	"тайна": true, "тайны": true, "тайне": true,
	"остров": true, "острова": true, "острове": true,
	"побег": true, "побега": true,
	"возвращение": true, "возвращения": true,
	"сражение": true, "сражения": true,
	"убийство": true, "убийства": true,
	"расследование": true, "расследования": true,
	"следствие": true, "следствия": true,
	"охота": true, "охоты": true,
	"охотник": true, "охотники": true, "охотников": true,
	"шпион": true, "шпионы": true,
	"последний": true, "последняя": true, "последнее": true, "последние": true,
	"третий": true, "третья": true, "третье": true, "третьи": true,
	"молодой": true, "молодая": true, "молодое": true, "молодые": true,
	"синий": true, "синяя": true, "синее": true, "синие": true,
	"лучший": true, "лучшая": true, "лучшее": true, "лучшие": true,
	"худший": true, "худшая": true, "худшее": true, "худшие": true,
	"хороший": true, "хорошая": true, "хорошее": true, "хорошие": true,
	"плохой": true, "плохая": true, "плохое": true, "плохие": true,
	"русский": true, "русская": true, "русское": true, "русские": true,
	"российский": true, "российская": true, "российское": true,
	"сериал": true, "сериала": true, "сериале": true, "сериалы": true,
	"серия": true, "серии": true,
	"фильм": true, "фильма": true, "фильмы": true,
	"история": true, "истории": true,
	"война": true, "войны": true, "войне": true,
	"полиция": true, "милиция": true, "армия": true,
	"россия": true, "москва": true, "петербург": true,
	"холмс": true, "холмса": true, "холмсе": true,
	"ватсон": true, "ватсона": true, "ватсоне": true,
	"баскервилей": true,

	// Common Russian given names / patronymics
	"игорь": true, "евгений": true, "алексей": true, "николай": true,
	"сергей": true, "михаил": true, "андрей": true, "владимир": true,
	"дмитрий": true, "александр": true, "владислав": true,
	"дмитриевич": true, "алексеевич": true, "сергеевич": true, "николаевич": true,
}

var wordSplitRegex = regexp.MustCompile(`[^\p{L}\p{N}]+`)

// ContainsRussianSpecificLetters checks for letters that exist only in Russian (ы, э, ъ, ё)
func ContainsRussianSpecificLetters(text string) bool {
	for _, r := range text {
		if russianLetters[r] {
			return true
		}
	}
	return false
}

// ContainsUkrainianSpecificLetters checks for letters that exist only in Ukrainian (і, ї, є, ґ)
func ContainsUkrainianSpecificLetters(text string) bool {
	for _, r := range text {
		if ukrainianLetters[r] {
			return true
		}
	}
	return false
}

// isCyrillicWord checks if word consists primarily of Cyrillic runes
func isCyrillicWord(word string) bool {
	cyrCount := 0
	for _, r := range word {
		if unicode.Is(unicode.Cyrillic, r) {
			cyrCount++
		}
	}
	return cyrCount > 0 && cyrCount >= len([]rune(word))/2
}

// hasRussianWordEndings checks for distinct Russian morphological suffixes
func hasRussianWordEndings(word string) bool {
	runes := []rune(strings.ToLower(word))
	n := len(runes)
	if n < 4 {
		return false
	}

	if !isCyrillicWord(word) {
		return false
	}

	w := string(runes)

	// Adjective feminine ending -ая, -яя (in UK it's -а, -я)
	if strings.HasSuffix(w, "ая") || strings.HasSuffix(w, "яя") {
		return true
	}

	// Adjective neuter ending -ое, -ее (in UK it's -е, -є)
	if strings.HasSuffix(w, "ое") || strings.HasSuffix(w, "ее") {
		return true
	}

	// Adjective plural ending -ые, -ие (in UK it's -і, -ї)
	if strings.HasSuffix(w, "ые") || strings.HasSuffix(w, "ие") {
		return true
	}

	// Adjective masculine ending -ой (e.g. молодой, чужой, живой, родной, крутой, морской, лесной, русский)
	// (In UK: молодий, чужий, живий, рідний, крутий, морський, лісовий, російський)
	if n >= 5 && strings.HasSuffix(w, "ой") {
		// Verify it is not a proper noun like Толстой / Цой or neutral short word
		if w != "ковбой" && w != "плейбой" && w != "герой" && w != "изгой" && w != "прибой" && w != "отстой" && w != "конвой" && w != "убой" && w != "забой" && w != "толстой" && w != "цой" {
			return true
		}
	}

	// Russian reflexive verbs ending in -тся (e.g. начинается, продолжается, боится) - in UK: -ється, -иться, -ються
	if strings.HasSuffix(w, "ется") || strings.HasSuffix(w, "ится") || strings.HasSuffix(w, "утся") || strings.HasSuffix(w, "ются") {
		return true
	}

	return false
}

// IsRussianText determines if a text fragment is definitely in Russian
func IsRussianText(text string) bool {
	trimmed := strings.TrimSpace(text)
	if trimmed == "" {
		return false
	}

	// 1. Direct letter check (ы, э, ъ, ё)
	if ContainsRussianSpecificLetters(trimmed) {
		return true
	}

	// 2. Word tokenization check
	words := wordSplitRegex.Split(strings.ToLower(trimmed), -1)
	for _, w := range words {
		w = strings.TrimSpace(w)
		if w == "" {
			continue
		}

		// Exact match with known Russian words
		if russianExclusiveWords[w] {
			return true
		}

		// Grammatical endings
		if hasRussianWordEndings(w) {
			return true
		}
	}

	return false
}

// IsValidUkrainianResult validates that a search item does not contain Russian language artifacts
func IsValidUkrainianResult(title, description, cast, director string) bool {
	// Title is primary: if title contains Russian, reject immediately
	if IsRussianText(title) {
		return false
	}

	// If cast contains obvious Russian markers (e.g. Russian letters/names/words), reject
	if cast != "" && IsRussianText(cast) {
		return false
	}

	// If director contains obvious Russian markers, reject
	if director != "" && IsRussianText(director) {
		return false
	}

	// If description is present and contains Russian-exclusive letters or words, reject
	if description != "" && IsRussianText(description) {
		return false
	}

	return true
}
