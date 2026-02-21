const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const config = require('./config/env');
const logger = require('./utils/logger');
const db = require('./config/database');
const redis = require('./config/redis');
const { initializeWebSocket } = require('./websocket/socketHandler');
const { registerGameEvents } = require('./websocket/gameEvents');
const { setIO } = require('./websocket/io');
const User = require('./models/User');
const { hashPassword } = require('./utils/crypto');

// Phase 5 Security Imports
const securityHeaders = require('./middleware/securityHeaders');
const enhancedRateLimiter = require('./middleware/enhancedRateLimiter');
const monitoringService = require('./monitoring/monitoringService');
const { authenticateToken } = require('./api/middleware/authMiddleware');
const { isAllowedOrigin } = require('./utils/corsOrigin');

// Routes
const authRoutes = require('./api/routes/auth');
const userRoutes = require('./api/routes/users');
const tableRoutes = require('./api/routes/tables');
const securityRoutes = require('./api/securityRoutes');
const gameRoutes = require('./api/gameRoutes');
const adminRoutes = require('./api/routes/admin');

// Initialize Express app
const app = express();
const server = http.createServer(app);

// Trust first reverse proxy (nginx/Lightsail) so req.ip and rate-limit behave correctly.
app.set('trust proxy', 1);

// ============================================================================
// PHASE 5: SECURITY MIDDLEWARE STACK
// ============================================================================

// 1. Enhanced security headers (Helmet + CSP)
app.use(securityHeaders.securityHeadersMiddleware);

// 2. Compression for performance
app.use(compression());

// 3. CORS configuration
app.use(cors({
  origin: (origin, callback) => {
    if (isAllowedOrigin(origin, config.cors.origin, config.nodeEnv)) {
      return callback(null, true);
    }

    return callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// 4. Body parsing with size limits (prevent large payloads)
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ limit: '10kb', extended: true }));

// 5. Enhanced rate limiting (Progressive penalties)
if (config.security.enableRateLimiting) {
  app.use('/api/', enhancedRateLimiter.middleware({
    maxAttempts: 1000,      // 1000 requests
    windowMs: 60000,        // per minute
    endpoint: 'api_general',
  }));
  app.use('/api/auth/login', enhancedRateLimiter.middleware({
    maxAttempts: 5,         // 5 login attempts
    windowMs: 60000,        // per minute
    endpoint: 'auth_login',
  }));
}

// ============================================================================
// MONITORING & METRICS
// ============================================================================

// Setup monitoring
monitoringService.setupAlertRules();
monitoringService.setupDefaultDashboards();

// Middleware to track metrics
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    monitoringService.recordMetric('api.request.count', 1);
    monitoringService.recordMetric('api.request.duration', duration);
    monitoringService.recordMetric(`api.request.by_endpoint.${req.method}_${req.path}`, 1);
    
    if (res.statusCode >= 400) {
      monitoringService.recordMetric('api.request.errors', 1);
    }
  });

  next();
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Metrics endpoint (Prometheus format)
app.get('/metrics', authenticateToken, (req, res) => {
  res.set('Content-Type', 'text/plain');
  res.send(monitoringService.getPrometheusMetrics());
});

// Admin metrics dashboard
app.get('/admin/metrics', authenticateToken, (req, res) => {
  res.json(monitoringService.getMetricsSnapshot());
});

// ============================================================================
// API ROUTES WITH PHASE 5 SECURITY INTEGRATION
// ============================================================================

// Authentication routes (public)
app.use('/api/v1/auth', authRoutes);
// Backwards-compatible auth routes for integration tests
app.use('/api/auth', securityRoutes);
app.use('/api/auth', authRoutes);

// Legacy routes (existing functionality)
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/tables', tableRoutes);
app.use('/api/v1/admin', adminRoutes);

// Phase 5 Security Routes
app.use('/api/security', securityRoutes);      // 2FA, KYC, AML, SAR
app.use('/api/game', gameRoutes);              // Game with anti-cheat

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found',
  });
});

// Initialize WebSocket
const io = initializeWebSocket(server);
registerGameEvents(io);
setIO(io);

/**
 * Start server
 */
const start = async () => {
  try {
    if (config.nodeEnv !== 'development') {
      if (config.jwt.secret === 'dev-secret-key-change-in-production' ||
          config.jwt.refreshSecret === 'dev-refresh-secret') {
        throw new Error('JWT secrets must be configured for non-development environments');
      }
    }
    // Connect to Redis
    await redis.connect();
    logger.info('Redis connected');

    // Test database connection
    await db.query('SELECT 1');
    logger.info('Database connected');

    // Seed demo user in development when enabled
    if (config.nodeEnv === 'development' && process.env.SEED_DEMO_USER !== 'false') {
      const demoEmail = 'test@example.com';
      const demoPassword = 'Demo@123456';
      const existing = await User.findByEmail(demoEmail);
      if (!existing) {
        const passwordHash = await hashPassword(demoPassword);
        await User.create('demo', demoEmail, passwordHash, '127.0.0.1');
        logger.info('Demo user created', { email: demoEmail });
      }
    }

    // Start listening
    server.listen(config.port, () => {
      logger.info(`Backend server started on port ${config.port}`);
      logger.info(`WebSocket server on port ${config.websocketPort}`);
      logger.info(`Environment: ${config.nodeEnv}`);
    });
  } catch (error) {
    logger.error('Failed to start server', { error: error.message });
    process.exit(1);
  }
};

/**
 * Graceful shutdown
 */
const shutdown = async () => {
  logger.info('Shutting down gracefully...');
  try {
    await redis.close();
    await db.close();
    server.close(() => {
      logger.info('Server closed');
      process.exit(0);
    });
  } catch (error) {
    logger.error('Error during shutdown', { error: error.message });
    process.exit(1);
  }
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception', { error: error.message, stack: error.stack });
  process.exit(1);
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  logger.error('Unhandled rejection', { reason, promise });
  process.exit(1);
});

// Start the server
if (require.main === module) {
  start();
}

module.exports = { app, server, io };
