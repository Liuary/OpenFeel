/**
 * scripts/release.mjs 单测（stage-133 / REQ-061 A61.1—A61.4；stage-134 / REQ-068 A68.4）。
 *
 * 全部外部命令经注入的 runner 执行——**不调用真实 npm / git**，不会发布、不会提交、不会 push。
 * 覆盖：版本不一致早停 / whoami 失败早停且不 publish / 默认零真实发布 /
 * --dry-run 双包 dry-run publish（不调 whoami）/ --dry-run 六步链（market/archive-commit/tag
 * = planned + 归档 paths + tag 名）/ --publish 失败不 publish /
 * --notes-only 草稿（REQ 标题 + REV 结论）与默认零写盘 / --write-notes 落盘且不覆盖 /
 * 归档提交白名单 / A68.4：默认 publishMode=ci（push master 且版本变化由 CI 发布）、
 * --push（archive-commit / tag 之后推送，--dry-run 只 planned）、--publish 兜底路径。
 */

import { afterEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import {
  ARCHIVE_ARTIFACTS,
  expandArchiveArtifacts,
  incVersion,
  parseArgs,
  selectReleaseBaseline,
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

type PushState = { status: string; cmd?: string; reason?: string; note?: string; tag?: string };

const pushOf = (result: unknown): PushState | null =>
  ((result as { push?: PushState | null }).push ?? null);

const gitCalls = (calls: RunCall[], subcommand: string) =>
  calls.filter((call) => call.cmd === 'git' && call.args[0] === subcommand);

const publishCalls = (calls: RunCall[]) => calls.filter((call) => call.cmd === 'npm' && call.args[0] === 'publish');

describe('scripts/release.mjs', () => {
  it('版本不一致 → exit 1 并列出差异，不进入后续步骤', () => {
    const cwd = makeProject({ version: '1.6.0', dshVersion: '1.6.1' });
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
    expect(output).toContain('1.6.1');
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
      '.openfeel/flow-archive/v1.6.1.json',
      `${JSON.stringify(
        {
          version: 'v1.6.1',
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
    const { result, output } = execute(cwd, ['1.6.1', '--notes-only'], runner);

    expect(result.exitCode).toBe(0);
    expect(result.draft).toContain('## [1.6.1]');
    expect(result.draft).toContain('**REQ-061** 发布链路一条命令');
    expect(result.draft).toContain('**REQ-062** 文档类写白名单');
    expect(result.draft).toContain('### 审查结论');
    expect(result.draft).toContain('**REV-001** [blocking] --dry-run 跳过 publish，A61.1 判据不满足（resolved，medium）');
    expect(result.draft).toContain('**REV-002** [major] 草稿缺 stage 摘要 REV 结论（resolved，low）');
    expect(output).toContain('发布链路一条命令');

    // A61.3：--notes-only 默认**零写盘**（草稿只进 stdout）——发布说明文件不落盘
    const draftPath = join(cwd, 'docs/releases/1.6.1.md');
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
    const { result } = execute(cwd, ['1.6.1', '--notes-only', '--write-notes'], runner);

    expect(result.exitCode).toBe(0);
    expect(result.draftWritten).toBe(true);
    const draftPath = join(cwd, 'docs/releases/1.6.1.md');
    expect(existsSync(draftPath)).toBe(true);
    expect(readFileSync(draftPath, 'utf8')).toBe(result.draft);
    expect(readFileSync(join(cwd, 'CHANGELOG.md'), 'utf8')).toBe(changelogBefore);
    expect(calls).toEqual([]);
  });

  it('A61.3 --write-notes 且目标已存在 → 不覆盖（字节不变，草稿仍打印）', () => {
    const cwd = makeProject();
    const draftPath = join(cwd, 'docs/releases/1.6.1.md');
    const handWritten = '# 人工写的发布说明\n';
    mkdirSync(join(cwd, 'docs/releases'), { recursive: true });
    writeFileSync(draftPath, handWritten, 'utf8');
    const { runner } = makeRunner();
    const { result } = execute(cwd, ['1.6.1', '--notes-only', '--write-notes'], runner);

    expect(result.exitCode).toBe(0);
    expect(result.draftWritten).toBe(false);
    expect(result.draft).toContain('## [1.6.1]');
    expect(readFileSync(draftPath, 'utf8')).toBe(handWritten);
  });

  it('--notes-only 且 stage 摘要缺失 → 跳过「审查结论」小节，不报错', () => {
    const cwd = makeProject();
    const { runner } = makeRunner();
    const { result } = execute(cwd, ['1.6.1', '--notes-only'], runner);

    expect(result.exitCode).toBe(0);
    expect(result.draft).toContain('## [1.6.1]');
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

  it('A68.4 默认 publish 步骤 publishMode=ci（本地不发布：push master 且版本变化由 CI 自动发布）', () => {
    const cwd = makeProject();
    const { runner, calls } = makeRunner();
    const { result, output } = execute(cwd, ['--skip-build'], runner);

    expect(result.exitCode).toBe(0);
    expect(stepOf(result, 'publish')?.status).toBe('skipped');
    // A68.4：publish 步骤声明发布权已交给 CI（不再是 'skipped' 的本地语义）
    expect(stepOf(result, 'publish')?.publishMode).toBe('ci');
    // 既有断言口径（test :144）依赖的子串必须保留
    expect(output).toContain('publish skipped');
    expect(output).toContain('CI');
    // 默认零真实 publish、零 push
    expect(publishCalls(calls)).toHaveLength(0);
    expect(calls.some((call) => call.cmd === 'git' && call.args[0] === 'push')).toBe(false);
    expect(pushOf(result)?.status).toBe('skipped');
  });

  it('A68.4 默认（无 --push）→ push 步骤 skipped，零 git 推送', () => {
    const cwd = makeProject();
    const { runner, calls } = makeRunner();
    const { result } = execute(cwd, ['--skip-build'], runner);

    expect(pushOf(result)?.status).toBe('skipped');
    expect(gitCalls(calls, 'push')).toHaveLength(0);
    // push 不占六步 id（A61 冻结的 steps 数组不变）
    expect(result.steps.map((step) => step.id)).toEqual([
      'version',
      'build',
      'publish',
      'market',
      'archive-commit',
      'tag',
    ]);
  });

  it('A68.4 --dry-run --push → push 标 planned 并给出推送命令，不真推', () => {
    const cwd = makeProject();
    const { runner, calls } = makeRunner();
    const { result, output } = execute(cwd, ['--skip-build', '--dry-run', '--push'], runner);

    expect(result.exitCode).toBe(0);
    const push = pushOf(result);
    expect(push?.status).toBe('planned');
    expect(push?.cmd).toBe('git push');
    expect(output).toContain('→ push');
    // 预演零 git 动作（push 也不执行）
    expect(gitCalls(calls, 'push')).toHaveLength(0);
    expect(calls.some((call) => call.cmd === 'git')).toBe(false);
  });

  it('A68.4 --push（非 dry-run）→ 在 archive-commit 之后执行一次 git push', () => {
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
    const { result } = execute(cwd, ['--skip-build', '--commit-archive', '--push'], runner);

    expect(result.exitCode).toBe(0);
    expect(stepOf(result, 'archive-commit')?.status).toBe('ok');
    expect(pushOf(result)?.status).toBe('ok');

    const pushes = gitCalls(calls, 'push');
    expect(pushes).toHaveLength(1);
    expect(pushes[0].args).toEqual(['push']);
    // 顺序：git add → git commit → git push（push 是 commit 之后的收尾动作）
    const order = calls
      .filter((call) => call.cmd === 'git')
      .map((call) => call.args[0]);
    expect(order).toEqual(['add', 'commit', 'push']);
  });

  it('A68.4 --push --tag → 推 commit 后再推 tag（git push origin v<版本>）', () => {
    const cwd = makeProject();
    const { runner, calls } = makeRunner();
    const { result } = execute(cwd, ['--skip-build', '--tag', '--push'], runner);

    expect(result.exitCode).toBe(0);
    expect(stepOf(result, 'tag')?.status).toBe('ok');
    expect(pushOf(result)?.status).toBe('ok');
    expect(pushOf(result)?.cmd).toBe('git push && git push origin v1.6.0');

    const order = calls
      .filter((call) => call.cmd === 'git')
      .map((call) => call.args.join(' '));
    expect(order).toEqual(['tag v1.6.0', 'push', 'push origin v1.6.0']);
  });

  it('A68.4 --push 失败 → exit 1 并记录 push 失败原因', () => {
    const cwd = makeProject();
    const { runner, calls } = makeRunner((cmd, args) =>
      cmd === 'git' && args[0] === 'push' ? { status: 1, stderr: 'rejected' } : { status: 0 },
    );
    const { result } = execute(cwd, ['--skip-build', '--push'], runner);

    expect(result.exitCode).toBe(1);
    expect(result.ok).toBe(false);
    expect(pushOf(result)?.status).toBe('failed');
    expect(pushOf(result)?.reason).toContain('git push');
    expect(gitCalls(calls, 'push')).toHaveLength(1);
  });

  it('A68.4 --publish 保留为人工兜底：whoami 通过后 publishMode=real 且双包真实发布', () => {
    const cwd = makeProject();
    const { runner, calls } = makeRunner();
    const { result } = execute(cwd, ['--skip-build', '--publish'], runner);

    expect(result.exitCode).toBe(0);
    expect(stepOf(result, 'publish')?.status).toBe('ok');
    expect(stepOf(result, 'publish')?.publishMode).toBe('real');

    const publishes = publishCalls(calls);
    expect(publishes).toHaveLength(2);
    for (const call of publishes) {
      expect(call.args).toEqual(['publish', '--access', 'public']);
    }
    expect(calls.filter((call) => call.cmd === 'npm' && call.args[0] === 'whoami')).toHaveLength(1);
    // 兜底路径同样不 push（push 只认 --push）
    expect(gitCalls(calls, 'push')).toHaveLength(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════
// v1.6.5 / REQ-074 A74.2 —— `--bump`（独立模式：版本只在发布时动）
// 既有 20 个用例零改动；本段全部为新增（bump / 幂等 / 批次清单 / 同名归档 / 24h）。
// ═══════════════════════════════════════════════════════════════════════

type BumpSummary = {
  from?: string | null;
  to?: string | null;
  kind?: string;
  reason?: string | null;
  files?: string[];
  written?: boolean;
  noop?: boolean;
  dryRun?: boolean;
  baseline?: string;
};

type BatchSummary = {
  version?: string;
  reqs?: string[];
  stages?: string[];
  files?: string[] | null;
  filesReason?: string | null;
  warn?: string | null;
  reason?: string;
};

type BumpRunResult = {
  exitCode: number;
  ok: boolean;
  mode: string;
  version?: string | null;
  batch?: BatchSummary;
  bump?: BumpSummary;
};

/** 写一个带 flow.json / flow-archive / 可写 package-lock 的发布夹具。 */
function makeBumpProject(options: {
  version?: string;
  archives?: string[];
  archivedAt?: string;
  requirements?: Array<{ id: string; status: string; target_version?: string }>;
  stages?: unknown;
  lastReleaseAt?: string | null;
} = {}): string {
  const {
    version = '1.6.4',
    archives = ['v1.6.4.json'],
    archivedAt = '2026-11-20T00:00:00.000Z',
    requirements = [
      { id: 'REQ-021', status: 'done', target_version: 'v1.5.6' },
      { id: 'REQ-025', status: 'done', target_version: 'v1.5.6' },
      { id: 'REQ-030', status: 'done', target_version: 'v1.5.6' },
      { id: 'REQ-072', status: 'done', target_version: 'v1.6.5' },
      { id: 'REQ-073', status: 'done', target_version: 'v1.6.5' },
      { id: 'REQ-074', status: 'done', target_version: 'v1.6.5' },
      { id: 'REQ-075', status: 'in_progress', target_version: 'v1.6.5' },
    ],
    stages = [{ id: 'v1.6.5-stage-138', requirements: [{ id: 'REQ-072' }, { id: 'REQ-074' }] }],
    lastReleaseAt = null,
  } = options;
  const cwd = makeProject({ version });
  writeFixture(
    cwd,
    'package-lock.json',
    `${JSON.stringify(
      { name: 'openfeel', version, lockfileVersion: 3, packages: { '': { name: 'openfeel', version } } },
      null,
      2,
    )}\n`,
  );
  writeFixture(cwd, '.openfeel/flow.json', `${JSON.stringify({ requirements, stages }, null, 2)}\n`);
  for (const file of archives) {
    writeFixture(
      cwd,
      `.openfeel/flow-archive/${file}`,
      `${JSON.stringify(
        { version: file.replace(/\.json$/, ''), stages: {}, requirements: [], archived_at: archivedAt },
        null,
        2,
      )}\n`,
    );
  }
  if (lastReleaseAt !== null) {
    writeFixture(cwd, '.openfeel/release/last.json', `${JSON.stringify({ at: lastReleaseAt }, null, 2)}\n`);
  }
  return cwd;
}

/** 三个版本来源的字节快照（零写盘断言用）。 */
function versionSnapshot(cwd: string): string {
  return ['package.json', 'dsh/package.json', 'package-lock.json']
    .filter((rel) => existsSync(join(cwd, rel)))
    .map((rel) => readFileSync(join(cwd, rel), 'utf8'))
    .join('\u0000');
}

/** bump 模式执行器（可注入 nowMs，保证 24h 判定确定）。 */
function runBump(
  cwd: string,
  argv: string[],
  runner: Runner,
  extra: { nowMs?: () => number } = {},
): { result: BumpRunResult; messages: string[]; output: string } {
  const messages: string[] = [];
  const result = runRelease({
    argv,
    cwd,
    runner,
    log: (line: unknown) => messages.push(String(line)),
    ...extra,
  }) as BumpRunResult;
  return { result, messages, output: messages.join('\n') };
}

const FAR_PAST = '2026-11-20T00:00:00.000Z';

describe('REQ-074 A74.2 — --bump：版本起点 / 本批次清单 / 确认门', () => {
  it('incVersion 三档：patch / minor / major', () => {
    expect(incVersion('1.6.4', 'patch')).toBe('1.6.5');
    expect(incVersion('1.6.4', 'minor')).toBe('1.7.0');
    expect(incVersion('1.6.4', 'major')).toBe('2.0.0');
    expect(() => incVersion('1.6.4', 'nope')).toThrow();
  });

  it('--bump patch --dry-run：目标=基线递增 + 本批次只含目标版本 done（陈旧 done 不混入）+ files=null + 零写盘零 git', () => {
    const cwd = makeBumpProject();
    const before = versionSnapshot(cwd);
    const { runner, calls } = makeRunner();
    const { result, output } = runBump(cwd, ['--bump', 'patch', '--dry-run', '--skip-build'], runner, {
      nowMs: () => Date.parse('2026-11-27T00:00:00.000Z'),
    });

    expect(result.exitCode).toBe(0);
    expect(result.mode).toBe('bump');
    expect(result.version).toBe('1.6.5');
    expect(result.bump?.from).toBe('1.6.4');
    expect(result.bump?.to).toBe('1.6.5');
    expect(result.bump?.kind).toBe('patch');
    expect(result.bump?.written).toBe(false);
    expect(result.bump?.baseline).toBe('1.6.4');
    // 批次清单按版本过滤：17 条旧 done 中的样本 + REQ-075(in_progress) 都不混入
    expect(result.batch?.reqs).toEqual(['REQ-072', 'REQ-073', 'REQ-074']);
    expect(result.batch?.stages).toEqual(['v1.6.5-stage-138']);
    expect(result.batch?.files).toBeNull();
    expect(result.batch?.filesReason).toBe('dry-run');
    expect(output).toContain('本批次');
    expect(output).toContain('1.6.4 → 1.6.5');
    // 零写盘 + 零 git（dry-run 不跑任何子进程）
    expect(versionSnapshot(cwd)).toBe(before);
    expect(calls).toEqual([]);
  });

  it('--bump 与 --publish / --push / --tag / --commit-archive / --notes-only 互斥（INVALID_ARGUMENT、零写盘）', () => {
    for (const flag of ['--publish', '--push', '--tag', '--commit-archive', '--notes-only']) {
      expect(() => parseArgs(['--bump', 'patch', flag])).toThrow(/互斥/);
    }
    const cwd = makeBumpProject();
    const before = versionSnapshot(cwd);
    const { runner, calls } = makeRunner();
    const { result } = runBump(cwd, ['--bump', 'patch', '--publish'], runner);

    expect(result.exitCode).toBe(1);
    expect(result.mode).toBe('invalid');
    expect(versionSnapshot(cwd)).toBe(before);
    expect(calls).toEqual([]);
  });

  it('--bump patch 缺 --confirm → exit 1 且三文件字节不变', () => {
    const cwd = makeBumpProject();
    const before = versionSnapshot(cwd);
    const { runner } = makeRunner();
    const { result, output } = runBump(cwd, ['--bump', 'patch', '--skip-build'], runner, {
      nowMs: () => Date.parse('2026-11-27T00:00:00.000Z'),
    });

    expect(result.exitCode).toBe(1);
    expect(result.bump?.written).toBe(false);
    expect(output).toContain('--confirm');
    expect(versionSnapshot(cwd)).toBe(before);
  });

  it('--bump minor 缺 --reason → exit 1 且零写盘；带 --reason + --confirm 才写 1.7.0', () => {
    const cwd = makeBumpProject();
    const before = versionSnapshot(cwd);
    const { runner } = makeRunner();
    const nowMs = () => Date.parse('2026-11-27T00:00:00.000Z');

    const missingReason = runBump(cwd, ['--bump', 'minor', '--confirm', '--skip-build'], runner, { nowMs });
    expect(missingReason.result.exitCode).toBe(1);
    expect(missingReason.output).toContain('--reason');
    expect(versionSnapshot(cwd)).toBe(before);

    const withReason = runBump(
      cwd,
      ['--bump', 'minor', '--reason', '新增用户可见能力', '--confirm', '--skip-build'],
      runner,
      { nowMs },
    );
    expect(withReason.result.exitCode).toBe(0);
    expect(withReason.result.bump?.to).toBe('1.7.0');
    expect(withReason.result.bump?.written).toBe(true);
    expect(JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).version).toBe('1.7.0');
    expect(JSON.parse(readFileSync(join(cwd, 'dsh/package.json'), 'utf8')).version).toBe('1.7.0');
    const lock = JSON.parse(readFileSync(join(cwd, 'package-lock.json'), 'utf8'));
    expect(lock.version).toBe('1.7.0');
    expect(lock.packages[''].version).toBe('1.7.0');
  });

  it('幂等：当前版本已等于目标 → no-op、exit 0、零写盘（不是 1.6.6）', () => {
    const cwd = makeBumpProject({ version: '1.6.5', archives: ['v1.6.4.json'] });
    const before = versionSnapshot(cwd);
    const { runner } = makeRunner();
    const { result, output } = runBump(cwd, ['--bump', 'patch', '--confirm'], runner, {
      nowMs: () => Date.parse('2026-11-27T00:00:00.000Z'),
    });

    expect(result.exitCode).toBe(0);
    expect(result.bump?.noop).toBe(true);
    expect(output).toContain('no-op: already 1.6.5');
    expect(versionSnapshot(cwd)).toBe(before);
  });

  it('距上次发布 < 24h 再发 patch：warn + 缺 --confirm-twice → exit 1 零写盘', () => {
    const cwd = makeBumpProject({ lastReleaseAt: '2026-11-26T16:00:00.000Z' });
    const before = versionSnapshot(cwd);
    const { runner } = makeRunner();
    const { result, output } = runBump(cwd, ['--bump', 'patch', '--confirm', '--skip-build'], runner, {
      nowMs: () => Date.parse('2026-11-26T17:00:00.000Z'),
    });

    expect(result.exitCode).toBe(1);
    expect(result.batch?.warn).toContain('< 24h');
    expect(output).toContain('--confirm-twice');
    expect(versionSnapshot(cwd)).toBe(before);
  });

  it('距上次发布 < 24h + --confirm-twice → 放行并写 1.6.5', () => {
    const cwd = makeBumpProject({ lastReleaseAt: '2026-11-26T16:00:00.000Z' });
    const { runner } = makeRunner();
    const { result } = runBump(
      cwd,
      ['--bump', 'patch', '--confirm', '--confirm-twice', '--skip-build'],
      runner,
      { nowMs: () => Date.parse('2026-11-26T17:00:00.000Z') },
    );

    expect(result.exitCode).toBe(0);
    expect(result.bump?.written).toBe(true);
    expect(JSON.parse(readFileSync(join(cwd, 'package.json'), 'utf8')).version).toBe('1.6.5');
  });

  it('基线过期（目标低于当前版本）→ exit 1 并指出基线过期', () => {
    const cwd = makeBumpProject({ version: '1.7.0', archives: ['v1.6.4.json'] });
    const before = versionSnapshot(cwd);
    const { runner } = makeRunner();
    const { result, output } = runBump(cwd, ['--bump', 'patch', '--confirm', '--skip-build'], runner, {
      nowMs: () => Date.parse('2026-11-27T00:00:00.000Z'),
    });

    expect(result.exitCode).toBe(1);
    expect(output).toContain('基线过期');
    expect(versionSnapshot(cwd)).toBe(before);
  });

  it('基线按 semver 选：不按 mtime，未来版本归档 v1.7.0.json 不参与', () => {
    const cwd = makeBumpProject({ archives: ['v1.6.4.json', 'v1.7.0.json'] });
    const { runner } = makeRunner();
    const { result } = runBump(cwd, ['--bump', 'patch', '--dry-run'], runner, { nowMs: () => Date.parse(FAR_PAST) });

    expect(result.exitCode).toBe(0);
    expect(result.bump?.baseline).toBe('1.6.4');
    expect(result.bump?.to).toBe('1.6.5');
  });

  it('同名归档（v1.6.4.json 与 1.6.4.json）不重复计入、取同一个基线', () => {
    const cwd = makeBumpProject({ archives: ['v1.6.4.json', '1.6.4.json'] });
    const { runner } = makeRunner();
    const { result } = runBump(cwd, ['--bump', 'patch', '--dry-run'], runner, { nowMs: () => Date.parse(FAR_PAST) });

    expect(result.exitCode).toBe(0);
    expect(result.bump?.baseline).toBe('1.6.4');
    expect(result.bump?.to).toBe('1.6.5');
  });

  it('flow.json 缺失 → 批次清单降级（reason=flow-unavailable），不阻断 dry-run', () => {
    const cwd = makeBumpProject();
    rmSync(join(cwd, '.openfeel/flow.json'));
    const { runner } = makeRunner();
    const { result } = runBump(cwd, ['--bump', 'patch', '--dry-run'], runner, { nowMs: () => Date.parse(FAR_PAST) });

    expect(result.exitCode).toBe(0);
    expect(result.batch?.reason).toBe('flow-unavailable');
    expect(result.batch?.reqs).toEqual([]);
    expect(result.batch?.files).toBeNull();
  });

  it('--json 末位追加 batch / bump 两键（既有键序不变）', () => {
    const cwd = makeBumpProject();
    const { runner } = makeRunner();
    const { messages } = runBump(cwd, ['--bump', 'patch', '--dry-run', '--json'], runner, {
      nowMs: () => Date.parse(FAR_PAST),
    });
    const payloadLine = messages.filter((line) => line.trim().startsWith('{')).pop();
    expect(payloadLine).toBeTruthy();
    const payload = JSON.parse(payloadLine as string);
    expect(Object.keys(payload).slice(0, 9)).toEqual([
      'ok',
      'exitCode',
      'version',
      'mode',
      'steps',
      'push',
      'draft',
      'draftPath',
      'draftWritten',
    ]);
    expect(Object.keys(payload).slice(-2)).toEqual(['batch', 'bump']);
    expect(payload.batch.version).toBe('1.6.5');
    expect(payload.bump.to).toBe('1.6.5');
  });
});
