/**
 * 锁等待超时 CLI E2E（REV-98-006① / REV-95-008 覆盖缺口）
 *
 * 目的：经子进程真实触发 `withFileLock` 超时路径，稳定断言 INTERNAL_ERROR / internal / exit 3。
 * 注入面：仅测试 env seam（OPENFEEL_TEST_MODE=1 + OPENFEEL_TEST_LOCK_TIMEOUT_MS/STALE_MS），
 *        timeout=200ms / stale=60000ms + 预置 fresh 锁 → 等待窗口内锁不会被判 stale。
 * 隔离：临时项目 + 临时 HOME/USERPROFILE + OPENFEEL_LOG=0；不触碰真实工作区。
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = process.cwd();
const BIN = join(ROOT, 'bin', 'openfeel.js');
const HAS_DIST = existsSync(join(ROOT, 'dist', 'cli', 'index.js'));

/** 基础 env：隔离 HOME + 关闭运行日志；剔除外部可能存在的测试 seam 变量 */
function baseEnv(home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    OPENFEEL_LOG: '0',
  };
  for (const key of [
    'OPENFEEL_TEST_MODE',
    'OPENFEEL_TEST_LOCK_TIMEOUT_MS',
    'OPENFEEL_TEST_LOCK_STALE_MS',
  ]) {
    delete env[key];
  }
  return env;
}

/** 同步运行 CLI（cwd = 临时项目） */
function runCli(args: string[], cwd: string, home: string, extraEnv: NodeJS.ProcessEnv = {}): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 30000,
    env: { ...baseEnv(home), ...extraEnv },
  });
}

describe.skipIf(!HAS_DIST)('锁等待超时 CLI E2E（REV-98-006①）', () => {
  let rootDir: string;
  let homeDir: string;
  let projectDir: string;
  let lockPath: string;

  beforeAll(() => {
    rootDir = mkdtempSync(join(tmpdir(), 'openfeel-lock-e2e-'));
    homeDir = join(rootDir, 'home');
    projectDir = join(rootDir, 'project');
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });

    // fixture：初始化工作区 + 注册一个阶段
    const init = runCli(['init', '--workspace-only', '--non-interactive'], projectDir, homeDir);
    expect(init.status, `init failed: ${init.stderr}`).toBe(0);
    const add = runCli(['plan', 'stage', 'add', 'v1.0.0-stage-01'], projectDir, homeDir);
    expect(add.status, `plan stage add failed: ${add.stderr}`).toBe(0);

    // 预置 fresh 锁（stale=60000 保证等待窗口内不被抢占）
    lockPath = join(projectDir, '.openfeel', 'tmp', 'locks', 'flow.lock');
    mkdirSync(join(projectDir, '.openfeel', 'tmp', 'locks'), { recursive: true });
  });

  afterAll(() => {
    if (rootDir) {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  it('archive <stage> --json → 锁超时 INTERNAL_ERROR/internal/exit 3（重复 3 次稳定）', () => {
    for (let i = 0; i < 3; i += 1) {
      // 每次运行前重置 fresh 锁（前一轮未获取成功，锁文件保留；重写保证 mtime 新鲜）
      writeFileSync(lockPath, JSON.stringify({ pid: 999999, time: Date.now(), token: `e2e-${i}` }), 'utf-8');

      // v1.2.4 A1：归档文件已存在时必须显式 --force 才会进入写盘/保存路径；
      // 本用例验证的是锁超时（save 路径），故每次均带 --force（不改变断言目标）
      const result = runCli(['archive', 'v1.0.0-stage-01', '--json', '--force'], projectDir, homeDir, {
        OPENFEEL_TEST_MODE: '1',
        OPENFEEL_TEST_LOCK_TIMEOUT_MS: '200',
        OPENFEEL_TEST_LOCK_STALE_MS: '60000',
      });

      expect(result.status, `run ${i}: ${result.stderr}`).toBe(3);
      // stdout 恰一个 JSON 文档
      const doc = JSON.parse(result.stdout) as {
        schemaVersion: number;
        error: { code: string; kind: string; message: string; detail: unknown };
      };
      expect(Object.keys(doc)).toEqual(['schemaVersion', 'error']);
      expect(doc.schemaVersion).toBe(1);
      expect(doc.error.code).toBe('INTERNAL_ERROR');
      expect(doc.error.kind).toBe('internal');
      expect(doc.error.message).toContain('获取文件锁超时');
      expect(doc.error.detail).not.toBeNull();
      // stderr 不含 envelope（人类文案可含错误行）
      expect(result.stderr).not.toContain('"schemaVersion"');
    }
  }, 60000);
});
