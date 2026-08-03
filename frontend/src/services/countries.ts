import { Language } from './i18n';

// Mapping for known countries (which typically come in Russian from TMDb/Kinopoisk)
// to standard abbreviations or localized full names.
const countryMap: Record<string, Record<string, string>> = {
  "соединенные штаты америки": { ru: "США", en: "USA", uk: "США", es: "EE.UU." },
  "соединённые штаты америки": { ru: "США", en: "USA", uk: "США", es: "EE.UU." },
  "сша": { ru: "США", en: "USA", uk: "США", es: "EE.UU." },
  
  "объединенные арабские эмираты": { ru: "ОАЭ", en: "UAE", uk: "ОАЕ", es: "EAU" },
  "оаэ": { ru: "ОАЭ", en: "UAE", uk: "ОАЕ", es: "EAU" },
  
  "южно-африканская республика": { ru: "ЮАР", en: "RSA", uk: "ПАР", es: "Sudáfrica" },
  "юар": { ru: "ЮАР", en: "RSA", uk: "ПАР", es: "Sudáfrica" },
  
  "великобритания": { ru: "Великобритания", en: "UK", uk: "Велика Британія", es: "Reino Unido" },
  "соединенное королевство": { ru: "Великобритания", en: "UK", uk: "Велика Британія", es: "Reino Unido" },
  
  "россия": { ru: "Россия", en: "Russia", uk: "Росія", es: "Rusia" },
  "российская федерация": { ru: "Россия", en: "Russia", uk: "Росія", es: "Rusia" },
  "франция": { ru: "Франция", en: "France", uk: "Франція", es: "Francia" },
  "германия": { ru: "Германия", en: "Germany", uk: "Німеччина", es: "Alemania" },
  "япония": { ru: "Япония", en: "Japan", uk: "Японія", es: "Japón" },
  
  "южная корея": { ru: "Южная Корея", en: "South Korea", uk: "Південна Корея", es: "Corea del Sur" },
  "республика корея": { ru: "Южная Корея", en: "South Korea", uk: "Південна Корея", es: "Corea del Sur" },
  "корея южная": { ru: "Южная Корея", en: "South Korea", uk: "Південна Корея", es: "Corea del Sur" },
  
  "испания": { ru: "Испания", en: "Spain", uk: "Іспанія", es: "España" },
  "италия": { ru: "Италия", en: "Italy", uk: "Італія", es: "Italia" },
  "китай": { ru: "Китай", en: "China", uk: "Китай", es: "China" },
  "ссср": { ru: "СССР", en: "USSR", uk: "СРСР", es: "URSS" },
  "австралия": { ru: "Австралия", en: "Australia", uk: "Австралія", es: "Australia" },
  "канада": { ru: "Канада", en: "Canada", uk: "Канада", es: "Canadá" },
  "индия": { ru: "Индия", en: "India", uk: "Індія", es: "India" },
  "мексика": { ru: "Мексика", en: "Mexico", uk: "Мексика", es: "México" },
  "бразилия": { ru: "Бразилия", en: "Brazil", uk: "Бразилія", es: "Brasil" },
  "новая зеландия": { ru: "Новая Зеландия", en: "New Zealand", uk: "Нова Зеландія", es: "Nueva Zelanda" },
  "ирландия": { ru: "Ирландия", en: "Ireland", uk: "Ірландія", es: "Irlanda" },
  "швеция": { ru: "Швеция", en: "Sweden", uk: "Швеція", es: "Suecia" },
  "дания": { ru: "Дания", en: "Denmark", uk: "Данія", es: "Dinamarca" },
  "норвегия": { ru: "Норвегия", en: "Norway", uk: "Норвегія", es: "Noruega" },
  "нидерланды": { ru: "Нидерланды", en: "Netherlands", uk: "Нідерланди", es: "Países Bajos" },
  "бельгия": { ru: "Бельгия", en: "Belgium", uk: "Бельгія", es: "Bélgica" },
  "швейцария": { ru: "Швейцария", en: "Switzerland", uk: "Швейцарія", es: "Suiza" },
  "аргентина": { ru: "Аргентина", en: "Argentina", uk: "Аргентина", es: "Argentina" },
  "турция": { ru: "Турция", en: "Turkey", uk: "Туреччина", es: "Turquía" },
  "польша": { ru: "Польша", en: "Poland", uk: "Польща", es: "Polonia" },
  "гонконг": { ru: "Гонконг", en: "Hong Kong", uk: "Гонконг", es: "Hong Kong" },
  "тайвань": { ru: "Тайвань", en: "Taiwan", uk: "Тайвань", es: "Taiwán" },
  "финляндия": { ru: "Финляндия", en: "Finland", uk: "Фінляндія", es: "Finlandia" },
  "чехия": { ru: "Чехия", en: "Czech Republic", uk: "Чехія", es: "República Checa" },
  "австрия": { ru: "Австрия", en: "Austria", uk: "Австрія", es: "Austria" },
  "украина": { ru: "Украина", en: "Ukraine", uk: "Україна", es: "Ucrania" },
  "беларусь": { ru: "Беларусь", en: "Belarus", uk: "Білорусь", es: "Bielorrusia" },
  "казахстан": { ru: "Казахстан", en: "Kazakhstan", uk: "Казахстан", es: "Kazajistán" },
};

export const getTranslatedCountry = (country: string, lang: Language): string => {
  if (!country || !country.trim()) return '';
  
  // Clean string and get the first country if there's a comma-separated list
  const c = country.split(',')[0].trim();
  const lowerC = c.toLowerCase();

  // Try direct lookup
  if (countryMap[lowerC]) {
    return countryMap[lowerC][lang] || countryMap[lowerC]['ru'] || c;
  }

  // Auto-abbreviate if 3 or more words
  const words = c.split(/[\s-]+/);
  if (words.length >= 3) {
    let abbr = '';
    for (const w of words) {
      // Ignore prepositions (usually very short words in Russian)
      if (w.length > 2) {
        abbr += w[0].toUpperCase();
      }
    }
    if (abbr.length >= 2) {
      return abbr;
    }
  }

  // Keep original if not matched and no abbreviation formed
  return c;
};
