/**
 * BUG-004 / stage-51 op-002 N2-5：en 模式下 .argument() 描述为英文（无 CJK）
 * 覆盖本 op 负责的 5 处 argument 键；并验证 N2-3 view 组 help 指引键。
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

import { applyHelpI18n, program as rootProgram } from '../../src/cli/index.js';
import { registerFlowCommand } from '../../src/commands/flow.js';
import { registerViewCommand } from '../../src/commands/view.js';
import { registerArchiveCommand } from '../../src/commands/archive.js';
import { registerInstructionsCommand } from '../../src/commands/instructions.js';
import { registerRoadmapCommand } from '../../src/commands/roadmap.js';
import { registerStageCommand } from '../../src/commands/stage.js';
import { registerPlanCommand } from '../../src/commands/plan.js';
import { registerKnowledgeCommand } from '../../src/commands/knowledge.js';

/** 从命令树按路径取命令 */
function findCmd(program: Command, path: string[]): Command {
  let cur: Command | undefined = program;
  for (const p of path) {
    cur = cur.commands.find((c) => c.name() === p);
    if (!cur) {
      throw new Error(`missing command: ${path.join(' ')}`);
    }
  }
  return cur;
}

/** 断言若干 (命令路径, arg.name()) 在 en 下 argument 描述无 CJK */
function expectArgsNoCjk(program: Command, checks: Array<[string[], string]>): void {
  for (const [path, argName] of checks) {
    const c = findCmd(program, path);
    const arg = c.registeredArguments.find((a) => a.name() === argName);
    expect(arg, `${path.join(' ')} arg ${argName}`).toBeDefined();
    expect(arg!.description, `${path.join(' ')} arg ${argName}`).toBeTruthy();
    expect(arg!.description, `${path.join(' ')} arg ${argName}`).not.toMatch(/[\u4e00-\u9fff]/);
  }
}

describe('BUG-004 / N2-5：en 模式 argument 描述无 CJK', () => {
  let tmpDir: string;
  let cwdMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-help-args-'));
    mkdirSync(join(tmpDir, '.openfeel'), { recursive: true });
    writeFileSync(join(tmpDir, '.openfeel', '.info.json'), JSON.stringify({ user: 't', lang: 'en' }), 'utf-8');
    mockHome.dir = tmpDir;
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
    rmSync(tmpDir, { recursive: true, force: true });
    mockHome.dir = '';
  });

  it('N2-5：本 op 的 5 处 argument 在 en 下为英文（无 CJK）', () => {
    const program = new Command();
    program.name('openfeel').description('x');
    registerFlowCommand(program);
    registerViewCommand(program);
    applyHelpI18n(program);

    /** 从命令树按路径取命令 */
    function cmd(path: string[]): Command {
      let cur: Command | undefined = program;
      for (const p of path) {
        cur = cur.commands.find((c) => c.name() === p);
        if (!cur) {
          throw new Error(`missing command: ${path.join(' ')}`);
        }
      }
      return cur;
    }

    const checks: Array<[string[], string]> = [
      [['flow', 'stage', 'add'], 'stageId'],
      [['flow', 'review', 'resolve'], 'rev-id'],
      [['flow', 'checkpoint', 'list'], 'stage'],
      [['flow', 'checkpoint', 'restore'], 'checkpoint-file'],
      [['view', 'accept'], 'rev-id'],
    ];

    for (const [path, argName] of checks) {
      const c = cmd(path);
      const arg = c.registeredArguments.find((a) => a.name() === argName);
      expect(arg, `${path.join(' ')} arg ${argName}`).toBeDefined();
      expect(arg!.description).toBeTruthy();
      expect(arg!.description, `${path.join(' ')} arg ${argName}`).not.toMatch(/[\u4e00-\u9fff]/);
    }
  });

  it('N2-3：view 组 help 含统一入口指引（help.view.note）', () => {
    const program = new Command();
    program.name('openfeel').description('x');
    registerViewCommand(program);

    const view = program.commands.find((c) => c.name() === 'view');
    expect(view).toBeDefined();

    // addHelpText('after') 内容经 outputHelp 渲染（helpInformation 不含 after 文本）
    const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    view!.outputHelp();
    const out = writeSpy.mock.calls.map((c) => String(c[0])).join('');
    expect(out).toContain('openfeel flow review add|update|remove');
  });

  it('N11b：archive/instructions/roadmap 的 argument 在 en 下无 CJK（op-008）', () => {
    const program = new Command();
    program.name('openfeel').description('x');
    registerArchiveCommand(program);
    registerInstructionsCommand(program);
    registerRoadmapCommand(program);
    applyHelpI18n(program);

    expectArgsNoCjk(program, [
      [['archive'], 'stage'],
      [['instructions'], 'artifactId'],
      [['roadmap', 'create'], 'version'],
      [['roadmap', 'show'], 'version'],
    ]);
  });

  it('N7b：stage status/set/task、plan stage add、plan scheme create/list 的 argument 在 en 下无 CJK（op-005）', () => {
    const program = new Command();
    program.name('openfeel').description('x');
    registerStageCommand(program);
    registerPlanCommand(program);
    applyHelpI18n(program);

    expectArgsNoCjk(program, [
      [['stage', 'status'], 'stageId'],
      [['stage', 'set'], 'stageId'],
      [['stage', 'task'], 'stageId'],
      [['stage', 'task'], 'taskNo'],
      [['plan', 'stage', 'add'], 'name'],
      [['plan', 'scheme', 'create'], 'stage'],
      [['plan', 'scheme', 'create'], 'title'],
      [['plan', 'scheme', 'list'], 'stage'],
    ]);
  });

  it('N9-5：knowledge add/search/dedup 的 argument 在 en 下无 CJK（op-007）', () => {
    const program = new Command();
    program.name('openfeel').description('x');
    registerKnowledgeCommand(program);
    applyHelpI18n(program);

    expectArgsNoCjk(program, [
      [['knowledge', 'add'], 'category'],
      [['knowledge', 'add'], 'title'],
      [['knowledge', 'search'], 'query'],
      [['knowledge', 'dedup'], 'content'],
    ]);
  });

  it('op-009 门禁：en 下全命令 --help 的 Arguments 段 CJK 零命中（运行时动态枚举）', () => {
    // 使用 CLI 启动时的全量命令树（cli/index.ts 已注册全部命令）
    applyHelpI18n(rootProgram);

    const checked: string[] = [];
    const offenders: string[] = [];

    const walk = (cmd: Command, path: string[]): void => {
      for (const sub of cmd.commands) {
        const subPath = [...path, sub.name()];
        if (sub.registeredArguments.length > 0) {
          const writeSpy = vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
          sub.outputHelp();
          const help = writeSpy.mock.calls.map((c) => String(c[0])).join('');
          writeSpy.mockRestore();

          const m = help.match(/\nArguments:\n([\s\S]*?)(?:\n\n|$)/);
          if (m) {
            checked.push(subPath.join(' '));
            if (/[\u4e00-\u9fff]/.test(m[1])) {
              offenders.push(subPath.join(' '));
            }
          }
        }
        walk(sub, subPath);
      }
    };
    walk(rootProgram, ['openfeel']);

    expect(checked.length).toBeGreaterThanOrEqual(20);
    expect(offenders, `Arguments 段 CJK 残留：${offenders.join(', ')}`).toEqual([]);
  });
});
