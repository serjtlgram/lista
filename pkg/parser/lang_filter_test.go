package parser

import (
	"testing"
)

func TestIsRussianText(t *testing.T) {
	russianTitles := []string{
		"Шерлок Холмс и доктор Ватсон: Знакомство",
		"Шерлок Холмс и приключения на...",
		"Приключения Шерлока Холмса и доктора Ватсона",
		"Молодой Шерлок",
		"Звёздные войны: Новая надежда",
		"Гарри Поттер и философский камень",
		"Во все тяжкие",
		"Игра престолов",
		"Один дома",
		"Начало",
		"Матрица",
		"Черный лебедь",
		"Это мы",
		"Ночной дозор",
		"Последнее королевство",
	}

	for _, title := range russianTitles {
		if !IsRussianText(title) {
			t.Errorf("Expected IsRussianText(%q) = true, got false", title)
		}
	}

	ukrainianTitles := []string{
		"Пригоди Шерлока Голмса і доктора Вотсона",
		"Шерлок Online",
		"Шерлок Голмс і доктор Вотсон: Знайомство",
		"Шерлок",
		"Зоряні війни: Епізод IV - Нова надія",
		"Гаррі Поттер і філософський камінь",
		"Пуститися берега",
		"Гра престолів",
		"Один удома",
		"Початок",
		"Матриця",
		"Кобзар",
		"Титанік",
		"Аватар",
		"1984",
		"Cyberpunk 2077",
	}

	for _, title := range ukrainianTitles {
		if IsRussianText(title) {
			t.Errorf("Expected IsRussianText(%q) = false, got true", title)
		}
	}
}

func TestIsValidUkrainianResult(t *testing.T) {
	// Russian items that should be rejected
	if IsValidUkrainianResult("Шерлок Холмс и доктор Ватсон: Знакомство", "Советский фильм...", "Василий Ливанов, Виталий Соломин", "Игорь Масленников") {
		t.Errorf("Expected Russian Sherlock item to be rejected, but was accepted")
	}

	if IsValidUkrainianResult("Молодой Шерлок", "Фильм про...", "", "") {
		t.Errorf("Expected 'Молодой Шерлок' to be rejected, but was accepted")
	}

	// Ukrainian items that should be accepted
	if !IsValidUkrainianResult("Пригоди Шерлока Голмса і доктора Вотсона", "Український переклад...", "Василь Ліванов", "Ігор Масленников") {
		t.Errorf("Expected Ukrainian Sherlock item to be accepted, but was rejected")
	}

	if !IsValidUkrainianResult("Шерлок Online", "", "", "") {
		t.Errorf("Expected 'Шерлок Online' to be accepted, but was rejected")
	}

	if !IsValidUkrainianResult("Шерлок", "Британський серіал...", "Бенедикт Камбербетч", "") {
		t.Errorf("Expected Ukrainian Sherlock series to be accepted, but was rejected")
	}
}
