/**
 * Bernard Significance Extension
 *
 * The relational engine that maintains RELATIONAL.md through continuous
 * conversation analysis. Works with QMD for storage/search.
 *
 * Hooks:
 * - agent_end: Analyze conversation, extract significance, update RELATIONAL.md
 * - before_agent_start: Inject relationship context
 * - session_end: Deeper pattern analysis, gap detection
 *
 * Features:
 * - Time-aware check-ins: contextual, task-focused, respects sleep (midnight-8am off)
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import fs from "node:fs/promises";
import path from "node:path";
import {
  loadIdleState,
  saveIdleState,
  shouldSendCheckIn,
  isInLearningMode,
  getTimeOfDay as getIdleTimeOfDay,
  type IdleState,
} from "./src/idle-service.js";
import { extractCombinedContext, type QmdContextResult } from "./src/qmd-context.js";

// ============================================================================
// Types
// ============================================================================

type SignificantMoment = {
  quote: string;
  weight: "CRITICAL" | "HIGH" | "MEDIUM" | "LOW";
  category: "RELATIONSHIP" | "IDENTITY" | "DECISION" | "EMOTIONAL" | "DISCOVERY";
  why: string;
};

type Gap = {
  category: "user" | "relational" | "soul";
  description: string;
  suggestedQuestion: string;
};

type TimeOfDay = "morning" | "afternoon" | "evening" | "sleep";

type RecentContext = {
  lastTasks: string[];
  openThreads: string[];
  recentDecisions: string[];
  lastInteraction: Date | null;
};

// ============================================================================
// Configuration
// ============================================================================

const configSchema = {
  parse: (value: unknown) => {
    const cfg = (value ?? {}) as Record<string, unknown>;
    return {
      enabled: cfg.enabled !== false,
      autoInject: cfg.autoInject !== false,
      gapDetection: cfg.gapDetection !== false,
      checkIns: cfg.checkIns !== false,
      proactiveCheckIns: cfg.proactiveCheckIns !== false,
      useQmd: cfg.useQmd !== false, // Use QMD for semantic search
      // Sleep hours: support both number (hours) and string (HH:MM)
      sleepStart: cfg.sleepStart ?? "00:00",
      sleepEnd: cfg.sleepEnd ?? "08:00",
      // Idle thresholds
      checkIntervalMs: Number(cfg.checkIntervalMs) || 1800000, // 30 min default
      learningIdleThresholdMs: Number(cfg.learningIdleThresholdMs) || 7200000, // 2 hours
      matureIdleThresholdMs: Number(cfg.matureIdleThresholdMs) || 14400000, // 4 hours
    };
  },
};

// ============================================================================
// Time-Aware Check-In System
// ============================================================================

/**
 * Parse time to hour (supports HH:MM string or number)
 */
function parseTimeToHour(time: string | number): number {
  if (typeof time === "number") return time;
  const parts = time.split(":");
  return Number(parts[0]);
}

function getTimeOfDay(sleepStart: string | number, sleepEnd: string | number): TimeOfDay {
  const hour = new Date().getHours();
  const startHour = parseTimeToHour(sleepStart);
  const endHour = parseTimeToHour(sleepEnd);

  // Check sleep hours (handles wraparound like 23-7)
  if (startHour <= endHour) {
    // Simple case: sleep from 0-8
    if (hour >= startHour && hour < endHour) return "sleep";
  } else {
    // Wraparound case: sleep from 23-7
    if (hour >= startHour || hour < endHour) return "sleep";
  }

  if (hour >= 8 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}

function isInSleepHours(sleepStart: string | number, sleepEnd: string | number): boolean {
  return getTimeOfDay(sleepStart, sleepEnd) === "sleep";
}

async function getRecentContext(
  workspaceDir: string,
  cfg?: { useQmd?: boolean; config?: unknown; agentId?: string },
): Promise<RecentContext> {
  const context: RecentContext = {
    lastTasks: [],
    openThreads: [],
    recentDecisions: [],
    lastInteraction: null,
  };

  // Try QMD semantic search first if enabled
  if (cfg?.useQmd && cfg?.config) {
    try {
      const qmdContext = await extractCombinedContext({
        cfg: cfg.config as import("../../src/config/config.js").OpenClawConfig,
        agentId: cfg.agentId || "bernard",
        workspaceDir,
      });

      if (qmdContext.recentTasks.length > 0 || qmdContext.openThreads.length > 0) {
        context.lastTasks = qmdContext.recentTasks;
        context.openThreads = qmdContext.openThreads;
        context.recentDecisions = qmdContext.recentDecisions;
        // QMD found context, return early
        return context;
      }
    } catch {
      // QMD failed, fall through to file-based extraction
    }
  }

  // Fallback: Read from files
  try {
    // Read recent memory files
    const memDir = path.join(workspaceDir, "memory");
    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    for (const date of [today, yesterday]) {
      const memFile = path.join(memDir, `${date}.md`);
      const content = await fs.readFile(memFile, "utf-8").catch(() => null);
      if (content) {
        // Extract tasks/decisions from memory
        const decisions = content.match(/## \[.*?\] DECISION.*?\n\n> (.*?)\n/gs);
        if (decisions) {
          for (const d of decisions.slice(-3)) {
            const quote = d.match(/> (.*?)\n/)?.[1];
            if (quote) context.recentDecisions.push(quote.slice(0, 100));
          }
        }
      }
    }

    // Read .significance/tasks.json if it exists
    const tasksFile = path.join(workspaceDir, ".significance", "tasks.json");
    const tasksData = await fs.readFile(tasksFile, "utf-8").catch(() => null);
    if (tasksData) {
      const tasks = JSON.parse(tasksData);
      context.lastTasks = tasks.recent || [];
      context.openThreads = tasks.openThreads || [];
      if (tasks.lastInteraction) {
        context.lastInteraction = new Date(tasks.lastInteraction);
      }
    }
  } catch {
    // Fail silently - context is optional
  }

  return context;
}

function generateCheckInPrompt(
  timeOfDay: TimeOfDay,
  context: RecentContext,
  gaps: Gap[],
): string | null {
  // No check-ins during sleep hours
  if (timeOfDay === "sleep") return null;

  const parts: string[] = [];

  // Calculate time since last interaction
  let hoursSince = 0;
  if (context.lastInteraction) {
    hoursSince = (Date.now() - context.lastInteraction.getTime()) / (1000 * 60 * 60);
  }

  // Build context-aware check-in guidance
  if (context.lastTasks.length > 0) {
    parts.push(`Recent tasks: ${context.lastTasks.slice(0, 3).join(", ")}`);
  }

  if (context.openThreads.length > 0) {
    parts.push(`Open threads: ${context.openThreads.slice(0, 2).join(", ")}`);
  }

  if (context.recentDecisions.length > 0) {
    parts.push(`Recent decisions: ${context.recentDecisions[0]}`);
  }

  // Time-based tone guidance
  const toneGuidance = {
    morning: "energized, forward-looking - good time to revisit yesterday's threads or plan today",
    afternoon: "collaborative, problem-solving - check on progress, offer fresh perspective",
    evening: "reflective, consolidating - capture learnings, note threads for tomorrow",
  }[timeOfDay];

  // Priority for check-in content
  let checkInFocus: string;
  if (hoursSince > 24 && context.openThreads.length > 0) {
    checkInFocus = `It's been a while. Pick up an open thread: "${context.openThreads[0]}"`;
  } else if (context.lastTasks.length > 0) {
    checkInFocus = `Continue from last task: "${context.lastTasks[0]}"`;
  } else if (gaps.length > 0) {
    checkInFocus = `Fill a gap: "${gaps[0].suggestedQuestion}"`;
  } else {
    checkInFocus = "Open-ended - see what they're working on";
  }

  return `<check-in-context>
Time: ${timeOfDay}
Tone: ${toneGuidance}
${parts.length > 0 ? "\nContext:\n" + parts.map((p) => `- ${p}`).join("\n") : ""}

Focus: ${checkInFocus}

Generate a natural, contextual check-in based on the above. Don't use canned phrases.
If there's recent task context, reference it specifically. Be a partner, not a greeter.
</check-in-context>`;
}

async function recordTaskContext(
  workspaceDir: string,
  tasks: string[],
  threads: string[],
): Promise<void> {
  const sigDir = path.join(workspaceDir, ".significance");
  await fs.mkdir(sigDir, { recursive: true });

  const tasksFile = path.join(sigDir, "tasks.json");
  let existing: Record<string, unknown> = {};
  try {
    existing = JSON.parse(await fs.readFile(tasksFile, "utf-8"));
  } catch {
    // Start fresh
  }

  const updated = {
    ...existing,
    recent: tasks.slice(0, 5),
    openThreads: threads.slice(0, 5),
    lastInteraction: new Date().toISOString(),
  };

  await fs.writeFile(tasksFile, JSON.stringify(updated, null, 2));
}

// ============================================================================
// Significance Patterns
// ============================================================================

const EXPLICIT_MARKERS = [
  "really important",
  "significant",
  "critical",
  "this is important",
  "remember this",
  "don't forget",
  "this matters",
  "pay attention",
];

const RELATIONAL_PATTERNS = [
  /i (prefer|like|want|need|hate|love) (when|if|that)/i,
  /it (frustrates|annoys|bothers) me when/i,
  /i (trust|appreciate|value)/i,
  /how we (work|communicate)/i,
];

const IDENTITY_PATTERNS = [
  /i (am|work as) a?n? ?\w+/i,
  /my (name|job|work|role) is/i,
  /i('ve| have) been (working|building)/i,
];

const DECISION_PATTERNS = [
  /let's (go with|do|try|use)/i,
  /we('ll| will| should) (use|do)/i,
  /i('ve| have) decided/i,
];

const TASK_PATTERNS = [
  /(?:need to|should|will|going to|want to) ([\w\s]+?)(?:\.|,|$)/i,
  /(?:working on|building|fixing|adding|creating) ([\w\s]+?)(?:\.|,|$)/i,
  /(?:todo|task|next):?\s*([\w\s]+?)(?:\.|,|$)/i,
];

const THREAD_PATTERNS = [
  /(?:later|tomorrow|next time|come back to|revisit) ([\w\s]+?)(?:\.|,|$)/i,
  /(?:parking|tabling|deferring) ([\w\s]+?)(?:\.|,|$)/i,
  /(?:open question|unresolved|still need to figure out) ([\w\s]+?)(?:\.|,|$)/i,
];

// ============================================================================
// Plugin Definition
// ============================================================================

const significancePlugin = {
  id: "significance",
  name: "Significance - Relational Memory",
  description: "Maintains RELATIONAL.md through continuous conversation analysis",
  kind: "extension" as const,
  configSchema,

  register(api: OpenClawPluginApi) {
    const cfg = configSchema.parse(api.pluginConfig);

    if (!cfg.enabled) {
      api.logger.info("significance: disabled");
      return;
    }

    const workspaceDir = api.resolvePath("~/.openclaw/workspace");
    api.logger.info("significance: registered");

    // ========================================================================
    // BEFORE AGENT START - Inject relationship context + task-aware check-ins
    // ========================================================================

    if (cfg.autoInject) {
      api.on("before_agent_start", async (event, ctx) => {
        if (!event.prompt || event.prompt.length < 5) return;

        // Skip check-ins during sleep hours
        if (isInSleepHours(cfg.sleepStart, cfg.sleepEnd)) {
          api.logger.info?.("significance: sleep hours, skipping check-in context");
        }

        try {
          const relationalPath = path.join(workspaceDir, "RELATIONAL.md");
          const relational = await fs.readFile(relationalPath, "utf-8").catch(() => null);

          const contextParts: string[] = [];

          // Add relationship context if available
          if (relational) {
            const patterns = extractKeyPatterns(relational);
            if (patterns) {
              contextParts.push(`<relationship-context>\n${patterns}\n</relationship-context>`);
            }
          }

          // Add task-aware check-in context (only outside sleep hours)
          if (cfg.checkIns && !isInSleepHours(cfg.sleepStart, cfg.sleepEnd)) {
            const timeOfDay = getTimeOfDay(cfg.sleepStart, cfg.sleepEnd);
            const recentContext = await getRecentContext(workspaceDir, {
              useQmd: cfg.useQmd,
              config: api.config,
              agentId: "bernard",
            });
            const gaps = await detectGaps(workspaceDir);
            const checkInPrompt = generateCheckInPrompt(timeOfDay, recentContext, gaps);
            if (checkInPrompt) {
              contextParts.push(checkInPrompt);
            }
          }

          if (contextParts.length === 0) return;

          api.logger.info?.("significance: injecting context");

          return {
            prependContext: contextParts.join("\n\n"),
          };
        } catch (err) {
          api.logger.warn(`significance: context injection failed: ${String(err)}`);
        }
      });
    }

    // ========================================================================
    // AGENT END - Analyze conversation for significance + track tasks
    // ========================================================================

    api.on("agent_end", async (event, ctx) => {
      if (!event.success || !event.messages?.length) return;

      try {
        const text = extractConversationText(event.messages);
        if (!text || text.length < 50) return;

        const moments = detectSignificantMoments(text);
        const relationalUpdates = detectRelationalPatterns(text);
        const userUpdates = detectIdentityPatterns(text);

        // Extract tasks and open threads for check-in context
        const tasks = extractTasks(text);
        const threads = extractThreads(text);

        if (moments.length > 0) {
          await writeSignificantMoments(workspaceDir, moments);
          api.logger.info?.(`significance: recorded ${moments.length} moments`);
        }

        if (relationalUpdates.length > 0) {
          await updateRelational(workspaceDir, relationalUpdates);
          api.logger.info?.(`significance: updated RELATIONAL.md`);
        }

        if (userUpdates.length > 0) {
          await updateUser(workspaceDir, userUpdates);
          api.logger.info?.(`significance: updated USER.md`);
        }

        // Always record task context for check-ins
        if (tasks.length > 0 || threads.length > 0) {
          await recordTaskContext(workspaceDir, tasks, threads);
          api.logger.info?.(
            `significance: recorded ${tasks.length} tasks, ${threads.length} threads`,
          );
        }
      } catch (err) {
        api.logger.warn(`significance: analysis failed: ${String(err)}`);
      }
    });

    // ========================================================================
    // SESSION END - Gap detection
    // ========================================================================

    if (cfg.gapDetection) {
      api.on("session_end", async (event, ctx) => {
        try {
          const gaps = await detectGaps(workspaceDir);
          if (gaps.length > 0) {
            await recordGaps(workspaceDir, gaps);
            api.logger.info?.(`significance: detected ${gaps.length} gaps`);
          }
        } catch (err) {
          api.logger.warn(`significance: gap detection failed: ${String(err)}`);
        }
      });
    }

    // ========================================================================
    // CLI Commands
    // ========================================================================

    api.registerCli(
      ({ program }) => {
        const sig = program.command("significance").description("Significance commands");

        sig.command("status").action(async () => {
          const rel = await fs.stat(path.join(workspaceDir, "RELATIONAL.md")).catch(() => null);
          const user = await fs.stat(path.join(workspaceDir, "USER.md")).catch(() => null);
          const timeOfDay = getTimeOfDay(cfg.sleepStart, cfg.sleepEnd);
          const inSleep = isInSleepHours(cfg.sleepStart, cfg.sleepEnd);
          const context = await getRecentContext(workspaceDir, {
            useQmd: cfg.useQmd,
            config: api.config,
            agentId: "bernard",
          });

          // Get idle state for proactive check-in info
          const stateDir = api.resolvePath("~/.openclaw/state");
          const idleState = await loadIdleState(stateDir).catch(() => null);
          const inLearning = idleState ? isInLearningMode(idleState) : false;

          console.log("Significance Status");
          console.log("=".repeat(40));
          console.log(`RELATIONAL.md: ${rel ? "exists" : "missing"}`);
          console.log(`USER.md: ${user ? "exists" : "missing"}`);
          console.log(`Time of day: ${timeOfDay}`);
          console.log(`Check-ins: ${inSleep ? "OFF (sleep hours)" : "ON"}`);
          console.log(`Sleep hours: ${cfg.sleepStart} - ${cfg.sleepEnd}`);
          console.log(`Proactive: ${cfg.proactiveCheckIns ? "ON" : "OFF"}`);
          console.log(`QMD search: ${cfg.useQmd ? "ON" : "OFF"}`);
          console.log(`Mode: ${inLearning ? "Learning (2h threshold)" : "Mature (4h threshold)"}`);
          if (idleState) {
            const idleMins = Math.round((Date.now() - idleState.lastInteractionMs) / 60000);
            console.log(`Last interaction: ${idleMins} minutes ago`);
            console.log(`Check-ins sent: ${idleState.checkInCount}`);
          }
          if (context.lastTasks.length > 0) {
            console.log(`Recent tasks: ${context.lastTasks.join(", ")}`);
          }
          if (context.openThreads.length > 0) {
            console.log(`Open threads: ${context.openThreads.join(", ")}`);
          }
        });

        sig.command("gaps").action(async () => {
          const gaps = await detectGaps(workspaceDir);
          if (!gaps.length) {
            console.log("No gaps detected.");
            return;
          }
          console.log(`Found ${gaps.length} gaps:\n`);
          for (const g of gaps) {
            console.log(`[${g.category.toUpperCase()}] ${g.description}`);
            console.log(`  Question: "${g.suggestedQuestion}"\n`);
          }
        });

        sig
          .command("checkin")
          .description("Generate a contextual check-in")
          .action(async () => {
            const timeOfDay = getTimeOfDay(cfg.sleepStart, cfg.sleepEnd);

            if (timeOfDay === "sleep") {
              console.log("\n[SLEEP HOURS] Check-ins disabled");
              console.log(`Active hours: ${cfg.sleepEnd} - ${cfg.sleepStart}`);
              return;
            }

            const context = await getRecentContext(workspaceDir, {
              useQmd: cfg.useQmd,
              config: api.config,
              agentId: "bernard",
            });
            const gaps = await detectGaps(workspaceDir);
            const prompt = generateCheckInPrompt(timeOfDay, context, gaps);

            console.log(`\n[${timeOfDay.toUpperCase()}] Check-in Context`);
            console.log("-".repeat(40));
            console.log(`Source: ${cfg.useQmd ? "QMD semantic search" : "file-based"}`);
            if (prompt) {
              console.log(prompt);
            } else {
              console.log("No check-in context available.");
            }
          });

        sig
          .command("tasks")
          .description("Show tracked tasks and threads")
          .action(async () => {
            const context = await getRecentContext(workspaceDir, {
              useQmd: cfg.useQmd,
              config: api.config,
              agentId: "bernard",
            });

            console.log("\nTask Context");
            console.log("=".repeat(40));

            if (context.lastInteraction) {
              const hours = Math.round(
                (Date.now() - context.lastInteraction.getTime()) / (1000 * 60 * 60),
              );
              console.log(`Last interaction: ${hours} hours ago`);
            }

            if (context.lastTasks.length > 0) {
              console.log("\nRecent Tasks:");
              for (const t of context.lastTasks) {
                console.log(`  - ${t}`);
              }
            } else {
              console.log("\nNo recent tasks tracked.");
            }

            if (context.openThreads.length > 0) {
              console.log("\nOpen Threads:");
              for (const t of context.openThreads) {
                console.log(`  - ${t}`);
              }
            }

            if (context.recentDecisions.length > 0) {
              console.log("\nRecent Decisions:");
              for (const d of context.recentDecisions) {
                console.log(`  - ${d}`);
              }
            }
          });
      },
      { commands: ["significance"] },
    );

    // ========================================================================
    // BACKGROUND SERVICE - Proactive Check-ins
    // ========================================================================

    let checkInterval: NodeJS.Timeout | null = null;

    api.registerService({
      id: "significance",
      start: async (ctx) => {
        api.logger.info("significance: started");

        // ====================================================================
        // QMD INIT — Ensure agent-scoped index has collections on every start
        // ====================================================================
        if (cfg.useQmd) {
          try {
            const os = await import("node:os");
            const { resolveStateDir } = await import("../../src/config/paths.js");
            const { resolveAgentWorkspaceDir } = await import("../../src/agents/agent-scope.js");
            const { execFile } = await import("node:child_process");
            const util = await import("node:util");
            const execFileAsync = util.promisify(execFile);

            const stateDir_ = resolveStateDir(process.env, os.default.homedir);
            const qmdDir = path.join(stateDir_, "agents", "main", "qmd");
            const xdgConfigHome = path.join(qmdDir, "xdg-config");
            const xdgCacheHome = path.join(qmdDir, "xdg-cache");
            const wsDir = resolveAgentWorkspaceDir(api.config, "main");

            const qmdEnv = {
              ...process.env,
              XDG_CONFIG_HOME: xdgConfigHome,
              XDG_CACHE_HOME: xdgCacheHome,
              NO_COLOR: "1",
            };

            // Add collections (idempotent — errors silently if already exists)
            await execFileAsync(
              "qmd",
              ["collection", "add", wsDir, "--name", "memory-root", "--mask", "MEMORY.md"],
              { env: qmdEnv, cwd: wsDir },
            ).catch(() => {});
            await execFileAsync(
              "qmd",
              ["collection", "add", wsDir, "--name", "memory-alt", "--mask", "memory.md"],
              { env: qmdEnv, cwd: wsDir },
            ).catch(() => {});
            await execFileAsync(
              "qmd",
              ["collection", "add", wsDir, "--name", "memory-dir", "--mask", "**/*.md"],
              { env: qmdEnv, cwd: wsDir },
            ).catch(() => {});

            // Update index (fast — only processes changed files)
            await execFileAsync("qmd", ["update"], { env: qmdEnv, cwd: wsDir }).catch(
              (err: Error) => {
                api.logger.warn(`significance: qmd update failed: ${String(err)}`);
              },
            );

            // Embed in background (slow — don't block startup)
            execFile("qmd", ["embed"], { env: qmdEnv, cwd: wsDir }, (err) => {
              if (err) api.logger.warn(`significance: qmd embed failed: ${String(err)}`);
              else api.logger.info("significance: qmd embed complete");
            });

            api.logger.info("significance: QMD index initialized");
          } catch (err) {
            api.logger.warn(`significance: QMD init failed: ${String(err)}`);
          }
        }

        if (!cfg.proactiveCheckIns) {
          api.logger.info("significance: proactive check-ins disabled");
          return;
        }

        const stateDir = ctx.stateDir;

        // Start periodic idle check
        checkInterval = setInterval(async () => {
          try {
            const state = await loadIdleState(stateDir);

            // Determine threshold based on learning mode
            const inLearning = isInLearningMode(state);
            const threshold = inLearning ? cfg.learningIdleThresholdMs : cfg.matureIdleThresholdMs;

            const shouldSend = shouldSendCheckIn({
              state,
              idleThresholdMs: threshold,
              sleepStart: cfg.sleepStart,
              sleepEnd: cfg.sleepEnd,
            });

            if (!shouldSend) {
              return;
            }

            api.logger.info("significance: idle threshold reached, triggering check-in");

            // Get context for check-in
            const recentContext = await getRecentContext(workspaceDir, {
              useQmd: cfg.useQmd,
              config: api.config,
              agentId: "bernard",
            });
            const gaps = await detectGaps(workspaceDir);
            const timeOfDay = getIdleTimeOfDay(cfg.sleepStart, cfg.sleepEnd);

            // Generate check-in prompt
            const prompt = generateCheckInPrompt(
              timeOfDay === "night" ? "sleep" : timeOfDay,
              recentContext,
              gaps,
            );

            if (prompt) {
              // Trigger check-in via system event
              await triggerProactiveCheckIn(ctx, prompt);

              // Update state
              state.lastCheckInMs = Date.now();
              state.checkInCount += 1;
              await saveIdleState(stateDir, state);

              api.logger.info(`significance: check-in #${state.checkInCount} triggered`);
            }
          } catch (err) {
            api.logger.warn(`significance: idle check failed: ${String(err)}`);
          }
        }, cfg.checkIntervalMs);
      },
      stop: async () => {
        if (checkInterval) {
          clearInterval(checkInterval);
          checkInterval = null;
        }
        api.logger.info("significance: stopped");
      },
    });

    // Update last interaction time on agent_end
    api.on("agent_end", async (_event, _ctx) => {
      if (!cfg.proactiveCheckIns) return;
      try {
        const stateDir = api.resolvePath("~/.openclaw/state");
        const state = await loadIdleState(stateDir);
        state.lastInteractionMs = Date.now();
        await saveIdleState(stateDir, state);
      } catch {
        // Fail silently
      }
    });
  },
};

// ============================================================================
// Proactive Check-in Delivery
// ============================================================================

async function triggerProactiveCheckIn(
  ctx: {
    config: unknown;
    stateDir: string;
    logger: { info: (msg: string) => void; warn: (msg: string) => void };
  },
  message: string,
): Promise<void> {
  // Use OpenClaw's system event to trigger an agent turn
  // This will route through the configured channel (Telegram, Discord, etc.)
  try {
    const { enqueueSystemEvent } = await import("../../src/infra/system-events.js");

    await enqueueSystemEvent({
      kind: "agentTurn",
      message,
      channel: "last", // Send to last-used channel
      deliver: true,
    });

    ctx.logger.info("significance: check-in queued for delivery");
  } catch (err) {
    ctx.logger.warn(`significance: could not enqueue check-in: ${String(err)}`);

    // Fallback: try cron-based delivery
    try {
      // Log for manual testing
      ctx.logger.info(`significance: check-in message: ${message.slice(0, 100)}...`);
    } catch {
      // Final fallback
    }
  }
}

// ============================================================================
// Analysis Functions
// ============================================================================

function extractConversationText(messages: unknown[]): string {
  const texts: string[] = [];
  for (const msg of messages) {
    if (!msg || typeof msg !== "object") continue;
    const m = msg as Record<string, unknown>;
    if (m.role !== "user" && m.role !== "assistant") continue;
    const role = m.role === "user" ? "USER" : "BERNARD";
    if (typeof m.content === "string") {
      texts.push(`## ${role}\n${m.content}\n`);
    } else if (Array.isArray(m.content)) {
      for (const b of m.content) {
        if (b?.type === "text" && typeof b.text === "string") {
          texts.push(`## ${role}\n${b.text}\n`);
        }
      }
    }
  }
  return texts.join("\n");
}

function extractTasks(text: string): string[] {
  const tasks: string[] = [];
  for (const pattern of TASK_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern, "gi"));
    for (const match of matches) {
      if (match[1] && match[1].length > 3 && match[1].length < 100) {
        tasks.push(match[1].trim());
      }
    }
  }
  return [...new Set(tasks)].slice(0, 5);
}

function extractThreads(text: string): string[] {
  const threads: string[] = [];
  for (const pattern of THREAD_PATTERNS) {
    const matches = text.matchAll(new RegExp(pattern, "gi"));
    for (const match of matches) {
      if (match[1] && match[1].length > 3 && match[1].length < 100) {
        threads.push(match[1].trim());
      }
    }
  }
  return [...new Set(threads)].slice(0, 5);
}

function detectSignificantMoments(text: string): SignificantMoment[] {
  const moments: SignificantMoment[] = [];

  for (const marker of EXPLICIT_MARKERS) {
    if (text.toLowerCase().includes(marker)) {
      moments.push({
        quote: extractQuote(text, marker),
        weight: "CRITICAL",
        category: "DECISION",
        why: `Explicitly marked: "${marker}"`,
      });
    }
  }

  for (const pattern of DECISION_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      moments.push({
        quote: extractQuote(text, match[0]),
        weight: "HIGH",
        category: "DECISION",
        why: "Decision or direction established",
      });
    }
  }

  return moments;
}

function detectRelationalPatterns(text: string): string[] {
  const updates: string[] = [];
  for (const pattern of RELATIONAL_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      updates.push(extractQuote(text, match[0]));
    }
  }
  return updates;
}

function detectIdentityPatterns(text: string): Array<{ field: string; value: string }> {
  const updates: Array<{ field: string; value: string }> = [];
  for (const pattern of IDENTITY_PATTERNS) {
    const match = text.match(pattern);
    if (match) {
      updates.push({
        field: inferField(match[0]),
        value: extractQuote(text, match[0]),
      });
    }
  }
  return updates;
}

function extractQuote(text: string, marker: string, chars = 150): string {
  const idx = text.toLowerCase().indexOf(marker.toLowerCase());
  if (idx === -1) return text.slice(0, chars);
  const start = Math.max(0, idx - chars);
  const end = Math.min(text.length, idx + marker.length + chars);
  return text.slice(start, end).trim();
}

function inferField(match: string): string {
  const l = match.toLowerCase();
  if (l.includes("name")) return "Name";
  if (l.includes("work") || l.includes("job")) return "Work";
  return "Background";
}

function extractKeyPatterns(relational: string): string | null {
  const lines = relational.split("\n").filter((l) => l.startsWith("- ") || l.startsWith("### "));
  if (lines.length === 0) return null;
  return lines.slice(0, 10).join("\n");
}

// ============================================================================
// File Operations
// ============================================================================

async function writeSignificantMoments(dir: string, moments: SignificantMoment[]): Promise<void> {
  const memDir = path.join(dir, "memory");
  await fs.mkdir(memDir, { recursive: true });
  const date = new Date().toISOString().split("T")[0];
  const file = path.join(memDir, `${date}.md`);
  let content = await fs.readFile(file, "utf-8").catch(() => `# Memory - ${date}\n\n`);
  const time = new Date().toISOString().split("T")[1].split(".")[0];
  for (const m of moments) {
    content += `## [${time}] ${m.category} (${m.weight})\n\n> ${m.quote}\n\n*${m.why}*\n\n---\n\n`;
  }
  await fs.writeFile(file, content);
}

async function updateRelational(dir: string, updates: string[]): Promise<void> {
  const file = path.join(dir, "RELATIONAL.md");
  let content = await fs.readFile(file, "utf-8").catch(() => defaultRelational());
  const date = new Date().toISOString().split("T")[0];
  const block = updates.map((u) => `- ${u}`).join("\n");
  if (content.includes("## Growth Markers")) {
    content = content.replace(
      "## Growth Markers",
      `## Growth Markers\n\n### ${date}\n\n${block}\n`,
    );
  } else {
    content += `\n\n### ${date}\n\n${block}`;
  }
  await fs.writeFile(file, content);
}

async function updateUser(
  dir: string,
  updates: Array<{ field: string; value: string }>,
): Promise<void> {
  const file = path.join(dir, "USER.md");
  let content = await fs.readFile(file, "utf-8").catch(() => "# USER Context\n\n");
  const date = new Date().toISOString().split("T")[0];
  const block = updates.map((u) => `- **${u.field}**: ${u.value}`).join("\n");
  content += `\n\n### Learned ${date}\n\n${block}`;
  await fs.writeFile(file, content);
}

async function detectGaps(dir: string): Promise<Gap[]> {
  const gaps: Gap[] = [];
  const user = await fs.readFile(path.join(dir, "USER.md"), "utf-8").catch(() => "");
  const rel = await fs.readFile(path.join(dir, "RELATIONAL.md"), "utf-8").catch(() => "");

  if (!user.toLowerCase().includes("name")) {
    gaps.push({
      category: "user",
      description: "Don't know their name",
      suggestedQuestion: "What should I call you?",
    });
  }
  if (!user.toLowerCase().includes("work")) {
    gaps.push({
      category: "user",
      description: "Don't know what they do",
      suggestedQuestion: "What kind of work do you do?",
    });
  }
  if (!rel.toLowerCase().includes("communication")) {
    gaps.push({
      category: "relational",
      description: "Don't know communication preferences",
      suggestedQuestion: "Do you prefer I get straight to the point, or is more context helpful?",
    });
  }
  if (!rel.toLowerCase().includes("disagree")) {
    gaps.push({
      category: "relational",
      description: "Don't know how to handle disagreements",
      suggestedQuestion:
        "When I think you might be heading the wrong direction, how direct should I be?",
    });
  }

  return gaps;
}

async function recordGaps(dir: string, gaps: Gap[]): Promise<void> {
  const sigDir = path.join(dir, ".significance");
  await fs.mkdir(sigDir, { recursive: true });
  await fs.writeFile(
    path.join(sigDir, "gaps.json"),
    JSON.stringify({ lastUpdated: new Date().toISOString(), gaps }, null, 2),
  );
}

function defaultRelational(): string {
  return `# Relational Dynamics - Bernard & USER

Last updated: ${new Date().toISOString().split("T")[0]}

---

## Communication Patterns

(Populated as Bernard learns)

---

## Growth Markers

(Significant moments)

---

## Trust Calibration

(How trust has been built)

---
`;
}

export default significancePlugin;
