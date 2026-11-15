# stegano_pixelart で作業するときの決まり

ドット絵のステガノグラフィー（murata の修士の研究）のリポジトリ。元の Nim のプログラム（`src/`）と、それを移した Web 版（`web/`。`/stegano/` で配信）がある。ここにはこのアプリに特有の決まりだけを書く。

**先に読む**: 共通の決まり（禁止事項・作業の流れ・守ること）は `Muratam/sagisawa` の `CLAUDE.md`。サーバーの管理者AI は `/home/claude/sagisawa/CLAUDE.md` を、ほかの環境では GitHub か手元の clone を読む。
構成・デプロイ・テストのコマンドは `HANDOFF.md`。

## このアプリに特有のこと
- 既定のブランチは **master**（main ではない）。PR の `--base` も master。
- public のリポジトリ。ラボは https の公開 URL で pull する。
- 元のプログラム（`src/`・`samples/`）は変えない。アルゴリズム（`web/src/core/` の stego・stc・crmi・color・rand）を変えると `npm test` が golden（`web/test/golden/`）と照合して落ちる。変えるときは先に murata に聞く。
- リポジトリ名は `stegano_pixelart`、URL のパスは `/stegano/`、ポートは 3170。
- 画面の色・面・線・文字は `web/src/style.css` のトークン（sagisawa のポータルと同じ）だけを使う。外部の CDN は使わない。処理はブラウザの中だけ（サーバー側の処理・保存は無い）。
