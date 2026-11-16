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

/** Thrown internally when counting a (cyclic) document takes too much work. */
class TooMuchWork extends Error {}

/**
 * Upper bound on the selections looked at while counting. A valid document needs one look per
 * selection; only a fragment cycle (which validation rejects before this runs) can push the
 * work past that, and this stops it.
 */
const MAX_COUNT_WORK = 200_000;

/**
 * How many limiter hits a mutation costs: one per root field, so aliasing many fields into a
 * single request cannot dodge the limit. Fragment spreads and inline fragments at the root are
 * expanded, and `__typename` is free, but an operation always costs at least one hit.
 *
 * Each fragment is counted once and the result reused for every spread, so a chain of fragments
 * that each spread the next twice is cheap to count however long it is (the cost itself is then
 * enormous, which is the point). A fragment cycle is not counted again on the way back in; if a
 * cycle makes counting take too long, the cost is the largest safe integer.
 */
export function countMutationRootFields(
  operation: OperationDefinitionNode | undefined,
  document?: DocumentNode
): number {
  const fragments = new Map<string, FragmentDefinitionNode>();
  for (const def of document?.definitions ?? []) {
    if (def.kind === Kind.FRAGMENT_DEFINITION) fragments.set(def.name.value, def);
  }
  const counts = new Map<string, number>();
  const visiting = new Set<string>();
  let work = 0;
  // Counts spreads skipped because the fragment was already being expanded (a cycle).
  let cyclesSkipped = 0;

  const count = (set: SelectionSetNode | undefined): number => {
    let total = 0;
    for (const sel of set?.selections ?? []) {
      if (++work > MAX_COUNT_WORK) throw new TooMuchWork();
      if (sel.kind === Kind.FIELD) {
        if (sel.name.value !== '__typename') total += 1;
      } else if (sel.kind === Kind.INLINE_FRAGMENT) {
        total += count(sel.selectionSet);
      } else {
        const name = sel.name.value;
        const known = counts.get(name);
        if (known !== undefined) {
          total += known;
          continue;
        }
        const fragment = fragments.get(name);
        if (!fragment) continue;
        if (visiting.has(name)) {
          cyclesSkipped++;
          continue;
        }
        const cyclesBefore = cyclesSkipped;
        visiting.add(name);
        const fragmentTotal = count(fragment.selectionSet);
        visiting.delete(name);
        total += fragmentTotal;
        // What a fragment adds is the same wherever it is spread, unless it ran into a cycle:
        // skipping the way back in depends on where the walk entered the cycle.
        if (cyclesSkipped === cyclesBefore) counts.set(name, fragmentTotal);
      }
    }
    return total;
  };

  try {
    return Math.max(1, count(operation?.selectionSet));
  } catch (e) {
    if (e instanceof TooMuchWork) return Number.MAX_SAFE_INTEGER;
    throw e;
  }
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
                // http.status 200: an error thrown this early would otherwise be answered with HTTP 500 and
                // no data, which Apollo Client turns into a network error and the message never arrives.
                // Apollo strips `http` before the error is sent to the client.
                extensions: { code: 'RATE_LIMITED', retryAfterSeconds: result.retryAfterSeconds, http: { status: 200 } },
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
