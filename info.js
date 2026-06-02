import { TRELLO_API_KEY, TRELLO_API_TOKEN, TRELLO_BOARD_ID, createTrelloCardName } from './config.js';
import { createTrelloClient } from './lib/trello.js';
import { print, printError, printSection, printProgress, printProgressDone, clearProgress } from './lib/log.js';

const trello = createTrelloClient(TRELLO_API_KEY, TRELLO_API_TOKEN);

// Trelloのボード一覧・リスト一覧・カード名の生成例を表示する
const info = async () => {
  print();
  print('╔══════════════════════════════════════════════╗');
  print('║         Trello 情報確認                      ║');
  print('╚══════════════════════════════════════════════╝');

  // ボード一覧（config.js の TRELLO_BOARD_ID をここから選ぶ）
  printSection('Trello ボード一覧');
  printProgress('ボード一覧を取得中...');
  try {
    const boards = await trello.getBoards();
    printProgressDone(`ボードを ${boards.length} 件取得。`);
    boards.forEach((b) => print(`  ${b.id}  ${b.name}${b.closed ? '（クローズ）' : ''}`));
  } catch (err) {
    clearProgress();
    printError(`ボード一覧の取得に失敗しました: ${err.message}`);
  }

  // リスト一覧（TRELLO_BOARD_ID 未設定時は失敗するが、ボード一覧の確認は先に済んでいる）
  printSection(`リスト一覧（ボード: ${TRELLO_BOARD_ID || '未設定'}）`);
  printProgress('リスト一覧を取得中...');
  try {
    const lists = await trello.getLists(TRELLO_BOARD_ID);
    printProgressDone(`リストを ${lists.length} 件取得。`);
    lists.forEach((l) => print(`  ${l.id}  ${l.name}${l.closed ? '（クローズ）' : ''}`));
  } catch (err) {
    clearProgress();
    printError(`リスト一覧の取得に失敗しました: ${err.message}`);
  }

  // カード名の生成例（config.js の createTrelloCardName の出力確認）
  printSection('カード名の生成例');
  print('  ' + createTrelloCardName('2023-03-23', 'タイトル', '作者名', '出版社'));
  print();
};

info().catch((err) => console.error(err));
