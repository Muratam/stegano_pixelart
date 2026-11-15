"""VPiet の golden とサンプル用の小さいドット絵（PNG）を作る。標準ライブラリだけで動く。乱数は使わない。

  python3 -I tools/vpiet-golden/make_inputs.py <出力先のディレクトリ>
"""

import struct
import sys
import zlib
from pathlib import Path


def write_png(path: Path, w: int, h: int, pixels: list) -> None:
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            raw.extend(pixels[y * w + x])

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 2, 0, 0, 0)
    path.write_bytes(b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b""))


def from_rows(rows: list, palette: dict) -> tuple:
    h = len(rows)
    w = len(rows[0])
    return w, h, [palette[c] for row in rows for c in row]


HEART = [
    "................",
    "................",
    "...kkk....kkk...",
    "..krrrk..krrrk..",
    ".krwwrrkkrrrrrk.",
    ".krwrrrrrrrrrrk.",
    ".krrrrrrrrrrrrk.",
    ".krrrrrrrrrrrdk.",
    "..krrrrrrrrrdk..",
    "...krrrrrrrdk...",
    "....krrrrrdk....",
    ".....krrrdk.....",
    "......krdk......",
    ".......kk.......",
    "................",
    "................",
]

HOUSE = [
    "ssssssssssssssssssss",
    "ssssssssssssssssssss",
    "sssssssssrrsssssssss",
    "ssssssssrrrrssssssss",
    "sssssssrrrrrrsssssss",
    "ssssssrrrrrrrrssssss",
    "sssssrrrrrrrrrrsssss",
    "ssssrrrrrrrrrrrrssss",
    "sssrrrrrrrrrrrrrrsss",
    "ssssywwwwwwwwwwyssss",
    "ssssywwbbwwwwwwyssss",
    "ssssywwbbwwddwwyssss",
    "ssssywwwwwwddwwyssss",
    "ssssywwwwwwddwwyssss",
    "ssssyyyyyyyddyyyssss",
    "gggggggggggggggggggg",
    "gggggggggggggggggggg",
    "GGGGGGGGGGGGGGGGGGGG",
    "GGGGGGGGGGGGGGGGGGGG",
    "GGGGGGGGGGGGGGGGGGGG",
]

TREE = [
    "........................",
    "..........gggg..........",
    "........gggggggg........",
    ".......ggGGggggggg......",
    "......gggGGgggggggg.....",
    ".....gggggggggggGGgg....",
    ".....ggggggggggggGGg....",
    "....gggGGggggggggggggg..",
    "....ggggGGggggggggggg...",
    "...ggggggggggggGGgggggg.",
    "...gggggggggggggGGggggg.",
    "....gggggggggggggggggg..",
    ".....ggggggggggggggggg..",
    "......gggggggggggggg....",
    "........gggbbggggg......",
    "...........bb...........",
    "...........bb...........",
    "...........bb...........",
    "..........bbbb..........",
    ".........bbbbbb.........",
    "yyyyyyyyyyyyyyyyyyyyyyyy",
    "yyyyyyyyyyyyyyyyyyyyyyyy",
    "YYYYYYYYYYYYYYYYYYYYYYYY",
    "YYYYYYYYYYYYYYYYYYYYYYYY",
]


def main() -> None:
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    sets = {
        "heart.png": (HEART, {".": (245, 240, 230), "k": (40, 20, 30), "r": (230, 50, 70), "w": (255, 220, 225), "d": (160, 30, 50)}),
        "house.png": (HOUSE, {"s": (150, 200, 250), "r": (200, 70, 50), "y": (120, 80, 50), "w": (240, 230, 200), "b": (90, 150, 230), "d": (110, 70, 40), "g": (90, 190, 80), "G": (60, 140, 60)}),
        "tree.png": (TREE, {".": (170, 220, 250), "g": (60, 170, 70), "G": (30, 110, 50), "b": (120, 80, 40), "y": (230, 210, 140), "Y": (200, 170, 100)}),
    }
    for name, (rows, pal) in sets.items():
        w, h, px = from_rows(rows, pal)
        write_png(out / name, w, h, px)
        print(out / name, w, h)


if __name__ == "__main__":
    main()
