// =============================================================================
// Trello API クライアント
// =============================================================================
// API キー/トークンを束ねたクライアントを生成する。
// setup.js は入力中の資格情報で、index.js / info.js は config.js の資格情報で使う。

const BASE = 'https://api.trello.com/1';

export const createTrelloClient = (apiKey, apiToken) => {
  const buildUrl = (path, params = {}) => {
    const query = new URLSearchParams({ key: apiKey, token: apiToken, ...params });
    return `${BASE}${path}?${query}`;
  };

  const get = async (path, params = {}) => {
    const res = await fetch(buildUrl(path, params));
    if (!res.ok) throw new Error(`Trello API error: ${res.status}`);
    return res.json();
  };

  const post = async (path, body = {}, params = {}) => {
    const res = await fetch(buildUrl(path, params), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) throw new Error(`Trello API error: ${res.status}`);
    return res.json();
  };

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
