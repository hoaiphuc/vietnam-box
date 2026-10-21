import Phaser from 'phaser';
import { ENERGY_DRAIN, FONT, HUNGER_RATE, SLEEP_RATE, TILE } from '../config';
import { JOBS, RESOURCES, SKILL_JOBS, type JobId, type ResKey } from '../data';
import type { FishingSpot, GameScene } from '../scenes/GameScene';

/** Hành vi: mỗi `yield` là một khung hình, giá trị nhận lại là dt (giây game). */
type Beh = Generator<undefined, void, number>;
type Step = Generator<undefined, boolean, number>;

export interface Skill {
  level: number;
  xp: number;
}

export interface VillagerDef {
  id: string;
  name: string;
  role: string;
  avatar: string;
  tex: string;
  job: JobId;
  skills: Partial<Record<JobId, number>>;
  child?: boolean;
}

export const MAX_LEVEL = 10;
export const xpNeed = (lv: number) => 12 + lv * 10;

const RELAX_LINES = ['Ngồi hóng gió bờ tre 🎋', 'Ngắm mây trôi ☁️', 'Ngân nga câu hò 🎶', 'Pha ấm trà ☕', 'Ngồi đan rổ 🧺'];
const CHILD_LINES = ['Thả diều 🪁', 'Đuổi bắt chuồn chuồn', 'Nhảy dây', 'Hái hoa ven đường 🌼'];

export class Villager {
  x: number;
  y: number;
  hunger = 80;
  energy = 90;
  job: JobId;
  skills = {} as Record<JobId, Skill>;
  status = 'Đang nghĩ xem làm gì';
  carry: { res: ResKey; amount: number } | null = null;
  asleep = false;
  inside = false;

  private holding: string | null = null;
  private progress: number | null = null;
  private fishSpot: FishingSpot | null = null;
  private beh: Beh | null = null;
  private moving = false;
  private working = false;
  private phase = 0;
  private ox = Phaser.Math.Between(-5, 5);
  private oy = Phaser.Math.Between(-4, 4);

  private container: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Image;
  private ring: Phaser.GameObjects.Image;
  private icon: Phaser.GameObjects.Text;
  private gfx: Phaser.GameObjects.Graphics;

  constructor(
    private scene: GameScene,
    readonly def: VillagerDef,
    tx: number,
    ty: number,
  ) {
    this.x = tx * TILE + TILE / 2;
    this.y = ty * TILE + TILE / 2;
    this.job = def.job;
    for (const j of SKILL_JOBS) this.skills[j] = { level: def.skills[j] ?? 0, xp: 0 };
    this.skills.nghi = { level: 0, xp: 0 };

    const scale = def.child ? 0.8 : 1;
    this.ring = scene.add.image(0, 0, 'ring').setVisible(false);
    const shadow = scene.add.image(0, 0, 'shadow').setScale(scale * 0.8);
    this.body = scene.add.image(0, 2, def.tex).setOrigin(0.5, 1).setScale(scale);
    const label = scene.add
      .text(0, 8, def.name, {
        fontFamily: FONT,
        fontSize: '10px',
        fontStyle: '600',
        color: '#fffbe8',
        stroke: '#3a2a1a',
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(0.5, 0);
    this.icon = scene.add.text(0, -50 * scale, '', { fontSize: '14px', resolution: 2 }).setOrigin(0.5, 1);
    this.gfx = scene.add.graphics();
    this.container = scene.add.container(this.x, this.y, [this.ring, shadow, this.gfx, this.body, label, this.icon]);
  }

  get name() {
    return this.def.name;
  }
  get tileX() {
    return Math.floor(this.x / TILE);
  }
  get tileY() {
    return Math.floor(this.y / TILE);
  }

  setSelected(on: boolean) {
    this.ring.setVisible(on);
  }

  setJob(job: JobId) {
    if (job === this.job) return;
    this.job = job;
    if (this.beh && !this.asleep) {
      this.beh.return(undefined);
      this.beh = null;
    }
  }

  /** Hiệu suất làm việc theo cấp nghề và thể trạng. */
  eff(job: JobId) {
    let e = 0.5 + 0.12 * this.skills[job].level;
    if (this.def.child) e *= 0.75;
    if (this.hunger < 10) e *= 0.7;
    if (this.energy < 10) e *= 0.8;
    return e;
  }

  /** Người trong nhà giỏi nghề này hơn — học từ họ sẽ nhanh hơn. */
  mentor(job: JobId): Villager | null {
    let best: Villager | null = null;
    for (const o of this.scene.villagers) {
      if (o === this || o.skills[job].level <= this.skills[job].level) continue;
      if (!best || o.skills[job].level > best.skills[job].level) best = o;
    }
    return best;
  }

  xpMultiplier(job: JobId) {
    return (this.def.child ? 1.5 : 1) * (this.mentor(job) ? 1.5 : 1);
  }

  gainXp(job: JobId, amount: number) {
    const s = this.skills[job];
    if (s.level >= MAX_LEVEL) return;
    s.xp += amount * this.xpMultiplier(job);
    while (s.level < MAX_LEVEL && s.xp >= xpNeed(s.level)) {
      s.xp -= xpNeed(s.level);
      s.level++;
      this.scene.floatText(this.x, this.y - 58, '⭐ Lên cấp!', '#ffe27a');
      this.scene.state.log(
        s.level === 1
          ? `${this.name} đã biết ${JOBS[job].name.toLowerCase()} rồi! ${JOBS[job].icon}`
          : `${this.name} ${JOBS[job].name.toLowerCase()} giỏi hơn — cấp ${s.level} ${JOBS[job].icon}`,
      );
    }
    if (s.level >= MAX_LEVEL) s.xp = 0;
  }

  update(dt: number) {
    this.hunger = Math.max(0, this.hunger - dt * HUNGER_RATE * (this.asleep ? 0.5 : 1));
    if (!this.asleep) this.energy = Math.max(0, this.energy - dt * ENERGY_DRAIN * (this.job === 'nghi' ? 0.5 : 1));
    this.moving = false;
    this.working = false;
    if (!this.beh) this.beh = this.think();
    if (this.beh.next(dt).done) this.beh = null;
    this.render(dt);
  }

  // ------------------------------------------------------------ hiển thị

  private render(dt: number) {
    const body = this.body;
    this.container.setPosition(this.x, this.y).setDepth(this.y).setVisible(!this.inside);
    if (this.moving) {
      this.phase += dt * 13;
      body.y = 2 - Math.abs(Math.sin(this.phase)) * 3;
      body.angle = 0;
    } else if (this.working && !this.fishSpot) {
      this.phase += dt * 11;
      body.y = 2;
      body.angle = Math.sin(this.phase) * 9;
    } else {
      body.y = 2;
      body.angle = this.asleep ? (body.flipX ? 80 : -80) : 0;
    }
    const ico = this.carry ? RESOURCES[this.carry.res].icon : (this.holding ?? '');
    if (this.icon.text !== ico) this.icon.setText(ico);

    const g = this.gfx;
    g.clear();
    if (this.progress !== null) {
      const top = this.def.child ? -44 : -54;
      g.fillStyle(0x2b1d10, 0.55).fillRoundedRect(-13, top - 1, 26, 6, 3);
      g.fillStyle(0xffd34a, 1).fillRoundedRect(-12, top, Math.max(2, 24 * this.progress), 4, 2);
    }
    if (this.fishSpot) {
      const dir = body.flipX ? -1 : 1;
      const hx = 8 * dir;
      const hy = -22;
      const tipX = hx + 14 * dir;
      const tipY = hy - 14;
      const bx = this.fishSpot.wx * TILE + TILE / 2 - this.x;
      const by = this.fishSpot.wy * TILE + TILE / 2 - this.y + Math.sin(this.phase * 0.5) * 1.5;
      this.phase += dt * 4;
      g.lineStyle(1.6, 0x6b4a2b).lineBetween(hx, hy, tipX, tipY);
      g.lineStyle(1, 0xffffff, 0.7).lineBetween(tipX, tipY, bx, by);
      g.fillStyle(0xe2463a).fillCircle(bx, by, 2.2);
    }
  }

  // ------------------------------------------------------------ hành vi cơ bản

  private speed() {
    let s = this.def.child ? 58 : 68;
    if (this.hunger < 10) s *= 0.75;
    if (this.energy < 10) s *= 0.8;
    return s;
  }

  private moveToward(px: number, py: number, dt: number, mul = 1) {
    const dx = px - this.x;
    const dy = py - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed() * mul * dt;
    this.moving = true;
    if (Math.abs(dx) > 0.5) this.body.setFlipX(dx < 0);
    if (d <= step) {
      this.x = px;
      this.y = py;
      return true;
    }
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    return false;
  }

  private face(px: number) {
    this.body.setFlipX(px < this.x);
  }

  private *walkTo(tx: number, ty: number, mul = 1): Step {
    const path = this.scene.findPath(this.tileX, this.tileY, tx, ty);
    if (!path) return false;
    if (path.length === 0) path.push({ x: tx, y: ty });
    for (const p of path) {
      const px = p.x * TILE + TILE / 2 + this.ox;
      const py = p.y * TILE + TILE / 2 + this.oy;
      for (;;) {
        const dt: number = yield;
        if (this.moveToward(px, py, dt, mul)) break;
      }
    }
    return true;
  }

  private *wait(sec: number): Step {
    let t = 0;
    while (t < sec) t += yield;
    return true;
  }

  /** Nên dừng việc đang làm: trời tối, kiệt sức hoặc đói lả. */
  private mustStop() {
    return this.scene.state.isSleepTime() || this.energy < 8 || (this.hunger < 20 && this.scene.hasFood());
  }

  private *workFor(sec: number): Step {
    let t = 0;
    try {
      while (t < sec) {
        const dt: number = yield;
        t += dt;
        this.working = true;
        this.progress = Math.min(1, t / sec);
        if (this.mustStop()) return false;
      }
      return true;
    } finally {
      this.progress = null;
    }
  }

  private *idle(status: string, sec = 4): Beh {
    this.status = status;
    const h = this.scene.homeTile;
    const tx = h.x + Phaser.Math.Between(-4, 4);
    const ty = h.y + Phaser.Math.Between(-2, 4);
    if (this.scene.world.isLand(tx, ty)) yield* this.walkTo(tx, ty, 0.7);
    this.status = status;
    yield* this.wait(sec);
  }

  // ------------------------------------------------------------ bộ não

  private *think(): Beh {
    if (this.carry) return yield* this.deliver();
    if (this.scene.state.isSleepTime() || this.energy < 10) return yield* this.sleep();
    if (this.hunger < 40 && this.scene.hasFood()) return yield* this.eat();
    switch (this.job) {
      case 'chat':
        return yield* this.chop();
      case 'san':
        return yield* this.hunt();
      case 'ca':
        return yield* this.fish();
      case 'hai':
        return yield* this.gather();
      case 'nau':
        return yield* this.cook();
      case 'xay':
        return yield* this.build();
      default:
        return yield* this.relax();
    }
  }

  private *deliver(): Beh {
    const c = this.carry!;
    const store = this.scene.nearestStorage(this.x, this.y);
    this.status = `Mang ${RESOURCES[c.res].name.toLowerCase()} về kho`;
    if (store) {
      const ok = yield* this.walkTo(store.entrance.x, store.entrance.y);
      if (!ok) yield* this.wait(0.5);
    }
    this.scene.state.add(c.res, c.amount);
    this.scene.floatText(this.x, this.y - 48, `+${c.amount} ${RESOURCES[c.res].icon}`);
    this.carry = null;
  }

  private *sleep(): Beh {
    const home = this.scene.nearestHome(this.x, this.y);
    this.status = 'Về nhà đi ngủ';
    if (home) {
      const ok = yield* this.walkTo(home.entrance.x, home.entrance.y);
      if (ok) this.inside = true;
    }
    this.asleep = true;
    this.status = home ? 'Đang ngủ trong nhà 💤' : 'Ngủ ngoài trời 💤';
    let z = Math.random() * 2;
    try {
      for (;;) {
        const dt: number = yield;
        this.energy = Math.min(100, this.energy + dt * SLEEP_RATE);
        z -= dt;
        if (z <= 0) {
          z = 2.5;
          this.scene.floatText(this.x + 8, this.y - (this.inside ? 60 : 30), 'z', '#dfe8ff');
        }
        if (!this.scene.state.isSleepTime() && this.energy >= 60) break;
      }
    } finally {
      this.asleep = false;
      this.inside = false;
    }
  }

  private *eat(): Beh {
    const store = this.scene.nearestStorage(this.x, this.y);
    this.status = 'Về nhà ăn cơm';
    if (store) yield* this.walkTo(store.entrance.x, store.entrance.y);
    this.status = 'Đang ăn 🍚';
    let ate = false;
    while (this.hunger < 85) {
      const food = this.scene.takeFood();
      if (!food) break;
      ate = true;
      this.holding = RESOURCES[food].icon;
      yield* this.wait(1.5);
      this.hunger = Math.min(100, this.hunger + (RESOURCES[food].food ?? 0));
    }
    this.holding = null;
    if (ate) this.scene.floatText(this.x, this.y - 48, '😋', '#fff');
  }

  private *relax(): Beh {
    const lines = this.def.child ? CHILD_LINES : RELAX_LINES;
    const h = this.scene.homeTile;
    const tx = h.x + Phaser.Math.Between(-6, 6);
    const ty = h.y + Phaser.Math.Between(-4, 6);
    this.status = 'Đi dạo quanh xóm';
    if (this.scene.world.isLand(tx, ty)) yield* this.walkTo(tx, ty, 0.65);
    this.status = lines[Math.floor(Math.random() * lines.length)];
    let t = 0;
    const dur = 3 + Math.random() * 5;
    while (t < dur) {
      const dt: number = yield;
      t += dt;
      this.energy = Math.min(100, this.energy + dt * ENERGY_DRAIN * 1.5);
    }
  }

  // ------------------------------------------------------------ nghề nghiệp

  private *chop(): Beh {
    const node = this.scene.findNode(['tree', 'bamboo'], this.x, this.y);
    if (!node) return yield* this.idle('Hết cây để chặt, chờ cây mọc lại');
    node.reservedBy = this;
    try {
      this.status = node.kind === 'tree' ? 'Đi đốn cây' : 'Đi chặt tre';
      const stand = this.scene.standNear(node.tx, node.ty, this.x, this.y);
      if (!stand || !(yield* this.walkTo(stand.x, stand.y))) return;
      this.face(node.x);
      this.status = node.kind === 'tree' ? 'Đang đốn cây 🪓' : 'Đang chặt tre 🪓';
      const dur = (node.kind === 'tree' ? 7 : 5) / this.eff('chat');
      if (!(yield* this.workFor(dur))) return;
      node.harvest();
      const bonus = Math.floor(this.skills.chat.level / 3);
      this.carry = { res: 'go', amount: (node.kind === 'tree' ? 4 : 3) + bonus };
      this.gainXp('chat', 4);
    } finally {
      if (node.reservedBy === this) node.reservedBy = null;
    }
  }

  private *gather(): Beh {
    const node = this.scene.findNode(['banana'], this.x, this.y);
    if (!node) return yield* this.idle('Chuối chưa chín, đợi chút');
    node.reservedBy = this;
    try {
      this.status = 'Đi hái chuối';
      const stand = this.scene.standNear(node.tx, node.ty, this.x, this.y);
      if (!stand || !(yield* this.walkTo(stand.x, stand.y))) return;
      this.face(node.x);
      this.status = 'Đang hái chuối 🍌';
      if (!(yield* this.workFor(3 / this.eff('hai')))) return;
      node.harvest();
      this.carry = { res: 'chuoi', amount: 3 + Math.floor(this.skills.hai.level / 3) };
      this.gainXp('hai', 3);
    } finally {
      if (node.reservedBy === this) node.reservedBy = null;
    }
  }

  private *fish(): Beh {
    const spot = this.scene.findFishingSpot(this.x, this.y);
    if (!spot) return yield* this.idle('Bờ sông đông người quá');
    spot.reservedBy = this;
    try {
      this.status = 'Ra bờ sông câu cá';
      if (!(yield* this.walkTo(spot.x, spot.y))) return;
      this.face(spot.wx * TILE + TILE / 2);
      this.fishSpot = spot;
      let caught = 0;
      for (let i = 0; i < 3; i++) {
        this.status = 'Đang ngồi câu cá 🎣';
        if (!(yield* this.workFor(5 / this.eff('ca')))) break;
        if (Math.random() < 0.4 + 0.05 * this.skills.ca.level) {
          caught++;
          this.scene.floatText(this.x, this.y - 48, '🐟', '#fff');
          this.gainXp('ca', 3);
        } else {
          this.scene.floatText(this.x, this.y - 48, '…', '#fff');
          this.gainXp('ca', 1);
        }
      }
      if (caught) this.carry = { res: 'ca', amount: caught };
    } finally {
      spot.reservedBy = null;
      this.fishSpot = null;
    }
  }

  private *hunt(): Beh {
    const a = this.scene.findAnimal(this.x, this.y);
    if (!a) return yield* this.idle('Không thấy thú rừng nào');
    a.reservedBy = this;
    try {
      this.status = `Đi săn ${a.name} 🏹`;
      let misses = 0;
      let elapsed = 0;
      const dist = () => Phaser.Math.Distance.Between(this.x, this.y, a.x, a.y);
      while (a.alive && elapsed < 60) {
        if (dist() < 20) {
          this.status = `Đang vồ ${a.name}`;
          let t = 0;
          const dur = 0.7 / this.eff('san');
          while (t < dur) {
            const dt: number = yield;
            t += dt;
            elapsed += dt;
            this.working = true;
          }
          if (!a.alive || dist() > 30) continue;
          const chance = Math.min(0.9, 0.3 + 0.07 * this.skills.san.level - (a.kind === 'heo' ? 0.1 : 0));
          if (Math.random() < chance) {
            a.kill();
            this.carry = { res: 'thit', amount: a.meat };
            this.scene.state.stats.hunted++;
            this.scene.floatText(this.x, this.y - 50, `Bắt được ${a.name}!`, '#ffe27a');
            this.gainXp('san', a.kind === 'heo' ? 8 : 5);
            return;
          }
          misses++;
          this.gainXp('san', 1);
          a.startle(this.x, this.y);
          this.scene.floatText(this.x, this.y - 50, 'Hụt rồi!', '#ffd0c0');
          if (misses >= 4) {
            this.status = 'Thú chạy mất rồi...';
            yield* this.wait(1.5);
            return;
          }
          continue;
        }
        this.status = `Đuổi theo ${a.name}`;
        const path = this.scene.findPath(this.tileX, this.tileY, a.tileX, a.tileY);
        if (!path) return;
        if (path.length <= 1) {
          // Đã sát bên: lao thẳng tới.
          let t = 0;
          while (t < 0.5 && dist() >= 18) {
            const dt: number = yield;
            t += dt;
            elapsed += dt;
            this.moveToward(a.x, a.y, dt, 1.25);
          }
          continue;
        }
        let close = false;
        for (const p of path.slice(0, 3)) {
          const px = p.x * TILE + TILE / 2;
          const py = p.y * TILE + TILE / 2;
          for (;;) {
            const dt: number = yield;
            elapsed += dt;
            const arrived = this.moveToward(px, py, dt, 1.25);
            if (dist() < 20) close = true;
            if (arrived || close) break;
          }
          if (close) break;
        }
      }
    } finally {
      if (a.reservedBy === this) a.reservedBy = null;
    }
  }

  private *cook(): Beh {
    const st = this.scene.state.res;
    const fire = this.scene.nearestBuilt('lua', this.x, this.y);
    if (!fire) return yield* this.idle('Cần xây Đống lửa để nướng 🔥');
    if (st.thit + st.ca <= 0) return yield* this.idle('Chờ có thịt, cá để nướng');

    const store = this.scene.nearestStorage(this.x, this.y);
    this.status = 'Ra kho lấy thịt cá';
    if (store) yield* this.walkTo(store.entrance.x, store.entrance.y);
    const raw: ResKey[] = [];
    while (raw.length < 3) {
      if (st.thit > 0) {
        st.thit--;
        raw.push('thit');
      } else if (st.ca > 0) {
        st.ca--;
        raw.push('ca');
      } else break;
    }
    if (!raw.length) return;
    try {
      this.holding = RESOURCES[raw[0]].icon;
      this.status = 'Mang ra đống lửa';
      const stand = this.scene.standNear(fire.tx, fire.ty, this.x, this.y);
      if (!stand || !(yield* this.walkTo(stand.x, stand.y))) return;
      this.face(fire.px);
      while (raw.length) {
        this.holding = RESOURCES[raw[0]].icon;
        this.status = raw[0] === 'thit' ? 'Đang nướng thịt 🍖' : 'Đang nướng cá 🐟';
        if (!(yield* this.workFor(4 / this.eff('nau')))) return;
        const out: ResKey = raw.shift() === 'thit' ? 'thitNuong' : 'caNuong';
        const n = Math.random() < this.skills.nau.level * 0.05 ? 2 : 1;
        this.scene.state.add(out, n);
        this.scene.state.stats.cooked += n;
        this.scene.floatText(this.x, this.y - 48, `+${n} ${RESOURCES[out].icon}`);
        this.gainXp('nau', 3);
      }
    } finally {
      for (const r of raw) st[r]++;
      this.holding = null;
    }
  }

  private *build(): Beh {
    const site = this.scene.nearestSite(this.x, this.y);
    if (!site) return yield* this.idle('Chưa có công trình nào cần xây');
    this.status = `Đi xây ${site.def.name.toLowerCase()}`;
    const stand =
      site.def.w === 1 ? this.scene.standNear(site.tx, site.ty, this.x, this.y) : site.entrance;
    if (!stand || !(yield* this.walkTo(stand.x, stand.y))) return;
    this.face(site.px);
    this.status = `Đang xây ${site.def.name.toLowerCase()} 🔨`;
    this.holding = '🔨';
    let acc = 0;
    try {
      while (!site.built) {
        const dt: number = yield;
        this.working = true;
        site.addProgress(dt * this.eff('xay'));
        acc += dt;
        if (acc >= 3) {
          acc -= 3;
          this.gainXp('xay', 2);
        }
        if (this.mustStop()) return;
      }
      this.gainXp('xay', 4);
    } finally {
      this.holding = null;
    }
  }
}
