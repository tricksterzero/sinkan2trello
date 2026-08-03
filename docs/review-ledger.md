# コード精査台帳

実装ファイルを1本ずつ精査するための進行管理台帳。テンプレート: Knowledge
`Tech/ClaudeCode/code-review-ledger-template.md`。

このプロジェクトはファイル数が少なく詳細を書いても肥大化しない見込みのため、
review-log.md は作らず本ファイル単体で運用する（発見内容・修正過程はこの
ファイルの各セルに直接書く。肥大化してきたら review-log.md への分離を検討）。

## 精査手順（1本あたり）

1. 実装＋対応テストを読む
2. コード内のコメント・docstringの主張（「〜と同じ方針」等）を実際のコードと突き合わせる
3. 「相互作用チェック相手」列に挙げた他モジュールとの整合を確認する
   （単体では正しく見えても、連携先との間で部分適用漏れ・非対称な処理が起きていないか）
4. 疑わしい箇所は実データ・実行結果で裏取りする
5. 修正は回帰テスト付きで行い、台帳の状態列更新までを1単位としてコミットする
6. 深い判断・セカンドオピニオンが必要な指摘は外部レビュー（Codex等）に相談してもよい

## 状態の凡例

- **未** — 未精査
- **済(日付)** — 精査済み。発見があれば括弧内に件数
- **済(日付、N件)+変更** — 精査後にコードが変わっており、差分の再精査が必要
- 精査記録が無い過去の変更は「未」扱いにする（本台帳導入時点でまだ誰も精査していないため、
  全ファイル「未」から開始する）

## 高優先（本体ロジック・外部非信頼入力・通信を扱う）

| ファイル | 状態 | 相互作用チェック相手 |
|---|---|---|
| index.js | 未 | lib/trello.js（createTrelloClient）、lib/net.js（fetchWithRetry/readTextCapped/sleep）、lib/log.js、config.js（設定値・createTrelloCardName）。iCal非信頼入力のパース（parseVEvent）とTrello重複判定（isDuplicateCard）の整合に注意 |
| lib/net.js | 未 | index.js・lib/trello.js・setup.js から fetchWithRetry を利用される共通モジュール。リトライ・タイムアウト・サイズ上限の挙動が呼び出し側の前提と食い違っていないか |
| lib/trello.js | 未 | lib/net.js（fetchWithRetry/fetchWithTimeout）に依存。index.js・info.js・setup.js から呼ばれる。GET/POSTでリトライ方針が異なる点（POSTは二重登録回避で非リトライ）が呼び出し側の期待と一致しているか |

## 低優先（小さい共有モジュール・補助スクリプト）

| ファイル | 状態 | 相互作用チェック相手 |
|---|---|---|
| lib/log.js | 未 | index.js・setup.js・info.js 共通の出力ヘルパー |
| setup.js | 未 | lib/trello.js・lib/net.js・lib/log.js を利用。生成する config.js が config.init.js の構造と一致しているか |
| info.js | 未 | lib/trello.js・lib/log.js・config.js に依存。TRELLO_BOARD_ID は info.js 専用 |
| config.init.js | 未 | 手動設定用テンプレート（setup.js とは独立、どこからも import されない）。createTrelloCardName のデフォルト実装が index.js の期待する引数構造と一致しているか |

## 対象外

| ファイル | 理由 |
|---|---|
| config.js | setup.js が生成する個人用ファイル。実 API キー/トークンを含み `.gitignore` 管理下。ロジック自体は config.init.js と同一構造のため、そちらで精査する |
