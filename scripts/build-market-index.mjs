#!/usr/bin/env node
/**
 * DSH 插件市场索引生成器（官方 format 1，git 源）
 *
 * 为什么是 git 源：`openfeel-dsh` 不单独发布到 npm，它住在本仓的 `dsh/` 子目录。
 * DSH 索引的 `source` 只支持 npm 或 git；git 支持 `path` 指向 monorepo 子目录，
 * 因此条目形如 `git+<repo>#<commit>&path:/dsh`。
 *
 * 核心不变量：**索引里说的版本，必须真的存在于它指向的那个 commit 里。**
 * 所以版本号、`engines.dsh`、发布时间全部从 commit 内读取（`git show <commit>:dsh/package.json`
 * 与 `%ct`），而不是读工作树 —— 工作树可以领先于任何 commit，读它就必然撒谎。
 *
 * 用法：
 *   node scripts/build-market-index.mjs                 # 用 HEAD 生成/更新 docs/market/index.json
 *   node scripts/build-market-index.mjs --commit <sha>  # 追加指定 commit（可重复）
 *   node scripts/build-market-index.mjs --check         # 只校验，不写盘；任何不合法 exit 1
 *   node scripts/build-market-index.mjs --out <path>    # 换输出位置
 *
 * 发布流程：提交改动 → （可选）打 v<version> tag → 跑本脚本 → 提交生成物 → 部署静态主机。
 */

import { execFileSync } from 'node:child_process';
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, isAbsolute, join, resolve } from 'node:path';

const ADAPTER_DIR = 'dsh';
const ADAPTER_PACKAGE = 'openfeel-dsh';
const PLUGIN_ICON = 'icons/openfeel.svg';
const DEFAULT_OUT = 'docs/market/index.json';

// SemVer 2.0.0 官方建议正则（含预发布与构建元数据）
const SEMVER_RE =
  /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-((?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*)(?:\.(?:0|[1-9]\d*|\d*[a-zA-Z-][0-9a-zA-Z-]*))*))?(?:\+([0-9a-zA-Z-]+(?:\.[0-9a-zA-Z-]+)*))?$/;
const COMMIT_RE = /^[0-9a-f]{40}$/;

/** 收集错误而不是抛异常：一次跑完把所有违规都报出来（索引校验器的行为）。 */
const problems = [];
const fail = (path, reason) => problems.push({ path, reason });
const die = (message) => {
  console.error(`✗ ${message}`);
  process.exit(1);
};

// ── 参数 ────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const opts = { commits: [], check: false, out: DEFAULT_OUT, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--check') opts.check = true;
    else if (arg === '--help' || arg === '-h') opts.help = true;
    else if (arg === '--out') opts.out = requireValue(argv, ++i, '--out');
    else if (arg === '--commit') opts.commits.push(requireValue(argv, ++i, '--commit'));
    else die(`未知参数：${arg}（用 --help 查看用法）`);
  }
  return opts;
}

function requireValue(argv, index, flag) {
  const value = argv[index];
  if (!value || value.startsWith('--')) die(`${flag} 需要一个值`);
  return value;
}

const HELP = `
DSH 插件市场索引生成器（format 1 / git 源）

  node scripts/build-market-index.mjs [选项]

选项
  --commit <sha>   追加该 commit 作为一条版本（可重复；缺省用 HEAD）
  --out <path>     输出路径（缺省 ${DEFAULT_OUT}）
  --check          只校验已有索引，不写盘（CI 用）
  -h, --help       显示本帮助

判据（任一不满足即 exit 1）
  1. dsh/ 有未提交改动          → 索引会声称一个 commit 里不存在的版本，拒绝生成
  2. 该 commit 的 dsh/package.json 缺 engines.dsh → 拒绝（索引条目必须带兼容范围）
  3. 索引结构违反 format 1      → 拒绝
  4. 条目的 commit 不存在，或该 commit 内的版本与条目版本不一致 → 拒绝
`;

// ── git ─────────────────────────────────────────────────────────────────────
//
// 捕获子进程输出有两种方式：管道与临时文件。管道是常规做法，但受限环境
// （如 DSH 沙箱、禁止命名管道的 CI）会让 spawn 直接 EPERM；因此首次遇到
// 该错误就永久降级为「重定向到临时文件再读回」。两条路径结果一致。
let useFileCapture = false;

function runCapture(args, cwd) {
  if (!useFileCapture) {
    try {
      const out = execFileSync('git', args, {
        cwd,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { ok: true, out: out.trim(), err: '' };
    } catch (err) {
      if (err && (err.code === 'EPERM' || err.code === 'EACCES')) {
        useFileCapture = true;
      } else {
        return { ok: false, out: '', err: String(err.stderr ?? err.message).trim() };
      }
    }
  }
  return runCaptureViaFiles(args, cwd);
}

function runCaptureViaFiles(args, cwd) {
  const dir = mkdtempSync(join(tmpdir(), 'openfeel-git-'));
  const outPath = join(dir, 'stdout');
  const errPath = join(dir, 'stderr');
  let status = 0;
  let outFd;
  let errFd;
  try {
    outFd = openSync(outPath, 'w');
    errFd = openSync(errPath, 'w');
    execFileSync('git', args, { cwd, stdio: ['ignore', outFd, errFd] });
  } catch (err) {
    status = typeof err.status === 'number' ? err.status : 1;
  } finally {
    if (outFd !== undefined) closeSync(outFd);
    if (errFd !== undefined) closeSync(errFd);
  }
  let out = '';
  let err = '';
  try {
    out = readFileSync(outPath, 'utf8');
  } catch {
    /* 保持空串 */
  }
  try {
    err = readFileSync(errPath, 'utf8');
  } catch {
    /* 保持空串 */
  }
  rmSync(dir, { recursive: true, force: true });
  return { ok: status === 0, out: out.trim(), err: err.trim() };
}

function git(args, { allowFailure = false } = {}) {
  const res = runCapture(args);
  if (res.ok || allowFailure) return res;
  die(`git ${args.join(' ')} 失败：${res.err || '未知错误'}`);
}

function repoRoot() {
  const res = git(['rev-parse', '--show-toplevel']);
  if (res.out === '') die('当前目录不是 git 仓库（git rev-parse --show-toplevel 返回空）');
  return res.out;
}

/** 读某个 commit 内某文件的原文；失败返回 null（由调用方给出可读原因）。 */
function readFromCommit(root, commit, relativePath) {
  const res = runCapture(['show', `${commit}:${relativePath}`], root);
  return res.ok ? res.out : null;
}

function commitExists(root, commit) {
  if (!COMMIT_RE.test(commit)) return false;
  return runCapture(['cat-file', '-e', `${commit}^{commit}`], root).ok;
}

// ── 从 commit 派生条目 ──────────────────────────────────────────────────────
function entryFromCommit(root, commit) {
  if (!COMMIT_RE.test(commit)) {
    die(`commit 必须是 40 位小写十六进制 SHA，收到：${commit}`);
  }
  if (!commitExists(root, commit)) {
    die(`commit 不存在于本仓库：${commit}`);
  }

  const raw = readFromCommit(root, commit, `${ADAPTER_DIR}/package.json`);
  if (raw === null) {
    die(`commit ${commit.slice(0, 12)} 内没有 ${ADAPTER_DIR}/package.json（该 commit 不含适配器）`);
  }

  let manifest;
  try {
    manifest = JSON.parse(raw);
  } catch {
    die(`commit ${commit.slice(0, 12)} 的 ${ADAPTER_DIR}/package.json 不是合法 JSON`);
  }

  const version = manifest.version;
  if (typeof version !== 'string' || !SEMVER_RE.test(version)) {
    die(`commit ${commit.slice(0, 12)} 的 version 不是合法 SemVer：${String(version)}`);
  }

  const enginesDsh = manifest.engines?.dsh;
  if (typeof enginesDsh !== 'string' || enginesDsh.trim() === '') {
    die(
      `commit ${commit.slice(0, 12)} 的 ${ADAPTER_DIR}/package.json 缺 engines.dsh。\n` +
        `  索引条目必须携带兼容范围；缺它就等于对外宣称「任意 DSH 版本可装」。\n` +
        `  先在该 commit 内补 engines.dsh（如 ">=0.2.0"）再生成。`,
    );
  }

  const timestamp = git(['show', '-s', '--format=%ct', commit]).out;
  const publishTimestamp = Number.parseInt(timestamp, 10);
  if (!Number.isInteger(publishTimestamp) || publishTimestamp <= 0) {
    die(`无法读取 commit ${commit.slice(0, 12)} 的时间戳`);
  }

  return {
    version,
    publishTimestamp,
    source: {
      type: 'git',
      url: 'https://github.com/Liuary/OpenFeel',
      commit,
      path: ADAPTER_DIR,
    },
    engines: { dsh: enginesDsh },
  };
}

// ── 校验（--check 与写盘前共用）─────────────────────────────────────────────
function validateIndex(root, outPath, doc) {
  if (doc === null || typeof doc !== 'object' || Array.isArray(doc)) {
    fail('$', '索引必须是 JSON 对象');
    return;
  }
  if (doc.format !== 1) fail('format', `必须为 1，实际 ${JSON.stringify(doc.format)}`);

  validateLocalizedText(doc.title, 'title', true);
  validateLocalizedText(doc.description, 'description', false);

  if (!Array.isArray(doc.plugins) || doc.plugins.length === 0) {
    fail('plugins', '必须是非空数组');
    return;
  }

  const seenNames = new Set();
  doc.plugins.forEach((plugin, pi) => {
    const at = `plugins[${pi}]`;
    if (plugin === null || typeof plugin !== 'object') {
      fail(at, '必须是对象');
      return;
    }
    if (typeof plugin.name !== 'string' || plugin.name.trim() === '') {
      fail(`${at}.name`, '必须是非空字符串');
    } else if (seenNames.has(plugin.name)) {
      fail(`${at}.name`, `索引内重复：${plugin.name}`);
    } else {
      seenNames.add(plugin.name);
    }

    validateLocalizedText(plugin.title, `${at}.title`, false);
    validateLocalizedText(plugin.description, `${at}.description`, false);

    if (plugin.icon !== undefined) {
      if (typeof plugin.icon !== 'string' || plugin.icon.trim() === '') {
        fail(`${at}.icon`, '必须是非空字符串');
      } else if (!plugin.icon.startsWith('data:')) {
        const iconPath = isAbsolute(plugin.icon)
          ? plugin.icon
          : resolve(dirname(outPath), plugin.icon);
        if (!existsSync(iconPath)) {
          fail(`${at}.icon`, `图标文件不存在：${iconPath}`);
        }
      }
    }

    if (plugin.repository !== undefined) {
      if (typeof plugin.repository?.url !== 'string') {
        fail(`${at}.repository.url`, '必须是字符串');
      }
    }

    if (!Array.isArray(plugin.versions) || plugin.versions.length === 0) {
      fail(`${at}.versions`, '必须是非空数组');
      return;
    }

    const seenVersions = new Set();
    plugin.versions.forEach((ver, vi) => {
      const vat = `${at}.versions[${vi}]`;
      validateVersion(root, plugin, vat, ver, seenVersions);
    });
  });
}

function validateVersion(root, plugin, at, ver, seenVersions) {
  if (ver === null || typeof ver !== 'object') {
    fail(at, '必须是对象');
    return;
  }

  if (typeof ver.version !== 'string' || !SEMVER_RE.test(ver.version)) {
    fail(`${at}.version`, `不是合法 SemVer：${JSON.stringify(ver.version)}`);
  } else if (seenVersions.has(ver.version)) {
    fail(`${at}.version`, `该插件内版本重复：${ver.version}`);
  } else {
    seenVersions.add(ver.version);
  }

  if (!Number.isInteger(ver.publishTimestamp) || ver.publishTimestamp <= 0) {
    fail(`${at}.publishTimestamp`, '必须是正整数（Unix 秒）');
  }

  if (ver.engines !== undefined) {
    if (typeof ver.engines.dsh !== 'string' || ver.engines.dsh.trim() === '') {
      fail(`${at}.engines.dsh`, '必须是非空字符串');
    }
  }

  const source = ver.source;
  if (source === null || typeof source !== 'object') {
    fail(`${at}.source`, '必须是对象');
    return;
  }

  if (source.type === 'npm') {
    if (source.registry !== undefined && typeof source.registry !== 'string') {
      fail(`${at}.source.registry`, '必须是字符串');
    }
    return;
  }

  if (source.type !== 'git') {
    fail(`${at}.source.type`, `必须是 "npm" 或 "git"，实际 ${JSON.stringify(source.type)}`);
    return;
  }

  if (typeof source.url !== 'string' || !/^https:\/\//.test(source.url)) {
    fail(`${at}.source.url`, '必须是 https URL');
  }
  if (typeof source.commit !== 'string' || !COMMIT_RE.test(source.commit)) {
    fail(`${at}.source.commit`, '必须是 40 位小写十六进制 SHA');
    return;
  }
  if (source.path !== undefined && typeof source.path !== 'string') {
    fail(`${at}.source.path`, '必须是字符串');
  }

  // 4th 判据：commit 真的存在，且该 commit 内的版本与条目一致
  if (!commitExists(root, source.commit)) {
    fail(`${at}.source.commit`, `commit 不存在于本仓库：${source.commit}`);
    return;
  }
  if (typeof source.path === 'string') {
    const raw = readFromCommit(root, source.commit, `${source.path}/package.json`);
    if (raw === null) {
      fail(`${at}.source.path`, `commit ${source.commit.slice(0, 12)} 内没有 ${source.path}/package.json`);
      return;
    }
    let manifest;
    try {
      manifest = JSON.parse(raw);
    } catch {
      fail(`${at}.source.path`, `commit ${source.commit.slice(0, 12)} 的 ${source.path}/package.json 不是合法 JSON`);
      return;
    }
    if (manifest.version !== ver.version) {
      fail(
        `${at}.version`,
        `与 commit ${source.commit.slice(0, 12)} 内的 ${source.path}/package.json 版本（${manifest.version}）不一致`,
      );
    }
    if (typeof ver.engines?.dsh === 'string' && manifest.engines?.dsh !== ver.engines.dsh) {
      fail(
        `${at}.engines.dsh`,
        `与包自身的 engines.dsh（${String(manifest.engines?.dsh)}）不一致`,
      );
    }
    // 官方要求条目范围与包自身一致：包声明了范围而条目省略，等于把兼容性放宽成「任意版本」。
    if (typeof manifest.engines?.dsh === 'string' && ver.engines?.dsh === undefined) {
      fail(
        `${at}.engines.dsh`,
        `缺失：包自身声明了 engines.dsh（${manifest.engines.dsh}），条目必须同步`,
      );
    }
    if (plugin.name !== manifest.name) {
      fail(`${at}.name`, `与包名（${String(manifest.name)}）不一致`);
    }
  }
}

function validateLocalizedText(value, at, required) {
  if (value === undefined) {
    if (required) fail(at, '必填（LocalizedText）');
    return;
  }
  if (typeof value === 'string') {
    if (value.trim() === '') fail(at, '不能为空字符串');
    return;
  }
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    fail(at, '必须是字符串或语言映射');
    return;
  }
  if (typeof value.en !== 'string' || value.en.trim() === '') {
    fail(`${at}.en`, '语言映射必须包含非空 en');
  }
}

// ── 主流程 ──────────────────────────────────────────────────────────────────
function main() {
  const opts = parseArgs(process.argv.slice(2));
  if (opts.help) {
    console.log(HELP.trimStart());
    return;
  }

  const root = repoRoot();
  const outPath = resolve(root, opts.out);
  const pluginDir = join(root, ADAPTER_DIR);

  if (opts.check) {
    runCheck(root, outPath);
    return;
  }

  // 判据 1：脏树。工作树领先于 commit 时，任何「版本」声明都不可信。
  const porcelain = git(['status', '--porcelain', '--', ADAPTER_DIR], { allowFailure: true });
  if (porcelain.ok && porcelain.out !== '') {
    console.error(`✗ ${ADAPTER_DIR}/ 有未提交改动，拒绝生成索引：\n`);
    for (const line of porcelain.out.split('\n')) console.error(`    ${line}`);
    console.error(
      '\n  索引只能声明「某个 commit 里真实存在的版本」。请先提交这些改动再生成。\n' +
        '  若只想预览结构，请在独立的工作副本里提交后再跑，不要把临时产物提交进来。',
    );
    process.exit(1);
  }

  const existing = loadExisting(outPath);
  const commits = opts.commits.length > 0 ? opts.commits : [git(['rev-parse', 'HEAD']).out];

  // 只合并「同一个包」的历史版本：按包名定位，不假定索引里只有我们一个插件。
  const existingVersions = Array.isArray(existing?.plugins)
    ? (existing.plugins.find((p) => p?.name === ADAPTER_PACKAGE)?.versions ?? [])
    : [];
  const byVersion = new Map();
  for (const ver of existingVersions) {
    if (typeof ver?.version === 'string') byVersion.set(ver.version, ver);
  }
  for (const commit of commits) {
    const entry = entryFromCommit(root, commit);
    byVersion.set(entry.version, entry);
    console.log(`  + ${entry.version}  ← ${commit.slice(0, 12)}  (engines.dsh ${entry.engines.dsh})`);
  }

  const versions = [...byVersion.values()].sort((a, b) => b.publishTimestamp - a.publishTimestamp);
  const pluginManifest = JSON.parse(readFileSync(join(pluginDir, 'package.json'), 'utf8'));
  const rootManifest = readJsonIfExists(join(root, 'package.json')) ?? {};

  const doc = {
    format: 1,
    title: { en: 'OpenFeel', zh: 'OpenFeel' },
    description: {
      en: 'Workflow governance adapter: pipeline, requirement dispatch, version archiving and knowledge base for DeepSeek Harness.',
      zh: 'OpenFeel × DSH 适配器：把流水线、需求分发、版本归档与知识库接入 DeepSeek Harness。',
    },
    plugins: [
      {
        name: pluginManifest.name,
        title: { en: 'OpenFeel Feel Mode', zh: 'OpenFeel Feel 模式' },
        description: {
          en: pluginManifest.description,
          zh: pluginManifest.description,
        },
        icon: PLUGIN_ICON,
        author: pluginManifest.author ?? rootManifest.author ?? 'Liuary',
        homepage: 'https://github.com/Liuary/OpenFeel#readme',
        repository: { url: 'https://github.com/Liuary/OpenFeel', directory: ADAPTER_DIR },
        versions,
      },
    ],
  };

  problems.length = 0;
  validateIndex(root, outPath, doc);
  if (problems.length > 0) {
    console.error(`✗ 生成的索引未通过校验（${problems.length} 项）：`);
    for (const p of problems) console.error(`    ${p.path}: ${p.reason}`);
    process.exit(1);
  }

  mkdirSync(dirname(outPath), { recursive: true });
  writeFileSync(outPath, `${JSON.stringify(doc, null, 2)}\n`, 'utf8');
  console.log(`\n✓ 已写入 ${opts.out}（${versions.length} 个版本）`);
}

function loadExisting(outPath) {
  if (!existsSync(outPath)) return null;
  try {
    return JSON.parse(readFileSync(outPath, 'utf8'));
  } catch (err) {
    die(`已有索引 ${outPath} 不是合法 JSON：${String(err.message)}`);
  }
}

/** 读 JSON 文件；不存在或不可解析时返回 null（调用方给默认值）。 */
function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8'));
  } catch {
    return null;
  }
}

function runCheck(root, outPath) {
  if (!existsSync(outPath)) {
    die(`索引不存在：${outPath}（先运行生成器）`);
  }
  let doc;
  try {
    doc = JSON.parse(readFileSync(outPath, 'utf8'));
  } catch (err) {
    die(`索引不是合法 JSON：${String(err.message)}`);
  }

  problems.length = 0;
  validateIndex(root, outPath, doc);
  if (problems.length > 0) {
    console.error(`✗ 索引校验失败（${problems.length} 项）：`);
    for (const p of problems) console.error(`    ${p.path}: ${p.reason}`);
    process.exit(1);
  }
  const count = doc.plugins.reduce((sum, p) => sum + p.versions.length, 0);
  console.log(`✓ 索引校验通过：${doc.plugins.length} 个插件 / ${count} 个版本`);
}

main();
