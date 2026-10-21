import Phaser from 'phaser';
import { DAY_LENGTH, START_HOUR } from './config';
import type { BuildingId, ResKey } from './data';

export type Cost = Partial<Record<ResKey, number>>;

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
    built: { lua: 0, kho: 0, nha: 0 } as Record<BuildingId, number>,
  };
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

  log(msg: string) {
    this.events.emit('log', msg);
  }
}
