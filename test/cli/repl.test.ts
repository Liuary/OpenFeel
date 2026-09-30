/**
 * REPL smoke 测试（stage-50 op-004 T40）
 * 管道输入「错误命令 + help + exit」→ 进程不中途退出、输出再见文案、help 列表由命令树动态生成。
 * 隔离 HOME（USERPROFILE/HOME/XDG_CONFIG_HOME 指向临时目录），禁止触碰真实环境。
 */
import { describe, it, expect } from 'vitest';
import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const REPO_ROOT = process.cwd();
const BIN_PATH = join(REPO_ROOT, 'bin', 'openfeel.js');

describe('REPL smoke（stage-50 op-004 T40）', () => {
  it('错误命令后 REPL 不中途退出；exit 输出再见；help 列表不含不存在命令', () => {
    if (!existsSync(join(REPO_ROOT, 'dist', 'cli', 'index.js'))) {
      console.warn('[skip] dist/cli/index.js 不存在（需先 npm run build），跳过 REPL smoke');
      return;
    }
    const home = mkdtempSync(join(tmpdir(), 'openfeel-repl-home-'));
    try {
      const r = spawnSync(process.execPath, [BIN_PATH], {
        input: 'notacommand\nhelp\nexit\n',
        encoding: 'utf-8',
        timeout: 30000,
        env: { ...process.env, USERPROFILE: home, HOME: home, XDG_CONFIG_HOME: home },
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
