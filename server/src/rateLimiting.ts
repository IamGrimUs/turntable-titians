import { GraphQLError, Kind } from 'graphql';
import type { DocumentNode, FragmentDefinitionNode, OperationDefinitionNode, SelectionSetNode } from 'graphql';
import type { ApolloServerPlugin } from '@apollo/server';
import type { NextFunction, Request, Response } from 'express';
import type { createLimiter } from './rateLimit';

type Limiter = ReturnType<typeof createLimiter>;

interface LimitContext {
  userId: string | null;
  ip?: string | null;
}

/** Signed-in users are limited as themselves; anonymous callers by network address. */
export function mutationLimitKey({ userId, ip }: LimitContext): string {
  return userId ? `user:${userId}` : `ip:${ip ?? 'unknown'}`;
}

/**
 * How many limiter hits a mutation costs: one per root field, so aliasing many fields into a
 * single request cannot dodge the limit. Fragment spreads and inline fragments at the root are
 * expanded, and `__typename` is free, but an operation always costs at least one hit.
 */
export function countMutationRootFields(
  operation: OperationDefinitionNode | undefined,
  document?: DocumentNode
): number {
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const def of document?.definitions ?? []) {
    if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def);
  }
  const visiting = new Set<string>();

  const count = (set: SelectionSetNode | undefined): number => {
    let total = 0;
    for (const sel of set?.selections ?? []) {
      if (sel.kind === Kind.FIELD) {
        if (sel.name.value !== '__typename') total += 1;
      } else if (sel.kind === Kind.INLINE_FRAGMENT) {
        total += count(sel.selectionSet);
      } else {
        const name = sel.name.value;
        const fragment = fragments.get(name);
        if (!fragment || visiting.has(name)) continue;
        visiting.add(name);
        total += count(fragment.selectionSet);
        visiting.delete(name);
      }
    }
    return total;
  };

  return Math.max(1, count(operation?.selectionSet));
}

/**
 * Limits how often someone can run mutations (create, vote, update...), counting each root
 * field of a mutation as one.
 * Reads are left alone here; the per-IP limit below covers those.
 */
export function createMutationLimitPlugin(limiter: Limiter): ApolloServerPlugin<LimitContext> {
  return {
    async requestDidStart() {
      return {
        async didResolveOperation({ operation, document, contextValue }) {
          if (operation?.operation !== 'mutation') return;
          const key = mutationLimitKey(contextValue);
          const cost = countMutationRootFields(operation, document);
          for (let i = 0; i < cost; i++) {
            const result = limiter.hit(key);
            if (!result.allowed) {
              throw new GraphQLError('You are doing that too often. Please slow down and try again shortly.', {
                extensions: { code: 'RATE_LIMITED', retryAfterSeconds: result.retryAfterSeconds },
              });
            }
          }
        },
      };
    },
  };
}

/**
 * Caps total requests per network address, whatever they ask for. `getIp` says which address
 * counts as the caller (see clientIp.ts); by default it is Express's `req.ip`.
 */
export function createIpLimitMiddleware(
  limiter: Limiter,
  getIp: (req: Request) => string | null = (req) => req.ip ?? null
) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = limiter.hit(getIp(req) ?? 'unknown');
    if (result.allowed) return next();
    res.set('Retry-After', String(result.retryAfterSeconds));
    res.status(429).json({ error: 'Too many requests. Please slow down.' });
  };
}
