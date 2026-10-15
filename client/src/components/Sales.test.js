import { render, screen, fireEvent, within } from '@testing-library/react';
import Sales from './Sales';

jest.mock('../api', () => ({ api: { sales: {} } }));

const buyers = [{ id: 'b1', name: 'Ana' }, { id: 'b2', name: 'Bruno' }];
const items = [{ id: 'i1', name: 'Salgado', price: '9.00', stock: 10 }];
// 120 sales: Ana bought the first 70, Bruno the last 50.
const sales = Array.from({ length: 120 }, (_, n) => ({
  id: `s${n}`, buyer_id: n < 70 ? 'b1' : 'b2', item_id: 'i1', quantity: 1,
  unit_price: '9.00', discount: '0', total: '9.00', sale_date: '2026-10-01',
}));

function renderSales() {
  render(<Sales sales={sales} buyers={buyers} items={items} refreshSales={jest.fn()} refreshItems={jest.fn()} />);
}

const historyRows = () => within(screen.getAllByRole('table')[0]).getAllByRole('row').slice(1);

test('sales history shows 50 sales per page', () => {
  renderSales();
  expect(historyRows()).toHaveLength(50);
  expect(screen.getByText('Página 1 de 3')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /anterior/i })).toBeDisabled();

  fireEvent.click(screen.getByRole('button', { name: /última página/i }));
  expect(screen.getByText('Página 3 de 3')).toBeInTheDocument();
  expect(historyRows()).toHaveLength(20);
  expect(screen.getByText('101–120 de 120')).toBeInTheDocument();
  expect(screen.getByRole('button', { name: /próxima/i })).toBeDisabled();
});

test('changing the buyer filter goes back to the first page', () => {
  renderSales();
  fireEvent.click(screen.getByRole('button', { name: /próxima/i }));
  expect(screen.getByText('Página 2 de 3')).toBeInTheDocument();

  const filter = screen.getByRole('combobox', { name: /filtrar por cliente/i });
  fireEvent.focus(filter);
  fireEvent.change(filter, { target: { value: 'bru' } });
  fireEvent.click(screen.getByRole('option', { name: 'Bruno' }));
  expect(historyRows()).toHaveLength(50);
  expect(screen.queryByText(/página \d+ de/i)).not.toBeInTheDocument();  // 50 sales fit on one page
});
