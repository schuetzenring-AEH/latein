import type { ProgressEntry } from "../types";

const INTERVAL_DAYS: Record<number, number> = {
  1: 0,
  2: 1,
  3: 3,
  4: 7,
  5: 21,
};

export function review(prev: ProgressEntry | undefined, correct: boolean, now = new Date()): ProgressEntry {
  const box = correct ? Math.min(5, (prev?.box ?? 1) + 1) : 1;
  const days = INTERVAL_DAYS[box] ?? 0;
  const nextDue = new Date(now.getTime() + days * 24 * 60 * 60 * 1000);
  return {
    correct: (prev?.correct ?? 0) + (correct ? 1 : 0),
    wrong: (prev?.wrong ?? 0) + (correct ? 0 : 1),
    box,
    nextDue: nextDue.toISOString(),
    updatedAt: now.toISOString(),
  };
}

export function isDue(entry: ProgressEntry | undefined, now = new Date()): boolean {
  if (!entry) return true;
  return Date.parse(entry.nextDue) <= now.getTime();
}
