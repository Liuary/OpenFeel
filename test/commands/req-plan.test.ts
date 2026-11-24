/**
 * `req plan` 命令测试（v1.6.1 / REQ-064 A64.1 / A64.5）
 *
 * 覆盖：生成四节骨架（JSON 六键固定序）/ 已存在默认拒绝（exit 1 + 文案含 --force + 字节不变）/
 *       `--force` 覆盖（overwritten:true）/ 需求不存在 / 非法 ID / 未初始化 / 空壳正文的写后自检提示。
 *
 * 隔离纪律：全程 fixture tmpDir + 隔离 HOME；禁止触碰真实 `.openfeel/flow.json`
 *          与真实 `.openfeel/requirements/`（afterEach 反守卫，同 req-body.test.ts）。
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// N4 单点隔离：homedir → 临时目录（initProject 的全局配置写入不触碰真实 ~/.openfeel/）
const mockHome = vi.hoisted(() => ({ dir: '' }));
vi.mock('node:os', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:os')>();
  return { ...actual, homedir: () => mockHome.dir };
});

// mock child_process：避免真实 git 调用（owner / actor 解析链共用）
const mockedChild = vi.hoisted(() => ({ execSync: vi.fn(), execFileSync: vi.fn() }));
vi.mock('node:child_process', () => ({
  execSync: mockedChild.execSync,
  execFileSync: mockedChild.execFileSync,
}));

import { Command, CommanderError } from 'commander';
import { registerReqCommand } from '../../src/commands/req.js';
import { initProject } from '../../src/core/init.js';
import { isRequirementPlanFilled } from '../../src/core/plan/filled.js';
// v1.6.1 / REQ-065 A65.1：需求正文 / 计划样本一律来自共享夹具工厂（与 dsh/test/verify.js 同一份导出）
import { makeFilledBodyInput, makeRequirementPlan } from '../fixtures/requirements.js';
import { mkdirSync, mkdtempSync, rmSync, readFileSync, existsSync, readdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';

// 模块顶层捕获真实工作区基线（反守卫用）
const REAL_CWD = process.cwd();
const REAL_FLOW_PATH = join(REAL_CWD, '.openfeel', 'flow.json');
const REAL_FLOW_RAW = existsSync(REAL_FLOW_PATH) ? readFileSync(REAL_FLOW_PATH, 'utf-8') : null;
const REAL_REQ_DIR = join(REAL_CWD, '.openfeel', 'requirements');
const REAL_PLAN_DIR = join(REAL_CWD, '.openfeel', 'plan', 'reqs');

/** 捕获目录快照（存在性 + 相对路径 + 内容） */
function snapshotDir(dir: string): { rel: string; content: string }[] | null {
  if (!existsSync(dir)) {
    return null;
  }
  const files: { rel: string; content: string }[] = [];
  const walk = (abs: string): void => {
    const entries = readdirSync(abs, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    for (const entry of entries) {
      const childAbs = join(abs, entry.name);
      if (entry.isDirectory()) {
        walk(childAbs);
      } else if (entry.isFile()) {
        files.push({ rel: relative(dir, childAbs).split(sep).join('/'), content: readFileSync(childAbs, 'utf-8') });
      }
    }
  };
  walk(dir);
  return files.sort((a, b) => a.rel.localeCompare(b.rel));
}

const REAL_REQ_SNAPSHOT = snapshotDir(REAL_REQ_DIR);
const REAL_PLAN_SNAPSHOT = snapshotDir(REAL_PLAN_DIR);

describe('req plan（v1.6.1 / REQ-064）', () => {
  let tmpDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;
  let prevExitCode: number | string | undefined;

  beforeEach(async () => {
    mockHome.dir = mkdtempSync(join(tmpdir(), 'openfeel-req-plan-home-'));
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-req-plan-cmd-'));
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
    expect(snapshotDir(REAL_REQ_DIR)).toEqual(REAL_REQ_SNAPSHOT);
    expect(snapshotDir(REAL_PLAN_DIR)).toEqual(REAL_PLAN_SNAPSHOT);
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

  function out(): string {
    return logMock.mock.calls.map((c) => c[0] as string).join('\n');
  }

  function err(): string {
    return errorMock.mock.calls.map((c) => c[0] as string).join('\n');
  }

  function resetCapture(): void {
    logMock.mockClear();
    errorMock.mockClear();
    process.exitCode = 0;
  }

  function planPath(id = 'REQ-001'): string {
    return join(tmpDir, '.openfeel', 'plan', 'reqs', `${id}.plan.md`);
  }

  /** 新建写实需求（正文三字段一次写实；口径来自共享夹具工厂） */
  async function createFilledRequirement(): Promise<void> {
    const { summary, goal, acceptance } = makeFilledBodyInput();
    await safeParse([
      'req', 'add', '需求计划生成',
      '--summary', summary,
      '--goal', goal,
      '--acceptance', acceptance,
    ]);
    expect(process.exitCode).toBe(0);
    resetCapture();
  }

  // ═══ 1. 生成（JSON 六键固定序） ═══

  it('生成四节骨架：JSON 六键固定序 + 路径固定 + isRequirementPlanFilled=true', async () => {
    await createFilledRequirement();
    await safeParse(['req', 'plan', 'REQ-001', '--json']);

    expect(process.exitCode).toBe(0);
    const doc = JSON.parse(out()) as Record<string, unknown>;
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'id', 'path', 'created', 'overwritten', 'lines']);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.id).toBe('REQ-001');
    expect(doc.path).toBe('.openfeel/plan/reqs/REQ-001.plan.md');
    expect(doc.created).toBe(true);
    expect(doc.overwritten).toBe(false);
    // v1.6.1 / REQ-065（A64.1 的 `replaced:true` 判据）：新建路径**不出现**该条件键——
    // 既有 6 键键集/键序（出口 #50 契约）逐字不变
    expect('replaced' in doc).toBe(false);

    const content = readFileSync(planPath(), 'utf-8');
    expect(doc.lines).toBe(content.split(/\r?\n/).length);
    expect(isRequirementPlanFilled(content)).toBe(true);
    for (const name of ['目标', '任务拆解', '验收判据', '偏差与回写']) {
      expect(content).toContain(`## ${name}`);
    }
  });

  it('人类出口：新建/覆盖两种文案 + 行数', async () => {
    await createFilledRequirement();
    await safeParse(['req', 'plan', 'REQ-001']);
    expect(process.exitCode).toBe(0);
    expect(out()).toContain('已生成需求计划 REQ-001');
    expect(out()).toContain('.openfeel/plan/reqs/REQ-001.plan.md');

    resetCapture();
    await safeParse(['req', 'plan', 'REQ-001', '--force']);
    expect(process.exitCode).toBe(0);
    expect(out()).toContain('已覆盖需求计划 REQ-001');
  });

  // ═══ 2. 已存在默认拒绝（字节不变） ═══

  it('已存在 → exit 1 + 文案含 --force + 文本节字节不变', async () => {
    await createFilledRequirement();
    await safeParse(['req', 'plan', 'REQ-001', '--json']);
    expect(process.exitCode).toBe(0);
    const before = readFileSync(planPath(), 'utf-8');
    resetCapture();

    await safeParse(['req', 'plan', 'REQ-001']);

    expect(process.exitCode).toBe(1);
    expect(err()).toContain('--force');
    expect(readFileSync(planPath(), 'utf-8')).toBe(before);

    resetCapture();
    await safeParse(['req', 'plan', 'REQ-001', '--json']);
    expect(process.exitCode).toBe(1);
    const doc = JSON.parse(out()) as Record<string, unknown>;
    expect(doc.schemaVersion).toBe(1);
    expect(doc.error).toBe('plan_exists');
    expect(doc.errorKind).toBe('refusal');
    expect(readFileSync(planPath(), 'utf-8')).toBe(before);
  });

  it('--force 覆盖：overwritten:true / created:false / replaced:true / 内容可重建', async () => {
    await createFilledRequirement();
    await safeParse(['req', 'plan', 'REQ-001', '--json']);
    resetCapture();
    await safeParse(['req', 'plan', 'REQ-001', '--force', '--json']);

    expect(process.exitCode).toBe(0);
    const doc = JSON.parse(out()) as Record<string, unknown>;
    expect(doc.created).toBe(false);
    expect(doc.overwritten).toBe(true);
    // REQ-064 A64.1：`--force` → `replaced:true`（末位条件键，只在此路径出现）
    expect(doc.replaced).toBe(true);
    expect(Object.keys(doc)).toEqual([
      'schemaVersion', 'id', 'path', 'created', 'overwritten', 'lines', 'replaced',
    ]);
    expect(isRequirementPlanFilled(readFileSync(planPath(), 'utf-8'))).toBe(true);
  });

  // ═══ 共享夹具工厂复用（v1.6.1 / REQ-065 A65.1） ═══

  it('A65.1 复用：已存在计划由共享工厂生成 → 默认拒绝且字节不变', async () => {
    await createFilledRequirement();
    const existing = makeRequirementPlan('REQ-001', '需求计划生成');
    mkdirSync(join(tmpDir, '.openfeel', 'plan', 'reqs'), { recursive: true });
    writeFileSync(planPath(), existing, 'utf-8');

    await safeParse(['req', 'plan', 'REQ-001', '--json']);

    expect(process.exitCode).toBe(1);
    const doc = JSON.parse(out()) as Record<string, unknown>;
    expect(doc.error).toBe('plan_exists');
    expect(readFileSync(planPath(), 'utf-8')).toBe(existing);
  });

  // ═══ 3. 负例 ═══

  it('需求不存在 → exit 1（human notFound / JSON not_found）', async () => {
    await safeParse(['req', 'plan', 'REQ-999']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('REQ-999 不存在');

    resetCapture();
    await safeParse(['req', 'plan', 'REQ-999', '--json']);
    expect(process.exitCode).toBe(1);
    const doc = JSON.parse(out()) as Record<string, unknown>;
    expect(doc.error).toBe('not_found');
    expect(doc.errorKind).toBe('refusal');
  });

  it('非法 ID → exit 1 + invalid-argument（零写盘）', async () => {
    await safeParse(['req', 'plan', 'REQ-XYZ', '--json']);
    expect(process.exitCode).toBe(1);
    const doc = JSON.parse(out()) as Record<string, unknown>;
    expect(doc.error).toBe('invalid-argument');
    expect(existsSync(join(tmpDir, '.openfeel', 'plan', 'reqs'))).toBe(false);
  });

  // ═══ 4. 空壳正文：仍生成骨架，但如实提示未写实（不编内容） ═══

  it('正文未写实 → 生成为空壳骨架 + stderr 提示（exit 0，不伪造内容）', async () => {
    await safeParse(['req', 'add', '空壳需求']);
    expect(process.exitCode).toBe(0);
    resetCapture();

    await safeParse(['req', 'plan', 'REQ-001', '--json']);

    expect(process.exitCode).toBe(0);
    const content = readFileSync(planPath(), 'utf-8');
    expect(isRequirementPlanFilled(content)).toBe(false);
    expect(err()).toContain('写实判据');
  });
});
