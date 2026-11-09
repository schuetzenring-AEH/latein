export function streakMessage(streak: number): string | null {
  if (streak === 3) return "Drei richtig hintereinander.";
  if (streak === 5) return "Fünf in Folge.";
  if (streak >= 10 && streak % 5 === 0) return `${streak} richtig hintereinander.`;
  return null;
}

export function endMessage(correct: number, total: number): string {
  if (total === 0) return "Keine Wörter in dieser Runde.";
  const ratio = correct / total;
  if (ratio === 1) return "Alles richtig.";
  if (ratio >= 0.8) return "Gut gelernt.";
  if (ratio >= 0.5) return "Solide Runde.";
  return "Weiterüben lohnt sich.";
}

export function formatPercent(value: number | null): string {
  if (value === null) return "–";
  return new Intl.NumberFormat("de-DE", { style: "percent", maximumFractionDigits: 0 }).format(value);
}

export function wordCount(count: number): string {
  return count === 1 ? "1 Wort" : `${count} Wörter`;
}
