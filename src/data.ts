export type ResKey = 'go' | 'thit' | 'ca' | 'chuoi' | 'thitNuong' | 'caNuong';

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
};

export const RES_ORDER: ResKey[] = ['go', 'chuoi', 'thit', 'ca', 'thitNuong', 'caNuong'];

/** Thứ tự ưu tiên khi ăn. */
export const FOOD_ORDER: ResKey[] = ['thitNuong', 'caNuong', 'chuoi'];

export type JobId = 'nghi' | 'chat' | 'san' | 'ca' | 'hai' | 'nau' | 'xay' | 'le';

export const JOBS: Record<JobId, { name: string; icon: string; desc: string }> = {
  nghi: { name: 'Nghỉ ngơi', icon: '🍵', desc: 'Thong thả dạo quanh nhà, hồi sức.' },
  chat: { name: 'Chặt cây', icon: '🪓', desc: 'Đốn cây, chặt tre lấy gỗ.' },
  san: { name: 'Săn bắt', icon: '🏹', desc: 'Bắt gà rừng, heo rừng lấy thịt.' },
  ca: { name: 'Đánh cá', icon: '🎣', desc: 'Ra bờ sông câu cá.' },
  hai: { name: 'Hái lượm', icon: '🧺', desc: 'Hái chuối quanh làng và ven sông.' },
  nau: { name: 'Nướng đồ ăn', icon: '🔥', desc: 'Nướng thịt, cá bên đống lửa.' },
  xay: { name: 'Xây dựng', icon: '🔨', desc: 'Dựng nhà, đóng lửa, làm kho.' },
  le: { name: 'Thắp hương', icon: '🙏', desc: 'Ra miếu thắp hương, cầu khấn Thành Hoàng.' },
};

/** Các việc có thể báo mộng. */
export const JOB_ORDER: JobId[] = ['nghi', 'chat', 'san', 'ca', 'hai', 'nau', 'xay'];
/** Mọi hoạt động dân làng tự cân nhắc. */
export const ACT_ORDER: JobId[] = [...JOB_ORDER, 'le'];
export const SKILL_JOBS: JobId[] = ['chat', 'san', 'ca', 'hai', 'nau', 'xay'];

export type BuildingId = 'lua' | 'nha' | 'kho' | 'mieu';

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
};

export const BUILD_ORDER: BuildingId[] = ['lua', 'mieu', 'kho', 'nha'];
