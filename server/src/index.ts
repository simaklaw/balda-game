import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { WebSocketServer } from 'ws';
import type { WebSocket } from 'ws';
import type { CellPos } from '@balda/shared';
import { loadDictionary } from './dictionary';
import { Matchmaker } from './Matchmaker';
import { parseClientMessage } from './protocol';
import type { ClientMessage, ServerMessage } from './protocol';
import { PlayerStore } from './PlayerStore';
import type { PlayerConnection } from './Room';

const PORT = Number(process.env.PORT ?? 3001);
const DICT_PATH =
  process.env.DICT_PATH ??
  fileURLToPath(new URL('../../client/public/dict/words.txt', import.meta.url));
const PLAYERS_PATH =
  process.env.PLAYERS_PATH ??
  fileURLToPath(new URL('../../data/players.json', import.meta.url));

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

function sendTo(socket: WebSocket, msg: ServerMessage): void {
  if (socket.readyState === 1) socket.send(JSON.stringify(msg));
}

function isCellPos(value: unknown): value is CellPos {
  if (typeof value !== 'object' || value === null) return false;
  const v = value as { row?: unknown; col?: unknown };
  return (
    typeof v.row === 'number' && Number.isInteger(v.row) &&
    typeof v.col === 'number' && Number.isInteger(v.col)
  );
}

function extractMove(msg: ClientMessage): { path: CellPos[]; cell: CellPos; letter: string } | null {
  if (msg.type !== 'move') return null;
  const path = (msg as { path?: unknown }).path;
  const cell = (msg as { cell?: unknown }).cell;
  const letter = (msg as { letter?: unknown }).letter;
  if (!Array.isArray(path) || path.length === 0 || path.length > 49) return null;
  if (!path.every(isCellPos) || !isCellPos(cell)) return null;
  if (typeof letter !== 'string' || [...letter].length !== 1) return null;
  return { path, cell, letter };
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

const wss = new WebSocketServer({ server: httpServer, path: '/ws' });

wss.on('connection', (socket: WebSocket) => {
  const conn: PlayerConnection = {
    send: (msg) => sendTo(socket, msg),
  };

  socket.on('message', (raw) => {
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
          const move = extractMove(msg);
          if (!session || !room) {
            sendTo(socket, { type: 'error', message: 'Вы не в комнате' });
            break;
          }
          if (move === null) {
            sendTo(socket, { type: 'error', message: 'Некорректный ход' });
            break;
          }
          room.move(session.playerId, move);
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
          const name = String(msg.name).trim().slice(0, 24);
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

