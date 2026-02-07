# Poker App Backend

Node.js backend for the multiplayer poker application with WebSocket real-time synchronization.

## Getting Started

### Prerequisites
- Node.js 18.0.0+
- npm 9.0.0+
- PostgreSQL 15+
- Redis 7+

### Installation

```bash
# Install dependencies
npm install

# Create .env file
cp .env.example .env

# Run database migrations
npm run migrate

# Start development server
npm run dev
```

The backend will start on `http://localhost:3000` with WebSocket on `http://localhost:3001`

## Scripts

- `npm start` - Start production server
- `npm run dev` - Start with auto-reload (nodemon)
- `npm test` - Run test suite
- `npm run test:watch` - Run tests in watch mode
- `npm run test:integration` - Run integration tests
- `npm run lint` - Check code style
- `npm run lint:fix` - Fix code style issues
- `npm run migrate` - Run database migrations
- `npm run seed` - Seed database with sample data

## Project Structure

```
src/
├── server.js           # Main entry point
├── config/             # Configuration (DB, Redis, env)
├── api/                # REST API
│   ├── routes/         # Route definitions
│   ├── middleware/     # Middleware (auth, rate limit, etc)
│   └── controllers/    # Request handlers
├── websocket/          # WebSocket handlers and events
├── game/               # Poker game logic
│   ├── engine.js       # Game state machine
│   ├── hand-evaluator.js
│   ├── shuffler.js     # RNG
│   └── potCalculator.js
├── security/           # Security (anti-cheat, auth)
├── models/             # Database models
└── utils/              # Utilities (logger, validators)
```

## API Documentation

See `docs/API_SCHEMA.md` for endpoint documentation.

## WebSocket Events

See `docs/API_SCHEMA.md` for event definitions.

## Development

### Environment Setup

```bash
# Using Docker for local services:
docker-compose up -d postgres redis

# Or install locally:
# PostgreSQL: https://www.postgresql.org/download/
# Redis: https://redis.io/download
```

### Database Migrations

```bash
npm run migrate          # Run all pending migrations
npm run migrate:rollback # Rollback last migration
npm run seed             # Load sample data
```

### Testing

```bash
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:integration # Integration tests only
```

### Linting

```bash
npm run lint       # Check style
npm run lint:fix   # Auto-fix issues
```

## Deployment

See `docs/DEPLOYMENT.md` for production deployment guide.

## Security

See `docs/SECURITY_PLAN.md` for security implementation details.

---

For more information, see the root [README.md](../README.md)
