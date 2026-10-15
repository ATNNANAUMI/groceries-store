import { saleTotal, parseDiscount } from './sales';

test('saleTotal applies the discount percentage and rounds to cents', () => {
  expect(saleTotal(8.5, 2)).toBe(17);
  expect(saleTotal('8.50', 2, 0)).toBe(17);
  expect(saleTotal(26.5, 1, 10)).toBe(23.85);
  expect(saleTotal(9, 3, 100)).toBe(0);
  expect(saleTotal(1.005, 1)).toBe(1.01);
});

test('parseDiscount accepts 0–100 and treats blank as 0', () => {
  expect(parseDiscount('')).toBe(0);
  expect(parseDiscount('12.5')).toBe(12.5);
  expect(parseDiscount('100')).toBe(100);
  expect(parseDiscount('-1')).toBeNaN();
  expect(parseDiscount('101')).toBeNaN();
  expect(parseDiscount('abc')).toBeNaN();
});
