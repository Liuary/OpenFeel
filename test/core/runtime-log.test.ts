/**
 * 运行日志单测（stage-58 op-002 / E-3）
 * mock homedir 隔离全局路径；每个用例 mkdtemp 独立 HOME，断言后清理。
 * 覆盖：未安装 no-op / 默认写入与格式 / UTF-8 中文 / 级别过滤 / 开关 / 路径覆盖 / 纯解析 / 静态断言。
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { spawnSync } from 'node:child_process';
import { EventEmitter } from 'node:events';

// mock homedir（隔离全局路径；保留其余 os API）
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

const REPO_ROOT = process.cwd();
const SRC_PATH = join(REPO_ROOT, 'src', 'core', 'runtime-log.ts');
const BIN_PATH = join(REPO_ROOT, 'bin', 'openfeel.js');
/** 子进程用例依赖构建产物 dist（门禁顺序：build → test；缺失时显式 skip，不用「警告+return」掩盖） */
const HAS_DIST_CLI = existsSync(join(REPO_ROOT, 'dist', 'cli', 'index.js'));

/**
 * 子进程隔离 env（REV-86-007）：
 * HOME 三连（USERPROFILE/HOME/XDG_CONFIG_HOME）指隔离 tmp + OPENFEEL_LOG_FILE 指 tmp；
 * 调用方另在 spawnSync 上设 `cwd: home`——防 session 续接文件写真实仓库 `.openfeel/tmp/`。
 */
function subprocessEnv(home: string, logFile: string): NodeJS.ProcessEnv {
  return {
    ...process.env,
    USERPROFILE: home,
    HOME: home,
    XDG_CONFIG_HOME: home,
    OPENFEEL_LOG_FILE: logFile,
  };
}

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
  // stage-86 op-002：执行环境真实存在 CLAUDE_CODE_SESSION_ID → 显式清空，
  // 防 in-process 用例把 session 续接文件写入真实仓库（REV-86-007 同类防护）。
  vi.stubEnv('CLAUDE_CODE_SESSION_ID', '');
});

afterEach(() => {
  vi.unstubAllEnvs();
  rmSync(home, { recursive: true, force: true });
});

describe('runtime-log（E-3）', () => {
  it('未安装 → runtimeLog 全 no-op（不产生文件）', async () => {
    const mod = await freshModule();
    mod.runtimeLog('info', 'should not write');
    expect(existsSync(todayLogPath())).toBe(false);
  });

  it('默认写入 + 行格式（start 行含 project/session 后缀）+ UTF-8 中文', async () => {
    const mod = await freshModule();
    mod.installRuntimeLog({ env: {}, argv: [] });
    // stage-86 op-002：真实路径 = logCliStart（含 [project=…] [session=…] 后缀）
    mod.logCliStart(['flow', 'status']);
    // 原语 runtimeLog 零改动：UTF-8 中文写入保持
    mod.runtimeLog('info', 'cli start: flow status 中文');

    expect(existsSync(todayLogPath())).toBe(true);
    const lines = readFileSync(todayLogPath(), 'utf-8').split('\n');
    expect(lines[0]).toMatch(
      /^\[\d{4}-\d{2}-\d{2}T[^\]]+\]\[INFO\]\[\d+\] cli start: flow status \[project=[^\]]+\] \[session=(env|project|proc):[^\]]+\]$/,
    );
    expect(lines[1]).toMatch(/^\[\d{4}-\d{2}-\d{2}T[^\]]+\]\[INFO\]\[\d+\] cli start: flow status 中文$/);
    // 负控：旧「无后缀」格式不再成立（R-86-6 有意变更登记）
    expect(lines[0]).not.toMatch(/cli start: flow status$/);
  });

  it('stage-86 op-002：logCliDone 行格式（exit + duration_ms + project/session）+ 一次性旗标', async () => {
    const mod = await freshModule();
    mod.installRuntimeLog({ env: {}, argv: [] });
    mod.resetDoneFlagForTest();
    mod.logCliDone(0);
    // 二次调用被旗标拦截（防 exit 兜底 / 信号路径重复写）
    mod.logCliDone(1);

    const content = readFileSync(todayLogPath(), 'utf-8');
    const doneLines = content.split('\n').filter((l) => l.includes('cli done'));
    expect(doneLines).toHaveLength(1);
    expect(doneLines[0]).toMatch(
      /^\[\d{4}-\d{2}-\d{2}T[^\]]+\]\[INFO\]\[\d+\] cli done exit=0 \[duration_ms=\d+\] \[project=[^\]]+\] \[session=(env|project|proc):[^\]]+\]$/,
    );
  });

  it('stage-86 op-002：logCliDone 旗标置位先于写入（OPENFEEL_LOG=0 关闭写盘亦置位）', async () => {
    const mod = await freshModule();
    mod.installRuntimeLog({ env: { OPENFEEL_LOG: '0' }, argv: [] });
    mod.resetDoneFlagForTest();
    mod.logCliDone(0);
    // 关闭写盘 → 无文件；但旗标已置位 → 再调用不再尝试
    expect(existsSync(todayLogPath())).toBe(false);
    mod.logCliDone(0);
    expect(existsSync(todayLogPath())).toBe(false);
  });

  it('stage-86 op-002：installExitHooks 注册 exit/SIGINT/SIGTERM；exit → done 行；信号 → 130/143', async () => {
    const mod = await freshModule();
    mod.installRuntimeLog({ env: {}, argv: [] });
    mod.resetDoneFlagForTest();

    const proc = new EventEmitter();
    const exitSpy = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    try {
      mod.installExitHooks(proc as unknown as Pick<NodeJS.Process, 'on' | 'once'>);
      expect(proc.listenerCount('exit')).toBe(1);
      expect(proc.listenerCount('SIGINT')).toBe(1);
      expect(proc.listenerCount('SIGTERM')).toBe(1);

      // exit 兜底单源写行
      proc.emit('exit', 0);
      expect(readFileSync(todayLogPath(), 'utf-8')).toMatch(/cli done exit=0 \[duration_ms=\d+\]/);

      // SIGINT → 130（once 语义：二次 emit 不再触发）
      proc.emit('SIGINT');
      expect(exitSpy).toHaveBeenCalledWith(130);
      expect(exitSpy).toHaveBeenCalledTimes(1);
      proc.emit('SIGINT');
      expect(exitSpy).toHaveBeenCalledTimes(1);

      // SIGTERM → 143
      proc.emit('SIGTERM');
      expect(exitSpy).toHaveBeenCalledWith(143);
    } finally {
      exitSpy.mockRestore();
    }
  });

  it.skipIf(!HAS_DIST_CLI)('stage-86 op-002：子进程 --help → exit 兜底记 done（旧口径「不记 done」有意变更）', () => {
    const home = mkdtempSync(join(tmpdir(), 'openfeel-rlog-sub-'));
    const logFile = join(home, 'cli.log');
    try {
      const env = subprocessEnv(home, logFile);
      // 显式剔除会话变量 → 未命中 env（回落 proc，确定性断言）
      delete env.CLAUDE_CODE_SESSION_ID;
      const r = spawnSync(process.execPath, [BIN_PATH, '--help'], { env, cwd: home, encoding: 'utf-8', timeout: 30000 });
      expect(r.status).toBe(0);
      const content = readFileSync(logFile, 'utf-8');
      expect(content).toContain('cli done exit=0');
      expect(content).toMatch(/\[duration_ms=\d+\]/);
      expect(content).toMatch(/\[project=[^\]]+\]/);
      expect(content).toMatch(/\[session=proc:[0-9a-f]{8}\]/);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }, 40000);

  it.skipIf(!HAS_DIST_CLI)('stage-86 op-002：子进程未知命令 → exit 1 亦记 done（错误路径加固）', () => {
    const home = mkdtempSync(join(tmpdir(), 'openfeel-rlog-sub-'));
    const logFile = join(home, 'cli.log');
    try {
      const env = subprocessEnv(home, logFile);
      delete env.CLAUDE_CODE_SESSION_ID;
      const r = spawnSync(process.execPath, [BIN_PATH, 'notacommand'], { env, cwd: home, encoding: 'utf-8', timeout: 30000 });
      expect(r.status).toBe(1);
      expect(readFileSync(logFile, 'utf-8')).toContain('cli done exit=1');
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }, 40000);

  it.skipIf(!HAS_DIST_CLI)('stage-86 op-002：子进程显式 env 会话值 → session=env:test-fixed-id（精确值断言）', () => {
    const home = mkdtempSync(join(tmpdir(), 'openfeel-rlog-sub-'));
    const logFile = join(home, 'cli.log');
    try {
      const env = subprocessEnv(home, logFile);
      env.CLAUDE_CODE_SESSION_ID = 'test-fixed-id';
      const r = spawnSync(process.execPath, [BIN_PATH, '--help'], { env, cwd: home, encoding: 'utf-8', timeout: 30000 });
      expect(r.status).toBe(0);
      const content = readFileSync(logFile, 'utf-8');
      expect(content).toContain('[session=env:test-fixed-id]');
      // 续接文件写至隔离 cwd（REV-86-007：不触真实仓库）
      expect(existsSync(join(home, '.openfeel', 'tmp', 'session.json'))).toBe(true);
    } finally {
      rmSync(home, { recursive: true, force: true });
    }
  }, 40000);

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
