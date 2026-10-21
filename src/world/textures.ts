import Phaser from 'phaser';
import { MAP_H, MAP_W, TILE } from '../config';
import { T } from './mapgen';
import { mulberry32, ValueNoise } from './noise';
import type { World } from './World';

type Ctx = CanvasRenderingContext2D;

function make(scene: Phaser.Scene, key: string, w: number, h: number, draw: (c: Ctx) => void) {
  if (scene.textures.exists(key)) scene.textures.remove(key);
  const tex = scene.textures.createCanvas(key, w, h)!;
  draw(tex.getContext());
  tex.refresh();
}

function circle(c: Ctx, x: number, y: number, r: number, fill: string) {
  c.fillStyle = fill;
  c.beginPath();
  c.arc(x, y, r, 0, Math.PI * 2);
  c.fill();
}

function ell(c: Ctx, x: number, y: number, rx: number, ry: number, fill: string, rot = 0) {
  c.fillStyle = fill;
  c.beginPath();
  c.ellipse(x, y, rx, ry, rot, 0, Math.PI * 2);
  c.fill();
}

function poly(c: Ctx, pts: number[], fill: string) {
  c.fillStyle = fill;
  c.beginPath();
  c.moveTo(pts[0], pts[1]);
  for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]);
  c.closePath();
  c.fill();
}

function rrect(c: Ctx, x: number, y: number, w: number, h: number, r: number, fill: string) {
  c.fillStyle = fill;
  c.beginPath();
  c.roundRect(x, y, w, h, r);
  c.fill();
}

function line(c: Ctx, x0: number, y0: number, x1: number, y1: number, stroke: string, width = 1) {
  c.strokeStyle = stroke;
  c.lineWidth = width;
  c.beginPath();
  c.moveTo(x0, y0);
  c.lineTo(x1, y1);
  c.stroke();
}

function radial(c: Ctx, size: number, stops: [number, string][]) {
  const g = c.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  for (const [o, col] of stops) g.addColorStop(o, col);
  c.fillStyle = g;
  c.fillRect(0, 0, size, size);
}

function hex(h: string): [number, number, number] {
  const n = parseInt(h.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix(a: string, b: string, t: number) {
  const A = hex(a);
  const B = hex(b);
  const k = Math.max(0, Math.min(1, t));
  return `rgb(${A.map((v, i) => Math.round(v + (B[i] - v) * k)).join(',')})`;
}

// ---------------------------------------------------------------- nhân vật

interface Look {
  shirt: string;
  shirtDark: string;
  pants: string;
  hat: boolean;
  hair: string;
  long?: boolean;
}

function drawPerson(c: Ctx, o: Look) {
  const skin = '#e9b98c';
  // chân
  rrect(c, 9, 29, 4.5, 13, 1.5, o.pants);
  rrect(c, 14.5, 29, 4.5, 13, 1.5, o.pants);
  ell(c, 11.2, 42.5, 3, 1.4, '#3b2a1e');
  ell(c, 16.8, 42.5, 3, 1.4, '#3b2a1e');
  // áo
  rrect(c, 7, 17, 14, o.long ? 17 : 14, 4, o.shirt);
  rrect(c, 15, 18, 6, o.long ? 15 : 12, 3, o.shirtDark);
  // tay
  rrect(c, 4, 18.5, 4, 11, 2, o.shirt);
  rrect(c, 20, 18.5, 4, 11, 2, o.shirtDark);
  circle(c, 6, 30, 2, skin);
  circle(c, 22, 30, 2, skin);
  // nút áo bà ba
  circle(c, 14, 22, 0.8, 'rgba(255,255,255,0.5)');
  circle(c, 14, 26, 0.8, 'rgba(255,255,255,0.5)');
  // đầu
  circle(c, 14, 12.5, 6, skin);
  if (!o.hat) {
    c.fillStyle = o.hair;
    c.beginPath();
    c.arc(14, 11.5, 6.3, Math.PI * 1.05, Math.PI * 1.95);
    c.fill();
    circle(c, 9.5, 11, 2.2, o.hair);
    circle(c, 18.5, 11, 2.2, o.hair);
    circle(c, 14, 4.5, 1.8, o.hair);
  }
  circle(c, 15.5, 13, 0.9, '#2a1d14');
  circle(c, 18.5, 13, 0.9, '#2a1d14');
  ell(c, 17, 15.8, 1.4, 0.6, '#c97a6a');
  if (o.hat) {
    // nón lá
    ell(c, 14, 10.5, 13, 2.6, 'rgba(0,0,0,0.18)');
    poly(c, [0.5, 9.5, 27.5, 9.5, 14, -0.5], '#ecdcaa');
    poly(c, [14, -0.5, 27.5, 9.5, 14, 9.5], '#dcc68e');
    c.strokeStyle = 'rgba(160,130,70,0.55)';
    c.lineWidth = 0.7;
    for (let i = 1; i < 4; i++) {
      const y = -0.5 + i * 2.5;
      const half = (y + 0.5) * 1.35;
      line(c, 14 - half, y, 14 + half, y, 'rgba(160,130,70,0.55)', 0.7);
    }
  }
}

// ---------------------------------------------------------------- cây cối

function drawTree(c: Ctx, dark: string, mid: string, light: string, seed: number) {
  const r = mulberry32(seed);
  ell(c, 26, 66, 15, 4, 'rgba(0,0,0,0.2)');
  poly(c, [22, 66, 24, 38, 28, 38, 30, 66], '#6e4b2c');
  poly(c, [26.5, 66, 27, 40, 28, 40, 30, 66], '#55381f');
  const blobs = [
    [26, 30, 17],
    [13, 36, 11],
    [39, 36, 11],
    [17, 20, 12],
    [35, 20, 12],
    [26, 12, 11],
  ];
  for (const [x, y, rad] of blobs) circle(c, x, y + 2, rad, dark);
  for (const [x, y, rad] of blobs) circle(c, x - 1, y - 1, rad - 2.5, mid);
  for (const [x, y, rad] of blobs) if (r() < 0.8) circle(c, x - 3, y - 5, rad * 0.45, light);
  for (let i = 0; i < 10; i++) circle(c, 10 + r() * 32, 8 + r() * 34, 1.3, dark);
}

function drawBamboo(c: Ctx, cut: boolean) {
  const r = mulberry32(cut ? 7 : 3);
  const H = cut ? 22 : 78;
  const base = H - 3;
  ell(c, 22, base, 16, 3.5, 'rgba(0,0,0,0.2)');
  const stalks: [number, number, number][] = [
    [10, -0.1, 60],
    [16, 0.02, 70],
    [22, -0.04, 66],
    [28, 0.07, 72],
    [34, 0.12, 58],
  ];
  for (const [x, lean, h0] of stalks) {
    const h = cut ? 6 + r() * 6 : h0;
    const tx = x + lean * h;
    const ty = base - h;
    line(c, x, base, tx, ty, '#7aa83e', 3.4);
    line(c, x + 0.8, base, tx + 0.8, ty, '#9cc456', 1);
    for (let j = 9; j < h; j += 9) {
      const jx = x + lean * j;
      line(c, jx - 2, base - j, jx + 2, base - j, '#56802a', 1.2);
    }
    if (cut) {
      ell(c, tx, ty, 2, 1, '#d8e3a0');
    } else {
      for (let k = 0; k < 7; k++) {
        const ly = ty + k * 5 + r() * 3;
        const lx = x + lean * (base - ly) + (r() - 0.5) * 6;
        const ang = (r() < 0.5 ? -1 : 1) * (0.35 + r() * 0.5);
        ell(c, lx + Math.cos(ang) * 5 * Math.sign(ang), ly, 6.5, 1.7, k % 2 ? '#5d9b34' : '#76b443', ang);
      }
    }
  }
}

function drawBanana(c: Ctx, fruit: boolean) {
  ell(c, 24, 60, 14, 3.5, 'rgba(0,0,0,0.2)');
  poly(c, [21, 61, 27, 61, 26, 28, 22, 28], '#8aa84a');
  poly(c, [24, 61, 27, 61, 26, 28, 24, 28], '#738f3a');
  const leaves: [number, string][] = [
    [-2.6, '#5aa83a'],
    [-0.5, '#5aa83a'],
    [-2.0, '#6fbf45'],
    [-1.1, '#6fbf45'],
    [-1.6, '#7fcd52'],
  ];
  for (const [a, col] of leaves) {
    const lx = 24 + Math.cos(a) * 13;
    const ly = 27 + Math.sin(a) * 11;
    ell(c, lx, ly, 15, 4.8, col, a);
    line(c, 24, 27, 24 + Math.cos(a) * 26, 27 + Math.sin(a) * 22, 'rgba(60,100,30,0.6)', 0.8);
  }
  if (fruit) {
    for (let i = 0; i < 4; i++) {
      for (let j = 0; j < 3; j++) {
        ell(c, 27 + j * 2.6, 32 + i * 3.2, 1.6, 2.6, i % 2 ? '#d9cf45' : '#c4c83f', 0.3);
      }
    }
    ell(c, 30, 47, 2.4, 3.6, '#7a2b4a');
  }
}

// ---------------------------------------------------------------- thú rừng

function drawChicken(c: Ctx) {
  ell(c, 12, 21, 8, 2, 'rgba(0,0,0,0.2)');
  line(c, 11, 15, 10, 21, '#d9a23a', 1.3);
  line(c, 14, 15, 15, 21, '#d9a23a', 1.3);
  poly(c, [6, 12, 0, 2, 3, 1.5, 10, 9], '#2f5d3a');
  poly(c, [6, 12, 2, 5, 5, 4, 10, 10], '#3e7a4a');
  ell(c, 12, 12.5, 8, 5.5, '#b4552c');
  ell(c, 11, 12.5, 4.8, 3.3, '#8e3f1e');
  circle(c, 18, 7, 4, '#d0742f');
  circle(c, 17, 3.4, 1.5, '#d8322d');
  circle(c, 19, 3.2, 1.4, '#d8322d');
  circle(c, 19.6, 10, 1.3, '#d8322d');
  poly(c, [21.5, 6, 24, 7.2, 21.5, 8.4], '#e9b53b');
  circle(c, 19, 6.3, 0.9, '#111');
}

function drawBoar(c: Ctx) {
  ell(c, 18, 25, 14, 2.5, 'rgba(0,0,0,0.2)');
  for (const x of [8, 13, 22, 27]) rrect(c, x, 16, 3.5, 9, 1, '#33241b');
  ell(c, 17, 14.5, 13, 8, '#5c4334');
  ell(c, 17, 11, 11, 4, '#4a3428');
  for (let x = 8; x < 26; x += 2.5) line(c, x, 7.5, x - 1, 5, '#2e2018', 1);
  ell(c, 29, 15, 6.5, 5.8, '#5c4334');
  ell(c, 34, 17, 2.6, 2.3, '#8a6a58');
  circle(c, 34.8, 16.6, 0.6, '#2a1a12');
  poly(c, [31.5, 18.5, 33.5, 20.5, 32, 17.5], '#f2ead8');
  poly(c, [25.5, 10, 27.5, 5, 30, 10.5], '#4a3428');
  circle(c, 30, 13, 1, '#111');
  line(c, 4.5, 12, 2, 15, '#4a3428', 1.2);
}

// ---------------------------------------------------------------- công trình

function drawHouse(c: Ctx) {
  ell(c, 36, 80, 35, 5, 'rgba(0,0,0,0.18)');
  // tường đất
  c.fillStyle = '#d6b47c';
  c.fillRect(9, 42, 54, 38);
  c.fillStyle = '#b8935c';
  c.fillRect(9, 74, 54, 6);
  for (let i = 0; i < 26; i++) {
    const r = mulberry32(i + 99);
    circle(c, 11 + r() * 50, 45 + r() * 28, 0.9, 'rgba(140,100,60,0.35)');
  }
  c.fillStyle = '#8a6a3c';
  c.fillRect(8, 42, 3, 38);
  c.fillRect(61, 42, 3, 38);
  // cửa
  rrect(c, 29, 55, 14, 25, 2, '#5b3a22');
  c.fillStyle = '#7a5232';
  c.fillRect(29, 55, 14, 2);
  line(c, 36, 57, 36, 80, '#4a2e1a', 1);
  // cửa sổ
  for (const wx of [14, 46]) {
    c.fillStyle = '#3b2a1e';
    c.fillRect(wx, 55, 12, 11);
    for (let k = 1; k < 4; k++) line(c, wx + k * 3, 55, wx + k * 3, 66, '#a0784a', 1.4);
    c.fillStyle = '#8a6a3c';
    c.fillRect(wx - 1, 66, 14, 2);
  }
  // mái tranh
  poly(c, [0, 47, 72, 47, 58, 13, 14, 13], '#c9a04e');
  poly(c, [36, 13, 58, 13, 72, 47, 36, 47], '#b88f40');
  c.strokeStyle = 'rgba(130,95,35,0.6)';
  c.lineWidth = 1;
  for (let i = 0; i <= 18; i++) {
    const t = i / 18;
    line(c, 14 + t * 44, 14, t * 72, 46, 'rgba(130,95,35,0.55)', 1);
  }
  for (let x = 0; x < 72; x += 4) poly(c, [x, 46, x + 4, 46, x + 2, 50], '#a8823a');
  rrect(c, 12, 9, 48, 6, 3, '#8f6d2c');
  for (let x = 16; x < 58; x += 8) line(c, x, 9, x + 2, 15, '#6f5220', 1);
}

function drawStorehouse(c: Ctx) {
  ell(c, 36, 74, 35, 5, 'rgba(0,0,0,0.18)');
  c.fillStyle = '#9b6b3e';
  c.fillRect(8, 36, 56, 38);
  for (let y = 40; y < 74; y += 5) line(c, 8, y, 64, y, '#7a5230', 1);
  c.fillStyle = '#6e4a2a';
  c.fillRect(8, 36, 3, 38);
  c.fillRect(61, 36, 3, 38);
  rrect(c, 27, 48, 18, 26, 1, '#4f3420');
  line(c, 27, 48, 45, 74, '#6e4a2a', 2);
  line(c, 45, 48, 27, 74, '#6e4a2a', 2);
  // mái
  poly(c, [0, 40, 72, 40, 60, 12, 12, 12], '#7b5a36');
  poly(c, [36, 12, 60, 12, 72, 40, 36, 40], '#6a4c2c');
  for (let i = 0; i <= 12; i++) {
    const t = i / 12;
    line(c, 12 + t * 48, 12, t * 72, 40, 'rgba(50,30,15,0.4)', 1);
  }
  rrect(c, 10, 8, 52, 6, 3, '#5a3e22');
  // đống gỗ và bao lúa
  for (const [x, y] of [
    [54, 70],
    [61, 70],
    [57.5, 64],
  ]) {
    circle(c, x, y, 3.6, '#8a5a32');
    circle(c, x, y, 2.4, '#d9b27a');
    circle(c, x, y, 1, '#a07a4c');
  }
  ell(c, 14, 69, 5, 6, '#e3d2a2');
  ell(c, 20, 70, 4.5, 5.5, '#d6c28e');
}

function drawCampfire(c: Ctx) {
  ell(c, 18, 22, 15, 6, 'rgba(0,0,0,0.25)');
  ell(c, 18, 21, 9, 4, '#3a2a20');
  for (let i = 0; i < 9; i++) {
    const a = (i / 9) * Math.PI * 2;
    ell(c, 18 + Math.cos(a) * 12, 21 + Math.sin(a) * 6, 3.4, 2.6, i % 2 ? '#9a9a90' : '#85857c');
    ell(c, 17.5 + Math.cos(a) * 12, 20.2 + Math.sin(a) * 6, 2, 1.2, '#b8b8ae');
  }
  c.save();
  c.translate(18, 19);
  c.rotate(0.45);
  rrect(c, -10, -2, 20, 4, 2, '#6e4b2c');
  c.rotate(-0.9);
  rrect(c, -10, -2, 20, 4, 2, '#7d5634');
  c.restore();
}

function drawFlame(c: Ctx) {
  const tear = (cx: number, base: number, w: number, h: number, col: string) => {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(cx, base - h);
    c.bezierCurveTo(cx + w, base - h * 0.45, cx + w, base, cx, base);
    c.bezierCurveTo(cx - w, base, cx - w, base - h * 0.45, cx, base - h);
    c.fill();
  };
  tear(10, 27, 9, 26, '#ff6a1f');
  tear(10, 27, 6.5, 19, '#ffa531');
  tear(10, 27, 3.5, 11, '#fff0a0');
}

// ---------------------------------------------------------------- tạo toàn bộ texture

export function createTextures(scene: Phaser.Scene) {
  make(scene, 'v_bo', 28, 45, (c) =>
    drawPerson(c, { shirt: '#7a5236', shirtDark: '#654229', pants: '#33302c', hat: true, hair: '#1d1a17' }),
  );
  make(scene, 'v_me', 28, 45, (c) =>
    drawPerson(c, { shirt: '#9c72b5', shirtDark: '#8460a0', pants: '#24211f', hat: true, hair: '#1d1a17', long: true }),
  );
  make(scene, 'v_con', 28, 45, (c) =>
    drawPerson(c, { shirt: '#f3f1ea', shirtDark: '#dcd8cc', pants: '#3b6fb6', hat: false, hair: '#1d1a17' }),
  );

  make(scene, 'tree1', 52, 68, (c) => drawTree(c, '#2f6a35', '#3f8a3f', '#62a94f', 1));
  make(scene, 'tree2', 52, 68, (c) => drawTree(c, '#265a3a', '#357a48', '#4f9a5a', 2));
  make(scene, 'sapling', 24, 28, (c) => {
    ell(c, 12, 26, 7, 2, 'rgba(0,0,0,0.2)');
    line(c, 12, 26, 12, 12, '#6e4b2c', 2);
    circle(c, 12, 10, 6, '#3f8a3f');
    circle(c, 8, 14, 4, '#3f8a3f');
    circle(c, 16, 14, 4, '#3f8a3f');
    circle(c, 11, 8, 3, '#62a94f');
  });
  make(scene, 'stump', 28, 20, (c) => {
    ell(c, 14, 17, 11, 3, 'rgba(0,0,0,0.2)');
    rrect(c, 6, 8, 16, 10, 2, '#7a5634');
    ell(c, 14, 8, 8, 3.5, '#c9a06a');
    ell(c, 14, 8, 5, 2.2, '#b48a56');
    ell(c, 14, 8, 2, 0.9, '#a07a4c');
  });
  make(scene, 'bamboo', 44, 78, (c) => drawBamboo(c, false));
  make(scene, 'bamboo_cut', 44, 22, (c) => drawBamboo(c, true));
  make(scene, 'banana', 48, 62, (c) => drawBanana(c, true));
  make(scene, 'banana_empty', 48, 62, (c) => drawBanana(c, false));

  make(scene, 'ga', 25, 23, drawChicken);
  make(scene, 'heo', 37, 27, drawBoar);

  make(scene, 'nha', 72, 84, drawHouse);
  make(scene, 'kho', 72, 78, drawStorehouse);
  make(scene, 'lua', 36, 30, drawCampfire);
  make(scene, 'flame', 20, 28, drawFlame);

  make(scene, 'glow', 128, 128, (c) =>
    radial(c, 128, [
      [0, 'rgba(255,255,255,1)'],
      [0.35, 'rgba(255,255,255,0.45)'],
      [1, 'rgba(255,255,255,0)'],
    ]),
  );
  make(scene, 'smoke', 16, 16, (c) =>
    radial(c, 16, [
      [0, 'rgba(220,220,215,0.9)'],
      [1, 'rgba(220,220,215,0)'],
    ]),
  );
  make(scene, 'spark', 6, 6, (c) =>
    radial(c, 6, [
      [0, 'rgba(255,255,220,1)'],
      [1, 'rgba(255,180,60,0)'],
    ]),
  );
  make(scene, 'firefly', 16, 16, (c) =>
    radial(c, 16, [
      [0, 'rgba(255,255,200,1)'],
      [0.3, 'rgba(255,245,140,0.8)'],
      [1, 'rgba(255,240,120,0)'],
    ]),
  );
  make(scene, 'ripple', 16, 6, (c) => {
    c.strokeStyle = 'rgba(230,250,255,0.9)';
    c.lineWidth = 1.5;
    c.beginPath();
    c.moveTo(1, 4);
    c.quadraticCurveTo(8, 0, 15, 4);
    c.stroke();
  });
  make(scene, 'shadow', 26, 10, (c) => ell(c, 13, 5, 12, 4, 'rgba(0,0,0,0.25)'));
  make(scene, 'ring', 36, 18, (c) => {
    c.strokeStyle = '#ffe27a';
    c.lineWidth = 2.5;
    c.beginPath();
    c.ellipse(18, 9, 15, 6.5, 0, 0, Math.PI * 2);
    c.stroke();
  });
}

// ---------------------------------------------------------------- mặt đất

type Group = 0 | 1 | 2 | 3 | 4;

function groupOf(t: number): Group {
  if (t === T.FOREST) return 1;
  if (t === T.SAND) return 2;
  if (t === T.DIRT) return 3;
  if (t === T.WATER || t === T.FORD) return 4;
  return 0;
}

export function drawGround(scene: Phaser.Scene, world: World) {
  const n = new ValueNoise(4242);
  const colorAt = (t: number, x: number, y: number) => {
    const v = n.fbm(x * 0.18, y * 0.18);
    switch (t) {
      case T.FOREST:
        return mix('#6b9b4b', '#56853e', v);
      case T.SAND:
        return mix('#e8d7a2', '#d9c48b', v);
      case T.DIRT:
        return mix('#cfa771', '#b98f5b', v);
      case T.WATER: {
        let deep = true;
        for (let dy = -1; dy <= 1; dy++)
          for (let dx = -1; dx <= 1; dx++) if (!world.isWater(x + dx, y + dy) && world.inBounds(x + dx, y + dy)) deep = false;
        return deep ? mix('#3f8db0', '#3a83a6', v) : mix('#55a5c4', '#4c9bbb', v);
      }
      case T.FORD:
        return mix('#7cbfce', '#6fb2c3', v);
      case T.GRASS2:
        return mix('#86b85a', '#76a84f', v);
      default:
        return mix('#95c466', '#7fb158', v);
    }
  };

  make(scene, 'ground', MAP_W * TILE, MAP_H * TILE, (c) => {
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = world.tile(x, y);
        const r = mulberry32((x * 73856093) ^ (y * 19349663));
        const px = x * TILE;
        const py = y * TILE;
        c.fillStyle = colorAt(t, x, y);
        c.fillRect(px, py, TILE, TILE);

        if (t === T.GRASS || t === T.GRASS2 || t === T.FLOWER || t === T.FOREST) {
          const forest = t === T.FOREST;
          for (let i = 0; i < 9; i++) {
            const bx = px + r() * TILE;
            const by = py + r() * TILE;
            const col = r() < 0.55 ? (forest ? '#4c7a35' : '#6c9c48') : forest ? '#7aa95a' : '#a8d277';
            line(c, bx, by, bx + (r() - 0.5) * 3, by - 3 - r() * 3, col, 1.2);
          }
          if (forest) {
            for (let i = 0; i < 3; i++) circle(c, px + r() * TILE, py + r() * TILE, 1.4, r() < 0.5 ? '#8a7a3e' : '#4b7434');
          }
          if (t === T.FLOWER) {
            const cols = ['#fff6d5', '#f7d34a', '#f29bb2', '#c9a9f0'];
            for (let i = 0; i < 3; i++) {
              const fx = px + 4 + r() * 24;
              const fy = py + 4 + r() * 24;
              const col = cols[Math.floor(r() * cols.length)];
              for (let k = 0; k < 4; k++) circle(c, fx + Math.cos(k * 1.57) * 1.6, fy + Math.sin(k * 1.57) * 1.6, 1.3, col);
              circle(c, fx, fy, 1, '#f0b030');
            }
          }
        } else if (t === T.SAND) {
          for (let i = 0; i < 10; i++) circle(c, px + r() * TILE, py + r() * TILE, 0.8, 'rgba(160,130,80,0.45)');
        } else if (t === T.DIRT) {
          for (let i = 0; i < 6; i++) {
            ell(c, px + r() * TILE, py + r() * TILE, 1.6, 1.1, r() < 0.5 ? '#a88457' : '#dcbb88');
          }
        } else if (t === T.WATER) {
          for (let i = 0; i < 2; i++) {
            const wx = px + r() * 24;
            const wy = py + r() * 30;
            line(c, wx, wy, wx + 6, wy, 'rgba(160,215,235,0.35)', 1);
          }
        } else if (t === T.FORD) {
          for (let i = 0; i < 4; i++) {
            const sx = px + 4 + r() * 24;
            const sy = py + 4 + r() * 24;
            ell(c, sx, sy, 3 + r() * 2, 2.2, '#9d9886');
            ell(c, sx - 0.5, sy - 0.8, 2, 1.1, '#bdb8a5');
          }
        }
      }
    }

    // Làm mềm ranh giới giữa các loại đất.
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        const t = world.tile(x, y);
        const g = groupOf(t);
        if (g === 4) continue;
        const r = mulberry32((x * 9176) ^ (y * 4111) ^ 77);
        const col = colorAt(t, x, y);
        for (const [dx, dy] of [
          [1, 0],
          [-1, 0],
          [0, 1],
          [0, -1],
        ]) {
          const nx = x + dx;
          const ny = y + dy;
          if (!world.inBounds(nx, ny)) continue;
          const ng = groupOf(world.tile(nx, ny));
          if (ng === g || ng === 4) continue;
          for (let k = 0; k < 6; k++) {
            const along = r() * TILE;
            const over = r() * 6;
            const cxp = dx !== 0 ? x * TILE + (dx > 0 ? TILE + over : -over) : x * TILE + along;
            const cyp = dy !== 0 ? y * TILE + (dy > 0 ? TILE + over : -over) : y * TILE + along;
            circle(c, cxp, cyp, 2 + r() * 3, col);
          }
        }
      }
    }

    // Bọt nước dọc bờ sông.
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (groupOf(world.tile(x, y)) !== 4) continue;
        const px = x * TILE;
        const py = y * TILE;
        const edge = (nx: number, ny: number) => world.inBounds(nx, ny) && world.isLand(nx, ny);
        c.strokeStyle = 'rgba(225,245,250,0.6)';
        c.lineWidth = 2;
        if (edge(x - 1, y)) line(c, px + 1.5, py, px + 1.5, py + TILE, 'rgba(225,245,250,0.55)', 2);
        if (edge(x + 1, y)) line(c, px + TILE - 1.5, py, px + TILE - 1.5, py + TILE, 'rgba(225,245,250,0.55)', 2);
        if (edge(x, y - 1)) line(c, px, py + 1.5, px + TILE, py + 1.5, 'rgba(225,245,250,0.55)', 2);
        if (edge(x, y + 1)) line(c, px, py + TILE - 1.5, px + TILE, py + TILE - 1.5, 'rgba(225,245,250,0.55)', 2);
      }
    }
  });
}
