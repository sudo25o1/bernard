#!/bin/bash

# Bernard Installer
#
# Usage (pick one):
#   bash <(curl -fsSL https://raw.githubusercontent.com/sudo25o1/bernard/main/install.sh)
#   curl -fsSL https://raw.githubusercontent.com/sudo25o1/bernard/main/install.sh -o /tmp/bi.sh && bash /tmp/bi.sh
#
# NOTE: "curl ... | bash" won't work — sudo needs an interactive terminal.

set -e

# Colors
BLUE='\033[0;34m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Bail early if stdin isn't a terminal — sudo prompts won't work.
if [ ! -t 0 ]; then
    echo "Error: This installer needs an interactive terminal for sudo."
    echo ""
    echo "Run with:"
    echo "  bash <(curl -fsSL https://raw.githubusercontent.com/sudo25o1/bernard/main/install.sh)"
    exit 1
fi

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
OS="$(uname -s)"

# ============================================================================
# Platform bootstrap -- install system-level deps before anything else
# ============================================================================

bootstrap_macos() {
    # Cache sudo credentials upfront so later commands don't stall
    if [ "$(id -u)" -ne 0 ]; then
        echo -e "${YELLOW}Some steps need sudo. Enter your password if prompted:${NC}"
        sudo -v
    fi

    # Xcode Command Line Tools (provides git, clang, make)
    if ! xcode-select -p &> /dev/null; then
        echo -e "${YELLOW}Installing Xcode Command Line Tools...${NC}"
        echo -e "${YELLOW}A system dialog may appear -- click Install and wait.${NC}"
        xcode-select --install
        # Wait for install to finish
        until xcode-select -p &> /dev/null; do
            sleep 5
        done
        echo -e "${GREEN}Xcode CLT installed.${NC}"
    fi

    # Homebrew
    if ! command -v brew &> /dev/null; then
        echo -e "${YELLOW}Installing Homebrew...${NC}"
        /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
        # Add brew to PATH for this session
        if [ -f /opt/homebrew/bin/brew ]; then
            eval "$(/opt/homebrew/bin/brew shellenv)"
        elif [ -f /usr/local/bin/brew ]; then
            eval "$(/usr/local/bin/brew shellenv)"
        fi
        echo -e "${GREEN}Homebrew installed.${NC}"
    fi

    # Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${YELLOW}Installing Node.js...${NC}"
        brew install node
        echo -e "${GREEN}Node.js installed.${NC}"
    fi
}

bootstrap_linux() {
    # Cache sudo credentials upfront so later commands don't stall
    if [ "$(id -u)" -ne 0 ]; then
        echo -e "${YELLOW}Some steps need sudo. Enter your password if prompted:${NC}"
        sudo -v
    fi

    # Detect package manager
    if command -v apt-get &> /dev/null; then
        PKG="sudo apt-get install -y"
    elif command -v dnf &> /dev/null; then
        PKG="sudo dnf install -y"
    elif command -v pacman &> /dev/null; then
        PKG="sudo pacman -S --noconfirm"
    else
        echo -e "${RED}Could not detect package manager (apt/dnf/pacman).${NC}"
        echo "Install manually: git, Node.js 22+, build tools (gcc, g++, make), python3"
        exit 1
    fi

    # Build tools + git
    if ! command -v gcc &> /dev/null || ! command -v git &> /dev/null; then
        echo -e "${YELLOW}Installing build tools and git...${NC}"
        if command -v apt-get &> /dev/null; then
            sudo apt-get update
            $PKG build-essential git python3 curl
        elif command -v dnf &> /dev/null; then
            $PKG gcc gcc-c++ make git python3 curl
        elif command -v pacman &> /dev/null; then
            $PKG base-devel git python curl
        fi
        echo -e "${GREEN}Build tools installed.${NC}"
    fi

    # Node.js
    if ! command -v node &> /dev/null; then
        echo -e "${YELLOW}Installing Node.js 22...${NC}"
        curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
        sudo apt-get install -y nodejs 2>/dev/null || $PKG nodejs
        echo -e "${GREEN}Node.js installed.${NC}"
    fi
}

bootstrap() {
    echo -e "${YELLOW}Bootstrapping system dependencies...${NC}"

    case "$OS" in
        Darwin) bootstrap_macos ;;
        Linux)  bootstrap_linux ;;
        *)
            echo -e "${RED}Unsupported OS: $OS${NC}"
            echo "Bernard supports macOS and Linux."
            exit 1
            ;;
    esac

    echo -e "${GREEN}System dependencies ready.${NC}"
}

# ============================================================================
# Check and install remaining tools
# ============================================================================

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

    NODE_VERSION=$(node -v | cut -d'v' -f2 | cut -d'.' -f1)
    if [ "$NODE_VERSION" -lt 22 ]; then
        echo -e "${RED}Error: Node.js 22+ required. You have $(node -v)${NC}"
        echo -e "${YELLOW}Update with: brew install node (macOS) or see https://nodejs.org${NC}"
        exit 1
    fi

    # pnpm via corepack
    if ! command -v pnpm &> /dev/null; then
        echo -e "${YELLOW}Installing pnpm via corepack...${NC}"
        corepack enable && corepack prepare pnpm@latest --activate
        if ! command -v pnpm &> /dev/null; then
            echo -e "${RED}Error: pnpm is required but could not be installed.${NC}"
            echo "Install pnpm: https://pnpm.io/installation"
            exit 1
        fi
    fi

    echo -e "${GREEN}Requirements met.${NC}"
}

# ============================================================================
# Clone, build, link
# ============================================================================

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

build() {
    echo -e "${YELLOW}Installing dependencies...${NC}"
    pnpm install

    echo -e "${YELLOW}Building Bernard...${NC}"
    pnpm build

    echo -e "${GREEN}Build complete.${NC}"
}

link() {
    echo -e "${YELLOW}Linking bernard command...${NC}"
    pnpm link --global
    echo -e "${GREEN}Bernard command available globally.${NC}"
}

# ============================================================================
# QMD semantic search
# ============================================================================

setup_qmd() {
    if ! command -v qmd &> /dev/null; then
        echo -e "${YELLOW}Installing QMD semantic search...${NC}"
        npm install -g @tobilu/qmd 2>/dev/null || pnpm add -g @tobilu/qmd 2>/dev/null || true
        if ! command -v qmd &> /dev/null; then
            echo -e "${YELLOW}QMD install failed -- skipping semantic index setup.${NC}"
            echo -e "${YELLOW}Install manually with: npm install -g @tobilu/qmd${NC}"
            return
        fi
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

    # Embed in background (slow -- don't block install)
    qmd embed &

    unset XDG_CONFIG_HOME
    unset XDG_CACHE_HOME

    echo -e "${GREEN}QMD index initialized.${NC}"
}

# ============================================================================
# Onboarding
# ============================================================================

onboard() {
    echo ""
    echo -e "${BLUE}${BOLD}Starting Bernard onboarding...${NC}"
    echo ""
    sleep 1
    bernard onboard
}

# ============================================================================
# Main
# ============================================================================

main() {
    bootstrap
    check_requirements
    clone_repo
    build
    link
    setup_qmd
    onboard
}

main
