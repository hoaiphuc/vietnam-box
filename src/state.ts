import Phaser from 'phaser';
import { DAY_LENGTH, START_HOUR } from './config';
import type { BuildingId, ResKey } from './data';

export type Cost = Partial<Record<ResKey, number>>;

export interface HistoryEntry {
  time: number;
  text: string;
  at?: { x: number; y: number };
}

export class GameState {
  res: Record<ResKey, number> = { go: 12, thit: 0, ca: 0, chuoi: 8, thitNuong: 3, caNuong: 0 };
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
    built: { lua: 0, kho: 0, nha: 0, mieu: 0 } as Record<BuildingId, number>,
  };
  /** Điểm Phúc của Thành Hoàng — dùng cho quyền năng và báo mộng. */
  phuc = 30;
  phucMax = 100;
  rainUntil = 0;
  fishUntil = 0;

  get raining() {
    return this.time < this.rainUntil;
  }
  get fishBoost() {
    return this.time < this.fishUntil;
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
  get day() {
    return Math.floor(this.totalHours / 24) + 1;
  }
  get hour() {
    return this.totalHours % 24;
  }
  /** Ngày thứ mấy của một thời điểm game. */
  dayAt(t: number) {
    return Math.floor((START_HOUR + (t / DAY_LENGTH) * 24) / 24) + 1;
  }

  /** "07:30" cho một thời điểm game. */
  clockAt(t: number) {
    const h = (START_HOUR + (t / DAY_LENGTH) * 24) % 24;
    const hh = Math.floor(h);
    const mm = Math.floor((h - hh) * 6) * 10;
    return `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`;
  }

  /** "N2 · 07:30" cho một thời điểm game. */
  stamp(t: number) {
    return `N${this.dayAt(t)} · ${this.clockAt(t)}`;
  }

  isSleepTime() {
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
