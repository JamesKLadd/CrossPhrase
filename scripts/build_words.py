"""Build the bundled word data from the curated lists in scripts/words/.

Annotates every word with its Zipf frequency (via the `wordfreq` package) and
writes:
  - src/data/words.json                       full data used by the app
  - supabase/functions/_shared/dictionary.json  word -> parts of speech, which
                                                 the judge endpoint validates against

Usage (from the repo root):
  python3 -m venv .venv && .venv/bin/pip install -r scripts/requirements.txt
  .venv/bin/python scripts/build_words.py
"""

import json
import re
from pathlib import Path

from wordfreq import zipf_frequency

ROOT = Path(__file__).resolve().parent.parent
SOURCES = ROOT / "scripts" / "words"
APP_OUT = ROOT / "src" / "data" / "words.json"
SERVER_OUT = ROOT / "supabase" / "functions" / "_shared" / "dictionary.json"

POS_TAGS = {"noun", "verb", "adj", "adv", "det", "pron", "prep", "conj", "interj"}
WORD_RE = re.compile(r"^[a-z]+(?:['-][a-z]+)*$")


def parse_list(path: Path) -> dict[str, set[str]]:
    words: dict[str, set[str]] = {}
    for lineno, raw in enumerate(path.read_text().splitlines(), 1):
        line = raw.split("#", 1)[0].strip()
        if not line:
            continue
        tag, sep, rest = line.partition(":")
        tag = tag.strip()
        if not sep or tag not in POS_TAGS:
            raise SystemExit(f"{path.name}:{lineno}: expected '<pos>: words', got {raw!r}")
        for word in rest.split():
            word = word.lower()
            if not WORD_RE.match(word):
                raise SystemExit(f"{path.name}:{lineno}: bad word {word!r}")
            words.setdefault(word, set()).add(tag)
    return words


def main() -> None:
    entries: dict[str, set[str]] = {}
    pools: dict[str, list[str]] = {}
    for path in sorted(SOURCES.glob("*.txt")):
        parsed = parse_list(path)
        pools[path.stem] = sorted(parsed)
        for word, tags in parsed.items():
            entries.setdefault(word, set()).update(tags)

    if "core" not in pools:
        raise SystemExit("scripts/words/core.txt is required")

    words = {
        word: {"pos": sorted(tags), "zipf": zipf_frequency(word, "en")}
        for word, tags in sorted(entries.items())
    }
    missing = [w for w, d in words.items() if d["zipf"] == 0]
    if missing:
        raise SystemExit(f"words unknown to wordfreq (typo?): {', '.join(missing)}")

    # One word per line keeps diffs of the generated file readable.
    word_lines = ",\n".join(f"  {json.dumps(w)}: {json.dumps(d)}" for w, d in words.items())
    pool_lines = ",\n".join(f"  {json.dumps(k)}: {json.dumps(v)}" for k, v in pools.items())
    APP_OUT.parent.mkdir(parents=True, exist_ok=True)
    APP_OUT.write_text(f'{{"words": {{\n{word_lines}\n}},\n"pools": {{\n{pool_lines}\n}}}}\n')
    SERVER_OUT.parent.mkdir(parents=True, exist_ok=True)
    SERVER_OUT.write_text(json.dumps({w: d["pos"] for w, d in words.items()}) + "\n")
    print(f"{len(words)} words, pools: " + ", ".join(f"{k}={len(v)}" for k, v in pools.items()))


if __name__ == "__main__":
    main()
