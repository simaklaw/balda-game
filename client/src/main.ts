import { Application, Container, Text } from 'pixi.js';
import { loadDawg } from './dict/dictionary';
import { setTheme } from './theme';
import { FONT_FAMILY, palette } from './theme';
import { GameScene } from './ui/GameScene';
import type { GameSceneOptions } from './ui/GameScene';
import { MenuScene } from './ui/MenuScene';

interface Scene {
  view: Container;
  destroy(): void;
}

async function bootstrap(): Promise<void> {
  try {
    const saved = localStorage.getItem('balda.theme');
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

  const startGame = (options: GameSceneOptions): void => {
    setScene(new GameScene(app, options, { onMenu: showMenu, onRestart: startGame }));
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
          showMenu();
        },
      }),
    );
  };
  showMenu();
}

void bootstrap();
