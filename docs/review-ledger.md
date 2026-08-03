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
| index.js | 済(2026-08-03、7件修正) | lib/trello.js（createTrelloClient）、lib/net.js（fetchWithRetry/readTextCapped/sleep）、lib/log.js、lib/config-loader.js、config.js（設定値・createTrelloCardName）。iCal非信頼入力のパース（parseVEvent）とTrello重複判定（isDuplicateCard）の整合に注意 |
| lib/net.js | 済(2026-08-03、3件修正) | index.js・lib/trello.js・setup.js から fetchWithRetry を利用される共通モジュール。リトライ・タイムアウト・サイズ上限の挙動が呼び出し側の前提と食い違っていないか |
| lib/trello.js | 済(2026-08-03、2件修正) | lib/net.js（fetchWithRetry/fetchWithTimeout）に依存。index.js・info.js・setup.js から呼ばれる。GET/POSTでリトライ方針が異なる点（POSTは二重登録回避で非リトライ）が呼び出し側の期待と一致しているか |

## 低優先（小さい共有モジュール・補助スクリプト）

| ファイル | 状態 | 相互作用チェック相手 |
|---|---|---|
| lib/log.js | 済(2026-08-03、1件追加) | index.js・setup.js・info.js 共通の出力ヘルパー。printWarning を追加 |
| lib/config-loader.js | 済(2026-08-03、新規) | index.js・info.js が共通利用。config.js自体の欠如と内部エラーを区別する（下記「精査記録」続き参照） |
| setup.js | 済(2026-08-03) | lib/trello.js・lib/net.js・lib/log.js を利用。生成する config.js が config.init.js の構造と一致していることを確認済み |
| info.js | 済(2026-08-03、1件修正) | lib/trello.js・lib/log.js・lib/config-loader.js に依存。TRELLO_BOARD_ID は info.js 専用 |
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

**既知リスク・監視点（今回は対応せず、記録のみ）**: 下記「精査記録（続き: 「低」優先度4件の対応）」で全て対応済み。現時点で未対応の既知項目なし。

## 精査記録（2026-08-03、続き: 「中」優先度4件の対応）

Codexが指摘した「中」優先度4件（並行実行の二重登録・Trelloページング未対応・Retry-After上限なし・urlSourceホスト制限なし）に対応。

1. **並行実行（2プロセス同時起動）での二重登録**（index.js）: 実行冒頭にプロジェクト直下 `.run.lock`（`.gitignore` 管理下）を原子的に作成（`fs.writeFileSync` の `wx` フラグ）する簡易ロックを追加。既に存在する場合は多重起動とみなして即エラー終了。前回異常終了で残ったロックは20分経過で自動的に無効化する（`STALE_LOCK_MS`）。厳密な排他制御ではないが、個人用・低頻度実行には十分と判断（4はあまり多重起動は想定していないが、新刊.net不調時のリトライで1回の実行が数分に伸び、その間に手動再実行と重なるケースが現実的にあり得るため導入）。標準入出力のみの単体テストで多重起動検知・自動失効を確認済み（実データへのアクセスなし）。
2. **Trelloカード一覧取得にページング処理がない**（lib/trello.js）: 一次情報（Trello公式ドキュメント・コミュニティフォーラム）で「一覧系エンドポイントは1リクエスト最大1000件、超過時は `before`/`since` でページングする」ことを確認したが、cards エンドポイントの返却順とカーソル基準の対応関係までは確証を得られなかったため、実装が誤っている場合のリスク（無限ループ・取りこぼし）を避け、ページング自体は実装しないことにした。代わりに `getCards` に `limit: 1000` を明示し、ちょうど1000件返った場合は「取得しきれていない可能性がある」として `fetchAllTrelloCards` と同じ「母集合が欠けたら全停止」方針でエラーにする（黙って不完全なデータで進めない）。実データ（全4リスト、最大238件）で疎通確認済み。
3. **`Retry-After` ヘッダに上限キャップがない**（lib/net.js）: `parseRetryAfter` に絶対上限 `MAX_RETRY_AFTER_MS`（5分）を追加。サーバーが極端に長い値を指定してもスクリプトが長時間ハングしないようにした。
4. **`urlSource` にホスト制限がない**（index.js）: `SINKAN_ICAL_URL` のホスト名を信頼ホストとして保持し、`isTrustedSinkanUrl()` でスキーム検証に加えてホスト一致を確認するよう変更。iCal配信元が侵害された場合等に任意URLをTrelloへ渡してしまうリスクを抑える。単体テストでサブドメイン偽装・別ホスト・不正スキームが正しく弾かれることを確認済み。

## 精査記録（2026-08-03、続き: 「低」優先度4件の対応）

残っていた「低」優先度4件（A・C・D・iCal日付の範囲検証なし）に対応。

1. **A: `fetchWithRetry` の `retries<1` エッジケース**（lib/net.js）: `retries` が1未満（0・負数・NaN・非整数）のとき例外を投げる防御的ガードを追加。実際の呼び出し元は全て `retries>=3` のため挙動は変わらない。単体テストで `retries=0/-1/NaN/1.5` いずれも意図通り例外になることを確認。
2. **C: config.js動的importのエラーハンドリング重複＋誤誘導リスク**（index.js・info.js）: 共通ヘルパー `lib/config-loader.js`（`loadConfig()`）に統合。従来は `import()` の `ERR_MODULE_NOT_FOUND` だけで「config.js見つからず」と判定していたため、config.js自体は存在するが内部で別モジュールのimportに失敗した場合も同じ案内になる誤誘導リスクがあった。`fs.existsSync` で config.js 自体の有無を先に確認する方式に変更し、内部エラーの場合は生のエラーがそのまま表面化するようにした。擬似プロジェクトでの実地確認: (a) config.js不在 → 想定通り `config.js が見つかりません` + 終了コード1、(b) config.js内で存在しないモジュールをimport → 誤案内にならず本来の `ERR_MODULE_NOT_FOUND`（該当モジュール名付き）がそのまま表面化、を確認済み。
3. **D: 複数作者等でrest.length>=3のとき中間要素が失われる**（index.js）: `parseVEvent` に `formatAnomaly` フラグを追加（rest.length>2で true）。main側で該当イベントがあれば `-v` なしでも `printWarning` で件名付きの警告を出すよう変更（サイト側フォーマット変更に気づけるようにする。処理は止めずbest-effortで続行）。lib/log.js に `printWarning` ヘルパーを追加。単体テストでrest.length=3のケースでformatAnomaly:trueになることを確認。
4. **iCal日付の範囲外値を弾いていなかった**（index.js）: `parseVEvent` のDTSTARTパース後に月(1-12)・日(1-31)の粗い範囲チェックを追加し、範囲外は他の不正イベント同様nullを返して除外するようにした（`new Date()` の繰り上げ正規化に任せない）。単体テストで月13・月0のケースがnullになることを確認（日31超え自体は粗いチェックの対象外である点も確認済み）。

全て構文チェック・単体テスト・実データへの読み取り専用スモークテスト（`info.js` 実機実行）で確認済み。
