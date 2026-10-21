export interface Pt {
  x: number;
  y: number;
}

class MinHeap {
  private items: number[] = [];
  private prio: number[] = [];

  get size() {
    return this.items.length;
  }

  push(item: number, p: number) {
    const a = this.items;
    const pr = this.prio;
    a.push(item);
    pr.push(p);
    let i = a.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (pr[parent] <= pr[i]) break;
      [a[i], a[parent]] = [a[parent], a[i]];
      [pr[i], pr[parent]] = [pr[parent], pr[i]];
      i = parent;
    }
  }

  pop(): number {
    const a = this.items;
    const pr = this.prio;
    const top = a[0];
    const lastItem = a.pop()!;
    const lastPrio = pr.pop()!;
    if (a.length > 0) {
      a[0] = lastItem;
      pr[0] = lastPrio;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && pr[l] < pr[m]) m = l;
        if (r < a.length && pr[r] < pr[m]) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        [pr[i], pr[m]] = [pr[m], pr[i]];
        i = m;
      }
    }
    return top;
  }
}

const DIRS: [number, number, number][] = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, Math.SQRT2],
  [1, -1, Math.SQRT2],
  [-1, 1, Math.SQRT2],
  [-1, -1, Math.SQRT2],
];

/** A* 8 hướng trên lưới, không cắt góc. Trả về các ô đi qua (không gồm ô xuất phát). */
export function findPath(
  w: number,
  h: number,
  walkable: (x: number, y: number) => boolean,
  sx: number,
  sy: number,
  tx: number,
  ty: number,
): Pt[] | null {
  if (!walkable(tx, ty)) return null;
  if (sx === tx && sy === ty) return [];

  const n = w * h;
  const g = new Float32Array(n).fill(Infinity);
  const came = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const heap = new MinHeap();
  const heur = (x: number, y: number) => {
    const dx = Math.abs(x - tx);
    const dy = Math.abs(y - ty);
    return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
  };

  const start = sy * w + sx;
  const goal = ty * w + tx;
  g[start] = 0;
  heap.push(start, heur(sx, sy));

  while (heap.size) {
    const cur = heap.pop();
    if (cur === goal) break;
    if (closed[cur]) continue;
    closed[cur] = 1;
    const cx = cur % w;
    const cy = (cur / w) | 0;
    for (const [dx, dy, cost] of DIRS) {
      const nx = cx + dx;
      const ny = cy + dy;
      if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
      if (!walkable(nx, ny)) continue;
      if (dx && dy && (!walkable(cx + dx, cy) || !walkable(cx, cy + dy))) continue;
      const ni = ny * w + nx;
      if (closed[ni]) continue;
      const ng = g[cur] + cost;
      if (ng < g[ni]) {
        g[ni] = ng;
        came[ni] = cur;
        heap.push(ni, ng + heur(nx, ny));
      }
    }
  }

  if (came[goal] === -1) return null;
  const path: Pt[] = [];
  for (let c = goal; c !== start; c = came[c]) path.push({ x: c % w, y: (c / w) | 0 });
  return path.reverse();
}
