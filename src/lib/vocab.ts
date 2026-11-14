import type { Vocab, VocabInput, Wortart } from "../types";
import { WORTARTEN } from "../types";

export function lessonNumbers(vocab: readonly Vocab[]): number[] {
  return [...new Set(vocab.map((item) => item.lektion))].sort((a, b) => a - b);
}

/** One number, a comma list (3, 12) or a range (12-15). */
export function parseLessonInput(text: string): { lessons: number[] } | { error: "empty" | "invalid" } {
  const trimmed = text.trim();
  if (!trimmed) return { error: "empty" };
  const parts = trimmed.split(/[,;]/).map((part) => part.trim()).filter(Boolean);
  if (parts.length === 0) return { error: "empty" };
  const numbers: number[] = [];
  for (const part of parts) {
    const range = /^(\d+)\s*[-–—]\s*(\d+)$/.exec(part);
    if (range) {
      const low = Math.min(Number(range[1]), Number(range[2]));
      const high = Math.max(Number(range[1]), Number(range[2]));
      if (high - low > 80) return { error: "invalid" };
      for (let n = low; n <= high; n += 1) numbers.push(n);
      continue;
    }
    if (/^\d+$/.test(part)) {
      const n = Number(part);
      if (n < 1 || n > 200) return { error: "invalid" };
      numbers.push(n);
      continue;
    }
    return { error: "invalid" };
  }
  return { lessons: [...new Set(numbers)] };
}

const WORTART_SET = new Set<string>(WORTARTEN);

export function splitDeutsch(text: string): string[] {
  return text.split(";").map((part) => part.trim()).filter((part) => part.length > 0);
}

export function joinDeutsch(meanings: readonly string[]): string {
  return meanings.join("; ");
}

export function sameStrings(left: readonly string[], right: readonly string[]): boolean {
  return left.length === right.length && left.every((item, index) => item === right[index]);
}

export function isWortart(value: string): value is Wortart {
  return WORTART_SET.has(value);
}

/** Fills wortart and cluster when a hand-added card does not bring them. */
export function completeVocab(input: VocabInput & { id: string }): Vocab {
  return {
    id: input.id,
    lektion: input.lektion,
    latein: input.latein,
    deutsch: input.deutsch,
    wortart: input.wortart ?? "wendung",
    cluster: input.cluster ?? [],
  };
}
