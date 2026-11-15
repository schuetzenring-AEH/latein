export function levenshtein(a: string, b: string): number {
  const left = [...a];
  const right = [...b];
  const width = right.length;
  if (left.length === 0) return width;
  if (width === 0) return left.length;
  let previous = Array.from({ length: width + 1 }, (_, index) => index);
  for (let i = 1; i <= left.length; i += 1) {
    const current = [i];
    for (let j = 1; j <= width; j += 1) {
      const cost = left[i - 1] === right[j - 1] ? 0 : 1;
      current[j] = Math.min(current[j - 1] + 1, previous[j] + 1, previous[j - 1] + cost);
    }
    previous = current;
  }
  return previous[width];
}

function withinTolerance(typed: string, expected: string): boolean {
  const distance = levenshtein(typed, expected);
  if (distance === 0) return true;
  const length = [...expected].length;
  if (distance === 1 && length >= 5) return true;
  if (distance === 2 && length >= 12) return true;
  return false;
}

function foldGloss(text: string): string {
  return text
    .replace(/\([^)]*\)/g, " ")
    .replace(/[„“”«»"']/g, " ")
    .replace(/\b(der|die|das)\b/gi, " ")
    .toLowerCase()
    .replace(/ä/g, "ae")
    .replace(/ö/g, "oe")
    .replace(/ü/g, "ue")
    .replace(/ß/g, "ss")
    .replace(/[^a-z\s-]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function sortedWords(text: string): string {
  return text.split(" ").filter(Boolean).sort().join(" ");
}

function tokens(text: string): string[] {
  return text.split(" ").filter(Boolean);
}

/** Pronouns in a gloss ("sie sind", "es gibt") are optional. The word itself still counts. */
const OPTIONAL_PRONOUN = new Set(["er", "sie", "es", "ich", "du", "wir", "ihr"]);

function meaningful(words: readonly string[]): string[] {
  const rest = words.filter((word) => !OPTIONAL_PRONOUN.has(word));
  return rest.length > 0 ? rest : [...words];
}

function sameWord(typed: string, expected: string): boolean {
  return withinTolerance(typed, expected);
}

/** True when every meaningful word of one meaning appears in the answer. */
function containsMeaning(typedWords: readonly string[], meaning: string): boolean {
  return meaningful(tokens(meaning)).every((want) => typedWords.some((got) => sameWord(got, want)));
}

export function matchesGloss(typed: string, gloss: string): boolean {
  const input = foldGloss(typed);
  if (!input) return false;
  const stripped = gloss.replace(/\([^)]*\)/g, " ");
  const pieces = [stripped, ...stripped.split(/[,;/!?…:.]+/)]
    .map((piece) => foldGloss(piece))
    .filter((piece, index, all) => piece.length > 0 && all.indexOf(piece) === index);
  const typedWords = tokens(input);
  for (const expected of pieces) {
    if (withinTolerance(input, expected) || withinTolerance(sortedWords(input), sortedWords(expected))) return true;
  }
  const glossWords = tokens(pieces[0] ?? "");
  if (!typedWords.every((word) => glossWords.some((want) => sameWord(word, want)))) return false;
  return pieces.some((piece) => containsMeaning(typedWords, piece));
}
