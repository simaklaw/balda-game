/**
 * Счётчики и датчики в формате Prometheus (text/plain; version=0.0.4)
 * без внешних зависимостей. /health отвечает на вопрос «жив ли сервер»,
 * /metrics — на вопрос «что происходит»: соединения, ходы, ошибки.
 */
export class Metrics {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, () => number>();

  /** Увеличить счётчик (по умолчанию на 1). */
  inc(name: string, delta = 1): void {
    if (!Number.isFinite(delta)) return;
    this.counters.set(name, (this.counters.get(name) ?? 0) + delta);
  }

  /** Зарегистрировать датчик: значение читается при каждой выгрузке. */
  gauge(name: string, read: () => number): void {
    this.gauges.set(name, read);
  }

  /** Текущее значение счётчика (для тестов и отладки). */
  get(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  /** Выгрузка в текстовом формате Prometheus. */
  render(): string {
    const lines: string[] = [];
    for (const [name, value] of this.counters) {
      lines.push('# TYPE ' + name + ' counter', name + ' ' + value);
    }
    for (const [name, read] of this.gauges) {
      let value = 0;
      try {
        value = read();
      } catch {
        /* сломанный датчик не должен ломать выгрузку */
      }
      lines.push('# TYPE ' + name + ' gauge', name + ' ' + value);
    }
    return lines.length === 0 ? '' : lines.join('\n') + '\n';
  }
}
