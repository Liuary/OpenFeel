/**
 * cli/index applyHelpI18n 测试（stage-50 op-004 T38）
 * 断言 walkCmd 遍历 command.arguments，en 下 argument 描述为英文（无 CJK）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command } from 'commander';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

vi.mock('../../src/cli/deploy-check-output.js', () => ({ emitGlobalDeployCheck: vi.fn() }));

import { applyHelpI18n, shouldUseColor, program as rootProgram, runCli } from '../../src/cli/index.js';
import { emitGlobalDeployCheck } from '../../src/cli/deploy-check-output.js';
import { registerStageCommand } from '../../src/commands/stage.js';
import {
  resolveJsonMode,
  resolveVersionFlag,
  scanArgv,
  withSchemaVersion,
  setJsonMode,
  isJsonMode,
  resetJsonModeForTest,
  SCHEMA_VERSION,
} from '../../src/commands/shared/json-output.js';

describe('applyHelpI18n（stage-50 op-004 T38）', () => {
  let tmpDir: string;
  let cwdMock: ReturnType<typeof vi.fn>;
  let warnMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cli-i18n-'));
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    writeFileSync(join(tmpDir, '.openfeel', '.info.json'), JSON.stringify({ user: 't', lang: 'en' }), 'utf-8');
    mockHome.dir = tmpDir;
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    warnMock = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    cwdMock.mockRestore();
    warnMock.mockRestore();
    rmSync(tmpDir, { recursive: true, force: true });
    mockHome.dir = '';
  });

  it('T38：walkCmd 遍历 arguments，en 下 stage create 的 argument 描述为英文（无 CJK）', () => {
    const program = new Command();
    program.name('openfeel').description('x');
    registerStageCommand(program);
    applyHelpI18n(program);

    const stage = program.commands.find((c) => c.name() === 'stage');
    expect(stage).toBeDefined();
    const create = stage!.commands.find((c) => c.name() === 'create');
    expect(create).toBeDefined();
    const arg = create!.registeredArguments[0];
    expect(arg.name()).toBe('stageId');
    expect(arg.description).toBeTruthy();
    expect(arg.description).not.toMatch(/[\u4e00-\u9fff]/);
    expect(arg.description).toContain('Stage ID');
  });
});

// ── stage-52/op-002：B7 颜色开关（shouldUseColor / --no-color） ──

describe('op-002 B7 颜色开关', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('默认允许彩色；--no-color 关闭；NO_COLOR 非空关闭；空串不视为设置', () => {
    // 环境隔离：外部 shell 若已设 NO_COLOR=1，`unstubAllEnvs` 会恢复它导致「未设置」断言假红。
    // 先删除并记录原值，用例结束再还原（v1.3.3 门禁稳定性修复）。
    const prevNoColor = process.env.NO_COLOR;
    delete process.env.NO_COLOR;
    try {
      vi.stubEnv('NO_COLOR', '');
      expect(shouldUseColor()).toBe(true); // 空串 → 不关闭
      expect(shouldUseColor({ color: false })).toBe(false); // 显式 --no-color

      vi.stubEnv('NO_COLOR', '1');
      expect(shouldUseColor()).toBe(false); // 非空 → 关闭（不解析值）

      vi.unstubAllEnvs();
      expect(shouldUseColor()).toBe(true); // 未设置 → 默认允许
    } finally {
      if (prevNoColor === undefined) {
        delete process.env.NO_COLOR;
      } else {
        process.env.NO_COLOR = prevNoColor;
      }
    }
  });

  it('根程序注册了全局 --no-color 选项', () => {
    expect(rootProgram.options.some((o) => o.long === '--no-color')).toBe(true);
  });
});

// ── stage-67 op-001：runCli 接入被动部署检测（T5.B1） ──

describe('stage-67 op-001 runCli 接入被动部署检测', () => {
  it('T5.B1：runCli 在 parse 前调用一次 emitGlobalDeployCheck', () => {
    const emit = vi.mocked(emitGlobalDeployCheck);
    emit.mockClear();
    const parseSpy = vi.spyOn(rootProgram, 'parse').mockImplementation(() => rootProgram);
    vi.stubEnv('OPENFEEL_LOG', '0'); // 防运行日志写真实 HOME（隔离旁路）
    // stage-86 op-002 最小修订（REV-86-007 同类）：本用例 cwd = 真实仓库 →
    // 清空会话候选变量，防 logCliStart 的 session 续接文件写入真实工作区（OPENFEEL_LOG=0 不拦会话解析）
    vi.stubEnv('CLAUDE_CODE_SESSION_ID', '');
    const prevArgv = process.argv;
    process.argv = ['node', 'openfeel', 'flow', 'status'];
    try {
      runCli();
      expect(emit).toHaveBeenCalledTimes(1);
      // 调用序：emit 在 parse 之前
      const emitOrder = emit.mock.invocationCallOrder[0];
      const parseOrder = parseSpy.mock.invocationCallOrder[0];
      expect(emitOrder).toBeLessThan(parseOrder);
    } finally {
      process.argv = prevArgv;
      vi.unstubAllEnvs();
      parseSpy.mockRestore();
    }
  });
});

// ── stage-95 op-001：JSON 契约助手（argv 单点扫描 / 首键构造） ──

describe('stage-95 op-001 json-output', () => {
  afterEach(() => {
    resetJsonModeForTest();
  });

  it('resolveJsonMode：位置/取值跳过/不支持 --json=true', () => {
    expect(resolveJsonMode(['flow', 'status', '--json'])).toBe(true);
    expect(resolveJsonMode(['flow', 'status'])).toBe(false);
    // 取值选项后的 --json 是取值 token，不是开关
    expect(resolveJsonMode(['flow', 'review', 'add', '--title', '--json'])).toBe(false);
    expect(resolveJsonMode(['--encoding', '--json'])).toBe(false);
    // Commander 原生拒绝 --json=true（unknown option），预扫描同样不识别
    expect(resolveJsonMode(['flow', 'status', '--json=true'])).toBe(false);
  });

  it('scanArgv：-- 终止、--project 值与缺值、未知 --x=v 不吞下一 token', () => {
    expect(scanArgv(['flow', 'status', '--json'])).toEqual({
      json: true, version: false, projectValues: [], projectMissingValue: false,
    });
    expect(scanArgv(['--project', '/tmp/p', 'flow', 'status']).projectValues).toEqual(['/tmp/p']);
    expect(scanArgv(['--project=/tmp/p', 'flow', 'status']).projectValues).toEqual(['/tmp/p']);
    expect(scanArgv(['--project', '--json'])).toEqual({
      json: true, version: false, projectValues: [], projectMissingValue: true,
    });
    expect(scanArgv(['--project=']).projectMissingValue).toBe(true);
    // -- 之后不再识别
    expect(resolveJsonMode(['flow', 'status', '--', '--json'])).toBe(false);
    // 未知 --x=v 不吞下一 token
    expect(resolveJsonMode(['--unknown=1', '--json'])).toBe(true);
  });

  it('resolveVersionFlag：--version / -v，且 -- 之后不识别', () => {
    expect(resolveVersionFlag(['--version'])).toBe(true);
    expect(resolveVersionFlag(['-v'])).toBe(true);
    expect(resolveVersionFlag(['flow', 'status'])).toBe(false);
    expect(resolveVersionFlag(['--', '--version'])).toBe(false);
  });

  it('withSchemaVersion：schemaVersion 为运行时首键且值恒 1（反例对照）', () => {
    const doc = withSchemaVersion({ a: 1 });
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'a']);
    expect(doc.schemaVersion).toBe(SCHEMA_VERSION);
    // 反例：展开序写反 → schemaVersion 落末位（仅断言形态，不在生产使用）
    expect(Object.keys({ ...{ a: 1 }, schemaVersion: 1 })).toEqual(['a', 'schemaVersion']);
  });

  it('setJsonMode / isJsonMode 单点状态', () => {
    expect(isJsonMode()).toBe(false);
    setJsonMode(true);
    expect(isJsonMode()).toBe(true);
    resetJsonModeForTest();
    expect(isJsonMode()).toBe(false);
  });
});
