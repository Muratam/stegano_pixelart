#!/bin/sh
# web/test/vpiet-golden/ を作り直す（元の vpiet で、Web 版の VPiet の照合用の記録を作る）。
#   VPIET=<github.com/Muratam/vpiet の clone（d3adcbb）> NIM=<Nim 1.2.18 の nim> NIMPNG=<jangko/nimPNG の v0.3.1> \
#     [CC_WRAPPER=<C コンパイラ>] tools/vpiet-golden/make.sh <作業用のディレクトリ>
# C コンパイラは FMA を使わない設定にする（tools/golden/make.sh と同じ。zig cc なら -mcpu=baseline -ffp-contract=off）。
# vpiet の packages/ をコピーし、ビルドと実行の邪魔になる所だけを書き換える（探索の中身は変えない）:
#   - pasm.nim の nre（libpcre が要る）を外し、使わない labeling の正規表現を split にする
#   - ncurses のライブラリ名を libncursesw.so.6 にする（画面の表示にだけ使う）
# ケース（cases/*.txt）: 1 行目が入力の画像（tools/vpiet-golden/make_inputs.py で作るもの、apple.png・dosei.png は vpiet の test/src/png）、
#   2 行目が探索のパラメータ（maxFrontierNum maxFundLevel maxTrackBackOrderLen）、3 行目から命令列（Web 版の stringToPasm の出力。apple_piet は vpiet の stego.nim の getOrders）
set -eu
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
work=${1:?作業用のディレクトリ}
: "${VPIET:?vpiet の clone}"
: "${NIM:?Nim 1.2.18 の nim}"
: "${NIMPNG:?nimPNG の v0.3.1}"
mkdir -p "$work"
rm -rf "$work/packages" && cp -r "$VPIET/packages" "$work/"
sed -i 's/libncursesw.so.5/libncursesw.so.6/' "$work/packages/projects/ncurses/ncurses.nim"
sed -i 's/^import nre$/# import nre/; s/var fun = line.replace(re"#(.*)$", "")/var fun = line.split("#")[0]/' "$work/packages/projects/stegano/pasm.nim"
cp "$here/gen.nim" "$work/"
cc=""
[ -n "${CC_WRAPPER:-}" ] && cc="--cc:clang --clang.exe:$CC_WRAPPER --clang.linkerexe:$CC_WRAPPER"
# shellcheck disable=SC2086
"$NIM" c -d:release --hints:off --warnings:off $cc --path:"$work" --path:"$NIMPNG" --nimcache:"$work/nimcache" -o:"$work/gen" "$work/gen.nim"
inputs="$work/inputs"
mkdir -p "$inputs" "$work/out"
python3 -I "$here/make_inputs.py" "$inputs" >/dev/null
cp "$VPIET/test/src/png/apple.png" "$VPIET/test/src/png/dosei.png" "$inputs/"
for f in "$here"/cases/*.txt; do
  name=$(basename "$f" .txt)
  { echo "$inputs/$(head -1 "$f")"; tail -n +2 "$f"; } > "$work/out/$name.case"
  (cd "$work" && ./gen "out/$name.case" "out/$name.json" >"out/$name.log" 2>&1) || echo "$name: 元のプログラムが止まった（$(tail -1 "$work/out/$name.log")）"
done
out="$repo/web/test/vpiet-golden"
mkdir -p "$out"
cp "$inputs"/*.png "$out/"
python3 -I "$here/assemble.py" "$work/out" "$out/golden.json"
echo "vpiet-golden: $out/golden.json"
