/**
 * project 命令组注册
 * openfeel project overview  — 实时扫描项目结构，输出结构化概览
 */
import { Command } from 'commander';
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import fg from 'fast-glob';

export function registerProjectCommand(program: Command): void {
  const project = program
    .command('project')
    .description('项目管理与概览');

  // project overview — 实时扫描并输出结构化项目概览
  project
    .command('overview')
    .description('实时扫描项目结构，输出结构化概览')
    .action(() => {
      const cwd = process.cwd();
      outputProjectOverview(cwd);
    });
}

function outputProjectOverview(cwd: string): void {
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

  // ── 目录文件统计 ──
  const srcCliFiles = srcExists ? fg.sync(['cli/**/*.ts'], { cwd: srcDir }).length : 0;
  const srcCommandsFiles = srcExists ? fg.sync(['commands/**/*.ts'], { cwd: srcDir }).length : 0;
  const srcCoreFiles = srcExists ? fg.sync(['core/**/*.ts'], { cwd: srcDir }).length : 0;
  const srcUtilsFiles = srcExists ? fg.sync(['utils/**/*.ts'], { cwd: srcDir }).length : 0;

  // ── 统计信息 ──
  const tsSourceFiles = srcExists ? fg.sync(['src/**/*.ts'], { cwd }).length : 0;
  const agentDefs = opencodeExists ? fg.sync(['.opencode/agents/*.md'], { cwd }).length : 0;
  const cliCommandModules = srcExists ? fg.sync(['src/commands/*.ts'], { cwd }).length : 0;
  const kbEntries = countKbEntries(cwd);
  const planVersions = openfeelExists ? fg.sync(['.openfeel/plan/*/plan.md'], { cwd }).length : 0;

  // ── 输出结构化概览 ──
  console.log('');
  console.log('╔══════════════════════════════════════════╗');
  console.log('║     OpenFeel 项目结构化概览              ║');
  console.log('╚══════════════════════════════════════════╝');
  console.log('');

  // 📋 基本信息
  console.log('📋 基本信息');
  console.log(`   项目名: ${projectName} (v${projectVersion})`);
  console.log(`   定位:   ${projectDesc}`);
  console.log(`   语言:   TypeScript (Node.js)`);
  console.log('');

  // 📁 目录结构
  console.log('📁 目录结构');
  if (srcExists) {
    console.log('   src/');
    console.log(`    ├─ cli/          — CLI 入口程序（${srcCliFiles} 个文件）`);
    console.log(`    ├─ commands/     — CLI 命令模块（${srcCommandsFiles} 个）`);
    console.log(`    ├─ core/         — 核心逻辑（${srcCoreFiles} 个文件）`);
    console.log(`    └─ utils/        — 工具函数（${srcUtilsFiles} 个文件）`);
  } else {
    console.log('   src/    （目录不存在）');
  }

  if (opencodeExists) {
    const agentFiles = fg.sync(['agents/*.md'], { cwd: opencodeDir }).length;
    const skillDirs = fg.sync(['skills/*'], { cwd: opencodeDir, onlyDirectories: true }).length;
    console.log('   .opencode/');
    console.log(`    ├─ agents/       — Agent 定义（${agentFiles} 个）`);
    // skills 下可能有多个子目录，用 glob 统计
    console.log(`    └─ skills/       — 技能定义（${skillDirs} 个）`);
  } else {
    console.log('   .opencode/  （目录不存在）');
  }

  if (openfeelExists) {
    const kbFiles = fg.sync(['kb/*.md'], { cwd: openfeelDir }).length;
    const planDirEntries = fg.sync(['plan/*'], { cwd: openfeelDir, onlyDirectories: true }).length;
    const reviewFiles = fg.sync(['code_review/*.md'], { cwd: openfeelDir }).length;
    const bugDirExists = existsSync(resolve(openfeelDir, 'bugs'));
    console.log('   .openfeel/');
    console.log(`    ├─ kb/           — 项目知识库（${kbFiles} 个文件）`);
    console.log(`    ├─ plan/         — 工作计划（${planDirEntries} 个版本）`);
    console.log(`    ├─ code_review/  — 代码审查记录（${reviewFiles} 个文件）`);
    console.log(`    └─ bugs/         — Bug 追踪${bugDirExists ? '' : '（未初始化）'}`);
  } else {
    console.log('   .openfeel/  （目录不存在）');
  }
  console.log('');

  // 📊 统计信息
  console.log('📊 统计信息');
  console.log(`   TS 源文件:   ${tsSourceFiles} 个`);
  console.log(`   Agent 定义:  ${agentDefs} 个`);
  console.log(`   CLI 命令模块: ${cliCommandModules} 个`);
  console.log(`   KB 条目:     ${kbEntries} 个`);
  console.log(`   计划版本:    ${planVersions} 个`);
  console.log('');

  // 🚪 入口路径
  console.log('🚪 入口路径');
  console.log('   CLI 入口:  src/cli/index.ts');
  console.log('   包入口:    src/index.ts');
  console.log('   构建产物:  dist/');
  console.log('');

  // 🔧 技术栈（从 package.json 依赖动态提取版本号）
  console.log('🔧 技术栈');
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

  console.log(`   运行时:    ${runtimeVer}`);
  console.log(`   语言:      ${tsVer}`);
  console.log(`   CLI 框架:  ${commanderVer}`);
  console.log(`   校验:      ${zodVer}`);
  console.log(`   配置:      YAML`);
  console.log(`   文件匹配:  ${globVer}`);
  console.log(`   测试:      ${vitestVer}`);
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
