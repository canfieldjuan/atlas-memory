#!/bin/bash
# Graphiti Services Shutdown Script
# Stops Neo4j and Graphiti Wrapper Server
# Usage: ./stop-graphiti.sh

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Paths
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
GRAPHITI_MAIN_DIR="$SCRIPT_DIR/graphiti-main"

echo -e "${BLUE}==================================================${NC}"
echo -e "${BLUE}    Graphiti Services Shutdown Script${NC}"
echo -e "${BLUE}==================================================${NC}"
echo ""

# Function to print status messages
print_status() {
    echo -e "${GREEN}[✓]${NC} $1"
}

print_info() {
    echo -e "${YELLOW}[i]${NC} $1"
}

# Stop Graphiti Wrapper
echo -e "${BLUE}Stopping Graphiti Wrapper Server...${NC}"
if ps aux | grep -v grep | grep -q "python.*main.py"; then
    pkill -f "python.*main.py"
    print_status "Graphiti wrapper stopped"
else
    print_info "Graphiti wrapper was not running"
fi

echo ""

# Stop Neo4j
echo -e "${BLUE}Stopping Neo4j Database...${NC}"
if sudo docker ps | grep -q graphiti-main_neo4j; then
    cd "$GRAPHITI_MAIN_DIR"
    sudo docker compose down
    print_status "Neo4j stopped"
else
    print_info "Neo4j was not running"
fi

echo ""
echo -e "${GREEN}==================================================${NC}"
echo -e "${GREEN}    All services stopped successfully!${NC}"
echo -e "${GREEN}==================================================${NC}"
echo ""
