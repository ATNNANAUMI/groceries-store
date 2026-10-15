import { matchesSearch, sortByName } from './search';

test('matchesSearch ignores accents, case and word order', () => {
  expect(matchesSearch('joao', 'João Guilherme')).toBe(true);
  expect(matchesSearch('GUILHERME jo', 'João Guilherme')).toBe(true);
  expect(matchesSearch('maria silva', 'Maria da Silva')).toBe(true);
  expect(matchesSearch('pao de queijo', 'Pão de queijo')).toBe(true);
  expect(matchesSearch('ana', 'Bruno')).toBe(false);
});

test('matchesSearch looks in every field and accepts an empty query', () => {
  expect(matchesSearch('9999', 'Ana', '(11) 99999-0000', null)).toBe(true);
  expect(matchesSearch('', 'Ana')).toBe(true);
  expect(matchesSearch('   ', 'Ana')).toBe(true);
});

test('sortByName sorts alphabetically with accents next to their letter', () => {
  const names = sortByName([{ name: 'Bruno' }, { name: 'Ágata' }, { name: 'ana' }, { name: 'Álvaro' }]).map(r => r.name);
  expect(names).toEqual(['Ágata', 'Álvaro', 'ana', 'Bruno']);
});
