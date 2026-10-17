/**
 * 全局 --project 与 --version --json 测试（v1.2.2-stage-95 op-003）
 *
 * 覆盖：预扫描取值形态（前置/后置/等号/缺值/空值）、与 --json 成对防误判、
 * 单点 chdir、路径校验错误（INVALID_ARGUMENT / PROJECT_NOT_FOUND）、多值冲突、
 * chdir 后语言按目标项目、--log-file 相对路径按原始 cwd、目标项目读取、
 * knowledge dedup 同名双注册回归。
 *
 * 隔离纪律：临时目录 A/B；真实 chdir 在 afterEach 恢复原始 cwd；HOME 经 node:os mock 隔离；
 * 真实仓库 flow.json 字节级反守卫（REAL_FLOW_RAW）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import { Command } from 'commander';
import {
  mkdtempSync, mkdirSync, rmSync, writeFileSync, existsSync, readFileSync,
} from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { registerFlowCommand } from '../../src/commands/flow.js';
import { registerKnowledgeCommand } from '../../src/commands/knowledge.js';
import { initProject } from '../../src/core/init.js';
import { FlowManager } from '../../src/core/flow-manager.js';
import { initKnowledgeBase, addKnowledgeEntry } from '../../src/core/workspace/knowledge.js';
import { resolveRuntimeLogConfig } from '../../src/core/runtime-log.js';
import { getCliLang } from '../../src/core/i18n.js';
import { setJsonMode, resetJsonModeForTest, isJsonMode } from '../../src/commands/shared/json-output.js';
import {
  extractProjectArgs,
  extractProjectArg,
  applyProjectOption,
  resolveProjectPathForCommand,
  resetProjectRootForTest,
} from '../../src/cli/project-option.js';

/** 原始 cwd（真实 chdir 恢复基准） */
const REAL_CWD = process.cwd();
/** 真实仓库 flow.json 反守卫基线 */
const REAL_FLOW_PATH = join(REAL_CWD, '.openfeel', 'flow.json');
const REAL_FLOW_RAW = existsSync(REAL_FLOW_PATH) ? readFileSync(REAL_FLOW_PATH, 'utf-8') : null;

describe('stage-95 op-003 全局 --project', () => {
  let dirA: string;
  let dirB: string;
  let filePath: string;
  let logMock: ReturnType<typeof vi.fn>;
  let errMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;
  let prevExitCode: number | string | undefined;

  /** 写入项目语言配置（.openfeel/.info.json） */
  function writeLang(dir: string, lang: 'zh-CN' | 'en'): void {
    mkdirSync(join(dir, '.openfeel'), { recursive: true });
    writeFileSync(join(dir, '.openfeel', '.info.json'), JSON.stringify({ user: 'test', lang }), 'utf-8');
  }

  /** 捕获的 stdout 文本 */
  function stdout(): string {
    return logMock.mock.calls.map((c) => c[0] as string).join('\n');
  }

  beforeEach(() => {
    mockHome.dir = mkdtempSync(join(tmpdir(), 'openfeel-project-home-'));
    dirA = mkdtempSync(join(tmpdir(), 'openfeel-project-a-'));
    dirB = mkdtempSync(join(tmpdir(), 'openfeel-project-b-'));
    filePath = join(dirA, 'not-a-dir.txt');
    writeFileSync(filePath, 'x', 'utf-8');
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    prevExitCode = process.exitCode;
    process.exitCode = 0;
    resetJsonModeForTest();
    resetProjectRootForTest();
  });

  afterEach(() => {
    // 恢复真实 cwd（chdir 测试）并清理模块态
    process.chdir(REAL_CWD);
    resetProjectRootForTest();
    resetJsonModeForTest();
    process.exitCode = prevExitCode;
    logMock.mockRestore();
    errMock.mockRestore();
    exitMock.mockRestore();
    rmSync(dirA, { recursive: true, force: true });
    rmSync(dirB, { recursive: true, force: true });
    rmSync(mockHome.dir, { recursive: true, force: true });
    mockHome.dir = '';

    // 真实仓库反守卫：目标项目读取测试不得触碰真实 flow.json
    const realRaw = existsSync(REAL_FLOW_PATH) ? readFileSync(REAL_FLOW_PATH, 'utf-8') : null;
    expect(realRaw).toBe(REAL_FLOW_RAW);
  });

  // ── 1：取值形态 ──

  it('extractProjectArgs：前置/后置/等号/缺值/空值', () => {
    expect(extractProjectArgs(['--project', 'B']).values).toEqual(['B']);
    expect(extractProjectArgs(['--project=B']).values).toEqual(['B']);
    expect(extractProjectArgs(['flow', 'status', '--project', 'B']).values).toEqual(['B']);
    expect(extractProjectArgs(['--project']).missingValue).toBe(true);
    expect(extractProjectArgs(['--project', '--json'])).toEqual({
      values: [], missingValue: true,
    });
    expect(extractProjectArgs(['--project=']).missingValue).toBe(true);
    // 单值便捷入口取最后一个出现值
    expect(extractProjectArg(['--project', 'A', '--project', 'B'])).toBe('B');
    expect(extractProjectArg(['flow', 'status'])).toBeNull();
  });

  // ── 2：预扫描误判对（REV-95-003③） ──

  it('误判对：--title 后的 --json / --encoding 后的 --project 不被识别', () => {
    // --title 的取值恰为 --json → 不是开关
    expect(extractProjectArgs(['flow', 'review', 'add', '--title', '--json']).values).toEqual([]);
    // --encoding 的取值恰为 --project → 不收集
    expect(extractProjectArgs(['--encoding', '--project', 'flow', 'status']).values).toEqual([]);
  });

  // ── 3：成功 chdir + 单点解析 ──

  it('applyProjectOption：从 A 执行 --project B → chdir B；单点解析返回绝对路径', () => {
    process.chdir(dirA);
    expect(applyProjectOption(['--project', dirB])).toBe(true);
    expect(process.cwd()).toBe(dirB);
    expect(resolveProjectPathForCommand()).toBe(dirB);
    // 预扫描结果优先：raw 为原始相对值也不二次拼接
    expect(resolveProjectPathForCommand('some/relative')).toBe(dirB);
  });

  it('applyProjectOption：无 --project 时保持 cwd 且不注入', () => {
    process.chdir(dirA);
    expect(applyProjectOption(['flow', 'status'])).toBe(true);
    expect(process.cwd()).toBe(dirA);
    expect(resolveProjectPathForCommand()).toBe(dirA);
  });

  // ── 4：路径错误 ──

  it('无效路径（不存在）：JSON envelope PROJECT_NOT_FOUND / refusal / exit 1', () => {
    setJsonMode(true);
    const missing = join(dirA, 'no-such-dir');
    const ok = applyProjectOption(['--project', missing]);
    expect(ok).toBe(false);
    const doc = JSON.parse(stdout()) as {
      schemaVersion: number;
      error: { code: string; kind: string; detail: { path: string; reason: string } };
    };
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'error']);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.error.code).toBe('PROJECT_NOT_FOUND');
    expect(doc.error.kind).toBe('refusal');
    expect(doc.error.detail).toEqual({ path: missing, reason: 'not-found' });
    expect(process.exitCode).toBe(1);
    // 失败不 chdir
    expect(process.cwd()).toBe(REAL_CWD);
  });

  it('文件路径（非目录）：PROJECT_NOT_FOUND reason=not-directory', () => {
    setJsonMode(true);
    expect(applyProjectOption(['--project', filePath])).toBe(false);
    const doc = JSON.parse(stdout()) as {
      error: { code: string; detail: { reason: string } };
    };
    expect(doc.error.code).toBe('PROJECT_NOT_FOUND');
    expect(doc.error.detail.reason).toBe('not-directory');
    expect(process.exitCode).toBe(1);
  });

  it('无效路径（非 JSON）：stderr 文案 + exit 1', () => {
    const missing = join(dirA, 'nope');
    expect(applyProjectOption(['--project', missing])).toBe(false);
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(errMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('项目路径不存在或不是目录');
  });

  it('缺失值：INVALID_ARGUMENT / exit 1（JSON 与文本形态）', () => {
    setJsonMode(true);
    expect(applyProjectOption(['--project'])).toBe(false);
    const doc = JSON.parse(stdout()) as { error: { code: string; kind: string; detail: unknown } };
    expect(doc.error.code).toBe('INVALID_ARGUMENT');
    expect(doc.error.kind).toBe('refusal');
    expect(doc.error.detail).toEqual({ option: '--project' });
    expect(process.exitCode).toBe(1);
  });

  // ── 5：多值冲突 / 同值允许 ──

  it('多值冲突：A≠B → INVALID_ARGUMENT；同值重复 → 允许', () => {
    setJsonMode(true);
    expect(applyProjectOption(['--project', dirA, '--project', dirB])).toBe(false);
    const doc = JSON.parse(stdout()) as { error: { code: string; detail: { values: string[] } } };
    expect(doc.error.code).toBe('INVALID_ARGUMENT');
    expect(doc.error.detail.values).toEqual([dirA, dirB]);
    expect(process.exitCode).toBe(1);

    // 同值重复：允许并 chdir
    process.exitCode = 0;
    logMock.mockClear();
    expect(applyProjectOption(['--project', dirB, '--project', dirB])).toBe(true);
    expect(process.cwd()).toBe(dirB);
    expect(isJsonMode()).toBe(true);
  });

  // ── 6：语言按目标项目（REV-95-003① / D-95-13） ──

  it('chdir 后命令文案语言按目标项目解析；原始 cwd 语言不变', () => {
    writeLang(dirA, 'zh-CN');
    writeLang(dirB, 'en');
    process.chdir(dirA);
    expect(getCliLang(dirA)).toBe('zh-CN');
    expect(applyProjectOption(['--project', dirB])).toBe(true);
    expect(process.cwd()).toBe(dirB);
    expect(getCliLang(process.cwd())).toBe('en');
    // 原始 cwd 的语言来源不因 chdir 改变
    expect(getCliLang(dirA)).toBe('zh-CN');
  });

  // ── 7：--log-file 相对路径按原始 cwd（REV-95-003② / D-95-14） ──

  it('--log-file 相对路径在 chdir 前按原始 cwd 解析，chdir 后字符串不变', () => {
    process.chdir(dirA);
    const before = resolveRuntimeLogConfig({}, ['--log-file', 'logs/run.log']).filePath;
    expect(before).toBe(resolve(dirA, 'logs', 'run.log'));
    expect(applyProjectOption(['--project', dirB])).toBe(true);
    expect(process.cwd()).toBe(dirB);
    // 已解析的绝对路径不受后续 chdir 影响（证明先解析后 chdir）
    expect(before).toBe(resolve(dirA, 'logs', 'run.log'));
  });

  // ── 8：读取目标项目（flow status --json） ──

  it('chdir 后 flow status --json 读取目标项目阶段（未触碰真实仓库）', async () => {
    await initProject(dirB);
    const mgr = new FlowManager(dirB);
    mgr.addStage('v9.9.9-stage-01');
    mgr.save();

    expect(applyProjectOption(['--project', dirB])).toBe(true);
    const program = new Command();
    program.exitOverride();
    registerFlowCommand(program);
    setJsonMode(true);
    logMock.mockClear();
    await program.parseAsync(['flow', 'status', '--json'], { from: 'user' });
    const doc = JSON.parse(stdout()) as {
      schemaVersion: number;
      stages: Array<{ id: string }>;
    };
    expect(doc.schemaVersion).toBe(1);
    expect(doc.stages[0].id).toBe('v9.9.9-stage-01');
  });

  // ── 9：knowledge dedup 同名双注册回归（C2） ──

  it('knowledge dedup：根全局 --project 与本地同名声明并存时读取目标项目', async () => {
    initKnowledgeBase(dirB);
    addKnowledgeEntry(dirB, 'patterns', '目标项目专属条目', '量子纠缠专属术语ZZZ');

    const program = new Command();
    program.exitOverride();
    program.option('--project <path>', '目标项目根路径');
    registerKnowledgeCommand(program);

    await program.parseAsync(
      ['knowledge', 'dedup', '量子纠缠专属术语ZZZ', '--project', dirB],
      { from: 'user' },
    );

    expect(exitMock).not.toHaveBeenCalled();
    expect(stdout()).toContain('目标项目专属条目');
    expect(stdout()).not.toContain('未发现相似条目');

    // 本地声明与语法零变化（help 文案 / 选项形态）
    const knowledgeCmd = program.commands.find((c) => c.name() === 'knowledge')!;
    const dedup = knowledgeCmd.commands.find((c) => c.name() === 'dedup')!;
    const opt = dedup.options.find((o) => o.long === '--project');
    expect(opt).toBeDefined();
    expect(opt!.flags).toBe('--project <path>');
    expect(opt!.description).toBe('目标项目根路径（默认当前目录）');
    expect(dedup.registeredArguments).toHaveLength(1);
    expect(dedup.registeredArguments[0].name()).toBe('content');
  });
});
