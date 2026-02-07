# 🧪 Local Testing Guide - Multiplayer Poker Game

**Date**: January 25, 2026
**Version**: Phase 5 Complete
**Status**: Ready for Testing

---

## 📋 Prerequisites

Before testing locally, ensure you have:

```bash
# Required
- Docker Desktop (with Docker Compose)
- Node.js 18+
- npm 9+
- curl (for API testing)
- psql (optional, for direct DB access)
- redis-cli (optional, for Redis testing)
```

**Install Docker Compose** (if not included):
```bash
docker-compose --version  # Check if installed
```

---

## 🚀 Quick Start

### Step 1: Start Local Services
```bash
cd deployment/aws
docker-compose up -d

# Verify services are running
docker-compose ps

# Expected output:
# NAME             STATUS
# poker_postgres   Up (healthy)
# poker_redis      Up (healthy)
# poker_backend    Up (healthy)
# poker_nginx      Up (healthy)
```

### Step 2: Wait for Services to Initialize
```bash
# Services need 5-10 seconds to start
sleep 10

# Check health
curl http://localhost:3000/health
# Expected: {"status":"ok","timestamp":"2026-01-25T..."}
```

### Step 3: Run Automated Tests
```bash
# Make test script executable
chmod +x test-local.sh

# Run comprehensive tests
./test-local.sh
```

---

## 🧬 Manual Testing

### Test 1: Health Check
```bash
# Check API is running
curl http://localhost:3000/health

# Expected response:
# {"status":"ok","timestamp":"2026-01-25T12:34:56.789Z"}
```

### Test 2: Metrics Endpoint
```bash
# Get metrics in Prometheus format
curl http://localhost:3000/metrics

# Expected: Multiple lines with:
# # HELP api_request_count Counter metric
# # TYPE api_request_count counter
# api_request_count 42
```

### Test 3: Admin Metrics Dashboard
```bash
# Get detailed metrics snapshot
curl http://localhost:3000/admin/metrics

# Expected: JSON with all tracked metrics
```

---

## 🔐 Authentication Testing

### Register a New User
```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@pokergame.com",
    "password": "SecurePass123!",
    "firstName": "Test",
    "lastName": "User"
  }'

# Expected response:
# {
#   "userId": "550e8400-e29b-41d4-a716-446655440000",
#   "email": "testuser@pokergame.com",
#   "accessToken": "eyJhbGciOiJIUzI1NiIs...",
#   "refreshToken": "eyJhbGciOiJIUzI1NiIs..."
# }
```

### Save the Access Token
```bash
# Export token for use in subsequent requests
export ACCESS_TOKEN="your_token_here"
```

### Login with Email & Password
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@pokergame.com",
    "password": "SecurePass123!"
  }'
```

---

## 🔐 Phase 5 Security Features Testing

### Test 2FA (Two-Factor Authentication)

#### Enable 2FA
```bash
curl -X POST http://localhost:3000/api/security/2fa/enable \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "email": "testuser@pokergame.com"
  }'

# Expected response includes:
# {
#   "secret": "JBSWY3DPEBLW64TMMQ======",
#   "qrCode": "data:image/png;base64,...",
#   "backupCodes": ["CODE1", "CODE2", ...]
# }
```

#### Generate TOTP Token (for testing)
```bash
# Using Node.js to generate TOTP
node -e "
const speakeasy = require('speakeasy');
const token = speakeasy.totp({
  secret: 'JBSWY3DPEBLW64TMMQ======',
  encoding: 'base32'
});
console.log('TOTP Token:', token);
"
```

#### Verify 2FA Setup
```bash
curl -X POST http://localhost:3000/api/security/2fa/verify-setup \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "token": "123456"
  }'

# Expected response:
# {"message": "2FA successfully enabled"}
```

#### Get 2FA Status
```bash
curl -X GET http://localhost:3000/api/security/2fa/status \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# Expected response:
# {
#   "enabled": true,
#   "backupCodesRemaining": 10,
#   "lastVerified": "2026-01-25T12:34:56.789Z"
# }
```

### Test Rate Limiting

#### Normal Request (Should Succeed)
```bash
curl http://localhost:3000/health
# HTTP 200
```

#### Exceed Rate Limit
```bash
# Make 150 requests rapidly
for i in {1..150}; do
  curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/health
done

# After ~100 requests: HTTP 429 (Too Many Requests)
```

#### Check Rate Limit Headers
```bash
curl -I http://localhost:3000/health

# Look for rate limit headers:
# X-RateLimit-Limit: 100
# X-RateLimit-Remaining: 42
# X-RateLimit-Reset: 1234567890
```

### Test Security Headers

```bash
curl -I http://localhost:3000/health

# Verify these headers are present:
# Content-Security-Policy: ...
# X-Frame-Options: SAMEORIGIN
# X-Content-Type-Options: nosniff
# Strict-Transport-Security: max-age=31536000
# X-XSS-Protection: 1; mode=block
```

---

## 🎮 Game Endpoints Testing

### Create a Game Table
```bash
curl -X POST http://localhost:3000/api/game/tables \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "blinds": {"small": 1, "big": 2},
    "buyIn": 100,
    "maxPlayers": 6
  }'

# Expected response:
# {
#   "gameId": "game_12345",
#   "blinds": {"small": 1, "big": 2},
#   "buyIn": 100,
#   "maxPlayers": 6,
#   "status": "waiting"
# }
```

### Join a Game
```bash
curl -X POST http://localhost:3000/api/game/tables/game_12345/join \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "buyIn": 100
  }'

# Expected response:
# {
#   "message": "Joined game successfully",
#   "gameId": "game_12345",
#   "position": 1,
#   "stack": 100
# }
```

### Get Game State
```bash
curl -X GET http://localhost:3000/api/game/tables/game_12345/state \
  -H "Authorization: Bearer $ACCESS_TOKEN"

# Expected response:
# {
#   "gameId": "game_12345",
#   "state": "waiting",
#   "pot": 0,
#   "players": [...]
# }
```

### Player Action (Bet)
```bash
curl -X POST http://localhost:3000/api/game/tables/game_12345/action \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "action": "bet",
    "amount": 50,
    "tableId": "game_12345"
  }'

# Expected response:
# {
#   "action": "bet",
#   "amount": 50,
#   "gameState": "...",
#   "pot": 50
# }
```

---

## 💳 Compliance Testing

### Test KYC (Know Your Customer)
```bash
curl -X POST http://localhost:3000/api/security/kyc/initiate \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "firstName": "Test",
    "lastName": "User",
    "dateOfBirth": "1990-01-15"
  }'

# Expected response:
# {
#   "verificationId": "kyc_12345",
#   "message": "KYC verification started"
# }
```

### Test Deposit with AML Checks
```bash
curl -X POST http://localhost:3000/api/security/financial/deposit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "amount": 500,
    "paymentMethod": "credit_card"
  }'

# Expected response:
# {"message": "Deposit processed", "transactionId": "tx_1234567890"}
```

### Test Deposit Limit Enforcement
```bash
# Try to deposit more than daily limit
curl -X POST http://localhost:3000/api/security/financial/deposit \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "amount": 50000,
    "paymentMethod": "credit_card"
  }'

# Expected: HTTP 403
# {"error": "Deposit limit exceeded", "limit": 10000}
```

### Test Self-Exclusion
```bash
curl -X POST http://localhost:3000/api/security/responsible-gaming/self-exclude \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ACCESS_TOKEN" \
  -d '{
    "duration": "7d"
  }'

# Expected response:
# {"message": "Self-exclusion enabled for 7d"}
```

---

## 🗄️ Database Testing

### Check PostgreSQL Connection
```bash
# Connect to database
psql -h localhost -p 5432 -U postgres -d pokergame

# List tables
\dt

# Check users table
SELECT id, email, two_fa_enabled FROM users LIMIT 5;

# Check 2FA audit
SELECT * FROM two_fa_audit ORDER BY created_at DESC LIMIT 5;

# Check cheat detections
SELECT * FROM cheat_detection ORDER BY created_at DESC LIMIT 5;

# Exit
\q
```

### Check Redis Connection
```bash
# Connect to Redis
redis-cli -h localhost -p 6379

# Get key count
DBSIZE

# Get sample keys
KEYS *

# Check rate limit violations
KEYS *violations*

# Exit
EXIT
```

---

## 📊 Monitoring & Metrics Testing

### View Real-Time Metrics
```bash
# Get metrics in Prometheus format
curl http://localhost:3000/metrics | grep "api_request"

# Sample output:
# api_request_count 142
# api_request_duration_seconds_sum 45.234
# api_request_duration_seconds_count 142
```

### Check Service Logs
```bash
# View backend logs
docker logs poker_backend -f

# View nginx logs
docker logs poker_nginx -f

# View PostgreSQL logs
docker logs poker_postgres -f
```

### Monitor Containers
```bash
# Watch container status
docker stats

# Checks:
# - Memory usage
# - CPU usage
# - Network I/O
# - Block I/O
```

---

## 🐛 Troubleshooting

### Services Not Starting
```bash
# Check Docker status
docker-compose ps

# View logs
docker-compose logs

# Restart services
docker-compose restart

# Full restart
docker-compose down
docker-compose up -d
```

### Connection Refused
```bash
# Port already in use
lsof -i :3000  # Check what's using port 3000

# Free port
kill -9 <PID>
```

### Database Issues
```bash
# Check database is ready
psql -h localhost -p 5432 -U postgres -c "SELECT 1;"

# Reset database
docker-compose down -v  # Remove volumes
docker-compose up -d    # Restart
```

### Rate Limiter Not Working
```bash
# Check Redis connection
redis-cli -h localhost PING

# Check rate limit data
redis-cli -h localhost KEYS "*violations*"

# Clear rate limits
redis-cli -h localhost FLUSHDB
```

---

## ✅ Test Checklist

- [ ] Docker services started successfully
- [ ] Health endpoint returns 200
- [ ] Metrics endpoint returns data
- [ ] User registration works
- [ ] User login successful
- [ ] 2FA can be enabled
- [ ] Rate limiting triggers at ~100 requests
- [ ] Security headers present
- [ ] Database connected
- [ ] Redis connected
- [ ] Game table creation works
- [ ] Game join works
- [ ] Player actions recorded
- [ ] KYC endpoint responds
- [ ] Deposit with limits works
- [ ] Compliance checks active
- [ ] Logs show no errors

---

## 🧹 Cleanup

### Stop Services
```bash
docker-compose down
```

### Remove Volumes (Full Reset)
```bash
docker-compose down -v
```

### Clean Up Docker
```bash
# Remove unused containers
docker container prune

# Remove unused images
docker image prune

# Full cleanup
docker system prune
```

---

## 📈 Next Steps

After successful local testing:

1. **Run Integration Tests**
   ```bash
   npm test -- test/phase5.integration.test.js
   ```

2. **Load Testing**
   ```bash
   # Test with multiple concurrent users
   ```

3. **Security Audit**
   ```bash
   # Penetration testing
   ```

4. **Staging Deployment**
   ```bash
   # Deploy to AWS staging
   ```

---

## 🆘 Getting Help

**Common Issues & Solutions**:

| Issue | Solution |
|-------|----------|
| Port 3000 in use | `lsof -i :3000` then `kill -9 <PID>` |
| Database won't connect | `docker-compose logs poker_postgres` |
| Rate limiter not working | `redis-cli FLUSHDB` |
| Services stuck | `docker-compose restart` |
| API returning errors | Check logs: `docker logs poker_backend` |

---

**✅ Ready to test locally! Follow the Quick Start section above to begin.** 🚀
