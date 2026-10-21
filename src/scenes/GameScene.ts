import Phaser from 'phaser';
import { Ambience } from '../audio/Ambience';
import { AudioEngine, loadAudioSettings, saveAudioSettings } from '../audio/AudioEngine';
import { Music } from '../audio/Music';
import type { SfxId } from '../audio/sfx';
import { DAY_LENGTH, FONT, MAP_H, MAP_W, MAX_DARK, TILE } from '../config';
import { BUILDINGS, FOOD_ORDER, JOBS, RESOURCES, type BuildingId, type JobId, type ResKey } from '../data';
import { Animal, type AnimalKind } from '../entities/Animal';
import { Building } from '../entities/Building';
import { ResourceNode } from '../entities/ResourceNode';
import { Villager, type VillagerDef } from '../entities/Villager';
import { QUESTS } from '../quests';
import { GameState } from '../state';
import { rollTraits, type TraitId } from '../traits';
import { Hud } from '../ui/Hud';
import { generateMap, type NodeKind } from '../world/mapgen';
import { findPath, type Pt } from '../world/pathfinding';
import { createTextures, drawGround } from '../world/textures';
import { World } from '../world/World';

export interface FishingSpot {
  x: number;
  y: number;
  wx: number;
  wy: number;
  reservedBy: Villager | null;
}

/** Mỗi người có một nét tính cách cố định, thêm một nét ngẫu nhiên mỗi ván. */
const FAMILY: (Omit<VillagerDef, 'traits'> & { traits: TraitId[] })[] = [
  {
    id: 'bo',
    name: 'Bố Tám',
    role: 'Trụ cột gia đình',
    avatar: '👨🏻',
    tex: 'v_bo',
    skills: { chat: 2, san: 1, xay: 1 },
    traits: ['khoeManh'],
  },
  {
    id: 'me',
    name: 'Mẹ Lan',
    role: 'Người nội trợ đảm đang',
    avatar: '👩🏻',
    tex: 'v_me',
    skills: { nau: 2, hai: 1, ca: 1 },
    traits: ['kheoTay'],
  },
  {
    id: 'con',
    name: 'Bé Na',
    role: 'Cô bé ham học — học nghề nhanh x1.5',
    avatar: '👧🏻',
    tex: 'v_con',
    skills: { hai: 1 },
    traits: ['toMo'],
    child: true,
  },
];

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
  questDone = new Set<string>();
  hud!: Hud;
  audioSettings = loadAudioSettings();
  audio: AudioEngine | null = null;

  private music?: Music;
  private ambience?: Ambience;
  private night = 0;
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
  private questTimer = 0;
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
    this.placeBuilding('nha', v.x - 1, v.y - 2, true);
    FAMILY.forEach((d, i) => {
      const def: VillagerDef = { ...d, traits: rollTraits(d.traits, 1) };
      this.villagers.push(new Villager(this, def, v.x - 1 + i, v.y + 1));
    });
    for (let i = 0; i < 7; i++) this.spawnAnimal(i < 4 ? 'ga' : 'heo');

    this.darkness = this.add.rectangle(0, 0, MAP_W * TILE, MAP_H * TILE, 0x0c1a48).setOrigin(0).setAlpha(0).setDepth(50000);
    this.warmth = this.add.rectangle(0, 0, MAP_W * TILE, MAP_H * TILE, 0xff8a3d).setOrigin(0).setAlpha(0).setDepth(50000);
    this.createFireflies();
    this.ghostGfx = this.add.graphics().setDepth(49000);

    const cam = this.cameras.main;
    cam.setBounds(0, 0, MAP_W * TILE, MAP_H * TILE);
    cam.setZoom(1.4);
    cam.centerOn(v.x * TILE, v.y * TILE);
    this.setupInput();

    this.hud = new Hud(this);
    this.state.log('Gia đình nhỏ vừa về lập nghiệp bên bờ sông 🌾');
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
    return this.nearest(this.buildings.filter((b) => !b.built), x, y, this.bPos);
  }
  findNode(kinds: NodeKind[], x: number, y: number) {
    return this.nearest(
      this.nodes.filter((n) => n.grown && !n.reservedBy && kinds.includes(n.kind)),
      x,
      y,
      (n) => ({ x: n.x, y: n.y }),
    );
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

  placeBuilding(id: BuildingId, tx: number, ty: number, built: boolean) {
    const b = new Building(this, id, tx, ty, built);
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
    this.state.log(`Đã xây xong ${b.def.name}! ${b.def.icon}`);
    this.sfx('built');
    this.floatText(b.px, b.py - b.sprite.height, `${b.def.name} hoàn thành!`, '#ffe27a');
  }

  startBuild(id: BuildingId) {
    this.cancelBuild();
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
    if (!this.buildMode || !this.ghost) return;
    const def = BUILDINGS[this.buildMode];
    const p = this.input.activePointer;
    const wp = this.cameras.main.getWorldPoint(p.x, p.y);
    const tx = Math.round(wp.x / TILE - def.w / 2);
    const ty = Math.round(wp.y / TILE - def.h / 2);
    this.ghostTile = { x: tx, y: ty };
    const ok = this.canPlace(this.buildMode, tx, ty) && this.state.canAfford(def.cost);
    this.ghost.setPosition((tx + def.w / 2) * TILE, (ty + def.h) * TILE + def.oy).setTint(ok ? 0xc8ffc0 : 0xff9a8a);
    const g = this.ghostGfx;
    g.clear();
    g.fillStyle(ok ? 0x7dff8a : 0xff5a4a, 0.25).fillRect(tx * TILE, ty * TILE, def.w * TILE, def.h * TILE);
    g.lineStyle(2, ok ? 0x7dff8a : 0xff5a4a, 0.8).strokeRect(tx * TILE, ty * TILE, def.w * TILE, def.h * TILE);
    const ex = tx + Math.floor(def.w / 2);
    g.lineStyle(1.5, 0xffffff, 0.6).strokeRect(ex * TILE + 6, (ty + def.h) * TILE + 6, TILE - 12, TILE - 12);
  }

  private tryPlace(shift: boolean) {
    const id = this.buildMode;
    if (!id) return;
    const def = BUILDINGS[id];
    const { x, y } = this.ghostTile;
    if (!this.state.canAfford(def.cost)) {
      this.state.log(`Chưa đủ gỗ để xây ${def.name} (cần ${def.cost.go} 🪵)`);
      return;
    }
    if (!this.canPlace(id, x, y)) {
      this.state.log('Chỗ này không xây được — cần đất trống, không có cây');
      return;
    }
    this.state.pay(def.cost);
    this.placeBuilding(id, x, y, false);
    this.sfx('place');
    this.state.log(`Đã đặt móng ${def.name} ${def.icon} — dân làng sẽ tự lo xây`);
    if (!shift || !this.state.canAfford(def.cost)) this.cancelBuild();
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

  /** Người chơi tự di chuyển camera thì ngừng bám theo (vẫn giữ người đang chọn). */
  private releaseFollow() {
    this.cameras.main.stopFollow();
  }

  /** Thành Hoàng báo mộng gợi ý một việc — người đó có thể nghe hoặc không. */
  dream(v: Villager, job: JobId) {
    const r = v.receiveDream(job);
    if (r === 'cooldown') return;
    const verb = JOBS[job].name.toLowerCase();
    this.sfx(r === 'accepted' ? 'levelUp' : 'click');
    this.state.log(r === 'accepted' ? `💭 ${v.name} nghe lời báo mộng, đi ${verb}` : `💭 ${v.name} không nghe lời báo mộng (${verb})`);
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
    const raw = r.thit + r.ca;
    const rawFull = raw >= 8 ? 0.4 : 1;
    const any = (kinds: NodeKind[]) => this.nodes.some((n) => n.grown && !n.reservedBy && kinds.includes(n.kind));

    const need: Record<JobId, number> = {
      nghi: 0,
      hai: any(['banana']) ? 0.15 + hungry * 0.85 : -1,
      ca: (0.1 + hungry * (fire ? 0.8 : 0.35)) * rawFull,
      san: this.animals.some((a) => a.alive && !a.reservedBy) ? (0.1 + hungry * (fire ? 0.8 : 0.3)) * rawFull : -1,
      nau: fire && raw > 0 ? Math.max(Math.min(1, 0.35 + raw * 0.12), hungry) : -1,
      chat: any(['tree', 'bamboo']) ? Phaser.Math.Clamp(0.15 + (1 - r.go / 40) * 0.7, 0.1, 0.85) : -1,
      xay: this.buildings.some((b) => !b.built) ? 0.9 : -1,
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

  /** Uy tín: tổng tay nghề của người lớn. */
  private respect(v: Villager) {
    return Object.values(v.skills).reduce((a, k) => a + k.level, 0);
  }

  /** Trưởng làng hiện tại — chỉ đổi khi có người uy tín hơn hẳn (xem `electChief`). */
  chief(): Villager | null {
    if (!this.chiefV) {
      const adults = this.villagers.filter((v) => !v.def.child);
      this.chiefV = adults.sort((a, b) => this.respect(b) - this.respect(a))[0] ?? null;
    }
    return this.chiefV;
  }

  private electChief() {
    const cur = this.chief();
    if (!cur) return;
    const rival = this.villagers
      .filter((v) => !v.def.child && v !== cur)
      .sort((a, b) => this.respect(b) - this.respect(a))[0];
    if (!rival || this.respect(rival) < this.respect(cur) + 3) return;
    this.chiefV = rival;
    rival.addMood(10);
    rival.say('Được cả làng tin tưởng, mình sẽ cố gắng!');
    rival.note('👑 Được cả làng bầu làm trưởng làng');
    this.state.log(`👑 Cả làng bầu ${rival.name} làm trưởng làng mới`);
  }

  /** Ô trống để đứng/ngồi: đất liền, không có công trình. */
  isFree(x: number, y: number) {
    return this.world.isLand(x, y) && !this.occupied.has(y * MAP_W + x);
  }

  /** Trưởng làng tự quyết định dựng công trình mới khi làng cần và đủ gỗ. */
  private plan() {
    this.electChief();
    const chief = this.chief();
    if (!chief || chief.asleep || this.buildings.some((b) => !b.built)) return;
    const go = this.state.res.go;
    const count = (id: BuildingId) => this.buildings.filter((b) => b.id === id).length;
    let id: BuildingId | null = null;
    let why = '';
    if (!count('lua') && go >= 8) {
      id = 'lua';
      why = 'Phải có đống lửa để nướng thịt, tối còn sưởi ấm';
    } else if (!count('kho') && go >= 26) {
      id = 'kho';
      why = 'Gỗ nhiều rồi, dựng cái kho gần chỗ làm cho tiện';
    } else if (count('nha') < 2 && go >= 45) {
      id = 'nha';
      why = 'Dựng thêm gian nhà cho cả nhà rộng rãi';
    }
    if (!id) return;

    const h = this.homeTile;
    let target: Pt = h;
    if (id === 'kho' && this.workSpots.length) {
      const cx = this.workSpots.reduce((s, p) => s + p.x, 0) / this.workSpots.length;
      const cy = this.workSpots.reduce((s, p) => s + p.y, 0) / this.workSpots.length;
      target = { x: Math.round(h.x + (cx - h.x) * 0.5), y: Math.round(h.y + (cy - h.y) * 0.5) };
    }
    const spot = this.findBuildSpot(id, target, id === 'kho' ? 0 : 2);
    if (!spot) return;
    const def = BUILDINGS[id];
    this.state.pay(def.cost);
    this.placeBuilding(id, spot.x, spot.y, false);
    this.sfx('place', (spot.x + def.w / 2) * TILE, (spot.y + def.h) * TILE);
    chief.say(why);
    chief.note(`🏛️ Quyết định dựng ${def.name}: ${why}`);
    this.state.log(`🏛️ Trưởng làng ${chief.name} quyết định dựng ${def.name} ${def.icon}`);
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
        if (this.buildMode) this.cancelBuild();
        else this.select(null);
        return;
      }
      if (this.buildMode) {
        this.tryPlace(!!(p.event as MouseEvent).shiftKey);
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
    kb.on('keydown-ESC', () => (this.buildMode ? this.cancelBuild() : this.select(null)));
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

    if (dt > 0) {
      this.state.time += dt;
      for (const v of this.villagers) v.update(dt);
      for (const a of this.animals) a.update(dt);
      this.animals = this.animals.filter((a) => a.alive);
      for (const n of this.nodes) n.update(dt);

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

      this.questTimer += dt;
      if (this.questTimer > 1) {
        this.questTimer = 0;
        for (const q of QUESTS) {
          if (!this.questDone.has(q.id) && q.check(this)) {
            this.questDone.add(q.id);
            this.state.log(`✅ Hoàn thành mục tiêu: ${q.text}`);
            this.sfx('quest');
          }
        }
      }
    }

    this.updateLighting();
    this.updateGhost();

    if (this.ambience && this.music) {
      this.soundTimer += realDt;
      if (this.soundTimer > 0.25) {
        this.soundTimer = 0;
        this.updateProximity();
      }
      this.ambience.update(realDt, { hour: this.state.hour, night: this.night, ...this.prox });
      this.music.setNight(this.night);
    }

    this.hudTimer += realDt;
    if (this.hudTimer > 0.2) {
      this.hudTimer = 0;
      this.hud.update();
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
