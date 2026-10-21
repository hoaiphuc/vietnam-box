import Phaser from 'phaser';
import type { SfxId } from '../audio/sfx';
import { DAY_LENGTH, ENERGY_DRAIN, FONT, HUNGER_RATE, SLEEP_RATE, TILE } from '../config';
import { JOB_ORDER, JOBS, RESOURCES, SKILL_JOBS, type JobId, type ResKey } from '../data';
import type { FishingSpot, GameScene } from '../scenes/GameScene';
import { TRAITS, type TraitId } from '../traits';

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
  skills: Partial<Record<JobId, number>>;
  traits: TraitId[];
  child?: boolean;
}

export interface Memory {
  id: string;
  icon: string;
  text: string;
  until: number;
  /** Ảnh hưởng tới mức thích từng việc khi còn nhớ. */
  bias?: Partial<Record<JobId, number>>;
}

export interface JournalEntry {
  time: number;
  text: string;
}

/** Một lựa chọn đã cân nhắc, kèm điểm và lý do. */
export interface Option {
  job: JobId;
  score: number;
  reason: string;
}

export const MAX_LEVEL = 10;
export const xpNeed = (lv: number) => 12 + lv * 10;

const NEED_LINES: Record<JobId, string> = {
  chat: 'Nhà thiếu gỗ quá, phải đi đốn cây',
  san: 'Cả nhà cần thịt, vào rừng săn thôi',
  ca: 'Kho sắp hết đồ ăn, ra sông kiếm con cá',
  hai: 'Sắp hết cái ăn rồi, đi hái chuối',
  nau: 'Thịt cá sống còn nhiều, đem nướng kẻo hỏng',
  xay: 'Phải dựng cho xong công trình đã',
  nghi: 'Mệt quá, phải nghỉ một lát',
};
const LIKE_LINES: Record<JobId, string> = {
  chat: 'Vung rìu đốn cây thấy khoẻ cả người!',
  san: 'Đi săn mới thấy hào hứng!',
  ca: 'Ngồi câu cá là vui nhất đời',
  hai: 'Đi hái lượm, ngắm cây cỏ thích ghê',
  nau: 'Nướng đồ ăn cho cả nhà là vui nhất',
  xay: 'Thích tự tay dựng nhà dựng cửa',
  nghi: 'Thong thả chút cho đời thêm vui',
};
const CASUAL_LINES: Record<JobId, string> = {
  chat: 'Đi chặt thêm ít gỗ để dành',
  san: 'Thử vào rừng xem có con gì không',
  ca: 'Ra sông thả câu chơi',
  hai: 'Đi xem chuối chín chưa',
  nau: 'Nướng thêm ít đồ ăn',
  xay: 'Phụ một tay xây dựng',
  nghi: 'Hôm nay thong thả một chút',
};
const CHAT_LINES = [
  'Hôm nay trời đẹp ghê',
  'Cá dưới sông dạo này nhiều lắm',
  'Mai đi hái chuối với nhau nhé',
  'Nghe nói trong rừng có heo rừng to lắm',
  'Gió bờ tre mát thật',
  'Năm nay chắc được mùa',
  'Kể chuyện ngày xưa đi!',
  'Ăn no rồi, đời thật dễ chịu',
];
const RELAX_LINES = ['Ngồi hóng gió bờ tre 🎋', 'Ngắm mây trôi ☁️', 'Ngân nga câu hò 🎶', 'Pha ấm trà ☕', 'Ngồi đan rổ 🧺'];
const CHILD_LINES = ['Thả diều 🪁', 'Đuổi bắt chuồn chuồn', 'Nhảy dây', 'Hái hoa ven đường 🌼'];
/** Trẻ con: ham chơi, chưa được đi săn. */
const CHILD_AFF: Partial<Record<JobId, number>> = { san: -0.5, xay: -0.15, nghi: 0.2, hai: 0.1 };

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class Villager {
  x: number;
  y: number;
  hunger = 80;
  energy = 90;
  mood = 70;
  /** Việc đang làm — do họ tự chọn. */
  activity: JobId = 'nghi';
  skills = {} as Record<JobId, Skill>;
  status = 'Đang nghĩ xem làm gì';
  carry: { res: ResKey; amount: number } | null = null;
  asleep = false;
  inside = false;
  readonly traits: TraitId[];
  memories: Memory[] = [];
  journal: JournalEntry[] = [];
  thought = '';
  intent: { job: JobId; until: number } | null = null;
  dreamReadyAt = 0;
  options: Option[] = [];

  private prefs = {} as Record<JobId, number>;
  private mode = '';
  /** Thời gian ngồi không liên tục — càng lâu càng chán, muốn đi làm. */
  private idleTime = 0;
  private holding: string | null = null;
  private progress: number | null = null;
  private fishSpot: FishingSpot | null = null;
  private beh: Beh | null = null;
  private moving = false;
  private working = false;
  private relaxing = false;
  private byFire = false;
  private phase = 0;
  private ox = Phaser.Math.Between(-5, 5);
  private oy = Phaser.Math.Between(-4, 4);

  private container: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Image;
  private ring: Phaser.GameObjects.Image;
  private icon: Phaser.GameObjects.Text;
  private gfx: Phaser.GameObjects.Graphics;
  private bubble: Phaser.GameObjects.Container;
  private bubbleBg: Phaser.GameObjects.Graphics;
  private bubbleText: Phaser.GameObjects.Text;
  private bubbleUntil = 0;

  constructor(
    private scene: GameScene,
    readonly def: VillagerDef,
    tx: number,
    ty: number,
  ) {
    this.x = tx * TILE + TILE / 2;
    this.y = ty * TILE + TILE / 2;
    this.traits = def.traits;
    for (const j of SKILL_JOBS) this.skills[j] = { level: def.skills[j] ?? 0, xp: 0 };
    this.skills.nghi = { level: 0, xp: 0 };
    for (const j of JOB_ORDER) this.prefs[j] = (Math.random() - 0.5) * 0.2;

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

    this.bubbleBg = scene.add.graphics();
    this.bubbleText = scene.add
      .text(0, -5, '', {
        fontFamily: FONT,
        fontSize: '11px',
        fontStyle: '500',
        color: '#4a3424',
        align: 'center',
        wordWrap: { width: 150 },
        resolution: 2,
      })
      .setOrigin(0.5, 1);
    this.bubble = scene.add.container(0, 0, [this.bubbleBg, this.bubbleText]).setDepth(60001).setVisible(false);
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

  has(t: TraitId) {
    return this.traits.includes(t);
  }

  setSelected(on: boolean) {
    this.ring.setVisible(on);
  }

  // ------------------------------------------------------------ suy nghĩ, ký ức, nhật ký

  /** Hiện bong bóng suy nghĩ trên đầu. */
  say(text: string, ms = 4500) {
    this.thought = text;
    this.bubbleText.setText(text);
    const w = this.bubbleText.width + 14;
    const h = this.bubbleText.height + 8;
    const g = this.bubbleBg;
    g.clear();
    g.fillStyle(0xfff8e6, 0.97).fillRoundedRect(-w / 2, -h, w, h, 8);
    g.lineStyle(1.5, 0xc9a86a, 1).strokeRoundedRect(-w / 2, -h, w, h, 8);
    g.fillStyle(0xfff8e6, 1).fillCircle(-4, 5, 3.2).fillCircle(-8, 11, 2);
    g.lineStyle(1, 0xc9a86a, 1).strokeCircle(-4, 5, 3.2).strokeCircle(-8, 11, 2);
    this.bubbleUntil = this.scene.time.now + ms;
  }

  note(text: string) {
    this.journal.unshift({ time: this.scene.state.time, text });
    if (this.journal.length > 40) this.journal.pop();
  }

  remember(id: string, icon: string, text: string, days: number, bias?: Memory['bias']) {
    this.memories = this.memories.filter((m) => m.id !== id);
    this.memories.push({ id, icon, text, until: this.scene.state.time + days * DAY_LENGTH, bias });
    this.note(`${icon} ${text}`);
  }

  addMood(n: number) {
    this.mood = clamp(this.mood + n, 0, 100);
  }

  /** Mức thích một việc: tính cách + sở thích riêng + ký ức. */
  affinity(j: JobId) {
    let a = this.prefs[j];
    for (const t of this.traits) a += TRAITS[t].aff?.[j] ?? 0;
    for (const m of this.memories) a += m.bias?.[j] ?? 0;
    if (this.def.child) a += CHILD_AFF[j] ?? 0;
    return a;
  }

  /** Ông Thành Hoàng báo mộng gợi ý một việc — nghe hay không là tuỳ họ. */
  receiveDream(job: JobId): 'accepted' | 'refused' | 'cooldown' {
    const time = this.scene.state.time;
    if (time < this.dreamReadyAt) return 'cooldown';
    this.dreamReadyAt = time + DAY_LENGTH * 0.12;
    const aff = this.affinity(job);
    let p = 0.65 + aff * 0.6;
    if (this.has('toMo')) p += 0.25;
    if (this.has('luoi') && job !== 'nghi') p -= 0.2;
    if (this.has('buongBinh')) p -= 0.35;
    if (this.asleep) p += 0.15;
    p = clamp(p, 0.08, 0.95);
    const verb = JOBS[job].name.toLowerCase();

    if (Math.random() < p) {
      this.intent = { job, until: time + DAY_LENGTH * 0.8 };
      this.addMood(3);
      this.say(this.asleep ? `💭 Mơ thấy ông Thành Hoàng bảo đi ${verb}...` : `💭 Tự nhiên thấy muốn đi ${verb} quá!`);
      this.note(`💭 Được báo mộng, quyết định đi ${verb}`);
      this.mode = '';
      this.interrupt();
      return 'accepted';
    }
    const line =
      aff < -0.2
        ? `Thôi, mình không thích ${verb} đâu`
        : this.has('buongBinh')
          ? 'Mình tự biết phải làm gì!'
          : this.has('luoi')
            ? 'Để mai tính...'
            : 'Ừm... chắc là không đâu';
    this.say(`💭 ${line}`);
    this.note(`💭 Được báo mộng đi ${verb} nhưng không nghe: "${line}"`);
    return 'refused';
  }

  clearIntent() {
    if (!this.intent) return;
    this.intent = null;
    this.say('Thôi, tự mình quyết vậy');
    this.mode = '';
  }

  private interrupt() {
    if (this.beh && !this.asleep) {
      this.beh.return(undefined);
      this.beh = null;
    }
  }

  // ------------------------------------------------------------ năng lực

  /** Hiệu suất làm việc theo cấp nghề, thể trạng và tâm trạng. */
  eff(job: JobId) {
    let e = 0.5 + 0.12 * this.skills[job].level;
    if (this.def.child) e *= 0.75;
    if (this.hunger < 10) e *= 0.7;
    if (this.energy < 10) e *= 0.8;
    return e * (0.85 + this.mood * 0.003);
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
    return (this.def.child ? 1.5 : 1) * (this.mentor(job) ? 1.5 : 1) * (this.has('toMo') ? 1.25 : 1);
  }

  gainXp(job: JobId, amount: number) {
    const s = this.skills[job];
    if (s.level >= MAX_LEVEL) return;
    s.xp += amount * this.xpMultiplier(job);
    while (s.level < MAX_LEVEL && s.xp >= xpNeed(s.level)) {
      s.xp -= xpNeed(s.level);
      s.level++;
      this.addMood(6);
      this.scene.floatText(this.x, this.y - 58, '⭐ Lên cấp!', '#ffe27a');
      this.scene.sfx('levelUp');
      const verb = JOBS[job].name.toLowerCase();
      this.say(s.level === 1 ? `Mình biết ${verb} rồi nè!` : `Mình ${verb} giỏi hơn rồi!`);
      this.note(`⭐ ${s.level === 1 ? `Đã biết ${verb}` : `${JOBS[job].name} lên cấp ${s.level}`}`);
      this.scene.state.log(
        s.level === 1
          ? `${this.name} đã biết ${verb} rồi! ${JOBS[job].icon}`
          : `${this.name} ${verb} giỏi hơn — cấp ${s.level} ${JOBS[job].icon}`,
      );
    }
    if (s.level >= MAX_LEVEL) s.xp = 0;
  }

  private hungerLine() {
    return this.has('thamAn') ? 55 : 40;
  }

  // ------------------------------------------------------------ cập nhật

  update(dt: number) {
    const time = this.scene.state.time;
    this.hunger = Math.max(0, this.hunger - dt * HUNGER_RATE * (this.asleep ? 0.5 : 1) * (this.has('thamAn') ? 1.15 : 1));
    if (!this.asleep) {
      const drain = (this.activity === 'nghi' ? 0.5 : 1) * (this.has('khoeManh') ? 0.8 : 1);
      this.energy = Math.max(0, this.energy - dt * ENERGY_DRAIN * drain);
    }
    if (this.memories.length && this.memories.some((m) => m.until < time)) this.memories = this.memories.filter((m) => m.until >= time);
    if (this.intent && this.intent.until < time) this.intent = null;

    this.moving = false;
    this.working = false;
    this.relaxing = false;
    this.byFire = false;
    if (!this.beh) this.beh = this.think();
    if (this.beh.next(dt).done) this.beh = null;
    this.updateMood(dt);
    this.render(dt);
  }

  private updateMood(dt: number) {
    const base = this.has('vuiTinh') ? 72 : 60;
    let d = (base - this.mood) * 0.004;
    if (this.hunger < 20) d -= 0.08;
    if (this.energy < 15) d -= 0.05;
    if (this.relaxing) d += this.byFire ? 0.25 : 0.12;
    else if (this.working) d += this.affinity(this.activity) * 0.1;
    if (d < 0 && this.has('vuiTinh')) d *= 0.6;
    this.mood = clamp(this.mood + d * dt, 0, 100);
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

    const left = this.bubbleUntil - this.scene.time.now;
    const show = left > 0 && !this.inside;
    this.bubble.setVisible(show);
    if (show) {
      this.bubble.setPosition(this.x + 6, this.y - (this.def.child ? 58 : 68));
      this.bubble.setAlpha(Math.min(1, left / 400));
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

  /** Làm việc trong `sec` giây; có `sound` thì phát đều đặn mỗi `every` giây. */
  private *workFor(sec: number, sound?: SfxId, every = 0.55): Step {
    let t = 0;
    let tick = every * 0.5;
    try {
      while (t < sec) {
        const dt: number = yield;
        t += dt;
        this.working = true;
        this.progress = Math.min(1, t / sec);
        if (sound && (tick -= dt) <= 0) {
          tick += every;
          this.scene.sfx(sound, this.x, this.y);
        }
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
    if (this.scene.isFree(tx, ty)) yield* this.walkTo(tx, ty, 0.7);
    this.status = status;
    yield* this.wait(sec);
  }

  // ------------------------------------------------------------ bộ não

  /** Cân nhắc mọi việc có thể làm và chọn việc điểm cao nhất. */
  private decide(): Option {
    const s = this.scene;
    const need = s.villageNeeds();
    const h = s.state.hour;
    const evening = h >= 18 && h < 21;
    const fireEvening = evening && !!s.nearestBuilt('lua', this.x, this.y);
    const opts: Option[] = [];
    for (const j of JOB_ORDER) {
      const n = j === 'nghi' ? this.restNeed(fireEvening) : need[j];
      if (n < 0) continue;
      const aff = this.affinity(j);
      let score = n * 0.7 + aff * 0.5;
      if (j !== 'nghi') {
        score += this.skills[j].level * 0.03;
        const others = s.villagers.filter((o) => o !== this && o.activity === j && !o.asleep).length;
        score -= others * (j === 'nau' ? 0.5 : 0.18);
        if (evening) score *= 0.6;
      } else if (!fireEvening) {
        score -= this.boredom() * 0.8;
      }
      const dreamed = this.intent?.job === j;
      if (dreamed) score += 0.5;
      if (this.activity === j) score += 0.08;
      score += (Math.random() - 0.5) * 0.06;
      opts.push({ job: j, score, reason: this.reasonFor(j, n, aff, dreamed, fireEvening) });
    }
    opts.sort((a, b) => b.score - a.score);
    this.options = opts;
    return opts[0];
  }

  private boredom() {
    return Math.min(0.45, this.idleTime / (DAY_LENGTH * 0.2));
  }

  private restNeed(fireEvening: boolean) {
    const tired = Math.max(0, (40 - this.energy) / 40) * 0.4;
    return 0.12 + (1 - this.mood / 100) * 0.5 + tired + (fireEvening ? 0.3 : 0);
  }

  private reasonFor(j: JobId, need: number, aff: number, dreamed: boolean, fireEvening: boolean) {
    if (dreamed) return `Nhớ lời báo mộng, đi ${JOBS[j].name.toLowerCase()} thôi`;
    if (j === 'nghi' && fireEvening) return 'Tối rồi, ra ngồi bên bếp lửa với cả nhà';
    if (j !== 'nghi' && this.boredom() > 0.25) return 'Ngồi mãi cũng chán, đi làm gì đó thôi';
    if (need >= 0.6) return NEED_LINES[j];
    if (aff >= 0.25) return LIKE_LINES[j];
    return CASUAL_LINES[j];
  }

  /** Nghĩ một lần cho mỗi lần đổi trạng thái, tránh lải nhải. */
  private thinkOnce(mode: string, text: string) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.say(text);
  }

  private *think(): Beh {
    if (this.carry) return yield* this.deliver();
    const st = this.scene.state;
    if (st.isSleepTime() || this.energy < 10) {
      this.thinkOnce('sleep', st.isSleepTime() ? 'Khuya rồi, đi ngủ thôi' : 'Mệt rã rời, phải chợp mắt một lát');
      return yield* this.sleep();
    }
    if (this.hunger < this.hungerLine() && this.scene.hasFood()) {
      this.thinkOnce('eat', this.hunger < 15 ? 'Đói lả rồi, về ăn ngay thôi!' : 'Bụng đói rồi, về ăn chút gì');
      return yield* this.eat();
    }

    const pick = this.decide();
    if (this.mode !== pick.job) {
      this.mode = pick.job;
      this.say(pick.reason);
      if (this.activity !== pick.job) this.note(`${JOBS[pick.job].icon} ${pick.reason}`);
    }
    this.activity = pick.job;
    if (pick.job !== 'nghi') this.idleTime = 0;
    switch (pick.job) {
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
    this.scene.sfx('deposit', this.x, this.y);
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
    let best: ResKey | null = null;
    while (this.hunger < 85) {
      const food = this.scene.takeFood();
      if (!food) break;
      best ??= food;
      this.holding = RESOURCES[food].icon;
      this.scene.sfx('eat', this.x, this.y);
      yield* this.wait(1.5);
      this.hunger = Math.min(100, this.hunger + (RESOURCES[food].food ?? 0));
      this.addMood(food === 'chuoi' ? 1.5 : 4);
    }
    this.holding = null;
    if (best) {
      this.scene.floatText(this.x, this.y - 48, '😋', '#fff');
      if (best === 'thitNuong' && Math.random() < 0.4) this.say('Thịt nướng thơm ghê 😋');
    }
  }

  private *relax(): Beh {
    const s = this.scene;
    const h = s.state.hour;
    const fire = s.nearestBuilt('lua', this.x, this.y);
    const fireEvening = !!fire && h >= 18 && h < 21;
    if (fire && fireEvening) {
      this.status = 'Ra ngồi bên bếp lửa';
      const tx = fire.tx + Phaser.Math.Between(-2, 2);
      const ty = fire.ty + Phaser.Math.Between(-1, 2);
      const ok = s.isFree(tx, ty) && (yield* this.walkTo(tx, ty, 0.8));
      if (ok) this.face(fire.px);
      this.status = 'Quây quần bên bếp lửa 🔥';
    } else {
      const lines = this.def.child ? CHILD_LINES : RELAX_LINES;
      const home = s.homeTile;
      const tx = home.x + Phaser.Math.Between(-6, 6);
      const ty = home.y + Phaser.Math.Between(-4, 6);
      this.status = 'Đi dạo quanh xóm';
      if (s.isFree(tx, ty)) yield* this.walkTo(tx, ty, 0.65);
      this.status = lines[Math.floor(Math.random() * lines.length)];
    }

    let t = 0;
    let chat = 2 + Math.random() * 3;
    const dur = fireEvening ? 8 + Math.random() * 6 : 3 + Math.random() * 5;
    while (t < dur) {
      const dt: number = yield;
      t += dt;
      this.relaxing = true;
      this.byFire = fireEvening;
      this.idleTime += dt;
      this.energy = Math.min(100, this.energy + dt * ENERGY_DRAIN * 1.5);
      if ((chat -= dt) <= 0) {
        chat = 4 + Math.random() * 4;
        const friend = s.villagers.find(
          (o) => o !== this && !o.inside && o.relaxing && Phaser.Math.Distance.Between(o.x, o.y, this.x, this.y) < 90,
        );
        if (friend && Math.random() < 0.6) {
          this.say(CHAT_LINES[Math.floor(Math.random() * CHAT_LINES.length)], 3500);
          this.addMood(2);
        }
      }
      if (this.mustStop()) return;
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
      if (!(yield* this.workFor(dur, 'chop'))) return;
      node.harvest();
      this.scene.recordWork(node.x, node.y);
      this.scene.sfx(node.kind === 'tree' ? 'treeFall' : 'bambooFall', node.x, node.y);
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
      if (!(yield* this.workFor(3 / this.eff('hai'), 'rustle', 0.7))) return;
      node.harvest();
      this.scene.recordWork(node.x, node.y);
      this.scene.sfx('pick', node.x, node.y);
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
        this.scene.sfx('cast', this.x, this.y);
        if (!(yield* this.workFor(5 / this.eff('ca')))) break;
        if (Math.random() < 0.4 + 0.05 * this.skills.ca.level) {
          caught++;
          this.scene.sfx('catch', this.x, this.y);
          this.scene.floatText(this.x, this.y - 48, '🐟', '#fff');
          this.gainXp('ca', 3);
        } else {
          this.scene.floatText(this.x, this.y - 48, '…', '#fff');
          this.gainXp('ca', 1);
        }
      }
      if (caught) {
        this.carry = { res: 'ca', amount: caught };
        this.scene.recordWork(this.x, this.y);
      }
      if (caught >= 3) {
        this.addMood(5);
        this.say('Hôm nay cá cắn câu nhiều ghê! 🐟');
        this.remember('ca_nhieu', '🎣', 'Một buổi câu được nhiều cá', 1, { ca: 0.15 });
      }
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
      while (a.alive && elapsed < 60 && !this.mustStop()) {
        if (dist() < 20) {
          this.status = `Đang vồ ${a.name}`;
          this.scene.sfx('pounce', this.x, this.y);
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
            this.scene.recordWork(a.x, a.y);
            this.scene.sfx('caught', this.x, this.y);
            this.scene.floatText(this.x, this.y - 50, `Bắt được ${a.name}!`, '#ffe27a');
            this.gainXp('san', a.kind === 'heo' ? 8 : 5);
            if (a.kind === 'heo') {
              this.addMood(10);
              this.say('Săn được heo rừng! Tối nay cả nhà có thịt 😄');
              this.remember('san_heo', '🐗', 'Săn được một con heo rừng, tự hào lắm', 1, { san: 0.2 });
            }
            return;
          }
          misses++;
          this.gainXp('san', 1);
          a.startle(this.x, this.y);
          if (a.kind === 'heo' && Math.random() < 0.25 + (this.has('nhutNhat') ? 0.2 : 0) - (this.has('gan') ? 0.15 : 0)) {
            yield* this.gored(a.x, a.y);
            return;
          }
          this.scene.floatText(this.x, this.y - 50, 'Hụt rồi!', '#ffd0c0');
          if (misses >= 4) {
            this.status = 'Thú chạy mất rồi...';
            this.say('Chạy nhanh quá, thôi để lần sau');
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

  /** Bị heo rừng húc: đau, sợ, và sẽ ngại đi săn một thời gian. */
  private *gored(fromX: number, fromY: number): Beh {
    this.energy = Math.max(0, this.energy - 15);
    this.addMood(-15);
    this.scene.sfx('grunt', this.x, this.y);
    this.scene.floatText(this.x, this.y - 50, '💥 Á!', '#ffb0a0');
    this.say('Ối! Bị heo rừng húc đau quá 😣');
    this.remember('heo_huc', '🐗', 'Bị heo rừng húc, giờ sợ đi săn', 2, { san: -0.45 });
    this.scene.state.log(`🐗 ${this.name} bị heo rừng húc! Chắc sẽ ngại đi săn mấy hôm.`);
    const d = Math.hypot(this.x - fromX, this.y - fromY) || 1;
    const nx = this.x + ((this.x - fromX) / d) * 18;
    const ny = this.y + ((this.y - fromY) / d) * 18;
    if (this.scene.world.walkable(Math.floor(nx / TILE), Math.floor(ny / TILE))) {
      let t = 0;
      while (t < 0.25) {
        const dt: number = yield;
        t += dt;
        this.x += (nx - this.x) * Math.min(1, dt * 12);
        this.y += (ny - this.y) * Math.min(1, dt * 12);
      }
    }
    this.status = 'Ngồi xoa chỗ đau...';
    yield* this.wait(2.5);
  }

  private *cook(): Beh {
    const st = this.scene.state.res;
    const fire = this.scene.nearestBuilt('lua', this.x, this.y);
    if (!fire) return yield* this.idle('Cần có Đống lửa để nướng 🔥');
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
        if (!(yield* this.workFor(4 / this.eff('nau'), 'sizzle', 0.5))) return;
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
    const stand = site.def.w === 1 ? this.scene.standNear(site.tx, site.ty, this.x, this.y) : site.entrance;
    if (!stand || !(yield* this.walkTo(stand.x, stand.y))) return;
    this.face(site.px);
    this.status = `Đang xây ${site.def.name.toLowerCase()} 🔨`;
    this.holding = '🔨';
    let acc = 0;
    let hammer = 0;
    try {
      while (!site.built) {
        const dt: number = yield;
        this.working = true;
        site.addProgress(dt * this.eff('xay'));
        if ((hammer -= dt) <= 0) {
          hammer = 0.45;
          this.scene.sfx('hammer', this.x, this.y);
        }
        acc += dt;
        if (acc >= 3) {
          acc -= 3;
          this.gainXp('xay', 2);
        }
        if (this.mustStop()) return;
      }
      this.gainXp('xay', 4);
      this.addMood(5);
    } finally {
      this.holding = null;
    }
  }
}
