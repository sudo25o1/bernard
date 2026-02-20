#!/bin/bash

# Start a new research project
# Usage: start-research.sh "topic" [channel] [userId]

TOPIC="$1"
CHANNEL="${2:-unknown}"
USER_ID="${3:-unknown}"

if [ -z "$TOPIC" ]; then
  echo "Usage: start-research.sh \"topic\" [channel] [userId]"
  exit 1
fi

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ORCHESTRATOR="$SCRIPT_DIR/orchestrator.js"

# Initialize research
echo "Initializing research: $TOPIC"
STATE_JSON=$("$ORCHESTRATOR" init "$TOPIC")
SLUG=$(echo "$STATE_JSON" | jq -r '.slug')

if [ -z "$SLUG" ]; then
  echo "Failed to initialize research"
  exit 1
fi

echo "Research slug: $SLUG"

# Store metadata about who requested this and where to deliver results
WORKSPACE="${OPENCLAW_WORKSPACE:-$HOME/.openclaw/workspace}"
STATE_FILE="$WORKSPACE/research/$SLUG/state.json"

# Update state with channel and user info
jq --arg channel "$CHANNEL" --arg userId "$USER_ID" \
  '.metadata.channel = $channel | .metadata.userId = $userId' \
  "$STATE_FILE" > "$STATE_FILE.tmp" && mv "$STATE_FILE.tmp" "$STATE_FILE"

# Execute Tier 1 immediately
echo "Executing Tier 1..."
"$ORCHESTRATOR" tier1 "$SLUG"

# Schedule Tier 2 (5 minutes from now)
TIER2_TIME=$(date -u -v+5M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "+5 minutes" +"%Y-%m-%dT%H:%M:%SZ")
echo "Scheduling Tier 2 for: $TIER2_TIME"

# Using OpenClaw cron tool to schedule phases
# This would be called via Bernard's cron tool
echo "TODO: Schedule tier2 cron job at $TIER2_TIME"
echo "Command: $ORCHESTRATOR tier2 $SLUG"

# Schedule Tier 3 (10 minutes from now)
TIER3_TIME=$(date -u -v+10M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "+10 minutes" +"%Y-%m-%dT%H:%M:%SZ")
echo "Scheduling Tier 3 for: $TIER3_TIME"
echo "TODO: Schedule tier3 cron job at $TIER3_TIME"
echo "Command: $ORCHESTRATOR tier3 $SLUG"

# Schedule Compilation (15 minutes from now)
COMPILE_TIME=$(date -u -v+15M +"%Y-%m-%dT%H:%M:%SZ" 2>/dev/null || date -u -d "+15 minutes" +"%Y-%m-%dT%H:%M:%SZ")
echo "Scheduling Compilation for: $COMPILE_TIME"
echo "TODO: Schedule compile cron job at $COMPILE_TIME"
echo "Command: $ORCHESTRATOR compile $SLUG && deliver results to $CHANNEL"

echo ""
echo "Research initialized: $TOPIC"
echo "Tier 1 complete. Subsequent phases scheduled."
echo "Results will be delivered to: $CHANNEL"
