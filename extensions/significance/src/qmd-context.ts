/**
 * QMD Semantic Search for Context Extraction
 * 
 * Replaces regex-based task extraction with semantic search via QMD.
 * This provides better context understanding for check-ins.
 */

import type { OpenClawConfig } from "../../../src/config/config.js";
import { spawn } from "node:child_process";
import path from "node:path";
import os from "node:os";
import { resolveStateDir } from "../../../src/config/paths.js";
import { resolveAgentWorkspaceDir } from "../../../src/agents/agent-scope.js";

// === TYPES ===

export type QmdContextResult = {
  recentTasks: string[];
  openThreads: string[];
  lastTopic: string | null;
  recentDecisions: string[];
};

// === QMD SEMANTIC SEARCH ===

async function queryQmd(params: {
  query: string;
  cfg: OpenClawConfig;
  agentId: string;
  maxResults?: number;
  timeoutMs?: number;
}): Promise<string[]> {
  const { query, cfg, agentId, maxResults = 5, timeoutMs = 10000 } = params;

  const stateDir = resolveStateDir(process.env, os.homedir);
  const qmdDir = path.join(stateDir, "agents", agentId, "qmd");
  const xdgConfigHome = path.join(qmdDir, "xdg-config");
  const xdgCacheHome = path.join(qmdDir, "xdg-cache");

  const env = {
    ...process.env,
    XDG_CONFIG_HOME: xdgConfigHome,
    XDG_CACHE_HOME: xdgCacheHome,
    NO_COLOR: "1",
  };

  const workspaceDir = resolveAgentWorkspaceDir(cfg, agentId);

  return new Promise((resolve) => {
    const child = spawn("qmd", ["query", query, "--json", "-n", String(maxResults)], {
      env,
      cwd: workspaceDir,
    });

    let stdout = "";

    child.stdout.on("data", (data) => {
      stdout += data.toString();
    });

    child.stderr.on("data", () => {
      // Ignore stderr
    });

    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      resolve([]);
    }, timeoutMs);

    child.on("close", (code) => {
      clearTimeout(timer);
      if (code !== 0) {
        resolve([]);
        return;
      }
      try {
        const results = JSON.parse(stdout);
        const snippets = results
          .map((r: { snippet?: string }) => r.snippet?.trim())
          .filter(Boolean)
          .slice(0, maxResults);
        resolve(snippets);
      } catch {
        resolve([]);
      }
    });

    child.on("error", () => {
      clearTimeout(timer);
      resolve([]);
    });
  });
}

// === CONTEXT EXTRACTION VIA QMD ===

export async function extractQmdContext(params: {
  cfg: OpenClawConfig;
  agentId: string;
}): Promise<QmdContextResult> {
  const { cfg, agentId } = params;

  // Run queries in parallel for speed
  const [taskSnippets, threadSnippets, topicSnippets, decisionSnippets] = await Promise.all([
    // Query for recent tasks/work
    queryQmd({
      query: "what was the user working on recently tasks projects building",
      cfg,
      agentId,
      maxResults: 3,
    }),
    // Query for open/unfinished items
    queryQmd({
      query: "unfinished incomplete todo later tomorrow revisit open question",
      cfg,
      agentId,
      maxResults: 3,
    }),
    // Query for last topic discussed
    queryQmd({
      query: "last discussion topic conversation talked about",
      cfg,
      agentId,
      maxResults: 1,
    }),
    // Query for recent decisions
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
  fallbackToRegex?: boolean;
}): Promise<QmdContextResult> {
  const { cfg, agentId } = params;

  try {
    // Try QMD first
    const qmdContext = await extractQmdContext({ cfg, agentId });
    
    // If QMD returned results, use them
    if (qmdContext.recentTasks.length > 0 || qmdContext.openThreads.length > 0) {
      return qmdContext;
    }
  } catch {
    // QMD failed, fall through to empty result
  }

  // Return empty result - the existing regex extraction in the main file
  // will serve as fallback if QMD returns nothing
  return {
    recentTasks: [],
    openThreads: [],
    lastTopic: null,
    recentDecisions: [],
  };
}
