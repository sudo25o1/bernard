# Research Skill - Bernard Integration Guide

## Problem

The research skill needs access to Bernard's tools (web_search, cron, message) which are only available in session context. Unlike CLI-based skills (gh, jq), this skill must run INSIDE Bernard's session.

## Solution: Direct Session Handling

When Bernard sees "research [topic]", Bernard should handle it directly using this flow:

### Step 1: Initialize Research

```python
import json
from pathlib import Path
from datetime import datetime, timedelta

# Extract topic from user message
topic = "monkeys"  # parse from "research monkeys"
slug = topic.lower().replace(' ', '-')

# Create research directory
WORKSPACE = Path(os.environ.get('OPENCLAW_WORKSPACE', Path.home() / '.openclaw' / 'workspace'))
research_dir = WORKSPACE / 'research' / slug
research_dir.mkdir(parents=True, exist_ok=True)

# Initialize state
state = {
    "topic": topic,
    "slug": slug,
    "phase": "tier1",
    "startedAt": datetime.now().isoformat(),
    "metadata": {
        "channel": "<current_channel_from_inbound_context>",
        "userId": "<current_user_from_inbound_context>"
    },
    "tier1Topics": [],
    "tier2Topics": [],
    "tier3Topics": []
}

(research_dir / 'state.json').write_text(json.dumps(state, indent=2))
```

### Step 2: Execute Tier 1

```python
# Call web_search tool
results = web_search(topic, count=10)

# Extract subtopics
# Simple approach: look for capitalized multi-word phrases in titles/snippets
subtopics = []
for result in results.get('results', []):
    text = f"{result.get('title', '')} {result.get('snippet', '')}"
    words = text.split()
    phrase = []
    for word in words:
        if word and word[0].isupper():
            phrase.append(word)
        elif len(phrase) >= 2:
            subtopics.append(' '.join(phrase))
            phrase = []
    if len(phrase) >= 2:
        subtopics.append(' '.join(phrase))

# Deduplicate and limit
subtopics = list(set(subtopics))[:10]

# Update state
state['tier1Topics'] = subtopics
state['phase'] = 'tier1-complete'
(research_dir / 'state.json').write_text(json.dumps(state, indent=2))

# Write tier1.md
tier1_md = f"""# Tier 1 Research: {topic}

Found {len(results.get('results', []))} search results.

## Extracted Subtopics

{chr(10).join(f'- {t}' for t in subtopics)}

## Search Results

{chr(10).join(f'### {r.get("title")}\\n{r.get("snippet")}\\n' for r in results.get('results', [])[:5])}
"""
(research_dir / 'tier1.md').write_text(tier1_md)
```

### Step 3: Schedule Phases

```python
# Schedule tier 2 (5 minutes)
cron({
    "action": "add",
    "job": {
        "name": f"research-tier2-{slug}",
        "schedule": {"kind": "at", "at": (datetime.now() + timedelta(minutes=5)).isoformat()},
        "payload": {"kind": "agentTurn", "message": f"research-tier2 {slug}"},
        "sessionTarget": "isolated"
    }
})

# Schedule tier 3 (10 minutes)
cron({
    "action": "add",
    "job": {
        "name": f"research-tier3-{slug}",
        "schedule": {"kind": "at", "at": (datetime.now() + timedelta(minutes=10)).isoformat()},
        "payload": {"kind": "agentTurn", "message": f"research-tier3 {slug}"},
        "sessionTarget": "isolated"
    }
})

# Schedule compilation (15 minutes)
cron({
    "action": "add",
    "job": {
        "name": f"research-compile-{slug}",
        "schedule": {"kind": "at", "at": (datetime.now() + timedelta(minutes=15)).isoformat()},
        "payload": {"kind": "agentTurn", "message": f"research-compile {slug}"},
        "sessionTarget": "isolated",
        "delivery": {"mode": "announce", "channel": state['metadata']['channel']}
    }
})
```

### Step 4: Respond

```python
return f"""Research started: {topic}

Tier 1 complete: found {len(subtopics)} subtopics.
Subsequent tiers scheduled:
  - Tier 2: +5 minutes
  - Tier 3: +10 minutes
  - Compilation & delivery: +15 minutes

Full results will be delivered to this channel."""
```

## When Cron Fires

When an isolated session receives `research-tier2 {slug}`:

### Tier 2 Execution

```python
# Load state
slug = "<parse from message>"
research_dir = WORKSPACE / 'research' / slug
state = json.loads((research_dir / 'state.json').read_text())

# Research each tier1 subtopic
tier2_data = []
for subtopic in state['tier1Topics']:
    results = web_search(subtopic, count=5)
    # Extract tertiary topics from these results (same logic as tier1)
    tertiary = [...]  # extract from results
    tier2_data.append({"subtopic": subtopic, "tertiaryTopics": tertiary})

# Update state
state['tier2Topics'] = tier2_data
state['phase'] = 'tier2-complete'
(research_dir / 'state.json').write_text(json.dumps(state, indent=2))

# Write tier2.md
(research_dir / 'tier2.md').write_text(...)
```

### Tier 3 Execution

Similar pattern: research each tertiary topic from tier2.

### Compilation

```python
# Load all tiers
tier1 = (research_dir / 'tier1.md').read_text()
tier2 = (research_dir / 'tier2.md').read_text()
tier3 = (research_dir / 'tier3.md').read_text()

# Prune using QMD similarity
# (use bernard-integration.mjs semanticSimilarity function via exec)
pruned_topics = [t for t in all_topics if similarity(original_topic, t) >= 0.5]

# Compile
compiled = f"""# Research: {state['topic']}

## Executive Summary
...

## Findings
{tier1}
{tier2}
{tier3}
"""

(research_dir / 'compiled.md').write_text(compiled)

# Deliver via message tool
message({
    "action": "send",
    "channel": state['metadata']['channel'],
    "message": compiled
})
```

## Current Status

- ✅ QMD similarity function works (BM25 keyword search)
- ✅ Topic extraction works
- ⏳ Needs Bernard to implement this flow in session context
- ⏳ Needs testing end-to-end

## Alternative: Python Module

If Bernard can import custom Python modules, create:

```python
# research_skill.py in skills/research/
def handle_research_command(topic, web_search_fn, cron_fn, message_fn, workspace):
    # All the logic here
    pass
```

Then Bernard calls:

```python
from skills.research.research_skill import handle_research_command
handle_research_command(topic, web_search, cron, message, WORKSPACE)
```
