import Phaser from 'phaser';
import { TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import type { Pt } from '../world/pathfinding';
import type { Building } from './Building';
import type { Villager } from './Villager';

/** Con trâu của một chuồng: ban ngày gặm cỏ quanh chuồng, có người dắt thì đi cày hoặc đi chăn, tối về chuồng. */
export class Buffalo {
  x: number;
  y: number;
  /** Người đang dắt: thợ cày hoặc đứa trẻ đi chăn. */
  leader: Villager | null = null;
  job: 'plow' | 'herd' | null = null;
  /** Ruộng đang cày (khi job = plow). */
  field: Building | null = null;
  /** Bãi cỏ đang dắt tới (pixel, khi job = herd). */
  pasture: { x: number; y: number } | null = null;
  /** Đã tới ruộng và đang kéo cày. */
  plowing = false;
  private path: Pt[] = [];
  private repath = 0;
  private wander: { x: number; y: number } | null = null;
  private idleT = Math.random() * 3;
  private phase = Math.random() * 10;
  private furrow = 0;
  private sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private plowImg: Phaser.GameObjects.Image;

  constructor(
    private scene: GameScene,
    readonly pen: Building,
  ) {
    this.x = pen.px;
    this.y = pen.py - TILE / 2;
    this.shadow = scene.add.image(this.x, this.y, 'shadow').setScale(1.6, 1.3);
    this.sprite = scene.add.image(this.x, this.y, 'trau').setOrigin(0.5, 0.92);
    this.plowImg = scene.add.image(this.x, this.y, 'plow').setOrigin(0.5, 1).setVisible(false);
  }

  get tileX() {
    return Math.floor(this.x / TILE);
  }
  get tileY() {
    return Math.floor(this.y / TILE);
  }
  get free() {
    return !this.leader;
  }
  get facingLeft() {
    return this.sprite.flipX;
  }

  claim(v: Villager, job: 'plow' | 'herd') {
    this.leader = v;
    this.job = job;
    this.path = [];
    this.wander = null;
  }

  release() {
    this.leader = null;
    this.job = null;
    this.field = null;
    this.pasture = null;
    this.plowing = false;
    this.path = [];
  }

  update(dt: number) {
    if (this.leader && !this.leader.alive) this.release();
    let moving = false;
    const f = this.field;
    if (this.job === 'plow' && f) {
      const left = f.tx * TILE + 10;
      const right = (f.tx + f.def.w) * TILE - 10;
      if (!this.plowing) {
        moving = this.goTo(left, f.ty * TILE + 14, 34, dt);
        if (!moving) this.plowing = true;
      } else {
        // Kéo cày qua lại từng luống, hết ruộng thì quay lại luống đầu.
        const rows = f.def.h * 4;
        const row = Math.floor(this.furrow) % rows;
        const ty = f.ty * TILE + 14 + (row * (f.def.h * TILE - 20)) / (rows - 1);
        const tx = row % 2 ? left : right;
        if (this.step(tx, ty, 26, dt)) this.furrow++;
        moving = true;
      }
    } else if (this.job === 'herd') {
      // Chưa có bãi cỏ thì đứng chờ đứa trẻ trèo lên lưng.
      if (this.pasture) {
        const far = Phaser.Math.Distance.Between(this.x, this.y, this.pasture.x, this.pasture.y);
        moving = far > 20 ? this.goTo(this.pasture.x, this.pasture.y, 30, dt) : this.graze(this.pasture, 36, dt);
      }
    } else if (this.scene.state.isSleepTime()) {
      moving = this.goTo(this.pen.px, this.pen.py - TILE / 2, 34, dt);
    } else {
      const home = { x: this.pen.px, y: this.pen.py + TILE };
      const far = Phaser.Math.Distance.Between(this.x, this.y, home.x, home.y);
      moving = far > TILE * 4 ? this.goTo(home.x, home.y, 30, dt) : this.graze(home, TILE * 3, dt);
    }
    this.phase += dt * (moving ? 9 : 2);
    this.render(moving);
  }

  /** Đi tới một điểm theo đường đi; trả về true khi còn đang đi. */
  private goTo(gx: number, gy: number, speed: number, dt: number) {
    if (Phaser.Math.Distance.Between(this.x, this.y, gx, gy) < 4) {
      this.path = [];
      return false;
    }
    if ((this.repath -= dt) <= 0 || !this.path.length) {
      this.repath = 2;
      this.path = this.scene.findPath(this.tileX, this.tileY, Math.floor(gx / TILE), Math.floor(gy / TILE)) ?? [];
    }
    const p = this.path[0];
    const last = this.path.length <= 1;
    if (this.step(last ? gx : p.x * TILE + TILE / 2, last ? gy : p.y * TILE + TILE / 2, speed, dt) && !last) this.path.shift();
    return true;
  }

  /** Gặm cỏ: đứng cúi đầu một lúc rồi nhích sang chỗ khác gần đó. */
  private graze(at: { x: number; y: number }, r: number, dt: number) {
    this.path = [];
    if (this.wander) {
      if (this.step(this.wander.x, this.wander.y, 14, dt)) this.wander = null;
      return true;
    }
    if ((this.idleT -= dt) <= 0) {
      this.idleT = 3 + Math.random() * 5;
      const wx = at.x + Phaser.Math.Between(-r, r);
      const wy = at.y + Phaser.Math.Between(-r / 2, r / 2);
      const tx = Math.floor(wx / TILE);
      const ty = Math.floor(wy / TILE);
      if (this.scene.world.isLand(tx, ty) && this.scene.isFree(tx, ty)) this.wander = { x: wx, y: wy };
    }
    return false;
  }

  private step(tx: number, ty: number, speed: number, dt: number) {
    const dx = tx - this.x;
    const dy = ty - this.y;
    const d = Math.hypot(dx, dy);
    const s = speed * dt;
    if (Math.abs(dx) > 0.5) this.sprite.setFlipX(dx < 0);
    if (d <= s) {
      this.x = tx;
      this.y = ty;
      return true;
    }
    this.x += (dx / d) * s;
    this.y += (dy / d) * s;
    return false;
  }

  private render(moving: boolean) {
    this.shadow.setPosition(this.x, this.y).setDepth(this.y - 1);
    const bob = moving ? Math.abs(Math.sin(this.phase)) * 1.5 : 0;
    // Đứng gặm cỏ thì cúi đầu, lắc lư.
    const graze = !moving && !this.leader ? Math.max(0, Math.sin(this.phase)) * 4 * (this.sprite.flipX ? -1 : 1) : 0;
    this.sprite.setPosition(this.x, this.y - bob).setAngle(graze).setDepth(this.y);
    const back = this.sprite.flipX ? 1 : -1;
    this.plowImg
      .setVisible(this.plowing)
      .setPosition(this.x + back * 30, this.y + 2)
      .setFlipX(this.sprite.flipX)
      .setDepth(this.y - 2);
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
    this.plowImg.destroy();
  }
}
