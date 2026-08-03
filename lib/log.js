// =============================================================================
// 出力ヘルパー（index.js / setup.js / info.js 共通）
// =============================================================================

export const print        = (msg = '') => console.log(msg);
export const printError   = (msg)      => console.error(`  ✗ ${msg}`);
export const printSuccess = (msg)      => console.log(`  ✓ ${msg}`);
export const printVerbose = (msg)      => console.log(`  ◆ ${msg}`);
export const printWarning = (msg)      => console.log(`  ! ${msg}`);

// セクション見出し（「── タイトル ──────」の形式）
export const printSection = (title) => {
  print();
  print(`── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}`);
};

// 進捗表示（改行せず上書きするための1行出力）
export const printProgress = (msg) => {
  process.stdout.write(`  … ${msg}`);
};

// 進捗行をクリアする。TTY なら行を消してカーソルを先頭へ。
// 非TTY（リダイレクト等）では clearLine が無いので改行で代替する。
export const clearProgress = () => {
  if (process.stdout.isTTY) {
    process.stdout.clearLine(0);
    process.stdout.cursorTo(0);
  } else {
    process.stdout.write('\n');
  }
};

// 進捗行をクリアして完了メッセージに置き換える
export const printProgressDone = (msg) => {
  clearProgress();
  printSuccess(msg);
};
