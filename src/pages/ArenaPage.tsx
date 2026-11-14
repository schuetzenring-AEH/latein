import { useEffect } from "react";
import { Link, Navigate, useLocation, useNavigate } from "react-router-dom";
import { Button } from "../components/ui";
import { useStore } from "../context/Store";
import { freshArenaRun, isLessonStation, lessonStars, readArenaRun, runOnce, stationTitle, wordsForStation } from "../lib/arena";
import { LessonStars } from "../components/LessonStars";
import { arenaStatus, planetById, planetIndex, planetLessons } from "../lib/planets";
import type { ArenaRun, ArenaStationId, Direction, Variant } from "../types";

type ArenaLocation = {
  arenaId?: string;
  practiceRun?: ArenaRun;
  practiceDone?: boolean;
};

function readLocation(state: unknown): ArenaLocation {
  if (!state || typeof state !== "object") return {};
  const value = state as ArenaLocation;
  return {
    arenaId: typeof value.arenaId === "string" ? value.arenaId : undefined,
    practiceRun: readArenaRun(value.practiceRun),
    practiceDone: value.practiceDone === true,
  };
}

export function ArenaPage() {
  const store = useStore();
  const location = useLocation();
  const navigate = useNavigate();
  const incoming = readLocation(location.state);
  const planet = incoming.arenaId ? planetById(incoming.arenaId) : undefined;
  const profile = store.profiles.find((item) => item.id === store.activeProfileId);
  const named = store.playMode === "named" && typeof profile?.passwordHash === "string";

  if (!named || !planet || !profile) return <Navigate to="/planeten" replace />;

  const index = planetIndex(planet.id);
  const cleared = profile.arenasCleared ?? 0;
  const status = arenaStatus(cleared, index);
  if (status === "locked") return <Navigate to="/planeten" replace />;

  const practice = status === "done";
  const run = practice ? incoming.practiceRun : profile.arenaRun?.planetId === planet.id ? profile.arenaRun : undefined;

  return (
    <ArenaStep
      planetId={planet.id}
      practice={practice}
      practiceDone={practice && incoming.practiceDone === true}
      run={run}
      onBeginPractice={() => {
        navigate("/arena", { replace: true, state: { arenaId: planet.id, practiceRun: freshArenaRun(planet.id) } });
      }}
      onEnsure={() => {
        if (!practice) store.ensureArenaRun(planet.id);
      }}
      onSkipEmpty={() => {
        if (!practice && run && isLessonStation(run.station)) store.recordArenaResult(planet.id, [], true);
      }}
      onStart={(nextRun, direction, variant) => {
        const words = wordsForStation(store.vocab, planet, nextRun);
        if (words.length === 0) return;
        const target = variant === "space" ? "/weltraum" : "/quiz";
        navigate(target, {
          state: {
            lektionIds: planetLessons(planet),
            direction,
            variant,
            dueOnly: false,
            nonce: Date.now(),
            arenaId: planet.id,
            wordIds: words.map((item) => item.id),
            arena: { arenaId: planet.id, station: nextRun.station, practice, run: nextRun },
          },
        });
      }}
    />
  );
}

function ArenaStep({
  planetId,
  practice,
  practiceDone,
  run,
  onBeginPractice,
  onEnsure,
  onSkipEmpty,
  onStart,
}: {
  planetId: string;
  practice: boolean;
  practiceDone: boolean;
  run: ArenaRun | undefined;
  onBeginPractice: () => void;
  onEnsure: () => void;
  onSkipEmpty: () => void;
  onStart: (run: ArenaRun, direction: Direction, variant: Variant) => void;
}) {
  const store = useStore();
  const planet = planetById(planetId);
  const lessons = planet ? planetLessons(planet) : [];
  const lesson = run && isLessonStation(run.station) ? lessons[run.lessonIndex] : undefined;
  const lessonWords = lesson === undefined ? [] : store.vocab.filter((item) => item.lektion === lesson);

  useEffect(() => {
    if (!practice && !run) onEnsure();
  }, [practice, run, onEnsure]);

  useEffect(() => {
    if (practice || !run || !isLessonStation(run.station) || lessonWords.length > 0) return;
    runOnce(`skip:${store.activeProfileId}:${planetId}:${run.lessonIndex}:${run.station}`, onSkipEmpty);
  }, [practice, run, lessonWords.length, onSkipEmpty, planetId]);

  if (!planet || !run) {
    if (practiceDone) {
      return (
        <section>
          <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">{planet?.latin}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Übung beendet</h1>
          <p className="mt-3 text-stone-600 dark:text-stone-300">Dieser Planet war schon geschafft. Der Pfad bleibt, wo er ist.</p>
          <Link to="/planeten" className="mt-6 inline-flex min-h-12 items-center font-semibold text-teal-800 underline dark:text-teal-300">Zum Planetenpfad</Link>
        </section>
      );
    }
    if (practice) {
      return (
        <section>
          <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">{planet?.latin}</p>
          <h1 className="mt-2 text-3xl font-semibold tracking-tight">Nochmal üben</h1>
          <p className="mt-3 text-stone-600 dark:text-stone-300">Lektionen {planet?.from}–{planet?.to}. Das zählt nicht noch einmal für den Pfad.</p>
          <Button className="mt-6" onClick={onBeginPractice}>Erste Station</Button>
        </section>
      );
    }
    return (
      <section>
        <h1 className="text-3xl font-semibold tracking-tight">Arena wird geladen</h1>
      </section>
    );
  }

  const boss = !isLessonStation(run.station);
  const words = wordsForStation(store.vocab, planet, run);
  const choose = run.station === "recognize" || run.station === "reverse";
  const direction: Direction = run.station === "reverse" || run.station === "boss-d2l" ? "d2l" : "l2d";

  return (
    <section>
      <p className="text-sm font-semibold uppercase tracking-wide text-stone-500">
        {planet.latin} · {planet.deutsch}
        {practice ? " · Übung" : ""}
      </p>
      <h1 className="mt-2 text-3xl font-semibold tracking-tight">{stationTitle(run.station)}</h1>
      <div className="mt-3 flex items-center gap-2">
        <LessonStars stars={lessonStars(run)} />
        <p className="text-sm text-stone-500">{lessonStars(run).filter(Boolean).length} von 6 Sternen</p>
      </div>
      <p className="mt-3 text-stone-600 dark:text-stone-300">
        {boss
          ? bossCopy(run.station, words.length)
          : `Lektion ${lesson} · ${run.lessonIndex + 1} von ${lessons.length}. ${words.length} Wörter. ${ruleCopy(run.station)}`}
      </p>
      {choose && (
        <div className="mt-6 grid gap-3 sm:grid-cols-2">
          <Button onClick={() => onStart(run, direction, "space")}>Weltraum</Button>
          <Button variant="secondary" onClick={() => onStart(run, direction, "mc")}>Multiple Choice</Button>
        </div>
      )}
      {!choose && (
        <Button className="mt-6" disabled={words.length === 0} onClick={() => onStart(run, direction, run.station === "write" || run.station === "boss-write" ? "input" : "space")}>
          {words.length === 0 ? "Keine Wörter" : "Starten"}
        </Button>
      )}
      <Link to="/planeten" className="mt-6 inline-flex min-h-12 items-center font-semibold text-teal-800 underline dark:text-teal-300">Zum Planetenpfad</Link>
    </section>
  );
}

function ruleCopy(station: ArenaStationId): string {
  if (station === "write") return "Artikel und Klammern zählen nicht. Ab drei Fehlern fehlt der Stern.";
  return "Ab drei Fehlern fehlt der Stern. Die Runde wird trotzdem zu Ende gespielt.";
}

function bossCopy(station: ArenaStationId, count: number): string {
  if (station === "boss-write") return `${count} Wörter tippen. Höchstens ein Fehler. Artikel und Klammern zählen nicht.`;
  return `${count} Wörter im Weltraum. Höchstens ein Fehler. Die Hülle darf nicht auf 0 fallen.`;
}
