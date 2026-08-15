// Frontend linguistic filtering for Ukrainian localization

const RUSSIAN_LETTERS_REGEX = /[ыЫэЭъЪёЁ]/;

const RUSSIAN_EXCLUSIVE_WORDS = new Set([
  // Conjunctions & Prepositions
  'и', 'или', 'как', 'что', 'где', 'когда', 'почему', 'зачем', 'из', 'от',
  'об', 'обо', 'со', 'ко', 'во', 'уже', 'еще', 'ещё', 'всегда', 'никогда',
  'только', 'очень', 'снова', 'вместе', 'между', 'после', 'около', 'против',
  'внутри', 'снаружи', 'сквозь', 'среди', 'ввиду', 'насчет',
  'это', 'этот', 'эта', 'эти', 'этого', 'этому',

  // Common nouns & adjectives in media titles
  'приключения', 'приключение', 'приключениях', 'приключениями',
  'знакомство', 'знакомства', 'знакомством',
  'сокровища', 'сокровище', 'сокровищ',
  'человек', 'человека', 'человеке', 'люди',
  'время', 'времени',
  'жизнь', 'жизни',
  'город', 'города', 'городе',
  'ночь', 'ночи',
  'дело', 'дела', 'деле',
  'конец', 'конца', 'конце',
  'начало', 'начала', 'начале',
  'тайна', 'тайны', 'тайне',
  'остров', 'острова', 'острове',
  'побег', 'побега',
  'возвращение', 'возвращения',
  'сражение', 'сражения',
  'убийство', 'убийства',
  'расследование', 'расследования',
  'следствие', 'следствия',
  'охота', 'охоты',
  'охотник', 'охотники', 'охотников',
  'шпион', 'шпионы',
  'последний', 'последняя', 'последнее', 'последние',
  'третий', 'третья', 'третье', 'третьи',
  'молодой', 'молодая', 'молодое', 'молодые',
  'синий', 'синяя', 'синее', 'синие',
  'лучший', 'лучшая', 'лучшее', 'лучшие',
  'худший', 'худшая', 'худшее', 'худшие',
  'хороший', 'хорошая', 'хорошее', 'хорошие',
  'плохой', 'плохая', 'плохое', 'плохие',
  'русский', 'русская', 'русское', 'русские',
  'российский', 'российская', 'российское',
  'сериал', 'сериала', 'сериале', 'сериалы',
  'серия', 'серии',
  'фильм', 'фильма', 'фильмы',
  'история', 'истории',
  'война', 'войны', 'войне',
  'полиция', 'милиция', 'армия',
  'россия', 'москва', 'петербург',
  'холмс', 'холмса', 'холмсе',
  'ватсон', 'ватсона', 'ватсоне',
  'баскервилей',
  'игра', 'игры', 'игре', 'игру', 'игрой', 'игр',
  'престолов', 'престол', 'престолы',
  'дома', 'доме', 'домом',
  'матрица', 'матрицы', 'матрицу', 'матрицей',
  'гарри',
  'звездные', 'звездный', 'звездная', 'звездное',

  // Common Russian given names / patronymics
  'игорь', 'евгений', 'алексей', 'николай',
  'сергей', 'михаил', 'андрей', 'владимир',
  'дмитрий', 'александр', 'владислав',
  'дмитриевич', 'алексеевич', 'сергеевич', 'николаевич',
]);

const CYRILLIC_REGEX = /[\u0400-\u04FF]/;

function hasRussianWordEndings(word: string): boolean {
  const w = word.toLowerCase();
  if (w.length < 4 || !CYRILLIC_REGEX.test(w)) {
    return false;
  }

  // Adjective feminine ending -ая, -яя
  if (w.endsWith('ая') || w.endsWith('яя')) {
    return true;
  }

  // Adjective neuter ending -ое, -ее
  if (w.endsWith('ое') || w.endsWith('ее')) {
    return true;
  }

  // Adjective plural ending -ые, -ие
  if (w.endsWith('ые') || w.endsWith('ие')) {
    return true;
  }

  // Adjective masculine ending -ой
  if (w.length >= 5 && w.endsWith('ой')) {
    const exceptions = ['ковбой', 'плейбой', 'герой', 'изгой', 'прибой', 'отстой', 'конвой', 'убой', 'забой', 'толстой', 'цой'];
    if (!exceptions.includes(w)) {
      return true;
    }
  }

  // Reflexive verb ending -тся, -ться with Russian stems
  if (w.endsWith('ется') || w.endsWith('ится') || w.endsWith('утся') || w.endsWith('ются')) {
    return true;
  }

  return false;
}

export function isRussianText(text?: string): boolean {
  if (!text) return false;
  const trimmed = text.trim();
  if (!trimmed) return false;

  // 1. Direct letter check
  if (RUSSIAN_LETTERS_REGEX.test(trimmed)) {
    return true;
  }

  // 2. Tokenized word check
  const words = trimmed.toLowerCase().split(/[^\p{L}\p{N}]+/u);
  for (const w of words) {
    if (!w) continue;
    if (RUSSIAN_EXCLUSIVE_WORDS.has(w)) {
      return true;
    }
    if (hasRussianWordEndings(w)) {
      return true;
    }
  }

  return false;
}

export function isValidUkrainianCatalogItem(item: {
  title?: string;
  description?: string;
  cast?: string;
  director?: string;
}): boolean {
  if (!item) return false;

  if (isRussianText(item.title)) {
    return false;
  }
  if (isRussianText(item.cast)) {
    return false;
  }
  if (isRussianText(item.director)) {
    return false;
  }
  if (isRussianText(item.description)) {
    return false;
  }

  return true;
}
