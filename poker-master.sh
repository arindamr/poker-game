#!/bin/bash

# 🎰 POKER GAME - MASTER CONTROL SCRIPT
# Full application management from command line

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Print header
print_header() {
    echo -e "${BLUE}========================================${NC}"
    echo -e "${BLUE}  🎰 POKER GAME - Master Control${NC}"
    echo -e "${BLUE}========================================${NC}"
    echo ""
}

# Print menu
print_menu() {
    echo -e "${YELLOW}Available Commands:${NC}"
    echo ""
    echo -e "${GREEN}START/STOP${NC}"
    echo "  ./poker-master.sh start       - Start all services"
    echo "  ./poker-master.sh stop        - Stop all services"
    echo "  ./poker-master.sh restart     - Restart all services"
    echo ""
    echo -e "${GREEN}STATUS${NC}"
    echo "  ./poker-master.sh status      - Show services status"
    echo "  ./poker-master.sh logs        - View service logs"
    echo ""
    echo -e "${GREEN}DEVELOPMENT${NC}"
    echo "  ./poker-master.sh frontend    - Start frontend dev server"
    echo "  ./poker-master.sh backend-logs - Watch backend logs"
    echo ""
    echo -e "${GREEN}TESTING${NC}"
    echo "  ./poker-master.sh test        - Run all tests"
    echo "  ./poker-master.sh health      - Check system health"
    echo ""
    echo -e "${GREEN}DATABASE${NC}"
    echo "  ./poker-master.sh db-shell    - Connect to database"
    echo "  ./poker-master.sh db-reset    - Reset database"
    echo ""
    echo -e "${GREEN}UTILITY${NC}"
    echo "  ./poker-master.sh info        - Show configuration"
    echo "  ./poker-master.sh help        - Show this menu"
    echo ""
}

# Function: Start services
start_services() {
    echo -e "${GREEN}Starting all services...${NC}"
    cd deployment/aws
    docker-compose up -d
    sleep 5
    echo -e "${GREEN}✅ Services started!${NC}"
    docker-compose ps
}

# Function: Stop services
stop_services() {
    echo -e "${YELLOW}Stopping all services...${NC}"
    cd deployment/aws
    docker-compose down
    echo -e "${GREEN}✅ Services stopped!${NC}"
}

# Function: Show status
show_status() {
    echo -e "${BLUE}Docker Services Status:${NC}"
    cd deployment/aws
    docker-compose ps
    
    echo ""
    echo -e "${BLUE}Port Status:${NC}"
    netstat -tlnp 2>/dev/null | grep -E ":(3000|3001|3002|5432|6379)" || echo "Services not found"
}

# Function: Frontend dev
start_frontend() {
    echo -e "${GREEN}Starting frontend dev server...${NC}"
    echo -e "${YELLOW}Frontend will be available at: http://localhost:3002${NC}"
    cd frontend
    npm run dev
}

# Function: Health check
health_check() {
    echo -e "${BLUE}System Health Check:${NC}"
    
    echo -n "Backend API: "
    if curl -s http://localhost:3000/api/v1/health > /dev/null; then
        echo -e "${GREEN}✅ Healthy${NC}"
    else
        echo -e "${RED}❌ Unreachable${NC}"
    fi
    
    echo -n "PostgreSQL: "
    if docker exec poker_postgres psql -U postgres -c "\q" 2>/dev/null; then
        echo -e "${GREEN}✅ Connected${NC}"
    else
        echo -e "${RED}❌ Unreachable${NC}"
    fi
    
    echo -n "Redis: "
    if docker exec poker_redis redis-cli ping > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Ready${NC}"
    else
        echo -e "${RED}❌ Unreachable${NC}"
    fi
    
    echo -n "Frontend Dev: "
    if curl -s http://localhost:3002 > /dev/null 2>&1; then
        echo -e "${GREEN}✅ Running${NC}"
    else
        echo -e "${YELLOW}⚠️  Not running (start with: npm run dev in /frontend)${NC}"
    fi
}

# Function: Show config info
show_info() {
    echo -e "${BLUE}Configuration Info:${NC}"
    echo ""
    echo "Frontend:"
    echo "  URL: http://localhost:3002"
    echo "  Port: 3002"
    echo "  Dev Server: npm run dev in /frontend"
    echo ""
    echo "Backend API:"
    echo "  URL: http://localhost:3000"
    echo "  Port: 3000"
    echo "  Status: Running in Docker"
    echo ""
    echo "WebSocket:"
    echo "  URL: ws://localhost:3001"
    echo "  Port: 3001"
    echo ""
    echo "Database:"
    echo "  Type: PostgreSQL 15"
    echo "  Port: 5432"
    echo "  User: postgres"
    echo "  Database: poker_game"
    echo ""
    echo "Cache:"
    echo "  Type: Redis 7"
    echo "  Port: 6379"
    echo ""
    echo "Nginx Proxy:"
    echo "  HTTPS: https://localhost"
    echo "  Port: 443"
    echo ""
}

# Function: Database shell
db_shell() {
    echo -e "${GREEN}Connecting to PostgreSQL database...${NC}"
    docker exec -it poker_postgres psql -U postgres -d poker_game
}

# Function: View logs
view_logs() {
    echo -e "${GREEN}Backend Logs:${NC}"
    cd deployment/aws
    docker-compose logs -f backend
}

# Function: Run tests
run_tests() {
    echo -e "${GREEN}Running system tests...${NC}"
    
    if [ -f "test-local.sh" ]; then
        bash test-local.sh
    else
        echo -e "${YELLOW}Test script not found${NC}"
    fi
}

# Main
print_header

# Handle command line arguments
case "${1:-help}" in
    start)
        start_services
        ;;
    stop)
        stop_services
        ;;
    restart)
        stop_services
        echo ""
        sleep 2
        start_services
        ;;
    status)
        show_status
        ;;
    frontend)
        start_frontend
        ;;
    backend-logs)
        view_logs
        ;;
    health)
        health_check
        ;;
    test)
        run_tests
        ;;
    logs)
        view_logs
        ;;
    db-shell)
        db_shell
        ;;
    info)
        show_info
        ;;
    help|--help|-h)
        print_menu
        ;;
    *)
        echo -e "${RED}Unknown command: $1${NC}"
        echo ""
        print_menu
        ;;
esac
