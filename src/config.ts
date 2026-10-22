export const TILE = 32;
export const MAP_W = 72;
export const MAP_H = 48;

/** Số giây thực (ở tốc độ x1) cho một vòng ngày đêm — mỗi vòng là một tháng trong lịch làng. */
export const DAY_LENGTH = 300;
/** 12 tháng là một năm: dân làng thêm một tuổi. */
export const MONTHS_PER_YEAR = 12;
export const YEAR_LENGTH = DAY_LENGTH * MONTHS_PER_YEAR;

/** Đổi xác suất xảy ra trong một năm thành xác suất mỗi tháng. */
export const perMonth = (pYear: number) => 1 - Math.pow(1 - Math.min(1, pYear), 1 / MONTHS_PER_YEAR);
export const START_HOUR = 6;

/** Tốc độ giảm/hồi chỉ số mỗi giây game. */
export const HUNGER_RATE = 100 / (DAY_LENGTH * 0.9);
export const ENERGY_DRAIN = 100 / (DAY_LENGTH * 0.85);
export const SLEEP_RATE = 100 / (DAY_LENGTH * 0.3);

export const MAX_DARK = 0.6;

export const FONT = '"Be Vietnam Pro", system-ui, sans-serif';
