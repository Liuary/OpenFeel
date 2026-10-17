/**
 * knowledge 命令测试（stage-51 op-007 N9-2：openfeel knowledge dedup 子命令）
 * 隔离硬要求：全部在 mkdtemp 临时项目内构造 .openfeel/kb/**；vi.mock('node:os') 隔离 HOME。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { Readable } from 'node:stream';
import { createHash } from 'node:crypto';

const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import { Command, CommanderError } from 'commander';
import { registerKnowledgeCommand } from '../../src/commands/knowledge.js';
import { initKnowledgeBase, addKnowledgeEntry } from '../../src/core/workspace/knowledge.js';
import { setJsonMode, resetJsonModeForTest } from '../../src/commands/shared/json-output.js';
import { program as rootProgram } from '../../src/cli/index.js';
import { mkdtempSync, rmSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('knowledge dedup（stage-51 op-007 N9-2）', () => {
  let projDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;

  /** kb 目录所有文件内容 hash（只读验证） */
  function kbHash(): string {
    const kbDir = join(projDir, '.openfeel', 'kb');
    const h = createHash('sha256');
    for (const f of readdirSync(kbDir).sort()) {
      h.update(f);
      h.update(readFileSync(join(kbDir, f)));
    }
    return h.digest('hex');
  }

  function stdout(): string {
    return logMock.mock.calls.map((c) => c[0] as string).join('\n');
  }
  function stderr(): string {
    return errMock.mock.calls.map((c) => c[0] as string).join('\n');
  }

  beforeEach(() => {
    projDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-knowledge-'));
    mockHome.dir = projDir;
    initKnowledgeBase(projDir);
    addKnowledgeEntry(projDir, 'patterns', 'Jaccard 相似度去重', '使用 Jaccard 相似度进行知识库去重检索。');
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'cwd').mockReturnValue(projDir);
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    program = new Command();
    program.exitOverride();
    registerKnowledgeCommand(program);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    // JSON 失败路径置位的退出码须复位（进程级状态）
    process.exitCode = undefined;
    rmSync(projDir, { recursive: true, force: true });
    mockHome.dir = '';
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

  it('N9-2：dedup 命中相似条目 + readOnlyNote；kb 文件未被修改（只读）', async () => {
    const before = kbHash();

    await safeParse(['knowledge', 'dedup', 'Jaccard 相似度去重', '--project', projDir]);

    expect(exitMock).not.toHaveBeenCalled();
    expect(stdout()).toContain('Jaccard 相似度去重');
    expect(stdout()).toContain('本命令仅输出建议');
    expect(kbHash()).toBe(before);
  });

  it('N9-2：未指定 --project 时读 cwd', async () => {
    await safeParse(['knowledge', 'dedup', 'Jaccard 相似度去重']);
    expect(exitMock).not.toHaveBeenCalled();
    expect(stdout()).toContain('Jaccard 相似度去重');
  });

  it('N9-2：--threshold 非法 → exit 1', async () => {
    await safeParse(['knowledge', 'dedup', 'x', '--project', projDir, '--threshold', '2']);
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderr()).toContain('阈值非法');
  });

  it('N9-2：--category 非法 → exit 1', async () => {
    await safeParse(['knowledge', 'dedup', 'x', '--project', projDir, '--category', 'bogus']);
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderr()).toContain('分类非法');
  });

  it('N9-2：--category 限定分类；未指定则遍历全部分类', async () => {
    addKnowledgeEntry(projDir, 'architecture', '架构决策A', '架构决策内容特殊词。');

    await safeParse(['knowledge', 'dedup', '架构决策内容特殊词', '--project', projDir]);
    expect(stdout()).toContain('[architecture]');

    logMock.mockClear();
    await safeParse(['knowledge', 'dedup', '架构决策内容特殊词', '--project', projDir, '--category', 'patterns']);
    expect(stdout()).not.toContain('[architecture]');
  });

  it('N9-2：stdin 路径可用（无位置参数 + 管道输入）', async () => {
    const fakeStdin = Readable.from(['Jaccard 相似度去重']);
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(fakeStdin as unknown as NodeJS.ReadStream);

    await safeParse(['knowledge', 'dedup', '--project', projDir]);

    expect(exitMock).not.toHaveBeenCalled();
    expect(stdout()).toContain('Jaccard');
  });

  it('N9-2：无相似条目 → noneTmpl（退出码 0）', async () => {
    await safeParse(['knowledge', 'dedup', '完全无关的量子纠缠话题zzz', '--project', projDir]);
    expect(exitMock).not.toHaveBeenCalled();
    expect(stdout()).toContain('未发现相似条目');
  });

  // ── stage-95 op-003：根全局 --project 与本地同名声明并存（C2 扩展路径） ──

  it('op-003：同名双注册下 --project 读取目标项目（保留本地声明，语法零变化）', async () => {
    // 目标项目 B：与 cwd（projDir）不同的知识库
    const targetDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-knowledge-target-'));
    initKnowledgeBase(targetDir);
    addKnowledgeEntry(targetDir, 'patterns', '目标项目专属条目', '量子纠缠专属术语ZZZ');
    try {
      const root = new Command();
      root.exitOverride();
      root.option('--project <path>', '项目根路径');
      registerKnowledgeCommand(root);

      await root.parseAsync(
        ['knowledge', 'dedup', '量子纠缠专属术语ZZZ', '--project', targetDir],
        { from: 'user' },
      );

      expect(exitMock).not.toHaveBeenCalled();
      expect(stdout()).toContain('目标项目专属条目');
      expect(stdout()).not.toContain('未发现相似条目');

      // 本地 --project 声明与语法逐字不变（help 文案 / 选项形态 / 位置参数）
      const knowledgeCmd = root.commands.find((c) => c.name() === 'knowledge')!;
      const dedup = knowledgeCmd.commands.find((c) => c.name() === 'dedup')!;
      const opt = dedup.options.find((o) => o.long === '--project');
      expect(opt).toBeDefined();
      expect(opt!.flags).toBe('--project <path>');
      expect(opt!.description).toBe('目标项目根路径（默认当前目录）');
      expect(dedup.registeredArguments).toHaveLength(1);
      expect(dedup.registeredArguments[0].name()).toBe('content');
    } finally {
      rmSync(targetDir, { recursive: true, force: true });
    }
  });

  // ── stage-97 op-002：knowledge 4 命令面 JSON 契约 ──

  /** 执行一次成功 JSON 命令并解析单文档（schemaVersion 首键=1、无 ANSI、无 stderr） */
  async function jsonDoc(args: string[]): Promise<Record<string, unknown>> {
    logMock.mockClear();
    errMock.mockClear();
    await safeParse(args);
    const raw = stdout();
    expect(raw.trim().length).toBeGreaterThan(0);
    expect(raw).not.toMatch(/\x1b\[/);
    expect(errMock).not.toHaveBeenCalled();
    const doc = JSON.parse(raw) as Record<string, unknown>;
    expect(Object.keys(doc)[0]).toBe('schemaVersion');
    expect(doc.schemaVersion).toBe(1);
    return doc;
  }

  /** 执行一次 JSON 失败命令并解析 envelope（失败 envelope 判定经 isJsonMode 单点） */
  async function jsonError(args: string[]): Promise<Record<string, any>> {
    logMock.mockClear();
    errMock.mockClear();
    setJsonMode(true);
    try {
      await safeParse(args);
    } finally {
      resetJsonModeForTest();
    }
    const raw = stdout();
    expect(raw.trim().length).toBeGreaterThan(0);
    expect(errMock).not.toHaveBeenCalled();
    const doc = JSON.parse(raw) as Record<string, any>;
    expect(Object.keys(doc)[0]).toBe('schemaVersion');
    expect(doc.schemaVersion).toBe(1);
    return doc;
  }

  /**
   * 用固定日期条目覆盖 patterns 分类文件。
   * 目的：人类输出基线快照跨日稳定（addKnowledgeEntry 使用当天日期）。
   */
  function writeFixedPatternsEntry(): void {
    writeFileSync(
      join(projDir, '.openfeel', 'kb', 'patterns.md'),
      '# 代码模式 (patterns)\n\n## [+] 固定条目 (2026-01-01)\n\n固定内容\n',
      'utf-8',
    );
  }

  it('op-002 JSON：knowledge search 键序 + content 全文 + summary 截断', async () => {
    const long = 'X'.repeat(120);
    addKnowledgeEntry(projDir, 'patterns', '长内容条目', long);

    const doc = await jsonDoc(['knowledge', 'search', '长内容条目', '--json']);

    expect(Object.keys(doc)).toEqual(['schemaVersion', 'query', 'limit', 'offset', 'results']);
    expect(doc.query).toBe('长内容条目');
    expect(doc.limit).toBe(10);
    expect(doc.offset).toBe(0);
    const results = doc.results as Array<Record<string, unknown>>;
    expect(results).toHaveLength(1);
    expect(Object.keys(results[0])).toEqual(['title', 'category', 'date', 'enabled', 'content', 'summary']);
    expect(results[0].content).toBe(long);
    expect(results[0].summary).toBe('X'.repeat(100) + '…');
  });

  it('op-002 JSON：knowledge search 空结果 → results:[] + limit/offset 生效', async () => {
    const doc = await jsonDoc(['knowledge', 'search', '不存在关键词zzz', '--limit', '3', '--offset', '2', '--json']);

    expect(doc.results).toEqual([]);
    expect(doc.limit).toBe(3);
    expect(doc.offset).toBe(2);
    expect(exitMock).not.toHaveBeenCalled();
  });

  it('op-002 JSON：knowledge list 不含 content + --type 过滤 + 空态', async () => {
    addKnowledgeEntry(projDir, 'architecture', '架构条目', '架构内容');

    const doc = await jsonDoc(['knowledge', 'list', '--type', 'architecture', '--json']);
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'entries', 'count']);
    const entries = doc.entries as Array<Record<string, unknown>>;
    expect(doc.count).toBe(1);
    expect(Object.keys(entries[0])).toEqual(['title', 'category', 'date', 'enabled']);
    expect(entries[0].category).toBe('architecture');
    expect(entries[0]).not.toHaveProperty('content');

    const empty = await jsonDoc(['knowledge', 'list', '--type', 'troubleshooting', '--json']);
    expect(empty.entries).toEqual([]);
    expect(empty.count).toBe(0);
  });

  it('op-002 JSON：knowledge index 直出 categories/recentUpdates（index.md 缺失 → 默认分类）', async () => {
    const doc = await jsonDoc(['knowledge', 'index', '--json']);
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'categories', 'recentUpdates']);
    const cats = doc.categories as Array<Record<string, unknown>>;
    expect(cats.length).toBe(4);
    expect(Object.keys(cats[0])).toEqual(['name', 'description']);

    rmSync(join(projDir, '.openfeel', 'kb', 'index.md'), { force: true });
    const fallback = await jsonDoc(['knowledge', 'index', '--json']);
    expect((fallback.categories as unknown[]).length).toBe(4);
    expect(fallback.recentUpdates).toEqual([]);
  });

  it('op-002 JSON：knowledge dedup 命中 → matches 键序 + flagged/readOnly/found', async () => {
    writeFixedPatternsEntry();

    const doc = await jsonDoc(['knowledge', 'dedup', '固定内容', '--json']);

    expect(Object.keys(doc)).toEqual(['schemaVersion', 'threshold', 'categories', 'found', 'readOnly', 'matches']);
    expect(doc.threshold).toBe(0.8);
    expect(doc.categories).toEqual(['architecture', 'patterns', 'troubleshooting', 'setup']);
    expect(doc.readOnly).toBe(true);
    expect(doc.found).toBe(true);
    const matches = doc.matches as Array<Record<string, unknown>>;
    expect(matches.length).toBeGreaterThan(0);
    expect(Object.keys(matches[0])).toEqual(['category', 'title', 'date', 'enabled', 'similarity', 'flagged']);
    expect(matches[0].category).toBe('patterns');
    expect(matches[0].title).toBe('固定条目');
    expect(matches[0].date).toBe('2026-01-01');
    expect(matches[0].enabled).toBe(true);
  });

  it('op-002 JSON：knowledge dedup 无匹配 → found:false + matches:[]', async () => {
    const doc = await jsonDoc(['knowledge', 'dedup', '完全无关的量子纠缠话题zzz', '--json']);

    expect(doc.found).toBe(false);
    expect(doc.matches).toEqual([]);
    expect(exitMock).not.toHaveBeenCalled();
  });

  it('op-002 JSON：knowledge dedup --project 本地声明仍可读取目标项目', async () => {
    const targetDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-knowledge-json-target-'));
    initKnowledgeBase(targetDir);
    addKnowledgeEntry(targetDir, 'patterns', '目标项目条目', '量子纠缠专属术语ZZZ');
    try {
      const doc = await jsonDoc(['knowledge', 'dedup', '量子纠缠专属术语ZZZ', '--project', targetDir, '--json']);
      expect(doc.found).toBe(true);
    } finally {
      rmSync(targetDir, { recursive: true, force: true });
    }
  });

  it('op-002 JSON：knowledge dedup 非法阈值/分类/无内容 → INVALID_ARGUMENT', async () => {
    const t1 = await jsonError(['knowledge', 'dedup', 'x', '--threshold', '2', '--json']);
    expect(t1.error.code).toBe('INVALID_ARGUMENT');
    expect(t1.error.kind).toBe('refusal');
    expect(t1.error.detail).toEqual({ field: 'threshold', value: '2' });
    expect(process.exitCode).toBe(1);

    const c1 = await jsonError(['knowledge', 'dedup', 'x', '--category', 'bogus', '--json']);
    expect(c1.error.detail).toEqual({ field: 'category', value: 'bogus' });
    expect(process.exitCode).toBe(1);

    const fakeStdin = Readable.from(['']);
    vi.spyOn(process, 'stdin', 'get').mockReturnValue(fakeStdin as unknown as NodeJS.ReadStream);
    const n1 = await jsonError(['knowledge', 'dedup', '--json']);
    expect(n1.error.detail).toEqual({ field: 'content' });
    expect(process.exitCode).toBe(1);
  });

  // 人类输出基线（固定日期夹具 → 快照跨日稳定）

  it('op-002 基线：knowledge search 人类输出逐字不变', async () => {
    writeFixedPatternsEntry();
    await safeParse(['knowledge', 'search', '固定条目']);
    expect(stdout()).toMatchInlineSnapshot(`
      "找到 1 条匹配
      [patterns] **固定条目** (2026-01-01) [启用]
        固定内容
      "
    `);
  });

  it('op-002 基线：knowledge list 人类输出逐字不变', async () => {
    writeFixedPatternsEntry();
    await safeParse(['knowledge', 'list']);
    expect(stdout()).toMatchInlineSnapshot(`
      "分类       | 标题   | 日期         | 状态
      ---------+------+------------+---
      patterns | 固定条目 | 2026-01-01 | 启用"
    `);
  });

  it('op-002 基线：knowledge index 人类输出逐字不变（index.md 缺失）', async () => {
    rmSync(join(projDir, '.openfeel', 'kb', 'index.md'), { force: true });
    await safeParse(['knowledge', 'index']);
    expect(stdout()).toMatchInlineSnapshot(`
      "=== 分类概览 ===
        architecture         架构决策
        patterns             代码模式
        troubleshooting      常见问题
        setup                环境搭建

      === 最近更新 ===

      暂无更新记录。"
    `);
  });

  it('op-002 基线：knowledge dedup 人类输出逐字不变', async () => {
    writeFixedPatternsEntry();
    await safeParse(['knowledge', 'dedup', '固定内容']);
    expect(stdout()).toMatchInlineSnapshot(`
      "相似条目建议：
        [patterns] 固定条目（相似度 100.0%） ← 建议合并/更新
      本命令仅输出建议，不会修改 kb 文件"
    `);
  });

  // ── stage-97 op-003：注册选项 / 成功出口计数（archive <stage> 新增 1） ──

  it('op-003 计数：注册 --json 选项 34 / 成功出口 33', () => {
    // 遍历完整命令树（src/cli/index.ts 已注册全部命令组）
    const withJson: Command[] = [];
    const walk = (cmd: Command): void => {
      if (cmd.options.some((o) => o.long === '--json')) {
        withJson.push(cmd);
      }
      for (const sub of cmd.commands) {
        walk(sub);
      }
    };
    walk(rootProgram);

    expect(withJson).toHaveLength(34);
    // 「注册选项数」= 成功出口 + 1（flow advance 的 --json 仅错误模式，不构成成功出口）
    const errorOnly = withJson.filter((c) => c.name() === 'advance' && c.parent?.name() === 'flow');
    expect(errorOnly).toHaveLength(1);
    expect(withJson.length - errorOnly.length).toBe(33);
  });
});
