export type Vocab = {
  id: string;
  lektion: number;
  latein: string;
  deutsch: string;
};

export type VocabInput = {
  lektion: number;
  latein: string;
  deutsch: string;
};

export type ProgressEntry = {
  correct: number;
  wrong: number;
  box: number;
  nextDue: string;
  updatedAt: string;
};

export type ProgressMap = Record<string, Record<string, ProgressEntry>>;

export type Profile = {
  id: string;
  name: string;
};

export type Direction = "l2d" | "d2l";

export type Variant = "mc" | "input" | "spelling" | "space";

export type RoundSetup = {
  lektionIds: number[];
  direction: Direction;
  variant: Variant;
  dueOnly: boolean;
};
