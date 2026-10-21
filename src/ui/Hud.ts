import { BUILD_ORDER, BUILDINGS, JOB_ORDER, JOBS, RES_ORDER, RESOURCES, type BuildingId, type JobId, type ResKey } from '../data';
import { MAX_LEVEL, xpNeed, type Villager } from '../entities/Villager';
import { QUESTS } from '../quests';
import type { GameScene } from '../scenes/GameScene';
import { TRAITS } from '../traits';

const q = <T extends HTMLElement = HTMLElement>(root: ParentNode, sel: string) => root.querySelector(sel) as T;

interface CardEls {
  root: HTMLElement;
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
  private questItems = new Map<string, HTMLElement>();
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
      <div class="family panel"><h4>Dân làng</h4><div class="cards"></div></div>
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
          <p>Bạn là <b>Thành Hoàng làng</b> — vị thần lặng lẽ che chở cho một gia đình nhỏ vừa về lập nghiệp bên sông: <b>Bố Tám</b>, <b>Mẹ Lan</b> và <b>Bé Na</b>.</p>
          <p>Họ tự sống, tự suy nghĩ và tự quyết định: ai cũng có tính cách, sở thích, tâm trạng và ký ức riêng. Bạn chỉ dõi theo và thỉnh thoảng <b>báo mộng</b> gợi ý — nghe hay không là tuỳ họ.</p>
          <ul>
            <li>🖱️ Nhấp vào một người để xem họ đang nghĩ gì</li>
            <li>💭 Báo mộng để gợi ý một việc cho họ</li>
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
    this.detail.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.free') && this.detailFor) this.scene.clearIntent(this.detailFor);
    });

    this.speedBtns = [...this.root.querySelectorAll<HTMLButtonElement>('[data-speed]')];
    for (const b of this.speedBtns) b.addEventListener('click', () => scene.state.setSpeed(Number(b.dataset.speed)));

    const intro = q(this.root, '.intro');
    scene.state.setSpeed(0);
    q(intro, '.start').addEventListener('click', () => {
      intro.remove();
      scene.startAudio();
      scene.state.setSpeed(1);
    });

    this.setupSound();

    const cards = q(this.root, '.cards');
    for (const v of scene.villagers) {
      const el = document.createElement('div');
      el.className = 'vcard';
      el.innerHTML = `
        <div class="avatar">${v.def.avatar}</div>
        <div class="vinfo">
          <div class="vname"><span class="vn"></span> <span class="vjob"></span></div>
          <div class="vstatus"></div>
          <div class="bars">
            <div class="bar hunger" title="No bụng"><i></i></div>
            <div class="bar energy" title="Sức lực"><i></i></div>
            <div class="bar mood" title="Tâm trạng"><i></i></div>
          </div>
        </div>`;
      el.addEventListener('click', () => scene.focus(v));
      cards.appendChild(el);
      this.cards.set(v, {
        root: el,
        name: q(el, '.vn'),
        job: q(el, '.vjob'),
        status: q(el, '.vstatus'),
        hunger: q(el, '.hunger i'),
        energy: q(el, '.energy i'),
        mood: q(el, '.mood i'),
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
    this.root.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('button')) scene.sfx('click');
    });

    scene.state.events.on('log', (msg: string) => this.toast(msg));
    this.update();
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
        <div class="avatar big">${v.def.avatar}</div>
        <div class="dtitle"><h3>${v.name} <span class="crown" title="Trưởng làng"></span></h3><small>${v.def.role}</small></div>
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
      <h4>Báo mộng <small>— gợi ý một việc, nghe hay không là tuỳ họ</small></h4>
      <div class="jobs">
        ${JOB_ORDER.map(
          (j) => `
          <button class="job" data-job="${j}" title="${JOBS[j].desc}">
            <span class="ji">${JOBS[j].icon}</span>
            <span class="jn">${JOBS[j].name}</span>
            ${j === 'nghi' ? '<span class="jl">&nbsp;</span>' : `<span class="jl"></span><span class="xp"><i></i></span>`}
          </button>`,
        ).join('')}
      </div>
      <div class="dintent"></div>
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

  private updateDetail() {
    const v = this.detailFor;
    if (!v) return;
    const s = this.scene.state;
    q(this.detail, '.crown').textContent = this.scene.chief() === v ? '👑' : '';
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
    for (const b of this.detail.querySelectorAll<HTMLButtonElement>('[data-job]')) {
      const j = b.dataset.job as JobId;
      b.classList.toggle('active', v.activity === j);
      b.classList.toggle('intent', v.intent?.job === j);
      b.disabled = cooling;
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
    } else {
      intent.hidden = true;
    }

    const note = q(this.detail, '.dnote');
    const job = v.activity;
    if (job === 'nghi') {
      note.textContent = 'Đang nghỉ ngơi — hồi sức và vui vẻ hơn.';
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
    this.clockText.textContent = `Ngày ${s.day} · ${pad(hh)}:${pad(mm)} · ${part}`;
    this.clockIcon.textContent = h >= 5 && h < 7 ? '🌅' : h < 17.5 && h >= 7 ? '☀️' : h >= 17.5 && h < 20 ? '🌇' : '🌙';
    for (const b of this.speedBtns) b.classList.toggle('active', Number(b.dataset.speed) === s.speed);

    const chief = this.scene.chief();
    for (const [v, c] of this.cards) {
      c.name.textContent = `${v.name}${chief === v ? ' 👑' : ''}`;
      c.job.textContent = `${JOBS[v.activity].icon} ${JOBS[v.activity].name}`;
      c.status.textContent = v.thought ? `💭 ${v.thought}` : v.status;
      c.root.title = v.status;
      c.hunger.style.width = `${v.hunger}%`;
      c.energy.style.width = `${v.energy}%`;
      c.mood.style.width = `${v.mood}%`;
      c.root.classList.toggle('hungry', v.hunger < 15);
    }

    for (const [id, btn] of this.buildBtns) btn.disabled = !s.canAfford(BUILDINGS[id].cost) && this.scene.buildMode !== id;
    for (const [id, li] of this.questItems) li.classList.toggle('done', this.scene.questDone.has(id));

    this.updateDetail();
  }
}
