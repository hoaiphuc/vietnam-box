import type { GameScene } from '../scenes/GameScene';
import { SPEAKER_NAMES, type StoryLine } from '../story';

/** Mili-giây cho mỗi chữ khi chữ hiện dần. */
const TYPE_MS = 26;

/** Chân dung Thành Hoàng: vị quan đội mũ cánh chuồn, áo bào, râu dài, sau lưng là vầng hào quang. */
const THANH_HOANG_SVG = `
<svg viewBox="0 0 80 80" aria-hidden="true">
  <defs>
    <radialGradient id="th-halo"><stop offset="0.55" stop-color="#ffd77a" stop-opacity="0.55"/><stop offset="0.8" stop-color="#e8b13a" stop-opacity="0.25"/><stop offset="1" stop-color="#e8b13a" stop-opacity="0"/></radialGradient>
    <linearGradient id="th-robe" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#f08a3a"/><stop offset="1" stop-color="#c8582a"/></linearGradient>
  </defs>
  <circle cx="40" cy="34" r="30" fill="url(#th-halo)"/>
  <circle cx="40" cy="34" r="24" fill="none" stroke="#ffd77a" stroke-width="1" opacity="0.6"/>
  <!-- áo bào -->
  <path d="M10 80 C 12 64 22 57 40 56 C 58 57 68 64 70 80 Z" fill="url(#th-robe)"/>
  <path d="M22 62 C 30 60 34 64 40 72 C 46 64 50 60 58 62 L 56 58 C 50 57 45 58 40 60 C 35 58 30 57 24 58 Z" fill="#2f5fa0"/>
  <path d="M33 59 L 40 70 L 47 59 L 44 58 L 40 64 L 36 58 Z" fill="#fff4dc"/>
  <path d="M40 72 L 40 80" stroke="#8c3b2a" stroke-width="1.5"/>
  <rect x="26" y="74" width="28" height="3" rx="1" fill="#e8b13a"/>
  <!-- cổ, mặt -->
  <rect x="35" y="48" width="10" height="9" fill="#e0b08c"/>
  <ellipse cx="40" cy="40" rx="11.5" ry="13" fill="#f4cfae"/>
  <ellipse cx="28.8" cy="41" rx="2" ry="3.2" fill="#eab894"/><ellipse cx="51.2" cy="41" rx="2" ry="3.2" fill="#eab894"/>
  <ellipse cx="33.5" cy="44" rx="3" ry="1.8" fill="#f2a08a" opacity="0.6"/><ellipse cx="46.5" cy="44" rx="3" ry="1.8" fill="#f2a08a" opacity="0.6"/>
  <path d="M30.5 36 Q 34 33.6 37.5 34.6 M42.5 34.6 Q 46 33.6 49.5 36" stroke="#2a1d14" stroke-width="1.6" stroke-linecap="round"/>
  <path d="M32.3 39.6 q 2.7 -2 5.4 0 q -2.7 1.1 -5.4 0 Z M42.3 39.6 q 2.7 -2 5.4 0 q -2.7 1.1 -5.4 0 Z" fill="#2a1d14"/><path d="M32 38.2 q 3 -1.6 6 0 M42 38.2 q 3 -1.6 6 0" stroke="#c99472" stroke-width="0.8" fill="none"/>
  <path d="M40 39 L 39 44 L 41 44" stroke="#c99472" stroke-width="1" fill="none" stroke-linecap="round"/>
  <!-- ria, râu -->
  <path d="M29.5 44 C 30 50 32 54 33.5 57 M50.5 44 C 50 50 48 54 46.5 57" stroke="#2a1d14" stroke-width="1.2" fill="none" stroke-linecap="round"/>
  <path d="M40 46.5 C 37 46 34 47 32 50 C 35 48.5 37.5 48 40 48 C 42.5 48 45 48.5 48 50 C 46 47 43 46 40 46.5 Z" fill="#2a1d14"/>
  <path d="M38 50.5 C 38 55 39 60 40 66 C 41 60 42 55 42 50.5 Z" fill="#2a1d14"/>
  <path d="M38.6 49.4 q 1.4 0.8 2.8 0" stroke="#b5544a" stroke-width="1" fill="none"/>
  <!-- mũ cánh chuồn -->
  <ellipse cx="16" cy="27" rx="11" ry="4.6" fill="#1a1414" transform="rotate(-12 17 27)"/>
  <ellipse cx="64" cy="27" rx="11" ry="4.6" fill="#1a1414" transform="rotate(12 63 27)"/>
  <ellipse cx="17" cy="27" rx="6.5" ry="2" fill="none" stroke="#e8b13a" stroke-width="0.8" transform="rotate(-12 17 27)"/>
  <ellipse cx="63" cy="27" rx="6.5" ry="2" fill="none" stroke="#e8b13a" stroke-width="0.8" transform="rotate(12 63 27)"/>
  <path d="M26 30 C 26 18 32 11 40 11 C 48 11 54 18 54 30 Z" fill="#1a1414"/>
  <path d="M30 16 C 33 9 47 9 50 16 C 46 13 34 13 30 16 Z" fill="#2c2424"/>
  <rect x="26" y="27" width="28" height="5" rx="1.5" fill="#c0392b"/>
  <rect x="26" y="27" width="28" height="1.2" fill="#e8b13a"/>
  <circle cx="40" cy="22" r="3" fill="#e8b13a"/><circle cx="40" cy="22" r="1.4" fill="#d8322d"/>
</svg>`;

/**
 * Chạy một đoạn hội thoại kiểu truyện tranh ở cuối màn hình.
 * Nhấp / Space / Enter: hiện hết câu hoặc sang câu sau. Esc hoặc nút "Bỏ qua": bỏ cả đoạn.
 */
export function playStory(root: HTMLElement, scene: GameScene, lines: StoryLine[]): Promise<void> {
  const el = document.createElement('div');
  el.className = 'story';
  el.innerHTML = `
    <button class="story-skip" title="Bỏ qua đoạn mở đầu (Esc)">Bỏ qua ⏭</button>
    <div class="story-box">
      <div class="story-portrait"></div>
      <div class="story-body">
        <b class="story-name"></b>
        <p class="story-text"></p>
      </div>
      <span class="story-next">▼</span>
    </div>`;
  root.appendChild(el);
  root.classList.add('cinematic');

  const box = el.querySelector<HTMLElement>('.story-box')!;
  const portrait = el.querySelector<HTMLElement>('.story-portrait')!;
  const name = el.querySelector<HTMLElement>('.story-name')!;
  const text = el.querySelector<HTMLElement>('.story-text')!;

  let index = -1;
  let chars: string[] = [];
  let shown = 0;
  let timer = 0;
  let ended = false;

  return new Promise((resolve) => {
    const finish = () => {
      if (ended) return;
      ended = true;
      clearInterval(timer);
      window.removeEventListener('keydown', onKey);
      root.classList.remove('cinematic');
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 350);
      scene.storyShot('home');
      resolve();
    };

    const show = (i: number) => {
      index = i;
      const line = lines[i];
      const divine = line.who === 'thanhHoang';
      box.classList.toggle('divine', divine);
      box.classList.remove('pop');
      void box.offsetWidth;
      box.classList.add('pop');
      name.textContent = SPEAKER_NAMES[line.who];
      if (divine) portrait.innerHTML = THANH_HOANG_SVG;
      else portrait.textContent = scene.villagers.find((v) => v.def.given === line.who)?.avatar ?? '🙂';
      if (line.shot) scene.storyShot(line.shot);
      if (line.sfx) scene.sfx(line.sfx);

      chars = Array.from(line.text);
      shown = 0;
      text.textContent = '';
      box.classList.remove('done');
      clearInterval(timer);
      timer = window.setInterval(() => {
        shown++;
        text.textContent = chars.slice(0, shown).join('');
        if (shown >= chars.length) complete();
      }, TYPE_MS);
    };

    const complete = () => {
      clearInterval(timer);
      shown = chars.length;
      text.textContent = chars.join('');
      box.classList.add('done');
    };

    const advance = () => {
      // Trình duyệt chỉ cho phát âm thanh sau khi người chơi bấm.
      scene.startAudio();
      if (shown < chars.length) complete();
      else if (index + 1 < lines.length) show(index + 1);
      else finish();
    };

    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Space' || e.code === 'Enter') {
        e.preventDefault();
        advance();
      } else if (e.code === 'Escape') {
        scene.startAudio();
        finish();
      }
    };

    el.addEventListener('click', (e) => {
      if ((e.target as HTMLElement).closest('.story-skip')) {
        scene.startAudio();
        finish();
      } else advance();
    });
    window.addEventListener('keydown', onKey);
    show(0);
  });
}
