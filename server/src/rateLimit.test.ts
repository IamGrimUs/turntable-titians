import { describe, it, expect } from 'vitest';
import { createLimiter } from './rateLimit';

const clock = (start = 1_000_000) => {
  let t = start;
  return { now: () => t, advance: (ms: number) => (t += ms) };
};

describe('createLimiter', () => {
  it('allows up to the limit, then refuses with a retry time', () => {
    const c = clock();
    const l = createLimiter({ limit: 3, windowMs: 60_000, now: c.now });
    expect(l.hit('a').allowed).toBe(true);
    expect(l.hit('a').allowed).toBe(true);
    expect(l.hit('a').allowed).toBe(true);
    const blocked = l.hit('a');
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterSeconds).toBe(60);
  });

  it('counts each key separately', () => {
    const l = createLimiter({ limit: 1, windowMs: 60_000, now: clock().now });
    expect(l.hit('a').allowed).toBe(true);
    expect(l.hit('b').allowed).toBe(true);
    expect(l.hit('a').allowed).toBe(false);
  });

  it('reports the remaining wait, rounded up', () => {
    const c = clock();
    const l = createLimiter({ limit: 1, windowMs: 60_000, now: c.now });
    l.hit('a');
    c.advance(59_500);
    expect(l.hit('a').retryAfterSeconds).toBe(1);
  });

  it('starts a fresh window once the old one has passed', () => {
    const c = clock();
    const l = createLimiter({ limit: 1, windowMs: 60_000, now: c.now });
    l.hit('a');
    expect(l.hit('a').allowed).toBe(false);
    c.advance(60_000);
    expect(l.hit('a').allowed).toBe(true);
  });

  it('cannot grow without bound: stays under maxKeys', () => {
    const l = createLimiter({ limit: 1, windowMs: 60_000, now: clock().now, maxKeys: 100 });
    for (let i = 0; i < 1000; i++) l.hit(`ip-${i}`);
    expect(l.size()).toBeLessThanOrEqual(100);
  });

  it('drops expired keys first when it needs room', () => {
    const c = clock();
    const l = createLimiter({ limit: 1, windowMs: 1_000, now: c.now, maxKeys: 10 });
    for (let i = 0; i < 10; i++) l.hit(`old-${i}`);
    c.advance(2_000);
    l.hit('fresh');
    expect(l.size()).toBe(1);
  });
});
