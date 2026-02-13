# Bernard: OpenClaw Fork for Relational AI

Bernard transforms OpenClaw from a multi-channel AI gateway into a relational companion that maintains persistent memory and proactively engages users.

## Philosophy

**OpenClaw** is infrastructure - routing, channels, tools, memory backends.

**Bernard** is relationship - identity, context persistence, proactive engagement, learning over time.

The core insight: 85% persistence equals success. You don't need perfect recall - you need enough context to maintain relationship continuity across AI context resets.

---

## What Bernard Adds to OpenClaw

### 1. Identity Layer

| File | Purpose |
|------|---------|
| `SOUL.md` | Who Bernard is in this relationship |
| `USER.md` | Facts about the user |
| `RELATIONAL.md` | How they work together |
| `BOOTSTRAP.md` | First contact onboarding flow |

These aren't static config files. They evolve through conversation and are referenced on every interaction.

**Key difference from vanilla OpenClaw:** Bernard has a persistent identity that adapts to each user, not a blank-slate assistant persona.

### 2. Onboarding System

`BOOTSTRAP.md` defines first contact behavior:

- Discover user's name, communication style, autonomy preferences
- Learn through conversation, not checklists
- Reflect on who Bernard is becoming *with this person*
- Route learnings to appropriate files (USER.md, RELATIONAL.md, SOUL.md)
- Self-deletes when relationship is established

**Gateway method:** `bernard.reset` - Restores onboarding files to restart relationship.

### 3. Significance Extension

Full relational memory engine (`extensions/significance/`):

**Hooks:**
- `before_agent_start` - Inject relationship context into every conversation
- `agent_end` - Extract significance, update RELATIONAL.md, track tasks
- `session_end` - Gap detection, pattern analysis

**Background Service:**
- Monitors idle time
- Triggers proactive check-ins after configurable threshold
- Learning mode (first 2 weeks): 2-hour threshold
- Mature mode: 4-hour threshold
- Respects sleep hours

**QMD Integration:**
- Semantic search for context extraction (what was user working on?)
- Replaces regex-based task detection
- Parallel queries for recent tasks, open threads, decisions

### 4. QMD as Default Memory Backend

Changed default from SQLite embeddings to QMD:

- Session export enabled by default (conversations indexed)
- Semantic search across all historical conversations
- Better context extraction for check-ins

### 5. Proactive Check-ins

Bernard reaches out after periods of inactivity:

```
Idle Detection → QMD Context Query → Generate Check-in → Route to Channel
```

**Delivery:** Uses OpenClaw's `enqueueSystemEvent` with `channel: "last"` - routes to whatever channel user has configured (Telegram, Discord, WhatsApp, etc.)

**Not canned messages.** Check-ins reference actual work context:
- "Looked like you were working on the significance extension. Want to pick that back up?"
- References open threads, recent decisions
- Time-aware tone (morning: energized, evening: reflective)

### 6. Visual Identity

**Ghost in the Shell aesthetic:**
- Green/cyan on black terminal palette
- User text: cyan
- Bernard responses: green
- Minimal, technical, raw

**CLI alias:** `bernard` runs OpenClaw with Bernard configuration.

**ASCII banner:** Custom BERNARD header on startup.

---

## Architecture Diagram

```
┌────────────────────────────────────────────────────────────────┐
│                         BERNARD                                 │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │  SOUL.md    │  │  USER.md    │  │ RELATIONAL  │             │
│  │  Identity   │  │  Facts      │  │   .md       │             │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘             │
│         │                │                │                     │
│         └────────────────┼────────────────┘                     │
│                          │                                      │
│                          ▼                                      │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              SIGNIFICANCE EXTENSION                      │   │
│  │                                                          │   │
│  │  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐   │   │
│  │  │ QMD Context  │  │ Idle Service │  │ Gap Detection│   │   │
│  │  │   Search     │  │  (30min)     │  │              │   │   │
│  │  └──────────────┘  └──────────────┘  └──────────────┘   │   │
│  │                                                          │   │
│  │  Hooks: before_agent_start, agent_end, session_end      │   │
│  └─────────────────────────────────────────────────────────┘   │
│                          │                                      │
└──────────────────────────┼──────────────────────────────────────┘
                           │
                           ▼
┌────────────────────────────────────────────────────────────────┐
│                        OPENCLAW                                 │
├────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Channels  │  │    Cron     │  │    QMD      │             │
│  │  Telegram   │  │   Service   │  │   Memory    │             │
│  │  Discord    │  │             │  │   Backend   │             │
│  │  WhatsApp   │  │             │  │             │             │
│  │  Signal     │  │             │  │             │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │
│  │   Gateway   │  │   Plugins   │  │    TUI      │             │
│  │   Server    │  │   System    │  │             │             │
│  └─────────────┘  └─────────────┘  └─────────────┘             │
│                                                                 │
└────────────────────────────────────────────────────────────────┘
```

---

## Configuration

### Significance Extension

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

### QMD Memory Backend

Enabled by default in Bernard. Sessions are exported and indexed for semantic search.

---

## CLI Commands

```bash
# Run Bernard
bernard

# Reset onboarding (start relationship fresh)
bernard reset

# Significance status
bernard significance status

# Generate check-in preview
bernard significance checkin

# Show knowledge gaps
bernard significance gaps

# Show tracked tasks/threads
bernard significance tasks
```

---

## Files Modified from OpenClaw

| Category | Files | Changes |
|----------|-------|---------|
| **Entry Point** | `bernard.mjs`, `package.json` | Added `bernard` CLI alias |
| **Memory** | `src/memory/backend-config.ts` | QMD as default, sessions enabled |
| **Gateway** | `src/gateway/server-methods/bernard.ts` | Reset handler |
| **TUI** | `src/tui/theme/theme.ts`, `src/tui/tui.ts` | Green/cyan palette, branding |
| **Templates** | `docs/reference/templates/*.md` | SOUL, USER, RELATIONAL, BOOTSTRAP |
| **Extension** | `extensions/significance/` | Full relational memory engine |

---

## Design Principles

1. **Relationship over transaction** - Bernard exists to build something that compounds, not complete tasks and disappear.

2. **Context is king** - What Bernard says matters less than understanding why it matters to the user in this moment.

3. **85% persistence = success** - Perfect recall isn't the goal. Enough context to maintain continuity is.

4. **Proactive, not reactive** - Bernard reaches out. Like texting a friend.

5. **Respect boundaries** - Sleep hours, minimum gaps between check-ins, learning mode that backs off over time.

6. **QMD for understanding** - Semantic search over keyword matching. Bernard understands context, not just keywords.

---

## What's Next

1. **Deeper QMD integration** - Use semantic search for more than just check-in context
2. **Relationship analytics** - Track relationship health metrics over time
3. **Multi-user support** - Bernard instances per user with isolated relationship state
4. **Voice integration** - Proactive voice check-ins via supported channels
