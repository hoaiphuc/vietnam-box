import Phaser from 'phaser';
import type { SfxId } from '../audio/sfx';
import { DAY_LENGTH, ENERGY_DRAIN, FONT, HUNGER_RATE, SLEEP_RATE, TILE, YEAR_LENGTH } from '../config';
import { ACT_ORDER, JOBS, RESOURCES, SKILL_JOBS, type JobId, type ResKey } from '../data';
import { canDo, CHILD_AFF, ELDER_AFF, stageOf, type Gender, type Palette, type Stage } from '../life';
import { WISHES, type WishType } from '../powers';
import type { SavedVillager } from '../save';
import type { FishingSpot, GameScene, OAnQuanBoard } from '../scenes/GameScene';
import { TRAITS, type TraitId } from '../traits';
import type { NodeKind } from '../world/mapgen';
import type { Pt } from '../world/pathfinding';
import { personTexture } from '../world/textures';
import type { Buffalo } from './Buffalo';
import type { Building } from './Building';

/** Hành vi: mỗi `yield` là một khung hình, giá trị nhận lại là dt (giây game). */
type Beh = Generator<undefined, void, number>;
type Step = Generator<undefined, boolean, number>;

export interface Skill {
  level: number;
  xp: number;
}

export interface VillagerDef {
  id: string;
  /** Tên riêng; tên gọi (Bé / Anh / Chị / Bố / Mẹ / Ông / Bà) đổi theo tuổi. */
  given: string;
  gender: Gender;
  /** Thời điểm sinh (giây game, có thể âm với người sinh trước khi lập làng). */
  birthTime: number;
  palette: Palette;
  skills: Partial<Record<JobId, number>>;
  traits: TraitId[];
}

export interface Memory {
  id: string;
  icon: string;
  text: string;
  until: number;
  /** Ảnh hưởng tới mức thích từng việc khi còn nhớ. */
  bias?: Partial<Record<JobId, number>>;
}

export interface JournalEntry {
  time: number;
  text: string;
}

/** Một lựa chọn đã cân nhắc, kèm điểm và lý do. */
export interface Option {
  job: JobId;
  score: number;
  reason: string;
}

export const MAX_LEVEL = 10;
export const xpNeed = (lv: number) => 12 + lv * 10;

const NEED_LINES: Record<JobId, string> = {
  chat: 'Làng thiếu gỗ với tre quá, phải đi chặt',
  san: 'Cả nhà cần thịt, vào rừng săn thôi',
  ca: 'Kho sắp hết đồ ăn, ra sông kiếm con cá',
  hai: 'Sắp hết cái ăn rồi, đi hái chuối',
  cay: 'Lúa chín vàng đồng rồi, ra gặt kẻo rụng',
  nung: 'Làng cần thêm gạch ngói, chum vại — nhóm lò thôi',
  dan: 'Nhà thiếu rổ rá, nón lá rồi, ngồi đan thôi',
  nau: 'Thịt cá sống còn nhiều, đem nướng kẻo hỏng',
  xay: 'Phải dựng cho xong công trình đã',
  nghi: 'Mệt quá, phải nghỉ một lát',
  le: 'Lâu rồi chưa thắp hương cho ông Thành Hoàng',
};
const LIKE_LINES: Record<JobId, string> = {
  chat: 'Vung rìu đốn cây thấy khoẻ cả người!',
  san: 'Đi săn mới thấy hào hứng!',
  ca: 'Ngồi câu cá là vui nhất đời',
  hai: 'Đi hái lượm, ngắm cây cỏ thích ghê',
  cay: 'Ra đồng lội ruộng, thơm mùi lúa non',
  nung: 'Nặn đất sét thành chum thành vại, vui tay ghê',
  dan: 'Ngồi vót nan đan rổ, thong thả mà khéo tay',
  nau: 'Nướng đồ ăn cho cả nhà là vui nhất',
  xay: 'Thích tự tay dựng nhà dựng cửa',
  nghi: 'Thong thả chút cho đời thêm vui',
  le: 'Ra miếu thắp nén hương cho lòng thanh thản',
};
const CASUAL_LINES: Record<JobId, string> = {
  chat: 'Đi chặt thêm ít gỗ, ít tre để dành',
  san: 'Thử vào rừng xem có con gì không',
  ca: 'Ra sông thả câu chơi',
  hai: 'Đi xem chuối chín chưa',
  cay: 'Ra thăm đồng một chút',
  nung: 'Nung thêm một mẻ ở lò',
  dan: 'Đan thêm cái rổ, cái nón để dành',
  nau: 'Nướng thêm ít đồ ăn',
  xay: 'Phụ một tay xây dựng',
  nghi: 'Hôm nay thong thả một chút',
  le: 'Ghé miếu thắp nén hương',
};
/** Mỗi người cách ít nhất chừng này (ms thực) mới nói thành tiếng một suy nghĩ thường ngày. */
const CHATTER_GAP = 20000;
/** Số bong bóng suy nghĩ thường ngày tối đa trên màn hình cùng lúc. */
const MAX_CHATTER = 2;

const PRAY_LINES = ['Cầu cho cả nhà bình an', 'Tạ ơn ông Thành Hoàng phù hộ', 'Cầu cho mưa thuận gió hoà'];
const RAIN_LINES = ['Mưa rồi! Mát quá', 'Trời mưa, cây cối chắc tốt lắm', 'Ông Thành Hoàng cho mưa kìa!', 'Mưa rào đầu mùa đây'];
const CHAT_LINES = [
  'Hôm nay trời đẹp ghê',
  'Cá dưới sông dạo này nhiều lắm',
  'Mai đi hái chuối với nhau nhé',
  'Nghe nói trong rừng có heo rừng to lắm',
  'Gió bờ tre mát thật',
  'Năm nay chắc được mùa',
  'Kể chuyện ngày xưa đi!',
  'Ăn no rồi, đời thật dễ chịu',
];
const SWEET_LINES = ['Tối nay trăng đẹp quá...', 'Ngồi cạnh bạn thấy vui ghê', 'Mai mình đi hái chuối chung nhé?', 'Bạn hát hay thật đấy'];
const RELAX_LINES = ['Ngồi hóng gió bờ tre 🎋', 'Ngắm mây trôi ☁️', 'Ngân nga câu hò 🎶', 'Pha ấm trà ☕', 'Ngồi đan rổ 🧺'];
const CHILD_LINES = ['Thả diều 🪁', 'Đuổi bắt chuồn chuồn', 'Nhảy dây', 'Hái hoa ven đường 🌼'];
const BABY_LINES = ['Bập bẹ nói theo 👶', 'Bò quanh sân', 'Ngủ ngon trong nôi', 'Cười khanh khách'];
const ELDER_LINES = ['Ngồi kể chuyện ngày xưa', 'Nhâm nhi chén trà ☕', 'Ngắm con cháu chơi đùa', 'Ngồi têm trầu 🍃'];
const FESTIVAL_LINES = ['Hát quan họ 🎶', 'Đánh đu ngày hội', 'Xem kéo co 💪', 'Đánh trống hội 🥁', 'Thả đèn lồng 🏮', 'Xem múa lân 🦁'];
const FESTIVAL_CHAT = ['Hội năm nay vui quá!', 'Trống hội rộn ràng ghê', 'Đèn lồng đẹp thật', 'Mong năm nào cũng được mùa thế này'];
const MOON_LINES = ['Ngắm trăng rằm 🌕', 'Bày mâm cỗ trông trăng 🥮', 'Pha ấm trà ngắm trăng ☕', 'Xem múa lân 🦁', 'Cắt bánh nướng chia cả nhà 🥮'];
const ELDER_MOON_LINES = ['Kể chuyện chú Cuội cung trăng 🌕', 'Kể sự tích chị Hằng', 'Nhâm nhi trà, ngắm con cháu rước đèn ☕'];
const MOON_CHAT = ['Trăng rằm năm nay tròn quá!', 'Bánh nướng thơm ghê', 'Kìa, chú Cuội ngồi gốc cây đa', 'Lân múa đẹp thật', 'Trăng sáng thế này, sang năm được mùa'];
const PARADE_CHAT = ['Tết Trung thu rước đèn đi chơi 🎶', 'Đèn ông sao của tớ đẹp chưa!', 'Tùng dinh dinh, cắc tùng dinh! 🥁', 'Đi phá cỗ thôi các bạn ơi!', 'Em rước đèn này đến cung trăng 🌕'];
const HERD_LINES = ['Đi chăn trâu thôi nghé ơi 🐃', 'Ngồi lưng trâu cao ghê!', 'Trâu ơi ta bảo trâu này…', 'Ra bãi cỏ ven sông nào!'];
const KITE_LINES =['Thả diều 🪁', 'Diều lên cao vút rồi! 🪁', 'Giật dây cho diều bay cao 🪁', 'Ngửa cổ ngắm diều 🪁'];
const OAQ_LINES = ['Ăn quan rồi nhé!', 'Đến lượt tớ rải!', 'Ô này còn năm quân', 'Tớ sắp thắng rồi!', 'Hết quân rồi, rải lại thôi'];
const HAMMOCK_LINES =['Nằm võng hóng gió đêm 🌙', 'Đung đưa võng nghe dế kêu', 'Nằm võng ngắm sao trời ✨', 'Đưa võng ầu ơ một mình'];
const NIGHT_LINES = ['Đêm nay gió mát ghê…', 'Dế kêu rả rích', 'Cả xóm ngủ hết rồi', 'Sao trời nhiều quá', 'À ơi… ví dầu cầu ván đóng đinh'];
const TET_LINES = ['Canh nồi bánh chưng 🔥', 'Gói bánh chưng lá dong', 'Bày mâm ngũ quả 🍊', 'Đi chúc Tết hàng xóm', 'Thắp nén hương ông bà ngày Tết'];
const ELDER_TET_LINES = ['Viết câu đối đỏ 🧧', 'Mừng tuổi con cháu 🧧', 'Kể chuyện Tết ngày xưa', 'Nhâm nhi chén trà ngày Tết ☕'];
const KID_TET_LINES = ['Được mừng tuổi 🧧', 'Mặc áo mới đi chơi Tết', 'Ngồi canh nồi bánh chưng', 'Ngóng xem pháo hoa 🎆'];
const TET_CHAT = ['Chúc mừng năm mới!', 'An khang thịnh vượng nhé!', 'Bánh chưng sắp chín rồi', 'Năm mới vạn sự như ý', 'Sang năm làng mình được mùa to'];
const MARKET_LINES =['Đi chợ phiên 🏮', 'Mặc cả mớ rau', 'Ngắm hàng làng bên', 'Mua cho con cái kẹo'];
const MARKET_CHAT = ['Chum này đẹp ghê!', 'Bớt chút đi bà ơi', 'Hàng làng bên lạ quá', 'Phiên chợ hôm nay đông thật'];

const clamp = (v: number, a: number, b: number) => Math.max(a, Math.min(b, v));

export class Villager {
  x: number;
  y: number;
  hunger = 80;
  energy = 90;
  mood = 70;
  /** Việc đang làm — do họ tự chọn. */
  activity: JobId = 'nghi';
  skills = {} as Record<JobId, Skill>;
  status = 'Đang nghĩ xem làm gì';
  carry: { res: ResKey; amount: number } | null = null;
  asleep = false;
  inside = false;
  readonly traits: TraitId[];
  memories: Memory[] = [];
  journal: JournalEntry[] = [];
  thought = '';
  intent: { job: JobId; until: number } | null = null;
  dreamReadyAt = 0;
  options: Option[] = [];
  /** Lời cầu khấn đang chờ Thành Hoàng đáp ứng. */
  wish: { type: WishType; text: string; until: number } | null = null;

  // Gia đình và tình cảm
  spouse: Villager | null = null;
  parents: Villager[] = [];
  children: Villager[] = [];
  /** Nhà đang ở; null thì ngủ nhờ nhà gần nhất. */
  home: Building | null = null;
  /** Mới cưới hoặc mới đến, đang chờ làng dựng nhà riêng. */
  needsHome = false;
  /** Mức thân thiết với từng người, 0..100. */
  bonds = new Map<Villager, number>();
  alive = true;
  deathTime = 0;
  /** Đang cầm đèn ông sao (rước đèn Trung thu) hay bó đuốc (đi bắt ếch đêm). */
  light: 'star' | 'torch' | null = null;
  /** Đang thả diều — scene vẽ con diều bay theo. */
  toy: 'kite' | null = null;
  /** Đang ngồi trên lưng trâu đi chăn. */
  mount: Buffalo | null = null;
  /** Đang ngủ trưa dưới bóng cây. */
  dozing = false;

  private lastPray = -DAY_LENGTH;
  /** Giờ đi ngủ của cú đêm (22:30–24:00); người thường ngủ lúc 21 giờ. */
  private owlBedtime = 22.5 + Math.random() * 1.5;
  /** Đang nằm võng. */
  private lounging = false;
  /** Trẻ con đang nhảy dây / ngồi chơi ô ăn quan. */
  private jumping = false;
  private playing = false;
  /** Tháng gần nhất đã tính chuyện ngủ trưa (mỗi tháng tính một lần). */
  private napChecked = 0;
  private stageKey: Stage | '' = '';

  private prefs = {} as Record<JobId, number>;
  private mode = '';
  /** Thời gian ngồi không liên tục — càng lâu càng chán, muốn đi làm. */
  private idleTime = 0;
  private holding: string | null = null;
  private progress: number | null = null;
  private fishSpot: FishingSpot | null = null;
  private beh: Beh | null = null;
  private moving = false;
  private working = false;
  private relaxing = false;
  private byFire = false;
  private phase = 0;
  private ox = Phaser.Math.Between(-5, 5);
  private oy = Phaser.Math.Between(-4, 4);

  private container: Phaser.GameObjects.Container;
  private body: Phaser.GameObjects.Image;
  private shadow: Phaser.GameObjects.Image;
  private label: Phaser.GameObjects.Text;
  private ring: Phaser.GameObjects.Image;
  private icon: Phaser.GameObjects.Text;
  private gfx: Phaser.GameObjects.Graphics;
  private bubble: Phaser.GameObjects.Container;
  private bubbleBg: Phaser.GameObjects.Graphics;
  private bubbleText: Phaser.GameObjects.Text;
  private bubbleUntil = 0;
  /** Lần cuối nói thành tiếng một suy nghĩ thường ngày (ms thực). */
  private lastChatter = -Infinity;

  constructor(
    private scene: GameScene,
    readonly def: VillagerDef,
    tx: number,
    ty: number,
  ) {
    this.x = tx * TILE + TILE / 2;
    this.y = ty * TILE + TILE / 2;
    this.traits = def.traits;
    for (const j of SKILL_JOBS) this.skills[j] = { level: def.skills[j] ?? 0, xp: 0 };
    this.skills.nghi = { level: 0, xp: 0 };
    this.skills.le = { level: 0, xp: 0 };
    for (const j of ACT_ORDER) this.prefs[j] = (Math.random() - 0.5) * 0.2;

    this.ring = scene.add.image(0, 0, 'ring').setVisible(false);
    this.shadow = scene.add.image(0, 0, 'shadow');
    this.body = scene.add.image(0, 2, 'shadow').setOrigin(0.5, 1);
    this.label = scene.add
      .text(0, 8, '', {
        fontFamily: FONT,
        fontSize: '10px',
        fontStyle: '600',
        color: '#fffbe8',
        stroke: '#3a2a1a',
        strokeThickness: 3,
        resolution: 2,
      })
      .setOrigin(0.5, 0);
    this.icon = scene.add.text(0, -50, '', { fontSize: '14px', resolution: 2 }).setOrigin(0.5, 1);
    this.gfx = scene.add.graphics();
    this.container = scene.add.container(this.x, this.y, [this.ring, this.shadow, this.gfx, this.body, this.label, this.icon]);

    this.bubbleBg = scene.add.graphics();
    this.bubbleText = scene.add
      .text(0, -5, '', {
        fontFamily: FONT,
        fontSize: '11px',
        fontStyle: '500',
        color: '#4a3424',
        align: 'center',
        wordWrap: { width: 150 },
        resolution: 2,
      })
      .setOrigin(0.5, 1);
    this.bubble = scene.add.container(0, 0, [this.bubbleBg, this.bubbleText]).setDepth(60001).setVisible(false);
    this.refreshLook();
  }

  // ------------------------------------------------------------ tuổi tác, tên gọi, gia đình

  /** Tuổi (12 tháng = 1 năm). Người đã mất thì dừng ở tuổi lúc mất. */
  get age() {
    return ((this.alive ? this.scene.state.time : this.deathTime) - this.def.birthTime) / YEAR_LENGTH;
  }
  get years() {
    return Math.floor(this.age);
  }
  get stage(): Stage {
    return stageOf(this.age);
  }
  get isChild() {
    return this.age < 16;
  }
  get isElder() {
    return this.stage === 'gia';
  }
  get female() {
    return this.def.gender === 'nu';
  }

  /** Tên gọi theo tuổi và vai vế: Bé Na, Chị Na, Mẹ Na, Bà Na... */
  get name() {
    const g = this.def.given;
    switch (this.stage) {
      case 'be':
      case 'tre':
        return `Bé ${g}`;
      case 'gia':
        return `${this.female ? 'Bà' : 'Ông'} ${g}`;
      default:
        if (this.children.length) return `${this.female ? 'Mẹ' : 'Bố'} ${g}`;
        return `${this.female ? 'Chị' : 'Anh'} ${g}`;
    }
  }

  get avatar() {
    switch (this.stage) {
      case 'be':
        return '👶';
      case 'tre':
        return this.female ? '👧🏻' : '👦🏻';
      case 'gia':
        return this.female ? '👵🏻' : '👴🏻';
      default:
        return this.female ? '👩🏻' : '👨🏻';
    }
  }

  /** "34 tuổi · Chồng của Mẹ Lan · 1 con" */
  get role() {
    const parts = [this.alive ? `${this.years} tuổi` : `Hưởng thọ ${this.years} tuổi`];
    if (this.spouse) parts.push(`${this.female ? 'Vợ' : 'Chồng'} của ${this.spouse.name}`);
    else if (this.parents.length) parts.push(`Con của ${this.parents.map((p) => p.name).join(' và ')}`);
    if (this.children.length) parts.push(`${this.children.length} con`);
    return parts.join(' · ');
  }

  bond(o: Villager) {
    return this.bonds.get(o) ?? 0;
  }

  /** Người thân trong nhà: vợ chồng, cha mẹ, con cái, anh chị em, ông bà, cháu. */
  isFamily(o: Villager) {
    if (o === this.spouse || this.parents.includes(o) || this.children.includes(o)) return true;
    if (this.parents.some((p) => o.parents.includes(p))) return true;
    return this.parents.some((p) => p.parents.includes(o)) || o.parents.some((p) => p.parents.includes(this));
  }

  /** Đổi ngoại hình khi bước sang tuổi mới. */
  private refreshLook() {
    const st = this.stage;
    this.stageKey = st;
    const p = this.def.palette;
    const young = st === 'be' || st === 'tre';
    const key = personTexture(this.scene, `p_${this.def.id}_${st}`, {
      shirt: p.shirt,
      shirtDark: p.shirtDark,
      pants: p.pants,
      hat: !young && p.hat,
      hair: st === 'gia' ? '#cfcfcf' : '#1d1a17',
      long: this.female && !young,
      buns: this.female && young,
      cane: st === 'gia',
    });
    const scale = st === 'be' ? 0.55 : st === 'tre' ? 0.8 : 1;
    this.body.setTexture(key).setScale(scale);
    this.shadow.setScale(scale * 0.8);
    this.icon.setY(-50 * scale);
  }

  // ------------------------------------------------------------ lưu ván chơi

  toSave(buildings: Building[]): SavedVillager {
    const home = this.home ? buildings.indexOf(this.home) : -1;
    return {
      def: this.def,
      x: this.x,
      y: this.y,
      hunger: this.hunger,
      energy: this.energy,
      mood: this.mood,
      activity: this.activity,
      skills: this.skills,
      carry: this.carry,
      memories: this.memories,
      journal: this.journal,
      thought: this.thought,
      intent: this.intent,
      dreamReadyAt: this.dreamReadyAt,
      wish: this.wish,
      spouse: this.spouse?.def.id ?? null,
      parents: this.parents.map((p) => p.def.id),
      children: this.children.map((c) => c.def.id),
      home: home >= 0 ? home : null,
      needsHome: this.needsHome,
      bonds: [...this.bonds].map(([o, n]) => [o.def.id, n]),
      alive: this.alive,
      deathTime: this.deathTime,
      lastPray: this.lastPray,
      prefs: this.prefs,
      owlBedtime: this.owlBedtime,
    };
  }

  /** Khôi phục chỉ số của riêng người này (người thân, nhà cửa nối sau bằng `link`). */
  restore(s: SavedVillager) {
    this.x = s.x;
    this.y = s.y;
    this.hunger = s.hunger;
    this.energy = s.energy;
    this.mood = s.mood;
    this.activity = s.activity;
    // Nghề mới có sau này (đan lát…) thì bản lưu cũ chưa có — giữ mức 0 mặc định.
    this.skills = { ...this.skills, ...s.skills };
    this.carry = s.carry;
    this.memories = s.memories;
    this.journal = s.journal;
    this.thought = s.thought;
    this.intent = s.intent;
    this.dreamReadyAt = s.dreamReadyAt;
    this.wish = s.wish;
    this.needsHome = s.needsHome;
    this.lastPray = s.lastPray;
    this.prefs = s.prefs;
    this.owlBedtime = s.owlBedtime;
  }

  /** Nối vợ chồng, cha mẹ, con cái, nhà ở và tình thân khi cả làng đã được dựng lại. */
  link(s: SavedVillager, byId: Map<string, Villager>, buildings: Building[]) {
    const get = (id: string) => byId.get(id);
    this.spouse = (s.spouse && get(s.spouse)) || null;
    this.parents = s.parents.map(get).filter((p): p is Villager => !!p);
    this.children = s.children.map(get).filter((c): c is Villager => !!c);
    this.home = s.home !== null ? (buildings[s.home] ?? null) : null;
    for (const [id, n] of s.bonds) {
      const o = get(id);
      if (o) this.bonds.set(o, n);
    }
  }

  /** Mất đi: dừng mọi việc đang làm (nhả chỗ đã giữ) và xoá khỏi bản đồ. */
  die() {
    this.alive = false;
    this.deathTime = this.scene.state.time;
    this.beh?.return(undefined);
    this.beh = null;
    this.container.destroy();
    this.bubble.destroy();
  }
  get tileX() {
    return Math.floor(this.x / TILE);
  }
  get tileY() {
    return Math.floor(this.y / TILE);
  }

  has(t: TraitId) {
    return this.traits.includes(t);
  }

  setSelected(on: boolean) {
    this.ring.setVisible(on);
  }

  // ------------------------------------------------------------ suy nghĩ, ký ức, nhật ký

  /** Hiện bong bóng suy nghĩ trên đầu. */
  /**
   * Suy nghĩ thường ngày: luôn hiện trên thẻ dân làng. Thỉnh thoảng mới nói thành tiếng — mỗi người cách nhau
   * một lúc và cả làng chỉ vài bong bóng cùng lúc — để màn hình không ngập lời nói. Người đang được chọn thì luôn nói.
   */
  say(text: string, ms = 3500) {
    this.thought = text;
    const now = this.scene.time.now;
    if (this.scene.selected === this) this.showBubble(text, ms);
    else if (now - this.lastChatter > CHATTER_GAP && this.scene.chatterCount() < MAX_CHATTER) {
      this.lastChatter = now;
      this.showBubble(text, ms);
    }
  }

  /** Đang có bong bóng suy nghĩ thường ngày (không phải lời quan trọng) trên đầu. */
  get chattering() {
    return this.bubble.visible && this.bubbleUntil - this.scene.time.now > 0 && !this.loud;
  }

  /** Lời đáng chú ý (cầu khấn, phát kiến, cưới hỏi, đáp lại Thành Hoàng…): luôn bật bong bóng. */
  announce(text: string, ms = 5500) {
    this.thought = text;
    this.showBubble(text, ms, true);
  }

  private loud = false;

  private showBubble(text: string, ms: number, loud = false) {
    this.loud = loud;
    this.bubbleText.setText(text);
    const w = this.bubbleText.width + 14;
    const h = this.bubbleText.height + 8;
    const g = this.bubbleBg;
    g.clear();
    g.fillStyle(0xfff8e6, 0.97).fillRoundedRect(-w / 2, -h, w, h, 8);
    g.lineStyle(1.5, 0xc9a86a, 1).strokeRoundedRect(-w / 2, -h, w, h, 8);
    g.fillStyle(0xfff8e6, 1).fillCircle(-4, 5, 3.2).fillCircle(-8, 11, 2);
    g.lineStyle(1, 0xc9a86a, 1).strokeCircle(-4, 5, 3.2).strokeCircle(-8, 11, 2);
    this.bubbleUntil = this.scene.time.now + ms;
  }

  note(text: string) {
    this.journal.unshift({ time: this.scene.state.time, text });
    if (this.journal.length > 40) this.journal.pop();
  }

  remember(id: string, icon: string, text: string, days: number, bias?: Memory['bias']) {
    this.memories = this.memories.filter((m) => m.id !== id);
    this.memories.push({ id, icon, text, until: this.scene.state.time + days * DAY_LENGTH, bias });
    this.note(`${icon} ${text}`);
  }

  addMood(n: number) {
    this.mood = clamp(this.mood + n, 0, 100);
  }

  /** Mức thích một việc: tính cách + sở thích riêng + ký ức. */
  affinity(j: JobId) {
    let a = this.prefs[j];
    for (const t of this.traits) a += TRAITS[t].aff?.[j] ?? 0;
    for (const m of this.memories) a += m.bias?.[j] ?? 0;
    if (this.isChild) a += CHILD_AFF[j] ?? 0;
    if (this.isElder) a += ELDER_AFF[j] ?? 0;
    return a;
  }

  /** Ông Thành Hoàng báo mộng gợi ý một việc — nghe hay không là tuỳ họ. */
  receiveDream(job: JobId): 'accepted' | 'refused' | 'cooldown' {
    const time = this.scene.state.time;
    if (time < this.dreamReadyAt) return 'cooldown';
    this.dreamReadyAt = time + DAY_LENGTH * 0.05;
    const aff = this.affinity(job);
    let p = 0.65 + aff * 0.6;
    if (this.has('toMo')) p += 0.25;
    if (this.has('luoi') && job !== 'nghi') p -= 0.2;
    if (this.has('buongBinh')) p -= 0.35;
    if (this.asleep) p += 0.15;
    p = clamp(p, 0.08, 0.95);
    const verb = JOBS[job].name.toLowerCase();

    if (Math.random() < p) {
      this.intent = { job, until: time + DAY_LENGTH * 0.8 };
      this.addMood(3);
      this.announce(this.asleep ? `💭 Mơ thấy ông Thành Hoàng bảo đi ${verb}...` : `💭 Tự nhiên thấy muốn đi ${verb} quá!`);
      this.note(`💭 Được báo mộng, quyết định đi ${verb}`);
      this.mode = '';
      this.interrupt();
      return 'accepted';
    }
    const line =
      aff < -0.2
        ? `Thôi, mình không thích ${verb} đâu`
        : this.has('buongBinh')
          ? 'Mình tự biết phải làm gì!'
          : this.has('luoi')
            ? 'Để mai tính...'
            : 'Ừm... chắc là không đâu';
    this.announce(`💭 ${line}`);
    this.note(`💭 Được báo mộng đi ${verb} nhưng không nghe: "${line}"`);
    return 'refused';
  }

  clearIntent() {
    if (!this.intent) return;
    this.intent = null;
    this.announce('Thôi, tự mình quyết vậy');
    this.mode = '';
  }

  /** Lời cầu khấn được đáp ứng: vui, tin hơn, siêng thắp hương hơn. */
  fulfillWish() {
    if (!this.wish) return false;
    const text = this.wish.text;
    this.wish = null;
    this.addMood(15);
    this.announce('Ông Thành Hoàng linh thiêng quá! 🙏', 5000);
    this.remember('linh_ung', '✨', `Lời cầu “${text}” đã ứng nghiệm`, 2, { le: 0.3 });
    return true;
  }

  /** Được Thành Hoàng phù hộ. */
  blessed() {
    this.addMood(25);
    this.energy = Math.min(100, this.energy + 35);
    this.hunger = Math.min(100, this.hunger + 25);
    this.memories = this.memories.filter((m) => m.id !== 'heo_huc');
    this.announce('Tự nhiên thấy trong người khoẻ khoắn lạ thường! ✨', 5000);
    this.remember('phu_ho', '✨', 'Được Thành Hoàng phù hộ, khoẻ khoắn hẳn', 1);
  }

  onRain() {
    this.addMood(3);
    if (!this.inside) this.say(RAIN_LINES[Math.floor(Math.random() * RAIN_LINES.length)]);
  }

  private interrupt() {
    if (this.beh && !this.asleep) {
      this.beh.return(undefined);
      this.beh = null;
    }
  }

  // ------------------------------------------------------------ năng lực

  /** Hiệu suất làm việc theo cấp nghề, thể trạng và tâm trạng. */
  eff(job: JobId) {
    let e = 0.5 + 0.12 * this.skills[job].level;
    if (this.isChild) e *= 0.75;
    if (this.isElder) e *= 0.8;
    if (this.hunger < 10) e *= 0.7;
    if (this.energy < 10) e *= 0.8;
    return e * (0.85 + this.mood * 0.003);
  }

  /** Người trong nhà giỏi nghề này hơn — học từ họ sẽ nhanh hơn. */
  mentor(job: JobId): Villager | null {
    let best: Villager | null = null;
    for (const o of this.scene.villagers) {
      if (o === this || o.isChild || o.skills[job].level <= this.skills[job].level) continue;
      if (!best || o.skills[job].level > best.skills[job].level) best = o;
    }
    return best;
  }

  xpMultiplier(job: JobId) {
    // Người già nhiều kinh nghiệm, dạy nghề giỏi hơn.
    const m = this.mentor(job);
    return (this.isChild ? 1.5 : 1) * (m ? (m.isElder ? 2 : 1.5) : 1) * (this.has('toMo') ? 1.25 : 1);
  }

  gainXp(job: JobId, amount: number) {
    const s = this.skills[job];
    if (s.level >= MAX_LEVEL) return;
    s.xp += amount * this.xpMultiplier(job);
    while (s.level < MAX_LEVEL && s.xp >= xpNeed(s.level)) {
      s.xp -= xpNeed(s.level);
      s.level++;
      this.addMood(6);
      this.scene.floatText(this.x, this.y - 58, '⭐ Lên cấp!', '#ffe27a');
      this.scene.sfx('levelUp');
      const verb = JOBS[job].name.toLowerCase();
      this.say(s.level === 1 ? `Mình biết ${verb} rồi nè!` : `Mình ${verb} giỏi hơn rồi!`);
      this.note(`⭐ ${s.level === 1 ? `Đã biết ${verb}` : `${JOBS[job].name} lên cấp ${s.level}`}`);
      this.scene.state.log(
        s.level === 1
          ? `${JOBS[job].icon} ${this.name} đã biết ${verb}`
          : s.level >= MAX_LEVEL
            ? `🏅 ${this.name} trở thành bậc thầy ${verb}`
            : `${JOBS[job].icon} ${this.name} ${verb} giỏi hơn — cấp ${s.level}`,
        { x: this.x, y: this.y },
      );
    }
    if (s.level >= MAX_LEVEL) s.xp = 0;
  }

  private hungerLine() {
    return this.has('thamAn') ? 55 : 40;
  }

  // ------------------------------------------------------------ cập nhật

  update(dt: number) {
    const time = this.scene.state.time;
    this.hunger = Math.max(0, this.hunger - dt * HUNGER_RATE * (this.asleep ? 0.5 : 1) * (this.has('thamAn') ? 1.15 : 1));
    if (!this.asleep) {
      const drain = (this.activity === 'nghi' ? 0.5 : 1) * (this.has('khoeManh') ? 0.8 : 1);
      this.energy = Math.max(0, this.energy - dt * ENERGY_DRAIN * drain);
    }
    if (this.memories.length && this.memories.some((m) => m.until < time)) this.memories = this.memories.filter((m) => m.until >= time);
    if (this.intent && this.intent.until < time) this.intent = null;
    if (this.wish && this.wish.until < time) {
      this.wish = null;
      this.addMood(-4);
      this.note('🙏 Lời cầu khấn chưa thành... chắc ông bận');
    }

    this.moving = false;
    this.working = false;
    this.relaxing = false;
    this.byFire = false;
    if (!this.beh) this.beh = this.think();
    if (this.beh.next(dt).done) this.beh = null;
    this.updateMood(dt);
    const st = this.stage;
    if (st !== this.stageKey) {
      const prev = this.stageKey;
      this.refreshLook();
      if (prev) this.scene.onGrowUp(this, prev, st);
    }
    this.render(dt);
  }

  private updateMood(dt: number) {
    const base = this.has('vuiTinh') ? 72 : 60;
    let d = (base - this.mood) * 0.004;
    if (this.hunger < 20) d -= 0.08;
    if (this.energy < 15) d -= 0.05;
    if (this.relaxing) d += this.byFire ? 0.25 : 0.12;
    else if (this.working) d += this.affinity(this.activity) * 0.1;
    if (d < 0 && this.has('vuiTinh')) d *= 0.6;
    this.mood = clamp(this.mood + d * dt, 0, 100);
  }

  // ------------------------------------------------------------ hiển thị

  private render(dt: number) {
    const body = this.body;
    this.container.setPosition(this.x, this.y).setDepth(this.y).setVisible(!this.inside);
    const name = this.name;
    if (this.label.text !== name) this.label.setText(name);
    body.x = this.lounging ? 18 : 0;
    if (this.lounging) {
      // Nằm dài trên võng, đung đưa nhè nhẹ.
      this.phase += dt * 1.6;
      body.y = -10 + Math.sin(this.phase) * 1.2;
      body.angle = -84;
    } else if (this.mount) {
      // Ngồi vắt vẻo trên lưng trâu, lắc lư theo nhịp trâu đi.
      this.phase += dt * 4;
      body.y = -15 + Math.sin(this.phase) * 0.8;
      body.angle = 0;
      body.setFlipX(this.mount.facingLeft);
    } else if (this.moving) {
      this.phase += dt * 13;
      body.y = 2 - Math.abs(Math.sin(this.phase)) * 3;
      body.angle = 0;
    } else if (this.jumping) {
      // Dây quay một vòng: chạm đất thì bật lên cho dây luồn qua chân.
      this.phase += dt * 7;
      body.y = 2 - Math.max(0, Math.cos(this.phase)) * 7;
      body.angle = 0;
    } else if (this.playing) {
      // Ngồi bốc quân, rải quân: người hơi lắc lư.
      this.phase += dt * 3;
      body.y = 4;
      body.angle = Math.sin(this.phase) * 5;
    } else if (this.working && !this.fishSpot) {
      this.phase += dt * 11;
      body.y = 2;
      body.angle = Math.sin(this.phase) * 9;
    } else {
      body.y = 2;
      body.angle = this.asleep || this.dozing ? (body.flipX ? 80 : -80) : 0;
    }
    const ico = this.carry ? RESOURCES[this.carry.res].icon : (this.holding ?? '');
    if (this.icon.text !== ico) this.icon.setText(ico);

    const g = this.gfx;
    g.clear();
    if (this.jumping) {
      // Sợi dây từ hai tay vòng qua đầu rồi xuống dưới chân.
      const ropeY = -18 - Math.cos(this.phase) * 26 + body.y;
      const hy = -18 + body.y;
      g.lineStyle(1.3, 0x8a5a2a, 1).beginPath();
      g.moveTo(-8, hy);
      for (let i = 1; i <= 8; i++) {
        const t = i / 8;
        const x = -8 + 16 * t;
        g.lineTo(x, hy + (ropeY - hy) * Math.sin(t * Math.PI));
      }
      g.strokePath();
    }
    if (this.progress !== null) {
      const top = this.isChild ? -44 : -54;
      g.fillStyle(0x2b1d10, 0.55).fillRoundedRect(-13, top - 1, 26, 6, 3);
      g.fillStyle(0xffd34a, 1).fillRoundedRect(-12, top, Math.max(2, 24 * this.progress), 4, 2);
    }
    if (this.fishSpot) {
      const dir = body.flipX ? -1 : 1;
      const hx = 8 * dir;
      const hy = -22;
      const tipX = hx + 14 * dir;
      const tipY = hy - 14;
      const bx = this.fishSpot.wx * TILE + TILE / 2 - this.x;
      const by = this.fishSpot.wy * TILE + TILE / 2 - this.y + Math.sin(this.phase * 0.5) * 1.5;
      this.phase += dt * 4;
      g.lineStyle(1.6, 0x6b4a2b).lineBetween(hx, hy, tipX, tipY);
      g.lineStyle(1, 0xffffff, 0.7).lineBetween(tipX, tipY, bx, by);
      g.fillStyle(0xe2463a).fillCircle(bx, by, 2.2);
    }

    const left = this.bubbleUntil - this.scene.time.now;
    const show = left > 0 && !this.inside;
    this.bubble.setVisible(show);
    if (show) this.bubble.setAlpha(Math.min(1, left / 400));
  }

  /** Bong bóng đang hiện thì trả về vị trí gốc và kích thước, để scene xếp không chồng nhau. */
  bubbleBox() {
    if (!this.bubble.visible) return null;
    return {
      x: this.x + 6,
      y: this.y - (this.stage === 'be' ? 42 : this.isChild ? 58 : 68),
      w: this.bubbleText.width + 14,
      h: this.bubbleText.height + 8,
    };
  }

  placeBubble(x: number, y: number) {
    this.bubble.setPosition(x, y);
  }

  // ------------------------------------------------------------ hành vi cơ bản

  private speed() {
    const st = this.stage;
    let s = st === 'be' ? 35 : st === 'tre' ? 58 : st === 'gia' ? 52 : 68;
    if (this.hunger < 10) s *= 0.75;
    if (this.energy < 10) s *= 0.8;
    return s;
  }

  private moveToward(px: number, py: number, dt: number, mul = 1) {
    const dx = px - this.x;
    const dy = py - this.y;
    const d = Math.hypot(dx, dy);
    const step = this.speed() * mul * dt;
    this.moving = true;
    if (Math.abs(dx) > 0.5) this.body.setFlipX(dx < 0);
    if (d <= step) {
      this.x = px;
      this.y = py;
      return true;
    }
    this.x += (dx / d) * step;
    this.y += (dy / d) * step;
    return false;
  }

  /** Đang quay mặt sang trái. */
  get facingLeft() {
    return this.body.flipX;
  }

  private face(px: number) {
    this.body.setFlipX(px < this.x);
  }

  private *walkTo(tx: number, ty: number, mul = 1): Step {
    const path = this.scene.findPath(this.tileX, this.tileY, tx, ty);
    if (!path) return false;
    if (path.length === 0) path.push({ x: tx, y: ty });
    for (const p of path) {
      const px = p.x * TILE + TILE / 2 + this.ox;
      const py = p.y * TILE + TILE / 2 + this.oy;
      for (;;) {
        const dt: number = yield;
        if (this.moveToward(px, py, dt, mul)) break;
      }
    }
    return true;
  }

  private *wait(sec: number): Step {
    let t = 0;
    while (t < sec) t += yield;
    return true;
  }

  /** Cú đêm (từ 10 tuổi) thức khuya hơn người khác. */
  get nightOwl() {
    return this.has('cuDem') && this.age >= 10;
  }

  /** Đến giờ đi ngủ của riêng người này: cú đêm ngủ muộn hơn giờ ngủ chung của làng. */
  private sleepy() {
    const st = this.scene.state;
    if (!st.isSleepTime()) return false;
    if (!this.nightOwl) return true;
    const h = st.hour;
    return h >= this.owlBedtime || h < 5;
  }

  /** Nên dừng việc đang làm: trời tối, kiệt sức hoặc đói lả. */
  private mustStop() {
    return this.sleepy() || this.energy < 8 || (this.hunger < 20 && this.scene.hasFood());
  }

  /** Làm việc trong `sec` giây; có `sound` thì phát đều đặn mỗi `every` giây. */
  private *workFor(sec: number, sound?: SfxId, every = 0.55): Step {
    let t = 0;
    let tick = every * 0.5;
    try {
      while (t < sec) {
        const dt: number = yield;
        t += dt;
        this.working = true;
        this.progress = Math.min(1, t / sec);
        if (sound && (tick -= dt) <= 0) {
          tick += every;
          this.scene.sfx(sound, this.x, this.y);
        }
        if (this.mustStop()) return false;
      }
      return true;
    } finally {
      this.progress = null;
    }
  }

  /** Quanh nhà mình (hoặc giữa làng nếu chưa có nhà). */
  private homeSpot() {
    return this.home?.built ? this.home.entrance : this.scene.homeTile;
  }

  private *idle(status: string, sec = 4): Beh {
    this.status = status;
    const h = this.homeSpot();
    const tx = h.x + Phaser.Math.Between(-4, 4);
    const ty = h.y + Phaser.Math.Between(-2, 4);
    if (this.scene.isFree(tx, ty)) yield* this.walkTo(tx, ty, 0.7);
    this.status = status;
    yield* this.wait(sec);
  }

  // ------------------------------------------------------------ bộ não

  /** Cân nhắc mọi việc có thể làm và chọn việc điểm cao nhất. */
  private decide(): Option {
    const s = this.scene;
    const need = s.villageNeeds();
    const h = s.state.hour;
    const evening = h >= 18 && h < 21;
    const fireEvening = evening && !!s.nearestBuilt('lua', this.x, this.y);
    const festive = s.festivalOn() || s.midAutumnOn() || s.tetOn();
    const opts: Option[] = [];
    for (const j of ACT_ORDER) {
      if (!canDo(this.stage, this.age, j)) continue;
      const n = j === 'nghi' ? this.restNeed(fireEvening) + (festive ? 0.7 : 0) + (s.marketOn() ? 0.2 : 0) : j === 'le' ? this.prayNeed() : need[j];
      if (n < 0) continue;
      const aff = this.affinity(j);
      let score = n * 0.7 + aff * 0.5;
      if (SKILL_JOBS.includes(j)) {
        score += this.skills[j].level * 0.03;
        const others = s.villagers.filter((o) => o !== this && o.activity === j && !o.asleep).length;
        score -= others * (j === 'nau' || j === 'nung' ? 0.5 : 0.18);
        if (evening) score *= 0.6;
        if (festive) score *= 0.3;
      } else if (j === 'nghi' && !fireEvening && !festive) {
        score -= this.boredom() * 0.8;
      }
      const dreamed = this.intent?.job === j;
      if (dreamed) score += 0.5;
      if (this.activity === j) score += 0.08;
      score += (Math.random() - 0.5) * 0.06;
      opts.push({ job: j, score, reason: this.reasonFor(j, n, aff, dreamed, fireEvening) });
    }
    opts.sort((a, b) => b.score - a.score);
    this.options = opts;
    return opts[0];
  }

  /** Muốn ra miếu: lâu chưa thắp hương, sáng sớm / chiều tối, hoặc đang buồn. */
  private prayNeed() {
    const s = this.scene;
    if (!s.nearestBuilt('mieu', this.x, this.y)) return -1;
    const h = s.state.hour;
    const since = (s.state.time - this.lastPray) / DAY_LENGTH;
    if (since < 0.3) return 0.02;
    let n = Math.min(1, since / 0.9) * 0.45;
    if ((h >= 6 && h < 8) || (h >= 17 && h < 18.5)) n += 0.2;
    if (this.mood < 40) n += 0.15;
    return n;
  }

  private boredom() {
    return Math.min(0.45, this.idleTime / (DAY_LENGTH * 0.2));
  }

  private restNeed(fireEvening: boolean) {
    const tired = Math.max(0, (40 - this.energy) / 40) * 0.4;
    return 0.12 + (1 - this.mood / 100) * 0.5 + tired + (fireEvening ? 0.3 : 0);
  }

  private reasonFor(j: JobId, need: number, aff: number, dreamed: boolean, fireEvening: boolean) {
    if (dreamed) return `Nhớ lời báo mộng, đi ${JOBS[j].name.toLowerCase()} thôi`;
    if (j === 'nghi' && this.scene.festivalOn()) return 'Hội làng mở rồi, ra đình trẩy hội thôi! 🥁';
    if (j === 'nghi' && this.scene.midAutumnOn())
      return this.stage === 'tre' ? 'Trung thu rồi, đi rước đèn ông sao thôi! ⭐' : 'Trăng rằm lên rồi, ra bày cỗ trông trăng thôi! 🥮';
    if (j === 'nghi' && this.scene.tetOn())
      return this.stage === 'tre' ? 'Tết rồi! Mặc áo mới, chờ được mừng tuổi 🧧' : 'Tết đến rồi, ra canh nồi bánh chưng chờ giao thừa thôi! 🧧';
    if (j === 'nghi' && fireEvening) return 'Tối rồi, ra ngồi bên bếp lửa với cả nhà';
    if (j !== 'nghi' && this.boredom() > 0.25) return 'Ngồi mãi cũng chán, đi làm gì đó thôi';
    if (need >= 0.6) return NEED_LINES[j];
    if (aff >= 0.25) return LIKE_LINES[j];
    return CASUAL_LINES[j];
  }

  /** Nghĩ một lần cho mỗi lần đổi trạng thái, tránh lải nhải. */
  private thinkOnce(mode: string, text: string) {
    if (this.mode === mode) return;
    this.mode = mode;
    this.say(text);
  }

  private *think(): Beh {
    if (this.carry) return yield* this.deliver();
    const st = this.scene.state;
    if (this.sleepy() || this.energy < 10) {
      this.thinkOnce('sleep', this.sleepy() ? 'Khuya rồi, đi ngủ thôi' : 'Mệt rã rời, phải chợp mắt một lát');
      return yield* this.sleep();
    }
    if (this.hunger < this.hungerLine() && this.scene.hasFood()) {
      this.thinkOnce('eat', this.hunger < 15 ? 'Đói lả rồi, về ăn ngay thôi!' : 'Bụng đói rồi, về ăn chút gì');
      return yield* this.eat();
    }
    if (this.wantsNap()) {
      this.thinkOnce('trua', 'Trưa nắng quá, ngả lưng một lát đã');
      return yield* this.nap();
    }
    // Bạn đang ngồi chờ chơi ô ăn quan gần đây thì chạy sang chơi cùng.
    const board = this.stage === 'tre' && this.age >= 5 ? this.scene.openBoard(this) : null;
    if (board && Math.random() < 0.7) {
      this.thinkOnce('oaq', `${board.players[0].name} rủ chơi ô ăn quan kìa!`);
      return yield* this.oAnQuan(board);
    }
    // Cả làng đã ngủ mà cú đêm còn thức: nằm võng hóng mát, hoặc soi đuốc đi bắt ếch.
    if (this.nightOwl && st.isSleepTime()) {
      const frog = this.stage !== 'gia' && Math.random() < 0.5;
      this.thinkOnce(frog ? 'ech' : 'vong', frog ? 'Đêm nay ếch kêu ran, đi soi ếch thôi! 🐸' : 'Còn sớm, ra võng nằm hóng gió đã');
      return yield* (frog ? this.frog() : this.hammock());
    }

    const pick = this.decide();
    if (this.mode !== pick.job) {
      this.mode = pick.job;
      this.say(pick.reason);
      if (this.activity !== pick.job) this.note(`${JOBS[pick.job].icon} ${pick.reason}`);
    }
    this.activity = pick.job;
    if (pick.job !== 'nghi') this.idleTime = 0;
    switch (pick.job) {
      case 'chat':
        return yield* this.chop();
      case 'san':
        return yield* this.hunt();
      case 'ca':
        return yield* this.fish();
      case 'hai':
        return yield* this.gather();
      case 'cay':
        return yield* this.farm();
      case 'nau':
        return yield* this.cook();
      case 'nung':
        return yield* this.pottery();
      case 'dan':
        return yield* this.weave();
      case 'xay':
        return yield* this.build();
      case 'le':
        return yield* this.pray();
      default:
        return yield* this.relax();
    }
  }

  private *deliver(): Beh {
    const c = this.carry!;
    const store = this.scene.nearestStorage(this.x, this.y);
    this.status = `Mang ${RESOURCES[c.res].name.toLowerCase()} về kho`;
    if (store) {
      const ok = yield* this.walkTo(store.entrance.x, store.entrance.y);
      if (!ok) yield* this.wait(0.5);
    }
    this.scene.state.add(c.res, c.amount);
    this.scene.floatText(this.x, this.y - 48, `+${c.amount} ${RESOURCES[c.res].icon}`);
    this.scene.sfx('deposit', this.x, this.y);
    this.carry = null;
  }

  private *sleep(): Beh {
    const home = this.home?.built ? this.home : this.scene.nearestHome(this.x, this.y);
    this.status = 'Về nhà đi ngủ';
    if (home) {
      const ok = yield* this.walkTo(home.entrance.x, home.entrance.y);
      if (ok) this.inside = true;
    }
    this.asleep = true;
    this.idleTime = 0;
    this.status = home ? 'Đang ngủ trong nhà 💤' : 'Ngủ ngoài trời 💤';
    let z = Math.random() * 2;
    // Nhà càng khang trang ngủ càng ngon, hồi sức càng nhanh.
    const comfort = this.inside && home?.isHouse ? 1 + home.tier * 0.1 : 1;
    try {
      for (;;) {
        const dt: number = yield;
        this.energy = Math.min(100, this.energy + dt * SLEEP_RATE * comfort);
        z -= dt;
        if (z <= 0) {
          z = 2.5;
          this.scene.floatText(this.x + 8, this.y - (this.inside ? 60 : 30), 'z', '#dfe8ff');
        }
        if (!this.scene.state.isSleepTime() && this.energy >= 60) break;
      }
    } finally {
      this.asleep = false;
      this.inside = false;
    }
  }

  private *eat(): Beh {
    const store = this.scene.nearestStorage(this.x, this.y);
    this.status = 'Về nhà ăn cơm';
    if (store) yield* this.walkTo(store.entrance.x, store.entrance.y);
    this.status = 'Đang ăn 🍚';
    let best: ResKey | null = null;
    while (this.hunger < 85) {
      const food = this.scene.takeFood();
      if (!food) break;
      best ??= food;
      this.holding = RESOURCES[food].icon;
      this.scene.sfx('eat', this.x, this.y);
      yield* this.wait(1.5);
      this.hunger = Math.min(100, this.hunger + (RESOURCES[food].food ?? 0));
      this.addMood(food === 'chuoi' ? 1.5 : 4);
    }
    this.holding = null;
    if (best) {
      this.scene.floatText(this.x, this.y - 48, '😋', '#fff');
      if (best === 'thitNuong' && Math.random() < 0.4) this.say('Thịt nướng thơm ghê 😋');
    }
  }

  private *relax(): Beh {
    const s = this.scene;
    const h = s.state.hour;
    const fire = s.nearestBuilt('lua', this.x, this.y);
    const moon = s.midAutumnOn() ? s.gatherSpot : null;
    if (moon && this.stage === 'tre') return yield* this.parade(moon);
    const tet = s.tetOn() ? s.gatherSpot : null;
    // Trung thu / Tết: cả làng tụ về một chỗ.
    const gather = moon ?? tet;
    const dinh = s.festivalOn() ? s.nearestBuilt('dinh', this.x, this.y) : null;
    const cho = s.marketOn() && this.stage !== 'be' && Math.random() < 0.6 ? s.nearestBuilt('cho', this.x, this.y) : null;
    const fireEvening = !dinh && !gather && !!fire && h >= 18 && h < 21;
    // Ngày hội / phiên chợ / lễ Tết: tụ tập đông, trò chuyện rôm rả hơn.
    const crowd = dinh ?? cho;
    const festive = !!dinh || !!gather;
    // Ngày thường, trời khô ráo: trẻ con rủ nhau chơi trò dân gian.
    const day = h >= 7 && h < 17.5;
    if (!gather && !crowd && day && this.stage === 'tre' && this.age >= 5 && !s.state.raining && Math.random() < 0.6) {
      return yield* this.play();
    }
    if (gather) {
      this.status = moon ? 'Ra trông trăng phá cỗ' : 'Ra quây quần đón Tết';
      const tx = gather.x + Phaser.Math.Between(-3, 3);
      const ty = gather.y + Phaser.Math.Between(-1, 2);
      const ok = s.isFree(tx, ty) && (yield* this.walkTo(tx, ty, 0.8));
      if (ok) this.face(gather.x * TILE + TILE / 2);
      const st = this.stage;
      const lines = moon
        ? st === 'gia' ? ELDER_MOON_LINES : MOON_LINES
        : st === 'gia' ? ELDER_TET_LINES : st === 'tre' || st === 'be' ? KID_TET_LINES : TET_LINES;
      this.status = lines[Math.floor(Math.random() * lines.length)];
    } else if (crowd) {
      this.status = dinh ? 'Ra đình trẩy hội' : 'Đi chợ phiên';
      const tx = crowd.tx + Phaser.Math.Between(-2, crowd.def.w + 1);
      const ty = crowd.ty + crowd.def.h + Phaser.Math.Between(0, 2);
      const ok = s.isFree(tx, ty) && (yield* this.walkTo(tx, ty, 0.85));
      if (ok) this.face(crowd.px);
      const lines = dinh ? FESTIVAL_LINES : MARKET_LINES;
      this.status = lines[Math.floor(Math.random() * lines.length)];
    } else if (fire && fireEvening) {
      this.status = 'Ra ngồi bên bếp lửa';
      const tx = fire.tx + Phaser.Math.Between(-2, 2);
      const ty = fire.ty + Phaser.Math.Between(-1, 2);
      const ok = s.isFree(tx, ty) && (yield* this.walkTo(tx, ty, 0.8));
      if (ok) this.face(fire.px);
      this.status = 'Quây quần bên bếp lửa 🔥';
    } else {
      const st = this.stage;
      const lines = st === 'be' ? BABY_LINES : st === 'tre' ? CHILD_LINES : st === 'gia' ? ELDER_LINES : RELAX_LINES;
      const home = this.homeSpot();
      const r = st === 'be' ? 2 : 6;
      const tx = home.x + Phaser.Math.Between(-r, r);
      const ty = home.y + Phaser.Math.Between(-Math.min(r, 4), r);
      this.status = 'Đi dạo quanh xóm';
      if (s.isFree(tx, ty)) yield* this.walkTo(tx, ty, 0.65);
      this.status = lines[Math.floor(Math.random() * lines.length)];
    }

    let t = 0;
    let chat = 2 + Math.random() * 3;
    const dur = fireEvening || crowd || gather ? 8 + Math.random() * 6 : 3 + Math.random() * 5;
    while (t < dur) {
      const dt: number = yield;
      t += dt;
      this.relaxing = true;
      this.byFire = fireEvening || !!crowd || !!gather;
      if (festive) this.addMood(dt * 0.4);
      this.idleTime += dt;
      this.energy = Math.min(100, this.energy + dt * ENERGY_DRAIN * 1.5);
      if ((chat -= dt) <= 0) {
        chat = 4 + Math.random() * 4;
        const friend = s.villagers.find(
          (o) => o !== this && !o.inside && o.relaxing && Phaser.Math.Distance.Between(o.x, o.y, this.x, this.y) < 90,
        );
        if (friend && Math.random() < 0.6 && this.stage !== 'be') {
          // Hai người độc thân đã thân nhau thì nói chuyện ngọt ngào hơn.
          const sweet = s.canCourt(this, friend) && this.bond(friend) >= 35;
          const lines = sweet ? SWEET_LINES : moon ? MOON_CHAT : tet ? TET_CHAT : dinh ? FESTIVAL_CHAT : cho ? MARKET_CHAT : CHAT_LINES;
          this.say(lines[Math.floor(Math.random() * lines.length)], 3500);
          this.addMood(2);
          s.addBond(this, friend, festive ? 10 : fireEvening || cho ? 7 : 4);
          s.tryMarry(this, friend);
        }
      }
      if (this.mustStop()) return;
    }
  }

  /** Đêm Trung thu: trẻ con cầm đèn ông sao rước quanh mâm cỗ, ríu rít với nhau. */
  private *parade(spot: Pt): Beh {
    const s = this.scene;
    this.light = 'star';
    try {
      for (let i = 0; i < 4 && s.midAutumnOn(); i++) {
        this.status = 'Rước đèn ông sao ⭐';
        const a = Math.random() * Math.PI * 2;
        const r = 3 + Math.random() * 4;
        const tx = Math.round(spot.x + Math.cos(a) * r);
        const ty = Math.round(spot.y + Math.sin(a) * r * 0.7);
        if (s.isFree(tx, ty)) yield* this.walkTo(tx, ty, 0.75);
        this.addMood(2);
        this.idleTime = 0;
        const pal = s.villagers.find((o) => o !== this && o.light === 'star' && Phaser.Math.Distance.Between(o.x, o.y, this.x, this.y) < 110);
        if (pal) s.addBond(this, pal, 6);
        if (Math.random() < 0.5) this.say(PARADE_CHAT[Math.floor(Math.random() * PARADE_CHAT.length)], 3000);
        if (this.mustStop()) return;
      }
    } finally {
      this.light = null;
    }
  }

  /** Giữa trưa (11:30–13:30) người lớn có khi ngả lưng — mỗi tháng tính một lần, người lười hay ngủ trưa hơn. */
  private wantsNap() {
    const s = this.scene;
    const st = s.state;
    const h = st.hour;
    if (this.isChild || h < 11.5 || h >= 13.5 || st.raining || s.festivalOn() || s.marketOn()) return false;
    if (this.napChecked === st.month) return false;
    this.napChecked = st.month;
    let p = 0.35 + (this.isElder ? 0.25 : 0);
    if (this.has('luoi')) p += 0.4;
    if (this.has('sieng')) p -= 0.3;
    return Math.random() < p;
  }

  /** Ngủ trưa dưới bóng tre / gốc cây gần đó (không có thì ngay trước nhà) tới quá trưa. */
  private *nap(): Beh {
    const s = this.scene;
    this.activity = 'nghi';
    const shade = s.findNode(['bamboo', 'tree'], this.x, this.y);
    const near = shade && Phaser.Math.Distance.Between(shade.x, shade.y, this.x, this.y) < TILE * 12 ? shade : null;
    // Nằm ngay phía trước bụi tre / gốc cây cho khỏi bị tán lá che mất.
    const spot = !near ? null : s.isFree(near.tx, near.ty + 1) ? { x: near.tx, y: near.ty + 1 } : s.standNear(near.tx, near.ty, this.x, this.y);
    const where = !near || !spot ? 'trước hiên nhà' : near.kind === 'bamboo' ? 'dưới bóng tre' : 'dưới gốc cây';
    this.status = `Tìm chỗ mát ${where}`;
    if (spot) yield* this.walkTo(spot.x, spot.y, 0.7);
    else {
      const h = this.homeSpot();
      yield* this.walkTo(h.x, h.y, 0.7);
    }
    this.dozing = true;
    this.status = `Ngủ trưa ${where} 💤`;
    try {
      let t = 0;
      let z = 1;
      while (t < 30 && s.state.hour < 13.5) {
        const dt: number = yield;
        t += dt;
        this.idleTime = 0;
        this.energy = Math.min(100, this.energy + dt * SLEEP_RATE * 0.5);
        if ((z -= dt) <= 0) {
          z = 2.5;
          s.floatText(this.x + 8, this.y - 26, 'z', '#dfe8ff');
        }
        if (this.hunger < 15 && s.hasFood()) break;
      }
    } finally {
      this.dozing = false;
    }
    this.addMood(4);
  }

  /** Trẻ con chơi trò dân gian: thả diều, nhảy dây, ô ăn quan (có bạn đang chờ thì sang chơi cùng). */
  private *play(): Beh {
    const open = this.scene.openBoard(this);
    if (open && Math.random() < 0.85) return yield* this.oAnQuan(open);
    const buf = this.age >= 7 ? this.scene.freeBuffalo(this.x, this.y, 18) : null;
    if (buf && Math.random() < 0.45) return yield* this.herd(buf);
    const r = Math.random();
    if (r < 0.4) return yield* this.flyKite();
    if (r < 0.7) return yield* this.jumpRope();
    return yield* this.oAnQuan(null);
  }

  /** Chăn trâu: ra chuồng dắt trâu, trèo lên lưng cưỡi ra bãi cỏ ven sông; có khi vừa ngồi lưng trâu vừa thả diều. */
  private *herd(buf: Buffalo): Beh {
    const s = this.scene;
    buf.claim(this, 'herd');
    try {
      this.status = 'Ra chuồng dắt trâu đi chăn 🐃';
      if (!(yield* this.walkTo(buf.tileX, buf.tileY, 0.9))) return;
      buf.pasture = s.pastureNear(buf);
      this.mount = buf;
      this.status = 'Cưỡi trâu ra bãi cỏ ven sông 🐃';
      this.say(HERD_LINES[Math.floor(Math.random() * HERD_LINES.length)], 3500);
      let t = 0;
      let kite = false;
      const dur = 25 + Math.random() * 15;
      while (t < dur) {
        const dt: number = yield;
        t += dt;
        // Ngồi trên lưng trâu: đi theo trâu.
        this.x = buf.x + (buf.facingLeft ? 3 : -3);
        this.y = buf.y + 1;
        this.relaxing = true;
        this.idleTime = 0;
        const arrived = Phaser.Math.Distance.Between(buf.x, buf.y, buf.pasture.x, buf.pasture.y) < 40;
        if (arrived && !kite) {
          kite = true;
          if (Math.random() < 0.5 && !s.state.raining) {
            this.toy = 'kite';
            this.status = 'Ngồi lưng trâu thả diều 🪁';
          } else this.status = 'Ngồi lưng trâu thổi sáo 🎶';
        }
        if (this.mustStop() || s.state.raining) break;
      }
      this.addMood(6);
    } finally {
      this.mount = null;
      this.toy = null;
      buf.release();
    }
  }

  /** Một ô trống quanh nhà, cách nhà `min`–`max` ô. */
  private openSpot(min: number, max: number) {
    const h = this.homeSpot();
    for (let i = 0; i < 20; i++) {
      const tx = h.x + Phaser.Math.Between(-max, max);
      const ty = h.y + Phaser.Math.Between(-max, max);
      if (Math.abs(tx - h.x) + Math.abs(ty - h.y) >= min && this.scene.isFree(tx, ty)) return { x: tx, y: ty };
    }
    return null;
  }

  private *flyKite(): Beh {
    const spot = this.openSpot(3, 7);
    this.status = 'Ra bãi trống thả diều 🪁';
    if (spot) yield* this.walkTo(spot.x, spot.y, 0.7);
    this.toy = 'kite';
    try {
      // Chạy vài bước lấy gió cho diều lên, rồi đứng giật dây.
      this.status = 'Chạy lấy gió cho diều lên 🪁';
      for (let i = 0; i < 2; i++) {
        const tx = this.tileX + Phaser.Math.Between(-3, 3);
        const ty = this.tileY + Phaser.Math.Between(-2, 2);
        if (this.scene.isFree(tx, ty)) yield* this.walkTo(tx, ty, 1.1);
      }
      this.status = KITE_LINES[Math.floor(Math.random() * KITE_LINES.length)];
      let t = 0;
      const dur = 14 + Math.random() * 10;
      while (t < dur) {
        const dt: number = yield;
        t += dt;
        this.relaxing = true;
        if (this.mustStop() || this.scene.state.raining) break;
      }
      this.addMood(5);
    } finally {
      this.toy = null;
    }
  }

  private *jumpRope(): Beh {
    const spot = this.openSpot(1, 4);
    this.status = 'Lấy dây ra sân nhảy dây';
    if (spot) yield* this.walkTo(spot.x, spot.y, 0.7);
    this.jumping = true;
    this.status = 'Nhảy dây';
    try {
      let t = 0;
      let count = 0;
      let chat = 4;
      const dur = 10 + Math.random() * 8;
      while (t < dur) {
        const dt: number = yield;
        t += dt;
        this.relaxing = true;
        this.energy = Math.max(0, this.energy - dt * ENERGY_DRAIN);
        if ((chat -= dt) <= 0) {
          chat = 5 + Math.random() * 4;
          count += 10 + Math.floor(Math.random() * 15);
          this.say(`Nhảy được ${count} cái rồi nè!`, 2500);
        }
        if (this.mustStop()) break;
      }
      this.addMood(4);
    } finally {
      this.jumping = false;
    }
  }

  /** Ô ăn quan: kẻ bàn rồi chờ bạn (hoặc sang ngồi bàn bạn đã kẻ), hai đứa ngồi hai bên bốc quân rải quân. */
  private *oAnQuan(join: OAnQuanBoard | null): Beh {
    const s = this.scene;
    let board = join;
    if (!board) {
      const spot = this.openSpot(1, 5);
      if (!spot || !s.isFree(spot.x - 1, spot.y) || !s.isFree(spot.x + 1, spot.y)) return yield* this.jumpRope();
      board = s.drawBoard(spot.x, spot.y, this);
    } else board.players.push(this);
    const host = board.players[0] === this;
    try {
      const side = host ? -1 : 1;
      this.status = host ? 'Kẻ ô ăn quan trên nền đất' : 'Sang chơi ô ăn quan với bạn';
      if (!(yield* this.walkTo(board.tx + side, board.ty, 0.8))) return;
      this.face(board.tx * TILE + TILE / 2);
      this.playing = true;
      if (host && board.players.length === 1) this.say('Ai chơi ô ăn quan không? 🪨', 3500);
      let t = 0;
      let chat = 3 + Math.random() * 3;
      const dur = 22 + Math.random() * 10;
      while (t < dur) {
        const dt: number = yield;
        t += dt;
        this.relaxing = true;
        if (!board.alive) break;
        const mate = board.players.find((p) => p !== this);
        this.status = mate ? 'Chơi ô ăn quan 🪨' : 'Kẻ ô ăn quan, chờ bạn tới chơi';
        if (mate && (chat -= dt) <= 0) {
          chat = 4 + Math.random() * 4;
          this.say(OAQ_LINES[Math.floor(Math.random() * OAQ_LINES.length)], 3000);
          this.addMood(2);
          s.addBond(this, mate, 5);
        }
        // Chờ mãi không ai tới thì thôi.
        if (!mate && host && t > 20) break;
        if (this.mustStop()) break;
      }
    } finally {
      this.playing = false;
      board.players = board.players.filter((p) => p !== this);
      if (host) s.eraseBoard(board);
    }
  }

  /** Cú đêm mắc võng trước nhà, nằm đung đưa nghe dế kêu cho tới giờ ngủ. */
  private *hammock(): Beh {
    const s = this.scene;
    this.activity = 'nghi';
    this.status = 'Ra trước nhà mắc võng';
    const h = this.homeSpot();
    const tx = h.x + (Math.random() < 0.5 ? -2 : 2);
    const ty = h.y + 1;
    if (s.isFree(tx, ty)) yield* this.walkTo(tx, ty, 0.7);
    const vong = s.add.image(this.x, this.y + 2, 'hammock').setOrigin(0.5, 1).setDepth(this.y - 1);
    s.tweens.add({ targets: vong, angle: { from: -2, to: 2 }, duration: 1900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    this.lounging = true;
    this.status = HAMMOCK_LINES[Math.floor(Math.random() * HAMMOCK_LINES.length)];
    try {
      let t = 0;
      let chat = 5 + Math.random() * 5;
      const dur = 20 + Math.random() * 15;
      while (t < dur) {
        const dt: number = yield;
        t += dt;
        this.relaxing = true;
        this.idleTime = 0;
        this.energy = Math.min(100, this.energy + dt * ENERGY_DRAIN * 1.2);
        if ((chat -= dt) <= 0) {
          chat = 10 + Math.random() * 8;
          this.say(NIGHT_LINES[Math.floor(Math.random() * NIGHT_LINES.length)], 3500);
        }
        if (this.mustStop()) break;
      }
    } finally {
      this.lounging = false;
      s.tweens.killTweensOf(vong);
      vong.destroy();
    }
  }

  /** Cú đêm cầm đuốc lần dọc bờ sông soi ếch: đi vài bước, thấy ếch thì cúi xuống chộp — ếch mang về kho làm thịt. */
  private *frog(): Beh {
    const s = this.scene;
    const start = s.findFishingSpot(this.x, this.y);
    if (!start) return yield* this.hammock();
    this.activity = 'san';
    this.light = 'torch';
    try {
      this.status = 'Cầm đuốc ra bờ sông soi ếch 🔥';
      if (!(yield* this.walkTo(start.x, start.y, 0.8))) return;
      let at = start;
      let caught = 0;
      for (let i = 0; i < 6; i++) {
        // Lần sang một khúc bờ gần đó.
        const near = s.fishingSpots.filter((p) => p !== at && Math.abs(p.x - at.x) + Math.abs(p.y - at.y) <= 6);
        if (near.length) {
          at = near[Math.floor(Math.random() * near.length)];
          this.status = 'Soi đuốc lần dọc bờ sông 🔥';
          if (!(yield* this.walkTo(at.x, at.y, 0.5))) break;
        }
        if (this.mustStop()) break;
        this.face(at.wx * TILE + TILE / 2);
        this.status = 'Thấy ếch, rón rén chộp 🐸';
        if (!(yield* this.workFor((1.4 + Math.random()) / this.eff('san')))) break;
        if (Math.random() < 0.4 + 0.04 * this.skills.san.level) {
          caught++;
          s.sfx('catch', this.x, this.y);
          s.floatText(this.x, this.y - 48, '🐸', '#fff');
          this.gainXp('san', 2);
        } else {
          s.floatText(this.x, this.y - 48, 'ộp ộp…', '#fff');
        }
      }
      if (caught) {
        this.carry = { res: 'thit', amount: caught };
        this.addMood(3);
        this.say(caught >= 3 ? 'Được cả xâu ếch, mai nấu cháo ếch thôi! 🐸' : 'Bắt được mấy chú ếch béo 🐸');
      }
      if (caught >= 3) {
        this.remember('ech', '🐸', 'Một đêm soi được cả xâu ếch', 1, { san: 0.1 });
        s.state.log(`🐸 ${this.name} thức khuya soi đuốc bắt được ${caught} con ếch`, { x: this.x, y: this.y });
      }
    } finally {
      this.light = null;
    }
  }

  private *pray(): Beh {
    const s = this.scene;
    const shrine = s.nearestBuilt('mieu', this.x, this.y);
    if (!shrine) return yield* this.idle('Chưa có miếu để thắp hương');
    this.status = 'Ra miếu thắp hương';
    if (!(yield* this.walkTo(shrine.entrance.x, shrine.entrance.y))) return;
    this.face(shrine.px);
    this.status = 'Thắp nén hương 🙏';
    this.holding = '🙏';
    s.sfx('pray', this.x, this.y);
    try {
      if (!(yield* this.workFor(3))) return;
    } finally {
      this.holding = null;
    }
    this.lastPray = s.state.time;
    s.addPhuc(Math.round(3 + this.mood / 20), this.x, this.y - 50);
    this.addMood(4);

    if (!this.wish) {
      if (Math.random() < 0.7) {
        const w = s.wishFor(this);
        const text = WISHES[w].text;
        this.wish = { type: w, text, until: s.state.time + DAY_LENGTH };
        this.announce(`🙏 ${text}`, 5500);
        this.note(`🙏 Cầu khấn: ${text}`);
        s.state.log(`🙏 ${this.name} cầu khấn: “${text}”`, { x: this.x, y: this.y });
        return;
      }
    }
    this.say(PRAY_LINES[Math.floor(Math.random() * PRAY_LINES.length)]);
  }

  // ------------------------------------------------------------ nghề nghiệp

  private *chop(): Beh {
    const r = this.scene.state.res;
    const prefer: NodeKind = r.tre * 1.5 < r.go ? 'bamboo' : 'tree';
    const node = this.scene.findNode([prefer], this.x, this.y) ?? this.scene.findNode(['tree', 'bamboo'], this.x, this.y);
    if (!node) return yield* this.idle('Hết cây để chặt, chờ cây mọc lại');
    node.reservedBy = this;
    try {
      this.status = node.kind === 'tree' ? 'Đi đốn cây' : 'Đi chặt tre';
      const stand = this.scene.standNear(node.tx, node.ty, this.x, this.y);
      if (!stand || !(yield* this.walkTo(stand.x, stand.y))) return;
      this.face(node.x);
      this.status = node.kind === 'tree' ? 'Đang đốn cây 🪓' : 'Đang chặt tre 🪓';
      const dur = (node.kind === 'tree' ? 7 : 5) / this.eff('chat');
      if (!(yield* this.workFor(dur, 'chop'))) return;
      node.harvest();
      this.scene.recordWork(node.x, node.y);
      this.scene.sfx(node.kind === 'tree' ? 'treeFall' : 'bambooFall', node.x, node.y);
      const bonus = Math.floor(this.skills.chat.level / 3);
      this.carry = node.kind === 'tree' ? { res: 'go', amount: 4 + bonus } : { res: 'tre', amount: 4 + bonus };
      if (node.kind === 'bamboo') this.scene.notice(this, 'tre');
      this.gainXp('chat', 4);
    } finally {
      if (node.reservedBy === this) node.reservedBy = null;
    }
  }

  private *gather(): Beh {
    const node = this.scene.findNode(['banana'], this.x, this.y);
    if (!node) return yield* this.idle('Chuối chưa chín, đợi chút');
    node.reservedBy = this;
    try {
      this.status = 'Đi hái chuối';
      const stand = this.scene.standNear(node.tx, node.ty, this.x, this.y);
      if (!stand || !(yield* this.walkTo(stand.x, stand.y))) return;
      this.face(node.x);
      this.status = 'Đang hái chuối 🍌';
      if (!(yield* this.workFor(3 / this.eff('hai'), 'rustle', 0.7))) return;
      node.harvest();
      this.scene.recordWork(node.x, node.y);
      this.scene.sfx('pick', node.x, node.y);
      // Làng có rổ rá đan sẵn thì đựng được nhiều hơn.
      const basket = this.scene.state.res.doDan > 0 ? 1 : 0;
      this.carry = { res: 'chuoi', amount: 3 + Math.floor(this.skills.hai.level / 3) + basket };
      this.gainXp('hai', 3);
      this.scene.notice(this, 'hai');
    } finally {
      if (node.reservedBy === this) node.reservedBy = null;
    }
  }

  private *fish(): Beh {
    const spot = this.scene.findFishingSpot(this.x, this.y);
    if (!spot) return yield* this.idle('Bờ sông đông người quá');
    spot.reservedBy = this;
    try {
      this.status = 'Ra bờ sông câu cá';
      if (!(yield* this.walkTo(spot.x, spot.y))) return;
      this.face(spot.wx * TILE + TILE / 2);
      this.fishSpot = spot;
      let caught = 0;
      for (let i = 0; i < 3; i++) {
        this.status = 'Đang ngồi câu cá 🎣';
        this.scene.sfx('cast', this.x, this.y);
        if (!(yield* this.workFor(5 / this.eff('ca')))) break;
        const st = this.scene.state;
        const bonus = (st.fishBoost ? 0.3 : 0) + (st.raining ? 0.1 : 0);
        if (Math.random() < 0.4 + 0.05 * this.skills.ca.level + bonus) {
          caught++;
          this.scene.sfx('catch', this.x, this.y);
          this.scene.floatText(this.x, this.y - 48, '🐟', '#fff');
          this.gainXp('ca', 3);
        } else {
          this.scene.floatText(this.x, this.y - 48, '…', '#fff');
          this.gainXp('ca', 1);
        }
      }
      if (caught) {
        this.carry = { res: 'ca', amount: caught };
        this.scene.recordWork(this.x, this.y);
      }
      this.scene.notice(this, 'ca');
      if (caught >= 3) {
        this.addMood(5);
        this.say('Hôm nay cá cắn câu nhiều ghê! 🐟');
        this.remember('ca_nhieu', '🎣', 'Một buổi câu được nhiều cá', 1, { ca: 0.15 });
        this.scene.state.log(`🎣 ${this.name} câu được mẻ cá lớn`, { x: this.x, y: this.y });
      }
    } finally {
      spot.reservedBy = null;
      this.fishSpot = null;
    }
  }

  private *hunt(): Beh {
    const a = this.scene.findAnimal(this.x, this.y);
    if (!a) return yield* this.idle('Không thấy thú rừng nào');
    a.reservedBy = this;
    try {
      this.status = `Đi săn ${a.name} 🏹`;
      let misses = 0;
      let elapsed = 0;
      const dist = () => Phaser.Math.Distance.Between(this.x, this.y, a.x, a.y);
      while (a.alive && elapsed < 60 && !this.mustStop()) {
        if (dist() < 20) {
          this.status = `Đang vồ ${a.name}`;
          this.scene.sfx('pounce', this.x, this.y);
          let t = 0;
          const dur = 0.7 / this.eff('san');
          while (t < dur) {
            const dt: number = yield;
            t += dt;
            elapsed += dt;
            this.working = true;
          }
          if (!a.alive || dist() > 30) continue;
          const chance = Math.min(0.9, 0.3 + 0.07 * this.skills.san.level - (a.kind === 'heo' ? 0.1 : 0));
          if (Math.random() < chance) {
            a.kill();
            this.carry = { res: 'thit', amount: a.meat };
            this.scene.state.stats.hunted++;
            this.scene.recordWork(a.x, a.y);
            this.scene.sfx('caught', this.x, this.y);
            this.scene.floatText(this.x, this.y - 50, `Bắt được ${a.name}!`, '#ffe27a');
            this.scene.state.log(`🏹 ${this.name} săn được một con ${a.name}`, { x: this.x, y: this.y });
            this.gainXp('san', a.kind === 'heo' ? 8 : 5);
            this.scene.notice(this, 'san');
            if (a.kind === 'heo') {
              this.addMood(10);
              this.say('Săn được heo rừng! Tối nay cả nhà có thịt 😄');
              this.remember('san_heo', '🐗', 'Săn được một con heo rừng, tự hào lắm', 1, { san: 0.2 });
            }
            return;
          }
          misses++;
          this.gainXp('san', 1);
          a.startle(this.x, this.y);
          if (a.kind === 'heo' && Math.random() < 0.25 + (this.has('nhutNhat') ? 0.2 : 0) - (this.has('gan') ? 0.15 : 0)) {
            yield* this.gored(a.x, a.y);
            return;
          }
          this.scene.floatText(this.x, this.y - 50, 'Hụt rồi!', '#ffd0c0');
          if (misses >= 4) {
            this.status = 'Thú chạy mất rồi...';
            this.say('Chạy nhanh quá, thôi để lần sau');
            yield* this.wait(1.5);
            return;
          }
          continue;
        }
        this.status = `Đuổi theo ${a.name}`;
        const path = this.scene.findPath(this.tileX, this.tileY, a.tileX, a.tileY);
        if (!path) return;
        if (path.length <= 1) {
          // Đã sát bên: lao thẳng tới.
          let t = 0;
          while (t < 0.5 && dist() >= 18) {
            const dt: number = yield;
            t += dt;
            elapsed += dt;
            this.moveToward(a.x, a.y, dt, 1.25);
          }
          continue;
        }
        let close = false;
        for (const p of path.slice(0, 3)) {
          const px = p.x * TILE + TILE / 2;
          const py = p.y * TILE + TILE / 2;
          for (;;) {
            const dt: number = yield;
            elapsed += dt;
            const arrived = this.moveToward(px, py, dt, 1.25);
            if (dist() < 20) close = true;
            if (arrived || close) break;
          }
          if (close) break;
        }
      }
    } finally {
      if (a.reservedBy === this) a.reservedBy = null;
    }
  }

  /** Bị heo rừng húc: đau, sợ, và sẽ ngại đi săn một thời gian. */
  private *gored(fromX: number, fromY: number): Beh {
    this.energy = Math.max(0, this.energy - 15);
    this.addMood(-15);
    this.scene.sfx('grunt', this.x, this.y);
    this.scene.floatText(this.x, this.y - 50, '💥 Á!', '#ffb0a0');
    this.announce('Ối! Bị heo rừng húc đau quá 😣');
    this.remember('heo_huc', '🐗', 'Bị heo rừng húc, giờ sợ đi săn', 2, { san: -0.45 });
    this.scene.state.log(`🐗 ${this.name} bị heo rừng húc, chắc sẽ ngại đi săn mấy hôm`, { x: this.x, y: this.y });
    const d = Math.hypot(this.x - fromX, this.y - fromY) || 1;
    const nx = this.x + ((this.x - fromX) / d) * 18;
    const ny = this.y + ((this.y - fromY) / d) * 18;
    if (this.scene.world.walkable(Math.floor(nx / TILE), Math.floor(ny / TILE))) {
      let t = 0;
      while (t < 0.25) {
        const dt: number = yield;
        t += dt;
        this.x += (nx - this.x) * Math.min(1, dt * 12);
        this.y += (ny - this.y) * Math.min(1, dt * 12);
      }
    }
    this.status = 'Ngồi xoa chỗ đau...';
    yield* this.wait(2.5);
  }

  private *farm(): Beh {
    const s = this.scene;
    const f = s.findField(this.x, this.y);
    if (!f) return yield* this.idle('Lúa đang lớn, chờ ngày gặt 🌾');
    f.reservedBy = this;
    try {
      const reap = f.crop === 3;
      this.status = reap ? 'Ra đồng gặt lúa' : 'Ra đồng cấy lúa';
      if (!(yield* this.walkTo(f.entrance.x, f.entrance.y))) return;
      this.face(f.px);
      // Có trâu rảnh thì cày ruộng trước khi cấy: lúa lên nhanh, gặt nhiều thóc hơn.
      if (!reap && !f.plowed) {
        const buf = s.freeBuffalo(f.px, f.py);
        if (buf && !(yield* this.plowWith(f, buf)) && this.mustStop()) return;
      }
      this.status = reap ? 'Đang gặt lúa 🌾' : 'Đang cấy mạ 🌱';
      this.holding = reap ? '🌾' : '🌱';
      if (!(yield* this.workFor((reap ? 6 : 5) / this.eff('cay'), 'rustle', 0.6))) return;
      s.recordWork(f.px, f.py);
      if (reap) {
        const plowed = f.plowed;
        f.harvest();
        s.state.stats.harvested++;
        this.carry = { res: 'thoc', amount: 5 + Math.floor(this.skills.cay.level / 2) + (plowed ? 3 : 0) };
        if (plowed && Math.random() < 0.3) this.say('Ruộng trâu cày có khác, bông lúa chắc nịch 🐃');
        const straw = 3 + Math.floor(this.skills.cay.level / 3);
        s.state.add('rom', straw);
        s.state.stats.straw += straw;
        s.floatText(this.x, this.y - 48, `+${straw} ${RESOURCES.rom.icon}`);
        this.gainXp('cay', 5);
        this.addMood(3);
        if (s.state.stats.harvested === 1) {
          this.announce('Mùa gặt đầu tiên! Hạt thóc chắc mẩy ghê 🌾', 5000);
          s.state.log(`🌾 ${this.name} gặt mẻ lúa đầu tiên của làng`, { x: f.px, y: f.py });
        }
      } else {
        f.plant();
        this.gainXp('cay', 3);
      }
      s.notice(this, 'cay');
    } finally {
      this.holding = null;
      if (f.reservedBy === this) f.reservedBy = null;
    }
  }

  /** Dắt trâu ra kéo cày thửa ruộng trống; người cầm cày đi sau. Trả về true nếu cày xong. */
  private *plowWith(f: Building, buf: Buffalo): Step {
    buf.claim(this, 'plow');
    buf.field = f;
    try {
      this.status = 'Dắt trâu ra ruộng cày 🐃';
      let wait = 0;
      while (!buf.plowing && wait < 25) {
        wait += yield;
        if (this.mustStop()) return false;
      }
      if (!buf.plowing) return false;
      this.status = 'Theo trâu cày ruộng 🐃';
      if (!(yield* this.workFor(7 / this.eff('cay'), 'rustle', 0.9))) return false;
      f.plow();
      this.gainXp('cay', 2);
      if (!this.scene.state.stats.plowed++) {
        this.announce('Trâu kéo cày khoẻ ghê, đất tơi xốp cả rồi! 🐃', 5000);
        this.scene.state.log(`🐃 ${this.name} dắt trâu cày thửa ruộng đầu tiên`, { x: f.px, y: f.py });
      }
      return true;
    } finally {
      buf.release();
    }
  }

  /** Ngồi trước hiên nhà chẻ tre, vót nan, đan rổ rá, chằm nón lá. */
  private *weave(): Beh {
    const s = this.scene;
    const st = s.state;
    if (st.res.tre < 2) return yield* this.idle('Hết tre để đan rồi');
    const h = this.homeSpot();
    const tx = h.x + Phaser.Math.Between(-1, 1);
    const ty = h.y + Phaser.Math.Between(0, 1);
    this.status = 'Về hiên nhà ngồi đan lát';
    if (s.isFree(tx, ty)) yield* this.walkTo(tx, ty, 0.8);
    try {
      this.status = 'Chẻ tre, vót nan 🎋';
      this.holding = '🎋';
      if (!(yield* this.workFor(4 / this.eff('dan'), 'rustle', 1.1))) return;
      if (st.res.tre < 2) return;
      st.res.tre -= 2;
      const hat = Math.random() < 0.4;
      this.status = hat ? 'Chằm nón lá 👒' : 'Đan rổ rá, thúng mủng 🧺';
      this.holding = hat ? '👒' : '🧺';
      if (!(yield* this.workFor(5 / this.eff('dan'), 'rustle', 1.3))) return;
      const n = 1 + (Math.random() < this.skills.dan.level * 0.08 ? 1 : 0);
      this.gainXp('dan', 4);
      this.carry = { res: 'doDan', amount: n };
      if (!st.stats.woven) {
        this.announce(hat ? 'Chiếc nón lá đầu tiên, trắng tinh đẹp quá! 👒' : 'Cái rổ đầu tiên, nan đều tăm tắp! 🧺', 5000);
        st.log(`🧺 ${this.name} đan xong ${hat ? 'chiếc nón lá' : 'cái rổ'} đầu tiên của làng`, { x: this.x, y: this.y });
      }
      st.stats.woven += n;
    } finally {
      this.holding = null;
    }
  }

  private *pottery(): Beh {
    const s = this.scene;
    const st = s.state;
    const kiln = s.nearestBuilt('lo', this.x, this.y);
    if (!kiln) return yield* this.idle('Cần có Lò gốm');
    const bricks = s.wantsBricks();
    const clay = bricks ? 2 : 1;
    if (st.res.dat < s.clayNeed()) return yield* this.digClay();
    if (st.res.go < 1) return yield* this.idle('Hết củi để nung');
    this.status = 'Ra lò gốm';
    const stand = s.standNear(kiln.tx, kiln.ty, this.x, this.y);
    if (!stand || !(yield* this.walkTo(stand.x, stand.y))) return;
    this.face(kiln.px);
    try {
      this.status = bricks ? 'Đóng khuôn gạch, ngói 🧱' : 'Nặn đất sét 🏺';
      this.holding = '🤲';
      if (!(yield* this.workFor(5 / this.eff('nung'), 'rustle', 0.9))) return;
      if (st.res.dat < clay || st.res.go < 1) return;
      st.res.dat -= clay;
      st.res.go--;
      this.status = bricks ? 'Nung gạch ngói trong lò 🔥' : 'Nung gốm trong lò 🔥';
      this.holding = '🔥';
      if (!(yield* this.workFor(4 / this.eff('nung'), 'sizzle', 0.7))) return;
      this.gainXp('nung', 4);
      if (bricks) {
        const n = 3 + Math.floor(this.skills.nung.level / 3);
        st.stats.bricks += n;
        this.carry = { res: 'gach', amount: n };
        if (st.stats.bricks === n) {
          this.announce('Mẻ gạch ngói đầu tiên, đỏ au đẹp quá! 🧱', 5000);
          st.log(`🧱 ${this.name} nung được mẻ gạch ngói đầu tiên của làng`, { x: kiln.px, y: kiln.py });
        }
        return;
      }
      const n = 1 + (Math.random() < this.skills.nung.level * 0.08 ? 1 : 0);
      st.stats.pottery += n;
      this.carry = { res: 'gom', amount: n };
      if (st.stats.pottery === n) {
        this.announce('Mẻ gốm đầu tiên ra lò, đẹp quá! 🏺', 5000);
        st.log(`🏺 ${this.name} nung được mẻ gốm đầu tiên của làng`, { x: kiln.px, y: kiln.py });
      }
    } finally {
      this.holding = null;
    }
  }

  /** Ra bãi ven sông đào đất sét về cho lò. */
  private *digClay(): Beh {
    const node = this.scene.findNode(['clay'], this.x, this.y);
    if (!node) return yield* this.idle('Bãi đất sét chưa bồi lại, đợi chút');
    node.reservedBy = this;
    try {
      this.status = 'Ra bờ sông đào đất sét';
      const stand = this.scene.standNear(node.tx, node.ty, this.x, this.y);
      if (!stand || !(yield* this.walkTo(stand.x, stand.y))) return;
      this.face(node.x);
      this.status = 'Đang đào đất sét 🟤';
      this.holding = '🪏';
      if (!(yield* this.workFor(4 / this.eff('nung'), 'rustle', 0.8))) return;
      node.harvest();
      this.scene.recordWork(node.x, node.y);
      this.carry = { res: 'dat', amount: 4 + Math.floor(this.skills.nung.level / 3) };
      this.gainXp('nung', 2);
    } finally {
      this.holding = null;
      if (node.reservedBy === this) node.reservedBy = null;
    }
  }

  private *cook(): Beh {
    const st = this.scene.state.res;
    const fire = this.scene.nearestBuilt('lua', this.x, this.y);
    if (!fire) return yield* this.idle('Cần có Đống lửa để nướng 🔥');
    if (st.thit + st.ca + st.thoc <= 0) return yield* this.idle('Chờ có thịt, cá, thóc để nấu');

    const store = this.scene.nearestStorage(this.x, this.y);
    this.status = 'Ra kho lấy đồ nấu';
    if (store) yield* this.walkTo(store.entrance.x, store.entrance.y);
    const raw: ResKey[] = [];
    while (raw.length < 3) {
      const k = (['thit', 'ca', 'thoc'] as const).find((r) => st[r] > 0);
      if (!k) break;
      st[k]--;
      raw.push(k);
    }
    if (!raw.length) return;
    try {
      this.holding = RESOURCES[raw[0]].icon;
      this.status = 'Mang ra đống lửa';
      const stand = this.scene.standNear(fire.tx, fire.ty, this.x, this.y);
      if (!stand || !(yield* this.walkTo(stand.x, stand.y))) return;
      this.face(fire.px);
      while (raw.length) {
        this.holding = RESOURCES[raw[0]].icon;
        this.status = raw[0] === 'thit' ? 'Đang nướng thịt 🍖' : raw[0] === 'ca' ? 'Đang nướng cá 🐟' : 'Đang thổi cơm 🍚';
        if (!(yield* this.workFor(4 / this.eff('nau'), 'sizzle', 0.5))) return;
        const r = raw.shift();
        const out: ResKey = r === 'thit' ? 'thitNuong' : r === 'ca' ? 'caNuong' : 'com';
        const n = Math.random() < this.skills.nau.level * 0.05 ? 2 : 1;
        this.scene.state.add(out, n);
        this.scene.state.stats.cooked += n;
        this.scene.floatText(this.x, this.y - 48, `+${n} ${RESOURCES[out].icon}`);
        this.gainXp('nau', 3);
      }
    } finally {
      for (const r of raw) st[r]++;
      this.holding = null;
    }
  }

  private *build(): Beh {
    const site = this.scene.nearestSite(this.x, this.y);
    if (!site) return yield* this.idle('Chưa có công trình nào cần xây');
    const what = site.upgrading !== null ? `sửa ${site.name.toLowerCase()}` : `xây ${site.name.toLowerCase()}`;
    this.status = `Đi ${what}`;
    const stand = site.def.w === 1 ? this.scene.standNear(site.tx, site.ty, this.x, this.y) : site.entrance;
    if (!stand || !(yield* this.walkTo(stand.x, stand.y))) return;
    this.face(site.px);
    this.status = `Đang ${what} 🔨`;
    this.holding = '🔨';
    let acc = 0;
    let hammer = 0;
    try {
      while (site.isSite) {
        const dt: number = yield;
        this.working = true;
        site.addProgress(dt * this.eff('xay'));
        if ((hammer -= dt) <= 0) {
          hammer = 0.45;
          this.scene.sfx('hammer', this.x, this.y);
        }
        acc += dt;
        if (acc >= 3) {
          acc -= 3;
          this.gainXp('xay', 2);
        }
        if (this.mustStop()) return;
      }
      this.gainXp('xay', 4);
      this.addMood(5);
    } finally {
      this.holding = null;
    }
  }
}
