import { describe, expect, it } from 'vitest';
import {
  AntiCheatSystem,
  MoveTelemetryCollector,
  DEFAULT_ANTI_CHEAT_CONFIG,
} from '@balda/shared';
import type { AntiCheatResult, MoveTelemetry } from '@balda/shared';

const makeTelemetry = (overrides: Partial<MoveTelemetry> = {}): MoveTelemetry => ({
  timestamp: 0,
  pathSelectionTime: 0,
  letterSelectionTime: 0,
  totalTime: 1000,
  movementHash: 'hash-' + Math.random().toString(16).slice(2),
  pathCorrections: 0,
  ...overrides,
});

const move = (path: { row: number; col: number }[]) => ({
  letter: 'к',
  cell: path[path.length - 1]!,
  path,
});

const shortPath = [
  { row: 2, col: 2 },
  { row: 2, col: 3 },
  { row: 2, col: 4 },
];
const longPath = Array.from({ length: 6 }, (_, i) => ({ row: 0, col: i }));

describe('Античит: скорость хода (ложный бан хуже пропущенного бота)', () => {
  it('короткое слово за 100 мс — честно: скорость подозрительна только для длинных', () => {
    const ac = new AntiCheatSystem();
    const result = ac.checkMove(1, move(shortPath), makeTelemetry({ totalTime: 100 }));
    expect(result.action).toBe('ALLOW');
    expect(result.legitimate).toBe(true);
    expect(result.suspicion).toBe(0);
  });

  it('мгновенный длинный ход — INSTANT_MOVE с умеренной оценкой', () => {
    const ac = new AntiCheatSystem();
    const result = ac.checkMove(1, move(longPath), makeTelemetry({ totalTime: 200 }));
    expect(result.reason).toBe('INSTANT_MOVE');
    expect(result.suspicion).toBeGreaterThanOrEqual(0.5);
    expect(result.suspicion).toBeLessThan(DEFAULT_ANTI_CHEAT_CONFIG.suspicionThreshold);
  });

  it('медленный ход — не чит (АФК/раздумья не штрафуются)', () => {
    const ac = new AntiCheatSystem();
    const result = ac.checkMove(1, move(shortPath), makeTelemetry({ totalTime: 120_000 }));
    expect(result.action).toBe('ALLOW');
    expect(result.suspicion).toBe(0);
  });

  it('ход без телеметрии (старый клиент) всегда проходит', () => {
    const ac = new AntiCheatSystem();
    const result = ac.checkMove(1, move(shortPath), null);
    expect(result.legitimate).toBe(true);
    expect(result.action).toBe('ALLOW');
  });
});

describe('Античит: устойчивый паттерн (окно 20 ходов)', () => {
  const warmUp = (ac: AntiCheatSystem, playerId: number): void => {
    for (let i = 0; i < 15; i++) {
      ac.checkMove(playerId, move(shortPath), makeTelemetry({ totalTime: 2000 }));
    }
  };

  it('один аномально быстрый ход — только предупреждение, не бан', () => {
    const ac = new AntiCheatSystem();
    warmUp(ac, 1);
    const result = ac.checkMove(
      1,
      move(longPath),
      makeTelemetry({ totalTime: 100, movementHash: 'a' }),
    );
    expect(result.reason).toBe('INSTANT_MOVE');
    expect(result.action).toBe('WARN');
    expect(result.legitimate).toBe(true);
  });

  it('три подозрительных хода в окне — устойчивый паттерн, BLOCK', () => {
    const ac = new AntiCheatSystem();
    warmUp(ac, 1);
    let last: AntiCheatResult | null = null;
    for (let i = 0; i < 3; i++) {
      last = ac.checkMove(1, move(longPath), makeTelemetry({ totalTime: 100, movementHash: 'h' + i }));
    }
    expect(last!.action).toBe('BLOCK');
    expect(last!.legitimate).toBe(false);
  });

  it('у другого игрока свой профиль: подозрения не переносятся', () => {
    const ac = new AntiCheatSystem();
    warmUp(ac, 1);
    for (let i = 0; i < 2; i++) {
      ac.checkMove(1, move(longPath), makeTelemetry({ totalTime: 100, movementHash: 'x' + i }));
    }
    const other = ac.checkMove(2, move(longPath), makeTelemetry({ totalTime: 100, movementHash: 'y1' }));
    expect(other.suspicion).toBeLessThan(DEFAULT_ANTI_CHEAT_CONFIG.suspicionThreshold);
    expect(other.legitimate).toBe(true);
  });
});

describe('Античит: Shadow Pool', () => {
  it('повтор той же траектории под другим ходом — REPLAYED_TRAJECTORY', () => {
    const ac = new AntiCheatSystem();
    ac.checkMove(1, move(shortPath), makeTelemetry({ movementHash: 'deadbeef' }));
    const replay = ac.checkMove(
      1,
      move([{ row: 4, col: 4 }, { row: 4, col: 3 }, { row: 4, col: 2 }]),
      makeTelemetry({ movementHash: 'deadbeef' }),
    );
    expect(replay.reason).toBe('REPLAYED_TRAJECTORY');
    expect(replay.suspicion).toBeGreaterThanOrEqual(0.4);
  });

  it('та же траектория тем же ходом — не повтор (обычный ретрай)', () => {
    const ac = new AntiCheatSystem();
    ac.checkMove(1, move(shortPath), makeTelemetry({ movementHash: 'cafe' }));
    const again = ac.checkMove(1, move(shortPath), makeTelemetry({ movementHash: 'cafe' }));
    expect(again.reason).not.toBe('REPLAYED_TRAJECTORY');
  });

  it('getShadowPool возвращает записи только своего игрока', () => {
    const ac = new AntiCheatSystem();
    ac.checkMove(1, move(shortPath), makeTelemetry());
    ac.checkMove(2, move(shortPath), makeTelemetry());
    ac.checkMove(1, move(shortPath), makeTelemetry());
    expect(ac.getShadowPool(1)).toHaveLength(2);
    expect(ac.getShadowPool(2)).toHaveLength(1);
    expect(ac.getShadowPool(3)).toHaveLength(0);
  });
});

describe('MoveTelemetryCollector', () => {
  it('хеш траектории детерминирован и различает разные пути', () => {
    const h1 = MoveTelemetryCollector.hash('2,2|2,3|2,4');
    const h2 = MoveTelemetryCollector.hash('2,2|2,3|2,4');
    const h3 = MoveTelemetryCollector.hash('4,4|4,3|4,2');
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });

  it('complete() считает времена неотрицательными', () => {
    const collector = new MoveTelemetryCollector();
    collector.start();
    collector.startPathSelection();
    collector.addPathCell({ row: 2, col: 2 });
    collector.startLetterSelection();
    collector.recordCorrection();
    const t = collector.complete();
    expect(t.totalTime).toBeGreaterThanOrEqual(0);
    expect(t.pathSelectionTime).toBeGreaterThanOrEqual(0);
    expect(t.letterSelectionTime).toBeGreaterThanOrEqual(0);
    expect(t.pathCorrections).toBe(1);
    expect(t.movementHash).not.toBe('');
  });
});
