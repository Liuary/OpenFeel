#!/usr/bin/env node
/**
 * 一次性清理脚本（v1.1.2-stage-48 op-006）——清理 ~/.openfeel/config.json 中 projects 下的测试死映射。
 * 约束：
 *  - 匹配式 = 路径末段匹配（禁用字面前缀匹配，后者实测 0 命中会造成假性通过）；
 *  - JSON 解析失败 → 中止且不写盘（保护原文件）；
 *  - 支持 --dry-run（不写盘）与 --target <file>（供隔离副本验证）。
 * 本脚本为工作区临时产物：不进入 src/、不进入 package.json files。
 */
import { readFileSync, writeFileSync, copyFileSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const ti = args.indexOf('--target');
const target = ti >= 0 ? args[ti + 1] : join(homedir(), '.openfeel', 'config.json');
const EXPECTED = 455;
const PREFIX = 'openfeel-update-test-';

/** 末段匹配（唯一正确匹配式） */
const isDeadTestKey = (k) => k.split(/[\\/]/).pop().startsWith(PREFIX);

if (!existsSync(target)) { console.error(`[clean] 文件不存在：${target}`); process.exit(1); }

let obj;
try {
  obj = JSON.parse(readFileSync(target, 'utf-8'));
} catch (e) {
  // 错误路径：解析失败 → 中止，绝不写盘（保护原文件）
  console.error(`[clean] JSON 解析失败，已中止、未修改任何文件：${e.message}`);
  process.exit(2);
}

const projects = obj.projects ?? {};
const keys = Object.keys(projects);
const dead = keys.filter(isDeadTestKey);

console.log(`[clean] target=${target}`);
console.log(`[clean] projects=${keys.length} dead=${dead.length} keep=${keys.length - dead.length}`);

if (dead.length !== EXPECTED && process.env.CLEAN_ALLOW_COUNT_MISMATCH !== '1') {
  // 错误路径：删除数不符预期 → 中止（防「0 命中假性通过」）
  console.error(`[clean] 断言失败：dead=${dead.length} ≠ 期望 ${EXPECTED}（强制请设 CLEAN_ALLOW_COUNT_MISMATCH=1）`);
  process.exit(3);
}

if (dryRun) { console.log('[clean] dry-run：未写盘'); process.exit(0); }

// 备份（带时间戳）
const ts = new Date().toISOString().replace(/[:.]/g, '-');
const backup = `${target}.bak.${ts}`;
copyFileSync(target, backup);
console.log(`[clean] 备份：${backup}`);

for (const k of dead) { delete projects[k]; }
obj.projects = projects;
const out = JSON.stringify(obj, null, 2) + '\n';
JSON.parse(out); // 写前自校验：确保输出为合法 JSON
writeFileSync(target, out, 'utf-8');
console.log(`[clean] 完成：删除 ${dead.length} 条，projects 剩余 ${Object.keys(projects).length}`);
