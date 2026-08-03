// =============================================================================
// config.js の読み込み（index.js / info.js 共通）
// =============================================================================
// config.js は setup.js が生成する。未生成（初回・誤削除）のときは Node 生の
// ERR_MODULE_NOT_FOUND スタックトレースではなく、setup への導線を出して終了する。
//
// config.js の有無は import を試みる前に fs.existsSync で確認する。import()の
// ERR_MODULE_NOT_FOUND だけで判定すると、config.js 自体は存在するが内部で
// 別モジュールのimportに失敗した場合も同じエラーコードになり、「config.jsが
// 見つかりません」という誤った案内をしてしまうため。

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { printError } from './log.js';

const CONFIG_PATH = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'config.js');

export const loadConfig = async () => {
  if (!fs.existsSync(CONFIG_PATH)) {
    printError('config.js が見つかりません。先に node setup.js を実行して初期設定してください。');
    process.exit(1);
  }
  return import('../config.js');
};
