import type { ArenaRun, ArenaStationId, Vocab } from "../types";
import { ARENA_STATIONS } from "../types";
import { shuffle } from "./quiz";
import { planetById, planetLessons, type Planet } from "./planets";

export const BOSS_SHOOT_COUNT = 50;
export const BOSS_WRITE_COUNT = 30;

const STATION_SET = new Set<string>(ARENA_STATIONS);

export function freshArenaRun(planetId: string): ArenaRun {
  return { planetId, lessonIndex: 0, station: "recognize", missedIds: [] };
}

export function isLessonStation(station: ArenaStationId): boolean {
  return station === "recognize" || station === "reverse" || station === "write";
}

export function readArenaRun(value: unknown): ArenaRun | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<ArenaRun>;
  if (typeof item.planetId !== "string" || !planetById(item.planetId)) return undefined;
  if (typeof item.lessonIndex !== "number" || !Number.isInteger(item.lessonIndex) || item.lessonIndex < 0 || item.lessonIndex > 6) return undefined;
  if (typeof item.station !== "string" || !STATION_SET.has(item.station)) return undefined;
  const station = item.station as ArenaStationId;
  const lessonIndex = isLessonStation(station) ? Math.min(item.lessonIndex, 5) : 6;
  const missedIds = Array.isArray(item.missedIds)
    ? [...new Set(item.missedIds.filter((id): id is string => typeof id === "string" && id.length > 0))]
    : [];
  return { planetId: item.planetId, lessonIndex, station, missedIds };
}

function step(run: ArenaRun): ArenaRun | "clear" {
  if (run.station === "recognize") return { ...run, station: "reverse" };
  if (run.station === "reverse") return { ...run, station: "write" };
  if (run.station === "write") {
    if (run.lessonIndex < 5) return { ...run, lessonIndex: run.lessonIndex + 1, station: "recognize" };
    return { ...run, lessonIndex: 6, station: "boss-l2d" };
  }
  if (run.station === "boss-l2d") return { ...run, station: "boss-d2l" };
  if (run.station === "boss-d2l") return { ...run, station: "boss-write" };
  return "clear";
}

function lessonHasWords(vocab: readonly Vocab[], lesson: number | undefined): boolean {
  return lesson !== undefined && vocab.some((item) => item.lektion === lesson);
}

function skipEmpty(run: ArenaRun, planet: Planet, vocab: readonly Vocab[]): ArenaRun | "clear" {
  let current: ArenaRun | "clear" = run;
  const lessons = planetLessons(planet);
  while (current !== "clear" && isLessonStation(current.station)) {
    if (lessonHasWords(vocab, lessons[current.lessonIndex])) return current;
    current = step(current);
  }
  return current;
}

export function applyArenaResult(
  run: ArenaRun,
  planet: Planet,
  vocab: readonly Vocab[],
  missedIds: readonly string[],
  passed: boolean,
): ArenaRun | "clear" {
  const missed = [...new Set([...run.missedIds, ...missedIds])];
  const withMisses = { ...run, missedIds: missed };
  if (!passed) return withMisses;
  const next = step(withMisses);
  if (next === "clear") return "clear";
  return skipEmpty(next, planet, vocab);
}

export function wordsForStation(vocab: readonly Vocab[], planet: Planet, run: ArenaRun): Vocab[] {
  if (isLessonStation(run.station)) {
    const lesson = planetLessons(planet)[run.lessonIndex];
    if (lesson === undefined) return [];
    return shuffle(vocab.filter((item) => item.lektion === lesson));
  }
  const pool = vocab.filter((item) => item.lektion >= planet.from && item.lektion <= planet.to);
  const limit = run.station === "boss-write" ? BOSS_WRITE_COUNT : BOSS_SHOOT_COUNT;
  const missed = new Set(run.missedIds);
  const preferred = shuffle(pool.filter((item) => missed.has(item.id)));
  const rest = shuffle(pool.filter((item) => !missed.has(item.id)));
  return [...preferred, ...rest].slice(0, Math.min(limit, pool.length));
}

export type ArenaRoundLink = {
  arenaId: string;
  station: ArenaStationId;
  practice: boolean;
  run: ArenaRun;
};

export function readArenaLink(value: unknown): ArenaRoundLink | undefined {
  if (!value || typeof value !== "object") return undefined;
  const item = value as Partial<ArenaRoundLink>;
  if (typeof item.arenaId !== "string" || !planetById(item.arenaId)) return undefined;
  if (typeof item.station !== "string" || !STATION_SET.has(item.station)) return undefined;
  const run = readArenaRun(item.run);
  if (!run || run.planetId !== item.arenaId || run.station !== item.station) return undefined;
  return { arenaId: item.arenaId, station: item.station as ArenaStationId, practice: item.practice === true, run };
}

export function arenaPracticeState(vocab: readonly Vocab[], link: ArenaRoundLink, missedIds: readonly string[], passed: boolean): { arenaId: string; practiceRun?: ArenaRun; practiceDone?: boolean } {
  const planet = planetById(link.arenaId);
  if (!planet) return { arenaId: link.arenaId, practiceDone: true };
  const next = applyArenaResult(link.run, planet, vocab, missedIds, passed);
  if (next === "clear") return { arenaId: link.arenaId, practiceDone: true };
  return { arenaId: link.arenaId, practiceRun: next };
}

export function stationPassed(station: ArenaStationId, missedCount: number, spaceFailed: boolean): boolean {
  if (station === "boss-write") return missedCount <= 1;
  if (station === "boss-l2d" || station === "boss-d2l") return !spaceFailed;
  if (station === "write") return true;
  return !spaceFailed;
}

const onceKeys = new Set<string>();

export function runOnce(key: string, action: () => void): void {
  if (onceKeys.has(key)) return;
  onceKeys.add(key);
  action();
}

export function stationTitle(station: ArenaStationId): string {
  if (station === "recognize") return "Latein → Deutsch";
  if (station === "reverse") return "Deutsch → Latein";
  if (station === "write") return "Schreiben";
  if (station === "boss-l2d") return "Abschluss: Weltraum, Latein → Deutsch";
  if (station === "boss-d2l") return "Abschluss: Weltraum, Deutsch → Latein";
  return "Abschluss: Schreiben";
}
