/**
 * stage 命令测试（stage-50 op-005 T46，stage-51 op-005 N5/N6/N7 扩展）
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

import { Command, CommanderError } from 'commander';
import { registerStageCommand } from '../../src/commands/stage.js';
import { FlowManager } from '../../src/core/flow-manager.js';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

describe('stage 命令（stage-50 op-005 T46）', () => {
  let projDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;

  /** 写入一个含标准字段的 status.md */
  function writeStatus(stageDirName: string, overrides?: Partial<Record<string, string>>): string {
    const dir = join(projDir, '.openfeel', 'plan', 'v1', stageDirName);
    mkdirSync(dir, { recursive: true });
    const p = join(dir, 'status.md');
    const fields = {
      execMode: 'manual',
      autoAdvance: 'disabled',
      status: 'planned',
      reviewAgent: 'user',
      ...overrides,
    };
    writeFileSync(p, `# v1.0.0-${stageDirName} 状态

- **执行模式**：${fields.execMode}
- **自动推进**：${fields.autoAdvance}
- **状态**：${fields.status}
- **当前责任 Agent**：${fields.reviewAgent}
- **上一责任 Agent**：none

## 当前任务

> 待补充

## 阻塞 / 暂停原因

无
`, 'utf-8');
    return p;
  }

  beforeEach(() => {
    projDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-stage-'));
    mockHome.dir = projDir;
    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process, 'cwd').mockReturnValue(projDir);
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    program = new Command();
    program.exitOverride();
    registerStageCommand(program);
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

  function stdout(): string {
    return logMock.mock.calls.map((c) => c[0] as string).join('\n');
  }
  function stderr(): string {
    return errMock.mock.calls.map((c) => c[0] as string).join('\n');
  }
  function bakPath(stageId: string): string {
    return join(projDir, '.openfeel', 'tmp', `status.${stageId}.bak`);
  }

  it('基本路径：stage create 合法 stageId → 写入 flow.json', async () => {
    FlowManager.initFlow(projDir);
    await safeParse(['stage', 'create', 'v1.0.0-stage-88']);
    const mgr = new FlowManager(projDir);
    expect(mgr.getData()!.stages['v1.0.0-stage-88']).toBeDefined();
    expect(exitMock).not.toHaveBeenCalled();
  });

  it('失败路径：stage create 非法 stageId → exit 1', async () => {
    FlowManager.initFlow(projDir);
    await safeParse(['stage', 'create', 'bad id']);
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderr()).toBeTruthy();
  });

  // ── stage-51 N5：stage set 幂等 + 按需备份 ──

  it('N5：同值 stage set → exit 0 + no-op 文案 + 不生成 .bak', async () => {
    const p = writeStatus('stage-90');

    await safeParse(['stage', 'set', 'stage-90', '--status', 'planned']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(stdout()).toContain('已是目标值');
    expect(existsSync(bakPath('stage-90'))).toBe(false);
    expect(readFileSync(p, 'utf-8')).toContain('- **状态**：planned');
  });

  it('N5：变更 stage set → 写入成功 + 生成 .bak（旧内容）', async () => {
    const p = writeStatus('stage-91');

    await safeParse(['stage', 'set', 'stage-91', '--status', 'review_passed']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(readFileSync(p, 'utf-8')).toContain('- **状态**：review_passed');
    expect(existsSync(bakPath('stage-91'))).toBe(true);
    expect(readFileSync(bakPath('stage-91'), 'utf-8')).toContain('- **状态**：planned');
  });

  it('N5：目标字段缺失 → exit 1 + 文案 + 无 .bak', async () => {
    // 写入一个不含「状态」字段的 status.md
    const dir = join(projDir, '.openfeel', 'plan', 'v1', 'stage-92');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'status.md'), '# x\n\n## 当前任务\n\n> 待补充\n', 'utf-8');

    await safeParse(['stage', 'set', 'stage-92', '--status', 'planned']);

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderr()).toContain('未找到');
    expect(existsSync(bakPath('stage-92'))).toBe(false);
  });

  it('N5：无任何字段选项 → exit 1', async () => {
    writeStatus('stage-93');
    await safeParse(['stage', 'set', 'stage-93']);
    expect(exitMock).toHaveBeenCalledWith(1);
  });

  // ── stage-51 N7：stage set 字段扩展 ──

  it('N7：--exec-mode / --auto-advance / --review-agent 分别写入并可回读', async () => {
    const p = writeStatus('stage-94');

    await safeParse(['stage', 'set', 'stage-94', '--exec-mode', 'auto', '--auto-advance', 'enabled', '--review-agent', 'openfeel-executor']);

    expect(exitMock).not.toHaveBeenCalled();
    const content = readFileSync(p, 'utf-8');
    expect(content).toContain('- **执行模式**：auto');
    expect(content).toContain('- **自动推进**：enabled');
    expect(content).toContain('- **当前责任 Agent**：openfeel-executor');
  });

  it('N7：非法枚举 → exit 1 且不写盘', async () => {
    const p = writeStatus('stage-95');
    const before = readFileSync(p, 'utf-8');

    await safeParse(['stage', 'set', 'stage-95', '--exec-mode', 'bogus']);

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderr()).toContain('非法');
    expect(readFileSync(p, 'utf-8')).toBe(before);
  });

  // ── op-001 T6.6：--status 粗粒度值域校验 ──

  it('T6.6：--status 传相位值（review_pending）→ exit 1 且不写盘、无 .bak', async () => {
    const p = writeStatus('stage-99');
    const before = readFileSync(p, 'utf-8');

    await safeParse(['stage', 'set', 'stage-99', '--status', 'review_pending']);

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderr()).toContain('非法');
    expect(readFileSync(p, 'utf-8')).toBe(before);
    expect(existsSync(bakPath('stage-99'))).toBe(false);
  });

  it('T6.6：--status done 为合法粗粒度值 → 成功写入', async () => {
    const p = writeStatus('stage-89');

    await safeParse(['stage', 'set', 'stage-89', '--status', 'done']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(readFileSync(p, 'utf-8')).toContain('- **状态**：done');
  });

  // ── stage-51 N6-1：stage task --add ──

  it('N6-1：stage task --add 追加任务并可勾选', async () => {
    const p = writeStatus('stage-96');

    await safeParse(['stage', 'task', 'stage-96', '--add', '写文档']);
    expect(exitMock).not.toHaveBeenCalled();
    expect(readFileSync(p, 'utf-8')).toContain('- [ ] 任务1：写文档');
    expect(stdout()).toContain('已追加任务 1');

    await safeParse(['stage', 'task', 'stage-96', '1', '--done']);
    expect(readFileSync(p, 'utf-8')).toContain('- [x] 任务1：写文档');
  });

  it('N6-1：--add 与 --done 互斥 → exit 1；缺 taskNo 且无 --add → exit 1', async () => {
    writeStatus('stage-97');

    await safeParse(['stage', 'task', 'stage-97', '--add', 'x', '--done']);
    expect(exitMock).toHaveBeenCalledWith(1);

    exitMock.mockClear();
    await safeParse(['stage', 'task', 'stage-97']);
    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderr()).toContain('--add');
  });

  it('N6-1：任务小节缺失 → exit 1 + sectionMissing 文案', async () => {
    const dir = join(projDir, '.openfeel', 'plan', 'v1', 'stage-98');
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, 'status.md'), '# x\n\n无任务小节\n', 'utf-8');

    await safeParse(['stage', 'task', 'stage-98', '--add', 'x']);

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderr()).toContain('缺少任务小节');
  });
});
