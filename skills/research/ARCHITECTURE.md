# Research Skill Architecture

## Current Status: Core Built, Integration Pending

### What's Built ✅

**1. Core Orchestrator (`orchestrator.js`)**

- Phase management (tier1, tier2, tier3, compile)
- State persistence in `workspace/research/{slug}/state.json`
- Markdown output for each tier
- Semantic pruning framework (needs QMD integration)
- CLI interface for running phases

**2. Research Workflow**

- **Tier 1**: Initial topic research, subtopic extraction
- **Tier 2**: Subtopic expansion into tertiary topics
- **Tier 3**: Deep dive on tertiary topics
- **Compilation**: Semantic pruning + final document assembly

**3. File Structure**

```
workspace/research/{topic-slug}/
  state.json       # Research state and metadata
  tier1.md         # Tier 1 findings
  tier2.md         # Tier 2 findings
  tier3.md         # Tier 3 findings
  compiled.md      # Final output
```

**4. Starter Script (`start-research.sh`)**

- Initializes research
- Executes Tier 1 immediately
- Prepares scheduling metadata

### What Needs Integration 🔧

**1. Web Search Integration**
The `performSearch()` function in orchestrator.js currently returns mock data. Needs to:

- Call Bernard's `web_search` tool
- Parse results into structured format
- Extract topics from search results

**2. QMD Semantic Similarity**
The `semanticSimilarity()` function needs to:

- Use QMD to compute similarity between topics
- Return actual semantic scores instead of mock 0.75
- Handle edge cases (empty topics, etc.)

**3. Cron Job Scheduling**
The start script has TODOs for scheduling. Needs to:

- Use Bernard's `cron` tool to schedule tier2, tier3, compile
- Schedule at 5-minute intervals
- Pass along channel/user metadata for delivery

**4. Result Delivery**
When compilation completes, needs to:

- Read the compiled markdown file
- Send it back to the requesting channel using `message` tool
- Include research metadata (duration, topics explored, etc.)

**5. Topic Extraction**
The `extractSubtopics()` function needs real implementation:

- Parse search result titles and snippets
- Identify key concepts and related topics
- Deduplicate and rank by relevance

### Integration Points

**From Bernard's Session → Research Start:**

```javascript
// When user says "research [topic]"
exec(
  'bash /Users/bernard/bernard/skills/research/start-research.sh "monkeys" "discord:123" "user:456"',
);
```

**Cron Jobs → Phase Execution:**

```javascript
// Tier 2 cron job (5 min after tier 1)
{
  kind: "systemEvent",
  text: "exec /Users/bernard/bernard/skills/research/orchestrator.js tier2 monkeys"
}

// Tier 3 cron job (10 min after tier 1)
{
  kind: "systemEvent",
  text: "exec /Users/bernard/bernard/skills/research/orchestrator.js tier3 monkeys"
}

// Compile cron job (15 min after tier 1)
{
  kind: "agentTurn",
  message: "Research on monkeys is ready to compile. Run compilation and deliver to channel."
}
```

**Compilation → Delivery:**

```javascript
// After compile completes, Bernard should:
const state = loadState("monkeys");
const compiled = readFile("workspace/research/monkeys/compiled.md");

message({
  action: "send",
  channel: state.metadata.channel,
  message: `Research complete: ${state.topic}\n\n${compiled}`,
});
```

### Next Steps to Ship This

1. **Wire web_search** into `performSearch()`
2. **Wire QMD** into `semanticSimilarity()`
3. **Build topic extraction** logic from search results
4. **Create cron scheduler** that uses Bernard's cron tool
5. **Build delivery mechanism** for completed research
6. **Test end-to-end** with a real topic

### Design Decisions Made

- **5-minute phase delays**: Balances depth vs. speed
- **3 research tiers**: Deep enough without being wasteful
- **Semantic pruning threshold: 0.5**: Can be tuned based on testing
- **Markdown output**: Easy to read, version, and extend
- **Slug-based storage**: Clean filesystem organization

### Open Questions

- Should research be cancellable mid-flight?
- How to handle very broad topics (e.g., "physics")?
- Should there be a max depth limit to prevent runaway research?
- What if tier 1 finds 50+ subtopics?
