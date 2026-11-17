# NOTICE — источники и лицензии

Код игры: MIT (см. `LICENSE`). Данные словаря перечислены ниже.

| Источник | Лицензия | Что взято | Атрибуция |
|---|---|---|---|
| [Harrix/Russian-Nouns](https://github.com/Harrix/Russian-Nouns) | MIT © Sergienko Anton | список существительных, основа `client/public/dict/words.txt` | `LICENSES/Harrix-Russian-Nouns-MIT.txt` (копия в `dist/LICENSES/`) |
| Т. Ф. Ефремова, толковый словарь (первооснова Harrix, через ODict) | см. upstream Harrix | косвенно, через Harrix | через Harrix |
| Русский Викисловарь (REST API) | CC BY-SA 4.0 | только толкования в рантайме; в репозитории не хранятся | кэш `localStorage balda.def.<слово>` |

Защищённые словари-PDF (Ожегов–Шведова, Шагалова) в репозиторий не входят и источником
данных словаря не являются.

TODO (S1.3): если в пайплайн войдут данные OpenCorpora или Викисловаря (CC BY-SA),
`words.txt` станет производным объектом под CC BY-SA — добавить `LICENSE-DATA` и обновить таблицу.
