/**
 * Analytics system for Balda game
 * Event tracking, metrics collection, and platform integration
 */

/**
 * Analytics event types
 */
export type AnalyticsEventType =
  | 'game_start'
  | 'game_end'
  | 'move_made'
  | 'word_found'
  | 'timeout'
  | 'give_up'
  | 'rating_change'
  | 'achievement_unlocked'
  | 'cosmetic_purchased'
  | 'cosmetic_selected'
  | 'report_submitted'
  | 'ad_watched'
  | 'session_start'
  | 'session_end'
  | 'error'
  | 'custom';

/**
 * Base analytics event
 */
export interface AnalyticsEvent {
  /** Event type */
  type: AnalyticsEventType;
  /** Timestamp */
  timestamp: number;
  /** Session ID */
  sessionId: string;
  /** Player ID */
  playerId: number | null;
  /** Platform */
  platform: string;
  /** Custom properties */
  properties: Record<string, unknown>;
}

/**
 * Game start event properties
 */
export interface GameStartEvent extends AnalyticsEvent {
  type: 'game_start';
  properties: {
    gameId: string;
    boardSize: string;
    difficulty: string;
    timeControl: string | null;
    isOnline: boolean;
    opponentId: number | null;
    opponentName: string | null;
  };
}

/**
 * Game end event properties
 */
export interface GameEndEvent extends AnalyticsEvent {
  type: 'game_end';
  properties: {
    gameId: string;
    winnerId: number | null;
    reason: string;
    duration: number;
    movesCount: number;
    score: number;
    wordsFound: number;
    isRated: boolean;
  };
}

/**
 * Move made event properties
 */
export interface MoveEvent extends AnalyticsEvent {
  type: 'move_made';
  properties: {
    gameId: string;
    moveNumber: number;
    word: string;
    score: number;
    pathLength: number;
    totalTime: number;
    pathSelectionTime: number;
    letterSelectionTime: number;
    pathCorrections: number;
  };
}

/**
 * Word found event properties
 */
export interface WordFoundEvent extends AnalyticsEvent {
  type: 'word_found';
  properties: {
    gameId: string;
    word: string;
    length: number;
    score: number;
  };
}

/**
 * Rating change event properties
 */
export interface RatingChangeEvent extends AnalyticsEvent {
  type: 'rating_change';
  properties: {
    oldRating: number;
    newRating: number;
    delta: number;
    reason: 'game_win' | 'game_lose' | 'manual_adjustment';
    gameId: string | null;
  };
}

/**
 * Achievement unlocked event properties
 */
export interface AchievementEvent extends AnalyticsEvent {
  type: 'achievement_unlocked';
  properties: {
    achievementId: string;
    achievementName: string;
    progress: number;
    totalRequired: number;
  };
}

/**
 * Session metrics
 */
export interface SessionMetrics {
  sessionId: string;
  playerId: number | null;
  startTime: number;
  endTime: number | null;
  duration: number | null;
  gamesPlayed: number;
  gamesWon: number;
  gamesLost: number;
  totalScore: number;
  totalWords: number;
  errors: number;
}

/**
 * Player metrics
 */
export interface PlayerMetrics {
  playerId: number;
  totalSessions: number;
  totalGames: number;
  winRate: number;
  avgScore: number;
  avgGameDuration: number;
  totalWordsFound: number;
  retentionDay1: boolean;
  retentionDay7: boolean;
  retentionDay30: boolean;
  lastSessionDate: string;
  firstSessionDate: string;
}

/**
 * Metrics configuration
 */
export interface AnalyticsConfig {
  /** Enable analytics */
  enabled: boolean;
  /** Track sessions */
  trackSessions: boolean;
  /** Track games */
  trackGames: boolean;
  /** Track moves */
  trackMoves: boolean;
  /** Track errors */
  trackErrors: boolean;
  /** Session timeout in milliseconds */
  sessionTimeout: number;
  /** Batch events before sending */
  batchEvents: boolean;
  /** Batch size */
  batchSize: number;
  /** Platform name */
  platform: string;
}

/**
 * Default analytics configuration
 */
export const DEFAULT_ANALYTICS_CONFIG: AnalyticsConfig = {
  enabled: true,
  trackSessions: true,
  trackGames: true,
  trackMoves: true,
  trackErrors: true,
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  batchEvents: false,
  batchSize: 10,
  platform: 'web',
};

/**
 * Analytics provider interface
 */
export interface AnalyticsProvider {
  track(event: AnalyticsEvent): Promise<void>;
  trackGameStart(params: Omit<GameStartEvent['properties'], 'type' | 'timestamp' | 'sessionId' | 'playerId' | 'platform'>): void;
  trackGameEnd(params: Omit<GameEndEvent['properties'], 'type' | 'timestamp' | 'sessionId' | 'playerId' | 'platform'>): void;
  trackMove(params: Omit<MoveEvent['properties'], 'type' | 'timestamp' | 'sessionId' | 'playerId' | 'platform'>): void;
  trackWordFound(params: Omit<WordFoundEvent['properties'], 'type' | 'timestamp' | 'sessionId' | 'playerId' | 'platform'>): void;
  trackRatingChange(params: Omit<RatingChangeEvent['properties'], 'type' | 'timestamp' | 'sessionId' | 'playerId' | 'platform'>): void;
  trackAchievement(params: Omit<AchievementEvent['properties'], 'type' | 'timestamp' | 'sessionId' | 'playerId' | 'platform'>): void;
  trackError(error: Error, context?: Record<string, unknown>): void;
  startSession(playerId: number | null): void;
  endSession(): void;
  getSessionMetrics(): SessionMetrics | null;
  getPlayerMetrics(playerId: number): PlayerMetrics | null;
  flush(): Promise<void>;
  reset(): void;
}

/**
 * In-memory analytics provider
 */
export class InMemoryAnalyticsProvider implements AnalyticsProvider {
  private readonly config: AnalyticsConfig;
  private events: AnalyticsEvent[] = [];
  private sessions: Map<string, SessionMetrics> = new Map();
  private playerMetrics: Map<number, PlayerMetrics> = new Map();
  private currentSessionId: string | null = null;
  private currentPlayerId: number | null = null;
  private sessionStartTime: number = 0;
  private lastActivityTime: number = 0;

  constructor(config: Partial<AnalyticsConfig> = {}) {
    this.config = { ...DEFAULT_ANALYTICS_CONFIG, ...config };
  }

  /**
   * Generate unique session ID
   */
  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Track an event
   */
  async track(event: AnalyticsEvent): Promise<void> {
    if (!this.config.enabled) return;

    this.events.push(event);
    this.lastActivityTime = Date.now();

    // Auto-flush if not batching
    if (!this.config.batchEvents) {
      await this.flush();
    }
  }

  /**
   * Track game start
   */
  trackGameStart(params: Omit<GameStartEvent['properties'], 'type' | 'timestamp' | 'sessionId' | 'playerId' | 'platform'>): void {
    if (!this.config.enabled || !this.config.trackGames) return;

    const event: GameStartEvent = {
      type: 'game_start',
      timestamp: Date.now(),
      sessionId: this.currentSessionId ?? '',
      playerId: this.currentPlayerId,
      platform: this.config.platform,
      properties: params,
    };

    this.track(event);

    // Update session metrics
    if (this.currentSessionId) {
      const session = this.sessions.get(this.currentSessionId);
      if (session) {
        session.gamesPlayed++;
      }
    }
  }

  /**
   * Track game end
   */
  trackGameEnd(params: Omit<GameEndEvent['properties'], 'type' | 'timestamp' | 'sessionId' | 'playerId' | 'platform'>): void {
    if (!this.config.enabled || !this.config.trackGames) return;

    const event: GameEndEvent = {
      type: 'game_end',
      timestamp: Date.now(),
      sessionId: this.currentSessionId ?? '',
      playerId: this.currentPlayerId,
      platform: this.config.platform,
      properties: params,
    };

    this.track(event);

    // Update session metrics
    if (this.currentSessionId && this.currentPlayerId) {
      const session = this.sessions.get(this.currentSessionId);
      if (session) {
        session.gamesPlayed++;
        session.totalScore += params.score;
        session.totalWords += params.wordsFound;

        if (params.winnerId === this.currentPlayerId) {
          session.gamesWon++;
        } else if (params.winnerId !== null) {
          session.gamesLost++;
        }
      }

      // Update player metrics
      let playerMetric = this.playerMetrics.get(this.currentPlayerId);
      if (!playerMetric) {
        playerMetric = {
          playerId: this.currentPlayerId,
          totalSessions: 0,
          totalGames: 0,
          winRate: 0,
          avgScore: 0,
          avgGameDuration: 0,
          totalWordsFound: 0,
          retentionDay1: false,
          retentionDay7: false,
          retentionDay30: false,
          lastSessionDate: new Date().toISOString().split('T')[0],
          firstSessionDate: new Date().toISOString().split('T')[0],
        };
        this.playerMetrics.set(this.currentPlayerId, playerMetric);
      }

      playerMetric.totalGames++;
      playerMetric.totalWordsFound += params.wordsFound;
      playerMetric.lastSessionDate = new Date().toISOString().split('T')[0];

      // Update win rate
      const totalGames = playerMetric.totalGames;
      const gamesWon = session?.gamesWon ?? 0;
      playerMetric.winRate = (gamesWon / totalGames) * 100;
    }
  }

  /**
   * Track move
   */
  trackMove(params: Omit<MoveEvent['properties'], 'type' | 'timestamp' | 'sessionId' | 'playerId' | 'platform'>): void {
    if (!this.config.enabled || !this.config.trackMoves) return;

    const event: MoveEvent = {
      type: 'move_made',
      timestamp: Date.now(),
      sessionId: this.currentSessionId ?? '',
      playerId: this.currentPlayerId,
      platform: this.config.platform,
      properties: params,
    };

    this.track(event);
  }

  /**
   * Track word found
   */
  trackWordFound(params: Omit<WordFoundEvent['properties'], 'type' | 'timestamp' | 'sessionId' | 'playerId' | 'platform'>): void {
    if (!this.config.enabled) return;

    const event: WordFoundEvent = {
      type: 'word_found',
      timestamp: Date.now(),
      sessionId: this.currentSessionId ?? '',
      playerId: this.currentPlayerId,
      platform: this.config.platform,
      properties: params,
    };

    this.track(event);
  }

  /**
   * Track rating change
   */
  trackRatingChange(params: Omit<RatingChangeEvent['properties'], 'type' | 'timestamp' | 'sessionId' | 'playerId' | 'platform'>): void {
    if (!this.config.enabled) return;

    const event: RatingChangeEvent = {
      type: 'rating_change',
      timestamp: Date.now(),
      sessionId: this.currentSessionId ?? '',
      playerId: this.currentPlayerId,
      platform: this.config.platform,
      properties: params,
    };

    this.track(event);
  }

  /**
   * Track achievement
   */
  trackAchievement(params: Omit<AchievementEvent['properties'], 'type' | 'timestamp' | 'sessionId' | 'playerId' | 'platform'>): void {
    if (!this.config.enabled) return;

    const event: AchievementEvent = {
      type: 'achievement_unlocked',
      timestamp: Date.now(),
      sessionId: this.currentSessionId ?? '',
      playerId: this.currentPlayerId,
      platform: this.config.platform,
      properties: params,
    };

    this.track(event);
  }

  /**
   * Track error
   */
  trackError(error: Error, context: Record<string, unknown> = {}): void {
    if (!this.config.enabled || !this.config.trackErrors) return;

    const event: AnalyticsEvent = {
      type: 'error',
      timestamp: Date.now(),
      sessionId: this.currentSessionId ?? '',
      playerId: this.currentPlayerId,
      platform: this.config.platform,
      properties: {
        error: error.message,
        stack: error.stack,
        ...context,
      },
    };

    this.track(event);

    // Update session metrics
    if (this.currentSessionId) {
      const session = this.sessions.get(this.currentSessionId);
      if (session) {
        session.errors++;
      }
    }
  }

  /**
   * Start a new session
   */
  startSession(playerId: number | null): void {
    if (!this.config.enabled || !this.config.trackSessions) return;

    // End previous session if exists
    if (this.currentSessionId) {
      this.endSession();
    }

    this.currentSessionId = this.generateSessionId();
    this.currentPlayerId = playerId;
    this.sessionStartTime = Date.now();
    this.lastActivityTime = Date.now();

    const session: SessionMetrics = {
      sessionId: this.currentSessionId,
      playerId,
      startTime: this.sessionStartTime,
      endTime: null,
      duration: null,
      gamesPlayed: 0,
      gamesWon: 0,
      gamesLost: 0,
      totalScore: 0,
      totalWords: 0,
      errors: 0,
    };

    this.sessions.set(this.currentSessionId, session);

    // Track session start
    const event: AnalyticsEvent = {
      type: 'session_start',
      timestamp: this.sessionStartTime,
      sessionId: this.currentSessionId,
      playerId,
      platform: this.config.platform,
      properties: {},
    };

    this.track(event);

    // Update player metrics
    if (playerId) {
      let playerMetric = this.playerMetrics.get(playerId);
      if (!playerMetric) {
        playerMetric = {
          playerId,
          totalSessions: 0,
          totalGames: 0,
          winRate: 0,
          avgScore: 0,
          avgGameDuration: 0,
          totalWordsFound: 0,
          retentionDay1: false,
          retentionDay7: false,
          retentionDay30: false,
          lastSessionDate: new Date().toISOString().split('T')[0],
          firstSessionDate: new Date().toISOString().split('T')[0],
        };
        this.playerMetrics.set(playerId, playerMetric);
      }

      playerMetric.totalSessions++;
      playerMetric.lastSessionDate = new Date().toISOString().split('T')[0];

      if (playerMetric.firstSessionDate === playerMetric.lastSessionDate) {
        playerMetric.firstSessionDate = new Date().toISOString().split('T')[0];
      }
    }
  }

  /**
   * End current session
   */
  endSession(): void {
    if (!this.currentSessionId) return;

    const session = this.sessions.get(this.currentSessionId);
    if (session) {
      session.endTime = Date.now();
      session.duration = session.endTime - session.startTime;
    }

    const event: AnalyticsEvent = {
      type: 'session_end',
      timestamp: Date.now(),
      sessionId: this.currentSessionId,
      playerId: this.currentPlayerId,
      platform: this.config.platform,
      properties: {
        duration: session?.duration,
        gamesPlayed: session?.gamesPlayed,
        gamesWon: session?.gamesWon,
        totalScore: session?.totalScore,
      },
    };

    this.track(event);

    this.currentSessionId = null;
    this.currentPlayerId = null;
  }

  /**
   * Get current session metrics
   */
  getSessionMetrics(): SessionMetrics | null {
    if (!this.currentSessionId) return null;
    return this.sessions.get(this.currentSessionId) ?? null;
  }

  /**
   * Get player metrics
   */
  getPlayerMetrics(playerId: number): PlayerMetrics | null {
    return this.playerMetrics.get(playerId) ?? null;
  }

  /**
   * Flush events (send to server or storage)
   */
  async flush(): Promise<void> {
    // In production, this would send events to a server or analytics service
    // For now, just clear the buffer
    if (this.config.batchEvents && this.events.length >= this.config.batchSize) {
      this.events = [];
    }
  }

  /**
   * Reset analytics
   */
  reset(): void {
    this.events = [];
    this.sessions.clear();
    this.playerMetrics.clear();
    this.currentSessionId = null;
    this.currentPlayerId = null;
    this.sessionStartTime = 0;
    this.lastActivityTime = 0;
  }

  /**
   * Get all events
   */
  getEvents(): AnalyticsEvent[] {
    return [...this.events];
  }

  /**
   * Get all sessions
   */
  getSessions(): SessionMetrics[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get all player metrics
   */
  getAllPlayerMetrics(): PlayerMetrics[] {
    return Array.from(this.playerMetrics.values());
  }

  /**
   * Check if session is expired
   */
  checkSessionExpiry(): void {
    if (!this.currentSessionId || !this.config.trackSessions) return;

    const now = Date.now();
    if (now - this.lastActivityTime > this.config.sessionTimeout) {
      this.endSession();
    }
  }
}

/**
 * Create a new analytics provider
 */
export function createAnalyticsProvider(config?: Partial<AnalyticsConfig>): AnalyticsProvider {
  return new InMemoryAnalyticsProvider(config);
}

/**
 * Global analytics instance
 */
let globalAnalytics: AnalyticsProvider | null = null;

/**
 * Get or create global analytics instance
 */
export function getAnalytics(): AnalyticsProvider {
  if (!globalAnalytics) {
    globalAnalytics = createAnalyticsProvider();
  }
  return globalAnalytics;
}

/**
 * Set global analytics instance
 */
export function setAnalytics(provider: AnalyticsProvider): void {
  globalAnalytics = provider;
}

/**
 * Convenience functions for tracking
 */
export const trackGameStart = (params: Omit<GameStartEvent['properties'], 'type' | 'timestamp' | 'sessionId' | 'playerId' | 'platform'>): void => {
  getAnalytics().trackGameStart(params);
};

export const trackGameEnd = (params: Omit<GameEndEvent['properties'], 'type' | 'timestamp' | 'sessionId' | 'playerId' | 'platform'>): void => {
  getAnalytics().trackGameEnd(params);
};

export const trackMove = (params: Omit<MoveEvent['properties'], 'type' | 'timestamp' | 'sessionId' | 'playerId' | 'platform'>): void => {
  getAnalytics().trackMove(params);
};

export const trackWordFound = (params: Omit<WordFoundEvent['properties'], 'type' | 'timestamp' | 'sessionId' | 'playerId' | 'platform'>): void => {
  getAnalytics().trackWordFound(params);
};

export const trackRatingChange = (params: Omit<RatingChangeEvent['properties'], 'type' | 'timestamp' | 'sessionId' | 'playerId' | 'platform'>): void => {
  getAnalytics().trackRatingChange(params);
};

export const trackAchievement = (params: Omit<AchievementEvent['properties'], 'type' | 'timestamp' | 'sessionId' | 'playerId' | 'platform'>): void => {
  getAnalytics().trackAchievement(params);
};

export const trackError = (error: Error, context?: Record<string, unknown>): void => {
  getAnalytics().trackError(error, context);
};

export const startSession = (playerId: number | null): void => {
  getAnalytics().startSession(playerId);
};

export const endSession = (): void => {
  getAnalytics().endSession();
};
