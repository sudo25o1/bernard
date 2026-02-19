# Significance Extension - Technical Overview

## Summary

The Significance extension transforms Bernard from a reactive assistant into a proactive companion. It monitors relationship state, extracts context from conversations, and reaches out to users after periods of inactivity - like texting a friend.

## Architecture

### Core Components

```
extensions/significance/
├── index.ts                 # Main plugin: hooks, service, CLI
├── src/
│   ├── qmd-context.ts       # QMD semantic search for context extraction
│   └── idle-service.ts      # Idle detection and state management
```

### Data Flow

```
User Interaction
       │
       ▼
┌─────────────────┐
│   agent_end     │──────► Update lastInteractionMs
│     hook        │──────► Extract tasks/threads (regex)
└─────────────────┘──────► Update RELATIONAL.md
       
       │
       ▼ (time passes)
       
┌─────────────────┐
│ Background      │──────► Check idle threshold
│ Service (30min) │──────► Query QMD for context
└─────────────────┘──────► Trigger check-in via system event
       │
       ▼
┌─────────────────┐
│ Channel Router  │──────► Telegram / Discord / WhatsApp / etc.
└─────────────────┘
```

## Context Extraction Strategy

### QMD Semantic Search (Primary)

QMD is the default memory backend for Bernard. All context extraction for proactive check-ins uses QMD semantic search:

```typescript
// Parallel queries for speed
const [tasks, threads, topics, decisions] = await Promise.all([
  queryQmd("what was the user working on recently tasks projects"),
  queryQmd("unfinished incomplete todo later tomorrow revisit"),
  queryQmd("last discussion topic conversation"),
  queryQmd("decided to use going with choice decision"),
]);
```

**Why QMD:**
- Semantic understanding vs. keyword matching
- Searches across all indexed conversations
- Returns relevance-scored snippets
- Already integrated as Bernard's memory layer

### Regex Extraction (Fallback)

Regex patterns are retained as a fallback for edge cases:
- First boot before QMD index is built
- Index corruption or rebuild scenarios
- QMD binary temporarily unavailable

This is defensive programming, not an expected flow. In normal operation, QMD handles all context extraction.

### Real-time Extraction (Different Purpose)

Regex patterns (`TASK_PATTERNS`, `THREAD_PATTERNS`) are still used in the `agent_end` hook for extracting tasks from the **current conversation**. This is real-time extraction from the message stream, stored to `.significance/tasks.json` for quick access.

## Proactive Check-in System

### Idle Detection

The background service tracks:

| Field | Description |
|-------|-------------|
| `lastInteractionMs` | Timestamp of last user interaction |
| `lastCheckInMs` | Timestamp of last proactive check-in |
| `relationshipStartMs` | When the relationship began (for learning mode) |
| `checkInCount` | Total check-ins sent |

### Learning Mode

For the first two weeks of a relationship, Bernard checks in more frequently:

| Mode | Idle Threshold | Rationale |
|------|----------------|-----------|
| Learning | 2 hours | Building relationship, learning patterns |
| Mature | 4 hours | Established relationship, less intrusive |

### Sleep Hours

Check-ins respect quiet hours (configurable):

```typescript
// Supports both formats
sleepStart: "00:00"  // or 0 (midnight)
sleepEnd: "08:00"    // or 8 (8 AM)

// Handles overnight ranges correctly
sleepStart: "22:00", sleepEnd: "07:00"  // 10 PM to 7 AM
```

### Delivery

Check-ins route through OpenClaw's existing channel infrastructure:

```typescript
const { enqueueSystemEvent } = await import("../../src/infra/system-events.js");
const { resolveAgentMainSessionKey } = await import("../../src/config/sessions.js");

const sessionKey = resolveAgentMainSessionKey({ cfg, agentId: "bernard" });
enqueueSystemEvent(checkInPrompt, { sessionKey });
```

This means check-ins go to whatever channel the user has configured (Telegram, Discord, WhatsApp, Signal, etc.) without any channel-specific code in the extension.

## Configuration

```json
{
  "plugins": {
    "significance": {
      "enabled": true,
      "proactiveCheckIns": true,
      "useQmd": true,
      "sleepStart": "00:00",
      "sleepEnd": "08:00",
      "checkIntervalMs": 1800000,
      "learningIdleThresholdMs": 7200000,
      "matureIdleThresholdMs": 14400000,
      "autoInject": true,
      "gapDetection": true
    }
  }
}
```

| Option | Default | Description |
|--------|---------|-------------|
| `proactiveCheckIns` | `true` | Enable background idle detection |
| `useQmd` | `true` | Use QMD semantic search for context |
| `sleepStart` | `"00:00"` | Start of quiet hours |
| `sleepEnd` | `"08:00"` | End of quiet hours |
| `checkIntervalMs` | `1800000` | How often to check idle (30 min) |
| `learningIdleThresholdMs` | `7200000` | Learning mode threshold (2 hours) |
| `matureIdleThresholdMs` | `14400000` | Mature mode threshold (4 hours) |
| `autoInject` | `true` | Inject relationship context into prompts |
| `gapDetection` | `true` | Detect gaps in user/relational knowledge |

## CLI Commands

```bash
# Show current status
bernard significance status

# Output:
# Significance Status
# ========================================
# RELATIONAL.md: exists
# USER.md: exists
# Time of day: afternoon
# Check-ins: ON
# Sleep hours: 00:00 - 08:00
# Proactive: ON
# QMD search: ON
# Mode: Learning (2h threshold)
# Last interaction: 45 minutes ago
# Check-ins sent: 3
# Recent tasks: building significance extension, fixing QMD integration

# Generate a check-in (without sending)
bernard significance checkin

# Show detected knowledge gaps
bernard significance gaps

# Show tracked tasks and threads
bernard significance tasks
```

## Integration Points

### Hooks Used

| Hook | Purpose |
|------|---------|
| `before_agent_start` | Inject relationship context + check-in guidance |
| `agent_end` | Extract significance, update RELATIONAL.md, track tasks |
| `session_end` | Gap detection, pattern analysis |

### Files Written

| Path | Purpose |
|------|---------|
| `~/.openclaw/workspace/RELATIONAL.md` | Relationship dynamics |
| `~/.openclaw/workspace/USER.md` | User identity/preferences |
| `~/.openclaw/workspace/memory/YYYY-MM-DD.md` | Daily significant moments |
| `~/.openclaw/workspace/.significance/tasks.json` | Recent tasks/threads |
| `~/.openclaw/workspace/.significance/gaps.json` | Detected knowledge gaps |
| `~/.openclaw/state/significance-idle.json` | Idle tracking state |

## Design Principles

1. **QMD is the source of truth** - Semantic search over regex for historical context
2. **Graceful degradation** - Fallback to file-based extraction if QMD unavailable
3. **Channel agnostic** - Routes through OpenClaw's infrastructure, works with any channel
4. **Relationship aware** - Learning mode adapts behavior to relationship maturity
5. **Respect boundaries** - Sleep hours, minimum gaps between check-ins
6. **Context is king** - Check-ins reference what the user was actually working on
