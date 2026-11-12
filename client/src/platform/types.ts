export type PlatformId = 'web' | 'yandex';

/** Ключ-значение хранилище платформы (облачное, где доступно). */
export interface PlatformStorage {
  get(key: string): Promise<string | null>;
  set(key: string, value: string): Promise<void>;
  remove(key: string): Promise<void>;
}

/**
 * Абстракция платформы: веб, Яндекс Игры, позже VK/OK/Telegram.
 * Игровой код общается только с этим интерфейсом — конкретная площадка
 * подключается адаптером, логика игры не меняется.
 */
export interface PlatformAdapter {
  readonly id: PlatformId;
  /** Сообщить платформе, что игра загрузилась (обязательное требование Яндекс Игр). */
  ready(): Promise<void>;
  /** Имя игрока или null (не авторизован / площадка не поддерживает). */
  getPlayerName(): Promise<string | null>;
  /** Межстраничная реклама между партиями; резолвится после закрытия. */
  showInterstitial(): Promise<void>;
  storage: PlatformStorage;
}
