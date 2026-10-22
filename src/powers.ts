export type PowerId = 'mua' | 'loc' | 'ca' | 'tha' | 'phuho';

export interface PowerDef {
  name: string;
  icon: string;
  desc: string;
  /** Điểm Phúc phải bỏ ra. */
  cost: number;
  /** none: dùng ngay; point: chọn một chỗ trên bản đồ; villager: chọn một người. */
  target: 'none' | 'point' | 'villager';
  /** Bán kính tác dụng (ô) khi chọn chỗ. */
  radius?: number;
}

export const POWERS: Record<PowerId, PowerDef> = {
  mua: { name: 'Gọi mưa', icon: '🌧️', desc: 'Một cơn mưa rào: cây cối, chuối, tre mọc lại nhanh gấp 6.', cost: 25, target: 'none' },
  loc: { name: 'Ban lộc', icon: '🍌', desc: 'Cây cối, chuối trong vùng chọn tốt tươi, chín ngay.', cost: 15, target: 'point', radius: 3.5 },
  ca: { name: 'Cá về', icon: '🐟', desc: 'Cá về đầy sông suốt một tháng, câu dễ trúng hơn hẳn.', cost: 20, target: 'none' },
  tha: { name: 'Thả thú', icon: '🐓', desc: 'Thả gà rừng và heo rừng vào chỗ chọn.', cost: 15, target: 'point', radius: 1.5 },
  phuho: { name: 'Phù hộ', icon: '✨', desc: 'Một người khoẻ khoắn, no đủ, vui vẻ hẳn lên.', cost: 20, target: 'villager' },
};

export const POWER_ORDER: PowerId[] = ['mua', 'loc', 'ca', 'tha', 'phuho'];

/** Giá điểm Phúc của một lần báo mộng. */
export const DREAM_COST = 5;

export type WishType = 'mua' | 'loc' | 'ca' | 'thu' | 'khoe';

/** Lời cầu khấn và quyền năng đáp ứng được nó. */
export const WISHES: Record<WishType, { text: string; power: PowerId }> = {
  mua: { text: 'Cầu trời mưa cho cây cối tốt tươi', power: 'mua' },
  loc: { text: 'Cầu cho cây trái sai quả, nhà đủ cái ăn', power: 'loc' },
  ca: { text: 'Cầu cho cá về đầy sông', power: 'ca' },
  thu: { text: 'Cầu cho thú rừng sinh sôi', power: 'tha' },
  khoe: { text: 'Cầu cho mau khoẻ, vui vẻ trở lại', power: 'phuho' },
};
