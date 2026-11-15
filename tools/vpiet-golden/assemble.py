"""tools/vpiet-golden/make.sh の出力（ケースごとの JSON）を web/test/vpiet-golden/golden.json にまとめる。

  python3 -I tools/vpiet-golden/assemble.py <ケースの JSON のディレクトリ> <出力の golden.json>
"""

import json
import os
import sys

TEXTS = {"apple_piet": "PIET", "apple_hi": "Hi", "dosei_ok": "OK", "heart_piet": "Piet", "house_hello": "Hello"}
# 元でも見つからない（Nim の assert で止まる）組み合わせ
FAILURES = {"heart_ja": "あ"}


def main() -> None:
    src, dst = sys.argv[1], sys.argv[2]
    here = os.path.dirname(os.path.abspath(__file__))
    out = {"nim": "1.2.18", "vpiet": "d3adcbb", "cases": [], "failures": []}
    for name, text in TEXTS.items():
        d = json.load(open(os.path.join(src, name + ".json")))
        out["distance"] = d.pop("distance")
        d.pop("seconds", None)
        d["input"] = os.path.basename(d["input"])
        d.update(name=name, text=text)
        out["cases"].append(d)
    for name, text in FAILURES.items():
        lines = open(os.path.join(here, "cases", name + ".txt")).read().split("\n")
        out["failures"].append({
            "name": name, "input": lines[0].strip(), "text": text,
            "params": [int(v) for v in lines[1].split()],
            "orders": [line.strip() for line in lines[2:] if line.strip()],
            "nim": "front.len() > 0 の assert で止まる（最後まで実行する画像が見つからない）",
        })
    json.dump(out, open(dst, "w"), ensure_ascii=False, separators=(",", ":"))


if __name__ == "__main__":
    main()
