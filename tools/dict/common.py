"""Общие правила формата/нормализации. Должны совпадать с client/src/dict/dictionary.ts и shared/src/letters.ts."""
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
SRC = HERE / "sources"
WORD_RE = re.compile(r"^[а-яе]{2,15}$")  # после нормализации ё→е


def norm(w: str) -> str:
    return w.strip().lower().replace("ё", "е")


def read_words(p: Path) -> list[str]:
    return [l.rstrip("\n") for l in p.read_text(encoding="utf-8-sig").split("\n") if l.strip()]


def candidates(for_extract: bool = False) -> set[str]:
    """Сырые кандидаты контура B: Harrix + 574 неологизма (extra-candidates.txt).
    for_extract=True добавляет существительные OpenRussian: для них извлекается морфоанализ OC и свидетель Викисловаря
    (нужно для KPI полноты), но в приёмку слов OpenRussian НЕ участвует — он не отличает имена собственные
    и содержит грубую лексику (проверено вычиткой: из 415 добавленных им слов большинство — мат, имена, топонимы)."""
    c = set()
    for name in ("harrix-russian_nouns.txt", "extra-candidates.txt"):
        c |= {norm(w) for w in read_words(SRC / name)}
    if for_extract:
        c |= {l.split("\t")[1] for l in (SRC / "openrussian-nouns.tsv").read_text(encoding="utf-8").split("\n") if l}
    return {w for w in c if WORD_RE.fullmatch(w)}
