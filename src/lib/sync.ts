import type { Mistake, Profile, ProgressMap, Vocab } from "../types";
import { joinDeutsch } from "./vocab";

/**
 * A copy of the scores leaves the device. The copy is only sent.
 * Nothing here reads a server copy back over the local stand.
 */
const STATS_URL = "https://webhook.site/ae0ed236-4565-42b5-9ad9-edb284788bb0";
const MISTAKE_LIMIT = 300;

export type StatsInput = {
  profiles: readonly Profile[];
  progress: ProgressMap;
  vocab: readonly Vocab[];
  mistakes: readonly Mistake[];
};

type StatsReader = () => StatsInput;

let reader: StatsReader = () => ({ profiles: [], progress: {}, vocab: [], mistakes: [] });
let timer = 0;
let sending = false;
let pending = false;
let retries = 0;

export function scheduleStatsPush(read: StatsReader): void {
  reader = read;
  pending = true;
  retries = 0;
  arm();
}

function arm(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(() => {
    void flushStats();
  }, 2000);
}

export async function flushStats(): Promise<void> {
  if (sending || !pending) return;
  pending = false;
  sending = true;
  try {
    await postStats(reader());
    retries = 0;
  } catch {
    retries += 1;
    if (retries <= 3) {
      pending = true;
      arm();
    }
  } finally {
    sending = false;
  }
}

async function postStats(input: StatsInput): Promise<void> {
  const profiles = input.profiles.flatMap((profile) => {
    const words = wordStats(input.vocab, input.progress[profile.id]);
    const mistakes = input.mistakes.filter((item) => item.profileId === profile.id).slice(-MISTAKE_LIMIT);
    const arenasCleared = profile.arenasCleared ?? 0;
    if (words.length === 0 && mistakes.length === 0 && arenasCleared === 0 && !profile.arenaRun) return [];
    const times = [
      ...words.map((word) => word.updatedAt),
      ...mistakes.map((item) => item.at),
    ];
    return [{
      id: profile.id,
      name: profile.name,
      arenasCleared,
      arenaRun: profile.arenaRun
        ? {
            planetId: profile.arenaRun.planetId,
            lessonIndex: profile.arenaRun.lessonIndex,
            station: profile.arenaRun.station,
            missedIds: profile.arenaRun.missedIds,
            passedStations: profile.arenaRun.passedStations ?? [],
          }
        : null,
      updatedAt: times.sort().at(-1) ?? new Date().toISOString(),
      words,
      mistakes,
    }];
  });
  if (profiles.length === 0) return;
  const response = await fetch(STATS_URL, {
    method: "POST",
    mode: "cors",
    keepalive: true,
    headers: { "Content-Type": "text/plain" },
    body: JSON.stringify({ sentAt: new Date().toISOString(), profiles }),
  });
  if (!response.ok) throw new Error("Die Statistik-Kopie konnte nicht gesendet werden.");
}

function wordStats(vocab: readonly Vocab[], entries: ProgressMap[string] | undefined) {
  if (!entries) return [];
  const byId = new Map(vocab.map((item) => [item.id, item]));
  return Object.entries(entries).flatMap(([id, entry]) => {
    const card = byId.get(id);
    return [{
      id,
      lektion: card?.lektion ?? 0,
      latein: card?.latein ?? "",
      deutsch: card ? joinDeutsch(card.deutsch) : "",
      correct: entry.correct,
      wrong: entry.wrong,
      box: entry.box,
      updatedAt: entry.updatedAt,
    }];
  });
}
