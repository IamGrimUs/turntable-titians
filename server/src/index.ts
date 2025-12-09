import { ApolloServer } from '@apollo/server';
import { expressMiddleware } from '@apollo/server/express4';
import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { typeDefs } from './schema';
import { resolvers } from './resolvers';
import { db } from './db';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

async function startServer() {
  const server = new ApolloServer({
    typeDefs,
    resolvers,
  });

  await server.start();

  app.use(
    '/graphql',
    cors<cors.CorsRequest>(),
    express.json(),
    expressMiddleware(server)
  );

  // Health check endpoint
  app.get('/health', async (req, res) => {
    try {
      // simple db check
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
