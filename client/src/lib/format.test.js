import { formatMoney, todayLocal } from './format';

test('formatMoney formats numbers and numeric strings', () => {
  expect(formatMoney(3)).toBe('$3.00');
  expect(formatMoney('12.5')).toBe('$12.50');
  expect(formatMoney(null)).toBe('$0.00');
});

test('todayLocal uses the local calendar date', () => {
  jest.useFakeTimers().setSystemTime(new Date(2026, 9, 7, 23, 30));
  expect(todayLocal()).toBe('2026-10-07');
  jest.useRealTimers();
});
