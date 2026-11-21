import { Application, Container, Graphics } from 'pixi.js';
import { loadDawg } from './dict/dictionary';
import { createAdapter, shouldShowInterstitial } from './platform';
import type { LeaderboardRow } from './platform';
import { addResult, parseLeaderboard, serializeLeaderboard, LEADERBOARD_KEY } from './game/leaderboard';
import type { LeaderboardEntry } from './game/leaderboard';
import { setTheme } from './theme';
import { palette, themeKind, pageBackground } from './theme';
import { getPerformanceConfig, invalidateDeviceInfo } from './perf';
import { installAudioUnlock } from './audio/Sound';
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
const cssBackground = (): string => pageBackground();

/** Уступить кадр: браузер отрисовывает #boot до тяжёлой синхронной работы. */
const nextFrame = (): Promise<void> =>
  new Promise((resolve) => requestAnimationFrame(() => resolve()));

/** Шрифты лежат в public/fonts (OFL); при сбое остаётся запасной serif. */
async function loadFonts(): Promise<void> {
  const faces: Array<[string, string, FontFaceDescriptors]> = [
    ['Plex Serif', 'PlexSerif-Bold.woff', { weight: '700' }],
    ['Lora', 'Lora-Regular.woff', { weight: '400' }],
    ['Lora', 'Lora-BoldItalic.woff', { weight: '700', style: 'italic' }],
  ];
  await Promise.all(
    faces.map(async ([family, file, desc]) => {
      try {
        const face = new FontFace(family, `url(./fonts/${file})`, desc);
        document.fonts.add(await face.load());
      } catch {
        /* запасной шрифт */
      }
    }),
  );
}

async function bootstrap(): Promise<void> {
  const adapter = await createAdapter();
  await loadFonts();

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
    backgroundAlpha: 0, // фон страницы (CSS-градиент) просвечивает через canvas
    resizeTo: window,
    antialias: perfConfig.antialias,
    resolution: perfConfig.resolution,
    autoDensity: perfConfig.autoDensity,
  });
  document.body.appendChild(app.canvas);
  installAudioUnlock();
  document.body.style.background = cssBackground();
  document.documentElement.style.background = cssBackground();
  // Фон рисуется в Pixi (однотонная заливка + мягкое свечение из наложенных эллипсов),
  // чтобы не зависеть от CSS-подложки страницы.
  const backdrop = new Graphics();
  const drawBackdrop = (): void => {
    const w = app.screen.width;
    const h = app.screen.height;
    backdrop.clear();
    backdrop.rect(0, 0, w, h).fill({ color: palette().bg });
    const steps = 18;
    for (let i = 0; i < steps; i++) {
      const k = 1 - i / steps;
      backdrop
        .ellipse(w / 2, h * 0.38, w * 0.9 * k, h * 0.55 * k)
        .fill({ color: palette().bgGlow, alpha: 0.07 });
    }
  };
  drawBackdrop();
  app.stage.addChildAt(backdrop, 0);
  app.renderer.on('resize', drawBackdrop);
  app.stage.eventMode = 'static';
  app.stage.hitArea = app.screen;

  window.addEventListener('resize', () => {
    invalidateDeviceInfo();
  });

  // Экран загрузки — DOM-оверлей #boot из index.html (не Pixi): он отрисовывается
  // до синхронной сборки DAWG, тогда как Pixi-заглушка первый кадр не показывала.
  const bootText = document.getElementById('boot-text');

  await nextFrame();
  if (bootText !== null) bootText.textContent = 'Загрузка словаря…';

  let loaded = await loadDawg();
  let dawg = loaded.dawg;

  // Деградация словаря должна быть видимой: баннер + кнопка повтора.
  const removeDictBanner = (): void => {
    document.getElementById('dict-banner')?.remove();
  };
  const retryDictLoad = async (): Promise<void> => {
    const button = document.querySelector<HTMLButtonElement>('#dict-banner button');
    if (button !== null) button.disabled = true;
    const retry = await loadDawg();
    if (retry.source === 'full') {
      loaded = retry;
      dawg = retry.dawg;
      removeDictBanner();
      showMenu();
    } else {
      const text = document.getElementById('dict-banner-text');
      if (text !== null) text.textContent = 'Полный словарь недоступен. Проверьте сеть и повторите.';
      if (button !== null) button.disabled = false;
    }
  };
  const showDictBanner = (): void => {
    removeDictBanner();
    const banner = document.createElement('div');
    banner.id = 'dict-banner';
    const text = document.createElement('span');
    text.id = 'dict-banner-text';
    text.textContent =
      'Ограниченный словарь (' + loaded.size + ' слов). Часть слов может не приниматься.';
    const retryButton = document.createElement('button');
    retryButton.textContent = 'Повторить загрузку';
    retryButton.addEventListener('click', () => {
      void retryDictLoad();
    });
    banner.appendChild(text);
    banner.appendChild(retryButton);
    document.body.appendChild(banner);
  };
  if (loaded.source === 'dev') showDictBanner();

  const boot = document.getElementById('boot');
  if (boot !== null) boot.remove();

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
      new LobbyScene(
        app,
        playerName,
        adapter.storage,
        {
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
        },
        adapter.id,
      ),
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
      // Видимость состояния словаря в подвале меню.
      const dictInfo =
        loaded.source === 'full'
          ? 'Словарь: ' + loaded.size.toLocaleString('ru-RU') + ' слов'
          : 'Словарь: ограниченный';
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
              drawBackdrop();
              document.body.style.background = cssBackground();
  document.documentElement.style.background = cssBackground();
              void adapter.storage.set('balda.theme', themeKind());
              showMenu();
            },
            onOnline: showLobby,
          },
          leaderboard,
          nativeTop,
          dictInfo,
        ),
      );
    })();
  };
  showMenu();

  // Сообщаем платформе, что игра полностью загрузилась (требование Яндекс Игр).
  await adapter.ready();
}

void bootstrap();
