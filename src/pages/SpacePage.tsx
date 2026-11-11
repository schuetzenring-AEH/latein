import { memo, useEffect, useRef, useState, type RefObject } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button, cx } from "../components/ui";
import { useStore } from "../context/Store";
import { buildSpaceRound, shuffle } from "../lib/quiz";
import { isDue } from "../lib/srs";
import { canSpeak, speakText } from "../lib/speech";
import type { ProgressEntry, RoundSetup, Vocab } from "../types";
import { HULL_MAX, LIVES_MAX, startWeltraum, type SpaceBeat, type SpaceHud, type SpaceItem } from "../lib/weltraum";

type SetupState = RoundSetup & { nonce?: number };

const FieldOverlay = memo(function FieldOverlay({ hostRef }: { hostRef: RefObject<HTMLDivElement | null> }) {
  return <div ref={hostRef} className="pointer-events-none absolute inset-0 overflow-hidden" />;
});

function readSetup(state: unknown): SetupState | null {
  if (!state || typeof state !== "object") return null;
  const value = state as Partial<SetupState>;
  if (!Array.isArray(value.lektionIds) || value.lektionIds.some((id) => typeof id !== "number")) return null;
  if (value.lektionIds.length === 0) return null;
  if (value.direction !== "l2d" && value.direction !== "d2l") return null;
  if (value.variant !== "space") return null;
  return {
    lektionIds: value.lektionIds,
    direction: value.direction,
    variant: "space",
    dueOnly: Boolean(value.dueOnly),
    nonce: typeof value.nonce === "number" ? value.nonce : 0,
  };
}

function prepareSpace(vocab: readonly Vocab[], profileProgress: Record<string, ProgressEntry> | undefined, setup: RoundSetup) {
  try {
    const inLessons = vocab.filter((item) => setup.lektionIds.includes(item.lektion));
    const due = inLessons.filter((item) => isDue(profileProgress?.[item.id]));
    const fellBack = setup.dueOnly && inLessons.length > 0 && due.length === 0;
    const asked = shuffle(setup.dueOnly && due.length > 0 ? due : inLessons);
    if (asked.length === 0) return { items: [] as SpaceItem[], fellBack, error: "Keine Wörter in dieser Auswahl." };
    const items = buildSpaceRound(vocab, asked, inLessons, setup.direction).map((item) => {
      const options = item.options ?? [];
      if (options.length !== 3 || new Set(options).size !== 3 || !options.includes(item.answer)) {
        throw new Error("Zu wenige verschiedene Antworten für diese Auswahl.");
      }
      return {
        vocabId: item.vocab.id,
        prompt: item.prompt,
        promptLang: item.promptLang,
        answer: item.answer,
        options,
      } satisfies SpaceItem;
    });
    return { items, fellBack, error: null as string | null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Die Runde konnte nicht erstellt werden.";
    return { items: [] as SpaceItem[], fellBack: false, error: message };
  }
}

export function SpacePage() {
  const location = useLocation();
  const setup = readSetup(location.state);
  if (!setup) {
    return (
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Keine Runde</h1>
        <p className="mt-3 text-stone-600 dark:text-stone-300">Wähle zuerst Lektionen und die Richtung. Danach startet Weltraum.</p>
        <Link to="/" className="mt-6 inline-flex min-h-12 items-center font-semibold text-teal-800 underline dark:text-teal-300">Zur Auswahl</Link>
      </section>
    );
  }
  return <SpaceRound key={`${setup.nonce}-${setup.direction}-${setup.dueOnly ? "due" : "all"}-${setup.lektionIds.join("-")}`} setup={setup} />;
}

function SpaceRound({ setup }: { setup: SetupState }) {
  const { vocab, progress, activeProfileId } = useStore();
  const profileId = useRef(activeProfileId);
  const built = useState(() => prepareSpace(vocab, progress[profileId.current], setup))[0];
  const [end, setEnd] = useState<SpaceHud | null>(null);

  if (built.error || built.items.length === 0) {
    return (
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Runde nicht möglich</h1>
        <p className="mt-3 text-stone-600 dark:text-stone-300">{built.error ?? "Keine Wörter in dieser Auswahl."}</p>
        <Link to="/" className="mt-6 inline-flex min-h-12 items-center font-semibold text-teal-800 underline dark:text-teal-300">Zur Auswahl</Link>
      </section>
    );
  }

  if (end) return <Result end={end} total={built.items.length} setup={setup} />;
  return <Play items={built.items} fellBack={built.fellBack} profileId={profileId.current} onEnd={setEnd} />;
}

function Play({
  items,
  fellBack,
  profileId,
  onEnd,
}: {
  items: readonly SpaceItem[];
  fellBack: boolean;
  profileId: string;
  onEnd: (hud: SpaceHud) => void;
}) {
  const { recordAnswer } = useStore();
  const recordRef = useRef(recordAnswer);
  const profileRef = useRef(profileId);
  const fieldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLDivElement>(null);
  const [hud, setHud] = useState<SpaceHud>({ hull: HULL_MAX, lives: LIVES_MAX, correct: 0, wrong: 0 });
  const [beat, setBeat] = useState<SpaceBeat>({
    id: 0,
    mode: "drift",
    prompt: null,
    promptLang: null,
    outcome: null,
    reveal: null,
  });
  recordRef.current = recordAnswer;
  profileRef.current = profileId;

  useEffect(() => {
    const field = fieldRef.current;
    const canvas = canvasRef.current;
    const overlay = overlayRef.current;
    if (!field || !canvas || !overlay) return;
    return startWeltraum({
      field,
      canvas,
      overlay,
      items,
      onHud: setHud,
      onBeat: setBeat,
      onAnswer: (vocabId, correct) => recordRef.current(profileRef.current, vocabId, correct),
      onEnd,
    });
  }, [items, onEnd]);

  useEffect(() => {
    if (beat.mode === "ask" && beat.prompt && beat.promptLang) speakText(beat.prompt, beat.promptLang);
  }, [beat.id, beat.mode, beat.prompt, beat.promptLang]);

  useEffect(() => () => {
    if (canSpeak()) window.speechSynthesis.cancel();
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      {fellBack && (
        <p className="mb-2 text-sm text-stone-600 dark:text-stone-300">Keine Wörter fällig. Diese Runde enthält alle Wörter der Auswahl.</p>
      )}
      <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-[#070b16] text-white">
        <Hud hud={hud} />
        <Prompt beat={beat} />
        <div
          ref={fieldRef}
          className="relative min-h-48 flex-1 touch-none select-none overflow-hidden"
          aria-label="Spielfeld"
        >
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 block h-full w-full" aria-hidden="true" />
          <FieldOverlay hostRef={overlayRef} />
        </div>
      </div>
    </div>
  );
}

function Hud({ hud }: { hud: SpaceHud }) {
  return (
    <div className="grid shrink-0 gap-2 px-3 pt-3">
      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-sm font-semibold">Hülle</span>
        <div
          className="flex h-3 min-w-0 flex-1 gap-0.5"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={HULL_MAX}
          aria-valuenow={hud.hull}
          aria-label={`Hülle ${hud.hull} von ${HULL_MAX}`}
        >
          {Array.from({ length: HULL_MAX }, (_, index) => (
            <span key={index} className={cx("h-full min-w-0 flex-1 rounded-sm", index < hud.hull ? "bg-sky-400" : "bg-white/15")} />
          ))}
        </div>
        <span className="w-6 text-right text-sm font-semibold tabular-nums">{hud.hull}</span>
      </div>
      <div className="flex items-center gap-2">
        <span className="w-14 shrink-0 text-sm font-semibold">Leben</span>
        <div
          className="flex gap-1.5"
          role="meter"
          aria-valuemin={0}
          aria-valuemax={LIVES_MAX}
          aria-valuenow={hud.lives}
          aria-label={`Leben ${hud.lives} von ${LIVES_MAX}`}
        >
          {Array.from({ length: LIVES_MAX }, (_, index) => (
            <span key={index} className={cx("size-4 rounded-full", index < hud.lives ? "bg-rose-400" : "bg-white/15")} />
          ))}
        </div>
        <span className="text-sm font-semibold tabular-nums">{hud.lives}</span>
        <p className="ml-auto text-right">
          <span className="block text-xs font-semibold text-white/75">Richtige Vokabeln</span>
          <span className="text-lg font-semibold tabular-nums leading-none">{hud.correct}</span>
        </p>
      </div>
    </div>
  );
}

function Prompt({ beat }: { beat: SpaceBeat }) {
  if (beat.mode === "drift" || !beat.prompt) {
    return (
      <div className="shrink-0 px-3 pb-2 pt-2 text-center">
        <p className="text-base font-semibold text-sky-100">Weiche den Asteroiden aus.</p>
        <p className="mt-1 text-sm text-sky-100/80">Ziehen lenkt. Kurzes Tippen schießt.</p>
      </div>
    );
  }
  return (
    <div className="shrink-0 px-3 pb-2 pt-2" aria-live="polite">
      <p
        lang={beat.promptLang === "la" ? "la" : "de"}
        className="rounded-2xl bg-white px-3 py-2 text-center text-[1.65rem] font-semibold leading-tight text-slate-950 [overflow-wrap:anywhere]"
      >
        {beat.prompt}
      </p>
      {beat.outcome === "correct" && <p className="mt-1 text-center text-base font-semibold text-emerald-300" role="status">Richtig.</p>}
      {beat.outcome === "wrong" && (
        <p className="mt-1 text-center text-base font-semibold text-red-300 [overflow-wrap:anywhere]" role="status">
          Falsch. Richtig: {beat.reveal}
        </p>
      )}
      {beat.outcome === "miss" && (
        <p className="mt-1 text-center text-base font-semibold text-amber-200 [overflow-wrap:anywhere]" role="status">
          Verfehlt. Richtig: {beat.reveal}
        </p>
      )}
    </div>
  );
}

function Result({ end, total, setup }: { end: SpaceHud; total: number; setup: SetupState }) {
  const navigate = useNavigate();
  return (
    <section>
      <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">Weltraum</p>
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Runde beendet</h1>
      <p className="mt-3 text-lg text-stone-600 dark:text-stone-300">{endReason(end, total)}</p>
      <dl className="mt-6 grid grid-cols-2 gap-3">
        <Stat label="Hülle" value={`${end.hull} von ${HULL_MAX}`} />
        <Stat label="Leben" value={`${end.lives} von ${LIVES_MAX}`} />
        <Stat label="Richtige Vokabeln" value={String(end.correct)} />
        <Stat label="Falsch" value={String(end.wrong)} />
      </dl>
      <div className="mt-8 grid gap-3">
        <Button onClick={() => navigate("/weltraum", { replace: true, state: { ...setup, nonce: Date.now() } })}>Nochmal</Button>
        <Button variant="secondary" onClick={() => navigate("/")}>Zur Auswahl</Button>
      </div>
    </section>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-stone-200 bg-white px-3 py-3 dark:border-stone-800 dark:bg-stone-900">
      <dt className="text-sm font-semibold text-stone-500 dark:text-stone-400">{label}</dt>
      <dd className="mt-1 text-2xl font-semibold tabular-nums">{value}</dd>
    </div>
  );
}

function endReason(end: SpaceHud, total: number): string {
  if (end.hull <= 0 && end.lives <= 0) return "Hülle und Leben sind aufgebraucht.";
  if (end.hull <= 0) return "Die Hülle ist aufgebraucht.";
  if (end.lives <= 0) return "Keine Leben mehr.";
  if (end.correct + end.wrong >= total) return "Alle ausgewählten Wörter waren dran.";
  return "Die Runde ist vorbei.";
}
