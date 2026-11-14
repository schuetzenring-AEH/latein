export const WORTARTEN = [
  "verb",
  "substantiv",
  "adjektiv",
  "adverb",
  "pronomen",
  "praeposition",
  "konjunktion",
  "zahlwort",
  "wendung",
] as const;

export type Wortart = (typeof WORTARTEN)[number];

export type Vocab = {
  id: string;
  lektion: number;
  latein: string;
  deutsch: string[];
  wortart: Wortart;
  cluster: string[];
};

export type VocabInput = {
  lektion: number;
  latein: string;
  deutsch: string[];
  wortart?: Wortart;
  cluster?: string[];
};

export type ProgressEntry = {
  correct: number;
  wrong: number;
  box: number;
  nextDue: string;
  updatedAt: string;
};

export type ProgressMap = Record<string, Record<string, ProgressEntry>>;

export const ARENA_STATIONS = ["recognize", "reverse", "write", "boss-l2d", "boss-d2l", "boss-write"] as const;

export type ArenaStationId = (typeof ARENA_STATIONS)[number];

/** Progress inside the one open arena. Lesson index 6 means the three final tests. */
export type ArenaRun = {
  planetId: string;
  lessonIndex: number;
  station: ArenaStationId;
  missedIds: string[];
};

export type Profile = {
  id: string;
  name: string;
  /** SHA-256 hex. Only named accounts have one. Free profiles stay without it. */
  passwordHash?: string;
  /** Arenas cleared in path order. Missing means none, so only Mercurius is open. */
  arenasCleared?: number;
  /** Saved step of the open arena. Cleared planets do not keep a run. */
  arenaRun?: ArenaRun;
};

export type Direction = "l2d" | "d2l";

export type Variant = "mc" | "input" | "spelling" | "space";

export type RoundSetup = {
  lektionIds: number[];
  direction: Direction;
  variant: Variant;
  dueOnly: boolean;
};
