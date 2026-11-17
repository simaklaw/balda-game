#!/usr/bin/env python3
"""S0.2: аудит словаря. Детерминирован. Печатает Markdown в stdout."""
import re, sys, collections
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
D = ROOT / "client/public/dict"
WORD_RE = re.compile(r"^[а-яё]{2,15}$")
norm = lambda w: w.strip().lower().replace("ё", "е")

def load(p):
    return [l.rstrip("\n") for l in p.read_text(encoding="utf-8").split("\n") if l.strip()]

base = load(D / "words.txt")
extra = load(D / "words-extra.txt") if (D / "words-extra.txt").exists() else []
nb = [norm(w) for w in base]
uniq = set(nb)
out = []
p = out.append
p("# Аудит словаря (baseline)\n")
p(f"- строк в words.txt: **{len(base)}**; уникальных после нормализации: **{len(uniq)}**; дублей: **{len(nb) - len(uniq)}**")
p(f"- строк в words-extra.txt: **{len(extra)}**; пересечение с base: **{len(uniq & {norm(w) for w in extra})}**")
byte2 = sum(len((w + "\n").encode()) for w in nb if len(w) == 2)
p(f"- слов длины 2: **{sum(1 for w in nb if len(w) == 2)}** ({byte2} Б) — ни один конфиг их не принимает (minWordLength 3/4)")
p(f"- не проходят WORD_RE: **{sum(1 for w in base if not WORD_RE.fullmatch(w))}**")
for name, rx in [("не-кириллица", r"[^а-яёА-ЯЁ\-' ]"), ("дефис", r"-"), ("пробел", r" "), ("апостроф", r"'")]:
    p(f"- с {name}: **{sum(1 for w in base if re.search(rx, w))}**")
p("\n## Распределение по длинам\n\n| длина | слов |\n|---|---|")
for l, c in sorted(collections.Counter(len(w) for w in nb).items()):
    p(f"| {l} | {c} |")
srt = sorted(uniq, key=lambda w: (-len(w), w))
p("\n## Топ-50 самых длинных\n\n" + ", ".join(srt[:50]))
print("\n".join(out))
