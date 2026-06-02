import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import fs from 'fs';

const CONFIG_PATH = './config.js';
const BACKUP_PATH = './config.js.bak';

// =============================================================================
// ユーティリティ
// =============================================================================

const rl = readline.createInterface({ input, output });

const ask = (question) => rl.question(question);

const print = (msg = '') => console.log(msg);
const printSection = (title) => {
  print();
  print(`── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}`);
};
const printError   = (msg) => console.error(`  ✗ ${msg}`);
const printSuccess = (msg) => console.log(`  ✓ ${msg}`);

// =============================================================================
// Trello API
// =============================================================================

const trelloGet = async (path, params, apiKey, apiToken) => {
  const query = new URLSearchParams({ key: apiKey, token: apiToken, ...params });
  const url = `https://api.trello.com/1${path}?${query}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
};

const verifyTrelloCredentials = async (apiKey, apiToken) => {
  const data = await trelloGet('/members/me', {}, apiKey, apiToken);
  return data.fullName ?? data.username;
};

const fetchBoards = (apiKey, apiToken) =>
  trelloGet('/members/me/boards', { fields: 'name,closed' }, apiKey, apiToken);

const fetchLists = (boardId, apiKey, apiToken) =>
  trelloGet(`/boards/${boardId}/lists`, { fields: 'name,closed' }, apiKey, apiToken);

// =============================================================================
// 対話ステップ
// =============================================================================

const fetchWithTimeout = (url, options, timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
};

const verifySinkanUrl = async (url, { retries = 3, timeoutMs = 15000 } = {}) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, { method: 'HEAD' }, timeoutMs);
      if (!res.ok) throw new Error('HTTP ' + res.status);
      return;
    } catch (err) {
      const isLast = attempt === retries;
      if (isLast) throw err;
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      process.stdout.write('  iCal URLに接続確認中... タイムアウト、リトライ中... ' + attempt + '回目');
    }
  }
};

const stepSinkanUrl = async () => {
  printSection('新刊.net iCal URL');
  print('新刊.netのマイページからiCal形式のカレンダーURLをコピーしてください。');
  print('例: https://sinkan.net/ical/xxxxxxxxxxxxxxxx.ics');
  print();
  while (true) {
    const url = (await ask('iCal URL: ')).trim();
    if (!url.startsWith('http')) {
      printError('URLは http または https で始まる必要があります。');
      continue;
    }
    process.stdout.write('  iCal URLに接続確認中...');
    try {
      await verifySinkanUrl(url);
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      printSuccess('接続成功。');
      return url;
    } catch (err) {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      printError('接続に失敗しました（' + err.message + '）。URLを確認して再入力してください。');
    }
  }
};

const stepTrelloCredentials = async () => {
  printSection('Trello APIキーとトークン');
  print('https://trello.com/power-ups/admin でAPIキーとトークンを取得してください。');
  print();

  while (true) {
    const apiKey   = (await ask('API Key   : ')).trim();
    const apiToken = (await ask('API Token : ')).trim();

    process.stdout.write('  Trello APIに接続確認中...');
    try {
      const userName = await verifyTrelloCredentials(apiKey, apiToken);
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      printSuccess(`接続成功 — ${userName} としてログインしています。`);
      return { apiKey, apiToken };
    } catch {
      process.stdout.clearLine(0);
      process.stdout.cursorTo(0);
      printError('接続に失敗しました。APIキーとトークンを確認して再入力してください。');
      print();
    }
  }
};

const stepBoardId = async (apiKey, apiToken) => {
  printSection('Trello ボードの選択');

  const boards = (await fetchBoards(apiKey, apiToken)).filter((b) => !b.closed);
  boards.forEach((b, i) => print(`  [${i + 1}] ${b.name}`));
  print();

  while (true) {
    const raw = (await ask('使用するボードの番号: ')).trim();
    const index = parseInt(raw, 10) - 1;
    if (index >= 0 && index < boards.length) {
      printSuccess(`選択: ${boards[index].name}`);
      return boards[index].id;
    }
    printError(`1 〜 ${boards.length} の番号を入力してください。`);
  }
};

const stepListIds = async (boardId, apiKey, apiToken) => {
  printSection('Trello リストの選択');
  print('使用するリストをカンマ区切りの番号で入力してください。');
  print('例: 1,3,5');
  print();

  const lists = (await fetchLists(boardId, apiKey, apiToken)).filter((l) => !l.closed);
  lists.forEach((l, i) => print(`  [${i + 1}] ${l.name}`));
  print();

  while (true) {
    const raw = (await ask('リストの番号: ')).trim();
    const indices = raw.split(',').map((s) => parseInt(s.trim(), 10) - 1);
    const valid  = indices.every((i) => i >= 0 && i < lists.length);
    const unique = new Set(indices).size === indices.length;

    if (valid && unique && indices.length > 0) {
      const selected = indices.map((i) => lists[i]);
      selected.forEach((l) => printSuccess(`選択: ${l.name}`));
      return selected.map((l) => l.id);
    }
    printError(`1 〜 ${lists.length} の番号をカンマ区切りで入力してください（重複不可）。`);
  }
};

const stepCardNameExample = async () => {
  printSection('カード名のカスタマイズ');
  print('config.js の createTrelloCardName 関数でカード名の形式を変更できます。');
  print('デフォルト: "2023-03-23 タイトル"');
  print();
  print('この設定はセットアップ後に config.js を直接編集して変更できます。');
  print('※ カード名は重複チェックに使われるため、変更すると既存カードが重複登録される場合があります。');
  await ask('Enterを押して続ける...');
};

// =============================================================================
// config.js の生成
// =============================================================================

const generateConfig = ({ sinkanIcalUrl, apiKey, apiToken, boardId, listIds }) => {
  const listIdsStr = listIds.map((id) => `'${id}'`).join(', ');
  const lines = [
    `// =============================================================================`,
    `// Sinkan2Trello 設定ファイル`,
    `// =============================================================================`,
    `// このファイルは setup.js によって自動生成されました。`,
    `// 設定を変更する場合は直接編集するか、setup.js を再実行してください。`,
    `// =============================================================================`,
    '',
    '',
    `// 新刊.netのiCal形式カレンダーへのURL`,
    `export const SINKAN_ICAL_URL = '${sinkanIcalUrl}';`,
    '',
    `// TrelloのAPIキーとトークン`,
    `export const TRELLO_API_KEY   = '${apiKey}';`,
    `export const TRELLO_API_TOKEN = '${apiToken}';`,
    '',
    `// Trelloの書き込み先`,
    `export const TRELLO_BOARD_ID = '${boardId}';`,
    `export const TRELLO_LIST_ID  = [${listIdsStr}];`,
    '',
    `// Trelloに登録するカード名を定義して文字列として返す関数。info.jsを実行すると生成例が表示される`,
    `// 重複チェックに使うので変更するとカードが増える点に注意`,
    `export const createTrelloCardName = (releaseDateStr, bookTitle, authorName, publisherName) => {`,
    `  // 以下の変数からカード名を設定できる`,
    '  // releaseDateStr 発売日。"2023-03-23"のような文字列',
    `  // bookTitle      タイトル`,
    `  // authorName     作者`,
    `  // publisherName  出版社`,
    '  return `${releaseDateStr} ${bookTitle}`;',
    `};`,
    '',
  ];
  return lines.join('\n');
};
const saveConfig = (content) => {
  if (fs.existsSync(CONFIG_PATH)) {
    fs.copyFileSync(CONFIG_PATH, BACKUP_PATH);
    printSuccess(`既存の config.js を ${BACKUP_PATH} にバックアップしました。`);
  }
  fs.writeFileSync(CONFIG_PATH, content, 'utf8');
  printSuccess('config.js を生成しました。');
};

// =============================================================================
// メイン
// =============================================================================

const main = async () => {
  print();
  print('╔══════════════════════════════════════════════╗');
  print('║       Sinkan2Trello セットアップ             ║');
  print('╚══════════════════════════════════════════════╝');
  print('設定項目を順番に入力してください。');
  print('途中でキャンセルする場合は Ctrl+C を押してください。');

  try {
    const sinkanIcalUrl        = await stepSinkanUrl();
    const { apiKey, apiToken } = await stepTrelloCredentials();
    const boardId              = await stepBoardId(apiKey, apiToken);
    const listIds              = await stepListIds(boardId, apiKey, apiToken);
    await stepCardNameExample();

    printSection('config.js を生成');
    const config = generateConfig({ sinkanIcalUrl, apiKey, apiToken, boardId, listIds });
    saveConfig(config);

    print();
    print('セットアップが完了しました。');
    print('次のステップ: node main.js を実行してください。');
    print();
  } catch (err) {
    print();
    printError(`予期しないエラーが発生しました: ${err.message}`);
    process.exit(1);
  } finally {
    rl.close();
  }
};

main();
