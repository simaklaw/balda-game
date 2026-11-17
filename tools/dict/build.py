#!/usr/bin/env python3
"""S2 (автономный контур): sources/harrix-base.txt -> client/public/dict/words.txt + MANIFEST.json.
Детерминирован: тот же вход -> тот же выход побайтово. Без сети и без LLM.
Контур A (OpenCorpora/Викисловарь) и морфофильтр pymorphy3 пока НЕ подключены (нет доступа к источникам)."""
import hashlib, json, re, sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = HERE.parents[1]
OUT_DIR = ROOT / "client/public/dict"
WORD_RE = re.compile(r"^[а-яё]{2,15}$")
MIN_LEN = 2  # TODO S3.4: поднять до 3 после теста на ИИ


def norm(w: str) -> str:
    return w.strip().lower().replace("ё", "е")


def read_list(p: Path) -> dict[str, str]:
    d = {}
    for line in p.read_text(encoding="utf-8").split("\n"):
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        word, _, why = line.partition("#")
        d[norm(word)] = why.strip()
    return d


def sha(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()


def build():
    src_path = HERE / "sources/harrix-base.txt"
    src = src_path.read_bytes()
    block, allow = read_list(HERE / "blocklist.txt"), read_list(HERE / "allowlist.txt")
    words, rejected = set(), []
    for raw in src.decode("utf-8").split("\n"):
        if not raw.strip():
            continue
        w = norm(raw)
        if not WORD_RE.fullmatch(w) or len(w) < MIN_LEN:
            rejected.append((w, "format"))
        elif w in block and w not in allow:
            rejected.append((w, "blocklist"))
        else:
            words.add(w)
    from_base = len(words)
    for w in allow:
        if WORD_RE.fullmatch(w) and w not in words:
            words.add(w)
    out = ("\n".join(sorted(words)) + "\n").encode("utf-8")
    reasons: dict[str, int] = {}
    for _, r in rejected:
        reasons[r] = reasons.get(r, 0) + 1
    manifest = {
        "sources": [{"name": "Harrix/Russian-Nouns (ODict/Ефремова)", "license": "MIT",
                     "url": "https://github.com/Harrix/Russian-Nouns", "file": "tools/dict/sources/harrix-base.txt",
                     "sha256": sha(src)}],
        "rules": {"minLen": MIN_LEN, "maxLen": 15, "format": "^[а-яе]{2,15}$ после ё→е",
                  "blocklist": "точные формы (tools/dict/blocklist.txt)", "allowlist": "tools/dict/allowlist.txt",
                  "morphology": "не применялась (pymorphy3 недоступен); контур A не подключён"},
        "counts": {"total": len(words), "fromBase": from_base, "fromAllowlist": len(words) - from_base,
                   "rejected": dict(sorted(reasons.items()))},
        "outputSha256": sha(out),
    }
    return out, manifest, rejected


def main():
    out, manifest, rejected = build()
    OUT_DIR.joinpath("words.txt").write_bytes(out)
    OUT_DIR.joinpath("MANIFEST.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    HERE.joinpath("rejected.tsv").write_text("".join(f"{w}\t{r}\n" for w, r in sorted(rejected)), encoding="utf-8")
    print(f"words.txt: {manifest['counts']['total']} слов; отклонено: {manifest['counts']['rejected']}; sha256 {manifest['outputSha256'][:12]}")


if __name__ == "__main__":
    main()
