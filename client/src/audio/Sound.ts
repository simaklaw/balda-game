/**
 * Звуковой движок: все эффекты синтезируются Web Audio (файлов нет — ноль байт в бандле, мгновенный старт).
 * Характер: мягкое дерево и стекло — короткие, негромкие сигналы с лёгкой «комнатной» реверберацией.
 * Браузеры запускают аудио только после жеста пользователя: unlock() вызывается на первом касании.
 */

export type SoundName =
  | 'tap'
  | 'key'
  | 'select'
  | 'place'
  | 'word'
  | 'error'
  | 'opponent'
  | 'win'
  | 'lose'
  | 'draw';

export interface SoundPrefs {
  enabled: boolean;
  /** Громкость 0..1. */
  volume: number;
}

export const DEFAULT_SOUND_PREFS: SoundPrefs = { enabled: true, volume: 0.7 };
const STORAGE_KEY = 'balda.sound';

/** Разбор сохранённых настроек: любой мусор → значения по умолчанию. */
export function parseSoundPrefs(raw: string | null | undefined): SoundPrefs {
  if (raw === null || raw === undefined) return { ...DEFAULT_SOUND_PREFS };
  try {
    const v = JSON.parse(raw) as Partial<SoundPrefs> | null;
    const volume = typeof v?.volume === 'number' && Number.isFinite(v.volume) ? Math.min(1, Math.max(0, v.volume)) : DEFAULT_SOUND_PREFS.volume;
    return { enabled: typeof v?.enabled === 'boolean' ? v.enabled : true, volume };
  } catch {
    return { ...DEFAULT_SOUND_PREFS };
  }
}

/** Частота ноты в полутонах относительно A4 (440 Гц). */
export function noteFreq(semitonesFromA4: number): number {
  return 440 * Math.pow(2, semitonesFromA4 / 12);
}

/** Пентатоника до-мажора (от C5): мелодично при любой последовательности выбора клеток. */
const PENTA = [3, 5, 7, 10, 12, 15, 17, 19, 22];

type Ctx = AudioContext;

class SoundEngine {
  private ctx: Ctx | null = null;
  private master: GainNode | null = null;
  private reverb: ConvolverNode | null = null;
  private prefs: SoundPrefs = { ...DEFAULT_SOUND_PREFS };
  private lastPlayed = new Map<SoundName, number>();

  constructor() {
    try {
      this.prefs = parseSoundPrefs(localStorage.getItem(STORAGE_KEY));
    } catch {
      /* хранилище недоступно — настройки по умолчанию */
    }
  }

  get enabled(): boolean {
    return this.prefs.enabled;
  }

  get volume(): number {
    return this.prefs.volume;
  }

  setEnabled(value: boolean): void {
    this.prefs.enabled = value;
    this.save();
    if (value) this.unlock();
  }

  setVolume(value: number): void {
    this.prefs.volume = Math.min(1, Math.max(0, value));
    if (this.master !== null && this.ctx !== null) this.master.gain.setTargetAtTime(this.prefs.volume * 0.9, this.ctx.currentTime, 0.02);
    this.save();
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.prefs));
    } catch {
      /* не критично */
    }
  }

  /** Создать/возобновить контекст — вызывать из обработчика жеста пользователя. */
  unlock(): void {
    try {
      if (this.ctx === null) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (Ctor === undefined) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.prefs.volume * 0.9;
        // Лёгкий компрессор: частые сигналы не «щёлкают» и не перегружают.
        const comp = this.ctx.createDynamicsCompressor();
        this.master.connect(comp).connect(this.ctx.destination);
        this.reverb = this.ctx.createConvolver();
        this.reverb.buffer = this.makeImpulse(this.ctx, 1.1, 2.6);
        const wet = this.ctx.createGain();
        wet.gain.value = 0.22;
        this.reverb.connect(wet).connect(this.master);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  private makeImpulse(ctx: Ctx, seconds: number, decay: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
    return buf;
  }

  /** Одна нота: sine/triangle с мягкой атакой и экспоненциальным затуханием. */
  private tone(freq: number, at: number, dur: number, gain: number, opts: { type?: OscillatorType; toFreq?: number; wet?: number; harmonic?: number } = {}): void {
    const ctx = this.ctx;
    const out = this.master;
    if (ctx === null || out === null) return;
    const t0 = ctx.currentTime + at;
    const osc = ctx.createOscillator();
    osc.type = opts.type ?? 'sine';
    osc.frequency.setValueAtTime(freq, t0);
    if (opts.toFreq !== undefined) osc.frequency.exponentialRampToValueAtTime(Math.max(20, opts.toFreq), t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    g.connect(out);
    if (this.reverb !== null && (opts.wet ?? 0) > 0) {
      const send = ctx.createGain();
      send.gain.value = opts.wet ?? 0;
      g.connect(send).connect(this.reverb);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
    if (opts.harmonic !== undefined) this.tone(freq * 2.01, at, dur * 0.7, gain * opts.harmonic, { wet: opts.wet });
  }

  /** Колокольчик: основной тон + тихая гармоника, с реверберацией. */
  private bell(semi: number, at: number, dur: number, gain: number): void {
    this.tone(noteFreq(semi), at, dur, gain, { wet: 0.9, harmonic: 0.28 });
  }

  play(name: SoundName, arg = 0): void {
    if (!this.prefs.enabled || this.prefs.volume <= 0) return;
    if (this.ctx === null) this.unlock();
    const ctx = this.ctx;
    if (ctx === null || ctx.state !== 'running') return;
    // Антиспам: один и тот же сигнал не чаще, чем раз в 35 мс.
    const now = performance.now();
    if (now - (this.lastPlayed.get(name) ?? -1e9) < 35) return;
    this.lastPlayed.set(name, now);
    switch (name) {
      case 'tap':
        this.tone(560, 0, 0.07, 0.16, { type: 'triangle', toFreq: 330 });
        break;
      case 'key':
        this.tone(900, 0, 0.05, 0.11, { toFreq: 640 });
        break;
      case 'select': {
        const step = PENTA[Math.min(Math.max(0, arg), PENTA.length - 1)] ?? 12;
        this.bell(step, 0, 0.22, 0.09);
        break;
      }
      case 'place':
        // «Удар литеры»: глухой стук + сухой щелчок металла + тихий отзвук.
        this.tone(150, 0, 0.12, 0.34, { type: 'sine', toFreq: 62 });
        this.tone(1900, 0, 0.025, 0.1, { type: 'square', toFreq: 700 });
        this.tone(320, 0.01, 0.09, 0.12, { type: 'triangle', toFreq: 180 });
        this.bell(12, 0.05, 0.3, 0.045);
        break;
      case 'word': {
        // arg — длина слова: чем длиннее слово, тем богаче аккорд.
        const notes = [3, 7, 10, 15, 19];
        const count = Math.min(notes.length, Math.max(3, arg - 1));
        for (let i = 0; i < count; i++) this.bell(notes[i]!, i * 0.075, 0.55, 0.12);
        break;
      }
      case 'error':
        this.tone(170, 0, 0.16, 0.2, { type: 'triangle', toFreq: 120 });
        this.tone(140, 0.12, 0.2, 0.17, { type: 'triangle', toFreq: 100 });
        break;
      case 'opponent':
        this.bell(-2, 0, 0.35, 0.09);
        this.bell(-9, 0.11, 0.45, 0.08);
        break;
      case 'win':
        [3, 7, 10, 15, 19, 22].forEach((n, i) => this.bell(n, i * 0.11, 0.9, 0.13));
        this.bell(-9, 0.1, 1.4, 0.1);
        break;
      case 'lose':
        [0, -3, -7].forEach((n, i) => this.bell(n - 5, i * 0.2, 0.9, 0.1));
        break;
      case 'draw':
        this.bell(3, 0, 0.7, 0.1);
        this.bell(3, 0.22, 0.9, 0.08);
        break;
    }
  }
}

export const sound = new SoundEngine();

/** Подключить разблокировку аудио к первому жесту (вызывается один раз при старте). */
export function installAudioUnlock(target: Window = window): void {
  const handler = (): void => {
    sound.unlock();
  };
  target.addEventListener('pointerdown', handler, { once: false, passive: true });
  target.addEventListener('keydown', handler, { passive: true });
}
