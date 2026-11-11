import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useStore } from "../context/Store";
import { wordCount } from "../lib/messages";
import { isDue } from "../lib/srs";
import { lessonNumbers, parseLessonInput } from "../lib/vocab";
import type { Direction, Variant } from "../types";
import { Button, cx } from "../components/ui";

export function SetupPage() {
  const { vocab, progress, activeProfileId } = useStore();
  const navigate = useNavigate();
  const lessons = useMemo(() => lessonNumbers(vocab), [vocab]);
  const [lessonText, setLessonText] = useState("");
  const [allOn, setAllOn] = useState(false);
  const [direction, setDirection] = useState<Direction>("l2d");
  const [variant, setVariant] = useState<Variant>("mc");
  const [dueOnly, setDueOnly] = useState(false);

  const parsed = allOn ? null : parseLessonInput(lessonText);
  const requested = allOn ? lessons : parsed && "lessons" in parsed ? parsed.lessons : [];
  const known = useMemo(() => new Set(lessons), [lessons]);
  const missing = requested.filter((lektion) => !known.has(lektion));
  const selected = requested.filter((lektion) => known.has(lektion));

  const selectedWords = vocab.filter((item) => selected.includes(item.lektion));
  const dueWords = selectedWords.filter((item) => isDue(progress[activeProfileId]?.[item.id]));
  const fallback = dueOnly && selectedWords.length > 0 && dueWords.length === 0;
  const roundCount = dueOnly && dueWords.length > 0 ? dueWords.length : selectedWords.length;

  function chooseDirection(next: Direction) {
    setDirection(next);
    setVariant((current) => (current === "space" ? "space" : "mc"));
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
      <p className="mt-2 text-stone-600 dark:text-stone-300">Gib eine Lektionsnummer ein, dann Richtung und Übungsart. Jedes Wort kommt in der Runde einmal.</p>

      <div className="mt-6">
        <div className="mb-2 flex items-center justify-between gap-3">
          <label htmlFor="lektion" className="text-sm font-semibold uppercase tracking-wide text-stone-500">Lektion</label>
          <button
            type="button"
            className={cx(
              "min-h-12 rounded-xl px-3 text-sm font-semibold",
              allOn ? "bg-teal-800 text-white dark:bg-teal-500 dark:text-stone-950" : "bg-white text-stone-900 dark:bg-stone-900 dark:text-stone-100",
            )}
            aria-pressed={allOn}
            onClick={() => {
              setAllOn((current) => !current);
              setLessonText("");
            }}
          >
            Alle
          </button>
        </div>
        <input
          id="lektion"
          type="text"
          inputMode="text"
          autoComplete="off"
          disabled={allOn}
          value={lessonText}
          placeholder="z. B. 12, 3, 12 oder 12-15"
          aria-describedby="lektion-hilfe"
          onChange={(event) => {
            setAllOn(false);
            setLessonText(event.target.value);
          }}
          className="min-h-14 w-full rounded-xl border border-stone-300 bg-white px-3 text-lg font-semibold text-stone-900 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700 disabled:opacity-50 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100"
        />
        <p id="lektion-hilfe" className="mt-2 text-sm text-stone-500 dark:text-stone-400">
          Eine Nummer, mehrere mit Komma oder ein Bereich. Gespeichert sind Vokabeln bis Lektion {lessons.length > 0 ? lessons[lessons.length - 1] : "–"}.
        </p>
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
            Drei Planeten fallen von oben. Das Schiff fängt die richtige Antwort. Asteroiden von oben füllen oder beschädigen die Hülle. Hülle 10, Leben 3.
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

      {!allOn && parsed && "error" in parsed && parsed.error === "empty" && (
        <p className="mt-4 text-sm text-stone-600 dark:text-stone-300">Gib eine Lektionsnummer ein.</p>
      )}
      {!allOn && parsed && "error" in parsed && parsed.error === "invalid" && (
        <p className="mt-4 text-sm text-stone-600 dark:text-stone-300">Bitte eine Nummer eingeben, zum Beispiel 12, 3, 12 oder 12-15.</p>
      )}
      {missing.length > 0 && (
        <p className="mt-4 text-sm text-stone-600 dark:text-stone-300">
          {missing.length === 1
            ? `Zu Lektion ${missing[0]} gibt es keine Vokabeln.`
            : `Zu den Lektionen ${missing.join(", ")} gibt es keine Vokabeln.`}
        </p>
      )}
      {fallback && <p className="mt-4 text-sm text-stone-600 dark:text-stone-300">Nichts fällig. Die Runde nimmt alle Wörter der Auswahl.</p>}
      {dueOnly && dueWords.length > 0 && (
        <p className="mt-4 text-sm text-stone-600 dark:text-stone-300">{wordCount(dueWords.length)} fällig von {wordCount(selectedWords.length)}.</p>
      )}

      <div className="mt-6">
        <Button
          className="w-full"
          disabled={roundCount === 0 || missing.length > 0}
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
