import type { Vocab } from "../types";

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
