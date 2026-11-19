# Источники словаря

Словарь собирается **скриптом** `tools/dict/build.py` (не руками) и описывается `MANIFEST.json`
(источники, sha256, правила, счётчики). Итог: **67291** слов в одном файле `words.txt` (sha256 `2fada0429d14…`).

**Лицензии.** Данные словаря — CC BY-SA 4.0 (`LICENSE-DATA`); код игры — MIT (`LICENSE`).
Разделение обязательно: OpenCorpora и Викисловарь — CC BY-SA, поэтому `words.txt` — производный объект под SA.

## Источники

| Источник | Лицензия | Роль |
|---|---|---|
| [OpenCorpora](https://opencorpora.org/) (дамп 2019, через Kaggle) | CC BY-SA 3.0 | контур A: леммы-существительные с разметкой (в т.ч. `Pltm`), морфоанализ кандидатов |
| [Harrix/Russian-Nouns](https://github.com/Harrix/Russian-Nouns) (основа — ODict/Ефремова) | MIT, © Sergienko Anton | кандидаты контура B; текст лицензии — `LICENSES/Harrix-Russian-Nouns-MIT.txt` |
| Заголовки русского Викисловаря (дамп 2026-02, список из [rus_dict_wiktionary](https://github.com/EgorTatarnikov/rus_dict_wiktionary)) | CC BY-SA 4.0 | «второй свидетель» существования слова (в словарь сами по себе слова не попадают) |
| Неологизмы XXI в. (574 слова-кандидата) | список слов | принимаются только при подтверждении OpenCorpora/Викисловарём |

Защищённые словари-PDF (Ожегов–Шведова, Шагалова) в репозиторий и в историю **не входят**.

## Правила отбора (по порядку; детали — docstring `tools/dict/build.py`)
1. Формат `[а-яе]{2,15}` после нормализации (строчные, «ё» → «е»).
2. `allowlist.txt` — ручная вычитка, приоритет над блок-листом.
3. `blocklist.txt` — ТОЧНЫЕ формы (ненормативная лексика, оскорбительные этнонимы). Подстроки и префиксы не используются.
4. Лемма-существительное OpenCorpora без граммем Name/Surn/Patr/Geox/Orgn/Trad/Abbr/Erro/Dist/Init; ед.ч. или `Pltm` (pluralia tantum).
5. Кандидаты Harrix, которых нет среди лемм OpenCorpora: падежные/числовые формы и не-существительные отклоняются; слова, неизвестные OpenCorpora, принимаются только при наличии в Викисловаре.

## Итог сборки
Принято по правилам: allowlist — 232, harrix+wikt — 8500, oc-lemma — 58533, variant-nom — 26.
Отклонено: blocklist — 40, form-of — 457, not-noun-lemma — 128, proper-or-abbr — 143, unverified — 1486 (список с причинами — `tools/dict/rejected.tsv`, очередь вычитки).

## Воспроизводимость
`python3 tools/dict/verify.py` пересобирает словарь из закоммиченных источников и сверяет sha256 с `words.txt`.
Сырые дампы (OpenCorpora 282 МБ, Викисловарь) в репозитории не хранятся; их sha256 — в `tools/dict/sources/sources.json`,
выжимки — `tools/dict/sources/oc-extract.tsv`, `wikt-witness.txt` (получены `extract_oc.py`, `extract_wikt.py`).

## Толкования слов
Русский Викисловарь (REST API), CC BY-SA 4.0. Толкования не хранятся в репозитории; кэш localStorage `balda.def.<слово>`.
