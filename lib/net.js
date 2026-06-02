// =============================================================================
// ネットワークユーティリティ（タイムアウト付き fetch とリトライ）
// =============================================================================

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// タイムアウト付きの fetch。timeoutMs を超えると AbortError で中断する。
export const fetchWithTimeout = (url, options = {}, timeoutMs = 30 * 1000) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
};

// リトライしても無意味な HTTP ステータス（4xx）かどうか。
// 429（Too Many Requests）と 5xx（サーバー側一時障害）は再試行する価値がある。
const isRetryableStatus = (status) => status === 429 || status >= 500;

// Retry-After ヘッダ（秒数 or HTTP-date）をミリ秒に変換する。無効なら null。
const parseRetryAfter = (value) => {
  if (!value) return null;
  const sec = Number(value);
  if (Number.isFinite(sec)) return Math.max(0, sec * 1000);
  const epoch = Date.parse(value);
  return Number.isFinite(epoch) ? Math.max(0, epoch - Date.now()) : null;
};

// 指数バックオフ＋ジッターで待ち時間(ms)を算出する。
// attempt は 1 始まり。base * factor^(attempt-1) を maxDelay で頭打ちにし、
// ±jitter 割合のランダム揺らぎを加える（サーバーへの同時再試行集中を避けるため）。
const backoffDelay = (attempt, { base, factor, maxDelay, jitter }) => {
  const raw = Math.min(base * factor ** (attempt - 1), maxDelay);
  const rand = 1 + (Math.random() * 2 - 1) * jitter;
  return Math.max(0, Math.round(raw * rand));
};

// タイムアウト付き fetch をリトライする。
// 成功時は Response を返す。全試行が失敗したら例外を投げる。
//
// リトライ対象: ネットワークエラー / タイムアウト / HTTP 429・5xx。
// 即失敗: それ以外の 4xx（404 等、再試行しても無駄なもの）。
// 429・503 で Retry-After が付く場合はその指示を優先して待つ。
//
// 待ち時間は指数バックオフ＋ジッター（base→base*factor→… 上限 maxDelay）。
// onRetry({ attempt, retries, isTimeout, status, error, delayMs }) で
// リトライ時の表示を呼び出し側に委ねる。
export const fetchWithRetry = async (
  url,
  {
    options = {},
    timeout = 30 * 1000,
    retries = 3,
    retryDelay = 1000,        // バックオフの基点(ms)
    backoffFactor = 2,        // 指数の倍率
    maxDelay = 30 * 1000,     // バックオフ上限(ms)
    jitter = 0.3,             // ±割合のランダム揺らぎ
    onRetry,
  } = {}
) => {
  const backoffOpts = { base: retryDelay, factor: backoffFactor, maxDelay, jitter };

  for (let attempt = 1; attempt <= retries; attempt++) {
    const isLast = attempt === retries;
    let res;

    // --- 接続フェーズ（ネットワークエラー / タイムアウト）---
    try {
      res = await fetchWithTimeout(url, options, timeout);
    } catch (error) {
      const isTimeout = error.name === 'AbortError';
      if (isLast) throw new Error(isTimeout ? 'タイムアウトしました' : `取得失敗: ${error.message}`);
      const delayMs = backoffDelay(attempt, backoffOpts);
      if (onRetry) onRetry({ attempt, retries, isTimeout, status: null, error, delayMs });
      await sleep(delayMs);
      continue;
    }

    // --- 応答フェーズ ---
    if (res.ok) return res;

    const error = new Error(`HTTP error: ${res.status}`);
    // 再試行しても無駄な 4xx、または最終試行なら即失敗
    if (!isRetryableStatus(res.status) || isLast) throw error;

    // 429・503 等。Retry-After があれば優先、なければ指数バックオフ。
    const retryAfterMs = parseRetryAfter(res.headers.get('retry-after'));
    const delayMs = retryAfterMs ?? backoffDelay(attempt, backoffOpts);
    if (onRetry) onRetry({ attempt, retries, isTimeout: false, status: res.status, error, delayMs });
    await sleep(delayMs);
  }
};
