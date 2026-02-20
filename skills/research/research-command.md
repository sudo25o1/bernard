# Research Command - How Bernard Should Call This

## When User Says: "research [topic]"

Bernard should execute this flow:

### 1. Initialize Research State

```python
import json
import os
from pathlib import Path

WORKSPACE = Path(os.environ.get('OPENCLAW_WORKSPACE', Path.home() / '.openclaw' / 'workspace'))
RESEARCH_DIR = WORKSPACE / 'research'

def slugify(topic):
    return topic.lower().replace(' ', '-').replace(/[^a-z0-9-]/g, '')

topic = "monkeys"  # extracted from user message
slug = slugify(topic)

# Create research directory
research_path = RESEARCH_DIR / slug
research_path.mkdir(parents=True, exist_ok=True)

# Initialize state
state = {
    "topic": topic,
    "slug": slug,
    "phase": "tier1",
    "startedAt": datetime.now().isoformat(),
    "metadata": {
        "channel": current_channel_id,  # from inbound context
        "userId": current_user_id        # from inbound context
    },
    "tier1Topics": [],
    "tier2Topics": [],
    "tier3Topics": []
}

# Save state
with open(research_path / 'state.json', 'w') as f:
    json.dump(state, f, indent=2)
```

### 2. Execute Tier 1 (Immediate)

```python
# Call web_search tool
search_results = web_search(topic, count=10)

# Extract topics (using bernard-integration.mjs or Python equivalent)
from subprocess import run, PIPE
result = run(['node', '/Users/bernard/bernard/skills/research/bernard-integration.mjs', 'extract-json'],
             input=json.dumps(search_results),
             capture_output=True, text=True)
subtopics = json.loads(result.stdout)

# Update state
state['tier1Topics'] = subtopics
state['phase'] = 'tier1-complete'

# Save tier1.md
tier1_md = f"""# Tier 1 Research: {topic}

## Search Results

{len(search_results.get('results', []))} results found

## Extracted Subtopics

{chr(10).join(f'- {t}' for t in subtopics)}
"""

with open(research_path / 'tier1.md', 'w') as f:
    f.write(tier1_md)

# Save updated state
with open(research_path / 'state.json', 'w') as f:
    json.dump(state, f, indent=2)
```

### 3. Schedule Tier 2 (via cron tool)

```python
# Schedule tier 2 to run in 5 minutes
cron({
    "action": "add",
    "job": {
        "name": f"research-tier2-{slug}",
        "schedule": {
            "kind": "at",
            "at": (datetime.now() + timedelta(minutes=5)).isoformat()
        },
        "payload": {
            "kind": "agentTurn",
            "message": f"Execute research tier 2 for topic: {topic} (slug: {slug})"
        },
        "sessionTarget": "isolated"
    }
})

# Schedule tier 3 (10 minutes)
cron({
    "action": "add",
    "job": {
        "name": f"research-tier3-{slug}",
        "schedule": {
            "kind": "at",
            "at": (datetime.now() + timedelta(minutes=10)).isoformat()
        },
        "payload": {
            "kind": "agentTurn",
            "message": f"Execute research tier 3 for topic: {topic} (slug: {slug})"
        },
        "sessionTarget": "isolated"
    }
})

# Schedule compilation (15 minutes)
cron({
    "action": "add",
    "job": {
        "name": f"research-compile-{slug}",
        "schedule": {
            "kind": "at",
            "at": (datetime.now() + timedelta(minutes=15)).isoformat()
        },
        "payload": {
            "kind": "agentTurn",
            "message": f"Compile and deliver research for topic: {topic} (slug: {slug})"
        },
        "sessionTarget": "isolated",
        "delivery": {
            "mode": "announce",
            "channel": state['metadata']['channel']
        }
    }
})
```

### 4. Respond to User

```python
return f"""Research started: {topic}

Tier 1 complete: found {len(subtopics)} subtopics.
Tier 2 scheduled for +5 minutes.
Tier 3 scheduled for +10 minutes.
Compilation and delivery scheduled for +15 minutes.

Full results will be delivered to this channel when complete."""
```

### When Cron Fires (Tier 2/3/Compile)

The isolated session receives a message like:
`"Execute research tier 2 for topic: monkeys (slug: monkeys)"`

Bernard should:

1. Parse the slug from the message
2. Load state from `{WORKSPACE}/research/{slug}/state.json`
3. Call the research-handler.py with the appropriate phase
4. For compilation, also call message tool to deliver results

## Actual Implementation Needed

Since Bernard doesn't have a Python extension system yet, the pragmatic approach is:

1. Bernard recognizes "research [topic]" in a message
2. Calls `exec()` to run a shell script that does the initialization
3. That script uses Bernard's tools via... wait, tools are only available in session context

**Chicken-egg problem:** Tools (web_search, cron, message) are only available in Bernard's session, but we need to call them from the research logic.

**Solution:** All research logic must run INSIDE Bernard's session context, not as external scripts.

This means creating a Python module that Bernard imports and calls directly, with access to the tool functions.
