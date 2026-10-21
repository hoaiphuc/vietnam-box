import { BUILD_ORDER, BUILDINGS, JOB_ORDER, JOBS, RES_ORDER, RESOURCES, type BuildingId, type JobId, type ResKey } from '../data';
import { MAX_LEVEL, xpNeed, type Villager } from '../entities/Villager';
import { QUESTS } from '../quests';
import type { GameScene } from '../scenes/GameScene';

const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

interface CardEls {
  root: HTMLElement;
  job: HTMLElement;
  status: HTMLElement;
  hunger: HTMLElement;
  energy: HTMLElement;
}

function pad(n: number) {
  return n.toString().padStart(2, '0');
}

function levelLabel(lv: number) {
  return lv === 0 ? 'Chưa biết' : lv >= MAX_LEVEL ? 'Bậc thầy' : `Cấp ${lv}`;
}

export class Hud {
  private root: HTMLElement;
  private resEls = {} as Record<ResKey, HTMLElement>;
  private cards = new Map<Villager, CardEls>();
  private speedBtns: HTMLButtonElement[] = [];
  private buildBtns = new Map<BuildingId, HTMLButtonElement>();
  private questItems = new Map<string, HTMLElement>();
  private detail: HTMLElement;
  private detailFor: Villager | null = null;
  private toasts: HTMLElement;
  private hint: HTMLElement;
  private clockText: HTMLElement;
  private clockIcon: HTMLElement;

  constructor(private scene: GameScene) {
    this.root = document.getElementById('ui')!;
    this.root.innerHTML = `
      <div class="topbar panel">
        <div class="brand">🌾 <span>Làng Quê</span></div>
        <div class="clock"><span class="clock-icon">☀️</span><span class="clock-text"></span></div>
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
        </div>
      </div>
      <div class="family panel"><h4>Gia đình</h4><div class="cards"></div></div>
      <div class="right-col">
        <div class="quests panel"><h4>Mục tiêu</h4><ul></ul></div>
        <div class="detail panel" hidden></div>
      </div>
      <div class="buildbar panel"><div class="bb-title">Xây dựng</div><div class="bb-items"></div></div>
      <div class="hint" hidden></div>
      <div class="toasts"></div>
      <div class="intro">
        <div class="intro-card panel">
          <div class="intro-art">🛖🌾🎋🐓🔥</div>
          <h2>Làng Quê Yên Bình</h2>
          <p>Gia đình nhỏ của bạn — <b>Bố Tám</b>, <b>Mẹ Lan</b> và <b>Bé Na</b> — vừa về lập nghiệp bên một con sông hiền hoà, cạnh cánh rừng xanh.</p>
          <p>Hãy giao việc cho từng người: chặt cây, săn thú, câu cá, hái chuối, dựng đống lửa nướng thịt. Làm càng nhiều thì càng giỏi nghề, và người giỏi sẽ chỉ bảo người mới học.</p>
          <ul>
            <li>🖱️ Nhấp vào người để chọn &amp; giao việc</li>
            <li>✋ Kéo chuột / WASD để di chuyển, cuộn chuột để phóng to</li>
            <li>⏸ Space tạm dừng · 1 2 3 đổi tốc độ</li>
            <li>🏗️ Giữ Shift khi đặt công trình để đặt nhiều lần</li>
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

    this.speedBtns = [...this.root.querySelectorAll<HTMLButtonElement>('[data-speed]')];
    for (const b of this.speedBtns) b.addEventListener('click', () => scene.state.setSpeed(Number(b.dataset.speed)));

    const intro = q(this.root, '.intro');
    scene.state.setSpeed(0);
    q(intro, '.start').addEventListener('click', () => {
      intro.remove();
      scene.state.setSpeed(1);
    });

    const cards = q(this.root, '.cards');
    for (const v of scene.villagers) {
      const el = document.createElement('div');
      el.className = 'vcard';
      el.innerHTML = `
        <div class="avatar">${v.def.avatar}</div>
        <div class="vinfo">
          <div class="vname">${v.name} <span class="vjob"></span></div>
          <div class="vstatus"></div>
          <div class="bars">
            <div class="bar hunger" title="No bụng"><i></i></div>
            <div class="bar energy" title="Sức lực"><i></i></div>
          </div>
        </div>`;
      el.addEventListener('click', () => scene.focus(v));
      cards.appendChild(el);
      this.cards.set(v, {
        root: el,
        job: q(el, '.vjob'),
        status: q(el, '.vstatus'),
        hunger: q(el, '.hunger i'),
        energy: q(el, '.energy i'),
      });
    }

    const qList = q(this.root, '.quests ul');
    for (const quest of QUESTS) {
      const li = document.createElement('li');
      li.textContent = quest.text;
      qList.appendChild(li);
      this.questItems.set(quest.id, li);
    }

    const bb = q(this.root, '.bb-items');
    for (const id of BUILD_ORDER) {
      const def = BUILDINGS[id];
      const btn = document.createElement('button');
      btn.className = 'bitem';
      btn.title = def.desc;
      btn.innerHTML = `<span class="bi">${def.icon}</span><span class="bn">${def.name}</span><span class="bc">${def.cost.go} 🪵</span>`;
      btn.addEventListener('click', () => (scene.buildMode === id ? scene.cancelBuild() : scene.startBuild(id)));
      bb.appendChild(btn);
      this.buildBtns.set(id, btn);
    }

    // Không để nút giữ focus (tránh phím Space bấm lại nút).
    this.root.addEventListener('mousedown', (e) => {
      if ((e.target as HTMLElement).closest('button')) e.preventDefault();
    });

    scene.state.events.on('log', (msg: string) => this.toast(msg));
    this.update();
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

  /** Gọi khi chế độ xây dựng thay đổi. */
  refresh() {
    const mode = this.scene.buildMode;
    for (const [id, btn] of this.buildBtns) btn.classList.toggle('active', id === mode);
    if (mode) {
      this.hint.hidden = false;
      this.hint.innerHTML = `Đang đặt <b>${BUILDINGS[mode].name}</b> — nhấp chuột trái để đặt · chuột phải / Esc để huỷ`;
    } else {
      this.hint.hidden = true;
    }
  }

  renderDetail() {
    const v = this.scene.selected;
    this.detailFor = v;
    for (const [cv, c] of this.cards) c.root.classList.toggle('selected', cv === v);
    if (!v) {
      this.detail.hidden = true;
      return;
    }
    this.detail.hidden = false;
    this.detail.innerHTML = `
      <div class="dhead">
        <div class="avatar big">${v.def.avatar}</div>
        <div class="dtitle"><h3>${v.name}</h3><small>${v.def.role}</small></div>
        <button class="close" title="Đóng">✕</button>
      </div>
      <div class="dstatus"></div>
      <div class="dneeds">
        <label>🍚 No bụng</label><div class="bar hunger"><i></i></div>
        <label>⚡ Sức lực</label><div class="bar energy"><i></i></div>
      </div>
      <h4>Giao việc</h4>
      <div class="jobs">
        ${JOB_ORDER.map(
          (j) => `
          <button class="job${v.job === j ? ' active' : ''}" data-job="${j}" title="${JOBS[j].desc}">
            <span class="ji">${JOBS[j].icon}</span>
            <span class="jn">${JOBS[j].name}</span>
            ${j === 'nghi' ? '<span class="jl">&nbsp;</span>' : `<span class="jl"></span><span class="xp"><i></i></span>`}
          </button>`,
        ).join('')}
      </div>
      <div class="dnote"></div>
    `;
    q(this.detail, '.close').addEventListener('click', () => this.scene.select(null));
    for (const b of this.detail.querySelectorAll<HTMLButtonElement>('[data-job]')) {
      b.addEventListener('click', () => this.scene.assignJob(v, b.dataset.job as JobId));
    }
    this.updateDetail();
  }

  private updateDetail() {
    const v = this.detailFor;
    if (!v) return;
    q(this.detail, '.dstatus').textContent = v.status;
    q(this.detail, '.dneeds .hunger i').style.width = `${v.hunger}%`;
    q(this.detail, '.dneeds .energy i').style.width = `${v.energy}%`;
    for (const b of this.detail.querySelectorAll<HTMLButtonElement>('[data-job]')) {
      const j = b.dataset.job as JobId;
      if (j === 'nghi') continue;
      const s = v.skills[j];
      q(b, '.jl').textContent = levelLabel(s.level);
      q(b, '.xp i').style.width = s.level >= MAX_LEVEL ? '100%' : `${(s.xp / xpNeed(s.level)) * 100}%`;
    }
    const note = q(this.detail, '.dnote');
    const job = v.job;
    if (job === 'nghi') {
      note.textContent = 'Đang nghỉ ngơi — hồi sức nhanh hơn.';
    } else {
      const m = v.mentor(job);
      const parts: string[] = [];
      if (v.skills[job].level === 0) parts.push(`Đang học việc ${JOBS[job].name.toLowerCase()} — làm chậm hơn lúc đầu.`);
      if (m) parts.push(`📖 Được ${m.name} chỉ bảo: kinh nghiệm x${v.xpMultiplier(job)}`);
      else if (v.def.child) parts.push(`📖 Trẻ con học nhanh: kinh nghiệm x${v.xpMultiplier(job)}`);
      parts.push(`Hiệu suất: ${Math.round(v.eff(job) * 100)}%`);
      note.innerHTML = parts.join('<br>');
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
    const mm = Math.floor((h - hh) * 60 / 10) * 10;
    const part = h < 5 ? 'Đêm' : h < 11 ? 'Sáng' : h < 13 ? 'Trưa' : h < 17.5 ? 'Chiều' : h < 20 ? 'Chạng vạng' : 'Đêm';
    this.clockText.textContent = `Ngày ${s.day} · ${pad(hh)}:${pad(mm)} · ${part}`;
    this.clockIcon.textContent = h >= 5 && h < 7 ? '🌅' : h < 17.5 && h >= 7 ? '☀️' : h >= 17.5 && h < 20 ? '🌇' : '🌙';
    for (const b of this.speedBtns) b.classList.toggle('active', Number(b.dataset.speed) === s.speed);

    for (const [v, c] of this.cards) {
      c.job.textContent = `${JOBS[v.job].icon} ${JOBS[v.job].name}`;
      c.status.textContent = v.status;
      c.hunger.style.width = `${v.hunger}%`;
      c.energy.style.width = `${v.energy}%`;
      c.root.classList.toggle('hungry', v.hunger < 15);
    }

    for (const [id, btn] of this.buildBtns) btn.disabled = !s.canAfford(BUILDINGS[id].cost) && this.scene.buildMode !== id;
    for (const [id, li] of this.questItems) li.classList.toggle('done', this.scene.questDone.has(id));

    this.updateDetail();
  }
}
