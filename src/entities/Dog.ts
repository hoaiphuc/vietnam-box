import Phaser from 'phaser';
import { TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';
import type { Pt } from '../world/pathfinding';
import type { Building } from './Building';
import type { Villager } from './Villager';

export const DOG_NAMES = ['Vàng', 'Mực', 'Lu', 'Vện', 'Đốm', 'Cún'];

/** Chó giữ nhà: lẽo đẽo theo chủ ra đồng, chủ ngủ thì về nằm trước cửa, thấy gà thì sủa đuổi. */
export class Dog {
  x: number;
  y: number;
  owner: Villager | null;
  private path: Pt[] = [];
  private repath = 0;
  private wander: { x: number; y: number } | null = null;
  private idleT = 0;
  private barkCd = 3;
  private phase = Math.random() * 10;
  private lying = false;
  private sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;

  constructor(
    private scene: GameScene,
    readonly home: Building,
    owner: Villager | null,
    readonly name: string,
  ) {
    this.owner = owner;
    const e = home.entrance;
    this.x = e.x * TILE + TILE / 2 + 14;
    this.y = e.y * TILE + TILE / 2;
    this.shadow = scene.add.image(this.x, this.y, 'shadow').setScale(0.9);
    this.sprite = scene.add.image(this.x, this.y, 'dog').setOrigin(0.5, 0.92);
  }

  private get tileX() {
    return Math.floor(this.x / TILE);
  }
  private get tileY() {
    return Math.floor(this.y / TILE);
  }

  update(dt: number) {
    const o = this.owner;
    this.barkCd -= dt;
    // Chủ đang ngủ / ở trong nhà / không có thì về nằm trước cửa; chủ ngủ trưa ngoài trời thì nằm cạnh chủ.
    const atHome = !o || !o.alive || o.inside || o.asleep;
    let goal: { x: number; y: number };
    let rest = false;
    if (atHome) {
      const e = this.home.entrance;
      goal = { x: e.x * TILE + TILE / 2 + 14, y: e.y * TILE + TILE / 2 + 4 };
      rest = true;
    } else {
      goal = { x: o.x + (o.facingLeft ? 18 : -18), y: o.y + 6 };
      rest = o.dozing;
    }

    const far = Phaser.Math.Distance.Between(this.x, this.y, goal.x, goal.y);
    let moving = false;
    if (far > (rest ? 10 : 60)) {
      // Theo đường đi (lội qua chỗ nước cạn), thỉnh thoảng tính lại vì chủ cũng đang đi.
      if ((this.repath -= dt) <= 0 || !this.path.length) {
        this.repath = 1.2;
        this.path = this.scene.findPath(this.tileX, this.tileY, Math.floor(goal.x / TILE), Math.floor(goal.y / TILE)) ?? [];
        if (!this.path.length) this.path = [{ x: Math.floor(goal.x / TILE), y: Math.floor(goal.y / TILE) }];
      }
      const p = this.path[0];
      const last = this.path.length === 1;
      const tx = last ? goal.x : p.x * TILE + TILE / 2;
      const ty = last ? goal.y : p.y * TILE + TILE / 2;
      if (this.step(tx, ty, far > 160 ? 105 : 80, dt)) this.path.shift();
      moving = true;
      this.wander = null;
      this.lying = false;
    } else if (rest) {
      this.lying = true;
      this.path = [];
    } else {
      // Đứng cạnh chủ: hít hít quanh quẩn, vẫy đuôi.
      this.lying = false;
      this.path = [];
      if (this.wander) {
        if (this.step(this.wander.x, this.wander.y, 40, dt)) this.wander = null;
        moving = true;
      } else if ((this.idleT -= dt) <= 0) {
        this.idleT = 1.5 + Math.random() * 3;
        const wx = goal.x + Phaser.Math.Between(-26, 26);
        const wy = goal.y + Phaser.Math.Between(-14, 14);
        if (this.scene.world.isLand(Math.floor(wx / TILE), Math.floor(wy / TILE))) this.wander = { x: wx, y: wy };
      }
    }

    if (!this.lying) this.chaseChickens();
    this.phase += dt * (moving ? 15 : this.lying ? 1 : 6);
    this.render(moving);
  }

  /** Thấy gà rừng, heo rừng lảng vảng gần thì sủa cho chạy. */
  private chaseChickens() {
    if (this.barkCd > 0) return;
    const a = this.scene.animals.find((a) => a.alive && Phaser.Math.Distance.Between(a.x, a.y, this.x, this.y) < 56);
    if (!a) return;
    this.barkCd = 6 + Math.random() * 4;
    this.bark();
    a.startle(this.x, this.y);
  }

  bark() {
    this.scene.sfx('bark', this.x, this.y, 0.7);
    this.scene.floatText(this.x, this.y - 26, 'Gâu gâu!', '#fff4d0');
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
    const tex = this.lying ? 'dogLie' : 'dog';
    if (this.sprite.texture.key !== tex) this.sprite.setTexture(tex);
    this.shadow.setPosition(this.x, this.y).setDepth(this.y - 1);
    const bob = moving ? Math.abs(Math.sin(this.phase)) * 2.5 : 0;
    // Đứng yên thì vẫy đuôi (lắc nhẹ cả người).
    const wag = !moving && !this.lying ? Math.sin(this.phase * 2) * 3 : 0;
    this.sprite.setPosition(this.x, this.y - bob).setAngle(wag).setDepth(this.y);
  }

  destroy() {
    this.sprite.destroy();
    this.shadow.destroy();
  }
}
