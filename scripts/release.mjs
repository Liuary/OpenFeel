#!/usr/bin/env node
/**
 * `npm run release` —— 发布链路一条命令。
 *
 * 把「版本一致性校验 → build → 双包 publish → market:index → 归档产物提交 → tag」串起来，
 * 但**默认不真发**：真实 `npm publish` 的唯一开关是 `--publish`，且必须先过 `npm whoami`。
 *
 * 发布语义（与 CI 对齐；v1.6.1 / REQ-068 A68.4）：
 *   - **默认只做 version 校验 + build**：`publish` / `market` / `archive-commit` / `tag` 全 `skipped`，
 *     分别由 `--publish` / `--with-market` / `--commit-archive` / `--tag` 单点开启。
 *   - **标准发布路径 = push 到 master**：`.github/workflows/ci.yml` 的 publish job 在
 *     `push` 到 `master` 且 `package.json` 版本 ≠ npm 已发版本时自动 `npm publish`
 *     （**tag / release 不触发**）。本地脚本只需 `--push` 推送 commit（打了 tag 时一并推 tag）。
 *   - `--publish` 保留为**人工兜底**（CI 失败时重试），不是常规路径。
 *
 * 安全语义（与 stage-133 / REQ-061 的 A61.1—A61.4 对齐）：
 *   - 无 `--publish` → 零真实 publish：给了 `--dry-run` 则根包与 dsh 子包各跑一次
 *     `npm publish --dry-run --access public`（`steps[].publishMode='dry-run'`）；
 *     既无 `--dry-run` 也无 `--publish` 时 publish 步骤 `skipped`（`cmd` 仅作说明书）。
 *     预演命中「目标版本已发布」时子步记 skipped 并注记、链路继续；真实发布严格失败。
 *   - `--publish` → 先 `npm whoami`；失败 exit 1 早停，后续步骤全 `skipped`，只打印
 *     「请先运行 npm login（不会打印 token）」——任何子进程输出都不回显，避免 token 泄漏。
 *     `whoami` 只在真实发布（`--publish` 且非 `--dry-run`）时检查。
 *   - `--dry-run` 与 `--publish` 互斥（同时给 → exit 1）。
 *   - `--dry-run` 预演的是**整条六步链**：market / archive-commit / tag 三步不再标 `skipped`，
 *     而是标 `planned` 并给出「将要执行」的 cmd / paths（ARCHIVE_ARTIFACTS 展开后的相对路径）
 *     / tag 名，使 `--dry-run --json` 可以断言归档产物清单（A61.1 / A61.4）；
 *     预演仍零写盘（不跑 market:index、不 git add / commit、不打 tag）。
 *   - `--notes-only` 只把 CHANGELOG 草稿打印到 stdout，**默认零写盘**（不写
 *     `docs/releases/<version>.md`、不覆盖 `CHANGELOG.md`）；只有 `--write-notes` 才落
 *     `docs/releases/<version>.md`，且**已存在不覆盖**（人工确认后手工合并）。
 *   - `--commit-archive` 才做归档产物提交，只 `git add` 白名单（ARCHIVE_ARTIFACTS），
 *     **不 push、不打 tag**；`--tag` 才 `git tag v<version>`。
 *   - `--push` 是**收尾动作**（不进六步链）：在 `archive-commit` / `tag` 之后执行 `git push`
 *     （打了 tag 时再 `git push origin v<version>`）；`--dry-run` 下只标 `planned`，绝不真推。
 *     默认（不给 `--push`）零 git 推送。
 *
 * 可测试性：所有外部命令都经可注入的 `runner(command, args, options)`；
 * `runRelease()` 额外接受 `readText` / `writeText` / `fileExists` / `now` / `log` 注入。
 *
 * 用法（仓库根）：
 *   node scripts/release.mjs --help
 *   npm run release -- --dry-run --skip-build          # 安全预演（六步链 planned）
 *   npm run release -- --publish                       # 真实发布（双包）
 *   npm run release -- 1.6.1 --notes-only              # 生成 CHANGELOG 草稿（只打印）
 *   npm run release -- 1.6.1 --notes-only --write-notes # 草稿落盘（已存在不覆盖）
 *   npm run release -- --commit-archive --tag          # 归档产物提交 + 打 tag
 *   npm run release -- --push                          # 推送 commit（CI 按版本差自动发布）
 */

import { spawnSync } from 'node:child_process';
import {
  closeSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  openSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

/** 六步链（固定顺序；`--json` 里的 `steps[].id` 逐字等于本数组）。 */
export const STEPS = ['version', 'build', 'publish', 'market', 'archive-commit', 'tag'];

/**
 * 归档产物白名单——**单点定义**（reviewer 用 `grep -c ARCHIVE_ARTIFACTS` 断言只有一处常量）。
 * 顺序即 `git add` 顺序；含 `*` 的项由 expandArchiveArtifacts() 在本地展开，
 * 不存在匹配时不会把未匹配的通配符交给 git（那会让 git add 直接 fatal）。
 */
export const ARCHIVE_ARTIFACTS = [
  '.openfeel/log/archive-*.md',
  'docs/releases/*.md',
  '.openfeel/checkpoints/*.json',
  '.openfeel/flow-archive/*.json',
  'CHANGELOG.md',
  'docs/VERSIONS.md',
  'docs/market/index.json',
];

const SEMVER_RE = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

/** `--bump` 的三个档位（v1.6.5 / REQ-074 A74.2）。 */
const BUMP_KINDS = ['patch', 'minor', 'major'];

/** 上次发布时间标记（本版只读；缺失时回退 flow-archive 的 `archived_at`）。 */
const RELEASE_MARKER_REL = ['', '.openfeel', 'release', 'last.json'];

const DAY_MS = 24 * 60 * 60 * 1000;

const HELP = `
npm run release —— 发布链路一条命令

  node scripts/release.mjs [版本号] [选项]

选项
  --publish          人工兜底：真实发布两个包（openfeel + dsh/ 下的 openfeel-dsh）。
                     唯一真实发布开关；先执行 npm whoami，失败即早停。
                     常规路径不用它 —— push 到 master 后由 CI 的 publish job 自动发布。
  --dry-run          安全预演整条六步链：publish 走 npm publish --dry-run（不真发）、
                     market/archive-commit/tag 标 planned 并给出将执行的 cmd/paths/tag 名；
                     不真提交、不打 tag、不真 push；与 --publish 互斥。
  --skip-build       跳过 npm run build。
  --with-market      即使安全预演也执行 npm run market:index。
  --commit-archive   提交归档产物（只 git add 白名单；不 push）。
  --tag              打 tag v<版本>（不 push）。
  --push             收尾推送：archive-commit / tag 之后执行 git push（打了 tag 时
                     再 git push origin v<版本>）。--dry-run 下只标 planned，不真推。
                     推到 master 且版本与 npm 不同 → CI 自动 npm publish（tag/release 不触发）。
  --notes-only       只生成 CHANGELOG 草稿并打印到 stdout；默认零写盘、不发布。
  --write-notes      与 --notes-only 同用：把草稿写入 docs/releases/<版本>.md
                     （文件已存在则不覆盖；--dry-run 下仍不写）。
  --json             机器可读输出（steps[].id = version/build/publish/market/archive-commit/tag；
                     push 是六步之外的收尾动作，单独在顶层 push 字段；--bump 模式在末位追加
                     batch 与 bump 两个键）。
  -h, --help         显示本帮助。

版本递增（v1.6.5 / REQ-074 A74.2；独立模式，不进六步链）
  --bump <kind>      patch | minor | major：目标版本 = 上次发布基线递增（不取当前 package.json）。
                     当前版本已等于目标 → 打印 no-op、exit 0、零写盘。
                     写 package.json / dsh/package.json / package-lock.json 的 4 个版本字段；
                     不写 CHANGELOG / VERSIONS / 文档（归发布批次人工）。
  --reason <text>    minor / major 必须给出理由（缺 → exit 1 零写盘）。
  --confirm          真实 bump 必须显式确认（缺 → exit 1 零写盘）；只约束 --bump，
                     --publish / --push 语义不变（不需要它）。
  --confirm-twice    距上次发布 < 24h 仍要再发 patch 时的第二次确认（与 --confirm 各管各的）；
                     只 warn 不是硬门。数据源 .openfeel/release/last.json → flow-archive 的
                     archived_at；都拿不到则不 warn。
  --dry-run --bump  只打印 old → new + 本批次清单（REQ / 阶段 / 改动文件=null），零写盘零 git。

批次清单（--bump 打印；真实模式下才跑 git）
  只列 status=done 且（target_version = 目标版本 或 关联 <目标版本>-stage-* 阶段）的 REQ；
  旧的 done 会被过滤掉，绝不按全量 done 出清单。改动文件数用
  git rev-list -1 HEAD -- .openfeel/flow-archive/<上次版本>.json + git diff --name-only，
  再并上 git status --porcelain 去重（不依赖 git tag）。

行为
  1. 版本一致性：package.json.version === dsh/package.json.version，
     且 CHANGELOG.md 顶部有「## [<版本>]」段；不一致 exit 1 并列出差异。
  2. build：npm run build（--skip-build 可跳过）。
  3. publish：默认 skipped（publishMode=ci）—— 本地不发布，push 到 master 且
     package.json 版本 ≠ npm 已发版本时由 CI publish job 自动 npm publish（tag/release 不触发）。
     只有 --publish 才真实发布（人工兜底）；先 npm whoami，失败 exit 1 并提示 npm login
     （不打印 token）。根包与 dsh 子包各一次 npm publish --access public。
     --dry-run 预演时同样双包各一次 npm publish --dry-run --access public（publishMode=dry-run），
     whoami 只在真实发布时检查。预演若命中「目标版本已发布」（npm 拒绝重发），
     该子步记为 skipped 并注记，链路继续（预演验证链路；真实发布会严格失败）。
  4. market：npm run market:index（真实发布或 --with-market 时执行；--dry-run 只标 planned）。
  5. archive-commit：只有 --commit-archive 才执行；git add 白名单后
     git commit -m "chore(release): <版本>"；不 push、不打 tag。
     --dry-run 下标 planned，并在 steps[].paths 给出 ARCHIVE_ARTIFACTS 展开后的将提交清单。
  6. tag：只有 --tag 才执行 git tag v<版本>；--dry-run 下标 planned 并给出 tag 名。
  7. --notes-only：从 .openfeel/flow-archive/<版本>.json 的需求标题 + stage 摘要
     （.openfeel/log/archive-<stage>.md）的 REV 结论 + docs/releases/<版本>.md
     生成「## [<版本>] - <日期>」草稿；**只打印到 stdout，默认不写任何文件**。
     --write-notes 才写 docs/releases/<版本>.md（已存在不覆盖）。
     stage 摘要缺失或无 REV 结论时跳过「### 审查结论」小节（不报错）。
     **不覆盖 CHANGELOG.md**（人工确认后手工合并）。
  8. push：只有 --push 才推送（六步之外的收尾动作，不占 steps[].id）；
     --dry-run 下标 planned；默认 skipped，零 git push。

安全边界
  - 默认（不带 --publish）零真实 publish；不给 --dry-run 也不真发。
  - 默认（不带 --push）零 git 推送；--dry-run + --push 也只标 planned。
  - 子进程输出不回显（whoami 尤其），避免 token 出现在日志里。
  - 归档提交发生在发版窗口，由人类在外部终端执行；本脚本不新增任何 guard 放行路径。
`;

const statusIcon = (status) => {
  if (status === 'ok') return '✓';
  if (status === 'failed') return '✗';
  if (status === 'planned') return '→';
  return '–';
};

/** 解析开关闭集；未知参数 / 非法版本号抛 INVALID_ARGUMENT。 */
export function parseArgs(argv = []) {
  const opts = {
    version: null,
    skipBuild: false,
    publish: false,
    dryRun: false,
    commitArchive: false,
    tag: false,
    push: false,
    notesOnly: false,
    writeNotes: false,
    withMarket: false,
    json: false,
    help: false,
    // v1.6.5 / REQ-074 A74.2：版本只在发布窗口动
    bump: null,
    confirm: false,
    confirmTwice: false,
    reason: null,
  };
  const invalid = (message) => {
    const err = new Error(message);
    err.code = 'INVALID_ARGUMENT';
    return err;
  };

  for (let index = 0; index < argv.length; index += 1) {
    const raw = argv[index];
    if (raw === '--skip-build') opts.skipBuild = true;
    else if (raw === '--publish') opts.publish = true;
    else if (raw === '--dry-run') opts.dryRun = true;
    else if (raw === '--commit-archive') opts.commitArchive = true;
    else if (raw === '--tag') opts.tag = true;
    else if (raw === '--push') opts.push = true;
    else if (raw === '--notes-only') opts.notesOnly = true;
    else if (raw === '--write-notes') opts.writeNotes = true;
    else if (raw === '--with-market') opts.withMarket = true;
    else if (raw === '--json') opts.json = true;
    else if (raw === '--help' || raw === '-h') opts.help = true;
    else if (raw === '--confirm') opts.confirm = true;
    else if (raw === '--confirm-twice') opts.confirmTwice = true;
    else if (raw === '--bump') {
      const value = argv[index + 1];
      if (typeof value !== 'string' || value.startsWith('--')) {
        throw invalid('--bump 缺省值（应为 patch | minor | major）');
      }
      index += 1;
      if (!BUMP_KINDS.includes(value)) {
        throw invalid(`--bump 只接受 patch | minor | major（收到 ${value}）`);
      }
      opts.bump = value;
    } else if (raw === '--reason') {
      const value = argv[index + 1];
      if (typeof value !== 'string' || value.trim() === '') {
        throw invalid('--reason 缺少说明文本（minor / major 必须给出理由）');
      }
      index += 1;
      opts.reason = value;
    } else if (typeof raw === 'string' && raw.startsWith('--')) {
      throw invalid(`未知参数：${raw}（用 --help 查看用法）`);
    } else if (typeof raw === 'string') {
      if (opts.version !== null) throw invalid(`只能指定一个版本号（已有 ${opts.version}，又收到 ${raw}）`);
      const candidate = raw.startsWith('v') ? raw.slice(1) : raw;
      if (!SEMVER_RE.test(candidate)) throw invalid(`版本号不是合法 SemVer：${raw}`);
      opts.version = candidate;
    }
  }
  // `--bump` 是**独立模式**（不进六步链）：与真实发布 / 提交 / tag / 草稿互斥。
  if (opts.bump !== null) {
    const conflicts = [
      ['--publish', opts.publish],
      ['--push', opts.push],
      ['--commit-archive', opts.commitArchive],
      ['--tag', opts.tag],
      ['--notes-only', opts.notesOnly],
    ];
    for (const [flag, enabled] of conflicts) {
      if (enabled) {
        throw invalid(`--bump 与 ${flag} 互斥（bump 是独立模式，不进六步链）`);
      }
    }
  }
  // `--write-notes` 只在草稿模式下有意义（其余模式没有「草稿文件」可写）
  if (opts.writeNotes && !opts.notesOnly) {
    throw invalid('--write-notes 需要与 --notes-only 一起使用（只有草稿模式才会落盘）');
  }
  return opts;
}

/** CHANGELOG.md 顶部第一个 `## [x.y.z]` 段里的版本号；没有则 null。 */
export function topChangelogVersion(text) {
  const match = /^## \[([^\]]+)\]/.exec(String(text ?? ''));
  return match ? match[1].trim() : null;
}

// ── 版本递增 / 发布基线 / 批次清单（v1.6.5 / REQ-074 A74.2）────────────────────
// 单点口径：目标版本 = inc(上次发布基线, kind)，**不取当前 package.json**。
// 基线 = `.openfeel/flow-archive/*.json` 中 semver **不大于当前版本**的最新一版
// （不按 mtime —— 仓库里存在 mtime 更新的 v1.7.0.json，按 mtime 会选错）。

/** 解析 SemVer 的数字三段（预发布 / 构建元数据忽略；非法 → null）。 */
const SEMVER_PARTS_RE = /^(\d+)\.(\d+)\.(\d+)(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;

export function parseSemverParts(value) {
  const m = SEMVER_PARTS_RE.exec(String(value ?? '').trim());
  if (!m) return null;
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** 比较两个 SemVer（只比数字三段；非法视为最小）。 */
export function compareSemver(a, b) {
  const left = parseSemverParts(a) ?? { major: 0, minor: 0, patch: 0 };
  const right = parseSemverParts(b) ?? { major: 0, minor: 0, patch: 0 };
  for (const key of ['major', 'minor', 'patch']) {
    if (left[key] !== right[key]) return left[key] - right[key];
  }
  return 0;
}

/**
 * 递增版本号。
 * - `patch`：Z+1（minor / major 归零）
 * - `minor`：Y+1，Z 归零
 * - `major`：X+1，Y / Z 归零
 */
export function incVersion(version, kind) {
  const parsed = parseSemverParts(version);
  if (!parsed) throw new Error(`不是合法 SemVer：${version}`);
  if (!BUMP_KINDS.includes(kind)) throw new Error(`未知递增档位：${kind}`);
  if (kind === 'major') return `${parsed.major + 1}.0.0`;
  if (kind === 'minor') return `${parsed.major}.${parsed.minor + 1}.0`;
  return `${parsed.major}.${parsed.minor}.${parsed.patch + 1}`;
}

/** 时间戳归一（数字按 ms；小于 1e11 的数字按秒；字符串走 Date.parse）。 */
function toTimestampMs(value) {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value > 1e11 ? value : value * 1000;
  }
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : parsed;
  }
  return null;
}

/** 读 `.openfeel/release/last.json` 的 `at`（本版**只读不写**；缺失 / 非法 → null）。 */
export function readReleaseMarker({ cwd, readText, fileExists }) {
  const path = join(cwd, ...RELEASE_MARKER_REL);
  if (!fileExists(path)) return null;
  try {
    const parsed = JSON.parse(readText(path));
    const ms = toTimestampMs(parsed?.at ?? parsed?.releasedAt ?? null);
    return ms === null ? null : { path, ms };
  } catch {
    return null;
  }
}

/**
 * 选发布基线：flow-archive 里 **semver ≤ 当前版本** 的最新一版。
 * 找不到（空目录 / 全解析失败）→ 降级用当前版本并标 `fallback`（不阻断，但会 warn）。
 */
export function selectReleaseBaseline({ cwd, currentVersion, readText, readDir }) {
  const dir = join(cwd, '.openfeel', 'flow-archive');
  let names = [];
  try {
    names = readDir(dir);
  } catch {
    names = [];
  }
  let best = null;
  for (const name of names) {
    if (typeof name !== 'string' || !/\.json$/i.test(name)) continue;
    const bare = name.replace(/\.json$/i, '').replace(/^v/i, '');
    const parsed = parseSemverParts(bare);
    if (!parsed) continue;
    if (parseSemverParts(currentVersion) && compareSemver(bare, currentVersion) > 0) continue;
    let archive = null;
    try {
      archive = JSON.parse(readText(join(dir, name)));
    } catch {
      archive = null;
    }
    const candidate = {
      version: bare,
      parsed,
      archivedAt: archive?.archived_at ?? archive?.archivedAt ?? null,
      archiveFile: name,
    };
    if (best === null || compareSemver(bare, best.version) > 0) best = candidate;
  }
  if (best !== null) return best;
  return {
    version: String(currentVersion),
    parsed: parseSemverParts(currentVersion),
    archivedAt: null,
    archiveFile: null,
    fallback: true,
  };
}

/** 从 flow.json（或测试夹具）里取阶段列表；兼容数组与「id → 阶段」对象两种形状。 */
export function collectFlowStages(flow) {
  const raw = flow?.stages;
  const list = [];
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (entry && typeof entry === 'object') list.push(entry);
    }
  } else if (raw && typeof raw === 'object') {
    for (const [key, entry] of Object.entries(raw)) {
      list.push({ id: key, ...(entry && typeof entry === 'object' ? entry : {}) });
    }
  }
  return list;
}

/** 阶段关联的需求 id（兼容 `requirements: [{id}]` / `['REQ-1']` 与旧单值 `requirement_id`）。 */
function stageRequirementIds(stage) {
  const ids = new Set();
  const raw = stage?.requirements;
  if (Array.isArray(raw)) {
    for (const entry of raw) {
      if (typeof entry === 'string') ids.add(entry);
      else if (entry && typeof entry === 'object' && typeof entry.id === 'string') ids.add(entry.id);
    }
  }
  if (typeof stage?.requirement_id === 'string') ids.add(stage.requirement_id);
  return [...ids];
}

/**
 * 本批次清单（**按版本过滤，绝不全量 done**）。
 *
 * 候选 REQ = `status==='done'` **且**（`target_version` 等于目标版本 **或** 属于
 * `id` 以 `<目标版本>-stage-` 开头的阶段）。仓库现有 17 条 done 全是旧 target_version，
 * 必须被排除。
 *
 * 改动文件数：`--dry-run` 不跑 git → `files:null`；真实模式用
 * `git rev-list -1 HEAD -- .openfeel/flow-archive/<基线>.json` + `git diff --name-only`
 * + `git status --porcelain` 去重（不依赖 tag）。flow.json 不可读 → 降级不阻断。
 */
export function buildBatchSummary({
  cwd,
  targetVersion,
  baseline = null,
  readText,
  dryRun = false,
  runner = null,
}) {
  const summary = {
    version: targetVersion,
    reqs: [],
    stages: [],
    files: null,
    filesReason: dryRun ? 'dry-run' : null,
  };

  let flow = null;
  try {
    flow = JSON.parse(readText(join(cwd, '.openfeel', 'flow.json')));
  } catch {
    summary.filesReason = summary.filesReason ?? 'flow-unavailable';
    summary.reason = 'flow-unavailable';
    return summary;
  }

  const prefixes = [`${targetVersion}-stage-`, `v${targetVersion}-stage-`];
  const stageIds = new Set();
  const stageReqIds = new Set();
  for (const stage of collectFlowStages(flow)) {
    const id = typeof stage?.id === 'string' ? stage.id : typeof stage?.name === 'string' ? stage.name : '';
    if (id === '' || !prefixes.some((prefix) => id.startsWith(prefix))) continue;
    stageIds.add(id);
    for (const reqId of stageRequirementIds(stage)) stageReqIds.add(reqId);
  }
  summary.stages = [...stageIds].sort();

  const requirements = Array.isArray(flow?.requirements) ? flow.requirements : [];
  const reqIds = new Set();
  for (const req of requirements) {
    if (!req || typeof req !== 'object') continue;
    if (req.status !== 'done' || typeof req.id !== 'string') continue;
    const targets = [targetVersion, `v${targetVersion}`];
    const byVersion = targets.includes(String(req.target_version ?? '').trim());
    const byStage = stageReqIds.has(req.id);
    if (byVersion || byStage) reqIds.add(req.id);
  }
  summary.reqs = [...reqIds].sort();

  if (dryRun) return summary;

  if (typeof runner !== 'function') {
    summary.filesReason = 'git-unavailable';
    return summary;
  }

  const files = new Set();
  const baseArchive = baseline?.archiveFile
    ? `.openfeel/flow-archive/${baseline.archiveFile}`
    : null;
  let baseCommit = null;
  if (baseArchive !== null) {
    const rev = runner('git', ['rev-list', '-1', 'HEAD', '--', baseArchive], { cwd, capture: true });
    const text = String(rev?.stdout ?? '').trim();
    if (rev?.status === 0 && text !== '') baseCommit = text.split('\n')[0].trim();
  }
  if (baseCommit !== null) {
    const diff = runner('git', ['diff', '--name-only', baseCommit], { cwd, capture: true });
    if (diff?.status === 0) {
      for (const line of String(diff.stdout ?? '').split('\n')) {
        if (line.trim() !== '') files.add(line.trim());
      }
    } else {
      summary.filesReason = 'git-unavailable';
    }
  } else {
    summary.filesReason = 'baseline-commit-unavailable';
  }
  // 未提交改动（R4 未提交时由它补并；纯 `.openfeel/**` 也照实计入）
  const status = runner('git', ['status', '--porcelain'], { cwd, capture: true });
  if (status?.status === 0) {
    for (const line of String(status.stdout ?? '').split('\n')) {
      const path = line.slice(3).trim();
      if (path !== '') files.add(path.includes(' -> ') ? path.split(' -> ').pop().trim() : path);
    }
  }
  summary.files = summary.filesReason === null ? [...files].sort() : null;
  return summary;
}

/**
 * <24h 再发 patch 的 warn（**不是硬门**：只 warn + 真实 bump 额外要 `--confirm-twice`）。
 * `lastReleaseAt` 拿不到 → 不 warn（宁可漏报不可造假）。
 */
export function warnRecentRelease({ nowMs, lastReleaseAt, kind }) {
  if (kind !== 'patch') return { recent: false, hours: null };
  const last = toTimestampMs(lastReleaseAt);
  if (last === null || typeof nowMs !== 'number' || !Number.isFinite(nowMs)) {
    return { recent: false, hours: null };
  }
  const elapsed = nowMs - last;
  if (elapsed < 0 || elapsed >= DAY_MS) return { recent: false, hours: elapsed / 3_600_000 };
  return { recent: true, hours: elapsed / 3_600_000 };
}

/**
 * 版本一致性（三处比对：根 package.json / dsh/package.json / CHANGELOG 顶部）。
 * `--notes-only` 允许为目标版本（尚未写 CHANGELOG 段）生成草稿，因此跳过「目标版本 vs
 * package.json」与「CHANGELOG 顶部」两项；两个 package.json 的 lockstep 仍然强制。
 */
export function checkVersionConsistency({ rootPkg, dshPkg, changelogText, version = null, notesOnly = false }) {
  const differences = [];
  const warnings = [];
  const rootVersion = String(rootPkg?.version ?? '').trim();
  const dshVersion = String(dshPkg?.version ?? '').trim();
  const changelogVersion = topChangelogVersion(changelogText);
  const target = version || rootVersion;

  if (rootVersion === '') differences.push('package.json 缺少 version 字段');
  if (dshVersion === '') differences.push('dsh/package.json 缺少 version 字段');
  if (rootVersion !== '' && dshVersion !== '' && rootVersion !== dshVersion) {
    differences.push(`package.json(${rootVersion}) ≠ dsh/package.json(${dshVersion})`);
  }

  if (notesOnly) {
    if (rootVersion !== target) {
      warnings.push(`草稿目标版本 ${target} 与 package.json(${rootVersion}) 不同：按未发布版本生成草稿`);
    }
  } else {
    if (target !== rootVersion) differences.push(`目标版本(${target}) ≠ package.json(${rootVersion})`);
    if (changelogVersion === null) {
      differences.push(`CHANGELOG.md 顶部没有「## [${target}]」版本段`);
    } else if (changelogVersion !== target) {
      differences.push(`CHANGELOG.md 顶部(${changelogVersion}) ≠ 目标版本(${target})`);
    }
  }

  return { ok: differences.length === 0, version: target, rootVersion, dshVersion, changelogVersion, differences, warnings };
}

const escapeRegExp = (value) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * 在本地展开 ARCHIVE_ARTIFACTS 通配符（不交给 shell / git）。
 * 返回 POSIX 风格相对路径，顺序稳定（目录内按名字排序）。
 */
export function expandArchiveArtifacts(cwd, { readdir = readdirSync, exists = existsSync } = {}) {
  const files = [];
  for (const pattern of ARCHIVE_ARTIFACTS) {
    const star = pattern.indexOf('*');
    if (star === -1) {
      if (exists(join(cwd, pattern))) files.push(pattern);
      continue;
    }
    const slash = pattern.lastIndexOf('/', star);
    const dirPart = slash === -1 ? '.' : pattern.slice(0, slash);
    const basePattern = pattern.slice(slash + 1);
    const matcher = new RegExp(`^${basePattern.split('*').map(escapeRegExp).join('.*')}$`);
    let entries = [];
    try {
      entries = readdir(join(cwd, dirPart));
    } catch {
      entries = [];
    }
    for (const name of entries.sort()) {
      if (matcher.test(name)) files.push(dirPart === '.' ? name : `${dirPart}/${name}`);
    }
  }
  return [...new Set(files)];
}

const REV_ID_RE = /\bREV-[0-9A-Za-z-]+/;

/** 从 stage 摘要正文里提取「REV-」开头的结论行（表格行 / 列表行），去重保序。 */
export function reviewConclusionLines(text) {
  const conclusions = [];
  for (const raw of String(text ?? '').split(/\r?\n/)) {
    const line = raw.trim();
    if (line === '') continue;
    const row = /^\|(.+)\|\s*$/.exec(line);
    if (row) {
      const cells = row[1].split('|').map((cell) => cell.trim());
      if (cells.length >= 2 && /^REV-[0-9A-Za-z-]+$/.test(cells[0])) {
        const [id, title, status, priority] = cells;
        const meta = [status, priority].filter((cell) => cell && cell !== '—' && cell !== '-');
        conclusions.push(`- **${id}** ${title}${meta.length > 0 ? `（${meta.join('，')}）` : ''}`);
      }
      continue;
    }
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    const body = bullet ? bullet[1].trim() : line;
    const bare = body.replace(/^\*\*/, '').trim();
    if (/^REV-[0-9A-Za-z-]+/.test(bare)) conclusions.push(`- ${body}`);
  }
  return [...new Set(conclusions)];
}

/**
 * 读取 stage 摘要 `.openfeel/log/archive-<stage>.md` 并提取 REV 结论。
 * stage 名取自 flow-archive 的 `stages`（map 或数组）/ `stage` 字段；再按版本号扫描 log 目录兜底。
 * 文件不存在、读取失败或无 REV 结论 → `conclusions: []`（调用方跳过该小节，不报错）。
 */
export function extractReviewConclusions({
  cwd,
  version,
  archive = null,
  readText,
  fileExists,
  readDir = (path) => readdirSync(path),
}) {
  const stages = [];
  const stageSource = archive?.stages;
  if (Array.isArray(stageSource)) {
    for (const entry of stageSource) {
      if (typeof entry === 'string') stages.push(entry);
      else if (entry && typeof entry === 'object') {
        if (typeof entry.name === 'string') stages.push(entry.name);
        else if (typeof entry.id === 'string') stages.push(entry.id);
        else if (typeof entry.stage === 'string') stages.push(entry.stage);
      }
    }
  } else if (stageSource && typeof stageSource === 'object') {
    for (const [key, entry] of Object.entries(stageSource)) {
      stages.push(typeof entry?.name === 'string' ? entry.name : key);
    }
  }
  for (const key of ['stage', 'name']) {
    if (typeof archive?.[key] === 'string') stages.push(archive[key]);
  }

  const logDir = join(cwd, '.openfeel', 'log');
  const candidates = stages.filter((stage) => typeof stage === 'string' && stage !== '').map((stage) =>
    join(logDir, `archive-${stage}.md`),
  );

  // 兜底：扫描 log 目录（不存在则跳过），优先与目标版本匹配的归档摘要。
  let logEntries = [];
  try {
    logEntries = readDir(logDir);
  } catch {
    logEntries = [];
  }
  const archived = logEntries
    .filter((name) => /^archive-.+\.md$/.test(name))
    .sort()
    .map((name) => join(logDir, name));
  if (version) {
    const versionMatches = archived.filter((path) => path.includes(version));
    if (versionMatches.length > 0) candidates.push(versionMatches[versionMatches.length - 1]);
  }

  const path = [...new Set(candidates)].find((candidate) => fileExists(candidate));
  if (!path) return { path: null, conclusions: [] };
  let text = '';
  try {
    text = readText(path);
  } catch {
    return { path: null, conclusions: [] };
  }
  return { path, conclusions: reviewConclusionLines(text) };
}

/**
 * CHANGELOG 草稿：`## [<version>] - <date>` + flow-archive 的需求标题
 * + stage 摘要的 REV 结论 +（若存在）发布说明。只返回文本，不写 CHANGELOG.md。
 */
export function generateChangelogDraft({ cwd, version, date, readText, fileExists, readDir }) {
  const lines = [
    `## [${version}] - ${date}`,
    '',
    `> 发布说明草稿：由 \`npm run release -- ${version} --notes-only\` 生成；人工确认后合并进 \`CHANGELOG.md\`。`,
    '',
    '### Added',
    '',
  ];

  // 仓库里归档文件名带 `v` 前缀（v1.6.0.json），也接受无前缀写法。
  const archivePath = [`v${version}.json`, `${version}.json`]
    .map((name) => join(cwd, '.openfeel', 'flow-archive', name))
    .find((path) => fileExists(path));
  let archive = null;
  if (archivePath) {
    try {
      archive = JSON.parse(readText(archivePath));
    } catch {
      archive = null;
    }
  }
  const requirements = Array.isArray(archive?.requirements) ? archive.requirements : [];
  if (requirements.length === 0) {
    lines.push(`- （未找到 ${version} 的归档需求标题：.openfeel/flow-archive/v${version}.json 缺失或为空）`);
  } else {
    for (const requirement of requirements) {
      const id = requirement?.id ?? 'REQ-?';
      const title = requirement?.title ?? '（无标题）';
      const priority = requirement?.priority ? `（${requirement.priority}）` : '';
      lines.push(`- **${id}** ${title}${priority}`);
    }
  }
  lines.push('');

  // stage 摘要里的 REV 结论（A61.3）；文件缺失或无结论时整节省略。
  const review = extractReviewConclusions({ cwd, version, archive, readText, fileExists, readDir });
  if (review.conclusions.length > 0) {
    lines.push('### 审查结论', '', ...review.conclusions, '');
  }

  // 已有发布说明可能带 `v` 前缀（docs/releases/v1.6.0.md）；两种命名都读。
  const releasePath = [`v${version}.md`, `${version}.md`]
    .map((name) => join(cwd, 'docs', 'releases', name))
    .find((path) => fileExists(path));
  if (releasePath) {
    lines.push('### 发布说明', '', readText(releasePath).trim(), '');
  }

  return `${lines.join('\n').replace(/\n+$/, '')}\n`;
}

/**
 * Windows 上 `npm` 是 .cmd 包装（直接 spawn 会 ENOENT / EINVAL）：
 * 优先解析 npm-cli.js 用当前 node 运行，找不到才退回 shell（release 的 npm 参数均不含空格）。
 */
function resolveNpmInvocation(args, env = process.env) {
  if (process.platform !== 'win32') return { command: 'npm', args, shell: false };
  const nodeDir = dirname(process.execPath);
  const candidates = [
    env?.npm_execpath,
    join(nodeDir, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    join(nodeDir, '..', 'lib', 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ].filter((candidate) => typeof candidate === 'string' && /npm-cli\.js$/i.test(candidate));
  const cli = candidates.find((candidate) => existsSync(candidate));
  if (cli) return { command: process.execPath, args: [cli, ...args], shell: false };
  return { command: 'npm', args, shell: true };
}

/**
 * 默认 runner：不捕获（stdio inherit）时子进程输出直接进终端；
 * `capture: true`（whoami / dry-run publish）走临时文件捕获，绝不把内容回显给用户。
 */
export function defaultRunner(command, args, options = {}) {
  const { cwd = process.cwd(), env = process.env, capture = false } = options;
  const invocation = command === 'npm' ? resolveNpmInvocation(args, env) : { command, args, shell: false };
  if (!capture) {
    const result = spawnSync(invocation.command, invocation.args, {
      cwd,
      env,
      stdio: 'inherit',
      windowsHide: true,
      shell: invocation.shell,
    });
    return { status: typeof result.status === 'number' ? result.status : 1, stdout: '', stderr: '' };
  }

  const dir = mkdtempSync(join(tmpdir(), 'openfeel-release-'));
  const stdoutPath = join(dir, 'stdout');
  const stderrPath = join(dir, 'stderr');
  let status = 1;
  try {
    const stdoutFd = openSync(stdoutPath, 'w');
    const stderrFd = openSync(stderrPath, 'w');
    try {
      const result = spawnSync(invocation.command, invocation.args, {
        cwd,
        env,
        stdio: ['ignore', stdoutFd, stderrFd],
        windowsHide: true,
        shell: invocation.shell,
      });
      status = typeof result.status === 'number' ? result.status : 1;
    } finally {
      closeSync(stdoutFd);
      closeSync(stderrFd);
    }
    return {
      status,
      stdout: readFileSync(stdoutPath, 'utf8'),
      stderr: readFileSync(stderrPath, 'utf8'),
    };
  } catch {
    return { status, stdout: '', stderr: '' };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/** `npm publish` 对「该版本已存在」的拒绝（仅在 --dry-run 预演里按可继续处理）。 */
const PUBLISH_CONFLICT_RE = /previously published|EPUBLISHCONFLICT|E409|409 Conflict/i;

export const isPublishConflict = (text) => PUBLISH_CONFLICT_RE.test(String(text ?? ''));

const modeOf = (opts) => {
  if (!opts) return 'invalid';
  if (opts.bump) return 'bump';
  if (opts.notesOnly) return 'notes-only';
  if (opts.publish) return 'publish';
  if (opts.dryRun) return 'dry-run';
  return 'preview';
};

/**
 * 执行发布链路。返回 `{ok, exitCode, version, mode, steps, messages, draft?, draftPath?}]`。
 * 遇错**早停**：失败步骤之后的所有步骤一律 `skipped`。
 */
export function runRelease(options = {}) {
  const {
    argv = [],
    cwd = process.cwd(),
    runner = defaultRunner,
    log = () => {},
    now = () => new Date().toISOString().slice(0, 10),
    /** 毫秒时钟（24h warn 用；测试可注入，缺省 Date.now） */
    nowMs = () => Date.now(),
    readText = (path) => readFileSync(path, 'utf8'),
    writeText = (path, text) => {
      mkdirSync(dirname(path), { recursive: true });
      writeFileSync(path, text, 'utf8');
    },
    fileExists = (path) => existsSync(path),
    readDir = (path) => readdirSync(path),
  } = options;

  const messages = [];
  const jsonLines = [];
  let jsonMode = false;
  const emit = (line) => {
    messages.push(String(line));
    if (!jsonMode) log(String(line));
  };
  const emitJson = (payload) => {
    const text = JSON.stringify(payload, null, 2);
    jsonLines.push(text);
    log(text);
  };

  const steps = STEPS.map((id) => ({ id, status: 'pending', cmd: null, substeps: [] }));
  const step = (id) => steps.find((s) => s.id === id);

  let opts = null;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    emit(`✗ ${err.message}`);
    step('version').status = 'failed';
    for (const s of steps) if (s.status === 'pending') s.status = 'skipped';
    return { ok: false, exitCode: 1, version: null, mode: 'invalid', steps, messages, draft: null };
  }

  if (opts.help) {
    return { ok: true, exitCode: 0, version: null, mode: 'help', steps: [], messages, draft: null, help: HELP };
  }
  jsonMode = opts.json;

  const mark = (id, status, patch = {}) => {
    const target = step(id);
    target.status = status;
    Object.assign(target, patch);
    emit(`${statusIcon(status)} ${id}${target.cmd ? `  ${target.cmd}` : ''}${target.reason ? `  — ${target.reason}` : ''}`);
    return target;
  };

  const skipRest = (reason) => {
    for (const s of steps) {
      if (s.status === 'pending') {
        s.status = 'skipped';
        s.reason = reason;
        emit(`– ${s.id}  — ${reason}`);
      }
    }
  };

  // 六步之外的收尾动作（`--push`）状态；进 `result.push` 与 `--json` 顶层，不占 `steps[]`。
  let pushState = null;

  const finish = (exitCode, extra = {}) => {
    const result = {
      ok: exitCode === 0,
      exitCode,
      version: extra.version ?? null,
      mode: modeOf(opts),
      steps,
      push: extra.push ?? pushState,
      messages,
      draft: extra.draft ?? null,
      draftPath: extra.draftPath ?? null,
      draftWritten: extra.draftWritten === true,
    };
    if (extra.batch !== undefined) result.batch = extra.batch;
    if (extra.bump !== undefined) result.bump = extra.bump;
    if (jsonMode) {
      const payload = {
        ok: result.ok,
        exitCode: result.exitCode,
        version: result.version,
        mode: result.mode,
        steps,
        push: result.push,
        draft: result.draft,
        draftPath: result.draftPath,
        draftWritten: result.draftWritten,
      };
      // 既有键序不变：新键追加在末位（v1.6.5 / A74.2）
      if (extra.batch !== undefined) payload.batch = extra.batch;
      if (extra.bump !== undefined) payload.bump = extra.bump;
      emitJson(payload);
    }
    return result;
  };

  // ── 0. --bump（**独立模式**，不进六步链；v1.6.5 / REQ-074 A74.2）──────────
  // 目标版本 = inc(上次发布基线)；当前已等于目标 → no-op（零写盘）；开发阶段不改版本。
  if (opts.bump !== null) {
    const kind = opts.bump;
    for (const s of steps) {
      s.status = 'skipped';
      s.reason = '--bump 独立模式（不进六步链）';
    }
    const failBump = (message, bump) => {
      emit(`✗ ${message}`);
      return finish(1, { version: bump?.to ?? null, bump });
    };

    let rootPkg;
    try {
      rootPkg = JSON.parse(readText(join(cwd, 'package.json')));
    } catch (err) {
      return failBump(`--bump 读取 package.json 失败：${err.message}`, {
        from: null,
        to: null,
        kind,
        reason: opts.reason,
        files: [],
        written: false,
      });
    }
    const currentVersion = String(rootPkg?.version ?? '').trim();
    if (parseSemverParts(currentVersion) === null) {
      return failBump(`--bump：package.json 版本不是合法 SemVer（${currentVersion || '空'}）`, {
        from: currentVersion || null,
        to: null,
        kind,
        reason: opts.reason,
        files: [],
        written: false,
      });
    }

    const baseline = selectReleaseBaseline({ cwd, currentVersion, readText, readDir });
    if (baseline.fallback === true) {
      emit(`  ! 未找到 flow-archive 发布基线，降级以当前版本 ${currentVersion} 为基线`);
    }
    let targetVersion;
    try {
      targetVersion = incVersion(baseline.version, kind);
    } catch (err) {
      return failBump(`--bump 计算目标版本失败：${err.message}`, {
        from: currentVersion,
        to: null,
        kind,
        reason: opts.reason,
        files: [],
        written: false,
      });
    }
    const bumpBase = {
      from: currentVersion,
      to: targetVersion,
      kind,
      reason: opts.reason ?? null,
      files: [],
      written: false,
      dryRun: opts.dryRun === true,
      baseline: baseline.version,
    };

    const comparison = compareSemver(targetVersion, currentVersion);
    if (comparison === 0) {
      // 幂等：1.6.5 已 bump 后再跑 --bump patch 是 no-op，不是 1.6.6
      emit(`no-op: already ${targetVersion}（0 文件写入）`);
      return finish(0, { version: targetVersion, bump: { ...bumpBase, noop: true } });
    }
    if (comparison < 0) {
      return failBump(
        `--bump 目标版本 ${targetVersion} 低于当前版本 ${currentVersion}：发布基线过期（基线 ${baseline.version}），请检查 .openfeel/flow-archive`,
        bumpBase,
      );
    }

    const batch = buildBatchSummary({
      cwd,
      targetVersion,
      baseline,
      readText,
      dryRun: opts.dryRun === true,
      runner: opts.dryRun === true ? null : runner,
    });
    const marker = readReleaseMarker({ cwd, readText, fileExists });
    const lastReleaseAt = marker !== null ? marker.ms : baseline.archivedAt;
    const recent = warnRecentRelease({ nowMs: nowMs(), lastReleaseAt, kind });
    batch.warn = recent.recent
      ? `距上次发布约 ${recent.hours.toFixed(1)}h（< 24h）再发 patch：同批不连发；真实 bump 需 --confirm-twice`
      : null;

    // 真实动作前打印本批次清单（dry-run 同样打印，但 files=null）
    const reqLabel = batch.reqs.length > 0 ? `${batch.reqs.length}（${batch.reqs.join(' / ')}）` : '0';
    const stageLabel = batch.stages.length > 0 ? `${batch.stages.length}（${batch.stages.join(' / ')}）` : '0';
    const fileLabel = batch.files === null ? `null（${batch.filesReason ?? 'unknown'}）` : String(batch.files.length);
    emit(`本批次：REQ-${reqLabel} / 阶段${stageLabel} / 改动文件${fileLabel}`);
    emit(`版本：${currentVersion} → ${targetVersion}（${kind}；基线 ${baseline.version}）`);
    if (batch.warn !== null) emit(`  ! ${batch.warn}`);

    if (opts.dryRun === true) {
      emit('  --dry-run：零写盘、零 git（将写 package.json / dsh/package.json / package-lock.json 的 4 个版本字段）');
      return finish(0, { version: targetVersion, batch, bump: bumpBase });
    }

    // 校验门（dry-run 已在上面返回，不要求这些确认）
    const failBumpWithBatch = (message) => {
      emit(`✗ ${message}`);
      return finish(1, { version: targetVersion, batch, bump: bumpBase });
    };
    if (kind !== 'patch' && (opts.reason === null || String(opts.reason).trim() === '')) {
      return failBumpWithBatch(`--bump ${kind} 需要 --reason（说明为什么升 ${kind}）`);
    }
    if (!opts.confirm) {
      return failBumpWithBatch('--bump 会改版本号，需 --confirm（确认这次要动版本）');
    }
    if (recent.recent && !opts.confirmTwice) {
      return failBumpWithBatch(
        '距上次发布 < 24h 再发 patch：需 --confirm-twice（二次确认「明知连发仍要发」）',
      );
    }

    // 写 4 个版本字段（root version / dsh version / lock 顶层 version / lock packages[""].version）。
    // 先算后写；单次写失败即 exit 1（无事务回滚，由 git status 兜底）。
    const mutations = [
      ['package.json', (pkg) => { pkg.version = targetVersion; }],
      ['dsh/package.json', (pkg) => { pkg.version = targetVersion; }],
      [
        'package-lock.json',
        (lock) => {
          lock.version = targetVersion;
          if (lock.packages && typeof lock.packages === 'object' && lock.packages['']) {
            lock.packages[''].version = targetVersion;
          }
        },
      ],
    ];
    const writtenFiles = [];
    try {
      for (const [relative, mutate] of mutations) {
        const path = join(cwd, relative);
        if (!fileExists(path)) {
          emit(`  ! ${relative} 不存在，跳过`);
          continue;
        }
        const parsed = JSON.parse(readText(path));
        mutate(parsed);
        writeText(path, `${JSON.stringify(parsed, null, 2)}\n`);
        writtenFiles.push(relative);
      }
    } catch (err) {
      return failBump(`--bump 写版本字段失败（已写 ${writtenFiles.join(' / ') || '无'}）：${err.message}`, {
        ...bumpBase,
        files: writtenFiles,
      });
    }
    emit(`✓ bump ${currentVersion} → ${targetVersion}（${kind}）：已写 ${writtenFiles.join(' / ')}`);
    return finish(0, {
      version: targetVersion,
      batch,
      bump: { ...bumpBase, files: writtenFiles, written: true },
    });
  }

  if (opts.dryRun && opts.publish) {
    mark('version', 'failed', { reason: '--dry-run 与 --publish 互斥（dry-run 不发布）' });
    skipRest('参数互斥');
    return finish(1);
  }

  // ── 1. 版本一致性 ────────────────────────────────────────────────────────
  const paths = {
    rootPkg: join(cwd, 'package.json'),
    dshPkg: join(cwd, 'dsh', 'package.json'),
    changelog: join(cwd, 'CHANGELOG.md'),
  };
  let rootPkg;
  let dshPkg;
  let changelogText;
  try {
    rootPkg = JSON.parse(readText(paths.rootPkg));
    dshPkg = JSON.parse(readText(paths.dshPkg));
    changelogText = readText(paths.changelog);
  } catch (err) {
    mark('version', 'failed', {
      cmd: 'checkVersionConsistency()',
      reason: `读取版本来源失败：${err.message}`,
    });
    skipRest('版本一致性未通过');
    return finish(1);
  }

  const versionCheck = checkVersionConsistency({
    rootPkg,
    dshPkg,
    changelogText,
    version: opts.version,
    notesOnly: opts.notesOnly,
  });
  if (!versionCheck.ok) {
    mark('version', 'failed', { cmd: 'checkVersionConsistency()', reason: '版本不一致' });
    emit('  差异：');
    for (const difference of versionCheck.differences) emit(`    - ${difference}`);
    skipRest('版本一致性未通过');
    return finish(1);
  }
  for (const warning of versionCheck.warnings) emit(`  ! ${warning}`);
  const version = versionCheck.version;
  mark('version', 'ok', { cmd: 'checkVersionConsistency()' });

  // ── 2. build ─────────────────────────────────────────────────────────────
  if (opts.notesOnly) {
    mark('build', 'skipped', { reason: '--notes-only 只生成草稿' });
  } else if (opts.skipBuild) {
    mark('build', 'skipped', { reason: '--skip-build' });
  } else {
    const result = runner('npm', ['run', 'build'], { cwd });
    if (result.status !== 0) {
      mark('build', 'failed', { cmd: 'npm run build', reason: `build 失败（exit ${result.status}）` });
      skipRest('构建失败');
      return finish(1);
    }
    mark('build', 'ok', { cmd: 'npm run build' });
  }

  // ── 3. publish ───────────────────────────────────────────────────────────
  // 真实发布只认 --publish；--dry-run 预演走 npm publish --dry-run（双包各一次）；
  // 两者都没有 → skipped（cmd 仅作说明书）。whoami 只在真实发布时检查。
  if (opts.notesOnly) {
    mark('publish', 'skipped', {
      publishMode: 'skipped',
      reason: '--notes-only 不发布',
    });
  } else if (!opts.publish && !opts.dryRun) {
    // 默认不发布：标准路径是 push 到 master 后由 CI publish job 按版本差自动 npm publish。
    mark('publish', 'skipped', {
      cmd: 'npm publish --access public',
      publishMode: 'ci',
      reason:
        'publish skipped（本地不发布：push 到 master 且 package.json 版本 ≠ npm 已发版本时，由 CI publish job 自动 npm publish；tag/release 不触发；应急兜底才用 --publish）',
    });
  } else {
    const publishMode = opts.publish ? 'real' : 'dry-run';
    const publishArgs =
      publishMode === 'real' ? ['publish', '--access', 'public'] : ['publish', '--dry-run', '--access', 'public'];
    const publishCmd = `npm ${publishArgs.join(' ')}`;

    if (publishMode === 'real') {
      const whoami = runner('npm', ['whoami'], { cwd, capture: true });
      if (whoami.status !== 0) {
        mark('publish', 'failed', {
          cmd: 'npm whoami',
          publishMode,
          reason: 'npm 认证未通过（未打印子进程输出，避免 token 泄漏）',
        });
        emit('  请先运行 npm login（不会打印 token）');
        skipRest('npm 认证失败（早停）');
        return finish(1);
      }
    }

    const publishStep = step('publish');
    publishStep.substeps = [];
    publishStep.publishMode = publishMode;

    // 预演捕获输出（不打印）；「版本已在 registry」在 --dry-run 下按可继续处理——
    // 预演的是链路而非版本号（发版窗口会先 bump 版本），真实发布仍严格失败。
    const runPackagePublish = (label, targetCwd) => {
      const result = runner('npm', publishArgs, {
        cwd: targetCwd,
        capture: publishMode === 'dry-run',
      });
      const ok = result.status === 0;
      const conflict =
        publishMode === 'dry-run' && !ok && isPublishConflict(`${result.stdout ?? ''}\n${result.stderr ?? ''}`);
      const substep = {
        cmd: publishCmd,
        cwd: label,
        publishMode,
        status: ok ? 'ok' : conflict ? 'skipped' : 'failed',
      };
      if (conflict) {
        substep.note = `版本 ${version} 已在 registry：--dry-run 预演继续（真实发布须先 bump 版本）`;
        emit(`  ! ${label}: npm publish --dry-run 报「版本已发布」→ 预演继续（真实发布会失败）`);
      }
      publishStep.substeps.push(substep);
      return { ok, conflict, status: result.status };
    };

    const rootPublish = runPackagePublish('.', cwd);
    if (!rootPublish.ok && !rootPublish.conflict) {
      mark('publish', 'failed', {
        cmd: publishCmd,
        publishMode,
        reason: `根包发布失败（exit ${rootPublish.status}）`,
      });
      skipRest('发布失败');
      return finish(1);
    }

    const dshPublish = runPackagePublish('dsh', join(cwd, 'dsh'));
    if (!dshPublish.ok && !dshPublish.conflict) {
      mark('publish', 'failed', {
        cmd: `${publishCmd}（dsh）`,
        publishMode,
        reason: `dsh 子包发布失败（exit ${dshPublish.status}）`,
      });
      skipRest('发布失败');
      return finish(1);
    }

    const conflicted = publishStep.substeps.filter((substep) => substep.status === 'skipped').length;
    mark('publish', 'ok', {
      cmd: `${publishCmd} ×2`,
      publishMode,
      substeps: publishStep.substeps,
      ...(conflicted > 0 ? { note: `${conflicted} 个子包因版本已发布按预演继续（真实发布会失败）` } : {}),
    });
  }

  // ── 4. market ────────────────────────────────────────────────────────────
  const shouldRunMarket = !opts.notesOnly && (opts.withMarket || (opts.publish && !opts.dryRun));
  if (opts.notesOnly) {
    mark('market', 'skipped', { reason: '--notes-only 不产出 market 索引' });
  } else if (opts.dryRun && !opts.withMarket) {
    // A61.1：--dry-run 预演**整条链**——market 属于「将要执行」的步骤，标 planned 而不是 skipped
    mark('market', 'planned', {
      cmd: 'npm run market:index',
      reason: '--dry-run 不执行 market:index（链路预演）',
    });
  } else if (!shouldRunMarket) {
    mark('market', 'skipped', { cmd: 'npm run market:index', reason: 'market skipped（未给 --with-market）' });
  } else {
    const result = runner('npm', ['run', 'market:index'], { cwd });
    if (result.status !== 0) {
      mark('market', 'failed', { cmd: 'npm run market:index', reason: `market:index 失败（exit ${result.status}）` });
      skipRest('market:index 失败');
      return finish(1);
    }
    mark('market', 'ok', { cmd: 'npm run market:index' });
  }

  // ── 5. archive-commit（白名单提交，不 push）──────────────────────────────
  if (opts.notesOnly) {
    mark('archive-commit', 'skipped', { reason: '--notes-only 不提交' });
  } else if (opts.dryRun) {
    // A61.4：预演给出**将要 git add 的清单**（ARCHIVE_ARTIFACTS 本地展开后的相对路径），
    // 使 `--dry-run --json` 可断言归档产物白名单；不真 add/commit。
    const artifactPaths = expandArchiveArtifacts(cwd);
    mark('archive-commit', 'planned', {
      cmd: `git commit -m "chore(release): ${version}"`,
      paths: artifactPaths,
      note: '--dry-run 不真提交（paths = 将 git add 的归档产物白名单展开结果）',
    });
  } else if (!opts.commitArchive) {
    mark('archive-commit', 'skipped', { reason: '未给 --commit-archive' });
  } else {
    const artifactPaths = expandArchiveArtifacts(cwd);
    if (artifactPaths.length === 0) {
      mark('archive-commit', 'skipped', { paths: [], reason: '没有可提交的归档产物' });
    } else {
      const plan = `git add -- ${artifactPaths.join(' ')}`;
      const add = runner('git', ['add', '--', ...artifactPaths], { cwd });
      if (add.status !== 0) {
        mark('archive-commit', 'failed', { cmd: plan, paths: artifactPaths, reason: `git add 失败（exit ${add.status}）` });
        skipRest('归档产物提交失败');
        return finish(1);
      }
      const message = `chore(release): ${version}`;
      const commit = runner('git', ['commit', '-m', message], { cwd });
      if (commit.status !== 0) {
        mark('archive-commit', 'failed', {
          cmd: `git commit -m "${message}"`,
          paths: artifactPaths,
          reason: `git commit 失败（exit ${commit.status}）`,
        });
        skipRest('归档产物提交失败');
        return finish(1);
      }
      mark('archive-commit', 'ok', {
        cmd: `git commit -m "${message}"`,
        paths: artifactPaths,
        note: '不 push、不打 tag',
      });
    }
  }

  // ── 6. tag（不 push）─────────────────────────────────────────────────────
  const tagName = `v${version}`;
  if (opts.notesOnly) {
    mark('tag', 'skipped', { reason: '--notes-only 不打 tag' });
  } else if (opts.dryRun) {
    // A61.1：预演给出将打的 tag 名，不真打。
    mark('tag', 'planned', {
      cmd: `git tag ${tagName}`,
      tag: tagName,
      note: '--dry-run 不打 tag（tag = 预演时将创建的 tag 名）',
    });
  } else if (!opts.tag) {
    mark('tag', 'skipped', { reason: '未给 --tag（默认不打 tag）' });
  } else {
    const result = runner('git', ['tag', tagName], { cwd });
    if (result.status !== 0) {
      mark('tag', 'failed', { cmd: `git tag ${tagName}`, reason: `git tag 失败（exit ${result.status}）` });
      return finish(1);
    }
    mark('tag', 'ok', { cmd: `git tag ${tagName}`, note: '不 push' });
  }

  // ── 6.5 push（六步链之外的收尾动作；不进 `steps[].id`）──────────────────
  // 默认 skipped（零 git 推送）；`--dry-run` 下只标 planned；`--push` 才真推，
  // 且**只在 archive-commit / tag 之后**执行。推到 master 且版本变化 → CI 自动发布。
  const pushCmd = opts.tag ? `git push && git push origin ${tagName}` : 'git push';
  if (opts.notesOnly) {
    pushState = { status: 'skipped', reason: '--notes-only 不 push' };
    emit(`– push  — ${pushState.reason}`);
  } else if (!opts.push) {
    pushState = {
      status: 'skipped',
      reason: '未给 --push（默认不 push；push 到 master 且版本 ≠ npm 已发版本时由 CI 自动 npm publish）',
    };
    emit(`– push  — ${pushState.reason}`);
  } else if (opts.dryRun) {
    pushState = { status: 'planned', cmd: pushCmd, note: '--dry-run 不真 push（cmd = 将执行的推送命令）' };
    emit(`→ push  ${pushCmd}  — ${pushState.note}`);
  } else {
    const pushResult = runner('git', ['push'], { cwd });
    if (pushResult.status !== 0) {
      pushState = { status: 'failed', cmd: 'git push', reason: `git push 失败（exit ${pushResult.status}）` };
      emit(`✗ push  git push  — ${pushState.reason}`);
      return finish(1, { version });
    }
    if (opts.tag) {
      const pushTagResult = runner('git', ['push', 'origin', tagName], { cwd });
      if (pushTagResult.status !== 0) {
        pushState = {
          status: 'failed',
          cmd: `git push origin ${tagName}`,
          reason: `git push origin ${tagName} 失败（exit ${pushTagResult.status}）`,
        };
        emit(`✗ push  ${pushState.cmd}  — ${pushState.reason}`);
        return finish(1, { version });
      }
    }
    pushState = { status: 'ok', cmd: pushCmd, note: 'commit 已推送；CI publish job 按版本差自动发布' };
    emit(`✓ push  ${pushCmd}`);
  }

  // ── 7. notes-only 草稿（默认零写盘；--write-notes 才落盘且不覆盖）────────
  let draft = null;
  let draftPath = null;
  let draftWritten = false;
  if (opts.notesOnly) {
    draft = generateChangelogDraft({ cwd, version, date: now(), readText, fileExists, readDir });
    draftPath = join(cwd, 'docs', 'releases', `${version}.md`);
    const relativeDraftPath = `docs/releases/${version}.md`;
    const existingDraft = [draftPath, join(cwd, 'docs', 'releases', `v${version}.md`)].find((path) =>
      fileExists(path),
    );
    if (!opts.writeNotes) {
      // A61.3：--notes-only 默认**零写盘**，草稿只进 stdout（人工确认后再决定是否落盘）
      emit(`  草稿只输出到 stdout（未写盘）；需要落盘请加 --write-notes（目标 ${relativeDraftPath}）`);
    } else if (existingDraft) {
      emit(`  docs/releases/${version}.md 已存在，不覆盖（草稿只打印，人工合并）`);
    } else if (opts.dryRun) {
      emit(`  --dry-run：草稿不写盘（目标 ${relativeDraftPath}）`);
    } else {
      writeText(draftPath, draft);
      draftWritten = true;
      emit(`  ✓ 已写入 ${relativeDraftPath}`);
    }
    if (!jsonMode) {
      emit('');
      emit('--- CHANGELOG 草稿开始 ---');
      emit(draft);
      emit('--- 草稿结束：CHANGELOG.md 未改动，人工确认后合并 ---');
    }
  }

  emit('');
  emit(`发布链路${opts.publish ? '（真实发布）' : '（安全预演）'}：${version}`);
  return finish(0, { version, draft, draftPath, draftWritten });
}

const invokedDirectly =
  typeof process.argv[1] === 'string' &&
  process.argv[1] !== '' &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href;

if (invokedDirectly) {
  const result = runRelease({ argv: process.argv.slice(2), log: (line) => console.log(line) });
  if (result.mode === 'help' && result.help) {
    console.log(result.help.trimStart());
    process.exit(0);
  }
  process.exit(result.exitCode);
}
