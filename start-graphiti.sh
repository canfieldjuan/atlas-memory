#!/bin/bash
# Graphiti Services Startup Script
# Starts Neo4j and Graphiti Wrapper Server
# Usage: ./start-graphiti.sh

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GRAPHITI_MAIN_DIR="$SCRIPT_DIR/graphiti-main"
GRAPHITI_WRAPPER_DIR="$SCRIPT_DIR/graphiti-wrapper"
LOG_FILE="/tmp/graphiti-wrapper.log"

echo -e "${BLUE}==================================================${NC}"
echo -e "${BLUE}    Graphiti Services Startup Script${NC}"
echo -e "${BLUE}==================================================${NC}"
echo ""

# Function to print status messages
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_error() {
    echo -e "${RED}[✗]${NC} $1"
}

print_info() {
    echo -e "${YELLOW}[i]${NC} $1"
}

# Check prerequisites
echo -e "${BLUE}Step 1: Checking prerequisites...${NC}"

if ! command -v docker &> /dev/null; then
    print_error "Docker is not installed"
    exit 1
fi
print_status "Docker is installed"

if ! docker compose version &> /dev/null; then
    print_error "docker compose is not installed"
    exit 1
fi
print_status "docker compose is installed"

if ! command -v python3 &> /dev/null; then
    print_error "Python3 is not installed"
    exit 1
fi
print_status "Python3 is installed"

# Check if virtual environment exists
if [ ! -d "$GRAPHITI_WRAPPER_DIR/venv" ]; then
    print_info "Virtual environment not found. Creating..."
    cd "$GRAPHITI_WRAPPER_DIR"
    python3 -m venv venv
    source venv/bin/activate
    pip install --quiet fastapi uvicorn pydantic pydantic-settings graphiti-core
    print_status "Virtual environment created and dependencies installed"
else
    print_status "Virtual environment exists"
fi

echo ""

# Start Neo4j
echo -e "${BLUE}Step 2: Starting Neo4j database...${NC}"

# Check if Neo4j is already running
if sudo docker ps | grep -q graphiti-main_neo4j; then
    print_info "Neo4j container is already running"
else
    cd "$GRAPHITI_MAIN_DIR"

    # Check if .env file exists
    if [ ! -f ".env" ]; then
        print_error ".env file not found in $GRAPHITI_MAIN_DIR"
        print_info "Creating .env file..."
        cat > .env << 'EOF'
OPENAI_API_KEY=ollama
NEO4J_PORT=7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password123
EOF
        print_status ".env file created"
    fi

    sudo docker compose up -d neo4j
    print_status "Neo4j container started"
fi

# Wait for Neo4j to become healthy
echo -e "${BLUE}Step 3: Waiting for Neo4j to become healthy...${NC}"
MAX_WAIT=30
WAITED=0
while [ $WAITED -lt $MAX_WAIT ]; do
    if sudo docker ps | grep graphiti-main_neo4j | grep -q "healthy"; then
        print_status "Neo4j is healthy"
        break
    fi
    echo -n "."
    sleep 1
    WAITED=$((WAITED + 1))
done

if [ $WAITED -eq $MAX_WAIT ]; then
    print_error "Neo4j did not become healthy in time"
    print_info "Check logs with: sudo docker logs graphiti-main_neo4j_1"
    exit 1
fi

echo ""

# Start Graphiti Wrapper
echo -e "${BLUE}Step 4: Starting Graphiti Wrapper Server...${NC}"

# Check if wrapper is already running
if ps aux | grep -v grep | grep -q "python.*main.py"; then
    print_info "Graphiti wrapper is already running"
    print_info "Stopping existing instance..."
    pkill -f "python.*main.py" || true
    sleep 2
fi

cd "$GRAPHITI_WRAPPER_DIR"

# Clear old log file
> "$LOG_FILE"

# Start wrapper in background
source venv/bin/activate && python main.py > "$LOG_FILE" 2>&1 &
WRAPPER_PID=$!

# Wait for server to start
sleep 3

# Check if server is running
if ! kill -0 $WRAPPER_PID 2>/dev/null; then
    print_error "Graphiti wrapper failed to start"
    print_info "Check logs at: $LOG_FILE"
    tail -20 "$LOG_FILE"
    exit 1
fi

# Test health endpoint
if curl -s http://localhost:8001/health | grep -q "healthy"; then
    print_status "Graphiti wrapper is running (PID: $WRAPPER_PID)"
else
    print_error "Graphiti wrapper is not responding"
    print_info "Check logs at: $LOG_FILE"
    exit 1
fi

echo ""
echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}    All services started successfully!${NC}"
echo -e "${GREEN}==================================================${NC}"
echo ""
echo -e "${BLUE}Service URLs:${NC}"
echo -e "  Neo4j Browser:      ${GREEN}http://localhost:7474${NC}"
echo -e "  Neo4j Bolt:         ${GREEN}bolt://localhost:7687${NC}"
echo -e "  Graphiti API:       ${GREEN}http://localhost:8001${NC}"
echo -e "  API Health Check:   ${GREEN}http://localhost:8001/health${NC}"
echo ""
echo -e "${BLUE}Credentials:${NC}"
echo -e "  Username: ${GREEN}neo4j${NC}"
echo -e "  Password: ${GREEN}password123${NC}"
echo ""
echo -e "${BLUE}Logs:${NC}"
echo -e "  Neo4j:     ${YELLOW}docker logs graphiti-main_neo4j_1${NC}"
echo -e "  Wrapper:   ${YELLOW}tail -f $LOG_FILE${NC}"
echo ""
echo -e "${BLUE}To stop services:${NC}"
echo -e "  ${YELLOW}./stop-graphiti.sh${NC}"
echo ""
