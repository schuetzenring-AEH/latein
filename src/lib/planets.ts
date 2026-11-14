export const PLANETS = [
  { id: "neptunus", latin: "Neptunus", deutsch: "Neptun", from: 1, to: 6 },
  { id: "uranus", latin: "Uranus", deutsch: "Uranus", from: 7, to: 12 },
  { id: "saturnus", latin: "Saturnus", deutsch: "Saturn", from: 13, to: 18 },
  { id: "iuppiter", latin: "Iuppiter", deutsch: "Jupiter", from: 19, to: 24 },
  { id: "mars", latin: "Mars", deutsch: "Mars", from: 25, to: 30 },
  { id: "venus", latin: "Venus", deutsch: "Venus", from: 31, to: 36 },
  { id: "mercurius", latin: "Mercurius", deutsch: "Merkur", from: 37, to: 42 },
  { id: "terra", latin: "Terra", deutsch: "Erde", from: 43, to: 48 },
  { id: "luna", latin: "Luna", deutsch: "Mond", from: 49, to: 54 },
  { id: "sol", latin: "Sol", deutsch: "Sonne", from: 55, to: 60 },
] as const;

export type Planet = (typeof PLANETS)[number];
export type PlanetId = Planet["id"];

export function planetIndex(id: string): number {
  return PLANETS.findIndex((planet) => planet.id === id);
}

export function planetById(id: string): Planet | undefined {
  return PLANETS.find((planet) => planet.id === id);
}

export function planetLessons(planet: Planet): number[] {
  const lessons: number[] = [];
  for (let lesson = planet.from; lesson <= planet.to; lesson += 1) lessons.push(lesson);
  return lessons;
}

export type ArenaStatus = "done" | "open" | "locked";

export function arenaStatus(cleared: number, index: number): ArenaStatus {
  if (index < cleared) return "done";
  if (index === cleared && index < PLANETS.length) return "open";
  return "locked";
}

/** Only a success on the current frontier opens the next planet. */
export function clearedAfterSuccess(cleared: number, index: number): number {
  if (index !== cleared) return cleared;
  if (index < 0 || index >= PLANETS.length) return cleared;
  return cleared + 1;
}
