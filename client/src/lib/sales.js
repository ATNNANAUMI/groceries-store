// total = quantity × unit price × (1 − discount/100), rounded to cents.
// Used by the sale form preview and by the Supabase provider, so both agree.
export function saleTotal(unitPrice, quantity, discount = 0) {
  const total = Number(unitPrice) * quantity * (1 - Number(discount) / 100);
  return Math.round((total + Number.EPSILON) * 100) / 100;
}

// Discount is a percentage from 0 to 100; blank means 0.
export function parseDiscount(value) {
  if (value === '' || value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) && n >= 0 && n <= 100 ? n : NaN;
}
