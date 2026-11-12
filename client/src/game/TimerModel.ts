/** Контроль времени партии: без таймера, 2 минуты на ход, блиц, Фишер. */

export type TimeControlKind = 'none' | 'classic' | 'blitz' | 'fisher';

export interface TimeControlConfig {
  kind: TimeControlKind;
  /** classic: запас на ход; blitz/fisher: стартовый запас игрока. */
  baseMs: number;
  /** fisher: добавка за сделанный ход. */
  incrementMs?: number;
}

export const TIME_PRESETS: Record<TimeControlKind, TimeControlConfig> = {
  none: { kind: 'none', baseMs: 0 },
  classic: { kind: 'classic', baseMs: 120000 },
  blitz: { kind: 'blitz', baseMs: 120000 },
  fisher: { kind: 'fisher', baseMs: 60000, incrementMs: 10000 },
};

/**
 * Часы обоих игроков. Времени trusted: тик извне (performance.now()),
 * модель только списывает и сообщает об истечении.
 */
export class TimerModel {
  private readonly config: TimeControlConfig;
  private remainingMs: [number, number];
  private activePlayer: 0 | 1 | -1 = -1;
  private lastTickMs = 0;

  constructor(config: TimeControlConfig) {
    this.config = config;
    this.remainingMs = [config.baseMs, config.baseMs];
  }

  get enabled(): boolean {
    return this.config.kind !== 'none';
  }

  getActive(): 0 | 1 | -1 {
    return this.activePlayer;
  }

  getRemaining(player: 0 | 1): number {
    return this.remainingMs[player];
  }

  /** Активировать часы игрока (вызывается при передаче хода). */
  startTurn(player: 0 | 1, nowMs: number): void {
    this.activePlayer = player;
    this.lastTickMs = nowMs;
  }

  /** Остановить часы (партия окончена). */
  stop(): void {
    this.activePlayer = -1;
  }

  /** Сдвинуть точку отсчёта без списания (пауза, оверлей поверх поля). */
  skipTo(nowMs: number): void {
    this.lastTickMs = nowMs;
  }

  /**
   * Списать прошедшее время активного игрока.
   * Возвращает игрока, чьи часы достигли нуля, либо null.
   */
  tick(nowMs: number): 0 | 1 | null {
    if (!this.enabled || this.activePlayer === -1) return null;
    const elapsed = Math.max(0, nowMs - this.lastTickMs);
    this.lastTickMs = nowMs;
    const player = this.activePlayer;
    this.remainingMs[player] = Math.max(0, this.remainingMs[player] - elapsed);
    if (this.remainingMs[player] === 0) {
      this.activePlayer = -1;
      return player;
    }
    return null;
  }

  /** Ход сделан: классика восстанавливает запас, Фишер добавляет инкремент. */
  onMoveDone(): void {
    if (!this.enabled || this.activePlayer === -1) return;
    const player = this.activePlayer;
    if (this.config.kind === 'classic') {
      this.remainingMs[player] = this.config.baseMs;
    } else if (this.config.kind === 'fisher') {
      this.remainingMs[player] = Math.min(
        this.config.baseMs * 4,
        this.remainingMs[player] + (this.config.incrementMs ?? 0),
      );
    }
  }

  /** Восстановить запас игрока после просрочки в классике (авто-пропуск). */
  refill(player: 0 | 1): void {
    if (this.config.kind === 'classic') {
      this.remainingMs[player] = this.config.baseMs;
    }
  }
}
