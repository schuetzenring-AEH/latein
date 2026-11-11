export const HULL_MAX = 10;
export const LIVES_MAX = 3;

export type SpaceHud = {
  hull: number;
  lives: number;
  correct: number;
  wrong: number;
};

export type SpaceBeat = {
  id: number;
  mode: "drift" | "ask" | "feedback";
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
  vx: number;
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

type Bubble = {
  el: HTMLDivElement;
  correct: boolean;
  x: number;
  y: number;
  vx: number;
  vy: number;
  w: number;
  h: number;
  held: boolean;
};

type Phase = "drift" | "ask" | "feedback";

const SHIP_R = 13;
const TAP_SLOP = 18;
const TAP_MS = 380;
const OPENING_DRIFT = 3.2;
const NEXT_DRIFT = 2.4;
const FEEDBACK_TIME = 1.15;

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

function makeVerts(): number[] {
  const count = 7 + Math.floor(Math.random() * 4);
  return Array.from({ length: count }, () => 0.72 + Math.random() * 0.38);
}

function fontFor(label: string): string {
  const length = [...label].length;
  if (length > 36) return "16px";
  if (length > 24) return "18px";
  if (length > 14) return "20px";
  return "24px";
}

export function startWeltraum(options: {
  field: HTMLElement;
  canvas: HTMLCanvasElement;
  overlay: HTMLElement;
  items: readonly SpaceItem[];
  onHud: (hud: SpaceHud) => void;
  onBeat: (beat: SpaceBeat) => void;
  onAnswer: (vocabId: string, correct: boolean) => void;
  onEnd: (hud: SpaceHud) => void;
}): () => void {
  const { field, canvas, overlay, items, onHud, onBeat, onAnswer, onEnd } = options;
  const context = canvas.getContext("2d");
  if (!context) return () => {};
  const ctx = context;

  const stars = Array.from({ length: 48 }, () => ({
    x: Math.random(),
    y: Math.random(),
    s: Math.random() < 0.82 ? 1.2 : 2.2,
    a: 0.28 + Math.random() * 0.72,
  }));

  let viewW = 0;
  let viewH = 0;
  let running = true;
  let ended = false;
  let primed = false;
  let raf = 0;
  let beatSerial = 0;
  let cursor = 0;
  let hull = HULL_MAX;
  let lives = LIVES_MAX;
  let correctCount = 0;
  let wrongCount = 0;
  let phase: Phase = "drift";
  let driftLeft = OPENING_DRIFT;
  let feedbackLeft = 0;
  let spawnLeft = 0.85;
  let shotCooldown = 0;
  let resolved = false;
  let armed = false;
  let outcome: SpaceBeat["outcome"] = null;
  let current: SpaceItem | null = null;
  let asteroids: Asteroid[] = [];
  let shots: Shot[] = [];
  let particles: Particle[] = [];
  let bubbles: Bubble[] = [];
  let tap: { id: number; x: number; y: number; t: number; moved: boolean } | null = null;

  const ship = { x: 0, y: 0, angle: -Math.PI / 2, invuln: 0, ready: false };
  const target = { x: 0, y: 0, ready: false };

  function hud(): SpaceHud {
    return { hull, lives, correct: correctCount, wrong: wrongCount };
  }

  function publishHud() {
    onHud(hud());
  }

  function publishBeat() {
    beatSerial += 1;
    const showing = phase !== "drift";
    onBeat({
      id: beatSerial,
      mode: phase,
      prompt: showing ? current?.prompt ?? null : null,
      promptLang: showing ? current?.promptLang ?? null : null,
      outcome: phase === "feedback" ? outcome : null,
      reveal: phase === "feedback" ? current?.answer ?? null : null,
    });
  }

  function finish() {
    if (ended) return;
    ended = true;
    running = false;
    for (const bubble of bubbles) bubble.el.remove();
    bubbles = [];
    overlay.replaceChildren();
    onEnd(hud());
  }

  function burst(x: number, y: number, color: string) {
    for (let index = 0; index < 12; index += 1) {
      const angle = (index / 12) * Math.PI * 2 + Math.random() * 0.35;
      const speed = 46 + Math.random() * 120;
      const life = 0.26 + Math.random() * 0.22;
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

  function place(bubble: Bubble) {
    bubble.el.style.transform = `translate(${bubble.x - bubble.w / 2}px, ${bubble.y - bubble.h / 2}px)`;
  }

  function paint(bubble: Bubble, kind: "idle" | "correct" | "wrong" | "dim") {
    if (kind === "correct") {
      bubble.el.style.background = "#15803d";
      bubble.el.style.color = "#f0fdf4";
      bubble.el.style.borderColor = "#86efac";
      bubble.el.style.opacity = "1";
      return;
    }
    if (kind === "wrong") {
      bubble.el.style.background = "#b91c1c";
      bubble.el.style.color = "#fef2f2";
      bubble.el.style.borderColor = "#fecaca";
      bubble.el.style.opacity = "1";
      return;
    }
    if (kind === "dim") {
      bubble.el.style.opacity = "0.3";
      return;
    }
    bubble.el.style.background = "rgba(248,250,252,0.96)";
    bubble.el.style.color = "#0f172a";
    bubble.el.style.borderColor = "#7dd3fc";
    bubble.el.style.opacity = "1";
  }

  function createBubble(label: string, correct: boolean, lang: "la" | "de"): Bubble {
    const el = document.createElement("div");
    const span = document.createElement("span");
    span.textContent = label;
    span.lang = lang;
    el.append(span);
    const maxWidth = Math.min(210, Math.max(128, Math.floor((viewW - 52) / 2)));
    const minWidth = Math.min(maxWidth, 128);
    const minHeight = viewH < 390 ? 64 : 72;
    el.style.position = "absolute";
    el.style.left = "0";
    el.style.top = "0";
    el.style.boxSizing = "border-box";
    el.style.display = "flex";
    el.style.alignItems = "center";
    el.style.justifyContent = "center";
    el.style.width = "max-content";
    el.style.maxWidth = `${maxWidth}px`;
    el.style.minWidth = `${minWidth}px`;
    el.style.minHeight = `${minHeight}px`;
    el.style.padding = "14px 18px";
    el.style.borderRadius = "999px";
    el.style.border = "3px solid #7dd3fc";
    el.style.background = "rgba(248,250,252,0.96)";
    el.style.color = "#0f172a";
    el.style.textAlign = "center";
    el.style.fontFamily = "inherit";
    el.style.fontWeight = "700";
    el.style.fontSize = fontFor(label);
    el.style.lineHeight = "1.2";
    el.style.overflowWrap = "anywhere";
    el.style.pointerEvents = "none";
    el.style.userSelect = "none";
    el.className = "space-bubble";
    el.style.boxShadow = "0 10px 28px rgba(0,0,0,0.35)";
    el.style.transition = "background-color 120ms linear, color 120ms linear, border-color 120ms linear, opacity 120ms linear";
    overlay.append(el);
    return {
      el,
      correct,
      x: viewW / 2,
      y: viewH / 2,
      vx: 0,
      vy: 0,
      w: el.offsetWidth || minWidth,
      h: el.offsetHeight || minHeight,
      held: false,
    };
  }

  function clearBubbles() {
    for (const bubble of bubbles) bubble.el.remove();
    bubbles = [];
  }

  function layoutStack(list: readonly Bubble[]) {
    const reserve = viewH < 390 ? 72 : 90;
    const slots = shuffle([
      { x: viewW * 0.27, y: viewH * 0.68 },
      { x: viewW * 0.73, y: viewH * 0.68 },
      { x: viewW * 0.5, y: viewH * 0.34 },
    ]);
    list.forEach((bubble, index) => {
      const slot = slots[index] ?? { x: viewW / 2, y: viewH / 2 };
      bubble.x = clamp(slot.x, bubble.w / 2 + 8, viewW - bubble.w / 2 - 8);
      bubble.y = clamp(slot.y, bubble.h / 2 + 8, viewH - reserve);
      bubble.vx = 0;
      bubble.vy = -Math.max(24, viewH / 11);
    });
    for (let pass = 0; pass < 16; pass += 1) {
      for (let left = 0; left < list.length; left += 1) {
        for (let right = left + 1; right < list.length; right += 1) {
          const a = list[left];
          const b = list[right];
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const gap = 40;
          const overlapX = (a.w + b.w) / 2 + gap - Math.abs(dx);
          const overlapY = (a.h + b.h) / 2 + gap - Math.abs(dy);
          if (overlapX <= 0 || overlapY <= 0) continue;
          if (overlapX < overlapY) {
            const push = overlapX / 2;
            const sign = dx === 0 ? (left % 2 === 0 ? -1 : 1) : Math.sign(dx);
            a.x -= sign * push;
            b.x += sign * push;
          } else {
            const push = overlapY / 2;
            const sign = dy === 0 ? -1 : Math.sign(dy);
            a.y -= sign * push;
            b.y += sign * push;
          }
        }
      }
    }
    for (const bubble of list) {
      bubble.x = clamp(bubble.x, bubble.w / 2 + 6, viewW - bubble.w / 2 - 6);
      bubble.y = clamp(bubble.y, bubble.h / 2 + 6, viewH - 8);
    }
    for (let pass = 0; pass < 8; pass += 1) {
      for (let left = 0; left < list.length; left += 1) {
        for (let right = left + 1; right < list.length; right += 1) {
          const a = list[left];
          const b = list[right];
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const overlapX = (a.w + b.w) / 2 + 18 - Math.abs(dx);
          const overlapY = (a.h + b.h) / 2 + 22 - Math.abs(dy);
          if (overlapX <= 0 || overlapY <= 0) continue;
          const sign = dy === 0 ? -1 : Math.sign(dy);
          a.y -= sign * (overlapY / 2);
          b.y += sign * (overlapY / 2);
        }
      }
      for (const bubble of list) {
        bubble.y = clamp(bubble.y, bubble.h / 2 + 6, viewH - 8);
      }
    }
    let guard = 0;
    while (
      guard < 8
      && ship.ready
      && list.some((bubble) => circleHitsBubble(ship.x, ship.y, SHIP_R + 12, bubble))
      && list.every((bubble) => bubble.y - bubble.h / 2 > 8)
    ) {
      for (const bubble of list) bubble.y -= 14;
      guard += 1;
    }
    for (const bubble of list) place(bubble);
  }

  function circleHitsBubble(cx: number, cy: number, radius: number, bubble: Bubble): boolean {
    const insetX = Math.min(10, bubble.w * 0.1);
    const insetY = Math.min(8, bubble.h * 0.1);
    const left = bubble.x - bubble.w / 2 + insetX;
    const top = bubble.y - bubble.h / 2 + insetY;
    const right = bubble.x + bubble.w / 2 - insetX;
    const bottom = bubble.y + bubble.h / 2 - insetY;
    const nearestX = clamp(cx, left, Math.max(left, right));
    const nearestY = clamp(cy, top, Math.max(top, bottom));
    const dx = cx - nearestX;
    const dy = cy - nearestY;
    return dx * dx + dy * dy <= radius * radius;
  }

  function pullIn(bubble: Bubble) {
    const halfW = bubble.w / 2;
    const halfH = bubble.h / 2;
    const visible = bubble.x > halfW && bubble.x < viewW - halfW && bubble.y > halfH && bubble.y < viewH - halfH;
    if (!visible) {
      bubble.x = viewW / 2;
      bubble.y = Math.max(halfH + 8, viewH * 0.42);
    }
    place(bubble);
  }

  function showAnswerBubble(text: string, lang: "la" | "de") {
    clearBubbles();
    const bubble = createBubble(text, true, lang);
    paint(bubble, "correct");
    bubble.held = true;
    bubble.x = viewW / 2;
    bubble.y = Math.max(bubble.h / 2 + 8, viewH * 0.46);
    place(bubble);
    bubbles = [bubble];
  }

  function settle(correct: boolean, kind: "correct" | "wrong" | "miss", hit: Bubble | null) {
    if (resolved || ended || !current) return;
    resolved = true;
    if (correct) correctCount += 1;
    else {
      wrongCount += 1;
      lives = Math.max(0, lives - 1);
    }
    onAnswer(current.vocabId, correct);
    outcome = kind;
    phase = "feedback";
    feedbackLeft = FEEDBACK_TIME;
    const answerLang = current.promptLang === "la" ? "de" : "la";
    if (kind === "miss") showAnswerBubble(current.answer, answerLang);
    else {
      for (const bubble of bubbles) {
        bubble.held = true;
        bubble.vy = 0;
        if (kind === "correct") paint(bubble, bubble === hit ? "correct" : "dim");
        else if (bubble === hit) paint(bubble, "wrong");
        else if (bubble.correct) {
          paint(bubble, "correct");
          pullIn(bubble);
        } else paint(bubble, "dim");
      }
    }
    publishHud();
    publishBeat();
  }

  function beginDrift(seconds: number) {
    phase = "drift";
    driftLeft = seconds;
    outcome = null;
    current = null;
    resolved = false;
    clearBubbles();
    publishBeat();
  }

  function freeBubbleSpace() {
    for (const asteroid of asteroids) {
      if (!asteroid.alive) continue;
      const blocked = bubbles.some((bubble) => circleHitsBubble(asteroid.x, asteroid.y, asteroid.r, bubble));
      if (!blocked) continue;
      asteroid.alive = false;
      burst(asteroid.x, asteroid.y, "#fdba74");
    }
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
    armed = false;
    outcome = null;
    clearBubbles();
    const answerLang = item.promptLang === "la" ? "de" : "la";
    bubbles = shuffle(item.options).map((label) => createBubble(label, label === item.answer, answerLang));
    layoutStack(bubbles);
    freeBubbleSpace();
    publishBeat();
  }

  function spawnEdge(): Asteroid {
    const r = 18 + Math.random() * 16;
    const speed = 34 + Math.random() * 40;
    const edge = Math.floor(Math.random() * 4);
    let x = viewW / 2;
    let y = viewH / 2;
    let vx = 0;
    let vy = 0;
    if (edge === 0) {
      x = -r;
      y = Math.random() * viewH;
      vx = speed;
      vy = (Math.random() - 0.5) * speed;
    } else if (edge === 1) {
      x = viewW + r;
      y = Math.random() * viewH;
      vx = -speed;
      vy = (Math.random() - 0.5) * speed;
    } else if (edge === 2) {
      x = Math.random() * viewW;
      y = -r;
      vx = (Math.random() - 0.5) * speed;
      vy = speed * 0.75;
    } else {
      x = Math.random() * viewW;
      y = viewH + r;
      vx = (Math.random() - 0.5) * speed;
      vy = -speed * 0.75;
    }
    return { x, y, vx, vy, r, rot: Math.random() * Math.PI * 2, spin: (Math.random() - 0.5) * 1.4, verts: makeVerts(), alive: true };
  }

  function spawnInner(): Asteroid | null {
    const r = 20 + Math.random() * 16;
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const x = r + 8 + Math.random() * Math.max(1, viewW - r * 2 - 16);
      const y = r + 8 + Math.random() * Math.max(1, viewH * 0.52 - r);
      if (Math.hypot(x - ship.x, y - ship.y) < r + 110) continue;
      const angle = Math.random() * Math.PI * 2;
      const speed = 16 + Math.random() * 26;
      return {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        r,
        rot: Math.random() * Math.PI * 2,
        spin: (Math.random() - 0.5) * 1.1,
        verts: makeVerts(),
        alive: true,
      };
    }
    return null;
  }

  function prime() {
    if (primed || !ship.ready) return;
    primed = true;
    for (let index = 0; index < 4; index += 1) {
      const asteroid = spawnInner();
      if (asteroid) asteroids.push(asteroid);
    }
  }

  function aim(x: number, y: number) {
    target.x = clamp(x, 0, viewW);
    target.y = clamp(y, 0, viewH);
    target.ready = true;
    const dx = target.x - ship.x;
    const dy = target.y - ship.y;
    if (dx * dx + dy * dy > 64) ship.angle = Math.atan2(dy, dx);
  }

  function fire() {
    if (ended || shotCooldown > 0 || !ship.ready) return;
    shotCooldown = 0.14;
    const angle = ship.angle;
    shots.push({
      x: ship.x + Math.cos(angle) * 20,
      y: ship.y + Math.sin(angle) * 20,
      vx: Math.cos(angle) * 480,
      vy: Math.sin(angle) * 480,
      life: 1.15,
      alive: true,
    });
    burst(ship.x + Math.cos(angle) * 16, ship.y + Math.sin(angle) * 16, "#fef9c3");
  }

  function localPoint(event: PointerEvent) {
    const rect = field.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }

  function onDown(event: PointerEvent) {
    if (ended || event.button !== 0) return;
    event.preventDefault();
    const point = localPoint(event);
    tap = { id: event.pointerId, x: point.x, y: point.y, t: performance.now(), moved: false };
    aim(point.x, point.y);
    try {
      field.setPointerCapture(event.pointerId);
    } catch {
      // Capture can fail if the pointer already ended.
    }
  }

  function onMove(event: PointerEvent) {
    if (ended) return;
    const point = localPoint(event);
    if (tap && tap.id === event.pointerId && Math.hypot(point.x - tap.x, point.y - tap.y) > TAP_SLOP) tap.moved = true;
    if (event.pointerType === "touch" && tap?.id !== event.pointerId) return;
    aim(point.x, point.y);
  }

  function onUp(event: PointerEvent) {
    if (!tap || tap.id !== event.pointerId) return;
    const shoot = !tap.moved && performance.now() - tap.t <= TAP_MS;
    tap = null;
    if (shoot) fire();
  }

  function onCancel(event: PointerEvent) {
    if (tap?.id === event.pointerId) tap = null;
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
    if (!ship.ready && viewW > 40 && viewH > 40) {
      ship.x = viewW / 2;
      ship.y = Math.max(SHIP_R + 8, viewH - 36);
      target.x = ship.x;
      target.y = ship.y;
      ship.ready = true;
    } else if (ship.ready) {
      ship.x = clamp(ship.x, SHIP_R, Math.max(SHIP_R, viewW - SHIP_R));
      ship.y = clamp(ship.y, SHIP_R, Math.max(SHIP_R, viewH - SHIP_R));
    }
  }

  function update(dt: number) {
    if (ended) return;
    shotCooldown = Math.max(0, shotCooldown - dt);
    if (viewW < 40 || viewH < 40) return;
    prime();
    ship.invuln = Math.max(0, ship.invuln - dt);
    if (target.ready && ship.ready) {
      const follow = 1 - Math.exp(-14 * dt);
      ship.x += (target.x - ship.x) * follow;
      ship.y += (target.y - ship.y) * follow;
      const dx = target.x - ship.x;
      const dy = target.y - ship.y;
      if (dx * dx + dy * dy > 36) ship.angle = Math.atan2(dy, dx);
    }
    ship.x = clamp(ship.x, SHIP_R, Math.max(SHIP_R, viewW - SHIP_R));
    ship.y = clamp(ship.y, SHIP_R, Math.max(SHIP_R, viewH - SHIP_R));

    for (const shot of shots) {
      if (!shot.alive) continue;
      shot.x += shot.vx * dt;
      shot.y += shot.vy * dt;
      shot.life -= dt;
      if (shot.life <= 0) shot.alive = false;
    }
    for (const asteroid of asteroids) {
      if (!asteroid.alive) continue;
      asteroid.x += asteroid.vx * dt;
      asteroid.y += asteroid.vy * dt;
      asteroid.rot += asteroid.spin * dt;
      if (asteroid.x < -150 || asteroid.x > viewW + 150 || asteroid.y < -150 || asteroid.y > viewH + 150) asteroid.alive = false;
    }
    for (const bubble of bubbles) {
      if (bubble.held) continue;
      bubble.x += bubble.vx * dt;
      bubble.y += bubble.vy * dt;
    }
    for (const particle of particles) {
      particle.x += particle.vx * dt;
      particle.y += particle.vy * dt;
      particle.life -= dt;
    }

    for (const shot of shots) {
      if (!shot.alive) continue;
      for (const asteroid of asteroids) {
        if (!asteroid.alive) continue;
        if (Math.hypot(shot.x - asteroid.x, shot.y - asteroid.y) <= asteroid.r * 0.86 + 4) {
          shot.alive = false;
          asteroid.alive = false;
          burst(asteroid.x, asteroid.y, "#fdba74");
          break;
        }
      }
    }

    if (ship.ready) {
      for (const asteroid of asteroids) {
        if (!asteroid.alive) continue;
        if (Math.hypot(ship.x - asteroid.x, ship.y - asteroid.y) <= asteroid.r * 0.82 + SHIP_R) {
          asteroid.alive = false;
          burst(asteroid.x, asteroid.y, ship.invuln > 0 ? "#cbd5e1" : "#fb7185");
          if (ship.invuln <= 0) {
            ship.invuln = 0.7;
            hull = Math.max(0, hull - 1);
            publishHud();
          }
        }
      }
    }

    if (phase === "ask" && !resolved && ship.ready) {
      const hit = bubbles.find((bubble) => !bubble.held && circleHitsBubble(ship.x, ship.y, SHIP_R, bubble));
      if (!hit) armed = true;
      else if (armed) settle(hit.correct, hit.correct ? "correct" : "wrong", hit);
    }

    if (phase === "ask" && !resolved && bubbles.length > 0 && bubbles.every((bubble) => bubble.y + bubble.h / 2 < -12)) {
      settle(false, "miss", null);
    }

    if (ended) return;

    if (phase === "drift") {
      spawnLeft -= dt;
      if (spawnLeft <= 0 && asteroids.filter((asteroid) => asteroid.alive).length < 5) {
        asteroids.push(spawnEdge());
        spawnLeft = 0.8;
      }
      driftLeft -= dt;
      if (hull <= 0) {
        finish();
        return;
      }
      if (driftLeft <= 0) beginAsk();
    } else if (phase === "ask") {
      if (hull <= 0 && !resolved) {
        finish();
        return;
      }
    } else if (feedbackLeft > 0) {
      feedbackLeft -= dt;
      if (feedbackLeft <= 0) {
        clearBubbles();
        if (lives <= 0 || hull <= 0 || cursor >= items.length) finish();
        else beginDrift(NEXT_DRIFT);
      }
    }

    shots = shots.filter((shot) => shot.alive && shot.x > -50 && shot.x < viewW + 50 && shot.y > -50 && shot.y < viewH + 50);
    asteroids = asteroids.filter((asteroid) => asteroid.alive);
    particles = particles.filter((particle) => particle.life > 0);
    for (const bubble of bubbles) place(bubble);
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

  function draw() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, viewW, viewH);
    ctx.fillStyle = "#070b16";
    ctx.fillRect(0, 0, viewW, viewH);
    for (const star of stars) {
      ctx.globalAlpha = star.a;
      ctx.fillStyle = "#e2e8f0";
      ctx.fillRect(star.x * viewW, star.y * viewH, star.s, star.s);
    }
    ctx.globalAlpha = 1;
    for (const asteroid of asteroids) drawAsteroid(asteroid);
    ctx.lineCap = "round";
    for (const shot of shots) {
      if (!shot.alive) continue;
      const mag = Math.hypot(shot.vx, shot.vy) || 1;
      ctx.strokeStyle = "#fef08a";
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(shot.x, shot.y);
      ctx.lineTo(shot.x - (shot.vx / mag) * 16, shot.y - (shot.vy / mag) * 16);
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
      ctx.arc(particle.x, particle.y, 2.5, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.globalAlpha = 1;
    if (!ship.ready) return;
    if (ship.invuln > 0 && Math.floor(ship.invuln * 16) % 2 === 0) return;
    ctx.save();
    ctx.translate(ship.x, ship.y);
    ctx.rotate(ship.angle);
    ctx.beginPath();
    ctx.moveTo(18, 0);
    ctx.lineTo(-12, 10);
    ctx.lineTo(-6, 0);
    ctx.lineTo(-12, -10);
    ctx.closePath();
    ctx.fillStyle = ship.invuln > 0 ? "#fb7185" : "#e0f2fe";
    ctx.fill();
    ctx.lineWidth = 2;
    ctx.strokeStyle = "#38bdf8";
    ctx.stroke();
    ctx.restore();
  }

  function frame(now: number) {
    if (!running) return;
    const dt = Math.min(0.034, (now - last) / 1000);
    last = now;
    update(dt);
    if (viewW > 0 && viewH > 0) draw();
    if (running) raf = requestAnimationFrame(frame);
  }

  const observer = new ResizeObserver(() => resize());
  observer.observe(field);
  field.addEventListener("pointerdown", onDown);
  field.addEventListener("pointermove", onMove);
  field.addEventListener("pointerup", onUp);
  field.addEventListener("pointercancel", onCancel);
  field.addEventListener("contextmenu", onMenu);
  resize();
  publishHud();
  publishBeat();
  let last = performance.now();
  raf = requestAnimationFrame(frame);

  return () => {
    running = false;
    ended = true;
    cancelAnimationFrame(raf);
    observer.disconnect();
    field.removeEventListener("pointerdown", onDown);
    field.removeEventListener("pointermove", onMove);
    field.removeEventListener("pointerup", onUp);
    field.removeEventListener("pointercancel", onCancel);
    field.removeEventListener("contextmenu", onMenu);
    overlay.replaceChildren();
    bubbles = [];
  };
}
