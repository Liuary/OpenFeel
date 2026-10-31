/**
 * preflight 写命令闸 CLI 进程级冒烟（v1.5.6-stage-114）
 *
 * 目的：跨进程验证「先读状态再写状态」在真实进程退出码 / stdout / stderr / 写盘上成立
 *   （命令级单测用的是 mock 的 process.exit，看不到真实退出码与管道行为）。
 * 隔离：临时项目 + 临时 HOME/USERPROFILE + OPENFEEL_LOG=0；不触碰真实工作区。
 * env 纪律（review-notes 三.14）：**必须显式传 OPENFEEL_PREFLIGHT**，禁止直传 process.env
 *   （会继承 vitest.config.ts 的 `off` 默认 → 用例恒绿）。
 */
import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const ROOT = process.cwd();
const BIN = join(ROOT, 'bin', 'openfeel.js');
const DIST_ENTRY = join(ROOT, 'dist', 'cli', 'index.js');

/** 基础 env：隔离 HOME + 关闭运行日志；**剔除** OPENFEEL_PREFLIGHT（由各用例显式给定） */
function baseEnv(home: string): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    HOME: home,
    USERPROFILE: home,
    OPENFEEL_LOG: '0',
  };
  delete env.OPENFEEL_PREFLIGHT;
  return env;
}

function run(args: string[], cwd: string, home: string, mode: string): SpawnSyncReturns<string> {
  return spawnSync(process.execPath, [BIN, ...args], {
    cwd,
    encoding: 'utf-8',
    timeout: 30000,
    env: { ...baseEnv(home), OPENFEEL_PREFLIGHT: mode },
  });
}

function shaFile(p: string): string {
  return createHash('sha256').update(readFileSync(p)).digest('hex');
}

// 不允许静默 skip（REV 低项 9）：这 6 条是跨进程唯一证据，dist 缺失时必须**失败**而非整体跳过。
// 前置：先 `npm run build`（bin/openfeel.js 加载 `dist/cli/index.js`）。
describe('preflight 写命令闸 CLI 冒烟（v1.5.6-stage-114）', () => {
  let rootDir: string;

  beforeAll(() => {
    expect(
      existsSync(DIST_ENTRY),
      `dist 缺失（${DIST_ENTRY}）：本组跨进程用例必须可执行，请先 npm run build 再跑 vitest`,
    ).toBe(true);
    rootDir = mkdtempSync(join(tmpdir(), 'openfeel-preflight-cli-'));
  });

  afterAll(() => {
    if (rootDir) {
      rmSync(rootDir, { recursive: true, force: true });
    }
  });

  let seq = 0;
  let projectDir: string;
  let homeDir: string;

  /** 每个用例独立项目（init 一次；避免用例间状态串联） */
  beforeEach(() => {
    seq += 1;
    homeDir = join(rootDir, `home-${seq}`);
    projectDir = join(rootDir, `project-${seq}`);
    mkdirSync(homeDir, { recursive: true });
    mkdirSync(projectDir, { recursive: true });
    const init = spawnSync(process.execPath, [BIN, 'init', '--workspace-only', '--non-interactive'], {
      cwd: projectDir,
      encoding: 'utf-8',
      timeout: 30000,
      env: { ...baseEnv(homeDir), OPENFEEL_PREFLIGHT: 'off' },
    });
    expect(init.status, `init failed: ${init.stderr}`).toBe(0);
  });

  function flowPath(): string {
    return join(projectDir, '.openfeel', 'flow.json');
  }
  function ledgerPath(): string {
    return join(projectDir, '.openfeel', 'dev', '.preflight.json');
  }

  it('strict + 无账本 → exit 1 且 flow.json 字节不变（零写盘）', () => {
    rmSync(ledgerPath(), { force: true });
    const before = shaFile(flowPath());
    const r = run(['req', 'add', '不该被创建'], projectDir, homeDir, 'strict');
    expect(r.status).toBe(1);
    expect(r.stderr).toContain('flow next');
    expect(shaFile(flowPath())).toBe(before);
    // 正文骨架也不得铺出
    const reqDir = join(projectDir, '.openfeel', 'requirements');
    expect(existsSync(reqDir) ? readdirSync(reqDir) : []).toEqual([]);
    expect(existsSync(ledgerPath())).toBe(false);
  });

  it('strict + 无账本 + --dry-run → status 0 且零写盘（dry-run 免门）', () => {
    const add = run(['plan', 'stage', 'add', 'v1.0.0-stage-01'], projectDir, homeDir, 'off');
    expect(add.status, `plan stage add failed: ${add.stderr}`).toBe(0);
    rmSync(ledgerPath(), { force: true });
    const before = shaFile(flowPath());
    const r = run(
      ['flow', 'stage', 'reset', 'v1.0.0-stage-01', '--to', 'plan_pending', '--dry-run'],
      projectDir,
      homeDir,
      'strict',
    );
    expect(r.status, `dry-run 被门拦: ${r.stderr}`).toBe(0);
    expect(r.stderr).not.toContain('flow next');
    expect(shaFile(flowPath())).toBe(before);
    expect(existsSync(ledgerPath())).toBe(false);
  });

  it('strict + 先 flow next → 写命令放行（status 0）', () => {
    const next = run(['flow', 'next', '--json'], projectDir, homeDir, 'strict');
    expect(next.status, `flow next failed: ${next.stderr}`).toBe(0);
    expect(existsSync(ledgerPath())).toBe(true);
    const r = run(['req', 'add', '先读后写'], projectDir, homeDir, 'strict');
    expect(r.status, `写命令被拒: ${r.stderr}`).toBe(0);
    expect(existsSync(join(projectDir, '.openfeel', 'requirements', 'REQ-001.md'))).toBe(true);
  });

  it('warn + 非 TTY → 放行且零 preflight stderr', () => {
    const r = run(['req', 'add', 'warn 放行'], projectDir, homeDir, 'warn');
    expect(r.status).toBe(0);
    expect(r.stderr).not.toContain('flow next');
    expect(r.stderr).toBe('');
  });

  it('off + 无账本 → status 0 且零 stderr（不拒绝不输出）', () => {
    rmSync(ledgerPath(), { force: true });
    const r = run(['req', 'add', 'off 放行'], projectDir, homeDir, 'off');
    expect(r.status).toBe(0);
    expect(r.stderr).toBe('');
  });

  it('strict + flow.json 损坏 → flow repair 放行（恢复通道豁免）', () => {
    // 合法基线 → .bak 供 repair 恢复
    const good = readFileSync(flowPath(), 'utf-8');
    writeFileSync(flowPath() + '.bak', good, 'utf-8');
    writeFileSync(flowPath(), '{bad', 'utf-8');
    rmSync(ledgerPath(), { force: true });
    const r = run(['flow', 'repair'], projectDir, homeDir, 'strict');
    expect(r.status, `repair 被门拦: ${r.stderr}`).toBe(0);
    expect(r.stderr).not.toContain('flow next');
    expect(() => JSON.parse(readFileSync(flowPath(), 'utf-8'))).not.toThrow();
  });
});
