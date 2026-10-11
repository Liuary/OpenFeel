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
import { mkdtempSync, rmSync, readFileSync, existsSync, writeFileSync } from 'node:fs';
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

  it('T-C3 help 键双向逐键断言（37 键）：正向 hasKey + 反向命令树 ⊆ 期望 + applyHelpI18n 生效', async () => {
    const EXPECTED = [
      'help.req',
      'help.req.add', 'help.req.add.argtitle', 'help.req.add.targetVersion', 'help.req.add.priority',
      'help.req.list', 'help.req.list.status', 'help.req.list.targetVersion', 'help.req.list.owner', 'help.req.list.json',
      'help.req.show', 'help.req.show.argid', 'help.req.show.json',
      'help.req.claim', 'help.req.claim.argid', 'help.req.claim.owner',
      'help.req.release', 'help.req.release.argid',
      'help.req.set', 'help.req.set.argid', 'help.req.set.status', 'help.req.set.title', 'help.req.set.targetVersion', 'help.req.set.priority',
      'help.req.link', 'help.req.link.stage', 'help.req.link.requirement', 'help.req.link.unlink',
      'help.req.advance', 'help.req.advance.argid', 'help.req.advance.to',
      'help.req.board', 'help.req.board.targetVersion', 'help.req.board.json',
      'help.req.next', 'help.req.next.owner', 'help.req.next.json',
    ];
    expect(EXPECTED).toHaveLength(37);

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

  it('T-C5 正交/越界静态断言：7 禁止串零命中 + 6 正控命中', () => {
    const src = readFileSync(new URL('../../src/commands/req.ts', import.meta.url), 'utf-8');
    expect(src.length).toBeGreaterThan(0);
    const FORBIDDEN = [
      'ALLOWED_TRANSITIONS', 'workflow_mode', 'getValidTargets', 'flow-archive',
      '.phase', 'allLinkedStagesDone', 'padStart',
    ];
    expect(FORBIDDEN.length).toBe(7);
    for (const n of FORBIDDEN) {
      expect(src.includes(n), `禁止串命中: ${n}`).toBe(false);
    }
    const POSITIVE = [
      'getAllowedNextStatuses', 'REQ_STATUSES', 'REQ_ID_PATTERN',
      'linkRequirement', 'writeRequirementBodySkeleton', 'listRequirements',
    ];
    expect(POSITIVE.length).toBe(6);
    for (const n of POSITIVE) {
      expect(src).toContain(n);
    }
  });
});
