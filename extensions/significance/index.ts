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
 * - Time-aware check-ins: morning = work, evening = introspective
 */

import type { OpenClawPluginApi } from "openclaw/plugin-sdk";
import fs from "node:fs/promises";
import path from "node:path";

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

type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

type CheckInStyle = {
  tone: string;
  questions: string[];
  followUps: string[];
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
    };
  },
};

// ============================================================================
// Time-Aware Check-In System
// ============================================================================

function getTimeOfDay(): TimeOfDay {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  if (hour >= 18 && hour < 22) return "evening";
  return "night";
}

const CHECK_IN_STYLES: Record<TimeOfDay, CheckInStyle> = {
  morning: {
    tone: "energized, focused",
    questions: [
      "What are you tackling today?",
      "Anything you want to think through before diving in?",
      "What's the most important thing to get right today?",
      "Any overnight insights about yesterday's problems?",
    ],
    followUps: [
      "Want to walk through your approach?",
      "Should we break that down together?",
      "What would make this easier?",
    ],
  },
  afternoon: {
    tone: "productive, collaborative",
    questions: [
      "How's it going?",
      "Hit any walls?",
      "Need a fresh perspective on anything?",
      "What's working? What isn't?",
    ],
    followUps: [
      "Want to rubber-duck this?",
      "Should we step back and look at the bigger picture?",
      "What would you tell someone else in this situation?",
    ],
  },
  evening: {
    tone: "reflective, winding down",
    questions: [
      "What did you learn today?",
      "Anything still weighing on you?",
      "What would you do differently?",
      "Any threads you want to pick up tomorrow?",
    ],
    followUps: [
      "Want to capture that while it's fresh?",
      "Should we note that for tomorrow-you?",
      "Is there something deeper going on there?",
    ],
  },
  night: {
    tone: "calm, supportive",
    questions: [
      "Still up? Everything okay?",
      "Burning the midnight oil, or can't sleep?",
      "Want company, or do you need to work through something?",
    ],
    followUps: [
      "Sometimes the night shifts make sense differently.",
      "Want to talk it through, or just need someone here?",
      "Should we save this for when you're fresh?",
    ],
  },
};

function selectCheckInQuestion(timeOfDay: TimeOfDay, gaps: Gap[]): string {
  // Prioritize gaps if we have them
  if (gaps.length > 0 && Math.random() > 0.5) {
    return gaps[Math.floor(Math.random() * gaps.length)].suggestedQuestion;
  }
  
  const style = CHECK_IN_STYLES[timeOfDay];
  return style.questions[Math.floor(Math.random() * style.questions.length)];
}

function getCheckInContext(timeOfDay: TimeOfDay): string {
  const style = CHECK_IN_STYLES[timeOfDay];
  return `<check-in-context>
Time of day: ${timeOfDay}
Tone: ${style.tone}
If asking questions, prefer: ${style.questions.slice(0, 2).join(" or ")}
Follow-up style: ${style.followUps[0]}
</check-in-context>`;
}

// ============================================================================
// Significance Patterns
// ============================================================================

const EXPLICIT_MARKERS = [
  "really important", "significant", "critical", "this is important",
  "remember this", "don't forget", "this matters", "pay attention",
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
    // BEFORE AGENT START - Inject relationship context + time-aware prompts
    // ========================================================================

    if (cfg.autoInject) {
      api.on("before_agent_start", async (event, ctx) => {
        if (!event.prompt || event.prompt.length < 5) return;

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

          // Add time-aware check-in context
          if (cfg.checkIns) {
            const timeOfDay = getTimeOfDay();
            contextParts.push(getCheckInContext(timeOfDay));
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
    // AGENT END - Analyze conversation for significance
    // ========================================================================

    api.on("agent_end", async (event, ctx) => {
      if (!event.success || !event.messages?.length) return;

      try {
        const text = extractConversationText(event.messages);
        if (!text || text.length < 50) return;

        const moments = detectSignificantMoments(text);
        const relationalUpdates = detectRelationalPatterns(text);
        const userUpdates = detectIdentityPatterns(text);

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

    api.registerCli(({ program }) => {
      const sig = program.command("significance").description("Significance commands");

      sig.command("status").action(async () => {
        const rel = await fs.stat(path.join(workspaceDir, "RELATIONAL.md")).catch(() => null);
        const user = await fs.stat(path.join(workspaceDir, "USER.md")).catch(() => null);
        const timeOfDay = getTimeOfDay();
        console.log("Significance Status");
        console.log("=".repeat(40));
        console.log(`RELATIONAL.md: ${rel ? "exists" : "missing"}`);
        console.log(`USER.md: ${user ? "exists" : "missing"}`);
        console.log(`Time of day: ${timeOfDay}`);
        console.log(`Check-in tone: ${CHECK_IN_STYLES[timeOfDay].tone}`);
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

      sig.command("checkin").description("Generate a time-appropriate check-in").action(async () => {
        const timeOfDay = getTimeOfDay();
        const gaps = await detectGaps(workspaceDir);
        const question = selectCheckInQuestion(timeOfDay, gaps);
        const style = CHECK_IN_STYLES[timeOfDay];
        
        console.log(`\n[${timeOfDay.toUpperCase()}] Check-in`);
        console.log("-".repeat(40));
        console.log(`Tone: ${style.tone}`);
        console.log(`\n${question}\n`);
      });
    }, { commands: ["significance"] });

    api.registerService({
      id: "significance",
      start: () => api.logger.info("significance: started"),
      stop: () => api.logger.info("significance: stopped"),
    });
  },
};

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
  const lines = relational.split("\n").filter(l => l.startsWith("- ") || l.startsWith("### "));
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
  const block = updates.map(u => `- ${u}`).join("\n");
  if (content.includes("## Growth Markers")) {
    content = content.replace("## Growth Markers", `## Growth Markers\n\n### ${date}\n\n${block}\n`);
  } else {
    content += `\n\n### ${date}\n\n${block}`;
  }
  await fs.writeFile(file, content);
}

async function updateUser(dir: string, updates: Array<{ field: string; value: string }>): Promise<void> {
  const file = path.join(dir, "USER.md");
  let content = await fs.readFile(file, "utf-8").catch(() => "# USER Context\n\n");
  const date = new Date().toISOString().split("T")[0];
  const block = updates.map(u => `- **${u.field}**: ${u.value}`).join("\n");
  content += `\n\n### Learned ${date}\n\n${block}`;
  await fs.writeFile(file, content);
}

async function detectGaps(dir: string): Promise<Gap[]> {
  const gaps: Gap[] = [];
  const user = await fs.readFile(path.join(dir, "USER.md"), "utf-8").catch(() => "");
  const rel = await fs.readFile(path.join(dir, "RELATIONAL.md"), "utf-8").catch(() => "");

  if (!user.toLowerCase().includes("name")) {
    gaps.push({ category: "user", description: "Don't know their name", suggestedQuestion: "What should I call you?" });
  }
  if (!user.toLowerCase().includes("work")) {
    gaps.push({ category: "user", description: "Don't know what they do", suggestedQuestion: "What kind of work do you do?" });
  }
  if (!rel.toLowerCase().includes("communication")) {
    gaps.push({ category: "relational", description: "Don't know communication preferences", suggestedQuestion: "Do you prefer I get straight to the point, or is more context helpful?" });
  }
  if (!rel.toLowerCase().includes("disagree")) {
    gaps.push({ category: "relational", description: "Don't know how to handle disagreements", suggestedQuestion: "When I think you might be heading the wrong direction, how direct should I be?" });
  }

  return gaps;
}

async function recordGaps(dir: string, gaps: Gap[]): Promise<void> {
  const sigDir = path.join(dir, ".significance");
  await fs.mkdir(sigDir, { recursive: true });
  await fs.writeFile(
    path.join(sigDir, "gaps.json"),
    JSON.stringify({ lastUpdated: new Date().toISOString(), gaps }, null, 2)
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
