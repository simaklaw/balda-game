/**
 * Античит «Балды»: телеметрия ввода, поведенческие проверки, Shadow Pool.
 *
 * Принцип (аудит Qwen, §10.6–10.7): ложный бан честного игрока хуже
 * пропущенного бота. Пороги консервативные, реакция ступенчатая:
 * мониторинг → предупреждение → shadow/ban только при устойчивом паттерне.
 * Короткие слова вводятся за доли секунды честно — скорость подозрительна
 * только для длинных слов.
 */

import type { MoveInput, CellPos } from './types';

export type { MoveInput } from './types';

/** Телеметрия одного хода, собираемая на клиенте. */
export interface MoveTelemetry {
  /** Момент начала хода. */
  timestamp: number;
  /** Время построения пути (мс). */
  pathSelectionTime: number;
  /** Время выбора буквы (мс). */
  letterSelectionTime: number;
  /** Общее время хода (мс). */
  totalTime: number;
  /** Хеш траектории движения. */
  movementHash: string;
  /** Сколько раз игрок корректировал путь. */
  pathCorrections: number;
}

/** Поведенческий профиль игрока (скользящее окно последних ходов). */
export interface PlayerProfile {
  /** Число ходов за всё время. */
  moveCount: number;
  /** Общее время последних ходов (окно WINDOW). */
  recentTotalTimes: number[];
  /** Флаги подозрительности последних ходов (окно WINDOW). */
  recentSuspicious: boolean[];
  lastMoveTime: number;
}

/** Запись Shadow Pool. */
export interface ShadowEntry {
  playerId: number;
  move: MoveInput;
  movementHash: string;
  accepted: boolean;
  suspicion: number;
  reason: SuspicionReason;
  timestamp: number;
}

export interface AntiCheatConfig {
  /** Ход быстрее этого (мс) у длинного слова подозрителен. */
  instantMoveMs: number;
  /** Минимальная длина слова, для которой мгновенный ход подозрителен. */
  instantMoveMinWord: number;
  /** Путь выбрали быстрее этого (мс) — подозрительно. */
  minPathSelectionTime: number;
  /** Букву выбрали быстрее этого (мс) — подозрительно. */
  minLetterSelectionTime: number;
  /** Порог suspicion для предупреждения. */
  suspicionThreshold: number;
  /** Порог suspicion для блокировки. */
  blockThreshold: number;
  /** Столько подозрительных ходов в окне → устойчивый паттерн (блокировка). */
  maxSuspiciousInWindow: number;
  /** Размер Shadow Pool. */
  shadowPoolSize: number;
  enableBehavioral: boolean;
  enableShadowPool: boolean;
}

export const DEFAULT_ANTI_CHEAT_CONFIG: AntiCheatConfig = {
  instantMoveMs: 400,
  instantMoveMinWord: 6,
  minPathSelectionTime: 150,
  minLetterSelectionTime: 80,
  suspicionThreshold: 0.7,
  blockThreshold: 0.9,
  maxSuspiciousInWindow: 3,
  shadowPoolSize: 100,
  enableBehavioral: true,
  enableShadowPool: true,
};

/** Окно поведенческого анализа: последние N ходов, минимум истории для паттернов. */
export const WINDOW_SIZE = 20;
export const MIN_HISTORY_FOR_PATTERN = 15;

export type SuspicionReason =
  | 'INSTANT_MOVE'
  | 'PATH_TOO_FAST'
  | 'LETTER_TOO_FAST'
  | 'PATTERN_MISMATCH'
  | 'REPLAYED_TRAJECTORY'
  | null;

export interface AntiCheatResult {
  /** Ход считается легитимным, пока действие не BLOCK. */
  legitimate: boolean;
  /** Оценка подозрительности 0–1. */
  suspicion: number;
  reason: SuspicionReason;
  /** Мониторинг → предупреждение → блокировка. */
  action: 'ALLOW' | 'WARN' | 'BLOCK';
  telemetry: MoveTelemetry | null;
}

const emptyResult = (telemetry: MoveTelemetry | null): AntiCheatResult => ({
  legitimate: true,
  suspicion: 0,
  reason: null,
  action: 'ALLOW',
  telemetry,
});

function emptyProfile(): PlayerProfile {
  return { moveCount: 0, recentTotalTimes: [], recentSuspicious: [], lastMoveTime: 0 };
}

/** Античит-система: профили игроков + Shadow Pool. */
export class AntiCheatSystem {
  private readonly config: AntiCheatConfig;
  private readonly profiles = new Map<number, PlayerProfile>();
  private shadowPool: ShadowEntry[] = [];
  private moveCounter = 0;

  constructor(config: Partial<AntiCheatConfig> = {}) {
    this.config = { ...DEFAULT_ANTI_CHEAT_CONFIG, ...config };
  }

  /** Проверить ход; телеметрия может отсутствовать (старые клиенты). */
  checkMove(
    playerId: number,
    move: MoveInput,
    telemetry: MoveTelemetry | null = null,
  ): AntiCheatResult {
    const result = emptyResult(telemetry);
    if (!this.config.enableBehavioral && !this.config.enableShadowPool) return result;

    const profile = this.profileFor(playerId);

    if (telemetry !== null) {
      this.recordTelemetry(profile, telemetry.totalTime);
      this.checkTiming(move, telemetry, result);
      this.checkPattern(profile, telemetry, result);
      if (this.config.enableShadowPool) {
        this.checkShadowPool(playerId, move, telemetry, result);
      }
    }

    result.suspicion = Math.min(1, Math.max(0, result.suspicion));

    // Устойчивый паттерн: несколько подозрительных ходов в окне
    // (текущий ход тоже учитывается).
    profile.recentSuspicious.push(result.suspicion >= 0.5);
    if (profile.recentSuspicious.length > WINDOW_SIZE) profile.recentSuspicious.shift();
    const suspiciousInWindow = profile.recentSuspicious.filter(Boolean).length;
    if (
      result.suspicion >= this.config.suspicionThreshold ||
      suspiciousInWindow >= this.config.maxSuspiciousInWindow
    ) {
      result.reason ??= 'PATTERN_MISMATCH';
    }
    if (result.suspicion >= this.config.blockThreshold || suspiciousInWindow >= this.config.maxSuspiciousInWindow) {
      result.action = 'BLOCK';
      result.legitimate = false;
    } else if (result.suspicion >= this.config.suspicionThreshold) {
      result.action = 'WARN';
    }

    this.moveCounter += 1;
    return result;
  }

  /** Правила таймингов (§10.7): мгновенные ДЛИННЫЕ слова, слишком быстрые путь/буква. */
  private checkTiming(move: MoveInput, telemetry: MoveTelemetry, result: AntiCheatResult): void {
    const wordLength = move.path.length;
    // Мгновенный ход: подозрителен только для длинных слов — короткие
    // честный игрок вводит за доли секунды.
    if (
      wordLength >= this.config.instantMoveMinWord &&
      telemetry.totalTime < this.config.instantMoveMs
    ) {
      result.suspicion += 0.5;
      result.reason = 'INSTANT_MOVE';
    }
    if (telemetry.pathSelectionTime > 0 && telemetry.pathSelectionTime < this.config.minPathSelectionTime) {
      result.suspicion += 0.3;
      result.reason ??= 'PATH_TOO_FAST';
    }
    if (telemetry.letterSelectionTime > 0 && telemetry.letterSelectionTime < this.config.minLetterSelectionTime) {
      result.suspicion += 0.3;
      result.reason ??= 'LETTER_TOO_FAST';
    }
    // Медленный ход — не чит (АФК, думает): не штрафуем.
  }

  /** Паттерн «внезапно в разы быстрее собственного темпа» — при достаточной истории. */
  private checkPattern(profile: PlayerProfile, telemetry: MoveTelemetry, result: AntiCheatResult): void {
    if (profile.recentTotalTimes.length < MIN_HISTORY_FOR_PATTERN) return;
    const avg =
      profile.recentTotalTimes.reduce((sum, t) => sum + t, 0) / profile.recentTotalTimes.length;
    if (telemetry.totalTime < avg * 0.3) {
      result.suspicion += 0.3;
      result.reason ??= 'PATTERN_MISMATCH';
    }
  }

  /** Shadow Pool: повтор чужой/своей траектории под другим ходом. */
  private checkShadowPool(
    playerId: number,
    move: MoveInput,
    telemetry: MoveTelemetry,
    result: AntiCheatResult,
  ): void {
    const replayed = this.shadowPool.some(
      (e) => e.playerId === playerId && e.movementHash === telemetry.movementHash && !samePath(e.move.path, move.path),
    );
    if (replayed) {
      result.suspicion += 0.4;
      result.reason ??= 'REPLAYED_TRAJECTORY';
    }
    this.shadowPool.push({
      playerId,
      move,
      movementHash: telemetry.movementHash,
      accepted: true,
      suspicion: result.suspicion,
      reason: result.reason,
      timestamp: Date.now(),
    });
    if (this.shadowPool.length > this.config.shadowPoolSize) {
      this.shadowPool.shift();
    }
  }

  private profileFor(playerId: number): PlayerProfile {
    let profile = this.profiles.get(playerId);
    if (profile === undefined) {
      profile = emptyProfile();
      this.profiles.set(playerId, profile);
    }
    return profile;
  }

  private recordTelemetry(profile: PlayerProfile, totalTime: number): void {
    profile.moveCount += 1;
    profile.lastMoveTime = Date.now();
    profile.recentTotalTimes.push(totalTime);
    if (profile.recentTotalTimes.length > WINDOW_SIZE) profile.recentTotalTimes.shift();
  }

  /** Записи Shadow Pool игрока. */
  getShadowPool(playerId: number): ShadowEntry[] {
    return this.shadowPool.filter((e) => e.playerId === playerId);
  }

  getPlayerProfile(playerId: number): PlayerProfile | null {
    return this.profiles.get(playerId) ?? null;
  }

  reset(): void {
    this.profiles.clear();
    this.shadowPool = [];
    this.moveCounter = 0;
  }

  getStats(): { totalMoves: number; totalPlayers: number; shadowPoolSize: number; suspiciousMoves: number } {
    let suspiciousMoves = 0;
    for (const profile of this.profiles.values()) {
      suspiciousMoves += profile.recentSuspicious.filter(Boolean).length;
    }
    return {
      totalMoves: this.moveCounter,
      totalPlayers: this.profiles.size,
      shadowPoolSize: this.shadowPool.length,
      suspiciousMoves,
    };
  }
}

function samePath(a: readonly CellPos[], b: readonly CellPos[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((p, i) => p.row === b[i]!.row && p.col === b[i]!.col);
}

export function createAntiCheatSystem(config?: Partial<AntiCheatConfig>): AntiCheatSystem {
  return new AntiCheatSystem(config);
}

/** Клиентский сборщик телеметрии хода. */
export class MoveTelemetryCollector {
  private startTime = 0;
  private pathStartTime = 0;
  private letterStartTime = 0;
  private pathCorrections = 0;
  private path: CellPos[] = [];
  private movementParts: string[] = [];

  start(): void {
    this.startTime = Date.now();
    this.pathCorrections = 0;
    this.path = [];
    this.movementParts = [];
  }

  startPathSelection(): void {
    this.pathStartTime = Date.now();
  }

  addPathCell(cell: CellPos): void {
    this.path.push(cell);
    this.movementParts.push(cell.row + ',' + cell.col);
  }

  recordCorrection(): void {
    this.pathCorrections += 1;
  }

  startLetterSelection(): void {
    this.letterStartTime = Date.now();
  }

  complete(): MoveTelemetry {
    const endTime = Date.now();
    const pathEndTime = this.letterStartTime || endTime;
    return {
      timestamp: this.startTime,
      pathSelectionTime: Math.max(0, pathEndTime - this.pathStartTime),
      letterSelectionTime: Math.max(0, endTime - this.letterStartTime),
      totalTime: Math.max(0, endTime - this.startTime),
      movementHash: MoveTelemetryCollector.hash(this.movementParts.join('|')),
      pathCorrections: this.pathCorrections,
    };
  }

  /** FNV-подобный 32-битный хеш траектории. */
  static hash(movementString: string): string {
    let hash = 0;
    for (let i = 0; i < movementString.length; i++) {
      hash = ((hash << 5) - hash + movementString.charCodeAt(i)) | 0;
    }
    return (hash >>> 0).toString(16);
  }
}
