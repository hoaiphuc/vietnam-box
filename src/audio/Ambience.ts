import type { AudioEngine } from './AudioEngine';

export interface AmbienceInfo {
  hour: number;
  /** 0 = ngày, 1 = đêm. */
  night: number;
  /** Độ gần sông / đống lửa so với tâm màn hình, 0..1. */
  water: number;
  fire: number;
}

const r = (a: number, b: number) => a + Math.random() * (b - a);
const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** Âm thanh thiên nhiên: sông, gió, chim, dế, ếch, gà gáy, lửa reo. */
export class Ambience {
  private river: GainNode;
  private riverHi: GainNode;
  private wind: GainNode;
  private roar: GainNode;
  private timers = { cricket: 0, frog: 2, bird: 1, dove: 6, crackle: 0 };
  private lastHour = -1;

  constructor(private e: AudioEngine) {
    this.river = this.loop(true, 'lowpass', 700);
    this.riverHi = this.loop(false, 'bandpass', 1800);
    this.wind = this.loop(false, 'bandpass', 500, 0.4);
    this.roar = this.loop(true, 'lowpass', 260);

    // Gió thổi từng cơn.
    const lfo = e.ctx.createOscillator();
    lfo.frequency.value = 0.08;
    const depth = e.ctx.createGain();
    depth.gain.value = 0.018;
    lfo.connect(depth);
    depth.connect(this.wind.gain);
    lfo.start();
  }

  private loop(brown: boolean, type: BiquadFilterType, f: number, q = 0.7) {
    const ctx = this.e.ctx;
    const src = ctx.createBufferSource();
    src.buffer = brown ? this.e.brown : this.e.white;
    src.loop = true;
    const bq = ctx.createBiquadFilter();
    bq.type = type;
    bq.frequency.value = f;
    bq.Q.value = q;
    const g = ctx.createGain();
    g.gain.value = 0;
    src.connect(bq);
    bq.connect(g);
    g.connect(this.e.bus.ambient);
    src.start();
    return g;
  }

  update(dt: number, info: AmbienceInfo) {
    const e = this.e;
    const now = e.now;
    const day = 1 - info.night;
    const set = (g: GainNode, v: number) => g.gain.setTargetAtTime(v, now, 0.4);
    set(this.river, info.water * 0.5);
    set(this.riverHi, info.water * 0.04);
    set(this.wind, 0.025 + 0.015 * day);
    set(this.roar, info.fire * 0.22);

    const tm = this.timers;
    if (info.night > 0.3 && (tm.cricket -= dt) <= 0) {
      tm.cricket = r(0.2, 0.6);
      this.cricket(info.night);
    }
    if (info.night > 0.4 && info.water > 0.1 && (tm.frog -= dt) <= 0) {
      tm.frog = r(1.2, 3.5);
      this.frog(info.night * info.water);
    }
    if (day > 0.6 && (tm.bird -= dt) <= 0) {
      tm.bird = r(1.5, 5);
      this.bird(day);
    }
    if (day > 0.6 && (tm.dove -= dt) <= 0) {
      tm.dove = r(9, 18);
      this.dove(day);
    }
    if (info.fire > 0.05 && (tm.crackle -= dt) <= 0) {
      tm.crackle = r(0.03, 0.25);
      this.crackle(info.fire);
    }

    // Gà gáy lúc tờ mờ sáng.
    const h = info.hour;
    if (this.lastHour >= 0 && this.lastHour < 5.3 && h >= 5.3 && h < 7) this.rooster();
    if (this.lastHour >= 0 && this.lastHour < 6.1 && h >= 6.1 && h < 7) this.rooster();
    this.lastHour = h;
  }

  private cricket(level: number) {
    const e = this.e;
    const o = e.out('ambient', level * 0.06, r(-0.8, 0.8), 0.1);
    const f = pick([4200, 4500, 4900]);
    const t = e.now + 0.01;
    for (let i = 0; i < 3; i++) e.tone(o, { f, t: t + i * 0.045, dur: 0.03, peak: 1, a: 0.004 });
  }

  private frog(level: number) {
    const e = this.e;
    const o = e.out('ambient', level * 0.4, r(-0.6, 0.6), 0.15);
    const t = e.now + 0.01;
    for (let i = 0; i < 2; i++) {
      e.tone(o, {
        type: 'square',
        f: r(110, 150),
        f2: 90,
        t: t + i * 0.16,
        dur: 0.11,
        peak: 0.25,
        a: 0.01,
        filter: { type: 'lowpass', f: 600, q: 6 },
      });
    }
  }

  private bird(level: number) {
    const e = this.e;
    const o = e.out('ambient', level * 0.1, r(-0.9, 0.9), 0.25);
    let t = e.now + 0.01;
    const n = 2 + Math.floor(Math.random() * 4);
    const base = r(2600, 4200);
    for (let i = 0; i < n; i++) {
      const f = base * r(0.85, 1.15);
      const d = r(0.05, 0.12);
      e.tone(o, { f, f2: f * r(0.7, 1.35), t, dur: d, peak: 0.5, a: 0.01 });
      t += d + r(0.03, 0.09);
    }
  }

  /** Chim cu gáy: "cúc cu… cu". */
  private dove(level: number) {
    const e = this.e;
    const o = e.out('ambient', level * 0.08, r(-0.7, 0.7), 0.3);
    const t = e.now + 0.01;
    e.tone(o, { f: 520, f2: 470, t, dur: 0.25, peak: 0.25, a: 0.04 });
    e.tone(o, { f: 480, f2: 430, t: t + 0.35, dur: 0.35, peak: 0.25, a: 0.05 });
    e.tone(o, { f: 470, f2: 420, t: t + 0.9, dur: 0.25, peak: 0.2, a: 0.04 });
  }

  /** "Ò ó o o". */
  private rooster() {
    const e = this.e;
    const o = e.out('ambient', 0.12, r(-0.5, 0.5), 0.35);
    const t = e.now + 0.05;
    const filter = { type: 'bandpass' as BiquadFilterType, f: 1400, q: 2 };
    e.tone(o, { type: 'sawtooth', f: 560, f2: 600, t, dur: 0.18, peak: 0.6, a: 0.02, filter });
    e.tone(o, { type: 'sawtooth', f: 700, f2: 760, t: t + 0.22, dur: 0.25, peak: 0.7, a: 0.02, filter });
    e.tone(o, { type: 'sawtooth', f: 800, f2: 600, t: t + 0.5, dur: 0.75, peak: 0.7, a: 0.03, filter });
  }

  private crackle(level: number) {
    const e = this.e;
    const o = e.out('ambient', level * r(0.1, 0.35), r(-0.3, 0.3), 0.05);
    e.noise(o, { t: e.now + 0.01, dur: r(0.004, 0.02), peak: 1, a: 0.001, filter: { type: 'highpass', f: r(1500, 4000) } });
  }
}
