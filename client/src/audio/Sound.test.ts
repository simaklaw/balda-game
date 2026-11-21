import { describe, expect, it } from 'vitest';
import { DEFAULT_SOUND_PREFS, noteFreq, parseSoundPrefs } from './Sound';

describe('Sound: чистые функции', () => {
  it('noteFreq: A4=440, октава вверх = ×2', () => {
    expect(noteFreq(0)).toBeCloseTo(440);
    expect(noteFreq(12)).toBeCloseTo(880);
    expect(noteFreq(-12)).toBeCloseTo(220);
  });

  it('parseSoundPrefs: корректные значения читаются, громкость ограничивается 0..1', () => {
    expect(parseSoundPrefs('{"enabled":false,"volume":0.3}')).toEqual({ enabled: false, volume: 0.3 });
    expect(parseSoundPrefs('{"enabled":true,"volume":5}').volume).toBe(1);
    expect(parseSoundPrefs('{"volume":-2}').volume).toBe(0);
  });

  it('parseSoundPrefs: мусор и null дают значения по умолчанию', () => {
    expect(parseSoundPrefs(null)).toEqual(DEFAULT_SOUND_PREFS);
    expect(parseSoundPrefs('не json')).toEqual(DEFAULT_SOUND_PREFS);
    expect(parseSoundPrefs('{"enabled":"да","volume":"много"}')).toEqual(DEFAULT_SOUND_PREFS);
  });
});
