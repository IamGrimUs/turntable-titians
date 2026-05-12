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

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
const allowedOrigins = CLIENT_URL.split(',').map((o) => o.trim());
const INTERNAL_API_SECRET = new TextEncoder().encode(
  process.env.INTERNAL_API_SECRET || 'dev-secret-change-me'
);

interface GraphQLContext {
  userId: string | null;
}

async function getAuthContext(req: express.Request): Promise<GraphQLContext> {
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      const { payload } = await jwtVerify(token, INTERNAL_API_SECRET);
      if (typeof payload.userId === 'string') return { userId: payload.userId };
    } catch {
      // expired or invalid token
    }
  }
  return { userId: null };
}

async function startServer() {
  const server = new ApolloServer<GraphQLContext>({
    typeDefs,
    resolvers,
  });

  await server.start();

  app.use(cookieParser());

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
