import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { loadDictionary } from './dictionary';
import { Matchmaker } from './Matchmaker';
import { Metrics } from './metrics';
import { parseClientMessage } from './protocol';
import type { ServerMessage } from './protocol';
import { PlayerStore } from './PlayerStore';
import { AccountStore } from './accounts';
import { Authenticator } from './auth';
import { createRateLimiter } from './rateLimit';
import type { PlayerConnection } from './Room';

const PORT = Number(process.env.PORT ?? 3001);
const DICT_PATH =
  process.env.DICT_PATH ??
  fileURLToPath(new URL('../../client/public/dict/words.txt', import.meta.url));
const PLAYERS_PATH =
  process.env.PLAYERS_PATH ??
  fileURLToPath(new URL('../../data/players.json', import.meta.url));
const ACCOUNTS_PATH =
  process.env.ACCOUNTS_PATH ??
  fileURLToPath(new URL('../../data/accounts.json', import.meta.url));

const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
const MAX_SOCKETS_PER_IP = Number(process.env.MAX_SOCKETS_PER_IP ?? 8);
const MAX_MESSAGES_PER_WINDOW = Number(process.env.MAX_MESSAGES_PER_WINDOW ?? 60);
const MESSAGE_WINDOW_MS = 10_000;
const MAX_PAYLOAD = 16 * 1024;
const MAX_ROOMS = Number(process.env.MAX_ROOMS ?? 256);
const HTTP_RATE_LIMIT = Number(process.env.HTTP_RATE_LIMIT ?? 120);
const HTTP_RATE_WINDOW_MS = 60_000;

const { dawg, size: dictSize, source: dictSource } = loadDictionary(DICT_PATH);

const playerStore = new PlayerStore(PLAYERS_PATH);
playerStore.load();

const accountStore = new AccountStore(ACCOUNTS_PATH);
accountStore.load();
const authenticator = new Authenticator(accountStore, {
  telegramBotToken: process.env.TELEGRAM_BOT_TOKEN,
  vkAppSecret: process.env.VK_APP_SECRET,
  okAppSecret: process.env.OK_APP_SECRET,
});

const metrics = new Metrics();
metrics.gauge('balda_dict_words', () => dictSize);

/** playerId комнаты → accountId (для записи рейтинга в AccountStore). */
const accountByPlayerId = new Map<string, string>();

const matchmaker = new Matchmaker(dawg, {
  players: playerStore,
  accounts: accountStore,
  accountIdFor: (playerId) => accountByPlayerId.get(playerId),
  maxRooms: MAX_ROOMS,
  onStarted: () => metrics.inc('balda_games_started_total'),
  onFinished: () => metrics.inc('balda_games_finished_total'),
  onMoveRejected: (code) => metrics.inc('balda_move_rejected_total', { code }),
});

const httpLimiter = createRateLimiter({ limit: HTTP_RATE_LIMIT, windowMs: HTTP_RATE_WINDOW_MS });

interface Session {
  accountId: string | null;
  roomId: string | null;
  playerId: string | null;
}

const sessions = new WeakMap<WebSocket, Session>();
const socketsPerIp = new Map<string, number>();

metrics.gauge('balda_sockets_current', () =>
  [...socketsPerIp.values()].reduce((sum, n) => sum + n, 0),
);
metrics.gauge('balda_rooms_current', () => matchmaker.roomCount);
metrics.gauge('balda_players_stored', () => playerStore.size);
metrics.gauge('balda_accounts_stored', () => accountStore.size);
metrics.gauge('balda_accounts_full_total', () => accountStore.accountsFullTotal);

function sendTo(socket: WebSocket, msg: ServerMessage): void {
  if (socket.readyState === 1) socket.send(JSON.stringify(msg));
}

function dropPreviousSession(socket: WebSocket): void {
  const prev = sessions.get(socket);
  if (prev === undefined) return;
  if (prev.roomId !== null && prev.playerId !== null) {
    matchmaker.removeFromRoom(prev.roomId, prev.playerId);
    accountByPlayerId.delete(prev.playerId);
  }
  sessions.set(socket, { accountId: prev.accountId, roomId: null, playerId: null });
}

function requireAuth(socket: WebSocket): Session | null {
  const s = sessions.get(socket);
  if (s === undefined || s.accountId === null) {
    sendTo(socket, { type: 'error', message: 'Сначала войдите' });
    return null;
  }
  return s;
}

function originAllowed(origin: string | undefined, req: IncomingMessage): boolean {
  if (!origin) return true;
  if (ALLOWED_ORIGINS.includes(origin)) return true;
  const host = req.headers.host;
  if (host === undefined) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

const httpServer = createServer((req, res) => {
  const ip = req.socket.remoteAddress ?? 'unknown';
  if (!httpLimiter.allow(ip)) {
    metrics.inc('balda_http_rate_limited_total');
    res.writeHead(429, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Слишком много запросов\n');
    return;
  }
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      words: dictSize,
      dictSource,
      rooms: matchmaker.roomCount,
      players: playerStore.size,
      accounts: accountStore.size,
    }));
    return;
  }
  if (req.url === '/metrics') {
    const token = process.env.METRICS_TOKEN;
    if (token) {
      const got = req.headers['x-metrics-token'];
      if (got !== token) {
        res.writeHead(403);
        res.end('forbidden');
        return;
      }
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; version=0.0.4; charset=utf-8' });
    res.end(metrics.render());
    return;
  }
  res.writeHead(404);
  res.end();
});

httpServer.headersTimeout = 10_000;
httpServer.requestTimeout = 20_000;
httpServer.keepAliveTimeout = 30_000;

const wss = new WebSocketServer({
  server: httpServer,
  path: '/ws',
  maxPayload: MAX_PAYLOAD,
  verifyClient: (info, callback) => {
    if (originAllowed(info.origin, info.req)) {
      callback(true);
    } else {
      metrics.inc('balda_ws_rejected_total');
      callback(false, 403, 'Origin запрещён');
    }
  },
});

wss.on('error', (err) => {
  console.error('[server] ошибка WebSocket-сервера:', err);
  metrics.inc('balda_ws_errors_total');
});

wss.on('connection', (socket: WebSocket, req: IncomingMessage) => {
  const ip = req.socket.remoteAddress ?? 'unknown';
  const current = socketsPerIp.get(ip) ?? 0;
  if (current >= MAX_SOCKETS_PER_IP) {
    metrics.inc('balda_ws_rejected_total');
    socket.close(1008, 'Слишком много соединений');
    return;
  }
  socketsPerIp.set(ip, current + 1);
  metrics.inc('balda_ws_connections_total');
  socket.on('close', () => {
    const count = socketsPerIp.get(ip) ?? 1;
    if (count <= 1) socketsPerIp.delete(ip);
    else socketsPerIp.set(ip, count - 1);
  });
  socket.on('error', () => {
    metrics.inc('balda_ws_errors_total');
    try {
      socket.close(1011, 'Ошибка соединения');
    } catch {
      /* сокет уже закрыт */
    }
  });

  const conn: PlayerConnection = {
    send: (msg) => sendTo(socket, msg),
  };

  let windowStart = Date.now();
  let messagesInWindow = 0;

  socket.on('message', (raw) => {
    const now = Date.now();
    if (now - windowStart > MESSAGE_WINDOW_MS) {
      windowStart = now;
      messagesInWindow = 0;
    }
    messagesInWindow += 1;
    if (messagesInWindow > MAX_MESSAGES_PER_WINDOW) {
      metrics.inc('balda_ws_flood_closed_total');
      socket.close(1008, 'Слишком много сообщений');
      return;
    }

    const msg = parseClientMessage(raw.toString());
    if (msg === null) {
      metrics.inc('balda_messages_invalid_total');
      sendTo(socket, { type: 'error', message: 'Неизвестное сообщение' });
      return;
    }
    metrics.inc('balda_messages_total');
    try {
      switch (msg.type) {
        case 'auth': {
          const result = authenticator.authenticate({
            provider: msg.provider,
            externalId: msg.externalId,
            proof: msg.proof,
            accountId: msg.accountId,
            secret: msg.secret,
            name: msg.name,
          });
          if (!result.ok || result.account === undefined) {
            metrics.inc('balda_auth_failed_total');
            sendTo(socket, {
              type: 'auth-failed',
              message: result.error ?? 'Ошибка входа',
            });
            break;
          }
          const acc = result.account;
          const prev = sessions.get(socket);
          sessions.set(socket, {
            accountId: acc.id,
            roomId: prev?.roomId ?? null,
            playerId: prev?.playerId ?? null,
          });
          metrics.inc('balda_auth_ok_total', { provider: acc.provider });
          sendTo(socket, {
            type: 'auth-ok',
            accountId: acc.id,
            secret: result.secret,
            name: acc.displayName,
            profile: {
              rating: acc.rating,
              chips: acc.chips,
              games: acc.games,
              wins: acc.wins,
            },
          });
          break;
        }
        case 'quick-match': {
          const authed = requireAuth(socket);
          if (authed === null) break;
          dropPreviousSession(socket);
          const acc = accountStore.findById(authed.accountId!);
          const name = acc?.displayName ?? msg.name;
          const res = matchmaker.quickMatch(conn, name);
          accountByPlayerId.set(res.playerId, authed.accountId!);
          sessions.set(socket, {
            accountId: authed.accountId,
            roomId: res.room.id,
            playerId: res.playerId,
          });
          metrics.inc('balda_quickmatch_total');
          sendTo(socket, {
            type: 'joined',
            roomId: res.room.id,
            playerId: res.playerId,
            token: res.token,
            you: res.index,
            state: res.room.stateFor(res.index),
          });
          break;
        }
        case 'create-room': {
          const authed = requireAuth(socket);
          if (authed === null) break;
          dropPreviousSession(socket);
          const acc = accountStore.findById(authed.accountId!);
          const name = acc?.displayName ?? msg.name;
          const res = matchmaker.createRoom(conn, name);
          accountByPlayerId.set(res.playerId, authed.accountId!);
          sessions.set(socket, {
            accountId: authed.accountId,
            roomId: res.room.id,
            playerId: res.playerId,
          });
          metrics.inc('balda_createroom_total');
          sendTo(socket, {
            type: 'joined',
            roomId: res.room.id,
            playerId: res.playerId,
            token: res.token,
            you: res.index,
            state: res.room.stateFor(res.index),
          });
          break;
        }
        case 'join-room': {
          const authed = requireAuth(socket);
          if (authed === null) break;
          dropPreviousSession(socket);
          const acc = accountStore.findById(authed.accountId!);
          const name = acc?.displayName ?? msg.name;
          const res = matchmaker.joinRoom(msg.roomId, conn, name);
          if (res === null) {
            sendTo(socket, { type: 'error', message: 'Комната недоступна' });
            break;
          }
          accountByPlayerId.set(res.playerId, authed.accountId!);
          sessions.set(socket, {
            accountId: authed.accountId,
            roomId: res.room.id,
            playerId: res.playerId,
          });
          metrics.inc('balda_joinroom_total');
          sendTo(socket, {
            type: 'joined',
            roomId: res.room.id,
            playerId: res.playerId,
            token: res.token,
            you: res.index,
            state: res.room.stateFor(res.index),
          });
          break;
        }
        case 'move': {
          const session = sessions.get(socket);
          const room =
            session?.roomId !== null && session?.roomId !== undefined
              ? matchmaker.getRoom(session.roomId)
              : undefined;
          if (!session || !room || session.playerId === null) {
            sendTo(socket, { type: 'error', message: 'Вы не в комнате' });
            break;
          }
          room.move(session.playerId, { path: msg.path, cell: msg.cell, letter: msg.letter });
          metrics.inc('balda_moves_total');
          break;
        }
        case 'pass': {
          const session = sessions.get(socket);
          const room =
            session?.roomId !== null && session?.roomId !== undefined
              ? matchmaker.getRoom(session.roomId)
              : undefined;
          if (!session || !room || session.playerId === null) {
            sendTo(socket, { type: 'error', message: 'Вы не в комнате' });
            break;
          }
          room.pass(session.playerId);
          metrics.inc('balda_passes_total');
          break;
        }
        case 'reconnect': {
          const room = matchmaker.getRoom(msg.roomId);
          if (!room) {
            sendTo(socket, { type: 'error', message: 'Комната не найдена' });
            break;
          }
          const prev = sessions.get(socket);
          if (prev !== undefined && prev.roomId !== null && prev.roomId !== room.id) {
            dropPreviousSession(socket);
          }
          const index = room.reconnect(msg.playerId, msg.token, conn);
          if (index === null) {
            sendTo(socket, { type: 'error', message: 'Не удалось переподключиться' });
            break;
          }
          const accountId = prev?.accountId ?? accountByPlayerId.get(msg.playerId) ?? null;
          sessions.set(socket, {
            accountId,
            roomId: room.id,
            playerId: msg.playerId,
          });
          metrics.inc('balda_reconnects_total');
          break;
        }
        case 'profile': {
          metrics.inc('balda_profiles_total');
          const session = sessions.get(socket);
          if (msg.name === undefined || msg.name === '') {
            if (session?.accountId) {
              const acc = accountStore.findById(session.accountId);
              if (acc) {
                sendTo(socket, {
                  type: 'profile',
                  name: acc.displayName,
                  profile: {
                    rating: acc.rating,
                    chips: acc.chips,
                    games: acc.games,
                    wins: acc.wins,
                  },
                });
                break;
              }
            }
            sendTo(socket, { type: 'error', message: 'Сначала войдите' });
            break;
          }
          const name = msg.name.trim().slice(0, 24);
          sendTo(socket, { type: 'profile', name, profile: matchmaker.getProfile(name) });
          break;
        }
        case 'leave': {
          const session = sessions.get(socket);
          const room =
            session?.roomId !== null && session?.roomId !== undefined
              ? matchmaker.getRoom(session.roomId)
              : undefined;
          if (session?.playerId && room) {
            room.leave(session.playerId);
            accountByPlayerId.delete(session.playerId);
          }
          if (session) {
            sessions.set(socket, {
              accountId: session.accountId,
              roomId: null,
              playerId: null,
            });
          }
          metrics.inc('balda_leaves_total');
          break;
        }
      }
    } catch (err) {
      metrics.inc('balda_handler_errors_total');
      sendTo(socket, { type: 'error', message: err instanceof Error ? err.message : 'Ошибка сервера' });
    }
  });

  socket.on('close', () => {
    const session = sessions.get(socket);
    if (!session || session.roomId === null || session.playerId === null) return;
    const room = matchmaker.getRoom(session.roomId);
    if (room) room.handleDisconnect(conn);
  });
});

httpServer.listen(PORT, () => {
  console.log('[server] словарь: ' + dictSize + ' слов (' + dictSource + ')');
  console.log('[server] профили: ' + PLAYERS_PATH + ' (' + playerStore.size + ' игроков)');
  console.log('[server] аккаунты: ' + ACCOUNTS_PATH + ' (' + accountStore.size + ')');
  console.log(
    '[server] ws://0.0.0.0:' + PORT + '/ws, health: http://0.0.0.0:' + PORT + '/health, ' +
      'metrics: http://0.0.0.0:' + PORT + '/metrics',
  );
});

function shutdown(): void {
  matchmaker.dispose();
  playerStore.dispose();
  accountStore.dispose();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);

process.on('uncaughtException', (err) => {
  console.error('[server] uncaughtException:', err);
  metrics.inc('balda_uncaught_errors_total');
});
process.on('unhandledRejection', (reason) => {
  console.error('[server] unhandledRejection:', reason);
  metrics.inc('balda_unhandled_rejections_total');
});
