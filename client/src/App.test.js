import { render, screen } from '@testing-library/react';
import App from './App';

jest.mock('./api', () => ({
  api: {
    auth: {
      getSession: () => Promise.resolve(null),
      onChange: () => () => {},
      signIn: jest.fn(),
      signOut: jest.fn(),
    },
  },
}));

test('shows the login screen when signed out', async () => {
  render(<App />);
  expect(await screen.findByRole('heading', { name: /sign in/i })).toBeInTheDocument();
});
