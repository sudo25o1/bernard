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
        echo "Install Node.js 18+ from https://nodejs.org"
        exit 1
    fi
    
    if ! command -v npm &> /dev/null; then
        echo -e "${RED}Error: npm is required but not installed.${NC}"
        exit 1
    fi
    
    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 18 ]; then
        echo -e "${RED}Error: Node.js 18+ required. You have $(node -v)${NC}"
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
    npm install
    
    echo -e "${YELLOW}Building Bernard...${NC}"
    npm run build
    
    echo -e "${GREEN}Build complete.${NC}"
}

# Link globally
link() {
    echo -e "${YELLOW}Linking bernard command...${NC}"
    npm link
    echo -e "${GREEN}Bernard command available globally.${NC}"
}

# Setup caffeinate on macOS to prevent sleep
setup_caffeinate() {
    if [[ "$(uname)" != "Darwin" ]]; then
        return
    fi
    
    echo -e "${YELLOW}Setting up caffeinate (prevent sleep)...${NC}"
    
    mkdir -p ~/Library/LaunchAgents
    
    cat > ~/Library/LaunchAgents/com.bernard.caffeinate.plist << 'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>com.bernard.caffeinate</string>
    <key>ProgramArguments</key>
    <array>
        <string>/usr/bin/caffeinate</string>
        <string>-dimsu</string>
    </array>
    <key>RunAtLoad</key>
    <true/>
    <key>KeepAlive</key>
    <true/>
</dict>
</plist>
PLIST
    
    launchctl unload ~/Library/LaunchAgents/com.bernard.caffeinate.plist 2>/dev/null || true
    launchctl load ~/Library/LaunchAgents/com.bernard.caffeinate.plist
    
    echo -e "${GREEN}Caffeinate running. Bernard won't sleep.${NC}"
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
    setup_caffeinate
    onboard
}

main
