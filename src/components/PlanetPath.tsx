import { useEffect, useRef } from "react";
import { cx } from "./ui";
import { isLessonStation, stationKey } from "../lib/arena";
import { PLANETS, type ArenaStatus, type Planet } from "../lib/planets";
import type { ArenaRun, ArenaStationId } from "../types";

const LOOK: Record<string, { disc: string; ring?: string }> = {
  neptunus: { disc: "radial-gradient(circle at 32% 32%, #d9e6ff, #4168d6 50%, #1a2d78)" },
  uranus: { disc: "radial-gradient(circle at 32% 32%, #e7fffb, #7fd6d0 48%, #2f8f93)" },
  saturnus: { disc: "radial-gradient(circle at 32% 32%, #fff4d2, #e6c98a 48%, #b08d4e)", ring: "#f3e2b0" },
  iuppiter: { disc: "radial-gradient(circle at 32% 30%, #f3e2c2, #d7a15a 28%, #c4784a 46%, #e6d2a8 62%, #b07a45)" },
  mars: { disc: "radial-gradient(circle at 32% 32%, #f0b8a0, #c45a3a 46%, #6e2618)" },
  venus: { disc: "radial-gradient(circle at 32% 32%, #fff6d8, #e2b54a 42%, #a56b22)" },
  mercurius: { disc: "radial-gradient(circle at 32% 32%, #f3efe6, #9a9386 46%, #3f3b35)" },
  terra: { disc: "radial-gradient(circle at 32% 32%, #d7ffe8, #3cb7e0 36%, #2f9a55 58%, #1d4e8f)" },
  luna: { disc: "radial-gradient(circle at 32% 32%, #ffffff, #c9cdd4 48%, #6d7380)" },
  sol: { disc: "radial-gradient(circle at 35% 35%, #fff7d6, #ffd15a 40%, #f08a1a 72%, #e25a12)" },
};

const LESSON_CHIPS = [
  { id: "recognize", short: "L→D", title: "Latein → Deutsch" },
  { id: "reverse", short: "D→L", title: "Deutsch → Latein" },
  { id: "write", short: "Schr.", title: "Schreiben" },
] as const;

const PROBE_CHIPS = [
  { id: "boss-l2d", short: "L→D", title: "Probe, Weltraum, Latein → Deutsch" },
  { id: "boss-d2l", short: "D→L", title: "Probe, Weltraum, Deutsch → Latein" },
  { id: "boss-write", short: "Schr.", title: "Probe Schreiben" },
] as const;

type ChipState = "done" | "here" | "open" | "wait" | "dim";

function placeLabel(run: ArenaRun | undefined, planet: Planet, status: ArenaStatus): string {
  if (status === "locked") return "Gesperrt";
  if (status === "done") return "Geschafft";
  if (!run || run.planetId !== planet.id) return "Offen";
  if (run.station === "boss-l2d") return "Probe 1 von 3";
  if (run.station === "boss-d2l") return "Probe 2 von 3";
  if (run.station === "boss-write") return "Probe 3 von 3";
  const name = run.station === "recognize" ? "Latein → Deutsch" : run.station === "reverse" ? "Deutsch → Latein" : "Schreiben";
  return `Lektion ${planet.from + run.lessonIndex} · ${name}`;
}

function chipState(
  status: ArenaStatus,
  planetId: string,
  lessonIndex: number,
  station: ArenaStationId,
  run: ArenaRun | undefined,
  finished: boolean,
): ChipState {
  if (finished || status === "done") {
    if (finished && planetId === "sol" && station === "boss-write") return "here";
    return "done";
  }
  if (status === "locked") return "dim";
  const active = run?.planetId === planetId ? run : undefined;
  if (!active) return lessonIndex === 0 && station === "recognize" ? "here" : "wait";
  if (isLessonStation(station)) {
    if ((active.passedStations ?? []).includes(stationKey(lessonIndex, station))) return "done";
    if (isLessonStation(active.station) && active.lessonIndex === lessonIndex && active.station === station) return "here";
    const order = station === "recognize" ? 0 : station === "reverse" ? 1 : 2;
    const currentOrder = active.station === "recognize" ? 0 : active.station === "reverse" ? 1 : active.station === "write" ? 2 : 3;
    if (lessonIndex < active.lessonIndex || (lessonIndex === active.lessonIndex && order < currentOrder)) return "open";
    return "wait";
  }
  if (!isLessonStation(active.station)) {
    const probeOrder = station === "boss-l2d" ? 0 : station === "boss-d2l" ? 1 : 2;
    const currentProbe = active.station === "boss-l2d" ? 0 : active.station === "boss-d2l" ? 1 : 2;
    if (probeOrder < currentProbe) return "done";
    if (probeOrder === currentProbe) return "here";
  }
  return "wait";
}

function Chip({ state, short, title }: { state: ChipState; short: string; title: string }) {
  return (
    <span
      title={title}
      className={cx(
        "relative rounded-md px-1 py-1 text-center text-[11px] font-semibold leading-none",
        state === "done" && "bg-amber-300 text-amber-950",
        state === "here" && "bg-teal-300 text-teal-950 ring-2 ring-white",
        state === "open" && "text-amber-200 ring-1 ring-amber-300",
        state === "wait" && "text-stone-300 ring-1 ring-stone-500",
        state === "dim" && "text-stone-500 ring-1 ring-stone-700",
      )}
    >
      {state === "here" && <Ship />}
      {short}
    </span>
  );
}

function Ship() {
  return (
    <svg viewBox="0 0 32 40" className="pointer-events-none absolute -top-6 left-1/2 h-6 w-5 -translate-x-1/2 rotate-180 drop-shadow-[0_0_8px_rgba(94,234,212,0.95)]" aria-hidden="true">
      <path d="M16 1 L25 28 L16 23 L7 28 Z" fill="#f8fafc" />
      <path d="M16 22 L16 36" stroke="#5eead4" strokeWidth="3" strokeLinecap="round" />
      <circle cx="16" cy="14" r="2.2" fill="#0f766e" />
    </svg>
  );
}

export function PlanetPath({
  cleared,
  run,
  onOpen,
}: {
  cleared: number;
  run: ArenaRun | undefined;
  onOpen: (planetId: string) => void;
}) {
  const hereRef = useRef<HTMLButtonElement>(null);
  const finished = cleared >= PLANETS.length;
  const openIndex = Math.min(cleared, PLANETS.length - 1);
  const here = PLANETS[finished ? PLANETS.length - 1 : openIndex];
  const along = finished ? 1 : cleared / PLANETS.length;

  useEffect(() => {
    hereRef.current?.scrollIntoView({ block: "center" });
  }, []);

  const summary = finished
    ? "Alle zehn Stationen des Pfads sind geschafft."
    : here
      ? `${here.latin}: ${placeLabel(run, here, "open")}`
      : "";

  return (
    <section className="rounded-3xl bg-[#07101c] text-white shadow-xl">
      <div className="sticky top-0 z-20 bg-[#07101c]/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200/80">Von außen nach innen</p>
            <h1 className="text-3xl font-semibold tracking-tight">Planetenpfad</h1>
          </div>
          <p className="text-right">
            <span className="text-3xl font-semibold tabular-nums">{Math.min(cleared, PLANETS.length)}</span>
            <span className="text-stone-400"> / {PLANETS.length}</span>
          </p>
        </div>
        <p className="mt-2 text-stone-300">{summary}</p>
        <p className="mt-1 text-xs text-stone-400">L→D Latein nach Deutsch · D→L Deutsch nach Latein · Schr. Schreiben</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={PLANETS.length} aria-valuenow={Math.min(cleared, PLANETS.length)} aria-label="Planeten geschafft">
          <div className="h-full rounded-full bg-teal-300" style={{ width: `${along * 100}%` }} />
        </div>
      </div>
      <ol className="relative mx-auto grid max-w-md gap-1 px-3 pb-8 pt-2">
        <span className="absolute bottom-6 left-9 top-2 w-1 rounded-full bg-slate-800" aria-hidden="true" />
        {PLANETS.map((planet, index) => {
          const status: ArenaStatus = finished ? "done" : index < cleared ? "done" : index === cleared ? "open" : "locked";
          const look = LOOK[planet.id] ?? { disc: "#888" };
          const current = status === "open" || (finished && planet.id === "sol");
          return (
            <li key={planet.id}>
              <button
                ref={current ? hereRef : undefined}
                type="button"
                disabled={status === "locked"}
                onClick={() => onOpen(planet.id)}
                className="grid w-full grid-cols-[4.25rem_1fr] gap-2 rounded-2xl px-1 py-2 text-left disabled:cursor-not-allowed"
                aria-label={`${planet.latin}, ${planet.deutsch}, Lektion ${planet.from} bis ${planet.to}, ${placeLabel(run, planet, status)}`}
              >
                <span className={cx("relative z-10 grid place-items-center", status === "locked" && "opacity-40")}>
                  {look.ring && (
                    <span className="absolute h-3 w-14 rounded-full border-2" style={{ borderColor: look.ring, transform: "rotate(-18deg)" }} />
                  )}
                  <span
                    className={cx("relative h-12 w-12 rounded-full shadow-lg", planet.id === "sol" && "shadow-[0_0_22px_6px_rgba(255,180,40,0.55)]", status === "done" && "ring-2 ring-amber-300")}
                    style={{ background: look.disc }}
                  />
                </span>
                <span className={cx("min-w-0", status === "locked" && "opacity-45")}>
                  <span className="flex items-baseline justify-between gap-2">
                    <span lang="la" className="text-lg font-semibold leading-tight">{planet.latin}</span>
                    <span className="text-xs text-stone-400">{planet.deutsch}</span>
                  </span>
                  <span className="mt-1 grid grid-cols-[2.2rem_1fr_1fr_1fr] items-center gap-1">
                    <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Lekt.</span>
                    {LESSON_CHIPS.map((chip) => (
                      <span key={chip.id} className="text-center text-[10px] font-semibold text-stone-400">{chip.short}</span>
                    ))}
                  </span>
                  {[0, 1, 2, 3, 4, 5].map((lessonIndex) => {
                    const states = LESSON_CHIPS.map((chip) => chipState(status, planet.id, lessonIndex, chip.id, run, finished));
                    return (
                      <span key={lessonIndex} className={cx("mt-1 grid grid-cols-[2.2rem_1fr_1fr_1fr] items-center gap-1", states.includes("here") && "pt-6")}>
                        <span className="text-xs font-semibold text-stone-300">{planet.from + lessonIndex}</span>
                        {LESSON_CHIPS.map((chip, chipIndex) => (
                          <Chip
                            key={chip.id}
                            short={chip.short}
                            title={`Lektion ${planet.from + lessonIndex}, ${chip.title}`}
                            state={states[chipIndex]}
                          />
                        ))}
                      </span>
                    );
                  })}
                  {(() => {
                    const states = PROBE_CHIPS.map((chip) => chipState(status, planet.id, 6, chip.id, run, finished));
                    return (
                      <span className={cx("mt-1 grid grid-cols-[2.2rem_1fr_1fr_1fr] items-center gap-1", states.includes("here") && "pt-6")}>
                        <span className="text-[10px] font-semibold uppercase tracking-wide text-stone-500">Probe</span>
                        {PROBE_CHIPS.map((chip, chipIndex) => (
                          <Chip key={chip.id} short={chip.short} title={chip.title} state={states[chipIndex]} />
                        ))}
                      </span>
                    );
                  })()}
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
