// Single entry point for all data access. Components import `api` from here and
// never talk to a backend directly, so the backend can be swapped by changing
// REACT_APP_API_PROVIDER without touching the UI.
//
// Every provider must implement the same shape (see docs/api-contract.md):
//   api.auth   { getSession, onChange, signIn, signOut }
//   api.buyers { list, create, update, remove }
//   api.items  { list, create, update, remove }
//   api.sales  { list, create, remove }
// Methods return plain row objects and throw an Error on failure.
import { createSupabaseProvider } from './supabaseProvider';
import { createRestProvider } from './restProvider';

const providers = {
  supabase: createSupabaseProvider,
  rest: createRestProvider,
};

const name = process.env.REACT_APP_API_PROVIDER || 'supabase';
if (!providers[name]) {
  throw new Error(`Unknown REACT_APP_API_PROVIDER "${name}" (expected: ${Object.keys(providers).join(', ')})`);
}

export const api = providers[name]();
