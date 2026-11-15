import { isIP } from 'node:net';
import type { Request } from 'express';

type RequestLike = Pick<Request, 'ip' | 'headers'>;

/**
 * Works out which address the rate limits count a request against.
 *
 * Behind Railway, Express's `req.ip` is Railway's own edge proxy (it rotates between a few
 * addresses), so every caller was spread over several counters and never reached a limit.
 * Railway puts the real caller in `X-Real-IP` and overwrites any value the caller sends.
 *
 * That header is only trusted when `headerName` is configured (CLIENT_IP_HEADER=x-real-ip).
 * Left unset, `req.ip` is used, because on any host without such a proxy that header is
 * just something the caller types. A value that isn't a valid IP address is ignored.
 */
export function createClientIpResolver(headerName?: string | null) {
  const header = headerName?.trim().toLowerCase() || null;
  return (req: RequestLike): string | null => {
    if (header) {
      const raw = req.headers[header];
      const value = (Array.isArray(raw) ? raw[0] : raw)?.trim();
      if (value && isIP(value)) return value;
    }
    return req.ip ?? null;
  };
}
