// Generate SQL to fix garbled emoji -> ISO codes in DB
// The emoji bytes got double-encoded: UTF-8 bytes treated as CP1251, then re-encoded to UTF-8

// CP1251 0x80-0xFF -> Unicode table
const cp1251 = [
  0x0402,0x0403,0x201A,0x0453,0x201E,0x2026,0x2020,0x2021,0x20AC,0x2030,0x0409,0x2039,0x040A,0x040C,0x040B,0x040F,
  0x0452,0x2018,0x2019,0x201C,0x201D,0x2022,0x2013,0x2014,0x0000,0x2122,0x0459,0x203A,0x045A,0x045C,0x045B,0x045F,
  0x00A0,0x040E,0x045E,0x0408,0x00A4,0x0490,0x00A6,0x00A7,0x0401,0x00A9,0x0404,0x00AB,0x00AC,0x00AD,0x00AE,0x0407,
  0x00B0,0x00B1,0x0406,0x0456,0x0491,0x00B5,0x00B6,0x00B7,0x0451,0x2116,0x0454,0x00BB,0x0458,0x0405,0x0455,0x0457,
  0x0410,0x0411,0x0412,0x0413,0x0414,0x0415,0x0416,0x0417,0x0418,0x0419,0x041A,0x041B,0x041C,0x041D,0x041E,0x041F,
  0x0420,0x0421,0x0422,0x0423,0x0424,0x0425,0x0426,0x0427,0x0428,0x0429,0x042A,0x042B,0x042C,0x042D,0x042E,0x042F,
  0x0430,0x0431,0x0432,0x0433,0x0434,0x0435,0x0436,0x0437,0x0438,0x0439,0x043A,0x043B,0x043C,0x043D,0x043E,0x043F,
  0x0440,0x0441,0x0442,0x0443,0x0444,0x0445,0x0446,0x0447,0x0448,0x0449,0x044A,0x044B,0x044C,0x044D,0x044E,0x044F,
];

function cp1251ByteToUnicode(b) {
  if (b < 0x80) return b;
  return cp1251[b - 0x80];
}

function flagBytesToGarbled(flagBytes) {
  return flagBytes.map(b => {
    const cp = cp1251ByteToUnicode(b);
    return String.fromCodePoint(cp);
  }).join('');
}

function isoToFlagBytes(code) {
  const result = [];
  for (const c of code) {
    const idx = c.charCodeAt(0) - 65; // A=0, B=1, ...
    result.push(0xF0, 0x9F, 0x87, 0xA6 + idx);
  }
  return result;
}

const flags = ['US','GB','RU','UA','JP','KR','FR','DE','ES','IT','CN','CA','AU','IN','MX','BR','IE','SE','DK','NO','FI','NL','BE','CH','AT','PL','CZ','TR','NZ','HK','TW','AR','AE','ZA','BY','KZ','PT','RO','HU','GR','IL','TH','SG','ID','MY','VN','CO','CL','PE','EG','NG','PK','IR','DZ','MA','ET'];

const lines = ['-- Fix garbled emoji country codes -> ISO 2-letter codes', 'UPDATE items SET country = CASE'];

for (const flag of flags) {
  const bytes = isoToFlagBytes(flag);
  const garbled = flagBytesToGarbled(bytes);
  // Use hex representation for safety in SQL
  const hexStr = Buffer.from(garbled, 'utf8').toString('hex');
  lines.push('  WHEN encode(country::bytea, \'hex\') = \'' + hexStr + '\' THEN \'' + flag + '\'');
}

// Also handle already-correct ISO codes (2 uppercase letters)
lines.push('  WHEN country ~ \'^[A-Z]{2}$\' THEN country');
lines.push('  WHEN country = \'USSR\' THEN \'USSR\'');
lines.push('  WHEN country = \'USSR_FLAG\' THEN \'USSR\'');
lines.push('  ELSE country');
lines.push('END');
lines.push('WHERE country IS NOT NULL;');
lines.push('');
lines.push('-- Show results');
lines.push("SELECT country, COUNT(*) as cnt FROM items WHERE country IS NOT NULL AND country != '' GROUP BY country ORDER BY cnt DESC LIMIT 60;");

const fs = require('fs');
fs.writeFileSync('fix_countries_v2.sql', lines.join('\n'), 'utf8');
console.log('Generated fix_countries_v2.sql with', flags.length, 'flag mappings');

// Also show some examples for verification
console.log('\nSample mappings:');
for (const f of ['US','RU','GB','JP','FR']) {
  const bytes = isoToFlagBytes(f);
  const garbled = flagBytesToGarbled(bytes);
  const hex = Buffer.from(garbled, 'utf8').toString('hex');
  console.log(f + ' -> garbled: ' + garbled + ' -> hex: ' + hex);
}
