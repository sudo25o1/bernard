#!/usr/bin/env node

/**
 * Bernard Integration Layer for Research Skill
 *
 * Bridges the orchestrator with Bernard's tools:
 * - web_search for searches
 * - QMD for semantic similarity
 * - cron for phase scheduling
 * - message for delivery
 */

const fs = require("fs");
const path = require("path");
const { execSync } = require("child_process");

const WORKSPACE =
  process.env.OPENCLAW_WORKSPACE || path.join(process.env.HOME, ".openclaw", "workspace");
const QMD_BIN = path.join(process.env.HOME, ".bun", "bin", "qmd");

/**
 * Perform web search using Bernard's web_search tool
 */
async function webSearch(query, count = 10) {
  console.log(`[WEB_SEARCH] ${query}`);

  // This will be called via Bernard's session
  // For now, document the interface
  return {
    query,
    results: [
      // { title, url, snippet }
    ],
  };
}

/**
 * Compute semantic similarity using QMD
 */
function semanticSimilarity(text1, text2) {
  try {
    // Create temp files for comparison
    const tmpDir = "/tmp/research-similarity";
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const file1 = path.join(tmpDir, "text1.txt");
    const file2 = path.join(tmpDir, "text2.txt");

    fs.writeFileSync(file1, text1);
    fs.writeFileSync(file2, text2);

    // Use QMD to compute similarity
    // qmd search works on a collection, so we'll use a different approach
    // We'll create a small collection and search it

    const collectionPath = path.join(tmpDir, "similarity-test");

    // Initialize collection
    execSync(`${QMD_BIN} init ${collectionPath}`, { stdio: "pipe" });

    // Add text2 to collection
    execSync(`${QMD_BIN} add ${collectionPath} ${file2}`, { stdio: "pipe" });

    // Search for text1
    const result = execSync(`${QMD_BIN} search ${collectionPath} "${text1}" --limit 1 --json`, {
      encoding: "utf8",
      stdio: "pipe",
    });

    const parsed = JSON.parse(result);

    // Clean up
    execSync(`rm -rf ${tmpDir}`, { stdio: "pipe" });

    if (parsed.length > 0 && parsed[0].score !== undefined) {
      return parsed[0].score;
    }

    return 0.0;
  } catch (error) {
    console.error("[SIMILARITY] Error:", error.message);
    return 0.0;
  }
}

/**
 * Extract topics from search results
 */
function extractTopics(searchResults) {
  const topics = new Set();

  for (const result of searchResults.results || []) {
    // Extract topics from title and snippet
    const text = `${result.title} ${result.snippet}`.toLowerCase();

    // Simple extraction: look for capitalized phrases, key terms
    // This is a basic implementation - could be enhanced with NLP

    // Extract quoted phrases
    const quotes = text.match(/"([^"]+)"/g);
    if (quotes) {
      quotes.forEach((q) => topics.add(q.replace(/"/g, "")));
    }

    // Extract capitalized phrases (potential proper nouns/topics)
    const words = text.split(/\s+/);
    let currentPhrase = [];

    for (const word of words) {
      if (/^[A-Z][a-z]+/.test(word)) {
        currentPhrase.push(word);
      } else {
        if (currentPhrase.length > 0) {
          topics.add(currentPhrase.join(" "));
          currentPhrase = [];
        }
      }
    }

    if (currentPhrase.length > 0) {
      topics.add(currentPhrase.join(" "));
    }
  }

  return Array.from(topics).slice(0, 10); // Limit to top 10
}

/**
 * Schedule a cron job for next research phase
 */
function scheduleCronJob(phase, slug, delayMinutes, metadata) {
  // This would use Bernard's cron tool
  console.log(`[CRON] Schedule ${phase} for ${slug} in ${delayMinutes} minutes`);
  console.log(`[CRON] Metadata:`, metadata);

  // Return the cron job spec that Bernard would create
  return {
    schedule: {
      kind: "at",
      at: new Date(Date.now() + delayMinutes * 60 * 1000).toISOString(),
    },
    payload: {
      kind: "systemEvent",
      text: `Research ${phase}: ${slug}`,
    },
    sessionTarget: "main",
  };
}

/**
 * Deliver research results via message tool
 */
function deliverResults(compiledPath, metadata) {
  const compiled = fs.readFileSync(compiledPath, "utf8");

  console.log(`[DELIVER] Sending results to channel: ${metadata.channel}`);
  console.log(`[DELIVER] Content length: ${compiled.length} chars`);

  // This would use Bernard's message tool
  return {
    action: "send",
    channel: metadata.channel,
    message: compiled,
  };
}

module.exports = {
  webSearch,
  semanticSimilarity,
  extractTopics,
  scheduleCronJob,
  deliverResults,
};

// CLI test interface
if (require.main === module) {
  const command = process.argv[2];

  if (command === "test-similarity") {
    const text1 = process.argv[3] || "monkeys eat bananas";
    const text2 = process.argv[4] || "primates consume fruit";

    const score = semanticSimilarity(text1, text2);
    console.log(`Similarity: ${score.toFixed(3)}`);
  } else if (command === "test-extract") {
    const mockResults = {
      results: [
        {
          title: "Monkeys in the Amazon Rainforest",
          snippet:
            "Spider monkeys and howler monkeys live in tropical forests. They eat fruits and leaves.",
        },
        {
          title: "Primate Diet and Behavior",
          snippet:
            "Most primates are omnivores. Their diet includes bananas, insects, and small animals.",
        },
      ],
    };

    const topics = extractTopics(mockResults);
    console.log("Extracted topics:", topics);
  } else {
    console.error("Usage: bernard-integration.js [test-similarity|test-extract]");
  }
}
