# Research Skill

Deep, phased research orchestration that builds comprehensive knowledge bases over time instead of surface-level quick searches.

## How It Works

When asked to research a topic, Bernard doesn't just search and compile. Instead:

**Phase 1 (Tier 1): Initial Discovery**

- Research the core topic
- Identify primary subtopics and related concepts
- Store findings and spawn Tier 2 research

**Phase 2 (Tier 2): Subtopic Expansion**

- Research each subtopic discovered in Tier 1
- Generate tertiary topics
- Store findings and spawn Tier 3 research

**Phase 3 (Tier 3): Deep Dive**

- Research tertiary topics
- Build comprehensive context on each branch
- Store findings and trigger compilation

**Phase 4: Compilation & Pruning**

- Use semantic similarity to prune topics that don't relate back to the original query
- Compile remaining findings into a cohesive document
- Deliver to the channel where research was requested

## Time Delays

Research happens in phases with 5-minute delays between tiers. This allows:

- Context accumulation across multiple search iterations
- Semantic filtering to remove irrelevant branches
- Deep understanding instead of shallow scraping

## Storage

Research state is tracked in:

```
workspace/research/{topic-slug}/
  state.json       # Current phase, subtopics, metadata
  tier1.md         # Tier 1 findings
  tier2.md         # Tier 2 findings
  tier3.md         # Tier 3 findings
  compiled.md      # Final pruned output
```

## Usage

From any session:

```
research [topic]
```

Bernard will:

1. Acknowledge the request
2. Kick off Tier 1 research immediately
3. Schedule subsequent phases via cron
4. Message you when complete with the compiled document

## Implementation

Core logic in `orchestrator.js` - handles phase transitions, semantic pruning, and delivery.
