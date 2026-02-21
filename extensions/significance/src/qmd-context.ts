/**
 * QMD Semantic Search for Context Extraction
 *
 * Uses the same query pattern as the native QmdMemoryManager — agentId-scoped
 * XDG dirs and `-c` collection filters — so the significance extension queries
 * the same index that the core memory system maintains.
 */

import type { OpenClawConfig } from "../../../src/config/config.js";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
import os from "node:os";
import { resolveStateDir } from "../../../src/config/paths.js";
import { resolveAgentWorkspaceDir } from "../../../src/agents/agent-scope.js";

const execFileAsync = promisify(execFile);

// === TYPES ===

export type QmdContextResult = {
  recentTasks: string[];
  openThreads: string[];
  lastTopic: string | null;
  recentDecisions: string[];
};

// Default collections registered by QmdMemoryManager and the significance init block.
// These mirror the names used in src/memory/backend-config.ts:resolveDefaultCollections()
const DEFAULT_COLLECTIONS = ["memory-root", "memory-alt", "memory-dir"];

// === QMD SEMANTIC SEARCH ===

async function queryQmd(params: {
  query: string;
  cfg: OpenClawConfig;
  agentId: string;
  collections?: string[];
  maxResults?: number;
  timeoutMs?: number;
}): Promise<string[]> {
  const {
    query,
    cfg,
    agentId,
    collections = DEFAULT_COLLECTIONS,
    maxResults = 5,
    timeoutMs = 10_000,
  } = params;

  const stateDir = resolveStateDir(process.env, os.homedir);
  const qmdDir = path.join(stateDir, "agents", agentId, "qmd");

  const env = {
    ...process.env,
    XDG_CONFIG_HOME: path.join(qmdDir, "xdg-config"),
    XDG_CACHE_HOME: path.join(qmdDir, "xdg-cache"),
    NO_COLOR: "1",
  };

  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);

  // Build collection filter args: -c memory-root -c memory-alt -c memory-dir
  const collectionArgs = collections.flatMap((name) => ["-c", name]);

  const args = ["query", query, "--json", "-n", String(maxResults), ...collectionArgs];

  try {
    const { stdout } = await execFileAsync("qmd", args, {
      env,
      cwd: workspaceDir,
      timeout: timeoutMs,
    });
    const results = JSON.parse(stdout);
    return results
      .map((r: { snippet?: string; score?: number }) => r.snippet?.trim())
      .filter(Boolean)
      .slice(0, maxResults);
  } catch {
    // QMD unavailable, index empty, or timeout — fail silently
    return [];
  }
}

// === CONTEXT EXTRACTION VIA QMD ===

export async function extractQmdContext(params: {
  cfg: OpenClawConfig;
  agentId: string;
}): Promise<QmdContextResult> {
  const { cfg, agentId } = params;

  // Run queries in parallel for speed
  const [taskSnippets, threadSnippets, topicSnippets, decisionSnippets] = await Promise.all([
    queryQmd({
      query: "what was the user working on recently tasks projects building",
      cfg,
      agentId,
      maxResults: 3,
    }),
    queryQmd({
      query: "unfinished incomplete todo later tomorrow revisit open question",
      cfg,
      agentId,
      maxResults: 3,
    }),
    queryQmd({
      query: "last discussion topic conversation talked about",
      cfg,
      agentId,
      maxResults: 1,
    }),
    queryQmd({
      query: "decided to use going with choice decision",
      cfg,
      agentId,
      maxResults: 2,
    }),
  ]);

  return {
    recentTasks: taskSnippets,
    openThreads: threadSnippets,
    lastTopic: topicSnippets[0] ?? null,
    recentDecisions: decisionSnippets,
  };
}

// === COMBINED CONTEXT (QMD + File-based) ===

export async function extractCombinedContext(params: {
  cfg: OpenClawConfig;
  agentId: string;
  workspaceDir: string;
}): Promise<QmdContextResult> {
  const { cfg, agentId } = params;

  try {
    const qmdContext = await extractQmdContext({ cfg, agentId });

    if (qmdContext.recentTasks.length > 0 || qmdContext.openThreads.length > 0) {
      return qmdContext;
    }
  } catch {
    // QMD failed, fall through to empty result
  }

  // Return empty result — the file-based extraction in the main file
  // will serve as fallback if QMD returns nothing
  return {
    recentTasks: [],
    openThreads: [],
    lastTopic: null,
    recentDecisions: [],
  };
}
