export type PlatformId = 'web' | 'yandex' | 'vk' | 'telegram';

/** Ключ-значение хранилище платформы (облачное, где доступно). */
export interface PlatformStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/** Строка нативного лидерборда платформы. */
export interface LeaderboardRow {
  /** Место в топе (1 — первый). */
  rank: number;
  /** Имя игрока (может быть пустым, если площадка его скрыла). */
  name: string;
  /** Лучший результат игрока. */
  score: number;
}

/**
 * Опциональная возможность платформы: нативный лидерборд (сейчас —
 * Яндекс Игры). Игровой код проверяет adapter.leaderboards перед вызовом;
 * на площадках без такого API поле отсутствует.
 */
export interface PlatformLeaderboards {
  /** Отправить результат: платформа сама хранит лучший результат игрока. */
  submitScore(score: number): Promise<void>;
  /** Топ нативного лидерборда; null — API недоступен или лидерборд не создан. */
  getTopScores(limit?: number): Promise<LeaderboardRow[] | null>;
}

/** Профиль игрока на площадке: имя и аватар (если площадка их отдаёт). */
export interface PlatformProfile {
  /** Стабильный id игрока на площадке (если есть). */
  id: string | null;
  name: string;
  /** https-ссылка на аватар или null. */
  avatarUrl: string | null;
}

/**
 * Социальные возможности площадки (VK/OK, браузерный share): пригласить
 * друга в комнату. Платформы без такого API (Яндекс Игры) поле не задают.
 */
export interface PlatformSocial {
  /** Пригласить друга сыграть в комнате roomId; true — окно показано/ссылка отправлена. */
  invite(roomId: string): Promise<boolean>;
}

/**
 * Абстракция платформы: веб, Яндекс Игры, VK Mini Apps, Telegram WebApp,
 * позже OK. Игровой код общается только с этим интерфейсом — конкретная
 * площадка подключается адаптером, логика игры не меняется.
 */
export interface PlatformAdapter {
  readonly id: PlatformId;
  /** Сообщить платформе, что игра загрузилась (обязательное требование Яндекс Игр). */
  ready(): Promise<void>;
  /** Имя игрока или null (не авторизован / площадка не поддерживает). */
  getPlayerName(): Promise<string | null>;
  /** Имя и аватар игрока; null — площадка их не отдаёт. */
  getProfile?(): Promise<PlatformProfile | null>;
  /** Приглашение друзей (только площадки с таким API). */
  readonly social?: PlatformSocial;
  /** Межстраничная реклама между партиями; резолвится после закрытия. */
  showInterstitial(): Promise<void>;
  storage: PlatformStorage;
  /** Нативный лидерборд, если площадка его предоставляет. */
  readonly leaderboards?: PlatformLeaderboards;
}
