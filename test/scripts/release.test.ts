/**
 * scripts/release.mjs 单测（stage-133 / REQ-061 A61.1—A61.4）。
 *
 * 全部外部命令经注入的 runner 执行——**不调用真实 npm / git**，不会发布、不会提交。
 * 覆盖：版本不一致早停 / whoami 失败早停且不 publish / 默认零真实发布 /
 * --dry-run 双包 dry-run publish（不调 whoami）/ --dry-run 六步链（market/archive-commit/tag
 * = planned + 归档 paths + tag 名）/ --publish 失败不 publish /
 * --notes-only 草稿（REQ 标题 + REV 结论）与默认零写盘 / --write-notes 落盘且不覆盖 /
 * 归档提交白名单。
 */

import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ARCHIVE_ARTIFACTS,
  expandArchiveArtifacts,
  runRelease,
} from '../../scripts/release.mjs';

type RunCall = { cmd: string; args: string[]; cwd?: string };
type RunResult = { status: number; stdout?: string; stderr?: string };
type Runner = (cmd: string, args: string[], options?: { cwd?: string; capture?: boolean }) => RunResult;

const tempDirs: string[] = [];

afterEach(() => {
  for (const dir of tempDirs.splice(0)) {
    rmSync(dir, { recursive: true, force: true });
  }
});

function makeTempDir(): string {
  const dir = mkdtempSync(join(tmpdir(), 'openfeel-release-test-'));
  tempDirs.push(dir);
  return dir;
}

function writeFixture(root: string, relative: string, content: string): void {
  const target = join(root, relative);
  mkdirSync(join(target, '..'), { recursive: true });
  writeFileSync(target, content, 'utf8');
}

function makeProject({
  version = '1.6.0',
  dshVersion = '1.6.0',
  changelog = `## [${version}] - 2026-11-24\n\n- 条目\n`,
}: { version?: string; dshVersion?: string; changelog?: string } = {}): string {
  const cwd = makeTempDir();
  writeFixture(cwd, 'package.json', `${JSON.stringify({ name: 'openfeel', version }, null, 2)}\n`);
  writeFixture(cwd, 'dsh/package.json', `${JSON.stringify({ name: 'openfeel-dsh', version: dshVersion }, null, 2)}\n`);
  writeFixture(cwd, 'CHANGELOG.md', changelog);
  return cwd;
}

function makeRunner(
  handler: (cmd: string, args: string[]) => RunResult = () => ({ status: 0 }),
): { runner: Runner; calls: RunCall[] } {
  const calls: RunCall[] = [];
  const runner: Runner = (cmd, args, options = {}) => {
    calls.push({ cmd, args: [...args], cwd: options.cwd });
    return handler(cmd, args);
  };
  return { runner, calls };
}

function execute(cwd: string, argv: string[], runner: Runner, handler?: (cmd: string, args: string[]) => { status: number }) {
  const messages: string[] = [];
  const result = runRelease({
    argv,
    cwd,
    runner,
    log: (line: unknown) => messages.push(String(line)),
  });
  return { result, messages, output: messages.join('\n') };
}

type Step = {
  id: string;
  status: string;
  cmd?: string | null;
  reason?: string;
  publishMode?: string;
  substeps?: Array<{ cmd: string; cwd?: string; publishMode?: string; status: string }>;
  paths?: string[];
  tag?: string;
  note?: string;
};

const stepOf = (result: { steps: Step[] }, id: string): Step | undefined =>
  result.steps.find((step) => step.id === id);

const publishCalls = (calls: RunCall[]) => calls.filter((call) => call.cmd === 'npm' && call.args[0] === 'publish');

describe('scripts/release.mjs', () => {
  it('版本不一致 → exit 1 并列出差异，不进入后续步骤', () => {
    const cwd = makeProject({ version: '1.6.0', dshVersion: '1.7.0' });
    const { runner, calls } = makeRunner();
    const { result, output } = execute(cwd, ['--skip-build'], runner);

    expect(result.exitCode).toBe(1);
    expect(result.ok).toBe(false);
    expect(stepOf(result, 'version')?.status).toBe('failed');
    for (const id of ['build', 'publish', 'market', 'archive-commit', 'tag']) {
      expect(stepOf(result, id)?.status).toBe('skipped');
    }
    expect(calls).toEqual([]);
    expect(output).toContain('1.6.0');
    expect(output).toContain('1.7.0');
    expect(output).toContain('dsh/package.json');
  });

  it('--publish 且 npm whoami 失败 → exit 1 早停、不 publish、只提示 npm login', () => {
    const cwd = makeProject();
    const { runner, calls } = makeRunner((cmd, args) =>
      cmd === 'npm' && args[0] === 'whoami' ? { status: 1 } : { status: 0 },
    );
    const { result, output } = execute(cwd, ['--skip-build', '--publish'], runner);

    expect(result.exitCode).toBe(1);
    expect(stepOf(result, 'publish')?.status).toBe('failed');
    for (const id of ['market', 'archive-commit', 'tag']) {
      expect(stepOf(result, id)?.status).toBe('skipped');
    }
    expect(publishCalls(calls)).toHaveLength(0);
    expect(calls.map((call) => call.args.join(' '))).toEqual(['whoami']);
    expect(output).toContain('npm login');
    expect(output).not.toMatch(/npm_[A-Za-z0-9]{20,}/);
    expect(output).not.toMatch(/\b_[A-Za-z0-9]{20,}\b/);
  });

  it('默认（无 --publish）→ 零真实 publish，publish 步骤 skipped', () => {
    const cwd = makeProject();
    const { runner, calls } = makeRunner();
    const { result, output } = execute(cwd, ['--skip-build'], runner);

    expect(result.exitCode).toBe(0);
    expect(result.ok).toBe(true);
    expect(stepOf(result, 'publish')?.status).toBe('skipped');
    expect(publishCalls(calls)).toHaveLength(0);
    expect(output).toContain('publish skipped');
    expect(stepOf(result, 'market')?.status).toBe('skipped');
    expect(stepOf(result, 'archive-commit')?.status).toBe('skipped');
    expect(stepOf(result, 'tag')?.status).toBe('skipped');
  });

  it('--dry-run → 根包与 dsh 各一次 npm publish --dry-run --access public，publishMode=dry-run 且不调 whoami', () => {
    const cwd = makeProject();
    const { runner, calls } = makeRunner();
    const { result } = execute(cwd, ['--skip-build', '--dry-run'], runner);

    expect(result.exitCode).toBe(0);
    expect(result.ok).toBe(true);
    expect(stepOf(result, 'publish')?.status).toBe('ok');
    expect(stepOf(result, 'publish')?.publishMode).toBe('dry-run');

    const publishes = publishCalls(calls);
    expect(publishes).toHaveLength(2);
    for (const call of publishes) {
      expect(call.args).toEqual(['publish', '--dry-run', '--access', 'public']);
    }
    expect(publishes.map((call) => call.cwd)).toEqual([cwd, join(cwd, 'dsh')]);
    expect(stepOf(result, 'publish')?.substeps.map((sub: { publishMode?: string }) => sub.publishMode)).toEqual([
      'dry-run',
      'dry-run',
    ]);
    // whoami 只在真实发布（--publish 且非 dry-run）时检查。
    expect(calls.some((call) => call.cmd === 'npm' && call.args[0] === 'whoami')).toBe(false);
    expect(publishes.every((call) => call.args.includes('--dry-run'))).toBe(true);
  });

  it('--dry-run 命中「版本已发布」（EPUBLISHCONFLICT）→ 子步 skipped + 注记，预演继续 exit 0', () => {
    const cwd = makeProject();
    const { runner, calls } = makeRunner(() => ({
      status: 1,
      stderr: 'npm error You cannot publish over the previously published versions: 1.6.0.',
    }));
    const { result } = execute(cwd, ['--skip-build', '--dry-run'], runner);

    expect(result.exitCode).toBe(0);
    expect(stepOf(result, 'publish')?.status).toBe('ok');
    expect(stepOf(result, 'publish')?.publishMode).toBe('dry-run');
    expect(stepOf(result, 'publish')?.substeps?.map((sub) => sub.status)).toEqual(['skipped', 'skipped']);
    expect(publishCalls(calls)).toHaveLength(2);
    expect(publishCalls(calls).every((call) => call.args.includes('--dry-run'))).toBe(true);
    expect(calls.some((call) => call.cmd === 'npm' && call.args[0] === 'whoami')).toBe(false);
  });

  it('--dry-run 且 publish 因其它原因失败 → exit 1 早停，后续全 skipped', () => {
    const cwd = makeProject();
    const { runner } = makeRunner(() => ({ status: 1, stderr: 'npm error code E500 registry unreachable' }));
    const { result } = execute(cwd, ['--skip-build', '--dry-run'], runner);

    expect(result.exitCode).toBe(1);
    expect(stepOf(result, 'publish')?.status).toBe('failed');
    for (const id of ['market', 'archive-commit', 'tag']) {
      expect(stepOf(result, id)?.status).toBe('skipped');
    }
  });

  it('A61.1/A61.4 --dry-run → 六步链：market/archive-commit/tag 标 planned（不再 skipped），给出归档产物 paths 与 tag 名', () => {
    const cwd = makeProject();
    for (const relative of [
      '.openfeel/log/archive-v1.6.0-stage-132.md',
      '.openfeel/flow-archive/v1.6.0.json',
      '.openfeel/checkpoints/ckpt-1.json',
      'docs/releases/v1.6.0.md',
      'docs/VERSIONS.md',
      'docs/market/index.json',
    ]) {
      writeFixture(cwd, relative, '{}\n');
    }
    const { runner, calls } = makeRunner();
    const { result, output } = execute(cwd, ['--skip-build', '--dry-run'], runner);

    expect(result.exitCode).toBe(0);
    expect(result.ok).toBe(true);
    // 预演的是整条链：version/build/publish 实际走，market/archive-commit/tag 只做计划
    expect(result.steps.map((step) => step.status)).toEqual([
      'ok',
      'skipped',
      'ok',
      'planned',
      'planned',
      'planned',
    ]);
    // A61.4：归档产物清单在 --dry-run 下也可断言（ARCHIVE_ARTIFACTS 本地展开）
    const plannedPaths = stepOf(result, 'archive-commit')?.paths ?? [];
    expect(plannedPaths).toEqual(expandArchiveArtifacts(cwd));
    for (const expected of [
      '.openfeel/log/archive-v1.6.0-stage-132.md',
      '.openfeel/flow-archive/v1.6.0.json',
      '.openfeel/checkpoints/ckpt-1.json',
      'docs/releases/v1.6.0.md',
      'CHANGELOG.md',
      'docs/VERSIONS.md',
      'docs/market/index.json',
    ]) {
      expect(plannedPaths).toContain(expected);
    }
    // tag 名在预演里给出，但不真打 tag
    expect(stepOf(result, 'tag')?.tag).toBe('v1.6.0');
    expect(stepOf(result, 'tag')?.cmd).toBe('git tag v1.6.0');
    expect(stepOf(result, 'market')?.cmd).toBe('npm run market:index');
    // 预演零 git 动作（不 add / commit / tag），只跑两次 npm publish --dry-run
    expect(calls.some((call) => call.cmd === 'git')).toBe(false);
    expect(calls.some((call) => call.args[0] === 'run' && call.args[1] === 'market:index')).toBe(false);
    expect(publishCalls(calls)).toHaveLength(2);
    // 人类出口：planned 用 → 图标（不再与 skipped 的 – 混用）
    expect(output).toContain('→ market');
    expect(output).toContain('→ archive-commit');
    expect(output).toContain('→ tag');
  });

  it('--publish + whoami 失败（带 --with-market）也不 publish，market 不被执行', () => {
    const cwd = makeProject();
    const { runner, calls } = makeRunner((cmd, args) =>
      cmd === 'npm' && args[0] === 'whoami' ? { status: 1 } : { status: 0 },
    );
    const { result } = execute(cwd, ['--skip-build', '--publish', '--with-market'], runner);

    expect(result.exitCode).toBe(1);
    expect(publishCalls(calls)).toHaveLength(0);
    expect(calls.some((call) => call.args[0] === 'run' && call.args[1] === 'market:index')).toBe(false);
    expect(stepOf(result, 'market')?.status).toBe('skipped');
  });

  it('--notes-only → 草稿含 flow-archive 的 REQ 标题 + stage 摘要的 REV 结论；默认零写盘、CHANGELOG 字节不变', () => {
    const cwd = makeProject();
    writeFixture(
      cwd,
      '.openfeel/flow-archive/v1.7.0.json',
      `${JSON.stringify(
        {
          version: 'v1.7.0',
          stages: { 'v1.7.0-stage-133': { name: 'v1.7.0-stage-133', phase: 'done' } },
          requirements: [
            { id: 'REQ-061', title: '发布链路一条命令', priority: 'P0' },
            { id: 'REQ-062', title: '文档类写白名单', priority: 'P1' },
          ],
        },
        null,
        2,
      )}\n`,
    );
    writeFixture(
      cwd,
      '.openfeel/log/archive-v1.7.0-stage-133.md',
      [
        '# 归档摘要 — v1.7.0-stage-133',
        '',
        '## 审查记录',
        '',
        '| ID | 标题 | 状态 | 优先级 |',
        '|----|------|------|--------|',
        '| REV-001 | [blocking] --dry-run 跳过 publish，A61.1 判据不满足 | resolved | medium |',
        '| REV-002 | [major] 草稿缺 stage 摘要 REV 结论 | resolved | low |',
        '',
      ].join('\n'),
    );
    const changelogBefore = readFileSync(join(cwd, 'CHANGELOG.md'), 'utf8');
    const { runner, calls } = makeRunner();
    const { result, output } = execute(cwd, ['1.7.0', '--notes-only'], runner);

    expect(result.exitCode).toBe(0);
    expect(result.draft).toContain('## [1.7.0]');
    expect(result.draft).toContain('**REQ-061** 发布链路一条命令');
    expect(result.draft).toContain('**REQ-062** 文档类写白名单');
    expect(result.draft).toContain('### 审查结论');
    expect(result.draft).toContain('**REV-001** [blocking] --dry-run 跳过 publish，A61.1 判据不满足（resolved，medium）');
    expect(result.draft).toContain('**REV-002** [major] 草稿缺 stage 摘要 REV 结论（resolved，low）');
    expect(output).toContain('发布链路一条命令');

    // A61.3：--notes-only 默认**零写盘**（草稿只进 stdout）——发布说明文件不落盘
    const draftPath = join(cwd, 'docs/releases/1.7.0.md');
    expect(existsSync(draftPath)).toBe(false);
    expect(result.draftPath).toBe(draftPath);
    expect(result.draftWritten).toBe(false);
    expect(output).toContain('未写盘');
    expect(readFileSync(join(cwd, 'CHANGELOG.md'), 'utf8')).toBe(changelogBefore);
    expect(result.steps.map((step) => step.status)).toEqual([
      'ok',
      'skipped',
      'skipped',
      'skipped',
      'skipped',
      'skipped',
    ]);
    expect(calls).toEqual([]);
  });

  it('A61.3 --notes-only --write-notes → 草稿落盘 docs/releases/<v>.md（内容=草稿），CHANGELOG 字节不变', () => {
    const cwd = makeProject();
    const changelogBefore = readFileSync(join(cwd, 'CHANGELOG.md'), 'utf8');
    const { runner, calls } = makeRunner();
    const { result } = execute(cwd, ['1.7.0', '--notes-only', '--write-notes'], runner);

    expect(result.exitCode).toBe(0);
    expect(result.draftWritten).toBe(true);
    const draftPath = join(cwd, 'docs/releases/1.7.0.md');
    expect(existsSync(draftPath)).toBe(true);
    expect(readFileSync(draftPath, 'utf8')).toBe(result.draft);
    expect(readFileSync(join(cwd, 'CHANGELOG.md'), 'utf8')).toBe(changelogBefore);
    expect(calls).toEqual([]);
  });

  it('A61.3 --write-notes 且目标已存在 → 不覆盖（字节不变，草稿仍打印）', () => {
    const cwd = makeProject();
    const draftPath = join(cwd, 'docs/releases/1.7.0.md');
    const handWritten = '# 人工写的发布说明\n';
    mkdirSync(join(cwd, 'docs/releases'), { recursive: true });
    writeFileSync(draftPath, handWritten, 'utf8');
    const { runner } = makeRunner();
    const { result } = execute(cwd, ['1.7.0', '--notes-only', '--write-notes'], runner);

    expect(result.exitCode).toBe(0);
    expect(result.draftWritten).toBe(false);
    expect(result.draft).toContain('## [1.7.0]');
    expect(readFileSync(draftPath, 'utf8')).toBe(handWritten);
  });

  it('--notes-only 且 stage 摘要缺失 → 跳过「审查结论」小节，不报错', () => {
    const cwd = makeProject();
    const { runner } = makeRunner();
    const { result } = execute(cwd, ['1.7.0', '--notes-only'], runner);

    expect(result.exitCode).toBe(0);
    expect(result.draft).toContain('## [1.7.0]');
    expect(result.draft).not.toContain('### 审查结论');
  });

  it('--commit-archive → git add 只含白名单路径，commit 后不 push / 不打 tag', () => {
    const cwd = makeProject();
    for (const relative of [
      '.openfeel/log/archive-v1.6.0-stage-132.md',
      '.openfeel/flow-archive/v1.6.0.json',
      '.openfeel/checkpoints/ckpt-1.json',
      'docs/releases/v1.6.0.md',
      'docs/VERSIONS.md',
      'docs/market/index.json',
    ]) {
      writeFixture(cwd, relative, '{}\n');
    }

    const { runner, calls } = makeRunner();
    const { result } = execute(cwd, ['--skip-build', '--commit-archive'], runner);

    expect(result.exitCode).toBe(0);
    expect(stepOf(result, 'archive-commit')?.status).toBe('ok');

    const allowed = [
      /^\.openfeel\/log\/archive-.+\.md$/,
      /^docs\/releases\/.+\.md$/,
      /^\.openfeel\/checkpoints\/.+\.json$/,
      /^\.openfeel\/flow-archive\/.+\.json$/,
      /^CHANGELOG\.md$/,
      /^docs\/VERSIONS\.md$/,
      /^docs\/market\/index\.json$/,
    ];
    const addCall = calls.find((call) => call.cmd === 'git' && call.args[0] === 'add');
    expect(addCall).toBeDefined();
    expect(addCall?.args.slice(0, 2)).toEqual(['add', '--']);
    const staged = addCall?.args.slice(2) ?? [];
    expect(staged.length).toBeGreaterThan(0);
    for (const file of staged) {
      expect(allowed.some((pattern) => pattern.test(file))).toBe(true);
    }
    expect(staged).toEqual(expect.arrayContaining([...expandArchiveArtifacts(cwd)]));

    const commitCall = calls.find((call) => call.cmd === 'git' && call.args[0] === 'commit');
    expect(commitCall?.args).toContain('chore(release): 1.6.0');
    expect(calls.some((call) => call.cmd === 'git' && call.args[0] === 'push')).toBe(false);
    expect(calls.some((call) => call.cmd === 'git' && call.args[0] === 'tag')).toBe(false);
    expect(ARCHIVE_ARTIFACTS).toEqual([
      '.openfeel/log/archive-*.md',
      'docs/releases/*.md',
      '.openfeel/checkpoints/*.json',
      '.openfeel/flow-archive/*.json',
      'CHANGELOG.md',
      'docs/VERSIONS.md',
      'docs/market/index.json',
    ]);
  });
});
