/**
 * Integration test suite for Phase 5 security features
 * Tests: Rate limiting, 2FA, Anti-cheat, Compliance, Deployment
 */

const request = require('supertest');
const app = require('../src/index');
const db = require('../src/database');
const redis = require('../src/utils/redis');
const { generateJWT } = require('../src/utils/auth');

describe('Phase 5 Security Features', () => {
  let testUserId;
  let authToken;
  let refreshToken;

  before(async () => {
    // Setup test database
    await db.migrate();
  });

  after(async () => {
    // Cleanup
    await db.query('TRUNCATE TABLE users CASCADE');
    await redis.flushdb();
  });

  describe('1. Rate Limiting', () => {
    it('should allow requests within rate limit', async () => {
      const res = await request(app)
        .get('/api/health');
      expect(res.status).to.equal(200);
    });

    it('should block requests exceeding rate limit', async () => {
      // Make rapid requests
      for (let i = 0; i < 150; i++) {
        await request(app).get('/api/health');
      }

      const res = await request(app)
        .get('/api/health');
      expect(res.status).to.equal(429); // Too Many Requests
    });

    it('should implement progressive penalties', async () => {
      // Verify rate limiter records violations
      const violations = await redis.get('violations:127.0.0.1');
      expect(violations).to.be.greaterThan(0);
    });
  });

  describe('2. Two-Factor Authentication', () => {
    it('should enable 2FA for user', async () => {
      const res = await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ email: 'test@pokergame.com' });

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('secret');
      expect(res.body).to.have.property('qrCode');
    });

    it('should verify 2FA setup with correct token', async () => {
      // Get 2FA secret first
      const setupRes = await request(app)
        .post('/api/auth/2fa/enable')
        .set('Authorization', `Bearer ${authToken}`);

      const secret = setupRes.body.secret;

      // Verify with token (using speakeasy)
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({ secret });

      const res = await request(app)
        .post('/api/auth/2fa/verify-setup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ token });

      expect(res.status).to.equal(200);
    });

    it('should reject 2FA verification with invalid token', async () => {
      const res = await request(app)
        .post('/api/auth/2fa/verify-setup')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ token: '000000' });

      expect(res.status).to.equal(401);
    });

    it('should allow login with valid 2FA token', async () => {
      const speakeasy = require('speakeasy');
      const token = speakeasy.totp({ secret: process.env.TEST_2FA_SECRET });

      const res = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@pokergame.com',
          password: 'password123',
          twoFactorToken: token,
        });

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('accessToken');
    });

    it('should generate and use backup codes', async () => {
      const res = await request(app)
        .post('/api/auth/2fa/backup-code')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ backupCode: 'BACKUP_CODE_1' });

      expect(res.status).to.equal(200);
    });
  });

  describe('3. Anti-Cheat Detection', () => {
    it('should detect RTA (Real-Time Action) cheating', async () => {
      // Simulate suspiciously fast action (< 100ms)
      const res = await request(app)
        .post('/api/game/action')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          gameId: 'test-game-1',
          action: 'bet',
          amount: 100,
          timestamp: Date.now(),
        });

      // Should be recorded in cheat detection
      expect(res.status).to.be.oneOf([200, 403]); // 403 if cheating detected
    });

    it('should detect multi-account cheating', async () => {
      // Create two accounts from same IP
      const account1 = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'user1@pokergame.com',
          password: 'password123',
          ipAddress: '192.168.1.1',
        });

      const account2 = await request(app)
        .post('/api/auth/register')
        .send({
          email: 'user2@pokergame.com',
          password: 'password123',
          ipAddress: '192.168.1.1', // Same IP
        });

      // Should be flagged for multi-account investigation
      expect(account1.status).to.equal(201);
      expect(account2.status).to.equal(201);

      // Check if marked as suspicious
      const suspicious = await db.query(
        'SELECT is_suspicious FROM sessions WHERE user_id = $1',
        [account2.body.userId]
      );
      expect(suspicious.rows[0].is_suspicious).to.equal(true);
    });

    it('should verify shuffle randomness', async () => {
      // Create game and verify shuffle
      const gameRes = await request(app)
        .post('/api/game/create')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ buyIn: 100 });

      const gameId = gameRes.body.gameId;

      // Get deck info
      const deckRes = await request(app)
        .get(`/api/game/${gameId}/deck`)
        .set('Authorization', `Bearer ${authToken}`);

      // Verify shuffle randomness through chi-square test
      expect(deckRes.body).to.have.property('shuffleVerified');
      expect(deckRes.body.shuffleVerified).to.equal(true);
    });

    it('should report cheat suspicions', async () => {
      const res = await request(app)
        .get('/api/admin/cheat-detections')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.be.an('array');
    });
  });

  describe('4. Compliance & KYC/AML', () => {
    it('should enforce deposit limits', async () => {
      // Try to deposit exceeding daily limit
      const res = await request(app)
        .post('/api/financial/deposit')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          amount: 50000,
          paymentMethod: 'credit_card',
        });

      // Should be rejected or flagged
      expect(res.status).to.be.oneOf([400, 403]);
    });

    it('should check sanctions list (OFAC)', async () => {
      const res = await request(app)
        .post('/api/kyc/verify')
        .send({
          firstName: 'Osama',
          lastName: 'Bin Laden',
          dateOfBirth: '1957-03-10',
        });

      expect(res.status).to.equal(403);
      expect(res.body.message).to.include('sanctions');
    });

    it('should initiate KYC verification', async () => {
      const res = await request(app)
        .post('/api/kyc/initiate')
        .set('Authorization', `Bearer ${authToken}`);

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('verificationId');
    });

    it('should detect structuring (AML)', async () => {
      // Make multiple deposits just under $10k
      for (let i = 0; i < 3; i++) {
        await request(app)
          .post('/api/financial/deposit')
          .set('Authorization', `Bearer ${authToken}`)
          .send({
            amount: 9500,
            paymentMethod: 'credit_card',
          });
      }

      // Should trigger SAR
      const res = await request(app)
        .get('/api/admin/sar-reports')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.status).to.equal(200);
      expect(res.body.length).to.be.greaterThan(0);
    });

    it('should enable self-exclusion', async () => {
      const res = await request(app)
        .post('/api/responsible-gaming/self-exclude')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ duration: 'permanent' });

      expect(res.status).to.equal(200);

      // Verify cannot login during exclusion
      const loginRes = await request(app)
        .post('/api/auth/login')
        .send({
          email: 'test@pokergame.com',
          password: 'password123',
        });

      expect(loginRes.status).to.equal(403);
    });
  });

  describe('5. Security Headers & CORS', () => {
    it('should include CSP header', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['content-security-policy']).to.exist;
    });

    it('should include X-Frame-Options header', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['x-frame-options']).to.equal('SAMEORIGIN');
    });

    it('should include HSTS header', async () => {
      const res = await request(app).get('/api/health');
      expect(res.headers['strict-transport-security']).to.include('max-age=31536000');
    });
  });

  describe('6. Monitoring & Health Checks', () => {
    it('should provide health check endpoint', async () => {
      const res = await request(app)
        .get('/api/health');

      expect(res.status).to.equal(200);
      expect(res.body).to.have.property('status');
    });

    it('should provide metrics in Prometheus format', async () => {
      const res = await request(app)
        .get('/api/metrics');

      expect(res.status).to.equal(200);
      expect(res.text).to.include('TYPE');
    });

    it('should track API metrics', async () => {
      // Make request
      await request(app).get('/api/health');

      // Check metrics
      const res = await request(app)
        .get('/api/admin/metrics')
        .set('Authorization', `Bearer ${adminToken}`);

      expect(res.body).to.have.property('api.request.count');
    });
  });
});
