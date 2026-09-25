/**
 * model 命令层测试（stage-40 / op-002）
 * 覆盖 set/get/list 输出、校验错误、REV-1504 非 TTY 确认、scope 非法。
 *
 * 说明：commander 的 configureOutput 只捕获 help/版本输出，不会捕获 action 内的 console.log/error，
 * 故用 vi.spyOn(console, 'log'/'error') 收集；action 内的 process.exit 用 vi.spyOn(process, 'exit')
 * 转为抛错，避免 vitest 进程真退出（exitOverride 仅拦截 commander 自身退出）。
 */
import { describe, it, expect, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { registerModelCommand } from '../../src/commands/model.js';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** 执行 model 命令组并捕获退出码与输出 */
function runModel(args: string[]): { stdout: string; stderr: string; exitCode: number } {
  const program = new Command();
  registerModelCommand(program);
  program.exitOverride(); // commander 自身退出（未知选项等）转为抛 CommanderError
  let stdout = '';
  let stderr = '';
  const logSpy = vi.spyOn(console, 'log').mockImplementation((...a: unknown[]) => { stdout += a.join(' ') + '\n'; });
  const errSpy = vi.spyOn(console, 'error').mockImplementation((...a: unknown[]) => { stderr += a.join(' ') + '\n'; });
  // action 内的 process.exit 不被 exitOverride 拦截，需 mock 为抛错
  const exitSpy = vi.spyOn(process, 'exit').mockImplementation(((code?: number) => {
    throw new Error(`__EXIT__${code ?? 0}`);
  }) as never);
  let exitCode = 0;
  try {
    program.parse(['model', ...args], { from: 'user' });
  } catch (err) {
    const msg = (err as Error).message ?? '';
    const m = /^__EXIT__(\d+)$/.exec(msg);
    exitCode = m ? Number(m[1]) : ((err as { exitCode?: number }).exitCode ?? 1);
  } finally {
    logSpy.mockRestore();
    errSpy.mockRestore();
    exitSpy.mockRestore();
  }
  return { stdout, stderr, exitCode };
}

describe('openfeel model 命令', () => {
  afterEach(() => { vi.restoreAllMocks(); });

  it('set --scope default 非 TTY 无 --force/--build 拒绝（REV-1504）', () => {
    // vitest 下 process.stdout.isTTY === false，触发 REV-1504 拒绝路径
    const r = runModel(['set', 'openfeel-executor', 'deepseek/flash', '--scope', 'default']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toBeTruthy(); // 拒绝文案（model.set.needConfirm，语言随 getCliLang）
  });

  it('set --scope 非法值报错 model.error.scope', () => {
    const r = runModel(['set', 'openfeel-executor', 'deepseek/flash', '--scope', 'bad']);
    expect(r.exitCode).toBe(1);
    expect(r.stderr).toBeTruthy(); // 非法 scope 报错（model.error.scope）
  });

  it('set --scope project 写入当前项目 opencode.jsonc（chdir 到临时项目）', () => {
    const proj = mkdtempSync(join(tmpdir(), 'model-cmd-proj-'));
    const prevCwd = process.cwd();
    process.chdir(proj);
    try {
      const r = runModel(['set', 'executor', 'deepseek/deepseek-flash', '--scope', 'project']);
      expect(r.exitCode).toBe(0);
      const obj = JSON.parse(readFileSync(join(proj, 'opencode.jsonc'), 'utf-8')) as { agent: Record<string, { model: string }> };
      expect(obj.agent['openfeel-executor'].model).toBe('deepseek/deepseek-flash');
    } finally {
      process.chdir(prevCwd);
      rmSync(proj, { recursive: true, force: true });
    }
  });

  it('list 输出 9 个 agent', () => {
    const r = runModel(['list']);
    expect(r.exitCode).toBe(0);
    // 不依赖 i18n 语言：断言出现 openfeel- 前缀 agent 条目
    expect(r.stdout).toContain('openfeel-executor');
    const lines = r.stdout.split('\n').filter((l) => l.includes('openfeel-') || /^\s+feel:/.test(l));
    // 9 个 agent 中 8 个带 openfeel- 前缀 + feel
    expect(lines.length).toBeGreaterThanOrEqual(9);
  });

  it('get 指定 scope 仅展示该 scope 值', () => {
    const r = runModel(['get', 'openfeel-executor', '--scope', 'project']);
    expect(r.exitCode).toBe(0);
    expect(r.stdout).toBeTruthy();
  });
});
