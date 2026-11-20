"""Тесты пайплайна словаря. Запуск: python3 -I -m unittest discover -s tools/dict -p 'test_*.py'"""
import json, hashlib, sys, unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import build
from common import HERE, WORD_RE, norm

WORDS_PATH = build.OUT_DIR / "words.txt"


def fixture(name):
    return [l.strip() for l in (HERE / name).read_text(encoding="utf-8").split("\n") if l.strip() and not l.startswith("#")]


class DecideRules(unittest.TestCase):
    OC = {
        "небо": ("noun-ok", "sing"), "весы": ("noun-ok", "Pltm"), "парис": ("noun-excluded", "Name"),
        "ада": ("form", "ад:NOUN:NOUN,inan,masc sing,gent"), "счастье": ("form", "счастие:NOUN:NOUN,inan,neut sing,nomn"),
        "бежать": ("nonnoun", "INFN"), "ботинки": ("form", "ботинок:NOUN:NOUN,inan,masc plur,nomn"),
    }
    WIKT = {"счастье", "ботинки", "редкоеслово", "ада"}

    def d(self, w, block=(), allow=()):
        return build.decide(w, self.OC, self.WIKT, set(block), set(allow))

    def test_lemma(self): self.assertEqual(self.d("небо"), (True, "oc-lemma"))
    def test_pltm(self): self.assertEqual(self.d("весы"), (True, "oc-lemma"))
    def test_proper(self): self.assertEqual(self.d("парис"), (False, "proper-or-abbr:Name"))
    def test_case_form(self): self.assertEqual(self.d("ада"), (False, "form-of:ад"))
    def test_plural_form(self): self.assertEqual(self.d("ботинки"), (False, "form-of:ботинок"))
    def test_variant(self): self.assertEqual(self.d("счастье"), (True, "variant-nom"))
    def test_verb(self): self.assertEqual(self.d("бежать"), (False, "not-noun-lemma:INFN"))
    def test_wikt_witness(self): self.assertEqual(self.d("редкоеслово"), (True, "harrix+wikt"))
    def test_unverified(self): self.assertEqual(self.d("гагакание"), (False, "unverified"))
    def test_format(self):
        for bad in ("а", "слово-слово", "latin", "абвгдежзийклмноп"):
            self.assertEqual(self.d(bad), (False, "format"))
    def test_blocklist_exact_not_substring(self):
        # «еб» в блок-листе не должен задевать «небо»: блок-лист сравнивается по точной форме
        self.assertEqual(self.d("небо", block={"еб"}), (True, "oc-lemma"))
        self.assertEqual(self.d("небо", block={"небо"}), (False, "blocklist"))
    def test_allow_beats_block(self): self.assertEqual(self.d("небо", block={"небо"}, allow={"небо"}), (True, "allowlist"))


class BuiltDictionary(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.lines = WORDS_PATH.read_text(encoding="utf-8").split("\n")
        cls.words = set(cls.lines[:-1])
        cls.manifest = json.loads((build.OUT_DIR / "MANIFEST.json").read_text(encoding="utf-8"))

    def test_format(self):
        self.assertEqual(self.lines[-1], "")
        for w in self.lines[:-1]: self.assertRegex(w, WORD_RE)

    def test_sorted_unique(self):
        body = self.lines[:-1]
        self.assertEqual(body, sorted(set(body)))

    def test_canary(self):
        self.assertEqual([w for w in fixture("fixtures.canary.txt") if norm(w) not in self.words], [])

    def test_positive(self):
        self.assertEqual([w for w in fixture("fixtures.positive.txt") if norm(w) not in self.words], [])

    def test_negative(self):
        self.assertEqual([w for w in fixture("fixtures.negative.txt") if norm(w) in self.words], [])

    def test_blocklist_absent(self):
        allow = build.read_list(HERE / "allowlist.txt")
        bl = [w for w in build.read_list(HERE / "blocklist.txt") if w not in allow]
        self.assertEqual([w for w in bl if w in self.words], [])

    def test_owner_exclusions_absent(self):
        excluded = {"негр", "негритянка", "подонок", "погань", "мразь", "ублюдок"}
        self.assertTrue(excluded.isdisjoint(self.words))

    def test_manifest_matches_file(self):
        self.assertEqual(self.manifest["outputSha256"], hashlib.sha256(WORDS_PATH.read_bytes()).hexdigest())
        self.assertEqual(self.manifest["counts"]["total"], len(self.words))

    def test_reproducible(self):
        out, _, _ = build.build()
        self.assertEqual(out, WORDS_PATH.read_bytes())


class StartWordsTests(unittest.TestCase):
    def test_pools_up_to_date_and_valid(self):
        import start_words
        self.assertEqual(start_words.OUT.read_text(encoding="utf-8"), start_words.generate(),
                         "startWords.ts устарел — запустите python3 tools/dict/start_words.py")

    def test_pools_in_dictionary_with_right_length(self):
        import re
        import start_words
        words = set(build.read_words(WORDS_PATH)) if hasattr(build, "read_words") else set(WORDS_PATH.read_text(encoding="utf-8").split())
        text = start_words.OUT.read_text(encoding="utf-8")
        for size in (3, 5, 7):
            body = re.search(r"  %d: \[(.*?)\n  \]," % size, text, re.S).group(1)
            pool = re.findall(r"'([а-я]+)'", body)
            self.assertGreater(len(pool), 100)
            self.assertEqual(len(pool), len(set(pool)))
            for w in pool:
                self.assertEqual(len(w), size, w)
                self.assertIn(w, words, w)


if __name__ == "__main__":
    unittest.main()
