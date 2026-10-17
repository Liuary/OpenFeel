/**
 * project 命令组注册
 * openfeel project overview  — 实时扫描项目结构，输出结构化概览
 *
 * v1.2.2-stage-97 op-001：拆分为「先聚合数据对象（collectProjectOverview）→ 再渲染」，
 * 人类输出逐字不变，`--json` 输出同一数据对象的单文档（schemaVersion 首键）。
 */
import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';
import { t, getCliLang } from '../core/i18n.js';
import { withSchemaVersion, emitJson } from './shared/json-output.js';

/** project overview 聚合数据（JSON 契约冻结字段集） */
export interface ProjectOverviewData {
  project: { name: string; version: string; description: string };
  dirs: {
    src: { exists: boolean; cli: number | null; commands: number | null; core: number | null; utils: number | null };
    opencode: { exists: boolean; agents: number | null; skills: number | null };
    openfeel: { exists: boolean; kb: number | null; plan: number | null; codeReview: number | null; bugs: boolean | null };
  };
  stats: { tsSourceFiles: number; agentDefs: number; cliModules: number; kbEntries: number; planVersions: number };
  entries: { available: boolean; cli: string; pkg: string; build: string };
  techStack: { runtime: string; language: string; cliFramework: string; validation: string; config: string; fileMatch: string; test: string };
}

export function registerProjectCommand(program: Command): void {
  const project = program
    .command('project')
    .description('项目管理与概览');

  // project overview — 实时扫描并输出结构化项目概览
  project
    .command('overview')
    .description('实时扫描项目结构，输出结构化概览')
    .option('--json', t('help.project.overview.json', getCliLang(process.cwd())))
    .action((options: { json?: boolean }) => {
      const cwd = process.cwd();
      const data = collectProjectOverview(cwd);
      // JSON 分支须为首行纯 JSON 单文档（先聚合后渲染）
      if (options.json) {
        emitJson(withSchemaVersion({
          project: data.project,
          dirs: data.dirs,
          stats: data.stats,
          entries: data.entries,
          techStack: data.techStack,
        }));
        return;
      }
      renderProjectOverviewHuman(data, getCliLang(cwd));
    });
}

/**
 * 聚合项目概览数据（执行全部扫描：package.json / 目录存在性 / glob 计数 / KB 条目）。
 * @param cwd 项目根目录
 * @returns 冻结字段集的数据对象
 */
export function collectProjectOverview(cwd: string): ProjectOverviewData {
  // ── 读取项目基本信息 ──
  const pkgPath = resolve(cwd, 'package.json');
  let projectName = 'unknown';
  let projectVersion = '0.0.0';
  let projectDesc = 'AI Agent 开发流程治理 CLI 工具';
  const dependencies: Record<string, string> = {};
  const devDependencies: Record<string, string> = {};

  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf-8'));
      projectName = pkg.name || 'unknown';
      projectVersion = pkg.version || '0.0.0';
      projectDesc = pkg.description || projectDesc;
      Object.assign(dependencies, pkg.dependencies || {});
      Object.assign(devDependencies, pkg.devDependencies || {});
    } catch {
      // 解析失败时使用默认值
    }
  }

  // ── 目录存在性检查 ──
  const srcDir = resolve(cwd, 'src');
  const opencodeDir = resolve(cwd, '.opencode');
  const openfeelDir = resolve(cwd, '.openfeel');

  const srcExists = existsSync(srcDir);
  const opencodeExists = existsSync(opencodeDir);
  const openfeelExists = existsSync(openfeelDir);

  // ── 目录文件统计（目录不存在 → 子项 null）──
  const srcCliFiles = srcExists ? fg.sync(['cli/**/*.ts'], { cwd: srcDir }).length : null;
  const srcCommandsFiles = srcExists ? fg.sync(['commands/**/*.ts'], { cwd: srcDir }).length : null;
  const srcCoreFiles = srcExists ? fg.sync(['core/**/*.ts'], { cwd: srcDir }).length : null;
  const srcUtilsFiles = srcExists ? fg.sync(['utils/**/*.ts'], { cwd: srcDir }).length : null;

  // 人类渲染分支同一 glob（相对 opencodeDir），与 stats.agentDefs（相对 cwd）分别保存，防止输出漂移
  const opencodeAgents = opencodeExists ? fg.sync(['agents/*.md'], { cwd: opencodeDir }).length : null;
  const opencodeSkills = opencodeExists ? fg.sync(['skills/*'], { cwd: opencodeDir, onlyDirectories: true }).length : null;

  const openfeelKb = openfeelExists ? fg.sync(['kb/*.md'], { cwd: openfeelDir }).length : null;
  const openfeelPlan = openfeelExists ? fg.sync(['plan/*'], { cwd: openfeelDir, onlyDirectories: true }).length : null;
  const openfeelCodeReview = openfeelExists ? fg.sync(['code_review/*.md'], { cwd: openfeelDir }).length : null;
  const openfeelBugs = openfeelExists ? existsSync(resolve(openfeelDir, 'bugs')) : null;

  // ── 统计信息（目录不存在 → 0，与人类输出一致）──
  const tsSourceFiles = srcExists ? fg.sync(['src/**/*.ts'], { cwd }).length : 0;
  const agentDefs = opencodeExists ? fg.sync(['.opencode/agents/*.md'], { cwd }).length : 0;
  const cliCommandModules = srcExists ? fg.sync(['src/commands/*.ts'], { cwd }).length : 0;
  const kbEntries = countKbEntries(cwd);
  const planVersions = openfeelExists ? fg.sync(['.openfeel/plan/*/plan.md', '.openfeel/plan/*/*/plan.md'], { cwd }).length : 0;

  // ── 技术栈展示字符串（从 package.json 依赖动态提取版本号）──
  const runtimeVer = dependencies['node'] || 'Node.js ≥20';
  const tsVer = devDependencies['typescript']
    ? `TypeScript ${devDependencies['typescript'].replace(/^\^|~/, '')}+`
    : 'TypeScript 5.7+';
  const commanderVer = dependencies['commander']
    ? `Commander ${dependencies['commander'].replace(/^\^|~/, '')}+`
    : 'Commander 14+';
  const zodVer = dependencies['zod']
    ? `Zod ${dependencies['zod'].replace(/^\^|~/, '')}+`
    : 'Zod 4+';
  const globVer = dependencies['fast-glob']
    ? `fast-glob ${dependencies['fast-glob'].replace(/^\^|~/, '')}+`
    : 'fast-glob';
  const vitestVer = devDependencies['vitest']
    ? `Vitest ${devDependencies['vitest'].replace(/^\^|~/, '')}+`
    : 'Vitest 3+';

  return {
    project: { name: projectName, version: projectVersion, description: projectDesc },
    dirs: {
      src: { exists: srcExists, cli: srcCliFiles, commands: srcCommandsFiles, core: srcCoreFiles, utils: srcUtilsFiles },
      opencode: { exists: opencodeExists, agents: opencodeAgents, skills: opencodeSkills },
      openfeel: { exists: openfeelExists, kb: openfeelKb, plan: openfeelPlan, codeReview: openfeelCodeReview, bugs: openfeelBugs },
    },
    stats: {
      tsSourceFiles,
      agentDefs,
      cliModules: cliCommandModules,
      kbEntries,
      planVersions,
    },
    entries: {
      available: srcExists,
      cli: 'src/cli/index.ts',
      pkg: 'src/index.ts',
      build: 'dist/',
    },
    techStack: {
      runtime: runtimeVer,
      language: tsVer,
      cliFramework: commanderVer,
      validation: zodVer,
      config: 'YAML',
      fileMatch: globVer,
      test: vitestVer,
    },
  };
}

/**
 * 人类可读渲染（逐字保持 stage-52 既有输出：标题框、基本信息、目录结构、统计、入口路径、技术栈）。
 * @param data collectProjectOverview 的聚合结果
 * @param lang 输出语言
 */
export function renderProjectOverviewHuman(data: ProjectOverviewData, lang: string): void {
  const { project, dirs, stats, entries, techStack } = data;

  // ── 输出结构化概览 ──
  console.log('');
  console.log(`╔══════════════════════════════════════════╗`);
  console.log(`║     ${t('project.overview.title', lang).padEnd(40)}║`);
  console.log(`╚══════════════════════════════════════════╝`);
  console.log('');

  // 📋 基本信息
  console.log(t('project.overview.basicInfo', lang));
  console.log(`   ${t('project.overview.projectName', lang)}: ${project.name} (v${project.version})`);
  console.log(`   ${t('project.overview.description', lang)}:   ${project.description}`);
  console.log(`   ${t('project.overview.language', lang)}:   TypeScript (Node.js)`);
  console.log('');

  // 📁 目录结构
  console.log(t('project.overview.dirStructure', lang));
  if (dirs.src.exists) {
    console.log('   src/');
    console.log(`    ├─ cli/          ${t('project.dir.cliTmpl', lang, { n: String(dirs.src.cli) })}`);
    console.log(`    ├─ commands/     ${t('project.dir.commandsTmpl', lang, { n: String(dirs.src.commands) })}`);
    console.log(`    ├─ core/         ${t('project.dir.coreTmpl', lang, { n: String(dirs.src.core) })}`);
    console.log(`    └─ utils/        ${t('project.dir.utilsTmpl', lang, { n: String(dirs.src.utils) })}`);
  } else {
    console.log(`   src/    ${t('project.overview.dirNotExist', lang)}`);
  }

  if (dirs.opencode.exists) {
    console.log('   平台适配器目录（.opencode/）');
    console.log(`    ├─ agents/       ${t('project.dir.agentsTmpl', lang, { n: String(dirs.opencode.agents) })}`);
    // skills 下可能有多个子目录，用 glob 统计
    console.log(`    └─ skills/       ${t('project.dir.skillsTmpl', lang, { n: String(dirs.opencode.skills) })}`);
  } else {
    console.log(`   平台适配器目录（.opencode/）  ${t('project.overview.dirNotExist', lang)}`);
  }

  if (dirs.openfeel.exists) {
    console.log('   .openfeel/');
    console.log(`    ├─ kb/           ${t('project.dir.kbTmpl', lang, { n: String(dirs.openfeel.kb) })}`);
    console.log(`    ├─ plan/         ${t('project.dir.planTmpl', lang, { n: String(dirs.openfeel.plan) })}`);
    console.log(`    ├─ code_review/  ${t('project.dir.codeReviewTmpl', lang, { n: String(dirs.openfeel.codeReview) })}`);
    console.log(`    └─ bugs/         ${t('project.dir.bugs', lang)}${dirs.openfeel.bugs ? '' : t('project.dir.bugsNotInit', lang)}`);
  } else {
    console.log(`   .openfeel/  ${t('project.overview.dirNotExist', lang)}`);
  }
  console.log('');

  // 📊 统计信息
  console.log(t('project.overview.stats', lang));
  console.log(`   ${t('project.stats.tsSource', lang)}:   ${stats.tsSourceFiles}`);
  console.log(`   ${t('project.stats.agentDefs', lang)}:  ${stats.agentDefs}`);
  console.log(`   ${t('project.stats.cliModules', lang)}: ${stats.cliModules}`);
  console.log(`   ${t('project.stats.kbEntries', lang)}:  ${stats.kbEntries}`);
  console.log(`   ${t('project.stats.planVersions', lang)}: ${stats.planVersions}`);
  console.log('');

  // 🚪 入口路径（以 src/ 存在性为统一门控）
  console.log(t('project.overview.entryPath', lang));
  if (entries.available) {
    console.log(`   ${t('project.entry.cli', lang)}:  ${entries.cli}`);
    console.log(`   ${t('project.entry.pkg', lang)}:    ${entries.pkg}`);
    console.log(`   ${t('project.entry.build', lang)}:  ${entries.build}`);
  } else {
    // 三条入口均依赖 src/，src/ 不存在时整节替换统一提示
    console.log(`   ${t('project.overview.noSrc', lang)}`);
  }
  console.log('');

  // 🔧 技术栈
  console.log(t('project.overview.techStack', lang));
  console.log(`   ${t('project.tech.runtime', lang)}:    ${techStack.runtime}`);
  console.log(`   ${t('project.tech.language', lang)}:      ${techStack.language}`);
  console.log(`   ${t('project.tech.cliFramework', lang)}:  ${techStack.cliFramework}`);
  console.log(`   ${t('project.tech.validation', lang)}:      ${techStack.validation}`);
  console.log(`   ${t('project.tech.config', lang)}:      ${techStack.config}`);
  console.log(`   ${t('project.tech.fileMatch', lang)}:  ${techStack.fileMatch}`);
  console.log(`   ${t('project.tech.test', lang)}:      ${techStack.test}`);
  console.log('');
}

/** 从 .openfeel/kb/index.md 解析分类表格的条目数并求和 */
function countKbEntries(cwd: string): number {
  const kbIndexPath = resolve(cwd, '.openfeel', 'kb', 'index.md');
  if (!existsSync(kbIndexPath)) {
    return 0;
  }
  try {
    const content = readFileSync(kbIndexPath, 'utf-8');
    const lines = content.split('\n');
    let total = 0;

    // 匹配分类概览表格中的条目数列（第三列），格式如 "| 架构决策 | [architecture.md](architecture.md) | 7 | ..."
    for (const line of lines) {
      const trimmed = line.trim();
      // 跳过非表格行和分隔行
      if (!trimmed.startsWith('|') || trimmed.includes('---')) {
        continue;
      }
      const cells = trimmed.split('|').map(c => c.trim());
      // 分类概览表格有 7 列（空|分类|文件|条目数|最近更新|用途|空），详细表格只有 5 列
      if (cells.length < 7) {
        continue;
      }
      const countStr = cells[3]; // 第 4 列（0-indexed = 3）是条目数
      const count = parseInt(countStr, 10);
      if (!isNaN(count)) {
        total += count;
      }
    }

    return total;
  } catch {
    return 0;
  }
}
