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

export function matchesGloss(typed: string, gloss: string): boolean {
  const input = foldGloss(typed);
  if (!input) return false;
  const stripped = gloss.replace(/\([^)]*\)/g, " ");
  const pieces = [stripped, ...stripped.split(/[,;/!?…:.]+/)];
  const seen = new Set<string>();
  for (const piece of pieces) {
    const expected = foldGloss(piece);
    if (!expected || seen.has(expected)) continue;
    seen.add(expected);
    if (withinTolerance(input, expected) || withinTolerance(sortedWords(input), sortedWords(expected))) return true;
  }
  return false;
}
