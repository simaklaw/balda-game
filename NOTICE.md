# NOTICE — источники и лицензии

Код игры: MIT (см. `LICENSE`). Данные словаря перечислены ниже.

| Источник | Лицензия | Что взято | Атрибуция |
|---|---|---|---|
| [OpenCorpora](https://opencorpora.org/) (дамп 2019, набор Kaggle `rtatman/opencorpora-russian`) | CC BY-SA 3.0 (проверить на первоисточнике) | леммы-существительные и граммемы → большая часть `words.txt` | `LICENSE-DATA`, `client/public/dict/SOURCES.md` |
| [Harrix/Russian-Nouns](https://github.com/Harrix/Russian-Nouns) (основа — ODict/Ефремова) | MIT © Sergienko Anton | список кандидатов | `LICENSES/Harrix-Russian-Nouns-MIT.txt` (копия в `dist/LICENSES/`) |
| Заголовки русского Викисловаря (дамп 2026-02; список [rus_dict_wiktionary](https://github.com/EgorTatarnikov/rus_dict_wiktionary), CC BY-SA 4.0, © Egor Tatarnikov) | CC BY-SA 4.0 | только факт существования заголовка (критерий отбора) | `LICENSE-DATA` |
| Русский Викисловарь (REST API) | CC BY-SA 4.0 | толкования в рантайме; в репозитории не хранятся | кэш `localStorage balda.def.<слово>` |

**Лицензии разделены:** код — MIT (`LICENSE`); данные словаря — CC BY-SA 4.0 (`LICENSE-DATA`), т.к. `words.txt` —
производный объект от данных под share-alike. MIT-данные (Harrix) в CC BY-SA произведение включать можно, обратное — нет.

Защищённые словари-PDF (Ожегов–Шведова, Шагалова) источником данных не являются и в репозитории не хранятся.
