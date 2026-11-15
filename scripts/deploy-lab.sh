#!/bin/sh
# ラボ（Incus の apps）の中で動かすデプロイ: origin/master の最新を取得してビルドし、入れ替える。
# ヘルスチェックに通らなければ、前のイメージにロールバックする。
#   ホストの murata: sudo incus exec --project user-1001 apps -- /srv/stegano_pixelart/scripts/deploy-lab.sh
#   管理者AI（claude）: incus exec apps -- /srv/stegano_pixelart/scripts/deploy-lab.sh
# /srv/stegano_pixelart の origin は https の公開 URL（public なので読み取りのキーは要らない）
set -eu
cd "$(dirname "$0")/.."
git pull -q --ff-only origin master
# .env は bind 先（APP_BIND）だけでシークレットは無い。無ければ .env.example から作る
[ -f .env ] || cp .env.example .env
prev=$(docker image inspect -f '{{.Id}}' stegano_pixelart-app:latest 2>/dev/null || true)
[ -n "$prev" ] && docker tag "$prev" stegano_pixelart-app:prev
docker compose build -q app
docker compose up -d app || echo "deploy-lab: app の起動に失敗" >&2
status() { docker inspect -f '{{.State.Health.Status}}' stegano_pixelart-app-1 2>/dev/null || echo missing; }
i=0
while [ "$(status)" != healthy ] && [ $i -lt 40 ]; do i=$((i + 1)); sleep 3; done
if [ "$(status)" != healthy ]; then
  echo "deploy-lab: ヘルスチェックに失敗 → 前のイメージにロールバックする" >&2
  if [ -n "$prev" ]; then docker tag stegano_pixelart-app:prev stegano_pixelart-app:latest; docker compose up -d --no-build app; fi
  exit 1
fi
echo "deploy-lab: $(git log --oneline -1)"
