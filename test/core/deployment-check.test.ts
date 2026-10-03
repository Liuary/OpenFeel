/**
 * deployment-check 单元测试（stage-66）
 * 隔离 HOME（mock node:os），不读写真实 ~/.openfeel/。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import { checkGlobalDeployment, shouldRunDeployCheck, type DeployCheckGateInput } from '../../src/core/deployment-check.js';
import { getOpenfeelVersion } from '../../src/core/update-state.js';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

/** 全局 state 路径（基于 mock home） */
function globalStatePath(): string {
  return join(mockHome.dir, '.openfeel', 'update_state.json');
}
/** 写入全局 state（version 可指定；自动建父目录） */
function writeGlobalState(openfeelVersion: string): void {
  mkdirSync(join(mockHome.dir, '.openfeel'), { recursive: true });
  writeFileSync(
    globalStatePath(),
    JSON.stringify({ version: '1.0', last_update: '', openfeel_version: openfeelVersion, files: {} }, null, 2) + '\n',
    'utf-8',
  );
}

describe('checkGlobalDeployment', () => {
  beforeEach(() => { mockHome.dir = mkdtempSync(join(tmpdir(), 'openfeel-deploycheck-')); });
  afterEach(() => { rmSync(mockHome.dir, { recursive: true, force: true }); });

  it('T4.4：版本一致 → ok（deployedVersion == cliVersion）', () => {
    writeGlobalState('9.9.9');
    const r = checkGlobalDeployment({ currentVersion: '9.9.9' });
    expect(r.status).toBe('ok');
    expect(r.cliVersion).toBe('9.9.9');
    expect(r.deployedVersion).toBe('9.9.9');
  });

  it('T4.5：版本不一致 → mismatch + deployedVersion 为旧值', () => {
    writeGlobalState('1.0.0');
    const r = checkGlobalDeployment({ currentVersion: '9.9.9' });
    expect(r.status).toBe('mismatch');
    expect(r.cliVersion).toBe('9.9.9');
    expect(r.deployedVersion).toBe('1.0.0');
  });

  it('T4.5b：降级（部署版本 > CLI 版本）亦按 mismatch', () => {
    writeGlobalState('999.0.0');
    expect(checkGlobalDeployment({ currentVersion: '1.1.5' }).status).toBe('mismatch');
  });

  it('T4.6：全局 state 缺失 → missing（deployedVersion null）', () => {
    const r = checkGlobalDeployment({ currentVersion: '1.1.5' });
    expect(r.status).toBe('missing');
    expect(r.deployedVersion).toBeNull();
  });

  it('T4.7：state 存在但 Schema 非法 → unknown（不抛、不写盘）', () => {
    mkdirSync(join(mockHome.dir, '.openfeel'), { recursive: true });
    const raw = JSON.stringify({ version: '2.0', last_update: '', openfeel_version: '1.0.0', files: {} }, null, 2) + '\n';
    writeFileSync(globalStatePath(), raw, 'utf-8');
    const r = checkGlobalDeployment({ currentVersion: '1.1.5' });
    expect(r.status).toBe('unknown');
    // 只读：字节不变
    expect(readFileSync(globalStatePath(), 'utf-8')).toBe(raw);
  });

  it('T4.7b：state 路径被目录占位（读异常）→ unknown（静默不抛）', () => {
    mkdirSync(globalStatePath(), { recursive: true });
    expect(existsSync(globalStatePath())).toBe(true);
    expect(() => checkGlobalDeployment({ currentVersion: '1.1.5' })).not.toThrow();
    expect(checkGlobalDeployment({ currentVersion: '1.1.5' }).status).toBe('unknown');
  });

  it('T4.9：只读性——检测前后文件字节与 mtime 均不变', () => {
    writeGlobalState('1.0.0');
    const before = readFileSync(globalStatePath(), 'utf-8');
    const mtimeBefore = statSync(globalStatePath()).mtimeMs;
    checkGlobalDeployment({ currentVersion: '9.9.9' });
    checkGlobalDeployment({ currentVersion: '1.0.0' });
    expect(readFileSync(globalStatePath(), 'utf-8')).toBe(before);
    expect(statSync(globalStatePath()).mtimeMs).toBe(mtimeBefore);
  });

  it('T-CLI：缺省 currentVersion 取 getOpenfeelVersion()', () => {
    writeGlobalState(getOpenfeelVersion());
    const r = checkGlobalDeployment();
    expect(r.cliVersion).toBe(getOpenfeelVersion());
    expect(r.status).toBe('ok');
  });
});

describe('shouldRunDeployCheck（门控矩阵）', () => {
  /** 构造门控输入（默认：交互 TTY + 普通命令 + 无 env + 未提示） */
  function gate(over: Partial<DeployCheckGateInput> = {}): boolean {
    return shouldRunDeployCheck({
      argv: ['flow', 'status'], isTTY: true, env: {}, alreadyWarned: false, ...over,
    });
  }

  it('T4.8：TTY + 普通命令 + 未提示 → true', () => {
    expect(gate()).toBe(true);
  });

  it('T4.8：非 TTY → false', () => { expect(gate({ isTTY: false })).toBe(false); });
  it('T4.8：alreadyWarned → false', () => { expect(gate({ alreadyWarned: true })).toBe(false); });
  it('T4.8：--json → false', () => { expect(gate({ argv: ['flow', 'status', '--json'] })).toBe(false); });
  it('T4.8：--quiet → false', () => { expect(gate({ argv: ['flow', 'status', '--quiet'] })).toBe(false); });
  it('T4.8：--version / -v → false', () => {
    expect(gate({ argv: ['--version'] })).toBe(false);
    expect(gate({ argv: ['-v'] })).toBe(false);
  });
  it('T4.8：--help / -h → false', () => {
    expect(gate({ argv: ['--help'] })).toBe(false);
    expect(gate({ argv: ['-h'] })).toBe(false);
  });
  it('T4.8：部署修复类命令（setup/update/init/migrate）→ false', () => {
    for (const cmd of ['setup', 'update', 'init', 'migrate']) {
      expect(gate({ argv: [cmd] })).toBe(false);
    }
  });
  it('T4.8：白名单命令带选项仍识别首 token → false', () => {
    expect(gate({ argv: ['update', '--lang', 'en'] })).toBe(false);
  });
  it('T4.8：CI=1 / CI=true → false；CI=0 / CI=false → true', () => {
    expect(gate({ env: { CI: '1' } })).toBe(false);
    expect(gate({ env: { CI: 'true' } })).toBe(false);
    expect(gate({ env: { CI: 'TRUE' } })).toBe(false);
    expect(gate({ env: { CI: '0' } })).toBe(true);
    expect(gate({ env: { CI: 'false' } })).toBe(true);
  });
  it('T4.8：OPENFEEL_NO_UPDATE_CHECK=1 → false', () => {
    expect(gate({ env: { OPENFEEL_NO_UPDATE_CHECK: '1' } })).toBe(false);
  });
});
