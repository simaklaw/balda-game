/**
 * Retention metrics system for Balda game
 * Track player retention over time (Day 1, Day 7, Day 30)
 */

/**
 * Retention period
 */
export type RetentionPeriod = 'day1' | 'day7' | 'day30';

/**
 * Player session data
 */
export interface PlayerSession {
  /** Session ID */
  sessionId: string;
  /** Player ID */
  playerId: number;
  /** Session start timestamp */
  startTime: number;
  /** Session end timestamp */
  endTime: number | null;
  /** Session date (YYYY-MM-DD) */
  date: string;
  /** Games played in session */
  gamesPlayed: number;
  /** Duration in seconds */
  duration: number | null;
}

/**
 * Player retention data
 */
export interface PlayerRetention {
  /** Player ID */
  playerId: number;
  /** First session date */
  firstSessionDate: string;
  /** Last session date */
  lastSessionDate: string;
  /** Total sessions */
  totalSessions: number;
  /** Days since first session */
  daysSinceFirstSession: number;
  /** Retention flags */
  retained: {
    day1: boolean;
    day7: boolean;
    day30: boolean;
  };
  /** Retention dates */
  retentionDates: {
    day1: string | null;
    day7: string | null;
    day30: string | null;
  };
  /** Cohort */
  cohort: string;
}

/**
 * Cohort retention data
 */
export interface CohortRetention {
  /** Cohort date (YYYY-MM-DD) */
  cohortDate: string;
  /** Number of new players in cohort */
  newPlayers: number;
  /** Retention counts */
  retention: {
    day1: { count: number; rate: number };
    day7: { count: number; rate: number };
    day30: { count: number; rate: number };
  };
  /** Active players */
  activePlayers: {
    day1: number;
    day7: number;
    day30: number;
  };
}

/**
 * Retention metrics
 */
export interface RetentionMetrics {
  /** Overall retention rates */
  overall: {
    day1: number;
    day7: number;
    day30: number;
  };
  /** Retention by cohort */
  byCohort: CohortRetention[];
  /** Active players */
  activePlayers: {
    today: number;
    day1: number;
    day7: number;
    day30: number;
  };
  /** New players */
  newPlayers: {
    today: number;
    week: number;
    month: number;
  };
}

/**
 * Retention configuration
 */
export interface RetentionConfig {
  /** Enable retention tracking */
  enabled: boolean;
  /** Track daily sessions */
  trackDaily: boolean;
  /** Track weekly sessions */
  trackWeekly: boolean;
  /** Track monthly sessions */
  trackMonthly: boolean;
  /** Session timeout in milliseconds */
  sessionTimeout: number;
  /** Days to consider for retention */
  retentionPeriods: RetentionPeriod[];
}

/**
 * Default retention configuration
 */
export const DEFAULT_RETENTION_CONFIG: RetentionConfig = {
  enabled: true,
  trackDaily: true,
  trackWeekly: true,
  trackMonthly: true,
  sessionTimeout: 30 * 60 * 1000, // 30 minutes
  retentionPeriods: ['day1', 'day7', 'day30'],
};

/**
 * Retention system
 */
export class RetentionSystem {
  private config: RetentionConfig;
  private sessions: Map<string, PlayerSession> = new Map();
  private playerRetention: Map<number, PlayerRetention> = new Map();
  private cohorts: Map<string, CohortRetention> = new Map();
  private todayDate: string;

  constructor(config: Partial<RetentionConfig> = {}) {
    this.config = { ...DEFAULT_RETENTION_CONFIG, ...config };
    this.todayDate = new Date().toISOString().split('T')[0];
  }

  /**
   * Get current date
   */
  private getCurrentDate(): string {
    return new Date().toISOString().split('T')[0];
  }

  /**
   * Get days between two dates
   */
  private getDaysBetween(startDate: string, endDate: string): number {
    const start = new Date(startDate);
    const end = new Date(endDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.floor(diffTime / (1000 * 60 * 60 * 24));
  }

  /**
   * Add a new session
   */
  addSession(session: Omit<PlayerSession, 'date' | 'duration'>): PlayerSession {
    if (!this.config.enabled) {
      return {
        ...session,
        date: this.getCurrentDate(),
        duration: null,
      };
    }

    const date = this.getCurrentDate();
    const playerSession: PlayerSession = {
      ...session,
      date,
      duration: null,
    };

    // Calculate duration if endTime is provided
    if (session.endTime) {
      playerSession.duration = Math.floor((session.endTime - session.startTime) / 1000);
    }

    this.sessions.set(session.sessionId, playerSession);

    // Update player retention
    this.updatePlayerRetention(playerSession);

    // Update cohort
    this.updateCohort(playerSession);

    return playerSession;
  }

  /**
   * Update session with end time
   */
  endSession(sessionId: string, endTime: number): PlayerSession | null {
    const session = this.sessions.get(sessionId);
    if (!session) return null;

    session.endTime = endTime;
    session.duration = Math.floor((endTime - session.startTime) / 1000);

    // Update player retention
    this.updatePlayerRetention(session);

    return session;
  }

  /**
   * Update player retention data
   */
  private updatePlayerRetention(session: PlayerSession): void {
    let retention = this.playerRetention.get(session.playerId);

    if (!retention) {
      retention = {
        playerId: session.playerId,
        firstSessionDate: session.date,
        lastSessionDate: session.date,
        totalSessions: 0,
        daysSinceFirstSession: 0,
        retained: {
          day1: false,
          day7: false,
          day30: false,
        },
        retentionDates: {
          day1: null,
          day7: null,
          day30: null,
        },
        cohort: session.date,
      };
      this.playerRetention.set(session.playerId, retention);
    }

    // Update session count
    retention.totalSessions++;
    retention.lastSessionDate = session.date;

    // Update days since first session
    retention.daysSinceFirstSession = this.getDaysBetween(retention.firstSessionDate, session.date);

    // Check retention
    if (retention.daysSinceFirstSession >= 1 && !retention.retained.day1) {
      retention.retained.day1 = true;
      retention.retentionDates.day1 = session.date;
    }

    if (retention.daysSinceFirstSession >= 7 && !retention.retained.day7) {
      retention.retained.day7 = true;
      retention.retentionDates.day7 = session.date;
    }

    if (retention.daysSinceFirstSession >= 30 && !retention.retained.day30) {
      retention.retained.day30 = true;
      retention.retentionDates.day30 = session.date;
    }
  }

  /**
   * Update cohort data
   */
  private updateCohort(session: PlayerSession): void {
    const cohortDate = session.date;
    let cohort = this.cohorts.get(cohortDate);

    if (!cohort) {
      cohort = {
        cohortDate,
        newPlayers: 0,
        retention: {
          day1: { count: 0, rate: 0 },
          day7: { count: 0, rate: 0 },
          day30: { count: 0, rate: 0 },
        },
        activePlayers: {
          day1: 0,
          day7: 0,
          day30: 0,
        },
      };
      this.cohorts.set(cohortDate, cohort);
    }

    // Check if this is the player's first session
    const playerRetention = this.playerRetention.get(session.playerId);
    if (playerRetention && playerRetention.firstSessionDate === cohortDate) {
      cohort.newPlayers++;
    }

    // Update active players
    const daysSinceCohort = this.getDaysBetween(cohortDate, session.date);
    if (daysSinceCohort <= 1) {
      cohort.activePlayers.day1++;
    }
    if (daysSinceCohort <= 7) {
      cohort.activePlayers.day7++;
    }
    if (daysSinceCohort <= 30) {
      cohort.activePlayers.day30++;
    }

    // Update retention counts and rates
    if (daysSinceCohort === 1) {
      cohort.retention.day1.count++;
      cohort.retention.day1.rate = (cohort.retention.day1.count / cohort.newPlayers) * 100;
    }
    if (daysSinceCohort === 7) {
      cohort.retention.day7.count++;
      cohort.retention.day7.rate = (cohort.retention.day7.count / cohort.newPlayers) * 100;
    }
    if (daysSinceCohort === 30) {
      cohort.retention.day30.count++;
      cohort.retention.day30.rate = (cohort.retention.day30.count / cohort.newPlayers) * 100;
    }
  }

  /**
   * Get player retention
   */
  getPlayerRetention(playerId: number): PlayerRetention | null {
    return this.playerRetention.get(playerId) ?? null;
  }

  /**
   * Get all player retention data
   */
  getAllPlayerRetention(): PlayerRetention[] {
    return Array.from(this.playerRetention.values());
  }

  /**
   * Get cohort retention
   */
  getCohortRetention(cohortDate: string): CohortRetention | null {
    return this.cohorts.get(cohortDate) ?? null;
  }

  /**
   * Get all cohort retention data
   */
  getAllCohortRetention(): CohortRetention[] {
    return Array.from(this.cohorts.values()).sort((a, b) => {
      return b.cohortDate.localeCompare(a.cohortDate);
    });
  }

  /**
   * Get retention metrics
   */
  getMetrics(): RetentionMetrics {
    const allRetention = this.getAllPlayerRetention();
    const allCohorts = this.getAllCohortRetention();

    // Calculate overall retention rates
    const day1Retained = allRetention.filter((r) => r.retained.day1).length;
    const day7Retained = allRetention.filter((r) => r.retained.day7).length;
    const day30Retained = allRetention.filter((r) => r.retained.day30).length;
    const totalPlayers = allRetention.length;

    // Calculate active players
    const today = this.getCurrentDate();
    const activeToday = allRetention.filter((r) => r.lastSessionDate === today).length;

    // Calculate new players
    const newToday = allRetention.filter((r) => r.firstSessionDate === today).length;
    const newThisWeek = allRetention.filter((r) => {
      const days = this.getDaysBetween(r.firstSessionDate, today);
      return days <= 7;
    }).length;
    const newThisMonth = allRetention.filter((r) => {
      const days = this.getDaysBetween(r.firstSessionDate, today);
      return days <= 30;
    }).length;

    // Calculate active players for each period
    const activeDay1 = allRetention.filter((r) => {
      const days = this.getDaysBetween(r.firstSessionDate, r.lastSessionDate);
      return days >= 1;
    }).length;

    const activeDay7 = allRetention.filter((r) => {
      const days = this.getDaysBetween(r.firstSessionDate, r.lastSessionDate);
      return days >= 7;
    }).length;

    const activeDay30 = allRetention.filter((r) => {
      const days = this.getDaysBetween(r.firstSessionDate, r.lastSessionDate);
      return days >= 30;
    }).length;

    return {
      overall: {
        day1: totalPlayers > 0 ? (day1Retained / totalPlayers) * 100 : 0,
        day7: totalPlayers > 0 ? (day7Retained / totalPlayers) * 100 : 0,
        day30: totalPlayers > 0 ? (day30Retained / totalPlayers) * 100 : 0,
      },
      byCohort: allCohorts,
      activePlayers: {
        today: activeToday,
        day1: activeDay1,
        day7: activeDay7,
        day30: activeDay30,
      },
      newPlayers: {
        today: newToday,
        week: newThisWeek,
        month: newThisMonth,
      },
    };
  }

  /**
   * Get retention rate for specific period
   */
  getRetentionRate(period: RetentionPeriod): number {
    const metrics = this.getMetrics();
    return metrics.overall[period];
  }

  /**
   * Get retention curve (daily retention over time)
   */
  getRetentionCurve(days: number = 30): Array<{ day: number; rate: number; count: number }> {
    const curve: Array<{ day: number; rate: number; count: number }> = [];

    for (let day = 1; day <= days; day++) {
      const retained = this.getAllPlayerRetention().filter((r) => {
        return r.daysSinceFirstSession >= day;
      }).length;

      const total = this.getAllPlayerRetention().filter((r) => {
        return r.daysSinceFirstSession >= day - 1;
      }).length;

      curve.push({
        day,
        rate: total > 0 ? (retained / total) * 100 : 0,
        count: retained,
      });
    }

    return curve;
  }

  /**
   * Get DAU (Daily Active Users)
   */
  getDAU(date?: string): number {
    const targetDate = date ?? this.getCurrentDate();
    return this.getAllPlayerRetention().filter((r) => r.lastSessionDate === targetDate).length;
  }

  /**
   * Get WAU (Weekly Active Users)
   */
  getWAU(): number {
    const today = this.getCurrentDate();
    return this.getAllPlayerRetention().filter((r) => {
      const days = this.getDaysBetween(r.lastSessionDate, today);
      return days <= 7;
    }).length;
  }

  /**
   * Get MAU (Monthly Active Users)
   */
  getMAU(): number {
    const today = this.getCurrentDate();
    return this.getAllPlayerRetention().filter((r) => {
      const days = this.getDaysBetween(r.lastSessionDate, today);
      return days <= 30;
    }).length;
  }

  /**
   * Get stickiness ratio (DAU/MAU)
   */
  getStickiness(): number {
    const dau = this.getDAU();
    const mau = this.getMAU();
    return mau > 0 ? (dau / mau) * 100 : 0;
  }

  /**
   * Get average sessions per player
   */
  getAvgSessionsPerPlayer(): number {
    const allRetention = this.getAllPlayerRetention();
    if (allRetention.length === 0) return 0;

    const totalSessions = allRetention.reduce((sum, r) => sum + r.totalSessions, 0);
    return totalSessions / allRetention.length;
  }

  /**
   * Get average games per session
   */
  getAvgGamesPerSession(): number {
    const sessions = this.getAllSessions();
    if (sessions.length === 0) return 0;

    const totalGames = sessions.reduce((sum, s) => sum + s.gamesPlayed, 0);
    return totalGames / sessions.length;
  }

  /**
   * Get all sessions
   */
  getAllSessions(): PlayerSession[] {
    return Array.from(this.sessions.values());
  }

  /**
   * Get sessions for player
   */
  getPlayerSessions(playerId: number): PlayerSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.playerId === playerId);
  }

  /**
   * Get sessions by date
   */
  getSessionsByDate(date: string): PlayerSession[] {
    return Array.from(this.sessions.values()).filter((s) => s.date === date);
  }

  /**
   * Reset the system
   */
  reset(): void {
    this.sessions.clear();
    this.playerRetention.clear();
    this.cohorts.clear();
  }

  /**
   * Export data for storage
   */
  export(): {
    sessions: PlayerSession[];
    playerRetention: PlayerRetention[];
    cohorts: CohortRetention[];
    config: RetentionConfig;
  } {
    return {
      sessions: Array.from(this.sessions.values()),
      playerRetention: Array.from(this.playerRetention.values()),
      cohorts: Array.from(this.cohorts.values()),
      config: this.config,
    };
  }

  /**
   * Import data from storage
   */
  import(data: {
    sessions: PlayerSession[];
    playerRetention: PlayerRetention[];
    cohorts: CohortRetention[];
    config?: Partial<RetentionConfig>;
  }): void {
    this.sessions.clear();
    this.playerRetention.clear();
    this.cohorts.clear();

    data.sessions.forEach((session) => {
      this.sessions.set(session.sessionId, session);
    });

    data.playerRetention.forEach((retention) => {
      this.playerRetention.set(retention.playerId, retention);
    });

    data.cohorts.forEach((cohort) => {
      this.cohorts.set(cohort.cohortDate, cohort);
    });

    if (data.config) {
      this.config = { ...this.config, ...data.config };
    }
  }
}

/**
 * Create a new retention system
 */
export function createRetentionSystem(config?: Partial<RetentionConfig>): RetentionSystem {
  return new RetentionSystem(config);
}

/**
 * Global retention instance
 */
let globalRetention: RetentionSystem | null = null;

/**
 * Get or create global retention instance
 */
export function getRetention(): RetentionSystem {
  if (!globalRetention) {
    globalRetention = createRetentionSystem();
  }
  return globalRetention;
}

/**
 * Set global retention instance
 */
export function setRetention(system: RetentionSystem): void {
  globalRetention = system;
}

/**
 * Convenience functions
 */
export const addSession = (session: Omit<PlayerSession, 'date' | 'duration'>): PlayerSession => {
  return getRetention().addSession(session);
};

export const endRetentionSession = (sessionId: string, endTime: number): PlayerSession | null => {
  return getRetention().endSession(sessionId, endTime);
};

export const getPlayerRetention = (playerId: number): PlayerRetention | null => {
  return getRetention().getPlayerRetention(playerId);
};

export const getMetrics = (): RetentionMetrics => {
  return getRetention().getMetrics();
};

export const getRetentionRate = (period: RetentionPeriod): number => {
  return getRetention().getRetentionRate(period);
};

export const getRetentionCurve = (days?: number): Array<{ day: number; rate: number; count: number }> => {
  return getRetention().getRetentionCurve(days);
};

export const getDAU = (date?: string): number => {
  return getRetention().getDAU(date);
};

export const getWAU = (): number => {
  return getRetention().getWAU();
};

export const getMAU = (): number => {
  return getRetention().getMAU();
};

export const getStickiness = (): number => {
  return getRetention().getStickiness();
};
