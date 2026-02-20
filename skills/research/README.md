# Research Skill - Implementation Guide

## Status: Core Built, Tool Integration In Progress

### Architecture

**Tier 1** (immediate): Initial topic research, extract subtopics
**Tier 2** (+5min): Expand subtopics, find tertiary topics  
**Tier 3** (+10min): Deep dive on tertiary topics
**Compilation** (+15min): Semantic pruning, final document delivery

### Files

- `SKILL.md` - User-facing documentation
- `ARCHITECTURE.md` - Technical design and integration roadmap
- `orchestrator.js` - Core phase management (Node.js CLI)
- `bernard-integration.js` - Tool integration layer (web_search, QMD, cron, message)
- `research-handler.py` - Bernard session handler (calls tools properly)
- `start-research.sh` - Kickoff script

### How Bernard Calls This

**From a session**, when user says "research [topic]":

```python
# 1. Initialize research
topic = "monkeys"
slug = slugify(topic)

# Create research state
os.makedirs(f"{WORKSPACE}/research/{slug}", exist_ok=True)
state = {
    "topic": topic,
    "slug": slug,
    "phase": "tier1",
    "metadata": {
        "channel": current_channel,
        "userId": current_user
    }
}

with open(f"{WORKSPACE}/research/{slug}/state.json", 'w') as f:
    json.dump(state, f)

# 2. Execute tier 1 (uses actual web_search tool)
search_results = web_search(topic, count=10)
subtopics = extract_topics(search_results)

# Save tier1 results
state["tier1Topics"] = subtopics
state["phase"] = "tier1-complete"

# 3. Schedule tier 2 via cron
cron({
    "action": "add",
    "job": {
        "schedule": {
            "kind": "at",
            "at": (now + 5min).isoformat()
        },
        "payload": {
            "kind": "agentTurn",
            "message": f"Execute research tier2 for {slug}"
        },
        "sessionTarget": "isolated"
    }
})

# Acknowledge to user
return f"Research started: {topic}. Tier 1 complete, found {len(subtopics)} subtopics. Full results in ~15 minutes."
```

**When tier2 cron fires** (isolated session):

```python
# Load state
slug = extract_slug_from_message()
state = load_state(slug)

# Execute tier 2
for subtopic in state["tier1Topics"]:
    results = web_search(subtopic, count=5)
    tertiary = extract_topics(results)
    # ... store

# Schedule tier 3
cron_add(tier3_job, delay=5min)
```

**When tier3 cron fires**:
Similar pattern, research tertiary topics

**When compile cron fires**:

```python
# Load all tiers
# Use QMD for semantic similarity
# Prune irrelevant branches
# Compile markdown
# message() back to original channel
```

### Current Integration Status

✅ Built:

- Phase orchestration logic
- State management
- File structure
- Semantic pruning framework

🔧 Needs:

- Actual web_search calls (replace pseudocode in research-handler.py)
- Actual cron scheduling (replace pseudocode)
- Actual message delivery (replace pseudocode)
- Bernard session wrapper that calls research-handler.py with proper tool access

### Next Step

Create `research.py` extension that Bernard loads, handles "research [topic]" command, and properly calls tools.
