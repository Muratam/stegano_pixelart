# 引き継ぎメモ（stegano_pixelart）

構成（事実）・デプロイ・残作業。作業の決まりは `CLAUDE.md`。サーバーの事実は `Muratam/sagisawa-admin` の `inventory.md`。事実は古くなるので、使う前に実物で確認する。

## 1. 全体像

| 項目 | 場所 |
|---|---|
| 公開 | https://sagisawa.0am.jp/stegano/ （public: ログインなし。予定） |
| リポジトリ | GitHub `Muratam/stegano_pixelart`（public、既定のブランチ master）。管理者AI のワーキングコピーは `/home/claude/stegano_pixelart` |
| push | 管理者AI はこのリポジトリ専用のデプロイキー（ssh の Host `github-stegano`）。ラボの `apps` は https の公開 URL で pull だけ |
| 動く場所 | ラボの `apps` の `/srv/stegano_pixelart/`、compose のプロジェクト `stegano_pixelart`、`10.44.135.10:3170` |

URL のパスは `/stegano/`（`web/vite.config.ts` の `base`・`docker/nginx.conf`・`scripts/smoke.sh` で合わせる）。

## 2. アプリ
- **構成**: 元の Nim のプログラムは `src/`（そのまま。配信には使わない）。Web 版は `web/`（Vue 3 + Vite + TypeScript の静的サイト。Muratam/tetris-esolang と同じ形）。
  - `web/src/core/`: 元のプログラムを移したもの。`rand.ts`（Nim 1.2 の乱数 xoroshiro128+）・`color.ts`（sRGB→Lab と CIEDE2000）・`crmi.ts`（crmiLTP と重み）・`stc.ts`（STC）・`stego.ts`（代表色・コスト・埋め込み・取り出し）。Web 版で足したもの: `message.ts`（文字列の形式と鍵）・`image.ts`（PNG・BMP の読み書き。canvas を通さない）・`api.ts`
  - 画面: `web/src/App.vue`（タブ: 埋め込む・取り出す・説明）、`components/`。重い処理は Web Worker（`web/src/worker.ts`、呼ぶ側は `stegoClient.ts`）
  - 配信は nginx のコンテナ（`Dockerfile`・`docker/nginx.conf`。uid 10001、読み取り専用、JS・CSS・HTML はビルド時に gzip、`/stegano/assets/` は immutable）。サーバー側の処理・DB・シークレットは無い
- **メッセージの形式**（Web 版）: `[本文のバイト数 16 ビット][UTF-8 の本文][CRC-16/CCITT-FALSE 16 ビット][0 の詰め物]`。詰め物は STC の列の数 w = n div m を `maxColumns(h)`（√2^(h+3)）以下にするため（w が大きいと小行列 Ĥ の列が全部異なる組が作れない）。取り出しは w = 2, 3, … と順に試し、CRC と UTF-8 が合うものを返す
- **鍵**: 数字だけ（1〜2^53）はそのまま乱数のシード（元のプログラムは 1234 固定）。それ以外は FNV-1a 64 の下位 62 ビット。並べ替えとマスクにだけ使い、暗号化ではない
- **画面**: sagisawa のポータルと同じトークンのダークテーマ（`web/src/style.css`）。幅 860px 以上で 2 列、それ未満は 1 列。スマホ縦（390×844）・PC（1280×720）・ポータルの iframe（左に 208px のナビ、上に 36px の帯）の中で横にはみ出さないこと

## 3. テスト
- `cd web && npm run lint`・`npm test`（vitest、数秒）・`npm run build`（`vue-tsc --noEmit` と `vite build`）
- `web/test/golden.test.ts`: 元のプログラム（Nim 1.2.18 でビルド）の記録 `web/test/golden/golden.json`（8 件。サンプルの mon_123.bmp と合成のドット絵 3 枚、h 6〜12、シード 3 種）と照合する。乱数・代表色・候補の色とビット・STC の小行列と結果・ステゴ画像（画素単位）・PSNR・取り出しは完全に一致。コスト（浮動小数）だけは libm（glibc と V8）の cbrt・atan2 などの差で下位のビットが変わるので、相対誤差 1e-12 以内で確認する
- golden の作り直し: `tools/golden/make.sh <作業用のディレクトリ>`（先頭のコメントに、使った Nim の版・パッケージ・C コンパイラと、src/ のコピーに当てる最小の書き換え）。Nim 2 では乱数の初期化が変わるので 1.2 を使う。C コンパイラは FMA を使わない設定にする（使うと浮動小数の結果が変わる）
- `web/test/message.test.ts`: 文字列の往復（4 枚 × 鍵と h の組）、違う鍵で取り出せないこと、アルファ・BMP、128×128 の速さ、サンプル `mon_123_stego.png`（鍵 1234 で `Hello!`）
- 配信: `scripts/smoke.sh [ベースの URL]`（health が `{"ok":true}`、`/stegano/` と、それが読む `/stegano/assets/` の JS・CSS が 200、`/stegano` が `/stegano/` へ転送）。ラボでは `scripts/smoke.sh http://10.44.135.10:3170`、公開後は `scripts/smoke.sh https://sagisawa.0am.jp`
- 画面: 埋め込む → サンプル「モンスター」→ 埋め込む → 取り出しで確認、で `Hello!` が戻ること

## 4. デプロイ
master にマージしてから（PR）、ラボで `scripts/deploy-lab.sh`。`/stegano/api/health` が 200 を返すことを確認する。
- murata: `sudo incus exec --project user-1001 apps -- /srv/stegano_pixelart/scripts/deploy-lab.sh`
- 管理者AI: `incus exec apps -- /srv/stegano_pixelart/scripts/deploy-lab.sh`
- 公開: `sagisawa-expose add stegano 10.44.135.10:3170 --kind public`

## 5. 残作業（初回の配置）
1. この変更を master にマージする（PR）
2. ラボで clone: `incus exec apps -- git clone https://github.com/Muratam/stegano_pixelart.git /srv/stegano_pixelart`
3. 初回のデプロイ: `incus exec apps -- /srv/stegano_pixelart/scripts/deploy-lab.sh` → `incus exec apps -- /srv/stegano_pixelart/scripts/smoke.sh http://10.44.135.10:3170`（Docker のイメージのビルドはここで初めて確認する）
4. 公開: `sudo -n /usr/local/sbin/sagisawa-expose add stegano 10.44.135.10:3170 --kind public` → `scripts/smoke.sh https://sagisawa.0am.jp`
5. `Muratam/sagisawa-admin` の `inventory.md` に追記する。ポータル・ホームのアプリの一覧に載せるかは murata に聞く
