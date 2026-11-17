#!/usr/bin/env python3
"""Пересобирает словарь в памяти и сверяет sha256 с закоммиченными words.txt и MANIFEST.json."""
import hashlib, json, sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent))
import build

out, manifest, _ = build.build()
committed = (build.OUT_DIR / "words.txt").read_bytes()
mf = json.loads((build.OUT_DIR / "MANIFEST.json").read_text(encoding="utf-8"))
h = hashlib.sha256(committed).hexdigest()
ok = h == manifest["outputSha256"] == mf["outputSha256"] and committed == out
print(("OK" if ok else "FAIL") + f": rebuilt {manifest['outputSha256'][:12]}, committed {h[:12]}, manifest {mf['outputSha256'][:12]}")
sys.exit(0 if ok else 1)
