import type { Vocab } from "../types";

export function lessonNumbers(vocab: readonly Vocab[]): number[] {
  return [...new Set(vocab.map((item) => item.lektion))].sort((a, b) => a - b);
}
