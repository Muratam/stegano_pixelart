#!/bin/sh
# 配信の確認: health が 200 で {"ok":true}、index.html と、それが読む JS・CSS が 200 で出ること。
#   使い方: scripts/smoke.sh [ベースの URL]（既定 http://127.0.0.1:3170。ラボは http://10.44.135.10:3170、公開は https://sagisawa.0am.jp）
set -eu
base=${1:-http://127.0.0.1:3170}
fail=0
check() { # <パス> <期待する中身の一部>
  body=$(curl -fsS --max-time 10 "$base$1") || { echo "NG $1（200 でない）"; fail=1; return; }
  case $body in *"$2"*) echo "OK $1" ;; *) echo "NG $1（「$2」が無い）"; fail=1 ;; esac
}
check /stegano/api/health '{"ok":true}'
check /stegano/ '<title>ドット絵ステガノグラフィー</title>'
# index.html が読む /stegano/assets/ の JS と CSS
assets=$(curl -fsS --max-time 10 "$base/stegano/" | grep -o '/stegano/assets/[A-Za-z0-9._-]*' | sort -u || true)
[ -n "$assets" ] || { echo "NG index.html に /stegano/assets/ が無い"; fail=1; }
for a in $assets; do
  code=$(curl -sS -o /dev/null -w '%{http_code}' --max-time 10 "$base$a")
  [ "$code" = 200 ] && echo "OK $a" || { echo "NG $a（$code）"; fail=1; }
done
# スラッシュなしは相対の Location で /stegano/ へ
loc=$(curl -sS -o /dev/null -w '%{redirect_url}' --max-time 10 "$base/stegano")
case $loc in */stegano/) echo "OK /stegano → /stegano/" ;; *) echo "NG /stegano の転送先: $loc"; fail=1 ;; esac
exit $fail
