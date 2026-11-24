/**
 * `req body` 命令测试（v1.6.0-stage-132 / T2）
 *
 * 覆盖：替换 / 追加 / 显式 --replace / 受保护小节拒绝 / 不存在需求 / 空文本 /
 *       --file / 变更记录追加 / --json 形态 / 缺失小节创建 / req add 正文小节。
 *
 * 隔离纪律：全程 fixture tmpDir + 隔离 HOME；禁止触碰真实 `.openfeel/flow.json`
 *          与真实 `.openfeel/requirements/`（afterEach 反守卫，同 req.test.ts）。
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
import { extractSection, isRequirementBodyFilled } from '../../src/core/plan/filled.js';
import { mkdtempSync, rmSync, readFileSync, existsSync, readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { tmpdir } from 'node:os';

// 模块顶层捕获真实工作区基线（REAL_CWD 反守卫用）
const REAL_CWD = process.cwd();
const REAL_FLOW_PATH = join(REAL_CWD, '.openfeel', 'flow.json');
const REAL_FLOW_RAW = existsSync(REAL_FLOW_PATH) ? readFileSync(REAL_FLOW_PATH, 'utf-8') : null;
const REAL_REQ_DIR = join(REAL_CWD, '.openfeel', 'requirements');

/** 捕获需求层目录快照（存在性 + 相对路径 + 内容；与 req.test.ts 同源） */
function snapshotReqDir(dir: string): { rel: string; content: string }[] | null {
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

const REAL_REQ_SNAPSHOT = snapshotReqDir(REAL_REQ_DIR);

const LONG_TEXT =
  '本小节用于验证正文可结构化写入：替换只影响目标小节，元信息小节与头部说明行逐字不变，变更记录只追加不覆盖。';

describe('req body（v1.6.0-stage-132 / T2）', () => {
  let tmpDir: string;
  let program: Command;
  let logMock: ReturnType<typeof vi.fn>;
  let errorMock: ReturnType<typeof vi.fn>;
  let cwdMock: ReturnType<typeof vi.fn>;
  let exitMock: ReturnType<typeof vi.fn>;
  let prevExitCode: number | string | undefined;

  beforeEach(async () => {
    mockHome.dir = mkdtempSync(join(tmpdir(), 'openfeel-req-body-home-'));
    tmpDir = mkdtempSync(join(tmpdir(), 'openfeel-req-body-test-'));
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
    expect(snapshotReqDir(REAL_REQ_DIR)).toEqual(REAL_REQ_SNAPSHOT);
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

  function resetCapture(): void {
    logMock.mockClear();
    errorMock.mockClear();
    process.exitCode = 0;
  }

  function bodyPath(): string {
    return join(tmpDir, '.openfeel', 'requirements', 'REQ-001.md');
  }

  function readBody(): string {
    return readFileSync(bodyPath(), 'utf-8');
  }

  /** 新增一条需求（正文骨架落盘） */
  async function createRequirement(extra: string[] = []): Promise<void> {
    await safeParse(['req', 'add', '正文写实测试需求', ...extra]);
    expect(process.exitCode).toBe(0);
    expect(existsSync(bodyPath())).toBe(true);
  }

  // ═══ 1. 替换单节：其余小节逐字不变 ═══

  it('替换单节且其余小节逐字不变（摘要 ← --text）', async () => {
    await createRequirement();
    const before = readBody();
    resetCapture();

    await safeParse(['req', 'body', 'REQ-001', '--section', '摘要', '--text', LONG_TEXT]);

    expect(process.exitCode).toBe(0);
    const after = readBody();
    // 摘要 = 新正文
    expect(extractSection(after, '摘要')).toBe(LONG_TEXT);
    // 目标与验收保持骨架占位
    expect(extractSection(after, '目标与验收')).toBe('（待补充）');
    // 元信息小节与头部说明行逐字不变
    for (const name of ['状态', '预估版本', '父需求', '关联阶段']) {
      expect(extractSection(after, name)).toBe(extractSection(before, name));
    }
    expect(after.startsWith(before.slice(0, before.indexOf('## 摘要')))).toBe(true);
    // 人类输出一行摘要
    expect(out()).toContain('已更新 REQ-001 正文');
    expect(out()).toContain('## 摘要');
  });

  // ═══ 2. 追加 / 显式替换 ═══

  it('--append 追加到小节末尾（保留既有正文）', async () => {
    await createRequirement();
    await safeParse(['req', 'body', 'REQ-001', '--section', '摘要', '--text', '第一段：正文可结构化写入。']);
    resetCapture();
    await safeParse(['req', 'body', 'REQ-001', '--section', '摘要', '--text', '第二段：追加不覆盖既有内容。', '--append']);

    expect(process.exitCode).toBe(0);
    const section = extractSection(readBody(), '摘要')!;
    expect(section).toContain('第一段：正文可结构化写入。');
    expect(section).toContain('第二段：追加不覆盖既有内容。');
    expect(section.indexOf('第一段')).toBeLessThan(section.indexOf('第二段'));
  });

  it('--replace 显式替换整节', async () => {
    await createRequirement();
    await safeParse(['req', 'body', 'REQ-001', '--section', '摘要', '--text', '旧内容：将被整节替换。']);
    resetCapture();
    await safeParse(['req', 'body', 'REQ-001', '--section', '摘要', '--text', LONG_TEXT, '--replace']);

    expect(process.exitCode).toBe(0);
    expect(extractSection(readBody(), '摘要')).toBe(LONG_TEXT);
  });

  // ═══ 3. 受保护小节拒绝（零写盘） ═══

  it('受保护小节（状态）→ exit 1 + 文案 + 正文逐字节不变', async () => {
    await createRequirement();
    const before = readBody();
    resetCapture();

    await safeParse(['req', 'body', 'REQ-001', '--section', '状态', '--text', LONG_TEXT]);

    expect(process.exitCode).toBe(1);
    expect(err()).toContain('元信息小节');
    expect(readBody()).toBe(before);
  });

  // ═══ 4. 不存在需求 / 非法 ID ═══

  it('不存在需求 → exit 1 + notFound 文案', async () => {
    await safeParse(['req', 'body', 'REQ-999', '--section', '摘要', '--text', LONG_TEXT]);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('REQ-999 不存在');

    resetCapture();
    await safeParse(['req', 'body', 'REQ-999', '--section', '摘要', '--text', LONG_TEXT, '--json']);
    expect(process.exitCode).toBe(1);
    const doc = JSON.parse(out()) as Record<string, unknown>;
    expect(doc.schemaVersion).toBe(1);
    expect(doc.error).toBe('not_found');
    expect(doc.errorKind).toBe('refusal');
  });

  // ═══ 5. 空文本 ═══

  it('空文本 → exit 1（--text 空白 / 两个来源都缺）', async () => {
    await createRequirement();
    const before = readBody();
    resetCapture();

    await safeParse(['req', 'body', 'REQ-001', '--section', '摘要', '--text', '   ']);
    expect(process.exitCode).toBe(1);
    expect(readBody()).toBe(before);

    resetCapture();
    await safeParse(['req', 'body', 'REQ-001', '--section', '摘要']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('--text');
    expect(readBody()).toBe(before);
  });

  it('--text 与 --file 同时提供 → exit 1（互斥）', async () => {
    await createRequirement();
    resetCapture();
    await safeParse(['req', 'body', 'REQ-001', '--section', '摘要', '--text', LONG_TEXT, '--file', 'x.md']);
    expect(process.exitCode).toBe(1);
    expect(err()).toContain('--text 与 --file');
  });

  // ═══ 6. --file ═══

  it('--file 从文件读取正文（相对路径按项目根解析）', async () => {
    await createRequirement();
    const draftDir = join(tmpDir, '.openfeel', 'tmp');
    mkdirSync(draftDir, { recursive: true });
    writeFileSync(join(draftDir, 'summary.md'), '\n从文件读取的写实正文：文件路径按项目根解析，内容写入 ## 摘要。\n', 'utf-8');
    resetCapture();

    await safeParse(['req', 'body', 'REQ-001', '--section', '摘要', '--file', '.openfeel/tmp/summary.md']);

    expect(process.exitCode).toBe(0);
    expect(extractSection(readBody(), '摘要')).toBe('从文件读取的写实正文：文件路径按项目根解析，内容写入 ## 摘要。');
  });

  // ═══ 7. 变更记录只追加 ═══

  it('每次写入在 ## 变更记录 末尾追加一行（含小节名与署名）', async () => {
    await createRequirement();
    const beforeLog = extractSection(readBody(), '变更记录')!;
    resetCapture();
    await safeParse(['req', 'body', 'REQ-001', '--section', '摘要', '--text', LONG_TEXT]);

    const afterLog = extractSection(readBody(), '变更记录')!;
    expect(afterLog.startsWith(beforeLog)).toBe(true);
    expect(afterLog).toMatch(/- \d{4}-\d{2}-\d{2}T[^\s]+ body:摘要 更新（.+）/);
  });

  // ═══ 8. --json 形态 ═══

  it('--json 成功出口：schemaVersion 首键 + 六业务键', async () => {
    await createRequirement();
    resetCapture();
    await safeParse(['req', 'body', 'REQ-001', '--section', '摘要', '--text', LONG_TEXT, '--json']);

    expect(process.exitCode).toBe(0);
    const doc = JSON.parse(out()) as Record<string, unknown>;
    expect(Object.keys(doc)).toEqual(['schemaVersion', 'id', 'section', 'path', 'lines', 'created']);
    expect(doc.schemaVersion).toBe(1);
    expect(doc.id).toBe('REQ-001');
    expect(doc.section).toBe('摘要');
    expect(doc.path).toBe('.openfeel/requirements/REQ-001.md');
    expect(doc.lines).toBe(1);
    expect(doc.created).toBe(false);
  });

  // ═══ 9. 缺失小节自动创建（插在变更记录之前） ═══

  it('缺失小节（问题）自动创建，且位于 ## 变更记录 之前', async () => {
    await createRequirement();
    resetCapture();
    await safeParse(['req', 'body', 'REQ-001', '--section', '问题', '--text', LONG_TEXT, '--json']);

    expect(process.exitCode).toBe(0);
    const doc = JSON.parse(out()) as Record<string, unknown>;
    expect(doc.created).toBe(true);
    const md = readBody();
    expect(extractSection(md, '问题')).toBe(LONG_TEXT);
    expect(md.indexOf('## 问题')).toBeLessThan(md.indexOf('## 变更记录'));
    expect(md.indexOf('## 问题')).toBeGreaterThan(md.indexOf('## 目标与验收'));
  });

  // ═══ 10. req add 的正文小节选项 ═══

  it('req add --problem/--goal/--acceptance/--plan 写入对应小节', async () => {
    await createRequirement([
      '--problem', '现状：正文零更新入口，48/54 空壳。',
      '--goal', '提供唯一正文写入口。',
      '--acceptance', '- A1：替换单节且其余小节不变\n- A3：lint 可枚举空壳',
      '--plan', '1. 实现 updateRequirementBody；2. 注册 req body。',
    ]);

    const md = readBody();
    expect(extractSection(md, '问题')).toContain('48/54 空壳');
    const goal = extractSection(md, '目标与验收')!;
    expect(goal).toContain('### 目标');
    expect(goal).toContain('### 验收');
    expect(goal).toContain('- A1：替换单节且其余小节不变');
    expect(extractSection(md, '初步规划')).toContain('updateRequirementBody');
    // 未提供的业务小节保持骨架占位
    expect(extractSection(md, '摘要')).toBe('（待补充）');
  });

  it('req add 未传正文选项时保持骨架（零业务小节变更）', async () => {
    await createRequirement();
    const md = readBody();
    expect(extractSection(md, '摘要')).toBe('（待补充）');
    expect(extractSection(md, '目标与验收')).toBe('（待补充）');
    expect(extractSection(md, '问题')).toBeNull();
    expect(extractSection(md, '初步规划')).toBeNull();
  });

  // ═══ 11. req add --summary（v1.6.0-stage-132 / REQ-061：建单即写实） ═══

  it('req add --summary 写入 ## 摘要；与 --goal/--acceptance 同时给出即正文写实', async () => {
    await createRequirement([
      '--summary', '建单时把摘要一次写实：说明现状、交付物边界与判定口径，避免先建需求再逐条 req body 补写而被正文门反复拦下。',
      '--goal', '让 add 一次命令写实摘要与验收判据。',
      '--acceptance', '- A1：add --summary --goal --acceptance 后正文写实。\n- A2：缺 --summary 时摘要仍占位。',
    ]);

    const md = readBody();
    expect(extractSection(md, '摘要')).toContain('建单时把摘要一次写实');
    expect(extractSection(md, '目标与验收')).toContain('### 验收');
    expect(isRequirementBodyFilled(md)).toBe(true);
    // 写入顺序：摘要先于 目标与验收（骨架 → 各字段按序替换）
    expect(md.indexOf('建单时把摘要一次写实')).toBeLessThan(md.indexOf('### 目标'));
    // 未提供的业务小节保持骨架形态
    expect(extractSection(md, '问题')).toBeNull();
    expect(extractSection(md, '初步规划')).toBeNull();
  });

  it('req add 只给 --goal/--acceptance（无 --summary）→ 摘要保持占位且正文不写实', async () => {
    await createRequirement([
      '--goal', '只写目标，不给摘要。',
      '--acceptance', '- A1：缺摘要时正文不写实。',
    ]);

    const md = readBody();
    expect(extractSection(md, '摘要')).toBe('（待补充）');
    expect(isRequirementBodyFilled(md)).toBe(false);
  });
});
