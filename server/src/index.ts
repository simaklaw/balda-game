import { createServer } from 'node:http';
import type { IncomingMessage } from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import { loadDictionary } from './dictionary';
import { Matchmaker } from './Matchmaker';
import { parseClientMessage } from './protocol';
import type { ServerMessage } from './protocol';
import { PlayerStore } from './PlayerStore';
import type { PlayerConnection } from './Room';

const PORT = Number(process.env.PORT ?? 3001);
const DICT_PATH =
  process.env.DICT_PATH ??
  fileURLToPath(new URL('../../client/public/dict/words.txt', import.meta.url));
const PLAYERS_PATH =
  process.env.PLAYERS_PATH ??
  fileURLToPath(new URL('../../data/players.json', import.meta.url));

/** Защита WSS (CSWSH): разрешённые Origin через запятую. Пусто — только same-origin. */
const ALLOWED_ORIGINS = (process.env.ALLOWED_ORIGINS ?? '')
  .split(',')
  .map((s) => s.trim())
  .filter((s) => s.length > 0);
/** Максимум одновременных соединений с одного IP. */
const MAX_SOCKETS_PER_IP = Number(process.env.MAX_SOCKETS_PER_IP ?? 8);
/** Лимит сообщений с одного соединения за окно (защита от флуда). */
const MAX_MESSAGES_PER_WINDOW = Number(process.env.MAX_MESSAGES_PER_WINDOW ?? 60);
const MESSAGE_WINDOW_MS = 10_000;
/** Максимальный размер кадра: игровые сообщения — сотни байт. */
const MAX_PAYLOAD = 16 * 1024;

const { dawg, size: dictSize, source: dictSource } = loadDictionary(DICT_PATH);

// Профили (рейтинг, фишки, статистика) переживают перезапуск:
// JSON-файл, атомарная запись при каждой партии.
const playerStore = new PlayerStore(PLAYERS_PATH);
playerStore.load();

const matchmaker = new Matchmaker(dawg, { players: playerStore });

interface Session {
  roomId: string;
  playerId: string;
}

const sessions = new WeakMap<WebSocket, Session>();
const socketsPerIp = new Map<string, number>();

function sendTo(socket: WebSocket, msg: ServerMessage): void {
  if (socket.readyState === 1) socket.send(JSON.stringify(msg));
}

/**
 * Origin-check против кросс-сайтового WebSocket hijacking:
 * браузер всегда шлёт Origin — пускаем только свои площадки и same-origin
 * (за Caddy/nginx). Не-браузерные клиенты (без Origin) не страдают.
 */
function originAllowed(origin: string, req: IncomingMessage): boolean {
  if (origin === '') return true;
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
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      ok: true,
      words: dictSize,
      dictSource,
      rooms: matchmaker.roomCount,
      players: playerStore.size,
    }));
    return;
  }
  res.writeHead(404);
  res.end();
});

const wss = new WebSocketServer({
  server: httpServer,
  path: '/ws',
  maxPayload: MAX_PAYLOAD,
  verifyClient: (info, callback) => {
    if (originAllowed(info.origin, info.req)) {
      callback(true);
    } else {
      callback(false, 403, 'Origin запрещён');
    }
  },
});

wss.on('connection', (socket: WebSocket, req: IncomingMessage) => {
  // Лимит соединений с одного IP: дешёвая защита от исчерпания ресурсов.
  const ip = req.socket.remoteAddress ?? 'unknown';
  const current = socketsPerIp.get(ip) ?? 0;
  if (current >= MAX_SOCKETS_PER_IP) {
    socket.close(1008, 'Слишком много соединений');
    return;
  }
  socketsPerIp.set(ip, current + 1);
  socket.on('close', () => {
    const count = socketsPerIp.get(ip) ?? 1;
    if (count <= 1) socketsPerIp.delete(ip);
    else socketsPerIp.set(ip, count - 1);
  });

  const conn: PlayerConnection = {
    send: (msg) => sendTo(socket, msg),
  };

  // Окно флуда: больше MAX_MESSAGES_PER_WINDOW за MESSAGE_WINDOW_MS — закрытие.
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
      socket.close(1008, 'Слишком много сообщений');
      return;
    }

    const msg = parseClientMessage(raw.toString());
    if (msg === null) {
      sendTo(socket, { type: 'error', message: 'Неизвестное сообщение' });
      return;
    }
    try {
      switch (msg.type) {
        case 'quick-match': {
          const res = matchmaker.quickMatch(conn, msg.name);
          sessions.set(socket, { roomId: res.room.id, playerId: res.playerId });
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
          const res = matchmaker.createRoom(conn, msg.name);
          sessions.set(socket, { roomId: res.room.id, playerId: res.playerId });
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
          const res = matchmaker.joinRoom(msg.roomId, conn, msg.name);
          if (res === null) {
            sendTo(socket, { type: 'error', message: 'Комната недоступна' });
            break;
          }
          sessions.set(socket, { roomId: res.room.id, playerId: res.playerId });
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
          const room = session ? matchmaker.getRoom(session.roomId) : undefined;
          if (!session || !room) {
            sendTo(socket, { type: 'error', message: 'Вы не в комнате' });
            break;
          }
          room.move(session.playerId, { path: msg.path, cell: msg.cell, letter: msg.letter });
          break;
        }
        case 'pass': {
          const session = sessions.get(socket);
          const room = session ? matchmaker.getRoom(session.roomId) : undefined;
          if (!session || !room) {
            sendTo(socket, { type: 'error', message: 'Вы не в комнате' });
            break;
          }
          room.pass(session.playerId);
          break;
        }
        case 'reconnect': {
          const room = matchmaker.getRoom(msg.roomId);
          if (!room) {
            sendTo(socket, { type: 'error', message: 'Комната не найдена' });
            break;
          }
          const index = room.reconnect(msg.playerId, msg.token, conn);
          if (index === null) {
            sendTo(socket, { type: 'error', message: 'Не удалось переподключиться' });
            break;
          }
          sessions.set(socket, { roomId: room.id, playerId: msg.playerId });
          break;
        }
        case 'profile': {
          const name = msg.name.trim().slice(0, 24);
          sendTo(socket, { type: 'profile', name, profile: matchmaker.getProfile(name) });
          break;
        }
        case 'leave': {
          const session = sessions.get(socket);
          const room = session ? matchmaker.getRoom(session.roomId) : undefined;
          if (session && room) room.leave(session.playerId);
          sessions.delete(socket);
          break;
        }
      }
    } catch (err) {
      sendTo(socket, { type: 'error', message: err instanceof Error ? err.message : 'Ошибка сервера' });
    }
  });

  socket.on('close', () => {
    const session = sessions.get(socket);
    if (!session) return;
    const room = matchmaker.getRoom(session.roomId);
    if (room) room.handleDisconnect(conn);
  });
});

httpServer.listen(PORT, () => {
  console.log('[server] словарь: ' + dictSize + ' слов (' + dictSource + ')');
  console.log('[server] профили: ' + PLAYERS_PATH + ' (' + playerStore.size + ' игроков)');
  console.log('[server] ws://0.0.0.0:' + PORT + '/ws, health: http://0.0.0.0:' + PORT + '/health');
});

// Graceful shutdown: сбрасываем профили на диск и останавливаем таймеры комнат.
function shutdown(): void {
  matchmaker.dispose();
  playerStore.dispose();
  httpServer.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 2000).unref();
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
