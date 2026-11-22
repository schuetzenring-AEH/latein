/**
 * Weltraum cues. The shot stays very quiet. Right and wrong are longer and layered
 * so they sound less like a single beep. Playback starts only after a tap or click.
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
  chime(current, start, 784, 0.5, 0.04);
  chime(current, start + 0.2, 1175, 0.62, 0.036);
  click(current, start, 0.025, 0.008);
  click(current, start + 0.2, 0.02, 0.006);
}

export function playDood(): void {
  const current = context();
  if (!current) return;
  const start = current.currentTime;
  vowel(current, start, 262, 196, 0.34, 0.05);
  vowel(current, start + 0.32, 175, 98, 0.5, 0.046);
}

function chime(current: AudioContext, start: number, freq: number, duration: number, peak: number): void {
  tone(current, start, freq, freq * 0.975, duration, peak, "sine");
  tone(current, start, freq * 2.01, freq * 1.9, duration * 0.55, peak * 0.32, "sine");
  tone(current, start, freq * 2.99, freq * 2.7, duration * 0.28, peak * 0.14, "sine");
}

function vowel(current: AudioContext, start: number, from: number, to: number, duration: number, peak: number): void {
  const filter = current.createBiquadFilter();
  const gain = current.createGain();
  filter.type = "lowpass";
  filter.Q.setValueAtTime(0.8, start);
  filter.frequency.setValueAtTime(1600, start);
  filter.frequency.exponentialRampToValueAtTime(380, start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + 0.045);
  gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
  voice(current, filter, start, from, to, duration);
  voice(current, filter, start, from * 1.006, to * 1.004, duration);
  tone(current, start, from / 2, Math.max(40, to / 2), duration, peak * 0.22, "triangle");
  filter.connect(gain).connect(current.destination);
}

function voice(current: AudioContext, filter: BiquadFilterNode, start: number, from: number, to: number, duration: number): void {
  const osc = current.createOscillator();
  const gain = current.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), start + duration);
  gain.gain.setValueAtTime(0.45, start);
  osc.connect(gain).connect(filter);
  osc.start(start);
  osc.stop(start + duration + 0.02);
}

function tone(
  current: AudioContext,
  start: number,
  from: number,
  to: number,
  duration: number,
  peak: number,
  type: OscillatorType,
): void {
  const osc = current.createOscillator();
  const gain = current.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(from, start);
  osc.frequency.exponentialRampToValueAtTime(Math.max(40, to), start + duration);
  gain.gain.setValueAtTime(0.0001, start);
  gain.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + 0.03);
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
