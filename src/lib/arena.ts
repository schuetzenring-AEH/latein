import type { ArenaRun, ArenaStationId, Vocab } from "../types";
import { ARENA_STATIONS } from "../types";
import { shuffle } from "./quiz";
import { planetById, planetLessons, type Planet } from "./planets";

export const BOSS_SHOOT_COUNT = 50;
export const BOSS_WRITE_COUNT = 30;
export const LESSON_MISS_LIMIT = 3;
export const BOSS_MISS_LIMIT = 1;

const LESSON_STATIONS = ["recognize", "reverse", "write"] as const;
const STATION_SET = new Set<string>(ARENA_STATIONS);

export function stationKey(lessonIndex: number, station: ArenaStationId): string {
  return `${lessonIndex}:${station}`;
}

export function freshArenaRun(planetId: string): ArenaRun {
  return { planetId, lessonIndex: 0, station: "recognize", missedIds: [], passedStations: [] };
}

export function lessonStars(run: ArenaRun): boolean[] {
  return [0, 1, 2, 3, 4, 5].map((index) => (
    LESSON_STATIONS.every((station) => run.passedStations.includes(stationKey(index, station)))
  ));
}

function creditBefore(lessonIndex: number, station: ArenaStationId): string[] {
  const passed: string[] = [];
  const doneLessons = isLessonStation(station) ? lessonIndex : 6;
  for (let index = 0; index < doneLessons; index += 1) {
    for (const name of LESSON_STATIONS) passed.push(stationKey(index, name));
  }
  if (!isLessonStation(station)) return passed;
  if (station === "reverse" || station === "write") passed.push(stationKey(lessonIndex, "recognize"));
  if (station === "write") passed.push(stationKey(lessonIndex, "reverse"));
  return passed;
}

function readPassedStations(value: unknown, lessonIndex: number, station: ArenaStationId): string[] {
  if (!Array.isArray(value)) return creditBefore(lessonIndex, station);
  const keys = new Set<string>();
  for (const item of value) {
    if (typeof item !== "string") continue;
    const [lesson, name] = item.split(":");
    const index = Number(lesson);
    if (!Number.isInteger(index) || index < 0 || index > 5) continue;
    if (name !== "recognize" && name !== "reverse" && name !== "write") continue;
    keys.add(stationKey(index, name));
  }
  return [...keys];
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
  return { planetId: item.planetId, lessonIndex, station, missedIds, passedStations: readPassedStations(item.passedStations, lessonIndex, station) };
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

function withStationCredit(run: ArenaRun, passed: boolean): ArenaRun {
  const key = stationKey(run.lessonIndex, run.station);
  const passedStations = passed
    ? [...new Set([...run.passedStations, key])]
    : run.passedStations.filter((item) => item !== key);
  return { ...run, passedStations };
}

function markEmptyLesson(run: ArenaRun): ArenaRun {
  const passedStations = [...run.passedStations];
  for (const station of LESSON_STATIONS) {
    const key = stationKey(run.lessonIndex, station);
    if (!passedStations.includes(key)) passedStations.push(key);
  }
  return { ...run, passedStations };
}

function stepForward(run: ArenaRun): ArenaRun | "clear" {
  let next = step(run);
  while (next !== "clear" && isLessonStation(next.station) && next.passedStations.includes(stationKey(next.lessonIndex, next.station))) {
    next = step(next);
  }
  return next;
}

function firstOpenLesson(run: ArenaRun, planet: Planet, vocab: readonly Vocab[]): ArenaRun | null {
  const lessons = planetLessons(planet);
  for (let index = 0; index < lessons.length; index += 1) {
    if (!lessonHasWords(vocab, lessons[index])) continue;
    for (const station of LESSON_STATIONS) {
      if (!run.passedStations.includes(stationKey(index, station))) {
        return { ...run, lessonIndex: index, station };
      }
    }
  }
  return null;
}

function skipEmpty(run: ArenaRun, planet: Planet, vocab: readonly Vocab[]): ArenaRun | "clear" {
  let current: ArenaRun | "clear" = run;
  const lessons = planetLessons(planet);
  while (current !== "clear" && isLessonStation(current.station)) {
    if (lessonHasWords(vocab, lessons[current.lessonIndex])) return current;
    const marked = markEmptyLesson(current);
    const stepped = step(marked);
    current = stepped === "clear" ? "clear" : stepped;
    if (current !== "clear" && lessons[current.lessonIndex] === undefined) return current;
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
  if (isLessonStation(withMisses.station)) {
    const credited = withStationCredit(withMisses, passed);
    const stepped = stepForward(credited);
    if (stepped === "clear") return "clear";
    const next = skipEmpty(stepped, planet, vocab);
    if (next === "clear" || isLessonStation(next.station)) return next;
    const gap = firstOpenLesson(next, planet, vocab);
    return gap ?? next;
  }
  if (!passed) return withMisses;
  const gap = firstOpenLesson(withMisses, planet, vocab);
  if (gap) return gap;
  const next = step(withMisses);
  return next === "clear" ? "clear" : next;
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
  if (isLessonStation(station)) return missedCount < LESSON_MISS_LIMIT;
  if (spaceFailed) return false;
  return missedCount <= BOSS_MISS_LIMIT;
}

export function arenaResultText(station: ArenaStationId, passed: boolean, practice = false): string {
  if (!passed && isLessonStation(station)) return "Drei Fehler. Die Runde ist zu Ende, der Stern für diese Lektion fehlt noch.";
  if (!passed) return "Mehr als ein Fehler. Die Probe beginnt neu.";
  if (isLessonStation(station)) return "Bestanden.";
  if (practice) return "Diese Station ist geschafft. Der Pfad bleibt, wo er ist.";
  if (station === "boss-write") return "Die Arena ist geschafft.";
  return "Diese Probe ist geschafft.";
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
