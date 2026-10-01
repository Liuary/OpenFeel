/**
 * 运行日志单测（stage-58 op-002 / E-3）
 * mock homedir 隔离全局路径；每个用例 mkdtemp 独立 HOME，断言后清理。
 * 覆盖：未安装 no-op / 默认写入与格式 / UTF-8 中文 / 级别过滤 / 开关 / 路径覆盖 / 纯解析 / 静态断言。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// mock homedir（隔离全局路径；保留其余 os API）
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

const REPO_ROOT = process.cwd();
const SRC_PATH = join(REPO_ROOT, 'src', 'core', 'runtime-log.ts');

/** 当日日志文件期望路径（基于当前 mockHome） */
function todayLogPath(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  const name = `openfeel-${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}.log`;
  return join(mockHome.dir, '.openfeel', 'cli', 'logs', name);
}

/** resetModules 后动态导入全新模块（隔离模块级 config） */
async function freshModule() {
  vi.resetModules();
  return import('../../src/core/runtime-log.js');
}

let home = '';

beforeEach(() => {
  home = mkdtempSync(join(tmpdir(), 'openfeel-rlog-'));
  mockHome.dir = home;
});

afterEach(() => {
  rmSync(home, { recursive: true, force: true });
});

describe('runtime-log（E-3）', () => {
  it('未安装 → runtimeLog 全 no-op（不产生文件）', async () => {
    const mod = await freshModule();
    mod.runtimeLog('info', 'should not write');
    expect(existsSync(todayLogPath())).toBe(false);
  });

  it('默认写入 + 行格式 + UTF-8 中文', async () => {
    const mod = await freshModule();
    mod.installRuntimeLog({ env: {}, argv: [] });
    mod.runtimeLog('info', 'cli start: flow status 中文');

    expect(existsSync(todayLogPath())).toBe(true);
    const content = readFileSync(todayLogPath(), 'utf-8');
    expect(content).toMatch(/^\[\d{4}-\d{2}-\d{2}T[^\]]+\]\[INFO\]\[\d+\] cli start: flow status 中文\n$/);
  });

  it('debug 默认关；--debug 后写入', async () => {
    const mod = await freshModule();
    mod.installRuntimeLog({ env: {}, argv: [] });
    mod.runtimeLog('debug', 'hidden');
    expect(existsSync(todayLogPath())).toBe(false);

    mod.installRuntimeLog({ env: {}, argv: ['--debug'] });
    mod.runtimeLog('debug', 'shown');
    expect(readFileSync(todayLogPath(), 'utf-8')).toMatch(/\[DEBUG\]\[\d+\] shown/);
  });

  it('开关：--no-log / OPENFEEL_LOG=0 / OPENFEEL_NO_LOG=1 均关闭', async () => {
    for (const [env, argv] of [
      [{}, ['--no-log']],
      [{ OPENFEEL_LOG: '0' }, []],
      [{ OPENFEEL_NO_LOG: '1' }, []],
    ] as Array<[NodeJS.ProcessEnv, string[]]>) {
      const mod = await freshModule();
      mod.installRuntimeLog({ env, argv });
      mod.runtimeLog('info', 'nope');
      expect(existsSync(todayLogPath())).toBe(false);
    }
  });

  it('路径覆盖：--log-file 与 OPENFEEL_LOG_FILE', async () => {
    const viaArg = join(home, 'x.log');
    const viaEnv = join(home, 'y.log');

    const modA = await freshModule();
    modA.installRuntimeLog({ env: {}, argv: ['--log-file', viaArg] });
    modA.runtimeLog('info', 'a');
    expect(existsSync(viaArg)).toBe(true);

    const modB = await freshModule();
    modB.installRuntimeLog({ env: { OPENFEEL_LOG_FILE: viaEnv }, argv: [] });
    modB.runtimeLog('info', 'b');
    expect(existsSync(viaEnv)).toBe(true);
  });

  it('resolveRuntimeLogConfig 纯分支（默认 / debug / 开关 / 路径）', async () => {
    const mod = await freshModule();
    const def = mod.resolveRuntimeLogConfig({}, []);
    expect(def.enabled).toBe(true);
    expect(def.minLevel).toBe('info');
    expect(def.filePath).toBe(todayLogPath());

    expect(mod.resolveRuntimeLogConfig({}, ['--debug']).minLevel).toBe('debug');
    expect(mod.resolveRuntimeLogConfig({ OPENFEEL_DEBUG: '1' }, []).minLevel).toBe('debug');
    expect(mod.resolveRuntimeLogConfig({ OPENFEEL_LOG: '0' }, []).enabled).toBe(false);
    expect(mod.resolveRuntimeLogConfig({}, ['--no-log']).enabled).toBe(false);
    expect(mod.resolveRuntimeLogConfig({ OPENFEEL_LOG_FILE: join(home, 'z.log') }, []).filePath).toBe(
      join(home, 'z.log'),
    );
  });

  it('getRuntimeLogPath 文件名含 openfeel-YYYY-MM-DD.log', async () => {
    const mod = await freshModule();
    const p = mod.getRuntimeLogPath(new Date('2026-10-02T12:00:00'));
    expect(p).toContain('openfeel-2026-10-02.log');
  });

  it('E-3 静态断言：源码不含 process.env.VITEST 守卫', () => {
    const src = readFileSync(SRC_PATH, 'utf-8');
    expect(/process\.env\.VITEST/.test(src)).toBe(false);
  });
});
