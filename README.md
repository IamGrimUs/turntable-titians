# Turntable Titans 🎧

A community DJ battles platform where participants upload video submissions to predetermined battles and the community votes for winners.

## Project Structure

This is a monorepo containing:

- **`client/`** - Next.js frontend application (React + TypeScript)
- **`server/`** - Apollo GraphQL backend API (Node.js + TypeScript)

## Getting Started

### Prerequisites

- Node.js >= 18.0.0
- pnpm >= 8.0.0

### Installation

1. Install all dependencies (for both client and server):
   ```bash
   pnpm install
   ```

### Development

Run both client and server in development mode:

```bash
pnpm dev
```

This will start:
- GraphQL Server on `http://localhost:3001/graphql`
- Client on `http://localhost:3000`

You can also run them separately:

**Server only:**
```bash
pnpm --filter server dev
```

**Client only:**
```bash
pnpm --filter client dev
```

### Environment Setup

1. Copy the server environment example:
   ```bash
   cp server/.env.example server/.env
   ```

2. Edit `server/.env` with your configuration (optional, defaults are provided)

### Database (PostgreSQL)

1. Ensure you have PostgreSQL running locally and create a database, e.g. `turntabletitans`.

2. Create `server/.env` and set your connection string:

```
DATABASE_URL="postgresql://USER:PASSWORD@localhost:5432/turntabletitans?schema=public"
```

3. Generate Prisma client and run migrations:

```bash
pnpm --filter server prisma:generate
pnpm --filter server prisma:migrate -- --name init
```

4. (Optional) Inspect data with Prisma Studio:

```bash
pnpm --filter server prisma:studio
```

### Building for Production

Build both client and server:

```bash
pnpm build
```

Then start the server:
```bash
pnpm --filter server start
```

And start the client:
```bash
pnpm --filter client start
```

## Features (Planned)

- 🎬 Video submission system for DJ battles
- 🗳️ Community voting mechanism
- 🏆 Battle management and results
- 👥 User accounts and profiles
- 📊 Leaderboards and statistics

## Tech Stack

### Frontend
- Next.js 16 (App Router)
- React 19
- TypeScript
- Tailwind CSS

### Backend
- Apollo Server (GraphQL)
- Express.js
- Node.js
- TypeScript

## License

MIT

