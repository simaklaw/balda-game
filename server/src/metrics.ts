/**
 * Счётчики и датчики в формате Prometheus (text/plain; version=0.0.4)
 * без внешних зависимостей. /health отвечает на вопрос «жив ли сервер»,
 * /metrics — на вопрос «что происходит»: соединения, ходы, ошибки.
 */
export class Metrics {
  private readonly counters = new Map<string, number>();
  private readonly gauges = new Map<string, () => number>();

  /** Ключ счётчика: name или name{label="value",...}. */
  private key(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) return name;
    const parts = Object.keys(labels)
      .sort()
      .map((k) => k + '="' + String(labels[k]).replace(/\\/g, '\\\\').replace(/"/g, '\\"') + '"');
    return name + '{' + parts.join(',') + '}';
  }

  /** Увеличить счётчик (по умолчанию на 1). Опциональные labels → Prometheus labels. */
  inc(name: string, deltaOrLabels: number | Record<string, string> = 1, maybeDelta = 1): void {
    let labels: Record<string, string> | undefined;
    let delta = 1;
    if (typeof deltaOrLabels === 'number') {
      delta = deltaOrLabels;
    } else {
      labels = deltaOrLabels;
      delta = maybeDelta;
    }
    if (!Number.isFinite(delta)) return;
    const k = this.key(name, labels);
    this.counters.set(k, (this.counters.get(k) ?? 0) + delta);
  }

  /** Зарегистрировать датчик: значение читается при каждой выгрузке. */
  gauge(name: string, read: () => number): void {
    this.gauges.set(name, read);
  }

  /** Текущее значение счётчика (для тестов и отладки). Без labels. */
  get(name: string): number {
    return this.counters.get(name) ?? 0;
  }

  /** Выгрузка в текстовом формате Prometheus. */
  render(): string {
    const lines: string[] = [];
    // Group by metric base name for TYPE lines
    const seenTypes = new Set<string>();
    for (const [key, value] of this.counters) {
      const base = key.includes('{') ? key.slice(0, key.indexOf('{')) : key;
      if (!seenTypes.has(base)) {
        lines.push('# TYPE ' + base + ' counter');
        seenTypes.add(base);
      }
      lines.push(key + ' ' + value);
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
