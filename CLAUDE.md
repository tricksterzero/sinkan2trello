# CLAUDE.md

このファイルは、このリポジトリで作業する際の Claude Code 向けガイドです。

## 概要
新刊.net で登録したキーワードの新刊発売情報（iCal 形式）を取得し、Trello のカードとして自動登録する Node.js スクリプトです。読みたい本の発売を Trello で管理するための個人用ツールです。

## 実行コマンド
- `node index.js` … 当月1日以降の新刊を Trello に登録する（本体）
  - `--all` … 期間制限なく全件を対象にする
  - `--verbose` / `-v` … 詳細ログを出力する
- `node setup.js` … 対話式の初期設定。`config.js` を生成する（既存があれば `config.js.bak` に退避）
- `node info.js` … Trello のボード/リスト一覧・カード名サンプルを表示する
- `run.bat` … Windows 用ランチャ。`index.js` を `--verbose` で実行する。`chcp 65001` で UTF-8 化・`cd /d "%~dp0"` で clone 先非依存。スタートアップに置いて起動ごとに1回実行する想定
- npm scripts: `npm start`（= `node index.js`） / `npm run setup`（= `node setup.js`） / `npm run info`（= `node info.js`）

## アーキテクチャ
- `index.js` … 本体。処理の流れは次の通り。
  1. Trello の既存カードを全リストから取得（重複判定用、`fetchAllTrelloCards`）
  2. 新刊.net の iCal を取得（`fetchAndParseIcs`）。粘り強いリトライ＋本文サイズ上限つき
  3. 自前の正規表現で VEVENT をパース（`parseIcs` / `parseVEvent`）。iCalエスケープ復元・HTMLエンティティ復号・端末制御文字除去まで行う
  4. `createTrelloCardName()` のカード名で重複判定（`isDuplicateCard`）
  5. 未登録分を Trello に POST（`addTrelloCard`。先頭リストの最上部）
- `lib/net.js` … タイムアウト付き fetch・リトライ（`fetchWithRetry`：指数バックオフ＋ジッター＋`Retry-After` 対応）・サイズ上限読み込み（`readTextCapped`）。
- `lib/trello.js` … Trello API クライアント（`createTrelloClient`）。共通15秒タイムアウト。GET はリトライ、POST は二重登録回避で非リトライ。
- `lib/log.js` … 出力ヘルパー（`print`/`printError`/`printSuccess`/`printVerbose`/`printSection`/`printProgress`/`printProgressDone`/`clearProgress`。index.js/setup.js/info.js 共通）。
- `config.js` … 設定本体。iCal URL、Trello API キー/トークン、ボード ID、リスト ID、`createTrelloCardName` を定義。`TRELLO_BOARD_ID` は `info.js` 専用で本体 `index.js` では未使用。
- `config.init.js` … 手動設定用の設定テンプレート（`setup.js` の対話式が主、これは従）。
- `setup.js` … 対話式セットアップ（`config.js` を生成。埋め込みは `JSON.stringify` で安全化）。表示は index.js と同じヘルパーで統一。
- `info.js` … Trello のボード/リスト情報の確認用。

## 依存・前提
- 依存ライブラリは **なし**。以前使っていた `ical.js` は pure JavaScript 化（自前パーサ）により不要となり除去済み。
- Node 標準の `fetch` / `AbortController` を使うため **Node 18 以降** が前提。
- `npm install` は不要（依存ゼロ）。

## 注意点
- 重複チェックは `createTrelloCardName()` が返すカード名の**完全一致**で行う。この関数の出力を変えると、過去に登録したカードと一致しなくなり**重複カードが増える**ので注意。
- 新規カードは `TRELLO_LIST_ID[0]`（先頭のリスト。例では「購入前」）の最上部に追加される。
- 同じ「発売日＋タイトル」で ASIN 違いの版が iCal に複数あると、その名前が未登録のとき**同一実行内で両方登録され得る**（重複セットを実行中に更新していないため）。これは**想定内の仕様**で、修正対象としない。
- iCal は**非信頼の外部入力**として扱う。パースで iCalエスケープ復元・HTMLエンティティ復号（コードポイント範囲ガードつき）・端末制御文字除去を行い、`urlSource` には `http(s)://` のURLのみ渡す。これらは安全策なので安易に外さない。
- 通信のエラー対策：新刊.net は粘り強くリトライ（5回・指数バックオフ＋ジッター・`Retry-After` 尊重）。Trello は共通15秒タイムアウトで、GET はリトライ・POST は二重登録回避で非リトライ。
- `fetchAllTrelloCards` は `Promise.allSettled` で全リストを取り切り、1リストでも取得失敗すれば**失敗リストIDを名指しして全停止**する（`kind: 'trello-fetch'`、main の catch で専用案内）。重複判定の母集合が欠けると重複登録が増えるため「全停止が安全」とする**意図的な設計**。失敗時は最も遅いリストのリトライ完遂を待ってから停止する。「失敗リストのみ警告して続行」案は重複登録を招くため採らない。
- 期間判定の日付はローカルタイムゾーン基準（`parseLocalDate`/`formatLocalDate`）。`toISOString()` は UTC 変換でずれるため表示・比較に使わない。
- `config.js` には実際の API キー/トークンが含まれる（取り扱い注意）。ログにトークンを出さない。
- このプロジェクトは **Git 管理下にある**（→ 後述「Git 運用ルール」）。

## Git 運用ルール
- **コミット・push は必ず事前にユーザーの実行確認を取る**（Claude が自動で commit / push しない）。
- コミットメッセージは **Conventional Commits** 形式（`feat:` / `fix:` / `chore:` / `docs:` / `refactor:` など）。
- 件名（subject）は **1行で簡潔にまとめる**（説明本文は付けない）。説明部分は日本語で可。
- ブランチは **main に直接コミット**（個人・小規模のため、機能ブランチは使わない）。
- Claude が作成したコミットには、件名の下に空行を挟んで `Co-Authored-By:` 署名を付ける。**使用したモデル名を含める**（例: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`）。
- このリポジトリは GitHub で**公開**している（https://github.com/tricksterzero/sinkan2trello, Public, MIT ライセンス）。公開リポジトリのため、API キー/トークン等の秘密情報は**履歴にも絶対に残さない**。
- `config.js` / `config.js.bak`（実 API キー/トークンを含む）は `.gitignore` で管理外。秘密情報はコミットしない。
- 依存ゼロのため `package-lock.json` も管理外（`.gitignore`）。将来依存を足したら再生成してコミットする。
- 改行コードは `.gitattributes` で固定（既定 LF・`*.bat` は CRLF）。
- 過去のバックアップ zip は `_archive/` に退避済みで、これも管理外（git 自体が世代管理を担う）。

## 残タスク / 検討事項
今後の改善候補・監視点（いずれも必須ではなく、着手前にトレードオフを確認すること）。
- **verbose ログのトークン漏れ（監視点）**：Trello URL は query に key/token を含む。現状の実装ではエラーを clean な文言に包んでおり漏れないが、今後 `error.cause` や URL をそのままログに足さないこと。
- **setup.js の接続確認方式**：iCal URL 検証で `HEAD` を使用。HEAD 非対応サーバーがあれば `GET` に揃える検討余地（軽微）。

## 言語
応答・コメント・説明はすべて日本語で行うこと。
