import type { SfxId } from './audio/sfx';

/** Người nói: Thành Hoàng, hoặc một người trong gia đình lập làng (theo tên gọi). */
export type Speaker = 'thanhHoang' | 'Tám' | 'Lan' | 'Na';

/** Góc máy: vùng đất hoang quanh làng, hoặc cận cảnh gia đình vừa tới. */
export type StoryShot = 'land' | 'family';

export interface StoryLine {
  who: Speaker;
  text: string;
  /** Đổi góc máy khi câu này bắt đầu. */
  shot?: StoryShot;
  sfx?: SfxId;
}

export const SPEAKER_NAMES: Record<Speaker, string> = {
  thanhHoang: 'Thành Hoàng',
  Tám: 'Bố Tám',
  Lan: 'Mẹ Lan',
  Na: 'Bé Na',
};

/** Đoạn mở đầu: Thành Hoàng thức giấc khi gia đình đầu tiên về vùng đất hoang. */
export const OPENING: StoryLine[] = [
  { who: 'thanhHoang', shot: 'land', text: 'Đã bao nhiêu mùa nước lên rồi lại xuống… Vùng đất bên sông này chỉ còn có gió, có cỏ, và ta.' },
  { who: 'thanhHoang', text: 'Miếu cũ đổ từ lâu, khói hương cũng tắt. Chẳng còn ai nhớ nơi đây từng có một vị thần trông coi.' },
  { who: 'thanhHoang', shot: 'family', text: 'Thế mà hôm nay… có tiếng chân người.' },
  { who: 'Tám', text: 'Đất này tốt đấy mình ạ. Gần sông có cá, sau lưng có rừng, đủ gỗ dựng nhà.' },
  { who: 'Lan', text: 'Vắng thì có vắng thật. Nhưng chẳng hiểu sao em thấy yên lòng lạ lắm.' },
  { who: 'Na', text: 'Bố ơi, mẹ ơi! Con vừa thấy một ông đội mũ có hai cánh, râu dài, đứng ở gốc cây đằng kia!' },
  { who: 'Tám', text: 'Chốn này làm gì có ai hả con, chắc con hoa mắt rồi. Nào, dỡ đồ xuống, cả nhà mình dựng chỗ ở trước khi trời tối.' },
  { who: 'thanhHoang', text: 'Đứa trẻ ấy nhìn thấy ta… Đã lâu lắm rồi mới có người nhìn thấy ta.' },
  { who: 'thanhHoang', sfx: 'bless', text: 'Được. Từ nay ta lại làm Thành Hoàng của nơi này — che mưa, chắn gió, giữ cho bếp lửa nhà họ không bao giờ tắt.' },
  { who: 'thanhHoang', text: 'Họ sẽ tự sống theo cách của họ. Còn ta, chỉ lặng lẽ dõi theo… và ra tay khi họ cần.' },
];
