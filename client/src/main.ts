import { Application, Container, Text } from 'pixi.js';
import { loadDawg } from './dict/dictionary';
import { createAdapter, shouldShowInterstitial } from './platform';
import { setTheme } from './theme';
import { FONT_FAMILY, palette, themeKind } from './theme';
import { GameScene } from './ui/GameScene';
import type { GameSceneOptions } from './ui/GameScene';
import { MenuScene } from './ui/MenuScene';

interface Scene {
  view: Container;
  destroy(): void;
}

/** Цвет фона страницы синхронизируется с темой, чтобы не было вспышек. */
const cssBackground = (): string => '#' + palette().bg.toString(16).padStart(6, '0');

async function bootstrap(): Promise<void> {
  const adapter = await createAdapter();

  try {
    const saved = await adapter.storage.get('balda.theme');
    setTheme(saved === 'light' ? 'light' : 'dark');
  } catch {
    setTheme('dark');
  }

  const app = new Application();
  await app.init({
    background: palette().bg,
    resizeTo: window,
    antialias: true,
    resolution: Math.min(window.devicePixelRatio || 1, 2),
    autoDensity: true,
  });
  document.body.appendChild(app.canvas);
  document.body.style.background = cssBackground();
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  const loading = new Text({
    text: 'Загрузка словаря…',
    style: { fontFamily: FONT_FAMILY, fontSize: 20, fill: palette().textDim },
  });
  loading.anchor.set(0.5);
  loading.position.set(window.innerWidth / 2, window.innerHeight / 2);
  app.stage.addChild(loading);

  const { dawg } = await loadDawg();
  loading.destroy();

  let scene: Scene | null = null;
  const setScene = (next: Scene): void => {
    if (scene !== null) {
      app.stage.removeChild(scene.view);
      scene.destroy();
    }
    scene = next;
    app.stage.addChild(next.view);
  };

  // Межстраничная реклама между партиями: не чаще, чем раз в 3 минуты.
  let lastAdAt = 0;
  const maybeShowInterstitial = async (): Promise<void> => {
    const now = Date.now();
    if (!shouldShowInterstitial(lastAdAt, now)) return;
    lastAdAt = now;
    try {
      await adapter.showInterstitial();
    } catch {
      /* сбой рекламы не должен ломать игру */
    }
  };
  const afterGameOver = async (next: () => void): Promise<void> => {
    await maybeShowInterstitial();
    next();
  };

  const startGame = (options: GameSceneOptions): void => {
    setScene(
      new GameScene(app, options, {
        onMenu: () => void afterGameOver(showMenu),
        onRestart: (nextOptions) => void afterGameOver(() => startGame(nextOptions)),
      }),
    );
  };
  const showMenu = (): void => {
    setScene(
      new MenuScene(app, {
        onStart: (selection) =>
          startGame({
            dawg,
            difficulty: selection.difficulty,
            boardSize: selection.boardSize,
            timeControl: selection.timeControl,
          }),
        onThemeChange: () => {
          app.renderer.background.color = palette().bg;
          document.body.style.background = cssBackground();
          void adapter.storage.set('balda.theme', themeKind());
          showMenu();
        },
      }),
    );
  };
  showMenu();

  // Сообщаем платформе, что игра полностью загрузилась (требование Яндекс Игр).
  await adapter.ready();
}

void bootstrap();
