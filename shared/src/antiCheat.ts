/**
 * Anti-cheat system for Balda game
 * Includes input telemetry, behavioral checks, and shadow pool validation
 */

import type { MoveInput, CellPos } from './types';

export type { MoveInput } from './types';

/**
 * Telemetry data for a single move
 */
export interface MoveTelemetry {
  /** Timestamp when move was initiated */
  timestamp: number;
  /** Time taken to select the path (ms) */
  pathSelectionTime: number;
  /** Time taken to choose the letter (ms) */
  letterSelectionTime: number;
  /** Total move time from start to submission (ms) */
  totalTime: number;
  /** Mouse/touch movement pattern hash */
  movementHash: string;
  /** Number of path corrections */
  pathCorrections: number;
}

/**
 * Player behavior profile for anti-cheat
 */
export interface PlayerProfile {
  /** Average time between moves (ms) */
  avgMoveTime: number;
  /** Standard deviation of move times */
  moveTimeStdDev: number;
  /** Average path selection time (ms) */
  avgPathSelectionTime: number;
  /** Average letter selection time (ms) */
  avgLetterSelectionTime: number;
  /** Number of suspicious moves detected */
  suspiciousCount: number;
  /** Last move timestamp */
  lastMoveTime: number;
  /** Move count */
  moveCount: number;
}

/**
 * Shadow pool entry for server-side validation
 */
export interface ShadowEntry {
  /** The move input */
  move: MoveInput;
  /** Client-reported word */
  clientWord: string;
  /** Server-validated word (if different) */
  serverWord: string | null;
  /** Whether move was accepted */
  accepted: boolean;
  /** Suspicion score (0-1) */
  suspicion: number;
  /** Reason for suspicion */
  reason: string | null;
  /** Timestamp */
  timestamp: number;
}

/**
 * Anti-cheat configuration
 */
export interface AntiCheatConfig {
  /** Minimum move time considered valid (ms) */
  minMoveTime: number;
  /** Maximum move time before warning (ms) */
  maxMoveTime: number;
  /** Minimum path selection time (ms) - too fast = suspicious */
  minPathSelectionTime: number;
  /** Minimum letter selection time (ms) */
  minLetterSelectionTime: number;
  /** Threshold for suspicion score to flag a move */
  suspicionThreshold: number;
  /** Maximum suspicious moves before penalty */
  maxSuspiciousMoves: number;
  /** Shadow pool size */
  shadowPoolSize: number;
  /** Enable behavioral analysis */
  enableBehavioral: boolean;
  /** Enable shadow pool */
  enableShadowPool: boolean;
}

/**
 * Default anti-cheat configuration
 */
export const DEFAULT_ANTI_CHEAT_CONFIG: AntiCheatConfig = {
  minMoveTime: 500, // 0.5 seconds minimum
  maxMoveTime: 30000, // 30 seconds maximum
  minPathSelectionTime: 200, // 200ms minimum for path selection
  minLetterSelectionTime: 100, // 100ms minimum for letter selection
  suspicionThreshold: 0.7,
  maxSuspiciousMoves: 5,
  shadowPoolSize: 100,
  enableBehavioral: true,
  enableShadowPool: true,
};

/**
 * Suspicion reasons
 */
export type SuspicionReason =
  | 'TOO_FAST'
  | 'TOO_SLOW'
  | 'PATH_TOO_FAST'
  | 'LETTER_TOO_FAST'
  | 'PATTERN_MISMATCH'
  | 'SHADOW_MISMATCH'
  | 'IMPOSSIBLE_MOVE'
  | null;

/**
 * Result of anti-cheat check
 */
export interface AntiCheatResult {
  /** Whether the move is considered legitimate */
  legitimate: boolean;
  /** Suspicion score (0-1) */
  suspicion: number;
  /** Reason for suspicion */
  reason: SuspicionReason;
  /** Recommended action */
  action: 'ALLOW' | 'WARN' | 'BLOCK' | 'SHADOW_CHECK';
  /** Telemetry data */
  telemetry: MoveTelemetry | null;
}

/**
 * Anti-cheat system for tracking and validating player behavior
 */
export class AntiCheatSystem {
  private readonly config: AntiCheatConfig;
  private readonly profiles: Map<number, PlayerProfile> = new Map();
  private shadowPool: ShadowEntry[] = [];
  private moveCounter: number = 0;

  constructor(config: Partial<AntiCheatConfig> = {}) {
    this.config = { ...DEFAULT_ANTI_CHEAT_CONFIG, ...config };
  }

  /**
   * Record telemetry for a move
   */
  recordTelemetry(playerId: number, telemetry: MoveTelemetry): void {
    let profile = this.profiles.get(playerId);
    if (!profile) {
      profile = {
        avgMoveTime: 0,
        moveTimeStdDev: 0,
        avgPathSelectionTime: 0,
        avgLetterSelectionTime: 0,
        suspiciousCount: 0,
        lastMoveTime: telemetry.timestamp,
        moveCount: 0,
      };
      this.profiles.set(playerId, profile);
    }

    // Update profile statistics
    profile.moveCount++;
    profile.lastMoveTime = telemetry.timestamp;

    // Simple moving average for demonstration
    const alpha = 0.2; // Smoothing factor
    profile.avgMoveTime = profile.avgMoveTime * (1 - alpha) + telemetry.totalTime * alpha;
    profile.avgPathSelectionTime = profile.avgPathSelectionTime * (1 - alpha) + telemetry.pathSelectionTime * alpha;
    profile.avgLetterSelectionTime = profile.avgLetterSelectionTime * (1 - alpha) + telemetry.letterSelectionTime * alpha;
  }

  /**
   * Check a move for cheating
   */
  checkMove(
    playerId: number,
    move: MoveInput,
    telemetry: MoveTelemetry | null = null,
    game: unknown | null = null,
  ): AntiCheatResult {
    const result: AntiCheatResult = {
      legitimate: true,
      suspicion: 0,
      reason: null,
      action: 'ALLOW',
      telemetry,
    };

    if (!this.config.enableBehavioral && !this.config.enableShadowPool) {
      return result;
    }

    // Check 1: Move time analysis
    if (telemetry) {
      this.recordTelemetry(playerId, telemetry);

      // Too fast - very suspicious
      if (telemetry.totalTime < this.config.minMoveTime) {
        result.suspicion += 0.8;
        result.reason = 'TOO_FAST';
      }

      // Too slow (might be bot or AFK)
      if (telemetry.totalTime > this.config.maxMoveTime) {
        result.suspicion += 0.8;
        if (result.reason === null) result.reason = 'TOO_SLOW';
      }

      // Path selection too fast
      if (telemetry.pathSelectionTime < this.config.minPathSelectionTime && telemetry.pathSelectionTime > 0) {
        result.suspicion += 0.9;
        if (result.reason === null) result.reason = 'PATH_TOO_FAST';
      }

      // Letter selection too fast
      if (telemetry.letterSelectionTime < this.config.minLetterSelectionTime && telemetry.letterSelectionTime > 0) {
        result.suspicion += 0.8;
        if (result.reason === null) result.reason = 'LETTER_TOO_FAST';
      }
    }

    // Check 2: Shadow pool validation (if enabled and game provided)
    if (this.config.enableShadowPool && game && telemetry) {
      const shadowResult = this.validateWithShadowPool(playerId, move, game, telemetry);
      if (!shadowResult.legitimate) {
        result.suspicion += shadowResult.suspicion * 0.5;
        if (result.reason === null) {
          result.reason = shadowResult.reason;
        }
      }
    }

    // Check 3: Behavioral pattern analysis
    const profile = this.profiles.get(playerId);
    if (profile && this.config.enableBehavioral) {
      const patternResult = this.checkBehavioralPattern(playerId, move, telemetry, profile);
      if (!patternResult.legitimate) {
        result.suspicion += patternResult.suspicion * 0.3;
        if (result.reason === null) {
          result.reason = patternResult.reason;
        }
      }
    }

    // Clamp suspicion to 0-1
    result.suspicion = Math.min(1, Math.max(0, result.suspicion));

    // Determine action based on suspicion
    if (result.suspicion >= this.config.suspicionThreshold) {
      result.legitimate = false;
      result.action = 'WARN';
    }

    if (result.suspicion >= 0.9) {
      result.action = 'BLOCK';
    }

    // Update suspicious count for any suspicion > 0
    if (result.suspicion > 0) {
      const profile = this.profiles.get(playerId);
      if (profile) {
        profile.suspiciousCount++;
        if (profile.suspiciousCount >= this.config.maxSuspiciousMoves) {
          result.action = 'BLOCK';
          result.legitimate = false;
        }
      }
    }

    this.moveCounter++;
    return result;
  }

  /**
   * Validate move using shadow pool
   */
  private validateWithShadowPool(
    _playerId: number,
    move: MoveInput,
    _game: unknown,
    _telemetry: MoveTelemetry,
  ): AntiCheatResult {
    const result: AntiCheatResult = {
      legitimate: true,
      suspicion: 0,
      reason: null,
      action: 'ALLOW',
      telemetry: _telemetry,
    };

    // Add to shadow pool
    this.addToShadowPool(_playerId, move, _telemetry);

    // If we have history for this player, check for inconsistencies
    const playerMoves = this.shadowPool.filter(() => true);

    // Simple check: if player consistently makes moves that are too perfect
    if (playerMoves.length >= 10) {
      // Check if all moves are high-scoring
      // This would require game state, which we don't have here
      // So this is a placeholder for the concept
    }

    return result;
  }

  /**
   * Add move to shadow pool
   */
  addToShadowPool(_playerId: number, move: MoveInput, _telemetry: MoveTelemetry): void {
    if (!this.config.enableShadowPool) return;

    // For now, just store the move
    // In a real implementation, we'd store more data and do more analysis
    const entry: ShadowEntry = {
      move,
      clientWord: '', // Would be set based on the move
      serverWord: null,
      accepted: true,
      suspicion: 0,
      reason: null,
      timestamp: Date.now(),
    };

    this.shadowPool.push(entry);

    // Keep pool size limited
    if (this.shadowPool.length > this.config.shadowPoolSize) {
      this.shadowPool.shift();
    }
  }

  /**
   * Check for behavioral patterns that indicate cheating
   */
  private checkBehavioralPattern(
    playerId: number,
    move: MoveInput,
    telemetry: MoveTelemetry | null,
    profile: PlayerProfile,
  ): AntiCheatResult {
    const result: AntiCheatResult = {
      legitimate: true,
      suspicion: 0,
      reason: null,
      action: 'ALLOW',
      telemetry,
    };

    // Check 1: Consistently too fast
    if (telemetry && profile.moveCount > 5) {
      if (telemetry.totalTime < profile.avgMoveTime * 0.5) {
        result.suspicion += 0.4;
        result.reason = 'PATTERN_MISMATCH';
      }
    }

    // Check 2: Path selection patterns
    // If path is complex but selected very quickly
    if (telemetry && move.path.length > 5 && telemetry.pathSelectionTime < 300) {
      result.suspicion += 0.3;
      result.reason = 'PATH_TOO_FAST';
    }

    // Check 3: Movement hash consistency
    // If movement patterns are identical for different moves
    // This would require storing previous hashes

    return result;
  }

  /**
   * Generate a simple movement hash based on path
   */
  generateMovementHash(path: CellPos[]): string {
    const hashParts = path.map((p) => `${p.row},${p.col}`).join('|');
    // Simple hash - in production use a proper hash function
    let hash = 0;
    for (let i = 0; i < hashParts.length; i++) {
      const char = hashParts.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(16);
  }

  /**
   * Get player profile
   */
  getPlayerProfile(playerId: number): PlayerProfile | null {
    return this.profiles.get(playerId) ?? null;
  }

  /**
   * Get shadow pool entries for a player
   */
  getShadowPool(_playerId: number): ShadowEntry[] {
    // Filter by player - would need to track playerId in entries
    return this.shadowPool.filter(() => true); // Placeholder
  }

  /**
   * Reset the anti-cheat system
   */
  reset(): void {
    this.profiles.clear();
    this.shadowPool = [];
    this.moveCounter = 0;
  }

  /**
   * Get statistics
   */
  getStats(): {
    totalMoves: number;
    totalPlayers: number;
    shadowPoolSize: number;
    suspiciousMoves: number;
  } {
    let suspiciousMoves = 0;
    for (const profile of this.profiles.values()) {
      suspiciousMoves += profile.suspiciousCount;
    }

    return {
      totalMoves: this.moveCounter,
      totalPlayers: this.profiles.size,
      shadowPoolSize: this.shadowPool.length,
      suspiciousMoves,
    };
  }
}

/**
 * Create a new anti-cheat system with default configuration
 */
export function createAntiCheatSystem(config?: Partial<AntiCheatConfig>): AntiCheatSystem {
  return new AntiCheatSystem(config);
}

/**
 * Telemetry collector for client-side tracking
 */
export class MoveTelemetryCollector {
  private startTime: number = 0;
  private pathStartTime: number = 0;
  private letterStartTime: number = 0;
  private pathCorrections: number = 0;
  private path: CellPos[] = [];
  private movementParts: string[] = [];

  /**
   * Start tracking a new move
   */
  start(): void {
    this.startTime = Date.now();
    this.pathCorrections = 0;
    this.path = [];
    this.movementParts = [];
  }

  /**
   * Start path selection
   */
  startPathSelection(): void {
    this.pathStartTime = Date.now();
  }

  /**
   * Add a cell to the path
   */
  addPathCell(cell: CellPos): void {
    this.path.push(cell);
    this.movementParts.push(`${cell.row},${cell.col}`);
  }

  /**
   * Record a path correction
   */
  recordCorrection(): void {
    this.pathCorrections++;
  }

  /**
   * Start letter selection
   */
  startLetterSelection(): void {
    this.letterStartTime = Date.now();
  }

  /**
   * Complete the move and get telemetry
   */
  complete(): MoveTelemetry {
    const endTime = Date.now();
    const pathEndTime = this.letterStartTime || endTime;

    return {
      timestamp: this.startTime,
      pathSelectionTime: Math.max(0, pathEndTime - this.pathStartTime),
      letterSelectionTime: Math.max(0, endTime - this.letterStartTime),
      totalTime: Math.max(0, endTime - this.startTime),
      movementHash: this.generateHash(),
      pathCorrections: this.pathCorrections,
    };
  }

  /**
   * Generate movement hash
   */
  private generateHash(): string {
    const movementString = this.movementParts.join('|');
    let hash = 0;
    for (let i = 0; i < movementString.length; i++) {
      const char = movementString.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return hash.toString(16);
  }
}
