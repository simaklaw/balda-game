# NOTICE — источники и лицензии

Код игры: MIT (см. `LICENSE`). Данные словаря перечислены ниже.

| Источник | Лицензия | Что взято | Атрибуция |
|---|---|---|---|
| [OpenCorpora](https://opencorpora.org/) (дамп 2019, набор Kaggle `rtatman/opencorpora-russian`) | проект указывает CC BY-SA без версии; Kaggle: поле 4.0, описание ссылается на 3.0 | леммы-существительные и граммемы → большая часть `words.txt`; право автора Kaggle переоформить upstream не подтверждено | `LICENSE-DATA`, `client/public/dict/SOURCES.md` |
| [Harrix/Russian-Nouns](https://github.com/Harrix/Russian-Nouns) (основа — ODict/Ефремова) | MIT © Sergienko Anton | список кандидатов | `LICENSES/Harrix-Russian-Nouns-MIT.txt` (копия в `dist/LICENSES/`) |
| Заголовки русского Викисловаря (дамп 2026-02; список [rus_dict_wiktionary](https://github.com/EgorTatarnikov/rus_dict_wiktionary), CC BY-SA 4.0, © Egor Tatarnikov) | CC BY-SA 4.0 | только факт существования заголовка (критерий отбора) | `LICENSE-DATA` |
| Русский Викисловарь (REST API) | CC BY-SA 4.0 | толкования в рантайме; в репозитории не хранятся | кэш `localStorage balda.def.<слово>` |

**Лицензии разделены:** код — MIT (`LICENSE`); проектный share-alike notice для составленного `words.txt` — CC BY-SA 4.0 (`LICENSE-DATA`), в пределах прав проекта и условий исходных лицензий. Источники сохраняют свои исходные лицензии. В частности, версия/условия Kaggle-выгрузки OpenCorpora требуют уточнения; поле Kaggle само по себе не доказывает полномочия загрузившего изменить upstream-лицензию. MIT-данные Harrix включены с отдельной атрибуцией.

Защищённые словари-PDF (Ожегов–Шведова, Шагалова) источником данных не являются и в репозитории не хранятся.

## OpenRussian
Порядок записей (tools/dict/sources/openrussian-nouns.tsv) получен из https://github.com/Badestrand/russian-dictionary (CC BY-SA 4.0, данные OpenRussian.org). Используется как эвристика для KPI покрытия и генерации стартовых пулов (shared/src/startWords.ts); числовое поле частотности в используемом файле не подтверждено, и этот источник не влияет на приёмку слов.
