import { describe, it, expect, vi } from 'vitest';
import { GraphQLError } from 'graphql';
import { createLimiter } from './rateLimit';
import { createMutationLimitPlugin, createIpLimitMiddleware, mutationLimitKey } from './rateLimiting';

const limiter = (limit: number) => createLimiter({ limit, windowMs: 60_000, now: () => 1 });

async function resolveOp(
  plugin: ReturnType<typeof createMutationLimitPlugin>,
  operation: 'query' | 'mutation',
  contextValue: { userId: string | null; ip?: string | null }
) {
  const hooks = await (plugin.requestDidStart as any)({});
  return hooks.didResolveOperation({ operation: { operation }, contextValue });
}

describe('mutationLimitKey', () => {
  it('uses the user when signed in, otherwise the IP', () => {
    expect(mutationLimitKey({ userId: 'u1', ip: '1.1.1.1' })).toBe('user:u1');
    expect(mutationLimitKey({ userId: null, ip: '1.1.1.1' })).toBe('ip:1.1.1.1');
    expect(mutationLimitKey({ userId: null, ip: null })).toBe('ip:unknown');
  });
});

describe('createMutationLimitPlugin', () => {
  it('lets mutations through until the limit, then throws RATE_LIMITED', async () => {
    const plugin = createMutationLimitPlugin(limiter(2));
    const ctx = { userId: 'u1' };
    await resolveOp(plugin, 'mutation', ctx);
    await resolveOp(plugin, 'mutation', ctx);
    const err = await resolveOp(plugin, 'mutation', ctx).catch((e) => e);
    expect(err).toBeInstanceOf(GraphQLError);
    expect(err.extensions.code).toBe('RATE_LIMITED');
    expect(err.extensions.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('never limits plain queries', async () => {
    const plugin = createMutationLimitPlugin(limiter(1));
    for (let i = 0; i < 10; i++) await resolveOp(plugin, 'query', { userId: 'u1' });
  });

  it('limits users independently', async () => {
    const plugin = createMutationLimitPlugin(limiter(1));
    await resolveOp(plugin, 'mutation', { userId: 'u1' });
    await resolveOp(plugin, 'mutation', { userId: 'u2' });
  });
});

describe('createIpLimitMiddleware', () => {
  const run = (mw: ReturnType<typeof createIpLimitMiddleware>, ip = '9.9.9.9') => {
    const res: any = { statusCode: 200, headers: {} as Record<string, string>, body: undefined as unknown };
    res.status = (c: number) => ((res.statusCode = c), res);
    res.set = (k: string, v: string) => ((res.headers[k] = v), res);
    res.json = (b: unknown) => ((res.body = b), res);
    const next = vi.fn();
    mw({ ip } as any, res, next);
    return { res, next };
  };

  it('passes requests under the limit', () => {
    const mw = createIpLimitMiddleware(limiter(2));
    expect(run(mw).next).toHaveBeenCalled();
  });

  it('answers 429 with Retry-After once over the limit, without calling next', () => {
    const mw = createIpLimitMiddleware(limiter(1));
    run(mw);
    const { res, next } = run(mw);
    expect(res.statusCode).toBe(429);
    expect(res.headers['Retry-After']).toBe('60');
    expect(next).not.toHaveBeenCalled();
  });

  it('counts each address separately', () => {
    const mw = createIpLimitMiddleware(limiter(1));
    run(mw, '1.1.1.1');
    expect(run(mw, '2.2.2.2').next).toHaveBeenCalled();
  });
});
