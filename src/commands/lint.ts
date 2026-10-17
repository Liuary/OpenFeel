/**
 * lint 命令组注册
 * openfeel lint i18n | kb
 *
 * - lint i18n: 校验 src/core/i18n-data/zh-CN.ts 与 en.ts 键一致性
 *   （空值、中文版独有键、英文版独有键）
 * - lint kb: 扫描 .openfeel/kb/*.md 中的文件引用（markdown 链接 + 行内代码引用），
 *   检测引用的文件是否仍然存在，输出过期引用列表
 */
import { Command } from 'commander';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { t, getCliLang } from '../core/i18n.js';
import { allDomains as zhAllDomains } from '../core/i18n-data/zh-CN.js';
import { allDomains as enAllDomains } from '../core/i18n-data/en.js';
import { withSchemaVersion, emitJson } from './shared/json-output.js';

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
