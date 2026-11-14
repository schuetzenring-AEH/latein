import type { Direction, Variant, Vocab } from "../types";
import { joinDeutsch } from "./vocab";

export type RoundItem = {
  vocab: Vocab;
  prompt: string;
  promptLang: "la" | "de";
  options: string[] | null;
  answer: string;
  speakText: string | null;
};

const EXTRA_LETTERS = ["a", "e", "i", "n", "r", "s", "t", "x"];

export function shuffle<T>(list: readonly T[]): T[] {
  const copy = list.slice();
  for (let index = copy.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    const current = copy[index];
    const other = copy[swap];
    if (current === undefined || other === undefined) continue;
    copy[index] = other;
    copy[swap] = current;
  }
  return copy;
}

function shown(entry: Vocab, field: "deutsch" | "latein"): string {
  return field === "latein" ? entry.latein : joinDeutsch(entry.deutsch);
}

function takeValues(entries: readonly Vocab[], field: "deutsch" | "latein", blocked: Set<string>, limit: number): string[] {
  const found: string[] = [];
  for (const entry of shuffle(entries)) {
    if (found.length >= limit) break;
    const value = shown(entry, field);
    if (blocked.has(value)) continue;
    blocked.add(value);
    found.push(value);
  }
  return found;
}

export function choiceOptions(
  all: readonly Vocab[],
  selected: readonly Vocab[],
  entry: Vocab,
  field: "deutsch" | "latein",
  count: number,
): string[] {
  const correct = shown(entry, field);
  const blocked = new Set<string>([correct]);
  if (field === "latein") {
    const gloss = joinDeutsch(entry.deutsch);
    for (const item of all) {
      if (joinDeutsch(item.deutsch) === gloss) blocked.add(item.latein);
    }
  }
  const selectedIds = new Set(selected.map((item) => item.id));
  const needed = count - 1;
  const sameArt = (item: Vocab) => item.wortart === entry.wortart && item.id !== entry.id;
  const inSelected = selected.filter((item) => item.id !== entry.id);
  const outside = all.filter((item) => !selectedIds.has(item.id));
  const pools = [
    inSelected.filter(sameArt),
    inSelected.filter((item) => !sameArt(item)),
    outside.filter(sameArt),
    outside.filter((item) => !sameArt(item)),
  ];
  const found: string[] = [];
  for (const pool of pools) {
    if (found.length >= needed) break;
    found.push(...takeValues(pool, field, blocked, needed - found.length));
  }
  const options = shuffle([correct, ...found]);
  if (options.length !== count || new Set(options).size !== count) {
    throw new Error("Zu wenige verschiedene Antworten für diese Auswahl.");
  }
  return options;
}

function typosOf(source: string): { missing: string[]; swapped: string[]; extra: string[] } {
  const chars = [...source];
  const missing: string[] = [];
  const swapped: string[] = [];
  const extra: string[] = [];
  if (chars.length >= 2) {
    for (let index = 0; index < chars.length; index += 1) {
      missing.push(chars.filter((_, charIndex) => charIndex !== index).join(""));
    }
    for (let index = 0; index < chars.length - 1; index += 1) {
      if (chars[index] === chars[index + 1]) continue;
      const copy = chars.slice();
      const left = copy[index];
      const right = copy[index + 1];
      if (left === undefined || right === undefined) continue;
      copy[index] = right;
      copy[index + 1] = left;
      swapped.push(copy.join(""));
    }
  }
  for (const letter of EXTRA_LETTERS) {
    extra.push(`${source}${letter}`, `${letter}${source}`);
    const copy = chars.slice();
    copy.splice(Math.min(1, copy.length), 0, letter);
    extra.push(copy.join(""));
  }
  return { missing, swapped, extra };
}

export function spellingOptions(source: string, forbidden: Set<string>): string[] {
  const groups = typosOf(source);
  const pools = shuffle([groups.missing, groups.swapped, groups.extra]);
  const picked: string[] = [];
  const used = new Set<string>();
  const accept = (candidate: string) => {
    if (!candidate || candidate === source || forbidden.has(candidate) || used.has(candidate)) return false;
    used.add(candidate);
    picked.push(candidate);
    return true;
  };
  for (const pool of pools) {
    if (picked.length >= 2) break;
    for (const candidate of shuffle(pool)) {
      if (accept(candidate)) break;
    }
  }
  for (const pool of [groups.missing, groups.swapped, groups.extra]) {
    if (picked.length >= 2) break;
    for (const candidate of pool) {
      if (picked.length >= 2) break;
      accept(candidate);
    }
  }
  let suffix = 1;
  while (picked.length < 2 && suffix < 8) {
    accept(`${source}${"x".repeat(suffix)}`);
    suffix += 1;
  }
  if (picked.length < 2) accept(`${source} (falsch)`);
  if (picked.length < 2) accept(`${source} (auch falsch)`);
  const first = picked[0];
  const second = picked[1];
  if (!first || !second) throw new Error("Die Schreibweisen konnten nicht erzeugt werden.");
  const options = shuffle([source, first, second]);
  if (new Set(options).size !== 3 || !options.includes(source)) {
    throw new Error("Die Schreibweisen konnten nicht erzeugt werden.");
  }
  return options;
}

export function buildSpaceRound(
  all: readonly Vocab[],
  asked: readonly Vocab[],
  pool: readonly Vocab[],
  direction: Direction,
): RoundItem[] {
  const field = direction === "l2d" ? "deutsch" : "latein";
  return asked.map((vocab) => ({
    vocab,
    prompt: direction === "l2d" ? vocab.latein : joinDeutsch(vocab.deutsch),
    promptLang: direction === "l2d" ? "la" : "de",
    options: choiceOptions(all, pool, vocab, field, 3),
    answer: shown(vocab, field),
    speakText: direction === "l2d" ? vocab.latein : null,
  }));
}

export function buildRound(
  all: readonly Vocab[],
  words: readonly Vocab[],
  direction: Direction,
  variant: Variant,
): RoundItem[] {
  if (variant === "space") return buildSpaceRound(all, words, words, direction);
  const latinForms = new Set(all.map((item) => item.latein));
  return words.map((vocab) => {
    if (direction === "l2d" && variant === "mc") {
      return {
        vocab,
        prompt: vocab.latein,
        promptLang: "la" as const,
        options: choiceOptions(all, words, vocab, "deutsch", 5),
        answer: joinDeutsch(vocab.deutsch),
        speakText: vocab.latein,
      };
    }
    if (direction === "l2d" && variant === "input") {
      return {
        vocab,
        prompt: vocab.latein,
        promptLang: "la" as const,
        options: null,
        answer: joinDeutsch(vocab.deutsch),
        speakText: vocab.latein,
      };
    }
    if (direction === "d2l" && variant === "mc") {
      return {
        vocab,
        prompt: joinDeutsch(vocab.deutsch),
        promptLang: "de" as const,
        options: choiceOptions(all, words, vocab, "latein", 3),
        answer: vocab.latein,
        speakText: null,
      };
    }
    return {
      vocab,
      prompt: joinDeutsch(vocab.deutsch),
      promptLang: "de" as const,
      options: spellingOptions(vocab.latein, latinForms),
      answer: vocab.latein,
      speakText: null,
    };
  });
}
