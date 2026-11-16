# Балда: авторитарный WS-сервер (server/, общий код shared/).
# Рантайм — tsx (TS без сборки), поэтому образ простой: все исходники + словарь.
FROM node:20-alpine

WORKDIR /app
ENV NODE_ENV=production

# Сначала только манифесты — слой с зависимостями кэшируется.
# Без fallback на npm install: рассинхрон package-lock.json должен
# ломать сборку образа сразу, а не маскироваться «как-нибудь установилось».
COPY package.json package-lock.json ./
COPY shared/package.json shared/
COPY server/package.json server/
COPY client/package.json client/
RUN npm ci --no-audit --no-fund

# Исходники: общий код, сервер и словарь (DICT_PATH по умолчанию
# указывает на client/public/dict/words.txt).
COPY shared/ shared/
COPY server/ server/
COPY client/public/dict/words.txt client/public/dict/words.txt

# Непривилегированный пользователь: процесс в контейнере не root.
RUN addgroup -S balda && adduser -S balda -G balda && mkdir -p /data && chown -R balda:balda /data

ENV PORT=3001 \
    PLAYERS_PATH=/data/players.json
# Профили игроков переживают пересоздание контейнера: том на /data.
VOLUME ["/data"]

USER balda

EXPOSE 3001

# /health отвечает и по HTTP, и содержит счётчики комнат/игроков.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||3001)+'/health').then(r=>r.ok?process.exit(0):process.exit(1)).catch(()=>process.exit(1))"

CMD ["npm", "run", "start", "--workspace", "server"]
