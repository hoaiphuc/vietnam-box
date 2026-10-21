import Phaser from 'phaser';
import { DAY_LENGTH, TILE } from '../config';
import type { NodeKind } from '../world/mapgen';

const REGROW: Record<NodeKind, number> = {
  tree: DAY_LENGTH * 1.5,
  bamboo: DAY_LENGTH * 0.8,
  banana: DAY_LENGTH * 0.9,
};

/** Cây, bụi tre, bụi chuối: khai thác xong sẽ mọc lại theo thời gian. */
export class ResourceNode {
  grown = true;
  reservedBy: object | null = null;
  readonly sprite: Phaser.GameObjects.Image;
  private timer = 0;
  private readonly fullTex: string;
  private readonly baseScale: number;

  constructor(
    private scene: Phaser.Scene,
    readonly kind: NodeKind,
    readonly tx: number,
    readonly ty: number,
  ) {
    this.fullTex = kind === 'tree' ? (Math.random() < 0.6 ? 'tree1' : 'tree2') : kind;
    this.baseScale = 0.88 + Math.random() * 0.25;
    this.sprite = scene.add
      .image(this.x + Phaser.Math.Between(-3, 3), this.y, this.fullTex)
      .setScale(this.baseScale)
      .setFlipX(Math.random() < 0.5)
      .setDepth(this.y);
    this.setTex(this.fullTex);
  }

  get x() {
    return this.tx * TILE + TILE / 2;
  }
  get y() {
    return this.ty * TILE + TILE - 4;
  }

  private setTex(key: string) {
    this.sprite.setTexture(key);
    this.sprite.setOrigin(0.5, 1 - 3 / this.sprite.height);
  }

  harvest() {
    this.grown = false;
    this.timer = REGROW[this.kind] * (0.85 + Math.random() * 0.3);
    if (this.kind === 'banana') {
      this.setTex('banana_empty');
      return;
    }
    const stump = this.kind === 'tree' ? 'stump' : 'bamboo_cut';
    this.scene.tweens.add({
      targets: this.sprite,
      angle: this.sprite.flipX ? -85 : 85,
      alpha: 0,
      duration: 500,
      ease: 'Quad.easeIn',
      onComplete: () => {
        this.sprite.setAngle(0).setAlpha(1);
        this.setTex(stump);
      },
    });
  }

  update(dt: number) {
    if (this.grown) return;
    const before = this.timer;
    this.timer -= dt;
    const half = REGROW[this.kind] / 2;
    if (this.kind === 'tree' && before > half && this.timer <= half) this.setTex('sapling');
    if (this.timer <= 0) this.regrow();
  }

  /** Thành Hoàng ban lộc: mọc lại ngay. Trả về true nếu có tác dụng. */
  bless() {
    if (this.grown) return false;
    this.regrow();
    return true;
  }

  private regrow() {
    this.grown = true;
    this.timer = 0;
    this.setTex(this.fullTex);
    this.sprite.setScale(this.baseScale * 0.4);
    this.scene.tweens.add({ targets: this.sprite, scale: this.baseScale, duration: 700, ease: 'Back.easeOut' });
  }

  destroy() {
    this.sprite.destroy();
  }
}
