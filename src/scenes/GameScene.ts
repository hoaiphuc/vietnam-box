import Phaser from 'phaser';
import { Ambience } from '../audio/Ambience';
import { AudioEngine, loadAudioSettings, saveAudioSettings } from '../audio/AudioEngine';
import { Music } from '../audio/Music';
import type { SfxId } from '../audio/sfx';
import { DAY_LENGTH, FONT, MAP_H, MAP_W, MAX_DARK, TILE } from '../config';
import { BUILDINGS, FOOD_ORDER, JOBS, RESOURCES, SKILL_JOBS, type BuildingId, type JobId, type ResKey } from '../data';
import { Animal, type AnimalKind } from '../entities/Animal';
import { Building, type BuildState } from '../entities/Building';
import { ResourceNode } from '../entities/ResourceNode';
import { Villager, type VillagerDef } from '../entities/Villager';
import { DREAM_COST, POWERS, WISHES, type PowerId, type WishType } from '../powers';
import { GameState } from '../state';
import { rollTraits, type TraitId } from '../traits';
import { MARRY_AGE, palette, randomName, randomPalette, type Gender, type Palette, type Stage } from '../life';
import { Hud } from '../ui/Hud';
import { generateMap, type NodeKind } from '../world/mapgen';
import { findPath, type Pt } from '../world/pathfinding';
import { createTextures, drawGround, personTexture } from '../world/textures';
import { DISCOVERIES, ERAS, type DiscId } from '../discoveries';
import { World } from '../world/World';

export interface FishingSpot {
  x: number;
  y: number;
  wx: number;
  wy: number;
  reservedBy: Villager | null;
}

/** Gia đình lập làng. Mỗi người có một nét tính cách cố định, thêm một nét ngẫu nhiên mỗi ván. */
const FOUNDERS: { given: string; gender: Gender; age: number; palette: Palette; skills: VillagerDef['skills']; traits: TraitId[] }[] = [
  { given: 'Tám', gender: 'nam', age: 34, palette: palette('#7a5236', '#33302c', true), skills: { chat: 2, san: 1, xay: 1 }, traits: ['khoeManh'] },
  { given: 'Lan', gender: 'nu', age: 31, palette: palette('#9c72b5', '#24211f', true), skills: { nau: 2, hai: 1, ca: 1 }, traits: ['kheoTay'] },
  { given: 'Na', gender: 'nu', age: 8, palette: palette('#f3f1ea', '#3b6fb6', true), skills: { hai: 1 }, traits: ['toMo'] },
];

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

const darknessAt = (h: number) => {
  if (h >= 20 || h < 4.5) return MAX_DARK;
  if (h >= 17.5) return ((h - 17.5) / 2.5) * MAX_DARK;
  if (h < 7) return ((7 - h) / 2.5) * MAX_DARK;
  return 0;
};
const warmthAt = (h: number) => Math.max(0, 1 - Math.abs(h - 18.3) / 1.8) * 0.22 + Math.max(0, 1 - Math.abs(h - 6) / 1.2) * 0.1;

export class GameScene extends Phaser.Scene {
  state = new GameState();
  world!: World;
  villagers: Villager[] = [];
  animals: Animal[] = [];
  nodes: ResourceNode[] = [];
  buildings: Building[] = [];
  fishingSpots: FishingSpot[] = [];
  selected: Villager | null = null;
  buildMode: BuildingId | null = null;
  homeTile: Pt = { x: 0, y: 0 };
  hud!: Hud;
  audioSettings = loadAudioSettings();
  audio: AudioEngine | null = null;

  /** Quyền năng đang chờ chọn chỗ / chọn người. */
  powerMode: PowerId | null = null;

  private music?: Music;
  private ambience?: Ambience;
  private night = 0;
  private rainLevel = 0;
  private wasRaining = false;
  private rainGfx!: Phaser.GameObjects.Graphics;
  private rainShade!: Phaser.GameObjects.Rectangle;
  private drops: { u: number; v: number; len: number; speed: number }[] = [];
  private ripples: Phaser.GameObjects.Image[] = [];
  private soundTimer = 0;
  private prox = { water: 0, fire: 0 };

  private nodeGrid = new Map<number, ResourceNode>();
  private occupied = new Set<number>();
  private forestTiles: Pt[] = [];
  private waterTiles: Pt[] = [];
  private darkness!: Phaser.GameObjects.Rectangle;
  private warmth!: Phaser.GameObjects.Rectangle;
  private fireflies: { img: Phaser.GameObjects.Image; phase: number; speed: number }[] = [];
  private ghost?: Phaser.GameObjects.Image;
  private ghostGfx!: Phaser.GameObjects.Graphics;
  private ghostTile: Pt = { x: 0, y: 0 };
  private keys!: Record<string, Phaser.Input.Keyboard.Key>;
  private downOnCanvas = false;
  private dragging = false;
  private downPos = { x: 0, y: 0 };
  private hudTimer = 0;
  private respawnTimer = 0;
  private planTimer = 0;
  private realTime = 0;
  private walkFn = (x: number, y: number) => this.world.walkable(x, y);

  constructor() {
    super('game');
  }

  create() {
    createTextures(this);
    const data = generateMap(Math.floor(Math.random() * 1e9));
    this.world = new World(data);
    drawGround(this, this.world);
    this.add.image(0, 0, 'ground').setOrigin(0, 0).setDepth(-1000);

    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (this.world.isForest(x, y)) this.forestTiles.push({ x, y });
        if (this.world.isWater(x, y)) this.waterTiles.push({ x, y });
      }
    }
    for (const n of data.nodes) this.addNode(n.kind, n.x, n.y);
    this.computeFishingSpots();
    this.createRipples();

    const v = data.village;
    this.homeTile = { x: v.x, y: v.y + 1 };
    const house = this.placeBuilding('nha', v.x - 1, v.y - 2, 'built');
    const [bo, me, na] = FOUNDERS.map((f, i) =>
      this.addVillager(
        {
          id: this.newId(),
          given: f.given,
          gender: f.gender,
          birthTime: -f.age * DAY_LENGTH,
          palette: f.palette,
          skills: f.skills,
          traits: rollTraits(f.traits, 1),
        },
        v.x - 1 + i,
        v.y + 1,
      ),
    );
    bo.spouse = me;
    me.spouse = bo;
    na.parents = [bo, me];
    bo.children.push(na);
    me.children.push(na);
    for (const p of [bo, me, na]) p.home = house;
    this.addBond(bo, me, 85);
    this.addBond(bo, na, 75);
    this.addBond(me, na, 75);
    for (let i = 0; i < 7; i++) this.spawnAnimal(i < 4 ? 'ga' : 'heo');

    this.darkness = this.add.rectangle(0, 0, MAP_W * TILE, MAP_H * TILE, 0x0c1a48).setOrigin(0).setAlpha(0).setDepth(50000);
    this.warmth = this.add.rectangle(0, 0, MAP_W * TILE, MAP_H * TILE, 0xff8a3d).setOrigin(0).setAlpha(0).setDepth(50000);
    this.createFireflies();
    this.ghostGfx = this.add.graphics().setDepth(49000);
    this.rainShade = this.add.rectangle(0, 0, MAP_W * TILE, MAP_H * TILE, 0x2a3a52).setOrigin(0).setAlpha(0).setDepth(50004);
    this.rainGfx = this.add.graphics().setDepth(50005);
    for (let i = 0; i < 220; i++) {
      this.drops.push({ u: Math.random(), v: Math.random(), len: 10 + Math.random() * 10, speed: 0.9 + Math.random() * 0.6 });
    }

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    cam.setZoom(1.4);
    cam.centerOn(v.x * TILE, v.y * TILE);
    this.setupInput();

    this.hud = new Hud(this);
    this.state.log('🌾 Gia đình Bố Tám, Mẹ Lan và Bé Na về lập nghiệp bên bờ sông', { x: v.x * TILE, y: v.y * TILE });
    this.events.once(Phaser.Scenes.Events.DESTROY, () => {
      this.music?.stop();
      this.audio?.dispose();
    });
  }

  // ------------------------------------------------------------ âm thanh

  /** Trình duyệt chỉ cho phát âm thanh sau khi người chơi bấm — gọi từ nút "Bắt đầu". */
  startAudio() {
    if (this.audio) return;
    this.audio = new AudioEngine(this.audioSettings);
    this.music = new Music(this.audio);
    this.ambience = new Ambience(this.audio);
    this.music.start();
  }

  applyAudio() {
    saveAudioSettings(this.audioSettings);
    this.audio?.apply();
    this.hud.refreshSound();
  }

  toggleMute() {
    this.audioSettings.muted = !this.audioSettings.muted;
    this.applyAudio();
  }

  /** Phát hiệu ứng; có toạ độ thì nhỏ dần theo khoảng cách tới tâm màn hình và lệch trái/phải. */
  sfx(id: SfxId, x?: number, y?: number, vol = 1) {
    if (!this.audio) return;
    if (x === undefined || y === undefined) {
      this.audio.play(id, vol);
      return;
    }
    const cam = this.cameras.main;
    const v = cam.worldView;
    const radius = Math.max(v.width, v.height) * 0.6;
    const d = Math.hypot(x - v.centerX, y - v.centerY);
    const g = Phaser.Math.Clamp(1 - (d - radius * 0.5) / radius, 0, 1) * Phaser.Math.Clamp(cam.zoom / 1.2, 0.5, 1);
    if (g <= 0.02) return;
    const pan = Phaser.Math.Clamp((x - v.centerX) / (v.width / 2), -1, 1) * 0.6;
    this.audio.play(id, vol * g, pan);
  }

  /** Độ gần sông và đống lửa so với tâm màn hình (0..1). */
  private updateProximity() {
    const v = this.cameras.main.worldView;
    const radius = Math.max(v.width, v.height) * 0.6;
    const cx = v.centerX;
    const cy = v.centerY;
    let dw = Infinity;
    for (const t of this.waterTiles) {
      const d = (t.x * TILE + TILE / 2 - cx) ** 2 + (t.y * TILE + TILE / 2 - cy) ** 2;
      if (d < dw) dw = d;
    }
    let df = Infinity;
    for (const b of this.buildings) {
      if (b.id !== 'lua' || !b.built) continue;
      const d = (b.px - cx) ** 2 + (b.py - cy) ** 2;
      if (d < df) df = d;
    }
    const prox = (d2: number) => Phaser.Math.Clamp(1 - (Math.sqrt(d2) - radius * 0.3) / radius, 0, 1);
    this.prox.water = prox(dw);
    this.prox.fire = prox(df);
  }

  // ------------------------------------------------------------ dựng thế giới

  private addNode(kind: NodeKind, x: number, y: number) {
    const n = new ResourceNode(this, kind, x, y);
    this.nodes.push(n);
    this.nodeGrid.set(y * MAP_W + x, n);
  }

  private removeNode(n: ResourceNode) {
    n.destroy();
    this.nodes.splice(this.nodes.indexOf(n), 1);
    this.nodeGrid.delete(n.ty * MAP_W + n.tx);
  }

  private computeFishingSpots() {
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    for (let y = 0; y < MAP_H; y++) {
      for (let x = 0; x < MAP_W; x++) {
        if (!this.world.isLand(x, y)) continue;
        for (const [dx, dy] of dirs) {
          if (this.world.isWater(x + dx, y + dy)) {
            this.fishingSpots.push({ x, y, wx: x + dx, wy: y + dy, reservedBy: null });
            break;
          }
        }
      }
    }
  }

  private createRipples() {
    const count = Math.min(70, Math.floor(this.waterTiles.length / 4));
    for (let i = 0; i < count; i++) {
      const img = this.add.image(0, 0, 'ripple').setAlpha(0).setDepth(-500);
      this.ripples.push(img);
      const run = () => {
        const t = Phaser.Utils.Array.GetRandom(this.waterTiles);
        img.setPosition(t.x * TILE + Phaser.Math.Between(4, 28), t.y * TILE + Phaser.Math.Between(4, 28));
        img.setScale(0.7 + Math.random() * 0.6);
        this.tweens.add({
          targets: img,
          alpha: { from: 0, to: 0.55 },
          y: img.y + 10,
          duration: 1300 + Math.random() * 900,
          yoyo: true,
          delay: Math.random() * 1500,
          onComplete: run,
        });
      };
      run();
    }
  }

  private createFireflies() {
    const near = this.fishingSpots.length ? this.fishingSpots : this.forestTiles;
    for (let i = 0; i < 45; i++) {
      const t = i % 2 ? Phaser.Utils.Array.GetRandom(near) : Phaser.Utils.Array.GetRandom(this.forestTiles);
      if (!t) continue;
      const img = this.add
        .image(t.x * TILE + Math.random() * TILE, t.y * TILE + Math.random() * TILE, 'firefly')
        .setBlendMode(Phaser.BlendModes.ADD)
        .setTint(0xfff27a)
        .setScale(0.5 + Math.random() * 0.4)
        .setAlpha(0)
        .setDepth(50003);
      this.tweens.add({
        targets: img,
        x: img.x + Phaser.Math.Between(-36, 36),
        y: img.y + Phaser.Math.Between(-24, 24),
        duration: Phaser.Math.Between(2500, 5000),
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
      this.fireflies.push({ img, phase: Math.random() * 10, speed: 1 + Math.random() * 2 });
    }
  }

  spawnAnimal(kind: AnimalKind) {
    for (let tries = 0; tries < 40; tries++) {
      const t = Phaser.Utils.Array.GetRandom(this.forestTiles);
      if (!t || !this.world.isLand(t.x, t.y)) continue;
      if (Math.hypot(t.x - this.homeTile.x, t.y - this.homeTile.y) < 10) continue;
      if (this.villagers.some((v) => Math.hypot(v.tileX - t.x, v.tileY - t.y) < 6)) continue;
      this.animals.push(new Animal(this, kind, t.x, t.y));
      return;
    }
  }

  // ------------------------------------------------------------ truy vấn cho người dân

  findPath(sx: number, sy: number, tx: number, ty: number) {
    return findPath(MAP_W, MAP_H, this.walkFn, sx, sy, tx, ty);
  }

  private nearest<T>(list: T[], x: number, y: number, pos: (t: T) => Pt): T | null {
    let best: T | null = null;
    let bd = Infinity;
    for (const it of list) {
      const p = pos(it);
      const d = (p.x - x) ** 2 + (p.y - y) ** 2;
      if (d < bd) {
        bd = d;
        best = it;
      }
    }
    return best;
  }

  private bPos = (b: Building) => ({ x: b.px, y: b.py });

  nearestStorage(x: number, y: number) {
    return this.nearest(this.buildings.filter((b) => b.built && b.def.storage), x, y, this.bPos);
  }
  nearestHome(x: number, y: number) {
    return this.nearest(this.buildings.filter((b) => b.built && b.def.home), x, y, this.bPos);
  }
  nearestBuilt(id: BuildingId, x: number, y: number) {
    return this.nearest(this.buildings.filter((b) => b.built && b.id === id), x, y, this.bPos);
  }
  nearestSite(x: number, y: number) {
    return this.nearest(this.buildings.filter((b) => !b.built && !b.planned), x, y, this.bPos);
  }
  findNode(kinds: NodeKind[], x: number, y: number) {
    return this.nearest(
      this.nodes.filter((n) => n.grown && !n.reservedBy && kinds.includes(n.kind)),
      x,
      y,
      (n) => ({ x: n.x, y: n.y }),
    );
  }
  /** Ruộng cần người: ưu tiên ruộng lúa chín, rồi tới ruộng trống chờ cấy. */
  findField(x: number, y: number) {
    const free = this.buildings.filter((b) => b.needsFarmer && !b.reservedBy);
    const ripe = free.filter((b) => b.crop === 3);
    return this.nearest(ripe.length ? ripe : free, x, y, this.bPos);
  }
  /** Đang mở hội làng ở đình. */
  festivalOn() {
    return this.state.festival && this.buildings.some((b) => b.id === 'dinh' && b.built);
  }
  /** Đang họp chợ phiên. */
  marketOn() {
    return this.state.marketOpen && this.buildings.some((b) => b.id === 'cho' && b.built);
  }
  findAnimal(x: number, y: number) {
    return this.nearest(this.animals.filter((a) => a.alive && !a.reservedBy), x, y, (a) => a);
  }
  findFishingSpot(x: number, y: number) {
    return this.nearest(
      this.fishingSpots.filter((s) => !s.reservedBy),
      x,
      y,
      (s) => ({ x: s.x * TILE, y: s.y * TILE }),
    );
  }

  /** Ô đứng được cạnh một ô mục tiêu, gần người đi nhất. */
  standNear(tx: number, ty: number, fromX: number, fromY: number): Pt | null {
    const cands: Pt[] = [];
    for (const [dx, dy] of [
      [0, 1],
      [-1, 0],
      [1, 0],
      [0, -1],
      [-1, 1],
      [1, 1],
    ]) {
      const x = tx + dx;
      const y = ty + dy;
      if (this.world.walkable(x, y) && !this.occupied.has(y * MAP_W + x)) cands.push({ x, y });
    }
    return this.nearest(cands, fromX, fromY, (p) => ({ x: p.x * TILE, y: p.y * TILE }));
  }

  hasFood() {
    return FOOD_ORDER.some((k) => this.state.res[k] > 0);
  }

  takeFood(): ResKey | null {
    for (const k of FOOD_ORDER) {
      if (this.state.res[k] > 0) {
        this.state.res[k]--;
        return k;
      }
    }
    return null;
  }

  floatText(x: number, y: number, text: string, color = '#ffffff') {
    const t = this.add
      .text(x, y, text, {
        fontFamily: FONT,
        fontSize: '13px',
        fontStyle: '700',
        color,
        stroke: '#3a2a1a',
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(0.5)
      .setDepth(60000);
    this.tweens.add({ targets: t, y: y - 26, alpha: 0, duration: 1500, ease: 'Sine.easeOut', onComplete: () => t.destroy() });
  }

  // ------------------------------------------------------------ công trình

  placeBuilding(id: BuildingId, tx: number, ty: number, state: BuildState) {
    const b = new Building(this, id, tx, ty, state);
    for (const t of b.tiles()) {
      const node = this.nodeGrid.get(t.y * MAP_W + t.x);
      if (node) this.removeNode(node);
      this.occupied.add(t.y * MAP_W + t.x);
    }
    this.buildings.push(b);
    return b;
  }

  canPlace(id: BuildingId, tx: number, ty: number) {
    const def = BUILDINGS[id];
    for (let y = ty; y < ty + def.h; y++) {
      for (let x = tx; x < tx + def.w; x++) {
        if (!this.world.isLand(x, y) || this.occupied.has(y * MAP_W + x)) return false;
        if (this.isEntrance(x, y)) return false;
        const n = this.nodeGrid.get(y * MAP_W + x);
        if (n && (n.grown || n.kind === 'banana')) return false;
      }
    }
    const ex = tx + Math.floor(def.w / 2);
    const ey = ty + def.h;
    return this.world.walkable(ex, ey) && !this.occupied.has(ey * MAP_W + ex);
  }

  private isEntrance(x: number, y: number) {
    return this.buildings.some((b) => b.entrance.x === x && b.entrance.y === y);
  }

  onBuilt(b: Building) {
    this.state.stats.built[b.id]++;
    this.state.log(`${b.def.icon} Đã xây xong ${b.def.name}!`, { x: b.px, y: b.py });
    this.sfx('built');
    this.floatText(b.px, b.py - b.sprite.height, `${b.def.name} hoàn thành!`, '#ffe27a');
    if (b.def.home) this.assignHome(b);
  }

  private removeBuilding(b: Building) {
    b.destroy();
    this.buildings.splice(this.buildings.indexOf(b), 1);
    for (const t of b.tiles()) this.occupied.delete(t.y * MAP_W + t.x);
  }

  private buildingAt(wx: number, wy: number) {
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    return this.buildings.find((b) => tx >= b.tx && tx < b.tx + b.def.w && ty >= b.ty && ty < b.ty + b.def.h) ?? null;
  }

  /** Chế độ quy hoạch: đánh dấu chỗ muốn xây, trưởng làng sẽ cho xây khi đủ gỗ. */
  startBuild(id: BuildingId) {
    this.cancelBuild();
    this.cancelPower();
    this.buildMode = id;
    this.ghost = this.add.image(0, 0, BUILDINGS[id].tex).setOrigin(0.5, 1).setAlpha(0.7).setDepth(49001);
    this.hud.refresh();
  }

  cancelBuild() {
    this.buildMode = null;
    this.ghost?.destroy();
    this.ghost = undefined;
    this.ghostGfx?.clear();
    this.hud?.refresh();
  }

  private updateGhost() {
    if (this.powerMode) return this.updatePowerGhost();
    if (!this.buildMode || !this.ghost) return;
    const def = BUILDINGS[this.buildMode];
    const p = this.input.activePointer;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const tx = Math.round(wp.x / TILE - def.w / 2);
    const ty = Math.round(wp.y / TILE - def.h / 2);
    this.ghostTile = { x: tx, y: ty };
    const ok = this.canPlace(this.buildMode, tx, ty);
    this.ghost.setPosition((tx + def.w / 2) * TILE, (ty + def.h) * TILE + def.oy).setTint(ok ? 0xc8e4ff : 0xff9a8a);
    const g = this.ghostGfx;
    g.clear();
    g.fillStyle(ok ? 0x9fc8ff : 0xff5a4a, 0.25).fillRect(tx * TILE, ty * TILE, def.w * TILE, def.h * TILE);
    g.lineStyle(2, ok ? 0x9fc8ff : 0xff5a4a, 0.8).strokeRect(tx * TILE, ty * TILE, def.w * TILE, def.h * TILE);
    const ex = tx + Math.floor(def.w / 2);
    g.lineStyle(1.5, 0xffffff, 0.6).strokeRect(ex * TILE + 6, (ty + def.h) * TILE + 6, TILE - 12, TILE - 12);
  }

  private tryPlace(shift: boolean, wx: number, wy: number) {
    const id = this.buildMode;
    if (!id) return;
    const def = BUILDINGS[id];
    // Nhấp lại vào chỗ đã quy hoạch thì bỏ quy hoạch.
    const existing = this.buildingAt(wx, wy);
    if (existing?.planned) {
      this.removeBuilding(existing);
      this.sfx('click');
      this.state.log(`📐 Thành Hoàng bỏ quy hoạch ${existing.def.name}`, { x: existing.px, y: existing.py });
      return;
    }
    const { x, y } = this.ghostTile;
    if (!this.canPlace(id, x, y)) {
      this.state.notify('Chỗ này không xây được — cần đất trống, không có cây');
      return;
    }
    this.placeBuilding(id, x, y, 'planned');
    this.sfx('place');
    this.state.log(`📐 Thành Hoàng quy hoạch ${def.name} — trưởng làng sẽ cho xây khi đủ ${def.cost.go} gỗ`, {
      x: (x + def.w / 2) * TILE,
      y: (y + def.h) * TILE,
    });
    if (!shift) this.cancelBuild();
  }

  // ------------------------------------------------------------ quyền năng của Thành Hoàng

  addPhuc(n: number, x?: number, y?: number) {
    this.state.addPhuc(n);
    if (x !== undefined && y !== undefined) this.floatText(x, y, `+${n} 🙏`, '#ffe9a8');
  }

  usePower(id: PowerId) {
    const def = POWERS[id];
    if (this.powerMode === id) return this.cancelPower();
    if (this.state.phuc < def.cost) {
      this.state.notify(`Chưa đủ Phúc để ${def.name.toLowerCase()} (cần ${def.cost} 🙏)`);
      return;
    }
    this.cancelBuild();
    this.cancelPower();
    if (def.target === 'none') {
      this.castPower(id, 0, 0);
      return;
    }
    this.powerMode = id;
    this.hud.refresh();
  }

  cancelPower() {
    if (!this.powerMode) return;
    this.powerMode = null;
    this.ghostGfx?.clear();
    this.hud?.refresh();
  }

  private updatePowerGhost() {
    const def = POWERS[this.powerMode!];
    const p = this.input.activePointer;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const g = this.ghostGfx;
    g.clear();
    if (def.target === 'villager') {
      const v = this.villagerAt(wp.x, wp.y);
      g.lineStyle(2, 0xffe27a, 0.9).strokeCircle(v ? v.x : wp.x, v ? v.y - 16 : wp.y, v ? 26 : 14);
      return;
    }
    const r = (def.radius ?? 1) * TILE;
    const t = this.realTime;
    g.fillStyle(0xffe27a, 0.12).fillCircle(wp.x, wp.y, r);
    g.lineStyle(2, 0xffe27a, 0.7 + Math.sin(t * 5) * 0.2).strokeCircle(wp.x, wp.y, r);
  }

  /** Thực hiện quyền năng tại (wx, wy). Trả về false nếu không hợp lệ (không mất Phúc). */
  private castPower(id: PowerId, wx: number, wy: number) {
    const def = POWERS[id];
    const st = this.state;
    let target: Villager | null = null;

    if (id === 'phuho') {
      target = this.villagerAt(wx, wy);
      if (!target) {
        this.state.notify('Hãy nhấp vào một người để phù hộ');
        return false;
      }
    }
    if (id === 'tha' && !this.world.isLand(Math.floor(wx / TILE), Math.floor(wy / TILE))) {
      this.state.notify('Hãy chọn chỗ đất liền để thả thú');
      return false;
    }
    if (!st.spendPhuc(def.cost)) return false;
    this.sfx('bless');

    switch (id) {
      case 'mua': {
        st.rainUntil = Math.max(st.time, st.rainUntil) + DAY_LENGTH / 8;
        this.sfx('thunder');
        st.log('🌧️ Thành Hoàng cho mưa xuống — cây cối sẽ mọc lại thật nhanh');
        break;
      }
      case 'ca': {
        st.fishUntil = Math.max(st.time, st.fishUntil) + DAY_LENGTH;
        for (const r of this.ripples) r.setTint(0xffe9a0);
        st.log('🐟 Cá về đầy sông — câu cá dễ trúng suốt một ngày');
        break;
      }
      case 'loc': {
        const r = (def.radius ?? 3) * TILE;
        let n = 0;
        for (const node of this.nodes) {
          if (Phaser.Math.Distance.Between(node.x, node.y, wx, wy) <= r && node.bless()) {
            n++;
            this.sparkle(node.x, node.y - 20, 8);
          }
        }
        this.sparkle(wx, wy, 24);
        st.log(n ? `🍌 Thành Hoàng ban lộc: ${n} cây tốt tươi trở lại` : '🍌 Thành Hoàng ban lộc cho cây cối thêm xanh tốt', {
          x: wx,
          y: wy,
        });
        break;
      }
      case 'tha': {
        const tx = Math.floor(wx / TILE);
        const ty = Math.floor(wy / TILE);
        for (const kind of ['ga', 'ga', 'heo'] as AnimalKind[]) this.animals.push(new Animal(this, kind, tx, ty));
        this.sparkle(wx, wy, 16);
        st.log('🐓 Thành Hoàng thả gà rừng, heo rừng về rừng', { x: wx, y: wy });
        break;
      }
      case 'phuho': {
        target!.blessed();
        this.sparkle(target!.x, target!.y - 20, 30);
        st.log(`✨ ${target!.name} được Thành Hoàng phù hộ`, target!);
        break;
      }
    }
    this.resolveWishes(id, target);
    this.cancelPower();
    return true;
  }

  private sparkle(x: number, y: number, n: number) {
    const em = this.add
      .particles(x, y, 'spark', {
        speed: { min: 20, max: 70 },
        lifespan: 900,
        scale: { start: 1.8, end: 0 },
        alpha: { start: 1, end: 0 },
        tint: 0xffe27a,
        blendMode: 'ADD',
        emitting: false,
      })
      .setDepth(60000);
    em.explode(n);
    this.time.delayedCall(1200, () => em.destroy());
  }

  /** Dân làng nên cầu khấn điều gì, dựa vào tình hình hiện tại. */
  wishFor(v: Villager): WishType {
    if (v.mood < 40 || v.memories.some((m) => m.id === 'heo_huc')) return 'khoe';
    const need = this.villageNeeds();
    const opts: WishType[] = [];
    if (need.hai > 0.5 || need.ca > 0.5) opts.push('loc');
    const trees = this.nodes.filter((n) => n.kind !== 'banana');
    if (trees.filter((n) => !n.grown).length > trees.length * 0.15) opts.push('mua');
    if (v.affinity('ca') > 0.2 && !this.state.fishBoost) opts.push('ca');
    if (this.animals.length < 5) opts.push('thu');
    if (this.state.drought) opts.push('mua', 'mua', 'mua');
    // Lúc đủ đầy vẫn hay cầu mưa thuận gió hoà, được mùa cá, mùa trái.
    if (!opts.length) opts.push((['mua', 'mua', 'ca', 'loc'] as WishType[])[Math.floor(Math.random() * 4)]);
    return opts[Math.floor(Math.random() * opts.length)];
  }

  /** Quyền năng vừa dùng có đáp ứng lời cầu khấn nào không. */
  private resolveWishes(id: PowerId, target: Villager | null) {
    for (const v of this.villagers) {
      if (!v.wish || WISHES[v.wish.type].power !== id) continue;
      if (id === 'phuho' && v !== target) continue;
      const text = v.wish.text;
      if (!v.fulfillWish()) continue;
      this.state.stats.wishes++;
      this.addPhuc(10, v.x, v.y - 60);
      this.state.log(`✨ Lời cầu của ${v.name} đã ứng nghiệm: “${text}”`, { x: v.x, y: v.y });
    }
  }

  // ------------------------------------------------------------ người dân

  /** Chọn người dân; camera sẽ bám theo họ cho tới khi bỏ chọn hoặc tự kéo camera. */
  select(v: Villager | null) {
    this.selected?.setSelected(false);
    this.selected = v;
    v?.setSelected(true);
    if (v) this.sfx('select');
    const cam = this.cameras.main;
    if (v) cam.startFollow(v, false, 0.08, 0.08);
    else cam.stopFollow();
    this.hud.renderDetail();
  }

  focus(v: Villager) {
    this.select(v);
  }

  /** Đưa camera tới chỗ một sự kiện trong sử làng. */
  panTo(x: number, y: number) {
    this.select(null);
    this.cameras.main.pan(x, y, 600, 'Sine.easeInOut');
  }

  /** Người chơi tự di chuyển camera thì ngừng bám theo (vẫn giữ người đang chọn). */
  private releaseFollow() {
    this.cameras.main.stopFollow();
  }

  /** Thành Hoàng báo mộng gợi ý một việc — người đó có thể nghe hoặc không. */
  dream(v: Villager, job: JobId) {
    if (this.state.phuc < DREAM_COST) {
      this.state.notify(`Chưa đủ Phúc để báo mộng (cần ${DREAM_COST} 🙏)`);
      return;
    }
    const r = v.receiveDream(job);
    if (r === 'cooldown') return;
    this.state.spendPhuc(DREAM_COST);
    const verb = JOBS[job].name.toLowerCase();
    this.sfx(r === 'accepted' ? 'levelUp' : 'click');
    this.state.log(
      r === 'accepted' ? `💭 ${v.name} nghe lời báo mộng, đi ${verb}` : `💭 ${v.name} không nghe lời báo mộng đi ${verb}`,
      { x: v.x, y: v.y },
    );
    this.hud.renderDetail();
  }

  clearIntent(v: Villager) {
    v.clearIntent();
    this.hud.renderDetail();
  }

  // ------------------------------------------------------------ làng tự vận hành

  private needsCache: { time: number; need: Record<JobId, number> } | null = null;

  /**
   * Mức cần thiết của từng việc với cả làng (0..1), -1 nếu hiện không làm được.
   * Dân làng cộng thêm tính cách, tay nghề của riêng mình để tự chọn việc.
   */
  villageNeeds(): Record<JobId, number> {
    if (this.needsCache?.time === this.state.time) return this.needsCache.need;
    const r = this.state.res;
    const pop = this.villagers.length;
    const foodVal = FOOD_ORDER.reduce((s, k) => s + r[k] * (RESOURCES[k].food ?? 0), 0);
    const hungry = Phaser.Math.Clamp(1 - foodVal / (pop * 150), 0, 1);
    const fire = this.buildings.some((b) => b.id === 'lua' && b.built);
    const raw = r.thit + r.ca + r.thoc;
    const rawFull = r.thit + r.ca >= 8 ? 0.4 : 1;
    const any = (kinds: NodeKind[]) => this.nodes.some((n) => n.grown && !n.reservedBy && kinds.includes(n.kind));
    const st = this.state;
    const fields = this.buildings.filter((b) => b.needsFarmer && !b.reservedBy);
    const ripe = fields.some((f) => f.crop === 3);
    const kiln = this.buildings.some((b) => b.id === 'lo' && b.built);
    const market = this.buildings.some((b) => b.id === 'cho' && b.built);

    const need: Record<JobId, number> = {
      nghi: 0,
      hai: any(['banana']) ? 0.15 + hungry * 0.85 : -1,
      ca: (0.1 + hungry * (fire ? 0.8 : 0.35)) * rawFull,
      san: this.animals.some((a) => a.alive && !a.reservedBy) ? (0.1 + hungry * (fire ? 0.8 : 0.3)) * rawFull : -1,
      nau: fire && raw > 0 ? Math.max(Math.min(1, 0.35 + raw * 0.12), hungry) : -1,
      chat: any(['tree', 'bamboo']) ? Phaser.Math.Clamp(0.15 + (1 - r.go / 40) * 0.7, 0.1, 0.85) : -1,
      cay: !st.has('ruong') || !fields.length ? -1 : ripe ? 0.75 + hungry * 0.2 : 0.35 + hungry * 0.4,
      nung: !st.has('gom') || !kiln || r.go < 3 ? -1 : 0.2 + (r.gom < 6 ? 0.3 : 0) + (market ? 0.15 : 0),
      xay: this.buildings.some((b) => !b.built && !b.planned) ? 0.9 : -1,
      le: 0,
    };
    this.needsCache = { time: this.state.time, need };
    return need;
  }

  private workSpots: Pt[] = [];

  /** Ghi lại nơi dân hay làm việc — trưởng làng dựa vào đó để chọn chỗ dựng kho. */
  recordWork(x: number, y: number) {
    this.workSpots.push({ x: Math.floor(x / TILE), y: Math.floor(y / TILE) });
    if (this.workSpots.length > 24) this.workSpots.shift();
  }

  private chiefV: Villager | null = null;

  /** Uy tín: tổng tay nghề, cộng thêm tuổi tác. */
  private respect(v: Villager) {
    return Object.values(v.skills).reduce((a, k) => a + k.level, 0) + v.years / 10;
  }

  /** Trưởng làng hiện tại — chỉ đổi khi có người uy tín hơn hẳn (xem `electChief`). */
  chief(): Villager | null {
    if (!this.chiefV) {
      const adults = this.villagers.filter((v) => !v.isChild);
      this.chiefV = adults.sort((a, b) => this.respect(b) - this.respect(a))[0] ?? null;
    }
    return this.chiefV;
  }

  private electChief() {
    const cur = this.chief();
    if (!cur) return;
    const rival = this.villagers
      .filter((v) => !v.isChild && v !== cur)
      .sort((a, b) => this.respect(b) - this.respect(a))[0];
    if (!rival || this.respect(rival) < this.respect(cur) + 3) return;
    this.chiefV = rival;
    rival.addMood(10);
    rival.say('Được cả làng tin tưởng, mình sẽ cố gắng!');
    rival.note('👑 Được cả làng bầu làm trưởng làng');
    this.state.log(`👑 Cả làng bầu ${rival.name} làm trưởng làng mới`, { x: rival.x, y: rival.y });
  }

  /** Ô trống để đứng/ngồi: đất liền, không có công trình. */
  isFree(x: number, y: number) {
    return this.world.isLand(x, y) && !this.occupied.has(y * MAP_W + x);
  }

  /** Trưởng làng tự quyết định dựng công trình mới khi làng cần và đủ gỗ. */
  private plan() {
    this.electChief();
    const chief = this.chief();
    if (!chief || chief.asleep || this.buildings.some((b) => !b.built && !b.planned)) return;
    const go = this.state.res.go;

    // Ưu tiên chỗ Thành Hoàng đã quy hoạch.
    const planned = this.buildings.filter((b) => b.planned);
    if (planned.length) {
      const b = planned.find((p) => this.state.canAfford(p.def.cost));
      if (!b) return; // để dành gỗ cho quy hoạch
      this.state.pay(b.def.cost);
      b.fund();
      this.sfx('place', b.px, b.py);
      const why = `Làm theo ý Thành Hoàng, dựng ${b.def.name.toLowerCase()} thôi`;
      chief.say(why);
      chief.note(`🏛️ ${why}`);
      this.state.log(`🏛️ Trưởng làng ${chief.name} cho xây ${b.def.name} theo quy hoạch`, { x: b.px, y: b.py });
      return;
    }

    const count = (id: BuildingId) => this.buildings.filter((b) => b.id === id).length;
    const built = (id: BuildingId) => this.buildings.some((b) => b.id === id && b.built);
    const st = this.state;
    const pop = this.villagers.length;

    // Trưởng làng bàn với cả làng những bước tiến mới.
    if (st.has('gom') && !st.has('cho') && pop >= 6 && st.res.gom >= 4) {
      this.discover('cho', chief, `Trưởng làng ${chief.name} bàn với cả làng: đồ gốm làm ra nhiều rồi, mở chợ phiên cho làng bên đến đổi chác`);
    } else if (st.has('cho') && !st.has('dinh') && pop >= 8 && built('cho')) {
      this.discover('dinh', chief, `Làng giờ đã đông đúc, trưởng làng ${chief.name} bàn dựng ngôi đình làm nơi hội họp, mở hội mỗi mùa`);
    }

    const homeless = this.villagers.filter((v) => v.needsHome && !v.isChild);
    const couple = homeless.find((v) => v.spouse?.alive && v.spouse.needsHome);
    const fields = count('ruong');
    let id: BuildingId | null = null;
    let why = '';
    if (!count('lua') && go >= 8) {
      id = 'lua';
      why = 'Phải có đống lửa để nướng thịt, tối còn sưởi ấm';
    } else if ((couple || homeless.length >= 2) && go >= 30) {
      id = 'nha';
      why = couple
        ? `${couple.name} và ${couple.spouse!.name} cần một mái nhà riêng`
        : 'Người mới đến cần có chỗ ở đàng hoàng';
    } else if (st.has('ruong') && !fields && go >= 6) {
      id = 'ruong';
      why = 'Đắp thửa ruộng đầu tiên, cấy thử lúa nước';
    } else if (!count('mieu') && count('lua') && go >= 15) {
      id = 'mieu';
      why = 'Lập miếu thờ Thành Hoàng, cầu cho làng yên ấm';
    } else if (!count('kho') && go >= 26) {
      id = 'kho';
      why = 'Gỗ nhiều rồi, dựng cái kho gần chỗ làm cho tiện';
    } else if (st.has('gom') && !count('lo') && go >= 18) {
      id = 'lo';
      why = 'Xây lò nung, làm chum vại bát đĩa cho cả làng';
    } else if (st.has('cho') && !count('cho') && go >= 25) {
      id = 'cho';
      why = 'Dựng lều chợ, họp phiên đổi chác với làng bên';
    } else if (st.has('dinh') && !count('dinh') && go >= 45) {
      id = 'dinh';
      why = 'Dựng ngôi đình cho làng hội họp, thờ phụng';
    } else if (st.has('ruong') && fields < Math.ceil(pop / 2) && go >= 12) {
      id = 'ruong';
      why = 'Đắp thêm ruộng, cho cả làng đủ gạo ăn';
    }
    if (!id) return;

    const h = this.homeTile;
    let target: Pt = h;
    if (id === 'kho' && this.workSpots.length) {
      const cx = this.workSpots.reduce((s, p) => s + p.x, 0) / this.workSpots.length;
      const cy = this.workSpots.reduce((s, p) => s + p.y, 0) / this.workSpots.length;
      target = { x: Math.round(h.x + (cx - h.x) * 0.5), y: Math.round(h.y + (cy - h.y) * 0.5) };
    }
    if (id === 'ruong') {
      // Ruộng nằm về phía bờ sông cho gần nước.
      const w = this.nearest(this.fishingSpots, h.x * TILE, h.y * TILE, (s) => ({ x: s.x * TILE, y: s.y * TILE }));
      if (w) target = { x: Math.round(h.x + (w.x - h.x) * 0.55), y: Math.round(h.y + (w.y - h.y) * 0.55) };
    }
    const minR = id === 'kho' || id === 'ruong' ? 0 : id === 'nha' || id === 'cho' ? 3 : id === 'dinh' ? 4 : 2;
    const spot = this.findBuildSpot(id, target, minR);
    if (!spot) return;
    const def = BUILDINGS[id];
    this.state.pay(def.cost);
    this.placeBuilding(id, spot.x, spot.y, 'site');
    this.sfx('place', (spot.x + def.w / 2) * TILE, (spot.y + def.h) * TILE);
    chief.say(why);
    chief.note(`🏛️ Quyết định dựng ${def.name}: ${why}`);
    this.state.log(`🏛️ Trưởng làng ${chief.name} quyết định dựng ${def.name}`, {
      x: (spot.x + def.w / 2) * TILE,
      y: (spot.y + def.h) * TILE,
    });
  }

  private findBuildSpot(id: BuildingId, c: Pt, minR: number): Pt | null {
    for (let r = minR; r <= 12; r++) {
      const ring: Pt[] = [];
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++) if (Math.max(Math.abs(dx), Math.abs(dy)) === r) ring.push({ x: c.x + dx, y: c.y + dy });
      Phaser.Utils.Array.Shuffle(ring);
      const ok = ring.find((p) => this.canPlace(id, p.x, p.y));
      if (ok) return ok;
    }
    return null;
  }

  private villagerAt(wx: number, wy: number) {
    let best: Villager | null = null;
    let bd = 22;
    for (const v of this.villagers) {
      if (v.inside) continue;
      const d = Phaser.Math.Distance.Between(wx, wy, v.x, v.y - 16);
      if (d < bd) {
        bd = d;
        best = v;
      }
    }
    return best;
  }

  // ------------------------------------------------------------ vòng đời: sinh, lão, tử, kết duyên

  /** Những người đã khuất — vẫn còn trong gia phả. */
  departed: Villager[] = [];
  private idCounter = 0;
  private lastDay = 1;
  private migrantAt = 0;
  private lastMigrant = 0;
  private cemetery: Pt | null = null;

  newId() {
    return `v${++this.idCounter}`;
  }

  addVillager(def: VillagerDef, tx: number, ty: number) {
    const v = new Villager(this, def, tx, ty);
    this.villagers.push(v);
    return v;
  }

  private takenNames() {
    return new Set(this.villagers.map((v) => v.def.given));
  }

  /** Đồ ăn đang thiếu tới mức nào (0 = dư dả, 1 = hết sạch). */
  private foodShortage() {
    const r = this.state.res;
    const foodVal = FOOD_ORDER.reduce((s, k) => s + r[k] * (RESOURCES[k].food ?? 0), 0);
    return Phaser.Math.Clamp(1 - foodVal / (this.villagers.length * 150), 0, 1);
  }

  addBond(a: Villager, b: Villager, n: number) {
    const v = Phaser.Math.Clamp(a.bond(b) + n, 0, 100);
    a.bonds.set(b, v);
    b.bonds.set(a, v);
  }

  /** Hai người có thể tìm hiểu nhau không: đủ tuổi, độc thân, khác giới, không phải họ hàng gần. */
  canCourt(a: Villager, b: Villager) {
    return (
      a.alive &&
      b.alive &&
      a.def.gender !== b.def.gender &&
      a.age >= MARRY_AGE &&
      b.age >= MARRY_AGE &&
      !a.spouse?.alive &&
      !b.spouse?.alive &&
      !a.isFamily(b) &&
      Math.abs(a.age - b.age) <= 14
    );
  }

  /** Đủ thân thiết thì nên duyên vợ chồng. */
  tryMarry(a: Villager, b: Villager) {
    if (!this.canCourt(a, b) || a.bond(b) < 60) return;
    a.spouse = b;
    b.spouse = a;
    this.addBond(a, b, 100);
    for (const [p, q] of [
      [a, b],
      [b, a],
    ]) {
      p.addMood(20);
      p.needsHome = true;
      p.remember('cuoi', '💍', `Nên duyên vợ chồng với ${q.name}`, 3);
    }
    a.say('Mình về chung một nhà nhé? 💕', 5000);
    b.say('Ừ! 💕', 5000);
    this.sfx('quest', a.x, a.y);
    this.sparkle(a.x, a.y - 30, 16);
    this.state.log(`💍 ${a.name} và ${b.name} nên duyên vợ chồng`, { x: a.x, y: a.y });
  }

  onGrowUp(v: Villager, from: Stage | '', to: Stage) {
    const at = { x: v.x, y: v.y };
    if (from === 'be' && to === 'tre') {
      this.state.log(`🧸 ${v.name} đã biết đi, biết nói, chạy nhảy khắp xóm`, at);
    } else if (to === 'lon') {
      this.state.log(`🎋 ${v.def.given} tròn 16 tuổi, giờ đã là ${v.name}`, at);
      v.note(`🎋 Tròn 16 tuổi, đã trưởng thành`);
      v.say('Mình lớn rồi, phụ giúp mọi người thôi!');
    } else if (to === 'gia') {
      this.state.log(`🍵 ${v.def.given} tròn 60 tuổi, lên lão — giờ là ${v.name}`, at);
      v.note('🍵 Lên lão, giờ là bậc cao niên trong làng');
    }
  }

  /** Mỗi nửa đêm: người già có thể ra đi, các gia đình có thể đón con. Sáng ra có thể có dân mới đến. */
  private newDay() {
    for (const v of [...this.villagers]) {
      if (v.age >= 62 && Math.random() < 0.04 + (v.age - 62) * 0.025) this.passAway(v);
    }
    const short = this.foodShortage();
    for (const mom of [...this.villagers]) {
      const dad = mom.spouse;
      if (!mom.female || !dad?.alive || mom.age < MARRY_AGE || mom.age > 42 || dad.age >= 60) continue;
      if (!mom.home?.built || mom.needsHome || mom.children.length >= 4 || short > 0.6) continue;
      if (Math.random() < 0.3) this.birth(mom, dad);
    }
    this.migrantAt = this.state.time + DAY_LENGTH * (8 / 24);
    this.newDayWeather();
    // Mãi chưa ai để ý thì tới ngày 4 cũng có người tìm ra lúa nước.
    if (this.state.day >= 4 && !this.state.has('ruong')) {
      const finder = this.villagers.filter((v) => !v.isChild).sort((a, b) => b.skills.hai.level - a.skills.hai.level)[0];
      if (finder) this.discover('ruong', finder, `Một sáng ra bãi bồi, ${finder.name} thấy lúa dại trổ bông, bèn mang hạt về gieo thử`);
    }
  }

  private birth(mom: Villager, dad: Villager) {
    const gender: Gender = Math.random() < 0.5 ? 'nam' : 'nu';
    const inherit = pick([...mom.traits, ...dad.traits]);
    const home = mom.home!;
    const e = home.entrance;
    const baby = this.addVillager(
      {
        id: this.newId(),
        given: randomName(gender, this.takenNames()),
        gender,
        birthTime: this.state.time,
        palette: randomPalette(gender),
        skills: {},
        traits: rollTraits([inherit], 1),
      },
      e.x,
      e.y,
    );
    baby.parents = [dad, mom];
    baby.home = home;
    baby.hunger = 100;
    baby.energy = 100;
    for (const sib of mom.children) this.addBond(sib, baby, 50);
    mom.children.push(baby);
    dad.children.push(baby);
    for (const p of [mom, dad]) {
      this.addBond(p, baby, 85);
      p.addMood(20);
      p.remember(`con_${baby.def.id}`, '👶', `Đón ${baby.name} chào đời`, 3);
    }
    this.sfx('quest', home.px, home.py);
    this.state.log(
      `👶 Nhà ${dad.name} – ${mom.name} chào đón ${gender === 'nam' ? 'bé trai' : 'bé gái'} ${baby.def.given}`,
      { x: home.px, y: home.py },
    );
  }

  private passAway(v: Villager) {
    const grave = this.placeGrave();
    const wasChief = this.chiefV === v;
    v.die();
    this.villagers.splice(this.villagers.indexOf(v), 1);
    this.departed.push(v);
    if (this.selected === v) this.select(null);
    for (const o of this.villagers) {
      if (o.isFamily(v)) {
        o.addMood(-20);
        o.remember(`tang_${v.def.id}`, '🕯️', `Nhớ thương ${v.name}`, 3, { le: 0.3, nghi: 0.1 });
      } else {
        o.addMood(-6);
      }
    }
    this.state.log(`🕯️ ${v.name} đã thanh thản về với ông bà, hưởng thọ ${v.years} tuổi`, grave);
    if (wasChief) {
      this.chiefV = null;
      const c = this.chief();
      if (c) this.state.log(`👑 ${c.name} kế nhiệm làm trưởng làng`, { x: c.x, y: c.y });
    }
  }

  /** Mộ phần ở khu nghĩa trang ngoài rìa làng. */
  private placeGrave(): Pt {
    const spot = this.cemetery ? this.findBuildSpot('lua', this.cemetery, 0) : this.findBuildSpot('lua', this.homeTile, 8);
    if (!spot) return { x: this.homeTile.x * TILE, y: this.homeTile.y * TILE };
    this.cemetery ??= spot;
    this.occupied.add(spot.y * MAP_W + spot.x);
    const x = spot.x * TILE + TILE / 2;
    const y = spot.y * TILE + TILE - 2;
    this.add.image(x, y, 'mo').setOrigin(0.5, 1).setDepth(y);
    return { x, y };
  }

  /** Buổi sáng: làng sung túc thì có người từ làng bên tìm đến. */
  private migrants() {
    const st = this.state;
    if (st.day < 2 || this.villagers.length >= 18 || st.time - this.lastMigrant < DAY_LENGTH * 2) return;
    const avgMood = this.villagers.reduce((s, v) => s + v.mood, 0) / this.villagers.length;
    if (avgMood < 55 || this.foodShortage() > 0.5 || Math.random() > 0.45) return;
    this.lastMigrant = st.time;

    const h = this.homeTile;
    const ys = Phaser.Utils.Array.Shuffle([...Array(13).keys()].map((i) => h.y + i - 6));
    const sy = ys.find((y) => this.world.isLand(1, y)) ?? h.y;
    const sx = this.world.isLand(1, sy) ? 1 : h.x;
    const make = (gender: Gender, age: number) => {
      const skills: VillagerDef['skills'] = {};
      for (const j of Phaser.Utils.Array.Shuffle([...SKILL_JOBS]).slice(0, 2)) skills[j] = Phaser.Math.Between(1, 2);
      const v = this.addVillager(
        {
          id: this.newId(),
          given: randomName(gender, this.takenNames()),
          gender,
          birthTime: st.time - age * DAY_LENGTH,
          palette: randomPalette(gender),
          skills: age < 16 ? {} : skills,
          traits: rollTraits([], 2),
        },
        sx,
        sy,
      );
      v.needsHome = true;
      return v;
    };

    const at = { x: sx * TILE, y: sy * TILE };
    if (Math.random() < 0.6) {
      const v = make(Math.random() < 0.5 ? 'nam' : 'nu', Phaser.Math.Between(18, 28));
      v.say('Chào cả làng! Cho mình ở lại với nhé');
      st.log(`🧳 ${v.name} từ làng bên tìm đến, xin ở lại làng`, at);
      return;
    }
    const a = make('nam', Phaser.Math.Between(22, 32));
    const b = make('nu', Phaser.Math.Between(20, 30));
    a.spouse = b;
    b.spouse = a;
    this.addBond(a, b, 90);
    let kid: Villager | null = null;
    if (Math.random() < 0.4) {
      kid = make(Math.random() < 0.5 ? 'nam' : 'nu', Phaser.Math.Between(2, 8));
      kid.parents = [a, b];
      a.children.push(kid);
      b.children.push(kid);
      this.addBond(a, kid, 80);
      this.addBond(b, kid, 80);
    }
    a.say('Làng mình đẹp quá, ở lại đây thôi!');
    st.log(`🧳 Vợ chồng ${a.name} – ${b.name}${kid ? ` cùng ${kid.name}` : ''} từ làng bên tìm đến lập nghiệp`, at);
  }

  /** Nhà mới xây xong: chia cho vợ chồng chưa có nhà (kèm con nhỏ), rồi tới người mới đến. */
  private assignHome(b: Building) {
    const homeless = this.villagers.filter((v) => v.needsHome && !v.isChild);
    const husbandOrWife = homeless.find((v) => v.spouse?.alive && v.spouse.needsHome);
    let members: Villager[];
    if (husbandOrWife) {
      const sp = husbandOrWife.spouse!;
      members = [husbandOrWife, sp, ...husbandOrWife.children.filter((c) => c.alive && c.isChild)];
    } else {
      members = homeless.slice(0, 2);
    }
    if (!members.length) return;
    for (const m of members) {
      m.home = b;
      m.needsHome = false;
      m.addMood(15);
      m.note('🏠 Dọn về nhà mới');
    }
    const adults = members.filter((m) => !m.isChild);
    members[0].say('Có nhà mới rồi, vui quá!');
    this.state.log(
      husbandOrWife ? `🏠 Vợ chồng ${adults.map((m) => m.name).join(' – ')} dọn về nhà mới` : `🏠 ${adults.map((m) => m.name).join(', ')} dọn về nhà mới`,
      { x: b.px, y: b.py },
    );
  }

  // ------------------------------------------------------------ phát kiến, mùa màng, phiên chợ, hội làng

  /** Dân làng vừa làm xong một việc — có khi nhờ đó mà nghĩ ra điều mới. */
  notice(v: Villager, act: 'hai' | 'ca' | 'cay') {
    const st = this.state;
    if (!st.has('ruong') && st.day >= 2 && act !== 'cay' && Math.random() < 0.15) {
      this.discover('ruong', v, `${v.name} để ý thấy lúa dại trổ bông ở bãi bồi ven sông, bèn mang hạt về gieo thử`);
    } else if (st.has('ruong') && !st.has('gom') && this.villagers.length >= 4 && act !== 'hai') {
      const knack = v.has('kheoTay') || v.has('toMo') ? 0.18 : 0.08;
      if (Math.random() < knack) {
        const where = act === 'cay' ? 'ngoài ruộng' : 'bên bờ sông';
        this.discover('gom', v, `${v.name} nặn chơi nắm đất sét ${where}, để quên cạnh bếp lửa — sáng ra cứng như đá`);
      }
    }
  }

  private static readonly DISC_LINES: Record<DiscId, string> = {
    ruong: 'Ơ, lúa dại! Mang về gieo thử xem 🌾',
    gom: 'Đất sét nung lên cứng thế này, làm được chum vại rồi! 🏺',
    cho: 'Mở chợ phiên thôi, cho làng mình thêm sầm uất! 🏮',
    dinh: 'Làng mình phải có một ngôi đình! 🏯',
  };

  discover(id: DiscId, v: Villager, story: string) {
    const st = this.state;
    if (st.has(id)) return;
    st.discovered.add(id);
    const d = DISCOVERIES[id];
    v.addMood(15);
    v.remember(`pk_${id}`, '💡', `Tìm ra ${d.name.toLowerCase()} cho cả làng`, 5);
    v.say(`💡 ${GameScene.DISC_LINES[id]}`, 6000);
    this.sfx('quest', v.x, v.y);
    this.sparkle(v.x, v.y - 30, 30);
    const at = { x: v.x, y: v.y };
    st.log(`💡 ${story}`, at);
    st.log(`${d.icon} Làng biết ${d.name.toLowerCase()}!`, at);
    const era = ERAS[Math.min(ERAS.length - 1, st.discovered.size)];
    st.log(`${era.icon} Làng bước sang ${era.name.toLowerCase()}`);
    this.needsCache = null;
    this.hud.banner(d.icon, `Phát kiến: ${d.name}`, story);
  }

  /** Thời gian lúa lớn từ lúc cấy tới lúc chín (thời tiết thường). */
  private static readonly FIELD_GROW = DAY_LENGTH * 0.5;
  private rainAt = 0;
  private droughtSince = 0;
  private marketWas = false;
  private firstRipe = false;
  private festivalWas = false;
  private traders: Phaser.GameObjects.GameObject[] = [];
  private lanterns: Phaser.GameObjects.GameObject[] = [];

  /** Mỗi sáng: có thể có mưa rào tự nhiên; lâu ngày không mưa thì hạn hán. */
  private newDayWeather() {
    const st = this.state;
    if (!st.drought && st.day >= 4 && st.time - st.lastRain > DAY_LENGTH * 2.5 && Math.random() < 0.5) {
      st.drought = true;
      this.droughtSince = st.time;
      st.log('☀️ Trời hạn hán — ruộng nứt nẻ, lúa còi cọc, dân làng mong mưa');
      for (const v of this.villagers) if (!v.isChild) v.say('Nắng quá, mong trời đổ mưa…');
      return;
    }
    // Hạn lâu (quá 3 ngày) thì trời cũng tự mưa; còn không thì 30% có mưa rào trong ngày.
    const longDrought = st.drought && st.time - this.droughtSince > DAY_LENGTH * 3;
    if (longDrought || (!st.drought && Math.random() < 0.3)) {
      this.rainAt = st.time + DAY_LENGTH * (0.1 + Math.random() * 0.45);
    }
  }

  private simulateWorld(dt: number) {
    const st = this.state;
    if (st.raining) st.lastRain = st.time;
    if (this.rainAt && st.time >= this.rainAt) {
      this.rainAt = 0;
      if (!st.raining) {
        st.rainUntil = st.time + DAY_LENGTH / 10;
        st.log('🌦️ Trời đổ mưa rào');
      }
    }

    // Lúa lớn: mưa thì nhanh gấp 3, hạn thì chậm hẳn.
    const mul = st.raining ? 3 : st.drought ? 0.35 : 1;
    for (const b of this.buildings) {
      if (b.isField && b.grow(dt, GameScene.FIELD_GROW, mul) && !this.firstRipe) {
        this.firstRipe = true;
        st.log('🌾 Thửa ruộng đầu tiên đã chín vàng, chờ ngày gặt', { x: b.px, y: b.py });
      }
    }

    const market = this.marketOn();
    if (market !== this.marketWas) {
      this.marketWas = market;
      if (market) this.openMarket();
      else this.closeMarket();
    }
    const fest = this.festivalOn();
    if (fest !== this.festivalWas) {
      this.festivalWas = fest;
      if (fest) this.startFestival();
      else this.endFestival();
    }
  }

  /** Phiên chợ: người làng bên tới, làng bán đồ gốm đổi lấy gỗ và gạo. */
  private openMarket() {
    const st = this.state;
    const cho = this.buildings.find((b) => b.id === 'cho' && b.built)!;
    const sold = Math.min(st.res.gom, 6);
    st.res.gom -= sold;
    st.add('go', sold * 3);
    st.add('com', sold * 2);
    this.addPhuc(4);
    this.sfx('quest', cho.px, cho.py);
    st.log(
      sold
        ? `🏮 Phiên chợ họp: làng bán ${sold} đồ gốm, đổi được ${sold * 3} gỗ và ${sold * 2} bát cơm`
        : '🏮 Phiên chợ họp: người làng bên gánh hàng tới, làng mình chưa có gốm để bán',
      { x: cho.px, y: cho.py },
    );
    for (let i = 0; i < 3; i++) {
      const g = Math.random() < 0.5 ? 'nam' : 'nu';
      const p = randomPalette(g);
      const key = personTexture(this, `trader_${i}`, { ...p, hair: '#1d1a17', long: g === 'nu' });
      const x = cho.px - 30 + i * 30 + Phaser.Math.Between(-4, 4);
      const y = cho.py + 18 + Phaser.Math.Between(0, 8);
      const img = this.add.image(x, y, key).setOrigin(0.5, 1).setDepth(y).setFlipX(i === 2);
      const goods = this.add.text(x, y - 48, ['🧺', '🥬', '🐓'][i], { fontSize: '13px', resolution: 2 }).setOrigin(0.5, 1).setDepth(y + 1);
      this.tweens.add({ targets: [img, goods], y: '-=2', duration: 600 + i * 120, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.traders.push(img, goods);
    }
  }

  private closeMarket() {
    for (const t of this.traders) t.destroy();
    this.traders = [];
  }

  private startFestival() {
    const st = this.state;
    const dinh = this.buildings.find((b) => b.id === 'dinh' && b.built)!;
    this.sfx('drum', dinh.px, dinh.py);
    st.log('🥁 Hội làng mở ở đình — cả làng nghỉ tay đi trẩy hội', { x: dinh.px, y: dinh.py });
    for (const v of this.villagers) v.addMood(5);
    // Dây đèn lồng hai bên sân đình.
    for (let i = 0; i < 10; i++) {
      const side = i < 5 ? -1 : 1;
      const x = dinh.px + side * (44 + (i % 5) * 6);
      const y = dinh.py - 20 + (i % 5) * 14;
      const l = this.add.image(x, y, 'lantern').setOrigin(0.5, 0).setDepth(50002);
      const glow = this.add.image(x, y + 10, 'glow').setBlendMode(Phaser.BlendModes.ADD).setTint(0xff5a3a).setScale(0.5).setDepth(50001);
      this.tweens.add({ targets: l, angle: { from: -6, to: 6 }, duration: 900 + i * 60, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tweens.add({ targets: glow, alpha: { from: 0.5, to: 0.9 }, duration: 700 + i * 50, yoyo: true, repeat: -1 });
      this.lanterns.push(l, glow);
    }
    this.festivalDrum = 0;
  }

  private festivalDrum = 0;

  private endFestival() {
    for (const l of this.lanterns) l.destroy();
    this.lanterns = [];
    this.addPhuc(15);
    this.state.log('🎆 Hội làng tan, ai nấy ra về vui vẻ — Thành Hoàng được thêm Phúc');
  }

  // ------------------------------------------------------------ điều khiển

  private setupInput() {
    const cam = this.cameras.main;
    this.input.mouse?.disableContextMenu();
    this.keys = this.input.keyboard!.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT') as Record<string, Phaser.Input.Keyboard.Key>;

    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.downOnCanvas = true;
      this.dragging = false;
      this.downPos = { x: p.x, y: p.y };
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (!p.isDown || !this.downOnCanvas) return;
      if (!this.dragging && Phaser.Math.Distance.Between(p.x, p.y, this.downPos.x, this.downPos.y) > 6) this.dragging = true;
      if (this.dragging) {
        this.releaseFollow();
        cam.scrollX -= (p.x - p.prevPosition.x) / cam.zoom;
        cam.scrollY -= (p.y - p.prevPosition.y) / cam.zoom;
      }
    });
    this.input.on('pointerup', (p: Phaser.Input.Pointer) => {
      if (!this.downOnCanvas) return;
      this.downOnCanvas = false;
      if (this.dragging) {
        this.dragging = false;
        return;
      }
      if (p.rightButtonReleased()) {
        if (this.powerMode) this.cancelPower();
        else if (this.buildMode) this.cancelBuild();
        else this.select(null);
        return;
      }
      if (this.powerMode) {
        this.castPower(this.powerMode, p.worldX, p.worldY);
        return;
      }
      if (this.buildMode) {
        this.tryPlace(!!(p.event as MouseEvent).shiftKey, p.worldX, p.worldY);
        return;
      }
      this.select(this.villagerAt(p.worldX, p.worldY));
    });
    this.input.on('wheel', (p: Phaser.Input.Pointer, _o: unknown, _dx: number, dy: number) => {
      const before = cam.getWorldPoint(p.x, p.y);
      cam.setZoom(Phaser.Math.Clamp(cam.zoom * (dy > 0 ? 0.9 : 1.1), 0.6, 2.4));
      cam.preRender();
      const after = cam.getWorldPoint(p.x, p.y);
      cam.scrollX += before.x - after.x;
      cam.scrollY += before.y - after.y;
    });

    const kb = this.input.keyboard!;
    kb.on('keydown-SPACE', () => this.state.togglePause());
    kb.on('keydown-ONE', () => this.state.setSpeed(1));
    kb.on('keydown-TWO', () => this.state.setSpeed(2));
    kb.on('keydown-THREE', () => this.state.setSpeed(3));
    kb.on('keydown-FOUR', () => this.state.setSpeed(5));
    kb.on('keydown-ESC', () => {
      if (this.powerMode) this.cancelPower();
      else if (this.buildMode) this.cancelBuild();
      else this.select(null);
    });
    kb.on('keydown-M', () => this.toggleMute());
  }

  private panKeys(dt: number) {
    const cam = this.cameras.main;
    const k = this.keys;
    const sp = (600 * dt) / cam.zoom;
    if ([k.A, k.D, k.W, k.S, k.LEFT, k.RIGHT, k.UP, k.DOWN].some((key) => key.isDown)) this.releaseFollow();
    if (k.A.isDown || k.LEFT.isDown) cam.scrollX -= sp;
    if (k.D.isDown || k.RIGHT.isDown) cam.scrollX += sp;
    if (k.W.isDown || k.UP.isDown) cam.scrollY -= sp;
    if (k.S.isDown || k.DOWN.isDown) cam.scrollY += sp;
  }

  // ------------------------------------------------------------ vòng lặp

  update(_time: number, deltaMs: number) {
    const realDt = Math.min(deltaMs, 100) / 1000;
    this.realTime += realDt;
    const dt = realDt * this.state.speed;
    this.panKeys(realDt);

    // Chạy nhanh thì chia nhỏ bước mô phỏng cho chuyển động không bị giật.
    const steps = Math.max(1, Math.ceil(dt / 0.12));
    for (let i = 0; i < steps && dt > 0; i++) this.simulate(dt / steps);

    this.layoutBubbles();
    this.updateLighting();
    this.updateRain(realDt);
    this.updateGhost();

    if (this.ambience && this.music) {
      this.soundTimer += realDt;
      if (this.soundTimer > 0.25) {
        this.soundTimer = 0;
        this.updateProximity();
      }
      this.ambience.update(realDt, { hour: this.state.hour, night: this.night, rain: this.rainLevel, ...this.prox });
      this.music.setNight(this.night);
    }

    this.hudTimer += realDt;
    if (this.hudTimer > 0.2) {
      this.hudTimer = 0;
      this.hud.update();
    }
  }

  private simulate(dt: number) {
    const st = this.state;
    {
      st.time += dt;
      const day = st.dayAt(st.time);
      if (day !== this.lastDay) {
        this.lastDay = day;
        this.newDay();
      }
      if (this.migrantAt && st.time >= this.migrantAt) {
        this.migrantAt = 0;
        this.migrants();
      }
      for (const v of this.villagers) v.update(dt);
      for (const a of this.animals) a.update(dt);
      this.animals = this.animals.filter((a) => a.alive);
      // Mưa xuống, cây cối mọc nhanh gấp 6.
      const grow = st.raining ? dt * 6 : dt;
      for (const n of this.nodes) n.update(grow);

      if (st.raining !== this.wasRaining) {
        this.wasRaining = st.raining;
        if (st.raining) {
          for (const v of this.villagers) v.onRain();
          if (st.drought) {
            st.drought = false;
            st.log('🌧️ Mưa xuống rồi, hết hạn hán! Ruộng đồng lại xanh tươi');
          }
        } else st.log('🌤️ Trời tạnh mưa, cây cối xanh mướt');
      }
      this.simulateWorld(dt);
      if (this.festivalWas && (this.festivalDrum -= dt) <= 0) {
        this.festivalDrum = 6;
        const dinh = this.buildings.find((b) => b.id === 'dinh' && b.built);
        if (dinh) this.sfx('drum', dinh.px, dinh.py, 0.6);
      }
      if (!st.fishBoost && this.ripples[0]?.tintTopLeft !== 0xffffff) for (const r of this.ripples) r.clearTint();

      // Dân làng vui vẻ thì Thành Hoàng cũng thêm Phúc.
      for (const v of this.villagers) if (v.mood > 50) st.addPhuc(((v.mood - 50) / 50) * 0.03 * dt);

      this.respawnTimer += dt;
      if (this.respawnTimer > DAY_LENGTH / 5) {
        this.respawnTimer = 0;
        if (this.animals.length < 9) this.spawnAnimal(Math.random() < 0.6 ? 'ga' : 'heo');
      }

      this.planTimer += dt;
      if (this.planTimer > 8) {
        this.planTimer = 0;
        this.plan();
      }
    }
  }

  /** Xếp bong bóng suy nghĩ: cái nào chồng lên cái khác thì đẩy lên trên. */
  private layoutBubbles() {
    const placed: { x: number; y: number; w: number; h: number }[] = [];
    const boxes = this.villagers
      .map((v) => ({ v, b: v.bubbleBox() }))
      .filter((e) => e.b)
      .sort((a, b) => b.b!.y - a.b!.y);
    for (const { v, b } of boxes) {
      const box = b!;
      for (let guard = 0; guard < placed.length; guard++) {
        const hit = placed.find(
          (p) => Math.abs(p.x - box.x) < (p.w + box.w) / 2 && box.y > p.y - p.h - 2 && box.y - box.h < p.y + 2,
        );
        if (!hit) break;
        box.y = hit.y - hit.h - 4;
      }
      v.placeBubble(box.x, box.y);
      placed.push(box);
    }
  }

  /** Vẽ mưa trong khung nhìn camera; nét mưa giữ cùng kích thước dù phóng to hay thu nhỏ. */
  private updateRain(realDt: number) {
    const target = this.state.raining ? 1 : 0;
    this.rainLevel += Phaser.Math.Clamp(target - this.rainLevel, -realDt * 0.5, realDt * 0.5);
    const g = this.rainGfx;
    g.clear();
    this.rainShade.setAlpha(this.rainLevel * 0.22);
    if (this.rainLevel < 0.01) return;
    const cam = this.cameras.main;
    const v = cam.worldView;
    const z = cam.zoom;
    const n = Math.floor(this.drops.length * this.rainLevel);
    g.lineStyle(1.2 / z, 0xcfe3f5, 0.55);
    for (let i = 0; i < n; i++) {
      const d = this.drops[i];
      if (this.state.speed > 0) {
        d.v += realDt * d.speed;
        d.u -= realDt * d.speed * 0.12;
        if (d.v > 1) d.v -= 1;
        if (d.u < 0) d.u += 1;
      }
      const x = v.x + d.u * v.width;
      const y = v.y + d.v * v.height;
      g.lineBetween(x, y, x - (d.len * 0.25) / z, y + d.len / z);
    }
  }

  private updateLighting() {
    const h = this.state.hour;
    const dark = darknessAt(h);
    const night = dark / MAX_DARK;
    this.night = night;
    this.darkness.setAlpha(dark);
    this.warmth.setAlpha(warmthAt(h));
    for (const b of this.buildings) b.updateLight(night, this.realTime);
    for (const f of this.fireflies) {
      const blink = 0.5 + 0.5 * Math.sin(this.realTime * f.speed + f.phase);
      f.img.setAlpha(Math.max(0, night - 0.3) * 1.4 * blink);
    }
  }
}
