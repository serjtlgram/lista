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

/**
 * Converts a 2-letter ISO country code to the corresponding flag emoji.
 * Works by mapping each letter to its Regional Indicator Symbol equivalent.
 * This is pure Unicode math — no emoji literals stored anywhere.
 */
function isoToFlagEmoji(code: string): string {
  if (!code || code.length !== 2) return code;
  const base = 0x1F1E6 - 65; // 'A'.charCodeAt(0) = 65
  return Array.from(code.toUpperCase())
    .map(c => String.fromCodePoint(c.charCodeAt(0) + base))
    .join('');
}

interface CountryFlagProps {
  country?: string;
  className?: string;
}

export const CountryFlag: React.FC<CountryFlagProps> = ({ country, className }) => {
  if (!country || !country.trim()) return null;

  const raw = country.trim();

  // USSR special case
  if (raw === 'USSR' || raw === 'USSR_FLAG') {
    return <USSRFlagSVG className={className} />;
  }

  // Standard 2-letter ISO code → flag emoji
  if (/^[A-Z]{2}$/.test(raw)) {
    const emoji = isoToFlagEmoji(raw);
    return <span className="inline-block align-middle">{emoji}</span>;
  }

  // Fallback: show raw value (should rarely happen with backend normalization)
  return <span className="inline-block align-middle text-gray-400 text-xs font-semibold">{raw}</span>;
};
