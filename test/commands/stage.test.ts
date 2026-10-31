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
import { resetJsonModeForTest, setJsonMode } from '../../src/commands/shared/json-output.js';
import { existsSync, readFileSync, mkdtempSync, mkdirSync, rmSync, writeFileSync, statSync } from 'node:fs';
import { createHash } from 'node:crypto';
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

  /** 文件内容 sha256（载体门零写盘取证） */
  function sha(p: string): string {
    return createHash('sha256').update(readFileSync(p)).digest('hex');
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

  // ── stage-75 op-001：stage set --workflow-mode「插入」语义（T7.2 / T7.3）──

  it('T7.2a：旧版 status.md（无工作流模式行）→ 插入成功 + .bak + 仅 +1 行', async () => {
    const p = writeStatus('stage-96');
    const before = readFileSync(p, 'utf-8');

    await safeParse(['stage', 'set', 'stage-96', '--workflow-mode', 'full']);

    expect(exitMock).not.toHaveBeenCalled();
    const after = readFileSync(p, 'utf-8');
    expect(after).toContain('- **工作流模式**：full');
    // 其余内容逐字保留（diff 仅 +1 行）
    const beforeLines = before.split('\n');
    const afterLines = after.split('\n');
    expect(afterLines.length).toBe(beforeLines.length + 1);
    const added = afterLines.filter((l) => !beforeLines.includes(l));
    expect(added).toEqual(['- **工作流模式**：full']);
    // 插入位置：紧跟「自动推进」行之后
    const idx = afterLines.indexOf('- **工作流模式**：full');
    expect(afterLines[idx - 1]).toBe('- **自动推进**：disabled');
    // .bak 生成
    expect(existsSync(bakPath('stage-96'))).toBe(true);
    expect(stdout()).toContain('已');
    expect(stdout()).toContain('插入');
  });

  it('T7.2b：仅「执行模式」锚点（无「自动推进」）→ 回退锚点插入', async () => {
    const dir = join(projDir, '.openfeel', 'plan', 'v1', 'stage-97');
    mkdirSync(dir, { recursive: true });
    const p = join(dir, 'status.md');
    writeFileSync(p, '# v1.0.0-stage-97 状态\n\n- **执行模式**：manual\n- **状态**：planned\n', 'utf-8');

    await safeParse(['stage', 'set', 'stage-97', '--workflow-mode', 'fast']);

    expect(exitMock).not.toHaveBeenCalled();
    const content = readFileSync(p, 'utf-8');
    expect(content).toContain('- **工作流模式**：fast');
    expect(content).toContain('- **执行模式**：manual');
  });

  it('T7.2c：两锚点皆缺 → exit 1 + 锚点文案 + 无 .bak + 文件不变', async () => {
    const dir = join(projDir, '.openfeel', 'plan', 'v1', 'stage-98');
    mkdirSync(dir, { recursive: true });
    const p = join(dir, 'status.md');
    writeFileSync(p, '# v1.0.0-stage-98 状态\n\n- **状态**：planned\n', 'utf-8');
    const before = readFileSync(p, 'utf-8');

    await safeParse(['stage', 'set', 'stage-98', '--workflow-mode', 'full']);

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderr()).toContain('插入锚点');
    expect(existsSync(bakPath('stage-98'))).toBe(false);
    expect(readFileSync(p, 'utf-8')).toBe(before);
  });

  it('T7.2d：同值重复 → no-op 文案 + 无新 .bak', async () => {
    const p = writeStatus('stage-99');
    writeFileSync(p, readFileSync(p, 'utf-8').replace('- **状态**：planned', '- **工作流模式**：full\n- **状态**：planned'), 'utf-8');

    await safeParse(['stage', 'set', 'stage-99', '--workflow-mode', 'full']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(stdout()).toContain('已是目标值');
    expect(existsSync(bakPath('stage-99'))).toBe(false);
  });

  it('T7.3：非法值 → exit 1 且文件不变', async () => {
    const p = writeStatus('stage-100');
    const before = readFileSync(p, 'utf-8');

    await safeParse(['stage', 'set', 'stage-100', '--workflow-mode', 'bogus']);

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(readFileSync(p, 'utf-8')).toBe(before);
  });

  it('T7.3b：插入后 flow.json 冗余字段同步为写入值', async () => {
    FlowManager.initFlow(projDir);
    const m0 = new FlowManager(projDir);
    m0.registerStage('v1.0.0-stage-101');
    m0.save();
    const p = writeStatus('stage-101');

    await safeParse(['stage', 'set', 'stage-101', '--workflow-mode', 'fast']);

    expect(exitMock).not.toHaveBeenCalled();
    expect(readFileSync(p, 'utf-8')).toContain('- **工作流模式**：fast');
    const flow = JSON.parse(readFileSync(join(projDir, '.openfeel', 'flow.json'), 'utf-8'));
    expect(flow.stages['v1.0.0-stage-101'].workflow_mode).toBe('fast');
  });

  it('T90.12：stage set --workflow-mode general → exit 1 + 载体门文案 + status.md hash/mtime 不变', async () => {
    FlowManager.initFlow(projDir);
    const m0 = new FlowManager(projDir);
    m0.registerStage('v1.0.0-stage-102');
    m0.save();
    const p = writeStatus('stage-102');
    const flowPath = join(projDir, '.openfeel', 'flow.json');
    const before = sha(p);
    const beforeFlow = sha(flowPath);
    const beforeMtime = statSync(p).mtimeMs;

    await safeParse(['stage', 'set', 'stage-102', '--workflow-mode', 'general']);

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(stderr()).toContain('general（通用模式）仅限需求级——阶段级 / 部署级不支持；阶段请使用 fast / full。');
    expect(sha(p)).toBe(before);            // 零写盘
    expect(sha(flowPath)).toBe(beforeFlow); // 冗余面亦零写盘
    expect(statSync(p).mtimeMs).toBe(beforeMtime);
  });

  it('T90.13：多字段批量场景（含 general）→ 前置门生效、其余字段亦零写盘', async () => {
    FlowManager.initFlow(projDir);
    const m0 = new FlowManager(projDir);
    m0.registerStage('v1.0.0-stage-103');
    m0.save();
    const p = writeStatus('stage-103');
    const before = sha(p);

    await safeParse(['stage', 'set', 'stage-103', '--status', 'exec_running', '--workflow-mode', 'general']);

    expect(exitMock).toHaveBeenCalledWith(1);
    expect(sha(p)).toBe(before);
    expect(readFileSync(p, 'utf-8')).toContain('- **状态**：planned');
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

  // ── stage-97 op-001：人类输出基线（改动前生成，改动后逐字不变）──

  it('op-001 基线：stage status 无参空列表人类输出', async () => {
    await safeParse(['stage', 'status']);
    expect(stdout()).toMatchInlineSnapshot(`"未发现任何阶段（.openfeel/plan/ 中无 status.md 文件）"`);
  });

  it('op-001 基线：stage status 无参有阶段人类输出', async () => {
    writeStatus('stage-01');
    writeStatus('stage-02', { status: 'done' });
    await safeParse(['stage', 'status']);
    expect(stdout()).toMatchInlineSnapshot(`
      "发现 2 个阶段
        📋 v1.0.0-stage-01  →  planned
        ✅ v1.0.0-stage-02  →  done

      使用 openfeel stage status <stageId> 查看详细状态
      "
    `);
  });

  it('op-001 基线：stage status 单阶段（字段+任务+阻塞）人类输出', async () => {
    const p = writeStatus('stage-01', { status: 'exec_running' });
    writeFileSync(
      p,
      readFileSync(p, 'utf-8').replace('无', '等待外部依赖确认')
        + '\n- [ ] 任务1：实现 A\n- [x] 任务2：实现 B\n',
      'utf-8',
    );
    await safeParse(['stage', 'status', 'stage-01']);
    expect(stdout()).toMatchInlineSnapshot(`
      "
      ── stage-01 ──

        执行模式: manual
        自动推进: disabled
        状态: exec_running
        当前责任 Agent: user
        上一责任 Agent: none
        [ ] 任务1: 实现 A
        [x] 任务2: 实现 B
      任务列表 (1/2 完成)
          ⬜ 任务1: 实现 A
          ✅ 任务2: 实现 B
      阻塞原因: 等待外部依赖确认
      "
    `);
  });

  // ── stage-97 op-001：JSON 契约 ──

  /** 执行一次命令并解析 stdout 单文档（断言 schemaVersion 首键=1、无 ANSI、无 stderr） */
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

  it('op-001 JSON：stage status 无参空列表 → stages:[] + count:0 + exit 0', async () => {
    const doc = await jsonDoc(['stage', 'status', '--json']);
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'stages', 'count']);
    expect(doc.stages).toEqual([]);
    expect(doc.count).toBe(0);
    expect(exitMock).not.toHaveBeenCalled();
    expect(process.exitCode ?? 0).toBe(0);
  });

  it('op-001 JSON：stage status 无参有阶段 → stageId/status/statusPath 键序 + 绝对路径', async () => {
    writeStatus('stage-01');
    writeStatus('stage-02', { status: 'done' });
    const doc = await jsonDoc(['stage', 'status', '--json']);
    const stages = doc.stages as Array<Record<string, unknown>>;
    expect(doc.count).toBe(2);
    expect(Object.keys(stages[0])).toEqual(['stageId', 'status', 'statusPath']);
    expect(stages.map((s) => s.stageId)).toEqual(['v1.0.0-stage-01', 'v1.0.0-stage-02']);
    // statusPath 统一绝对路径
    expect(stages[0].statusPath).toBe(join(projDir, '.openfeel', 'plan', 'v1', 'stage-01', 'status.md'));
  });

  it('op-001 JSON：stage status 单阶段 → fields 7 规范键 + raw / tasks 三元组 / blockedBy', async () => {
    const dir = join(projDir, '.openfeel', 'plan', 'v1', 'stage-01');
    mkdirSync(dir, { recursive: true });
    const p = join(dir, 'status.md');
    writeFileSync(p, [
      '# v1.0.0-stage-01 状态',
      '',
      '- **执行模式**：manual',
      '- **自动推进**：disabled',
      '- **状态**：exec_running',
      '- **当前责任 Agent**：openfeel-executor',
      '- **上一责任 Agent**：none',
      '- **更新时间**：2026-10-17T00:00:00Z',
      '- **工作模式**：full',
      '',
      '## 当前任务',
      '',
      '- [ ] 任务1：实现 A',
      '- [x] 任务2：实现 B',
      '',
      '## 阻塞 / 暂停原因',
      '',
      '等待外部依赖确认',
      '',
    ].join('\n'), 'utf-8');

    const doc = await jsonDoc(['stage', 'status', 'stage-01', '--json']);
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'stageId', 'statusPath', 'fields', 'tasks', 'blockedBy']);
    expect(doc.stageId).toBe('stage-01');
    expect(doc.statusPath).toBe(p);

    const fields = doc.fields as Record<string, unknown>;
    expect(Object.keys(fields)).toEqual([
      'execMode', 'autoAdvance', 'status', 'reviewAgent',
      'previousReviewAgent', 'updatedAt', 'workflowMode', 'raw',
    ]);
    expect(fields.execMode).toBe('manual');
    expect(fields.autoAdvance).toBe('disabled');
    expect(fields.status).toBe('exec_running');
    expect(fields.reviewAgent).toBe('openfeel-executor');
    expect(fields.previousReviewAgent).toBe('none');
    expect(fields.updatedAt).toBe('2026-10-17T00:00:00Z');
    expect(fields.workflowMode).toBe('full');
    expect((fields.raw as Record<string, string>)['执行模式']).toBe('manual');

    const tasks = doc.tasks as Array<Record<string, unknown>>;
    expect(Object.keys(tasks[0])).toEqual(['number', 'done', 'description']);
    expect(tasks).toEqual([
      { number: 1, done: false, description: '实现 A' },
      { number: 2, done: true, description: '实现 B' },
    ]);
    expect(doc.blockedBy).toBe('等待外部依赖确认');
    expect(exitMock).not.toHaveBeenCalled();
  });

  it('op-001 JSON：stage status 有参未找到 → STAGE_NOT_FOUND / refusal / exit 1', async () => {
    const prevExitCode = process.exitCode;
    process.exitCode = 0;
    setJsonMode(true);
    try {
      logMock.mockClear();
      errMock.mockClear();
      await safeParse(['stage', 'status', 'v9-stage-99', '--json']);
      const doc = JSON.parse(stdout()) as Record<string, any>;
      expect(Object.keys(doc)).toEqual(['schemaVersion', 'error']);
      expect(doc.schemaVersion).toBe(1);
      expect(doc.error.code).toBe('STAGE_NOT_FOUND');
      expect(doc.error.kind).toBe('refusal');
      expect(doc.error.detail.stageId).toBe('v9-stage-99');
      expect(typeof doc.error.detail.hint).toBe('string');
      expect(process.exitCode).toBe(1);
      // 失败 envelope 不输出人类文案
      expect(errMock).not.toHaveBeenCalled();
    } finally {
      resetJsonModeForTest();
      process.exitCode = prevExitCode ?? 0;
    }
  });

  it('op-001 JSON：只读（status.md 字节不变 / 不生成 flow.json）', async () => {
    const p = writeStatus('stage-01');
    const before = sha(p);
    await jsonDoc(['stage', 'status', '--json']);
    await jsonDoc(['stage', 'status', 'stage-01', '--json']);
    expect(sha(p)).toBe(before);
    expect(existsSync(join(projDir, '.openfeel', 'flow.json'))).toBe(false);
  });

  // ═══════════════════════════════════════════════════════════════════
  // preflight 写命令闸（v1.5.6-stage-114）：strict + 无账本 → 拒绝且零写盘
  // ═══════════════════════════════════════════════════════════════════
  describe('preflight 写命令闸（v1.5.6-stage-114）', () => {
    /** preflight 文案的稳定子串（zh / en 模板共有） */
    const PREFLIGHT_HINT = 'flow next';

    beforeEach(() => {
      process.exitCode = 0;
    });
    afterEach(() => {
      vi.unstubAllEnvs();
      process.exitCode = 0;
    });

    /** strict + 删除账本（REQ-015 验收基线） */
    function armStrict(): void {
      vi.stubEnv('OPENFEEL_PREFLIGHT', 'strict');
      rmSync(join(projDir, '.openfeel', 'dev', '.preflight.json'), { force: true });
    }

    it('stage set：strict + 无账本 → 拒绝且 status.md 不变、无 .bak', async () => {
      const p = writeStatus('stage-90');
      const before = sha(p);
      armStrict();
      await safeParse(['stage', 'set', 'stage-90', '--status', 'review_passed']);
      expect(process.exitCode).toBe(1);
      expect(stderr()).toContain(PREFLIGHT_HINT);
      expect(exitMock).not.toHaveBeenCalled();
      expect(sha(p)).toBe(before);
      expect(existsSync(bakPath('stage-90'))).toBe(false);
    });

    it('stage task --add：strict + 无账本 → 拒绝（REV-006 分支独立门）且 status.md 不变', async () => {
      const p = writeStatus('stage-91');
      const before = sha(p);
      armStrict();
      await safeParse(['stage', 'task', 'stage-91', '--add', '写文档']);
      expect(process.exitCode).toBe(1);
      expect(stderr()).toContain(PREFLIGHT_HINT);
      expect(exitMock).not.toHaveBeenCalled();
      expect(sha(p)).toBe(before);
      expect(readFileSync(p, 'utf-8')).not.toContain('写文档');
      expect(existsSync(bakPath('stage-91'))).toBe(false);
    });

    it('stage task --done：strict + 无账本 → 拒绝（主路径门）且 status.md 不变', async () => {
      const p = writeStatus('stage-92');
      const before = sha(p);
      armStrict();
      await safeParse(['stage', 'task', 'stage-92', '1', '--done']);
      expect(process.exitCode).toBe(1);
      expect(stderr()).toContain(PREFLIGHT_HINT);
      expect(exitMock).not.toHaveBeenCalled();
      expect(sha(p)).toBe(before);
      expect(existsSync(bakPath('stage-92'))).toBe(false);
    });

    it('stage create：strict + 无账本 → 拒绝且 flow.json 无新阶段', async () => {
      FlowManager.initFlow(projDir);
      const before = readFileSync(join(projDir, '.openfeel', 'flow.json'), 'utf-8');
      armStrict();
      await safeParse(['stage', 'create', 'v1.0.0-stage-88']);
      expect(process.exitCode).toBe(1);
      expect(stderr()).toContain(PREFLIGHT_HINT);
      expect(exitMock).not.toHaveBeenCalled();
      expect(readFileSync(join(projDir, '.openfeel', 'flow.json'), 'utf-8')).toBe(before);
    });

    it('序位断言：stage set 非法阶段 + strict → 先报「阶段未找到」而非 preflight', async () => {
      // 让 process.exit 抛出以真实终止（默认 mock 为 no-op，会继续执行后续分支）
      exitMock.mockImplementation(((code?: number) => {
        throw new Error(`__EXIT__${code ?? 0}`);
      }) as never);
      armStrict();
      await expect(safeParse(['stage', 'set', 'no-such-stage', '--status', 'planned']))
        .rejects.toThrow('__EXIT__1');
      expect(stderr()).toContain('no-such-stage');
      expect(stderr()).not.toContain(PREFLIGHT_HINT);
      expect(logMock).not.toHaveBeenCalled();
    });
  });
});
