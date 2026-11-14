import { ApolloClient, InMemoryCache, HttpLink, ApolloLink, fromPromise } from '@apollo/client';

let cachedToken: string | null = null;
let tokenExpiry = 0;

async function fetchApiToken(): Promise<string | null> {
  if (cachedToken && Date.now() < tokenExpiry) return cachedToken;
  try {
    const res = await fetch('/api/auth/token');
    const data = await res.json();
    cachedToken = data.token ?? null;
    tokenExpiry = Date.now() + 50 * 60 * 1000;
    return cachedToken;
  } catch {
    return null;
  }
}

/**
 * Forget the cached API token and all cached query results, then refetch any
 * active queries as whoever is signed in now. Call this whenever the signed-in
 * user changes (sign-out or sign-in in another tab, expired session) so one
 * user's token and viewer-specific data never carry over to the next.
 */
export async function resetAuthState(): Promise<void> {
  cachedToken = null;
  tokenExpiry = 0;
  try {
    await client.resetStore();
  } catch {
    // A refetch of an active query failed (e.g. now unauthenticated); the
    // store is still cleared, so there is nothing more to do.
  }
}

const authLink = new ApolloLink((operation, forward) =>
  fromPromise(fetchApiToken()).flatMap((token) => {
    if (token) {
      operation.setContext(({ headers = {} }: { headers: Record<string, string> }) => ({
        headers: { ...headers, authorization: `Bearer ${token}` },
      }));
    }
    return forward(operation);
  })
);

const httpLink = new HttpLink({
  uri: process.env.NEXT_PUBLIC_GRAPHQL_URL || 'http://localhost:3001/graphql',
  credentials: 'include',
});

export const client = new ApolloClient({
  link: authLink.concat(httpLink),
  cache: new InMemoryCache(),
  defaultOptions: {
    watchQuery: {
      fetchPolicy: 'cache-and-network',
    },
  },
});
