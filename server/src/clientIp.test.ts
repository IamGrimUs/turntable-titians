import { describe, it, expect } from 'vitest';
import { createClientIpResolver } from './clientIp';

const req = (headers: Record<string, string | string[]> = {}, ip: string | undefined = '152.233.76.10') =>
  ({ ip, headers }) as never;

describe('createClientIpResolver', () => {
  it('uses req.ip and ignores X-Real-IP when no header is configured (the default)', () => {
    const resolve = createClientIpResolver(undefined);
    expect(resolve(req({ 'x-real-ip': '75.172.40.68' }))).toBe('152.233.76.10');
    expect(createClientIpResolver('')(req({ 'x-real-ip': '1.2.3.4' }))).toBe('152.233.76.10');
  });

  it('uses the configured header when it holds a valid address', () => {
    const resolve = createClientIpResolver('x-real-ip');
    expect(resolve(req({ 'x-real-ip': '75.172.40.68' }))).toBe('75.172.40.68');
  });

  it('accepts IPv6 addresses', () => {
    const resolve = createClientIpResolver('x-real-ip');
    expect(resolve(req({ 'x-real-ip': '2001:db8::1' }))).toBe('2001:db8::1');
  });

  it('treats the configured name case-insensitively and trims it', () => {
    const resolve = createClientIpResolver('  X-Real-IP ');
    expect(resolve(req({ 'x-real-ip': '75.172.40.68' }))).toBe('75.172.40.68');
  });

  it('falls back to req.ip when the header is missing', () => {
    expect(createClientIpResolver('x-real-ip')(req())).toBe('152.233.76.10');
  });

  it('falls back to req.ip when the header is not an IP address', () => {
    const resolve = createClientIpResolver('x-real-ip');
    for (const bad of ['not-an-ip', '75.172.40.68, 1.2.3.4', '999.1.1.1', '<script>', '']) {
      expect(resolve(req({ 'x-real-ip': bad }))).toBe('152.233.76.10');
    }
  });

  it('takes the first value if the header arrives as a list', () => {
    const resolve = createClientIpResolver('x-real-ip');
    expect(resolve(req({ 'x-real-ip': ['75.172.40.68', '1.2.3.4'] }))).toBe('75.172.40.68');
  });

  it('returns null when there is neither a usable header nor req.ip', () => {
    // Built by hand: the req() helper would substitute its default address for undefined.
    expect(createClientIpResolver('x-real-ip')({ ip: undefined, headers: {} } as never)).toBeNull();
  });
});
