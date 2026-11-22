import type { DayStat } from "../types";

export type DayLogMap = Record<string, DayStat[]>;

const DAY = /^\d{4}-\d{2}-\d{2}$/;
const MAX_SECONDS = 24 * 60 * 60;
const MAX_DAYS = 400;

export function localDay(now = new Date()): string {
  const month = String(now.getMonth() + 1).padStart(2, "0");
  const day = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${month}-${day}`;
}

export function addDay(
  map: DayLogMap,
  profileId: string,
  date: string,
  add: { seconds?: number; words?: number; correct?: number; wrong?: number },
): DayLogMap {
  if (!DAY.test(date)) return map;
  const seconds = whole(add.seconds);
  const words = whole(add.words);
  const correct = whole(add.correct);
  const wrong = whole(add.wrong);
  if (seconds === 0 && words === 0 && correct === 0 && wrong === 0) return map;
  const current = (map[profileId] ?? []).find((day) => day.date === date);
  const next: DayStat = {
    date,
    seconds: capSeconds((current?.seconds ?? 0) + seconds),
    words: (current?.words ?? 0) + words,
    correct: (current?.correct ?? 0) + correct,
    wrong: (current?.wrong ?? 0) + wrong,
  };
  return { ...map, [profileId]: mergeDays(map[profileId] ?? [], [next]) };
}

/** Keeps the higher count for each day. A later copy never lowers a day. */
export function mergeDays(current: readonly DayStat[], incoming: readonly DayStat[]): DayStat[] {
  const byDate = new Map<string, DayStat>();
  for (const day of [...current, ...incoming]) {
    const clean = cleanDay(day);
    if (!clean) continue;
    const previous = byDate.get(clean.date);
    if (!previous) {
      byDate.set(clean.date, clean);
      continue;
    }
    byDate.set(clean.date, {
      date: clean.date,
      seconds: Math.max(previous.seconds, clean.seconds),
      words: Math.max(previous.words, clean.words),
      correct: Math.max(previous.correct, clean.correct),
      wrong: Math.max(previous.wrong, clean.wrong),
    });
  }
  return [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date)).slice(-MAX_DAYS);
}

export function cleanDays(values: unknown): DayStat[] {
  if (!Array.isArray(values)) return [];
  return mergeDays([], values.flatMap((value) => {
    const day = cleanDay(value);
    return day ? [day] : [];
  }));
}

export function formatDuration(seconds: number): string {
  const total = capSeconds(seconds);
  if (total === 0) return "0 Min";
  if (total < 60) return "unter 1 Min";
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  if (hours === 0) return `${minutes} Min`;
  if (minutes === 0) return `${hours} Std`;
  return `${hours} Std ${minutes} Min`;
}

export function formatDayLine(day: DayStat): string {
  const [year, month, date] = day.date.split("-");
  return `${date}.${month}.${year}  ${formatDuration(day.seconds)}  ${day.words} Wörter (${day.correct} richtig, ${day.wrong} falsch)`;
}

function cleanDay(value: unknown): DayStat | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<DayStat>;
  if (typeof item.date !== "string" || !DAY.test(item.date)) return null;
  return {
    date: item.date,
    seconds: capSeconds(typeof item.seconds === "number" ? item.seconds : 0),
    words: whole(item.words),
    correct: whole(item.correct),
    wrong: whole(item.wrong),
  };
}

function whole(value: unknown): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

function capSeconds(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(MAX_SECONDS, Math.floor(value));
}
