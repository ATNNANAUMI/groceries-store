// Accent- and case-insensitive text search, so "joao" finds "João".
export function normalize(text) {
  return String(text ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .trim();
}

// True when every word of the query appears in one of the fields ("maria silva" finds "Maria da Silva").
export function matchesSearch(query, ...fields) {
  const words = normalize(query).split(/\s+/).filter(Boolean);
  if (words.length === 0) return true;
  const haystack = fields.map(normalize).join(' ');
  return words.every(word => haystack.includes(word));
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

// Alphabetical order by name, as people expect it in Portuguese (Á next to A).
export function sortByName(rows) {
  return [...rows].sort((a, b) => collator.compare(a.name, b.name));
}
