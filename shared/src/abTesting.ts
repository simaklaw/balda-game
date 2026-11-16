/**
 * A/B Testing system for Balda game
 * Feature flags, experiments, and user bucketing
 */

/**
 * Experiment variant
 */
export interface ExperimentVariant {
  /** Variant name */
  name: string;
  /** Variant description */
  description: string;
  /** Weight (0-1) */
  weight: number;
  /** Whether this is the control variant */
  isControl: boolean;
}

/**
 * A/B Test experiment
 */
export interface Experiment {
  /** Experiment ID */
  id: string;
  /** Experiment name */
  name: string;
  /** Experiment description */
  description: string;
  /** Whether experiment is active */
  active: boolean;
  /** Start date */
  startDate: string;
  /** End date (optional) */
  endDate: string | null;
  /** Variants */
  variants: ExperimentVariant[];
  /** Targeting rules */
  targeting: TargetingRules;
  /** Primary metric */
  primaryMetric: string;
  /** Secondary metrics */
  secondaryMetrics: string[];
}

/**
 * Targeting rules for experiments
 */
export interface TargetingRules {
  /** Platforms to include */
  platforms?: string[];
  /** Player IDs to include */
  playerIds?: number[];
  /** Player segments to include */
  segments?: string[];
  /** Minimum rating */
  minRating?: number;
  /** Maximum rating */
  maxRating?: number;
  /** New players only */
  newPlayersOnly?: boolean;
  /** Percentage of traffic (0-1) */
  trafficPercentage?: number;
}

/**
 * Player assignment to experiment
 */
export interface ExperimentAssignment {
  /** Experiment ID */
  experimentId: string;
  /** Variant name */
  variant: string;
  /** Whether player is in control group */
  isControl: boolean;
  /** Assignment timestamp */
  assignedAt: number;
}

/**
 * Experiment result for a player
 */
export interface ExperimentResult {
  /** Experiment ID */
  experimentId: string;
  /** Variant name */
  variant: string;
  /** Whether player is in control group */
  isControl: boolean;
  /** Metric values */
  metrics: Record<string, number>;
  /** Conversion flag */
  converted: boolean;
  /** Conversion value */
  conversionValue: number;
}

/**
 * A/B Testing configuration
 */
export interface ABTestingConfig {
  /** Enable A/B testing */
  enabled: boolean;
  /** Use consistent hashing for assignments */
  consistentHashing: boolean;
  /** Storage key prefix */
  storagePrefix: string;
  /** Auto-enroll new players */
  autoEnroll: boolean;
}

/**
 * Default A/B testing configuration
 */
export const DEFAULT_AB_TESTING_CONFIG: ABTestingConfig = {
  enabled: true,
  consistentHashing: true,
  storagePrefix: 'balda_ab_',
  autoEnroll: true,
};

/**
 * Default experiments
 */
export const DEFAULT_EXPERIMENTS: Experiment[] = [
  {
    id: 'new_player_onboarding',
    name: 'Новый онбординг',
    description: 'Тестирование улучшенного онбординга для новых игроков',
    active: true,
    startDate: '2026-11-16',
    endDate: null,
    variants: [
      {
        name: 'control',
        description: 'Стандартный онбординг',
        weight: 0.5,
        isControl: true,
      },
      {
        name: 'improved',
        description: 'Улучшенный онбординг с подсказками',
        weight: 0.5,
        isControl: false,
      },
    ],
    targeting: {
      newPlayersOnly: true,
      trafficPercentage: 1.0,
    },
    primaryMetric: 'retention_day1',
    secondaryMetrics: ['games_played', 'avg_score'],
  },
  {
    id: 'difficulty_balancing',
    name: 'Балансировка сложности',
    description: 'Тестирование новых весов сложности',
    active: true,
    startDate: '2026-11-16',
    endDate: null,
    variants: [
      {
        name: 'control',
        description: 'Стандартные веса',
        weight: 0.3,
        isControl: true,
      },
      {
        name: 'easier',
        description: 'Упрощённая сложность',
        weight: 0.35,
        isControl: false,
      },
      {
        name: 'harder',
        description: 'Усложнённая сложность',
        weight: 0.35,
        isControl: false,
      },
    ],
    targeting: {
      minRating: 500,
      maxRating: 2000,
      trafficPercentage: 0.5,
    },
    primaryMetric: 'win_rate',
    secondaryMetrics: ['avg_game_duration', 'games_played'],
  },
  {
    id: 'ads_frequency',
    name: 'Частота рекламы',
    description: 'Тестирование частоты показа рекламы',
    active: false,
    startDate: '2026-11-16',
    endDate: '2026-12-16',
    variants: [
      {
        name: 'control',
        description: 'Стандартная частота',
        weight: 0.5,
        isControl: true,
      },
      {
        name: 'less_frequent',
        description: 'Реже',
        weight: 0.5,
        isControl: false,
      },
    ],
    targeting: {
      trafficPercentage: 0.3,
    },
    primaryMetric: 'retention_day7',
    secondaryMetrics: ['session_duration', 'revenue'],
  },
  {
    id: 'test_experiment',
    name: 'Тестовый эксперимент',
    description: 'Тестовый эксперимент для тестирования',
    active: true,
    startDate: '2020-01-01',
    endDate: null,
    variants: [
      {
        name: 'control',
        description: 'Контроль',
        weight: 0.5,
        isControl: true,
      },
      {
        name: 'variant_a',
        description: 'Вариант A',
        weight: 0.5,
        isControl: false,
      },
    ],
    targeting: {},
    primaryMetric: 'conversion',
    secondaryMetrics: [],
  },
];

/**
 * A/B Testing system
 */
export class ABTestingSystem {
  private readonly config: ABTestingConfig;
  private experiments: Map<string, Experiment> = new Map();
  private assignments: Map<number, Map<string, ExperimentAssignment>> = new Map();

  constructor(config: Partial<ABTestingConfig> = {}) {
    this.config = { ...DEFAULT_AB_TESTING_CONFIG, ...config };
    this.loadDefaultExperiments();
  }

  /**
   * Load default experiments
   */
  private loadDefaultExperiments(): void {
    DEFAULT_EXPERIMENTS.forEach((experiment) => {
      this.experiments.set(experiment.id, experiment);
    });
  }

  /**
   * Get experiment by ID
   */
  getExperiment(experimentId: string): Experiment | null {
    return this.experiments.get(experimentId) ?? null;
  }

  /**
   * Get all experiments
   */
  getExperiments(): Experiment[] {
    return Array.from(this.experiments.values());
  }

  /**
   * Get active experiments
   */
  getActiveExperiments(): Experiment[] {
    return Array.from(this.experiments.values()).filter((e) => e.active);
  }

  /**
   * Add a new experiment
   */
  addExperiment(experiment: Experiment): void {
    this.experiments.set(experiment.id, experiment);
  }

  /**
   * Remove an experiment
   */
  removeExperiment(experimentId: string): boolean {
    return this.experiments.delete(experimentId);
  }

  /**
   * Activate an experiment
   */
  activateExperiment(experimentId: string): boolean {
    const experiment = this.experiments.get(experimentId);
    if (experiment) {
      experiment.active = true;
      return true;
    }
    return false;
  }

  /**
   * Deactivate an experiment
   */
  deactivateExperiment(experimentId: string): boolean {
    const experiment = this.experiments.get(experimentId);
    if (experiment) {
      experiment.active = false;
      return true;
    }
    return false;
  }

  /**
   * Check if player is eligible for experiment
   */
  isEligible(playerId: number, experiment: Experiment): boolean {
    if (!experiment.active) return false;

    const now = new Date().toISOString().split('T')[0];
    if (experiment.startDate > now) return false;
    if (experiment.endDate && experiment.endDate < now) return false;

    const targeting = experiment.targeting;

    // Check traffic percentage
    if (targeting.trafficPercentage !== undefined) {
      const hash = this.hashPlayer(playerId, experiment.id);
      if (hash > targeting.trafficPercentage) return false;
    }

    // Check new players only
    if (targeting.newPlayersOnly) {
      // In a real implementation, we'd check if the player is new
      // For now, we'll use a simple heuristic based on player ID
      if (playerId < 1000) return false; // Assume low IDs are old players
    }

    // Check rating range
    if (targeting.minRating !== undefined || targeting.maxRating !== undefined) {
      // In a real implementation, we'd get the player's rating
      // For now, we'll skip this check
    }

    // Check platform
    if (targeting.platforms && targeting.platforms.length > 0) {
      // In a real implementation, we'd check the current platform
      // For now, we'll skip this check
    }

    // Check player segments
    if (targeting.segments && targeting.segments.length > 0) {
      // In a real implementation, we'd check player segments
      // For now, we'll skip this check
    }

    return true;
  }

  /**
   * Assign player to experiment variant
   */
  assignVariant(playerId: number, experimentId: string): ExperimentAssignment | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment || !this.isEligible(playerId, experiment)) {
      return null;
    }

    // Check if already assigned
    const playerAssignments = this.assignments.get(playerId);
    if (playerAssignments?.has(experimentId)) {
      return playerAssignments.get(experimentId) ?? null;
    }

    // Calculate hash for consistent assignment
    const hash = this.hashPlayer(playerId, experimentId);
    let cumulativeWeight = 0;

    for (const variant of experiment.variants) {
      cumulativeWeight += variant.weight;
      if (hash <= cumulativeWeight) {
        const assignment: ExperimentAssignment = {
          experimentId,
          variant: variant.name,
          isControl: variant.isControl,
          assignedAt: Date.now(),
        };

        // Store assignment
        if (!this.assignments.has(playerId)) {
          this.assignments.set(playerId, new Map());
        }
        this.assignments.get(playerId)?.set(experimentId, assignment);

        return assignment;
      }
    }

    // Fallback to control
    const controlVariant = experiment.variants.find((v) => v.isControl);
    if (controlVariant) {
      const assignment: ExperimentAssignment = {
        experimentId,
        variant: controlVariant.name,
        isControl: true,
        assignedAt: Date.now(),
      };

      if (!this.assignments.has(playerId)) {
        this.assignments.set(playerId, new Map());
      }
      this.assignments.get(playerId)?.set(experimentId, assignment);

      return assignment;
    }

    return null;
  }

  /**
   * Get variant for player
   */
  getVariant(playerId: number, experimentId: string): string | null {
    const assignment = this.assignVariant(playerId, experimentId);
    return assignment?.variant ?? null;
  }

  /**
   * Check if player is in control group
   */
  isControl(playerId: number, experimentId: string): boolean {
    const assignment = this.assignVariant(playerId, experimentId);
    return assignment?.isControl ?? false;
  }

  /**
   * Get all assignments for player
   */
  getPlayerAssignments(playerId: number): ExperimentAssignment[] {
    const playerAssignments = this.assignments.get(playerId);
    return playerAssignments ? Array.from(playerAssignments.values()) : [];
  }

  /**
   * Record experiment result
   */
  recordResult(_playerId: number, _experimentId: string, _metrics: Record<string, number>, _converted: boolean = false, _conversionValue: number = 0): void {
    // In a real implementation, this would store the result
  }

  /**
   * Get experiment results
   */
  getResults(_experimentId: string): ExperimentResult[] {
    // In a real implementation, this would query the database
    // For now, return empty array
    return [];
  }

  /**
   * Get conversion rate for variant
   */
  getConversionRate(_experimentId: string, _variant: string): number {
    // In a real implementation, this would calculate from stored results
    return 0;
  }

  /**
   * Get winning variant
   */
  getWinningVariant(experimentId: string, metric: string = 'conversionRate'): string | null {
    const experiment = this.experiments.get(experimentId);
    if (!experiment) return null;

    let bestVariant: string | null = null;
    let bestValue = -Infinity;

    for (const variant of experiment.variants) {
      let value = 0;
      if (metric === 'conversionRate') {
        value = this.getConversionRate(experimentId, variant.name);
      }
      // In a real implementation, we'd calculate other metrics

      if (value > bestValue) {
        bestValue = value;
        bestVariant = variant.name;
      }
    }

    return bestVariant;
  }

  /**
   * Check if feature is enabled for player
   */
  isFeatureEnabled(playerId: number, featureName: string): boolean {
    // In a real implementation, this would check feature flags
    // For now, we'll check if the player is in a specific experiment variant
    const experiment = this.getActiveExperiments().find((e) => e.id === featureName);
    if (!experiment) return false;

    const variant = this.getVariant(playerId, featureName);
    return variant !== null && variant !== 'control';
  }

  /**
   * Get feature value for player
   */
  getFeatureValue<T>(playerId: number, featureName: string, defaultValue: T): T {
    const experiment = this.getActiveExperiments().find((e) => e.id === featureName);
    if (!experiment) return defaultValue;

    const variant = this.getVariant(playerId, featureName);
    if (variant === null || variant === 'control') return defaultValue;

    // In a real implementation, we'd map variants to values
    // For now, just return the variant name as the value
    return variant as unknown as T;
  }

  /**
   * Generate consistent hash for player-experiment combination
   */
  private hashPlayer(playerId: number, experimentId: string): number {
    if (!this.config.consistentHashing) {
      return Math.random();
    }

    const seed = `${playerId}:${experimentId}`;
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
      const char = seed.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }

    // Normalize to 0-1
    return Math.abs(hash) / 0x7fffffff;
  }

  /**
   * Reset assignments for player
   */
  resetPlayer(playerId: number): void {
    this.assignments.delete(playerId);
  }

  /**
   * Reset all assignments
   */
  resetAllAssignments(): void {
    this.assignments.clear();
  }

  /**
   * Export data for storage
   */
  export(): {
    experiments: Experiment[];
    assignments: Record<number, Record<string, ExperimentAssignment>>;
    config: ABTestingConfig;
  } {
    const exportAssignments: Record<number, Record<string, ExperimentAssignment>> = {};
    this.assignments.forEach((playerAssignments, playerId) => {
      exportAssignments[playerId] = Object.fromEntries(playerAssignments);
    });

    return {
      experiments: Array.from(this.experiments.values()),
      assignments: exportAssignments,
      config: this.config,
    };
  }

  /**
   * Import data from storage
   */
  import(data: {
    experiments: Experiment[];
    assignments: Record<number, Record<string, ExperimentAssignment>>;
    config?: Partial<ABTestingConfig>;
  }): void {
    this.experiments.clear();
    this.assignments.clear();

    data.experiments.forEach((experiment) => {
      this.experiments.set(experiment.id, experiment);
    });

    Object.entries(data.assignments).forEach(([playerId, playerAssignments]) => {
      const playerIdNum = parseInt(playerId, 10);
      const assignmentsMap = new Map<string, ExperimentAssignment>();
      Object.entries(playerAssignments).forEach(([experimentId, assignment]) => {
        assignmentsMap.set(experimentId, assignment);
      });
      this.assignments.set(playerIdNum, assignmentsMap);
    });

    if (data.config) {
      this.config = { ...this.config, ...data.config };
    }
  }
}

/**
 * Create a new A/B testing system
 */
export function createABTestingSystem(config?: Partial<ABTestingConfig>): ABTestingSystem {
  return new ABTestingSystem(config);
}

/**
 * Global A/B testing instance
 */
let globalABTesting: ABTestingSystem | null = null;

/**
 * Get or create global A/B testing instance
 */
export function getABTesting(): ABTestingSystem {
  if (!globalABTesting) {
    globalABTesting = createABTestingSystem();
  }
  return globalABTesting;
}

/**
 * Set global A/B testing instance
 */
export function setABTesting(system: ABTestingSystem): void {
  globalABTesting = system;
}

/**
 * Convenience functions
 */
export const getVariant = (playerId: number, experimentId: string): string | null => {
  return getABTesting().getVariant(playerId, experimentId);
};

export const isControl = (playerId: number, experimentId: string): boolean => {
  return getABTesting().isControl(playerId, experimentId);
};

export const isFeatureEnabled = (playerId: number, featureName: string): boolean => {
  return getABTesting().isFeatureEnabled(playerId, featureName);
};

export const getFeatureValue = <T>(playerId: number, featureName: string, defaultValue: T): T => {
  return getABTesting().getFeatureValue(playerId, featureName, defaultValue);
};

export const recordResult = (playerId: number, experimentId: string, metrics: Record<string, number>, converted?: boolean, conversionValue?: number): void => {
  getABTesting().recordResult(playerId, experimentId, metrics, converted, conversionValue);
};
