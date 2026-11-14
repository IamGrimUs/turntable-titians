import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { jwtVerify } from 'jose';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';
import { db } from './db';
import { getInternalApiSecret } from './config';
import { createLimiter } from './rateLimit';
import { createQueryLimitRule } from './queryLimits';
import { createIpLimitMiddleware, createMutationLimitPlugin } from './rateLimiting';

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
app.set('trust proxy', Number.isInteger(TRUST_PROXY) && TRUST_PROXY >= 0 ? TRUST_PROXY : 1);

interface GraphQLContext {
  userId: string | null;
  ip: string | null;
}

async function getAuthContext(req: express.Request): Promise<GraphQLContext> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const { payload } = await jwtVerify(token, INTERNAL_API_SECRET);
      if (typeof payload.userId === 'string') return { userId: payload.userId, ip: req.ip ?? null };
    } catch {
      // expired or invalid token
    }
  }
  return { userId: null, ip: req.ip ?? null };
}

async function startServer() {
  const server = new ApolloServer<GraphQLContext>({
    typeDefs,
    resolvers,
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
    app.use('/graphql', createIpLimitMiddleware(createLimiter({ limit: 600, windowMs: 60_000 })));
  }

  app.use(
    '/graphql',
    cors<cors.CorsRequest>({
      origin: (origin, callback) => {
        if (!origin || allowedOrigins.includes(origin)) {
          callback(null, true);
        } else {
          callback(new Error(`CORS: origin ${origin} not allowed`));
        }
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
