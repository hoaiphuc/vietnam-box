import type { GameScene } from './scenes/GameScene';

export interface Quest {
  id: string;
  text: string;
  check: (s: GameScene) => boolean;
}

export const QUESTS: Quest[] = [
  { id: 'wood', text: 'Chặt được 20 gỗ', check: (s) => s.state.stats.wood >= 20 },
  { id: 'fire', text: 'Dựng một Đống lửa', check: (s) => s.state.stats.built.lua >= 1 },
  { id: 'hunt', text: 'Săn được thú rừng', check: (s) => s.state.stats.hunted >= 1 },
  { id: 'fish', text: 'Câu được 5 con cá', check: (s) => s.state.stats.fish >= 5 },
  { id: 'cook', text: 'Nướng 5 món ăn', check: (s) => s.state.stats.cooked >= 5 },
  { id: 'learn', text: 'Bé Na học xong một nghề', check: (s) => s.villagers.some((v) => v.def.child && Object.values(v.skills).some((k) => k.level >= 2)) },
  { id: 'kho', text: 'Xây Kho chứa', check: (s) => s.state.stats.built.kho >= 1 },
  { id: 'nha', text: 'Dựng thêm một Nhà tranh', check: (s) => s.state.stats.built.nha >= 1 },
  { id: 'master', text: 'Một người đạt cấp 5', check: (s) => s.villagers.some((v) => Object.values(v.skills).some((k) => k.level >= 5)) },
];
