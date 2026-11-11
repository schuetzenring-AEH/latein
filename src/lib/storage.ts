import { EXTRA_VOCAB } from "../data/extra";
import { SEED_VOCAB } from "../data/seed";
import type { Profile, ProgressEntry, ProgressMap, Vocab } from "../types";

/* All durable state goes through this module.
   A later cloud adapter can replace these functions without changing the pages. */

const KEYS = {
  vocab: "latein.vocab",
  profiles: "latein.profiles",
  active: "latein.activeProfile",
  progress: "latein.progress",
  theme: "latein.theme",
  seedRevision: "latein.seedRevision",
} as const;

/** Bump when new seed ids should be merged into an existing browser cache. */
export const SEED_REVISION = 2;
const NEW_SEED_IDS = new Set(EXTRA_VOCAB.map((item) => item.id));

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

function isVocab(value: unknown): value is Vocab {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Vocab>;
  return typeof item.id === "string"
    && item.id.length > 0
    && typeof item.lektion === "number"
    && Number.isInteger(item.lektion)
    && item.lektion >= 1
    && typeof item.latein === "string"
    && item.latein.trim().length > 0
    && typeof item.deutsch === "string"
    && item.deutsch.trim().length > 0;
}

function isProfile(value: unknown): value is Profile {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<Profile>;
  return typeof item.id === "string" && item.id.length > 0 && typeof item.name === "string" && item.name.trim().length > 0;
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
  const ids = new Set(existing.map((item) => item.id));
  const additions = SEED_VOCAB.filter((item) => NEW_SEED_IDS.has(item.id) && !ids.has(item.id));
  const next = additions.length > 0 ? [...existing, ...additions] : existing;
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
    return mergeNewLessons(parsed.filter(isVocab));
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

export { KEYS };
