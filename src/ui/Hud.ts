import {
  BUILD_ORDER,
  BUILDINGS,
  JOB_NEEDS,
  JOB_ORDER,
  JOBS,
  RES_NEEDS,
  RES_ORDER,
  RESOURCES,
  type BuildingId,
  type JobId,
  type ResKey,
} from '../data';
import { DISC_ORDER, DISCOVERIES, ERAS } from '../discoveries';
import { MAX_LEVEL, xpNeed, type Villager } from '../entities/Villager';
import { DREAM_COST, POWER_ORDER, POWERS, WISHES, type PowerId } from '../powers';
import type { GameScene } from '../scenes/GameScene';
import type { HistoryEntry } from '../state';
import { OPENING } from '../story';
import { TRAITS } from '../traits';
import { playStory } from './Story';

/** Trạng thái thu lại / mở ra của các bảng (localStorage). */
const FOLD_KEY = 'langque.folds';

const q =<T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

interface CardEls {
  root: HTMLElement;
  avatar: HTMLElement;
  name: HTMLElement;
  job: HTMLElement;
  status: HTMLElement;
  hunger: HTMLElement;
  energy: HTMLElement;
  mood: HTMLElement;
}

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

function levelLabel(lv: number) {
  return lv === 0 ? 'Chưa biết' : lv >= MAX_LEVEL ? 'Bậc thầy' : `Cấp ${lv}`;
}

function moodIcon(m: number) {
  return m >= 75 ? '😊' : m >= 45 ? '🙂' : m >= 25 ? '😐' : '😟';
}

export class Hud {
  private root: HTMLElement;
  private resEls = {} as Record<ResKey, HTMLElement>;
  private cards = new Map<Villager, CardEls>();
  private speedBtns: HTMLButtonElement[] = [];
  private buildBtns = new Map<BuildingId, HTMLButtonElement>();
  private powerBtns = new Map<PowerId, HTMLButtonElement>();
  private phucText: HTMLElement;
  private phucBar: HTMLElement;
  private wishes: HTMLElement;
  private wishKey = '';
  private historyList: HTMLElement;
  private historyFull: HTMLElement;
  private historyOverlay: HTMLElement;
  private historyKey = '';
  private eraChip!: HTMLElement;
  private clockTags!: HTMLElement;
  private discKey = '-';
  private bannerTimer = 0;
  private detail: HTMLElement;
  private detailFor: Villager | null = null;
  private journalKey = '';
  private memoryKey = '';
  private toasts: HTMLElement;
  private hint: HTMLElement;
  private clockText: HTMLElement;
  private clockIcon: HTMLElement;

  constructor(private scene: GameScene) {
    this.root = document.getElementById('ui')!;
    this.root.innerHTML = `
      <div class="topbar panel">
        <div class="brand">🌾 <span>Làng Quê</span></div>
        <div class="clock"><span class="clock-icon">☀️</span><span class="clock-text"></span><span class="clock-tags"></span></div>
        <button class="era-chip" title="Thời kỳ của làng — nhấp để xem các phát kiến"></button>
        <div class="phuc" title="Điểm Phúc của Thành Hoàng — có được khi dân làng vui vẻ và thắp hương ở miếu">
          <span>🙏</span><div class="phuc-bar"><i></i></div><b class="phuc-text">0</b>
        </div>
        <div class="resources">
          ${RES_ORDER.map(
            (k) => `<div class="chip" title="${RESOURCES[k].name}"><span>${RESOURCES[k].icon}</span><b data-res="${k}">0</b></div>`,
          ).join('')}
        </div>
        <div class="speed">
          <button data-speed="0" title="Tạm dừng (Space)">⏸</button>
          <button data-speed="1" title="Bình thường (1)">▶</button>
          <button data-speed="2" title="Nhanh (2)">⏩</button>
          <button data-speed="3" title="Rất nhanh (3)">⏭</button>
          <button data-speed="5" title="Nhanh nhất (4) — xem các thế hệ nối tiếp">x5</button>
        </div>
        <div class="sound">
          <button class="snd-btn" title="Âm thanh (M để tắt/bật)">🔊</button>
          <div class="snd-pop panel" hidden>
            <h4>Âm thanh</h4>
            <label><span>Âm lượng chung</span><input type="range" min="0" max="100" data-vol="master" /></label>
            <label><span>🎶 Nhạc nền</span><input type="range" min="0" max="100" data-vol="music" /></label>
            <label><span>🔨 Hiệu ứng</span><input type="range" min="0" max="100" data-vol="sfx" /></label>
            <label><span>🍃 Thiên nhiên</span><input type="range" min="0" max="100" data-vol="ambient" /></label>
            <button class="snd-mute"></button>
          </div>
        </div>
      </div>
      <div class="family panel" data-fold="family">
        <div class="fhead">
          <button class="ptitle" title="Thu lại / mở ra"><span class="chev">▾</span>Dân làng <span class="pop"></span></button>
          <button class="tree-btn" title="Xem gia phả các thế hệ">🌳 Gia phả</button>
        </div>
        <div class="cards"></div>
      </div>
      <div class="tree-overlay" hidden>
        <div class="tree-card panel">
          <div class="tree-head"><h3>🌳 Gia phả làng</h3><button class="close tree-close" title="Đóng">✕</button></div>
          <div class="tree-body"></div>
        </div>
      </div>
      <div class="tree-overlay disc-overlay" hidden>
        <div class="tree-card panel disc-card">
          <div class="tree-head"><h3>💡 Phát kiến của làng</h3><button class="close disc-close" title="Đóng">✕</button></div>
          <div class="tree-body disc-body"></div>
        </div>
      </div>
      <div class="banner" hidden><span class="bn-icon"></span><div><b class="bn-title"></b><p class="bn-text"></p></div></div>
      <div class="tree-overlay hist-overlay" hidden>
        <div class="tree-card panel">
          <div class="tree-head"><h3>📜 Sử làng <small class="hcount"></small></h3><button class="close hist-close" title="Đóng">✕</button></div>
          <div class="tree-body hfull"></div>
        </div>
      </div>
      <div class="right-col">
        <div class="history panel" data-fold="history">
          <div class="fhead">
            <button class="ptitle" title="Thu lại / mở ra"><span class="chev">▾</span>📜 Sử làng <small class="hsub"></small></button>
            <button class="tree-btn hist-all" title="Xem toàn bộ lịch sử của làng">📖 Xem tất cả</button>
          </div>
          <div class="hlist"></div>
        </div>
        <div class="wishes panel" hidden><h4>Lời cầu khấn</h4><ul></ul></div>
        <div class="detail panel" hidden></div>
      </div>
      <div class="buildbar panel">
        <div class="bb-title">Quyền năng</div><div class="bb-items powers"></div>
        <div class="bb-sep"></div>
        <div class="bb-title">Quy hoạch</div><div class="bb-items plans"></div>
      </div>
      <div class="hint" hidden></div>
      <div class="toasts"></div>
      <div class="intro">
        <div class="intro-card panel">
          <div class="intro-art">🛖🌾🎋🐓🔥</div>
          <h2>Làng Quê Yên Bình</h2>
          <p>Bạn là <b>Thành Hoàng làng</b> — vị thần lặng lẽ che chở cho một gia đình nhỏ vừa về lập nghiệp bên sông: <b>Bố Tám</b>, <b>Mẹ Lan</b> và <b>Bé Na</b>.</p>
          <p>Họ tự sống, tự suy nghĩ và tự quyết định: ai cũng có tính cách, sở thích, tâm trạng và ký ức riêng. Dân làng vui vẻ và ra miếu thắp hương sẽ cho bạn điểm <b>Phúc 🙏</b> — dùng nó để làm mưa, ban lộc, phù hộ, báo mộng và đáp lại lời cầu khấn của họ.</p>
          <ul>
            <li>🖱️ Nhấp vào một người để xem họ đang nghĩ gì</li>
            <li>💭 Báo mộng để gợi ý một việc — nghe hay không là tuỳ họ</li>
            <li>📐 Quy hoạch chỗ xây, trưởng làng sẽ cho xây khi đủ gỗ</li>
            <li>🌳 Mỗi ngày là một năm: trẻ lớn lên, kết duyên, sinh con, già đi — xem Gia phả</li>
            <li>✋ Kéo chuột / WASD để di chuyển, cuộn chuột để phóng to</li>
            <li>⏸ Space tạm dừng · 1 2 3 đổi tốc độ · M tắt tiếng</li>
          </ul>
          <button class="start">Bắt đầu 🌱</button>
        </div>
      </div>
    `;

    for (const el of this.root.querySelectorAll<HTMLElement>('[data-res]')) this.resEls[el.dataset.res as ResKey] = el;
    this.clockText = q(this.root, '.clock-text');
    this.clockIcon = q(this.root, '.clock-icon');
    this.detail = q(this.root, '.detail');
    this.toasts = q(this.root, '.toasts');
    this.hint = q(this.root, '.hint');
    this.phucText = q(this.root, '.phuc-text');
    this.phucBar = q(this.root, '.phuc-bar i');
    this.wishes = q(this.root, '.wishes');
    this.wishes.addEventListener('click', (e) => {
      const li = (e.target as HTMLElement).closest<HTMLElement>('[data-power]');
      if (li) scene.usePower(li.dataset.power as PowerId);
    });
    this.detail.addEventListener('click', (e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.free') && this.detailFor) this.scene.clearIntent(this.detailFor);
      const rel = t.closest<HTMLElement>('[data-vid]');
      const v = rel && scene.villagers.find((x) => x.def.id === rel.dataset.vid);
      if (v) scene.focus(v);
    });

    this.speedBtns = [...this.root.querySelectorAll<HTMLButtonElement>('[data-speed]')];
    for (const b of this.speedBtns) b.addEventListener('click', () => scene.state.setSpeed(Number(b.dataset.speed)));

    // Đoạn mở đầu trước, rồi mới tới màn hướng dẫn; game đứng yên cho tới khi bấm "Bắt đầu".
    const intro = q(this.root, '.intro');
    scene.state.setSpeed(0);
    scene.cutscene = true;
    intro.hidden = true;
    q(intro, '.start').addEventListener('click', () => {
      intro.remove();
      scene.cutscene = false;
      scene.startAudio();
      scene.state.setSpeed(1);
    });
    playStory(this.root, scene, OPENING).then(() => (intro.hidden = false));

    this.setupSound();

    this.syncCards();

    const overlay = q(this.root, '.tree-overlay');
    q(this.root, '.tree-btn').addEventListener('click', () => this.showTree());
    q(this.root, '.tree-close').addEventListener('click', () => (overlay.hidden = true));
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) overlay.hidden = true;
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-vid]');
      const v = el && scene.villagers.find((x) => x.def.id === el.dataset.vid);
      if (v) {
        overlay.hidden = true;
        scene.focus(v);
      }
    });

    this.setupFolds();

    this.historyList = q(this.root, '.hlist');
    this.historyFull = q(this.root, '.hfull');
    this.historyOverlay = q(this.root, '.hist-overlay');
    const goTo = (e: Event) => {
      const el = (e.target as HTMLElement).closest<HTMLElement>('[data-i]');
      const at = el && scene.state.history[Number(el.dataset.i)]?.at;
      if (!at) return false;
      scene.panTo(at.x, at.y);
      return true;
    };
    this.historyList.addEventListener('click', goTo);
    q(this.root, '.hist-all').addEventListener('click', () => {
      this.historyOverlay.hidden = false;
      this.historyKey = '';
      this.updateHistory();
      this.historyFull.scrollTop = 0;
    });
    q(this.root, '.hist-close').addEventListener('click', () => (this.historyOverlay.hidden = true));
    this.historyOverlay.addEventListener('click', (e) => {
      if (e.target === this.historyOverlay || goTo(e)) this.historyOverlay.hidden = true;
    });

    this.eraChip = q(this.root, '.era-chip');
    this.clockTags = q(this.root, '.clock-tags');
    const disc = q(this.root, '.disc-overlay');
    this.eraChip.addEventListener('click', () => {
      this.renderDiscoveries();
      disc.hidden = false;
    });
    q(this.root, '.disc-close').addEventListener('click', () => (disc.hidden = true));
    disc.addEventListener('click', (e) => {
      if (e.target === disc) disc.hidden = true;
    });

    const pw = q(this.root, '.powers');
    for (const id of POWER_ORDER) {
      const def = POWERS[id];
      const btn = document.createElement('button');
      btn.className = 'bitem';
      btn.title = def.desc;
      btn.innerHTML = `<span class="bi">${def.icon}</span><span class="bn">${def.name}</span><span class="bc">${def.cost} 🙏</span>`;
      btn.addEventListener('click', () => scene.usePower(id));
      pw.appendChild(btn);
      this.powerBtns.set(id, btn);
    }

    const bb = q(this.root, '.plans');
    for (const id of BUILD_ORDER) {
      const def = BUILDINGS[id];
      const btn = document.createElement('button');
      btn.className = 'bitem';
      btn.title = `${def.desc}\nĐánh dấu chỗ xây — trưởng làng sẽ cho xây khi đủ ${def.cost.go} gỗ.`;
      btn.innerHTML = `<span class="bi">${def.icon}</span><span class="bn">${def.name}</span><span class="bc">${def.cost.go} 🪵</span>`;
      btn.addEventListener('click', () => (scene.buildMode === id ? scene.cancelBuild() : scene.startBuild(id)));
      bb.appendChild(btn);
      this.buildBtns.set(id, btn);
    }

    // Không để nút giữ focus (tránh phím Space bấm lại nút).
    this.root.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) e.preventDefault();
    });
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) scene.sfx('click');
    });

    scene.state.events.on('log', (msg: string) => this.toast(msg));
    this.update();
  }

  /** Thêm thẻ cho người mới (sinh ra, đến làng), bỏ thẻ người đã mất. */
  private syncCards() {
    const list = this.scene.villagers;
    if (list.length === this.cards.size && list.every((v) => this.cards.has(v))) return;
    for (const [v, c] of this.cards) {
      if (!list.includes(v)) {
        c.root.remove();
        this.cards.delete(v);
      }
    }
    const box = q(this.root, '.cards');
    for (const v of list) {
      if (this.cards.has(v)) continue;
      const el = document.createElement('div');
      el.className = 'vcard';
      el.innerHTML = `
        <div class="avatar"></div>
        <div class="vinfo">
          <div class="vname"><span class="vn"></span> <span class="vjob"></span></div>
          <div class="vstatus"></div>
          <div class="bars">
            <div class="bar hunger" title="No bụng"><i></i></div>
            <div class="bar energy" title="Sức lực"><i></i></div>
            <div class="bar mood" title="Tâm trạng"><i></i></div>
          </div>
        </div>`;
      el.addEventListener('click', () => this.scene.focus(v));
      box.appendChild(el);
      this.cards.set(v, {
        root: el,
        avatar: q(el, '.avatar'),
        name: q(el, '.vn'),
        job: q(el, '.vjob'),
        status: q(el, '.vstatus'),
        hunger: q(el, '.hunger i'),
        energy: q(el, '.energy i'),
        mood: q(el, '.mood i'),
      });
    }
    q(this.root, '.pop').textContent = `(${list.length})`;
  }

  /** Gia phả: mỗi dòng họ bắt đầu từ người không có cha mẹ trong làng, con cháu xếp lồng bên dưới. */
  private showTree() {
    const s = this.scene;
    const all = [...s.villagers, ...s.departed];
    const person = (p: Villager) => {
      const info = p.alive ? `${p.years} tuổi` : `🕯️ hưởng thọ ${p.years}`;
      return `<span class="gp-p${p.alive ? '' : ' dead'}"${p.alive ? ` data-vid="${p.def.id}"` : ''}>
        <span class="gp-a">${p.avatar}</span><b>${p.name}</b><small>${info}</small></span>`;
    };
    const seen = new Set<Villager>();
    const branch = (p: Villager): string => {
      seen.add(p);
      const sp = p.spouse;
      if (sp) seen.add(sp);
      const kids = [...new Set([...p.children, ...(sp?.children ?? [])])].sort((a, b) => a.def.birthTime - b.def.birthTime);
      return `<li><div class="gp-node">${person(p)}${sp ? `<span class="gp-heart">♥</span>${person(sp)}` : ''}</div>
        ${kids.length ? `<ul>${kids.map(branch).join('')}</ul>` : ''}</li>`;
    };
    // Gốc: người không có cha mẹ, và vợ/chồng (nếu có) cũng không thuộc dòng họ nào khác.
    const roots = all
      .filter((p) => !p.parents.length && !(p.spouse && p.spouse.parents.length))
      .sort((a, b) => a.def.birthTime - b.def.birthTime);
    let html = '';
    for (const r of roots) if (!seen.has(r)) html += `<ul class="gp-tree">${branch(r)}</ul>`;
    q(this.root, '.tree-body').innerHTML =
      html + `<p class="gp-note">${s.villagers.length} người đang sống · ${s.departed.length} người đã khuất · nhấp vào một người để xem</p>`;
    q(this.root, '.tree-overlay').hidden = false;
  }

  private setupSound() {
    const s = this.scene.audioSettings;
    const btn = q<HTMLButtonElement>(this.root, '.snd-btn');
    const pop = q(this.root, '.snd-pop');
    btn.addEventListener('click', () => (pop.hidden = !pop.hidden));
    document.addEventListener('pointerdown', (e) => {
      const t = e.target as Node;
      if (!pop.hidden && !pop.contains(t) && !btn.contains(t)) pop.hidden = true;
    });
    for (const input of pop.querySelectorAll<HTMLInputElement>('[data-vol]')) {
      const key = input.dataset.vol as 'master' | 'music' | 'sfx' | 'ambient';
      input.value = String(Math.round(s[key] * 100));
      input.addEventListener('input', () => {
        s[key] = Number(input.value) / 100;
        if (s.muted) s.muted = false;
        this.scene.applyAudio();
      });
      // Không giữ focus để phím mũi tên vẫn di chuyển camera.
      input.addEventListener('change', () => input.blur());
    }
    q(pop, '.snd-mute').addEventListener('click', () => this.scene.toggleMute());
    this.refreshSound();
  }

  refreshSound() {
    const muted = this.scene.audioSettings.muted;
    q(this.root, '.snd-btn').textContent = muted ? '🔇' : '🔊';
    q(this.root, '.snd-mute').textContent = muted ? '🔊 Bật tiếng' : '🔇 Tắt tiếng';
  }

  toast(msg: string) {
    const el = document.createElement('div');
    el.className = 'toast';
    el.textContent = msg;
    this.toasts.appendChild(el);
    while (this.toasts.children.length > 5) this.toasts.firstElementChild!.remove();
    setTimeout(() => el.classList.add('out'), 6000);
    setTimeout(() => el.remove(), 6600);
  }

  /** Gọi khi chế độ quy hoạch / quyền năng thay đổi. */
  refresh() {
    const mode = this.scene.buildMode;
    const power = this.scene.powerMode;
    for (const [id, btn] of this.buildBtns) btn.classList.toggle('active', id === mode);
    for (const [id, btn] of this.powerBtns) btn.classList.toggle('active', id === power);
    if (power) {
      const def = POWERS[power];
      this.hint.hidden = false;
      this.hint.innerHTML = `${def.icon} <b>${def.name}</b> — ${def.target === 'villager' ? 'nhấp vào một người' : 'nhấp vào chỗ muốn ban phép'} · chuột phải / Esc để huỷ`;
    } else if (mode) {
      this.hint.hidden = false;
      this.hint.innerHTML = `📐 Quy hoạch <b>${BUILDINGS[mode].name}</b> — nhấp để đánh dấu, nhấp vào chỗ đã đánh dấu để bỏ · Shift để đặt nhiều · Esc để huỷ`;
    } else {
      this.hint.hidden = true;
    }
  }

  /** Biểu ngữ lớn giữa màn hình khi làng có phát kiến mới. */
  banner(icon: string, title: string, text: string) {
    const b = q(this.root, '.banner');
    q(b, '.bn-icon').textContent = icon;
    q(b, '.bn-title').textContent = title;
    q(b, '.bn-text').textContent = text;
    b.hidden = false;
    b.classList.remove('show');
    void b.offsetWidth;
    b.classList.add('show');
    clearTimeout(this.bannerTimer);
    this.bannerTimer = window.setTimeout(() => (b.hidden = true), 7000);
  }

  private renderDiscoveries() {
    const s = this.scene.state;
    const era = ERAS[Math.min(ERAS.length - 1, s.discovered.size)];
    q(this.root, '.disc-body').innerHTML = `
      <div class="eras">${ERAS.map((e, i) => `<span class="era${i <= s.discovered.size ? ' on' : ''}">${e.icon} ${e.name}</span>`).join('<i>›</i>')}</div>
      <p class="disc-now">Làng đang ở <b>${era.name.toLowerCase()}</b>. Phát kiến do chính dân làng tìm ra trong lúc sống và làm việc.</p>
      <ul class="discs">
        ${DISC_ORDER.map((id) => {
          const d = DISCOVERIES[id];
          const got = s.has(id);
          return `<li class="${got ? 'got' : 'locked'}">
            <span class="di">${got ? d.icon : '❔'}</span>
            <div><b>${got ? d.name : '???'}</b><p>${got ? d.desc : d.hint}</p></div>
          </li>`;
        }).join('')}
      </ul>`;
  }

  /** Nghề, công trình, tài nguyên chưa có phát kiến thì ẩn đi. */
  private updateUnlocks() {
    const s = this.scene.state;
    const key = [...s.discovered].join();
    if (key === this.discKey) return;
    this.discKey = key;
    const era = ERAS[Math.min(ERAS.length - 1, s.discovered.size)];
    this.eraChip.textContent = `${era.icon} ${era.name}`;
    for (const k of RES_ORDER) {
      const need = RES_NEEDS[k];
      this.resEls[k].parentElement!.hidden = !!need && !s.has(need);
    }
    for (const [id, btn] of this.buildBtns) {
      const need = BUILDINGS[id].needs;
      btn.hidden = !!need && !s.has(need);
    }
    if (this.detailFor) this.renderDetail();
  }

  /** Nút thu lại / mở ra trên tiêu đề bảng; nhớ trạng thái cho lần chơi sau. */
  private setupFolds() {
    let saved: Record<string, boolean> = {};
    try {
      saved = JSON.parse(localStorage.getItem(FOLD_KEY) ?? '{}');
    } catch {
      /* trình duyệt chặn bộ nhớ — dùng mặc định */
    }
    for (const panel of this.root.querySelectorAll<HTMLElement>('[data-fold]')) {
      const id = panel.dataset.fold!;
      panel.classList.toggle('folded', !!saved[id]);
      q(panel, '.ptitle').addEventListener('click', () => {
        saved[id] = panel.classList.toggle('folded');
        try {
          localStorage.setItem(FOLD_KEY, JSON.stringify(saved));
        } catch {
          /* bỏ qua */
        }
      });
    }
  }

  private historyHtml(entries: { e: HistoryEntry; i: number }[], days: boolean) {
    const s = this.scene.state;
    let day = -1;
    let html = '';
    for (const { e, i } of entries) {
      const d = s.dayAt(e.time);
      if (days && d !== day) {
        day = d;
        html += `<div class="hday">Ngày ${d}</div>`;
      }
      html += `<div class="hitem${e.at ? ' loc' : ''}" data-i="${i}"${e.at ? ' title="Nhấp để tới chỗ này"' : ''}>
        <time>${s.clockAt(e.time)}</time><span>${e.text}</span></div>`;
    }
    return html;
  }

  /** Sử làng: bảng nhỏ chỉ hiện chuyện hôm nay; "Xem tất cả" mở toàn bộ, chia theo ngày. Mới nhất ở trên. */
  private updateHistory() {
    const s = this.scene.state;
    const h = s.history;
    const full = !this.historyOverlay.hidden;
    const key = `${h.length}:${h[0]?.time ?? ''}:${s.day}:${full}`;
    if (key === this.historyKey) return;
    this.historyKey = key;

    q(this.root, '.hsub').textContent = `· Ngày ${s.day}`;
    const all = h.map((e, i) => ({ e, i }));
    const today = all.filter(({ e }) => s.dayAt(e.time) === s.day);
    this.historyList.innerHTML = today.length
      ? this.historyHtml(today, false)
      : `<div class="hempty">Hôm nay làng còn yên ả, chưa có chuyện gì…</div>`;

    if (full) {
      q(this.historyOverlay, '.hcount').textContent = `· ${h.length} sự kiện qua ${s.day} ngày`;
      this.historyFull.innerHTML = this.historyHtml(all, true);
    }
  }

  private updateWishes() {
    const list = this.scene.villagers.filter((v) => v.wish);
    const key = list.map((v) => `${v.name}:${v.wish!.type}`).join();
    if (key === this.wishKey) return;
    this.wishKey = key;
    this.wishes.hidden = !list.length;
    q(this.wishes, 'ul').innerHTML = list
      .map((v) => {
        const w = WISHES[v.wish!.type];
        const p = POWERS[w.power];
        return `<li data-power="${w.power}" title="Nhấp để ${p.name.toLowerCase()}">
          <span class="wa">${v.avatar}</span>
          <span class="wt"><b>${v.name}</b>“${v.wish!.text}”</span>
          <span class="wp">${p.icon}</span>
        </li>`;
      })
      .join('');
  }

  renderDetail() {
    const v = this.scene.selected;
    this.detailFor = v;
    this.journalKey = '';
    this.memoryKey = '';
    for (const [cv, c] of this.cards) c.root.classList.toggle('selected', cv === v);
    if (!v) {
      this.detail.hidden = true;
      return;
    }
    this.detail.hidden = false;
    this.detail.innerHTML = `
      <div class="dhead">
        <div class="avatar big"></div>
        <div class="dtitle"><h3><span class="dname"></span> <span class="crown" title="Trưởng làng"></span></h3><small class="drole"></small></div>
        <button class="close" title="Đóng">✕</button>
      </div>
      <div class="traits">
        ${v.traits.map((t) => `<span class="trait" title="${TRAITS[t].desc}">${TRAITS[t].icon} ${TRAITS[t].name}</span>`).join('')}
      </div>
      <div class="dstatus"></div>
      <div class="dthought"></div>
      <div class="dneeds">
        <label>🍚 No bụng</label><div class="bar hunger"><i></i></div>
        <label>⚡ Sức lực</label><div class="bar energy"><i></i></div>
        <label class="mood-label">🙂 Tâm trạng</label><div class="bar mood"><i></i></div>
      </div>
      <h4>Đang cân nhắc</h4>
      <div class="options"></div>
      <h4>Gia đình & bạn bè</h4>
      <ul class="rels"></ul>
      <div class="dream-wrap">
      <h4>Báo mộng <small>— ${DREAM_COST} 🙏, gợi ý một việc, nghe hay không là tuỳ họ</small></h4>
      <div class="jobs">
        ${JOB_ORDER.filter((j) => !JOB_NEEDS[j] || this.scene.state.has(JOB_NEEDS[j]!)).map(
          (j) => `
          <button class="job" data-job="${j}" title="${JOBS[j].desc}">
            <span class="ji">${JOBS[j].icon}</span>
            <span class="jn">${JOBS[j].name}</span>
            ${j === 'nghi' ? '<span class="jl">&nbsp;</span>' : `<span class="jl"></span><span class="xp"><i></i></span>`}
          </button>`,
        ).join('')}
      </div>
      <div class="dintent"></div>
      </div>
      <div class="dnote"></div>
      <div class="memories-wrap"><h4>Ký ức</h4><ul class="memories"></ul></div>
      <h4>Nhật ký</h4>
      <ul class="journal"></ul>
    `;
    q(this.detail, '.close').addEventListener('click', () => this.scene.select(null));
    for (const b of this.detail.querySelectorAll<HTMLButtonElement>('[data-job]')) {
      b.addEventListener('click', () => this.scene.dream(v, b.dataset.job as JobId));
    }
    this.updateDetail();
  }

  /** Vợ/chồng, cha mẹ, con cái và những người bạn thân nhất. */
  private relations(v: Villager) {
    const row = (label: string, o: Villager) =>
      `<li${o.alive ? ` data-vid="${o.def.id}"` : ' class="dead"'}><span>${o.avatar}</span><b>${o.name}</b><small>${label}${o.alive ? '' : ' · đã khuất'}</small></li>`;
    const rows: string[] = [];
    if (v.spouse) rows.push(row(v.female ? 'Chồng' : 'Vợ', v.spouse));
    for (const p of v.parents) rows.push(row(p.female ? 'Mẹ' : 'Bố', p));
    for (const c of v.children) rows.push(row(c.female ? 'Con gái' : 'Con trai', c));
    const friends = [...v.bonds.entries()]
      .filter(([o, b]) => o.alive && b >= 25 && !v.isFamily(o))
      .sort((a, b) => b[1] - a[1])
      .slice(0, 3);
    for (const [o, b] of friends) {
      const label = this.scene.canCourt(v, o) && b >= 35 ? '💕 Đang tìm hiểu' : b >= 60 ? 'Bạn thân' : 'Bạn bè';
      rows.push(row(label, o));
    }
    if (v.needsHome) rows.push('<li class="note">🏠 Đang chờ làng dựng nhà riêng</li>');
    return rows.join('') || '<li class="note">Chưa thân với ai — tối ra bếp lửa trò chuyện sẽ có bạn</li>';
  }

  private updateDetail() {
    const v = this.detailFor;
    if (!v) return;
    const s = this.scene.state;
    q(this.detail, '.avatar').textContent = v.avatar;
    q(this.detail, '.dname').textContent = v.name;
    q(this.detail, '.drole').textContent = v.role;
    q(this.detail, '.crown').textContent = this.scene.chief() === v ? '👑' : '';
    q(this.detail, '.dream-wrap').hidden = v.stage === 'be';
    q(this.detail, '.rels').innerHTML = this.relations(v);
    q(this.detail, '.dstatus').textContent = `${JOBS[v.activity].icon} ${v.status}`;
    q(this.detail, '.dthought').textContent = v.thought ? `💭 “${v.thought}”` : '💭 …';
    q(this.detail, '.dneeds .hunger i').style.width = `${v.hunger}%`;
    q(this.detail, '.dneeds .energy i').style.width = `${v.energy}%`;
    q(this.detail, '.dneeds .mood i').style.width = `${v.mood}%`;
    q(this.detail, '.mood-label').textContent = `${moodIcon(v.mood)} Tâm trạng`;

    q(this.detail, '.options').innerHTML = v.options
      .slice(0, 4)
      .map(
        (o) => `
        <div class="opt${o.job === v.activity ? ' chosen' : ''}" title="${o.reason}">
          <span class="oi">${JOBS[o.job].icon}</span>
          <span class="on">${JOBS[o.job].name}</span>
          <span class="ob"><i style="width:${Math.max(3, Math.min(100, o.score * 100))}%"></i></span>
        </div>`,
      )
      .join('');

    const cooling = s.time < v.dreamReadyAt;
    const poor = s.phuc < DREAM_COST;
    for (const b of this.detail.querySelectorAll<HTMLButtonElement>('[data-job]')) {
      const j = b.dataset.job as JobId;
      b.classList.toggle('active', v.activity === j);
      b.classList.toggle('intent', v.intent?.job === j);
      b.disabled = cooling || poor;
      if (j === 'nghi') continue;
      const sk = v.skills[j];
      q(b, '.jl').textContent = levelLabel(sk.level);
      q(b, '.xp i').style.width = sk.level >= MAX_LEVEL ? '100%' : `${(sk.xp / xpNeed(sk.level)) * 100}%`;
    }

    const intent = q(this.detail, '.dintent');
    if (v.intent) {
      intent.hidden = false;
      intent.innerHTML = `💭 Đang làm theo lời báo mộng: <b>${JOBS[v.intent.job].name}</b> <button class="free">Để tự quyết</button>`;
    } else if (cooling) {
      intent.hidden = false;
      intent.textContent = '🌙 Vừa được báo mộng, đợi ít lâu rồi hãy báo tiếp';
    } else if (poor) {
      intent.hidden = false;
      intent.textContent = `🙏 Cần ${DREAM_COST} Phúc để báo mộng`;
    } else {
      intent.hidden = true;
    }

    const note = q(this.detail, '.dnote');
    const job = v.activity;
    if (job === 'nghi') {
      note.textContent = 'Đang nghỉ ngơi — hồi sức và vui vẻ hơn.';
    } else if (job === 'le') {
      note.textContent = 'Ra miếu thắp hương — thêm điểm Phúc cho Thành Hoàng.';
    } else {
      const m = v.mentor(job);
      const parts: string[] = [];
      if (v.skills[job].level === 0) parts.push(`Đang học việc ${JOBS[job].name.toLowerCase()} — làm chậm hơn lúc đầu.`);
      if (m) parts.push(`📖 Được ${m.name} chỉ bảo: kinh nghiệm x${v.xpMultiplier(job).toFixed(2).replace(/\.?0+$/, '')}`);
      parts.push(`Hiệu suất: ${Math.round(v.eff(job) * 100)}%`);
      note.innerHTML = parts.join('<br>');
    }

    const memKey = v.memories.map((m) => m.id).join();
    if (memKey !== this.memoryKey) {
      this.memoryKey = memKey;
      q(this.detail, '.memories-wrap').hidden = !v.memories.length;
      q(this.detail, '.memories').innerHTML = v.memories.map((m) => `<li>${m.icon} ${m.text}</li>`).join('');
    }

    const jKey = `${v.journal.length}:${v.journal[0]?.time ?? ''}`;
    if (jKey !== this.journalKey) {
      this.journalKey = jKey;
      q(this.detail, '.journal').innerHTML = v.journal.length
        ? v.journal
            .slice(0, 12)
            .map((e) => `<li><time>${s.stamp(e.time)}</time>${e.text}</li>`)
            .join('')
        : '<li class="empty">Chưa có gì để ghi...</li>';
    }
  }

  update() {
    const s = this.scene.state;
    for (const k of RES_ORDER) {
      const val = String(s.res[k]);
      if (this.resEls[k].textContent !== val) this.resEls[k].textContent = val;
    }
    const h = s.hour;
    const hh = Math.floor(h);
    const mm = Math.floor(((h - hh) * 60) / 10) * 10;
    const part = h < 5 ? 'Đêm' : h < 11 ? 'Sáng' : h < 13 ? 'Trưa' : h < 17.5 ? 'Chiều' : h < 20 ? 'Chạng vạng' : 'Đêm';
    this.clockText.textContent = `Ngày ${s.day} · ${pad(hh)}:${pad(mm)}`;
    this.clockText.parentElement!.title = part;
    this.clockIcon.textContent = h >= 5 && h < 7 ? '🌅' : h < 17.5 && h >= 7 ? '☀️' : h >= 17.5 && h < 20 ? '🌇' : '🌙';
    const tags: string[] = [];
    if (s.raining) tags.push('🌧️ Mưa');
    else if (s.drought) tags.push('☀️ Hạn hán');
    if (this.scene.marketOn()) tags.push('🏮 Phiên chợ');
    if (this.scene.festivalOn()) tags.push('🥁 Hội làng');
    const tagText = tags.length ? ` · ${tags.join(' · ')}` : '';
    if (this.clockTags.textContent !== tagText) this.clockTags.textContent = tagText;
    this.updateUnlocks();
    for (const b of this.speedBtns) b.classList.toggle('active', Number(b.dataset.speed) === s.speed);

    this.syncCards();
    const chief = this.scene.chief();
    for (const [v, c] of this.cards) {
      if (c.avatar.textContent !== v.avatar) c.avatar.textContent = v.avatar;
      c.name.textContent = `${v.name}${chief === v ? ' 👑' : ''}`;
      c.job.textContent = `${JOBS[v.activity].icon} ${JOBS[v.activity].name}`;
      c.status.textContent = v.thought ? `💭 ${v.thought}` : v.status;
      c.root.title = v.status;
      c.hunger.style.width = `${v.hunger}%`;
      c.energy.style.width = `${v.energy}%`;
      c.mood.style.width = `${v.mood}%`;
      c.root.classList.toggle('hungry', v.hunger < 15);
    }

    const phuc = Math.floor(s.phuc);
    this.phucText.textContent = `${phuc}`;
    this.phucBar.style.width = `${(s.phuc / s.phucMax) * 100}%`;
    for (const [id, btn] of this.powerBtns) btn.disabled = s.phuc < POWERS[id].cost && this.scene.powerMode !== id;
    this.updateHistory();
    this.updateWishes();

    this.updateDetail();
  }
}
