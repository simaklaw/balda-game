import { Application, Container, Text } from 'pixi.js';
import { loadDawg } from './dict/dictionary';
import { createAdapter, shouldShowInterstitial } from './platform';
import type { LeaderboardRow } from './platform';
import { addResult, parseLeaderboard, serializeLeaderboard, LEADERBOARD_KEY } from './game/leaderboard';
import type { LeaderboardEntry } from './game/leaderboard';
import { setTheme } from './theme';
import { FONT_FAMILY, palette, themeKind } from './theme';
import { getPerformanceConfig, invalidateDeviceInfo } from './perf';
import { GameScene } from './ui/GameScene';
import type { GameSceneOptions } from './ui/GameScene';
import { LobbyScene } from './ui/LobbyScene';
import { MenuScene } from './ui/MenuScene';
import { OnlineGameScene } from './ui/OnlineGameScene';

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

  const perfConfig = getPerformanceConfig();
  const app = new Application();
  await app.init({
    background: palette().bg,
    resizeTo: window,
    antialias: perfConfig.antialias,
    resolution: perfConfig.resolution,
    autoDensity: perfConfig.autoDensity,
  });
  document.body.appendChild(app.canvas);
  document.body.style.background = cssBackground();
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  window.addEventListener('resize', () => {
    invalidateDeviceInfo();
  });

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

  // Локальный рейтинг: результат оффлайн-партии уходит в хранилище платформы
  // (на Яндексе — облачные сейвы игрока), сбой не должен мешать игре.
  const saveResult = (options: GameSceneOptions, score: number): void => {
    const entry: LeaderboardEntry = {
      score,
      difficulty: options.difficulty,
      boardSize: options.boardSize,
      timeControl: options.timeControl,
      date: new Date().toISOString(),
    };
    void (async () => {
      try {
        const entries = parseLeaderboard(await adapter.storage.get(LEADERBOARD_KEY));
        await adapter.storage.set(LEADERBOARD_KEY, serializeLeaderboard(addResult(entries, entry)));
      } catch {
        /* рейтинг не критичен */
      }
      // Нативный лидерборд площадки (Яндекс): платформа сама хранит максимум.
      const native = adapter.leaderboards;
      if (native !== undefined) {
        try {
          await native.submitScore(score);
        } catch {
          /* без нативного лидерборда играем дальше */
        }
      }
    })();
  };

  const startGame = (options: GameSceneOptions): void => {
    setScene(
      new GameScene(app, options, {
        onMenu: () => void afterGameOver(showMenu),
        onRestart: (nextOptions) => void afterGameOver(() => startGame(nextOptions)),
        onGameOver: (score) => saveResult(options, score),
      }),
    );
  };

  let playerName = 'Игрок';
  try {
    playerName = (await adapter.getPlayerName()) ?? 'Игрок';
  } catch {
    /* имя недоступно — играем под нейтральным именем */
  }

  const showLobby = (): void => {
    setScene(
      new LobbyScene(app, playerName, adapter.storage, {
        onBack: showMenu,
        onGameStarted: (net, state) =>
          setScene(
            new OnlineGameScene(app, net, state, {
              onMenu: () => {
                net.close();
                showMenu();
              },
            }),
          ),
      }),
    );
  };

  const showMenu = (): void => {
    void (async () => {
      let leaderboard: LeaderboardEntry[] = [];
      try {
        leaderboard = parseLeaderboard(await adapter.storage.get(LEADERBOARD_KEY));
      } catch {
        /* пустой рейтинг лучше сломанного меню */
      }
      // Топ нативного лидерборда площадки (Яндекс), если он доступен.
      let nativeTop: LeaderboardRow[] = [];
      const native = adapter.leaderboards;
      if (native !== undefined) {
        try {
          nativeTop = (await native.getTopScores(10)) ?? [];
        } catch {
          nativeTop = [];
        }
      }
      setScene(
        new MenuScene(
          app,
          {
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
            onOnline: showLobby,
          },
          leaderboard,
          nativeTop,
        ),
      );
    })();
  };
  showMenu();

  // Сообщаем платформе, что игра полностью загрузилась (требование Яндекс Игр).
  await adapter.ready();
}

void bootstrap();
