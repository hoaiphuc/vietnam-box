/** Phát kiến: dân làng tự tìm ra trong lúc sống và làm việc, mở ra nghề và công trình mới. */
export type DiscId = 'ruong' | 'dan' | 'gom' | 'trau' | 'cho' | 'dinh';

export interface Discovery {
  name: string;
  icon: string;
  /** Mở ra được gì. */
  desc: string;
  /** Gợi ý khi chưa tìm ra. */
  hint: string;
}

export const DISCOVERIES: Record<DiscId, Discovery> = {
  ruong: {
    name: 'Trồng lúa nước',
    icon: '🌾',
    desc: 'Đắp ruộng, cấy mạ, gặt thóc rồi thổi cơm. Mưa xuống lúa lên nhanh, hạn hán thì lúa còi.',
    hint: 'Ai đó hái lượm hay câu cá ven sông có thể để ý thấy điều gì…',
  },
  dan: {
    name: 'Đan lát',
    icon: '🧺',
    desc: 'Chẻ tre vót nan, đan rổ rá, thúng mủng, chằm nón lá — đồ dùng trong nhà, mang ra chợ đổi được gạo.',
    hint: 'Ai đó chặt tre về, ngồi nghịch mấy nan tre thừa…',
  },
  trau: {
    name: 'Thuần trâu',
    icon: '🐃',
    desc: 'Con trâu là đầu cơ nghiệp: dựng chuồng nuôi trâu, trâu kéo cày cho ruộng lên nhanh, nhiều thóc; trẻ con dắt trâu đi chăn.',
    hint: 'Khi đã làm ruộng, ai đó đi săn trong rừng có thể gặp một chú nghé lạc mẹ…',
  },
  gom: {
    name: 'Làm gốm',
    icon: '🏺',
    desc: 'Nặn đất sét, nung trong lò thành chum vại, bát đĩa — để dùng và mang ra chợ đổi chác.',
    hint: 'Khi đã biết làm ruộng, một đôi tay nghịch đất bên sông hay ngoài đồng…',
  },
  cho: {
    name: 'Chợ phiên',
    icon: '🏮',
    desc: 'Cứ hai tháng họp chợ một phiên: người làng bên gánh hàng tới, đổi đồ gốm lấy gỗ và gạo.',
    hint: 'Khi làng đông người và có đồ gốm để bán…',
  },
  dinh: {
    name: 'Đình làng',
    icon: '🏯',
    desc: 'Nơi cả làng hội họp. Cứ bốn tháng mở hội làng một lần — trống chèo, đèn lồng, cả làng vui chơi.',
    hint: 'Khi làng đã đông đúc và có chợ phiên sầm uất…',
  },
};

export const DISC_ORDER: DiscId[] = ['ruong', 'dan', 'gom', 'trau', 'cho', 'dinh'];

/** Thời kỳ của làng — theo phát kiến "cao" nhất đã có (xem `ERA_OF`). */
export const ERAS = [
  { name: 'Thời hái lượm', icon: '🍌' },
  { name: 'Thời làm ruộng', icon: '🌾' },
  { name: 'Thời làng nghề', icon: '🧺' },
  { name: 'Thời ruộng sâu trâu nái', icon: '🐃' },
  { name: 'Thời chợ phiên', icon: '🏮' },
  { name: 'Thời đình làng', icon: '🏯' },
];

/** Mỗi phát kiến đưa làng tới thời kỳ nào. */
const ERA_OF: Record<DiscId, number> = { ruong: 1, dan: 2, gom: 2, trau: 3, cho: 4, dinh: 5 };

/** Chỉ số thời kỳ hiện tại của làng trong `ERAS`. */
export function eraIndex(discovered: Iterable<DiscId>) {
  let i = 0;
  for (const d of discovered) i = Math.max(i, ERA_OF[d]);
  return i;
}
