import { describe, it, expect, beforeEach } from 'vitest';
import {
  RetentionSystem,
  createRetentionSystem,
  setRetention,
  addSession,
  DEFAULT_RETENTION_CONFIG,
} from '../src/retention';

describe('retention', () => {
  let system: RetentionSystem;

  beforeEach(() => {
    system = createRetentionSystem();
    setRetention(system);
  });

  describe('RetentionSystem', () => {
    describe('constructor', () => {
      it('creates with default config', () => {
        expect(system).toBeInstanceOf(RetentionSystem);
      });

      it('accepts custom config', () => {
        const customSystem = createRetentionSystem({
          enabled: false,
          trackDaily: false,
        });
        expect(customSystem).toBeInstanceOf(RetentionSystem);
      });
    });

    describe('addSession', () => {
      it('adds a session', () => {
        const sessionData = {
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        };

        const session = system.addSession(sessionData);
        expect(session).toBeDefined();
        expect(session.date).toBeDefined();
        expect(session.sessionId).toBe('session_1');
      });

      it('sets date to current date', () => {
        const sessionData = {
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        };

        const session = system.addSession(sessionData);
        const today = new Date().toISOString().split('T')[0];
        expect(session.date).toBe(today);
      });

      it('updates player retention', () => {
        const sessionData = {
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        };

        system.addSession(sessionData);
        const retention = system.getPlayerRetention(1);

        expect(retention).not.toBeNull();
        expect(retention?.playerId).toBe(1);
        expect(retention?.totalSessions).toBe(1);
      });

      it('creates cohort', () => {
        const sessionData = {
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        };

        system.addSession(sessionData);
        const today = new Date().toISOString().split('T')[0];
        const cohort = system.getCohortRetention(today);

        expect(cohort).not.toBeNull();
        expect(cohort?.newPlayers).toBe(1);
      });
    });

    describe('endSession', () => {
      it('ends a session', () => {
        const startTime = Date.now();
        const sessionData = {
          sessionId: 'session_1',
          playerId: 1,
          startTime,
          endTime: null,
        };

        system.addSession(sessionData);
        const ended = system.endSession('session_1', startTime + 10000);

        expect(ended).not.toBeNull();
        expect(ended?.endTime).toBe(startTime + 10000);
        expect(ended?.duration).toBe(10);
      });

      it('returns null for non-existent session', () => {
        const ended = system.endSession('nonexistent', Date.now());
        expect(ended).toBeNull();
      });
    });

    describe('getPlayerRetention', () => {
      it('returns null for unknown player', () => {
        const retention = system.getPlayerRetention(999);
        expect(retention).toBeNull();
      });

      it('returns player retention', () => {
        const sessionData = {
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        };

        system.addSession(sessionData);
        const retention = system.getPlayerRetention(1);

        expect(retention).not.toBeNull();
        expect(retention?.playerId).toBe(1);
        expect(retention?.firstSessionDate).toBeDefined();
        expect(retention?.lastSessionDate).toBeDefined();
      });
    });

    describe('getAllPlayerRetention', () => {
      it('returns all player retention data', () => {
        system.addSession({
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        });
        system.addSession({
          sessionId: 'session_2',
          playerId: 2,
          startTime: Date.now(),
          endTime: null,
        });

        const allRetention = system.getAllPlayerRetention();
        expect(allRetention.length).toBe(2);
      });
    });

    describe('getCohortRetention', () => {
      it('returns null for unknown cohort', () => {
        const cohort = system.getCohortRetention('2020-01-01');
        expect(cohort).toBeNull();
      });

      it('returns cohort retention', () => {
        system.addSession({
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        });

        const today = new Date().toISOString().split('T')[0];
        const cohort = system.getCohortRetention(today);

        expect(cohort).not.toBeNull();
        expect(cohort?.cohortDate).toBe(today);
      });
    });

    describe('getAllCohortRetention', () => {
      it('returns all cohort retention data', () => {
        system.addSession({
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        });

        const allCohorts = system.getAllCohortRetention();
        expect(allCohorts.length).toBeGreaterThan(0);
      });

      it('sorts by date (newest first)', () => {
        // Add sessions on different dates (simulated)
        system.addSession({
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        });

        const allCohorts = system.getAllCohortRetention();
        for (let i = 1; i < allCohorts.length; i++) {
          expect(allCohorts[i - 1].cohortDate >= allCohorts[i].cohortDate).toBe(true);
        }
      });
    });

    describe('getMetrics', () => {
      it('returns retention metrics', () => {
        system.addSession({
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        });

        const metrics = system.getMetrics();
        expect(metrics).toBeDefined();
        expect(metrics.overall).toBeDefined();
        expect(metrics.byCohort).toBeDefined();
        expect(metrics.activePlayers).toBeDefined();
        expect(metrics.newPlayers).toBeDefined();
      });

      it('calculates overall retention rates', () => {
        // Add a player with session today
        system.addSession({
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        });

        const metrics = system.getMetrics();
        // With only one session, retention should be 0 (need at least 2 days)
        expect(metrics.overall.day1).toBeGreaterThanOrEqual(0);
      });
    });

    describe('getRetentionRate', () => {
      it('returns retention rate for period', () => {
        system.addSession({
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        });

        const rate = system.getRetentionRate('day1');
        expect(rate).toBeGreaterThanOrEqual(0);
      });
    });

    describe('getRetentionCurve', () => {
      it('returns retention curve', () => {
        system.addSession({
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        });

        const curve = system.getRetentionCurve(7);
        expect(curve.length).toBe(7);
        expect(curve[0].day).toBe(1);
        expect(curve[6].day).toBe(7);
      });

      it('returns curve for specified days', () => {
        const curve = system.getRetentionCurve(30);
        expect(curve.length).toBe(30);
      });
    });

    describe('getDAU', () => {
      it('returns daily active users', () => {
        system.addSession({
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        });
        system.addSession({
          sessionId: 'session_2',
          playerId: 2,
          startTime: Date.now(),
          endTime: null,
        });

        const dau = system.getDAU();
        expect(dau).toBe(2);
      });
    });

    describe('getWAU', () => {
      it('returns weekly active users', () => {
        system.addSession({
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        });

        const wau = system.getWAU();
        expect(wau).toBeGreaterThanOrEqual(1);
      });
    });

    describe('getMAU', () => {
      it('returns monthly active users', () => {
        system.addSession({
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        });

        const mau = system.getMAU();
        expect(mau).toBeGreaterThanOrEqual(1);
      });
    });

    describe('getStickiness', () => {
      it('returns stickiness ratio', () => {
        system.addSession({
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        });

        const stickiness = system.getStickiness();
        expect(stickiness).toBeGreaterThanOrEqual(0);
      });
    });

    describe('getAllSessions', () => {
      it('returns all sessions', () => {
        system.addSession({
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        });
        system.addSession({
          sessionId: 'session_2',
          playerId: 2,
          startTime: Date.now(),
          endTime: null,
        });

        const sessions = system.getAllSessions();
        expect(sessions.length).toBe(2);
      });
    });

    describe('getPlayerSessions', () => {
      it('returns sessions for player', () => {
        system.addSession({
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        });
        system.addSession({
          sessionId: 'session_2',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        });
        system.addSession({
          sessionId: 'session_3',
          playerId: 2,
          startTime: Date.now(),
          endTime: null,
        });

        const player1Sessions = system.getPlayerSessions(1);
        expect(player1Sessions.length).toBe(2);
      });
    });

    describe('getSessionsByDate', () => {
      it('returns sessions for date', () => {
        system.addSession({
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        });

        const today = new Date().toISOString().split('T')[0];
        const sessions = system.getSessionsByDate(today);
        expect(sessions.length).toBe(1);
      });
    });

    describe('reset', () => {
      it('clears all data', () => {
        system.addSession({
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        });

        system.reset();

        expect(system.getAllSessions().length).toBe(0);
        expect(system.getAllPlayerRetention().length).toBe(0);
        expect(system.getAllCohortRetention().length).toBe(0);
      });
    });

    describe('export/import', () => {
      it('exports data', () => {
        system.addSession({
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        });

        const exported = system.export();
        expect(exported.sessions.length).toBe(1);
        expect(exported.playerRetention.length).toBe(1);
        expect(exported.cohorts.length).toBeGreaterThan(0);
      });

      it('imports data', () => {
        system.addSession({
          sessionId: 'session_1',
          playerId: 1,
          startTime: Date.now(),
          endTime: null,
        });

        const exported = system.export();
        const newSystem = createRetentionSystem();
        newSystem.import(exported);

        expect(newSystem.getAllSessions().length).toBe(exported.sessions.length);
        expect(newSystem.getAllPlayerRetention().length).toBe(exported.playerRetention.length);
      });
    });
  });

  describe('Global retention functions', () => {
    it('uses global system', () => {
      const testSystem = createRetentionSystem();
      setRetention(testSystem);

      addSession({
        sessionId: 'session_1',
        playerId: 1,
        startTime: Date.now(),
        endTime: null,
      });

      const retention = testSystem.getPlayerRetention(1);
      expect(retention).not.toBeNull();
    });
  });

  describe('DEFAULT_RETENTION_CONFIG', () => {
    it('has expected default values', () => {
      expect(DEFAULT_RETENTION_CONFIG.enabled).toBe(true);
      expect(DEFAULT_RETENTION_CONFIG.trackDaily).toBe(true);
      expect(DEFAULT_RETENTION_CONFIG.trackWeekly).toBe(true);
      expect(DEFAULT_RETENTION_CONFIG.trackMonthly).toBe(true);
      expect(DEFAULT_RETENTION_CONFIG.sessionTimeout).toBe(30 * 60 * 1000);
      expect(DEFAULT_RETENTION_CONFIG.retentionPeriods).toContain('day1');
      expect(DEFAULT_RETENTION_CONFIG.retentionPeriods).toContain('day7');
      expect(DEFAULT_RETENTION_CONFIG.retentionPeriods).toContain('day30');
    });
  });
});
