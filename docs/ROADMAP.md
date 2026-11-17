# Дорожная карта

## Этап 0 — Инфраструктура
- [x] Каркас монорепо (client / server / shared / docs)
- [x] Vitest + ESLint + Prettier
- [x] GitHub Actions CI (lint + test)

## Этап 1 — Ядро игры (shared/, чистый TS, без UI)
- [x] Модель: Board (3×3/5×5/7×7), ход, счёт, состояния партии
- [x] Валидация хода: соседство (орт./диаг.), новая буква, слово в DAWG
- [x] DAWG: реализация структуры, сериализация, сборка из word-list
- [x] ИИ-соперник: перебор с эвристикой (easy / medium / hard)
- [x] Юнит-тесты правил, словаря, игры и ИИ
- [x] Источник словаря: Harrix/Russian-Nouns → `client/public/dict/words.txt`
      (49 312 слов + words-extra; сверка с Зализняком — см. docs/DICTIONARY.md)
- [x] Поражение по времени: `Game.declareTimeout`, EndReason 'timeout'

## Этап 2 — UI на PixiJS (client/)
- [x] Vite + TypeScript + PixiJS-каркас
- [x] Экраны: меню → игра → результат (FSM)
- [x] Поле, drag-to-select + пошаговый клик
- [x] Кастомная canvas-клавиатура (системная клавиатура не используется)
- [x] Оффлайн-режим против ИИ (3×3 «бал» / 5×5 «балда», сложность easy/medium/hard)
- [x] Таймеры: 2 мин на ход (авто-пас), блиц и Фишер (поражение по времени)
- [x] История ходов: панель со списком слов и очков
- [x] Тёмная/светлая тема, выбор сохраняется через платформенное хранилище
- [x] Mobile-first: safe-зоны, адаптивная вёрстка 320–1920px
- [x] Толковый словарь (Викисловарь, кэш localStorage, CC BY-SA)
- [x] UX: автоотправка, pop/тряска, подсказки, правила
- [x] 60 FPS; ландшафт на телефонах

## Этап 3 — SDK Abstraction Layer → первый релиз
- [x] PlatformAdapter + веб / Яндекс / VK / Telegram / OK
- [x] Лидерборды Яндекса, interstitial, cloud storage
- [x] docs/PUBLISH_YANDEX.md, docs/PUBLISH_ALL.md

## Этап 4 — Мультиплеер (server/)
- [x] Authoritative WS, комнаты, валидация shared/
- [x] Таймер хода, 3 пропуска, reconnect 45 с
- [x] Эло + фишки, PlayerStore, profile
- [x] Docker + WSS — docs/DEPLOY.md
- [ ] БД/Redis при росте нагрузки

## Этап 5 — Античит и монетизация
- [x] Телеметрия, Shadow Pool, косметика, жалобы на слова

## Этап 6 — Софт-запуск
- [x] Аналитика, A/B, docs/PUBLISH_ALL.md

## Этап 7 — Hardening к публикации (ноябрь 2026)
- [x] Аккаунты: AccountStore + Authenticator (guest / Telegram / VK / OK / Yandex TOFU)
- [x] Протокол auth / auth-ok / auth-failed; рейтинг в AccountStore
- [x] Клиент: NetClient.authenticate, Lobby ensureAuth (platformId)
- [x] DAWG в Web Worker + fallback на main (таймаут 30 с)
- [x] Онлайн: «Сдаться» с подтверждением
- [x] Словарь: words-extra.txt — 734 неологизма (Шагалова, XXI в.)
- [x] a11y: lang=ru, aria-live, sr-only, prefers-reduced-motion
- [x] PWA: manifest.json; иконки 192/512 (заглушка «Б»)
- [ ] Иконки финального дизайна; черновики на Яндекс / VK / Telegram
- [ ] БД/Redis при росте нагрузки
