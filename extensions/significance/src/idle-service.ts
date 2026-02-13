/**
 * Idle Detection Service for Proactive Check-ins
 * 
 * Background service that monitors idle time and triggers check-ins
 * when the user hasn't interacted for a configured period.
 */

import fs from "node:fs/promises";
import path from "node:path";

// === TYPES ===

export type IdleState = {
  lastInteractionMs: number;
  lastCheckInMs: number;
  relationshipStartMs: number;
  checkInCount: number;
};

// === STATE MANAGEMENT ===

const DEFAULT_STATE: IdleState = {
  lastInteractionMs: Date.now(),
  lastCheckInMs: 0,
  relationshipStartMs: Date.now(),
  checkInCount: 0,
};

export async function loadIdleState(stateDir: string): Promise<IdleState> {
  const statePath = path.join(stateDir, "significance-idle.json");
  try {
    const content = await fs.readFile(statePath, "utf-8");
    const parsed = JSON.parse(content);
    return {
      lastInteractionMs: parsed.lastInteractionMs ?? Date.now(),
      lastCheckInMs: parsed.lastCheckInMs ?? 0,
      relationshipStartMs: parsed.relationshipStartMs ?? Date.now(),
      checkInCount: parsed.checkInCount ?? 0,
    };
  } catch {
    return { ...DEFAULT_STATE };
  }
}

export async function saveIdleState(stateDir: string, state: IdleState): Promise<void> {
  const statePath = path.join(stateDir, "significance-idle.json");
  await fs.mkdir(stateDir, { recursive: true });
  await fs.writeFile(statePath, JSON.stringify(state, null, 2), "utf-8");
}

// === IDLE DETECTION ===

export function getIdleMs(state: IdleState): number {
  return Date.now() - state.lastInteractionMs;
}

export function isInLearningMode(state: IdleState): boolean {
  const twoWeeksMs = 14 * 24 * 60 * 60 * 1000;
  return Date.now() - state.relationshipStartMs < twoWeeksMs;
}

/**
 * Parse sleep time in HH:MM or H format to minutes since midnight
 */
function parseTimeToMinutes(time: string | number): number {
  if (typeof time === "number") {
    return time * 60; // Assume it's hours
  }
  
  const parts = time.split(":");
  if (parts.length === 2) {
    const [hours, mins] = parts.map(Number);
    return hours * 60 + mins;
  }
  
  // Just hours
  return Number(time) * 60;
}

/**
 * Check if current time is within sleep hours
 * Handles overnight ranges (e.g., 22:00 to 08:00)
 */
export function isInSleepHours(sleepStart: string | number, sleepEnd: string | number): boolean {
  const now = new Date();
  const currentMinutes = now.getHours() * 60 + now.getMinutes();

  const startMinutes = parseTimeToMinutes(sleepStart);
  const endMinutes = parseTimeToMinutes(sleepEnd);

  // Handle overnight ranges (e.g., 22:00 to 08:00)
  if (startMinutes > endMinutes) {
    return currentMinutes >= startMinutes || currentMinutes < endMinutes;
  }

  return currentMinutes >= startMinutes && currentMinutes < endMinutes;
}

/**
 * Determine if a check-in should be sent
 */
export function shouldSendCheckIn(params: {
  state: IdleState;
  idleThresholdMs: number;
  sleepStart: string | number;
  sleepEnd: string | number;
  minTimeBetweenCheckInsMs?: number;
}): boolean {
  const { 
    state, 
    idleThresholdMs, 
    sleepStart, 
    sleepEnd, 
    minTimeBetweenCheckInsMs = 3600000  // 1 hour default
  } = params;

  // Don't check in during sleep hours
  if (isInSleepHours(sleepStart, sleepEnd)) {
    return false;
  }

  // Don't check in too frequently
  const timeSinceLastCheckIn = Date.now() - state.lastCheckInMs;
  if (timeSinceLastCheckIn < minTimeBetweenCheckInsMs) {
    return false;
  }

  // Check if idle threshold exceeded
  const idleMs = getIdleMs(state);
  return idleMs >= idleThresholdMs;
}

// === TIME OF DAY ===

export type TimeOfDay = "morning" | "afternoon" | "evening" | "night";

export function getTimeOfDay(sleepStart: string | number, sleepEnd: string | number): TimeOfDay {
  const hour = new Date().getHours();
  
  // Check if in sleep hours first
  if (isInSleepHours(sleepStart, sleepEnd)) {
    return "night";
  }
  
  if (hour >= 5 && hour < 12) return "morning";
  if (hour >= 12 && hour < 18) return "afternoon";
  return "evening";
}
