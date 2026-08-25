import { vi } from 'vitest';

// A minimal stand-in for supabase-js's PostgrestFilterBuilder: every
// filter/select method returns itself (chainable), and the chain is
// "thenable" so `await` on it — with or without a terminal
// .maybeSingle() — resolves to whatever response this table was
// configured with.
function chainable(response) {
  const chain = {
    select: () => chain,
    eq: () => chain,
    is: () => chain,
    in: () => chain,
    order: () => chain,
    limit: () => chain,
    maybeSingle: () => Promise.resolve(response),
    then: (resolve, reject) => Promise.resolve(response).then(resolve, reject),
  };
  return chain;
}

// responses: { [tableName]: { data, error } } — one response per table
// name, which is enough because no function under test queries the same
// table twice with two different expected results inside one call.
export function createMockSupabase({ responses = {}, rpcResponses = {}, session = null } = {}) {
  return {
    from: vi.fn((table) => chainable(responses[table] ?? { data: null, error: null })),
    rpc: vi.fn((name) => Promise.resolve(rpcResponses[name] ?? { data: null, error: null })),
    auth: {
      getSession: vi.fn(() => Promise.resolve({ data: { session } })),
      signInWithOtp: vi.fn(() => Promise.resolve({ error: null })),
    },
  };
}
