import { describe, it, expect, beforeEach } from 'vitest';
import {
  ModerationSystem,
  createModerationSystem,
  DEFAULT_MODERATION_CONFIG,
} from '../src/moderation';

describe('moderation', () => {
  describe('ModerationSystem', () => {
    let system: ModerationSystem;

    beforeEach(() => {
      system = createModerationSystem();
    });

    describe('constructor', () => {
      it('creates with default config', () => {
        expect(system).toBeInstanceOf(ModerationSystem);
      });

      it('accepts custom config', () => {
        const customSystem = createModerationSystem({
          autoFlagThreshold: 5,
          autoBanThreshold: 15,
        });
        expect(customSystem).toBeInstanceOf(ModerationSystem);
      });
    });

    describe('submitReport', () => {
      it('submits a report', () => {
        const report = system.submitReport(
          'тест',
          'not_a_word',
          1,
          'Player1',
          'This is not a valid word',
          'game_123',
        );

        expect(report).toBeDefined();
        expect(report.word).toBe('тест');
        expect(report.reason).toBe('not_a_word');
        expect(report.reporterId).toBe(1);
        expect(report.reporterName).toBe('Player1');
        expect(report.status).toBe('pending');
        expect(report.id).toBeTruthy();
      });

      it('normalizes word to lowercase', () => {
        const report = system.submitReport('ТЕСТ', 'not_a_word', 1, 'Player1');
        expect(report.word).toBe('тест');
      });

      it('throws when crowdsourcing disabled', () => {
        const disabledSystem = createModerationSystem({ enableCrowdsourcing: false });
        expect(() => {
          disabledSystem.submitReport('тест', 'not_a_word', 1, 'Player1');
        }).toThrow('Crowdsourcing is disabled');
      });

      it('increments report counter', () => {
        system.submitReport('тест', 'not_a_word', 1, 'Player1');
        system.submitReport('слово', 'offensive', 2, 'Player2');
        const stats = system.getStats();
        expect(stats.totalReports).toBe(2);
      });
    });

    describe('resolveReport', () => {
      it('resolves a report', () => {
        const report = system.submitReport('тест', 'not_a_word', 1, 'Player1');
        const resolved = system.resolveReport(report.id, 100, 'approved');

        expect(resolved).not.toBeNull();
        expect(resolved?.status).toBe('approved');
        expect(resolved?.moderatorId).toBe(100);
        expect(resolved?.resolvedAt).toBeDefined();
      });

      it('returns null for non-existent report', () => {
        const resolved = system.resolveReport('nonexistent', 100, 'approved');
        expect(resolved).toBeNull();
      });

      it('updates word moderation notes', () => {
        const report = system.submitReport('тест', 'not_a_word', 1, 'Player1');
        system.resolveReport(report.id, 100, 'approved');
        const mod = system.getWordModeration('тест');

        expect(mod?.notes).toContain(`Report #${report.id} approved by moderator 100`);
      });
    });

    describe('banWord', () => {
      it('bans a word', () => {
        const result = system.banWord('тест', 100, 'Offensive word');
        expect(result).toBe(true);
        expect(system.isBanned('тест')).toBe(true);
        expect(system.isApproved('тест')).toBe(false);
      });

      it('marks pending reports as resolved', () => {
        system.submitReport('тест', 'offensive', 1, 'Player1');
        system.banWord('тест', 100, 'Offensive');

        const reports = system.getReports({ word: 'тест' });
        expect(reports.every((r) => r.status === 'resolved')).toBe(true);
      });

      it('updates moderation notes', () => {
        system.banWord('тест', 100, 'Offensive');
        const mod = system.getWordModeration('тест');
        expect(mod?.notes).toContain('Banned by moderator 100: Offensive');
      });
    });

    describe('approveWord', () => {
      it('approves a banned word', () => {
        system.banWord('тест', 100, 'Mistake');
        const result = system.approveWord('тест', 101, 'Actually valid');

        expect(result).toBe(true);
        expect(system.isBanned('тест')).toBe(false);
        expect(system.isApproved('тест')).toBe(true);
      });

      it('returns false for non-existent word', () => {
        const result = system.approveWord('nonexistent', 100, 'Reason');
        expect(result).toBe(false);
      });
    });

    describe('getReport', () => {
      it('returns report by ID', () => {
        const report = system.submitReport('тест', 'not_a_word', 1, 'Player1');
        const retrieved = system.getReport(report.id);
        expect(retrieved).toEqual(report);
      });

      it('returns null for non-existent report', () => {
        const retrieved = system.getReport('nonexistent');
        expect(retrieved).toBeNull();
      });
    });

    describe('getReports', () => {
      it('returns all reports', () => {
        system.submitReport('тест1', 'not_a_word', 1, 'Player1');
        system.submitReport('тест2', 'offensive', 2, 'Player2');

        const reports = system.getReports();
        expect(reports.length).toBe(2);
      });

      it('filters by status', () => {
        system.submitReport('тест1', 'not_a_word', 1, 'Player1');
        const report2 = system.submitReport('тест2', 'offensive', 2, 'Player2');
        system.resolveReport(report2.id, 100, 'approved');

        const pending = system.getReports({ status: 'pending' });
        const approved = system.getReports({ status: 'approved' });

        expect(pending.length).toBe(1);
        expect(approved.length).toBe(1);
      });

      it('filters by reason', () => {
        system.submitReport('тест1', 'not_a_word', 1, 'Player1');
        system.submitReport('тест2', 'not_a_word', 2, 'Player2');
        system.submitReport('тест3', 'offensive', 3, 'Player3');

        const notWord = system.getReports({ reason: 'not_a_word' });
        expect(notWord.length).toBe(2);
      });

      it('filters by word', () => {
        system.submitReport('тест', 'not_a_word', 1, 'Player1');
        system.submitReport('тест', 'offensive', 2, 'Player2');
        system.submitReport('слово', 'not_a_word', 3, 'Player3');

        const testReports = system.getReports({ word: 'тест' });
        expect(testReports.length).toBe(2);
      });

      it('filters by reporter', () => {
        system.submitReport('тест1', 'not_a_word', 1, 'Player1');
        system.submitReport('тест2', 'not_a_word', 1, 'Player1');
        system.submitReport('тест3', 'not_a_word', 2, 'Player2');

        const player1Reports = system.getReports({ reporterId: 1 });
        expect(player1Reports.length).toBe(2);
      });

      it('applies pagination', () => {
        for (let i = 0; i < 10; i++) {
          system.submitReport(`word${i}`, 'not_a_word', i, `Player${i}`);
        }

        const page1 = system.getReports({ limit: 5, offset: 0 });
        const page2 = system.getReports({ limit: 5, offset: 5 });

        expect(page1.length).toBe(5);
        expect(page2.length).toBe(5);
      });

      it('sorts by timestamp (newest first)', () => {
        system.submitReport('тест1', 'not_a_word', 1, 'Player1');
        system.submitReport('тест2', 'not_a_word', 2, 'Player2');

        const reports = system.getReports();
        expect(reports[0].timestamp).toBeGreaterThanOrEqual(reports[1].timestamp);
      });
    });

    describe('getReportsForWord', () => {
      it('returns reports for specific word', () => {
        system.submitReport('тест', 'not_a_word', 1, 'Player1');
        system.submitReport('тест', 'offensive', 2, 'Player2');
        system.submitReport('слово', 'not_a_word', 3, 'Player3');

        const reports = system.getReportsForWord('тест');
        expect(reports.length).toBe(2);
        expect(reports.every((r) => r.word === 'тест')).toBe(true);
      });
    });

    describe('getWordModeration', () => {
      it('returns moderation status for word', () => {
        system.submitReport('тест', 'not_a_word', 1, 'Player1');
        const mod = system.getWordModeration('тест');

        expect(mod).not.toBeNull();
        expect(mod?.word).toBe('тест');
        expect(mod?.reportCount).toBe(1);
      });

      it('returns null for non-moderated word', () => {
        const mod = system.getWordModeration('nonexistent');
        expect(mod).toBeNull();
      });
    });

    describe('isBanned', () => {
      it('returns true for banned word', () => {
        system.banWord('тест', 100, 'Reason');
        expect(system.isBanned('тест')).toBe(true);
      });

      it('returns false for non-banned word', () => {
        expect(system.isBanned('тест')).toBe(false);
      });

      it('normalizes word to lowercase', () => {
        system.banWord('тест', 100, 'Reason');
        expect(system.isBanned('ТЕСТ')).toBe(true);
      });
    });

    describe('isApproved', () => {
      it('returns true for approved word', () => {
        expect(system.isApproved('тест')).toBe(true);
      });

      it('returns false for banned word', () => {
        system.banWord('тест', 100, 'Reason');
        expect(system.isApproved('тест')).toBe(false);
      });
    });

    describe('getPendingCount', () => {
      it('returns count of pending reports', () => {
        system.submitReport('тест1', 'not_a_word', 1, 'Player1');
        system.submitReport('тест2', 'not_a_word', 2, 'Player2');
        const report3 = system.submitReport('тест3', 'not_a_word', 3, 'Player3');
        system.resolveReport(report3.id, 100, 'approved');

        expect(system.getPendingCount()).toBe(2);
      });
    });

    describe('getStats', () => {
      it('returns correct statistics', () => {
        system.submitReport('тест1', 'not_a_word', 1, 'Player1');
        const report2 = system.submitReport('тест2', 'offensive', 2, 'Player2');
        system.resolveReport(report2.id, 100, 'approved');
        system.submitReport('тест3', 'not_a_word', 3, 'Player3');
        system.banWord('тест1', 100, 'Reason');

        const stats = system.getStats();
        expect(stats.totalReports).toBe(3);
        expect(stats.pendingReports).toBeGreaterThanOrEqual(1);
        expect(stats.approvedReports).toBe(1);
        expect(stats.bannedWords).toBe(1);
        expect(stats.totalModeratedWords).toBeGreaterThanOrEqual(1);
      });
    });

    describe('getTopReportedWords', () => {
      it('returns top reported words', () => {
        system.submitReport('тест1', 'not_a_word', 1, 'Player1');
        system.submitReport('тест1', 'offensive', 2, 'Player2');
        system.submitReport('тест1', 'not_a_word', 3, 'Player3');
        system.submitReport('тест2', 'not_a_word', 4, 'Player4');

        const top = system.getTopReportedWords(2);
        expect(top.length).toBe(2);
        expect(top[0].word).toBe('тест1');
        expect(top[0].count).toBe(3);
        expect(top[1].word).toBe('тест2');
        expect(top[1].count).toBe(1);
      });
    });

    describe('getReportsByReporter', () => {
      it('returns reports by reporter', () => {
        system.submitReport('тест1', 'not_a_word', 1, 'Player1');
        system.submitReport('тест2', 'not_a_word', 1, 'Player1');
        system.submitReport('тест3', 'not_a_word', 2, 'Player2');

        const reports = system.getReportsByReporter(1);
        expect(reports.length).toBe(2);
        expect(reports.every((r) => r.reporterId === 1)).toBe(true);
      });
    });

    describe('deleteReport', () => {
      it('deletes a report', () => {
        const report = system.submitReport('тест', 'not_a_word', 1, 'Player1');
        const result = system.deleteReport(report.id, 100);

        expect(result).toBe(true);
        expect(system.getReport(report.id)).toBeNull();
      });

      it('returns false for non-existent report', () => {
        const result = system.deleteReport('nonexistent', 100);
        expect(result).toBe(false);
      });
    });

    describe('cleanupExpiredReports', () => {
      it('cleans up expired pending reports', () => {
        const expiredSystem = createModerationSystem({
          reportExpirationDays: 0.0001, // Very short expiration
        });

        expiredSystem.submitReport('тест1', 'not_a_word', 1, 'Player1');
        const report2 = expiredSystem.submitReport('тест2', 'not_a_word', 2, 'Player2');
        expiredSystem.resolveReport(report2.id, 100, 'approved'); // This one is resolved

        // Wait a bit for expiration
        const count = expiredSystem.cleanupExpiredReports();
        expect(count).toBeGreaterThanOrEqual(0);
        expect(expiredSystem.getReports({ status: 'approved' }).length).toBe(1);
      });
    });

    describe('export/import', () => {
      it('exports data', () => {
        system.submitReport('тест', 'not_a_word', 1, 'Player1');
        system.banWord('тест', 100, 'Reason');

        const exported = system.export();
        expect(exported.reports.length).toBe(1);
        expect(exported.moderation.length).toBe(1);
      });

      it('imports data', () => {
        const exported = system.export();
        const newSystem = createModerationSystem();
        newSystem.import(exported);

        expect(newSystem.getStats().totalReports).toBe(exported.reports.length);
        expect(newSystem.getStats().totalModeratedWords).toBe(exported.moderation.length);
      });
    });

    describe('reset', () => {
      it('clears all data', () => {
        system.submitReport('тест', 'not_a_word', 1, 'Player1');
        system.banWord('тест', 100, 'Reason');

        system.reset();

        const stats = system.getStats();
        expect(stats.totalReports).toBe(0);
        expect(stats.totalModeratedWords).toBe(0);
      });
    });

    describe('auto-moderation', () => {
      it('auto-flags word when threshold reached', () => {
        const flagSystem = createModerationSystem({
          autoFlagThreshold: 2,
          enableAutoModeration: true,
        });

        flagSystem.submitReport('тест', 'not_a_word', 1, 'Player1');
        flagSystem.submitReport('тест', 'not_a_word', 2, 'Player2');

        const mod = flagSystem.getWordModeration('тест');
        expect(mod?.reportCount).toBe(2);
        expect(mod?.notes.length).toBeGreaterThan(0);
      });

      it('auto-bans word when threshold reached', () => {
        const banSystem = createModerationSystem({
          autoBanThreshold: 2,
          enableAutoModeration: true,
        });

        banSystem.submitReport('тест', 'not_a_word', 1, 'Player1');
        banSystem.submitReport('тест', 'not_a_word', 2, 'Player2');

        const mod = banSystem.getWordModeration('тест');
        expect(mod?.banned).toBe(true);
        expect(mod?.reportCount).toBe(2);
      });

      it('does not auto-moderate when disabled', () => {
        const disabledSystem = createModerationSystem({
          autoBanThreshold: 1,
          enableAutoModeration: false,
        });

        disabledSystem.submitReport('тест', 'not_a_word', 1, 'Player1');
        const mod = disabledSystem.getWordModeration('тест');
        expect(mod?.banned).toBe(false);
      });
    });
  });

  describe('DEFAULT_MODERATION_CONFIG', () => {
    it('has expected default values', () => {
      expect(DEFAULT_MODERATION_CONFIG.autoFlagThreshold).toBe(3);
      expect(DEFAULT_MODERATION_CONFIG.autoBanThreshold).toBe(10);
      expect(DEFAULT_MODERATION_CONFIG.reportExpirationDays).toBe(30);
      expect(DEFAULT_MODERATION_CONFIG.enableAutoModeration).toBe(true);
      expect(DEFAULT_MODERATION_CONFIG.enableCrowdsourcing).toBe(true);
    });
  });
});
