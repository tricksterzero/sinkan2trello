// =============================================================================
// ネットワークユーティリティ（タイムアウト付き fetch とリトライ）
// =============================================================================

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

// レスポンス本文を上限バイト数つきで読み取る（UTF-8）。巨大/無限レスポンスによる
// メモリ枯渇を防ぐ。Content-Length があれば事前に拒否し、無くても/詐称されても
// 実読込でストリームを監視して上限超過で中断する。
// サイズ超過は再試行しても解決しない性質のエラーなので nonRetryable を立てる
// （fetchWithRetry 経由で呼ばれたときに無駄なリトライをしないようにするため）。
export const readTextCapped = async (res, maxBytes) => {
  const declared = Number(res.headers.get('content-length'));
  if (Number.isFinite(declared) && declared > maxBytes) {
    throw Object.assign(
      new Error(`レスポンスが大きすぎます（宣言 ${declared} バイト > 上限 ${maxBytes} バイト）`),
      { nonRetryable: true }
    );
  }
  if (!res.body) return res.text(); // ストリーム非対応環境へのフォールバック
  const reader = res.body.getReader();
  const chunks = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > maxBytes) {
      await reader.cancel().catch(() => {});
      throw Object.assign(
        new Error(`レスポンスが上限 ${maxBytes} バイトを超えました`),
        { nonRetryable: true }
      );
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString('utf-8');
};

// タイムアウト付きの fetch。timeoutMs を超えると AbortError で中断する。
// fetch() 自体はヘッダー受信時点で解決してしまうため、素のままでは本文読み込み中は
// タイムアウトが効かない（相手がslow-dripで本文を送り続けると無期限にハングし得る）。
// readBody を渡すと、その実行中も同じ AbortSignal でタイマーを維持し、本文読み込みの
// 遅延も含めて timeoutMs で保護する。
export const fetchWithTimeout = async (url, options = {}, timeoutMs = 30 * 1000, readBody) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...options, signal: controller.signal });
    return readBody ? await readBody(res) : res;
  } finally {
    clearTimeout(timer);
  }
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
// readBody を渡した場合は成功時にその戻り値を返す（省略時は Response を返す）。
// readBody は fetchWithTimeout に委譲され、本文読み込みまでタイムアウトで保護される。
//
// リトライ対象: ネットワークエラー / タイムアウト / HTTP 429・5xx。
// 即失敗: それ以外の 4xx（404 等、再試行しても無駄なもの）、および readBody が
// nonRetryable エラー（サイズ超過・応答内容の解釈失敗等、再試行しても解決しない性質）
// を投げた場合。
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
    readBody,                 // (res) => Promise<T> 本文読み込み（タイムアウト保護区間内で実行）
  } = {}
) => {
  const backoffOpts = { base: retryDelay, factor: backoffFactor, maxDelay, jitter };

  for (let attempt = 1; attempt <= retries; attempt++) {
    const isLast = attempt === retries;

    try {
      return await fetchWithTimeout(url, options, timeout, async (res) => {
        if (res.ok) return readBody ? readBody(res) : res;
        throw Object.assign(new Error(`HTTP error: ${res.status}`), {
          status: res.status,
          retryAfter: res.headers.get('retry-after'),
        });
      });
    } catch (error) {
      // サイズ超過・応答内容の解釈失敗など、再試行しても解決しない性質のエラーは即失敗。
      if (error.nonRetryable) throw error;

      const isTimeout = error.name === 'AbortError';
      const status = error.status ?? null;
      // タイムアウト・ステータス不明（接続エラー等）は常に再試行対象。
      // HTTPエラーは isRetryableStatus（429・5xx）のみ再試行対象。
      const retryable = (isTimeout || status === null) ? true : isRetryableStatus(status);

      if (!retryable || isLast) {
        if (isTimeout) throw new Error('タイムアウトしました');
        if (status === null) throw new Error(`取得失敗: ${error.message}`);
        throw error; // HTTP error（4xx/5xx）はそのまま
      }

      const retryAfterMs = status !== null ? parseRetryAfter(error.retryAfter) : null;
      const delayMs = retryAfterMs ?? backoffDelay(attempt, backoffOpts);
      if (onRetry) onRetry({ attempt, retries, isTimeout, status, error, delayMs });
      await sleep(delayMs);
    }
  }
};
