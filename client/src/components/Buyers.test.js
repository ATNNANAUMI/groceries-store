import { render, screen, fireEvent, within } from '@testing-library/react';
import Buyers from './Buyers';

jest.mock('../api', () => ({ api: { buyers: {} } }));

const buyers = [
  { id: '1', name: 'Bruno Campos', phone: '11 99999-0000', email: null },
  { id: '2', name: 'Ágata Lima', phone: null, email: 'agata@exemplo.com' },
  { id: '3', name: 'João Guilherme', phone: null, email: null },
];

const names = () => within(screen.getByRole('table')).getAllByRole('row').slice(1)
  .map(row => within(row).getAllByRole('cell')[0].textContent);

test('buyers are listed alphabetically and can be searched', () => {
  render(<Buyers buyers={buyers} refreshBuyers={jest.fn()} />);
  expect(names()).toEqual(['Ágata Lima', 'Bruno Campos', 'João Guilherme']);

  const search = screen.getByRole('searchbox', { name: /buscar cliente/i });
  fireEvent.change(search, { target: { value: 'joao' } });
  expect(names()).toEqual(['João Guilherme']);
  expect(screen.getByText('1 de 3')).toBeInTheDocument();

  fireEvent.change(search, { target: { value: '9999' } });
  expect(names()).toEqual(['Bruno Campos']);

  fireEvent.change(search, { target: { value: 'zzz' } });
  expect(screen.getByText('Nenhum cliente encontrado para "zzz".')).toBeInTheDocument();
});
