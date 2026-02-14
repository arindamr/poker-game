const dotenv = require('dotenv');

dotenv.config();

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: process.env.PORT || 3000,
  websocketPort: process.env.WEBSOCKET_PORT || 3001,
  
  // Database
  database: {
    host: process.env.DB_HOST || 'localhost',
    port: process.env.DB_PORT || 5432,
    name: process.env.DB_NAME || 'poker_game',
    user: process.env.DB_USER || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres_password',
    url: process.env.DATABASE_URL,
  },
  
  // Redis
  redis: {
    host: process.env.REDIS_HOST || 'localhost',
    port: process.env.REDIS_PORT || 6379,
    password: process.env.REDIS_PASSWORD || '',
  },
  
  // JWT
  jwt: {
    secret: process.env.JWT_SECRET || 'dev-secret-key-change-in-production',
    expiration: process.env.JWT_EXPIRATION || '24h',
    refreshSecret: process.env.JWT_REFRESH_SECRET || 'dev-refresh-secret',
    refreshExpiration: process.env.JWT_REFRESH_EXPIRATION || '7d',
  },
  
  // Security
  security: {
    bcryptRounds: parseInt(process.env.BCRYPT_ROUNDS || 10, 10),
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || 900000, 10),
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || 100, 10),
    enableRateLimiting: process.env.ENABLE_RATE_LIMITING !== 'false',
  },
  
  // Game Configuration
  game: {
    smallBlind: parseFloat(process.env.SMALL_BLIND || 0.5),
    bigBlind: parseFloat(process.env.BIG_BLIND || 1.0),
    minBuyIn: parseFloat(process.env.MIN_BUY_IN || 10),
    maxBuyIn: parseFloat(process.env.MAX_BUY_IN || 1000),
    tableMaxSeats: parseInt(process.env.TABLE_MAX_SEATS || 6, 10),
    handTimeout: parseInt(process.env.HAND_TIMEOUT || 30, 10),
  },
  
  // Logging
  logging: {
    level: process.env.LOG_LEVEL || 'debug',
    format: process.env.LOG_FORMAT || 'json',
  },
  
  // CORS
  cors: {
    origin: (process.env.CORS_ORIGIN || 'http://localhost:5000,http://localhost:3000,http://localhost:3002').split(','),
  },

  // Admin
  admin: {
    emails: (process.env.ADMIN_EMAILS || '').split(',').map((email) => email.trim()).filter(Boolean),
  },
};
