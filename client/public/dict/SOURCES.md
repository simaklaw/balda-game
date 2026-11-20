# Источники словаря

Словарь собирается **скриптом** `tools/dict/build.py` (не руками) и описывается `MANIFEST.json`
(источники, sha256, правила, счётчики). Итог: **67296** слов в одном файле `words.txt` (sha256 `5445c6e6c077…`).

**Лицензии.** Данные словаря — CC BY-SA 4.0 (`LICENSE-DATA`); код игры — MIT (`LICENSE`).
Разделение обязательно: OpenCorpora и Викисловарь — CC BY-SA, поэтому `words.txt` — производный объект под SA.

## Источники

| Источник | Лицензия | Роль |
|---|---|---|
| [OpenCorpora](https://opencorpora.org/) (дамп 2019, Kaggle `rtatman/opencorpora-russian`) | CC BY-SA заявлена проектом, версия неизвестна; Kaggle противоречив: поле 4.0, описание ссылается на 3.0 | контур A: леммы-существительные с разметкой (в т.ч. `Pltm`), морфоанализ кандидатов; права на переоформление upstream не подтверждены — см. `LICENSE-DATA` |
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
Принято по правилам: allowlist — 243, harrix+wikt — 8500, oc-lemma — 58527, variant-nom — 26.
Отклонено: blocklist — 46, form-of — 457, not-noun-lemma — 128, proper-or-abbr — 143, unverified — 1486 (список с причинами — `tools/dict/rejected.tsv`, очередь вычитки).

## Воспроизводимость
`python3 tools/dict/verify.py` пересобирает словарь из закоммиченных источников и сверяет sha256 с `words.txt`.
Сырые дампы (OpenCorpora 282 МБ, Викисловарь) в репозитории не хранятся; их sha256 — в `tools/dict/sources/sources.json`,
выжимки — `tools/dict/sources/oc-extract.tsv`, `wikt-witness.txt` (получены `extract_oc.py`, `extract_wikt.py`).

## Толкования слов
Русский Викисловарь (REST API), CC BY-SA 4.0. Толкования не хранятся в репозитории; кэш localStorage `balda.def.<слово>`.

## OpenRussian (частотный прокси)
Badestrand/russian-dictionary (OpenRussian.org), CC BY-SA 4.0. Порядок строк используется как эвристика для KPI покрытия и отбора стартовых слов; подтверждённого числового поля частотности нет. Не источник приёмки слов.
