import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useStore } from "../context/Store";
import { buildRound, type RoundItem } from "../lib/quiz";
import { endMessage, streakMessage } from "../lib/messages";
import { isDue } from "../lib/srs";
import { canSpeak, speakLatin } from "../lib/speech";
import { matchesGloss } from "../lib/text";
import type { Direction, ProgressMap, RoundSetup, Variant, Vocab } from "../types";
import { Button, cx } from "../components/ui";

type SetupState = RoundSetup & { nonce?: number };

function readSetup(state: unknown): SetupState | null {
  if (!state || typeof state !== "object") return null;
  const value = state as Partial<SetupState>;
  if (!Array.isArray(value.lektionIds) || value.lektionIds.some((id) => typeof id !== "number")) return null;
  if (value.lektionIds.length === 0) return null;
  if (value.direction !== "l2d" && value.direction !== "d2l") return null;
  if (value.variant !== "mc" && value.variant !== "input" && value.variant !== "spelling") return null;
  if (value.direction === "l2d" && value.variant === "spelling") return null;
  if (value.direction === "d2l" && value.variant === "input") return null;
  return {
    lektionIds: value.lektionIds,
    direction: value.direction,
    variant: value.variant,
    dueOnly: Boolean(value.dueOnly),
    nonce: typeof value.nonce === "number" ? value.nonce : 0,
  };
}

export function QuizPage() {
  const location = useLocation();
  const setup = readSetup(location.state);
  if (!setup) {
    return (
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Keine Runde</h1>
        <p className="mt-3 text-stone-600 dark:text-stone-300">Wähle zuerst Lektionen und eine Übungsart.</p>
        <Link to="/" className="mt-6 inline-flex min-h-12 items-center font-semibold text-teal-800 underline dark:text-teal-300">Zur Auswahl</Link>
      </section>
    );
  }
  return <Round key={`${setup.nonce}-${setup.direction}-${setup.variant}-${setup.lektionIds.join("-")}`} setup={setup} />;
}

function Round({ setup }: { setup: SetupState }) {
  const { vocab, progress, activeProfileId, recordAnswer } = useStore();
  const navigate = useNavigate();
  const profileId = useRef(activeProfileId);
  const built = useState(() => prepareRound(vocab, progress[profileId.current] ?? {}, setup))[0];
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState<"question" | "feedback" | "done">("question");
  const [picked, setPicked] = useState<string | null>(null);
  const [typed, setTyped] = useState("");
  const [wasCorrect, setWasCorrect] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [answered, setAnswered] = useState(0);
  const [streak, setStreak] = useState(0);
  const [cheer, setCheer] = useState<string | null>(null);
  const lock = useRef(false);

  const item = built.items[index];
  const total = built.items.length;

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target;
      const typing = target instanceof HTMLElement && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT");
      if (event.key === "Enter" && phase === "feedback") {
        event.preventDefault();
        goNext();
        return;
      }
      const options = item?.options;
      if (typing || phase !== "question" || !options) return;
      if (!/^[1-9]$/.test(event.key)) return;
      const option = options[Number(event.key) - 1];
      if (!option) return;
      event.preventDefault();
      settle(option, option === item.answer);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  function settle(value: string, correct: boolean) {
    if (!item || lock.current || phase !== "question") return;
    lock.current = true;
    recordAnswer(profileId.current, item.vocab.id, correct);
    const nextStreak = correct ? streak + 1 : 0;
    setPicked(value);
    setWasCorrect(correct);
    setAnswered((count) => count + 1);
    setCorrectCount((count) => count + (correct ? 1 : 0));
    setStreak(nextStreak);
    setCheer(correct ? streakMessage(nextStreak) : null);
    setPhase("feedback");
  }

  function goNext() {
    if (phase !== "feedback") return;
    if (index + 1 >= total) {
      setPhase("done");
      lock.current = false;
      window.scrollTo(0, 0);
      return;
    }
    lock.current = false;
    setIndex((current) => current + 1);
    setPhase("question");
    setPicked(null);
    setTyped("");
    setCheer(null);
    window.scrollTo(0, 0);
  }

  if (built.error || !item && phase !== "done") {
    return (
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Runde nicht möglich</h1>
        <p className="mt-3 text-stone-600 dark:text-stone-300">{built.error ?? "Keine Wörter in dieser Auswahl."}</p>
        <Link to="/" className="mt-6 inline-flex min-h-12 items-center font-semibold text-teal-800 underline dark:text-teal-300">Zur Auswahl</Link>
      </section>
    );
  }

  if (phase === "done") {
    return (
      <section>
        <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">Runde beendet</p>
        <h1 className="mt-2 text-4xl font-semibold tracking-tight">{correctCount} von {total} richtig.</h1>
        <p className="mt-3 text-lg text-stone-600 dark:text-stone-300">{endMessage(correctCount, total)}</p>
        <div className="mt-8 grid gap-3">
          <Button onClick={() => navigate("/quiz", { replace: true, state: { ...setup, nonce: Date.now() } })}>Nochmal</Button>
          <Button variant="secondary" onClick={() => navigate("/")}>Zur Auswahl</Button>
        </div>
      </section>
    );
  }

  if (!item) return null;
  const showSpeak = canSpeak() && (item.speakText || (phase === "feedback" && item.promptLang === "de"));
  const spoken = item.speakText ?? item.answer;

  return (
    <section>
      {built.fellBack && (
        <p className="mb-4 text-sm text-stone-600 dark:text-stone-300">Keine Wörter fällig. Diese Runde enthält alle Wörter der Auswahl.</p>
      )}
      <div className="flex items-baseline justify-between gap-3 text-sm font-semibold">
        <span>{index + 1} / {total}</span>
        <span className="text-stone-500 dark:text-stone-400">Richtig {correctCount} / {answered}</span>
      </div>
      <div
        className="mt-2 h-2 overflow-hidden rounded-full bg-stone-200 dark:bg-stone-800"
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={index + 1}
        aria-label={`Frage ${index + 1} von ${total}`}
      >
        <div className="h-full rounded-full bg-teal-800 dark:bg-teal-400" style={{ width: `${((index + 1) / total) * 100}%` }} />
      </div>
      <p className="mt-4 text-sm text-stone-500 dark:text-stone-400">Lektion {item.vocab.lektion} · {directionLabel(setup.direction)} · {variantLabel(setup.variant)}</p>
      <div className="mt-3 flex items-start justify-between gap-3 rounded-2xl border border-stone-200 bg-white p-4 dark:border-stone-800 dark:bg-stone-900">
        <p lang={item.promptLang} className="min-w-0 flex-1 text-3xl font-semibold tracking-tight [overflow-wrap:anywhere]">{item.prompt}</p>
        {showSpeak && (
          <button
            type="button"
            className="inline-flex min-h-12 shrink-0 items-center rounded-xl border border-stone-300 px-3 text-sm font-semibold dark:border-stone-700"
            onClick={() => speakLatin(spoken)}
          >
            Vorlesen
          </button>
        )}
      </div>
      {item.options ? (
        <div className="mt-4 grid gap-2" role="group" aria-label="Antworten">
          {item.options.map((option, optionIndex) => {
            const correctOption = phase === "feedback" && option === item.answer;
            const wrongOption = phase === "feedback" && option === picked && option !== item.answer;
            const dim = phase === "feedback" && !correctOption && !wrongOption;
            return (
              <button
                key={option}
                type="button"
                disabled={phase !== "question"}
                onClick={() => settle(option, option === item.answer)}
                className={cx(
                  "flex min-h-12 w-full items-center gap-3 rounded-xl border px-3 py-3 text-left text-base disabled:opacity-100 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-teal-700",
                  correctOption && "border-emerald-800 bg-emerald-700 text-white",
                  wrongOption && "border-red-800 bg-red-700 text-white",
                  dim && "border-stone-200 bg-white text-stone-500 opacity-60 dark:border-stone-800 dark:bg-stone-900",
                  !correctOption && !wrongOption && !dim && "border-stone-300 bg-white text-stone-900 hover:border-teal-700 dark:border-stone-700 dark:bg-stone-900 dark:text-stone-100",
                )}
              >
                <span className="w-6 shrink-0 text-sm font-semibold" aria-hidden="true">{optionIndex + 1}</span>
                <span lang={item.promptLang === "la" ? "de" : "la"} className="min-w-0 flex-1 [overflow-wrap:anywhere]">{option}</span>
                {correctOption && <span className="shrink-0 text-sm font-semibold">Richtig</span>}
                {wrongOption && <span className="shrink-0 text-sm font-semibold">Falsch</span>}
              </button>
            );
          })}
          <p className="text-sm text-stone-500 dark:text-stone-400">Taste 1 bis {item.options.length} wählt, Enter geht weiter.</p>
        </div>
      ) : (
        <form
          className="mt-4 grid gap-3"
          onSubmit={(event) => {
            event.preventDefault();
            settle(typed, matchesGloss(typed, item.answer));
          }}
        >
          <label htmlFor="answer" className="text-sm font-medium">Deine Antwort</label>
          <input
            id="answer"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            disabled={phase !== "question"}
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            className="min-h-12 w-full rounded-xl border border-stone-300 bg-white px-3 dark:border-stone-700 dark:bg-stone-950"
          />
          {phase === "question" && <Button type="submit">Prüfen</Button>}
          <p className="text-sm text-stone-500 dark:text-stone-400">Enter prüft die Antwort.</p>
        </form>
      )}
      {phase === "feedback" && (
        <div className="mt-4" role="status">
          <p className={cx("text-lg font-semibold", wasCorrect ? "text-emerald-800 dark:text-emerald-300" : "text-red-800 dark:text-red-300")}>
            {wasCorrect ? "Richtig." : "Falsch."}
            {cheer ? ` ${cheer}` : ""}
          </p>
          {setup.variant === "input" && (
            <p className="mt-2 [overflow-wrap:anywhere]"><span className="font-semibold">Lösung: </span>{item.answer}</p>
          )}
          <Button className="mt-4 w-full" onClick={goNext}>Weiter</Button>
        </div>
      )}
    </section>
  );
}

function prepareRound(vocab: Vocab[], profileProgress: ProgressMap[string] | undefined, setup: RoundSetup) {
  try {
    const selected = vocab.filter((item) => setup.lektionIds.includes(item.lektion));
    const due = selected.filter((item) => isDue(profileProgress?.[item.id]));
    const fellBack = setup.dueOnly && due.length === 0;
    const words = shuffleWords(setup.dueOnly && due.length > 0 ? due : selected);
    if (words.length === 0) return { items: [] as RoundItem[], fellBack, error: "Keine Wörter in dieser Auswahl." };
    return { items: buildRound(vocab, words, setup.direction, setup.variant), fellBack, error: null as string | null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Die Runde konnte nicht erstellt werden.";
    return { items: [] as RoundItem[], fellBack: false, error: message };
  }
}

function shuffleWords<T>(list: readonly T[]): T[] {
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

function directionLabel(direction: Direction): string {
  return direction === "l2d" ? "Latein → Deutsch" : "Deutsch → Latein";
}

function variantLabel(variant: Variant): string {
  if (variant === "input") return "Freie Eingabe";
  if (variant === "spelling") return "Richtige Schreibweise";
  return "Multiple Choice";
}
