/**
 * REPL smoke 测试（stage-50 op-004 T40）
 * 管道输入「错误命令 + help + exit」→ 进程不中途退出、输出再见文案、help 列表由命令树动态生成。
 * 隔离 HOME（USERPROFILE/HOME/XDG_CONFIG_HOME 指向临时目录），禁止触碰真实环境。
 */
import { describe, it, expect, vi } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// ── stage-67 op-001：startRepl 接入被动部署检测（T5.B2） ──
// 保留 readline 真实导出，仅替换 createInterface（避免 inquirer 等加载期缺导出）
const fakeRl = vi.hoisted(() => ({ prompt: vi.fn(), on: vi.fn(), close: vi.fn() }));
vi.mock('../../src/cli/deploy-check-output.js', () => ({ emitGlobalDeployCheck: vi.fn() }));
vi.mock('node:readline', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:readline')>();
  return { ...actual, createInterface: () => fakeRl };
});

import { startRepl } from '../../src/cli/repl.js';
import { program } from '../../src/cli/index.js';
import { emitGlobalDeployCheck } from '../../src/cli/deploy-check-output.js';

const REPO_ROOT = process.cwd();
const BIN_PATH = join(REPO_ROOT, 'bin', 'openfeel.js');
/** 依赖构建产物 dist/cli/index.js（T44 同族：skipIf 显式 skip，不用「警告+return」掩盖） */
const HAS_DIST_CLI = existsSync(join(REPO_ROOT, 'dist', 'cli', 'index.js'));

describe('REPL smoke（stage-50 op-004 T40）', () => {
  it.skipIf(!HAS_DIST_CLI)('错误命令后 REPL 不中途退出；exit 输出再见；help 列表不含不存在命令', () => {
    const home = mkdtempSync(join(tmpdir(), 'openfeel-repl-home-'));
    try {
      const r = spawnSync(process.execPath, [BIN_PATH], {
        input: 'notacommand\nhelp\nexit\n',
        encoding: 'utf-8',
        timeout: 30000,
        env: { ...process.env, USERPROFILE: home, HOME: home, XDG_CONFIG_HOME: home, OPENFEEL_ENCODING: 'utf8', OPENFEEL_LOG: '0' },
      });
      expect(r.status).toBe(0);
      // 走到 exit 分支 → 输出再见（说明错误命令未杀死主循环）
      expect(r.stdout).toContain('再见');
      // help 由命令树动态生成：含 flow，不含不存在的 scheme（旧硬编码列表含 scheme）
      expect(r.stdout).toContain('flow');
      expect(r.stdout).not.toContain('scheme');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }, 40000);
});

describe('stage-67 op-001 REPL 接入被动部署检测', () => {
  it('T5.B2：startRepl 在 welcome 后调用一次 emitGlobalDeployCheck', () => {
    const emit = vi.mocked(emitGlobalDeployCheck);
    emit.mockClear();
    const logSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    startRepl(program);
    expect(emit).toHaveBeenCalledTimes(1);
    expect(logSpy.mock.invocationCallOrder[0]).toBeLessThan(emit.mock.invocationCallOrder[0]);
    logSpy.mockRestore();
  });
});
