import type { DiscId } from './discoveries';

export type ResKey =
  | 'go'
  | 'tre'
  | 'rom'
  | 'dat'
  | 'gach'
  | 'thit'
  | 'ca'
  | 'chuoi'
  | 'thitNuong'
  | 'caNuong'
  | 'thoc'
  | 'com'
  | 'gom';

export interface ResInfo {
  name: string;
  icon: string;
  /** Lượng no bụng hồi lại khi ăn. Không có = không ăn được. */
  food?: number;
}

export const RESOURCES: Record<ResKey, ResInfo> = {
  go: { name: 'Gỗ', icon: '🪵' },
  tre: { name: 'Tre', icon: '🎋' },
  rom: { name: 'Rơm', icon: '🧹' },
  dat: { name: 'Đất sét', icon: '🟤' },
  gach: { name: 'Gạch ngói', icon: '🧱' },
  thit: { name: 'Thịt sống', icon: '🥩' },
  ca: { name: 'Cá tươi', icon: '🐟' },
  chuoi: { name: 'Chuối', icon: '🍌', food: 22 },
  thitNuong: { name: 'Thịt nướng', icon: '🍖', food: 55 },
  caNuong: { name: 'Cá nướng', icon: '🍢', food: 45 },
  thoc: { name: 'Thóc', icon: '🌾' },
  com: { name: 'Cơm', icon: '🍚', food: 45 },
  gom: { name: 'Đồ gốm', icon: '🏺' },
};

/** Vật liệu dựng nhà cửa, làm đồ dùng. */
export const MATERIAL_ORDER: ResKey[] = ['go', 'tre', 'rom', 'dat', 'gach', 'gom'];
/** Lương thực: đồ sống và đồ đã nấu. */
export const FOOD_RES_ORDER: ResKey[] = ['chuoi', 'thitNuong', 'caNuong', 'com', 'thit', 'ca', 'thoc'];
export const RES_ORDER: ResKey[] = [...MATERIAL_ORDER, ...FOOD_RES_ORDER];

/** Tài nguyên chỉ hiện khi làng đã có phát kiến tương ứng. */
export const RES_NEEDS: Partial<Record<ResKey, DiscId>> = {
  thoc: 'ruong',
  com: 'ruong',
  rom: 'ruong',
  gom: 'gom',
  dat: 'gom',
  gach: 'gom',
};

/** Giá vật liệu dạng HTML: mỗi món "16 🪵" là một khối không bị ngắt dòng. */
export function costText(cost: Partial<Record<ResKey, number>>, sep = ' ') {
  return (Object.keys(cost) as ResKey[]).map((k) => `<i>${cost[k]}${RESOURCES[k].icon}</i>`).join(sep);
}

/** "16 gỗ, 8 tre" cho một giá vật liệu. */
export function costWords(cost: Partial<Record<ResKey, number>>) {
  return (Object.keys(cost) as ResKey[]).map((k) => `${cost[k]} ${RESOURCES[k].name.toLowerCase()}`).join(', ');
}

/** Thứ tự ưu tiên khi ăn. */
export const FOOD_ORDER: ResKey[] = ['thitNuong', 'com', 'caNuong', 'chuoi'];

export type JobId = 'nghi' | 'chat' | 'san' | 'ca' | 'hai' | 'cay' | 'nau' | 'nung' | 'xay' | 'le';

export const JOBS: Record<JobId, { name: string; icon: string; desc: string }> = {
  nghi: { name: 'Nghỉ ngơi', icon: '🍵', desc: 'Thong thả dạo quanh nhà, hồi sức.' },
  chat: { name: 'Chặt cây', icon: '🪓', desc: 'Đốn cây lấy gỗ, chặt tre về dựng nhà.' },
  san: { name: 'Săn bắt', icon: '🏹', desc: 'Bắt gà rừng, heo rừng lấy thịt.' },
  ca: { name: 'Đánh cá', icon: '🎣', desc: 'Ra bờ sông câu cá.' },
  hai: { name: 'Hái lượm', icon: '🧺', desc: 'Hái chuối quanh làng và ven sông.' },
  cay: { name: 'Làm ruộng', icon: '🌾', desc: 'Cấy lúa, gặt thóc ngoài ruộng — gặt xong còn có rơm.' },
  nau: { name: 'Nấu nướng', icon: '🔥', desc: 'Nướng thịt cá, thổi cơm bên đống lửa.' },
  nung: { name: 'Làm gốm', icon: '🏺', desc: 'Đào đất sét ven sông, nung gốm và gạch ngói ở lò.' },
  xay: { name: 'Xây dựng', icon: '🔨', desc: 'Dựng nhà, đóng lửa, làm kho.' },
  le: { name: 'Thắp hương', icon: '🙏', desc: 'Ra miếu thắp hương, cầu khấn Thành Hoàng.' },
};

/** Nghề chỉ làm được khi làng đã có phát kiến tương ứng. */
export const JOB_NEEDS: Partial<Record<JobId, DiscId>> = { cay: 'ruong', nung: 'gom' };

/** Các việc có thể báo mộng. */
export const JOB_ORDER: JobId[] = ['nghi', 'chat', 'san', 'ca', 'hai', 'cay', 'nau', 'nung', 'xay'];
/** Mọi hoạt động dân làng tự cân nhắc. */
export const ACT_ORDER: JobId[] = [...JOB_ORDER, 'le'];
export const SKILL_JOBS: JobId[] = ['chat', 'san', 'ca', 'hai', 'cay', 'nau', 'nung', 'xay'];

export type BuildingId = 'lua' | 'nha' | 'kho' | 'mieu' | 'ruong' | 'lo' | 'cho' | 'dinh';

export interface BuildingDef {
  name: string;
  icon: string;
  desc: string;
  w: number;
  h: number;
  cost: Partial<Record<ResKey, number>>;
  /** Số "giây công" cần để xây xong (ở hiệu suất 1.0). */
  work: number;
  tex: string;
  /** Độ lệch dọc của sprite so với mép dưới ô. */
  oy: number;
  storage?: boolean;
  home?: boolean;
  cook?: boolean;
  shrine?: boolean;
  /** Nằm sát mặt đất (ruộng) — vẽ dưới người và cây cối. */
  flat?: boolean;
  /** Cần phát kiến này mới xây được. */
  needs?: DiscId;
}

export const BUILDINGS: Record<BuildingId, BuildingDef> = {
  lua: {
    name: 'Đống lửa',
    icon: '🔥',
    desc: 'Nướng thịt, nướng cá. Ấm áp khi đêm về.',
    w: 1,
    h: 1,
    cost: { go: 8 },
    work: 8,
    tex: 'lua',
    oy: -4,
    cook: true,
  },
  kho: {
    name: 'Kho chứa',
    icon: '📦',
    desc: 'Chỗ cất đồ gần nơi làm việc, đỡ phải đi xa.',
    w: 2,
    h: 2,
    cost: { go: 14, tre: 6 },
    work: 20,
    tex: 'kho',
    oy: 6,
    storage: true,
  },
  nha: {
    name: 'Nhà ở',
    icon: '🛖',
    desc: 'Mái nhà để ngủ và cất đồ. Kiểu nhà đổi theo thời kỳ của làng.',
    w: 2,
    h: 2,
    cost: { go: 6, tre: 14 },
    work: 30,
    tex: 'nha0',
    oy: 6,
    storage: true,
    home: true,
  },
  mieu: {
    name: 'Miếu Thành Hoàng',
    icon: '⛩️',
    desc: 'Nơi dân làng thắp hương, cầu khấn. Mỗi nén hương thêm điểm Phúc.',
    w: 1,
    h: 1,
    cost: { go: 10, tre: 5 },
    work: 14,
    tex: 'mieu',
    oy: -2,
    shrine: true,
  },
  ruong: {
    name: 'Ruộng lúa',
    icon: '🌾',
    desc: 'Cấy lúa, gặt thóc. Mưa xuống lúa lên nhanh, hạn hán thì lúa còi.',
    w: 2,
    h: 2,
    cost: { tre: 4 },
    work: 8,
    tex: 'ruong0',
    oy: 0,
    flat: true,
    needs: 'ruong',
  },
  lo: {
    name: 'Lò gốm',
    icon: '🏺',
    desc: 'Nung đất sét thành chum vại, bát đĩa, gạch ngói. Mỗi mẻ tốn một ít củi.',
    w: 1,
    h: 1,
    cost: { go: 12, tre: 4 },
    work: 16,
    tex: 'lo',
    oy: -2,
    needs: 'gom',
  },
  cho: {
    name: 'Chợ phiên',
    icon: '🏮',
    desc: 'Hai ngày họp một phiên: đổi đồ gốm lấy gỗ, tre và gạo của làng bên.',
    w: 2,
    h: 2,
    cost: { go: 14, tre: 10, gach: 6 },
    work: 22,
    tex: 'cho',
    oy: 4,
    needs: 'cho',
  },
  dinh: {
    name: 'Đình làng',
    icon: '🏯',
    desc: 'Nơi cả làng hội họp. Bốn ngày mở hội làng một lần.',
    w: 2,
    h: 2,
    cost: { go: 30, gach: 24, dat: 6 },
    work: 40,
    tex: 'dinh',
    oy: 6,
    needs: 'dinh',
  },
};

export const BUILD_ORDER: BuildingId[] = ['lua', 'mieu', 'kho', 'nha', 'ruong', 'lo', 'cho', 'dinh'];

export type Cost = Partial<Record<ResKey, number>>;

export interface HouseTier {
  name: string;
  icon: string;
  tex: string;
  desc: string;
  /** Giá dựng mới. */
  cost: Cost;
  /** Cần phát kiến này mới dựng được kiểu nhà này. */
  needs?: DiscId;
}

/** Nhà ở qua các thời kỳ: làng biết thêm nghề thì dựng được nhà tốt hơn, nhà cũ cũng dần được sửa lại. */
export const HOUSE_TIERS: HouseTier[] = [
  {
    name: 'Lều tre',
    icon: '⛺',
    tex: 'nha0',
    desc: 'Khung tre, vách phên, mái lợp lá — chỗ ở tạm của buổi đầu khai hoang.',
    cost: { go: 6, tre: 14 },
  },
  {
    name: 'Nhà tranh',
    icon: '🛖',
    tex: 'nha1',
    desc: 'Vách đất trộn rơm, mái tranh dày — ấm áp, vững chãi hơn hẳn.',
    cost: { go: 14, tre: 10, rom: 12 },
    needs: 'ruong',
  },
  {
    name: 'Nhà gỗ mái ngói',
    icon: '🏠',
    tex: 'nha2',
    desc: 'Khung gỗ chắc, mái ngói đỏ — không còn lo dột mỗi mùa mưa.',
    cost: { go: 24, tre: 4, gach: 12 },
    needs: 'gom',
  },
  {
    name: 'Nhà gạch ba gian',
    icon: '🏡',
    tex: 'nha3',
    desc: 'Tường gạch, mái ngói, ba gian hai chái — nếp nhà của làng đã khá giả.',
    cost: { go: 16, gach: 30 },
    needs: 'cho',
  },
];

/** Kiểu nhà tốt nhất làng đã biết dựng. */
export function bestHouseTier(has: (d: DiscId) => boolean) {
  let best = 0;
  HOUSE_TIERS.forEach((t, i) => {
    if (!t.needs || has(t.needs)) best = i;
  });
  return best;
}

/** Sửa nhà cũ lên kiểu mới: tận dụng được khung cũ nên rẻ hơn dựng mới. */
export function upgradeCost(tier: number): Cost {
  const out: Cost = {};
  for (const [k, n] of Object.entries(HOUSE_TIERS[tier].cost) as [ResKey, number][]) out[k] = Math.ceil(n * 0.75);
  return out;
}
