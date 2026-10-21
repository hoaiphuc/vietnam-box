import type { DiscId } from './discoveries';

export type ResKey = 'go' | 'thit' | 'ca' | 'chuoi' | 'thitNuong' | 'caNuong' | 'thoc' | 'com' | 'gom';

export interface ResInfo {
  name: string;
  icon: string;
  /** Lượng no bụng hồi lại khi ăn. Không có = không ăn được. */
  food?: number;
}

export const RESOURCES: Record<ResKey, ResInfo> = {
  go: { name: 'Gỗ', icon: '🪵' },
  thit: { name: 'Thịt sống', icon: '🥩' },
  ca: { name: 'Cá tươi', icon: '🐟' },
  chuoi: { name: 'Chuối', icon: '🍌', food: 22 },
  thitNuong: { name: 'Thịt nướng', icon: '🍖', food: 55 },
  caNuong: { name: 'Cá nướng', icon: '🍢', food: 45 },
  thoc: { name: 'Thóc', icon: '🌾' },
  com: { name: 'Cơm', icon: '🍚', food: 45 },
  gom: { name: 'Đồ gốm', icon: '🏺' },
};

export const RES_ORDER: ResKey[] = ['go', 'chuoi', 'thit', 'ca', 'thoc', 'thitNuong', 'caNuong', 'com', 'gom'];

/** Tài nguyên chỉ hiện khi làng đã có phát kiến tương ứng. */
export const RES_NEEDS: Partial<Record<ResKey, DiscId>> = { thoc: 'ruong', com: 'ruong', gom: 'gom' };

/** Thứ tự ưu tiên khi ăn. */
export const FOOD_ORDER: ResKey[] = ['thitNuong', 'com', 'caNuong', 'chuoi'];

export type JobId = 'nghi' | 'chat' | 'san' | 'ca' | 'hai' | 'cay' | 'nau' | 'nung' | 'xay' | 'le';

export const JOBS: Record<JobId, { name: string; icon: string; desc: string }> = {
  nghi: { name: 'Nghỉ ngơi', icon: '🍵', desc: 'Thong thả dạo quanh nhà, hồi sức.' },
  chat: { name: 'Chặt cây', icon: '🪓', desc: 'Đốn cây, chặt tre lấy gỗ.' },
  san: { name: 'Săn bắt', icon: '🏹', desc: 'Bắt gà rừng, heo rừng lấy thịt.' },
  ca: { name: 'Đánh cá', icon: '🎣', desc: 'Ra bờ sông câu cá.' },
  hai: { name: 'Hái lượm', icon: '🧺', desc: 'Hái chuối quanh làng và ven sông.' },
  cay: { name: 'Làm ruộng', icon: '🌾', desc: 'Cấy lúa, gặt thóc ngoài ruộng.' },
  nau: { name: 'Nấu nướng', icon: '🔥', desc: 'Nướng thịt cá, thổi cơm bên đống lửa.' },
  nung: { name: 'Làm gốm', icon: '🏺', desc: 'Nặn đất sét, nung gốm ở lò.' },
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
    cost: { go: 20 },
    work: 20,
    tex: 'kho',
    oy: 6,
    storage: true,
  },
  nha: {
    name: 'Nhà tranh',
    icon: '🛖',
    desc: 'Mái nhà tranh để ngủ và cất đồ.',
    w: 2,
    h: 2,
    cost: { go: 30 },
    work: 30,
    tex: 'nha',
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
    cost: { go: 15 },
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
    cost: { go: 6 },
    work: 8,
    tex: 'ruong0',
    oy: 0,
    flat: true,
    needs: 'ruong',
  },
  lo: {
    name: 'Lò gốm',
    icon: '🏺',
    desc: 'Nung đất sét thành chum vại, bát đĩa. Mỗi mẻ tốn một ít củi.',
    w: 1,
    h: 1,
    cost: { go: 18 },
    work: 16,
    tex: 'lo',
    oy: -2,
    needs: 'gom',
  },
  cho: {
    name: 'Chợ phiên',
    icon: '🏮',
    desc: 'Hai ngày họp một phiên: đổi đồ gốm lấy gỗ và gạo của làng bên.',
    w: 2,
    h: 2,
    cost: { go: 25 },
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
    cost: { go: 45 },
    work: 40,
    tex: 'dinh',
    oy: 6,
    needs: 'dinh',
  },
};

export const BUILD_ORDER: BuildingId[] = ['lua', 'mieu', 'kho', 'nha', 'ruong', 'lo', 'cho', 'dinh'];
