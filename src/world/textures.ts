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

export interface Look {
  shirt: string;
  shirtDark: string;
  pants: string;
  hat: boolean;
  hair: string;
  /** Áo bà ba dài (nữ). */
  long?: boolean;
  /** Tóc búi hai bên (bé gái). */
  buns?: boolean;
  /** Chống gậy (người già). */
  cane?: boolean;
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
  // gậy
  if (o.cane) line(c, 23, 27, 25.5, 43, '#7a5634', 1.6);
  // đầu
  circle(c, 14, 12.5, 6, skin);
  if (!o.hat) {
    c.fillStyle = o.hair;
    c.beginPath();
    c.arc(14, 11.5, 6.3, Math.PI * 1.05, Math.PI * 1.95);
    c.fill();
    if (o.buns) {
      circle(c, 8.5, 9.5, 2.4, o.hair);
      circle(c, 19.5, 9.5, 2.4, o.hair);
    } else {
      circle(c, 9.5, 11, 1.6, o.hair);
    }
    circle(c, 14, 4.8, 1.6, o.hair);
  } else {
    // tóc mai dưới vành nón
    circle(c, 8.8, 12.5, 1.6, o.hair);
    circle(c, 19.5, 12.5, 1.2, o.hair);
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

/** Bãi đất sét ven sông; `dug`: đã đào, còn vũng nước chờ phù sa bồi lại. */
function drawClay(c: Ctx, dug: boolean) {
  ell(c, 18, 15, 17, 7.5, '#8a6a4c');
  ell(c, 18, 14, 15.5, 6.5, dug ? '#7a5a3e' : '#a9805c');
  if (dug) {
    ell(c, 18, 15, 10, 4, '#5a4230');
    ell(c, 18, 15.5, 8, 3, '#6f8fa0');
    ell(c, 15, 14.5, 3, 0.8, 'rgba(255,255,255,0.45)');
    return;
  }
  ell(c, 13, 12, 6, 3.2, '#b98e66');
  ell(c, 23, 13, 5.5, 3, '#b48a63');
  ell(c, 12, 11, 2.5, 1.1, 'rgba(255,240,215,0.45)');
  ell(c, 22.5, 12, 2.2, 1, 'rgba(255,240,215,0.4)');
  ell(c, 18, 17, 3.5, 1.4, '#6f8fa0');
}

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

/** Chó vàng giữ nhà, quay sang phải. */
function drawDog(c: Ctx, lying: boolean) {
  const fur = '#d9a54a';
  const dark = '#b07a2e';
  if (lying) {
    ell(c, 15, 13, 13, 2.5, 'rgba(0,0,0,0.2)');
    ell(c, 13, 9.5, 10, 4.5, fur);
    line(c, 4, 9, 1, 6, dark, 2);
    ell(c, 23, 9, 5, 4, fur);
    poly(c, [20, 6, 21, 2, 23.5, 5.5], dark);
    ell(c, 27.5, 10, 2.4, 1.8, fur);
    circle(c, 29.5, 9.8, 0.9, '#2a1a12');
    line(c, 22.5, 8.5, 24.5, 8.5, '#2a1a12', 0.8);
    for (const x of [16, 20]) ell(c, x + 4, 13, 3, 1.3, fur);
    return;
  }
  ell(c, 15, 20.5, 11, 2, 'rgba(0,0,0,0.2)');
  for (const x of [7, 10, 18, 21]) rrect(c, x, 12, 2.6, 8, 1, dark);
  ell(c, 14, 11, 9.5, 4.8, fur);
  ell(c, 13, 13.5, 6, 2, '#f0d08a');
  line(c, 5, 10, 1.5, 4.5, fur, 2.2);
  ell(c, 24, 7, 4.8, 4.2, fur);
  poly(c, [21, 4.5, 21.8, 0, 24.5, 3.5], dark);
  ell(c, 28.5, 8.5, 2.6, 2, '#e8bf6a');
  circle(c, 30.6, 8, 1, '#2a1a12');
  circle(c, 25.5, 6, 0.9, '#111');
}

/** Trâu đen, sừng cong, quay sang phải. */
function drawBuffalo(c: Ctx) {
  ell(c, 24, 31, 18, 3, 'rgba(0,0,0,0.22)');
  for (const x of [10, 15, 30, 35]) rrect(c, x, 18, 4, 12, 1.5, '#2e2a28');
  for (const x of [10, 15, 30, 35]) rrect(c, x, 28, 4, 2.5, 1, '#1a1716');
  ell(c, 23, 17, 15, 8, '#4a4542');
  ell(c, 22, 13, 12, 4, '#5a5450');
  line(c, 8, 14, 4, 22, '#4a4542', 2);
  ell(c, 4, 23, 1.5, 2.5, '#2e2a28');
  // đầu và sừng
  ell(c, 40, 17, 6.5, 6, '#4a4542');
  ell(c, 45, 20, 3.5, 3, '#6e6764');
  circle(c, 46.5, 19.5, 0.7, '#1a1716');
  circle(c, 41, 15, 1, '#111');
  c.strokeStyle = '#d9d0bc';
  c.lineWidth = 2.2;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(37, 12);
  c.quadraticCurveTo(30, 6, 34, 2);
  c.moveTo(42, 12);
  c.quadraticCurveTo(48, 6, 45, 2);
  c.stroke();
  ell(c, 36, 14, 2.5, 1.4, '#3a3532', -0.5);
}

/** Cái cày gỗ kéo sau lưng trâu. */
function drawPlow(c: Ctx) {
  line(c, 2, 4, 18, 14, '#7a5634', 2);
  line(c, 14, 4, 18, 14, '#6e4a2a', 2);
  poly(c, [16, 12, 22, 16, 15, 16], '#9a9a90');
  line(c, 2, 4, 1, 1, '#7a5634', 1.6);
}

// ---------------------------------------------------------------- công trình

/** Chuồng trâu: hàng rào tre bao quanh, góc có mái rạ che mưa nắng, máng cỏ. */
function drawPen(c: Ctx) {
  ell(c, 36, 60, 34, 4, 'rgba(0,0,0,0.18)');
  rrect(c, 4, 28, 64, 32, 3, '#a58a5a');
  for (let i = 0; i < 18; i++) circle(c, 8 + ((i * 37) % 56), 32 + ((i * 23) % 24), 1.2, '#8a7448');
  // mái rạ góc chuồng
  rrect(c, 40, 24, 4, 22, 1, '#6e4a2a');
  rrect(c, 62, 24, 4, 22, 1, '#6e4a2a');
  poly(c, [34, 26, 70, 26, 66, 10, 38, 10], '#c9a85a');
  for (let x = 40; x < 66; x += 3) line(c, x, 11, x - 1, 26, 'rgba(120,90,40,0.5)', 1);
  // máng cỏ
  rrect(c, 8, 44, 18, 6, 2, '#7a5634');
  for (let x = 10; x < 25; x += 3) line(c, x, 45, x + 1, 41, '#7fae4a', 1.4);
  // hàng rào tre
  for (let x = 4; x <= 68; x += 6) line(c, x, 60, x, 34, '#b8a050', 2);
  for (const y of [40, 50]) line(c, 3, y, 69, y, '#9a8540', 1.6);
}

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

/** Thời hái lượm: lều khung tre, vách phên, mái lợp lá. */
function drawHut(c: Ctx) {
  ell(c, 36, 80, 32, 4.5, 'rgba(0,0,0,0.18)');
  // vách phên tre
  c.fillStyle = '#d9c38a';
  c.fillRect(11, 50, 50, 30);
  for (let y = 52; y < 80; y += 4) line(c, 11, y, 61, y, 'rgba(150,120,60,0.45)', 1);
  for (let x = 14; x < 61; x += 5) line(c, x, 50, x, 80, 'rgba(150,120,60,0.25)', 1);
  // cột tre
  for (const x of [11, 36, 61]) {
    line(c, x, 46, x, 80, '#7aa83e', 3);
    line(c, x + 0.8, 46, x + 0.8, 80, '#9cc456', 1);
  }
  // cửa: tấm phên vén lên
  rrect(c, 29, 61, 14, 19, 1, '#4a3424');
  poly(c, [26, 57, 46, 57, 44, 62, 28, 62], '#c9ad6e');
  // ô cửa sổ
  for (const wx of [15, 47]) {
    c.fillStyle = '#3b2a1e';
    c.fillRect(wx, 56, 10, 9);
    for (let k = 1; k < 3; k++) line(c, wx + k * 3.3, 56, wx + k * 3.3, 65, '#7aa83e', 1.4);
  }
  // mái lá: từng lớp lá chuối, lá cọ xếp chồng
  poly(c, [2, 52, 70, 52, 47, 18, 25, 18], '#6f8a3a');
  poly(c, [36, 18, 47, 18, 70, 52, 36, 52], '#5d7a30');
  const r = mulberry32(17);
  for (let row = 0; row < 6; row++) {
    const y = 22 + row * 5.6;
    const t = (y - 18) / 34;
    const x0 = 25 - t * 23;
    const x1 = 47 + t * 23;
    for (let x = x0 + 3; x < x1 - 2; x += 5) {
      const dry = r() < 0.18;
      const col = dry ? '#a8894a' : x > 36 ? '#4f6c28' : r() < 0.5 ? '#7d9a42' : '#68863a';
      ell(c, x, y + r() * 2, 4.5, 1.6, col, (x < 36 ? 1 : -1) * (0.5 + r() * 0.3));
    }
  }
  for (let x = 3; x < 70; x += 4) poly(c, [x, 51, x + 4, 51, x + 2, 55], r() < 0.3 ? '#8a7a40' : '#56742c');
  rrect(c, 23, 14, 26, 6, 3, '#6a5a2c');
  for (const x of [28, 36, 44]) line(c, x, 14, x, 20, '#4a3a1a', 1.2);
}

/** Thời làng nghề: khung gỗ, vách ván, mái ngói đỏ. */
function drawTimberHouse(c: Ctx) {
  ell(c, 36, 80, 35, 5, 'rgba(0,0,0,0.18)');
  // nền đá
  c.fillStyle = '#9d9a8e';
  c.fillRect(6, 75, 60, 6);
  c.fillStyle = '#b8b5a8';
  c.fillRect(6, 75, 60, 2);
  // vách ván gỗ
  c.fillStyle = '#9a6a40';
  c.fillRect(9, 42, 54, 33);
  for (let x = 12; x < 63; x += 4.5) line(c, x, 42, x, 75, 'rgba(70,40,20,0.35)', 1);
  // cột, xà
  c.fillStyle = '#5a3a22';
  for (const x of [8, 34, 61]) c.fillRect(x, 42, 3, 33);
  c.fillRect(8, 42, 56, 3);
  // cửa ván hai cánh
  rrect(c, 28, 54, 16, 21, 1, '#6e4628');
  line(c, 36, 54, 36, 75, '#3b2414', 1.4);
  circle(c, 34, 65, 0.9, '#e2b84a');
  circle(c, 38, 65, 0.9, '#e2b84a');
  // cửa sổ song gỗ
  for (const wx of [14, 46]) {
    c.fillStyle = '#3b2a1e';
    c.fillRect(wx, 55, 12, 11);
    for (let k = 1; k < 4; k++) line(c, wx + k * 3, 55, wx + k * 3, 66, '#c9a06a', 1.4);
    c.fillStyle = '#5a3a22';
    c.fillRect(wx - 1, 54, 14, 2);
    c.fillRect(wx - 1, 66, 14, 2);
  }
  // mái ngói đỏ
  poly(c, [0, 46, 72, 46, 60, 15, 12, 15], '#b5523a');
  poly(c, [36, 15, 60, 15, 72, 46, 36, 46], '#9c4430');
  for (let row = 0; row < 6; row++) {
    const y = 19 + row * 5;
    const t = (y - 15) / 31;
    const x0 = 12 - t * 12;
    const x1 = 60 + t * 12;
    line(c, x0, y + 3, x1, y + 3, 'rgba(90,30,20,0.55)', 1);
    for (let x = x0 + 2; x < x1 - 1; x += 4) ell(c, x, y + 3, 2, 1.2, x > 36 ? '#8c3b2a' : '#c4634a');
  }
  for (let x = 0; x < 72; x += 4) ell(c, x + 2, 46, 2.1, 1.4, '#8c3b2a');
  // bờ nóc, hai đầu cong lên
  rrect(c, 10, 11, 52, 5, 2, '#7a3020');
  poly(c, [10, 11, 4, 5, 8, 4, 14, 11], '#7a3020');
  poly(c, [62, 11, 68, 5, 64, 4, 58, 11], '#7a3020');
}

/** Thời chợ phiên: nhà gạch ba gian, mái ngói, đầu đao cong vút. */
function drawBrickHouse(c: Ctx) {
  ell(c, 36, 80, 36, 5, 'rgba(0,0,0,0.2)');
  // thềm đá, bậc tam cấp
  c.fillStyle = '#9d9a8e';
  c.fillRect(3, 74, 66, 7);
  c.fillStyle = '#b8b5a8';
  c.fillRect(3, 74, 66, 2);
  c.fillStyle = '#8a877c';
  c.fillRect(27, 79, 18, 3);
  // tường gạch
  c.fillStyle = '#b8553a';
  c.fillRect(7, 40, 58, 34);
  for (let y = 42, i = 0; y < 74; y += 4, i++) {
    line(c, 7, y, 65, y, 'rgba(240,220,200,0.35)', 0.8);
    for (let x = 7 + (i % 2) * 4; x < 65; x += 8) line(c, x, y, x, y + 4, 'rgba(240,220,200,0.3)', 0.8);
  }
  // cột ba gian
  c.fillStyle = '#6e3a22';
  for (const x of [6, 25, 44, 63]) c.fillRect(x, 40, 3, 34);
  c.fillRect(6, 40, 60, 3);
  // gian giữa: cửa bức bàn
  rrect(c, 28, 50, 16, 24, 1, '#7a4a2a');
  for (const x of [32, 36, 40]) line(c, x, 50, x, 74, '#4a2c18', 1);
  c.fillStyle = '#c0392b';
  c.fillRect(27, 47, 18, 3);
  // hai gian bên: cửa sổ con tiện
  for (const wx of [14, 46]) {
    c.fillStyle = '#3b2a1e';
    c.fillRect(wx, 55, 12, 11);
    for (let k = 1; k < 4; k++) line(c, wx + k * 3, 55, wx + k * 3, 66, '#e2b84a', 1.4);
    c.fillStyle = '#6e3a22';
    c.fillRect(wx - 1, 54, 14, 2);
    c.fillRect(wx - 1, 66, 14, 2);
  }
  // mái ngói lớn
  poly(c, [-2, 44, 74, 44, 62, 13, 10, 13], '#a84a34');
  poly(c, [36, 13, 62, 13, 74, 44, 36, 44], '#8c3b2a');
  for (let row = 0; row < 7; row++) {
    const y = 16 + row * 4.4;
    const t = (y - 13) / 31;
    const x0 = 10 - t * 12;
    const x1 = 62 + t * 12;
    line(c, x0, y + 2.6, x1, y + 2.6, 'rgba(80,25,15,0.55)', 1);
    for (let x = x0 + 2; x < x1 - 1; x += 4) ell(c, x, y + 2.6, 2, 1.1, x > 36 ? '#7a3020' : '#b85a40');
  }
  for (let x = -2; x < 74; x += 4) ell(c, x + 2, 44, 2.1, 1.4, '#7a3020');
  // đầu đao hai góc mái
  poly(c, [-2, 44, -6, 34, -2, 36, 6, 44], '#7a3020');
  poly(c, [74, 44, 78, 34, 74, 36, 66, 44], '#7a3020');
  // bờ nóc có trang trí
  rrect(c, 8, 8, 56, 6, 2, '#6a2a1a');
  poly(c, [8, 8, 0, 0, 5, 0, 13, 8], '#6a2a1a');
  poly(c, [64, 8, 72, 0, 67, 0, 59, 8], '#6a2a1a');
  circle(c, 36, 7, 3.5, '#e2b84a');
  circle(c, 36, 7, 1.6, '#c0392b');
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

/** Ruộng lúa 2×2 ô: bờ ruộng, nước, và lúa theo giai đoạn (0 trống · 1 mạ · 2 lúa xanh · 3 lúa chín). */
function drawField(c: Ctx, stage: number) {
  const r = mulberry32(31 + stage);
  // Bờ ruộng
  rrect(c, 0, 0, 64, 64, 4, '#8a7a48');
  rrect(c, 1, 1, 62, 62, 4, '#7ea150');
  // Mặt nước bùn
  rrect(c, 4, 4, 56, 56, 2, stage === 3 ? '#a59a62' : '#7d9a8a');
  for (let i = 0; i < 6; i++) line(c, 8 + r() * 44, 8 + r() * 48, 14 + r() * 44, 8 + r() * 48, 'rgba(210,235,235,0.35)', 1);
  line(c, 32, 4, 32, 60, 'rgba(110,100,60,0.35)', 2);
  if (stage === 0) return;
  if (stage === 4) {
    // Ruộng trâu vừa cày: đất lật lên thành luống.
    rrect(c, 4, 4, 56, 56, 2, '#7a6a48');
    for (let y = 8; y < 60; y += 5) {
      line(c, 5, y, 59, y + 0.8, '#5e5034', 2);
      line(c, 5, y + 2, 59, y + 2.6, 'rgba(160,140,100,0.6)', 1);
    }
    return;
  }
  const cols: Record<number, [string, string, number]> = {
    1: ['#6fbf45', '#8ad35a', 4],
    2: ['#4f9a35', '#6fbf45', 8],
    3: ['#d6b13a', '#f0d060', 9],
  };
  const [dark, light, h] = cols[stage];
  for (let y = 10; y <= 56; y += 7) {
    for (let x = 9; x <= 56; x += 7) {
      const jx = x + (r() - 0.5) * 2;
      for (let k = -1; k <= 1; k++) line(c, jx, y, jx + k * 2.2, y - h + Math.abs(k) * 1.5, k ? dark : light, 1.3);
      if (stage === 3) ell(c, jx + 2, y - h + 1, 1.6, 2.6, '#e8c548', 0.5);
    }
  }
}

function drawKiln(c: Ctx) {
  ell(c, 20, 45, 18, 4, 'rgba(0,0,0,0.2)');
  // ống khói
  rrect(c, 24, 4, 8, 18, 2, '#8a4a32');
  rrect(c, 23, 3, 10, 4, 1, '#6e3a26');
  // thân lò hình vòm
  c.fillStyle = '#b0603e';
  c.beginPath();
  c.moveTo(4, 44);
  c.quadraticCurveTo(4, 12, 20, 12);
  c.quadraticCurveTo(36, 12, 36, 44);
  c.closePath();
  c.fill();
  for (let y = 18; y < 44; y += 5) line(c, 6, y, 34, y, 'rgba(90,40,20,0.35)', 1);
  // miệng lò đỏ lửa
  c.fillStyle = '#3a1a10';
  c.beginPath();
  c.arc(20, 44, 7, Math.PI, 0);
  c.fill();
  c.fillStyle = '#ff8a3a';
  c.beginPath();
  c.arc(20, 44, 4.5, Math.PI, 0);
  c.fill();
  // vài chiếc chum bên cạnh
  ell(c, 36, 42, 4, 4.5, '#9a5a36');
  ell(c, 36, 38.5, 2.5, 1, '#6e3a26');
  ell(c, 5, 43, 3, 3.5, '#a86a42');
}

function drawMarket(c: Ctx) {
  ell(c, 36, 62, 34, 4, 'rgba(0,0,0,0.18)');
  const stall = (x: number, cloth: string, cloth2: string, goods: () => void) => {
    // cột tre
    line(c, x + 3, 22, x + 3, 60, '#8a6a3c', 2.5);
    line(c, x + 29, 22, x + 29, 60, '#8a6a3c', 2.5);
    // mái vải sọc
    for (let i = 0; i < 4; i++) poly(c, [x + i * 8, 24, x + i * 8 + 8, 24, x + i * 8 + 8, 14, x + i * 8, 14], i % 2 ? cloth2 : cloth);
    for (let i = 0; i < 4; i++) ell(c, x + i * 8 + 4, 24, 4, 2.5, i % 2 ? cloth2 : cloth);
    // mẹt hàng
    rrect(c, x + 1, 44, 30, 6, 2, '#a07a4c');
    ell(c, x + 16, 44, 14, 3, '#c9a06a');
    goods();
  };
  stall(4, '#c0392b', '#f2e3c6', () => {
    ell(c, 12, 40, 4, 4.5, '#9a5a36');
    ell(c, 21, 41, 3.5, 3.5, '#b5713e');
    ell(c, 28, 40, 3, 4, '#8a4a32');
  });
  stall(38, '#2f6f9f', '#f2e3c6', () => {
    for (let i = 0; i < 4; i++) ell(c, 46 + i * 4, 41, 1.8, 3, '#e3cd45', 0.4);
    ell(c, 62, 41, 4, 3, '#6fbf45');
  });
  // đèn lồng
  line(c, 36, 8, 36, 14, '#5a3b22', 1);
  ell(c, 36, 18, 4.5, 5.5, '#d63a2a');
  rrect(c, 33, 12, 6, 2, 1, '#e8b13a');
  rrect(c, 33, 22.5, 6, 2, 1, '#e8b13a');
}

/** Đình làng: nền đá, cột đỏ, mái ngói cong vút đầu đao. */
function drawCommunalHouse(c: Ctx) {
  ell(c, 40, 82, 39, 4, 'rgba(0,0,0,0.2)');
  // nền và bậc đá
  rrect(c, 4, 70, 72, 12, 2, '#a9a596');
  rrect(c, 4, 70, 72, 3, 1, '#c4c0b2');
  rrect(c, 30, 76, 20, 6, 1, '#bdb9aa');
  // tường gỗ, cửa bức bàn
  c.fillStyle = '#8a5a34';
  c.fillRect(10, 44, 60, 26);
  for (let x = 14; x < 68; x += 7) {
    rrect(c, x, 48, 5, 20, 1, '#6e4426');
    line(c, x + 2.5, 50, x + 2.5, 66, '#9a6a40', 0.8);
  }
  // cột đỏ
  for (const x of [8, 26, 52, 70]) rrect(c, x - 2, 42, 4, 28, 1, '#b02a20');
  // mái ngói hai tầng, đầu đao cong
  const roof = (y: number, half: number, h: number, col: string, dark: string) => {
    c.fillStyle = col;
    c.beginPath();
    c.moveTo(40 - half - 6, y - 6);
    c.quadraticCurveTo(40 - half, y + 2, 40 - half + 6, y);
    c.lineTo(40 + half - 6, y);
    c.quadraticCurveTo(40 + half, y + 2, 40 + half + 6, y - 6);
    c.lineTo(40 + half - 10, y - h);
    c.lineTo(40 - half + 10, y - h);
    c.closePath();
    c.fill();
    for (let i = 0; i <= 10; i++) {
      const t = i / 10;
      line(c, 40 - half + 10 + t * (half * 2 - 20), y - h, 40 - half + 4 + t * (half * 2 - 8), y - 1, dark, 1);
    }
  };
  roof(46, 38, 16, '#7a3b2a', 'rgba(50,20,10,0.4)');
  rrect(c, 22, 22, 36, 9, 1, '#8a5a34');
  roof(26, 26, 14, '#7a3b2a', 'rgba(50,20,10,0.4)');
  // bờ nóc với "lưỡng long chầu nguyệt"
  rrect(c, 16, 9, 48, 4, 2, '#5a2a1c');
  circle(c, 40, 6, 3.5, '#e8b13a');
  poly(c, [18, 10, 14, 3, 22, 8], '#5a2a1c');
  poly(c, [62, 10, 66, 3, 58, 8], '#5a2a1c');
  // hoành phi
  rrect(c, 32, 38, 16, 6, 1, '#d6a83a');
}

function drawLantern(c: Ctx) {
  line(c, 8, 0, 8, 4, '#5a3b22', 1);
  rrect(c, 4, 3, 8, 2, 1, '#e8b13a');
  ell(c, 8, 10, 6, 6.5, '#d63a2a');
  for (const x of [5, 8, 11]) line(c, x, 4.5, x, 15.5, 'rgba(120,20,10,0.5)', 0.8);
  rrect(c, 4, 15.5, 8, 2, 1, '#e8b13a');
  line(c, 8, 17, 8, 21, '#e8b13a', 1);
}

/** Đèn ông sao năm cánh trên cán tre. */
function drawStarLantern(c: Ctx) {
  line(c, 9, 14, 9, 30, '#8a6a3a', 1.6);
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / 5;
    const r = i % 2 ? 3.6 : 8.5;
    pts.push(9 + Math.cos(a) * r, 9 + Math.sin(a) * r);
  }
  poly(c, pts, '#e8b13a');
  poly(c, pts.map((v) => 9 + (v - 9) * 0.78), '#d63a2a');
  circle(c, 9, 9, 1.8, '#ffe27a');
  for (const x of [5, 13]) line(c, x, 14, x, 19, '#e8b13a', 0.9);
}

/** Mâm cỗ trông trăng: bánh nướng, bánh dẻo, bưởi, nải chuối. */
function drawFeast(c: Ctx) {
  ell(c, 22, 22, 20, 4, 'rgba(0,0,0,0.22)');
  ell(c, 22, 17, 19, 6.5, '#b8862e');
  ell(c, 22, 16, 17.5, 5.5, '#e2b84a');
  // nải chuối
  for (let i = 0; i < 4; i++) ell(c, 10 + i * 2.2, 13 - i * 0.4, 1.6, 4.5, '#f2d24a', -0.5);
  // bưởi
  circle(c, 22, 10, 5.5, '#7fae4a');
  circle(c, 20.5, 8.5, 1.8, '#a3c96a');
  line(c, 22, 4.5, 23, 2.5, '#5a3b22', 1);
  // bánh nướng, bánh dẻo
  circle(c, 31, 14, 3.6, '#b9772e');
  circle(c, 31, 14, 2.2, '#d49a4a');
  circle(c, 15, 17.5, 3.2, '#f3eedf');
  circle(c, 15, 17.5, 1.8, '#e3dcc6');
  circle(c, 27, 18.5, 3.2, '#b9772e');
  circle(c, 27, 18.5, 1.9, '#d49a4a');
}

/** Con lân: đầu đỏ bờm vàng, thân vải sọc kéo phía sau. */
function drawLion(c: Ctx) {
  ell(c, 24, 31, 18, 3, 'rgba(0,0,0,0.22)');
  // thân vải và chân người múa
  for (let i = 0; i < 4; i++) rrect(c, 20 + i * 5, 12 + i * 0.8, 6, 13, 3, i % 2 ? '#e8b13a' : '#d63a2a');
  rrect(c, 38, 14, 6, 9, 3, '#d63a2a');
  for (const x of [22, 26, 34, 38]) rrect(c, x, 24, 3, 7, 1, '#3a2a1a');
  // đầu lân
  circle(c, 13, 13, 10, '#e8b13a');
  circle(c, 13, 13.5, 8, '#d63a2a');
  rrect(c, 5, 16, 16, 5, 2, '#f3eedf');
  for (let x = 7; x < 20; x += 3) line(c, x, 16, x, 21, '#c9b89a', 0.8);
  circle(c, 9.5, 10.5, 2.6, '#fff');
  circle(c, 16.5, 10.5, 2.6, '#fff');
  circle(c, 9.5, 11, 1.3, '#1d1a17');
  circle(c, 16.5, 11, 1.3, '#1d1a17');
  circle(c, 13, 4.5, 2.2, '#3f8a3f');
  line(c, 6, 7, 3, 3, '#ffe27a', 1.4);
  line(c, 20, 7, 23, 3, '#ffe27a', 1.4);
}

/** Cây nêu ngày Tết: cây tre cao, ngọn còn lá, treo khánh và dải vải đỏ. */
function drawCayNeu(c: Ctx) {
  ell(c, 16, 94, 9, 2.5, 'rgba(0,0,0,0.22)');
  line(c, 16, 94, 16, 12, '#8aa04a', 2.4);
  for (let y = 84; y > 16; y -= 12) line(c, 14.5, y, 17.5, y, '#6f8a36', 1.2);
  // chùm lá tre trên ngọn
  for (const [dx, dy, r] of [
    [-7, 8, -0.7],
    [7, 8, 0.7],
    [-4, 4, -0.3],
    [4, 4, 0.3],
    [0, 2, 0],
  ] as const)
    ell(c, 16 + dx, 10 + dy, 2, 7, '#5f9a3a', r);
  // dải vải đỏ và khánh vàng treo lủng lẳng
  line(c, 16, 20, 25, 30, '#d63a2a', 2);
  line(c, 25, 30, 26, 44, '#d63a2a', 2);
  line(c, 16, 22, 8, 32, '#e8b13a', 1);
  poly(c, [5, 32, 11, 32, 8, 38], '#e8b13a');
  circle(c, 26, 46, 2.2, '#e8b13a');
}

/** Nồi bánh chưng sôi trên ba ông đầu rau, lửa củi bên dưới. */
function drawBanhPot(c: Ctx) {
  ell(c, 22, 34, 18, 3.5, 'rgba(0,0,0,0.25)');
  for (const x of [8, 22, 36]) rrect(c, x - 4, 25, 8, 8, 2, '#8a877b');
  ell(c, 22, 30, 9, 3, '#ff8a3d');
  ell(c, 22, 30, 5, 2, '#ffe27a');
  rrect(c, 6, 8, 32, 20, 5, '#2f2b27');
  ell(c, 22, 9, 16, 4, '#46413b');
  ell(c, 22, 9, 13, 2.8, '#6a8a4a');
  // đòn bánh chưng gói lá dong
  for (const x of [16, 22, 28]) {
    rrect(c, x - 3, 5, 6, 5, 1, '#3f7a3a');
    line(c, x, 5, x, 10, '#c9b07a', 0.8);
  }
}

/** Cây hoa đào nở hồng đón xuân. */
function drawPeach(c: Ctx) {
  ell(c, 18, 44, 10, 2.5, 'rgba(0,0,0,0.2)');
  rrect(c, 10, 36, 16, 8, 2, '#b0533a');
  line(c, 18, 37, 18, 20, '#5a3b22', 2.4);
  line(c, 18, 26, 9, 15, '#5a3b22', 1.6);
  line(c, 18, 24, 28, 12, '#5a3b22', 1.6);
  line(c, 18, 20, 17, 7, '#5a3b22', 1.4);
  const r = mulberry32(7);
  for (let i = 0; i < 34; i++) {
    const x = 6 + r() * 26;
    const y = 4 + r() * 20;
    circle(c, x, y, 1.5 + r() * 1.1, r() < 0.6 ? '#f29bb2' : '#ffc4d4');
  }
  for (let i = 0; i < 8; i++) circle(c, 8 + r() * 22, 6 + r() * 16, 0.7, '#d6456a');
}

/** Cán đuốc: thân tre, đầu quấn giẻ tẩm dầu — ngọn lửa vẽ riêng phía trên để bập bùng. */
function drawTorch(c: Ctx) {
  line(c, 5, 30, 6, 7, '#8a6a3a', 2.4);
  line(c, 4.2, 29, 5.2, 8, '#a8844e', 0.8);
  rrect(c, 3, 2, 6, 7, 2, '#5a3b22');
  for (const y of [3.5, 5.5, 7.5]) line(c, 3, y, 9, y + 0.6, '#3a2616', 0.8);
}

/** Diều giấy hình thoi, có đuôi tua. */
function drawKite(c: Ctx) {
  poly(c, [12, 1, 22, 11, 12, 19, 2, 11], '#d63a2a');
  poly(c, [12, 1, 22, 11, 12, 11], '#e8b13a');
  poly(c, [2, 11, 12, 19, 12, 11], '#e8b13a');
  line(c, 12, 1, 12, 19, '#7a4a2a', 0.9);
  line(c, 2, 11, 22, 11, '#7a4a2a', 0.9);
  c.strokeStyle = '#d63a2a';
  c.lineWidth = 1;
  c.beginPath();
  c.moveTo(12, 19);
  c.quadraticCurveTo(16, 24, 11, 29);
  c.stroke();
  for (const [x, y] of [
    [14, 22],
    [13, 26],
  ])
    poly(c, [x - 2, y, x + 2, y - 1, x + 1, y + 2], '#3f7ab6');
}

/** Bàn ô ăn quan kẻ trên nền đất: mười ô dân, hai ô quan, sỏi làm quân. */
function drawOAnQuan(c: Ctx) {
  ell(c, 24, 10, 23, 8, 'rgba(120,85,45,0.28)');
  c.strokeStyle = '#6e4e2e';
  c.lineWidth = 1;
  c.strokeRect(10, 4, 28, 12);
  line(c, 10, 10, 38, 10, '#6e4e2e', 1);
  for (let x = 15.6; x < 38; x += 5.6) line(c, x, 4, x, 16, '#6e4e2e', 1);
  for (const [cx, start] of [
    [10, Math.PI / 2],
    [38, -Math.PI / 2],
  ] as const) {
    c.beginPath();
    c.arc(cx, 10, 6, start, start + Math.PI);
    c.stroke();
  }
  const r = mulberry32(3);
  for (let i = 0; i < 24; i++) circle(c, 11 + r() * 26, 5 + r() * 10, 0.9, r() < 0.5 ? '#f0ead8' : '#9d9886');
  circle(c, 6.5, 10, 1.8, '#e8e0c8');
  circle(c, 41.5, 10, 1.8, '#e8e0c8');
}

/** Võng gai mắc giữa hai cọc tre trước nhà. */
function drawHammock(c: Ctx) {
  ell(c, 30, 38, 24, 3, 'rgba(0,0,0,0.2)');
  for (const x of [5, 55]) {
    line(c, x, 38, x, 8, '#8a6a3a', 3);
    line(c, x - 1, 12, x + 1, 12, '#6e5430', 1);
  }
  // lòng võng võng xuống ở giữa
  c.fillStyle = '#c96a3a';
  c.beginPath();
  c.moveTo(6, 10);
  c.quadraticCurveTo(30, 40, 54, 10);
  c.quadraticCurveTo(30, 30, 6, 10);
  c.fill();
  c.strokeStyle = 'rgba(90,40,20,0.55)';
  c.lineWidth = 0.8;
  for (let i = 1; i < 8; i++) {
    const t = i / 8;
    const x = 6 + t * 48;
    const y = 10 + Math.sin(t * Math.PI) * 14;
    c.beginPath();
    c.moveTo(x, y - 2);
    c.lineTo(x, y + 4);
    c.stroke();
  }
}

function drawShrine(c: Ctx) {
  ell(c, 20, 54, 19, 3.5, 'rgba(0,0,0,0.2)');
  // nền đá, bậc thềm
  rrect(c, 3, 44, 34, 10, 2, '#9d9a8e');
  c.fillStyle = '#b8b5a8';
  c.fillRect(3, 44, 34, 2.5);
  rrect(c, 14, 51, 12, 4, 1, '#8a877b');
  // tường và cột đỏ
  c.fillStyle = '#e0cfa2';
  c.fillRect(9, 27, 22, 17);
  c.fillStyle = '#a63a2a';
  c.fillRect(8, 26, 3.5, 18);
  c.fillRect(28.5, 26, 3.5, 18);
  // khám thờ
  rrect(c, 14, 30, 12, 14, 2, '#4a2a1e');
  c.fillStyle = '#e2b84a';
  c.fillRect(15, 38, 10, 2.5);
  ell(c, 20, 37, 2.6, 1.6, '#c99a3a');
  for (const x of [18.5, 20, 21.5]) {
    line(c, x, 37, x, 32.5, '#c0392b', 0.8);
    circle(c, x, 32.3, 0.7, '#ffb347');
  }
  // hoành phi
  rrect(c, 15, 23.5, 10, 3.5, 0.8, '#e2b84a');
  line(c, 17, 25.2, 23, 25.2, '#8c3b2a', 0.7);
  // mái ngói cong
  poly(c, [1, 28, 39, 28, 32, 15, 8, 15], '#8c3b2a');
  poly(c, [20, 15, 32, 15, 39, 28, 20, 28], '#7a3123');
  for (let i = 1; i < 9; i++) {
    const t = i / 9;
    line(c, 8 + t * 24, 15.5, 1 + t * 38, 27.5, 'rgba(60,20,10,0.45)', 0.9);
  }
  c.strokeStyle = '#8c3b2a';
  c.lineWidth = 3;
  c.lineCap = 'round';
  c.beginPath();
  c.moveTo(3, 28);
  c.quadraticCurveTo(-0.5, 27, 0.5, 21.5);
  c.moveTo(37, 28);
  c.quadraticCurveTo(40.5, 27, 39.5, 21.5);
  c.stroke();
  c.lineCap = 'butt';
  rrect(c, 7, 12, 26, 4, 2, '#6e2c1f');
  circle(c, 20, 10, 2.6, '#e2b84a');
  circle(c, 20, 10, 1.2, '#f6d77a');
  c.strokeStyle = '#6e2c1f';
  c.lineWidth = 2;
  c.beginPath();
  c.moveTo(8, 13);
  c.quadraticCurveTo(5, 12, 5.5, 8.5);
  c.moveTo(32, 13);
  c.quadraticCurveTo(35, 12, 34.5, 8.5);
  c.stroke();
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

/** Mộ phần: nấm đất phủ cỏ, bia đá và bát hương. */
function drawGrave(c: Ctx) {
  ell(c, 16, 26, 14, 3.5, 'rgba(0,0,0,0.2)');
  ell(c, 16, 21, 13, 6.5, '#8a6a44');
  ell(c, 16, 19.5, 12, 5.5, '#6f9a4a');
  for (let i = 0; i < 7; i++) line(c, 7 + i * 3, 19 + (i % 2), 7.5 + i * 3, 16.5, '#86b55d', 1);
  rrect(c, 12, 4, 8, 14, 3, '#9d9a8e');
  rrect(c, 13, 5, 6, 12, 2.5, '#b8b5a8');
  line(c, 14.5, 8.5, 17.5, 8.5, '#7a776c', 0.8);
  line(c, 14.5, 11, 17.5, 11, '#7a776c', 0.8);
  ell(c, 16, 22, 3, 1.4, '#c99a3a');
  line(c, 15.5, 22, 15.5, 18.5, '#c0392b', 0.7);
  line(c, 16.5, 22, 16.5, 18.5, '#c0392b', 0.7);
}

/** Tạo (một lần) texture nhân vật theo ngoại hình. */
export function personTexture(scene: Phaser.Scene, key: string, look: Look) {
  if (!scene.textures.exists(key)) make(scene, key, 28, 45, (c) => drawPerson(c, look));
  return key;
}

// ---------------------------------------------------------------- tạo toàn bộ texture

export function createTextures(scene: Phaser.Scene) {
  make(scene, 'mo', 32, 28, drawGrave);

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
  make(scene, 'clay', 36, 24, (c) => drawClay(c, false));
  make(scene, 'clay_empty', 36, 24, (c) => drawClay(c, true));

  make(scene, 'ga', 25, 23, drawChicken);
  make(scene, 'heo', 37, 27, drawBoar);

  make(scene, 'nha0', 72, 84, drawHut);
  make(scene, 'nha1', 72, 84, drawHouse);
  make(scene, 'nha2', 72, 84, drawTimberHouse);
  make(scene, 'nha3', 72, 84, drawBrickHouse);
  make(scene, 'kho', 72, 78, drawStorehouse);
  make(scene, 'lua', 36, 30, drawCampfire);
  make(scene, 'mieu', 40, 57, drawShrine);
  for (let s = 0; s < 4; s++) make(scene, `ruong${s}`, 64, 64, (c) => drawField(c, s));
  make(scene, 'ruongCay', 64, 64, (c) => drawField(c, 4));
  make(scene, 'chuong', 72, 64, drawPen);
  make(scene, 'trau', 50, 34, drawBuffalo);
  make(scene, 'plow', 24, 18, drawPlow);
  make(scene, 'lo', 40, 48, drawKiln);
  make(scene, 'cho', 72, 64, drawMarket);
  make(scene, 'dinh', 80, 84, drawCommunalHouse);
  make(scene, 'lantern', 16, 22, drawLantern);
  make(scene, 'starLantern', 18, 30, drawStarLantern);
  make(scene, 'feast', 44, 26, drawFeast);
  make(scene, 'lion', 46, 34, drawLion);
  make(scene, 'cayNeu', 32, 98, drawCayNeu);
  make(scene, 'banhPot', 44, 38, drawBanhPot);
  make(scene, 'peach', 36, 46, drawPeach);
  make(scene, 'hammock', 60, 40, drawHammock);
  make(scene, 'torch', 12, 32, drawTorch);
  make(scene, 'kite', 24, 30, drawKite);
  make(scene, 'oaq', 48, 20, drawOAnQuan);
  make(scene, 'dog', 32, 23, (c) => drawDog(c, false));
  make(scene, 'dogLie', 32, 16, (c) => drawDog(c, true));
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
