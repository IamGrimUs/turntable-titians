import type { NextFunction, Request, Response } from 'express';

/**
 * TEMPORARY diagnostic: shows which caller address the server sees behind Railway's proxy,
 * so the per-IP rate limits can be checked. Off unless DEBUG_CLIENT_IP=true. Logs only
 * address-related fields (never headers like Authorization or Cookie) and stops after
 * `limit` lines per process. Remove once the rate-limit question is settled.
 */
export function createClientIpLogger({
  enabled,
  log = console.log,
  limit = 200,
  replicaId = process.env.RAILWAY_REPLICA_ID ?? null,
}: {
  enabled: boolean;
  log?: (...args: unknown[]) => void;
  limit?: number;
  replicaId?: string | null;
}) {
  let remaining = limit;
  return (req: Request, _res: Response, next: NextFunction) => {
    if (enabled && remaining > 0) {
      remaining -= 1;
      log(
        '[debug-client-ip]',
        JSON.stringify({
          pid: process.pid,
          replicaId,
          trustProxy: req.app?.get('trust proxy') ?? null,
          reqIp: req.ip ?? null,
          reqIps: req.ips ?? null,
          xForwardedFor: req.headers['x-forwarded-for'] ?? null,
          remoteAddress: req.socket?.remoteAddress ?? null,
        })
      );
    }
    next();
  };
}
