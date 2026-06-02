import { SINKAN_ICAL_URL, TRELLO_API_KEY, TRELLO_API_TOKEN, TRELLO_BOARD_ID, TRELLO_LIST_ID, createTrelloCardName } from './config.js';

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
      const releaseDate = new Date(event.releaseDateStr);
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
// 出力
// =============================================================================
const print        = (msg = '') => console.log(msg);
const printError   = (msg)      => console.error(`  ✗ ${msg}`);
const printSuccess = (msg)      => console.log(`  ✓ ${msg}`);
const printVerbose = (msg)      => console.log(`  ◆ ${msg}`);

const printProgress = (msg) => {
  process.stdout.write(`  … ${msg}`);
};

const printProgressDone = (msg) => {
  process.stdout.clearLine(0);
  process.stdout.cursorTo(0);
  printSuccess(msg);
};

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

// =============================================================================
// Trello
// =============================================================================
const fetchAllTrelloCards = async (verboseMode = false) => {
  if(verboseMode) printVerbose(`取得対象リスト数: ${TRELLO_LIST_ID.length} 件 (IDs: ${TRELLO_LIST_ID.join(', ')})`);
  const results = await Promise.all(
    TRELLO_LIST_ID.map((listId) => fetchTrelloCards(listId, verboseMode))
  );
  return results.flat();
};

const fetchTrelloCards = async (listId, verboseMode = false) => {
  if(verboseMode) printVerbose(`リスト取得中: ${listId}`);
  const res = await fetch(`https://api.trello.com/1/lists/${listId}/cards?key=${TRELLO_API_KEY}&token=${TRELLO_API_TOKEN}&fields=name`);
  if(!res.ok) throw new Error(`Trello API error: ${res.status}`);
  const cards = await res.json();
  if(verboseMode) printVerbose(`  → ${listId}: ${cards.length} 件`);
  return cards;
};

const isDuplicateCard = (cards, cardName) =>
  cards.some((card) => card.name === cardName);

const addTrelloCard = async (cardName, sinkanUrl) => {
  const res = await fetch(`https://api.trello.com/1/cards?key=${TRELLO_API_KEY}&token=${TRELLO_API_TOKEN}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name: cardName,
      urlSource: sinkanUrl,
      pos: 'top',
      idList: TRELLO_LIST_ID[0],
    }),
  });
  if(!res.ok) throw new Error(`Trello API error: ${res.status}`);
  return res.json(); // card オブジェクトを返すように変更
};

// =============================================================================
// iCal
// =============================================================================
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchIcsWithRetry = async (url, { timeout = 30 * 1000, retries = 3, retryDelay = 1000 } = {}) => {
  for(let attempt = 1; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const res = await fetch(url, { signal: controller.signal });
      if(!res.ok) throw new Error(`HTTP error: ${res.status}`);
      return await res.text();
    } catch (error) {
      clearTimeout(timer);
      const isTimeout = error.name === 'AbortError' || controller.signal.aborted;
      const isLast = attempt === retries;
      if(isLast) throw new Error(isTimeout ? 'タイムアウトしました' : `取得失敗: ${error.message}`);
      const reason = isTimeout ? 'タイムアウト' : error.message;
      process.stdout.write(`\r  … 新刊.netに接続中... ${reason}、リトライ中 (${attempt}/${retries - 1}回目)`);
      await sleep(retryDelay);
    } finally {
      clearTimeout(timer);
    }
  }
};

const fetchAndParseIcs = async (url) => {
  const text = await fetchIcsWithRetry(url);
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
  const parts          = description.split('<br />');
  const authorName     = parts[2] ?? '';
  const publisherName  = (parts[3] && parts[3] !== '</a>') ? parts[3] : '';

  return { releaseDateStr, bookTitle: summary, sinkanUrl, authorName, publisherName };
};

// =============================================================================
// エントリーポイント
// =============================================================================
main()
  .then(() => {})
  .catch((error) => { console.error(error); });