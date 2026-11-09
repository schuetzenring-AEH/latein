import { useMemo } from "react";
import { useStore } from "../context/Store";
import { formatPercent } from "../lib/messages";
import { lessonNumbers } from "../lib/vocab";

export function StatsPage() {
  const { vocab, progress, activeProfileId, profiles } = useStore();
  const profile = profiles.find((item) => item.id === activeProfileId);
  const entries = progress[activeProfileId] ?? {};
  const lessons = useMemo(() => lessonNumbers(vocab), [vocab]);

  const rows = lessons.map((lektion) => summarize(vocab.filter((item) => item.lektion === lektion), entries));
  const overall = summarize(vocab, entries);

  if (vocab.length === 0) {
    return (
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Statistik</h1>
        <p className="mt-3 text-stone-600 dark:text-stone-300">Keine Wörter gespeichert.</p>
      </section>
    );
  }

  return (
    <section>
      <h1 className="text-3xl font-semibold tracking-tight">Statistik</h1>
      <p className="mt-2 text-stone-600 dark:text-stone-300">Profil {profile?.name ?? "Unbekannt"}. Der Lernstand bleibt erhalten, wenn du eine Runde verlässt.</p>
      {overall.answered === 0 && (
        <p className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">Noch keine Antworten in diesem Profil.</p>
      )}
      <article className="mt-4 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <h2 className="text-lg font-semibold">Gesamt</h2>
        <StatBody stats={overall} />
      </article>
      <div className="mt-4 grid gap-3">
        {rows.map((stats) => (
          <article key={stats.lektion} className="rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
            <h2 className="text-lg font-semibold">Lektion {stats.lektion}</h2>
            <StatBody stats={stats} />
          </article>
        ))}
      </div>
    </section>
  );
}

type Stats = {
  lektion: number | null;
  words: number;
  correct: number;
  wrong: number;
  answered: number;
  boxes: number[];
};

function summarize(words: { id: string; lektion: number }[], entries: Record<string, { correct: number; wrong: number; box: number } | undefined>): Stats {
  const boxes = [0, 0, 0, 0, 0, 0];
  let correct = 0;
  let wrong = 0;
  for (const word of words) {
    const entry = entries[word.id];
    correct += entry?.correct ?? 0;
    wrong += entry?.wrong ?? 0;
    const box = entry?.box ?? 1;
    if (box >= 1 && box <= 5) boxes[box] += 1;
  }
  return {
    lektion: words[0]?.lektion ?? null,
    words: words.length,
    correct,
    wrong,
    answered: correct + wrong,
    boxes,
  };
}

function StatBody({ stats }: { stats: Stats }) {
  const percent = stats.answered === 0 ? null : stats.correct / stats.answered;
  return (
    <div className="mt-2 text-sm leading-6 text-stone-700 dark:text-stone-300">
      <p>{stats.words} Wörter · {stats.answered} Antworten</p>
      <p>Richtig {stats.correct} · Falsch {stats.wrong} · {formatPercent(percent)}</p>
      <p>Boxen: 1 {stats.boxes[1] ?? 0} · 2 {stats.boxes[2] ?? 0} · 3 {stats.boxes[3] ?? 0} · 4 {stats.boxes[4] ?? 0} · 5 {stats.boxes[5] ?? 0}</p>
    </div>
  );
}
