import { describe, it, expect, beforeEach } from 'vitest';
import {
  AntiCheatSystem,
  MoveTelemetryCollector,
  createAntiCheatSystem,
  DEFAULT_ANTI_CHEAT_CONFIG,
} from '../src/antiCheat';
import type { AntiCheatResult, MoveTelemetry, MoveInput } from '../src/antiCheat';

/**
 * Принцип (аудит Qwen, §10.6–10.7): ложный бан честного игрока хуже
 * пропущенного бота. Скорость подозрительна только для ДЛИННЫХ слов,
 * медленная игра не штрафуется, блокировка — только при устойчивом
 * паттерне (несколько подозрительных ходов в окне).
 */

const makeTelemetry = (overrides: Partial<MoveTelemetry> = {}): MoveTelemetry => ({
  timestamp: 0,
  pathSelectionTime: 0,
  letterSelectionTime: 0,
  totalTime: 1000,
  movementHash: 'hash-' + Math.random().toString(16).slice(2),
  pathCorrections: 0,
  ...overrides,
});

const move = (path: { row: number; col: number }[]): MoveInput => ({
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

describe('antiCheat: конфиг по умолчанию', () => {
  it('консервативные пороги (ложный бан хуже пропущенного бота)', () => {
    expect(DEFAULT_ANTI_CHEAT_CONFIG.instantMoveMs).toBe(400);
    expect(DEFAULT_ANTI_CHEAT_CONFIG.instantMoveMinWord).toBe(6);
    expect(DEFAULT_ANTI_CHEAT_CONFIG.suspicionThreshold).toBe(0.7);
    expect(DEFAULT_ANTI_CHEAT_CONFIG.blockThreshold).toBe(0.9);
    expect(DEFAULT_ANTI_CHEAT_CONFIG.maxSuspiciousInWindow).toBe(3);
    expect(DEFAULT_ANTI_CHEAT_CONFIG.shadowPoolSize).toBe(100);
    expect(DEFAULT_ANTI_CHEAT_CONFIG.enableBehavioral).toBe(true);
    expect(DEFAULT_ANTI_CHEAT_CONFIG.enableShadowPool).toBe(true);
  });

  it('createAntiCheatSystem принимает переопределения', () => {
    const system = createAntiCheatSystem({ instantMoveMs: 1000 });
    expect(system).toBeInstanceOf(AntiCheatSystem);
  });
});

describe('antiCheat: скорость хода', () => {
  let system: AntiCheatSystem;
  beforeEach(() => {
    system = createAntiCheatSystem();
  });

  it('короткое слово за 100 мс — честно', () => {
    const result = system.checkMove(1, move(shortPath), makeTelemetry({ totalTime: 100 }));
    expect(result.legitimate).toBe(true);
    expect(result.action).toBe('ALLOW');
    expect(result.suspicion).toBe(0);
  });

  it('мгновенный длинный ход — INSTANT_MOVE, умеренная оценка', () => {
    const result = system.checkMove(1, move(longPath), makeTelemetry({ totalTime: 200 }));
    expect(result.reason).toBe('INSTANT_MOVE');
    expect(result.suspicion).toBeGreaterThanOrEqual(0.5);
    expect(result.suspicion).toBeLessThan(DEFAULT_ANTI_CHEAT_CONFIG.suspicionThreshold);
  });

  it('медленный ход — не чит (АФК/раздумья не штрафуются)', () => {
    const result = system.checkMove(1, move(shortPath), makeTelemetry({ totalTime: 120_000 }));
    expect(result.action).toBe('ALLOW');
    expect(result.suspicion).toBe(0);
  });

  it('слишком быстрый выбор пути/буквы подозрителен', () => {
    const result = system.checkMove(
      1,
      move(shortPath),
      makeTelemetry({ totalTime: 1000, pathSelectionTime: 50, letterSelectionTime: 10 }),
    );
    expect(result.suspicion).toBeGreaterThan(0);
    expect(result.reason).not.toBeNull();
  });

  it('ход без телеметрии (старый клиент) всегда проходит', () => {
    const result = system.checkMove(1, move(shortPath), null);
    expect(result.legitimate).toBe(true);
    expect(result.action).toBe('ALLOW');
  });
});

describe('antiCheat: устойчивый паттерн (окно 20 ходов)', () => {
  const warmUp = (system: AntiCheatSystem, playerId: number): void => {
    for (let i = 0; i < 15; i++) {
      system.checkMove(playerId, move(shortPath), makeTelemetry({ totalTime: 2000 }));
    }
  };

  it('один аномально быстрый ход — только предупреждение', () => {
    const system = createAntiCheatSystem();
    warmUp(system, 1);
    const result = system.checkMove(
      1,
      move(longPath),
      makeTelemetry({ totalTime: 100, movementHash: 'a' }),
    );
    expect(result.reason).toBe('INSTANT_MOVE');
    expect(result.action).toBe('WARN');
    expect(result.legitimate).toBe(true);
  });

  it('три подозрительных хода в окне — BLOCK', () => {
    const system = createAntiCheatSystem();
    warmUp(system, 1);
    let last: AntiCheatResult | null = null;
    for (let i = 0; i < 3; i++) {
      last = system.checkMove(1, move(longPath), makeTelemetry({ totalTime: 100, movementHash: 'h' + i }));
    }
    expect(last!.action).toBe('BLOCK');
    expect(last!.legitimate).toBe(false);
  });

  it('профили игроков независимы', () => {
    const system = createAntiCheatSystem();
    warmUp(system, 1);
    for (let i = 0; i < 2; i++) {
      system.checkMove(1, move(longPath), makeTelemetry({ totalTime: 100, movementHash: 'x' + i }));
    }
    const other = system.checkMove(2, move(longPath), makeTelemetry({ totalTime: 100, movementHash: 'y1' }));
    expect(other.suspicion).toBeLessThan(DEFAULT_ANTI_CHEAT_CONFIG.suspicionThreshold);
    expect(other.legitimate).toBe(true);
  });
});

describe('antiCheat: Shadow Pool', () => {
  it('повтор траектории под другим ходом — REPLAYED_TRAJECTORY', () => {
    const system = createAntiCheatSystem();
    system.checkMove(1, move(shortPath), makeTelemetry({ movementHash: 'deadbeef' }));
    const replay = system.checkMove(
      1,
      move([{ row: 4, col: 4 }, { row: 4, col: 3 }, { row: 4, col: 2 }]),
      makeTelemetry({ movementHash: 'deadbeef' }),
    );
    expect(replay.reason).toBe('REPLAYED_TRAJECTORY');
    expect(replay.suspicion).toBeGreaterThanOrEqual(0.4);
  });

  it('та же траектория тем же ходом — не повтор', () => {
    const system = createAntiCheatSystem();
    system.checkMove(1, move(shortPath), makeTelemetry({ movementHash: 'cafe' }));
    const again = system.checkMove(1, move(shortPath), makeTelemetry({ movementHash: 'cafe' }));
    expect(again.reason).not.toBe('REPLAYED_TRAJECTORY');
  });

  it('getShadowPool фильтрует по игроку', () => {
    const system = createAntiCheatSystem();
    system.checkMove(1, move(shortPath), makeTelemetry());
    system.checkMove(2, move(shortPath), makeTelemetry());
    system.checkMove(1, move(shortPath), makeTelemetry());
    expect(system.getShadowPool(1)).toHaveLength(2);
    expect(system.getShadowPool(2)).toHaveLength(1);
    expect(system.getShadowPool(3)).toHaveLength(0);
  });
});

describe('antiCheat: профиль, статистика, сброс', () => {
  it('профиль создаётся после первого хода', () => {
    const system = createAntiCheatSystem();
    expect(system.getPlayerProfile(7)).toBeNull();
    system.checkMove(7, move(shortPath), makeTelemetry({ totalTime: 1500 }));
    const profile = system.getPlayerProfile(7);
    expect(profile).not.toBeNull();
    expect(profile!.moveCount).toBe(1);
    expect(profile!.lastMoveTime).toBeGreaterThan(0);
  });

  it('getStats считает ходы, игроков и пул', () => {
    const system = createAntiCheatSystem();
    system.checkMove(0, move(shortPath), makeTelemetry());
    system.checkMove(1, move(shortPath), makeTelemetry());
    const stats = system.getStats();
    expect(stats.totalMoves).toBe(2);
    expect(stats.totalPlayers).toBe(2);
    expect(stats.shadowPoolSize).toBe(2);
  });

  it('reset очищает всё', () => {
    const system = createAntiCheatSystem();
    system.checkMove(0, move(shortPath), makeTelemetry());
    system.reset();
    const stats = system.getStats();
    expect(stats.totalPlayers).toBe(0);
    expect(stats.shadowPoolSize).toBe(0);
    expect(system.getPlayerProfile(0)).toBeNull();
  });
});

describe('MoveTelemetryCollector', () => {
  let collector: MoveTelemetryCollector;
  beforeEach(() => {
    collector = new MoveTelemetryCollector();
  });

  it('хеш траектории детерминирован и различает пути', () => {
    const h1 = MoveTelemetryCollector.hash('2,2|2,3|2,4');
    const h2 = MoveTelemetryCollector.hash('2,2|2,3|2,4');
    const h3 = MoveTelemetryCollector.hash('4,4|4,3|4,2');
    expect(h1).toBe(h2);
    expect(h1).not.toBe(h3);
  });

  it('complete() считает времена и коррекции', () => {
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
