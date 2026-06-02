import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import fs from 'fs';
import { createTrelloClient } from './lib/trello.js';
import { fetchWithRetry } from './lib/net.js';
import { print, printSection, printError, printSuccess, clearProgress } from './lib/log.js';

const CONFIG_PATH = './config.js';
const BACKUP_PATH = './config.js.bak';

// =============================================================================
// ユーティリティ
// =============================================================================

const rl = readline.createInterface({ input, output });

const ask = (question) => rl.question(question);

// 進捗行のクリアは lib/log.js の clearProgress を使う（TTY セーフ・index.js と共通）。

// =============================================================================
// 対話ステップ
// =============================================================================

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
      await fetchWithRetry(url, {
        options: { method: 'HEAD' },
        timeout: 15000,
        retries: 3,
        onRetry: ({ attempt }) => {
          clearProgress();
          process.stdout.write('  iCal URLに接続確認中... リトライ中... ' + attempt + '回目');
        },
      });
      clearProgress();
      printSuccess('接続成功。');
      return url;
    } catch (err) {
      clearProgress();
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
      const trello = createTrelloClient(apiKey, apiToken);
      const me = await trello.getMe();
      clearProgress();
      printSuccess(`接続成功 — ${me.fullName ?? me.username} としてログインしています。`);
      return { apiKey, apiToken };
    } catch {
      clearProgress();
      printError('接続に失敗しました。APIキーとトークンを確認して再入力してください。');
      print();
    }
  }
};

const stepBoardId = async (trello) => {
  printSection('Trello ボードの選択');

  const boards = (await trello.getBoards()).filter((b) => !b.closed);
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

const stepListIds = async (trello, boardId) => {
  printSection('Trello リストの選択');
  print('使用するリストをカンマ区切りの番号で入力してください。');
  print('例: 1,3,5');
  print();

  const lists = (await trello.getLists(boardId)).filter((l) => !l.closed);
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
  // 入力値は JSON.stringify で正しい JS 文字列リテラルにする。' \ 改行 ${ } などが
  // 含まれても config.js が壊れたり、コード片が混入したりしないようにするため
  // （config.js は import で実行されるので、生成内容の健全性は重要）。
  const listIdsStr = listIds.map((id) => JSON.stringify(id)).join(', ');
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
    `export const SINKAN_ICAL_URL = ${JSON.stringify(sinkanIcalUrl)};`,
    '',
    `// TrelloのAPIキーとトークン`,
    `export const TRELLO_API_KEY   = ${JSON.stringify(apiKey)};`,
    `export const TRELLO_API_TOKEN = ${JSON.stringify(apiToken)};`,
    '',
    `// Trelloの書き込み先`,
    `export const TRELLO_BOARD_ID = ${JSON.stringify(boardId)};`,
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
    const trello               = createTrelloClient(apiKey, apiToken);
    const boardId              = await stepBoardId(trello);
    const listIds              = await stepListIds(trello, boardId);
    await stepCardNameExample();

    printSection('config.js を生成');
    const config = generateConfig({ sinkanIcalUrl, apiKey, apiToken, boardId, listIds });
    saveConfig(config);

    print();
    print('セットアップが完了しました。');
    print('次のステップ: node index.js を実行してください。');
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
