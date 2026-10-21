import type { AudioEngine } from './AudioEngine';
import { bell, mtof, pluck } from './instruments';

export type SfxId =
  | 'chop'
  | 'treeFall'
  | 'bambooFall'
  | 'rustle'
  | 'pick'
  | 'cast'
  | 'catch'
  | 'cluck'
  | 'grunt'
  | 'pounce'
  | 'caught'
  | 'sizzle'
  | 'hammer'
  | 'deposit'
  | 'eat'
  | 'levelUp'
  | 'quest'
  | 'built'
  | 'place'
  | 'click'
  | 'select'
  | 'pray'
  | 'bless'
  | 'thunder'
  | 'drum';

interface Recipe {
  /** Lượng vang (reverb). */
  rev?: number;
  /** Khoảng cách tối thiểu giữa hai lần phát cùng loại (giây). */
  gap?: number;
  play: (e: AudioEngine, out: AudioNode, t: number) => void;
}

const r = (a: number, b: number) => a + Math.random() * (b - a);

export const SFX: Record<SfxId, Recipe> = {
  chop: {
    play: (e, o, t) => {
      const k = r(0.9, 1.1);
      e.noise(o, { t, dur: 0.08, peak: 0.5, filter: { type: 'bandpass', f: 1300 * k, q: 1.4 } });
      e.tone(o, { f: 190 * k, f2: 70, t, dur: 0.12, peak: 0.7 });
      e.tone(o, { type: 'triangle', f: 420 * k, f2: 300, t, dur: 0.05, peak: 0.25 });
    },
  },
  treeFall: {
    rev: 0.25,
    play: (e, o, t) => {
      e.tone(o, { type: 'sawtooth', f: 140, f2: 90, t, dur: 0.45, peak: 0.06, a: 0.1, filter: { type: 'lowpass', f: 700 } });
      e.noise(o, { t: t + 0.1, dur: 0.6, peak: 0.25, a: 0.2, filter: { type: 'bandpass', f: 2500, f2: 600, q: 0.7 } });
      e.tone(o, { f: 110, f2: 38, t: t + 0.55, dur: 0.5, peak: 1 });
      e.noise(o, { t: t + 0.55, dur: 0.35, peak: 0.45, filter: { type: 'lowpass', f: 500 } });
    },
  },
  bambooFall: {
    rev: 0.2,
    play: (e, o, t) => {
      e.noise(o, { t, dur: 0.45, peak: 0.2, a: 0.12, filter: { type: 'bandpass', f: 3200, f2: 900, q: 0.8 } });
      for (let i = 0; i < 3; i++) e.tone(o, { type: 'triangle', f: r(600, 900), t: t + 0.4 + i * 0.07, dur: 0.08, peak: 0.25 });
    },
  },
  rustle: {
    play: (e, o, t) => e.noise(o, { t, dur: 0.2, peak: 0.12, a: 0.05, filter: { type: 'bandpass', f: r(2500, 4000), q: 0.9 } }),
  },
  pick: {
    play: (e, o, t) => {
      e.tone(o, { f: 380, f2: 950, t, dur: 0.09, peak: 0.35 });
      e.noise(o, { t, dur: 0.12, peak: 0.1, filter: { type: 'highpass', f: 3000 } });
    },
  },
  cast: {
    play: (e, o, t) => {
      e.noise(o, { t, dur: 0.25, peak: 0.12, a: 0.08, filter: { type: 'bandpass', f: 2200, f2: 700 } });
      e.tone(o, { f: 700, f2: 180, t: t + 0.32, dur: 0.12, peak: 0.3 });
      e.noise(o, { t: t + 0.32, dur: 0.15, peak: 0.15, filter: { type: 'lowpass', f: 1200 } });
    },
  },
  catch: {
    rev: 0.15,
    play: (e, o, t) => {
      e.noise(o, { t, dur: 0.4, peak: 0.35, filter: { type: 'lowpass', f: 3000, f2: 400 } });
      e.tone(o, { f: 260, f2: 820, t: t + 0.05, dur: 0.16, peak: 0.3 });
    },
  },
  cluck: {
    gap: 0.15,
    play: (e, o, t) => {
      const n = 2 + Math.floor(Math.random() * 3);
      let tt = t;
      for (let i = 0; i < n; i++) {
        const f = r(650, 900);
        e.tone(o, { type: 'square', f, f2: f * 0.75, t: tt, dur: 0.06, peak: 0.07, filter: { type: 'bandpass', f: 1400, q: 1.5 } });
        tt += r(0.08, 0.13);
      }
    },
  },
  grunt: {
    gap: 0.3,
    play: (e, o, t) => {
      for (let i = 0; i < 2; i++) {
        e.tone(o, {
          type: 'sawtooth',
          f: r(80, 100),
          f2: 60,
          t: t + i * 0.22,
          dur: 0.18,
          peak: 0.25,
          a: 0.02,
          filter: { type: 'lowpass', f: 450, q: 4 },
        });
      }
    },
  },
  pounce: {
    play: (e, o, t) => e.noise(o, { t, dur: 0.2, peak: 0.2, a: 0.08, filter: { type: 'bandpass', f: 700, f2: 2400 } }),
  },
  caught: {
    rev: 0.3,
    play: (e, o, t) => {
      bell(e, o, t, mtof(79), 0.18, 0.6);
      bell(e, o, t + 0.1, mtof(84), 0.18, 0.8);
    },
  },
  sizzle: {
    gap: 0.2,
    play: (e, o, t) => {
      for (let i = 0; i < 5; i++) {
        e.noise(o, {
          t: t + i * 0.07 + Math.random() * 0.04,
          dur: r(0.04, 0.12),
          peak: r(0.03, 0.08),
          filter: { type: 'highpass', f: r(4000, 7000) },
        });
      }
    },
  },
  hammer: {
    play: (e, o, t) => {
      const k = r(0.92, 1.08);
      e.tone(o, { type: 'triangle', f: 950 * k, f2: 760 * k, t, dur: 0.07, peak: 0.3 });
      e.tone(o, { f: 220 * k, f2: 120, t, dur: 0.07, peak: 0.45 });
      e.noise(o, { t, dur: 0.03, peak: 0.25, filter: { type: 'highpass', f: 2500 } });
    },
  },
  deposit: {
    play: (e, o, t) => {
      e.tone(o, { type: 'triangle', f: 520, t, dur: 0.06, peak: 0.25 });
      e.tone(o, { type: 'triangle', f: 780, t: t + 0.07, dur: 0.08, peak: 0.22 });
    },
  },
  eat: {
    play: (e, o, t) => {
      e.tone(o, { f: 320, f2: 240, t, dur: 0.08, peak: 0.22, filter: { type: 'lowpass', f: 900 } });
      e.tone(o, { f: 300, f2: 220, t: t + 0.14, dur: 0.08, peak: 0.2, filter: { type: 'lowpass', f: 900 } });
    },
  },
  levelUp: {
    rev: 0.4,
    gap: 0.4,
    play: (e, o, t) => [72, 74, 77, 79, 84].forEach((m, i) => bell(e, o, t + i * 0.08, mtof(m), 0.16, 1)),
  },
  quest: {
    rev: 0.45,
    gap: 0.5,
    play: (e, o, t) => {
      [72, 77, 81, 84].forEach((m, i) => bell(e, o, t + i * 0.11, mtof(m), 0.18, 1.4));
      bell(e, o, t + 0.5, mtof(96), 0.06, 1.6);
    },
  },
  built: {
    rev: 0.4,
    gap: 0.4,
    play: (e, o, t) => {
      for (const m of [60, 67, 72]) pluck(e, o, t, mtof(m), 0.25, { dur: 1.5 });
      bell(e, o, t + 0.15, mtof(84), 0.12, 1.2);
    },
  },
  place: {
    play: (e, o, t) => {
      e.tone(o, { f: 150, f2: 55, t, dur: 0.18, peak: 0.7 });
      e.noise(o, { t, dur: 0.1, peak: 0.3, filter: { type: 'lowpass', f: 700 } });
    },
  },
  click: {
    gap: 0.03,
    play: (e, o, t) => e.tone(o, { f: 1100, f2: 900, t, dur: 0.04, peak: 0.12 }),
  },
  select: {
    play: (e, o, t) => {
      e.tone(o, { f: 660, f2: 990, t, dur: 0.08, peak: 0.15 });
      e.tone(o, { f: 990, t: t + 0.06, dur: 0.1, peak: 0.1 });
    },
  },
  /** Chuông miếu ngân dài. */
  pray: {
    rev: 0.5,
    gap: 1,
    play: (e, o, t) => {
      bell(e, o, t, mtof(57), 0.3, 3.2);
      bell(e, o, t, mtof(57) * 1.003, 0.12, 2.5);
    },
  },
  /** Ban phép: lấp lánh đi lên. */
  bless: {
    rev: 0.5,
    gap: 0.3,
    play: (e, o, t) => {
      [72, 77, 79, 84, 86, 89].forEach((m, i) => bell(e, o, t + i * 0.06, mtof(m), 0.1, 0.9));
      e.noise(o, { t, dur: 0.8, peak: 0.05, a: 0.3, filter: { type: 'highpass', f: 6000 } });
    },
  },
  /** Sấm rền xa xa. */
  /** Trống hội: "tùng… tùng tùng… tùng". */
  drum: {
    rev: 0.35,
    gap: 1,
    play: (e, o, t) => {
      for (const [dt, k] of [
        [0, 1],
        [0.45, 0.8],
        [0.68, 0.85],
        [1.15, 1],
      ]) {
        e.tone(o, { f: 105 * k, f2: 52, t: t + dt, dur: 0.35, peak: 1 });
        e.noise(o, { t: t + dt, dur: 0.08, peak: 0.35, filter: { type: 'lowpass', f: 600 } });
      }
    },
  },
  thunder: {
    rev: 0.4,
    gap: 2,
    play: (e, o, t) => {
      e.noise(o, { t, dur: 2.4, peak: 0.6, a: 0.25, brown: true, filter: { type: 'lowpass', f: 300, f2: 90 } });
      e.noise(o, { t: t + 0.3, dur: 1.4, peak: 0.35, a: 0.05, brown: true, filter: { type: 'lowpass', f: 500, f2: 120 } });
    },
  },
};
