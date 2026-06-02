import { SINKAN_ICAL_URL, TRELLO_API_KEY, TRELLO_API_TOKEN, TRELLO_LIST_ID, createTrelloCardName } from './config.js';
import { createTrelloClient } from './lib/trello.js';
import { fetchWithRetry, sleep } from './lib/net.js';
import { print, printError, printSuccess, printVerbose, printProgress, printProgressDone } from './lib/log.js';

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
      printVerbose(`対象期間: ${allMode ? '全件' : firstOfMonth.toISOString().slice(0, 10) + ' 以降'}`);
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
    print();
    printError(`致命的なエラーが発生しました: ${error.message}`);
    if(verboseMode) printVerbose(`スタックトレース:\n${error.stack}`);
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

const addTrelloCard = (cardName, sinkanUrl) =>
  trello.addCard({
    name: cardName,
    urlSource: sinkanUrl,
    pos: 'top',
    idList: TRELLO_LIST_ID[0],
  });

// =============================================================================
// iCal
// =============================================================================
const fetchAndParseIcs = async (url) => {
  const res = await fetchWithRetry(url, {
    timeout: 30 * 1000,
    retries: 3,
    retryDelay: 1000,
    onRetry: ({ attempt, retries, isTimeout, error }) => {
      const reason = isTimeout ? 'タイムアウト' : error.message;
      process.stdout.write(`\r  … 新刊.netに接続中... ${reason}、リトライ中 (${attempt}/${retries - 1}回目)`);
    },
  });
  const text = await res.text();
  return parseIcs(text);
};

const parseIcs = (icsText) => {
  const unfolded = icsText.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '');
  const blocks = unfolded.match(/BEGIN:VEVENT[\s\S]*?END:VEVENT/g) ?? [];
  return blocks.map(parseVEvent).filter(Boolean);
};

const parseVEvent = (block) => {
  const get = (key) => {
    const match = block.match(new RegExp(`^${key}[;:][^\r\n]*`, 'm'));
    if(!match) return '';
    return match[0].slice(match[0].indexOf(':') + 1).trim();
  };

  const dtstart     = get('DTSTART');
  const summary     = get('SUMMARY');
  const description = get('DESCRIPTION');

  if(!dtstart || !summary) return null;

  const releaseDateStr = dtstart.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3');
  const sinkanUrl      = description.match(/href=["'](.*?)["']/)?.[1] ?? '';

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
  const publisherName = rest.length >= 1 ? rest[rest.length - 1] : '';
  const authorName    = rest.length >= 2 ? rest[0] : '';

  return { releaseDateStr, bookTitle: summary, sinkanUrl, authorName, publisherName };
};

// =============================================================================
// エントリーポイント
// =============================================================================
main()
  .then(() => {})
  .catch((error) => { console.error(error); });
