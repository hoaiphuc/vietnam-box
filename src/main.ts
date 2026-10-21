import Phaser from 'phaser';
import './style.css';
import { GameScene } from './scenes/GameScene';

async function start() {
  // Đợi font tiếng Việt (tối đa 1.5s, offline thì dùng font hệ thống).
  await Promise.race([document.fonts.load('600 13px "Be Vietnam Pro"').catch(() => null), new Promise((r) => setTimeout(r, 1500))]);

  const game = new Phaser.Game({
    type: Phaser.AUTO,
    parent: 'game',
    backgroundColor: '#2f4f2a',
    scale: { mode: Phaser.Scale.RESIZE, width: window.innerWidth, height: window.innerHeight },
    render: { antialias: true },
    // Âm thanh tự tổng hợp bằng Web Audio (src/audio), không dùng bộ âm thanh của Phaser.
    audio: { noAudio: true },
    scene: [GameScene],
  });

  if (import.meta.env.DEV) (window as unknown as { game: Phaser.Game }).game = game;
  if (import.meta.hot) import.meta.hot.dispose(() => game.destroy(true));
}

start();
