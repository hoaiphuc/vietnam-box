import type { JobId } from './data';

export type TraitId =
  | 'sieng'
  | 'luoi'
  | 'thamAn'
  | 'toMo'
  | 'nhutNhat'
  | 'gan'
  | 'meCa'
  | 'kheoTay'
  | 'yeuThienNhien'
  | 'khoeManh'
  | 'vuiTinh'
  | 'buongBinh'
  | 'cuDem';

export interface Trait {
  name: string;
  icon: string;
  desc: string;
  /** Mức yêu/ghét từng việc (cộng vào điểm khi tự chọn việc). */
  aff?: Partial<Record<JobId, number>>;
  conflicts?: TraitId[];
}

export const TRAITS: Record<TraitId, Trait> = {
  sieng: {
    name: 'Siêng năng',
    icon: '💪',
    desc: 'Thích làm việc, ít khi chịu ngồi không.',
    aff: { chat: 0.12, san: 0.12, ca: 0.12, hai: 0.12, nau: 0.12, xay: 0.12, nghi: -0.25 },
    conflicts: ['luoi'],
  },
  luoi: {
    name: 'Lười biếng',
    icon: '😴',
    desc: 'Hay kiếm cớ nghỉ ngơi, khó nghe lời báo mộng.',
    aff: { nghi: 0.3, chat: -0.1, xay: -0.1 },
    conflicts: ['sieng'],
  },
  thamAn: { name: 'Tham ăn', icon: '🍖', desc: 'Mau đói, thích nướng đồ ăn.', aff: { nau: 0.2, hai: 0.1 } },
  toMo: { name: 'Tò mò', icon: '🔎', desc: 'Học nghề nhanh hơn, dễ nghe theo báo mộng.' },
  nhutNhat: { name: 'Nhút nhát', icon: '🙈', desc: 'Sợ thú rừng, ngại đi săn.', aff: { san: -0.4 }, conflicts: ['gan'] },
  gan: { name: 'Gan dạ', icon: '🦁', desc: 'Không ngại săn thú lớn, ít bị heo húc.', aff: { san: 0.3 }, conflicts: ['nhutNhat'] },
  meCa: { name: 'Mê câu cá', icon: '🎣', desc: 'Ngồi bờ sông cả ngày không chán.', aff: { ca: 0.4 } },
  kheoTay: { name: 'Khéo tay', icon: '🧵', desc: 'Giỏi xây dựng và nấu nướng.', aff: { xay: 0.25, nau: 0.15 } },
  yeuThienNhien: {
    name: 'Yêu thiên nhiên',
    icon: '🌿',
    desc: 'Thích hái lượm, không nỡ chặt cây.',
    aff: { hai: 0.3, chat: -0.2, nghi: 0.1 },
  },
  khoeManh: { name: 'Khoẻ mạnh', icon: '🏋️', desc: 'Chặt cây giỏi, lâu mệt.', aff: { chat: 0.25, xay: 0.1 } },
  vuiTinh: { name: 'Vui tính', icon: '😄', desc: 'Lúc nào cũng vui vẻ, ít buồn.' },
  buongBinh: { name: 'Bướng bỉnh', icon: '😤', desc: 'Ít khi chịu nghe lời báo mộng.' },
  cuDem: { name: 'Cú đêm', icon: '🦉', desc: 'Hay thức khuya: tối ra nằm võng trước nhà, hoặc soi đuốc ra bờ sông bắt ếch.' },
};

/** Chọn thêm `n` nét tính cách ngẫu nhiên, không trùng và không mâu thuẫn. */
export function rollTraits(fixed: TraitId[], n: number): TraitId[] {
  const out = [...fixed];
  const pool = (Object.keys(TRAITS) as TraitId[]).filter((t) => !out.includes(t));
  while (n > 0 && pool.length) {
    const t = pool.splice(Math.floor(Math.random() * pool.length), 1)[0];
    if (out.some((o) => TRAITS[o].conflicts?.includes(t) || TRAITS[t].conflicts?.includes(o))) continue;
    out.push(t);
    n--;
  }
  return out;
}
