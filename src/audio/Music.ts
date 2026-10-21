import type { AudioEngine } from './AudioEngine';
import { flute, mtof, pad, pluck } from './instruments';

/** Ngũ cung điệu Bắc (Hò Xự Xang Xê Cống ~ C D F G A), từ D4 tới C6. */
const SCALE = [62, 65, 67, 69, 72, 74, 77, 79, 81, 84];
/** Cuối câu nhạc dừng ở C5, G4 hoặc G5. */
const CADENCE = [4, 4, 2, 7];
/** Tiết tấu 2 ô nhịp, tính theo móc đơn; số âm là dấu lặng. */
const RHYTHMS = [
  [2, 1, 1, 2, 2, 4, 4],
  [1, 1, 2, 1, 1, 2, 4, -4],
  [3, 1, 2, 2, 2, 2, 4],
  [2, 2, 2, 2, 1, 1, 2, 4],
  [4, 2, 2, 3, 1, 4],
  [1, 1, 1, 1, 2, 2, 4, -4],
  [2, -1, 1, 2, 2, 6, -2],
];
/** Nốt gốc bè trầm cho từng ô nhịp (C3, F3, G3). */
const PROG = [
  [48, 53],
  [48, 55],
  [53, 48],
  [55, 48],
  [48, 48],
];
const STEPS = [-2, -1, -1, 0, 1, 1, 2];

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

/** Nhạc nền sinh ngẫu nhiên: đàn tranh và sáo trúc trên thang ngũ cung. */
export class Music {
  private out: GainNode;
  private timer = 0;
  private next = 0;
  private idx = 4;
  private night = 0;
  private restLast = false;

  constructor(private e: AudioEngine) {
    this.out = e.ctx.createGain();
    this.out.connect(e.bus.music);
    e.sendReverb(this.out, 0.4);
  }

  start() {
    if (this.timer) return;
    this.next = this.e.now + 0.8;
    this.timer = window.setInterval(() => this.tick(), 100);
  }

  stop() {
    clearInterval(this.timer);
    this.timer = 0;
  }

  /** 0 = ngày, 1 = đêm: đêm nhạc chậm, nhỏ và chỉ có sáo. */
  setNight(n: number) {
    this.night = n;
  }

  private tick() {
    if (this.e.ctx.state !== 'running') return;
    const now = this.e.now;
    if (this.next < now) this.next = now + 0.1;
    while (this.next < now + 1.2) this.phrase();
  }

  private phrase() {
    const e = this.e;
    const out = this.out;
    const t0 = this.next;
    const e8 = 60 / (76 - this.night * 16) / 2;
    const soft = 1 - this.night * 0.35;

    const prog = pick(PROG);
    for (let b = 0; b < 2; b++) {
      const root = prog[b];
      const tb = t0 + b * 8 * e8;
      pluck(e, out, tb, mtof(root), 0.16 * soft, { dur: 3 });
      pluck(e, out, tb + 4 * e8, mtof(root + 7), 0.1 * soft, { dur: 2 });
      pad(e, out, tb, [mtof(root + 12), mtof(root + 19)], 8 * e8, 0.018 * soft);
    }
    this.next = t0 + 16 * e8;

    // Thỉnh thoảng nghỉ một câu cho thoáng.
    if (!this.restLast && Math.random() < 0.2) {
      this.restLast = true;
      return;
    }
    this.restLast = false;

    const useFlute = this.night > 0.5 || Math.random() < 0.35;
    const rhythm = pick(RHYTHMS);
    const total = rhythm.filter((x) => x > 0).length;
    let n = 0;
    let t = t0;
    for (const len of rhythm) {
      if (len < 0) {
        t += -len * e8;
        continue;
      }
      n++;
      this.idx = n === total ? pick(CADENCE) : Math.max(0, Math.min(SCALE.length - 1, this.idx + pick(STEPS)));
      const f = mtof(SCALE[this.idx]);
      const dur = len * e8;
      if (useFlute) {
        flute(e, out, t, f, dur * 0.95, 0.11 * soft);
      } else {
        const vel = 0.22 * soft * (0.8 + Math.random() * 0.3);
        if (len >= 4 && Math.random() < 0.25) {
          // vê dây (tremolo)
          for (let k = 0; k * 0.11 < dur * 0.8; k++) pluck(e, out, t + k * 0.11, f, Math.max(0.04, vel * (1 - k * 0.06)), { dur: 0.3 });
        } else {
          const nextF = mtof(SCALE[Math.min(this.idx + 1, SCALE.length - 1)]);
          const bend = len >= 2 && Math.random() < 0.35 ? nextF / f : undefined;
          pluck(e, out, t, f, vel, { dur, bendRatio: bend });
        }
      }
      t += dur;
    }
  }
}
