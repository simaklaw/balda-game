import { describe, it, expect, beforeEach } from 'vitest';
import {
  AntiCheatSystem,
  createAntiCheatSystem,
  MoveTelemetryCollector,
  DEFAULT_ANTI_CHEAT_CONFIG,
  type MoveTelemetry,
  type MoveInput,
} from '../src/antiCheat';

describe('antiCheat', () => {
  describe('AntiCheatSystem', () => {
    let system: AntiCheatSystem;

    beforeEach(() => {
      system = createAntiCheatSystem();
    });

    describe('constructor', () => {
      it('creates with default config', () => {
        expect(system).toBeInstanceOf(AntiCheatSystem);
      });

      it('accepts custom config', () => {
        const customSystem = createAntiCheatSystem({
          minMoveTime: 1000,
          suspicionThreshold: 0.5,
        });
        expect(customSystem).toBeInstanceOf(AntiCheatSystem);
      });
    });

    describe('checkMove', () => {
      const baseMove: MoveInput = {
        letter: 'А',
        cell: { row: 0, col: 0 },
        path: [{ row: 0, col: 0 }],
      };

      const baseTelemetry: MoveTelemetry = {
        timestamp: Date.now(),
        pathSelectionTime: 500,
        letterSelectionTime: 200,
        totalTime: 1000,
        movementHash: 'abc123',
        pathCorrections: 0,
      };

      it('allows normal moves', () => {
        const result = system.checkMove(0, baseMove, baseTelemetry);
        expect(result.legitimate).toBe(true);
        expect(result.action).toBe('ALLOW');
        expect(result.suspicion).toBe(0);
      });

      it('flags too fast moves', () => {
        const fastTelemetry: MoveTelemetry = {
          ...baseTelemetry,
          totalTime: 100, // Too fast
        };
        const result = system.checkMove(0, baseMove, fastTelemetry);
        expect(result.legitimate).toBe(false);
        expect(result.reason).toBe('TOO_FAST');
        expect(result.suspicion).toBeGreaterThan(0);
      });

      it('flags too slow moves', () => {
        const slowTelemetry: MoveTelemetry = {
          ...baseTelemetry,
          totalTime: 40000, // Too slow
        };
        const result = system.checkMove(0, baseMove, slowTelemetry);
        expect(result.legitimate).toBe(false);
        expect(result.reason).toBe('TOO_SLOW');
      });

      it('flags fast path selection', () => {
        const fastPathTelemetry: MoveTelemetry = {
          ...baseTelemetry,
          pathSelectionTime: 50, // Too fast
          totalTime: 1000,
        };
        const result = system.checkMove(0, baseMove, fastPathTelemetry);
        expect(result.legitimate).toBe(false);
        expect(result.reason).toBe('PATH_TOO_FAST');
      });

      it('flags fast letter selection', () => {
        const fastLetterTelemetry: MoveTelemetry = {
          ...baseTelemetry,
          letterSelectionTime: 10, // Too fast
          totalTime: 1000,
        };
        const result = system.checkMove(0, baseMove, fastLetterTelemetry);
        expect(result.legitimate).toBe(false);
        expect(result.reason).toBe('LETTER_TOO_FAST');
      });

      it('allows moves without telemetry', () => {
        const result = system.checkMove(0, baseMove, null);
        expect(result.legitimate).toBe(true);
      });

      it('blocks moves with high suspicion', () => {
        // Create a system with very strict settings
        const strictSystem = createAntiCheatSystem({
          minMoveTime: 2000,
          suspicionThreshold: 0.5,
        });

        const fastTelemetry: MoveTelemetry = {
          ...baseTelemetry,
          totalTime: 100,
        };

        const result = strictSystem.checkMove(0, baseMove, fastTelemetry);
        expect(result.action).toBe('WARN');
      });

      it('tracks suspicious moves per player', () => {
        const fastTelemetry: MoveTelemetry = {
          ...baseTelemetry,
          totalTime: 100,
        };

        // Make multiple suspicious moves
        for (let i = 0; i < 6; i++) {
          system.checkMove(0, baseMove, fastTelemetry);
        }

        const profile = system.getPlayerProfile(0);
        expect(profile?.suspiciousCount).toBeGreaterThanOrEqual(1);
      });
    });

    describe('recordTelemetry', () => {
      it('creates profile for new player', () => {
        const telemetry: MoveTelemetry = {
          timestamp: Date.now(),
          pathSelectionTime: 500,
          letterSelectionTime: 200,
          totalTime: 1000,
          movementHash: 'abc123',
          pathCorrections: 0,
        };

        system.recordTelemetry(0, telemetry);
        const profile = system.getPlayerProfile(0);

        expect(profile).not.toBeNull();
        expect(profile?.moveCount).toBe(1);
        expect(profile?.lastMoveTime).toBe(telemetry.timestamp);
      });

      it('updates existing profile', () => {
        const telemetry1: MoveTelemetry = {
          timestamp: 1000,
          pathSelectionTime: 500,
          letterSelectionTime: 200,
          totalTime: 1000,
          movementHash: 'abc123',
          pathCorrections: 0,
        };

        const telemetry2: MoveTelemetry = {
          timestamp: 2000,
          pathSelectionTime: 600,
          letterSelectionTime: 300,
          totalTime: 1500,
          movementHash: 'def456',
          pathCorrections: 1,
        };

        system.recordTelemetry(0, telemetry1);
        system.recordTelemetry(0, telemetry2);

        const profile = system.getPlayerProfile(0);
        expect(profile?.moveCount).toBe(2);
        expect(profile?.lastMoveTime).toBe(2000);
      });
    });

    describe('addToShadowPool', () => {
      it('adds entries to shadow pool', () => {
        const telemetry: MoveTelemetry = {
          timestamp: Date.now(),
          pathSelectionTime: 500,
          letterSelectionTime: 200,
          totalTime: 1000,
          movementHash: 'abc123',
          pathCorrections: 0,
        };

        const move: MoveInput = {
          letter: 'А',
          cell: { row: 0, col: 0 },
          path: [{ row: 0, col: 0 }],
        };

        system.addToShadowPool(0, move, telemetry);
        const stats = system.getStats();
        expect(stats.shadowPoolSize).toBe(1);
      });

      it('limits shadow pool size', () => {
        const smallPoolSystem = createAntiCheatSystem({
          shadowPoolSize: 5,
        });

        const telemetry: MoveTelemetry = {
          timestamp: Date.now(),
          pathSelectionTime: 500,
          letterSelectionTime: 200,
          totalTime: 1000,
          movementHash: 'abc123',
          pathCorrections: 0,
        };

        const move: MoveInput = {
          letter: 'А',
          cell: { row: 0, col: 0 },
          path: [{ row: 0, col: 0 }],
        };

        // Add more than pool size
        for (let i = 0; i < 10; i++) {
          smallPoolSystem.addToShadowPool(0, move, telemetry);
        }

        const stats = smallPoolSystem.getStats();
        expect(stats.shadowPoolSize).toBe(5);
      });
    });

    describe('reset', () => {
      it('clears all data', () => {
        const telemetry: MoveTelemetry = {
          timestamp: Date.now(),
          pathSelectionTime: 500,
          letterSelectionTime: 200,
          totalTime: 1000,
          movementHash: 'abc123',
          pathCorrections: 0,
        };

        const move: MoveInput = {
          letter: 'А',
          cell: { row: 0, col: 0 },
          path: [{ row: 0, col: 0 }],
        };

        system.recordTelemetry(0, telemetry);
        system.addToShadowPool(0, move, telemetry);

        system.reset();

        const stats = system.getStats();
        expect(stats.totalPlayers).toBe(0);
        expect(stats.shadowPoolSize).toBe(0);
      });
    });

    describe('generateMovementHash', () => {
      it('generates consistent hash for same path', () => {
        const path = [
          { row: 0, col: 0 },
          { row: 0, col: 1 },
          { row: 1, col: 1 },
        ];

        const hash1 = system.generateMovementHash(path);
        const hash2 = system.generateMovementHash(path);

        expect(hash1).toBe(hash2);
      });

      it('generates different hash for different paths', () => {
        const path1 = [{ row: 0, col: 0 }];
        const path2 = [{ row: 0, col: 1 }];

        const hash1 = system.generateMovementHash(path1);
        const hash2 = system.generateMovementHash(path2);

        expect(hash1).not.toBe(hash2);
      });
    });

    describe('getStats', () => {
      it('returns correct statistics', () => {
        const telemetry: MoveTelemetry = {
          timestamp: Date.now(),
          pathSelectionTime: 500,
          letterSelectionTime: 200,
          totalTime: 1000,
          movementHash: 'abc123',
          pathCorrections: 0,
        };

        const move: MoveInput = {
          letter: 'А',
          cell: { row: 0, col: 0 },
          path: [{ row: 0, col: 0 }],
        };

        // Add some data
        system.recordTelemetry(0, telemetry);
        system.recordTelemetry(1, telemetry);
        system.addToShadowPool(0, move, telemetry);

        const stats = system.getStats();
        expect(stats.totalPlayers).toBe(2);
        expect(stats.shadowPoolSize).toBe(1);
      });
    });
  });

  describe('MoveTelemetryCollector', () => {
    let collector: MoveTelemetryCollector;

    beforeEach(() => {
      collector = new MoveTelemetryCollector();
    });

    describe('start and complete', () => {
      it('tracks move time', () => {
        collector.start();
        // Simulate some delay
        collector.addPathCell({ row: 0, col: 0 });
        collector.addPathCell({ row: 0, col: 1 });
        const telemetry = collector.complete();

        expect(telemetry.totalTime).toBeGreaterThanOrEqual(0);
        expect(telemetry.pathCorrections).toBe(0);
      });

      it('tracks path selection time', () => {
        collector.start();
        collector.startPathSelection();
        collector.addPathCell({ row: 0, col: 0 });
        collector.startLetterSelection();
        const telemetry = collector.complete();

        expect(telemetry.pathSelectionTime).toBeGreaterThanOrEqual(0);
        expect(telemetry.letterSelectionTime).toBeGreaterThanOrEqual(0);
      });

      it('tracks corrections', () => {
        collector.start();
        collector.addPathCell({ row: 0, col: 0 });
        collector.recordCorrection();
        collector.recordCorrection();
        const telemetry = collector.complete();

        expect(telemetry.pathCorrections).toBe(2);
      });

      it('generates movement hash', () => {
        collector.start();
        collector.addPathCell({ row: 0, col: 0 });
        collector.addPathCell({ row: 1, col: 1 });
        const telemetry = collector.complete();

        expect(telemetry.movementHash).toBeTruthy();
        expect(telemetry.movementHash.length).toBeGreaterThan(0);
      });
    });
  });

  describe('DEFAULT_ANTI_CHEAT_CONFIG', () => {
    it('has expected default values', () => {
      expect(DEFAULT_ANTI_CHEAT_CONFIG.minMoveTime).toBe(500);
      expect(DEFAULT_ANTI_CHEAT_CONFIG.maxMoveTime).toBe(30000);
      expect(DEFAULT_ANTI_CHEAT_CONFIG.minPathSelectionTime).toBe(200);
      expect(DEFAULT_ANTI_CHEAT_CONFIG.minLetterSelectionTime).toBe(100);
      expect(DEFAULT_ANTI_CHEAT_CONFIG.suspicionThreshold).toBe(0.7);
      expect(DEFAULT_ANTI_CHEAT_CONFIG.maxSuspiciousMoves).toBe(5);
      expect(DEFAULT_ANTI_CHEAT_CONFIG.shadowPoolSize).toBe(100);
      expect(DEFAULT_ANTI_CHEAT_CONFIG.enableBehavioral).toBe(true);
      expect(DEFAULT_ANTI_CHEAT_CONFIG.enableShadowPool).toBe(true);
    });
  });
});
