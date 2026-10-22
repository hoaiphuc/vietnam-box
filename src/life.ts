import type { JobId } from './data';

/** Tuổi tính theo năm: 12 tháng (12 vòng ngày đêm) mới thêm một tuổi. */
export const ADULT_AGE = 16;
export const ELDER_AGE = 60;
export const MARRY_AGE = 18;

export type Gender = 'nam' | 'nu';
export type Stage = 'be' | 'tre' | 'lon' | 'gia';

export const stageOf = (age: number): Stage => (age < 3 ? 'be' : age < ADULT_AGE ? 'tre' : age < ELDER_AGE ? 'lon' : 'gia');

export interface Palette {
  shirt: string;
  shirtDark: string;
  pants: string;
  /** Lớn lên có đội nón lá không. */
  hat: boolean;
}

const MALE_NAMES = ['Tám', 'Hùng', 'Dũng', 'Tài', 'Phúc', 'Lộc', 'Thọ', 'Minh', 'Tuấn', 'Bình', 'An', 'Khoa', 'Sơn', 'Hải', 'Long', 'Nam', 'Tú', 'Hiếu', 'Đức', 'Quang', 'Tâm', 'Vinh'];
const FEMALE_NAMES = ['Lan', 'Na', 'Hoa', 'Mai', 'Đào', 'Cúc', 'Hồng', 'Thảo', 'Ngọc', 'Hương', 'Hạnh', 'Yến', 'Nga', 'Thu', 'Vân', 'Linh', 'Trang', 'Nhung', 'Diệp', 'Xuân', 'Sen', 'Thắm'];

const MALE_SHIRTS = ['#7a5236', '#4f6d8f', '#5b7a4a', '#8a4b3a', '#3f5f6f', '#6b5a8a', '#8a7a4a'];
const FEMALE_SHIRTS = ['#9c72b5', '#c76b6b', '#5f8fbf', '#d49a4a', '#6aa38a', '#b5739c', '#e0d6c2'];
const PANTS = ['#2b2b2b', '#33302c', '#3b3f4a', '#3b6fb6', '#4a3a2c'];

const pick = <T>(a: T[]) => a[Math.floor(Math.random() * a.length)];

function darken(hex: string, k = 0.18) {
  const n = parseInt(hex.slice(1), 16);
  const c = [(n >> 16) & 255, (n >> 8) & 255, n & 255].map((v) => Math.round(v * (1 - k)));
  return `#${c.map((v) => v.toString(16).padStart(2, '0')).join('')}`;
}

export function palette(shirt: string, pants: string, hat: boolean): Palette {
  return { shirt, shirtDark: darken(shirt), pants, hat };
}

export function randomPalette(g: Gender): Palette {
  return palette(pick(g === 'nam' ? MALE_SHIRTS : FEMALE_SHIRTS), pick(PANTS), Math.random() < (g === 'nam' ? 0.6 : 0.75));
}

/** Tên chưa ai trong làng (còn sống) dùng. */
export function randomName(g: Gender, taken: Set<string>) {
  const pool = (g === 'nam' ? MALE_NAMES : FEMALE_NAMES).filter((n) => !taken.has(n));
  return pick(pool.length ? pool : g === 'nam' ? MALE_NAMES : FEMALE_NAMES);
}

/** Người già: ham nghỉ, ham lên miếu, ngại việc nặng. */
export const ELDER_AFF: Partial<Record<JobId, number>> = { nghi: 0.25, le: 0.25, chat: -0.2, san: -0.4, xay: -0.15 };
/** Trẻ con: ham chơi, chưa được đi săn. */
export const CHILD_AFF: Partial<Record<JobId, number>> = { san: -0.5, xay: -0.15, nghi: 0.2, hai: 0.1 };

/** Việc mà tuổi này làm được. */
export function canDo(stage: Stage, age: number, j: JobId) {
  if (stage === 'be') return j === 'nghi';
  if (stage === 'tre' && age < 8) return j === 'nghi' || j === 'hai' || j === 'ca';
  return true;
}
