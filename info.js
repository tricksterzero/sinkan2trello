import * as config from './config.js';
const {
  SINKAN_ICAL_URL,
  TRELLO_API_KEY,
  TRELLO_API_TOKEN,
  TRELLO_BOARD_ID,
  TRELLO_LIST_ID
} = config;

import { createTrelloCardName } from './config.js';


info();


// Trelloのボード一覧とリスト一覧を表示する
async function info() {
  //const trelloResponse = await fetch(`https://api.trello.com/1/members/me/?key=${TRELLO_API_KEY}&token=${TRELLO_API_TOKEN}`);

  // ボード一覧を出力する
  const trelloBoardResponse = await fetch(`https://api.trello.com/1/members/me/boards?key=${TRELLO_API_KEY}&token=${TRELLO_API_TOKEN}&fields=name,closed`);
  const trelloBoardResponseJson = await trelloBoardResponse.json();
  console.log('Boards.');
  console.log(trelloBoardResponseJson);
  console.log('\n');

  // リスト一覧を出力する
  const trelloListResponse = await fetch(`https://api.trello.com/1/boards/${TRELLO_BOARD_ID}/lists?key=${TRELLO_API_KEY}&token=${TRELLO_API_TOKEN}&fields=name,closed`);
  const trelloListResponseJson = await trelloListResponse.json();
  console.log('Lists.');
  console.log(trelloListResponseJson);
  console.log('\n');

  // カード名の例を出力する
  const releaseDateStr = '2023-03-23';
  const bookTitle      = 'タイトル';
  const authorName     = '作者名';
  const publisherName  = '出版社';
  const cardName = createTrelloCardName(releaseDateStr, bookTitle, authorName, publisherName);
  console.log('Card name example.');
  console.log(cardName);
}
