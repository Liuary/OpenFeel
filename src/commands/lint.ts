/**
 * lint 命令组注册
 * openfeel lint i18n | kb | req | fill
 *
 * - lint i18n: 校验 src/core/i18n-data/zh-CN.ts 与 en.ts 键一致性
 *   （空值、中文版独有键、英文版独有键）
 * - lint kb: 扫描 .openfeel/kb/*.md 中的文件引用（markdown 链接 + 行内代码引用），
 *   检测引用的文件是否仍然存在，输出过期引用列表
 * - lint req: 扫描 .openfeel/requirements/*.md 的行内反引号命令路径，沿**真实命令树**
 *   解析，报出不存在的命令（A 类阻塞 / B 类 advisory；抑制标记两档）
 * - lint fill: 列出空壳需求正文 / 缺需求级计划 / 空阶段文档（v1.6.0-stage-132 T3）。
 *   **advisory：有问题也 exit 0**（存量空壳不能让 lint 恒红）；JSON 的 `ok` 仍可被 CI 消费
 */
import { Command } from 'commander';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { t, getCliLang } from '../core/i18n.js';
import { allDomains as zhAllDomains } from '../core/i18n-data/zh-CN.js';
import { allDomains as enAllDomains } from '../core/i18n-data/en.js';
import { withSchemaVersion, emitJson } from './shared/json-output.js';
import {
  lintRequirements,
  toCommandTree,
  type LintReqIssue,
  type LintReqReport,
} from '../core/lint-req.js';
import {
  lintRequirementBodies,
  lintStageDocs,
  type RequirementBodyLintEntry,
  type RequirementPlanLintEntry,
  type StageDocLintReport,
} from '../core/plan/body-lint.js';

/** 结构化问题条目（JSON 契约形态 `{path,message}`） */
interface LintIssue {
  /** i18n = 语言源文件相对路径；kb = 源 KB 文件的项目根相对路径 */
  path: string;
  /** 本地化问题文案（与人类输出同源） */
  message: string;
}

/** i18n lint 报告（结构化 issues + 人类输出所需计数同源） */
interface LintI18nReport {
  issues: LintIssue[];
  consistentCount: number;
  total: number;
}

/** kb lint 报告（结构化 issues + 人类输出所需明细同源） */
interface LintKbReport {
  /** .openfeel/kb/ 是否存在 */
  hasDir: boolean;
  /** 扫描到的 kb 文件数 */
  scanCount: number;
  /** 已检查引用数 */
  checkedCount: number;
  /** 过期引用明细（人类输出与 issues 的共同来源） */
  stale: Array<{ file: string; ref: string; line: number }>;
}

/**
 * `lint fill` 报告（v1.6.0-stage-132 T3；与 `lint req` 的 `fill` 块同源，仅分组形态不同）。
 * `checked` = 扫描的需求正文文件数；`stageDocs` 只含**存在但未写实**的阶段文档。
 */
interface LintFillReport {
  checked: number;
  empty: RequirementBodyLintEntry[];
  missingPlan: RequirementPlanLintEntry[];
  stageDocs: StageDocLintReport;
}

/** 人类输出每组最多列出的条数（其余只报总数） */
const FILL_LIST_LIMIT = 20;

export function registerLintCommand(program: Command): void {
  const lint = program
    .command('lint')
    .description('项目健康检查');

  // lint i18n — 校验中英文键一致性
  lint
    .command('i18n')
    .description('校验 i18n 键一致性（空值/中英独有键）')
    .option('--json', t('help.lint.i18n.json', getCliLang(process.cwd())))
    .action((options: { json?: boolean }) => {
      const lang = getCliLang(process.cwd());
      const report = collectLintI18n(lang);
      if (options.json) {
        emitJson(withSchemaVersion({
          target: 'i18n',
          ok: report.issues.length === 0,
          issues: report.issues,
        }));
      } else {
        printLintI18n(report, lang);
      }
      // R1（用户已裁定）：发现问题即非 0 退出，对齐 flow health（JSON 成功文档 + 同退出码）
      if (report.issues.length > 0) {
        process.exitCode = 1;
      }
    });

  // lint kb — 检测知识库过期文件引用
  lint
    .command('kb')
    .description('检测 .openfeel/kb/ 中的过期文件引用')
    .option('--json', t('help.lint.kb.json', getCliLang(process.cwd())))
    .action((options: { json?: boolean }) => {
      const lang = getCliLang(process.cwd());
      const report = collectLintKb(process.cwd(), lang);
      if (options.json) {
        emitJson(withSchemaVersion({
          target: 'kb',
          ok: report.stale.length === 0,
          issues: report.stale.map((s) => ({
            path: `.openfeel/kb/${s.file}`,
            message: t('lint.kb.issueTmpl', lang, { line: String(s.line), ref: s.ref }),
          })),
        }));
      } else {
        printLintKb(report, lang);
      }
      // R1（用户已裁定）：存在过期引用即非 0 退出
      if (report.stale.length > 0) {
        process.exitCode = 1;
      }
    });

  // lint req — 需求正文中的命令名存在性（沿真实命令树解析）
  lint
    .command('req')
    .description('校验需求正文中的命令名（沿真实命令树解析）')
    .option('--json', t('help.lint.req.json', getCliLang(process.cwd())))
    .action((options: { json?: boolean }) => {
      const lang = getCliLang(process.cwd());
      // 命令树来自 registerLintCommand 收到的**根 program**（action 运行期现建：此时全部命令组
      // 已注册完）。★ 禁止 import ../cli/index.js —— cli → commands → cli 会成环。
      const report = lintRequirements(process.cwd(), toCommandTree(program), lang);

      // ★ REV-011：未闭合 ignore-start 区间不许静默 —— 每处一行 stderr 警告，
      // 不改退出码、不进 JSON（JSON 键集恒 7 键），stdout 仍恰好一个 JSON 文档。
      for (const region of report.unclosedRegions) {
        console.error(t('lint.req.unclosedRegionWarn', lang, {
          path: region.path,
          line: String(region.line),
        }));
      }

      if (options.json) {
        // 元素恒 `{path,message}` 两键（复用 lint 既有形状）；issues = A 类、suspects = B 类
        const toIssue = (issue: LintReqIssue) => ({ path: issue.path, message: issue.message });
        emitJson(withSchemaVersion({
          target: 'req',
          ok: report.issues.length === 0, // 只由 A 类决定（与 #38/#39 同语义）
          issues: report.issues.map(toIssue),
          suspects: report.suspects.map(toIssue),
          unknownCount: report.unknownCount,
          suspectCount: report.suspectCount,
          // ★ v1.6.0-stage-132 / T3：空壳清单（**新增键**，advisory，不驱动 ok / 退出码）
          fill: {
            emptyBody: report.fill.empty.map((entry) => ({ id: entry.id, emptySections: entry.emptySections })),
            emptyPlan: report.fill.missingPlan.map((entry) => ({ id: entry.id })),
          },
        }));
      } else {
        printLintReq(report, lang);
        printLintReqFill(report.fill);
      }
      // R1 口径：仅 A 类影响退出码（B 类低置信只提示，绝不阻塞）
      //               fill 亦为 advisory：空壳清单不改变退出码。
      if (report.issues.length > 0) {
        process.exitCode = 1;
      }
    });

  // lint fill — 空壳需求正文 / 缺需求级计划 / 空阶段文档（v1.6.0-stage-132 T3）
  lint
    .command('fill')
    .description('列出空壳需求正文 / 缺需求级计划 / 空阶段文档（advisory，不改退出码）')
    .option('--json', '以 JSON 输出 { schemaVersion, target, ok, checked, empty, missingPlan, stageDocs }')
    .action((options: { json?: boolean }) => {
      const projectPath = process.cwd();
      const body = lintRequirementBodies(projectPath);
      const report: LintFillReport = {
        checked: body.checked,
        empty: body.empty,
        missingPlan: body.missingPlan,
        stageDocs: lintStageDocs(projectPath),
      };
      if (options.json) {
        emitJson(withSchemaVersion({
          target: 'fill',
          ok: isFillGreen(report),
          checked: report.checked,
          empty: report.empty,
          missingPlan: report.missingPlan,
          stageDocs: report.stageDocs,
        }));
      } else {
        printLintFill(report);
      }
      // ★ 退出码语义（与 i18n/kb/req 三个目标**刻意不同**）：fill 是 advisory 清单，
      //   存量空壳（本仓 48+ 条）不得让 lint 恒红，故**恒 exit 0**；`ok:false` 仅在 JSON 里供 CI 消费。
    });
}

/**
 * 收集中英文键一致性问题（与人类输出同源：issues[].message 即人类问题行文案）。
 * 检测项：目标语言字段为空、中文版独有键、英文版独有键。
 * @returns 结构化问题 + 一致键数 / 总键数（人类输出计数）
 */
function collectLintI18n(lang: string): LintI18nReport {
  // 构建 key → 目标语言字段 映射（zh 表取 zh 字段，en 表取 en 字段）
  const zhMap = new Map<string, string>();
  const enMap = new Map<string, string>();
  for (const d of zhAllDomains) {
    for (const entry of Object.values(d.domain)) {
      zhMap.set(entry.key, entry.zh);
    }
  }
  for (const d of enAllDomains) {
    for (const entry of Object.values(d.domain)) {
      enMap.set(entry.key, entry.en);
    }
  }

  // 逐项检测，收集结构化问题（path = 问题所在语言源文件）
  const zhPath = 'src/core/i18n-data/zh-CN.ts';
  const enPath = 'src/core/i18n-data/en.ts';
  const issues: LintIssue[] = [];
  for (const [key, zh] of zhMap) {
    if (zh === '') {
      issues.push({ path: zhPath, message: t('lint.i18n.emptyZhTmpl', lang, { key }) });
    }
    if (!enMap.has(key)) {
      issues.push({ path: zhPath, message: t('lint.i18n.zhOnlyTmpl', lang, { key }) });
    }
  }
  for (const [key, en] of enMap) {
    if (en === '') {
      issues.push({ path: enPath, message: t('lint.i18n.emptyEnTmpl', lang, { key }) });
    }
    if (!zhMap.has(key)) {
      issues.push({ path: enPath, message: t('lint.i18n.enOnlyTmpl', lang, { key }) });
    }
  }

  // 一致键：两侧都有且值非空
  const consistentCount = [...zhMap.keys()].filter(
    (k) => zhMap.get(k) !== '' && enMap.has(k) && enMap.get(k) !== '',
  ).length;

  return { issues, consistentCount, total: zhMap.size };
}

/** 打印 i18n lint 人类输出（逐字保持既有文案） */
function printLintI18n(report: LintI18nReport, lang: string): void {
  if (report.issues.length === 0) {
    console.log(t('lint.i18n.okTmpl', lang, { n: String(report.consistentCount) }));
    return;
  }
  console.log(t('lint.i18n.failTitleTmpl', lang, { m: String(report.issues.length) }));
  for (const issue of report.issues) {
    console.log(`  ${issue.message}`);
  }
  console.log(t('lint.i18n.consistentTmpl', lang, {
    n: String(report.consistentCount),
    total: String(report.total),
  }));
}

/**
 * 扫描 .openfeel/kb/*.md 中的文件引用，收集过期引用（人类输出与 JSON issues 的共同来源）。
 * 提取来源：markdown 链接 `[text](path)` 与行内代码引用 `` `path` ``。
 * @returns kb 报告（无目录时 hasDir=false、stale 为空）
 */
function collectLintKb(projectPath: string, lang: string): LintKbReport {
  void lang;
  const kbDir = resolve(projectPath, '.openfeel', 'kb');

  if (!existsSync(kbDir)) {
    return { hasDir: false, scanCount: 0, checkedCount: 0, stale: [] };
  }

  const files = readdirSync(kbDir).filter((f) => f.endsWith('.md'));
  const stale: Array<{ file: string; ref: string; line: number }> = [];
  let checkedCount = 0;

  for (const file of files) {
    const filePath = join(kbDir, file);
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    lines.forEach((line, idx) => {
      const candidates = extractRefs(line);
      for (const cand of candidates) {
        const abs = resolveRef(projectPath, kbDir, cand.raw, cand.source);
        if (abs === null) {
          continue; // 无法可靠解析（URL/占位符/纯文件名简写等），跳过避免误报
        }
        checkedCount += 1;
        if (!existsSync(abs)) {
          stale.push({ file, ref: cand.raw, line: idx + 1 });
        }
      }
    });
  }

  return { hasDir: true, scanCount: files.length, checkedCount, stale };
}

/** 打印 kb lint 人类输出（逐字保持既有文案） */
function printLintKb(report: LintKbReport, lang: string): void {
  if (!report.hasDir) {
    console.log(t('lint.kb.noDir', lang));
    return;
  }

  console.log(t('lint.kb.scanTmpl', lang, { n: String(report.scanCount) }));

  if (report.stale.length === 0) {
    console.log(t('lint.kb.okTmpl', lang, { n: String(report.checkedCount) }));
    return;
  }

  console.log(t('lint.kb.staleTmpl', lang, { n: String(report.stale.length) }));
  for (const s of report.stale) {
    console.log(t('lint.kb.staleItemTmpl', lang, { file: s.file, ref: s.ref, line: String(s.line) }));
  }
}

/**
 * 打印 req lint 人类输出（与 JSON issues/suspects 同源：人类行 = `'  ' + path + ' ' + message`）。
 *
 * - A 类（issues）在前、B 类（suspects）在后；**成功态也展示 suspects**（否则用户只看到
 *   「✅ 未发现…」而错过低置信提示）；
 * - 抑制行数恒出现在首行（REV-011：让「抑制了多少」可见）；
 * - 未闭合区间的 stderr 警告由命令层先行输出（不在本函数内）。
 */
function printLintReq(report: LintReqReport, lang: string): void {
  const suppressed = String(report.suppressedLines);
  if (report.issues.length === 0) {
    console.log(t('lint.req.okTmpl', lang, {
      n: String(report.candidates),
      files: String(report.files),
      suppressed,
    }));
  } else {
    console.log(t('lint.req.failTitleTmpl', lang, {
      m: String(report.issues.length),
      low: String(report.suspects.length),
      suppressed,
    }));
    for (const issue of report.issues) {
      console.log(`  ${issue.path} ${issue.message}`);
    }
  }
  for (const suspect of report.suspects) {
    console.log(`  ${suspect.path} ${suspect.message}`);
  }
}

/**
 * 打印 `lint req` 的空壳 advisory 块（v1.6.0-stage-132 / T3）。
 *
 * 文案为**本批内联**（dispatch 边界内不改 `i18n-data`，键随后续文档/i18n 任务同批补齐）；
 * 该块只提示、不影响 `ok` 与退出码 —— 全绿时恰好一行 `fill: OK`。
 */
function printLintReqFill(fill: {
  empty: RequirementBodyLintEntry[];
  missingPlan: RequirementPlanLintEntry[];
}): void {
  const total = fill.empty.length + fill.missingPlan.length;
  if (total === 0) {
    console.log('fill: OK');
    return;
  }
  console.log(
    `fill: 空壳需求 ${fill.empty.length} 个 / 缺需求级计划 ${fill.missingPlan.length} 个`
    + '（advisory，详见 `openfeel lint fill`）',
  );
  printFillGroup('空壳需求', fill.empty.map((entry) => `${entry.id}（${entry.emptySections.join('、')}）`));
  printFillGroup('缺需求级计划', fill.missingPlan.map((entry) => entry.id));
}

/** `lint fill` 报告是否全绿（四组清单均为空） */
function isFillGreen(report: LintFillReport): boolean {
  return report.empty.length === 0
    && report.missingPlan.length === 0
    && report.stageDocs.overviewEmpty.length === 0
    && report.stageDocs.planEmpty.length === 0;
}

/**
 * 打印 `lint fill` 人类输出（分组、每组最多 {@link FILL_LIST_LIMIT} 条 + 剩余数）。
 * 全绿输出一行 `fill: OK`；**退出码恒 0**（见命令注册处注释）。
 */
function printLintFill(report: LintFillReport): void {
  const total = report.empty.length
    + report.missingPlan.length
    + report.stageDocs.overviewEmpty.length
    + report.stageDocs.planEmpty.length;
  if (total === 0) {
    console.log(`fill: OK（已检查 ${report.checked} 个需求文件；阶段文档无空壳）`);
    return;
  }
  console.log(`fill: 发现 ${total} 项（已检查 ${report.checked} 个需求文件）`);
  printFillGroup('空壳需求', report.empty.map((entry) => `${entry.id}（${entry.emptySections.join('、')}）`));
  printFillGroup('缺需求级计划', report.missingPlan.map((entry) => entry.id));
  printFillGroup('空 overview', report.stageDocs.overviewEmpty.map((entry) => entry.stageId));
  printFillGroup('空 plan', report.stageDocs.planEmpty.map((entry) => entry.stageId));
}

/** 打印一组清单（标题含总数；超出上限只打「其余 N 条」） */
function printFillGroup(title: string, items: readonly string[]): void {
  if (items.length === 0) {
    return;
  }
  console.log(`${title}（${items.length}）:`);
  for (const item of items.slice(0, FILL_LIST_LIMIT)) {
    console.log(`  ${item}`);
  }
  if (items.length > FILL_LIST_LIMIT) {
    console.log(`  …其余 ${items.length - FILL_LIST_LIMIT} 条`);
  }
}

/** 引用候选：原始文本 + 来源类型 */
interface RefCandidate {
  raw: string;
  source: 'link' | 'code';
}

/**
 * 从单行文本中提取文件引用候选。
 * - markdown 链接：[text](path) 或 [text](path "title")
 * - 行内代码：`path`
 */
function extractRefs(line: string): RefCandidate[] {
  const candidates: RefCandidate[] = [];
  const linkRe = /\[[^\]]*\]\(([^)]+)\)/g;
  let m: RegExpExecArray | null;
  while ((m = linkRe.exec(line)) !== null) {
    candidates.push({ raw: m[1].trim(), source: 'link' });
  }
  const codeRe = /`([^`]+)`/g;
  while ((m = codeRe.exec(line)) !== null) {
    candidates.push({ raw: m[1].trim(), source: 'code' });
  }
  return candidates;
}

/**
 * 将引用文本解析为绝对路径。
 * - 跳过：URL / 绝对路径 / 用户主目录（~）/ 锚点 / 含通配符、占位符、空格、
 *   括号（函数调用）、逗号（代码片段）、反斜杠（转义/Windows 路径）、`..`（上级引用/路径穿越示例）
 * - 含目录分隔符 → 仅接受已知项目目录前缀（src/ test/ docs/ scripts/ bin/ schemas/
 *   .openfeel/ .opencode/ kb/ 与 ./），解析为相对项目根（`kb/` 前缀映射到 `.openfeel/kb/`）
 * - 无分隔符：
 *   - markdown 链接来源 → 相对 kb 目录（显式引用，不存在也返回以便报告）
 *   - 行内代码来源 → 依次尝试 kb 目录与项目根，均不存在则返回 null（避免简写误报）
 * - 解析失败返回 null（调用方跳过）
 */
function resolveRef(projectPath: string, kbDir: string, raw: string, source: 'link' | 'code'): string | null {
  let p = raw.split('#')[0].trim();
  // 去掉 markdown 链接的 "title" 后缀
  p = p.replace(/\s+["'].*["']\s*$/, '').trim();

  if (!p) return null;
  // 跳过 URL / 绝对路径 / 锚点 / 用户主目录
  if (/^(https?:|mailto:|#|\/|\\|~)/.test(p)) return null;
  // 跳过含通配符 / 占位符 / 括号（函数调用）/ 逗号 / 反斜杠 / 上级引用序列 / 空格的文本（非具体文件路径）
  if (/[{}*<>(),\\]/.test(p)) return null;
  if (/\.\./.test(p)) return null;
  if (/\s/.test(p)) return null;

  // 含目录分隔符 → 仅接受已知项目目录前缀
  if (p.includes('/')) {
    const knownPrefixes = ['src/', 'test/', 'docs/', 'scripts/', 'bin/', 'schemas/', '.openfeel/', '.opencode/', 'kb/', './'];
    if (!knownPrefixes.some((pre) => p.startsWith(pre))) {
      return null;
    }
    if (p.startsWith('kb/')) {
      return join(projectPath, '.openfeel', p);
    }
    if (p.startsWith('./')) {
      return join(kbDir, p.slice(2));
    }
    return join(projectPath, p);
  }

  // 无分隔符 → 优先 kb 目录
  const inKb = join(kbDir, p);
  if (existsSync(inKb)) return inKb;

  // markdown 链接是显式引用：kb 目录中不存在则返回路径以便报告过期
  if (source === 'link') {
    return inKb;
  }

  // 行内代码可能指向项目根文件
  const inRoot = join(projectPath, p);
  if (existsSync(inRoot)) return inRoot;

  // 纯文件名简写（如 flow-manager.ts 实际在 src/core/ 下）无法可靠解析，跳过
  return null;
}
