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

// タイムアウト付き fetch をリトライする。
// 成功時は Response を返す。全試行が失敗したら例外を投げる。
// onRetry({ attempt, retries, isTimeout, error }) でリトライ時の表示を呼び出し側に委ねる。
export const fetchWithRetry = async (
  url,
  { options = {}, timeout = 30 * 1000, retries = 3, retryDelay = 1000, onRetry } = {}
) => {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      const res = await fetchWithTimeout(url, options, timeout);
      if (!res.ok) throw new Error(`HTTP error: ${res.status}`);
      return res;
    } catch (error) {
      const isTimeout = error.name === 'AbortError';
      const isLast = attempt === retries;
      if (isLast) throw new Error(isTimeout ? 'タイムアウトしました' : `取得失敗: ${error.message}`);
      if (onRetry) onRetry({ attempt, retries, isTimeout, error });
      await sleep(retryDelay);
    }
  }
};
