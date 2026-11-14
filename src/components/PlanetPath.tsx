import { useEffect, useRef, useState } from "react";
import { cx } from "./ui";
import { PLANETS, type ArenaStatus, type Planet } from "../lib/planets";
import type { ArenaRun } from "../types";

const WIDTH = 340;
const HEIGHT = 1080;
const STEPS = 21;

const LOOK: Record<string, { size: number; disc: string; ring?: string }> = {
  mercurius: { size: 46, disc: "radial-gradient(circle at 32% 32%, #f3efe6, #9a9386 46%, #3f3b35)" },
  venus: { size: 58, disc: "radial-gradient(circle at 32% 32%, #fff6d8, #e2b54a 42%, #a56b22)" },
  mars: { size: 50, disc: "radial-gradient(circle at 32% 32%, #f0b8a0, #c45a3a 46%, #6e2618)" },
  iuppiter: { size: 72, disc: "radial-gradient(circle at 32% 30%, #f3e2c2, #d7a15a 28%, #c4784a 46%, #e6d2a8 62%, #b07a45)" },
  saturnus: { size: 64, disc: "radial-gradient(circle at 32% 32%, #fff4d2, #e6c98a 48%, #b08d4e)", ring: "#f3e2b0" },
  uranus: { size: 56, disc: "radial-gradient(circle at 32% 32%, #e7fffb, #7fd6d0 48%, #2f8f93)" },
  neptunus: { size: 56, disc: "radial-gradient(circle at 32% 32%, #d9e6ff, #4168d6 50%, #1a2d78)" },
  terra: { size: 60, disc: "radial-gradient(circle at 32% 32%, #d7ffe8, #3cb7e0 36%, #2f9a55 58%, #1d4e8f)" },
  luna: { size: 42, disc: "radial-gradient(circle at 32% 32%, #ffffff, #c9cdd4 48%, #6d7380)" },
  sol: { size: 78, disc: "radial-gradient(circle at 35% 35%, #fff7d6, #ffd15a 40%, #f08a1a 72%, #e25a12)" },
};

function pointFor(index: number): { x: number; y: number } {
  const span = PLANETS.length - 1;
  const y = 1000 - (index / span) * 920;
  const x = 170 + Math.sin(index * 0.9) * 86;
  return { x, y };
}

function trailPath(): string {
  const points = PLANETS.map((_, index) => pointFor(index));
  const first = points[0];
  if (!first) return "";
  let path = `M ${first.x} ${first.y}`;
  for (let index = 0; index < points.length - 1; index += 1) {
    const from = points[index];
    const to = points[index + 1];
    if (!from || !to) continue;
    const midY = (from.y + to.y) / 2;
    path += ` C ${from.x} ${midY}, ${to.x} ${midY}, ${to.x} ${to.y}`;
  }
  return path;
}

function stars(): { x: number; y: number; r: number; o: number }[] {
  let seed = 19;
  const next = () => {
    seed = (seed * 48271) % 2147483647;
    return seed / 2147483647;
  };
  return Array.from({ length: 90 }, () => ({
    x: next() * WIDTH,
    y: next() * HEIGHT,
    r: 0.4 + next() * 1.3,
    o: 0.35 + next() * 0.65,
  }));
}

const STARFIELD = stars();
const TRAIL = trailPath();

function innerProgress(run: ArenaRun | undefined, planetId: string, status: ArenaStatus): number {
  if (status === "done") return 1;
  if (status !== "open" || !run || run.planetId !== planetId) return 0;
  if (run.station === "boss-l2d") return 18 / STEPS;
  if (run.station === "boss-d2l") return 19 / STEPS;
  if (run.station === "boss-write") return 20 / STEPS;
  const station = run.station === "recognize" ? 0 : run.station === "reverse" ? 1 : 2;
  return (run.lessonIndex * 3 + station) / STEPS;
}

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

export function PlanetPath({
  cleared,
  run,
  onOpen,
}: {
  cleared: number;
  run: ArenaRun | undefined;
  onOpen: (planetId: string) => void;
}) {
  const pathRef = useRef<SVGPathElement>(null);
  const hereRef = useRef<HTMLButtonElement>(null);
  const [ship, setShip] = useState<{ x: number; y: number; angle: number } | null>(null);
  const openIndex = Math.min(cleared, PLANETS.length - 1);
  const finished = cleared >= PLANETS.length;
  const here = PLANETS[finished ? PLANETS.length - 1 : openIndex];
  const inner = here ? innerProgress(finished ? undefined : run, here.id, finished ? "done" : "open") : 0;
  const along = finished ? 1 : Math.min(1, (cleared + inner) / (PLANETS.length - 1));

  useEffect(() => {
    const trail = pathRef.current;
    if (!trail) return;
    const total = trail.getTotalLength();
    const distance = along * total;
    const at = trail.getPointAtLength(distance);
    const next = trail.getPointAtLength(Math.min(total, distance + 12));
    const angle = Math.atan2(next.y - at.y, next.x - at.x) * (180 / Math.PI) + 90;
    setShip({ x: at.x, y: at.y, angle });
  }, [along]);

  useEffect(() => {
    hereRef.current?.scrollIntoView({ block: "center" });
  }, []);

  const summary = finished
    ? "Alle zehn Arenen sind geschafft."
    : here
      ? `${here.latin}: ${placeLabel(run, here, "open")}`
      : "";

  return (
    <section className="rounded-3xl bg-[#07101c] text-white shadow-xl">
      <div className="sticky top-0 z-20 bg-[#07101c]/95 px-4 pb-3 pt-4 backdrop-blur">
        <div className="flex items-end justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-teal-200/80">Dein Weg</p>
            <h1 className="text-3xl font-semibold tracking-tight">Planeten</h1>
          </div>
          <p className="text-right">
            <span className="text-3xl font-semibold tabular-nums">{Math.min(cleared, PLANETS.length)}</span>
            <span className="text-stone-400"> / {PLANETS.length}</span>
          </p>
        </div>
        <p className="mt-2 text-stone-300">{summary}</p>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={PLANETS.length} aria-valuenow={Math.min(cleared, PLANETS.length)} aria-label="Arenen geschafft">
          <div className="h-full rounded-full bg-teal-300" style={{ width: `${along * 100}%` }} />
        </div>
      </div>
      <div className="relative mx-auto w-full max-w-md overflow-hidden rounded-b-3xl" style={{ aspectRatio: `${WIDTH} / ${HEIGHT}` }}>
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="absolute inset-0 h-full w-full" aria-hidden="true">
          <defs>
            <filter id="planet-trail-glow" x="-20%" y="-20%" width="140%" height="140%">
              <feGaussianBlur stdDeviation="3.5" result="blur" />
              <feMerge>
                <feMergeNode in="blur" />
                <feMergeNode in="SourceGraphic" />
              </feMerge>
            </filter>
          </defs>
          {STARFIELD.map((star, index) => (
            <circle key={index} cx={star.x} cy={star.y} r={star.r} fill="#fff" opacity={star.o} />
          ))}
          <path d={TRAIL} fill="none" stroke="#243044" strokeWidth="8" strokeLinecap="round" />
          <path
            ref={pathRef}
            d={TRAIL}
            fill="none"
            stroke="#5eead4"
            strokeWidth="4"
            strokeLinecap="round"
            filter="url(#planet-trail-glow)"
            pathLength={100}
            strokeDasharray={`${along * 100} 100`}
          />
        </svg>
        {PLANETS.map((planet, index) => {
          const status: ArenaStatus = finished ? "done" : index < cleared ? "done" : index === cleared ? "open" : "locked";
          const spot = pointFor(index);
          const look = LOOK[planet.id] ?? { size: 52, disc: "#888" };
          const labelOnRight = spot.x < WIDTH / 2;
          const current = status === "open" || (finished && index === PLANETS.length - 1);
          return (
            <button
              key={planet.id}
              ref={current ? hereRef : undefined}
              type="button"
              disabled={status === "locked"}
              onClick={() => onOpen(planet.id)}
              className="absolute -translate-x-1/2 -translate-y-1/2 disabled:cursor-not-allowed"
              style={{ left: `${(spot.x / WIDTH) * 100}%`, top: `${(spot.y / HEIGHT) * 100}%` }}
              aria-label={`${planet.latin}, ${planet.deutsch}, Lektion ${planet.from} bis ${planet.to}, ${placeLabel(run, planet, status)}`}
            >
              <span
                className={cx("relative grid place-items-center", status === "locked" && "opacity-40")}
                style={{ width: look.size + 18, height: look.size + 18 }}
              >
                {status === "open" && (
                  <svg viewBox="0 0 36 36" className="absolute inset-0 h-full w-full -rotate-90" aria-hidden="true">
                    <circle cx="18" cy="18" r="16" fill="none" stroke="#1e293b" strokeWidth="2" />
                    <circle
                      cx="18"
                      cy="18"
                      r="16"
                      fill="none"
                      stroke="#5eead4"
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeDasharray={`${innerProgress(run, planet.id, status) * 100.5} 100.5`}
                    />
                  </svg>
                )}
                <span
                  className={cx("relative rounded-full shadow-lg", planet.id === "sol" && "shadow-[0_0_28px_8px_rgba(255,180,40,0.55)]")}
                  style={{ width: look.size, height: look.size, background: look.disc }}
                />
                {look.ring && (
                  <svg viewBox="0 0 100 100" className="absolute inset-[-18%] h-[136%] w-[136%] overflow-visible" aria-hidden="true">
                    <ellipse cx="50" cy="50" rx="46" ry="16" fill="none" stroke={look.ring} strokeWidth="4" transform="rotate(-24 50 50)" />
                  </svg>
                )}
              </span>
              <span className={cx("absolute top-1/2 w-28 -translate-y-1/2", labelOnRight ? "left-[calc(100%+0.4rem)] text-left" : "right-[calc(100%+0.4rem)] text-right")}>
                <span lang="la" className="block text-base font-semibold leading-tight">{planet.latin}</span>
                <span className="block text-xs text-stone-300">{planet.deutsch} · {planet.from}–{planet.to}</span>
                <span className={cx("block text-xs font-semibold", status === "locked" ? "text-stone-500" : "text-teal-200")}>
                  {placeLabel(run, planet, status)}
                </span>
              </span>
            </button>
          );
        })}
        {ship && (
          <span
            className="pointer-events-none absolute z-10"
            style={{
              left: `${(ship.x / WIDTH) * 100}%`,
              top: `${(ship.y / HEIGHT) * 100}%`,
              transform: `translate(-50%, -50%) rotate(${ship.angle}deg) translate(0, -30px)`,
            }}
            aria-hidden="true"
          >
            <svg viewBox="0 0 32 40" className="h-9 w-8 drop-shadow-[0_0_8px_rgba(94,234,212,0.9)]">
              <path d="M16 1 L25 28 L16 23 L7 28 Z" fill="#f8fafc" />
              <path d="M16 22 L16 36" stroke="#5eead4" strokeWidth="3" strokeLinecap="round" />
              <circle cx="16" cy="14" r="2.2" fill="#0f766e" />
            </svg>
          </span>
        )}
      </div>
    </section>
  );
}
