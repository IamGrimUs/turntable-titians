import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@as-integrations/express4';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';
import { db } from './db';
import { getInternalApiSecret } from './config';
import { formatError } from './errors';
import { createLimiter } from './rateLimit';
import { createQueryLimitRule } from './queryLimits';
import { createIpLimitMiddleware, createMutationLimitPlugin } from './rateLimiting';
import { createClientIpResolver } from './clientIp';
import { createAuthContext } from './authContext';
import type { Context } from './context';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const allowedOrigins = CLIENT_URL.split(',').map((o) => o.trim());
// Throws at startup if the secret is missing, so we never run with a guessable one.
const INTERNAL_API_SECRET = getInternalApiSecret();

// Escape hatch if a limit ever locks out real users: set RATE_LIMIT_DISABLED=true and redeploy.
const RATE_LIMIT_DISABLED = process.env.RATE_LIMIT_DISABLED === 'true';
// How many proxies sit in front of the app (Railway's edge = 1). Needed so req.ip is the
// real caller and not the proxy; a wrong value lets callers spoof addresses or share one limit.
const TRUST_PROXY = Number(process.env.TRUST_PROXY ?? 1);
// Don't advertise the framework in every response.
app.disable('x-powered-by');
app.set('trust proxy', Number.isInteger(TRUST_PROXY) && TRUST_PROXY >= 0 ? TRUST_PROXY : 1);
// Which address the rate limits count. On Railway set CLIENT_IP_HEADER=x-real-ip: Express's req.ip
// is Railway's rotating edge proxy there, so callers were split over several counters.
// Unset (the default), req.ip is used and no header is trusted.
const getClientIp = createClientIpResolver(process.env.CLIENT_IP_HEADER);

const getAuthContext = createAuthContext({ secret: INTERNAL_API_SECRET, getClientIp });

async function startServer() {
  const server = new ApolloServer<Context>({
    typeDefs,
    resolvers,
    // Never send stack traces, whatever NODE_ENV is; mask unexpected errors (see errors.ts).
    includeStacktraceInErrorResponses: false,
    formatError,
    // Refuse queries that are too deep or ask for too many fields.
    validationRules: RATE_LIMIT_DISABLED ? [] : [createQueryLimitRule({ maxDepth: 6, maxFields: 150 })],
    // At most 30 mutations a minute per user (per IP when not signed in).
    plugins: RATE_LIMIT_DISABLED
      ? []
      : [createMutationLimitPlugin(createLimiter({ limit: 30, windowMs: 60_000 }))],
  });

  await server.start();

  app.use(cookieParser());

  if (!RATE_LIMIT_DISABLED) {
    // 600 requests a minute per address is far above normal use. /health is left out on purpose.
    app.use('/graphql', createIpLimitMiddleware(createLimiter({ limit: 600, windowMs: 60_000 }), getClientIp));
  }

  app.use(
    '/graphql',
    cors<cors.CorsRequest>({
      origin: (origin, callback) => {
        // A disallowed origin simply gets no CORS headers, so the browser blocks it. Passing an
        // Error here would turn every such request into a noisy 500 in the server logs.
        callback(null, !origin || allowedOrigins.includes(origin));
      },
      credentials: true,
    }),
    express.json(),
    expressMiddleware(server, {
      context: ({ req }) => getAuthContext(req),
    })
  );

  app.get('/health', async (req, res) => {
    try {
      await db.$queryRaw`SELECT 1`;
      res.json({ status: 'ok', db: 'connected', message: 'Battle Skratch GraphQL API is running' });
    } catch (err) {
      res.status(500).json({ status: 'error', db: 'disconnected', message: 'DB connection failed' });
    }
  });

  app.listen(PORT, () => {
    console.log(`🚀 GraphQL Server running on http://localhost:${PORT}/graphql`);
    console.log(`🌐 Allowed CORS origins: ${allowedOrigins.join(', ')}`);
    console.log(`📊 Apollo Studio: https://studio.apollographql.com/sandbox`);
  });
}

startServer()
  .then(async () => {
    try {
      await db.$connect();
      console.log('✅ Connected to PostgreSQL');
    } catch (e) {
      console.error('❌ Failed to connect to PostgreSQL', e);
    }
  })
  .catch((error) => {
    console.error('Error starting server:', error);
    process.exit(1);
  });
