import Phaser from 'phaser';
import { TILE } from '../config';
import type { GameScene } from '../scenes/GameScene';

export type AnimalKind = 'ga' | 'heo';

const INFO: Record<AnimalKind, { name: string; meat: number; speed: number; flee: number }> = {
  ga: { name: 'gà rừng', meat: 2, speed: 26, flee: 78 },
  heo: { name: 'heo rừng', meat: 5, speed: 22, flee: 70 },
};

export class Animal {
  alive = true;
  reservedBy: object | null = null;
  x: number;
  y: number;
  private homeX: number;
  private homeY: number;
  private target: { x: number; y: number } | null = null;
  private idleT = Math.random() * 3;
  private fleeT = 0;
  private fleeCd = 0;
  private fdx = 0;
  private fdy = 0;
  private phase = Math.random() * 10;
  private sprite: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;

  constructor(
    private scene: GameScene,
    readonly kind: AnimalKind,
    tx: number,
    ty: number,
  ) {
    this.x = this.homeX = tx * TILE + TILE / 2;
    this.y = this.homeY = ty * TILE + TILE / 2;
    this.shadow = scene.add.image(this.x, this.y, 'shadow').setScale(kind === 'heo' ? 1.2 : 0.8);
    this.sprite = scene.add.image(this.x, this.y, kind).setOrigin(0.5, 0.95);
    this.sprite.setAlpha(0);
    scene.tweens.add({ targets: this.sprite, alpha: 1, duration: 800 });
    this.render(false);
  }

  get name() {
    return INFO[this.kind].name;
  }
  get meat() {
    return INFO[this.kind].meat;
  }
  get tileX() {
    return Math.floor(this.x / TILE);
  }
  get tileY() {
    return Math.floor(this.y / TILE);
  }

  startle(fromX: number, fromY: number) {
    let dx = this.x - fromX;
    let dy = this.y - fromY;
    const d = Math.hypot(dx, dy) || 1;
    dx /= d;
    dy /= d;
    this.fdx = dx;
    this.fdy = dy;
    this.fleeT = 1.1 + Math.random() * 0.5;
    this.fleeCd = 2.6 + Math.random();
    this.target = null;
    this.call();
  }

  private call(vol = 1) {
    this.scene.sfx(this.kind === 'ga' ? 'cluck' : 'grunt', this.x, this.y, vol);
  }

  update(dt: number) {
    if (!this.alive) return;
    this.fleeCd -= dt;
    if (this.fleeT <= 0 && this.fleeCd <= 0) {
      for (const v of this.scene.villagers) {
        if (v.activity === 'san' && !v.inside && Phaser.Math.Distance.Between(v.x, v.y, this.x, this.y) < 70) {
          this.startle(v.x, v.y);
          break;
        }
      }
    }

    let moving = false;
    const info = INFO[this.kind];
    if (this.fleeT > 0) {
      this.fleeT -= dt;
      const step = info.flee * dt;
      if (!this.tryStep(this.x + this.fdx * step, this.y + this.fdy * step)) {
        // Bị chặn (bờ sông) thì rẽ ngang.
        const turn = Math.random() < 0.5 ? 1 : -1;
        [this.fdx, this.fdy] = [-this.fdy * turn, this.fdx * turn];
      }
      moving = true;
    } else if (this.idleT > 0) {
      this.idleT -= dt;
      if (Math.random() < dt * (this.kind === 'ga' ? 0.06 : 0.025)) this.call(0.5);
    } else if (this.target) {
      const dx = this.target.x - this.x;
      const dy = this.target.y - this.y;
      const d = Math.hypot(dx, dy);
      const step = info.speed * dt;
      if (d <= step || !this.tryStep(this.x + (dx / d) * step, this.y + (dy / d) * step)) {
        this.target = null;
        this.idleT = 1 + Math.random() * 3.5;
      }
      moving = true;
    } else {
      const tx = Math.floor(this.homeX / TILE) + Phaser.Math.Between(-4, 4);
      const ty = Math.floor(this.homeY / TILE) + Phaser.Math.Between(-4, 4);
      if (this.scene.world.isLand(tx, ty)) {
        this.target = { x: tx * TILE + Phaser.Math.Between(6, 26), y: ty * TILE + Phaser.Math.Between(6, 26) };
      } else {
        this.idleT = 1;
      }
    }
    this.phase += dt * (moving ? 16 : 4);
    this.render(moving);
  }

  private tryStep(nx: number, ny: number) {
    if (!this.scene.world.isLand(Math.floor(nx / TILE), Math.floor(ny / TILE))) return false;
    if (Math.abs(nx - this.x) > 0.05) this.sprite.setFlipX(nx < this.x);
    this.x = nx;
    this.y = ny;
    return true;
  }

  private render(moving: boolean) {
    this.shadow.setPosition(this.x, this.y);
    this.sprite.setPosition(this.x, this.y - (moving ? Math.abs(Math.sin(this.phase)) * 2 : 0));
    this.sprite.setAngle(!moving && this.kind === 'ga' ? Math.max(0, Math.sin(this.phase)) * 18 * (this.sprite.flipX ? -1 : 1) : 0);
    this.sprite.setDepth(this.y);
    this.shadow.setDepth(this.y - 1);
  }

  kill() {
    this.alive = false;
    this.scene.tweens.add({
      targets: [this.sprite, this.shadow],
      alpha: 0,
      duration: 400,
      onComplete: () => {
        this.sprite.destroy();
        this.shadow.destroy();
      },
    });
  }
}
