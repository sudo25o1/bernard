#!/usr/bin/env node

/**
 * Research Orchestrator
 *
 * Manages multi-phase deep research:
 * - Tier 1: Initial topic discovery
 * - Tier 2: Subtopic expansion
 * - Tier 3: Deep dive on tertiary topics
 * - Compilation: Semantic pruning and delivery
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const WORKSPACE =
  process.env.OPENCLAW_WORKSPACE || path.join(process.env.HOME, ".openclaw", "workspace");
const RESEARCH_DIR = path.join(WORKSPACE, "research");

// Ensure research directory exists
if (!fs.existsSync(RESEARCH_DIR)) {
  fs.mkdirSync(RESEARCH_DIR, { recursive: true });
}

/**
 * Create a slug from a topic string
 */
function slugify(topic) {
  return topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

/**
 * Load research state for a topic
 */
function loadState(topicSlug) {
  const stateFile = path.join(RESEARCH_DIR, topicSlug, "state.json");
  if (!fs.existsSync(stateFile)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(stateFile, "utf8"));
}

/**
 * Save research state
 */
function saveState(topicSlug, state) {
  const topicDir = path.join(RESEARCH_DIR, topicSlug);
  if (!fs.existsSync(topicDir)) {
    fs.mkdirSync(topicDir, { recursive: true });
  }
  const stateFile = path.join(topicDir, "state.json");
  fs.writeFileSync(stateFile, JSON.stringify(state, null, 2));
}

/**
 * Initialize a new research project
 */
function initResearch(topic, metadata = {}) {
  const slug = slugify(topic);
  const state = {
    topic,
    slug,
    phase: "tier1",
    startedAt: new Date().toISOString(),
    metadata,
    tier1Topics: [],
    tier2Topics: [],
    tier3Topics: [],
  };
  saveState(slug, state);
  return state;
}

/**
 * Perform web search and extract topics
 */
function performSearch(query, count = 10) {
  // This would call Bernard's web_search tool
  // For now, returning mock structure
  console.log(`[SEARCH] ${query}`);
  return {
    query,
    results: [
      // Web search results would go here
    ],
    extractedTopics: [
      // Topics extracted from search results
    ],
  };
}

/**
 * Use QMD to compute semantic similarity
 */
function semanticSimilarity(topic1, topic2) {
  // This would use QMD's semantic search
  // For now, returning mock score
  return 0.75;
}

/**
 * Tier 1: Initial research
 */
function executeTier1(state) {
  console.log(`[TIER 1] Researching: ${state.topic}`);

  const searchResults = performSearch(state.topic);

  // Extract primary subtopics from results
  const subtopics = extractSubtopics(searchResults);

  state.tier1Topics = subtopics;
  state.phase = "tier1-complete";
  state.tier1CompletedAt = new Date().toISOString();

  // Write tier1 findings
  const tier1File = path.join(RESEARCH_DIR, state.slug, "tier1.md");
  const tier1Content = formatTier1Output(state.topic, searchResults, subtopics);
  fs.writeFileSync(tier1File, tier1Content);

  saveState(state.slug, state);

  console.log(`[TIER 1] Complete. Found ${subtopics.length} subtopics.`);
  return state;
}

/**
 * Tier 2: Subtopic expansion
 */
function executeTier2(state) {
  console.log(`[TIER 2] Expanding ${state.tier1Topics.length} subtopics`);

  const tier2Topics = [];

  for (const subtopic of state.tier1Topics) {
    const searchResults = performSearch(subtopic);
    const tertiaryTopics = extractSubtopics(searchResults);

    tier2Topics.push({
      subtopic,
      tertiaryTopics,
      searchResults,
    });
  }

  state.tier2Topics = tier2Topics;
  state.phase = "tier2-complete";
  state.tier2CompletedAt = new Date().toISOString();

  // Write tier2 findings
  const tier2File = path.join(RESEARCH_DIR, state.slug, "tier2.md");
  const tier2Content = formatTier2Output(tier2Topics);
  fs.writeFileSync(tier2File, tier2Content);

  saveState(state.slug, state);

  console.log(`[TIER 2] Complete. Expanded to ${tier2Topics.length} branches.`);
  return state;
}

/**
 * Tier 3: Deep dive
 */
function executeTier3(state) {
  console.log(`[TIER 3] Deep dive on tertiary topics`);

  const tier3Topics = [];

  for (const branch of state.tier2Topics) {
    for (const tertiaryTopic of branch.tertiaryTopics) {
      const searchResults = performSearch(tertiaryTopic);

      tier3Topics.push({
        parentSubtopic: branch.subtopic,
        topic: tertiaryTopic,
        searchResults,
      });
    }
  }

  state.tier3Topics = tier3Topics;
  state.phase = "tier3-complete";
  state.tier3CompletedAt = new Date().toISOString();

  // Write tier3 findings
  const tier3File = path.join(RESEARCH_DIR, state.slug, "tier3.md");
  const tier3Content = formatTier3Output(tier3Topics);
  fs.writeFileSync(tier3File, tier3Content);

  saveState(state.slug, state);

  console.log(`[TIER 3] Complete. Researched ${tier3Topics.length} tertiary topics.`);
  return state;
}

/**
 * Compilation: Prune and compile
 */
function executeCompilation(state) {
  console.log(`[COMPILE] Pruning and compiling research`);

  // Load all tier findings
  const tier1Content = fs.readFileSync(path.join(RESEARCH_DIR, state.slug, "tier1.md"), "utf8");
  const tier2Content = fs.readFileSync(path.join(RESEARCH_DIR, state.slug, "tier2.md"), "utf8");
  const tier3Content = fs.readFileSync(path.join(RESEARCH_DIR, state.slug, "tier3.md"), "utf8");

  // Prune topics that don't relate back to original topic using semantic similarity
  const prunedTopics = pruneIrrelevantTopics(state);

  // Compile final document
  const compiled = compileFinalDocument(state, prunedTopics, {
    tier1: tier1Content,
    tier2: tier2Content,
    tier3: tier3Content,
  });

  // Write compiled output
  const compiledFile = path.join(RESEARCH_DIR, state.slug, "compiled.md");
  fs.writeFileSync(compiledFile, compiled);

  state.phase = "complete";
  state.completedAt = new Date().toISOString();
  saveState(state.slug, state);

  console.log(`[COMPILE] Complete. Final document: ${compiledFile}`);
  return { state, compiled, compiledFile };
}

/**
 * Prune topics that don't relate to original topic
 */
function pruneIrrelevantTopics(state) {
  const SIMILARITY_THRESHOLD = 0.5;

  const pruned = {
    tier1: state.tier1Topics,
    tier2: [],
    tier3: [],
  };

  // Prune tier 2
  for (const branch of state.tier2Topics) {
    const similarity = semanticSimilarity(state.topic, branch.subtopic);
    if (similarity >= SIMILARITY_THRESHOLD) {
      pruned.tier2.push(branch);
    } else {
      console.log(
        `[PRUNE] Removed tier2: ${branch.subtopic} (similarity: ${similarity.toFixed(2)})`,
      );
    }
  }

  // Prune tier 3
  for (const item of state.tier3Topics) {
    const similarity = semanticSimilarity(state.topic, item.topic);
    if (similarity >= SIMILARITY_THRESHOLD) {
      pruned.tier3.push(item);
    } else {
      console.log(`[PRUNE] Removed tier3: ${item.topic} (similarity: ${similarity.toFixed(2)})`);
    }
  }

  return pruned;
}

/**
 * Extract subtopics from search results
 */
function extractSubtopics(searchResults) {
  // This would extract topics from the search results
  // For now, mock implementation
  return ["subtopic-1", "subtopic-2", "subtopic-3"];
}

/**
 * Format tier 1 output
 */
function formatTier1Output(topic, searchResults, subtopics) {
  let output = `# Tier 1 Research: ${topic}\n\n`;
  output += `**Generated:** ${new Date().toISOString()}\n\n`;
  output += `## Primary Findings\n\n`;
  output += `(Search results would be formatted here)\n\n`;
  output += `## Identified Subtopics\n\n`;

  for (const subtopic of subtopics) {
    output += `- ${subtopic}\n`;
  }

  return output;
}

/**
 * Format tier 2 output
 */
function formatTier2Output(tier2Topics) {
  let output = `# Tier 2 Research: Subtopic Expansion\n\n`;
  output += `**Generated:** ${new Date().toISOString()}\n\n`;

  for (const branch of tier2Topics) {
    output += `## ${branch.subtopic}\n\n`;
    output += `### Tertiary Topics\n\n`;

    for (const topic of branch.tertiaryTopics) {
      output += `- ${topic}\n`;
    }

    output += `\n`;
  }

  return output;
}

/**
 * Format tier 3 output
 */
function formatTier3Output(tier3Topics) {
  let output = `# Tier 3 Research: Deep Dive\n\n`;
  output += `**Generated:** ${new Date().toISOString()}\n\n`;

  for (const item of tier3Topics) {
    output += `## ${item.topic}\n\n`;
    output += `**Parent:** ${item.parentSubtopic}\n\n`;
    output += `(Deep research findings would go here)\n\n`;
  }

  return output;
}

/**
 * Compile final document
 */
function compileFinalDocument(state, prunedTopics, tierContent) {
  let output = `# Research: ${state.topic}\n\n`;
  output += `**Completed:** ${new Date().toISOString()}\n\n`;
  output += `**Research Duration:** ${calculateDuration(state.startedAt, state.completedAt)}\n\n`;
  output += `---\n\n`;

  output += `## Executive Summary\n\n`;
  output += `This research explored ${state.topic} across three tiers of investigation. `;
  output += `After semantic pruning, ${prunedTopics.tier2.length} of ${state.tier2Topics.length} tier-2 topics `;
  output += `and ${prunedTopics.tier3.length} of ${state.tier3Topics.length} tier-3 topics were retained.\n\n`;

  output += `## Primary Findings\n\n`;
  output += `${tierContent.tier1}\n\n`;

  output += `## Subtopic Analysis\n\n`;
  output += `${tierContent.tier2}\n\n`;

  output += `## Deep Dive Results\n\n`;
  output += `${tierContent.tier3}\n\n`;

  return output;
}

/**
 * Calculate duration between two ISO timestamps
 */
function calculateDuration(start, end) {
  const ms = new Date(end) - new Date(start);
  const minutes = Math.floor(ms / 60000);
  return `${minutes} minutes`;
}

// CLI interface
const command = process.argv[2];
const topicSlug = process.argv[3];

if (command === "init") {
  const topic = process.argv.slice(3).join(" ");
  const state = initResearch(topic);
  console.log(`Initialized research: ${topic} (${state.slug})`);
  console.log(JSON.stringify(state, null, 2));
} else if (command === "tier1") {
  const state = loadState(topicSlug);
  if (!state) {
    console.error(`No research found for: ${topicSlug}`);
    process.exit(1);
  }
  executeTier1(state);
} else if (command === "tier2") {
  const state = loadState(topicSlug);
  if (!state) {
    console.error(`No research found for: ${topicSlug}`);
    process.exit(1);
  }
  executeTier2(state);
} else if (command === "tier3") {
  const state = loadState(topicSlug);
  if (!state) {
    console.error(`No research found for: ${topicSlug}`);
    process.exit(1);
  }
  executeTier3(state);
} else if (command === "compile") {
  const state = loadState(topicSlug);
  if (!state) {
    console.error(`No research found for: ${topicSlug}`);
    process.exit(1);
  }
  const result = executeCompilation(state);
  console.log(`Compiled: ${result.compiledFile}`);
} else {
  console.error("Usage: orchestrator.js [init|tier1|tier2|tier3|compile] [topic-slug]");
  process.exit(1);
}
