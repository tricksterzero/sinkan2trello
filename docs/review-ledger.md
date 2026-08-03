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
| index.js | 済(2026-08-03、3件修正+2件監視) | lib/trello.js（createTrelloClient）、lib/net.js（fetchWithRetry/readTextCapped/sleep）、lib/log.js、config.js（設定値・createTrelloCardName）。iCal非信頼入力のパース（parseVEvent）とTrello重複判定（isDuplicateCard）の整合に注意 |
| lib/net.js | 済(2026-08-03、1件修正+1件監視) | index.js・lib/trello.js・setup.js から fetchWithRetry を利用される共通モジュール。リトライ・タイムアウト・サイズ上限の挙動が呼び出し側の前提と食い違っていないか |
| lib/trello.js | 済(2026-08-03、1件修正) | lib/net.js（fetchWithRetry/fetchWithTimeout）に依存。index.js・info.js・setup.js から呼ばれる。GET/POSTでリトライ方針が異なる点（POSTは二重登録回避で非リトライ）が呼び出し側の期待と一致しているか |

## 低優先（小さい共有モジュール・補助スクリプト）

| ファイル | 状態 | 相互作用チェック相手 |
|---|---|---|
| lib/log.js | 済(2026-08-03) | index.js・setup.js・info.js 共通の出力ヘルパー。発見なし |
| setup.js | 済(2026-08-03) | lib/trello.js・lib/net.js・lib/log.js を利用。生成する config.js が config.init.js の構造と一致していることを確認済み |
| info.js | 済(2026-08-03、1件監視) | lib/trello.js・lib/log.js・config.js に依存。TRELLO_BOARD_ID は info.js 専用。config.js動的importのエラーハンドリングがindex.jsと重複（下記「既知リスク・監視点」C） |
| config.init.js | 済(2026-08-03) | 手動設定用テンプレート（setup.js とは独立、どこからも import されない）。createTrelloCardName のデフォルト実装がsetup.js生成物・index.jsの期待する引数構造と一致していることを確認済み |

## 対象外

| ファイル | 理由 |
|---|---|
| config.js | setup.js が生成する個人用ファイル。実 API キー/トークンを含み `.gitignore` 管理下。ロジック自体は config.init.js と同一構造のため、そちらで精査する |

## 精査記録（2026-08-03）

高優先3ファイル・低優先4ファイルを実装読了。Codexへ確認済み事実と軽微指摘を渡し、見落とし・反例の洗い出しを依頼（`docs/review-ledger.md` 導入直後の初回精査）。

**修正した項目（高優先度、実装済み・実データでスモークテスト済み）**

1. **本文読み込みにタイムアウトが効いていなかった**（lib/net.js）: `fetchWithTimeout` は `fetch()` がヘッダー受信時点で解決するため、`.finally()` によるタイマー解除が本文読み込み前に起きていた。相手がslow-dripで本文を送り続けると無期限にハングし得る状態だった。`fetchWithTimeout`/`fetchWithRetry` に `readBody` コールバックを追加し、本文読み込みまで同一の `AbortSignal` で保護するよう変更。index.js（iCal取得）・lib/trello.js（Trello API全般）の両方に適用。
2. **不正な新刊.net応答が「0件取得」として無警告に正常終了していた**（index.js）: `parseIcs` が `BEGIN:VEVENT` を1件も見つけられない場合、単に空配列を返していた。認証切れのHTMLページやサイト形式変更時も気づけない。`BEGIN:VCALENDAR` の有無を検証し、無ければ `kind: 'sinkan-format'` の異常として扱うよう変更（main側に専用の案内メッセージを追加）。
3. **個別のカード登録失敗があっても終了コードが0だった**（index.js）: `stats.errors` は集計されるだけで `run.bat`（スタートアップ起動）から見ると全件失敗でも成功扱いだった。`stats.errors > 0` で `process.exitCode = 1` を設定。あわせて、想定外の未捕捉例外時も終了コードが0になっていたトップレベル `.catch` にも同様の設定を追加。

**副次的に直った項目**

- lib/trello.js の `get()`/`request()` で `res.json()` の呼び出しがtry-catchの外にあり、Trello APIが不正なJSONを返した場合に生のparseエラーがそのまま投げられていた。上記1の修正（readBody経由でのタイムアウト保護区間拡張）と同時にtry-catch内へ移動し、統一エラーメッセージ（`Trello APIの応答をJSONとして解釈できませんでした: ...`）に変換されるよう修正。

**既知リスク・監視点（今回は対応せず、記録のみ）**

- **A**: `lib/net.js` の `fetchWithRetry` は `retries=0`（または負数・NaN）を渡すと例外もreturnもせず `undefined` を返す。現状の呼び出し元は全て `retries>=3` のため発現しない。
- **C**: `index.js` と `info.js` で「config.js 動的import失敗時にsetup.jsへ誘導する」8行程度のブロックがほぼ同一コードとして重複。加えてCodexの指摘: config.js自体は存在するが内部で別モジュールのimportに失敗した場合も同じ `ERR_MODULE_NOT_FOUND` 経路に入り、「config.jsが見つかりません」という誤った案内になり得る（現状config.jsは他をimportしないため未発現）。
- **D**: `parseVEvent` の `rest` 配列取り出しは「rest[0]=作者、rest[末尾]=出版社」という2要素前提。実データ36件では `rest.length` は1か2のみで想定通りだったが、将来サイト側で複数作者が個別`<br>`行になった場合（rest.length>=3）は中間要素が失われる。
- 並行実行（2プロセス同時起動）での二重登録: 既存カード一覧を実行冒頭で1回だけ取得するスナップショット方式のため、同時に2プロセスが走ると両方が「未登録」と判定し得る。CLAUDE.mdが明記する「同一実行内の同名イベント複数」仕様とは別角度。
- Trelloカード一覧取得（`lib/trello.js` の `getCards`）にページング処理がない。リストのカード数がAPIの既定ページサイズを超えた場合に全件取得できない可能性。Trello APIの既定上限は一次情報未確認。
- `Retry-After` ヘッダの待ち時間に `maxDelay` によるキャップが無い。サーバーが極端に長い値を返すとその通り待ち続ける。
- `index.js` の `urlSource` はスキーム（http/https）のみ検証しホスト制限が無い。新刊.net以外の任意URLをTrelloへ渡せてしまう余地がある（フィード侵害時の懸念）。
- iCalの日付が構文（8桁数字）のみの検証で範囲外値（例: 13月99日）を弾いていない。`new Date()` が繰り上げ正規化するため実害は小さいが、実データでは終日形式のみで未発現。
