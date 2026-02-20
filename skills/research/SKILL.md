# Research Skill

Deep, phased research that builds comprehensive knowledge bases over time instead of surface-level quick searches.

## Current Status

**Built:** Core components functional (QMD similarity, topic extraction, orchestration logic)
**Remaining:** Session integration (wiring to web_search, cron, message tools)

## How It Works

When you say "research [topic]":

### Tier 1 (immediate)

- web_search for core topic
- Extract subtopics from results
- Store in `workspace/research/{slug}/tier1.md`
- Schedule Tier 2 (+5 min)

### Tier 2 (+5 minutes)

- Research each Tier 1 subtopic
- Extract tertiary topics
- Schedule Tier 3 (+5 min)

### Tier 3 (+10 minutes)

- Research tertiary topics
- Build deep context
- Schedule compilation (+5 min)

### Compilation (+15 minutes)

- Load all tiers
- Prune using QMD similarity (threshold 0.5)
- Compile final document
- Deliver via message tool

## Time Structure

Total: ~15 minutes

- Allows depth vs. speed tradeoff
- Multiple search iterations
- Semantic filtering removes noise

## Storage

```
workspace/research/{slug}/
  state.json       # Phase, topics, metadata
  tier1.md         # Initial findings
  tier2.md         # Subtopic expansion
  tier3.md         # Deep dive
  compiled.md      # Final (pruned)
```

## Test Results

**QMD Similarity (BM25 search):**

- `semanticSimilarity("primates", "primates consume fruit")` → 0.870 ✓
- Requires keyword overlap (limitation: won't detect pure semantic similarity)

**Topic Extraction:**

- Extracts capitalized phrases: "Amazon Rainforest Spider"
- Extracts keywords: monkeys, amazon, rainforest
- Returns top 10 topics

## Integration

See `INTEGRATION.md` for how Bernard should handle "research [topic]" in session context.

## Files

- `bernard-integration.mjs` - QMD similarity, topic extraction
- `research-handler.py` - Phase execution logic
- `STATUS.md` - Build progress
- `INTEGRATION.md` - Session integration guide
