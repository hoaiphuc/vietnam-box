import Phaser from 'phaser';
import { DAY_LENGTH, MONTHS_PER_YEAR, START_HOUR } from './config';
import type { BuildingId, ResKey } from './data';
import type { DiscId } from './discoveries';
import type { SavedState } from './save';

export type Cost = Partial<Record<ResKey, number>>;

export interface HistoryEntry {
  time: number;
  text: string;
  at?: { x: number; y: number };
}

export class GameState {
  res: Record<ResKey, number> = { go: 12, tre: 6, rom: 0, dat: 0, gach: 0, thit: 0, ca: 0, chuoi: 8, thitNuong: 3, caNuong: 0, thoc: 0, com: 0, gom: 0, doDan: 0 };
  /** Những phát kiến làng đã tìm ra. */
  discovered = new Set<DiscId>();
  /** Vật phẩm làng đã từng có — cho bộ sưu tập. */
  seenRes = new Set((Object.keys(this.res) as ResKey[]).filter((k) => this.res[k] > 0));
  /** Trời hạn hán: lúa lớn chậm, dân hay cầu mưa. */
  drought = false;
  /** Lần cuối trời mưa (giây game). */
  lastRain = 0;
  /** Thời gian game đã trôi qua (giây game). */
  time = 0;
  speed = 1;
  lastSpeed = 1;
  stats = {
    wood: 0,
    hunted: 0,
    fish: 0,
    cooked: 0,
    wishes: 0,
    harvested: 0,
    pottery: 0,
    bricks: 0,
    straw: 0,
    upgraded: 0,
    woven: 0,
    plowed: 0,
    built: { lua: 0, kho: 0, nha: 0, mieu: 0, ruong: 0, chuong: 0, lo: 0, cho: 0, dinh: 0 } as Record<BuildingId, number>,
  };
  /** Điểm Phúc của Thành Hoàng — dùng cho quyền năng và báo mộng. */
  phuc = 30;
  phucMax = 100;
  rainUntil = 0;
  fishUntil = 0;

  toSave(): SavedState {
    return {
      res: { ...this.res },
      discovered: [...this.discovered],
      seenRes: [...this.seenRes],
      drought: this.drought,
      lastRain: this.lastRain,
      time: this.time,
      stats: this.stats,
      phuc: this.phuc,
      phucMax: this.phucMax,
      rainUntil: this.rainUntil,
      fishUntil: this.fishUntil,
      history: this.history,
    };
  }

  load(s: SavedState) {
    Object.assign(this.res, s.res);
    this.discovered = new Set(s.discovered);
    this.seenRes = new Set(s.seenRes);
    this.drought = s.drought;
    this.lastRain = s.lastRain;
    this.time = s.time;
    // Gộp từng lớp: bản lưu cũ có thể thiếu công trình mới (chuồng trâu…) — giữ số 0 mặc định cho chúng.
    const { built, ...rest } = s.stats as typeof this.stats;
    Object.assign(this.stats, rest);
    Object.assign(this.stats.built, built);
    this.phuc = s.phuc;
    this.phucMax = s.phucMax;
    this.rainUntil = s.rainUntil;
    this.fishUntil = s.fishUntil;
    this.history = s.history;
  }

  get raining() {
    return this.time < this.rainUntil;
  }
  get fishBoost() {
    return this.time < this.fishUntil;
  }
  has(d: DiscId) {
    return this.discovered.has(d);
  }
  /** Phiên chợ: tháng chẵn, 7–12 giờ. */
  get marketOpen() {
    const h = this.hour;
    return this.month % 2 === 0 && h >= 7 && h < 12;
  }
  /** Hội làng: bốn tháng một lần — tháng Hai, tháng Sáu, tháng Mười — 17–21 giờ. */
  get festival() {
    const h = this.hour;
    return this.month % 4 === 2 && h >= 17 && h < 21;
  }
  /** Tết Trung thu: rằm tháng Tám mỗi năm, 18–21 giờ. */
  get midAutumn() {
    const h = this.hour;
    return this.monthOfYear === 8 && h >= 18 && h < 21;
  }
  /** Tết: chiều tối tháng Chạp (tháng 12) từ 17 giờ, qua giao thừa lúc nửa đêm, tới 1 giờ sáng tháng Giêng. */
  get tet() {
    const h = this.hour;
    return (this.monthOfYear === 12 && h >= 17) || (this.monthOfYear === 1 && this.month > 1 && h < 1);
  }

  addPhuc(n: number) {
    this.phuc = Math.min(this.phucMax, this.phuc + n);
  }

  spendPhuc(n: number) {
    if (this.phuc < n) return false;
    this.phuc -= n;
    return true;
  }
  events = new Phaser.Events.EventEmitter();

  get totalHours() {
    return START_HOUR + (this.time / DAY_LENGTH) * 24;
  }
  /** Số tháng kể từ khi lập làng, bắt đầu từ 1 (mỗi vòng ngày đêm là một tháng). */
  get month() {
    return Math.floor(this.totalHours / 24) + 1;
  }
  /** Tháng trong năm, 1..12. */
  get monthOfYear() {
    return ((this.month - 1) % MONTHS_PER_YEAR) + 1;
  }
  /** Năm thứ mấy kể từ khi lập làng, bắt đầu từ 1. */
  get year() {
    return Math.floor((this.month - 1) / MONTHS_PER_YEAR) + 1;
  }
  get hour() {
    return this.totalHours % 24;
  }
  /** Tháng thứ mấy (kể từ khi lập làng) của một thời điểm game. */
  monthAt(t: number) {
    return Math.floor((START_HOUR + (t / DAY_LENGTH) * 24) / 24) + 1;
  }

  /** "Tháng 8 · Năm 2" cho một số tháng kể từ khi lập làng. */
  dateLabel(m: number) {
    return `Tháng ${((m - 1) % MONTHS_PER_YEAR) + 1} · Năm ${Math.floor((m - 1) / MONTHS_PER_YEAR) + 1}`;
  }

  /** "07:30" cho một thời điểm game. */
  clockAt(t: number) {
    const h = (START_HOUR + (t / DAY_LENGTH) * 24) % 24;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 6) * 10;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  /** "T8/N2 · 07:30" cho một thời điểm game. */
  stamp(t: number) {
    const m = this.monthAt(t);
    return `T${((m - 1) % MONTHS_PER_YEAR) + 1}/N${Math.floor((m - 1) / MONTHS_PER_YEAR) + 1} · ${this.clockAt(t)}`;
  }

  isSleepTime() {
    // Đêm ba mươi cả làng thức đón giao thừa.
    if (this.tet) return false;
    const h = this.hour;
    return h >= 21 || h < 5;
  }

  add(k: ResKey, n: number) {
    this.res[k] += n;
    if (k === 'go') this.stats.wood += n;
    if (k === 'ca') this.stats.fish += n;
  }

  canAfford(cost: Cost) {
    return (Object.keys(cost) as ResKey[]).every((k) => this.res[k] >= (cost[k] ?? 0));
  }

  pay(cost: Cost) {
    for (const k of Object.keys(cost) as ResKey[]) this.res[k] -= cost[k] ?? 0;
  }

  setSpeed(s: number) {
    if (s > 0) this.lastSpeed = s;
    this.speed = s;
  }

  togglePause() {
    this.setSpeed(this.speed === 0 ? this.lastSpeed : 0);
  }

  /** Sử làng: mọi sự kiện của thế giới, mới nhất ở đầu. */
  history: HistoryEntry[] = [];

  /** Ghi một sự kiện vào sử làng (kèm vị trí nếu có) và hiện thông báo. */
  log(msg: string, at?: { x: number; y: number }) {
    this.history.unshift({ time: this.time, text: msg, at });
    if (this.history.length > 300) this.history.pop();
    this.events.emit('log', msg);
  }

  /** Nhắc nhở thoáng qua cho người chơi — không ghi vào sử làng. */
  notify(msg: string) {
    this.events.emit('log', msg);
  }
}
