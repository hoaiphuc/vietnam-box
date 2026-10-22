import type { BuildingId, JobId, ResKey } from './data';
import type { DiscId } from './discoveries';
import type { Memory, JournalEntry, Skill, VillagerDef } from './entities/Villager';
import type { WishType } from './powers';
import type { HistoryEntry } from './state';
import type { Pt } from './world/pathfinding';

/** Ván chơi lưu trong trình duyệt (bản tải về cũng dùng localStorage của Electron). */
const SAVE_KEY = 'langque.save';
/** Đổi định dạng thì tăng số này; bản lưu cũ khác số sẽ bị bỏ qua. */
const SAVE_VERSION = 1;

export interface SavedState {
  res: Record<ResKey, number>;
  discovered: DiscId[];
  seenRes: ResKey[];
  drought: boolean;
  lastRain: number;
  time: number;
  stats: Record<string, unknown>;
  phuc: number;
  phucMax: number;
  rainUntil: number;
  fishUntil: number;
  history: HistoryEntry[];
}

export interface SavedBuilding {
  id: BuildingId;
  tx: number;
  ty: number;
  built: boolean;
  planned: boolean;
  progress: number;
  tier: number;
  upgrading: number | null;
  crop: number;
  growth: number;
  /** Có từ khi có trâu cày (bản lưu cũ không có). */
  plowed?: boolean;
}

/** Cây / bụi tre / chuối / đất sét đã khai thác, đang chờ mọc lại. */
export interface SavedNode {
  x: number;
  y: number;
  timer: number;
}

export interface SavedVillager {
  def: VillagerDef;
  x: number;
  y: number;
  hunger: number;
  energy: number;
  mood: number;
  activity: JobId;
  skills: Record<JobId, Skill>;
  carry: { res: ResKey; amount: number } | null;
  memories: Memory[];
  journal: JournalEntry[];
  thought: string;
  intent: { job: JobId; until: number } | null;
  dreamReadyAt: number;
  wish: { type: WishType; text: string; until: number } | null;
  /** Người thân, nhà, tình cảm: lưu theo id người / chỉ số công trình. */
  spouse: string | null;
  parents: string[];
  children: string[];
  home: number | null;
  needsHome: boolean;
  bonds: [string, number][];
  alive: boolean;
  deathTime: number;
  lastPray: number;
  prefs: Record<JobId, number>;
  owlBedtime: number;
}

export interface SaveData {
  version: number;
  savedAt: number;
  seed: number;
  state: SavedState;
  world: {
    idCounter: number;
    migrantAt: number;
    lastMigrant: number;
    graves: Pt[];
    rainAt: number;
    droughtSince: number;
    firstRipe: boolean;
    banhChung: boolean;
    chief: string | null;
    workSpots: Pt[];
  };
  buildings: SavedBuilding[];
  nodes: SavedNode[];
  villagers: SavedVillager[];
  departed: SavedVillager[];
}

export function writeSave(data: Omit<SaveData, 'version' | 'savedAt'>) {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify({ ...data, version: SAVE_VERSION, savedAt: Date.now() }));
    return true;
  } catch {
    return false;
  }
}

export function readSave(): SaveData | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const data = JSON.parse(raw) as SaveData;
    return data.version === SAVE_VERSION ? data : null;
  } catch {
    return null;
  }
}

export function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch {
    /* bỏ qua */
  }
}
