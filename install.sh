#!/bin/bash

# Bernard Installer
# Usage: curl -fsSL https://raw.githubusercontent.com/sudo25o1/bernard/main/install.sh | bash

set -e

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}${BOLD}"
echo "  ____                                  _ "
echo " | __ )  ___ _ __ _ __   __ _ _ __ __| |"
echo " |  _ \ / _ \ '__| '_ \ / _\` | '__/ _\` |"
echo " | |_) |  __/ |  | | | | (_| | | | (_| |"
echo " |____/ \___|_|  |_| |_|\__,_|_|  \__,_|"
echo ""
echo -e "${NC}${BOLD}  Ever-persistent AI relationship${NC}"
echo ""

INSTALL_DIR="$HOME/bernard"

# Check for required tools
check_requirements() {
    echo -e "${YELLOW}Checking requirements...${NC}"
    
    if ! command -v git &> /dev/null; then
        echo -e "${RED}Error: git is required but not installed.${NC}"
        exit 1
    fi
    
    if ! command -v node &> /dev/null; then
        echo -e "${RED}Error: node is required but not installed.${NC}"
        echo "Install Node.js 22+ from https://nodejs.org"
        exit 1
    fi
    
    if ! command -v pnpm &> /dev/null; then
        echo -e "${YELLOW}pnpm not found. Installing via corepack...${NC}"
        corepack enable && corepack prepare pnpm@latest --activate
        if ! command -v pnpm &> /dev/null; then
            echo -e "${RED}Error: pnpm is required but could not be installed.${NC}"
            echo "Install pnpm: https://pnpm.io/installation"
            exit 1
        fi
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 22 ]; then
        echo -e "${RED}Error: Node.js 22+ required. You have $(node -v)${NC}"
        exit 1
    fi
    
    echo -e "${GREEN}Requirements met.${NC}"
}

# Clone or update repo
clone_repo() {
    if [ -d "$INSTALL_DIR" ]; then
        echo -e "${YELLOW}Bernard directory exists. Updating...${NC}"
        cd "$INSTALL_DIR"
        git pull origin main
    else
        echo -e "${YELLOW}Cloning Bernard...${NC}"
        git clone https://github.com/sudo25o1/bernard.git "$INSTALL_DIR"
        cd "$INSTALL_DIR"
    fi
    echo -e "${GREEN}Repository ready.${NC}"
}

# Install and build
build() {
    echo -e "${YELLOW}Installing dependencies...${NC}"
    pnpm install
    
    echo -e "${YELLOW}Building Bernard...${NC}"
    pnpm build
    
    echo -e "${GREEN}Build complete.${NC}"
}

# Link globally
link() {
    echo -e "${YELLOW}Linking bernard command...${NC}"
    pnpm link --global
    echo -e "${GREEN}Bernard command available globally.${NC}"
}

# Initialize QMD semantic search index
setup_qmd() {
    if ! command -v qmd &> /dev/null; then
        echo -e "${YELLOW}qmd not found — skipping semantic index setup.${NC}"
        echo -e "${YELLOW}Install with: npm install -g @tobilu/qmd${NC}"
        return
    fi

    echo -e "${YELLOW}Initializing QMD semantic index...${NC}"

    WORKSPACE_DIR="$HOME/.openclaw/workspace"
    QMD_STATE_DIR="$HOME/.openclaw/state/agents/main/qmd"

    mkdir -p "$QMD_STATE_DIR/xdg-config" "$QMD_STATE_DIR/xdg-cache" "$WORKSPACE_DIR"

    export XDG_CONFIG_HOME="$QMD_STATE_DIR/xdg-config"
    export XDG_CACHE_HOME="$QMD_STATE_DIR/xdg-cache"

    # Add collections (idempotent)
    qmd collection add "$WORKSPACE_DIR" --name memory-root --mask "MEMORY.md" 2>/dev/null || true
    qmd collection add "$WORKSPACE_DIR" --name memory-alt  --mask "memory.md"  2>/dev/null || true
    qmd collection add "$WORKSPACE_DIR" --name memory-dir  --mask "**/*.md"    2>/dev/null || true

    # Index files (fast)
    qmd update 2>/dev/null || true

    # Embed in background (slow — don't block install)
    qmd embed &

    unset XDG_CONFIG_HOME
    unset XDG_CACHE_HOME

    echo -e "${GREEN}QMD index initialized.${NC}"
}

# Run onboarding
onboard() {
    echo ""
    echo -e "${BLUE}${BOLD}Starting Bernard onboarding...${NC}"
    echo ""
    sleep 1
    bernard onboard
}

# Main
main() {
    check_requirements
    clone_repo
    build
    link
    setup_qmd
    onboard
}

main
