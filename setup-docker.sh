#!/bin/bash

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}   🎰 Poker Game - Docker Health Check & Setup${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo -e "${RED}❌ Docker is not installed${NC}"
    exit 1
fi

# Check if Docker daemon is running
if ! docker info &> /dev/null; then
    echo -e "${RED}❌ Docker daemon is not running${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Docker is installed and running${NC}\n"

# Get deployment directory
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
DEPLOY_DIR="$SCRIPT_DIR/deployment/aws"

if [ ! -d "$DEPLOY_DIR" ]; then
    echo -e "${RED}❌ Cannot find deployment directory at $DEPLOY_DIR${NC}"
    exit 1
fi

echo -e "${BLUE}📁 Deployment Directory: $DEPLOY_DIR${NC}\n"

# Check if docker-compose.yml exists
if [ ! -f "$DEPLOY_DIR/docker-compose.yml" ]; then
    echo -e "${RED}❌ docker-compose.yml not found${NC}"
    exit 1
fi

echo -e "${BLUE}Checking Docker Compose configuration...${NC}"
cd "$DEPLOY_DIR"

# Validate docker-compose.yml
if docker-compose config > /dev/null 2>&1; then
    echo -e "${GREEN}✅ docker-compose.yml is valid${NC}\n"
else
    echo -e "${RED}❌ docker-compose.yml has errors${NC}"
    exit 1
fi

# Check if containers are already running
echo -e "${BLUE}Checking existing containers...${NC}"
RUNNING=$(docker-compose ps -q 2>/dev/null | wc -l)

if [ "$RUNNING" -gt 0 ]; then
    echo -e "${YELLOW}⚠️  Some containers are already running${NC}"
    echo -e "${BLUE}Current status:${NC}"
    docker-compose ps
    echo ""
    
    read -p "Do you want to restart them? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}Restarting containers...${NC}"
        docker-compose down
        docker-compose up -d
    else
        echo -e "${YELLOW}Skipping restart${NC}"
    fi
else
    echo -e "${YELLOW}⚠️  No containers are running${NC}\n"
    
    read -p "Do you want to start them now? (y/n) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        echo -e "${BLUE}Starting containers...${NC}"
        docker-compose up -d
    else
        echo -e "${YELLOW}Skipping startup${NC}"
        exit 0
    fi
fi

# Wait for services to initialize
echo -e "\n${BLUE}Waiting for services to initialize...${NC}"
for i in {1..30}; do
    printf "."
    sleep 1
done
echo ""

# Check container status
echo -e "\n${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Container Status:${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

docker-compose ps

echo ""

# Check health endpoints
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Health Checks:${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

# Check Backend
echo -n "Backend (http://localhost:3000/health): "
if curl -s http://localhost:3000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌${NC}"
fi

# Check PostgreSQL
echo -n "PostgreSQL (port 5432): "
if docker exec -it poker_postgres pg_isready -U postgres > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌${NC}"
fi

# Check Redis
echo -n "Redis (port 6379): "
if docker exec -it poker_redis redis-cli ping > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌${NC}"
fi

# Check Nginx
echo -n "Nginx (port 80): "
if curl -s http://localhost/health > /dev/null 2>&1; then
    echo -e "${GREEN}✅${NC}"
else
    echo -e "${RED}❌${NC}"
fi

echo ""

# System Information
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}System Information:${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

echo -e "Docker Version: $(docker --version | cut -d' ' -f3)"
echo -e "Docker Compose Version: $(docker-compose --version | cut -d' ' -f3)"
echo -e "Node.js Version: $(node --version 2>/dev/null || echo 'Not installed')"
echo -e "Total Containers: $(docker ps --all -q | wc -l)"
echo -e "Running Containers: $(docker ps -q | wc -l)"

echo ""

# Quick Commands
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Quick Commands:${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

echo "View logs:"
echo -e "  ${YELLOW}docker logs -f poker_backend${NC}"
echo ""

echo "Access database:"
echo -e "  ${YELLOW}docker exec -it poker_postgres psql -U postgres -d poker_game${NC}"
echo ""

echo "Access cache:"
echo -e "  ${YELLOW}docker exec -it poker_redis redis-cli${NC}"
echo ""

echo "View metrics:"
echo -e "  ${YELLOW}curl http://localhost:3000/metrics${NC}"
echo ""

echo "Run tests:"
echo -e "  ${YELLOW}./test-local.sh${NC}"
echo ""

echo "Stop all services:"
echo -e "  ${YELLOW}docker-compose down${NC}"
echo ""

# Next steps
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}"
echo -e "${BLUE}Next Steps:${NC}"
echo -e "${BLUE}═══════════════════════════════════════════════════════════${NC}\n"

echo "1. Run the automated test suite:"
echo -e "   ${YELLOW}cd $SCRIPT_DIR${NC}"
echo -e "   ${YELLOW}./test-local.sh${NC}"
echo ""

echo "2. Or use Postman with the collection:"
echo -e "   ${YELLOW}Poker_Game_API.postman_collection.json${NC}"
echo ""

echo "3. Or follow the Quick Start guide:"
echo -e "   ${YELLOW}cat QUICK_START.md${NC}"
echo ""

echo -e "${GREEN}✅ Setup complete! Services are ready for testing.${NC}\n"
