import Phaser from 'phaser';
import { TILE } from '../config';
import { BUILDINGS, type BuildingDef, type BuildingId } from '../data';
import type { GameScene } from '../scenes/GameScene';

/** built: đã xây xong · site: đang xây · planned: Thành Hoàng mới đánh dấu, chờ làng đủ gỗ. */
export type BuildState = 'built' | 'site' | 'planned';

export class Building {
  readonly def: BuildingDef;
  built: boolean;
  planned: boolean;
  progress = 0;
  readonly sprite: Phaser.GameObjects.Image;
  private bar: Phaser.GameObjects.Graphics;
  private glow?: Phaser.GameObjects.Image;
  private flame?: Phaser.GameObjects.Image;
  private windows: Phaser.GameObjects.Image[] = [];
  private fx: Phaser.GameObjects.GameObject[] = [];

  constructor(
    private scene: GameScene,
    readonly id: BuildingId,
    readonly tx: number,
    readonly ty: number,
    state: BuildState,
  ) {
    this.def = BUILDINGS[id];
    this.built = state === 'built';
    this.planned = state === 'planned';
    this.sprite = scene.add
      .image(this.px, this.py + this.def.oy, this.def.tex)
      .setOrigin(0.5, 1)
      .setDepth(this.py);
    this.bar = scene.add.graphics().setDepth(this.py + 1);
    if (this.built) this.activate();
    else if (this.planned) this.sprite.setAlpha(0.4).setTint(0x9fc8ff);
    else this.sprite.setAlpha(0.45).setTint(0xcbb48a);
    this.drawBar();
  }

  /** Tâm theo chiều ngang, mép dưới (pixel). */
  get px() {
    return (this.tx + this.def.w / 2) * TILE;
  }
  get py() {
    return (this.ty + this.def.h) * TILE;
  }
  get entrance() {
    return { x: this.tx + Math.floor(this.def.w / 2), y: this.ty + this.def.h };
  }

  tiles() {
    const out: { x: number; y: number }[] = [];
    for (let y = 0; y < this.def.h; y++) for (let x = 0; x < this.def.w; x++) out.push({ x: this.tx + x, y: this.ty + y });
    return out;
  }

  /** Trưởng làng bỏ gỗ ra: chỗ quy hoạch thành công trường. */
  fund() {
    this.planned = false;
    this.sprite.setAlpha(0.45).setTint(0xcbb48a);
    this.drawBar();
  }

  addProgress(amount: number) {
    if (this.built || this.planned) return;
    this.progress += amount;
    if (this.progress >= this.def.work) this.complete();
    this.drawBar();
  }

  destroy() {
    this.sprite.destroy();
    this.bar.destroy();
    this.glow?.destroy();
    this.flame?.destroy();
    for (const w of this.windows) w.destroy();
    for (const f of this.fx) f.destroy();
  }

  private complete() {
    this.built = true;
    this.progress = this.def.work;
    this.sprite.clearTint().setAlpha(1).setScale(0.85);
    this.scene.tweens.add({ targets: this.sprite, scale: 1, duration: 600, ease: 'Back.easeOut' });
    this.activate();
    this.scene.onBuilt(this);
  }

  private drawBar() {
    const g = this.bar;
    g.clear();
    if (this.built) return;
    if (this.planned) {
      const x = this.tx * TILE;
      const y = this.ty * TILE;
      const w = this.def.w * TILE;
      const h = this.def.h * TILE;
      g.lineStyle(1.5, 0x9fc8ff, 0.9);
      for (let i = 0; i < w; i += 8) {
        g.lineBetween(x + i, y, x + Math.min(w, i + 4), y);
        g.lineBetween(x + i, y + h, x + Math.min(w, i + 4), y + h);
      }
      for (let i = 0; i < h; i += 8) {
        g.lineBetween(x, y + i, x, y + Math.min(h, i + 4));
        g.lineBetween(x + w, y + i, x + w, y + Math.min(h, i + 4));
      }
      return;
    }
    const w = 40;
    const x = this.px - w / 2;
    const y = this.py + this.def.oy - this.sprite.height - 10;
    g.fillStyle(0x2b1d10, 0.55).fillRoundedRect(x - 1, y - 1, w + 2, 7, 3);
    g.fillStyle(0xffd34a, 1).fillRoundedRect(x, y, Math.max(2, (w * this.progress) / this.def.work), 5, 2);
  }

  private activate() {
    const s = this.scene;
    if (this.id === 'lua') {
      const fx = this.px;
      const fy = this.py - 10;
      this.glow = s.add.image(fx, fy, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xff9a3c).setScale(2.8).setDepth(50001);
      this.flame = s.add.image(fx, fy + 4, 'flame').setOrigin(0.5, 1).setDepth(50001);
      s.tweens.add({
        targets: this.flame,
        scaleY: { from: 0.82, to: 1.15 },
        scaleX: { from: 1.06, to: 0.9 },
        duration: 220,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.fx.push(
        s.add
          .particles(fx, fy - 12, 'smoke', {
            lifespan: 2400,
            frequency: 420,
            speedY: { min: -26, max: -14 },
            speedX: { min: -5, max: 8 },
            scale: { start: 0.5, end: 1.9 },
            alpha: { start: 0.32, end: 0 },
          })
          .setDepth(this.py + 2),
        s.add
          .particles(fx, fy - 6, 'spark', {
            lifespan: { min: 500, max: 900 },
            frequency: 260,
            speedY: { min: -70, max: -35 },
            speedX: { min: -15, max: 15 },
            scale: { start: 1, end: 0 },
            alpha: { start: 1, end: 0 },
            blendMode: 'ADD',
          })
          .setDepth(50002),
      );
    }
    if (this.id === 'nha') {
      const left = this.px - 36;
      const top = this.py + this.def.oy - 84;
      for (const wx of [20, 52]) {
        this.windows.push(
          s.add
            .image(left + wx, top + 61, 'glow')
            .setBlendMode(Phaser.BlendModes.ADD)
            .setTint(0xffc46b)
            .setScale(0.45)
            .setAlpha(0)
            .setDepth(50001),
        );
      }
    }
    if (this.id === 'mieu') {
      const top = this.py + this.def.oy - 57;
      // Khói hương nghi ngút.
      this.fx.push(
        s.add
          .particles(this.px, top + 32, 'smoke', {
            lifespan: 2600,
            frequency: 700,
            speedY: { min: -14, max: -8 },
            speedX: { min: -3, max: 3 },
            scale: { start: 0.15, end: 0.8 },
            alpha: { start: 0.4, end: 0 },
          })
          .setDepth(this.py + 2),
      );
      this.windows.push(
        s.add
          .image(this.px, top + 36, 'glow')
          .setBlendMode(Phaser.BlendModes.ADD)
          .setTint(0xff7a3a)
          .setScale(0.55)
          .setAlpha(0)
          .setDepth(50001),
      );
    }
  }

  /** night: 0 (ngày) → 1 (đêm). */
  updateLight(night: number, t: number) {
    if (this.glow) {
      const flicker = 0.88 + Math.sin(t * 11) * 0.06 + Math.sin(t * 23.7) * 0.06;
      this.glow.setAlpha(night * 0.6 * flicker);
      this.flame!.setAlpha(0.85 + night * 0.15);
    }
    for (const w of this.windows) w.setAlpha(night * 0.75);
  }
}
