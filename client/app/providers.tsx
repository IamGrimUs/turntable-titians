'use client';

import { useEffect, useRef } from 'react';
import { ApolloProvider } from '@apollo/client';
import { SessionProvider, useSession } from 'next-auth/react';
import { client, resetAuthState } from '@/lib/apollo-client';

/**
 * Clears the cached API token and Apollo cache whenever the signed-in user
 * changes while the page stays open. SessionProvider keeps every tab's session
 * in sync, so signing out (or an expired session) in one tab changes the
 * session here too, but the Apollo token/cache live in module state and would
 * otherwise keep acting as the previous user.
 */
function AuthStateSync() {
  const { data: session, status } = useSession();
  const userId = (session?.user as { id?: string } | undefined)?.id ?? null;
  // undefined = we haven't seen a resolved session yet
  const lastUserId = useRef<string | null | undefined>(undefined);

  useEffect(() => {
    if (status === 'loading') return;
    if (lastUserId.current === undefined) {
      lastUserId.current = userId;
      return;
    }
    if (lastUserId.current !== userId) {
      lastUserId.current = userId;
      void resetAuthState();
    }
  }, [status, userId]);

  return null;
}

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <SessionProvider>
      <ApolloProvider client={client}>
        <AuthStateSync />
        {children}
      </ApolloProvider>
    </SessionProvider>
  );
}
