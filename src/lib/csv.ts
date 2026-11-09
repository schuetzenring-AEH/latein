import type { VocabInput } from "../types";

export type CsvResult = {
  rows: VocabInput[];
  skipped: number;
  empty: boolean;
};

export function parseCsv(text: string): CsvResult {
  const lines = text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  if (lines.length === 0) return { rows: [], skipped: 0, empty: true };

  let start = 0;
  const first = lines[0]?.toLowerCase().replace(/\s+/g, "") ?? "";
  if (first === "lektion;latein;deutsch") start = 1;

  const rows: VocabInput[] = [];
  let skipped = 0;
  for (const line of lines.slice(start)) {
    const parts = line.split(";");
    if (parts.length < 3) {
      skipped += 1;
      continue;
    }
    const lektion = Number(parts[0]?.trim());
    const latein = parts[1]?.trim() ?? "";
    const deutsch = parts.slice(2).join(";").trim();
    if (!Number.isInteger(lektion) || lektion < 1 || !latein || !deutsch) {
      skipped += 1;
      continue;
    }
    rows.push({ lektion, latein, deutsch });
  }
  return { rows, skipped, empty: false };
}
