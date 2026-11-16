#!/usr/bin/env node
/**
 * Сквозной smoke-тест (по мотивам аудита Qwen, §9.2): сервер должен не просто
 * собираться, а играть. Поднимается снаружи (CI или `npm run start --workspace server`),
 * скрипт подключает двух WS-клиентов и проверяет живой сценарий:
 * матч → старт партии → отказ мусорного хода → pass → профиль → reconnect-отказ.
 * Код выхода 0/1. Запуск: node scripts/smoke.mjs
 */
import WebSocket from 'ws';

const WS_URL = process.env.SMOKE_WS_URL ?? 'ws://127.0.0.1:3001/ws';
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

  // 4. Невалидный ход → ошибка, партия продолжается.
  a.send({ type: 'move', path: [{ row: 0, col: 0 }], cell: { row: 0, col: 0 }, letter: 'ж' });
  const err2 = await a.expect('error на невалидный ход', (m) => isError(m) && m !== err1);
  if (err2 !== null) ok('невалидный ход отклонён: ' + err2.message);

  // 5. Pass передаёт ход.
  a.send({ type: 'pass' });
  const stateAfterPass = await a.expect('state после pass', (m) => m.type === 'state' && m !== stateA);
  if (stateAfterPass !== null && stateAfterPass.state.currentPlayer === 1) {
    ok('pass передал ход игроку B');
  } else {
    fail('pass не передал ход');
  }

  // 6. Профиль по имени: у нового игрока профиля ещё нет — null тоже корректный ответ.
  a.send({ type: 'profile', name: 'SmokeA' });
  const profile = await a.expect('profile', isProfile);
  if (profile !== null && (profile.profile === null || typeof profile.profile.rating === 'number')) {
    ok('профиль получен' + (profile.profile ? ': рейтинг ' + profile.profile.rating : ' (новый игрок — ещё не играл)'));
  } else {
    fail('профиль не получен');
  }

  // 7. Reconnect с чужим токеном отклоняется.
  a.send({ type: 'reconnect', roomId: joinedA !== null ? joinedA.roomId : 'X', playerId: 'угонщик', token: 'фейк' });
  const err3 = await a.expect('error на фейк-reconnect', (m) => isError(m) && m !== err1 && m !== err2);
  if (err3 !== null) ok('фейк-reconnect отклонён: ' + err3.message);

  a.close();
  b.close();
  console.log(failures === 0 ? 'smoke: PASSED' : 'smoke: FAILED (' + failures + ')');
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((err) => {
  console.error('smoke: краш — ' + (err instanceof Error ? err.message : String(err)));
  process.exit(1);
});
