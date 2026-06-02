# 新刊.net to Trello

[新刊.net][Sinkan] に登録したキーワードの新刊発売情報（iCal 形式）を取得し、[Trello][Trello] のカードとして自動登録する Node.js スクリプトです。読みたい本の発売を Trello で管理するための個人用ツールです。

- **依存ライブラリなし**（Node.js の標準機能だけで動作。追加のインストール作業は不要）
- 重複登録を避けて、未登録の新刊だけをカード化
- Windows / macOS / Linux で動作（Node.js が動く環境ならOK）

## 動作環境

- **Node.js 18 以降**（未インストールなら [nodejs.org](https://nodejs.org/ja) から「推奨版」を導入）
- [新刊.net][Sinkan] のアカウント（キーワード登録済み。後から追加も可）
- [Trello][Trello] のアカウント

## 導入

### 1. 取得

このリポジトリを clone するか、ZIP でダウンロードして展開してください。

```sh
git clone <このリポジトリのURL>
cd Sinkan2Trello
```

### 2. 初期設定

以下を実行すると、対話形式で設定を進められます。入力した内容から `config.js` が自動生成されます（既存の `config.js` があれば `config.js.bak` に退避されます）。

```sh
node setup.js
```

セットアップでは次の情報を順番に尋ねられます。事前に下記「設定値の取得方法」を参照して用意しておくとスムーズです。

1. **新刊.net の iCal URL** … 入力後、接続確認を行います
2. **Trello の API キーとトークン**
3. **書き込み先の Trello ボード** … 一覧から選択します
4. **対象のリスト** … 一覧から選択します（**先頭に選んだリストが新規カードの追加先**になります）
5. **カード名の形式** … 案内のみ（変更は後から `config.js` で行う）

### 3. 実行

```sh
node index.js
```

`npm start` でも同じく実行できます。当月1日以降に発売される新刊のうち、未登録のものが Trello に追加されます。

## 設定値の取得方法

### 新刊.net の iCal URL

ブラウザで [新刊.net][Sinkan] にログインし、[ICAL形式](https://sinkan.net/?action_ical_info=true) のページを開きます。表示される「カレンダーのアドレス」が iCal URL です。

### Trello の API キーとトークン

1. ブラウザで [Trello][Trello] にログインした状態で [Power-Up & 統合](https://trello.com/power-ups/admin) を開きます。
2. 「新規」ボタンから Power-Up を作成します（名前は「APIKey発行用」など分かるもの、ワークスペースは自分のもの、その他は初期値や自分のメールアドレス・名前でかまいません）。
3. 作成した Power-Up を開き、左メニューの「APIキー」を選ぶと **API キー** が表示されます。
4. API キーの右の説明文にある「トークン」のリンクから、アカウントへのアクセスを許可すると **トークン** が表示されます。

### Trello のボードとリスト

[Trello][Trello] で新刊情報の出力先となるボードを1つ作成し、その中にリストをいくつか作成しておきます（例: 「購入前」「購入済」「不要」）。`setup.js` 実行時に、このボードとリストを一覧から選択します。

## コマンド一覧

| コマンド | npm script | 説明 |
| --- | --- | --- |
| `node index.js` | `npm start` | 当月1日以降の新刊を Trello に登録する（本体） |
| `node setup.js` | `npm run setup` | 対話式の初期設定。`config.js` を生成する |
| `node info.js` | `npm run info` | Trello のボード/リスト一覧・カード名の生成例を表示する |

### `index.js` のオプション

- `--all` … 期間制限なく全件を対象にする
- `--verbose` / `-v` … 詳細ログを出力する

### Windows での自動実行（任意）

同梱の `run.bat` は `index.js` を `--verbose` 付きで実行する Windows 用ランチャです。このバッチ、またはそのショートカットをスタートアップフォルダに置いておくと、Windows 起動ごとに1回、新刊情報の取り込みを実行できます。

## config.js について

`setup.js` が生成する設定ファイルです。次の値を持ちます。

- `SINKAN_ICAL_URL` … 新刊.net の iCal URL
- `TRELLO_API_KEY` / `TRELLO_API_TOKEN` … Trello の API 資格情報
- `TRELLO_BOARD_ID` … `info.js` でリスト一覧を表示する際に使う（本体 `index.js` では未使用）
- `TRELLO_LIST_ID` … 対象リストの配列。新規カードは先頭 `[0]` のリストの最上部に追加される
- `createTrelloCardName(...)` … 登録するカード名を組み立てて返す関数

カード名は登録済みカードとの**重複チェックに使われます**。`createTrelloCardName` の出力を変更すると、過去に登録したカードと一致しなくなり**重複カードが増える**ので注意してください。生成されるカード名は `node info.js` で確認できます。

> **注意:** `config.js` には API キー/トークンが含まれます。第三者への共有やリポジトリへのコミットは避けてください（本リポジトリでは `.gitignore` で管理対象外にしています）。

## ライセンス

[MIT License](LICENSE) で公開しています。Copyright (c) 2023-2026 tsZ

[Sinkan]: https://sinkan.net/
[Trello]: https://trello.com/ja
