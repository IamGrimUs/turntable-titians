import { GraphQLError } from 'graphql';
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
 * Limits how often someone can run mutations (create, vote, update...).
 * Reads are left alone here; the per-IP limit below covers those.
 */
export function createMutationLimitPlugin(limiter: Limiter): ApolloServerPlugin<LimitContext> {
  return {
    async requestDidStart() {
      return {
        async didResolveOperation({ operation, contextValue }) {
          if (operation?.operation !== 'mutation') return;
          const result = limiter.hit(mutationLimitKey(contextValue));
          if (!result.allowed) {
            throw new GraphQLError('You are doing that too often. Please slow down and try again shortly.', {
              extensions: { code: 'RATE_LIMITED', retryAfterSeconds: result.retryAfterSeconds },
            });
          }
        },
      };
    },
  };
}

/** Caps total requests per network address, whatever they ask for. */
export function createIpLimitMiddleware(limiter: Limiter) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = limiter.hit(req.ip ?? 'unknown');
    if (result.allowed) return next();
    res.set('Retry-After', String(result.retryAfterSeconds));
    res.status(429).json({ error: 'Too many requests. Please slow down.' });
  };
}
