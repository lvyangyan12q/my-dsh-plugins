'use strict';
// 解析 jsdom：优先 env JSDOM_PATH，其次工作台/仓库的 node_modules，最后常见的本机 checkout。
// 两个 smoke 脚本共用，避免把某台机器的绝对路径写死。
const path = require('node:path');

const ROOT = path.resolve(__dirname, '..');
const CANDIDATES = [
  process.env.JSDOM_PATH,
  path.join(ROOT, 'node_modules', 'jsdom'),
  path.join(process.cwd(), 'node_modules', 'jsdom'),
  'F:\\ai-project\\deepseek-harness\\node_modules\\jsdom',
];

function resolveJsdom() {
  const tried = [];
  for (const candidate of CANDIDATES) {
    if (!candidate) continue;
    tried.push(candidate);
    try {
      const entry = require.resolve(candidate);
      return require(entry);
    } catch (e) {
      // try next candidate
    }
  }
  throw new Error(
    '找不到 jsdom。请先 `npm i -D jsdom`（在仓库根目录），或用环境变量 JSDOM_PATH 指向 jsdom 包目录/入口。\n' +
      '已尝试：\n - ' + tried.join('\n - '),
  );
}

module.exports = { resolveJsdom };
