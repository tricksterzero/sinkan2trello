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
- `run.bat` … Windows 用。`index.js` を `--verbose` で実行する
- npm scripts: `npm run run-s2t`（= `node index.js`） / `npm run get-info`（= `node info.js`）

## アーキテクチャ
- `index.js` … 本体。処理の流れは次の通り。
  1. Trello の既存カードを全リストから取得（重複判定用、`fetchAllTrelloCards`）
  2. 新刊.net の iCal を取得（最大3回リトライ / 30秒タイムアウト、`fetchIcsWithRetry`）
  3. 自前の正規表現で VEVENT をパース（`parseIcs` / `parseVEvent`）
  4. `createTrelloCardName()` のカード名で重複判定（`isDuplicateCard`）
  5. 未登録分を Trello に POST（`addTrelloCard`）
- `config.js` … 設定本体。iCal URL、Trello API キー/トークン、ボード ID、リスト ID、`createTrelloCardName` を定義。
- `config.init.js` … 配布用の設定テンプレート。
- `setup.js` … 対話式セットアップ（`config.js` を生成）。
- `info.js` … Trello のボード/リスト情報の確認用。

## 依存・前提
- 依存ライブラリは **なし**。以前使っていた `ical.js` は pure JavaScript 化（自前パーサ）により不要となり除去済み。
- Node 標準の `fetch` / `AbortController` を使うため **Node 18 以降** が前提。
- `npm install` は不要（依存ゼロ）。

## 注意点
- 重複チェックは `createTrelloCardName()` が返すカード名の**完全一致**で行う。この関数の出力を変えると、過去に登録したカードと一致しなくなり**重複カードが増える**ので注意。
- 新規カードは `TRELLO_LIST_ID[0]`（先頭のリスト。例では「購入前」）の最上部に追加される。
- `config.js` には実際の API キー/トークンが含まれる（取り扱い注意）。
- このプロジェクトは Git 管理していない。バックアップは zip スナップショットで運用。

## Git 運用ルール
- **コミット・push は必ず事前にユーザーの実行確認を取る**（Claude が自動で commit / push しない）。
- コミットメッセージは **Conventional Commits** 形式（`feat:` / `fix:` / `chore:` / `docs:` / `refactor:` など）。
- 件名（subject）は **1行で簡潔にまとめる**（説明本文は付けない）。説明部分は日本語で可。
- ブランチは **main に直接コミット**（個人・小規模のため、機能ブランチは使わない）。
- Claude が作成したコミットには、件名の下に空行を挟んで `Co-Authored-By:` 署名を付ける。**使用したモデル名を含める**（例: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`）。
- `config.js` / `config.js.bak`（実 API キー/トークンを含む）は `.gitignore` で管理外。秘密情報はコミットしない。
- 過去のバックアップ zip は `_archive/` に退避済みで、これも管理外（git 自体が世代管理を担う）。

## 言語
応答・コメント・説明はすべて日本語で行うこと。
