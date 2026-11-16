import { describe, it, expect, beforeEach } from 'vitest';
import {
  ABTestingSystem,
  createABTestingSystem,
  DEFAULT_AB_TESTING_CONFIG,
  type Experiment,
} from '../src/abTesting';

describe('abTesting', () => {
  let system: ABTestingSystem;

  // Simple test experiment
  const testExperiment: Experiment = {
    id: 'test_exp',
    name: 'Test Experiment',
    description: 'For testing',
    active: true,
    startDate: '2020-01-01',
    endDate: null,
    variants: [
      { name: 'control', description: 'Control', weight: 0.5, isControl: true },
      { name: 'variant_a', description: 'Variant A', weight: 0.5, isControl: false },
    ],
    targeting: {},
    primaryMetric: 'conversion',
    secondaryMetrics: [],
  };

  beforeEach(() => {
    system = createABTestingSystem();
    system.addExperiment(testExperiment);
  });

  describe('ABTestingSystem', () => {
    describe('constructor', () => {
      it('creates with default config', () => {
        expect(system).toBeInstanceOf(ABTestingSystem);
      });
    });

    describe('getExperiment', () => {
      it('returns experiment by ID', () => {
        const experiment = system.getExperiment('test_exp');
        expect(experiment).not.toBeNull();
        expect(experiment?.id).toBe('test_exp');
      });

      it('returns null for non-existent experiment', () => {
        const experiment = system.getExperiment('nonexistent');
        expect(experiment).toBeNull();
      });
    });

    describe('assignVariant', () => {
      it('assigns variant to player', () => {
        const assignment = system.assignVariant(1, 'test_exp');
        expect(assignment).not.toBeNull();
        expect(assignment?.experimentId).toBe('test_exp');
        expect(['control', 'variant_a']).toContain(assignment?.variant);
      });

      it('returns same variant for same player', () => {
        const assignment1 = system.assignVariant(1, 'test_exp');
        const assignment2 = system.assignVariant(1, 'test_exp');
        expect(assignment1?.variant).toBe(assignment2?.variant);
      });

      it('returns null for non-existent experiment', () => {
        const assignment = system.assignVariant(1, 'nonexistent');
        expect(assignment).toBeNull();
      });
    });

    describe('getVariant', () => {
      it('returns variant for player', () => {
        system.assignVariant(1, 'test_exp');
        const variant = system.getVariant(1, 'test_exp');
        expect(['control', 'variant_a']).toContain(variant);
      });

      it('returns null for non-existent experiment', () => {
        const variant = system.getVariant(1, 'nonexistent');
        expect(variant).toBeNull();
      });
    });

    describe('isControl', () => {
      it('returns true for control variant', () => {
        system.assignVariant(1, 'test_exp');
        const assignment = system.getPlayerAssignments(1)[0];
        if (assignment.variant === 'control') {
          expect(system.isControl(1, 'test_exp')).toBe(true);
        }
      });

      it('returns false for non-control variant', () => {
        system.assignVariant(1, 'test_exp');
        const assignment = system.getPlayerAssignments(1)[0];
        if (assignment.variant !== 'control') {
          expect(system.isControl(1, 'test_exp')).toBe(false);
        }
      });
    });

    describe('getPlayerAssignments', () => {
      it('returns all assignments for player', () => {
        system.assignVariant(1, 'test_exp');
        const assignments = system.getPlayerAssignments(1);
        expect(assignments.length).toBe(1);
      });

      it('returns empty array for player with no assignments', () => {
        const assignments = system.getPlayerAssignments(999);
        expect(assignments.length).toBe(0);
      });
    });

    describe('resetPlayer', () => {
      it('clears assignments for player', () => {
        system.assignVariant(1, 'test_exp');
        system.resetPlayer(1);
        const assignments = system.getPlayerAssignments(1);
        expect(assignments.length).toBe(0);
      });
    });

    describe('export/import', () => {
      it('exports data', () => {
        system.assignVariant(1, 'test_exp');
        const exported = system.export();
        expect(exported.experiments.length).toBeGreaterThan(0);
        expect(exported.assignments[1]).toBeDefined();
      });

      it('imports data', () => {
        system.assignVariant(1, 'test_exp');
        const exported = system.export();
        const newSystem = createABTestingSystem();
        newSystem.import(exported);
        expect(newSystem.getPlayerAssignments(1).length).toBe(1);
      });
    });
  });

  describe('DEFAULT_AB_TESTING_CONFIG', () => {
    it('has expected default values', () => {
      expect(DEFAULT_AB_TESTING_CONFIG.enabled).toBe(true);
      expect(DEFAULT_AB_TESTING_CONFIG.consistentHashing).toBe(true);
      expect(DEFAULT_AB_TESTING_CONFIG.storagePrefix).toBe('balda_ab_');
      expect(DEFAULT_AB_TESTING_CONFIG.autoEnroll).toBe(true);
    });
  });
});
