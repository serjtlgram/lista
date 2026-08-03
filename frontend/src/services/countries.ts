// Mapping for country names (RU/EN) to flag emojis.
const flagMap: Record<string, string> = {
  // North America
  "сша": "🇺🇸",
  "соединенные штаты америки": "🇺🇸",
  "соединённые штаты америки": "🇺🇸",
  "usa": "🇺🇸",
  "united states": "🇺🇸",
  "united states of america": "🇺🇸",
  "канада": "🇨🇦",
  "canada": "🇨🇦",
  "мексика": "🇲🇽",
  "mexico": "🇲🇽",

  // Europe
  "великобритания": "🇬🇧",
  "соединенное королевство": "🇬🇧",
  "соединённое королевство": "🇬🇧",
  "uk": "🇬🇧",
  "united kingdom": "🇬🇧",
  "франция": "🇫🇷",
  "france": "🇫🇷",
  "германия": "🇩🇪",
  "germany": "🇩🇪",
  "испания": "🇪🇸",
  "spain": "🇪🇸",
  "италия": "🇮🇹",
  "italy": "🇮🇹",
  "россия": "🇷🇺",
  "российская федерация": "🇷🇺",
  "russia": "🇷🇺",
  "ссср": "🚩",
  "ussr": "🚩",
  "украина": "🇺🇦",
  "ukraine": "🇺🇦",
  "беларусь": "🇧🇾",
  "belarus": "🇧🇾",
  "польша": "🇵🇱",
  "poland": "🇵🇱",
  "чехия": "🇨🇿",
  "czech republic": "🇨🇿",
  "czechia": "🇨🇿",
  "швеция": "🇸🇪",
  "sweden": "🇸🇪",
  "дания": "🇩🇰",
  "denmark": "🇩🇰",
  "норвегия": "🇳🇴",
  "norway": "🇳🇴",
  "финляндия": "🇫🇮",
  "finland": "🇫🇮",
  "нидерланды": "🇳🇱",
  "netherlands": "🇳🇱",
  "бельгия": "🇧🇪",
  "belgium": "🇧🇪",
  "швейцария": "🇨🇭",
  "switzerland": "🇨🇭",
  "австрия": "🇦🇹",
  "austria": "🇦🇹",
  "ирландия": "🇮🇪",
  "ireland": "🇮🇪",
  "венгрия": "🇭🇺",
  "hungary": "🇭🇺",
  "румыния": "🇷🇴",
  "romania": "🇷🇴",
  "болгария": "🇧🇬",
  "bulgaria": "🇧🇬",
  "греция": "🇬🇷",
  "greece": "🇬🇷",
  "португалия": "🇵🇹",
  "portugal": "🇵🇹",
  "сербия": "🇷🇸",
  "serbia": "🇷🇸",
  "хорватия": "🇭🇷",
  "croatia": "🇭🇷",
  "исландия": "🇮🇸",
  "iceland": "🇮🇸",

  // Asia
  "япония": "🇯🇵",
  "japan": "🇯🇵",
  "южная корея": "🇰🇷",
  "республика корея": "🇰🇷",
  "корея южная": "🇰🇷",
  "south korea": "🇰🇷",
  "korea": "🇰🇷",
  "китай": "🇨🇳",
  "china": "🇨🇳",
  "индия": "🇮🇳",
  "india": "🇮🇳",
  "гонконг": "🇭🇰",
  "hong kong": "🇭🇰",
  "тайвань": "🇹🇼",
  "taiwan": "🇹🇼",
  "турция": "🇹🇷",
  "turkey": "🇹🇷",
  "таиланд": "🇹🇭",
  "thailand": "🇹🇭",
  "вьетнам": "🇻🇳",
  "vietnam": "🇻🇳",
  "индонезия": "🇮🇩",
  "indonesia": "🇮🇩",
  "филиппины": "🇵🇭",
  "philippines": "🇵🇭",
  "казахстан": "🇰🇿",
  "kazakhstan": "🇰🇿",
  "грузия": "🇬🇪",
  "georgia": "🇬🇪",
  "армения": "🇦🇲",
  "armenia": "🇦🇲",
  "азербайджан": "🇦🇿",
  "azerbaijan": "🇦🇿",
  "израиль": "🇮🇱",
  "israel": "🇮🇱",
  "оаэ": "🇦🇪",
  "объединенные арабские эмираты": "🇦🇪",
  "uae": "🇦🇪",

  // Oceania & South America & Africa
  "австралия": "🇦🇺",
  "australia": "🇦🇺",
  "новая зеландия": "🇳🇿",
  "new zealand": "🇳🇿",
  "бразилия": "🇧🇷",
  "brazil": "🇧🇷",
  "аргентина": "🇦🇷",
  "argentina": "🇦🇷",
  "колумбия": "🇨🇴",
  "colombia": "🇨🇴",
  "чили": "🇨🇱",
  "chile": "🇨🇱",
  "перу": "🇵🇪",
  "peru": "🇵🇪",
  "юар": "🇿🇦",
  "южно-африканская республика": "🇿🇦",
  "south africa": "🇿🇦",
  "египет": "🇪🇬",
  "egypt": "🇪🇬",
};

export const getCountryFlag = (countryStr: string): string => {
  if (!countryStr || !countryStr.trim()) return '';

  const parts = countryStr.split(/[,/]/).map(p => p.trim()).filter(Boolean);
  const flags: string[] = [];

  for (const part of parts) {
    const lower = part.toLowerCase();
    if (flagMap[lower]) {
      if (!flags.includes(flagMap[lower])) {
        flags.push(flagMap[lower]);
      }
    }
  }

  // If flags were matched, return joined flags (max 2)
  if (flags.length > 0) {
    return flags.slice(0, 2).join(' ');
  }

  // Fallback: if no emoji flag matched, return cleaned original text
  return parts[0] || '';
};
