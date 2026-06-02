// =============================================================================
// Trello API クライアント
// =============================================================================
// API キー/トークンを束ねたクライアントを生成する。
// setup.js は入力中の資格情報で、index.js / info.js は config.js の資格情報で使う。

import { fetchWithRetry, fetchWithTimeout } from './net.js';

const BASE = 'https://api.trello.com/1';
const TIMEOUT_MS = 15 * 1000; // Trello は反応が良いが、無応答時に無限待ちしないための保険

export const createTrelloClient = (apiKey, apiToken) => {
  const buildUrl = (path, params = {}) => {
    const query = new URLSearchParams({ key: apiKey, token: apiToken, ...params });
    return `${BASE}${path}?${query}`;
  };

  // 共通リクエスト。タイムアウト付き fetch で送り、エラーを分かりやすく整える。
  // （リトライはしない。一過性失敗の再試行は呼び出し側の方針に委ねる）
  const request = async (url, options = {}) => {
    let res;
    try {
      res = await fetchWithTimeout(url, options, TIMEOUT_MS);
    } catch (err) {
      if (err.name === 'AbortError') {
        throw new Error(`Trello APIがタイムアウトしました（${TIMEOUT_MS / 1000}秒以内に応答なし）`);
      }
      throw new Error(`Trello APIへの接続に失敗しました: ${err.message}`);
    }
    if (!res.ok) throw new Error(`Trello API error: ${res.status}`);
    return res.json();
  };

  // 一覧取得などの GET は冪等なので、一過性の失敗（タイムアウト/429/5xx）を
  // リトライする（指数バックオフ＋Retry-After 対応は fetchWithRetry に委譲）。
  // 失敗が全停止につながる経路なので、リトライで救える効果が大きい。
  const get = async (path, params = {}) => {
    let res;
    try {
      res = await fetchWithRetry(buildUrl(path, params), {
        timeout: TIMEOUT_MS,
        retries: 3,
        retryDelay: 1000,
        backoffFactor: 2,
        maxDelay: 8 * 1000,
      });
    } catch (err) {
      throw new Error(`Trello APIの取得に失敗しました: ${err.message}`);
    }
    return res.json();
  };

  // POST はリトライしない。タイムアウトしても実際には登録成功している可能性があり、
  // 再送するとカードが二重登録され得るため、単発（request）に留める。
  const post = (path, body = {}, params = {}) =>
    request(buildUrl(path, params), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });

  return {
    get,
    post,
    // 認証ユーザー情報（資格情報の検証に使う）
    getMe: () => get('/members/me'),
    // 自分のボード一覧
    getBoards: () => get('/members/me/boards', { fields: 'name,closed' }),
    // 指定ボードのリスト一覧
    getLists: (boardId) => get(`/boards/${boardId}/lists`, { fields: 'name,closed' }),
    // 指定リストのカード一覧（重複チェック用に name のみ取得）
    getCards: (listId) => get(`/lists/${listId}/cards`, { fields: 'name' }),
    // カードを新規作成
    addCard: (card) => post('/cards', card),
  };
};
