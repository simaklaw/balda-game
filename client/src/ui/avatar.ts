import { Texture } from 'pixi.js';

const cache = new Map<string, Texture | null>();

/**
 * Загружает аватар игрока по https-ссылке. Любой сбой (CORS, сеть, таймаут)
 * даёт null — тогда в интерфейсе остаётся плитка-инициал.
 */
export function loadAvatar(url: string | null | undefined, timeoutMs = 4000): Promise<Texture | null> {
  if (url === null || url === undefined || !url.startsWith('https://')) return Promise.resolve(null);
  const cached = cache.get(url);
  if (cached !== undefined) return Promise.resolve(cached);
  return new Promise<Texture | null>((resolve) => {
    let settled = false;
    const done = (texture: Texture | null): void => {
      if (settled) return;
      settled = true;
      cache.set(url, texture);
      resolve(texture);
    };
    const timer = setTimeout(() => done(null), timeoutMs);
    try {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        clearTimeout(timer);
        try {
          done(Texture.from(img));
        } catch {
          done(null);
        }
      };
      img.onerror = () => {
        clearTimeout(timer);
        done(null);
      };
      img.src = url;
    } catch {
      clearTimeout(timer);
      done(null);
    }
  });
}
