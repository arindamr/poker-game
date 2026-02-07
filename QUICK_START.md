# 🚀 Quick Start Guide - Poker Game Local Testing

## Prerequisites

- Docker & Docker Compose installed
- Node.js 16+ (for running scripts)
- curl (for testing endpoints)
- Postman (optional, for GUI testing)

## Step 1: Start the Application

```bash
# Navigate to deployment directory
cd deployment/aws

# Start all services (backend, PostgreSQL, Redis, Nginx)
docker-compose up -d

# Wait 15-30 seconds for services to initialize
sleep 30

# Verify all services are running
docker-compose ps
```

Expected output: All containers should show `Up` status
- poker_backend
- poker_postgres
- poker_redis
- poker_nginx

## Step 2: Verify System Health

```bash
# Check health endpoint
curl http://localhost:3000/health

# Expected response:
# {"status":"healthy","timestamp":"2024-01-15T10:30:00Z","uptime":"30s"}
```

## Step 3: Quick API Test

### 3A. Create a Test Account

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@pokergame.com",
    "password": "SecurePass123!",
    "firstName": "Test",
    "lastName": "User"
  }'

# Save the access_token from response
```

### 3B. Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "testuser@pokergame.com",
    "password": "SecurePass123!"
  }'

# Save access_token as: TOKEN="your_token_here"
```

### 3C. Test Security Features

```bash
TOKEN="your_token_here"

# Enable 2FA
curl -X POST http://localhost:3000/api/security/2fa/enable \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"email": "testuser@pokergame.com"}'

# Get KYC Status
curl -X GET http://localhost:3000/api/security/kyc/status \
  -H "Authorization: Bearer $TOKEN"

# View Metrics
curl http://localhost:3000/metrics | head -20
```

## Step 4: Automated Testing

Run the comprehensive test suite:

```bash
# Make test script executable
chmod +x test-local.sh

# Run all tests
./test-local.sh
```

This will test:
- ✅ Docker services
- ✅ Health checks
- ✅ Authentication
- ✅ 2FA functionality
- ✅ Rate limiting
- ✅ Security headers
- ✅ Game endpoints
- ✅ Compliance features
- ✅ Database connectivity
- ✅ Redis connectivity

## Step 5: Manual API Testing (Recommended)

### Option A: Using Postman (GUI)

1. Open Postman
2. Click "Import" → Select `Poker_Game_API.postman_collection.json`
3. Set variables in Postman:
   - `base_url`: `http://localhost:3000`
   - `access_token`: (get from login response)
   - `game_id`: (get from create table response)
4. Run requests from the collection

### Option B: Using curl

Follow the examples in [TESTING_GUIDE.md](TESTING_GUIDE.md)

### Option C: Using the bash script

```bash
./test-local.sh
```

## Step 6: Monitor the Application

### View Real-time Logs

```bash
# Backend logs
docker logs -f poker_backend

# PostgreSQL logs
docker logs poker_postgres

# Redis logs
docker logs poker_redis
```

### View Metrics

```bash
# Prometheus format
curl http://localhost:3000/metrics

# Admin dashboard (JSON)
curl http://localhost:3000/admin/metrics | jq .
```

### Database Inspection

```bash
# Connect to PostgreSQL
docker exec -it poker_postgres psql -U postgres -d poker_game

# Useful queries:
# List all tables
\dt

# Check users
SELECT id, email, created_at FROM users LIMIT 5;

# Check 2FA audit
SELECT user_id, status, created_at FROM two_factor_audit LIMIT 5;

# Check cheat detection
SELECT user_id, detection_type, risk_score FROM cheat_detection LIMIT 5;

# Exit
\q
```

### Redis Inspection

```bash
# Connect to Redis
docker exec -it poker_redis redis-cli

# View keys
KEYS *

# Get rate limit info
GET rate_limit:user_123

# Exit
exit
```

## Step 7: Troubleshooting

### Common Issues

**Port Already in Use**
```bash
# Kill process on port 3000
lsof -ti:3000 | xargs kill -9
```

**Database Connection Failed**
```bash
# Check PostgreSQL is running
docker exec poker_postgres pg_isready

# Reset database
docker exec poker_postgres psql -U postgres -c "DROP DATABASE IF EXISTS poker_game;"
docker exec poker_postgres psql -U postgres -c "CREATE DATABASE poker_game;"
```

**Redis Connection Failed**
```bash
# Test Redis connection
docker exec poker_redis redis-cli ping
# Expected: PONG
```

**Containers Won't Start**
```bash
# Clean up and restart
docker-compose down -v
docker-compose up -d --build
```

## Step 8: Full Test Workflow

Complete test sequence:

```bash
# 1. Start services
cd deployment/aws
docker-compose up -d
sleep 30

# 2. Run automated tests
cd ../..
./test-local.sh

# 3. Check results
echo "✅ Check TESTING_GUIDE.md for manual verification"

# 4. View logs
docker logs poker_backend | tail -50

# 5. Check metrics
curl http://localhost:3000/admin/metrics | jq .

# 6. Run integration tests
npm test -- test/phase5.integration.test.js

# 7. Cleanup (when done)
cd deployment/aws
docker-compose down
```

## Key Endpoints Reference

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/health` | GET | Health check |
| `/metrics` | GET | Prometheus metrics |
| `/admin/metrics` | GET | Admin dashboard |
| `/api/auth/register` | POST | Register new user |
| `/api/auth/login` | POST | Login user |
| `/api/security/2fa/enable` | POST | Enable 2FA |
| `/api/security/kyc/initiate` | POST | Start KYC verification |
| `/api/security/financial/deposit` | POST | Make deposit |
| `/api/game/tables` | POST | Create game table |
| `/api/game/tables/{id}/join` | POST | Join game |
| `/api/game/tables/{id}/action` | POST | Player action |
| `/api/security/compliance/dashboard` | GET | View compliance data |

## Performance Tips

1. **First Run**: Services take 15-30 seconds to initialize
2. **Token Expiration**: Access tokens expire in 1 hour
3. **Rate Limiting**: After ~100 requests/minute, you'll get rate limited
4. **Database**: Queries may be slower on first run (indexes building)

## Next Steps

1. ✅ Complete local testing
2. → Run integration test suite
3. → Perform load testing (1000+ users)
4. → Security penetration testing
5. → Deploy to staging environment
6. → Deploy to production
7. → Release to app stores

## Support

For detailed testing instructions, see: [TESTING_GUIDE.md](TESTING_GUIDE.md)

For API documentation, see: [PHASE_5_GUIDE.md](PHASE_5_GUIDE.md)

For troubleshooting, see bottom of: [TESTING_GUIDE.md](TESTING_GUIDE.md#troubleshooting)
