# Платформенный слой (client/src/platform/)

Игровой код не знает, на какой площадке запущен: всё общение с площадкой идёт
через интерфейс `PlatformAdapter`. Это позволяет добавлять новые платформы
(VK, Telegram, OK) без изменений в логике игры.

## Интерфейс

```ts
interface PlatformAdapter {
  readonly id: 'web' | 'yandex' | 'vk' | 'telegram';
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
| `telegram.ts` | Telegram Mini Apps | глобальный `window.Telegram.WebApp`: ready/expand, initDataUnsafe, CloudStorage |

## Выбор платформы (`index.ts`)

`createAdapter()` смотрит на URL и user-agent: Яндекса — (`yandex`, `ysdk`,
`ya.ru`, UA `YaApp`; просто YaBrowser считается вебом), VK — (`vk_app_id` в URL
запуска мини-аппа, ссылки `vk.com` / `vk.ru`, а также `ok.ru`), Telegram — (`t.me`, `telegram`,
параметры `tgWebApp*`). Яндексовский SDK подгружается скриптом, vk-bridge —
динамическим импортом (отдельный чанк, грузится только внутри VK), Telegram
берётся из глобального объекта (скрипт `telegram-web-app.js` подключён в
`client/index.html`). При любом сбое молча откатываемся на `WebAdapter` —
игра никогда не падает из-за площадки.

## Яндекс Игры (`yandex.ts`)

- `ready()` → `features.LoadingAPI.ready()` — после полной загрузки игры.
- `getPlayerName()` → `player.getName()` (getPlayer со `scopes: false`),
  сбой → null.
- Хранилище → `player.getData/setData` (облачные сейвы игрока), при сбое
  или неавторизованном игроке — фолбэк на `localStorage`.
- `showInterstitial()` → `adv.showFullscreenAdv` со страховочным таймаутом
  20 с: если SDK не вызвал ни один колбэк, игра не зависает.
- Публикация черновика — пошаговая инструкция в docs/PUBLISH_YANDEX.md.

## VK Mini Apps (`vk.ts`)

- `ready()` → `VKWebAppInit` (обязательное событие запуска мини-аппа).
- `getPlayerName()` → `VKWebAppGetUserInfo`, имя + фамилия; сбой → null.
- Хранилище → `VKWebAppStorageGet/Set` (облачное), при сбое — фолбэк на
  `localStorage`. Удаления в VK Storage нет: `remove()` записывает пустую
  строку, а `get()` читает пустую строку как «ключа нет» (null).
- `showInterstitial()` → `VKWebAppShowNativeAds` с `ad_format: 'interstitial'`;
  страховочный таймаут настраивается (боевые 20 с), зависнуть игра не может.

Публикация черновика VK-аппа — через vk.com/editapp?act=settings (см. задачу
в ROADMAP, Этап 3).

## Одноклассники

Отдельного адаптера нет: OK больше не принимает новые игры напрямую —
«Создание игр и пользовательских приложений теперь происходит через VK Mini Apps»
(apiok.ru/apps/rules), а ok-js-sdk не обновлялся с 2019 года. Игра регистрируется
как VK Mini App и запускается в OK через ту же платформу VK Mini Apps, поэтому
запуск с `ok.ru` распознаётся как VK-платформа и обслуживается `VKAdapter`.

## Telegram Mini Apps (`telegram.ts`)

- `ready()` → `WebApp.ready()` + `expand()`.
- `getPlayerName()` → `initDataUnsafe.user`: username, иначе имя + фамилия;
  нет пользователя → null.
- Хранилище → `CloudStorage.getItem/setItem/removeItem` (облачное), при сбое
  или молчании — фолбэк на `localStorage`. Каждый вызов под страховочным
  таймаутом (боевые 3 с, настраивается вторым аргументом конструктора):
  колбэки Telegram могут не прийти никогда, зависнуть игра не может.
- `showInterstitial()` — пустая операция: официальной interstitial-рекламы
  в Mini Apps API нет (монетизация Telegram — боты/партнёрки, позже).

Публикация: BotFather → /newapp (Menu Button Web App) на развёрнутый HTTPS-URL
(см. docs/DEPLOY.md).

## Реклама

Межстраничная реклама показывается между партиями (кнопки «Меню» и «Ещё раз»
на экране результата), но не чаще одного раза в 3 минуты
(`AD_MIN_INTERVAL_MS = 180000`). `showInterstitial()` резолвится после
закрытия ролика, при ошибке SDK или по страховочному таймауту —
зависнуть игра не может.

## Хранилище

На Яндексе — `player.getData/setData` (облачные сейвы игрока), в VK —
`VKWebAppStorage`, в Telegram — `CloudStorage`, при сбое или неавторизованном
игроке — фолбэк на `localStorage`. Сейчас через хранилище идут тема
(`balda.theme`) и локальный рейтинг (`balda.leaderboard`); туда же в будущем
лягут настройки.

## Локальный рейтинг (`client/src/game/leaderboard.ts`)

Платформо-независимый модуль: результат каждой завершённой оффлайн-партии
(очки, сложность, поле, контроль времени, дата) попадает в топ-10 личных
результатов. Данные лежат в хранилище платформы — на Яндексе это облачные
сейвы игрока, в вебе — localStorage. Разбор устойчив к мусору: битый JSON
или чужие записи дают пустой рейтинг, а не падение. В меню — кнопка «Рейтинг»
с оверлеем топа. Нативные лидерборды Яндекса — отдельная задача Этапа 6.

## Тесты

`client/tests/platform.test.ts` покрывает `detectPlatform` (Яндекс, VK, OK,
Telegram, веб), `shouldShowInterstitial` (интервал), `YandexAdapter`,
`VKAdapter` и `TelegramAdapter` (имя игрока, облачное хранилище, фолбэки,
guard-таймауты, рекламные колбэки) на фейковых SDK/bridge/WebApp.
`client/tests/leaderboard.test.ts` покрывает разбор/сериализацию, сортировку
с тай-брейком по дате, обрезку топа и формат подписи.
