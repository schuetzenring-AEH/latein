export const HULL_MAX = 10;
export const LIVES_MAX = 3;

export type SpaceHud = {
  hull: number;
  lives: number;
  correct: number;
  wrong: number;
};

export type SpaceMiss = {
  vocabId: string;
  prompt: string;
  promptLang: "la" | "de";
  answer: string;
};

export type SpaceEnd = SpaceHud & {
  missed: readonly SpaceMiss[];
};

export type SpaceBeat = {
  id: number;
  mode: "ask" | "feedback";
  prompt: string | null;
  promptLang: "la" | "de" | null;
  outcome: "correct" | "wrong" | "miss" | null;
  reveal: string | null;
};

export type SpaceItem = {
  vocabId: string;
  prompt: string;
  promptLang: "la" | "de";
  answer: string;
  options: readonly string[];
};

const PLANET_CYCLE = ["saturn", "erde", "jupiter", "mars", "venus", "merkur", "uranus", "neptun"] as const;

type PlanetKind = (typeof PLANET_CYCLE)[number];

type Planet = {
  kind: PlanetKind;
  label: string;
  correct: boolean;
  x: number;
  y: number;
  r: number;
  vy: number;
  lines: string[];
  fontPx: number;
  labelW: number;
  labelH: number;
  mark: "none" | "correct" | "wrong" | "dim";
};

type Asteroid = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  rot: number;
  spin: number;
  verts: number[];
  alive: boolean;
};

type Shot = {
  x: number;
  y: number;
  vy: number;
  life: number;
  alive: boolean;
};

type Particle = {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: string;
};

type Gesture = {
  id: number;
  pointerType: string;
  x: number;
  y: number;
  originX: number;
  originY: number;
  t: number;
  steer: boolean;
};

type Phase = "ask" | "feedback";

const FONT = 'system-ui, "Segoe UI", sans-serif';
const SHIP_R = 15;
const TAP_SLOP = 18;
const TAP_MS = 380;
const SHIP_MAX_SPEED = 220;
const FALL_SCALE = 0.7;
const PLANET_SPEED = 82 * FALL_SCALE;
const PLANET_LEAD = PLANET_SPEED * 3;
const FEEDBACK_TIME = 1.2;
const MAX_ASTEROIDS = 2;
const INVULN_TIME = 0.85;

function clamp(value: number, min: number, max: number): number {
  if (max < min) return min;
  return Math.max(min, Math.min(max, value));
}

function shuffle<T>(list: readonly T[]): T[] {
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

function planetTrio(beat: number): [PlanetKind, PlanetKind, PlanetKind] {
  const start = (beat * 3) % PLANET_CYCLE.length;
  return [0, 1, 2].map((offset) => PLANET_CYCLE[(start + offset) % PLANET_CYCLE.length]) as [PlanetKind, PlanetKind, PlanetKind];
}

function makeVerts(): number[] {
  const count = 7 + Math.floor(Math.random() * 3);
  return Array.from({ length: count }, () => 0.74 + Math.random() * 0.36);
}

function wrapLines(ctx: CanvasRenderingContext2D, text: string, maxWidth: number, fontPx: number): string[] {
  ctx.font = `700 ${fontPx}px ${FONT}`;
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  const pushWord = (word: string) => {
    if (ctx.measureText(word).width <= maxWidth) {
      current = word;
      return;
    }
    let chunk = "";
    for (const char of word) {
      const trial = chunk + char;
      if (chunk && ctx.measureText(trial).width > maxWidth) {
        lines.push(chunk);
        chunk = char;
      } else chunk = trial;
    }
    current = chunk;
  };
  for (const word of words) {
    const next = current ? `${current} ${word}` : word;
    if (current && ctx.measureText(next).width <= maxWidth) current = next;
    else {
      if (current) lines.push(current);
      pushWord(word);
    }
  }
  if (current) lines.push(current);
  return lines.slice(0, 4);
}

export function startWeltraum(options: {
  field: HTMLElement;
  canvas: HTMLCanvasElement;
  items: readonly SpaceItem[];
  onHud: (hud: SpaceHud) => void;
  onBeat: (beat: SpaceBeat) => void;
  onAnswer: (vocabId: string, correct: boolean) => void;
  onEnd: (end: SpaceEnd) => void;
}): () => void {
  const { field, canvas, items, onHud, onBeat, onAnswer, onEnd } = options;
  const context = canvas.getContext("2d");
  if (!context) return () => {};
  const ctx = context;

  let viewW = 0;
  let viewH = 0;
  let running = true;
  let ended = false;
  let started = false;
  let raf = 0;
  let beatSerial = 0;
  let questionIndex = 0;
  let cursor = 0;
  let hull = HULL_MAX;
  let lives = LIVES_MAX;
  let correctCount = 0;
  let wrongCount = 0;
  const missed: SpaceMiss[] = [];
  let phase: Phase = "ask";
  let feedbackLeft = 0;
  let spawnLeft = 0.65;
  let shotCooldown = 0;
  let resolved = false;
  let outcome: SpaceBeat["outcome"] = null;
  let current: SpaceItem | null = null;
  let planets: Planet[] = [];
  let asteroids: Asteroid[] = [];
  let shots: Shot[] = [];
  let particles: Particle[] = [];
  let gesture: Gesture | null = null;

  const ship = { x: 0, y: 0, vx: 0, invuln: 0, ready: false };
  const target = { x: 0, ready: false };

  function hud(): SpaceHud {
    return { hull, lives, correct: correctCount, wrong: wrongCount };
  }

  function publishHud() {
    onHud(hud());
  }

  function publishBeat() {
    beatSerial += 1;
    onBeat({
      id: beatSerial,
      mode: phase,
      prompt: current?.prompt ?? null,
      promptLang: current?.promptLang ?? null,
      outcome: phase === "feedback" ? outcome : null,
      reveal: phase === "feedback" ? current?.answer ?? null : null,
    });
  }

  function finish() {
    if (ended) return;
    ended = true;
    running = false;
    onEnd({ ...hud(), missed: missed.slice() });
  }

  function shipLimit(): number {
    return SHIP_R + 2;
  }

  function shipCenterY(): number {
    return Math.max(shipLimit(), viewH - 22);
  }

  function burst(x: number, y: number, color: string) {
    for (let index = 0; index < 10; index += 1) {
      const angle = (index / 10) * Math.PI * 2 + Math.random() * 0.4;
      const speed = 40 + Math.random() * 110;
      const life = 0.22 + Math.random() * 0.2;
      particles.push({
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life,
        max: life,
        color,
      });
    }
  }

  function labelMetrics(text: string, maxWidth: number): { lines: string[]; fontPx: number; labelW: number; labelH: number } {
    const length = [...text].length;
    const preferred = length > 28 ? 15 : length > 16 ? 17 : 20;
    let fontPx = preferred;
    let lines = wrapLines(ctx, text, maxWidth, fontPx);
    if (lines.length > 3 && fontPx > 15) {
      fontPx = 15;
      lines = wrapLines(ctx, text, maxWidth, fontPx);
    }
    ctx.font = `700 ${fontPx}px ${FONT}`;
    const labelW = Math.max(12, ...lines.map((line) => ctx.measureText(line).width));
    const labelH = Math.max(fontPx, lines.length * (fontPx + 3));
    return { lines, fontPx, labelW, labelH };
  }

  function labelTop(planet: Planet): number {
    const gap = planet.kind === "saturn" ? planet.r * 0.62 : 8;
    return planet.y + planet.r + gap;
  }

  function planetTop(planet: Planet): number {
    return planet.y - (planet.kind === "saturn" ? planet.r * 1.15 : planet.r);
  }

  function hitsPlanet(planet: Planet): boolean {
    const body = planet.kind === "saturn" ? planet.r * 1.05 : planet.r;
    const dx = ship.x - planet.x;
    const dy = ship.y - planet.y;
    if (dx * dx + dy * dy <= (body + SHIP_R - 1) * (body + SHIP_R - 1)) return true;
    const top = labelTop(planet);
    const half = Math.max(planet.labelW, 28) / 2 + 6;
    const left = planet.x - half;
    const right = planet.x + half;
    const bottom = top + planet.labelH + 4;
    const nearestX = clamp(ship.x, left, right);
    const nearestY = clamp(ship.y, top, bottom);
    const ox = ship.x - nearestX;
    const oy = ship.y - nearestY;
    return ox * ox + oy * oy <= SHIP_R * SHIP_R;
  }

  function passed(planet: Planet): boolean {
    return planetTop(planet) > ship.y + SHIP_R;
  }

  function beginAsk() {
    const item = items[cursor];
    if (!item || ended) {
      finish();
      return;
    }
    cursor += 1;
    current = item;
    phase = "ask";
    resolved = false;
    outcome = null;
    const types = planetTrio(questionIndex);
    questionIndex += 1;
    const radius = clamp(Math.min(viewW * 0.09, viewH * 0.11), 28, 56);
    const maxLabel = Math.max(88, Math.min(176, (viewW - 28) / 3));
    const lanes = shuffle([0.17, 0.5, 0.83]).map((fraction) => clamp(
      fraction * viewW,
      maxLabel / 2 + 6,
      Math.max(maxLabel / 2 + 6, viewW - maxLabel / 2 - 6),
    ));
    const offsets = shuffle([0, 36, 74]);
    const cards = shuffle(item.options.map((label, index) => ({
      label,
      correct: label === item.answer,
      kind: types[index] ?? "mars",
    })));
    planets = cards.map((card, index) => {
      const metrics = labelMetrics(card.label, maxLabel);
      const lane = lanes[index] ?? viewW / 2;
      const offset = offsets[index] ?? 0;
      const stack = radius + (card.kind === "saturn" ? radius * 0.62 : 8) + metrics.labelH;
      return {
        kind: card.kind,
        label: card.label,
        correct: card.correct,
        x: lane,
        y: -stack - offset - PLANET_LEAD,
        r: radius,
        vy: PLANET_SPEED,
        lines: metrics.lines,
        fontPx: metrics.fontPx,
        labelW: metrics.labelW,
        labelH: metrics.labelH,
        mark: "none" as const,
      };
    });
    publishBeat();
  }

  function holdCorrectPlanet(planet: Planet) {
    const minY = planet.r + 18;
    const maxY = Math.max(minY, ship.y - planet.r - planet.labelH - 36);
    planet.x = clamp(planet.x, planet.r + 8, Math.max(planet.r + 8, viewW - planet.r - 8));
    planet.y = clamp(Math.min(viewH * 0.34, maxY), minY, maxY);
  }

  function keepOnScreen(planet: Planet) {
    const minY = planet.r + 10;
    const bottom = labelTop(planet) + planet.labelH;
    if (bottom > viewH - 6) planet.y -= bottom - (viewH - 6);
    if (planet.y < minY) planet.y = minY;
    const half = Math.min(viewW / 2 - 8, planet.labelW / 2 + 6);
    planet.x = clamp(planet.x, half, Math.max(half, viewW - half));
  }

  function settle(correct: boolean, kind: "correct" | "wrong" | "miss", hit: Planet | null) {
    if (resolved || ended || !current || phase !== "ask") return;
    resolved = true;
    if (correct) correctCount += 1;
    else {
      wrongCount += 1;
      lives = Math.max(0, lives - 1);
      missed.push({
        vocabId: current.vocabId,
        prompt: current.prompt,
        promptLang: current.promptLang,
        answer: current.answer,
      });
    }
    onAnswer(current.vocabId, correct);
    outcome = kind;
    phase = "feedback";
    feedbackLeft = FEEDBACK_TIME;
    for (const planet of planets) {
      planet.vy = 0;
      if (planet.correct) planet.mark = "correct";
      else if (planet === hit) planet.mark = "wrong";
      else planet.mark = "dim";
    }
    const right = planets.find((planet) => planet.correct);
    if (right && kind === "miss") holdCorrectPlanet(right);
    if (right) keepOnScreen(right);
    if (hit && hit !== right) keepOnScreen(hit);
    if (hit) burst(hit.x, hit.y, correct ? "#86efac" : "#fda4af");
    else if (right) burst(right.x, right.y, "#fde68a");
    publishHud();
    publishBeat();
  }

  function spawnAsteroid() {
    if (asteroids.length >= MAX_ASTEROIDS || viewW < 40) return;
    const r = 14 + Math.random() * 8;
    const x = r + 10 + Math.random() * Math.max(1, viewW - r * 2 - 20);
    asteroids.push({
      x,
      y: -r - 6,
      vx: (Math.random() - 0.5) * 16,
      vy: (58 + Math.random() * 26) * FALL_SCALE,
      r,
      rot: Math.random() * Math.PI * 2,
      spin: (Math.random() - 0.5) * 1.1,
      verts: makeVerts(),
      alive: true,
    });
  }

  function aimX(x: number) {
    const limit = shipLimit();
    target.x = clamp(x, limit, Math.max(limit, viewW - limit));
    target.ready = true;
  }

  function fire() {
    if (ended || shotCooldown > 0 || !ship.ready) return;
    shotCooldown = 0.18;
    shots.push({
      x: ship.x,
      y: ship.y - 20,
      vy: -700,
      life: 1.15,
      alive: true,
    });
    burst(ship.x, ship.y - 16, "#fef9c3");
  }

  function localPoint(event: PointerEvent) {
    const rect = field.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function considerSteer(now: number) {
    if (!gesture || gesture.steer) return;
    const moved = Math.hypot(gesture.x - gesture.originX, gesture.y - gesture.originY) > TAP_SLOP;
    if (!moved && now - gesture.t <= TAP_MS) return;
    gesture.steer = true;
    if (gesture.pointerType !== "mouse") aimX(gesture.x);
  }

  function onDown(event: PointerEvent) {
    if (ended || event.button !== 0) return;
    if (event.cancelable) event.preventDefault();
    const point = localPoint(event);
    gesture = {
      id: event.pointerId,
      pointerType: event.pointerType,
      x: point.x,
      y: point.y,
      originX: point.x,
      originY: point.y,
      t: performance.now(),
      steer: false,
    };
    try {
      field.setPointerCapture(event.pointerId);
    } catch {
      // Capture can fail if the pointer already ended.
    }
  }

  function onMove(event: PointerEvent) {
    if (ended) return;
    const point = localPoint(event);
    if (event.pointerType === "mouse") aimX(point.x);
    if (!gesture || gesture.id !== event.pointerId) return;
    gesture.x = point.x;
    gesture.y = point.y;
    if (Math.hypot(gesture.x - gesture.originX, gesture.y - gesture.originY) > TAP_SLOP) gesture.steer = true;
    if (gesture.steer && event.pointerType !== "mouse") aimX(gesture.x);
  }

  function onUp(event: PointerEvent) {
    if (!gesture || gesture.id !== event.pointerId) return;
    const moved = Math.hypot(gesture.x - gesture.originX, gesture.y - gesture.originY) > TAP_SLOP;
    const shoot = !gesture.steer && !moved && performance.now() - gesture.t <= TAP_MS;
    gesture = null;
    if (shoot) fire();
  }

  function onCancel(event: PointerEvent) {
    if (gesture?.id === event.pointerId) gesture = null;
  }

  function onMenu(event: Event) {
    event.preventDefault();
  }

  function resize() {
    viewW = field.clientWidth;
    viewH = field.clientHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const bitmapW = Math.max(1, Math.floor(viewW * dpr));
    const bitmapH = Math.max(1, Math.floor(viewH * dpr));
    if (canvas.width !== bitmapW || canvas.height !== bitmapH) {
      canvas.width = bitmapW;
      canvas.height = bitmapH;
    }
    if (ship.ready) {
      const limit = shipLimit();
      ship.x = clamp(ship.x, limit, Math.max(limit, viewW - limit));
      ship.y = shipCenterY();
      if (target.ready) aimX(target.x);
    }
  }

  function ensureRound() {
    if (started || ended || viewW < 40 || viewH < 40) return;
    started = true;
    ship.x = viewW / 2;
    ship.y = shipCenterY();
    ship.vx = 0;
    ship.ready = true;
    aimX(ship.x);
    beginAsk();
  }

  function stepShip(dt: number) {
    ship.y = shipCenterY();
    if (!target.ready) return;
    const dx = target.x - ship.x;
    const desired = clamp(dx * 3, -SHIP_MAX_SPEED, SHIP_MAX_SPEED);
    const blend = 1 - Math.exp(-6 * dt);
    ship.vx += (desired - ship.vx) * blend;
    const step = ship.vx * dt;
    if (Math.abs(dx) < 0.8 && Math.abs(ship.vx) < 18) {
      ship.x = target.x;
      ship.vx = 0;
    } else if ((dx > 0 && step > dx) || (dx < 0 && step < dx)) {
      ship.x = target.x;
      ship.vx = 0;
    } else ship.x += step;
    const limit = shipLimit();
    ship.x = clamp(ship.x, limit, Math.max(limit, viewW - limit));
  }

  function damageHull() {
    hull = Math.max(0, hull - 1);
    publishHud();
    if (hull <= 0 && phase === "ask" && !resolved) finish();
  }

  function update(dt: number, now: number) {
    if (ended) return;
    shotCooldown = Math.max(0, shotCooldown - dt);
    if (viewW < 40 || viewH < 40) return;
    ensureRound();
    if (!started || ended) return;
    ship.invuln = Math.max(0, ship.invuln - dt);
    considerSteer(now);
    stepShip(dt);

    for (const shot of shots) {
      if (!shot.alive) continue;
      const nextY = shot.y + shot.vy * dt;
      shot.life -= dt;
      for (const asteroid of asteroids) {
        if (!shot.alive || !asteroid.alive) continue;
        const closestY = clamp(asteroid.y, Math.min(shot.y, nextY), Math.max(shot.y, nextY));
        if (Math.hypot(shot.x - asteroid.x, closestY - asteroid.y) > asteroid.r + 8) continue;
        shot.alive = false;
        asteroid.alive = false;
        hull = Math.min(HULL_MAX, hull + 1);
        burst(asteroid.x, asteroid.y, "#fdba74");
        publishHud();
      }
      shot.y = nextY;
      if (shot.life <= 0 || shot.y < -30) shot.alive = false;
    }
    for (const asteroid of asteroids) {
      if (!asteroid.alive) continue;
      asteroid.x += asteroid.vx * dt;
      asteroid.y += asteroid.vy * dt;
      asteroid.rot += asteroid.spin * dt;
      if (asteroid.y - asteroid.r > viewH + 40 || asteroid.x < -80 || asteroid.x > viewW + 80) asteroid.alive = false;
    }
    if (phase === "ask") {
      for (const planet of planets) planet.y += planet.vy * dt;
    }
    for (const particle of particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;
    }

    if (ended) return;
    if (ship.ready) {
      for (const asteroid of asteroids) {
        if (!asteroid.alive) continue;
        if (Math.hypot(ship.x - asteroid.x, ship.y - asteroid.y) > asteroid.r + SHIP_R - 1) continue;
        asteroid.alive = false;
        burst(asteroid.x, asteroid.y, ship.invuln > 0 ? "#cbd5e1" : "#fb7185");
        if (ship.invuln <= 0) {
          ship.invuln = INVULN_TIME;
          damageHull();
          if (ended) return;
        }
      }
    }

    if (phase === "ask" && !resolved) {
      let hit: Planet | null = null;
      let best = Infinity;
      for (const planet of planets) {
        if (!hitsPlanet(planet)) continue;
        const distance = Math.hypot(planet.x - ship.x, planet.y - ship.y);
        if (distance < best) {
          best = distance;
          hit = planet;
        }
      }
      if (hit) settle(hit.correct, hit.correct ? "correct" : "wrong", hit);
      else if (planets.length > 0 && planets.every(passed)) settle(false, "miss", null);
    }

    if (ended) return;
    spawnLeft -= dt;
    if (spawnLeft <= 0) {
      spawnAsteroid();
      spawnLeft = 2.7;
    }

    if (phase === "feedback") {
      feedbackLeft -= dt;
      if (feedbackLeft <= 0) {
        planets = [];
        if (lives <= 0 || hull <= 0 || cursor >= items.length) finish();
        else beginAsk();
      }
    }

    shots = shots.filter((shot) => shot.alive);
    asteroids = asteroids.filter((asteroid) => asteroid.alive);
    particles = particles.filter((particle) => particle.life > 0);
  }

  function fillSphere(inner: string, outer: string, r: number) {
    const gradient = ctx.createRadialGradient(-r * 0.32, -r * 0.38, r * 0.12, 0, 0, r);
    gradient.addColorStop(0, inner);
    gradient.addColorStop(1, outer);
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
  }

  function drawKind(kind: PlanetKind, r: number) {
    if (kind === "saturn") {
      ctx.save();
      ctx.rotate(-0.5);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.55, r * 0.42, 0, 0, Math.PI * 2);
      ctx.strokeStyle = "rgba(186, 148, 96, 0.95)";
      ctx.lineWidth = Math.max(4, r * 0.16);
      ctx.stroke();
      ctx.restore();
      fillSphere("#f8edd4", "#c49658", r);
      ctx.save();
      ctx.rotate(-0.5);
      ctx.beginPath();
      ctx.ellipse(0, 0, r * 1.55, r * 0.42, 0, 0.08, Math.PI - 0.08);
      ctx.strokeStyle = "#f3ddb0";
      ctx.lineWidth = Math.max(3, r * 0.13);
      ctx.stroke();
      ctx.restore();
      return;
    }
    if (kind === "erde") {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#2f6fd6";
      ctx.fillRect(-r, -r, r * 2, r * 2);
      ctx.fillStyle = "#3d9a4a";
      ctx.beginPath();
      ctx.ellipse(-r * 0.28, -r * 0.18, r * 0.42, r * 0.28, -0.5, 0, Math.PI * 2);
      ctx.ellipse(r * 0.32, r * 0.16, r * 0.3, r * 0.24, 0.4, 0, Math.PI * 2);
      ctx.ellipse(-r * 0.08, r * 0.38, r * 0.2, r * 0.14, 0.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#57c15a";
      ctx.beginPath();
      ctx.ellipse(-r * 0.34, -r * 0.05, r * 0.16, r * 0.1, -0.4, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
      const shade = ctx.createRadialGradient(-r * 0.3, -r * 0.35, r * 0.1, 0, 0, r);
      shade.addColorStop(0, "rgba(255,255,255,0.18)");
      shade.addColorStop(1, "rgba(0,0,0,0.2)");
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.fillStyle = shade;
      ctx.fill();
      return;
    }
    if (kind === "jupiter") {
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.fillStyle = "#e7b07a";
      ctx.fillRect(-r, -r, r * 2, r * 2);
      const bands: Array<[number, number, string]> = [
        [-0.78, 0.2, "#f6d7b0"],
        [-0.5, 0.16, "#c56b32"],
        [-0.28, 0.12, "#f3e0c4"],
        [-0.08, 0.18, "#d4894c"],
        [0.18, 0.12, "#f0c48e"],
        [0.36, 0.16, "#b85a2e"],
        [0.58, 0.24, "#e7b88a"],
      ];
      for (const [y, height, color] of bands) {
        ctx.fillStyle = color;
        ctx.fillRect(-r, y * r, r * 2, height * r);
      }
      ctx.beginPath();
      ctx.ellipse(r * 0.28, r * 0.16, r * 0.2, r * 0.13, 0.3, 0, Math.PI * 2);
      ctx.fillStyle = "#9a3412";
      ctx.fill();
      ctx.restore();
      return;
    }
    if (kind === "mars") {
      fillSphere("#ffb089", "#c2410c", r);
      ctx.beginPath();
      ctx.ellipse(-r * 0.15, r * 0.12, r * 0.28, r * 0.16, -0.4, 0, Math.PI * 2);
      ctx.fillStyle = "rgba(127, 29, 29, 0.35)";
      ctx.fill();
      return;
    }
    if (kind === "venus") {
      fillSphere("#fff6d5", "#e4bf62", r);
      return;
    }
    if (kind === "merkur") {
      fillSphere("#e4ded6", "#8a8178", r);
      ctx.fillStyle = "rgba(68, 64, 60, 0.45)";
      const craters = [
        [-0.32, -0.22, 0.18],
        [0.28, 0.08, 0.14],
        [-0.05, 0.34, 0.12],
        [0.12, -0.4, 0.1],
        [-0.28, 0.28, 0.08],
      ];
      for (const [x, y, size] of craters) {
        ctx.beginPath();
        ctx.arc(x * r, y * r, size * r, 0, Math.PI * 2);
        ctx.fill();
      }
      return;
    }
    if (kind === "uranus") {
      fillSphere("#e7fffb", "#5eead4", r);
      return;
    }
    fillSphere("#93c5fd", "#1e3a8a", r);
    ctx.beginPath();
    ctx.ellipse(r * 0.1, -r * 0.2, r * 0.16, r * 0.1, 0.2, 0, Math.PI * 2);
    ctx.fillStyle = "rgba(30, 58, 138, 0.55)";
    ctx.fill();
  }

  function drawPlanetBody(planet: Planet) {
    ctx.save();
    ctx.translate(planet.x, planet.y);
    ctx.globalAlpha = planet.mark === "dim" ? 0.38 : 1;
    drawKind(planet.kind, planet.r);
    if (planet.mark === "correct" || planet.mark === "wrong") {
      ctx.globalAlpha = 1;
      ctx.beginPath();
      const halo = planet.kind === "saturn" ? planet.r * 1.72 : planet.r + 7;
      ctx.arc(0, 0, halo, 0, Math.PI * 2);
      ctx.lineWidth = 4;
      ctx.strokeStyle = planet.mark === "correct" ? "#4ade80" : "#f87171";
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawLabel(planet: Planet) {
    const top = labelTop(planet);
    ctx.save();
    ctx.globalAlpha = planet.mark === "dim" ? 0.4 : 1;
    ctx.font = `700 ${planet.fontPx}px ${FONT}`;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.lineWidth = 4;
    ctx.lineJoin = "round";
    ctx.strokeStyle = "rgba(0,0,0,0.72)";
    ctx.fillStyle = "#f8fafc";
    planet.lines.forEach((line, index) => {
      const y = top + index * (planet.fontPx + 3);
      ctx.strokeText(line, planet.x, y);
      ctx.fillText(line, planet.x, y);
    });
    ctx.restore();
  }

  function drawAsteroid(asteroid: Asteroid) {
    ctx.save();
    ctx.translate(asteroid.x, asteroid.y);
    ctx.rotate(asteroid.rot);
    ctx.beginPath();
    asteroid.verts.forEach((scale, index) => {
      const angle = (index / asteroid.verts.length) * Math.PI * 2;
      const x = Math.cos(angle) * asteroid.r * scale;
      const y = Math.sin(angle) * asteroid.r * scale;
      if (index === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    });
    ctx.closePath();
    ctx.fillStyle = "#64748b";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#e2e8f0";
    ctx.stroke();
    ctx.restore();
  }

  function drawShip() {
    if (!ship.ready) return;
    if (ship.invuln > 0 && Math.floor(ship.invuln * 14) % 2 === 0) return;
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(8, -2);
    ctx.lineTo(15, 10);
    ctx.lineTo(6, 6);
    ctx.lineTo(3, 14);
    ctx.lineTo(0, 8);
    ctx.lineTo(-3, 14);
    ctx.lineTo(-6, 6);
    ctx.lineTo(-15, 10);
    ctx.lineTo(-8, -2);
    ctx.closePath();
    ctx.fillStyle = ship.invuln > 0 ? "#fecdd3" : "#e8eef5";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#94a3b8";
    ctx.stroke();
    ctx.fillStyle = "#38bdf8";
    ctx.beginPath();
    ctx.ellipse(0, -4, 3.2, 6.2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = "#fb923c";
    ctx.fillRect(-4.2, 10, 2.4, 7);
    ctx.fillRect(1.8, 10, 2.4, 7);
    ctx.restore();
  }

  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.fillStyle = "#07111c";
    ctx.fillRect(0, 0, viewW, viewH);
    const bodies = [
      ...asteroids.filter((asteroid) => asteroid.alive).map((asteroid) => ({ y: asteroid.y, paint: () => drawAsteroid(asteroid) })),
      ...planets.map((planet) => ({ y: planet.y, paint: () => drawPlanetBody(planet) })),
    ].sort((left, right) => left.y - right.y);
    for (const body of bodies) body.paint();
    for (const planet of planets) drawLabel(planet);
    ctx.lineCap = "round";
    for (const shot of shots) {
      if (!shot.alive) continue;
      ctx.strokeStyle = "#fef08a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(shot.x, shot.y);
      ctx.lineTo(shot.x, shot.y + 16);
      ctx.stroke();
      ctx.fillStyle = "#fef9c3";
      ctx.beginPath();
      ctx.arc(shot.x, shot.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const particle of particles) {
      ctx.globalAlpha = Math.max(0, particle.life / particle.max);
      ctx.fillStyle = particle.color;
      ctx.beginPath();
      ctx.arc(particle.x, particle.y, 2.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    drawShip();
  }

  function frame(now: number) {
    if (!running) return;
    const dt = Math.min(0.034, (now - last) / 1000);
    last = now;
    update(dt, now);
    if (viewW > 0 && viewH > 0) draw();
    if (running) raf = requestAnimationFrame(frame);
  }

  const observer = new ResizeObserver(() => resize());
  observer.observe(field);
  const blockSelect = (event: Event) => {
    if (event.cancelable) event.preventDefault();
  };
  field.addEventListener("pointerdown", onDown);
  field.addEventListener("touchstart", blockSelect, { passive: false });
  window.addEventListener("pointermove", onMove);
  window.addEventListener("pointerup", onUp);
  window.addEventListener("pointercancel", onCancel);
  field.addEventListener("contextmenu", onMenu);
  resize();
  ensureRound();
  publishHud();
  let last = performance.now();
  raf = requestAnimationFrame(frame);

  return () => {
    running = false;
    ended = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    field.removeEventListener("pointerdown", onDown);
    field.removeEventListener("touchstart", blockSelect);
    window.removeEventListener("pointermove", onMove);
    window.removeEventListener("pointerup", onUp);
    window.removeEventListener("pointercancel", onCancel);
    field.removeEventListener("contextmenu", onMenu);
  };
}
