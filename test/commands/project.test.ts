/**
 * project 命令测试（v1.1.2-stage-52 op-010，L2）
 * 覆盖：overview 正常输出 / help 可渲染 / i18n。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Command, CommanderError } from 'commander';
import { registerProjectCommand } from '../../src/commands/project.js';
import { t } from '../../src/core/i18n.js';
import { mkdtempSync, rmSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

describe('project 命令（op-010 L2）', () => {
  let tmpDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-project-'));
    mockHome.dir = tmpDir;
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    program = new Command();
    program.exitOverride();
    registerProjectCommand(program);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    mockHome.dir = '';
    logMock.mockRestore();
    errorMock.mockRestore();
    cwdMock.mockRestore();
    exitMock.mockRestore();
  });

  async function safeParse(args: string[]): Promise<void> {
    try {
      await program.parseAsync(args, { from: 'user' });
    } catch (err) {
      if (!(err instanceof CommanderError)) {
        throw err;
      }
    }
  }

  it('project overview 正常输出（exit 0，含标题）', async () => {
    await safeParse(['project', 'overview']);
    expect(exitMock).not.toHaveBeenCalled();
    expect(logMock.mock.calls.map((c) => c[0] as string).join('\n')).toContain('OpenFeel');
  });

  it('project 子命令含 overview（help 可渲染）', () => {
    const project = program.commands.find((c) => c.name() === 'project');
    expect(project).toBeDefined();
    expect(project!.commands.map((c) => c.name())).toContain('overview');
  });

  it('i18n：project 文案 en 无 CJK', () => {
    expect(/[\u4e00-\u9fff]/.test(t('project.overview.title', 'en'))).toBe(false);
    expect(/[\u4e00-\u9fff]/.test(t('help.project.overview', 'en'))).toBe(false);
  });

  // ── stage-97 op-001：人类输出基线（改动前生成，改动后逐字不变）──

  function stdout(): string {
    return logMock.mock.calls.map((c) => c[0] as string).join('\n');
  }

  it('op-001 基线：project overview（src 不存在）人类输出', async () => {
    await safeParse(['project', 'overview']);
    expect(stdout()).toMatchInlineSnapshot(`
      "
      ╔══════════════════════════════════════════╗
      ║     OpenFeel 项目结构化概览                        ║
      ╚══════════════════════════════════════════╝

      📋 基本信息
         项目名: unknown (v0.0.0)
         定位:   AI Agent 开发流程治理 CLI 工具
         语言:   TypeScript (Node.js)

      📁 目录结构
         src/    （目录不存在）
         平台适配器目录（.opencode/）  （目录不存在）
         .openfeel/  （目录不存在）

      📊 统计信息
         TS 源文件:   0
         Agent 定义:  0
         CLI 命令模块: 0
         KB 条目:  0
         计划版本: 0

      🚪 入口路径
         （未检测到项目结构——缺少 src/ 目录）

      🔧 技术栈
         运行时:    Node.js ≥20
         语言:      TypeScript 5.7+
         CLI 框架:  Commander 14+
         校验:      Zod 4+
         配置:      YAML
         文件匹配:  fast-glob
         测试:      Vitest 3+
      "
    `);
  });

  it('op-001 基线：project overview（src 存在）人类输出', async () => {
    mkdirSync(join(tmpDir, 'src', 'cli'), { recursive: true });
    mkdirSync(join(tmpDir, 'src', 'commands'), { recursive: true });
    mkdirSync(join(tmpDir, 'src', 'core'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'cli', 'index.ts'), '');
    writeFileSync(join(tmpDir, 'src', 'commands', 'flow.ts'), '');
    writeFileSync(join(tmpDir, 'src', 'core', 'x.ts'), '');
    await safeParse(['project', 'overview']);
    expect(stdout()).toMatchInlineSnapshot(`
      "
      ╔══════════════════════════════════════════╗
      ║     OpenFeel 项目结构化概览                        ║
      ╚══════════════════════════════════════════╝

      📋 基本信息
         项目名: unknown (v0.0.0)
         定位:   AI Agent 开发流程治理 CLI 工具
         语言:   TypeScript (Node.js)

      📁 目录结构
         src/
          ├─ cli/          — CLI 入口程序（1 个文件）
          ├─ commands/     — CLI 命令模块（1 个）
          ├─ core/         — 核心逻辑（1 个文件）
          └─ utils/        — 工具函数（0 个文件）
         平台适配器目录（.opencode/）  （目录不存在）
         .openfeel/  （目录不存在）

      📊 统计信息
         TS 源文件:   3
         Agent 定义:  0
         CLI 命令模块: 1
         KB 条目:  0
         计划版本: 0

      🚪 入口路径
         CLI 入口:  src/cli/index.ts
         包入口:    src/index.ts
         构建产物:  dist/

      🔧 技术栈
         运行时:    Node.js ≥20
         语言:      TypeScript 5.7+
         CLI 框架:  Commander 14+
         校验:      Zod 4+
         配置:      YAML
         文件匹配:  fast-glob
         测试:      Vitest 3+
      "
    `);
  });

  // ── stage-97 op-001：JSON 契约 ──

  /** 执行一次命令并解析 stdout 单文档（断言 schemaVersion 首键=1、无 ANSI、无 stderr） */
  async function jsonDoc(): Promise<Record<string, any>> {
    logMock.mockClear();
    errorMock.mockClear();
    await safeParse(['project', 'overview', '--json']);
    const raw = stdout();
    expect(raw.trim().length).toBeGreaterThan(0);
    expect(raw).not.toMatch(/\x1b\[/);
    expect(errorMock).not.toHaveBeenCalled();
    const doc = JSON.parse(raw) as Record<string, any>;
    expect(Object.keys(doc)[0]).toBe('schemaVersion');
    expect(doc.schemaVersion).toBe(1);
    return doc;
  }

  it('op-001 JSON：project overview 顶层 / 子对象键序 + src 不存在形态', async () => {
    const doc = await jsonDoc();
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'project', 'dirs', 'stats', 'entries', 'techStack']);
    expect(Object.keys(doc.project)).toEqual(['name', 'version', 'description']);
    expect(Object.keys(doc.dirs)).toEqual(['src', 'opencode', 'openfeel']);
    expect(Object.keys(doc.dirs.src)).toEqual(['exists', 'cli', 'commands', 'core', 'utils']);
    expect(Object.keys(doc.dirs.opencode)).toEqual(['exists', 'agents', 'skills']);
    expect(Object.keys(doc.dirs.openfeel)).toEqual(['exists', 'kb', 'plan', 'codeReview', 'bugs']);
    expect(Object.keys(doc.stats)).toEqual(['tsSourceFiles', 'agentDefs', 'cliModules', 'kbEntries', 'planVersions']);
    expect(Object.keys(doc.entries)).toEqual(['available', 'cli', 'pkg', 'build']);
    expect(Object.keys(doc.techStack)).toEqual(['runtime', 'language', 'cliFramework', 'validation', 'config', 'fileMatch', 'test']);

    // src 不存在：exists=false + 子项 null；stats 恒为 0；entries 字符串 + available=false
    expect(doc.dirs.src).toEqual({ exists: false, cli: null, commands: null, core: null, utils: null });
    expect(doc.dirs.opencode).toEqual({ exists: false, agents: null, skills: null });
    expect(doc.dirs.openfeel).toEqual({ exists: false, kb: null, plan: null, codeReview: null, bugs: null });
    expect(doc.stats).toEqual({ tsSourceFiles: 0, agentDefs: 0, cliModules: 0, kbEntries: 0, planVersions: 0 });
    expect(doc.entries).toEqual({ available: false, cli: 'src/cli/index.ts', pkg: 'src/index.ts', build: 'dist/' });
    expect(doc.techStack.config).toBe('YAML');
    expect(exitMock).not.toHaveBeenCalled();
    expect(process.exitCode ?? 0).toBe(0);
  });

  it('op-001 JSON：project overview src 存在 → exists=true + 计数 + entries.available=true', async () => {
    mkdirSync(join(tmpDir, 'src', 'cli'), { recursive: true });
    mkdirSync(join(tmpDir, 'src', 'commands'), { recursive: true });
    mkdirSync(join(tmpDir, 'src', 'core'), { recursive: true });
    mkdirSync(join(tmpDir, 'src', 'utils'), { recursive: true });
    writeFileSync(join(tmpDir, 'src', 'cli', 'index.ts'), '');
    writeFileSync(join(tmpDir, 'src', 'commands', 'flow.ts'), '');
    writeFileSync(join(tmpDir, 'src', 'core', 'x.ts'), '');
    writeFileSync(join(tmpDir, 'src', 'utils', 'u.ts'), '');

    const doc = await jsonDoc();
    expect(doc.dirs.src).toEqual({ exists: true, cli: 1, commands: 1, core: 1, utils: 1 });
    expect(doc.stats.tsSourceFiles).toBe(4);
    expect(doc.stats.cliModules).toBe(1);
    expect(doc.entries.available).toBe(true);
  });
});
