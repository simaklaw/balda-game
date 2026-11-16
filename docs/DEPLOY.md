# Деплой сервера

Сервер — авторитарный WS-бэкенд (`server/`), рантайм — tsx, сборка не нужна.
Всё упаковано в Docker: образ содержит общий код `shared/`, сервер и словарь
(`client/public/dict/words.txt`).

## Быстрый старт

```bash
docker compose up -d --build
curl http://localhost:3001/health
```

- Порт: `3001` (env `PORT`).
- Профили игроков пишутся в `PLAYERS_PATH` (по умолчанию `/data/players.json`),
  каталог `./data` смонтирован как том — данные переживают пересоздание
  контейнера.
- Состояние: `GET /health` → `{ ok, words, dictSource, rooms, players }`.
- Метрики: `GET /metrics` — текст Prometheus (счётчики `balda_*`: соединения,
  сообщения, ходы, партии, ошибки; датчики: сокеты/комнаты/игроки).

## Переменные окружения

| Переменная              | По умолчанию                        | Назначение                            |
| ----------------------- | ----------------------------------- | ------------------------------------- |
| `PORT`                  | `3001`                              | HTTP + WebSocket на одном порту       |
| `DICT_PATH`             | `client/public/dict/words.txt`      | Список слов (по одному в строке)      |
| `PLAYERS_PATH`          | `data/players.json`                 | Файл профилей (JSON)                  |
| `ALLOWED_ORIGINS`       | пусто (только same-origin)          | Разрешённые Origin для WS, через запятую |
| `MAX_SOCKETS_PER_IP`    | `8`                                 | Лимит одновременных WS-соединений с одного IP |
| `MAX_MESSAGES_PER_WINDOW` | `60`                              | Лимит сообщений за окно 10 с (флуд → закрытие) |

За обратным прокси укажите в `ALLOWED_ORIGINS` адреса площадок
(например, `https://yandex.ru/games,https://games.s3.yandex.net`) — иначе
браузерные клиенты с чужим Origin получат 403. Не-браузерные клиенты
(без Origin) не ограничиваются.

## WSS: HTTPS и защищённый WebSocket

Браузеры на игровых платформах требуют `wss://`. Терминация TLS — на обратном
прокси, серверу достаточно обычного WS.

### Caddy (проще всего, сертификаты сам)

```caddy
balda.example.com {
    reverse_proxy /ws  127.0.0.1:3001
    reverse_proxy /*   127.0.0.1:3001
}
```

### nginx

```nginx
server {
    listen 443 ssl;
    server_name balda.example.com;
    # ssl_certificate / ssl_certificate_key ...

    location /ws {
        proxy_pass http://127.0.0.1:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_read_timeout 300s;   # дольше таймера хода + окна реконнекта
    }
    location / {
        proxy_pass http://127.0.0.1:3001;
    }
}
```

Клиент сам строит `wss://host/ws` из адреса страницы (см. `client/src/net/wsUrl.ts`),
отдельной настройки на фронте не нужно.

## Обновление

```bash
git pull
docker compose up -d --build   # пересборка + перезапуск, профили сохранятся в ./data
```

Graceful shutdown: контейнер получает SIGTERM, сервер сбрасывает профили на диск
и останавливает таймеры комнат (см. `server/src/index.ts`).

## CI

В `.github/workflows/ci.yml` три джобы на каждый пуш: `build-test`
(lint + typecheck + тесты + сборка), `smoke` (сервер играет настоящую партию
двумя WS-клиентами, включая проверку `/metrics`) и `docker` (`docker build`,
так как сломанный Dockerfile ловится до деплоя).
