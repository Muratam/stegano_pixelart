#!/bin/sh
# web/test/golden/ を作り直す（元の Nim のプログラムで、Web 版の照合用の記録を作る）。
#   NIM=<Nim 1.2.18 の bin/nim> NIMPKGS=<stb_image と pnm を clone したディレクトリ> [CC_WRAPPER=<C コンパイラ>] tools/golden/make.sh <作業用のディレクトリ>
# 使った版: Nim 1.2.18（乱数の初期化と Table の順が版で変わる。2.x では結果が変わる）、
#   stb_image-Nim（define-private-public/stb_image-Nim）、pnm（jiro4989/pnm）、C コンパイラは zig 0.13.0 の `zig cc`。
# src/ の中身（アルゴリズム）は変えない。コピーに次の最小の書き換えだけをする:
#   - 内部の proc を export する（representationMap・distortionScoreMap・distortionMap・crmiDotDecode・getBitMatrix）
#   - 乱数のシード 1234 と STC の h=10 を変数（既定は同じ値）にする
#   - 埋め込みの途中の値（シャッフル後の候補 S と STC の結果 EX）を変数に記録する
set -eu
here=$(cd "$(dirname "$0")" && pwd)
repo=$(cd "$here/../.." && pwd)
work=${1:?作業用のディレクトリ}
: "${NIM:?Nim 1.2.18 の nim}"
: "${NIMPKGS:?stb_image と pnm のディレクトリ}"
src="$work/nimsrc"
rm -rf "$src" && mkdir -p "$src"
cp "$repo"/src/*.nim "$repo"/src/ciede2000.h "$here/gen_golden.nim" "$src/"
sed -i \
  -e 's/^proc representationMap(/proc representationMap*(/' \
  -e 's/^proc distortionScoreMap(/proc distortionScoreMap*(/' \
  -e 's/^proc distortionMap(/proc distortionMap*(/' \
  -e 's/^proc crmiDotDecode(/proc crmiDotDecode*(/' \
  -e 's/initRand(1234)/initRand(goldenSeed)/' \
  -e 's/^  const h = 10$/  let h = goldenH/' \
  -e 's/^  let SD = S.mapIt(it.d) # distortion$/&\n  goldenS = S/' \
  -e 's/^  let EX = stcEmbed(M,SX,XX,XX,DD,h) # 0-1 embeded$/&\n  goldenEX = EX/' \
  -e 's/^const INF = 1e12$/&\nvar goldenSeed* = 1234\nvar goldenH* = 10\nvar goldenS*: seq[tuple[pos:tuple[x,y:int],color:Color,x:int,d:float]]\nvar goldenEX*: seq[int]/' \
  "$src/crmidot.nim"
sed -i -e 's/^proc getBitMatrix(/proc getBitMatrix*(/' "$src/stc.nim"
# 書き換えが全部当たったか（当たらなければ止める）
[ "$(grep -c 'goldenSeed' "$src/crmidot.nim")" = 5 ] || { echo "make.sh: シードの書き換えが合わない" >&2; exit 1; }
grep -q '^  goldenS = S$' "$src/crmidot.nim" && grep -q '^  goldenEX = EX$' "$src/crmidot.nim" && grep -q '^  let h = goldenH$' "$src/crmidot.nim"
cc=""
[ -n "${CC_WRAPPER:-}" ] && cc="--cc:clang --clang.exe:$CC_WRAPPER --clang.linkerexe:$CC_WRAPPER"
# shellcheck disable=SC2086
"$NIM" c -d:release --hints:off --warnings:off $cc --path:"$NIMPKGS/stb_image" --path:"$NIMPKGS/pnm/src" \
  --nimcache:"$work/nimcache-golden" -o:"$work/gen_golden" "$src/gen_golden.nim"
inputs="$work/inputs"
mkdir -p "$inputs"
cp "$repo/samples/mon_123.bmp" "$inputs/"
python3 -I "$here/make_inputs.py" "$inputs" >/dev/null
out="$repo/web/test/golden"
mkdir -p "$out"
cp "$inputs"/*.png "$inputs"/*.bmp "$out/"
(cd "$work" && "$work/gen_golden" "$inputs" "$out" "$work/embed-output" >"$work/gen_golden.log")
tail -1 "$work/gen_golden.log"
