import { SINKAN_ICAL_URL, TRELLO_API_KEY, TRELLO_API_TOKEN, TRELLO_LIST_ID, createTrelloCardName } from './config.js';
import { createTrelloClient } from './lib/trello.js';
import { fetchWithRetry, readTextCapped, sleep } from './lib/net.js';
import { print, printError, printSuccess, printVerbose, printProgress, printProgressDone, clearProgress } from './lib/log.js';

const trello = createTrelloClient(TRELLO_API_KEY, TRELLO_API_TOKEN);

// =============================================================================
// メイン関数
// =============================================================================
const main = async () => {
  const allMode     = process.argv.includes('--all');
  const verboseMode = process.argv.includes('--verbose') || process.argv.includes('-v');
  const today        = startOfDay(new Date());
  const firstOfMonth = new Date(today.getFullYear(), today.getMonth(), 1);

  const stats = { added: 0, skipped: 0, errors: 0, outOfRange: 0 };
  const startTime = Date.now();

  print();
  print('╔══════════════════════════════════════════════╗');
  print('║         新刊.net to Trello                   ║');
  print('╚══════════════════════════════════════════════╝');

  if(verboseMode) printVerbose('詳細表示モード有効');

  try {
    printProgress('Trelloのカード一覧を取得中...');
    const trelloCards = await fetchAllTrelloCards(verboseMode);
    printProgressDone(`Trelloのカードを ${trelloCards.length} 件取得。`);

    printProgress('新刊.netからiCalデータを取得中...');
    const events = await fetchAndParseIcs(SINKAN_ICAL_URL);
    printProgressDone(`新刊情報を ${events.length} 件取得。`);

    if(verboseMode) {
      print();
      printVerbose(`対象期間: ${allMode ? '全件' : formatLocalDate(firstOfMonth) + ' 以降'}`);
      printVerbose(`パース結果のサンプル（最大3件）:`);
      events.slice(0, 3).forEach((e, i) => {
        printVerbose(`  [${i + 1}] ${e.releaseDateStr} / ${e.bookTitle} / ${e.authorName || '不明'} / ${e.publisherName || '不明'}`);
        printVerbose(`       URL: ${e.sinkanUrl || '(なし)'}`);
      });
    }

    print();

    if(allMode) print('  モード: 全件対象 (--all)');
    for(const event of events) {
      const releaseDate = parseLocalDate(event.releaseDateStr);
      if(!allMode && releaseDate < firstOfMonth) {
        if(verboseMode) printVerbose(`対象外（期間外）: ${event.releaseDateStr} ${event.bookTitle}`);
        stats.outOfRange++;
        continue;
      }

      const cardName = createTrelloCardName(event.releaseDateStr, event.bookTitle, event.authorName, event.publisherName);

      if(isDuplicateCard(trelloCards, cardName)) {
        if(verboseMode) printVerbose(`スキップ（重複）: ${cardName}`);
        stats.skipped++;
        continue;
      }

      try {
        const card = await addTrelloCard(cardName, event.sinkanUrl);
        printAdded(event);
        if(verboseMode) printVerbose(`  → Trello Card ID: ${card.id}  URL: ${card.shortUrl}`);
        stats.added++;
        await sleep(100);
      } catch (err) {
        printCardError(event, err);
        if(verboseMode) printVerbose(`  → エラー詳細: ${err.stack ?? err.message}`);
        stats.errors++;
      }
    }
  } catch (error) {
    clearProgress(); // リトライ中の進捗行が残らないように消す
    print();
    if(error.kind === 'sinkan-fetch') {
      printError('新刊.netに接続できませんでした。');
      print('    サーバーが混雑しているか、一時的に応答していない可能性があります。');
      print('    しばらく（数分〜数十分）時間をおいてから、もう一度実行してください。');
      if(!verboseMode) print('    詳しい原因は -v / --verbose を付けて実行すると確認できます。');
      if(verboseMode) {
        printVerbose(`理由: ${error.cause?.message ?? error.message}`);
        printVerbose(`スタックトレース:\n${(error.cause ?? error).stack}`);
      }
    } else {
      printError(`致命的なエラーが発生しました: ${error.message}`);
      if(verboseMode) printVerbose(`スタックトレース:\n${error.stack}`);
    }
    process.exit(1);
  }

  printSummary({ ...stats, elapsedMs: Date.now() - startTime, verboseMode });
};

// =============================================================================
// 出力（このスクリプト固有の整形出力）
// =============================================================================
const printAdded = ({ releaseDateStr, bookTitle, authorName, publisherName }) => {
  print(`  ┌ 追加: ${bookTitle}`);
  print(`  │ 発売日: ${releaseDateStr}  作者: ${authorName || '不明'}  出版社: ${publisherName || '不明'}`);
  print(`  └─`);
};

const printCardError = ({ releaseDateStr, bookTitle }, err) => {
  printError(`登録失敗: ${bookTitle}（${releaseDateStr}） — ${err.message}`);
};

const printSummary = ({ added, skipped, errors, outOfRange, elapsedMs, verboseMode }) => {
  const sec = (elapsedMs / 1000).toFixed(1);
  print();
  print('──────────────────────────────────────────────────────────────');
  print(`  追加: ${added} 件  スキップ: ${skipped} 件  エラー: ${errors} 件  所要時間: ${sec}s`);
  if (verboseMode) {
    print(`  期間外スキップ: ${outOfRange} 件`);
  }
  print('──────────────────────────────────────────────────────────────');
  print();
};

// =============================================================================
// ユーティリティ
// =============================================================================
const startOfDay = (date) =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

// "YYYY-MM-DD" をローカルタイムゾーンの0時として Date 化する。
// new Date("YYYY-MM-DD") は UTC 0時と解釈されるため、ローカル基準の
// firstOfMonth（new Date(y, m, 1)）と比較すると基準がずれる。それを防ぐ。
const parseLocalDate = (ymd) => {
  const [y, m, d] = ymd.split('-').map(Number);
  return new Date(y, m - 1, d);
};

// Date をローカルタイムゾーン基準の "YYYY-MM-DD" に整形する。
// toISOString() は UTC 変換で日付がずれる（JST では1日早まる）ため使わない。
const formatLocalDate = (date) => {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};

// =============================================================================
// Trello
// =============================================================================
const fetchAllTrelloCards = async (verboseMode = false) => {
  if(verboseMode) printVerbose(`取得対象リスト数: ${TRELLO_LIST_ID.length} 件 (IDs: ${TRELLO_LIST_ID.join(', ')})`);
  const results = await Promise.all(
    TRELLO_LIST_ID.map(async (listId) => {
      if(verboseMode) printVerbose(`リスト取得中: ${listId}`);
      const cards = await trello.getCards(listId);
      if(verboseMode) printVerbose(`  → ${listId}: ${cards.length} 件`);
      return cards;
    })
  );
  return results.flat();
};

const isDuplicateCard = (cards, cardName) =>
  cards.some((card) => card.name === cardName);

const addTrelloCard = (cardName, sinkanUrl) => {
  const card = {
    name: cardName,
    pos: 'top',
    idList: TRELLO_LIST_ID[0],
  };
  // sinkanUrl は非信頼な DESCRIPTION 由来。http(s) のときだけ添付元として渡し、
  // javascript: 等の異常スキームや空文字は Trello に送らない。
  if(/^https?:\/\//i.test(sinkanUrl)) card.urlSource = sinkanUrl;
  return trello.addCard(card);
};

// =============================================================================
// iCal
// =============================================================================
// iCal 本文の読み込み上限（非信頼な外部フィードのメモリ枯渇対策）。
// 実データは約 21KB なので 10MB あれば十分な余裕がありつつ暴走を防げる。
const MAX_ICS_BYTES = 10 * 1024 * 1024;

const fetchAndParseIcs = async (url) => {
  // 新刊.net は反応が悪い時間帯があり度々失敗するため、粘り強くリトライする。
  // 5回 / 30秒タイムアウト / 指数バックオフ 2→4→8→16秒（上限30秒）＋ジッター。
  let text;
  try {
    const res = await fetchWithRetry(url, {
      timeout: 30 * 1000,
      retries: 5,
      retryDelay: 2000,
      backoffFactor: 2,
      maxDelay: 30 * 1000,
      onRetry: ({ attempt, retries, isTimeout, status, error, delayMs }) => {
        const reason = isTimeout ? 'タイムアウト' : (status ? `HTTP ${status}` : error.message);
        const waitSec = (delayMs / 1000).toFixed(1);
        process.stdout.write(`\r  … 新刊.netに接続中... ${reason}、${waitSec}秒後にリトライ (${attempt}/${retries - 1}回目)`);
      },
    });
    text = await readTextCapped(res, MAX_ICS_BYTES);
  } catch (error) {
    // 接続/取得の失敗は、main 側でユーザーフレンドリーに表示するためタグ付けする。
    // （パース失敗とは区別する。パース失敗はそのまま致命的エラーとして扱う）
    const friendly = new Error('新刊.netに接続できませんでした');
    friendly.kind = 'sinkan-fetch';
    friendly.cause = error;
    throw friendly;
  }
  return parseIcs(text);
};

const parseIcs = (icsText) => {
  const unfolded = icsText.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
  return blocks.map(parseVEvent).filter(Boolean);
};

// iCal の TEXT 値のエスケープを復元する（RFC5545）。
// \\ → \ 、 \, → , 、 \; → ; 、 \n / \N → 改行。
// \\ を1要素として左から1パスで処理するので、\\, のような連続も正しく扱える
// （まず \\ を \ にし、続く , は素通し → 文字どおりの "\," になる）。
const unescapeIcsText = (value) =>
  value.replace(/\\(.)/g, (_, ch) => (ch === 'n' || ch === 'N' ? '\n' : ch));

// DESCRIPTION は HTML なので、葉のテキスト（作者・出版社・URL）に含まれ得る
// HTMLエンティティを復元する。名前付き（&amp; 等）と数値参照（&#39; / &#x27;）に対応。
// 注意: タグ除去・<br>分割の「後」に呼ぶこと。先に呼ぶと &lt; → < がタグと誤認される。
// プレーンオブジェクトだと継承プロパティ（constructor 等）を拾い、&constructor; のような
// 非信頼入力で誤った置換が起きる。プロトタイプなしのマップにして自前のキーだけを引く。
const HTML_NAMED_ENTITIES = Object.assign(Object.create(null), {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
});
const decodeHtmlEntities = (value) =>
  value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, body) => {
    if(body[0] === '#') {
      const cp = body[1].toLowerCase() === 'x'
        ? parseInt(body.slice(2), 16)
        : parseInt(body.slice(1), 10);
      // 有効な Unicode コードポイント(0〜0x10FFFF)のみ復号する。範囲外を
      // String.fromCodePoint に渡すと RangeError で全体が落ちるため、元の文字列を残す。
      return cp >= 0 && cp <= 0x10FFFF ? String.fromCodePoint(cp) : whole;
    }
    return HTML_NAMED_ENTITIES[body.toLowerCase()] ?? whole; // 未知の実体はそのまま残す
  });

// 端末制御文字（ESC/BEL 等の C0制御・DEL・C1制御）を除去する。非信頼な iCal 由来テキストを
// ターミナルやカード名に出す前に通し、ANSIエスケープ等による出力偽装・端末操作を防ぐ。
// decodeHtmlEntities は &#27; 等で制御文字を生成し得るので、デコード後の最終値に適用すること。
const stripControlChars = (value) => value.replace(/[\u0000-\u001F\u007F-\u009F]/g, '');

const parseVEvent = (block) => {
  const get = (key) => {
    const match = block.match(new RegExp(`^${key}[;:][^\r\n]*`, 'm'));
    if(!match) return '';
    return match[0].slice(match[0].indexOf(':') + 1).trim();
  };

  const dtstart     = get('DTSTART'); // DATE 値なので TEXT エスケープ対象外
  const summary     = stripControlChars(unescapeIcsText(get('SUMMARY')));
  const description = unescapeIcsText(get('DESCRIPTION')); // パース専用（直接表示しない）

  // DTSTART から発売日(YYYY-MM-DD)を取り出す。終日形式(20260302)が基本だが、
  // 日時形式(20260302T000000Z 等)でも先頭の YYYYMMDD を採用する（時刻部は無視）。
  // 取り出せない＝日付不明なイベントは登録対象外として除外する。
  const dateMatch = dtstart.match(/^(\d{4})(\d{2})(\d{2})/);
  if(!dateMatch || !summary) return null;
  const releaseDateStr = `${dateMatch[1]}-${dateMatch[2]}-${dateMatch[3]}`;
  const sinkanUrl      = stripControlChars(decodeHtmlEntities(description.match(/href=["'](.*?)["']/)?.[1] ?? ''));

  // DESCRIPTION は <a href="URL">発売日<br />タイトル<br />作者<br />出版社<br /></a> の形。
  // ただし雑誌など作者がいないデータは「作者」の <br /> 行ごと省略され、
  // <a ...>発売日<br />タイトル<br />出版社<br /></a> のように可変長になる。
  // そこで <a>/</a> を除去 → <br>（表記ゆれ許容）で分割 → trim → 空要素除去し、
  // 「出版社は常に末尾」「タイトルは常に2番目」という構造で取り出す。
  // rest = タイトルより後ろ = [作者, 出版社] か [出版社] か []。
  const fields = description
    .replace(/<a\b[^>]*>/i, '')
    .replace(/<\/a>/i, '')
    .split(/<br\s*\/?>/i)
    .map((s) => s.trim())
    .filter(Boolean);
  const rest          = fields.slice(2); // [発売日, タイトル] を除いた残り
  const publisherName = stripControlChars(decodeHtmlEntities(rest.length >= 1 ? rest[rest.length - 1] : ''));
  const authorName    = stripControlChars(decodeHtmlEntities(rest.length >= 2 ? rest[0] : ''));

  return { releaseDateStr, bookTitle: summary, sinkanUrl, authorName, publisherName };
};

// =============================================================================
// エントリーポイント
// =============================================================================
main()
  .then(() => {})
  .catch((error) => { console.error(error); });
