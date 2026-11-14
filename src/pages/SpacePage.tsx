import { useEffect, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { Button, cx } from "../components/ui";
import { useStore } from "../context/Store";
import { arenaPracticeState, readArenaLink, runOnce, stationPassed, type ArenaRoundLink } from "../lib/arena";
import { PLANETS, planetById, planetIndex } from "../lib/planets";
import { buildSpaceRound, shuffle } from "../lib/quiz";
import { isDue } from "../lib/srs";
import { canSpeak, speakText } from "../lib/speech";
import type { ProgressEntry, RoundSetup, Vocab } from "../types";
import { HULL_MAX, LIVES_MAX, startWeltraum, type SpaceBeat, type SpaceEnd, type SpaceHud, type SpaceItem } from "../lib/weltraum";

type SetupState = RoundSetup & { nonce?: number; arenaId?: string; wordIds?: string[]; arena?: ArenaRoundLink };

function readSetup(state: unknown): SetupState | null {
  if (!state || typeof state !== "object") return null;
  const value = state as Partial<SetupState> & { arena?: unknown };
  if (!Array.isArray(value.lektionIds) || value.lektionIds.some((id) => typeof id !== "number")) return null;
  if (value.lektionIds.length === 0) return null;
  if (value.direction !== "l2d" && value.direction !== "d2l") return null;
  if (value.variant !== "space") return null;
  const arena = readArenaLink(value.arena);
  const arenaId = arena?.arenaId ?? (typeof value.arenaId === "string" && planetById(value.arenaId) ? value.arenaId : undefined);
  const wordIds = Array.isArray(value.wordIds) && value.wordIds.every((id) => typeof id === "string") ? value.wordIds : undefined;
  return {
    lektionIds: value.lektionIds,
    direction: value.direction,
    variant: "space",
    dueOnly: Boolean(value.dueOnly),
    nonce: typeof value.nonce === "number" ? value.nonce : 0,
    ...(arenaId ? { arenaId } : {}),
    ...(wordIds ? { wordIds } : {}),
    ...(arena ? { arena } : {}),
  };
}

function prepareSpace(vocab: readonly Vocab[], profileProgress: Record<string, ProgressEntry> | undefined, setup: SetupState) {
  try {
    const inLessons = vocab.filter((item) => setup.lektionIds.includes(item.lektion));
    const selected = setup.wordIds
      ? setup.wordIds.flatMap((id) => inLessons.filter((item) => item.id === id))
      : inLessons;
    const due = selected.filter((item) => isDue(profileProgress?.[item.id]));
    const fellBack = setup.dueOnly && selected.length > 0 && due.length === 0;
    const asked = setup.wordIds ? selected : shuffle(setup.dueOnly && due.length > 0 ? due : selected);
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
      <section className="min-h-0 flex-1 overflow-y-auto">
        <h1 className="text-3xl font-semibold tracking-tight">Keine Runde</h1>
        <p className="mt-3 text-stone-600 dark:text-stone-300">Wähle zuerst Lektionen und die Richtung. Danach startet Weltraum.</p>
        <Link to="/" className="mt-6 inline-flex min-h-12 items-center font-semibold text-teal-800 underline dark:text-teal-300">Zur Auswahl</Link>
      </section>
    );
  }
  return <SpaceRound key={`${setup.nonce}-${setup.direction}-${setup.dueOnly ? "due" : "all"}-${setup.lektionIds.join("-")}`} setup={setup} />;
}

function SpaceRound({ setup }: { setup: SetupState }) {
  const store = useStore();
  const profileId = useRef(store.activeProfileId);
  const built = useState(() => prepareSpace(store.vocab, store.progress[profileId.current], setup))[0];
  const [outcome, setOutcome] = useState<{ end: SpaceEnd; cleared: number | null } | null>(null);
  const storeRef = useRef(store);
  storeRef.current = store;
  const setupRef = useRef(setup);
  setupRef.current = setup;
  const recorded = useRef(false);
  const finishRef = useRef<(end: SpaceEnd) => void>(() => {});
  finishRef.current = (end) => {
    if (recorded.current) return;
    recorded.current = true;
    const current = storeRef.current;
    const round = setupRef.current;
    const profile = current.profiles.find((item) => item.id === current.activeProfileId);
    const named = current.playMode === "named" && typeof profile?.passwordHash === "string";
    const cleared = named ? profile?.arenasCleared ?? 0 : null;
    const failed = end.hull <= 0 || end.lives <= 0;
    const link = round.arena;
    if (named && link && !link.practice) {
      const missedIds = end.missed.map((item) => item.vocabId);
      const key = `space:${round.nonce}:${link.arenaId}:${link.run.lessonIndex}:${link.station}`;
      runOnce(key, () => current.recordArenaResult(link.arenaId, missedIds, stationPassed(link.station, missedIds.length, failed)));
    }
    setOutcome({ end, cleared });
  };
  const onEnd = useRef((end: SpaceEnd) => {
    finishRef.current(end);
  }).current;
  const planetId = setup.arena?.arenaId ?? setup.arenaId;
  const planet = planetId ? planetById(planetId) : undefined;
  const arenaIndex = planet ? planetIndex(planet.id) : -1;
  const profile = store.profiles.find((item) => item.id === store.activeProfileId);
  const named = store.playMode === "named" && typeof profile?.passwordHash === "string";
  const clearedNow = named ? profile?.arenasCleared ?? 0 : 0;
  const arenaBlocked = Boolean(planetId) && setup.arena?.practice !== true && (!named || arenaIndex < 0 || arenaIndex > clearedNow);
  const back = planetId ? "/planeten" : "/";

  if (arenaBlocked && !outcome) {
    return (
      <section className="min-h-0 flex-1 overflow-y-auto">
        <h1 className="text-3xl font-semibold tracking-tight">Diese Arena ist zu</h1>
        <p className="mt-3 text-stone-600 dark:text-stone-300">Schaffe zuerst den offenen Planeten. Danach geht es weiter.</p>
        <Link to="/planeten" className="mt-6 inline-flex min-h-12 items-center font-semibold text-teal-800 underline dark:text-teal-300">Zu den Planeten</Link>
      </section>
    );
  }

  if (built.error || built.items.length === 0) {
    return (
      <section className="min-h-0 flex-1 overflow-y-auto">
        <h1 className="text-3xl font-semibold tracking-tight">Runde nicht möglich</h1>
        <p className="mt-3 text-stone-600 dark:text-stone-300">{built.error ?? "Keine Wörter in dieser Auswahl."}</p>
        <Link to={back} className="mt-6 inline-flex min-h-12 items-center font-semibold text-teal-800 underline dark:text-teal-300">
          {setup.arenaId ? "Zu den Planeten" : "Zur Auswahl"}
        </Link>
      </section>
    );
  }

  if (outcome) return <Result end={outcome.end} total={built.items.length} setup={setup} cleared={outcome.cleared} />;
  return (
    <Play
      items={built.items}
      fellBack={built.fellBack}
      profileId={profileId.current}
      onEnd={onEnd}
      banner={planet ? `${planet.latin} · ${planet.deutsch}` : undefined}
    />
  );
}

function Play({
  items,
  fellBack,
  profileId,
  onEnd,
  banner,
}: {
  items: readonly SpaceItem[];
  fellBack: boolean;
  profileId: string;
  onEnd: (end: SpaceEnd) => void;
  banner?: string;
}) {
  const { recordAnswer } = useStore();
  const recordRef = useRef(recordAnswer);
  const profileRef = useRef(profileId);
  const shellRef = useRef<HTMLDivElement>(null);
  const fieldRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const first = items[0];
  const [hud, setHud] = useState<SpaceHud>({ hull: HULL_MAX, lives: LIVES_MAX, correct: 0, wrong: 0 });
  const [beat, setBeat] = useState<SpaceBeat>({
    id: 0,
    mode: "ask",
    prompt: first?.prompt ?? null,
    promptLang: first?.promptLang ?? null,
    outcome: null,
    reveal: null,
  });
  recordRef.current = recordAnswer;
  profileRef.current = profileId;

  useEffect(() => {
    const field = fieldRef.current;
    const canvas = canvasRef.current;
    if (!field || !canvas) return;
    return startWeltraum({
      field,
      canvas,
      items,
      onHud: setHud,
      onBeat: setBeat,
      onAnswer: (vocabId, correct) => recordRef.current(profileRef.current, vocabId, correct),
      onEnd,
    });
  }, [items, onEnd]);

  useEffect(() => {
    if (beat.id > 0 && beat.mode === "ask" && beat.prompt && beat.promptLang) speakText(beat.prompt, beat.promptLang);
  }, [beat.id, beat.mode, beat.prompt, beat.promptLang]);

  useEffect(() => () => {
    if (canSpeak()) window.speechSynthesis.cancel();
  }, []);

  useEffect(() => {
    const shell = shellRef.current;
    if (!shell) return;
    const blockSelect = (event: Event) => {
      if (event.cancelable) event.preventDefault();
    };
    shell.addEventListener("pointerdown", blockSelect);
    shell.addEventListener("touchstart", blockSelect, { passive: false });
    return () => {
      shell.removeEventListener("pointerdown", blockSelect);
      shell.removeEventListener("touchstart", blockSelect);
    };
  }, []);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      {banner && <p className="mb-2 shrink-0 text-sm font-semibold text-stone-600 dark:text-stone-300">{banner}</p>}
      {fellBack && (
        <p className="mb-2 shrink-0 text-sm text-stone-600 dark:text-stone-300">Keine Wörter fällig. Diese Runde enthält alle Wörter der Auswahl.</p>
      )}
      <div ref={shellRef} className="game-surface flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl bg-[#07111c] text-white">
        <style>{GAME_SURFACE_CSS}</style>
        <Hud hud={hud} />
        <Prompt beat={beat} />
        <div ref={fieldRef} className="relative min-h-0 flex-1 overflow-hidden" aria-label="Spielfeld">
          <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 block h-full w-full" aria-hidden="true" />
        </div>
      </div>
    </div>
  );
}

function Hud({ hud }: { hud: SpaceHud }) {
  return (
    <div className="flex shrink-0 items-center gap-2 px-3 py-2.5">
      <span className="shrink-0 text-sm font-semibold">Hülle</span>
      <div
        className="flex h-3.5 min-w-0 flex-1 gap-0.5"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={HULL_MAX}
        aria-valuenow={hud.hull}
        aria-label={`Hülle ${hud.hull} von ${HULL_MAX}`}
      >
        {Array.from({ length: HULL_MAX }, (_, index) => (
          <span
            key={index}
            className={cx(
              "h-full min-w-0 flex-1 rounded-[3px]",
              index < hud.hull ? "bg-sky-400" : "border border-white/35 bg-white/5",
            )}
          />
        ))}
      </div>
      <span className="shrink-0 pl-1 text-sm font-semibold">Leben</span>
      <div
        className="flex shrink-0 gap-0.5"
        role="meter"
        aria-valuemin={0}
        aria-valuemax={LIVES_MAX}
        aria-valuenow={hud.lives}
        aria-label={`Leben ${hud.lives} von ${LIVES_MAX}`}
      >
        {Array.from({ length: LIVES_MAX }, (_, index) => (
          <Heart key={index} filled={index < hud.lives} />
        ))}
      </div>
    </div>
  );
}

function Heart({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" className={cx("h-5 w-5", filled ? "text-rose-500" : "text-white/30")} aria-hidden="true">
      <path
        fill={filled ? "currentColor" : "none"}
        stroke="currentColor"
        strokeWidth={filled ? 0 : 1.7}
        d="M12 20.4s-6.8-4.4-9-8.2C1.2 9.4 1.8 6.2 4.5 5 6.4 4.2 8.4 4.7 12 7.8c3.6-3.1 5.6-3.6 7.5-2.8 2.7 1.2 3.3 4.4 1.5 7.2-2.2 3.8-9 8.2-9 8.2z"
      />
    </svg>
  );
}

const GAME_SURFACE_CSS = `
.game-surface, .game-surface * {
  -webkit-user-select: none;
  user-select: none;
  -webkit-touch-callout: none;
  -webkit-tap-highlight-color: transparent;
  touch-action: none;
}
`;

function Prompt({ beat }: { beat: SpaceBeat }) {
  return (
    <div className="shrink-0 px-3 pb-2 pt-1">
      <p
        lang={beat.promptLang === "la" ? "la" : "de"}
        className="w-full text-center text-[1.85rem] font-bold leading-tight text-white [overflow-wrap:anywhere]"
      >
        {beat.prompt ?? "\u00a0"}
      </p>
      <p className="sr-only" aria-live="polite">
        {beat.outcome === "correct" && "Richtig."}
        {beat.outcome === "wrong" && `Falsch. Richtig: ${beat.reveal ?? ""}`}
        {beat.outcome === "miss" && `Verfehlt. Richtig: ${beat.reveal ?? ""}`}
      </p>
    </div>
  );
}

function Result({ end, total, setup, cleared }: { end: SpaceEnd; total: number; setup: SetupState; cleared: number | null }) {
  const navigate = useNavigate();
  const store = useStore();
  const failed = end.hull <= 0 || end.lives <= 0;
  const planet = setup.arenaId ? planetById(setup.arenaId) : undefined;
  const index = planet ? planetIndex(planet.id) : -1;
  const link = setup.arena;
  const missedIds = end.missed.map((item) => item.vocabId);
  const passed = link ? stationPassed(link.station, missedIds.length, failed) : !failed;
  const arenaNote = link ? arenaMessage(link.station, passed, link.practice, index, cleared) : null;
  const arenaBack = link
    ? link.practice
      ? arenaPracticeState(store.vocab, link, missedIds, passed)
      : { arenaId: link.arenaId }
    : null;
  const back = setup.arenaId ? "/planeten" : "/";
  return (
    <section className="min-h-0 flex-1 overflow-y-auto">
      <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">{planet ? planet.latin : "Weltraum"}</p>
      {planet && <p className="mt-1 text-stone-500 dark:text-stone-400">{planet.deutsch}</p>}
      <h1 className="mt-2 text-4xl font-semibold tracking-tight">Runde beendet</h1>
      <p className="mt-3 text-lg text-stone-600 dark:text-stone-300">{endReason(end, total)}</p>
      {arenaNote && <p className="mt-2 text-lg font-semibold">{arenaNote}</p>}
      <dl className="mt-6 grid grid-cols-2 gap-3">
        <Stat label="Hülle" value={`${end.hull} von ${HULL_MAX}`} />
        <Stat label="Leben" value={`${end.lives} von ${LIVES_MAX}`} />
        <Stat label="Richtige Vokabeln" value={String(end.correct)} />
        <Stat label="Falsch" value={String(end.wrong)} />
      </dl>
      {failed && end.missed.length > 0 && (
        <div className="mt-8">
          <h2 className="text-xl font-semibold tracking-tight">Falsche Wörter</h2>
          <p className="mt-1 text-stone-600 dark:text-stone-300">So gehören die Paare richtig zusammen.</p>
          <ul className="mt-4 grid gap-3">
            {end.missed.map((pair, index) => (
              <li key={`${pair.vocabId}-${index}`} className="rounded-2xl border border-stone-200 bg-white px-4 py-3 dark:border-stone-800 dark:bg-stone-900">
                <p lang={pair.promptLang === "la" ? "la" : "de"} className="text-lg font-semibold [overflow-wrap:anywhere]">{pair.prompt}</p>
                <p className="mt-2 text-sm font-semibold uppercase tracking-wide text-stone-500">Richtig</p>
                <p lang={pair.promptLang === "la" ? "de" : "la"} className="text-stone-800 dark:text-stone-100 [overflow-wrap:anywhere]">{pair.answer}</p>
              </li>
            ))}
          </ul>
        </div>
      )}
      <div className="mt-8 grid gap-3">
        {arenaBack ? (
          <Button onClick={() => navigate("/arena", { state: arenaBack })}>Weiter in der Arena</Button>
        ) : (
          <>
            <Button onClick={() => navigate("/weltraum", { replace: true, state: { ...setup, nonce: Date.now() } })}>Nochmal</Button>
            <Button variant="secondary" onClick={() => navigate(back)}>{setup.arenaId ? "Zu den Planeten" : "Zur Auswahl"}</Button>
          </>
        )}
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

function arenaMessage(station: ArenaRoundLink["station"], passed: boolean, practice: boolean, index: number, cleared: number | null): string | null {
  if (!passed) return "Diese Station zählt noch nicht. Sie beginnt noch einmal.";
  if (station !== "boss-write") return "Diese Station ist geschafft.";
  if (practice || cleared === null || index < cleared) return "Übung beendet. Der Pfad bleibt, wo er ist.";
  const next = PLANETS[index + 1];
  if (!next) return "Geschafft. Alle Arenen sind geschafft.";
  return `Geschafft. ${next.latin} ist jetzt offen.`;
}

function endReason(end: SpaceHud, total: number): string {
  if (end.hull <= 0 && end.lives <= 0) return "Hülle und Leben sind aufgebraucht.";
  if (end.hull <= 0) return "Die Hülle ist aufgebraucht.";
  if (end.lives <= 0) return "Keine Leben mehr.";
  if (end.correct + end.wrong >= total) return "Geschafft. Alle Wörter waren dran.";
  return "Die Runde ist vorbei.";
}
