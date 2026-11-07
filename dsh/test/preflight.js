/**
 * OpenFeel × DSH 适配器 — preflight 单源 + 写前自愈（v1.5.14 / OF-03）
 *
 * 覆盖：
 * 1. 账本窗口与 CLI 同源：`OPENFEEL_PREFLIGHT_MAX_AGE_MS`（仅正整数，缺省 10 分钟）；
 * 2. `FeelCli.write` 在本地账本缺失/过期时**先真实执行一次** `flow next --json`（用 `run`，不递归），
 *    再照常写入；刷新抛错/失败都被吞掉，不阻断写入；
 * 3. 账本新鲜时不额外调用；`options.cwd` 覆盖默认 cwd。
 *
 * 这里用原型方法 + 假 cli 对象（只提供 `cwd` / `run` / `errorFromResult`），不 spawn 真实 CLI。
 *
 * 用法：node test/preflight.js
 */
import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { FeelCli } from '../lib/adapters/cli.js';
import {
  PREFLIGHT_MAX_AGE_MS,
  getPreflightMaxAgeMs,
  readPreflightInfo,
} from '../lib/adapters/preflight.js';

const write = FeelCli.prototype.write;
const WRITE_ARGS = ['flow', 'advance', '--stage', 'v0-stage-1', '--to', 'done'];

let passed = 0;
let failed = 0;
/** @type {string[]} */
const failures = [];

/**
 * @param {string} name
 * @param {() => any} fn
 */
async function check(name, fn) {
  try {
    await fn();
    passed += 1;
    process.stdout.write(`  ✓ ${name}\n`);
  } catch (error) {
    failed += 1;
    const message = error instanceof Error ? error.message : String(error);
    failures.push(`${name}: ${message}`);
    process.stdout.write(`  ✗ ${name}\n      ${message.split('\n').join('\n      ')}\n`);
  }
}

/** @type {string[]} */
const dirs = [];

function makeProject() {
  const dir = mkdtempSync(join(tmpdir(), 'openfeel-preflight-dsh-'));
  mkdirSync(join(dir, '.openfeel', 'dev'), { recursive: true });
  dirs.push(dir);
  return dir;
}

/** @param {string} dir @param {number} ageMs */
function writeLedger(dir, ageMs) {
  const at = new Date(Date.now() - ageMs).toISOString();
  writeFileSync(
    join(dir, '.openfeel', 'dev', '.preflight.json'),
    JSON.stringify({ at, stage: null, phase: null, revision: 1 }),
    'utf-8',
  );
}

/** 假 cli：记录每次 run 的调用；不实现 write（递归调用会直接 TypeError）。 */
function makeCli(cwd, runImpl) {
  const calls = [];
  return {
    cwd,
    calls,
    async run(args, options = {}) {
      calls.push({ args, options });
      return runImpl(args, options, calls);
    },
    errorFromResult: FeelCli.prototype.errorFromResult,
  };
}

/** @param {string[]} args */
function okResult(args) {
  return { code: 0, stdout: 'ok', stderr: '', durationMs: 1, argv: args };
}

/** 临时设置环境变量，结束后恢复（含原本为 undefined 的情形）。 */
async function withEnv(name, value, fn) {
  const before = process.env[name];
  if (value === undefined) delete process.env[name];
  else process.env[name] = value;
  try {
    return await fn();
  } finally {
    if (before === undefined) delete process.env[name];
    else process.env[name] = before;
  }
}

async function main() {
  await check('getPreflightMaxAgeMs：缺省 10 分钟，仅正整数生效', () => {
    assert.equal(PREFLIGHT_MAX_AGE_MS, 10 * 60_000);
    assert.equal(getPreflightMaxAgeMs({}), PREFLIGHT_MAX_AGE_MS);
    assert.equal(getPreflightMaxAgeMs({ OPENFEEL_PREFLIGHT_MAX_AGE_MS: ' 1800000 ' }), 1_800_000);
    assert.equal(getPreflightMaxAgeMs({ OPENFEEL_PREFLIGHT_MAX_AGE_MS: '1' }), 1);
    for (const bad of ['', ' ', 'abc', '0', '-1', '1.5', '10m', 'Infinity']) {
      assert.equal(
        getPreflightMaxAgeMs({ OPENFEEL_PREFLIGHT_MAX_AGE_MS: bad }),
        PREFLIGHT_MAX_AGE_MS,
        `非法值应回退默认：${JSON.stringify(bad)}`,
      );
    }
  });

  await check('账本缺失 → 写前用 run 执行一次 flow next --json，再写入', async () => {
    const dir = makeProject();
    const cli = makeCli(dir, async (args) => okResult(args));
    const out = await write.call(cli, WRITE_ARGS, {});
    assert.equal(out.ok, true);
    assert.equal(cli.calls.length, 2, `应恰好 2 次调用，实际 ${cli.calls.length}`);
    assert.deepEqual(cli.calls[0].args, ['flow', 'next', '--json']);
    assert.deepEqual(cli.calls[0].options, { cwd: dir });
    assert.deepEqual(cli.calls[1].args, WRITE_ARGS);
  });

  await check('账本过期 → 同样先刷新一次再写入', async () => {
    const dir = makeProject();
    writeLedger(dir, PREFLIGHT_MAX_AGE_MS + 60_000);
    const cli = makeCli(dir, async (args) => okResult(args));
    await write.call(cli, WRITE_ARGS, {});
    assert.equal(cli.calls.length, 2);
    assert.deepEqual(cli.calls[0].args, ['flow', 'next', '--json']);
    assert.deepEqual(cli.calls[1].args, WRITE_ARGS);
  });

  await check('账本新鲜 → 不额外调用（只发写命令）', async () => {
    const dir = makeProject();
    writeLedger(dir, 1_000);
    assert.equal(readPreflightInfo(dir).ok, true);
    const cli = makeCli(dir, async (args) => okResult(args));
    await write.call(cli, WRITE_ARGS, {});
    assert.equal(cli.calls.length, 1, `应恰好 1 次调用，实际 ${cli.calls.length}`);
    assert.deepEqual(cli.calls[0].args, WRITE_ARGS);
  });

  await check('flow next 抛错 → 写入仍执行且成功', async () => {
    const dir = makeProject();
    const cli = makeCli(dir, async (args) => {
      if (args[0] === 'flow' && args[1] === 'next') throw new Error('NO_INIT: 项目未初始化');
      return okResult(args);
    });
    const out = await write.call(cli, WRITE_ARGS, {});
    assert.equal(out.ok, true);
    assert.equal(cli.calls.length, 2);
    assert.deepEqual(cli.calls[1].args, WRITE_ARGS);
  });

  await check('flow next 返回非 0 退出码 → 写入仍执行且成功', async () => {
    const dir = makeProject();
    const cli = makeCli(dir, async (args) => (
      args[1] === 'next'
        ? { code: 1, stdout: '', stderr: 'NO_INIT', durationMs: 1, argv: args }
        : okResult(args)
    ));
    const out = await write.call(cli, WRITE_ARGS, {});
    assert.equal(out.ok, true);
    assert.equal(cli.calls.length, 2);
  });

  await check('OPENFEEL_PREFLIGHT_MAX_AGE_MS 生效：20 分钟旧账本仍新鲜', async () => {
    await withEnv('OPENFEEL_PREFLIGHT_MAX_AGE_MS', '1800000', async () => {
      const dir = makeProject();
      writeLedger(dir, 20 * 60_000);
      assert.equal(readPreflightInfo(dir).ok, true);
      const cli = makeCli(dir, async (args) => okResult(args));
      await write.call(cli, WRITE_ARGS, {});
      assert.equal(cli.calls.length, 1, `长窗口下不应触发刷新，实际 ${cli.calls.length} 次`);
      assert.deepEqual(cli.calls[0].args, WRITE_ARGS);
    });
  });

  await check('OPENFEEL_PREFLIGHT_MAX_AGE_MS 非法（"0"）→ 回退 10 分钟，过期仍刷新', async () => {
    await withEnv('OPENFEEL_PREFLIGHT_MAX_AGE_MS', '0', async () => {
      const dir = makeProject();
      writeLedger(dir, PREFLIGHT_MAX_AGE_MS + 60_000);
      assert.equal(readPreflightInfo(dir).ok, false);
      const cli = makeCli(dir, async (args) => okResult(args));
      await write.call(cli, WRITE_ARGS, {});
      assert.equal(cli.calls.length, 2);
      assert.deepEqual(cli.calls[0].args, ['flow', 'next', '--json']);
    });
  });

  await check('options.cwd 覆盖默认 cwd（账本按实际写入目录判定）', async () => {
    const dir = makeProject();
    writeLedger(dir, 1_000);
    const cli = makeCli(join(tmpdir(), 'openfeel-preflight-elsewhere'), async (args) => okResult(args));
    await write.call(cli, WRITE_ARGS, { cwd: dir });
    assert.equal(cli.calls.length, 1, '账本新鲜（options.cwd 下）不应刷新');
    assert.equal(cli.calls[0].options.cwd, dir);
  });

  await check('cwd 不可用（undefined）→ 跳过自愈，仍执行写入', async () => {
    const cli = makeCli(undefined, async (args) => okResult(args));
    const out = await write.call(cli, WRITE_ARGS, {});
    assert.equal(out.ok, true);
    assert.equal(cli.calls.length, 1);
    assert.deepEqual(cli.calls[0].args, WRITE_ARGS);
  });

  process.stdout.write('\n' + '='.repeat(60) + '\n');
  process.stdout.write(`通过 ${passed} / ${passed + failed}\n`);
  if (failed > 0) {
    process.stdout.write(`\n失败项：\n${failures.map((item) => `  - ${item}`).join('\n')}\n`);
    process.exitCode = 1;
  } else {
    process.stdout.write('全部通过：preflight 窗口单源与写前自愈行为一致。\n');
  }
}

main()
  .catch((error) => {
    console.error('\npreflight 测试崩溃：', error);
    process.exitCode = 1;
  })
  .finally(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });
