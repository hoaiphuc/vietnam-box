import type { AudioEngine } from './AudioEngine';

export const mtof = (m: number) => 440 * Math.pow(2, (m - 69) / 12);

/** Tiếng gảy kiểu đàn tranh. `bendRatio`: nhấn dây lên nốt kế tiếp. */
export function pluck(
  e: AudioEngine,
  out: AudioNode,
  t: number,
  f: number,
  vel: number,
  opts: { dur?: number; bendRatio?: number } = {},
) {
  const ctx = e.ctx;
  const dur = opts.dur ?? 1;
  const len = Math.min(2.6, dur + 1.2);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.004);
  g.gain.exponentialRampToValueAtTime(vel * 0.35, t + 0.2);
  g.gain.exponentialRampToValueAtTime(0.0001, t + len);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.setValueAtTime(Math.min(9000, f * 8), t);
  lp.frequency.exponentialRampToValueAtTime(Math.max(400, f * 2), t + 0.5);
  lp.connect(g);
  g.connect(out);

  const partials: [OscillatorType, number, number][] = [
    ['triangle', 1, 1],
    ['sine', 2, 0.35],
    ['sine', 3, 0.12],
    ['sine', 4.02, 0.05],
  ];
  for (const [type, ratio, amp] of partials) {
    const o = ctx.createOscillator();
    o.type = type;
    const fq = o.frequency;
    fq.setValueAtTime(f * ratio, t);
    if (opts.bendRatio) {
      fq.setValueAtTime(f * ratio, t + 0.12);
      fq.linearRampToValueAtTime(f * ratio * opts.bendRatio, t + 0.3);
      fq.setValueAtTime(f * ratio * opts.bendRatio, t + Math.max(0.31, dur * 0.6));
      fq.linearRampToValueAtTime(f * ratio, t + Math.max(0.45, dur * 0.9));
    }
    const og = ctx.createGain();
    og.gain.value = amp;
    o.connect(og);
    og.connect(lp);
    o.start(t);
    o.stop(t + len + 0.05);
    if (ratio === 1) o.onended = () => g.disconnect();
  }
}

/** Sáo trúc: hơi thở, vuốt nốt và rung nhẹ. */
export function flute(e: AudioEngine, out: AudioNode, t: number, f: number, dur: number, vel: number) {
  const ctx = e.ctx;
  const end = t + dur;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vel, t + 0.08);
  g.gain.linearRampToValueAtTime(vel * 0.85, Math.max(t + 0.09, end));
  g.gain.exponentialRampToValueAtTime(0.0001, end + 0.25);
  const lp = ctx.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 2800;
  lp.connect(g);
  g.connect(out);

  const lfo = ctx.createOscillator();
  lfo.frequency.value = 5.3;
  const depth = ctx.createGain();
  depth.gain.setValueAtTime(0, t);
  depth.gain.linearRampToValueAtTime(0, t + 0.25);
  depth.gain.linearRampToValueAtTime(f * 0.01, t + 0.6);
  lfo.connect(depth);

  const parts: [OscillatorType, number, number][] = [
    ['sine', 1, 1],
    ['triangle', 1, 0.18],
    ['sine', 2, 0.08],
  ];
  for (const [type, ratio, amp] of parts) {
    const o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(f * ratio * 0.96, t);
    o.frequency.linearRampToValueAtTime(f * ratio, t + 0.07);
    if (ratio === 1) depth.connect(o.frequency);
    const og = ctx.createGain();
    og.gain.value = amp;
    o.connect(og);
    og.connect(lp);
    o.start(t);
    o.stop(end + 0.3);
    if (ratio === 1 && type === 'sine') {
      o.onended = () => {
        g.disconnect();
        depth.disconnect();
      };
    }
  }
  lfo.start(t);
  lfo.stop(end + 0.3);

  // tiếng hơi thổi
  const src = ctx.createBufferSource();
  src.buffer = e.white;
  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = f * 1.5;
  bp.Q.value = 1.2;
  const bg = ctx.createGain();
  bg.gain.setValueAtTime(0.0001, t);
  bg.gain.linearRampToValueAtTime(vel * 0.25, t + 0.03);
  bg.gain.linearRampToValueAtTime(vel * 0.05, t + 0.15);
  bg.gain.linearRampToValueAtTime(0.0001, end + 0.1);
  src.connect(bp);
  bp.connect(bg);
  bg.connect(out);
  src.start(t, Math.random());
  src.stop(end + 0.15);
  src.onended = () => bg.disconnect();
}

export function pad(e: AudioEngine, out: AudioNode, t: number, freqs: number[], dur: number, vel: number) {
  const ctx = e.ctx;
  for (const f of freqs) {
    for (const detune of [-5, 5]) {
      const o = ctx.createOscillator();
      o.frequency.value = f;
      o.detune.value = detune;
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(vel, t + 0.6);
      g.gain.setValueAtTime(vel, t + Math.max(0.61, dur - 0.2));
      g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.8);
      o.connect(g);
      g.connect(out);
      o.start(t);
      o.stop(t + dur + 0.85);
      o.onended = () => g.disconnect();
    }
  }
}

export function bell(e: AudioEngine, out: AudioNode, t: number, f: number, peak: number, dur = 1.2) {
  e.tone(out, { f, t, dur, peak, a: 0.004 });
  e.tone(out, { f: f * 2.76, t, dur: dur * 0.5, peak: peak * 0.25, a: 0.002 });
  e.tone(out, { f: f * 5.4, t, dur: dur * 0.25, peak: peak * 0.08, a: 0.002 });
}
