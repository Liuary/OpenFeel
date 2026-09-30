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
import { mkdtempSync, rmSync, readFileSync, readdirSync } from 'node:fs';
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
});
