import { useState } from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import SearchSelect from './SearchSelect';

const options = [
  { value: 'a', label: 'João Guilherme' },
  { value: 'b', label: 'Ana Serra', detail: 'R$ 9,00' },
  { value: 'c', label: 'Pão de queijo', disabled: true },
];

function Picker(props) {
  const [value, setValue] = useState('');
  return (
    <>
      <SearchSelect options={options} value={value} onChange={setValue} aria-label="Cliente" {...props} />
      <output data-testid="value">{value}</output>
    </>
  );
}

const input = () => screen.getByRole('combobox', { name: 'Cliente' });
const value = () => screen.getByTestId('value').textContent;

test('typing filters the list ignoring accents and clicking picks an option', () => {
  render(<Picker />);
  fireEvent.focus(input());
  expect(screen.getAllByRole('option')).toHaveLength(3);

  fireEvent.change(input(), { target: { value: 'joao' } });
  expect(screen.getAllByRole('option')).toHaveLength(1);
  fireEvent.click(screen.getByRole('option', { name: 'João Guilherme' }));

  expect(value()).toBe('a');
  expect(input()).toHaveValue('João Guilherme');
  expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
});

test('arrow keys and Enter pick an option; Escape closes without changing it', () => {
  render(<Picker />);
  fireEvent.focus(input());
  fireEvent.keyDown(input(), { key: 'ArrowDown' });
  fireEvent.keyDown(input(), { key: 'Enter' });
  expect(value()).toBe('b');

  fireEvent.click(input());
  fireEvent.change(input(), { target: { value: 'jo' } });
  fireEvent.keyDown(input(), { key: 'Escape' });
  expect(value()).toBe('b');
  expect(input()).toHaveValue('Ana Serra');
});

test('disabled options cannot be picked and no match shows the empty text', () => {
  render(<Picker emptyText="Nenhum cliente encontrado" />);
  fireEvent.focus(input());
  fireEvent.click(screen.getByRole('option', { name: 'Pão de queijo' }));
  expect(value()).toBe('');

  fireEvent.change(input(), { target: { value: 'zzz' } });
  expect(screen.getByText('Nenhum cliente encontrado')).toBeInTheDocument();
});

test('a required picker is invalid until an option is picked', () => {
  render(<Picker required />);
  expect(input()).toBeInvalid();
  fireEvent.focus(input());
  fireEvent.click(screen.getByRole('option', { name: 'Ana Serra R$ 9,00' }));
  expect(input()).toBeValid();
});
