const currency = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

export function formatMoney(value) {
  return currency.format(Number(value) || 0);
}

// YYYY-MM-DD in the user's local timezone (toISOString() would use UTC and
// roll over to tomorrow in the evening for anyone west of UTC).
export function todayLocal() {
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

// Render a YYYY-MM-DD date column without timezone shifting.
export function formatDate(isoDate) {
  if (!isoDate) return '';
  const [y, m, d] = isoDate.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
}

const percent = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

// Discount percentages: up to one decimal, e.g. "10%", "13,2%".
export function formatPercent(value) {
  return `${percent.format(Number(value) || 0)}%`;
}
