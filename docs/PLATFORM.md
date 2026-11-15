# Платформенный слой (client/src/platform/)

Игровой код не знает, на какой площадке запущен: всё общение с площадкой идёт
через интерфейс `PlatformAdapter`. Это позволяет добавлять новые платформы
(VK, OK, Telegram) без изменений в логике игры.

## Интерфейс

```ts
interface PlatformAdapter {
  readonly id: 'web' | 'yandex' | 'vk';
  ready(): Promise<void>;              // «игра загрузилась» (требование Яндекс Игр)
  getPlayerName(): Promise<string | null>;
  showInterstitial(): Promise<void>;   // межстраничная реклама, резолв после закрытия
  storage: { get/set/remove };         // облачное хранилище, где доступно
}
```

В будущем интерфейс дополняется методами `showRewarded()`, `setLeaderboardScore()`,
`purchase()` — существующий код это не ломает.

## Адаптеры

| Файл | Платформа | Особенности |
| --- | --- | --- |
| `web.ts` | Просто браузер | localStorage, без рекламы и авторизации |
| `yandex.ts` | Яндекс Игры | SDK `/sdk.js`, LoadingAPI.ready, реклама, игрок, облачные сейвы |
| `vk.ts` | VK Mini Apps | vk-bridge: VKWebAppInit, VKWebAppGetUserInfo, VKWebAppStorage, VKWebAppShowNativeAds |

## Выбор платформы (`index.ts`)

`createAdapter()` смотрит на URL и user-agent: Яндекса — (`yandex`, `ysdk`,
`ya.ru`, UA `YaApp`; просто YaBrowser считается вебом), VK — (`vk_app_id` в URL
запуска мини-аппа, ссылки `vk.com` / `vk.ru`). Яндексовский SDK подгружается
скриптом, vk-bridge — динамическим импортом (отдельный чанк, грузится только
внутри VK). При любом сбое молча откатываемся на `WebAdapter` — игра никогда
не падает из-за площадки.

## VK Mini Apps (`vk.ts`)

- `ready()` → `VKWebAppInit` (обязательное событие запуска мини-аппа).
- `getPlayerName()` → `VKWebAppGetUserInfo`, имя + фамилия; сбой → null.
- Хранилище → `VKWebAppStorageGet/Set` (облачное), при сбое — фолбэк на
  `localStorage`. Удаления в VK Storage нет: `remove()` записывает пустую
  строку, а `get()` читает пустую строку как «ключа нет» (null).
- `showInterstitial()` → `VKWebAppShowNativeAds` с `ad_format: 'interstitial'`;
  страховочный таймаут 20 с, зависнуть игра не может.

Публикация черновика VK-аппа — через vk.com/editapp?act=settings (см. задачу
в ROADMAP, Этап 3).

## Реклама

Межстраничная реклама показывается между партиями (кнопки «Меню» и «Ещё раз»
на экране результата), но не чаще одного раза в 3 минуты
(`AD_MIN_INTERVAL_MS = 180000`). `showInterstitial()` резолвится после
закрытия ролика, при ошибке SDK или по страховочному таймауту 20 с —
зависнуть игра не может.

## Хранилище

На Яндексе — `player.getData/setData` (облачные сейвы игрока), в VK —
`VKWebAppStorage`, при сбое или неавторизованном игроке — фолбэк на
`localStorage`. Сейчас через хранилище идёт тема; туда же в будущем лягут
настройки и локальный рейтинг.

## Тесты

`client/tests/platform.test.ts` покрывает `detectPlatform` (Яндекс, VK, веб),
`shouldShowInterstitial` (интервал), `YandexAdapter` и `VKAdapter`
(имя игрока, облачное хранилище, фолбэки, рекламные колбэки и guard-таймаут)
на фейковых SDK/bridge.
