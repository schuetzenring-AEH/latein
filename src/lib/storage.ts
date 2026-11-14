import { SEED_VOCAB } from "../data/seed";
import { PLANETS } from "./planets";
import { isWortart, sameStrings, splitDeutsch } from "./vocab";
import { readArenaRun } from "./arena";
import type { Profile, ProgressEntry, ProgressMap, Vocab, Wortart } from "../types";

/* All durable state goes through this module.
   A later cloud adapter can replace these functions without changing the pages. */

const KEYS = {
  vocab: "latein.vocab",
  profiles: "latein.profiles",
  active: "latein.activeProfile",
  progress: "latein.progress",
  theme: "latein.theme",
  seedRevision: "latein.seedRevision",
  session: "latein.session",
} as const;

export const GUEST_PROFILE_ID = "guest";

export function guestProfile(): Profile {
  return { id: GUEST_PROFILE_ID, name: "Frei spielen" };
}

export function withGuest(profiles: readonly Profile[]): Profile[] {
  if (profiles.some((profile) => profile.id === GUEST_PROFILE_ID)) return [...profiles];
  return [...profiles, guestProfile()];
}

/** Bump when stored cards should pick up new seed fields. */
export const SEED_REVISION = 7;

export type ThemeChoice = "light" | "dark";

function read(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

export function writeStored(key: string, value: string): boolean {
  try {
    localStorage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

export function freshSeed(): Vocab[] {
  return SEED_VOCAB.map((item) => ({ ...item }));
}

function normalizeStored(value: unknown): Vocab | null {
  if (!value || typeof value !== "object") return null;
  const item = value as {
    id?: unknown;
    lektion?: unknown;
    latein?: unknown;
    deutsch?: unknown;
    wortart?: unknown;
    cluster?: unknown;
  };
  if (typeof item.id !== "string" || item.id.length === 0) return null;
  if (typeof item.lektion !== "number" || !Number.isInteger(item.lektion) || item.lektion < 1) return null;
  if (typeof item.latein !== "string" || item.latein.trim().length === 0) return null;
  let deutsch: string[] = [];
  if (typeof item.deutsch === "string") deutsch = splitDeutsch(item.deutsch);
  else if (Array.isArray(item.deutsch)) {
    deutsch = item.deutsch.filter((part): part is string => typeof part === "string").map((part) => part.trim()).filter((part) => part.length > 0);
  } else return null;
  if (deutsch.length === 0) return null;
  const wortart: Wortart = typeof item.wortart === "string" && isWortart(item.wortart) ? item.wortart : "wendung";
  const cluster = Array.isArray(item.cluster)
    ? item.cluster.filter((part): part is string => typeof part === "string" && part.trim().length > 0)
    : [];
  return { id: item.id, lektion: item.lektion, latein: item.latein.trim(), deutsch, wortart, cluster };
}

function isHash(value: unknown): value is string {
  return typeof value === "string" && /^[a-f0-9]{64}$/.test(value);
}

function isClearedCount(value: unknown): value is number {
  return typeof value === "number" && Number.isInteger(value) && value >= 0 && value <= PLANETS.length;
}

function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Profile>;
  if (typeof item.id !== "string" || item.id.length === 0) return false;
  if (typeof item.name !== "string" || item.name.trim().length === 0) return false;
  if (item.passwordHash !== undefined && !isHash(item.passwordHash)) delete item.passwordHash;
  if (item.arenasCleared !== undefined && !isClearedCount(item.arenasCleared)) delete item.arenasCleared;
  const run = readArenaRun(item.arenaRun);
  if (run) item.arenaRun = run;
  else delete item.arenaRun;
  return true;
}

function isProgress(value: unknown): value is ProgressEntry {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<ProgressEntry>;
  return typeof item.correct === "number"
    && typeof item.wrong === "number"
    && typeof item.box === "number"
    && item.box >= 1
    && item.box <= 5
    && typeof item.nextDue === "string"
    && typeof item.updatedAt === "string";
}

function mergeNewLessons(existing: Vocab[]): Vocab[] {
  const storedRevision = Number(read(KEYS.seedRevision) || "0");
  if (storedRevision >= SEED_REVISION) return existing;
  const seedById = new Map(SEED_VOCAB.map((item) => [item.id, item]));
  const refreshed = existing.map((item) => {
    const seed = seedById.get(item.id);
    if (!seed) return item;
    if (
      seed.lektion === item.lektion
      && seed.latein === item.latein
      && seed.wortart === item.wortart
      && sameStrings(seed.deutsch, item.deutsch)
      && sameStrings(seed.cluster, item.cluster)
    ) return item;
    return {
      ...item,
      lektion: seed.lektion,
      latein: seed.latein,
      deutsch: [...seed.deutsch],
      wortart: seed.wortart,
      cluster: [...seed.cluster],
    };
  });
  const ids = new Set(refreshed.map((item) => item.id));
  const additions = SEED_VOCAB.filter((item) => !ids.has(item.id));
  const next = additions.length > 0 ? [...refreshed, ...additions] : refreshed;
  writeStored(KEYS.vocab, JSON.stringify(next));
  writeStored(KEYS.seedRevision, String(SEED_REVISION));
  return next;
}

export function loadVocab(): Vocab[] {
  const raw = read(KEYS.vocab);
  if (raw === null) {
    const seed = freshSeed();
    writeStored(KEYS.vocab, JSON.stringify(seed));
    writeStored(KEYS.seedRevision, String(SEED_REVISION));
    return seed;
  }
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return freshSeed();
    return mergeNewLessons(parsed.map(normalizeStored).filter((item): item is Vocab => item !== null));
  } catch {
    return freshSeed();
  }
}

export function saveVocab(vocab: readonly Vocab[]): boolean {
  return writeStored(KEYS.vocab, JSON.stringify(vocab));
}

export function loadProfiles(): { profiles: Profile[]; activeId: string } {
  let profiles: Profile[] = [];
  const raw = read(KEYS.profiles);
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (Array.isArray(parsed)) profiles = parsed.filter(isProfile);
    } catch {
      profiles = [];
    }
  }
  if (profiles.length === 0) {
    profiles = [{ id: "default", name: "Ich" }];
    writeStored(KEYS.profiles, JSON.stringify(profiles));
  }
  const storedActive = read(KEYS.active);
  const activeId = profiles.some((profile) => profile.id === storedActive) ? storedActive ?? profiles[0].id : profiles[0].id;
  return { profiles, activeId };
}

export function saveProfiles(profiles: readonly Profile[]): boolean {
  return writeStored(KEYS.profiles, JSON.stringify(profiles));
}

export function saveActiveProfile(id: string): boolean {
  return writeStored(KEYS.active, id);
}

export function loadProgress(): ProgressMap {
  const raw = read(KEYS.progress);
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const map: ProgressMap = {};
    for (const [profileId, entries] of Object.entries(parsed)) {
      if (!entries || typeof entries !== "object" || Array.isArray(entries)) continue;
      map[profileId] = {};
      for (const [vocabId, entry] of Object.entries(entries)) {
        if (isProgress(entry)) map[profileId][vocabId] = entry;
      }
    }
    return map;
  } catch {
    return {};
  }
}

export function saveProgress(progress: ProgressMap): boolean {
  return writeStored(KEYS.progress, JSON.stringify(progress));
}

export function loadTheme(): ThemeChoice {
  const stored = read(KEYS.theme);
  if (stored === "light" || stored === "dark") return stored;
  if (typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches) return "dark";
  return "light";
}

export function saveTheme(theme: ThemeChoice): boolean {
  return writeStored(KEYS.theme, theme);
}

export type PlayMode = "gate" | "guest" | "named";

export type SavedSession = { mode: "guest" } | { mode: "named"; profileId: string };

export function loadSavedSession(): SavedSession | null {
  const raw = read(KEYS.session);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Partial<SavedSession>;
    if (parsed.mode === "guest") return { mode: "guest" };
    if (parsed.mode === "named" && typeof parsed.profileId === "string" && parsed.profileId.length > 0) {
      return { mode: "named", profileId: parsed.profileId };
    }
  } catch {
    return null;
  }
  return null;
}

export function saveSession(session: SavedSession | null): boolean {
  if (!session) {
    try {
      localStorage.removeItem(KEYS.session);
      return true;
    } catch {
      return false;
    }
  }
  return writeStored(KEYS.session, JSON.stringify(session));
}

export function loadPlayState(): { profiles: Profile[]; activeId: string; playMode: PlayMode } {
  const loaded = loadProfiles();
  const session = loadSavedSession();
  if (session?.mode === "named") {
    const account = loaded.profiles.find((profile) => profile.id === session.profileId && typeof profile.passwordHash === "string");
    if (account) return { profiles: loaded.profiles, activeId: account.id, playMode: "named" };
    saveSession(null);
  }
  if (session?.mode === "guest") {
    const profiles = withGuest(loaded.profiles);
    if (profiles.length !== loaded.profiles.length) saveProfiles(profiles);
    const activeIsFree = profiles.some((profile) => profile.id === loaded.activeId && !profile.passwordHash);
    const activeId = activeIsFree ? loaded.activeId : GUEST_PROFILE_ID;
    if (activeId !== loaded.activeId) saveActiveProfile(activeId);
    return { profiles, activeId, playMode: "guest" };
  }
  return { profiles: loaded.profiles, activeId: loaded.activeId, playMode: "gate" };
}

export { KEYS };
