/**
 * Звуковой движок: все эффекты синтезируются Web Audio (файлов нет — ноль байт в бандле, мгновенный старт).
 * Характер: тёплое дерево, хрусталь и бронзовые колокольчики — короткие негромкие сигналы в «зале» с затухающим
 * стереоревербом. Каждая роль кнопки (играть, подтвердить, назад, отмена, пропуск, открыть, выбрать, переключить)
 * имеет собственный тембр и мотив.
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
  | 'draw'
  | 'play'
  | 'confirm'
  | 'back'
  | 'cancel'
  | 'skip'
  | 'open'
  | 'choose'
  | 'toggle';

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
  private reverbIn: AudioNode | null = null;
  private noise: AudioBuffer | null = null;
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
        comp.threshold.value = -16;
        comp.ratio.value = 3;
        // Мягкий срез верха: звук «дорогой», без цифровой резкости.
        const soften = this.ctx.createBiquadFilter();
        soften.type = 'lowpass';
        soften.frequency.value = 9500;
        soften.Q.value = 0.4;
        this.master.connect(soften).connect(comp).connect(this.ctx.destination);
        this.reverb = this.ctx.createConvolver();
        this.reverb.buffer = this.makeImpulse(this.ctx, 1.9, 2.3);
        const pre = this.ctx.createDelay(0.1);
        pre.delayTime.value = 0.018;
        const wet = this.ctx.createGain();
        wet.gain.value = 0.3;
        this.reverbIn = pre;
        pre.connect(this.reverb);
        this.reverb.connect(wet).connect(this.master);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  /** Импульс «зала»: шум, затухающий экспоненциально, верх гаснет быстрее низа (как в настоящей комнате). */
  private makeImpulse(ctx: Ctx, seconds: number, decay: number): AudioBuffer {
    const length = Math.floor(ctx.sampleRate * seconds);
    const buf = ctx.createBuffer(2, length, ctx.sampleRate);
    for (let ch = 0; ch < 2; ch++) {
      const data = buf.getChannelData(ch);
      let lp = 0;
      for (let i = 0; i < length; i++) {
        const t = i / length;
        const white = Math.random() * 2 - 1;
        // Однополюсный ФНЧ с нарастающим сглаживанием → тёмный хвост.
        const k = 0.15 + 0.8 * t;
        lp += (white - lp) * (1 - k);
        data[i] = lp * Math.pow(1 - t, decay) * 1.6;
      }
    }
    return buf;
  }

  /** Одна нота: sine/triangle с мягкой атакой и экспоненциальным затуханием. */
  private tone(freq: number, at: number, dur: number, gain: number, opts: { type?: OscillatorType; toFreq?: number; wet?: number; harmonic?: number; pan?: number; attack?: number } = {}): void {
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
    g.gain.exponentialRampToValueAtTime(Math.max(0.0002, gain), t0 + (opts.attack ?? 0.008));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g);
    let dest: AudioNode = out;
    if (opts.pan !== undefined && typeof ctx.createStereoPanner === 'function') {
      const panner = ctx.createStereoPanner();
      panner.pan.value = Math.max(-1, Math.min(1, opts.pan));
      panner.connect(out);
      dest = panner;
    }
    g.connect(dest);
    if (this.reverbIn !== null && (opts.wet ?? 0) > 0) {
      const send = ctx.createGain();
      send.gain.value = opts.wet ?? 0;
      g.connect(send).connect(this.reverbIn);
    }
    osc.start(t0);
    osc.stop(t0 + dur + 0.03);
    if (opts.harmonic !== undefined) this.tone(freq * 2.01, at, dur * 0.7, gain * opts.harmonic, { wet: opts.wet });
  }

  /** Бронзовый колокольчик: неочётные обертоны с разной скоростью затухания + лёгкая расстройка для «перелива». */
  private bell(semi: number, at: number, dur: number, gain: number, pan = 0): void {
    const f = noteFreq(semi);
    const partials: Array<[number, number, number]> = [
      [1, 1, 1],
      [2.01, 0.34, 0.62],
      [2.76, 0.2, 0.42],
      [5.4, 0.07, 0.22],
    ];
    for (const [ratio, amp, life] of partials) {
      if (f * ratio > 9000) continue;
      this.tone(f * ratio, at, dur * life, gain * amp, { wet: 0.95, pan, attack: ratio === 1 ? 0.006 : 0.003 });
    }
    // Вторая «струна» с расстройкой на 4 цента — перламутровое биение.
    this.tone(f * 1.0023, at, dur * 0.9, gain * 0.5, { wet: 0.9, pan: -pan * 0.6, attack: 0.008 });
  }

  /** Дерево/маримба: тёплый основной тон, короткая гармоника, лёгкий «клевок». */
  private pluck(semi: number, at: number, dur: number, gain: number, pan = 0, wet = 0.4): void {
    const f = noteFreq(semi);
    this.tone(f, at, dur, gain, { wet, pan, attack: 0.003 });
    this.tone(f * 4, at, dur * 0.22, gain * 0.28, { wet: wet * 0.5, pan, attack: 0.002 });
    this.tone(f * 0.5, at, dur * 0.5, gain * 0.35, { wet: 0, pan, attack: 0.004 });
  }

  /** Шорох воздуха: полосовой шум с «ныряющей» частотой. */
  private swoosh(from: number, to: number, at: number, dur: number, gain: number): void {
    const ctx = this.ctx;
    const out = this.master;
    if (ctx === null || out === null) return;
    if (this.noise === null) {
      const len = ctx.sampleRate;
      this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }
    const t0 = ctx.currentTime + at;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const bp = ctx.createBiquadFilter();
    bp.type = 'bandpass';
    bp.Q.value = 1.4;
    bp.frequency.setValueAtTime(from, t0);
    bp.frequency.exponentialRampToValueAtTime(to, t0 + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(gain, t0 + dur * 0.4);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g).connect(out);
    src.start(t0);
    src.stop(t0 + dur + 0.05);
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
        // Универсальное нажатие: тёплое дерево с каплей стекла.
        this.pluck(15, 0, 0.14, 0.13, 0, 0.35);
        this.bell(27, 0.012, 0.25, 0.022);
        break;
      case 'key':
        // Клавиша кассы: сухой короткий «клик» с высоким металлическим призвуком.
        this.pluck(19 + (arg % 3), 0, 0.07, 0.1, 0, 0.18);
        this.tone(2600, 0, 0.012, 0.035, { type: 'square', toFreq: 1400 });
        break;
      case 'select': {
        const step = PENTA[Math.min(Math.max(0, arg), PENTA.length - 1)] ?? 12;
        this.bell(step, 0, 0.3, 0.085, ((arg % 5) - 2) * 0.14);
        break;
      }
      case 'choose': {
        // Выбор варианта: восходящие «ступени» — по индексу варианта.
        const step = PENTA[Math.min(Math.max(0, arg) * 2, PENTA.length - 1)] ?? 12;
        this.pluck(step + 4, 0, 0.16, 0.12, 0, 0.4);
        this.bell(step + 16, 0.02, 0.35, 0.035);
        break;
      }
      case 'toggle':
        // arg=1 — включено: вверх; arg=0 — выключено: вниз.
        if (arg > 0) {
          this.pluck(12, 0, 0.14, 0.11, -0.15);
          this.bell(19, 0.07, 0.5, 0.08, 0.15);
        } else {
          this.pluck(19, 0, 0.14, 0.1, 0.15);
          this.bell(10, 0.07, 0.45, 0.07, -0.15);
        }
        break;
      case 'play': {
        // Главный жест: тёплый гонг + разворачивающийся аккорд с перламутровым «перезвоном».
        this.bell(-21, 0, 1.6, 0.16);
        this.tone(110, 0, 0.35, 0.22, { toFreq: 70, wet: 0.2 });
        [3, 7, 10, 14, 19].forEach((n, i) => this.bell(n, 0.04 + i * 0.045, 0.95, 0.07, (i - 2) * 0.22));
        this.swoosh(500, 3200, 0, 0.35, 0.03);
        break;
      }
      case 'confirm':
        // Подтверждение: уверенный восходящий интервал (квинта) — «сделано».
        this.pluck(15, 0, 0.12, 0.11, -0.1, 0.35);
        this.bell(22, 0.075, 0.7, 0.1, 0.1);
        this.bell(34, 0.09, 0.5, 0.03, 0.2);
        break;
      case 'back':
        // Назад: мягкое нисходящее двузвучие, почти без блеска.
        this.pluck(10, 0, 0.14, 0.1, 0.1, 0.3);
        this.pluck(3, 0.075, 0.2, 0.09, -0.1, 0.35);
        break;
      case 'cancel':
        // Отмена: короткое «стирание» — вниз скользящий тон и глухой щелчок.
        this.tone(740, 0, 0.13, 0.08, { toFreq: 360, wet: 0.2 });
        this.pluck(3, 0.04, 0.1, 0.07, 0, 0.15);
        break;
      case 'skip':
        // Пропуск: два сухих «тик-так» разной высоты.
        this.pluck(12, 0, 0.07, 0.09, -0.15, 0.15);
        this.pluck(8, 0.09, 0.09, 0.08, 0.15, 0.15);
        break;
      case 'open':
        // Открыть панель: воздушный всплеск и три тихих восходящих звона.
        this.swoosh(700, 2600, 0, 0.22, 0.04);
        [15, 19, 22].forEach((n, i) => this.bell(n, 0.04 + i * 0.05, 0.5, 0.045, (i - 1) * 0.25));
        break;
      case 'place':
        // «Удар литеры»: глухой стук + сухой щелчок металла + тихий отзвук.
        this.tone(150, 0, 0.14, 0.36, { type: 'sine', toFreq: 58, wet: 0.15 });
        this.tone(1900, 0, 0.025, 0.09, { type: 'square', toFreq: 700 });
        this.tone(320, 0.01, 0.1, 0.12, { type: 'triangle', toFreq: 170 });
        this.bell(12, 0.05, 0.45, 0.05);
        break;
      case 'word': {
        // arg — длина слова: чем длиннее слово, тем богаче и выше арпеджио.
        const notes = [3, 7, 10, 15, 19, 22];
        const count = Math.min(notes.length, Math.max(3, arg - 1));
        for (let i = 0; i < count; i++) this.bell(notes[i]!, i * 0.07, 0.8, 0.095, (i - count / 2) * 0.12);
        this.bell(-9, 0, 0.9, 0.06);
        break;
      }
      case 'error':
        this.tone(170, 0, 0.16, 0.2, { type: 'triangle', toFreq: 118 });
        this.tone(140, 0.12, 0.2, 0.17, { type: 'triangle', toFreq: 96 });
        break;
      case 'opponent':
        this.bell(-2, 0, 0.45, 0.09, -0.2);
        this.bell(-9, 0.11, 0.6, 0.08, 0.2);
        break;
      case 'win':
        // Победа: восходящий мажорный каскад над глубоким колоколом.
        [3, 7, 10, 15, 19, 22, 27].forEach((n, i) => this.bell(n, i * 0.1, 1.3, 0.1, (i % 2 === 0 ? -1 : 1) * 0.25));
        this.bell(-21, 0, 2.2, 0.14);
        this.bell(-9, 0.1, 1.8, 0.09);
        this.swoosh(400, 4200, 0.35, 0.6, 0.03);
        break;
      case 'lose':
        // Поражение: нисходящая минорная тройка, глубокая и спокойная — без насмешки.
        [0, -3, -7].forEach((n, i) => this.bell(n - 5, i * 0.22, 1.1, 0.09, (1 - i) * 0.15));
        this.bell(-24, 0, 1.6, 0.09);
        break;
      case 'draw':
        this.bell(3, 0, 0.9, 0.1, -0.15);
        this.bell(3, 0.24, 1.1, 0.08, 0.15);
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
