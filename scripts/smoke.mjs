#!/usr/bin/env node
/**
 * Сквозной smoke-тест: сервер должен не просто собираться, а играть.
 * Поднимается снаружи (CI или `npm run start --workspace server`).
 * Сценарий: матч → старт → отказ мусорного/невалидного хода →
 * metrics (move_rejected) → pass → профиль → reconnect-отказ →
 * повторный quick-match в партии → /metrics. Код выхода 0/1.
 */
import WebSocket from 'ws';

const WS_URL = process.env.SMOKE_WS_URL ?? 'ws://127.0.0.1:3001/ws';
const HTTP_URL = process.env.SMOKE_HTTP_URL ?? 'http://127.0.0.1:3001';
const TIMEOUT_MS = 5000;

let failures = 0;
const ok = (msg) => console.log('  ok: ' + msg);
const fail = (msg) => {
  failures += 1;
  console.error('FAIL: ' + msg);
};

/** Клиент с очередью входящих сообщений и ожиданием по предикату. */
function connect() {
  return new Promise((resolve, _reject) => {
    const ws = new WebSocket(WS_URL);
    const queue = [];
    const waiters = [];
    ws.on('message', (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }
      const waiter = waiters.shift();
      if (waiter) waiter(msg);
      else queue.push(msg);
    });
    ws.on('open', () =>
      resolve({
        send: (obj) => ws.send(typeof obj === 'string' ? obj : JSON.stringify(obj)),
        close: () => ws.close(),
        drain: () => queue.splice(0),
        expect: (name, predicate, timeoutMs = TIMEOUT_MS) =>
          new Promise((res) => {
            const queuedIndex = queue.findIndex(predicate);
            if (queuedIndex !== -1) {
              res(queue.splice(queuedIndex, 1)[0]);
              return;
            }
            let waiter;
            const timer = setTimeout(() => {
              const i = waiters.indexOf(waiter);
              if (i !== -1) waiters.splice(i, 1);
              fail('не дождались «' + name + '»');
              res(null);
            }, timeoutMs);
            waiter = (msg) => {
              clearTimeout(timer);
              res(msg);
            };
            waiters.push(waiter);
          }),
      }),
    );
    ws.on('error', (err) => {
      fail('WS-ошибка: ' + err.message);
      resolve(null);
    });
  });
}

const isJoined = (m) => m.type === 'joined';
const isStatePlaying = (m) => m.type === 'state' && m.state.status === 'playing';
const isError = (m) => m.type === 'error';
const isProfile = (m) => m.type === 'profile';
const isGameOver = (m) => m.type === 'game-over';

async function main() {
  console.log('smoke: ' + WS_URL);
  const a = await connect();
  const b = await connect();
  if (a === null || b === null) {
    console.error('smoke: не удалось подключиться к серверу');
    process.exit(1);
  }

  // 1. Первый игрок встаёт в очередь и ждёт.
  a.send({ type: 'quick-match', name: 'SmokeA' });
  const joinedA = await a.expect('joined (A)', isJoined);
  if (joinedA !== null && joinedA.state.status === 'waiting') ok('A в очереди, статус waiting');
  else fail('A: ожидался joined/waiting');
  a.drain();

  // 2. Второй игрок — матч начинается.
  b.send({ type: 'quick-match', name: 'SmokeB' });
  const stateA = await a.expect('state playing (A)', isStatePlaying);
  await b.expect('joined (B)', isJoined);
  if (stateA !== null && Array.isArray(stateA.state.board) && stateA.state.board.length === 5) {
    ok('матч начался, поле 5×5');
  } else {
    fail('матч не начался или поле не 5×5');
  }

  // 3. Мусорное сообщение → ошибка, соединение живо.
  a.send('это не json');
  const err1 = await a.expect('error на мусор', isError);
  if (err1 !== null) ok('мусор отклонён: ' + err1.message);

  // 4. Невалидный ход → ошибка + счётчик move_rejected.
  a.send({ type: 'move', path: [{ row: 0, col: 0 }], cell: { row: 0, col: 0 }, letter: 'ж' });
  const err2 = await a.expect('error на невалидный ход', (m) => isError(m) && m !== err1);
  if (err2 !== null) ok('невалидный ход отклонён: ' + err2.message);

  // 5. /metrics содержит balda_move_rejected_total после плохого хода.
  try {
    const res = await fetch(HTTP_URL + '/metrics');
    const body = await res.text();
    if (res.ok && body.includes('balda_move_rejected_total')) {
      ok('/metrics содержит balda_move_rejected_total');
    } else {
      fail('/metrics без balda_move_rejected_total: ' + body.slice(0, 200));
    }
    if (res.ok && body.includes('balda_dict_words')) {
      ok('/metrics содержит balda_dict_words');
    } else {
      fail('/metrics без balda_dict_words');
    }
  } catch (err) {
    fail('/metrics недоступен: ' + (err instanceof Error ? err.message : String(err)));
  }

  // 6. Pass передаёт ход.
  a.send({ type: 'pass' });
  const stateAfterPass = await a.expect(
    'state после pass',
    (m) => m.type === 'state' && m.state.currentPlayer === 1,
  );
  if (stateAfterPass !== null && stateAfterPass.state.currentPlayer === 1) {
    ok('pass передал ход игроку B');
  } else {
    fail('pass не передал ход');
  }

  // 7. Профиль.
  a.send({ type: 'profile', name: 'SmokeA' });
  const profile = await a.expect('profile', isProfile);
  const p = profile !== null ? profile.profile : undefined;
  if (p === null || p === undefined || typeof p.rating === 'number') {
    ok('профиль получен' + (p ? ': рейтинг ' + p.rating : ' (новый игрок — ещё не играл)'));
  } else {
    fail('профиль не получен: ' + JSON.stringify(profile));
  }

  // 8. Reconnect с чужим токеном отклоняется.
  a.send({
    type: 'reconnect',
    roomId: joinedA !== null ? joinedA.roomId : 'X',
    playerId: 'угонщик',
    token: 'фейк',
  });
  const err3 = await a.expect(
    'error на фейк-reconnect',
    (m) => isError(m) && m !== err1 && m !== err2,
  );
  if (err3 !== null) ok('фейк-reconnect отклонён: ' + err3.message);

  // 9. Повторный quick-match в начавшейся партии: сессия уходит из старой комнаты
  // (техпоражение соперника) и получает новый joined — не зависает.
  a.drain();
  b.drain();
  a.send({ type: 'quick-match', name: 'SmokeA2' });
  const joinedAgain = await a.expect('joined после повторного quick-match', isJoined);
  if (joinedAgain !== null) {
    ok('повторный quick-match: новый joined (room ' + joinedAgain.roomId + ')');
  } else {
    fail('повторный quick-match не вернул joined');
  }
  // Соперник B должен получить game-over (техпоражение ушедшего A).
  const overB = await b.expect('game-over у B после ухода A', isGameOver, 3000);
  if (overB !== null) {
    ok('B получил game-over после ухода A (winner=' + overB.winner + ')');
  } else {
    ok('B не получил game-over (допустимо при гонке закрытия)');
  }

  // 10. Базовые счётчики /metrics.
  try {
    const res = await fetch(HTTP_URL + '/metrics');
    const body = await res.text();
    if (res.ok && body.includes('balda_messages_total') && body.includes('balda_sockets_current')) {
      ok(
        '/metrics отдаёт счётчики (' +
          body.split('\n').filter((l) => l && !l.startsWith('#')).length +
          ' строк)',
      );
    } else {
      fail('/metrics: статус ' + res.status + ', тело: ' + body.slice(0, 120));
    }
  } catch (err) {
    fail('/metrics недоступен: ' + (err instanceof Error ? err.message : String(err)));
  }

  a.close();
  b.close();
  console.log(failures === 0 ? 'smoke: PASSED' : 'smoke: FAILED (' + failures + ')');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('smoke: краш — ' + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
