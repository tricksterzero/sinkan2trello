// 新刊.netのiCal形式カレンダーへのURL
export const SINKAN_ICAL_URL = 'Sinkan.net iCal URL';

// TrelloのAPIキーとトークン
export const TRELLO_API_KEY   = 'Your Trello API Key';
export const TRELLO_API_TOKEN = 'Your Trello API Token';

// Trelloの書き込み先。info.jsを実行すると調べられる
export const TRELLO_BOARD_ID = 'Your Trello Board ID'; // 「新刊情報」
export const TRELLO_LIST_ID  = ['Your Trello List ID 0', 'Your Trello List ID 1', 'Your Trello List ID 2']; // 「購入前」と「購入済」と「不要」

// Trelloに登録するカード名を定義して文字列として返す関数。info.jsを実行すると生成例が表示される
// 重複チェックに使うので変更するとカードが増える点に注意
export function createTrelloCardName(releaseDateStr, bookTitle, authorName, publisherName) {
  // 以下の変数からカード名を設定できる
  // releaseDateStr 発売日。"2023-03-23"のような文字列
  // bookTitle      タイトル
  // authorName     作者
  // publisherName  出版社

  return `${releaseDateStr} ${bookTitle}`;
};
