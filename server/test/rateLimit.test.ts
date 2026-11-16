import { describe, expect, it } from 'vitest';
import { createRateLimiter } from '../src/rateLimit';

describe('createRateLimiter', () => {
  it('пропускает до лимита, дальше блокирует', () => {
    const t = 1000;
    const limiter = createRateLimiter({ limit: 3, windowMs: 60_000, now: () => t });
    expect(limiter.allow('ip1')).toBe(true);
    expect(limiter.allow('ip1')).toBe(true);
    expect(limiter.allow('ip1')).toBe(true);
    expect(limiter.allow('ip1')).toBe(false);
    expect(limiter.allow('ip1')).toBe(false);
  });

  it('окно истекло — счётчик сбрасывается', () => {
    let t = 1000;
    const limiter = createRateLimiter({ limit: 2, windowMs: 60_000, now: () => t });
    expect(limiter.allow('ip1')).toBe(true);
    expect(limiter.allow('ip1')).toBe(true);
    expect(limiter.allow('ip1')).toBe(false);
    t += 60_000;
    expect(limiter.allow('ip1')).toBe(true);
    expect(limiter.allow('ip1')).toBe(true);
    expect(limiter.allow('ip1')).toBe(false);
  });

  it('ключи независимы: чужой IP не страдает от чужого лимита', () => {
    const t = 1000;
    const limiter = createRateLimiter({ limit: 1, windowMs: 60_000, now: () => t });
    expect(limiter.allow('ip1')).toBe(true);
    expect(limiter.allow('ip1')).toBe(false);
    expect(limiter.allow('ip2')).toBe(true);
    expect(limiter.allow('ip3')).toBe(true);
    expect(limiter.size()).toBe(3);
  });

  it('просроченные ключи вычищаются при переполнении карты', () => {
    let t = 1000;
    const limiter = createRateLimiter({ limit: 1, windowMs: 5_000, now: () => t });
    // 10 000+ одноразовых ключей из «прошлого» — карта упирается в потолок.
    for (let i = 0; i < 10_050; i++) {
      limiter.allow('old-' + i);
    }
    expect(limiter.size()).toBeGreaterThan(10_000);
    // Время пошло вперёд: все старые ключи просрочены, новый запрос
    // запускает чистку — размер карты резко падает.
    t += 6_000;
    expect(limiter.allow('fresh')).toBe(true);
    expect(limiter.size()).toBe(1);
  });

  it('внутри окна старые запросы ключа не забываются при частичных обновлениях', () => {
    let t = 1000;
    const limiter = createRateLimiter({ limit: 2, windowMs: 10_000, now: () => t });
    expect(limiter.allow('a')).toBe(true);
    t += 4_000;
    expect(limiter.allow('a')).toBe(true);
    t += 4_000;
    // Всё ещё то же окно (8 c < 10 c): лимит исчерпан.
    expect(limiter.allow('a')).toBe(false);
    t += 3_000;
    // 11 c от старта окна — новое окно.
    expect(limiter.allow('a')).toBe(true);
  });
});
