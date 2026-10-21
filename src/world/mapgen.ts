import { MAP_W as W, MAP_H as H } from '../config';
import { mulberry32, ValueNoise } from './noise';

export const T = {
  GRASS: 0,
  GRASS2: 1,
  FLOWER: 2,
  FOREST: 3,
  SAND: 4,
  DIRT: 5,
  WATER: 6,
  FORD: 7,
} as const;

export type NodeKind = 'tree' | 'bamboo' | 'banana';

export interface MapData {
  tiles: Uint8Array;
  forest: Uint8Array;
  nodes: { kind: NodeKind; x: number; y: number }[];
  village: { x: number; y: number };
}

export function generateMap(seed: number): MapData {
  const rand = mulberry32(seed);
  const n1 = new ValueNoise(seed + 11);
  const n2 = new ValueNoise(seed + 29);
  const tiles = new Uint8Array(W * H);
  const forest = new Uint8Array(W * H);
  const village = { x: Math.floor(W * 0.27), y: Math.floor(H * 0.5) };

  // Con sông uốn lượn từ bắc xuống nam.
  const cx: number[] = [];
  const hw: number[] = [];
  for (let y = 0; y < H; y++) {
    cx.push(W * 0.6 + Math.sin(y * 0.13 + (seed % 7)) * 4.5 + (n1.fbm(1.7, y * 0.07) - 0.5) * 10);
    hw.push(1.6 + n2.fbm(5.3, y * 0.12) * 1.4);
  }
  // Hai chỗ nước cạn để lội qua sông.
  const fords = [Math.floor(H * 0.2), Math.floor(H * 0.74)];
  const isFordRow = (y: number) => fords.some((f) => y === f || y === f + 1);

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const d = Math.abs(x + 0.5 - cx[y]);
      if (d < hw[y]) {
        tiles[i] = isFordRow(y) ? T.FORD : T.WATER;
        continue;
      }
      if (d < hw[y] + 1.2 && n2.noise(x * 0.6, y * 0.6) > 0.35) {
        tiles[i] = T.SAND;
        continue;
      }
      const dv = Math.hypot(x - village.x, (y - village.y) * 1.15);
      if (dv < 3.6 + n1.noise(x * 0.5, y * 0.5) * 1.6) {
        tiles[i] = T.DIRT;
        continue;
      }
      const east = x > cx[y] + hw[y] + 1.5;
      const fv = n2.fbm(x * 0.09 + 3, y * 0.09);
      if ((east && fv > 0.38) || (!east && fv > 0.63 && dv > 13)) {
        forest[i] = 1;
        tiles[i] = T.FOREST;
        continue;
      }
      tiles[i] = rand() < 0.05 ? T.FLOWER : n1.fbm(x * 0.12 + 10, y * 0.12) > 0.56 ? T.GRASS2 : T.GRASS;
    }
  }

  // Đường đất từ làng ra chỗ lội sông.
  const carve = (x0: number, y0: number, x1: number, y1: number, wobble: number) => {
    const steps = Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 3);
    for (let s = 0; s <= steps; s++) {
      const t = s / steps;
      const x = Math.round(x0 + (x1 - x0) * t + Math.sin(t * Math.PI * 2) * wobble);
      const y = Math.round(y0 + (y1 - y0) * t);
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const i = y * W + x;
      if (tiles[i] === T.WATER || tiles[i] === T.FORD) continue;
      tiles[i] = T.DIRT;
      forest[i] = 0;
    }
  };
  for (const f of fords) {
    carve(village.x, village.y, Math.floor(cx[f] - hw[f] - 0.5), f, 1.5);
    const east = Math.ceil(cx[f] + hw[f] - 0.5);
    carve(east, f, Math.min(W - 2, east + 8), f + (f < H / 2 ? -2 : 2), 0.8);
  }

  // Cây cối, lũy tre, bụi chuối.
  const nodes: MapData['nodes'] = [];
  const used = new Uint8Array(W * H);
  const put = (kind: NodeKind, x: number, y: number) => {
    const i = y * W + x;
    if (used[i]) return;
    used[i] = 1;
    nodes.push({ kind, x, y });
  };
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      const t = tiles[i];
      if (t === T.WATER || t === T.FORD || t === T.SAND || t === T.DIRT) continue;
      const dv = Math.hypot(x - village.x, (y - village.y) * 1.15);
      if (forest[i]) {
        if (rand() < 0.42) put(rand() < 0.86 ? 'tree' : 'bamboo', x, y);
        continue;
      }
      const ang = Math.atan2(y - village.y, x - village.x);
      if (dv > 9 && dv < 11.5 && n1.noise(ang * 2.5 + 40, 3.3) > 0.4 && rand() < 0.6) {
        put('bamboo', x, y);
        continue;
      }
      const toRiver = cx[y] - hw[y] - x;
      if (toRiver > 0 && toRiver < 6 && rand() < 0.09) {
        put('banana', x, y);
        continue;
      }
      if (dv > 5 && dv < 9 && rand() < 0.035) {
        put('banana', x, y);
        continue;
      }
      if (dv > 13 && rand() < 0.02) put('tree', x, y);
    }
  }

  return { tiles, forest, nodes, village };
}
