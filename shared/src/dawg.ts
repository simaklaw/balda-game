import { normalizeWord } from './letters';

interface DawgNode {
  /** Признак конца слова в этом узле. */
  fin: boolean;
  /** Переходы: буква → id узла. */
  to: Record<string, number>;
}

/**
 * Инкрементальный построитель DAWG (алгоритм Дачюка): слова вставляются
 * строго в возрастающем порядке, общие суффиксы минимизируются.
 * Внутренний класс — используйте Dawg.fromWords().
 */
export class DawgBuilder {
  private nodes: DawgNode[] = [{ fin: false, to: {} }];
  private register = new Map<string, number>();
  private lastWord = '';
  private path: number[] = [0];

  insert(word: string): void {
    if (word <= this.lastWord) {
      throw new Error(
        `DAWG input must be sorted, unique and non-empty: "${this.lastWord}" -> "${word}"`,
      );
    }
    let common = 0;
    while (
      common < word.length &&
      common < this.lastWord.length &&
      word[common] === this.lastWord[common]
    ) {
      common++;
    }
    for (let i = this.lastWord.length; i > common; i--) {
      const replacement = this.registerState(this.path[i]!);
      this.nodes[this.path[i - 1]!].to[this.lastWord[i - 1]!] = replacement;
    }
    let cur = this.path[common]!;
    this.path.length = common + 1;
    for (let i = common; i < word.length; i++) {
      const node = this.nodes.push({ fin: false, to: {} }) - 1;
      this.nodes[cur]!.to[word[i]!] = node;
      this.path.push(node);
      cur = node;
    }
    this.nodes[cur]!.fin = true;
    this.lastWord = word;
  }

  /** Завершает построение: минимизирует оставшиеся узлы и удаляет недостижимые. */
  finish(): DawgNode[] {
    for (let i = this.lastWord.length; i > 0; i--) {
      const replacement = this.registerState(this.path[i]!);
      this.nodes[this.path[i - 1]!].to[this.lastWord[i - 1]!] = replacement;
    }
    const order: number[] = [];
    const seen = new Set<number>([0]);
    const queue = [0];
    while (queue.length > 0) {
      const id = queue.shift()!;
      order.push(id);
      for (const t of Object.values(this.nodes[id]!.to)) {
        if (!seen.has(t)) {
          seen.add(t);
          queue.push(t);
        }
      }
    }
    const map = new Map<number, number>();
    order.forEach((oldId, idx) => map.set(oldId, idx));
    return order.map((oldId) => {
      const n = this.nodes[oldId]!;
      const to: Record<string, number> = {};
      for (const [c, t] of Object.entries(n.to)) to[c] = map.get(t)!;
      return { fin: n.fin, to };
    });
  }

  private registerState(s: number): number {
    const n = this.nodes[s]!;
    const key =
      (n.fin ? '1' : '0') + Object.keys(n.to).sort().map((c) => c + n.to[c]!).join('');
    const existing = this.register.get(key);
    if (existing !== undefined) return existing;
    this.register.set(key, s);
    return s;
  }
}

/**
 * DAWG (Directed Acyclic Word Graph) — минимизированный словарь.
 * Проверка слова — O(k), где k — число букв.
 */
export class Dawg {
  constructor(private nodes: DawgNode[]) {}

  static fromWords(words: Iterable<string>): Dawg {
    const list = [...new Set([...words].map(normalizeWord).filter((w) => w.length > 0))].sort();
    const builder = new DawgBuilder();
    for (const w of list) builder.insert(w);
    return new Dawg(builder.finish());
  }

  get size(): number {
    return this.nodes.length;
  }

  get rootId(): number {
    return 0;
  }

  /** Переход по букве из узла; -1, если перехода нет. */
  next(node: number, letter: string): number {
    const t = this.nodes[node]!.to[letter];
    return t === undefined ? -1 : t;
  }

  /** Является ли узел концом слова. */
  isWord(node: number): boolean {
    return this.nodes[node]!.fin;
  }

  /** Есть ли слово в словаре (с нормализацией). */
  has(word: string): boolean {
    const w = normalizeWord(word);
    if (w.length === 0) return false;
    let node = 0;
    for (const ch of w) {
      node = this.next(node, ch);
      if (node === -1) return false;
    }
    return this.isWord(node);
  }

  /** Есть ли продолжение строки в словаре (для перебора в ИИ). */
  isPrefix(prefix: string): boolean {
    const s = normalizeWord(prefix);
    let node = 0;
    for (const ch of s) {
      node = this.next(node, ch);
      if (node === -1) return false;
    }
    return true;
  }

  serialize(): string {
    return JSON.stringify(this.nodes);
  }

  static deserialize(data: string): Dawg {
    return new Dawg(JSON.parse(data) as DawgNode[]);
  }
}
