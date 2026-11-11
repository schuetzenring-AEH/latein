import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../context/Store";
import { wordCount } from "../lib/messages";
import { isDue } from "../lib/srs";
import { lessonNumbers } from "../lib/vocab";
import type { Direction, Variant } from "../types";
import { Button, cx } from "../components/ui";

export function SetupPage() {
  const { vocab, progress, activeProfileId } = useStore();
  const navigate = useNavigate();
  const lessons = useMemo(() => lessonNumbers(vocab), [vocab]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [direction, setDirection] = useState<Direction>("l2d");
  const [variant, setVariant] = useState<Variant>("mc");
  const [dueOnly, setDueOnly] = useState(false);

  const counts = useMemo(() => {
    const map = new Map<number, number>();
    for (const item of vocab) map.set(item.lektion, (map.get(item.lektion) ?? 0) + 1);
    return map;
  }, [vocab]);

  const selectedWords = vocab.filter((item) => selected.has(item.lektion));
  const dueWords = selectedWords.filter((item) => isDue(progress[activeProfileId]?.[item.id]));
  const fallback = dueOnly && selectedWords.length > 0 && dueWords.length === 0;
  const roundCount = dueOnly && dueWords.length > 0 ? dueWords.length : selectedWords.length;
  const allOn = lessons.length > 0 && selected.size === lessons.length;

  function chooseDirection(next: Direction) {
    setDirection(next);
    setVariant((current) => (current === "space" ? "space" : "mc"));
  }

  function toggleLesson(lektion: number) {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(lektion)) next.delete(lektion);
      else next.add(lektion);
      return next;
    });
  }

  if (vocab.length === 0) {
    return (
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Latein üben</h1>
        <p className="mt-3 text-stone-600 dark:text-stone-300">Keine Wörter gespeichert. Lege welche an oder lade die Beispieldaten neu.</p>
      </section>
    );
  }

  return (
    <section>
      <h1 className="text-3xl font-semibold tracking-tight">Latein üben</h1>
      <p className="mt-2 text-stone-600 dark:text-stone-300">Wähle Lektionen, Richtung und Übungsart. Jedes Wort kommt in der Runde einmal.</p>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-stone-500">Lektionen</h2>
          <button
            type="button"
            className={cx(
              "min-h-12 rounded-xl px-3 text-sm font-semibold",
              allOn ? "bg-teal-800 text-white dark:bg-teal-500 dark:text-stone-950" : "bg-white text-stone-900 dark:bg-stone-900 dark:text-stone-100",
            )}
            aria-pressed={allOn}
            onClick={() => setSelected(allOn ? new Set() : new Set(lessons))}
          >
            Alle
          </button>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-3" role="group" aria-label="Lektionen">
          {lessons.map((lektion) => {
            const on = selected.has(lektion);
            return (
              <button
                key={lektion}
                type="button"
                aria-pressed={on}
                onClick={() => toggleLesson(lektion)}
                className={cx(
                  "flex min-h-16 flex-col items-start justify-center rounded-xl border px-3 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700",
                  on
                    ? "border-teal-800 bg-teal-800 text-white dark:border-teal-500 dark:bg-teal-600 dark:text-stone-950"
                    : "border-stone-300 bg-white text-stone-900 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100",
                )}
              >
                <span className="font-semibold">Lektion {lektion}</span>
                <span className={cx("text-sm", on ? "text-white/80 dark:text-stone-950/70" : "text-stone-500 dark:text-stone-400")}>
                  {counts.get(lektion) ?? 0}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <fieldset className="mt-6">
        <legend className="text-sm font-semibold uppercase tracking-wide text-stone-500">Richtung</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Radio name="direction" checked={direction === "l2d"} onChange={() => chooseDirection("l2d")} label="Latein → Deutsch" />
          <Radio name="direction" checked={direction === "d2l"} onChange={() => chooseDirection("d2l")} label="Deutsch → Latein" />
        </div>
      </fieldset>

      <fieldset className="mt-6">
        <legend className="text-sm font-semibold uppercase tracking-wide text-stone-500">Art</legend>
        <div className="mt-2 grid gap-2 sm:grid-cols-2">
          <Radio name="variant" checked={variant === "mc"} onChange={() => setVariant("mc")} label="Multiple Choice" />
          {direction === "l2d" ? (
            <Radio name="variant" checked={variant === "input"} onChange={() => setVariant("input")} label="Freie Eingabe" />
          ) : (
            <Radio name="variant" checked={variant === "spelling"} onChange={() => setVariant("spelling")} label="Richtige Schreibweise" />
          )}
          <Radio name="variant" checked={variant === "space"} onChange={() => setVariant("space")} label="Weltraum" />
        </div>
        {variant === "space" && (
          <p className="mt-2 text-sm text-stone-600 dark:text-stone-300">
            Schiff lenken, Asteroiden abschießen und die richtige Blase treffen. Hülle 10, Leben 3.
          </p>
        )}
      </fieldset>

      <label className="mt-6 flex min-h-12 items-center gap-3 rounded-xl border border-stone-300 bg-white px-3 dark:border-stone-700 dark:bg-stone-900">
        <input
          type="checkbox"
          className="size-5"
          checked={dueOnly}
          onChange={(event) => setDueOnly(event.target.checked)}
        />
        <span>
          <span className="font-semibold">Nur fällige</span>
          <span className="mt-0.5 block text-sm text-stone-500 dark:text-stone-400">Neue Wörter und fällige Wiederholungen. Sonst die ganze Auswahl.</span>
        </span>
      </label>

      {selected.size === 0 && <p className="mt-4 text-sm text-stone-600 dark:text-stone-300">Wähle mindestens eine Lektion.</p>}
      {fallback && <p className="mt-4 text-sm text-stone-600 dark:text-stone-300">Nichts fällig. Die Runde nimmt alle Wörter der Auswahl.</p>}
      {dueOnly && dueWords.length > 0 && (
        <p className="mt-4 text-sm text-stone-600 dark:text-stone-300">{wordCount(dueWords.length)} fällig von {wordCount(selectedWords.length)}.</p>
      )}

      <div className="mt-6">
        <Button
          className="w-full"
          disabled={roundCount === 0}
          onClick={() => navigate(variant === "space" ? "/weltraum" : "/quiz", {
            state: {
              lektionIds: [...selected].sort((a, b) => a - b),
              direction,
              variant,
              dueOnly,
              nonce: Date.now(),
            },
          })}
        >
          {roundCount === 0 ? "Starten" : `Starten · ${wordCount(roundCount)}`}
        </Button>
      </div>
    </section>
  );
}

function Radio({ name, checked, onChange, label }: { name: string; checked: boolean; onChange: () => void; label: string }) {
  return (
    <label className={cx(
      "flex min-h-12 cursor-pointer items-center gap-3 rounded-xl border px-3",
      checked
        ? "border-teal-800 bg-teal-50 dark:border-teal-400 dark:bg-teal-950"
        : "border-stone-300 bg-white dark:border-stone-700 dark:bg-stone-900",
    )}>
      <input type="radio" name={name} checked={checked} onChange={onChange} className="size-5" />
      <span className="font-semibold">{label}</span>
    </label>
  );
}
