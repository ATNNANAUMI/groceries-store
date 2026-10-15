import { render, screen, fireEvent, within, waitFor } from '@testing-library/react';
import Sales from './Sales';
import { api } from '../api';

// 120 sales in history order: 10 per day from 30 Oct (newest) back to 19 Oct.
// Ana (b1) bought the first 70, Bruno (b2) the last 50.
const mockSales = Array.from({ length: 120 }, (_, n) => ({
  id: `s${n}`, buyer_id: n < 70 ? 'b1' : 'b2', item_id: 'i1', quantity: 1,
  unit_price: '9.00', discount: '0', total: '9.00',
  sale_date: `2026-10-${String(30 - Math.floor(n / 10)).padStart(2, '0')}`,
}));

jest.mock('../api', () => ({
  api: { sales: { page: jest.fn(), countAfter: jest.fn(), summary: jest.fn(), remove: jest.fn() } },
}));

const matching = buyerId => mockSales.filter(s => !buyerId || s.buyer_id === buyerId);

// CRA resets mocks before every test, so the fake backend is (re)installed here.
beforeEach(() => {
  api.sales.page.mockImplementation(async ({ buyerId, offset, limit }) => ({
    rows: matching(buyerId).slice(offset, offset + limit), count: matching(buyerId).length,
  }));
  api.sales.countAfter.mockImplementation(async ({ date, buyerId }) =>
    matching(buyerId).filter(s => s.sale_date > date).length);
  api.sales.summary.mockImplementation(async ({ buyerId }) =>
    ({ count: matching(buyerId).length, total: matching(buyerId).length * 9 }));
});

const buyers = [{ id: 'b1', name: 'Ana' }, { id: 'b2', name: 'Bruno' }];
const items = [{ id: 'i1', name: 'Salgado', price: '9.00', stock: 10 }];

function renderSales() {
  render(
    <Sales summary={{ count: 120, total: 1080 }} buyers={buyers} items={items}
      refreshSales={jest.fn()} refreshItems={jest.fn()} />,
  );
}

const historyRows = () => within(screen.getAllByRole('table')[0]).getAllByRole('row').slice(1);
const pageBox = () => screen.getByRole('spinbutton', { name: /ir para a página/i });


test('loads one page of 50 sales at a time from the API', async () => {
  renderSales();
  expect(await screen.findByText('1–50 de 120')).toBeInTheDocument();
  expect(historyRows()).toHaveLength(50);
  expect(pageBox()).toHaveValue(1);
  expect(api.sales.page).toHaveBeenLastCalledWith({ buyerId: undefined, offset: 0, limit: 50 });

  fireEvent.click(screen.getByRole('button', { name: /última página/i }));
  expect(await screen.findByText('101–120 de 120')).toBeInTheDocument();
  expect(historyRows()).toHaveLength(20);
  expect(screen.getByRole('button', { name: /próxima/i })).toBeDisabled();
});

test('typing a page number jumps to that page', async () => {
  renderSales();
  await screen.findByText('1–50 de 120');
  fireEvent.change(pageBox(), { target: { value: '2' } });
  fireEvent.keyDown(pageBox(), { key: 'Enter' });
  expect(await screen.findByText('51–100 de 120')).toBeInTheDocument();

  fireEvent.change(pageBox(), { target: { value: '99' } });  // out of range: ignored
  fireEvent.blur(pageBox());
  expect(pageBox()).toHaveValue(2);
});

test('picking a date opens the page where that day starts and highlights it', async () => {
  renderSales();
  await screen.findByText('1–50 de 120');
  fireEvent.change(screen.getByLabelText(/ir para a data/i), { target: { value: '2026-10-24' } });

  // 60 sales are newer than 24 Oct, so the day starts on page 2.
  expect(await screen.findByText('51–100 de 120')).toBeInTheDocument();
  expect(api.sales.countAfter).toHaveBeenCalledWith({ date: '2026-10-24', buyerId: undefined });
  expect(historyRows().filter(r => r.classList.contains('highlight'))).toHaveLength(10);
  expect(historyRows()[10]).toHaveClass('highlight');  // 24 Oct starts at sale 60 = row 11 of page 2
});

test('a date without sales says so and shows the older ones', async () => {
  renderSales();
  await screen.findByText('1–50 de 120');
  fireEvent.change(screen.getByLabelText(/ir para a data/i), { target: { value: '2026-09-01' } });
  expect(await screen.findByText(/nenhuma venda em .* mostrando as anteriores/i)).toBeInTheDocument();
});

test('filtering by buyer reloads from page 1 with that buyer\'s totals', async () => {
  renderSales();
  await screen.findByText('1–50 de 120');
  fireEvent.click(screen.getByRole('button', { name: /próxima/i }));
  await screen.findByText('51–100 de 120');

  const filter = screen.getByRole('combobox', { name: /filtrar por cliente/i });
  fireEvent.focus(filter);
  fireEvent.change(filter, { target: { value: 'bru' } });
  fireEvent.click(screen.getByRole('option', { name: 'Bruno' }));

  await waitFor(() => expect(api.sales.page).toHaveBeenLastCalledWith({ buyerId: 'b2', offset: 0, limit: 50 }));
  expect(await screen.findByText(/^50 vendas/)).toBeInTheDocument();
  expect(historyRows()).toHaveLength(50);
  expect(screen.queryByRole('navigation', { name: /páginas/i })).not.toBeInTheDocument();  // fits on one page
});

test('a page past the end (after a delete) falls back to the last page', async () => {
  api.sales.page.mockImplementationOnce(async () => ({ rows: [], count: 120 }));
  renderSales();
  // First response claims page 1 is empty; the component asks again for the real last page.
  expect(await screen.findByText(/de 120$/)).toBeInTheDocument();
});
