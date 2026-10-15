import { formatMoney, formatPercent, todayLocal } from './format';

test('formatMoney formats numbers and numeric strings', () => {
  // pt-BR puts a non-breaking space after R$.
  expect(formatMoney(3)).toBe('R$\u00a03,00');
  expect(formatMoney('1234.5')).toBe('R$\u00a01.234,50');
  expect(formatMoney(null)).toBe('R$\u00a00,00');
});

test('todayLocal uses the local calendar date', () => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 7, 23, 30));
  expect(todayLocal()).toBe('2026-10-07');
  jest.useRealTimers();
});

test('formatPercent shows up to one decimal', () => {
  expect(formatPercent(10)).toBe('10%');
  expect(formatPercent('13.2075')).toBe('13.2%');
});
