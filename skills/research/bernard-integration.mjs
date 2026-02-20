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

import { execSync } from "child_process";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const WORKSPACE =
  process.env.OPENCLAW_WORKSPACE || path.join(process.env.HOME, ".openclaw", "workspace");
const QMD_BIN = path.join(process.env.HOME, ".bun", "bin", "qmd");

/**
 * Perform web search using Bernard's web_search tool
 */
export async function webSearch(query, count = 10) {
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
export function semanticSimilarity(text1, text2) {
  try {
    // Create temp directory for comparison
    const tmpDir = "/tmp/research-similarity";
    if (!fs.existsSync(tmpDir)) {
      fs.mkdirSync(tmpDir, { recursive: true });
    }

    const collectionName = `research_similarity_${Date.now()}`;
    const collectionDir = path.join(tmpDir, collectionName);
    fs.mkdirSync(collectionDir, { recursive: true });

    const file2Path = path.join(collectionDir, "text2.md");
    fs.writeFileSync(file2Path, text2);

    // Add directory to collection
    execSync(`${QMD_BIN} collection add ${collectionDir} --name ${collectionName}`, {
      stdio: "pipe",
    });

    // Search for text1 using regular search (BM25)
    // Note: vsearch hangs in testing, using search instead
    const result = execSync(`${QMD_BIN} search "${text1}" -n 1 --json -c ${collectionName}`, {
      encoding: "utf8",
      stdio: "pipe",
    });

    // Clean up collection and files
    execSync(`${QMD_BIN} collection remove ${collectionName}`, { stdio: "pipe" });
    execSync(`rm -rf ${collectionDir}`, { stdio: "pipe" });

    // Parse result - handle "No results found" case
    if (result.trim().startsWith("No results")) {
      return 0.0;
    }

    const parsed = JSON.parse(result);

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
export function extractTopics(searchResults) {
  const topics = new Set();

  for (const result of searchResults.results || []) {
    const title = result.title || "";
    const snippet = result.snippet || "";
    const text = `${title} ${snippet}`;

    // Extract quoted phrases
    const quotes = text.match(/"([^"]+)"/g);
    if (quotes) {
      quotes.forEach((q) => topics.add(q.replace(/"/g, "").trim()));
    }

    // Extract capitalized phrases (potential proper nouns/topics)
    const words = text.split(/\s+/);
    let currentPhrase = [];

    for (const word of words) {
      if (/^[A-Z][a-z]+/.test(word)) {
        currentPhrase.push(word);
      } else {
        if (currentPhrase.length >= 2) {
          topics.add(currentPhrase.join(" "));
        }
        currentPhrase = [];
      }
    }

    if (currentPhrase.length >= 2) {
      topics.add(currentPhrase.join(" "));
    }

    // Also extract important keywords (nouns, technical terms)
    // Look for longer words that might be key concepts
    const keywords = text.match(/\b[a-z]{6,}\b/gi);
    if (keywords) {
      keywords.forEach((kw) => {
        if (!["banana", "animal", "forest", "monkey"].includes(kw.toLowerCase())) {
          topics.add(kw.toLowerCase());
        }
      });
    }
  }

  return Array.from(topics).slice(0, 10); // Limit to top 10
}

/**
 * Schedule a cron job for next research phase
 */
export function scheduleCronJob(phase, slug, delayMinutes, metadata) {
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
export function deliverResults(compiledPath, metadata) {
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

// CLI test interface
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
}
