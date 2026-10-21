/** Phát kiến: dân làng tự tìm ra trong lúc sống và làm việc, mở ra nghề và công trình mới. */
export type DiscId = 'ruong' | 'gom' | 'cho' | 'dinh';

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
  gom: {
    name: 'Làm gốm',
    icon: '🏺',
    desc: 'Nặn đất sét, nung trong lò thành chum vại, bát đĩa — để dùng và mang ra chợ đổi chác.',
    hint: 'Khi đã biết làm ruộng, một đôi tay nghịch đất bên sông hay ngoài đồng…',
  },
  cho: {
    name: 'Chợ phiên',
    icon: '🏮',
    desc: 'Cứ hai ngày họp chợ một phiên: người làng bên gánh hàng tới, đổi đồ gốm lấy gỗ và gạo.',
    hint: 'Khi làng đông người và có đồ gốm để bán…',
  },
  dinh: {
    name: 'Đình làng',
    icon: '🏯',
    desc: 'Nơi cả làng hội họp. Cứ bốn ngày mở hội làng một lần — trống chèo, đèn lồng, cả làng vui chơi.',
    hint: 'Khi làng đã đông đúc và có chợ phiên sầm uất…',
  },
};

export const DISC_ORDER: DiscId[] = ['ruong', 'gom', 'cho', 'dinh'];

/** Thời kỳ của làng — đi theo số phát kiến đã có. */
export const ERAS = [
  { name: 'Thời hái lượm', icon: '🍌' },
  { name: 'Thời làm ruộng', icon: '🌾' },
  { name: 'Thời làng nghề', icon: '🏺' },
  { name: 'Thời chợ phiên', icon: '🏮' },
  { name: 'Thời đình làng', icon: '🏯' },
];
