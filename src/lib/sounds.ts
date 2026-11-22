/**
 * Short Weltraum cues. The shot stays very quiet. Right and wrong are small and distinct.
 * Playback starts only after a tap or click, which browsers require.
 */

type AudioCtor = typeof AudioContext;

let audio: AudioContext | null = null;

function ctor(): AudioCtor | null {
  if (typeof window === "undefined") return null;
  const host = window as Window & { webkitAudioContext?: AudioCtor };
  return window.AudioContext ?? host.webkitAudioContext ?? null;
}

function context(): AudioContext | null {
  const Ctx = ctor();
  if (!Ctx) return null;
  if (!audio || audio.state === "closed") audio = new Ctx();
  if (audio.state === "suspended") void audio.resume();
  return audio;
}

export function unlockSpaceSound(): void {
  context();
}

export function playShot(): void {
  const current = context();
  if (!current) return;
  const start = current.currentTime;
  sweep(current, start, 1400, 280, 0.09, "sawtooth", 0.018);
  click(current, start, 0.035, 0.012);
}

export function playBling(): void {
  const current = context();
  if (!current) return;
  const start = current.currentTime;
  note(current, start, 1175, 0.08, "sine", 0.05);
  note(current, start + 0.07, 1568, 0.14, "sine", 0.045);
}

export function playDood(): void {
  const current = context();
  if (!current) return;
  const start = current.currentTime;
  note(current, start, 233, 0.1, "triangle", 0.06);
  note(current, start + 0.11, 146, 0.18, "triangle", 0.055);
}

function note(current: AudioContext, start: number, freq: number, duration: number, type: OscillatorType, peak: number): void {
  const osc = current.createOscillator();
  const gain = current.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(gain).connect(current.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function sweep(
  current: AudioContext,
  start: number,
  from: number,
  to: number,
  duration: number,
  type: OscillatorType,
  peak: number,
): void {
  const osc = current.createOscillator();
  const filter = current.createBiquadFilter();
  const gain = current.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(to, start + duration);
  filter.type = "lowpass";
  filter.frequency.setValueAtTime(1800, start);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  osc.connect(filter).connect(gain).connect(current.destination);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function click(current: AudioContext, start: number, duration: number, peak: number): void {
  const length = Math.max(1, Math.floor(current.sampleRate * duration));
  const buffer = current.createBuffer(1, length, current.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i += 1) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
  const source = current.createBufferSource();
  const filter = current.createBiquadFilter();
  const gain = current.createGain();
  source.buffer = buffer;
  filter.type = "highpass";
  filter.frequency.setValueAtTime(900, start);
  gain.gain.setValueAtTime(peak, start);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  source.connect(filter).connect(gain).connect(current.destination);
  source.start(start);
  source.stop(start + duration);
}
