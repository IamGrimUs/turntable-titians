import { describe, it, expect, vi } from 'vitest';
import { GraphQLError, parse, Kind, type OperationDefinitionNode } from 'graphql';
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

/** Runs the plugin against a real parsed mutation document. */
async function resolveMutationDoc(
  plugin: ReturnType<typeof createMutationLimitPlugin>,
  source: string,
  contextValue: { userId: string | null; ip?: string | null }
) {
  const document = parse(source);
  const operation = document.definitions.find(
    (d): d is OperationDefinitionNode => d.kind === Kind.OPERATION_DEFINITION
  );
  const hooks = await (plugin.requestDidStart as any)({});
  return hooks.didResolveOperation({ operation, document, contextValue });
}

const aliased = (n: number) =>
  `mutation { ${Array.from({ length: n }, (_, i) => `a${i}: adminDeleteUser(id: "x")`).join(' ')} }`;

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

describe('createMutationLimitPlugin per root field', () => {
  it('counts a single-field mutation as one hit', async () => {
    const plugin = createMutationLimitPlugin(limiter(2));
    const ctx = { userId: 'u1' };
    await resolveMutationDoc(plugin, aliased(1), ctx);
    await resolveMutationDoc(plugin, aliased(1), ctx);
    const err = await resolveMutationDoc(plugin, aliased(1), ctx).catch((e) => e);
    expect(err.extensions.code).toBe('RATE_LIMITED');
  });

  it('consumes one hit per aliased root field', async () => {
    const plugin = createMutationLimitPlugin(limiter(4));
    const ctx = { userId: 'u1' };
    await resolveMutationDoc(plugin, aliased(3), ctx);
    // 3 of 4 used: one more single-field mutation fits, a second does not.
    await resolveMutationDoc(plugin, aliased(1), ctx);
    const err = await resolveMutationDoc(plugin, aliased(1), ctx).catch((e) => e);
    expect(err).toBeInstanceOf(GraphQLError);
    expect(err.extensions.code).toBe('RATE_LIMITED');
  });

  it('rejects a 31-alias request from a fresh user at the 30 per minute limit', async () => {
    const plugin = createMutationLimitPlugin(limiter(30));
    const err = await resolveMutationDoc(plugin, aliased(31), { userId: 'fresh' }).catch((e) => e);
    expect(err).toBeInstanceOf(GraphQLError);
    expect(err.extensions.code).toBe('RATE_LIMITED');
    expect(err.message).toBe('You are doing that too often. Please slow down and try again shortly.');
    expect(err.extensions.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('allows exactly 30 aliases from a fresh user', async () => {
    const plugin = createMutationLimitPlugin(limiter(30));
    await resolveMutationDoc(plugin, aliased(30), { userId: 'fresh' });
  });

  it('counts root fields reached through fragment spreads and inline fragments', async () => {
    const plugin = createMutationLimitPlugin(limiter(3));
    const ctx = { userId: 'u1' };
    const doc = `
      mutation { ...Two ... on Mutation { c: adminDeleteUser(id: "x") } }
      fragment Two on Mutation { a: adminDeleteUser(id: "x") b: adminDeleteUser(id: "y") }
    `;
    await resolveMutationDoc(plugin, doc, ctx); // 3 hits, exactly the limit
    const err = await resolveMutationDoc(plugin, aliased(1), ctx).catch((e) => e);
    expect(err.extensions.code).toBe('RATE_LIMITED');
  });

  it('counts nested fragment spreads', async () => {
    const plugin = createMutationLimitPlugin(limiter(2));
    const doc = `
      mutation { ...Outer }
      fragment Outer on Mutation { ...Inner x: adminDeleteUser(id: "x") }
      fragment Inner on Mutation { y: adminDeleteUser(id: "y") z: adminDeleteUser(id: "z") }
    `;
    const err = await resolveMutationDoc(plugin, doc, { userId: 'u1' }).catch((e) => e);
    expect(err.extensions.code).toBe('RATE_LIMITED');
  });

  it('does not count __typename, but an operation always costs at least one hit', async () => {
    const plugin = createMutationLimitPlugin(limiter(3));
    const ctx = { userId: 'u1' };
    // __typename next to a real field: only the real field counts.
    await resolveMutationDoc(plugin, 'mutation { __typename a: adminDeleteUser(id: "x") }', ctx);
    // __typename alone still costs one hit (2 of 3 used so far).
    await resolveMutationDoc(plugin, 'mutation { __typename }', ctx);
    await resolveMutationDoc(plugin, 'mutation { __typename t: __typename }', ctx);
    const err = await resolveMutationDoc(plugin, 'mutation { __typename }', ctx).catch((e) => e);
    expect(err.extensions.code).toBe('RATE_LIMITED');
  });

  it('never limits queries, even with many root fields', async () => {
    const plugin = createMutationLimitPlugin(limiter(1));
    const document = parse('query { a: me b: me c: me }');
    const operation = document.definitions[0];
    const hooks = await (plugin.requestDidStart as any)({});
    for (let i = 0; i < 5; i++) {
      await hooks.didResolveOperation({ operation, document, contextValue: { userId: 'u1' } });
    }
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

  it('counts by the address getIp returns, not req.ip (e.g. one caller behind rotating proxies)', () => {
    const mw = createIpLimitMiddleware(limiter(1), () => '75.172.40.68');
    expect(run(mw, '152.233.76.10').next).toHaveBeenCalled();
    const { res, next } = run(mw, '79.127.217.66');
    expect(res.statusCode).toBe(429);
    expect(next).not.toHaveBeenCalled();
  });
});
