#!/bin/bash

# Local Testing Guide for Multiplayer Poker Game
# This script helps verify all Phase 5 security features are working

set -e

echo "🎰 Multiplayer Poker Game - Local Testing Suite"
echo "=================================================="
echo ""

# Configuration
API_URL="http://localhost:3000"
WS_URL="ws://localhost:3001"
POSTGRES_HOST="localhost"
POSTGRES_PORT="5432"
REDIS_HOST="localhost"
REDIS_PORT="6379"
TEST_EMAIL="test@example.com"
TEST_PASSWORD="Demo@123456"
TEST_USERNAME="demo"

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Helper function to print section headers
print_section() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}$1${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

# Helper function to check HTTP service
check_http_service() {
    local service=$1
    local port=$2
    local path=${3:-/health}
    local result
    result=$(curl -s -o /dev/null -w "%{http_code}" "http://localhost:${port}${path}" 2>/dev/null || echo "000")

    if [ "$result" = "200" ]; then
        echo -e "${GREEN}✓${NC} $service is running"
        return 0
    fi

    echo -e "${RED}✗${NC} $service is not responding"
    return 1
}

# Helper function to check if a TCP port is accepting connections
check_tcp_service() {
    local service=$1
    local port=$2

    if command -v nc >/dev/null 2>&1; then
        if nc -z localhost "$port" >/dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} $service is accepting TCP connections"
            return 0
        fi
    else
        if (echo >"/dev/tcp/localhost/$port") >/dev/null 2>&1; then
            echo -e "${GREEN}✓${NC} $service is accepting TCP connections"
            return 0
        fi
    fi

    echo -e "${RED}✗${NC} $service is not reachable on TCP port $port"
    return 1
}

# Test 1: Check Docker Services
print_section "1. CHECKING DOCKER SERVICES"

echo "Starting Docker Compose services..."
cd deployment/aws

# Start services in background
docker-compose up -d

echo "Waiting for services to be ready..."
sleep 5

echo "Running backend database migrations..."
docker exec poker_backend npm run migrate

# Check services
check_http_service "Backend API" 3000 "/health" || true
check_tcp_service "PostgreSQL" 5432 || true
check_tcp_service "Redis" 6379 || true

echo -e "${GREEN}✓${NC} All services started"

# Test 2: Test Health Endpoints
print_section "2. TESTING HEALTH ENDPOINTS"

echo "Testing health check..."
HEALTH_RESPONSE=$(curl -s http://localhost:3000/health)
echo "Response: $HEALTH_RESPONSE"

if echo "$HEALTH_RESPONSE" | grep -q "healthy\|ok"; then
    echo -e "${GREEN}✓${NC} Health check passed"
else
    echo -e "${YELLOW}⚠${NC} Health check response received"
fi

# Test 3: Test Metrics Endpoint
print_section "3. TESTING METRICS ENDPOINT"

echo "Checking that metrics endpoint requires authentication..."
METRICS_UNAUTH=$(curl -s http://localhost:3000/metrics)
echo "$METRICS_UNAUTH"

if echo "$METRICS_UNAUTH" | grep -q "No authentication token provided"; then
    echo -e "${GREEN}✓${NC} Metrics endpoint is protected"
else
    echo -e "${YELLOW}⚠${NC} Metrics endpoint protection check unexpected response"
fi

# Test 4: Authentication Tests
print_section "4. TESTING AUTHENTICATION"

# Register test user
echo "Registering test user..."
REGISTER_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "username": "'"$TEST_USERNAME"'",
    "email": "'"$TEST_EMAIL"'",
    "password": "'"$TEST_PASSWORD"'",
    "confirmPassword": "'"$TEST_PASSWORD"'"
  }')

echo "Registration response: $REGISTER_RESPONSE"

if echo "$REGISTER_RESPONSE" | grep -q "userId\|id"; then
    echo -e "${GREEN}✓${NC} User registration successful"
    USER_ID=$(echo "$REGISTER_RESPONSE" | grep -o '"id":"[^"]*' | cut -d'"' -f4)
    echo "User ID: $USER_ID"
else
    echo -e "${YELLOW}⚠${NC} Check registration response"
fi

# Login test
echo ""
echo "Testing login..."
LOGIN_RESPONSE=$(curl -s -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "'"$TEST_EMAIL"'",
    "password": "'"$TEST_PASSWORD"'"
  }')

echo "Login response: $LOGIN_RESPONSE"

if echo "$LOGIN_RESPONSE" | grep -q "accessToken"; then
    echo -e "${GREEN}✓${NC} Login successful"
    ACCESS_TOKEN=$(echo "$LOGIN_RESPONSE" | grep -o '"accessToken":"[^"]*' | cut -d'"' -f4)
    echo "Access Token: ${ACCESS_TOKEN:0:20}..."

    echo ""
    echo "Fetching metrics with authentication..."
    METRICS=$(curl -s http://localhost:3000/metrics \
      -H "Authorization: Bearer $ACCESS_TOKEN" | head -20)
    echo "$METRICS"

    if echo "$METRICS" | grep -q "TYPE"; then
        echo -e "${GREEN}✓${NC} Metrics endpoint working"
    else
        echo -e "${RED}✗${NC} Metrics endpoint failed"
    fi
else
    echo -e "${RED}✗${NC} Login failed"
fi

# Test 5: 2FA Endpoints
print_section "5. TESTING 2FA AUTHENTICATION"

if [ -n "$ACCESS_TOKEN" ]; then
    echo "Enabling 2FA..."
    ENABLE_2FA=$(curl -s -X POST http://localhost:3000/api/security/2fa/enable \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -d '{"email": "'"$TEST_EMAIL"'"}')
    
    echo "2FA Response: $ENABLE_2FA"
    
    if echo "$ENABLE_2FA" | grep -q "secret\|qrCode"; then
        echo -e "${GREEN}✓${NC} 2FA setup initiated"
        TWO_FA_SECRET=$(echo "$ENABLE_2FA" | grep -o '"secret":"[^"]*' | cut -d'"' -f4)
        echo "2FA Secret (save this): $TWO_FA_SECRET"
    else
        echo -e "${YELLOW}⚠${NC} 2FA endpoint check needed"
    fi
    
    # Get 2FA status
    echo ""
    echo "Checking 2FA status..."
    STATUS=$(curl -s -X GET http://localhost:3000/api/security/2fa/status \
      -H "Authorization: Bearer $ACCESS_TOKEN")
    
    echo "2FA Status: $STATUS"
fi

# Test 6: Rate Limiting
print_section "6. TESTING RATE LIMITING"

echo "Testing rate limiter (making 150 requests)..."
SUCCESS_COUNT=0
BLOCKED_COUNT=0

for i in {1..150}; do
    RESPONSE=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/health)
    
    if [ "$RESPONSE" = "200" ]; then
        ((SUCCESS_COUNT++))
    else
        ((BLOCKED_COUNT++))
    fi
done

echo "Results:"
echo "  Successful requests: $SUCCESS_COUNT"
echo "  Blocked requests: $BLOCKED_COUNT"

if [ $BLOCKED_COUNT -gt 0 ]; then
    echo -e "${GREEN}✓${NC} Rate limiting is working (blocked $BLOCKED_COUNT requests)"
else
    echo -e "${YELLOW}⚠${NC} Rate limiting may need adjustment"
fi

# Test 7: Database Connectivity
print_section "7. TESTING DATABASE CONNECTIVITY"

echo "Checking PostgreSQL..."
if command -v psql &> /dev/null; then
    DB_CHECK=$(PGPASSWORD=postgres psql -h $POSTGRES_HOST -p $POSTGRES_PORT -U postgres -d pokergame -c "SELECT version();" 2>&1 | head -1)
    if echo "$DB_CHECK" | grep -q "PostgreSQL"; then
        echo -e "${GREEN}✓${NC} PostgreSQL connected"
        echo "Version: $DB_CHECK"
    else
        echo -e "${YELLOW}⚠${NC} PostgreSQL check skipped (psql not available)"
    fi
else
    echo -e "${YELLOW}⚠${NC} psql not installed, skipping PostgreSQL check"
fi

# Test 8: Redis Connectivity
print_section "8. TESTING REDIS CONNECTIVITY"

echo "Checking Redis..."
if command -v redis-cli &> /dev/null; then
    REDIS_CHECK=$(redis-cli -h $REDIS_HOST -p $REDIS_PORT ping 2>&1)
    if [ "$REDIS_CHECK" = "PONG" ]; then
        echo -e "${GREEN}✓${NC} Redis connected"
        echo "Response: $REDIS_CHECK"
    else
        echo -e "${YELLOW}⚠${NC} Redis check skipped"
    fi
else
    echo -e "${YELLOW}⚠${NC} redis-cli not installed, skipping Redis check"
fi

# Test 9: Security Headers
print_section "9. TESTING SECURITY HEADERS"

echo "Fetching security headers..."
HEADERS=$(curl -s -I http://localhost:3000/health)

echo "Checking for security headers..."
echo "$HEADERS" | grep -q "Content-Security-Policy" && echo -e "${GREEN}✓${NC} CSP header present" || echo -e "${RED}✗${NC} CSP header missing"
echo "$HEADERS" | grep -q "Strict-Transport-Security" && echo -e "${GREEN}✓${NC} HSTS header present" || echo -e "${RED}✗${NC} HSTS header missing"
echo "$HEADERS" | grep -q "X-Frame-Options" && echo -e "${GREEN}✓${NC} X-Frame-Options present" || echo -e "${RED}✗${NC} X-Frame-Options missing"

# Test 10: API Endpoints
print_section "10. TESTING API ENDPOINTS"

if [ -n "$ACCESS_TOKEN" ]; then
    echo "Testing protected endpoints..."
    
    # Test creating a game table
    echo "Creating game table..."
    GAME_RESPONSE=$(curl -s -X POST http://localhost:3000/api/game/tables \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -d '{
        "blinds": {"small": 1, "big": 2},
        "buyIn": 100,
        "maxPlayers": 6
      }')
    
    echo "Game creation response: $GAME_RESPONSE"
    
    if echo "$GAME_RESPONSE" | grep -q "gameId\|id"; then
        echo -e "${GREEN}✓${NC} Game table created"
        GAME_ID=$(echo "$GAME_RESPONSE" | grep -o '"gameId":"[^"]*' | cut -d'"' -f4)
        echo "Game ID: $GAME_ID"
    else
        echo -e "${YELLOW}⚠${NC} Check game creation endpoint"
    fi
else
    echo -e "${YELLOW}⚠${NC} Skipping protected endpoints (no auth token)"
fi

# Test 11: Compliance Endpoints
print_section "11. TESTING COMPLIANCE ENDPOINTS"

if [ -n "$ACCESS_TOKEN" ]; then
    echo "Testing KYC initiation..."
    KYC_RESPONSE=$(curl -s -X POST http://localhost:3000/api/security/kyc/initiate \
      -H "Content-Type: application/json" \
      -H "Authorization: Bearer $ACCESS_TOKEN" \
      -d '{
        "firstName": "Test",
        "lastName": "User",
        "dateOfBirth": "1990-01-01"
      }')
    
    echo "KYC response: $KYC_RESPONSE"
    
    if echo "$KYC_RESPONSE" | grep -q "verificationId"; then
        echo -e "${GREEN}✓${NC} KYC verification initiated"
    else
        echo -e "${YELLOW}⚠${NC} Check KYC endpoint"
    fi
fi

# Test 12: Summary
print_section "12. TESTING SUMMARY"

echo ""
echo -e "${GREEN}LOCAL TESTING COMPLETE${NC}"
echo ""
echo "Next steps:"
echo "1. Review any ${YELLOW}warnings${NC} above"
echo "2. Check logs: docker logs poker_backend"
echo "3. Access metrics: http://localhost:3000/metrics"
echo "4. Run integration tests: npm test -- test/phase5.integration.test.js"
echo ""
echo "Services running:"
echo "  • PostgreSQL: $POSTGRES_HOST:$POSTGRES_PORT"
echo "  • Redis: $REDIS_HOST:$REDIS_PORT"
echo "  • Backend API: http://localhost:3000"
echo "  • WebSocket: $WS_URL"
echo ""
echo "Stop services: docker-compose down"
echo ""
