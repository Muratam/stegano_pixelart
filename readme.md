# ドット絵にステガノグラフィーするやつ

[修士課程で研究していたものです](https://www.ieice.org/ken/paper/20200305e1wB/).

二値画像のようにドット絵の同一色の領域の境界に情報をSTCで埋め込むため,自然な画像を生成できる特徴があります.

private repo: https://github.com/Muratam/steganoexpr

## Web 版

https://sagisawa.0am.jp/stegano/ （ブラウザだけで動きます。画像はサーバーに送りません）

- 「埋め込む」: 画像（PNG・BMP）を選び、メッセージ（文字列）と鍵を入れて埋め込み、結果を PNG で保存します。変えた画素の強調・変えやすさの図も見られます。
- 「取り出す」: 画像と鍵からメッセージを戻します。
- 元の Nim のプログラム（`src/`）を TypeScript に移したもの（`web/src/core/`）です。鍵 1234・h 10 で同じビットの列を埋め込むと、元のプログラムと画素単位で同じ画像になります（`web/test/golden/` の記録と照合）。
- 元のプログラムとの違い: 文字列（UTF-8）に長さと CRC-16 を付けて埋め込み、取り出すときに長さを知らなくても戻せるようにしています。鍵・STC の h・変えない色を選べます。鍵は並べ替えの乱数のシードで、暗号化はしていません。

```sh
cd web
npm ci
npm run dev      # 開発用のサーバー（http://localhost:5173/stegano/）
npm test         # golden との照合と往復のテスト
npm run build    # dist/
```

構成・配信・golden の作り直しは `HANDOFF.md`。

## 元のプログラム（Nim）

```sh
nim c -d:release src/crmidot.nim
./src/crmidot samples/mon_123.bmp   # output/mon_123/ に結果の画像
```

stb_image（Nim のパッケージ `stb_image`）と `pnm` が要ります。Nim 1.2 で動作を確認しています（Nim 2 では乱数の初期化が変わるため、結果の画像が変わります）。
