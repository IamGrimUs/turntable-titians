import { describe, it, expect, vi } from 'vitest';
import { createClientIpLogger } from './debugClientIp';

const req = (over: Record<string, unknown> = {}) =>
  ({
    ip: '203.0.113.7',
    ips: ['203.0.113.7'],
    headers: { 'x-forwarded-for': '198.51.100.1, 203.0.113.7', 'x-real-ip': '192.0.2.44', authorization: 'Bearer secret-token', cookie: 'a=b' },
    socket: { remoteAddress: '100.64.0.5' },
    app: { get: (k: string) => (k === 'trust proxy' ? 1 : undefined) },
    ...over,
  }) as never;

describe('createClientIpLogger', () => {
  it('does nothing at all when disabled (the default)', () => {
    const log = vi.fn();
    const next = vi.fn();
    createClientIpLogger({ enabled: false, log })(req(), {} as never, next);
    expect(log).not.toHaveBeenCalled();
    expect(next).toHaveBeenCalledTimes(1);
  });

  it('logs what the server sees about the caller address, then continues', () => {
    const log = vi.fn();
    const next = vi.fn();
    createClientIpLogger({ enabled: true, log, replicaId: 'replica-a' })(req(), {} as never, next);
    expect(next).toHaveBeenCalledTimes(1);
    const line = String(log.mock.calls[0][1]);
    expect(line).toContain('203.0.113.7');
    expect(line).toContain('198.51.100.1, 203.0.113.7');
    expect(line).toContain('100.64.0.5');
    expect(line).toContain('"xRealIp":"192.0.2.44"');
    expect(line).toContain('replica-a');
    expect(line).toContain('"trustProxy":1');
  });

  it('never logs credentials or cookies', () => {
    const log = vi.fn();
    createClientIpLogger({ enabled: true, log })(req(), {} as never, vi.fn());
    const line = JSON.stringify(log.mock.calls);
    expect(line).not.toContain('secret-token');
    expect(line).not.toContain('a=b');
  });

  it('stops after the limit so it cannot flood the logs', () => {
    const log = vi.fn();
    const mw = createClientIpLogger({ enabled: true, log, limit: 3 });
    for (let i = 0; i < 10; i++) mw(req(), {} as never, vi.fn());
    expect(log).toHaveBeenCalledTimes(3);
  });

  it('keeps serving requests after the limit is reached', () => {
    const next = vi.fn();
    const mw = createClientIpLogger({ enabled: true, log: vi.fn(), limit: 1 });
    for (let i = 0; i < 5; i++) mw(req(), {} as never, next);
    expect(next).toHaveBeenCalledTimes(5);
  });
});
