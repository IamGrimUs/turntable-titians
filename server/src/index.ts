import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import dotenv from 'dotenv';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';
import { db } from './db';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;
const CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';

interface GraphQLContext {
  userId: string | null;
}

async function getAuthContext(req: express.Request): Promise<GraphQLContext> {
  const sessionToken =
    req.cookies['authjs.session-token'] ||
    req.cookies['__Secure-authjs.session-token'];

  if (!sessionToken) return { userId: null };

  const session = await db.session.findUnique({
    where: { sessionToken },
    select: { userId: true, expires: true },
  });

  if (!session || session.expires < new Date()) return { userId: null };

  return { userId: session.userId };
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
      origin: CLIENT_URL,
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
      res.json({ status: 'ok', db: 'connected', message: 'Turntable Titans GraphQL API is running' });
    } catch (err) {
      res.status(500).json({ status: 'error', db: 'disconnected', message: 'DB connection failed' });
    }
  });

  app.listen(PORT, () => {
    console.log(`🚀 GraphQL Server running on http://localhost:${PORT}/graphql`);
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
