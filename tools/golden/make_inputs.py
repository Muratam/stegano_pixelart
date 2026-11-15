"""golden 用の合成ドット絵（PNG）を作る。標準ライブラリだけで動く。

  python3 -I tools/golden/make_inputs.py <出力先のディレクトリ>

乱数は使わない（同じ入力が毎回できる）。sprite_rgba.png だけ透過（RGBA）。
"""

import math
import struct
import sys
import zlib
from pathlib import Path


def write_png(path: Path, w: int, h: int, pixels: list, alpha: bool = False) -> None:
    ch = 4 if alpha else 3
    raw = bytearray()
    for y in range(h):
        raw.append(0)
        for x in range(w):
            raw.extend(pixels[y * w + x][:ch])

    def chunk(tag: bytes, data: bytes) -> bytes:
        return struct.pack(">I", len(data)) + tag + data + struct.pack(">I", zlib.crc32(tag + data) & 0xFFFFFFFF)

    ihdr = struct.pack(">IIBBBBB", w, h, 8, 6 if alpha else 2, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n" + chunk(b"IHDR", ihdr) + chunk(b"IDAT", zlib.compress(bytes(raw), 9)) + chunk(b"IEND", b"")
    path.write_bytes(png)


def landscape() -> tuple:
    """40x40: 空・山・木・家。輪郭は (24,20,20)（元のプログラムの wetColors と同じ色）。"""
    w = h = 40
    sky, cloud, mount, snow, grass, trunk, leaf, leaf2, wall, roof, door, line = (
        (120, 180, 230), (245, 245, 250), (90, 110, 140), (230, 235, 240), (90, 170, 80),
        (120, 80, 50), (40, 120, 60), (70, 150, 70), (230, 210, 170), (190, 60, 50), (100, 70, 40), (24, 20, 20),
    )
    p = [sky] * (w * h)

    def put(x, y, c):
        if 0 <= x < w and 0 <= y < h:
            p[y * w + x] = c

    for x in range(w):  # 山
        top = 18 - int(10 * math.exp(-((x - 14) ** 2) / 60)) - int(7 * math.exp(-((x - 30) ** 2) / 40))
        for y in range(top, 26):
            put(x, y, snow if y < top + 2 and top < 12 else mount)
    for cx, cy in ((6, 5), (9, 4), (12, 5), (27, 7), (30, 6)):  # 雲
        for dx in range(-2, 3):
            for dy in range(-1, 2):
                put(cx + dx, cy + dy, cloud)
    for y in range(26, h):
        for x in range(w):
            put(x, y, grass)
    for y in range(24, 34):  # 木
        put(8, y, trunk)
        put(9, y, trunk)
    for dx in range(-5, 6):
        for dy in range(-6, 5):
            if dx * dx + dy * dy <= 22:
                put(8 + dx, 21 + dy, leaf if (dx + dy) % 3 else leaf2)
    for x in range(20, 34):  # 家
        for y in range(25, 35):
            put(x, y, wall)
    for i in range(8):
        for x in range(19 + i, 35 - i):
            put(x, 24 - i, roof)
    for x in range(25, 28):
        for y in range(29, 35):
            put(x, y, door)
    for x in range(19, 35):
        put(x, 35, line)
    for y in range(25, 36):
        put(19, y, line)
        put(34, y, line)
    for i in range(9):
        put(18 + i, 25 - i, line)
        put(35 - i, 25 - i, line)
    return w, h, p


def shapes() -> tuple:
    """48x48: 円・市松の網かけ・縞。2 色の境界と斜めの境界が多い。"""
    w = h = 48
    bg, c1, c2, c3, c4, edge = (30, 30, 46), (240, 200, 80), (220, 90, 120), (80, 200, 220), (160, 120, 220), (10, 10, 10)
    p = []
    for y in range(h):
        for x in range(w):
            c = bg
            d1 = (x - 15) ** 2 + (y - 15) ** 2
            d2 = (x - 33) ** 2 + (y - 31) ** 2
            if d1 <= 110:
                c = c1 if d1 <= 81 else edge
            elif d2 <= 130:
                c = c2 if d2 <= 100 else edge
            elif 30 <= x < 46 and 3 <= y < 14:
                c = c3 if (x + y) % 2 == 0 else c4
            elif 3 <= x < 14 and 32 <= y < 46:
                c = c4 if (y // 2) % 2 == 0 else c3
            p.append(c)
    return w, h, p


def sprite_rgba() -> tuple:
    """24x28: 透過の背景にキャラクター（RGBA）。"""
    w, h = 24, 28
    clear, body, eye, shade, edge = (0, 0, 0, 0), (110, 200, 120, 255), (250, 250, 250, 255), (70, 150, 90, 255), (20, 40, 30, 255)
    p = []
    for y in range(h):
        for x in range(w):
            c = clear
            dx, dy = (x - 11.5) / 9.5, (y - 16) / 10
            r = dx * dx + dy * dy
            if r <= 1.0 and y >= 7:
                c = body if r <= 0.75 else edge
                if y >= 21 and r <= 0.75:
                    c = shade
                if y in (13, 14, 15) and x in (8, 9, 14, 15):
                    c = eye if y != 15 else edge
            p.append(c)
    return w, h, p


def main() -> None:
    out = Path(sys.argv[1])
    out.mkdir(parents=True, exist_ok=True)
    for name, fn, alpha in (("landscape", landscape, False), ("shapes", shapes, False), ("sprite_rgba", sprite_rgba, True)):
        w, h, p = fn()
        write_png(out / f"{name}.png", w, h, p, alpha)
        print(out / f"{name}.png", w, h)


if __name__ == "__main__":
    main()
