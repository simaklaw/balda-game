# Публикация на всех платформах

## Обзор

Игра «Балда» поддерживает публикацию на следующих платформах:
- **Вэб** (standalone, PWA)
- **Яндекс Игры**
- **VK Mini Apps**
- **Telegram Mini Apps**
- **OK (Одноклассники)**

Все платформы используют общий кодовую базу благодаря адаптеру `PlatformAdapter`.

---

## 🌐 Вэб (Standalone / PWA)

### Подготовка

1. **Сборка клиента:**
   ```bash
   cd client
   npm run build
   ```
   
   Результат: `client/dist/`

2. **Обслуживание статики:**
   - Разместите содержимое `client/dist/` на любом статическом хостинге (Vercel, Netlify, GitHub Pages, Nginx, etc.)
   - Убедитесь, что сервер отдаёт `index.html` для всех маршрутов (SPA mode)

3. **PWA (Progressive Web App):**
   - `client/public/manifest.json` — манифест PWA
   - `client/public/sw.js` — Service Worker (опционально)
   - Иконки: `client/public/icons/`

### Nginx конфигурация (пример)

```nginx
server {
    listen 80;
    server_name balda.yourdomain.com;
    root /var/www/balda/client/dist;
    index index.html;
    
    location / {
        try_files $uri $uri/ /index.html;
    }
    
    # Кэширование статики
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg|woff2?|ttf|eot)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
```

### GitHub Pages

1. В `client/vite.config.ts` убедитесь, что `base` установлен правильно:
   ```typescript
   export default defineConfig({
     base: '/balda-game/', // или '/' для корневого домена
     // ...
   })
   ```

2. Запушьте `client/dist/` в ветку `gh-pages`

---

## 🟡 Яндекс Игры

### Подготовка

1. **Создайте игру в Яндекс.Играх:**
   - Перейдите в [Яндекс.Игры для разработчиков](https://yandex.ru/dev/games/)
   - Нажмите «Создать игру»
   - Заполните основную информацию

2. **Загрузите архив:**
   ```bash
   cd client
   npm run build
   # Создайте ZIP-архив с содержимым dist/
   zip -r balda-yandex.zip dist/
   ```

3. **Загрузите архив в Яндекс.Игры:**
   - В карточке игры выберите «Версии» → «Добавить версию»
   - Загрузите `balda-yandex.zip`
   - Укажите версию (например, `1.0.0`)

4. **Настройте игру:**
   - **Тип игры:** HTML5
   - **Ориентация:** Портретная и ландшафтная (поддерживается)
   - **Разрешения:** 320x480 до 1920x1080
   - **Иконка:** 96x96 PNG
   - **Заставка:** 1170x600 PNG/JPG

5. **Интеграция с платформой:**
   - Включите `YaGames` адаптер в `client/src/platform.ts`
   - Платформа автоматически подключает SDK Яндекс.Игр
   - Используйте `yaGames.init()` в `main.ts`

6. **Облачные сохранения:**
   - Используйте `yaGames.getStorage()` для хранения данных игрока
   - Адаптер `PlatformAdapter` автоматически использует облачные сейвы

7. **Реклама:**
   - Включите показы рекламы через `yaGames.adv.showFullscreenAdv()`
   - Настройте в карточке игры

8. **Модерация:**
   - Отправьте на модерацию через панель Яндекс.Игр
   - Срок модерации: 1-3 рабочих дня

### Публикация

После одобрения модерации игра станет доступна в каталоге Яндекс.Игр.

### Ссылки

- [Документация Яндекс.Игр](https://yandex.ru/dev/games/doc/)
- [API Яндекс.Игр](https://yandex.ru/dev/games/doc/dg/reference/index.html)

---

## 🔵 VK Mini Apps

### Подготовка

1. **Создайте Mini App в VK:**
   - Перейдите в [VK для разработчиков](https://dev.vk.com/)
   - Создайте новое приложение типа «Mini App»
   - Заполните основную информацию

2. **Настройте приложение:**
   - **Тип:** Mini App
   - **Платформа:** Web
   - **URL приложения:** `https://ваш-домен.com/balda/` (или локально для тестирования)
   - **Base URL:** `https://ваш-домен.com/balda/`

3. **Добавьте VK Bridge:**
   В `client/index.html` добавьте перед `</head>`:
   ```html
   <script src="https://vk.com/js/api/xd_connection.js?2" type="text/javascript"></script>
   ```

4. **Сборка и загрузка:**
   ```bash
   cd client
   npm run build
   # Загрузите содержимое dist/ на ваш сервер
   ```

5. **Интеграция с платформой:**
   - Включите `VK` адаптер в `client/src/platform.ts`
   - Платформа автоматически определяет VK Mini Apps

6. **Облачные сохранения:**
   - Используйте `VKWebAppStorage` через адаптер
   - Данные хранятся в localStorage с префиксом VK

7. **Реклама:**
   - Доступна через VK Bridge: `VKWebAppShowInterstitialAd()`

8. **Тестирование:**
   - Используйте [VK Mini Apps Test Stand](https://dev.vk.com/mini-apps/testing)
   - Или запускайте локально с параметром `?vk_app_id=YOUR_APP_ID`

9. **Модерация:**
   - Отправьте на модерацию через панель VK
   - Срок модерации: 1-5 рабочих дней

### Публикация

После одобрения приложение появится в каталоге VK Mini Apps.

### Ссылки

- [Документация VK Mini Apps](https://dev.vk.com/mini-apps)
- [VK Bridge API](https://dev.vk.com/mini-apps/api/bridge)

---

## 📱 Telegram Mini Apps

### Подготовка

1. **Создайте бота в BotFather:**
   - Откройте [@BotFather](https://t.me/BotFather) в Telegram
   - Создайте нового бота: `/newbot`
   - Получите токен бота

2. **Настройте Mini App:**
   - В BotFather: `/setmenubutton` → Выберите бота → Укажите URL вашего приложения
   - Или используйте [@WebAppBot](https://t.me/WebAppBot) для тестирования

3. **Добавьте Telegram WebApp SDK:**
   В `client/index.html` добавьте перед `</head>`:
   ```html
   <script src="https://telegram.org/js/telegram-web-app.js"></script>
   ```

4. **Сборка и загрузка:**
   ```bash
   cd client
   npm run build
   # Загрузите содержимое dist/ на ваш сервер
   ```

5. **Интеграция с платформой:**
   - Включите `Telegram` адаптер в `client/src/platform.ts`
   - Платформа автоматически определяет Telegram Mini Apps

6. **Облачные сохранения:**
   - Используйте `tg.saveData()` и `tg.loadData()` через адаптер
   - Данные хранятся в облаке Telegram

7. **Реклама:**
   - Telegram не поддерживает рекламу в Mini Apps
   - Используйте другие методы монетизации

8. **Тестирование:**
   - Используйте [@WebAppBot](https://t.me/WebAppBot) для тестирования
   - Или запускайте локально с параметром `?tgWebAppStartParam=test`

9. **Публикация:**
   - Опубликуйте бот в Telegram
   - Настройте кнопку запуска Mini App в меню бота

### Публикация

Приложение будет доступно через бота в Telegram.

### Ссылки

- [Документация Telegram WebApp](https://core.telegram.org/bots/webapps)
- [Telegram WebApp API](https://core.telegram.org/bots/api#webapps)

---

## 🟠 OK (Одноклассники)

### Подготовка

1. **Создайте приложение в OK:**
   - Перейдите в [OK для разработчиков](https://ok.ru/developer)
   - Создайте новое приложение
   - Выберите тип «Игра» или «Приложение»

2. **Настройте приложение:**
   - **Тип:** HTML5 игра
   - **URL приложения:** `https://ваш-домен.com/balda/`
   - **Размеры:** 728x90 (баннер), 100x100 (иконка)

3. **Добавьте OK SDK:**
   В `client/index.html` добавьте перед `</head>`:
   ```html
   <script src="//connect.ok.ru/dk?st=YOUR_APP_KEY&sz=auto&uif=auto"></script>
   ```

4. **Сборка и загрузка:**
   ```bash
   cd client
   npm run build
   # Загрузите содержимое dist/ на ваш сервер
   ```

5. **Интеграция с платформой:**
   - Включите `OK` адаптер в `client/src/platform.ts`
   - Платформа автоматически определяет OK

6. **Облачные сохранения:**
   - Используйте `OK.Storage` через адаптер
   - Данные хранятся в облаке OK

7. **Реклама:**
   - Доступна через OK SDK

8. **Тестирование:**
   - Используйте тестовый режим в панели OK

9. **Модерация:**
   - Отправьте на модерацию через панель OK

### Публикация

После одобрения приложение появится в каталоге OK.

### Ссылки

- [Документация OK](https://apiok.ru/)
- [OK SDK](https://apiok.ru/dev/methods/)

---

## 📊 Общие рекомендации

### 1. Адаптация под платформы

Игра уже адаптирована для всех платформ благодаря:
- **PlatformAdapter** — унифицированный интерфейс для всех платформ
- **Responsive Design** — адаптивный дизайн для всех размеров экранов
- **Safe Areas** — учёт безопасных зон (вырезы, кнопки навигации)
- **Landscape Mode** — поддержка ландшафтного режима

### 2. Облачные сохранения

Все платформы поддерживают облачные сохранения через `PlatformAdapter`:
```typescript
import { getPlatform } from './platform';

const platform = getPlatform();

// Сохранение данных
await platform.storage.set('leaderboard', JSON.stringify(leaderboard));

// Загрузка данных
const data = await platform.storage.get('leaderboard');
```

### 3. Реклама

Интеграция рекламы через адаптер:
```typescript
import { getPlatform } from './platform';

const platform = getPlatform();

// Показ полноэкранной рекламы
if (platform.showInterstitial) {
  await platform.showInterstitial();
}
```

### 4. Имя игрока

Получение имени игрока:
```typescript
const platform = getPlatform();
const playerName = await platform.getPlayerName();
```

### 5. Событие ready

Ожидание загрузки платформы:
```typescript
const platform = getPlatform();
await platform.ready();
```

---

## 🚀 Чек-лист перед публикацией

### Для всех платформ:
- [ ] Игра проходит все тесты (`npm test`)
- [ ] Нет ошибок TypeScript (`npm run build`)
- [ ] Нет ошибок ESLint (`npm run lint`)
- [ ] Игра работает в тестовом режиме платформы
- [ ] Облачные сохранения работают
- [ ] Аналитика работает
- [ ] Все функции доступны

### Для каждой платформы:
- [ ] Иконки и заставки соответствуют требованиям
- [ ] Описание игры заполнено
- [ ] Скриншоты добавлены
- [ ] Возрастные ограничения указаны
- [ ] Контактная информация указана

### После публикации:
- [ ] Проверьте статистику в панели разработчика
- [ ] Отслеживайте отзывы игроков
- [ ] Обновляйте игру при обнаружении багов

---

## 📞 Поддержка

- **Яндекс.Игры:** [Поддержка разработчиков](https://yandex.ru/support/games/)
- **VK:** [Поддержка VK](https://dev.vk.com/support)
- **Telegram:** [Telegram Bot API](https://core.telegram.org/bots/api)
- **OK:** [Поддержка OK](https://apiok.ru/support)

---

*Документация актуализирована: Ноябрь 2026*
