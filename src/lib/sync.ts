import type { ArenaRun, ArenaStationId, DayStat, Mistake, Profile, ProgressMap, Vocab } from "../types";
import { ARENA_STATIONS } from "../types";
import { cleanDays, mergeDays, type DayLogMap } from "./daylog";
import { nameKey } from "./password";

/**
 * A copy of the scores is sent away from the device and kept.
 * Another device may take that copy when the name is not already there.
 * A stand that is already on the device is never replaced by the copy.
 */
const INDEX_PAGE = "latein-schuetzen-9f3a2c7b";
const EDIT_CODE = "7f3a9c2e5b8d1046a7c3e9f2b6d8a1c4";
const PAGE_PREFIX = "latein-s9f3-";
const TEXT_LIMIT = 180_000;
const MISTAKE_LIMIT = 300;
const PUSH_DELAY_MS = 8000;

export type StatsInput = {
  profiles: readonly Profile[];
  progress: ProgressMap;
  vocab: readonly Vocab[];
  mistakes: readonly Mistake[];
  days: DayLogMap;
};

type StatsReader = () => StatsInput;

type WordCopy = {
  id: string;
  lektion: number;
  latein: string;
  correct: number;
  wrong: number;
  box: number;
  updatedAt: string;
};

type ProfileCopy = {
  v: 1;
  id: string;
  name: string;
  /** Same check the device already stores. The password itself is never sent. */
  passwordHash?: string;
  arenasCleared: number;
  arenaRun: ArenaRun | null;
  updatedAt: string;
  words: WordCopy[];
  mistakes: Mistake[];
  days: DayStat[];
};

export type RemoteAccount =
  | { status: "match"; profile: ProfileCopy }
  | { status: "missing" }
  | { status: "wrong" }
  | { status: "unconfirmed" }
  | { status: "unavailable" };

type IndexEntry = {
  id: string;
  name: string;
  updatedAt: string;
  page: string;
};

type IndexCopy = {
  v: 1;
  profiles: IndexEntry[];
};

type RentryBody = {
  status?: string;
  content?: string | { text?: string };
};

let reader: StatsReader = () => ({ profiles: [], progress: {}, vocab: [], mistakes: [], days: {} });
let timer = 0;
let sending = false;
let pending = false;
let retries = 0;

export function scheduleStatsPush(read: StatsReader): void {
  reader = read;
  pending = true;
  retries = 0;
  if (timer) return;
  arm();
}

function arm(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    timer = 0;
    void flushStats();
  }, PUSH_DELAY_MS);
}

export async function flushStats(): Promise<void> {
  if (sending || !pending) return;
  window.clearTimeout(timer);
  timer = 0;
  pending = false;
  sending = true;
  try {
    await postStats(reader());
    retries = 0;
  } catch {
    retries += 1;
    if (retries <= 3) {
      pending = true;
      arm();
    }
  } finally {
    sending = false;
  }
}

async function postStats(input: StatsInput): Promise<void> {
  const profiles = localProfiles(input);
  if (profiles.length === 0) return;
  for (const profile of profiles) await saveProfile(profile);
  await saveIndex(profiles);
}

function localProfiles(input: StatsInput): ProfileCopy[] {
  return input.profiles.flatMap((profile) => {
    const words = wordStats(input.vocab, input.progress[profile.id]);
    const mistakes = input.mistakes.filter((item) => item.profileId === profile.id).slice(-MISTAKE_LIMIT);
    const arenasCleared = profile.arenasCleared ?? 0;
    const passwordHash = isHash(profile.passwordHash) ? profile.passwordHash : undefined;
    if (words.length === 0 && mistakes.length === 0 && arenasCleared === 0 && !profile.arenaRun && !passwordHash) return [];
    const times = [...words.map((word) => word.updatedAt), ...mistakes.map((item) => item.at)];
    return [{
      v: 1 as const,
      id: profile.id,
      name: profile.name,
      ...(passwordHash ? { passwordHash } : {}),
      arenasCleared,
      arenaRun: copyRun(profile.arenaRun),
      updatedAt: times.sort().at(-1) ?? new Date().toISOString(),
      words,
      mistakes,
      days: input.days[profile.id] ?? [],
    }];
  });
}

function copyRun(run: ArenaRun | undefined): ArenaRun | null {
  if (!run) return null;
  return {
    planetId: run.planetId,
    lessonIndex: run.lessonIndex,
    station: run.station,
    missedIds: run.missedIds ?? [],
    passedStations: run.passedStations ?? [],
  };
}

function wordStats(vocab: readonly Vocab[], entries: ProgressMap[string] | undefined): WordCopy[] {
  if (!entries) return [];
  const byId = new Map(vocab.map((item) => [item.id, item]));
  return Object.entries(entries).flatMap(([id, entry]) => [{
    id,
    lektion: byId.get(id)?.lektion ?? 0,
    latein: byId.get(id)?.latein ?? "",
    correct: entry.correct,
    wrong: entry.wrong,
    box: entry.box,
    updatedAt: entry.updatedAt,
  }]);
}

async function saveProfile(local: ProfileCopy): Promise<void> {
  const page = pageFor(local.id);
  const fetched = await rentry(`fetch/${page}`, { edit_code: EDIT_CODE });
  if (fetched.status === "404") {
    await createPage(page, fit(local));
    return;
  }
  if (fetched.status !== "200") throw new Error("Die Statistik-Kopie konnte nicht gelesen werden.");
  const current = readProfile(pageText(fetched));
  await editPage(page, fit(mergeProfile(current, local)));
}

async function saveIndex(local: readonly ProfileCopy[]): Promise<void> {
  const fetched = await rentry(`fetch/${INDEX_PAGE}`, { edit_code: EDIT_CODE });
  if (fetched.status !== "200") throw new Error("Die Statistik-Kopie konnte nicht gelesen werden.");
  const text = pageText(fetched).trim();
  const empty: IndexCopy = { v: 1, profiles: [] };
  const current = text ? readIndex(text) : empty;
  if (!current) throw new Error("Die vorhandene Kopie ist unlesbar.");
  await editPage(INDEX_PAGE, mergeIndex(current, local));
}

async function createPage(page: string, body: unknown): Promise<void> {
  const created = await rentry("new", {
    text: JSON.stringify(body),
    url: page,
    edit_code: EDIT_CODE,
  });
  if (created.status === "200") return;
  await editPage(page, body);
}

async function editPage(page: string, body: unknown): Promise<void> {
  const edited = await rentry(`edit/${page}`, {
    edit_code: EDIT_CODE,
    text: JSON.stringify(body),
    update_mode: "replace",
  });
  if (edited.status !== "200") throw new Error("Die Statistik-Kopie konnte nicht gesendet werden.");
}

async function rentry(path: string, fields: Record<string, string>): Promise<RentryBody> {
  const response = await fetch(`https://rentry.co/api/${path}`, {
    method: "POST",
    mode: "cors",
    credentials: "omit",
    headers: { "Content-Type": "application/x-www-form-urlencoded;charset=UTF-8" },
    body: new URLSearchParams(fields),
  });
  if (!response.ok) throw new Error("Die Statistik-Kopie konnte nicht gesendet werden.");
  return response.json() as Promise<RentryBody>;
}

function pageText(body: RentryBody): string {
  if (body.content && typeof body.content === "object") return body.content.text ?? "";
  return "";
}

function pageFor(profileId: string): string {
  const clean = profileId.toLowerCase().replace(/[^a-z0-9-]+/g, "-").replace(/^-+|-+$/g, "");
  const page = `${PAGE_PREFIX}${clean}`;
  if (clean.length > 0 && page.length <= 100) return page;
  return `${PAGE_PREFIX}${hashId(profileId)}`;
}

function hashId(value: string): string {
  let hash = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    hash ^= value.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function fit(profile: ProfileCopy): ProfileCopy {
  let copy = profile;
  while (JSON.stringify(copy).length > TEXT_LIMIT && copy.mistakes.length > 0) {
    copy = { ...copy, mistakes: copy.mistakes.slice(1) };
  }
  while (JSON.stringify(copy).length > TEXT_LIMIT && copy.days.length > 1) {
    copy = { ...copy, days: copy.days.slice(1) };
  }
  return copy;
}

function mergeProfile(current: ProfileCopy | null, local: ProfileCopy): ProfileCopy {
  if (!current || current.id !== local.id) return local;
  const words = new Map<string, WordCopy>();
  for (const word of current.words) words.set(word.id, word);
  for (const word of local.words) {
    const previous = words.get(word.id);
    words.set(word.id, previous ? mergeWord(previous, word) : word);
  }
  const seen = new Set<string>();
  const mistakes = [...current.mistakes, ...local.mistakes].filter((item) => {
    const key = `${item.at}|${item.vocabId}|${item.given}|${item.expected}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).sort((a, b) => a.at.localeCompare(b.at)).slice(-MISTAKE_LIMIT);
  const arenasCleared = Math.max(current.arenasCleared, local.arenasCleared);
  const passwordHash = isHash(local.passwordHash) ? local.passwordHash : isHash(current.passwordHash) ? current.passwordHash : undefined;
  return {
    v: 1,
    id: local.id,
    name: local.name || current.name,
    ...(passwordHash ? { passwordHash } : {}),
    arenasCleared,
    arenaRun: mergeRun(current.arenaRun, local.arenaRun, current.arenasCleared, local.arenasCleared),
    updatedAt: current.updatedAt > local.updatedAt ? current.updatedAt : local.updatedAt,
    words: [...words.values()],
    mistakes,
    days: mergeDays(current.days, local.days),
  };
}

function mergeWord(current: WordCopy, local: WordCopy): WordCopy {
  const newer = local.updatedAt >= current.updatedAt ? local : current;
  return {
    id: local.id,
    lektion: local.lektion || current.lektion,
    latein: local.latein || current.latein,
    correct: Math.max(current.correct, local.correct),
    wrong: Math.max(current.wrong, local.wrong),
    box: newer.box,
    updatedAt: newer.updatedAt,
  };
}

function mergeRun(
  current: ArenaRun | null,
  local: ArenaRun | null,
  currentCleared: number,
  localCleared: number,
): ArenaRun | null {
  if (currentCleared !== localCleared) return currentCleared > localCleared ? current : local;
  const currentRank = runRank(current);
  const localRank = runRank(local);
  if (currentRank !== localRank) return currentRank > localRank ? current : local;
  if (!current) return local;
  if (!local) return current;
  return {
    planetId: local.planetId || current.planetId,
    lessonIndex: local.lessonIndex,
    station: local.station,
    missedIds: [...new Set([...current.missedIds, ...local.missedIds])],
    passedStations: [...new Set([...current.passedStations, ...local.passedStations])],
  };
}

function runRank(run: ArenaRun | null): number {
  if (!run) return -1;
  const station = ARENA_STATIONS.indexOf(run.station);
  return run.lessonIndex * 10 + (station < 0 ? 0 : station);
}

function mergeIndex(current: IndexCopy, local: readonly ProfileCopy[]): IndexCopy {
  const byId = new Map(current.profiles.map((entry) => [entry.id, entry]));
  for (const profile of local) {
    const previous = byId.get(profile.id);
    byId.set(profile.id, {
      id: profile.id,
      name: profile.name || previous?.name || "",
      updatedAt: previous && previous.updatedAt > profile.updatedAt ? previous.updatedAt : profile.updatedAt,
      page: pageFor(profile.id),
    });
  }
  return { v: 1, profiles: [...byId.values()] };
}

function readProfile(text: string): ProfileCopy | null {
  const parsed = parseJson(text);
  if (!parsed || parsed.v !== 1 || typeof parsed.id !== "string") return null;
  const words = Array.isArray(parsed.words) ? parsed.words.flatMap(readWord) : [];
  const mistakes = Array.isArray(parsed.mistakes) ? parsed.mistakes.flatMap(readMistake) : [];
  const passwordHash = isHash(parsed.passwordHash) ? parsed.passwordHash : undefined;
  return {
    v: 1,
    id: parsed.id,
    name: typeof parsed.name === "string" ? parsed.name : "",
    ...(passwordHash ? { passwordHash } : {}),
    arenasCleared: typeof parsed.arenasCleared === "number" ? parsed.arenasCleared : 0,
    arenaRun: readRun(parsed.arenaRun),
    updatedAt: typeof parsed.updatedAt === "string" ? parsed.updatedAt : "",
    words,
    mistakes,
    days: cleanDays(parsed.days),
  };
}

function readIndex(text: string): IndexCopy | null {
  const parsed = parseJson(text);
  if (!parsed || !Array.isArray(parsed.profiles)) return null;
  const profiles = parsed.profiles.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || typeof entry.page !== "string") return [];
    return [{
      id: entry.id,
      name: typeof entry.name === "string" ? entry.name : "",
      updatedAt: typeof entry.updatedAt === "string" ? entry.updatedAt : "",
      page: entry.page,
    }];
  });
  return { v: 1, profiles };
}

function readWord(value: unknown): WordCopy[] {
  if (!isRecord(value) || typeof value.id !== "string") return [];
  return [{
    id: value.id,
    lektion: typeof value.lektion === "number" ? value.lektion : 0,
    latein: typeof value.latein === "string" ? value.latein : "",
    correct: typeof value.correct === "number" ? value.correct : 0,
    wrong: typeof value.wrong === "number" ? value.wrong : 0,
    box: typeof value.box === "number" ? value.box : 1,
    updatedAt: typeof value.updatedAt === "string" ? value.updatedAt : "",
  }];
}

function readMistake(value: unknown): Mistake[] {
  if (!isRecord(value)) return [];
  if (typeof value.at !== "string" || typeof value.profileId !== "string" || typeof value.vocabId !== "string") return [];
  if (typeof value.prompt !== "string" || typeof value.given !== "string" || typeof value.expected !== "string") return [];
  if (value.mode !== "quiz" && value.mode !== "weltraum") return [];
  return [{
    at: value.at,
    profileId: value.profileId,
    vocabId: value.vocabId,
    prompt: value.prompt,
    given: value.given,
    expected: value.expected,
    mode: value.mode,
    station: typeof value.station === "string" ? value.station : undefined,
  }];
}

function readRun(value: unknown): ArenaRun | null {
  if (!isRecord(value) || typeof value.planetId !== "string" || typeof value.station !== "string") return null;
  if (!ARENA_STATIONS.includes(value.station as ArenaStationId)) return null;
  return {
    planetId: value.planetId,
    lessonIndex: typeof value.lessonIndex === "number" ? value.lessonIndex : 0,
    station: value.station as ArenaStationId,
    missedIds: stringList(value.missedIds),
    passedStations: stringList(value.passedStations),
  };
}

function stringList(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((item): item is string => typeof item === "string") : [];
}

function parseJson(text: string): Record<string, unknown> | null {
  try {
    const parsed = JSON.parse(text) as unknown;
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

/** Looks up a name on the copy. Does not write anything. */
export async function findRemoteAccount(name: string, passwordHash: string): Promise<RemoteAccount> {
  const key = nameKey(name);
  if (!key || !isHash(passwordHash)) return { status: "unavailable" };
  try {
    const fetched = await rentry(`fetch/${INDEX_PAGE}`, { edit_code: EDIT_CODE });
    if (fetched.status !== "200") return { status: "unavailable" };
    const index = readIndex(pageText(fetched).trim() || "{\"v\":1,\"profiles\":[]}");
    if (!index) return { status: "unavailable" };
    const hits = index.profiles.filter((entry) => entry.id !== "guest" && nameKey(entry.name) === key);
    if (hits.length === 0) return { status: "missing" };
    let sawHash = false;
    let sawUnconfirmed = false;
    for (const hit of hits) {
      const page = await rentry(`fetch/${hit.page}`, { edit_code: EDIT_CODE });
      if (page.status !== "200") continue;
      const profile = readProfile(pageText(page));
      if (!profile || nameKey(profile.name) !== key) continue;
      if (!isHash(profile.passwordHash)) {
        sawUnconfirmed = true;
        continue;
      }
      sawHash = true;
      if (profile.passwordHash === passwordHash) return { status: "match", profile };
    }
    if (sawHash) return { status: "wrong" };
    if (sawUnconfirmed) return { status: "unconfirmed" };
    return { status: "missing" };
  } catch {
    return { status: "unavailable" };
  }
}
