/**
 * req 命令组集成测试（v1.2.0-stage-82）
 * 测试段 A（op-001）：隔离骨架 + add / list / show。
 *
 * 隔离声明：全程 fixture tmpDir + 隔离 HOME；**严禁**触碰本仓真实 `.openfeel/flow.json`
 *          与真实 `.openfeel/requirements/`（afterEach REAL_CWD 反守卫）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// N4 单点隔离：homedir → 临时目录（initProject 的全局配置写入不触碰真实 ~/.openfeel/）
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

// mock child_process：owner 缺省链用例共用（避免真实 git 调用）
const mockedChild = vi.hoisted(() => ({ execSync: vi.fn(), execFileSync: vi.fn() }));
vi.mock('node:child_process', () => ({
  execSync: mockedChild.execSync,
  execFileSync: mockedChild.execFileSync,
}));

import { Command, CommanderError } from 'commander';
import { registerReqCommand } from '../../src/commands/req.js';
import { applyHelpI18n, program as rootProgram } from '../../src/cli/index.js';
import { initProject } from '../../src/core/init.js';
import { hasKey, t } from '../../src/core/i18n.js';
import { FlowManager, FlowConcurrentModificationError } from '../../src/core/flow-manager.js';
import { getAllowedNextStatuses } from '../../src/core/req/requirement-ops.js';
import { REQ_STATUSES } from '../../src/core/req/types.js';
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// 模块顶层捕获真实工作区基线（REAL_CWD 反守卫用）
const REAL_CWD = process.cwd();
const REAL_FLOW_PATH = join(REAL_CWD, '.openfeel', 'flow.json');
const REAL_FLOW_RAW = existsSync(REAL_FLOW_PATH) ? readFileSync(REAL_FLOW_PATH, 'utf-8') : null;
const REAL_REQ_DIR = join(REAL_CWD, '.openfeel', 'requirements');

describe('req 命令组（stage-82）', () => {
  let tmpDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;
  let prevExitCode: number | string | undefined;

  beforeEach(async () => {
    mockHome.dir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-req-home-'));
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-req-test-'));
    mockedChild.execSync.mockReset();
    mockedChild.execFileSync.mockReset();
    await initProject(tmpDir);

    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    prevExitCode = process.exitCode;
    process.exitCode = 0;

    program = new Command();
    program.exitOverride();
    registerReqCommand(program);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(mockHome.dir, { recursive: true, force: true });
    logMock.mockRestore();
    errorMock.mockRestore();
    cwdMock.mockRestore();
    exitMock.mockRestore();
    process.exitCode = prevExitCode;

    // REAL_CWD 反守卫：真实工作区逐字零触碰
    const realRaw = existsSync(REAL_FLOW_PATH) ? readFileSync(REAL_FLOW_PATH, 'utf-8') : null;
    expect(realRaw).toBe(REAL_FLOW_RAW);
    expect(existsSync(REAL_REQ_DIR)).toBe(false);
  });

  /** 安全解析命令，捕获 CommanderError 不使测试中断 */
  async function safeParse(args: string[]): Promise<void> {
    try {
      await program.parseAsync(args, { from: 'user' });
    } catch (err) {
      if (!(err instanceof CommanderError)) {
        throw err;
      }
    }
  }

  /** stdout 汇总 */
  function out(): string {
    return logMock.mock.calls.map((c) => c[0] as string).join('\n');
  }

  /** stderr 汇总 */
  function err(): string {
    return errorMock.mock.calls.map((c) => c[0] as string).join('\n');
  }

  /** 清空捕获（子用例复用） */
  function resetCapture(): void {
    logMock.mockClear();
    errorMock.mockClear();
    process.exitCode = 0;
  }

  /** 读取 fixture flow.json（解析后） */
  function readFlow(): any {
    return JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'));
  }

  /** 读取 fixture flow.json 原文（逐字节比对用） */
  function flowRaw(): string {
    return readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8');
  }

  /** 写回 fixture flow.json（就地变更后序列化） */
  function writeFlow(mutate: (d: any) => void): void {
    const d = readFlow();
    mutate(d);
    writeFileSync(join(tmpDir, '.openfeel', 'flow.json'), JSON.stringify(d, null, 2) + '\n', 'utf-8');
  }

  /** 构造需求条目 */
  function req_(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id,
      title: `需求 ${id}`,
      status: 'draft',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  // ═══ T-A1 add 成功 ═══

  it('T-A1 add 成功：落库 + 正文骨架 + 审计 + revision +1', async () => {
    const before = readFlow().meta.revision;
    await safeParse(['req', 'add', '我的需求', '--target-version', 'v1.3.0', '--priority', 'P1']);

    expect(process.exitCode).toBe(0);
    const d = readFlow();
    expect(d.meta.revision).toBe(before + 1);
    expect(Array.isArray(d.requirements)).toBe(true);
    expect(d.requirements).toHaveLength(1);
    const r = d.requirements[0];
    expect(r.id).toBe('REQ-001');
    expect(r.title).toBe('我的需求');
    expect(r.status).toBe('draft');
    expect(r.target_version).toBe('v1.3.0');
    expect(r.priority).toBe('P1');
    expect(typeof r.created_at).toBe('string');
    expect(typeof r.updated_at).toBe('string');
    expect(r.body_path).toBe('.openfeel/requirements/REQ-001.md');
    // 审计
    expect(d.log.some((e: any) => e.action === 'requirement_add')).toBe(true);
    // 正文骨架文件
    const bodyFile = join(tmpDir, '.openfeel', 'requirements', 'REQ-001.md');
    expect(existsSync(bodyFile)).toBe(true);
    expect(readFileSync(bodyFile, 'utf-8')).toContain('# REQ-001：我的需求');
    // 输出
    expect(out()).toContain('已创建 REQ-001');
    expect(out()).toContain('正文骨架');
  });

  // ═══ T-A2 add 抛错分流（三径：空 title / 非法 priority / 空 target_version）═══

  it('T-A2 add 抛错分流：三径 → stderr errorTmpl + exit 1 + flow.json 逐字节零变更', async () => {
    const cases: string[][] = [
      ['req', 'add', ''],
      ['req', 'add', 'x', '--priority', 'P9'],
      ['req', 'add', 'x', '--target-version', ''],
    ];
    for (const args of cases) {
      resetCapture();
      const raw = flowRaw();
      await safeParse(args);
      expect(process.exitCode).toBe(1);
      expect(err()).toContain('错误');
      expect(flowRaw()).toBe(raw);          // 零写盘
      expect(readFlow().requirements ?? []).toHaveLength(0);
    }
  });

  // ═══ T-A4 命令层「损坏数据不崩」（BUG-001 承接回归）═══

  it('T-A4 requirements 非数组（{}）→ req add 不崩、exit 0、容器化为数组', async () => {
    writeFlow((d) => { d.requirements = {}; });
    await safeParse(['req', 'add', '损坏数据']);
    expect(process.exitCode).toBe(0);
    const d = readFlow();
    expect(Array.isArray(d.requirements)).toBe(true);
    expect(d.requirements).toHaveLength(1);
    expect(d.requirements[0].id).toBe('REQ-001');
    expect(d.requirements[0].title).toBe('损坏数据');
  });

  // ═══ T-A5 list ═══

  it('T-A5 list：全量 / 单过滤 / AND 组合 / --status 非法 exit 1 + 只读', async () => {
    writeFlow((d) => {
      d.requirements = [
        req_('REQ-001', { status: 'draft', target_version: 'v1.3.0', owner: 'Alice' }),
        req_('REQ-002', { status: 'scheduled', target_version: 'v1.4.0', owner: 'Bob' }),
        req_('REQ-003', { status: 'scheduled', target_version: 'v1.3.0', owner: 'Alice' }),
      ];
    });
    const revBefore = readFlow().meta.revision;

    // 全量
    resetCapture();
    await safeParse(['req', 'list']);
    expect(out()).toContain('REQ-001');
    expect(out()).toContain('REQ-002');
    expect(out()).toContain('REQ-003');

    // --status
    resetCapture();
    await safeParse(['req', 'list', '--status', 'scheduled']);
    expect(out()).toContain('REQ-002');
    expect(out()).toContain('REQ-003');
    expect(out()).not.toContain('REQ-001');

    // --owner
    resetCapture();
    await safeParse(['req', 'list', '--owner', 'Alice']);
    expect(out()).toContain('REQ-001');
    expect(out()).toContain('REQ-003');
    expect(out()).not.toContain('REQ-002');

    // AND 组合：status=scheduled + target_version=v1.3.0 → REQ-003
    resetCapture();
    await safeParse(['req', 'list', '--status', 'scheduled', '--target-version', 'v1.3.0']);
    expect(out()).toContain('REQ-003');
    expect(out()).not.toContain('REQ-002');
    expect(out()).not.toContain('REQ-001');

    // 非法 status → exit 1 + 合法值提示
    resetCapture();
    await safeParse(['req', 'list', '--status', 'foo']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('非法状态过滤值');
    expect(err()).toContain('draft');

    // 只读：revision 不变
    expect(readFlow().meta.revision).toBe(revBefore);

    // 空过滤结果 → req.list.empty
    resetCapture();
    await safeParse(['req', 'list', '--owner', 'Nobody']);
    expect(out()).toContain('（无匹配需求）');
  });

  // ═══ T-A6 list --json ═══

  it('T-A6 list --json：纯单文档 / 空态 [] / 失败纯 JSON + stderr 零输出', async () => {
    writeFlow((d) => {
      d.requirements = [req_('REQ-001', { status: 'draft' })];
    });
    resetCapture();
    await safeParse(['req', 'list', '--json']);
    const obj = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(obj.schemaVersion).toBe(1);
    expect(Array.isArray(obj.requirements)).toBe(true);
    expect(obj.requirements).toHaveLength(1);
    expect(out()).not.toMatch(/\u001b\[/);    // 无 ANSI

    // 空态
    resetCapture();
    await safeParse(['req', 'list', '--owner', 'Nobody', '--json']);
    expect(JSON.parse(logMock.mock.calls[0][0] as string).requirements).toEqual([]);

    // 失败路径：invalid-argument 纯 JSON + exit 1 + stderr 零输出
    resetCapture();
    await safeParse(['req', 'list', '--status', 'foo', '--json']);
    expect(process.exitCode).toBe(1);
    const fail = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(fail.schemaVersion).toBe(1);
    expect(fail.error).toBe('invalid-argument');
    expect(fail.field).toBe('status');
    expect(fail.value).toBe('foo');
    expect(fail.allowed).toEqual(['draft', 'scheduled', 'in_progress', 'done', 'blocked', 'cancelled', 'rejected']);
    expect(errorMock).not.toHaveBeenCalled();
  });

  // ═══ T-A7 show ═══

  it('T-A7 show：详情 + 关联阶段仅 id 枚举；notFound / invalidId 两失败路径', async () => {
    writeFlow((d) => {
      d.requirements = [req_('REQ-001', { title: '我的需求', status: 'draft', target_version: 'v1.3.0', priority: 'P0', owner: 'Alice', claimed_at: '2026-02-01T00:00:00.000Z', body_path: '.openfeel/requirements/REQ-001.md' })];
      d.stages = {
        'v1.0.0-stage-01': { name: 'S1', phase: 'plan_pending', status: 'planned', deps: [], ops: {}, requirement_id: 'REQ-001' },
        'v1.0.0-stage-02': { name: 'S2', phase: 'plan_pending', status: 'planned', deps: [], ops: {} },
      };
    });
    resetCapture();
    await safeParse(['req', 'show', 'REQ-001']);
    expect(process.exitCode).toBe(0);
    expect(out()).toContain('REQ-001');
    expect(out()).toContain('我的需求');
    expect(out()).toContain('draft');
    expect(out()).toContain('v1.0.0-stage-01');
    // 仅 id 枚举：不得出现聚合 / 进度字样
    expect(out()).not.toContain('进度');
    expect(out()).not.toContain('done');

    // notFound
    resetCapture();
    await safeParse(['req', 'show', 'REQ-999']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('需求 REQ-999 不存在');

    // invalidId
    resetCapture();
    await safeParse(['req', 'show', 'foo']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('非法需求 ID');
  });

  // ═══ T-A8 show --json ═══

  it('T-A8 show --json：成功载荷 / not_found / invalid-argument 均纯 JSON + exit 非 0', async () => {
    writeFlow((d) => {
      d.requirements = [req_('REQ-001')];
      d.stages = {
        'v1.0.0-stage-01': { name: 'S1', phase: 'plan_pending', status: 'planned', deps: [], ops: {}, requirement_id: 'REQ-001' },
      };
    });
    resetCapture();
    await safeParse(['req', 'show', 'REQ-001', '--json']);
    const ok = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(ok.schemaVersion).toBe(1);
    expect(ok.requirement.id).toBe('REQ-001');
    expect(ok.stages).toEqual(['v1.0.0-stage-01']);

    // not_found
    resetCapture();
    await safeParse(['req', 'show', 'REQ-999', '--json']);
    expect(process.exitCode).toBe(1);
    const nf = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(nf.error).toBe('not_found');
    expect(nf.id).toBe('REQ-999');
    expect(errorMock).not.toHaveBeenCalled();

    // invalid-argument
    resetCapture();
    await safeParse(['req', 'show', 'foo', '--json']);
    expect(process.exitCode).toBe(1);
    const ia = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(ia.error).toBe('invalid-argument');
    expect(ia.field).toBe('id');
    expect(ia.value).toBe('foo');
    expect(errorMock).not.toHaveBeenCalled();
  });

  // ═══ T-A9 / T-A10 未初始化分流 ═══

  it('T-A9 list 未初始化分流：human errorNoInit / json no-init，均 exit 1', async () => {
    rmSync(join(tmpDir, '.openfeel', 'flow.json'), { force: true });
    rmSync(join(tmpDir, '.openfeel', 'flow.json.bak'), { force: true });

    resetCapture();
    await safeParse(['req', 'list']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('flow.json 未初始化');

    resetCapture();
    await safeParse(['req', 'list', '--json']);
    expect(process.exitCode).toBe(1);
    const obj = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(obj.schemaVersion).toBe(1);
    expect(obj.error).toBe('no-init');
  });

  it('T-A10 add 未初始化：errorNoInit + exit 1', async () => {
    rmSync(join(tmpDir, '.openfeel', 'flow.json'), { force: true });
    resetCapture();
    await safeParse(['req', 'add', 'x']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('flow.json 未初始化');
  });

  // ═══ T-A12 help 键命中（op-001 段）═══

  it('T-A12 help 键命中：description 被替换 + arg/option 键 hasKey 全真', async () => {
    applyHelpI18n(program);
    const reqCmd = program.commands.find((c) => c.name() === 'req')!;
    expect(reqCmd).toBeTruthy();
    expect(reqCmd.description()).toContain('需求管理');
    const addCmd = reqCmd.commands.find((c) => c.name() === 'add')!;
    expect(addCmd.description()).toContain('创建需求');
    const showCmd = reqCmd.commands.find((c) => c.name() === 'show')!;
    expect(showCmd.description()).toContain('查看需求详情');
    const listCmd = reqCmd.commands.find((c) => c.name() === 'list')!;
    expect(listCmd.description()).toContain('列出需求');

    const op001HelpKeys = [
      'help.req', 'help.req.add', 'help.req.add.argtitle', 'help.req.add.targetVersion', 'help.req.add.priority',
      'help.req.list', 'help.req.list.status', 'help.req.list.targetVersion', 'help.req.list.owner', 'help.req.list.json',
      'help.req.show', 'help.req.show.argid', 'help.req.show.json',
      'help.req.split', 'help.req.split.argid', 'help.req.split.into', 'help.req.split.json',
    ];
    for (const k of op001HelpKeys) {
      expect(hasKey(k, 'zh-CN')).toBe(true);
      expect(hasKey(k, 'en')).toBe(true);
    }
  });

  // ═══ 测试段 B（op-002）：写命令 ═══

  /** 写 fixture .info.json */
  function writeInfo(obj: Record<string, unknown>): void {
    writeFileSync(join(tmpDir, '.openfeel', '.info.json'), JSON.stringify(obj, null, 2) + '\n', 'utf-8');
  }

  /** 构造阶段条目 */
  function stage_(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return { name: 'S', phase: 'plan_pending', status: 'planned', deps: [], ops: {}, ...overrides };
  }

  it('T-B1 claim 成功：owner/claimed_at 落库 + 审计 + revision +1', async () => {
    writeFlow((d) => { d.requirements = [req_('REQ-001')]; });
    const before = readFlow().meta.revision;
    resetCapture();
    await safeParse(['req', 'claim', 'REQ-001', '--owner', 'Alice']);
    expect(process.exitCode).toBe(0);
    const d = readFlow();
    expect(d.meta.revision).toBe(before + 1);
    expect(d.requirements[0].owner).toBe('Alice');
    expect(typeof d.requirements[0].claimed_at).toBe('string');
    expect(d.log.some((e: any) => e.action === 'requirement_claim')).toBe(true);
    expect(out()).toContain('已认领 REQ-001');
  });

  it('T-B2 claim 四码：not_found / already_claimed / invalid_field / invalid_status（均 exit 1 零写盘）', async () => {
    // not_found
    writeFlow((d) => { d.requirements = [req_('REQ-001')]; });
    resetCapture();
    let raw = flowRaw();
    await safeParse(['req', 'claim', 'REQ-999', '--owner', 'Alice']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('需求 REQ-999 不存在');
    expect(flowRaw()).toBe(raw);

    // already_claimed（Bob 已占；Alice 再认领 → 数据零变更零审计）
    writeFlow((d) => { d.requirements = [req_('REQ-001', { owner: 'Bob', claimed_at: '2026-02-01T00:00:00.000Z' })]; });
    const logLen = readFlow().log.length;
    resetCapture();
    raw = flowRaw();
    await safeParse(['req', 'claim', 'REQ-001', '--owner', 'Alice']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('已被他人认领');
    expect(err()).toContain('openfeel req release REQ-001');
    expect(flowRaw()).toBe(raw);
    expect(readFlow().requirements[0].owner).toBe('Bob');
    expect(readFlow().log.length).toBe(logLen);

    // invalid_field（显式 --owner "" 直通引擎，零校验）
    writeFlow((d) => { d.requirements = [req_('REQ-001')]; });
    resetCapture();
    raw = flowRaw();
    await safeParse(['req', 'claim', 'REQ-001', '--owner', '']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('字段取值非法');
    expect(flowRaw()).toBe(raw);

    // invalid_status（终态需求）
    writeFlow((d) => { d.requirements = [req_('REQ-001', { status: 'done' })]; });
    resetCapture();
    raw = flowRaw();
    await safeParse(['req', 'claim', 'REQ-001', '--owner', 'Alice']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('已是终态');
    expect(err()).toContain('done');
    expect(flowRaw()).toBe(raw);
  });

  it('T-B3 claim 幂等：同 owner 二次 → exit 0 + 无审计追加 + revision 不变', async () => {
    writeFlow((d) => { d.requirements = [req_('REQ-001', { owner: 'Alice', claimed_at: '2026-02-01T00:00:00.000Z' })]; });
    const d0 = readFlow();
    resetCapture();
    await safeParse(['req', 'claim', 'REQ-001', '--owner', 'Alice']);
    expect(process.exitCode).toBe(0);
    expect(out()).toContain('no-op');
    const d1 = readFlow();
    expect(d1.meta.revision).toBe(d0.meta.revision);
    expect(d1.log.length).toBe(d0.log.length);
  });

  it('T-B4 --owner 缺省链四路径：info 命中 / git 命中 / 哨兵拒绝 / 显式不读链', async () => {
    // A：.info.json user 命中
    writeFlow((d) => { d.requirements = [req_('REQ-001')]; });
    writeInfo({ user: 'Alice', lang: 'zh-CN' });
    resetCapture();
    await safeParse(['req', 'claim', 'REQ-001']);
    expect(process.exitCode).toBe(0);
    expect(readFlow().requirements[0].owner).toBe('Alice');

    // B：.info.json 无 user + git config 命中
    writeFlow((d) => { d.requirements = [req_('REQ-001')]; });
    writeInfo({ lang: 'zh-CN' });
    mockedChild.execSync.mockReturnValue('Bob\n');
    resetCapture();
    await safeParse(['req', 'claim', 'REQ-001']);
    expect(process.exitCode).toBe(0);
    expect(readFlow().requirements[0].owner).toBe('Bob');

    // C：两源皆无（哨兵 'unknown'）→ 拒绝 + 提示显式 --owner
    writeFlow((d) => { d.requirements = [req_('REQ-001')]; });
    writeInfo({ lang: 'zh-CN' });
    mockedChild.execSync.mockImplementation(() => { throw new Error('no git'); });
    resetCapture();
    let raw = flowRaw();
    await safeParse(['req', 'claim', 'REQ-001']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('无法解析当前用户名');
    expect(err()).toContain('--owner');
    expect(flowRaw()).toBe(raw);
    expect(readFlow().requirements[0].owner).toBeUndefined();

    // D：显式 --owner 不读链
    writeFlow((d) => { d.requirements = [req_('REQ-001')]; });
    resetCapture();
    await safeParse(['req', 'claim', 'REQ-001', '--owner', 'Carol']);
    expect(process.exitCode).toBe(0);
    expect(readFlow().requirements[0].owner).toBe('Carol');
  });

  it('T-B5 release：占用 → 解除 + 审计；未占用 → no-op exit 0 revision 不变', async () => {
    writeFlow((d) => { d.requirements = [req_('REQ-001', { owner: 'Alice', claimed_at: '2026-02-01T00:00:00.000Z' })]; });
    const before = readFlow().meta.revision;
    resetCapture();
    await safeParse(['req', 'release', 'REQ-001']);
    expect(process.exitCode).toBe(0);
    const d = readFlow();
    expect(d.meta.revision).toBe(before + 1);
    expect(d.requirements[0].owner).toBeUndefined();
    expect(d.requirements[0].claimed_at).toBeUndefined();
    expect(d.log.some((e: any) => e.action === 'requirement_release')).toBe(true);
    expect(out()).toContain('已释放 REQ-001');

    // 未占用 → no-op
    writeFlow((d2) => { d2.requirements = [req_('REQ-002')]; });
    const rev = readFlow().meta.revision;
    resetCapture();
    await safeParse(['req', 'release', 'REQ-002']);
    expect(process.exitCode).toBe(0);
    expect(out()).toContain('no-op');
    expect(readFlow().meta.revision).toBe(rev);
  });

  it('T-B6 set：字段更新 / 合法流转 / 无字段 / 非法值 / 非法流转 / 同值 no-op', async () => {
    // 多字段更新
    writeFlow((d) => { d.requirements = [req_('REQ-001')]; });
    const before = readFlow().meta.revision;
    resetCapture();
    await safeParse(['req', 'set', 'REQ-001', '--title', '新标题', '--target-version', 'v1.4.0', '--priority', 'P2']);
    expect(process.exitCode).toBe(0);
    let d = readFlow();
    expect(d.meta.revision).toBe(before + 1);
    expect(d.requirements[0].title).toBe('新标题');
    expect(d.requirements[0].target_version).toBe('v1.4.0');
    expect(d.requirements[0].priority).toBe('P2');
    expect(d.log.some((e: any) => e.action === 'requirement_update')).toBe(true);

    // 合法流转 draft→scheduled
    writeFlow((d2) => { d2.requirements = [req_('REQ-001')]; });
    resetCapture();
    await safeParse(['req', 'set', 'REQ-001', '--status', 'scheduled']);
    expect(process.exitCode).toBe(0);
    expect(readFlow().requirements[0].status).toBe('scheduled');

    // 无字段 → noFields exit 1
    writeFlow((d3) => { d3.requirements = [req_('REQ-001')]; });
    resetCapture();
    let raw = flowRaw();
    await safeParse(['req', 'set', 'REQ-001']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('未提供任何字段');
    expect(flowRaw()).toBe(raw);

    // 非法值 --priority P9 → invalidField exit 1 零写盘
    resetCapture();
    raw = flowRaw();
    await safeParse(['req', 'set', 'REQ-001', '--priority', 'P9']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('字段取值非法');
    expect(flowRaw()).toBe(raw);

    // 非法流转 draft→done → invalidStatus exit 1 零写盘 + 文案含引擎 targets
    resetCapture();
    raw = flowRaw();
    await safeParse(['req', 'set', 'REQ-001', '--status', 'done']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('被拒');
    expect(err()).toContain(getAllowedNextStatuses('draft').join(', '));
    expect(flowRaw()).toBe(raw);

    // 同值 --status draft → exit 0 无写盘
    const rev = readFlow().meta.revision;
    resetCapture();
    await safeParse(['req', 'set', 'REQ-001', '--status', 'draft']);
    expect(process.exitCode).toBe(0);
    expect(out()).toContain('no-op');
    expect(readFlow().meta.revision).toBe(rev);
  });

  it('T-B7 set/advance 零校验证据：--status foo / --to foo 的 targets = 引擎导出派生', async () => {
    writeFlow((d) => { d.requirements = [req_('REQ-001', { status: 'draft' })]; });
    const expectedTargets = getAllowedNextStatuses('draft').join(', ');

    resetCapture();
    await safeParse(['req', 'set', 'REQ-001', '--status', 'foo']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('目标状态 foo 被拒');
    expect(err()).toContain(`合法目标：${expectedTargets}`);

    resetCapture();
    await safeParse(['req', 'advance', 'REQ-001', '--to', 'foo']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('目标状态 foo 被拒');
    expect(err()).toContain(`合法目标：${expectedTargets}`);
  });

  it('T-B8 link：两径归一 / --unlink / already_linked / stage_not_found / not_found / invalid_status / 互斥 / 幂等', async () => {
    const seed = (d: any): void => {
      d.requirements = [
        req_('REQ-001'),
        req_('REQ-002'),
        req_('REQ-003', { status: 'done' }),
      ];
      d.stages = {
        'v1.0.0-stage-01': stage_(),
        'v1.0.0-stage-02': stage_(),
      };
    };

    // 短名归一
    writeFlow(seed);
    resetCapture();
    await safeParse(['req', 'link', '--stage', 'stage-01', '--requirement', 'REQ-001']);
    expect(process.exitCode).toBe(0);
    let d = readFlow();
    expect(d.stages['v1.0.0-stage-01'].requirement_id).toBe('REQ-001');
    expect(d.log.some((e: any) => e.action === 'requirement_link')).toBe(true);
    expect(out()).toContain('已将 v1.0.0-stage-01 关联到 REQ-001');

    // 同值幂等（全名径）
    const rev = d.meta.revision;
    resetCapture();
    await safeParse(['req', 'link', '--stage', 'v1.0.0-stage-01', '--requirement', 'REQ-001']);
    expect(process.exitCode).toBe(0);
    expect(out()).toContain('no-op');
    expect(readFlow().meta.revision).toBe(rev);

    // already_linked 硬拒 + 完整解绑命令提示
    resetCapture();
    let raw = flowRaw();
    await safeParse(['req', 'link', '--stage', 'stage-01', '--requirement', 'REQ-002']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('须先解绑');
    expect(err()).toContain('openfeel req link --stage v1.0.0-stage-01 --unlink');
    expect(flowRaw()).toBe(raw);

    // --unlink 解绑
    resetCapture();
    await safeParse(['req', 'link', '--stage', 'stage-01', '--unlink']);
    expect(process.exitCode).toBe(0);
    expect(readFlow().stages['v1.0.0-stage-01'].requirement_id).toBeNull();

    // 未关联解绑 → no-op exit 0
    resetCapture();
    await safeParse(['req', 'link', '--stage', 'stage-02', '--unlink']);
    expect(process.exitCode).toBe(0);
    expect(out()).toContain('no-op');

    // stage_not_found
    resetCapture();
    raw = flowRaw();
    await safeParse(['req', 'link', '--stage', 'v9.9.9-stage-99', '--requirement', 'REQ-001']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('阶段 v9.9.9-stage-99 不存在');
    expect(flowRaw()).toBe(raw);

    // not_found
    resetCapture();
    await safeParse(['req', 'link', '--stage', 'stage-02', '--requirement', 'REQ-999']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('需求 REQ-999 不存在');

    // invalid_status（终态需求）
    resetCapture();
    await safeParse(['req', 'link', '--stage', 'stage-02', '--requirement', 'REQ-003']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('已是终态');

    // 互斥守卫：neither / both
    resetCapture();
    await safeParse(['req', 'link', '--stage', 'stage-02']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('必须且只能提供一个');

    resetCapture();
    await safeParse(['req', 'link', '--stage', 'stage-02', '--requirement', 'REQ-001', '--unlink']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('必须且只能提供一个');
  });

  it('T-B9 advance：合法目标全表 + done 门两态 + 同值 no-op + 终态拒绝', async () => {
    const seed = (from: string, stages: Record<string, unknown> = {}): void => {
      writeFlow((d) => {
        d.requirements = [req_('REQ-001', { status: from })];
        d.stages = stages as any;
      });
    };

    // draft→scheduled
    seed('draft');
    resetCapture();
    await safeParse(['req', 'advance', 'REQ-001', '--to', 'scheduled']);
    expect(process.exitCode).toBe(0);
    expect(readFlow().requirements[0].status).toBe('scheduled');
    expect(out()).toContain('已推进 REQ-001：draft → scheduled');

    // scheduled→in_progress
    seed('scheduled');
    resetCapture();
    await safeParse(['req', 'advance', 'REQ-001', '--to', 'in_progress']);
    expect(process.exitCode).toBe(0);
    expect(readFlow().requirements[0].status).toBe('in_progress');

    // blocked 两出口
    seed('blocked');
    resetCapture();
    await safeParse(['req', 'advance', 'REQ-001', '--to', 'scheduled']);
    expect(readFlow().requirements[0].status).toBe('scheduled');

    seed('blocked');
    resetCapture();
    await safeParse(['req', 'advance', 'REQ-001', '--to', 'in_progress']);
    expect(readFlow().requirements[0].status).toBe('in_progress');

    // draft→blocked（非终态任意 → blocked）
    seed('draft');
    resetCapture();
    await safeParse(['req', 'advance', 'REQ-001', '--to', 'blocked']);
    expect(readFlow().requirements[0].status).toBe('blocked');

    // --to done 未全 done → exit 1 文案含 targets
    seed('in_progress', { 'v1.0.0-stage-01': stage_({ requirement_id: 'REQ-001', phase: 'plan_pending' }) });
    resetCapture();
    let raw = flowRaw();
    await safeParse(['req', 'advance', 'REQ-001', '--to', 'done']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain(`合法目标：${getAllowedNextStatuses('in_progress').join(', ')}`);
    expect(flowRaw()).toBe(raw);

    // 全 done → 成功 + 审计 requirement_status
    seed('in_progress', { 'v1.0.0-stage-01': stage_({ requirement_id: 'REQ-001', phase: 'done' }) });
    resetCapture();
    await safeParse(['req', 'advance', 'REQ-001', '--to', 'done']);
    expect(process.exitCode).toBe(0);
    let d = readFlow();
    expect(d.requirements[0].status).toBe('done');
    expect(d.log.some((e: any) => e.action === 'requirement_status')).toBe(true);

    // 同值 → no-op exit 0
    seed('scheduled');
    const rev = readFlow().meta.revision;
    resetCapture();
    await safeParse(['req', 'advance', 'REQ-001', '--to', 'scheduled']);
    expect(process.exitCode).toBe(0);
    expect(out()).toContain('no-op');
    expect(readFlow().meta.revision).toBe(rev);

    // 终态 → exit 1
    seed('done');
    resetCapture();
    raw = flowRaw();
    await safeParse(['req', 'advance', 'REQ-001', '--to', 'scheduled']);
    expect(process.exitCode).toBe(1);
    expect(flowRaw()).toBe(raw);
  });

  it('T-B10 退出码矩阵 0/1/2：并发冲突 exit 2 + 零写盘', async () => {
    // 成功 0
    writeFlow((d) => { d.requirements = [req_('REQ-001')]; });
    resetCapture();
    await safeParse(['req', 'claim', 'REQ-001', '--owner', 'Alice']);
    expect(process.exitCode).toBe(0);

    // 失败 1
    resetCapture();
    await safeParse(['req', 'claim', 'REQ-999', '--owner', 'Alice']);
    expect(process.exitCode).toBe(1);

    // 并发 2
    writeFlow((d) => { d.requirements = [req_('REQ-002')]; });
    const raw = flowRaw();
    const saveSpy = vi.spyOn(FlowManager.prototype, 'save').mockImplementationOnce(() => {
      throw new FlowConcurrentModificationError(1, 2);
    });
    resetCapture();
    await safeParse(['req', 'claim', 'REQ-002', '--owner', 'Alice']);
    expect(exitMock).toHaveBeenCalledWith(2);
    expect(err()).toContain('并发冲突');
    expect(flowRaw()).toBe(raw);
    saveSpy.mockRestore();
  });

  it('T-B11 写命令无 --json（边界）：commander 未知选项报错，无 JSON 输出', async () => {
    writeFlow((d) => { d.requirements = [req_('REQ-001')]; });
    resetCapture();
    let threw: unknown = null;
    try {
      await program.parseAsync(['req', 'claim', 'REQ-001', '--json'], { from: 'user' });
    } catch (e) {
      threw = e;
    }
    expect(threw).toBeInstanceOf(CommanderError);
    expect(out()).not.toContain('schemaVersion');
  });

  // ═══ 测试段 C（op-003）：board / next / help 全覆盖 / 正交 ═══

  it('T-C1 board：7 组固定顺序 + 恒含空组；--target-version 过滤；--json 7 键；no-init 分流', async () => {
    writeFlow((d) => {
      d.requirements = [
        req_('REQ-001', { status: 'draft', target_version: 'v1.3.0' }),
        req_('REQ-002', { status: 'scheduled', target_version: 'v1.3.0' }),
        req_('REQ-003', { status: 'done', target_version: 'v1.4.0' }),
      ];
    });
    resetCapture();
    await safeParse(['req', 'board']);
    expect(process.exitCode).toBe(0);
    const text = out();
    for (const s of REQ_STATUSES) {
      expect(text).toContain(`${s}（`);
    }
    // 固定顺序：draft 组行先于 scheduled 组行
    expect(text.indexOf('draft（')).toBeLessThan(text.indexOf('scheduled（'));

    // --target-version 过滤
    resetCapture();
    await safeParse(['req', 'board', '--target-version', 'v1.4.0']);
    const filtered = out();
    expect(filtered).toContain('done（1）');
    expect(filtered).toContain('draft（0）');

    // --json：groups 恒 7 键 + 空组 []
    resetCapture();
    await safeParse(['req', 'board', '--json']);
    const obj = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(obj.schemaVersion).toBe(1);
    expect(Object.keys(obj.groups)).toEqual([...REQ_STATUSES]);
    expect(obj.groups.rejected).toEqual([]);
    expect(obj.groups.draft).toHaveLength(1);
    expect(out()).not.toMatch(/\u001b\[/);

    // no-init 分流
    rmSync(join(tmpDir, '.openfeel', 'flow.json'), { force: true });
    resetCapture();
    await safeParse(['req', 'board']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('flow.json 未初始化');

    resetCapture();
    await safeParse(['req', 'board', '--json']);
    expect(process.exitCode).toBe(1);
    expect(JSON.parse(logMock.mock.calls[0][0] as string).error).toBe('no-init');
  });

  it('T-C2 next：排序 / 筛选 / --owner 扩候选 / 空态 / --json / no-init', async () => {
    // 排序：target_version 升序 + 未指定最后 + created_at 兜底
    writeFlow((d) => {
      d.requirements = [
        req_('REQ-010', { status: 'scheduled', target_version: 'v1.3.0', created_at: '2026-01-02T00:00:00.000Z' }),
        req_('REQ-011', { status: 'scheduled', target_version: 'v1.3.0', created_at: '2026-01-01T00:00:00.000Z' }),
        req_('REQ-012', { status: 'scheduled', created_at: '2026-01-01T00:00:00.000Z' }),
      ];
    });
    resetCapture();
    await safeParse(['req', 'next']);
    expect(process.exitCode).toBe(0);
    expect(out()).toContain('下一项：REQ-011');

    // id 兜底（同 target_version / 同 created_at）
    writeFlow((d) => {
      d.requirements = [
        req_('REQ-021', { status: 'scheduled', target_version: 'v1.3.0', created_at: '2026-01-01T00:00:00.000Z' }),
        req_('REQ-020', { status: 'scheduled', target_version: 'v1.3.0', created_at: '2026-01-01T00:00:00.000Z' }),
      ];
    });
    resetCapture();
    await safeParse(['req', 'next']);
    expect(out()).toContain('下一项：REQ-020');

    // 筛选：已认领默认排除
    writeFlow((d) => {
      d.requirements = [
        req_('REQ-001', { status: 'scheduled', target_version: 'v1.4.0' }),
        req_('REQ-002', { status: 'scheduled', target_version: 'v1.3.0', owner: 'Alice' }),
        req_('REQ-003', { status: 'draft', target_version: 'v1.0.0' }),
      ];
    });
    resetCapture();
    await safeParse(['req', 'next']);
    expect(out()).toContain('下一项：REQ-001');

    // --owner 扩候选（含该 owner 已认领的 scheduled）
    resetCapture();
    await safeParse(['req', 'next', '--owner', 'Alice']);
    expect(out()).toContain('下一项：REQ-002');
    expect(out()).toContain('已认领：Alice');

    // 空态
    writeFlow((d) => { d.requirements = [req_('REQ-001', { status: 'draft' })]; });
    resetCapture();
    await safeParse(['req', 'next']);
    expect(out()).toContain('（无可接取需求）');

    resetCapture();
    await safeParse(['req', 'next', '--json']);
    const nil = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(nil.schemaVersion).toBe(1);
    expect(nil.requirement).toBeNull();

    // --json 有值载荷
    writeFlow((d) => { d.requirements = [req_('REQ-001', { status: 'scheduled', target_version: 'v1.3.0' })]; });
    resetCapture();
    await safeParse(['req', 'next', '--json']);
    const ok = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(ok.requirement.id).toBe('REQ-001');

    // no-init
    rmSync(join(tmpDir, '.openfeel', 'flow.json'), { force: true });
    resetCapture();
    await safeParse(['req', 'next']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('flow.json 未初始化');
  });

  it('T-C3 help 键双向逐键断言（44 键）：正向 hasKey + 反向命令树 ⊆ 期望 + applyHelpI18n 生效', async () => {
    const EXPECTED = [
      'help.req',
      'help.req.add', 'help.req.add.argtitle', 'help.req.add.targetVersion', 'help.req.add.priority', 'help.req.add.workflowMode',
      'help.req.list', 'help.req.list.status', 'help.req.list.targetVersion', 'help.req.list.owner', 'help.req.list.json',
      'help.req.show', 'help.req.show.argid', 'help.req.show.json',
      'help.req.claim', 'help.req.claim.argid', 'help.req.claim.owner',
      'help.req.release', 'help.req.release.argid',
      'help.req.set', 'help.req.set.argid', 'help.req.set.status', 'help.req.set.title', 'help.req.set.targetVersion', 'help.req.set.priority', 'help.req.set.workflowMode',
      'help.req.link', 'help.req.link.stage', 'help.req.link.requirement', 'help.req.link.unlink',
      'help.req.advance', 'help.req.advance.argid', 'help.req.advance.to',
      'help.req.board', 'help.req.board.targetVersion', 'help.req.board.json',
      'help.req.next', 'help.req.next.owner', 'help.req.next.json', 'help.req.next.limit',
      'help.req.split', 'help.req.split.argid', 'help.req.split.into', 'help.req.split.json',
    ];
    expect(EXPECTED).toHaveLength(44);

    // ① 正向：zh / en 双侧 hasKey
    for (const k of EXPECTED) {
      expect(hasKey(k, 'zh-CN'), k).toBe(true);
      expect(hasKey(k, 'en'), k).toBe(true);
    }

    // ② 反向：命令树生成键 ⊆ 期望（双向锁）
    const toCamel = (flag: string): string =>
      flag.replace(/^--?/, '').replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
    const actual: string[] = [];
    const walk = (cmd: Command, path: string[]): void => {
      const prefix = 'help.' + path.join('.');
      if (cmd.description()) { actual.push(prefix); }
      for (const arg of cmd.registeredArguments ?? []) { actual.push(`${prefix}.arg${arg.name()}`); }
      for (const opt of cmd.options) {
        if ((opt as { negate?: boolean }).negate) { continue; }
        const flag = opt.long || opt.short;
        if (!flag) { continue; }
        actual.push(`${prefix}.${toCamel(flag)}`);
      }
      for (const sub of cmd.commands) { walk(sub, [...path, sub.name()]); }
    };
    const reqCmd = program.commands.find((c) => c.name() === 'req')!;
    walk(reqCmd, ['req']);
    for (const k of actual) {
      expect(EXPECTED, `命令树生成键未登记: ${k}`).toContain(k);
    }
    expect(new Set(actual).size).toBe(EXPECTED.length);

    // ③ applyHelpI18n 生效：description === t(键) 且 ≠ 原占位（子命令逐个）
    applyHelpI18n(program);
    const check = (path: string[], cmd: Command): void => {
      expect(cmd.description()).toBe(t('help.' + path.join('.'), 'zh-CN'));
      expect(cmd.description()).not.toBe('');
    };
    check(['req'], reqCmd);
    for (const sub of reqCmd.commands) {
      check(['req', sub.name()], sub);
    }
  });

  it('T-C4 既有命令零破坏：cli/index.ts 仅两行 + 顶层命令组共 17 个（含 req）', () => {
    const cliSrc = readFileSync(new URL('../../src/cli/index.ts', import.meta.url), 'utf-8');
    // 仅两行（import + register）→ 该标识符恰出现 2 次
    expect(cliSrc.split('registerReqCommand').length - 1).toBe(2);
    const names = rootProgram.commands.map((c) => c.name());
    for (const old of ['init', 'flow', 'plan', 'view', 'archive', 'roadmap', 'instructions', 'update',
      'knowledge', 'stage', 'project', 'config', 'lint', 'migrate', 'model', 'setup']) {
      expect(names, `既有命令组缺失: ${old}`).toContain(old);
    }
    expect(names).toContain('req');
    expect(rootProgram.commands.length).toBe(17);
  });

  it('T-C5′ 越界静态断言（stage-90 supersede）：7 禁止串零命中 + 7 正控命中', () => {
    const src = readFileSync(new URL('../../src/commands/req.ts', import.meta.url), 'utf-8');
    expect(src.length).toBeGreaterThan(0);
    const FORBIDDEN = [
      'ALLOWED_TRANSITIONS', 'resolveStageWorkflowMode', 'getValidTargets', 'flow-archive',
      '.phase', 'allLinkedStagesDone', 'padStart',
    ];
    expect(FORBIDDEN.length).toBe(7);
    for (const n of FORBIDDEN) {
      expect(src.includes(n), `禁止串命中: ${n}`).toBe(false);
    }
    const POSITIVE = [
      'getAllowedNextStatuses', 'REQ_STATUSES', 'REQ_ID_PATTERN',
      'linkRequirement', 'writeRequirementBodySkeleton', 'listRequirements',
      '--workflow-mode',
    ];
    expect(POSITIVE.length).toBe(7);
    for (const n of POSITIVE) {
      expect(src).toContain(n);
    }
  });
});

// ═══════════════════════════════════════
// stage-87 op-001：req split / req show 父子展示 / 零回归 golden
// ═══════════════════════════════════════
describe('stage-87 op-001 拆分与父子展示', () => {
  let tmpDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;
  let prevExitCode: number | string | undefined;

  beforeEach(async () => {
    mockHome.dir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-split-home-'));
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-split-test-'));
    mockedChild.execSync.mockReset();
    mockedChild.execFileSync.mockReset();
    await initProject(tmpDir);

    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    prevExitCode = process.exitCode;
    process.exitCode = 0;

    program = new Command();
    program.exitOverride();
    registerReqCommand(program);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(mockHome.dir, { recursive: true, force: true });
    logMock.mockRestore();
    errorMock.mockRestore();
    cwdMock.mockRestore();
    exitMock.mockRestore();
    process.exitCode = prevExitCode;

    const realRaw = existsSync(REAL_FLOW_PATH) ? readFileSync(REAL_FLOW_PATH, 'utf-8') : null;
    expect(realRaw).toBe(REAL_FLOW_RAW);
    expect(existsSync(REAL_REQ_DIR)).toBe(false);
  });

  async function safeParse(args: string[]): Promise<void> {
    try {
      await program.parseAsync(args, { from: 'user' });
    } catch (err) {
      if (!(err instanceof CommanderError)) { throw err; }
    }
  }

  function out(): string { return logMock.mock.calls.map((c) => c[0] as string).join('\n'); }
  function err(): string { return errorMock.mock.calls.map((c) => c[0] as string).join('\n'); }
  function resetCapture(): void { logMock.mockClear(); errorMock.mockClear(); process.exitCode = 0; }
  function readFlow(): any { return JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8')); }
  function flowRaw(): string { return readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'); }
  function writeFlow(mutate: (d: any) => void): void {
    const d = readFlow();
    mutate(d);
    writeFileSync(join(tmpDir, '.openfeel', 'flow.json'), JSON.stringify(d, null, 2) + '\n', 'utf-8');
  }
  function req_(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id,
      title: `需求 ${id}`,
      status: 'draft',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  // ═══ T-D1 split 成功（human）═══

  it('T-D1 split 成功：落库 3 条 + parent_id + scheduled + 两正文骨架 + 审计 + revision +1 + 父零副作用', async () => {
    writeFlow((d) => { d.requirements = [req_('REQ-001')]; });
    const revBefore = readFlow().meta.revision;
    const parentBefore = { ...readFlow().requirements[0] };

    resetCapture();
    await safeParse(['req', 'split', 'REQ-001', '--into', 'A', '--into', 'B']);

    expect(process.exitCode).toBe(0);
    const d = readFlow();
    expect(d.meta.revision).toBe(revBefore + 1);
    expect(d.requirements).toHaveLength(3);
    expect(d.requirements[1].id).toBe('REQ-002');
    expect(d.requirements[2].id).toBe('REQ-003');
    for (const c of [d.requirements[1], d.requirements[2]]) {
      expect(c.parent_id).toBe('REQ-001');
      expect(c.status).toBe('scheduled');
      expect(c.body_path).toBe(`.openfeel/requirements/${c.id}.md`);
    }
    // 父零副作用（逐字不变）
    expect(d.requirements[0]).toEqual(parentBefore);
    // 审计
    const splitLogs = d.log.filter((e: any) => e.action === 'requirement_split');
    expect(splitLogs).toHaveLength(1);
    expect(splitLogs[0].detail.children).toEqual(['REQ-002', 'REQ-003']);
    // 两正文骨架文件
    const body1 = join(tmpDir, '.openfeel', 'requirements', 'REQ-002.md');
    const body2 = join(tmpDir, '.openfeel', 'requirements', 'REQ-003.md');
    expect(existsSync(body1)).toBe(true);
    expect(existsSync(body2)).toBe(true);
    expect(readFileSync(body1, 'utf-8')).toContain('## 父需求\n\nREQ-001');
    // 输出
    expect(out()).toContain('REQ-002');
    expect(out()).toContain('REQ-003');
  });

  // ═══ T-D2 split --json 成功（单文档 / stderr 零输出）═══

  it('T-D2 split --json 成功：单文档 { schemaVersion, parent, children } + 元素含 body_path + stderr 零输出', async () => {
    writeFlow((d) => { d.requirements = [req_('REQ-001')]; });
    resetCapture();
    await safeParse(['req', 'split', 'REQ-001', '--into', 'A', '--into', 'B', '--json']);

    expect(process.exitCode).toBe(0);
    expect(logMock.mock.calls.length).toBe(1);                    // stdout 纯单文档
    const obj = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(obj.schemaVersion).toBe(1);
    expect(obj.parent).toBe('REQ-001');
    expect(obj.children).toHaveLength(2);
    expect(obj.children[0].id).toBe('REQ-002');
    expect(obj.children[0].body_path).toBe('.openfeel/requirements/REQ-002.md');
    expect(err()).toBe('');
  });

  // ═══ T-D3 失败分流零写盘（四径 × human / --json）═══

  it('T-D3 失败四径：human exit 1 + 文案 + 零写盘；--json 纯 JSON error 码 + stderr 零输出', async () => {
    const cases: Array<{ args: string[]; setup?: () => void; code: string; humanMsg: string }> = [
      { args: ['req', 'split', 'REQ-001'], code: 'invalid-argument', humanMsg: '未提供 --into' },
      { args: ['req', 'split', 'REQ-999', '--into', 'A'], code: 'not_found', humanMsg: '需求 REQ-999 不存在' },
      {
        args: ['req', 'split', 'REQ-001', '--into', 'A'],
        setup: () => { writeFlow((dd) => { dd.requirements = [req_('REQ-001', { status: 'done' })]; }); },
        code: 'invalid_status',
        humanMsg: '已是终态',
      },
      { args: ['req', 'split', 'REQ-001', '--into', '   '], code: 'invalid_field', humanMsg: '子需求取值非法' },
    ];

    for (const c of cases) {
      // human 径
      writeFlow((d) => { d.requirements = [req_('REQ-001')]; });
      c.setup?.();
      resetCapture();
      const raw = flowRaw();
      await safeParse(c.args);
      expect(process.exitCode, c.code).toBe(1);
      expect(err()).toContain(c.humanMsg);
      expect(flowRaw()).toBe(raw);                                 // 零写盘
      expect(logMock.mock.calls.length).toBe(0);

      // --json 径
      resetCapture();
      const raw2 = flowRaw();
      await safeParse([...c.args, '--json']);
      expect(process.exitCode, c.code).toBe(1);
      expect(logMock.mock.calls.length).toBe(1);
      const obj = JSON.parse(logMock.mock.calls[0][0] as string);
      expect(obj.schemaVersion).toBe(1);
      expect(obj.error).toBe(c.code);
      expect(err()).toBe('');                                      // stderr 零输出
      expect(flowRaw()).toBe(raw2);
    }
  });

  // ═══ T-D4 并发冲突 exit 2（契约边界：走统一 stderr 出口）═══

  it('T-D4 split 并发冲突：exit 2 + 并发文案 + flow.json 逐字不变', async () => {
    writeFlow((d) => { d.requirements = [req_('REQ-001')]; });
    const raw = flowRaw();
    const saveSpy = vi.spyOn(FlowManager.prototype, 'save').mockImplementationOnce(() => {
      throw new FlowConcurrentModificationError(1, 2);
    });
    resetCapture();
    await safeParse(['req', 'split', 'REQ-001', '--into', 'A']);
    expect(exitMock).toHaveBeenCalledWith(2);
    expect(err()).toContain('并发冲突');
    expect(flowRaw()).toBe(raw);
    saveSpy.mockRestore();
  });

  // ═══ T-D5 show 父子展示（human + --json 只增不改）═══

  it('T-D5 show 父子：父视图 / 子视图 human 插入式 + --json 新键追加在既有三键之后', async () => {
    writeFlow((d) => { d.requirements = [req_('REQ-001')]; });
    resetCapture();
    await safeParse(['req', 'split', 'REQ-001', '--into', 'A', '--into', 'B']);
    expect(process.exitCode).toBe(0);

    // 父视图
    resetCapture();
    await safeParse(['req', 'show', 'REQ-001']);
    expect(process.exitCode).toBe(0);
    expect(out()).toContain('父需求: （无）');
    expect(out()).toContain('子需求:');
    expect(out()).toContain('  - REQ-002 [scheduled] A');
    expect(out()).toContain('  - REQ-003 [scheduled] B');

    // 子视图
    resetCapture();
    await safeParse(['req', 'show', 'REQ-002']);
    expect(out()).toContain('父需求: REQ-001');
    expect(out()).toContain('子需求: （无）');
    expect(out()).not.toContain('  - REQ-002 [scheduled] A');

    // --json 只增不改
    resetCapture();
    await safeParse(['req', 'show', 'REQ-001', '--json']);
    const obj = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(Object.keys(obj)).toEqual(['schemaVersion', 'requirement', 'stages', 'parent', 'children']);
    expect(obj.schemaVersion).toBe(1);
    expect(obj.requirement.id).toBe('REQ-001');
    expect(Array.isArray(obj.stages)).toBe(true);
    expect(obj.parent).toBeNull();
    expect(obj.children).toEqual(['REQ-002', 'REQ-003']);
    expect(err()).toBe('');
  });

  // ═══ T-D6 悬空 parent_id（REV-87-004①）═══

  it('T-D6 悬空 parent_id：原样回显、不报错、exit 0', async () => {
    writeFlow((d) => { d.requirements = [req_('REQ-001', { parent_id: 'REQ-999' })]; });
    resetCapture();
    await safeParse(['req', 'show', 'REQ-001']);
    expect(process.exitCode).toBe(0);
    expect(out()).toContain('REQ-999');
    expect(err()).toBe('');
  });

  // ═══ T-D7 零回归取证（golden 内联 + 正控）═══

  it('T-D7 零回归 golden：add 逐字 + show（无父无子）逐字 + 正控 + 二次执行一致', async () => {
    // ① req add（未受影响写命令）
    resetCapture();
    await safeParse(['req', 'add', '金标准']);
    expect(process.exitCode).toBe(0);
    const addGolden = [
      '已创建 REQ-001：金标准（状态 draft）',
      `正文骨架：${join(tmpDir, '.openfeel', 'requirements', 'REQ-001.md')}`,
    ].join('\n');
    expect(out()).toBe(addGolden);

    // ② req show（无父无子）—— 含新增两行（有意增量 golden）
    writeFlow((d) => { d.requirements = [req_('REQ-001')]; });
    resetCapture();
    await safeParse(['req', 'show', 'REQ-001']);
    const showGolden = [
      'REQ-001：需求 REQ-001',
      '状态: draft ｜ 预估版本: (无) ｜ 优先级: (无)',
      '认领人: （无）',
      '创建: 2026-01-01T00:00:00.000Z ｜ 更新: 2026-01-01T00:00:00.000Z',
      '正文: (无)',
      '父需求: （无）',
      '子需求: （无）',
      '关联阶段: （无）',
    ].join('\n');
    expect(out()).toBe(showGolden);

    // ③ 正控：golden 非空 + 唯一哨兵 + 二次执行逐字相同
    expect(addGolden.length).toBeGreaterThan(0);
    expect(showGolden.length).toBeGreaterThan(0);
    expect(addGolden).toContain('已创建 REQ-001');
    expect(showGolden).toContain('创建: ');
    resetCapture();
    await safeParse(['req', 'show', 'REQ-001']);
    expect(out()).toBe(showGolden);
  });
});

// ═══════════════════════════════════════
// stage-87 op-002：接取视图（next --limit / board owner 后缀）与并行接取
// ═══════════════════════════════════════
describe('stage-87 op-002 接取视图与并行接取', () => {
  let tmpDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;
  let prevExitCode: number | string | undefined;

  beforeEach(async () => {
    mockHome.dir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-next-home-'));
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-next-test-'));
    mockedChild.execSync.mockReset();
    mockedChild.execFileSync.mockReset();
    await initProject(tmpDir);

    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    prevExitCode = process.exitCode;
    process.exitCode = 0;

    program = new Command();
    program.exitOverride();
    registerReqCommand(program);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(mockHome.dir, { recursive: true, force: true });
    logMock.mockRestore();
    errorMock.mockRestore();
    cwdMock.mockRestore();
    process.exitCode = prevExitCode;

    const realRaw = existsSync(REAL_FLOW_PATH) ? readFileSync(REAL_FLOW_PATH, 'utf-8') : null;
    expect(realRaw).toBe(REAL_FLOW_RAW);
    expect(existsSync(REAL_REQ_DIR)).toBe(false);
  });

  async function safeParse(args: string[]): Promise<void> {
    try {
      await program.parseAsync(args, { from: 'user' });
    } catch (err) {
      if (!(err instanceof CommanderError)) { throw err; }
    }
  }

  function out(): string { return logMock.mock.calls.map((c) => c[0] as string).join('\n'); }
  function err(): string { return errorMock.mock.calls.map((c) => c[0] as string).join('\n'); }
  function resetCapture(): void { logMock.mockClear(); errorMock.mockClear(); process.exitCode = 0; }
  function readFlow(): any { return JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8')); }
  function flowRaw(): string { return readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'); }
  function writeFlow(mutate: (d: any) => void): void {
    const d = readFlow();
    mutate(d);
    writeFileSync(join(tmpDir, '.openfeel', 'flow.json'), JSON.stringify(d, null, 2) + '\n', 'utf-8');
  }
  function req_(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id,
      title: `需求 ${id}`,
      status: 'draft',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }

  // ═══ T-E1 端到端并行接取 ═══

  it('T-E1 端到端并行接取：split 父（2 子）→ 两 owner 各 claim → revision +2 → next 双视角', async () => {
    writeFlow((d) => { d.requirements = [req_('REQ-001')]; });
    resetCapture();
    await safeParse(['req', 'split', 'REQ-001', '--into', 'A', '--into', 'B']);
    expect(process.exitCode).toBe(0);
    const revAfterSplit = readFlow().meta.revision;

    resetCapture();
    await safeParse(['req', 'claim', 'REQ-002', '--owner', 'Alice']);
    expect(process.exitCode).toBe(0);
    resetCapture();
    await safeParse(['req', 'claim', 'REQ-003', '--owner', 'Bob']);
    expect(process.exitCode).toBe(0);

    const d = readFlow();
    expect(d.meta.revision).toBe(revAfterSplit + 2);              // 两写命令各 +1
    expect(d.requirements.find((r: any) => r.id === 'REQ-002').owner).toBe('Alice');
    expect(d.requirements.find((r: any) => r.id === 'REQ-003').owner).toBe('Bob');
    expect(d.log.filter((e: any) => e.action === 'requirement_claim')).toHaveLength(2);

    // --owner Alice 视角 → REQ-002 在候选
    resetCapture();
    await safeParse(['req', 'next', '--owner', 'Alice']);
    expect(process.exitCode).toBe(0);
    expect(out()).toContain('REQ-002');

    // 无 --owner → 两子均已认领 → 空态
    resetCapture();
    await safeParse(['req', 'next']);
    expect(out()).toBe('（无可接取需求）');
  });

  // ═══ T-E2 board owner 后缀 ═══

  it('T-E2 board owner 后缀：有 owner 追加后缀、无 owner 逐字；--json groups 键集与值逐字', async () => {
    writeFlow((d) => {
      d.requirements = [
        req_('REQ-001', { owner: 'Alice', claimed_at: '2026-02-01T00:00:00.000Z' }),
        req_('REQ-002'),
      ];
    });
    resetCapture();
    await safeParse(['req', 'board']);
    expect(process.exitCode).toBe(0);
    const lines = out().split('\n');
    expect(lines).toContain('  - REQ-001 需求 REQ-001（已认领：Alice）');
    expect(lines).toContain('  - REQ-002 需求 REQ-002');           // 无 owner：逐字（无后缀）
    expect(lines.filter((l) => l.startsWith('  - REQ-002 '))).toHaveLength(1);

    resetCapture();
    await safeParse(['req', 'board', '--json']);
    const obj = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(Object.keys(obj)).toEqual(['schemaVersion', 'groups']);   // 无 key 变化
    expect(Object.keys(obj.groups)).toEqual([...REQ_STATUSES]);
    expect(obj.groups.draft).toHaveLength(2);
    expect(obj.groups.draft[0].owner).toBe('Alice');                 // 元素本已含 owner
    expect('owner' in obj.groups.draft[1]).toBe(false);
  });

  // ═══ T-E3 --limit 矩阵 ═══

  it('T-E3 req next --limit 矩阵：缺省 / 显式 1 / 2 / 5 / 非法 / 空候选 + 只读零写盘', async () => {
    writeFlow((d) => {
      d.requirements = [
        req_('REQ-001', { status: 'scheduled', target_version: 'v1.3.0', created_at: '2026-01-01T00:00:00.000Z' }),
        req_('REQ-002', { status: 'scheduled', target_version: 'v1.3.0', created_at: '2026-01-02T00:00:00.000Z' }),
        req_('REQ-003', { status: 'scheduled', target_version: 'v1.4.0', created_at: '2026-01-03T00:00:00.000Z' }),
      ];
    });
    const revBefore = readFlow().meta.revision;
    const logLenBefore = readFlow().log.length;

    // ① 缺省（未传）→ human 单行 golden
    resetCapture();
    await safeParse(['req', 'next']);
    expect(process.exitCode).toBe(0);
    const defaultOut = out();
    expect(defaultOut).toBe('下一项：REQ-001 [scheduled] 需求 REQ-001');

    // ② 缺省 --json → 两键逐字（不含 candidates）
    resetCapture();
    await safeParse(['req', 'next', '--json']);
    const j0 = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(Object.keys(j0)).toEqual(['schemaVersion', 'requirement']);
    expect(j0.requirement.id).toBe('REQ-001');

    // ③ 显式 --limit 1（REV-87-004②）→ 与缺省逐字相同；键集相同（正控）
    resetCapture();
    await safeParse(['req', 'next', '--limit', '1']);
    expect(out()).toBe(defaultOut);
    resetCapture();
    await safeParse(['req', 'next', '--limit', '1', '--json']);
    const j1 = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(Object.keys(j1)).toEqual(Object.keys(j0));

    // ④ --limit 2（候选 ≥3）→ label + 2 行；--json 既有两键 + candidates（长度 2，顺序 = 冻结排序前 2）
    resetCapture();
    await safeParse(['req', 'next', '--limit', '2']);
    expect(out()).toBe([
      '可接取需求（2）:',
      '  - REQ-001 [scheduled] 需求 REQ-001',
      '  - REQ-002 [scheduled] 需求 REQ-002',
    ].join('\n'));
    resetCapture();
    await safeParse(['req', 'next', '--limit', '2', '--json']);
    const j2 = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(Object.keys(j2)).toEqual(['schemaVersion', 'requirement', 'candidates']);
    expect(j2.candidates.map((c: any) => c.id)).toEqual(['REQ-001', 'REQ-002']);

    // ⑤ --limit 5（候选恰 3）→ 3 行 / candidates 长度 3（不补空行）
    resetCapture();
    await safeParse(['req', 'next', '--limit', '5']);
    expect(out().split('\n')).toHaveLength(4);                     // label + 3 行
    expect(out()).toContain('可接取需求（3）:');
    expect(out()).not.toContain('可接取需求（5）:');
    resetCapture();
    await safeParse(['req', 'next', '--limit', '5', '--json']);
    expect(JSON.parse(logMock.mock.calls[0][0] as string).candidates).toHaveLength(3);

    // ⑥ 非法值（0 / -1 / abc / 1.5）→ exit 1 + 零写盘；--json → invalid-argument + stderr 零输出
    for (const bad of ['0', '-1', 'abc', '1.5']) {
      resetCapture();
      const raw = flowRaw();
      await safeParse(['req', 'next', '--limit', bad]);
      expect(process.exitCode, `human ${bad}`).toBe(1);
      expect(err()).toContain('非法 --limit 值');
      expect(flowRaw()).toBe(raw);

      resetCapture();
      await safeParse(['req', 'next', '--limit', bad, '--json']);
      expect(process.exitCode, `json ${bad}`).toBe(1);
      expect(logMock.mock.calls.length).toBe(1);
      const jb = JSON.parse(logMock.mock.calls[0][0] as string);
      expect(jb.schemaVersion).toBe(1);
      expect(jb.error).toBe('invalid-argument');
      expect(err()).toBe('');
      expect(flowRaw()).toBe(raw);
    }

    // ⑦ --limit > 1 且候选 0（REV-87-006 组合）→ 空态优先于多行 label
    writeFlow((d) => { d.requirements = [req_('REQ-001', { status: 'draft' })]; });
    resetCapture();
    await safeParse(['req', 'next', '--limit', '2']);
    expect(process.exitCode).toBe(0);
    expect(out()).toBe('（无可接取需求）');
    resetCapture();
    await safeParse(['req', 'next', '--limit', '2', '--json']);
    const jEmpty = JSON.parse(logMock.mock.calls[0][0] as string);
    expect(jEmpty.requirement).toBeNull();
    expect(jEmpty.candidates).toEqual([]);

    // ⑧ 认证只读：上述全部路径 revision / log 长度逐字不变（零 save / 零审计）
    expect(readFlow().meta.revision).toBe(revBefore);
    expect(readFlow().log.length).toBe(logLenBefore);
  });

  // ═══ T-E4 零回归 golden（含正控）═══

  it('T-E4 零回归 golden：board（无 owner 数据）逐字 + next（缺省）逐字 + 正控 + 二次执行一致', async () => {
    writeFlow((d) => { d.requirements = [req_('REQ-001', { status: 'scheduled' })]; });

    resetCapture();
    await safeParse(['req', 'board']);
    const boardGolden = [
      'draft（0）',
      'scheduled（1）',
      '  - REQ-001 需求 REQ-001',
      'in_progress（0）',
      'done（0）',
      'blocked（0）',
      'cancelled（0）',
      'rejected（0）',
    ].join('\n');
    expect(out()).toBe(boardGolden);

    resetCapture();
    await safeParse(['req', 'next']);
    const nextGolden = '下一项：REQ-001 [scheduled] 需求 REQ-001';
    expect(out()).toBe(nextGolden);

    // 正控：非空 + 唯一哨兵 + 二次执行逐字相同
    expect(boardGolden.length).toBeGreaterThan(0);
    expect(nextGolden.length).toBeGreaterThan(0);
    expect(boardGolden).toContain('draft（0）');
    expect(nextGolden).toContain('下一项：');
    resetCapture();
    await safeParse(['req', 'board']);
    expect(out()).toBe(boardGolden);
    resetCapture();
    await safeParse(['req', 'next']);
    expect(out()).toBe(nextGolden);
  });
});

// ═══════════════════════════════════════
// stage-90 op-002：需求级模式属性（CLI 面：字段 / 下发 / 载体门 / 零注入）
// ═══════════════════════════════════════
describe('stage-90 op-002 需求级模式属性（CLI）', () => {
  let tmpDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;
  let prevExitCode: number | string | undefined;

  const STAGE = 'v1.0.0-stage-01';

  beforeEach(async () => {
    mockHome.dir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-req90-home-'));
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-cmd-req90-test-'));
    mockedChild.execSync.mockReset();
    mockedChild.execFileSync.mockReset();
    await initProject(tmpDir);

    logMock = vi.spyOn(console, 'log').mockImplementation(() => {});
    errorMock = vi.spyOn(console, 'error').mockImplementation(() => {});
    cwdMock = vi.spyOn(process, 'cwd').mockReturnValue(tmpDir);
    exitMock = vi.spyOn(process, 'exit').mockImplementation((() => {}) as never);
    prevExitCode = process.exitCode;
    process.exitCode = 0;

    program = new Command();
    program.exitOverride();
    registerReqCommand(program);
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    rmSync(mockHome.dir, { recursive: true, force: true });
    logMock.mockRestore();
    errorMock.mockRestore();
    cwdMock.mockRestore();
    exitMock.mockRestore();
    process.exitCode = prevExitCode;

    const realRaw = existsSync(REAL_FLOW_PATH) ? readFileSync(REAL_FLOW_PATH, 'utf-8') : null;
    expect(realRaw).toBe(REAL_FLOW_RAW);
    expect(existsSync(REAL_REQ_DIR)).toBe(false);
  });

  async function safeParse(args: string[]): Promise<void> {
    try {
      await program.parseAsync(args, { from: 'user' });
    } catch (err) {
      if (!(err instanceof CommanderError)) { throw err; }
    }
  }

  function out(): string { return logMock.mock.calls.map((c) => c[0] as string).join('\n'); }
  function err(): string { return errorMock.mock.calls.map((c) => c[0] as string).join('\n'); }
  function resetCapture(): void { logMock.mockClear(); errorMock.mockClear(); process.exitCode = 0; }
  function readFlow(): any { return JSON.parse(readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8')); }
  function flowRaw(): string { return readFileSync(join(tmpDir, '.openfeel', 'flow.json'), 'utf-8'); }
  function writeFlow(mutate: (d: any) => void): void {
    const d = readFlow();
    mutate(d);
    writeFileSync(join(tmpDir, '.openfeel', 'flow.json'), JSON.stringify(d, null, 2) + '\n', 'utf-8');
  }
  function req_(id: string, overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return {
      id,
      title: `需求 ${id}`,
      status: 'scheduled',
      created_at: '2026-01-01T00:00:00.000Z',
      updated_at: '2026-01-01T00:00:00.000Z',
      ...overrides,
    };
  }
  function statusPathOf(): string { return join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01', 'status.md'); }

  /** 建阶段：flow.json 注册（可选关联需求）+ status.md（无「工作流模式」行 = 插入语义） */
  function setupStage(requirementId?: string): string {
    const mgr = new FlowManager(tmpDir);
    mgr.registerStage(STAGE);
    mgr.save();
    writeFlow((d) => { d.stages[STAGE].requirement_id = requirementId ?? null; });
    const dir = join(tmpDir, '.openfeel', 'plan', 'v1', 'stage-01');
    mkdirSync(dir, { recursive: true });
    writeFileSync(statusPathOf(), `# ${STAGE} 状态\n\n- **执行模式**：manual\n- **自动推进**：disabled\n- **状态**：planned\n`, 'utf-8');
    return statusPathOf();
  }

  it('T90-REQ-7：req add --workflow-mode 合法写入 / 非法 exit 1 零写盘', async () => {
    await safeParse(['req', 'add', '带模式需求', '--workflow-mode', 'fast']);
    expect(process.exitCode).toBe(0);
    expect(readFlow().requirements[0].workflow_mode).toBe('fast');

    resetCapture();
    const raw = flowRaw();
    await safeParse(['req', 'add', '非法模式需求', '--workflow-mode', 'bogus']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('需求工作流模式非法');
    expect(flowRaw()).toBe(raw);                                  // 零写盘
  });

  it('T90-REQ-8：req set --workflow-mode 值写入 + --json 含字段 + noFields 守卫已扩键', async () => {
    writeFlow((d) => { d.requirements = [req_('REQ-001')]; });
    await safeParse(['req', 'set', 'REQ-001', '--workflow-mode', 'full']);
    expect(process.exitCode).toBe(0);
    expect(readFlow().requirements[0].workflow_mode).toBe('full');

    resetCapture();
    await safeParse(['req', 'show', 'REQ-001', '--json']);
    expect(JSON.parse(out()).requirement.workflow_mode).toBe('full');

    resetCapture();
    await safeParse(['req', 'set', 'REQ-001']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('--workflow-mode');
  });

  it('T90-REQ-9：req link 下发（需求 fast → status.md 字段 + flow.json 冗余同批 + 提示文案）', async () => {
    writeFlow((d) => { d.requirements = [req_('REQ-001', { workflow_mode: 'fast' })]; });
    const p = setupStage();
    expect(readFileSync(p, 'utf-8')).not.toContain('工作流模式');

    resetCapture();
    await safeParse(['req', 'link', '--stage', STAGE, '--requirement', 'REQ-001']);

    expect(process.exitCode).toBe(0);
    expect(readFileSync(p, 'utf-8')).toContain('- **工作流模式**：fast');     // status.md 字段
    expect(readFlow().stages[STAGE].workflow_mode).toBe('fast');            // flow.json 冗余同批
    expect(out()).toContain('已将需求工作流模式 fast 下发到阶段');
  });

  it('T90-REQ-10：无模式需求 link → 零下发（status.md 不含模式行 + 无提示）', async () => {
    writeFlow((d) => { d.requirements = [req_('REQ-001')]; });
    const p = setupStage();

    resetCapture();
    await safeParse(['req', 'link', '--stage', STAGE, '--requirement', 'REQ-001']);

    expect(process.exitCode).toBe(0);
    expect(readFileSync(p, 'utf-8')).not.toContain('工作流模式');
    expect(readFlow().stages[STAGE].workflow_mode).toBeUndefined();
    expect(out()).not.toContain('下发');
  });

  it('T90-REQ-11：req set --workflow-mode 下发到已关联阶段（先落盘主变更 → 再下发）', async () => {
    writeFlow((d) => { d.requirements = [req_('REQ-001', { workflow_mode: 'fast' })]; });
    const p = setupStage('REQ-001');

    await safeParse(['req', 'set', 'REQ-001', '--workflow-mode', 'full']);

    expect(process.exitCode).toBe(0);
    expect(readFlow().requirements[0].workflow_mode).toBe('full');
    expect(readFileSync(p, 'utf-8')).toContain('- **工作流模式**：full');
    expect(readFlow().stages[STAGE].workflow_mode).toBe('full');
    expect(out()).toContain('已将工作流模式 full 下发到 1 个关联阶段');
  });

  it('T90-REQ-12：需求侧载体门（有链接阶段 + general → exit 1 零写盘；零链接 general 成功）', async () => {
    writeFlow((d) => { d.requirements = [req_('REQ-001', { workflow_mode: 'fast' })]; });
    setupStage('REQ-001');
    const raw = flowRaw();

    resetCapture();
    await safeParse(['req', 'set', 'REQ-001', '--workflow-mode', 'general']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('general（无流水线）仅限无关联阶段的需求');
    expect(flowRaw()).toBe(raw);                                            // 零变更零审计

    resetCapture();
    writeFlow((d) => { d.requirements.push(req_('REQ-002', { workflow_mode: 'general' })); });
    await safeParse(['req', 'link', '--stage', STAGE, '--requirement', 'REQ-002']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('工作流模式为 general（无流水线）——不接受阶段关联');

    resetCapture();
    await safeParse(['req', 'add', '零链接通用需求', '--workflow-mode', 'general']);
    expect(process.exitCode).toBe(0);
    expect(readFlow().requirements.find((r: any) => r.id === 'REQ-003').workflow_mode).toBe('general');
  });

  it('T90-REQ-13：零注入（C9）——旧 flow.json（无模式字段）load→save 字节级不变 + show --json 缺省无键', async () => {
    writeFlow((d) => { d.requirements = [req_('REQ-001')]; });
    const before = flowRaw();
    await safeParse(['req', 'show', 'REQ-001', '--json']);
    expect(flowRaw()).toBe(before);
    expect(JSON.parse(out()).requirement).not.toHaveProperty('workflow_mode');   // 缺省不出现该键

    resetCapture();
    await safeParse(['req', 'list', '--json']);
    expect(flowRaw()).toBe(before);
    expect(JSON.parse(out()).requirements[0]).not.toHaveProperty('workflow_mode');
  });

  it('T90-REQ-14：req show --json 行内描述含 parent, children（REV-88-010）', () => {
    const src = readFileSync(new URL('../../src/commands/req.ts', import.meta.url), 'utf-8');
    expect(src).toContain('{ schemaVersion, requirement, stages, parent, children }');
    expect(src).not.toContain('{ schemaVersion, requirement, stages }');
  });
});
