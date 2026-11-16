import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
  InMemoryAnalyticsProvider,
  createAnalyticsProvider,
  setAnalytics,
  startSession,
  trackGameStart,
  DEFAULT_ANALYTICS_CONFIG,
  type AnalyticsEvent,
} from '../src/analytics';

describe('analytics', () => {
  let provider: InMemoryAnalyticsProvider;

  beforeEach(() => {
    provider = createAnalyticsProvider() as InMemoryAnalyticsProvider;
    setAnalytics(provider);
  });

  afterEach(() => {
    setAnalytics(null as unknown as InMemoryAnalyticsProvider);
  });

  describe('InMemoryAnalyticsProvider', () => {
    describe('constructor', () => {
      it('creates with default config', () => {
        expect(provider).toBeInstanceOf(InMemoryAnalyticsProvider);
      });

      it('accepts custom config', () => {
        const customProvider = createAnalyticsProvider({
          enabled: false,
          platform: 'yandex',
        }) as InMemoryAnalyticsProvider;
        expect(customProvider).toBeInstanceOf(InMemoryAnalyticsProvider);
      });
    });

    describe('track', () => {
      it('tracks custom events', async () => {
        const customEvent: AnalyticsEvent = {
          type: 'custom',
          timestamp: Date.now(),
          sessionId: 'test-session',
          playerId: 1,
          platform: 'web',
          properties: { test: 'value' },
        };

        await provider.track(customEvent);
        const events = provider.getEvents();
        expect(events.length).toBe(1);
        expect(events[0].type).toBe('custom');
      });

      it('does not track when disabled', async () => {
        const disabledProvider = createAnalyticsProvider({ enabled: false }) as InMemoryAnalyticsProvider;
        const customEvent: AnalyticsEvent = {
          type: 'custom',
          timestamp: Date.now(),
          sessionId: 'test-session',
          playerId: 1,
          platform: 'web',
          properties: { test: 'value' },
        };

        await disabledProvider.track(customEvent);
        const events = disabledProvider.getEvents();
        expect(events.length).toBe(0);
      });
    });

    describe('trackGameStart', () => {
      it('tracks game start', () => {
        provider.startSession(1);
        provider.trackGameStart({
          gameId: 'game_123',
          boardSize: '5x5',
          difficulty: 'medium',
          timeControl: '2min',
          isOnline: true,
          opponentId: 2,
          opponentName: 'Player2',
        });

        const events = provider.getEvents();
        expect(events.length).toBe(2); // session_start + game_start
        expect(events[1].type).toBe('game_start');
      });

      it('updates session metrics', () => {
        provider.startSession(1);
        provider.trackGameStart({
          gameId: 'game_123',
          boardSize: '5x5',
          difficulty: 'medium',
          timeControl: '2min',
          isOnline: true,
          opponentId: 2,
          opponentName: 'Player2',
        });

        const session = provider.getSessionMetrics();
        expect(session?.gamesPlayed).toBe(1);
      });
    });

    describe('trackGameEnd', () => {
      it('tracks game end', () => {
        provider.startSession(1);
        provider.trackGameStart({
          gameId: 'game_123',
          boardSize: '5x5',
          difficulty: 'medium',
          timeControl: '2min',
          isOnline: true,
          opponentId: 2,
          opponentName: 'Player2',
        });
        provider.trackGameEnd({
          gameId: 'game_123',
          winnerId: 1,
          reason: 'win',
          duration: 120,
          movesCount: 10,
          score: 100,
          wordsFound: 5,
          isRated: true,
        });

        const events = provider.getEvents();
        const gameEndEvent = events.find((e) => e.type === 'game_end');
        expect(gameEndEvent).toBeDefined();
        expect(gameEndEvent?.properties.winnerId).toBe(1);
      });

      it('updates session metrics for win', () => {
        provider.startSession(1);
        provider.trackGameStart({
          gameId: 'game_123',
          boardSize: '5x5',
          difficulty: 'medium',
          timeControl: '2min',
          isOnline: true,
          opponentId: 2,
          opponentName: 'Player2',
        });
        provider.trackGameEnd({
          gameId: 'game_123',
          winnerId: 1,
          reason: 'win',
          duration: 120,
          movesCount: 10,
          score: 100,
          wordsFound: 5,
          isRated: true,
        });

        const session = provider.getSessionMetrics();
        expect(session?.gamesWon).toBe(1);
        expect(session?.totalScore).toBe(100);
        expect(session?.totalWords).toBe(5);
      });

      it('updates session metrics for loss', () => {
        provider.startSession(1);
        provider.trackGameStart({
          gameId: 'game_123',
          boardSize: '5x5',
          difficulty: 'medium',
          timeControl: '2min',
          isOnline: true,
          opponentId: 2,
          opponentName: 'Player2',
        });
        provider.trackGameEnd({
          gameId: 'game_123',
          winnerId: 2,
          reason: 'lose',
          duration: 120,
          movesCount: 10,
          score: 50,
          wordsFound: 3,
          isRated: true,
        });

        const session = provider.getSessionMetrics();
        expect(session?.gamesLost).toBe(1);
        expect(session?.gamesWon).toBe(0);
      });

      it('updates player metrics', () => {
        provider.startSession(1);
        provider.trackGameStart({
          gameId: 'game_123',
          boardSize: '5x5',
          difficulty: 'medium',
          timeControl: '2min',
          isOnline: true,
          opponentId: 2,
          opponentName: 'Player2',
        });
        provider.trackGameEnd({
          gameId: 'game_123',
          winnerId: 1,
          reason: 'win',
          duration: 120,
          movesCount: 10,
          score: 100,
          wordsFound: 5,
          isRated: true,
        });

        const playerMetrics = provider.getPlayerMetrics(1);
        expect(playerMetrics?.totalGames).toBe(1);
        expect(playerMetrics?.totalWordsFound).toBe(5);
        expect(playerMetrics?.winRate).toBe(100);
      });
    });

    describe('trackMove', () => {
      it('tracks move', () => {
        provider.startSession(1);
        provider.trackMove({
          gameId: 'game_123',
          moveNumber: 1,
          word: 'тест',
          score: 10,
          pathLength: 4,
          totalTime: 5000,
          pathSelectionTime: 2000,
          letterSelectionTime: 1000,
          pathCorrections: 0,
        });

        const events = provider.getEvents();
        const moveEvent = events.find((e) => e.type === 'move_made');
        expect(moveEvent).toBeDefined();
        expect(moveEvent?.properties.word).toBe('тест');
      });

      it('does not track when disabled', () => {
        const disabledProvider = createAnalyticsProvider({
          enabled: true,
          trackMoves: false,
        }) as InMemoryAnalyticsProvider;
        setAnalytics(disabledProvider);

        disabledProvider.startSession(1);
        disabledProvider.trackMove({
          gameId: 'game_123',
          moveNumber: 1,
          word: 'тест',
          score: 10,
          pathLength: 4,
          totalTime: 5000,
          pathSelectionTime: 2000,
          letterSelectionTime: 1000,
          pathCorrections: 0,
        });

        const events = disabledProvider.getEvents();
        const moveEvent = events.find((e) => e.type === 'move_made');
        expect(moveEvent).toBeUndefined();
      });
    });

    describe('trackWordFound', () => {
      it('tracks word found', () => {
        provider.startSession(1);
        provider.trackWordFound({
          gameId: 'game_123',
          word: 'тест',
          length: 4,
          score: 10,
        });

        const events = provider.getEvents();
        const wordEvent = events.find((e) => e.type === 'word_found');
        expect(wordEvent).toBeDefined();
        expect(wordEvent?.properties.word).toBe('тест');
      });
    });

    describe('trackRatingChange', () => {
      it('tracks rating change', () => {
        provider.startSession(1);
        provider.trackRatingChange({
          oldRating: 1000,
          newRating: 1200,
          delta: 200,
          reason: 'game_win',
          gameId: 'game_123',
        });

        const events = provider.getEvents();
        const ratingEvent = events.find((e) => e.type === 'rating_change');
        expect(ratingEvent).toBeDefined();
        expect(ratingEvent?.properties.delta).toBe(200);
      });
    });

    describe('trackAchievement', () => {
      it('tracks achievement', () => {
        provider.startSession(1);
        provider.trackAchievement({
          achievementId: 'first_win',
          achievementName: 'Первая победа',
          progress: 1,
          totalRequired: 1,
        });

        const events = provider.getEvents();
        const achievementEvent = events.find((e) => e.type === 'achievement_unlocked');
        expect(achievementEvent).toBeDefined();
        expect(achievementEvent?.properties.achievementId).toBe('first_win');
      });
    });

    describe('trackError', () => {
      it('tracks error', () => {
        provider.startSession(1);
        const error = new Error('Test error');
        provider.trackError(error, { context: 'test' });

        const events = provider.getEvents();
        const errorEvent = events.find((e) => e.type === 'error');
        expect(errorEvent).toBeDefined();
        expect(errorEvent?.properties.error).toBe('Test error');
      });

      it('updates session error count', () => {
        provider.startSession(1);
        const error = new Error('Test error');
        provider.trackError(error);

        const session = provider.getSessionMetrics();
        expect(session?.errors).toBe(1);
      });
    });

    describe('startSession', () => {
      it('starts a new session', () => {
        provider.startSession(1);

        const session = provider.getSessionMetrics();
        expect(session).not.toBeNull();
        expect(session?.playerId).toBe(1);
        expect(session?.startTime).toBeDefined();
      });

      it('ends previous session when starting new one', () => {
        provider.startSession(1);
        const firstSessionId = provider.getSessionMetrics()?.sessionId;

        provider.startSession(2);
        const secondSessionId = provider.getSessionMetrics()?.sessionId;

        expect(firstSessionId).not.toBe(secondSessionId);
        expect(provider.getSessions().length).toBe(2);
      });

      it('updates player metrics', () => {
        provider.startSession(1);
        const playerMetrics = provider.getPlayerMetrics(1);

        expect(playerMetrics?.totalSessions).toBe(1);
        expect(playerMetrics?.playerId).toBe(1);
      });
    });

    describe('endSession', () => {
      it('ends current session', () => {
        provider.startSession(1);
        provider.endSession();

        const session = provider.getSessionMetrics();
        expect(session).toBeNull();
      });

      it('sets end time and duration', () => {
        provider.startSession(1);
        // Simulate some time passing
        provider.endSession();

        const sessions = provider.getSessions();
        expect(sessions.length).toBe(1);
        expect(sessions[0].endTime).toBeDefined();
        expect(sessions[0].duration).toBeGreaterThanOrEqual(0);
      });
    });

    describe('getSessionMetrics', () => {
      it('returns null when no session', () => {
        const metrics = provider.getSessionMetrics();
        expect(metrics).toBeNull();
      });

      it('returns current session metrics', () => {
        provider.startSession(1);
        provider.trackGameStart({
          gameId: 'game_123',
          boardSize: '5x5',
          difficulty: 'medium',
          timeControl: '2min',
          isOnline: true,
          opponentId: 2,
          opponentName: 'Player2',
        });

        const metrics = provider.getSessionMetrics();
        expect(metrics?.gamesPlayed).toBe(1);
      });
    });

    describe('getPlayerMetrics', () => {
      it('returns null for unknown player', () => {
        const metrics = provider.getPlayerMetrics(999);
        expect(metrics).toBeNull();
      });

      it('returns player metrics', () => {
        provider.startSession(1);
        provider.trackGameStart({
          gameId: 'game_123',
          boardSize: '5x5',
          difficulty: 'medium',
          timeControl: '2min',
          isOnline: true,
          opponentId: 2,
          opponentName: 'Player2',
        });
        provider.trackGameEnd({
          gameId: 'game_123',
          winnerId: 1,
          reason: 'win',
          duration: 120,
          movesCount: 10,
          score: 100,
          wordsFound: 5,
          isRated: true,
        });

        const metrics = provider.getPlayerMetrics(1);
        expect(metrics?.totalSessions).toBe(1);
        expect(metrics?.totalGames).toBe(1);
      });
    });

    describe('flush', () => {
      it('clears events when batching enabled', async () => {
        const batchProvider = createAnalyticsProvider({
          batchEvents: true,
          batchSize: 5,
        }) as InMemoryAnalyticsProvider;

        for (let i = 0; i < 5; i++) {
          await batchProvider.track({
            type: 'custom',
            timestamp: Date.now(),
            sessionId: 'test',
            playerId: 1,
            platform: 'web',
            properties: {},
          });
        }

        await batchProvider.flush();
        expect(batchProvider.getEvents().length).toBe(0);
      });
    });

    describe('reset', () => {
      it('clears all data', () => {
        provider.startSession(1);
        provider.trackGameStart({
          gameId: 'game_123',
          boardSize: '5x5',
          difficulty: 'medium',
          timeControl: '2min',
          isOnline: true,
          opponentId: 2,
          opponentName: 'Player2',
        });

        provider.reset();

        expect(provider.getEvents().length).toBe(0);
        expect(provider.getSessions().length).toBe(0);
        expect(provider.getAllPlayerMetrics().length).toBe(0);
        expect(provider.getSessionMetrics()).toBeNull();
      });
    });

    describe('getEvents', () => {
      it('returns all events', () => {
        provider.startSession(1);
        provider.trackGameStart({
          gameId: 'game_123',
          boardSize: '5x5',
          difficulty: 'medium',
          timeControl: '2min',
          isOnline: true,
          opponentId: 2,
          opponentName: 'Player2',
        });

        const events = provider.getEvents();
        expect(events.length).toBe(2); // session_start + game_start
      });
    });

    describe('getSessions', () => {
      it('returns all sessions', () => {
        provider.startSession(1);
        provider.endSession();
        provider.startSession(2);
        provider.endSession();

        const sessions = provider.getSessions();
        expect(sessions.length).toBe(2);
      });
    });

    describe('getAllPlayerMetrics', () => {
      it('returns all player metrics', () => {
        provider.startSession(1);
        provider.endSession();
        provider.startSession(2);
        provider.endSession();

        const metrics = provider.getAllPlayerMetrics();
        expect(metrics.length).toBe(2);
      });
    });
  });

  describe('Global analytics functions', () => {
    it('uses global provider', () => {
      const testProvider = createAnalyticsProvider() as InMemoryAnalyticsProvider;
      setAnalytics(testProvider);

      startSession(1);
      trackGameStart({
        gameId: 'game_123',
        boardSize: '5x5',
        difficulty: 'medium',
        timeControl: '2min',
        isOnline: true,
        opponentId: 2,
        opponentName: 'Player2',
      });

      expect(testProvider.getEvents().length).toBe(2);
    });
  });

  describe('DEFAULT_ANALYTICS_CONFIG', () => {
    it('has expected default values', () => {
      expect(DEFAULT_ANALYTICS_CONFIG.enabled).toBe(true);
      expect(DEFAULT_ANALYTICS_CONFIG.trackSessions).toBe(true);
      expect(DEFAULT_ANALYTICS_CONFIG.trackGames).toBe(true);
      expect(DEFAULT_ANALYTICS_CONFIG.trackMoves).toBe(true);
      expect(DEFAULT_ANALYTICS_CONFIG.trackErrors).toBe(true);
      expect(DEFAULT_ANALYTICS_CONFIG.sessionTimeout).toBe(30 * 60 * 1000);
      expect(DEFAULT_ANALYTICS_CONFIG.batchEvents).toBe(false);
      expect(DEFAULT_ANALYTICS_CONFIG.batchSize).toBe(10);
      expect(DEFAULT_ANALYTICS_CONFIG.platform).toBe('web');
    });
  });
});
