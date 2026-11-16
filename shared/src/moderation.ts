/**
 * Word moderation system for Balda game
 * Crowdsourcing complaints and moderation of words
 */

/**
 * Reason for reporting a word
 */
export type ReportReason = 
  | 'offensive'
  | 'not_a_word'
  | 'proper_noun'
  | 'foreign'
  | 'duplicate'
  | 'other';

/**
 * Report status
 */
export type ReportStatus = 'pending' | 'approved' | 'rejected' | 'resolved';

/**
 * Word report
 */
export interface WordReport {
  /** Unique report ID */
  id: string;
  /** The word being reported */
  word: string;
  /** Reason for report */
  reason: ReportReason;
  /** Additional comment */
  comment: string | null;
  /** Player ID who reported */
  reporterId: number;
  /** Player name who reported */
  reporterName: string;
  /** Game ID where the word was used */
  gameId: string | null;
  /** Timestamp */
  timestamp: number;
  /** Status */
  status: ReportStatus;
  /** Moderator ID who resolved */
  moderatorId: number | null;
  /** Resolution timestamp */
  resolvedAt: number | null;
}

/**
 * Word moderation status
 */
export interface WordModeration {
  /** The word */
  word: string;
  /** Whether word is approved */
  approved: boolean;
  /** Whether word is banned */
  banned: boolean;
  /** Number of reports */
  reportCount: number;
  /** Last report timestamp */
  lastReportedAt: number | null;
  /** Moderation notes */
  notes: string[];
}

/**
 * Moderation statistics
 */
export interface ModerationStats {
  totalReports: number;
  pendingReports: number;
  approvedReports: number;
  rejectedReports: number;
  bannedWords: number;
  totalModeratedWords: number;
}

/**
 * Report filtering options
 */
export interface ReportFilter {
  status?: ReportStatus;
  reason?: ReportReason;
  word?: string;
  reporterId?: number;
  limit?: number;
  offset?: number;
}

/**
 * Moderation configuration
 */
export interface ModerationConfig {
  /** Minimum reports to auto-flag a word */
  autoFlagThreshold: number;
  /** Minimum reports to auto-ban a word */
  autoBanThreshold: number;
  /** Report expiration time in days */
  reportExpirationDays: number;
  /** Enable auto-moderation */
  enableAutoModeration: boolean;
  /** Enable crowdsourcing */
  enableCrowdsourcing: boolean;
}

/**
 * Default moderation configuration
 */
export const DEFAULT_MODERATION_CONFIG: ModerationConfig = {
  autoFlagThreshold: 3,
  autoBanThreshold: 10,
  reportExpirationDays: 30,
  enableAutoModeration: true,
  enableCrowdsourcing: true,
};

/**
 * Reason labels for display
 */
export const REPORT_REASON_LABELS: Record<ReportReason, string> = {
  offensive: 'Оскорбительное',
  not_a_word: 'Не слово',
  proper_noun: 'Имя собственное',
  foreign: 'Иностранное',
  duplicate: 'Дубликат',
  other: 'Другое',
};

/**
 * Moderation system
 */
export class ModerationSystem {
  private readonly config: ModerationConfig;
  private reports: Map<string, WordReport> = new Map();
  private moderation: Map<string, WordModeration> = new Map();
  private reportCounter: number = 0;

  constructor(config: Partial<ModerationConfig> = {}) {
    this.config = { ...DEFAULT_MODERATION_CONFIG, ...config };
  }

  /**
   * Generate unique report ID
   */
  private generateReportId(): string {
    this.reportCounter++;
    return `report_${Date.now()}_${this.reportCounter}`;
  }

  /**
   * Submit a word report
   */
  submitReport(
    word: string,
    reason: ReportReason,
    reporterId: number,
    reporterName: string,
    comment: string | null = null,
    gameId: string | null = null,
  ): WordReport {
    if (!this.config.enableCrowdsourcing) {
      throw new Error('Crowdsourcing is disabled');
    }

    const report: WordReport = {
      id: this.generateReportId(),
      word: word.toLowerCase(),
      reason,
      comment,
      reporterId,
      reporterName,
      gameId,
      timestamp: Date.now(),
      status: 'pending',
      moderatorId: null,
      resolvedAt: null,
    };

    this.reports.set(report.id, report);

    // Update moderation status for the word
    this.updateWordModeration(report);

    // Auto-moderation
    if (this.config.enableAutoModeration) {
      this.autoModerate(report);
    }

    return report;
  }

  /**
   * Update word moderation status based on report
   */
  private updateWordModeration(report: WordReport): void {
    const word = report.word;
    let mod = this.moderation.get(word);

    if (!mod) {
      mod = {
        word,
        approved: true,
        banned: false,
        reportCount: 0,
        lastReportedAt: null,
        notes: [],
      };
      this.moderation.set(word, mod);
    }

    mod.reportCount++;
    mod.lastReportedAt = report.timestamp;

    // Add note about the report
    mod.notes.push(`Report #${report.id}: ${report.reason} by player ${report.reporterId}`);
  }

  /**
   * Auto-moderate based on thresholds
   */
  private autoModerate(report: WordReport): void {
    const word = report.word;
    const mod = this.moderation.get(word);
    if (!mod) return;

    // Auto-ban if threshold reached
    if (mod.reportCount >= this.config.autoBanThreshold) {
      mod.banned = true;
      mod.approved = false;
      mod.notes.push(`Auto-banned: ${mod.reportCount} reports reached threshold`);
    }

    // Auto-flag if threshold reached
    if (mod.reportCount >= this.config.autoFlagThreshold) {
      mod.notes.push(`Auto-flagged: ${mod.reportCount} reports reached flag threshold`);
    }
  }

  /**
   * Resolve a report
   */
  resolveReport(
    reportId: string,
    moderatorId: number,
    status: 'approved' | 'rejected' | 'resolved',
  ): WordReport | null {
    const report = this.reports.get(reportId);
    if (!report) return null;

    report.status = status as ReportStatus;
    report.moderatorId = moderatorId;
    report.resolvedAt = Date.now();

    // Update word moderation based on resolution
    const mod = this.moderation.get(report.word);
    if (mod) {
      if (status === 'approved') {
        mod.notes.push(`Report #${reportId} approved by moderator ${moderatorId}`);
      } else if (status === 'rejected') {
        mod.notes.push(`Report #${reportId} rejected by moderator ${moderatorId}`);
      }
    }

    return report;
  }

  /**
   * Ban a word
   */
  banWord(word: string, moderatorId: number, reason: string): boolean {
    const normalizedWord = word.toLowerCase();
    let mod = this.moderation.get(normalizedWord);

    if (!mod) {
      mod = {
        word: normalizedWord,
        approved: false,
        banned: true,
        reportCount: 0,
        lastReportedAt: null,
        notes: [],
      };
      this.moderation.set(normalizedWord, mod);
    }

    mod.banned = true;
    mod.approved = false;
    mod.notes.push(`Banned by moderator ${moderatorId}: ${reason}`);

    // Mark all pending reports for this word as resolved
    for (const [, report] of this.reports) {
      if (report.word === normalizedWord && report.status === 'pending') {
        report.status = 'resolved';
        report.moderatorId = moderatorId;
        report.resolvedAt = Date.now();
      }
    }

    return true;
  }

  /**
   * Approve a word (remove ban)
   */
  approveWord(word: string, moderatorId: number, reason: string): boolean {
    const normalizedWord = word.toLowerCase();
    const mod = this.moderation.get(normalizedWord);

    if (!mod) return false;

    mod.banned = false;
    mod.approved = true;
    mod.notes.push(`Approved by moderator ${moderatorId}: ${reason}`);

    return true;
  }

  /**
   * Get report by ID
   */
  getReport(reportId: string): WordReport | null {
    return this.reports.get(reportId) ?? null;
  }

  /**
   * Get all reports with filtering
   */
  getReports(filter: ReportFilter = {}): WordReport[] {
    let reports = Array.from(this.reports.values());

    if (filter.status) {
      reports = reports.filter((r) => r.status === filter.status);
    }

    if (filter.reason) {
      reports = reports.filter((r) => r.reason === filter.reason);
    }

    if (filter.word) {
      reports = reports.filter((r) => r.word.toLowerCase().includes(filter.word?.toLowerCase() ?? ''));
    }

    if (filter.reporterId !== undefined) {
      reports = reports.filter((r) => r.reporterId === filter.reporterId);
    }

    // Sort by timestamp (newest first)
    reports.sort((a, b) => b.timestamp - a.timestamp);

    // Apply pagination
    const limit = filter.limit ?? reports.length;
    const offset = filter.offset ?? 0;
    return reports.slice(offset, offset + limit);
  }

  /**
   * Get reports for a specific word
   */
  getReportsForWord(word: string): WordReport[] {
    const normalizedWord = word.toLowerCase();
    return this.getReports({ word: normalizedWord });
  }

  /**
   * Get moderation status for a word
   */
  getWordModeration(word: string): WordModeration | null {
    const normalizedWord = word.toLowerCase();
    return this.moderation.get(normalizedWord) ?? null;
  }

  /**
   * Check if word is banned
   */
  isBanned(word: string): boolean {
    const normalizedWord = word.toLowerCase();
    const mod = this.moderation.get(normalizedWord);
    return mod?.banned ?? false;
  }

  /**
   * Check if word is approved
   */
  isApproved(word: string): boolean {
    const normalizedWord = word.toLowerCase();
    const mod = this.moderation.get(normalizedWord);
    return mod?.approved ?? true; // Default to approved if not moderated
  }

  /**
   * Get pending reports count
   */
  getPendingCount(): number {
    return this.getReports({ status: 'pending' }).length;
  }

  /**
   * Get statistics
   */
  getStats(): ModerationStats {
    const allReports = Array.from(this.reports.values());
    const pending = allReports.filter((r) => r.status === 'pending').length;
    const approved = allReports.filter((r) => r.status === 'approved').length;
    const rejected = allReports.filter((r) => r.status === 'rejected').length;
    allReports.filter((r) => r.status === 'resolved');

    const bannedWords = Array.from(this.moderation.values())
      .filter((m) => m.banned)
      .length;

    return {
      totalReports: allReports.length,
      pendingReports: pending,
      approvedReports: approved,
      rejectedReports: rejected,
      bannedWords,
      totalModeratedWords: this.moderation.size,
    };
  }

  /**
   * Get top reported words
   */
  getTopReportedWords(limit: number = 10): Array<{ word: string; count: number }> {
    const wordCounts = Array.from(this.moderation.values())
      .map((m) => ({ word: m.word, count: m.reportCount }))
      .filter((w) => w.count > 0)
      .sort((a, b) => b.count - a.count);

    return wordCounts.slice(0, limit);
  }

  /**
   * Get reports by reporter
   */
  getReportsByReporter(reporterId: number): WordReport[] {
    return this.getReports({ reporterId });
  }

  /**
   * Delete a report
   */
  deleteReport(reportId: string, _moderatorId: number): boolean {
    const report = this.reports.get(reportId);
    if (!report) return false;

    this.reports.delete(reportId);
    return true;
  }

  /**
   * Clean up expired reports
   */
  cleanupExpiredReports(): number {
    const expirationMs = this.config.reportExpirationDays * 24 * 60 * 60 * 1000;
    const now = Date.now();
    const expiredReports: string[] = [];

    for (const [id, report] of this.reports) {
      if (now - report.timestamp > expirationMs && report.status === 'pending') {
        expiredReports.push(id);
      }
    }

    expiredReports.forEach((id) => this.reports.delete(id));
    return expiredReports.length;
  }

  /**
   * Export all data for storage
   */
  export(): {
    reports: WordReport[];
    moderation: WordModeration[];
    config: ModerationConfig;
  } {
    return {
      reports: Array.from(this.reports.values()),
      moderation: Array.from(this.moderation.values()),
      config: this.config,
    };
  }

  /**
   * Import data from storage
   */
  import(data: {
    reports: WordReport[];
    moderation: WordModeration[];
    config?: Partial<ModerationConfig>;
  }): void {
    this.reports.clear();
    this.moderation.clear();

    data.reports.forEach((report) => {
      this.reports.set(report.id, report);
      if (this.reportCounter <= parseInt(report.id.split('_').pop() ?? '0')) {
        this.reportCounter = parseInt(report.id.split('_').pop() ?? '0') + 1;
      }
    });

    data.moderation.forEach((mod) => {
      this.moderation.set(mod.word, mod);
    });

    // Note: config is readonly, so we can't modify it after construction
    // In a real implementation, we'd need to handle this differently
    // For now, just ignore the imported config
  }

  /**
   * Reset the system
   */
  reset(): void {
    this.reports.clear();
    this.moderation.clear();
    this.reportCounter = 0;
  }
}

/**
 * Create a new moderation system
 */
export function createModerationSystem(config?: Partial<ModerationConfig>): ModerationSystem {
  return new ModerationSystem(config);
}
