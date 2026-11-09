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

export function matchesGloss(typed: string, gloss: string): boolean {
  const input = typed.trim().toLowerCase();
  if (!input) return false;
  const targets = [gloss, ...gloss.split(/[,;/]/).map((part) => part.trim())];
  const seen = new Set<string>();
  for (const target of targets) {
    const expected = target.trim().toLowerCase();
    if (!expected || seen.has(expected)) continue;
    seen.add(expected);
    if (withinTolerance(input, expected)) return true;
  }
  return false;
}
