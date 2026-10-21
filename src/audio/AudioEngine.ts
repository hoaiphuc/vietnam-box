import { SFX, type SfxId } from './sfx';

export type Bus = 'music' | 'sfx' | 'ambient';

export interface AudioSettings {
  master: number;
  music: number;
  sfx: number;
  ambient: number;
  muted: boolean;
}

const KEY = 'langque.audio';

export function loadAudioSettings(): AudioSettings {
  const d: AudioSettings = { master: 0.8, music: 0.55, sfx: 0.8, ambient: 0.7, muted: false };
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { ...d, ...JSON.parse(raw) };
  } catch {
    // localStorage có thể bị chặn — dùng mặc định.
  }
  return d;
}

export function saveAudioSettings(s: AudioSettings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    // bỏ qua
  }
}

export interface FilterOpts {
  type: BiquadFilterType;
  f: number;
  f2?: number;
  q?: number;
}

export interface ToneOpts {
  type?: OscillatorType;
  f: number;
  f2?: number;
  t: number;
  dur: number;
  peak: number;
  a?: number;
  filter?: FilterOpts;
}

export interface NoiseOpts {
  t: number;
  dur: number;
  peak: number;
  a?: number;
  filter?: FilterOpts;
  brown?: boolean;
}

/** Âm thanh tổng hợp hoàn toàn bằng Web Audio — không cần file âm thanh. */
export class AudioEngine {
  readonly ctx = new AudioContext();
  readonly bus: Record<Bus, GainNode>;
  readonly white: AudioBuffer;
  readonly brown: AudioBuffer;
  private master: GainNode;
  private reverbIn: GainNode;
  private last = new Map<SfxId, number>();
  private onVisibility = () => {
    if (document.hidden) void this.ctx.suspend();
    else void this.ctx.resume();
  };

  constructor(readonly settings: AudioSettings) {
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -12;
    comp.knee.value = 10;
    comp.ratio.value = 4;
    comp.connect(ctx.destination);
    this.master = ctx.createGain();
    this.master.connect(comp);

    const mk = () => {
      const g = ctx.createGain();
      g.connect(this.master);
      return g;
    };
    this.bus = { music: mk(), sfx: mk(), ambient: mk() };

    const conv = ctx.createConvolver();
    conv.buffer = this.impulse(2.4);
    this.reverbIn = ctx.createGain();
    this.reverbIn.connect(conv);
    const wet = ctx.createGain();
    wet.gain.value = 0.6;
    conv.connect(wet);
    wet.connect(this.master);

    this.white = this.makeNoise(2, false);
    this.brown = this.makeNoise(4, true);
    this.apply();
    document.addEventListener('visibilitychange', this.onVisibility);
    void ctx.resume();
  }

  get now() {
    return this.ctx.currentTime;
  }

  apply() {
    const s = this.settings;
    const t = this.now;
    this.master.gain.setTargetAtTime(s.muted ? 0 : s.master, t, 0.05);
    this.bus.music.gain.setTargetAtTime(s.music, t, 0.05);
    this.bus.sfx.gain.setTargetAtTime(s.sfx, t, 0.05);
    this.bus.ambient.gain.setTargetAtTime(s.ambient, t, 0.05);
  }

  dispose() {
    document.removeEventListener('visibilitychange', this.onVisibility);
    void this.ctx.close();
  }

  sendReverb(node: AudioNode, amount: number) {
    const g = this.ctx.createGain();
    g.gain.value = amount;
    node.connect(g);
    g.connect(this.reverbIn);
    return g;
  }

  /** Đầu ra tạm cho một âm thanh: âm lượng + vị trí trái/phải + vang. */
  out(bus: Bus, gain: number, pan = 0, rev = 0, life = 4): GainNode {
    const ctx = this.ctx;
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = pan;
    g.connect(p);
    p.connect(this.bus[bus]);
    const send = rev > 0 ? this.sendReverb(p, rev) : null;
    setTimeout(() => {
      g.disconnect();
      p.disconnect();
      send?.disconnect();
    }, life * 1000);
    return g;
  }

  play(id: SfxId, vol = 1, pan = 0) {
    const r = SFX[id];
    const now = this.now;
    if ((this.last.get(id) ?? -1) > now - (r.gap ?? 0.05)) return;
    this.last.set(id, now);
    if (this.settings.muted || vol <= 0.01 || this.ctx.state !== 'running') return;
    r.play(this, this.out('sfx', vol, pan, r.rev ?? 0.08), now + 0.01);
  }

  // ------------------------------------------------------------ khối dựng

  private env(p: AudioParam, t: number, a: number, peak: number, dur: number) {
    p.setValueAtTime(0.0001, t);
    p.linearRampToValueAtTime(peak, t + a);
    p.exponentialRampToValueAtTime(0.0001, t + Math.max(dur, a + 0.01));
  }

  private filter(f: FilterOpts | undefined, t: number, dur: number, next: AudioNode): AudioNode {
    if (!f) return next;
    const bq = this.ctx.createBiquadFilter();
    bq.type = f.type;
    bq.frequency.setValueAtTime(f.f, t);
    if (f.f2) bq.frequency.exponentialRampToValueAtTime(f.f2, t + dur);
    bq.Q.value = f.q ?? (f.type === 'bandpass' ? 1 : 0.7);
    bq.connect(next);
    return bq;
  }

  tone(dest: AudioNode, o: ToneOpts) {
    const ctx = this.ctx;
    const osc = ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f, o.t);
    if (o.f2) osc.frequency.exponentialRampToValueAtTime(o.f2, o.t + o.dur);
    const g = ctx.createGain();
    this.env(g.gain, o.t, o.a ?? 0.005, o.peak, o.dur);
    osc.connect(this.filter(o.filter, o.t, o.dur, g));
    g.connect(dest);
    osc.start(o.t);
    osc.stop(o.t + o.dur + 0.05);
    osc.onended = () => g.disconnect();
  }

  noise(dest: AudioNode, o: NoiseOpts) {
    const ctx = this.ctx;
    const src = ctx.createBufferSource();
    src.buffer = o.brown ? this.brown : this.white;
    const g = ctx.createGain();
    this.env(g.gain, o.t, o.a ?? 0.003, o.peak, o.dur);
    src.connect(this.filter(o.filter, o.t, o.dur, g));
    g.connect(dest);
    src.start(o.t, Math.random() * Math.max(0, src.buffer.duration - o.dur - 0.1));
    src.stop(o.t + o.dur + 0.05);
    src.onended = () => g.disconnect();
  }

  private impulse(sec: number) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * sec);
    const buf = this.ctx.createBuffer(2, len, rate);
    for (let ch = 0; ch < 2; ch++) {
      const d = buf.getChannelData(ch);
      for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
    }
    return buf;
  }

  private makeNoise(sec: number, brown: boolean) {
    const rate = this.ctx.sampleRate;
    const len = Math.floor(rate * sec);
    const buf = this.ctx.createBuffer(1, len, rate);
    const d = buf.getChannelData(0);
    let last = 0;
    for (let i = 0; i < len; i++) {
      const w = Math.random() * 2 - 1;
      if (brown) {
        last = (last + 0.02 * w) / 1.02;
        d[i] = last * 3.5;
      } else d[i] = w;
    }
    return buf;
  }
}
