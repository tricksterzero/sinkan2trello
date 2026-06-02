// =============================================================================
// Sinkan2Trello 設定ファイルのテンプレート
// =============================================================================
// このファイルを config.js にコピー（リネーム）し、各値を埋めてください。
// （対話式に生成するなら setup.js の実行でも作れます）
// ※ APIキー/トークンを含む秘密情報です。第三者への共有やリポジトリへのコミットは避けてください。
// =============================================================================

// 新刊.netのiCal形式カレンダーへのURL
export const SINKAN_ICAL_URL = 'Sinkan.net iCal URL';

// TrelloのAPIキーとトークン
export const TRELLO_API_KEY   = 'Your Trello API Key';
export const TRELLO_API_TOKEN = 'Your Trello API Token';

// info.js でリスト一覧を表示する際に使う（本体 index.js では未使用）。info.jsを実行すると調べられる
export const TRELLO_BOARD_ID = 'Your Trello Board ID'; // 例: 「新刊情報」ボード
// 本体の対象リスト。新規カードは先頭 [0] のリストの最上部に追加される
export const TRELLO_LIST_ID  = ['Your Trello List ID 0', 'Your Trello List ID 1', 'Your Trello List ID 2']; // 例: 「購入前」「購入済」「不要」

// Trelloに登録するカード名を定義して文字列として返す関数。info.jsを実行すると生成例が表示される
// 重複チェックに使うので変更するとカードが増える点に注意
export function createTrelloCardName(releaseDateStr, bookTitle, authorName, publisherName) {
  // 以下の変数からカード名を設定できる
  // releaseDateStr 発売日。"2026-01-23"のような文字列
  // bookTitle      タイトル
  // authorName     作者
  // publisherName  出版社

  return `${releaseDateStr} ${bookTitle}`;
};
