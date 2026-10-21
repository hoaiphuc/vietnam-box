import { MAP_H, MAP_W } from '../config';
import { T, type MapData } from './mapgen';

export class World {
  readonly w = MAP_W;
  readonly h = MAP_H;

  constructor(readonly map: MapData) {}

  inBounds(x: number, y: number) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  tile(x: number, y: number) {
    return this.map.tiles[y * this.w + x];
  }

  /** Đi bộ được (kể cả chỗ lội sông). */
  walkable(x: number, y: number) {
    return this.inBounds(x, y) && this.tile(x, y) !== T.WATER;
  }

  /** Đất liền (không phải nước). */
  isLand(x: number, y: number) {
    if (!this.inBounds(x, y)) return false;
    const t = this.tile(x, y);
    return t !== T.WATER && t !== T.FORD;
  }

  isWater(x: number, y: number) {
    return this.inBounds(x, y) && this.tile(x, y) === T.WATER;
  }

  isForest(x: number, y: number) {
    return this.inBounds(x, y) && this.map.forest[y * this.w + x] === 1;
  }
}
