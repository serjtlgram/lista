import React from 'react';

// SVG Icon for Soviet Union (USSR / СССР) flag
export const USSRFlagSVG: React.FC<{ className?: string }> = ({
  className = "w-5 h-3.5 rounded-[2px] shadow-sm overflow-hidden inline-block align-middle"
}) => (
  <svg viewBox="0 0 600 300" className={className} style={{ display: 'inline-block', verticalAlign: 'middle' }}>
    <rect width="600" height="300" fill="#CD1116" />
    <g fill="#FFD700">
      {/* Star */}
      <polygon points="90,20 94,33 108,33 97,41 101,54 90,46 79,54 83,41 72,33 86,33" />
      {/* Sickle */}
      <path d="M 105,100 C 130,75 125,45 100,35 C 75,25 55,45 50,60 C 48,66 54,70 58,66 C 65,55 80,42 98,50 C 112,56 115,78 95,95 Z" />
      {/* Hammer */}
      <path d="M 50,110 L 115,45 L 125,55 L 60,120 Z" />
      <path d="M 100,40 L 125,30 L 135,40 L 110,50 Z" />
    </g>
  </svg>
);

const countryPriority: { keys: string[]; flag: string | 'USSR' }[] = [
  { keys: ['ссср', 'советский союз', 'ussr', 'soviet union', 'su', 'sur'], flag: 'USSR' },
  { keys: ['сша', 'соединенные штаты америки', 'соединённые штаты америки', 'us', 'usa', 'united states', 'united states of america'], flag: '🇺🇸' },
  { keys: ['великобритания', 'соединенное королевство', 'соединённое королевство', 'gb', 'uk', 'united kingdom', 'great britain'], flag: '🇬🇧' },
  { keys: ['россия', 'российская федерация', 'ru', 'rus', 'russia'], flag: '🇷🇺' },
  { keys: ['украина', 'ua', 'ukr', 'ukraine'], flag: '🇺🇦' },
  { keys: ['япония', 'jp', 'jpn', 'japan'], flag: '🇯🇵' },
  { keys: ['южная корея', 'республика корея', 'корея южная', 'kr', 'kor', 'south korea', 'korea'], flag: '🇰🇷' },
  { keys: ['франция', 'fr', 'fra', 'france'], flag: '🇫🇷' },
  { keys: ['германия', 'de', 'deu', 'germany'], flag: '🇩🇪' },
  { keys: ['испания', 'es', 'esp', 'spain'], flag: '🇪🇸' },
  { keys: ['италия', 'it', 'ita', 'italy'], flag: '🇮🇹' },
  { keys: ['китай', 'cn', 'chn', 'china'], flag: '🇨🇳' },
  { keys: ['канада', 'ca', 'can', 'canada'], flag: '🇨🇦' },
  { keys: ['австралия', 'au', 'aus', 'australia'], flag: '🇦🇺' },
  { keys: ['индия', 'in', 'ind', 'india'], flag: '🇮🇳' },
  { keys: ['мексика', 'mx', 'mex', 'mexico'], flag: '🇲🇽' },
  { keys: ['бразилия', 'br', 'bra', 'brazil'], flag: '🇧🇷' },
  { keys: ['ирландия', 'ie', 'irl', 'ireland'], flag: '🇮🇪' },
  { keys: ['швеция', 'se', 'swe', 'sweden'], flag: '🇸🇪' },
  { keys: ['дания', 'dk', 'dnk', 'denmark'], flag: '🇩🇰' },
  { keys: ['норвегия', 'no', 'nor', 'norway'], flag: '🇳🇴' },
  { keys: ['финляндия', 'fi', 'fin', 'finland'], flag: '🇫🇮' },
  { keys: ['нидерланды', 'nl', 'nld', 'netherlands'], flag: '🇳🇱' },
  { keys: ['бельгия', 'be', 'bel', 'belgium'], flag: '🇧🇪' },
  { keys: ['швейцария', 'ch', 'che', 'switzerland'], flag: '🇨🇭' },
  { keys: ['австрия', 'at', 'aut', 'austria'], flag: '🇦🇹' },
  { keys: ['польша', 'pl', 'pol', 'poland'], flag: '🇵🇱' },
  { keys: ['чехия', 'cz', 'cze', 'czech republic', 'czechia'], flag: '🇨🇿' },
  { keys: ['турция', 'tr', 'tur', 'turkey'], flag: '🇹🇷' },
  { keys: ['новая зеландия', 'nz', 'nzl', 'new zealand'], flag: '🇳🇿' },
  { keys: ['гонконг', 'hk', 'hkg', 'hong kong'], flag: '🇭🇰' },
  { keys: ['тайвань', 'tw', 'twn', 'taiwan'], flag: '🇹🇼' },
  { keys: ['аргентина', 'ar', 'arg', 'argentina'], flag: '🇦🇷' },
  { keys: ['оаэ', 'объединенные арабские эмираты', 'ae', 'uae'], flag: '🇦🇪' },
  { keys: ['юар', 'южно-африканская республика', 'za', 'rsa', 'south africa'], flag: '🇿🇦' },
  { keys: ['беларусь', 'by', 'blr', 'belarus'], flag: '🇧🇾' },
  { keys: ['казахстан', 'kz', 'kaz', 'kazakhstan'], flag: '🇰🇿' },
];

interface CountryFlagProps {
  country?: string;
  className?: string;
}

export const CountryFlag: React.FC<CountryFlagProps> = ({ country, className }) => {
  if (!country || !country.trim()) return null;

  const raw = country.toLowerCase().trim();
  const parts = raw.split(/[,/]/).map(p => p.trim());

  // 1. Check priority matches across all parts
  for (const item of countryPriority) {
    for (const p of parts) {
      if (item.keys.includes(p)) {
        if (item.flag === 'USSR') {
          return <USSRFlagSVG className={className} />;
        }
        return <span className="inline-block align-middle">{item.flag}</span>;
      }
    }
  }

  // 2. Substring match fallback for priority list
  for (const item of countryPriority) {
    for (const key of item.keys) {
      if (key.length > 2 && raw.includes(key)) {
        if (item.flag === 'USSR') {
          return <USSRFlagSVG className={className} />;
        }
        return <span className="inline-block align-middle">{item.flag}</span>;
      }
    }
  }

  // 3. Fallback: if single 2-letter uppercase ISO code was passed (e.g. "RU", "US", "SU")
  if (raw === 'su' || raw === 'sur') {
    return <USSRFlagSVG className={className} />;
  }

  // If no flag found, return raw uppercase string (e.g., fallback short text)
  return <span className="inline-block align-middle text-gray-400 font-semibold">{country.trim()}</span>;
};
