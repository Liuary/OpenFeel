/**
 * 项目初始化编排
 * 协调创建工作区、写入配置、初始化 flow.json、确保身份文件、
 * 生成 dev_core.md/current.md 模板。
 *
 * 注意：全局框架约束（AGENTS.md + agent + skill）由 `openfeel setup` 部署到
 * 全局配置目录（opencode 适配器：`~/.config/opencode/`）（v1.1.1 起统一），项目级不再部署约束/agent/skill。
 *
 * 变更摘要：
 * - stage-04: 新增 initDemo() 支持 --demo 标志
 * - stage-37: deployOpencode 部署目标改为全局 ~/.config/opencode/（opencode 适配器）
 * - v1.1.1: 拆除 deployOpencode 与项目 AGENTS.md 骨架；新增 initWorkspaceOnly（--workspace-only）
 */
import { readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { createWorkspace } from './workspace/structure.js';
import { ensureInfoJson, isFirstUse, getGlobalConfig, setGlobalConfig, DEFAULT_GLOBAL_CONFIG } from './workspace/identity.js';
import { writeDefaultConfig } from './config.js';
import { FlowManager } from './flow-manager.js';
import { getDevCoreTemplate, getCurrentTemplate, getDecisionsTemplate } from './templates.js';
import { t, getCliLang } from './i18n.js';
import { DEFAULT_STAGE_VERSION } from './plan/path.js';
import { atomicWriteFileSync } from './fs/atomic-write.js';
import { buildProjectOpencodeJsoncObj } from './opencode-config.js';
import { appendUpdateInfo } from './update-infos.js';
import { backupFileBeforeWrite, BackupError, notifyBackupIfTTY } from './backup.js';
import readline from 'node:readline';

/**
 * 提示用户选择语言
 * 交互模式下显示中英双语提示，非交互模式默认 zh-CN
 */
async function promptLanguage(): Promise<'zh-CN' | 'en'> {
  const lang = getCliLang(process.cwd());
  if (!process.stdout.isTTY) {
    console.log(t('init.prompt.nonInteractive', lang));
    return 'zh-CN';
  }

  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log(t('init.prompt.bilingual', lang));
    console.log('  1. English (en)');
    console.log('  2. 中文 (zh-CN) [default]');

    rl.question('Enter choice (1/2/en/zh) [2]: ', (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      if (trimmed === '1' || trimmed === 'en' || trimmed === 'english') {
        resolve('en');
      } else {
        // 默认 zh-CN（包含回车、2、zh、chinese 等情况）
        resolve('zh-CN');
      }
    });
  });
}

/**
 * 写入语言配置到 .openfeel/.info.json
 */
function writeLang(projectPath: string, lang: 'zh-CN' | 'en'): void {
  const infoPath = resolve(projectPath, '.openfeel', '.info.json');
  try {
    const content = readFileSync(infoPath, 'utf-8');
    const info = JSON.parse(content);
    info.lang = lang;
    atomicWriteFileSync(infoPath, JSON.stringify(info, null, 2) + '\n');
  } catch {
    // 文件不存在或解析失败，忽略
  }
}

/**
 * 确保全局配置文件存在。
 * 首次使用时提示用户选择全局默认语言，非交互环境默认 zh-CN。
 * 仅当全局配置文件不存在时触发。
 */
async function ensureGlobalConfig(): Promise<'zh-CN' | 'en'> {
  if (!isFirstUse()) {
    // 已配置，返回现有全局语言
    return getGlobalConfig().lang;
  }

  // 非交互环境（CI/CD / 无 TTY）：此时用户语言偏好未知，输出中英双语
  if (!process.stdout.isTTY) {
    console.log(t('init.firstUse.nonInteractive', 'zh-CN'));
    console.log(t('init.firstUse.nonInteractive', 'en'));
    console.log(t('init.firstUse.changeHint', 'zh-CN'));
    console.log(t('init.firstUse.changeHint', 'en'));
    setGlobalConfig({ ...DEFAULT_GLOBAL_CONFIG, lang: 'zh-CN' });
    return 'zh-CN';
  }

  // 交互环境：中英双语提示
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });

    console.log('\n' + t('init.firstUse.interactiveWelcome', 'zh-CN'));
    console.log('   ' + t('init.firstUse.interactiveWelcome', 'en'));
    console.log('');
    console.log('   1. English (en)');
    console.log('   2. 中文 (zh-CN)');
    console.log('');

    rl.question(t('init.firstUse.interactiveOption', 'zh-CN') + ' ', (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      const lang: 'zh-CN' | 'en' =
        (trimmed === '1' || trimmed === 'en' || trimmed === 'english') ? 'en' : 'zh-CN';

      setGlobalConfig({ ...DEFAULT_GLOBAL_CONFIG, lang });
      console.log(lang === 'en'
        ? '\n' + t('init.firstUse.langSetEn', lang)
        : '\n' + t('init.firstUse.langSetZh', lang));
      console.log('');
      resolve(lang);
    });
  });
}

/** 初始化结果 */
export interface InitResult {
  created: string[]; // 创建的目录列表
  updated: string[]; // 更新的文件列表
  skipped: string[]; // 因备份失败等原因跳过的文件（stage-46）
}

/** 示例骨架创建结果 */
export interface DemoResult {
  created: string[];
  skipped: string[];
}

/**
 * 写入模板文件（若目标不存在则创建，存在则跳过）
 */
function writeTemplateIfMissing(
  filePath: string,
  content: string,
): { created: boolean } {
  if (existsSync(filePath)) {
    return { created: false };
  }
  // 确保父目录存在
  const parentDir = dirname(filePath);
  if (!existsSync(parentDir)) {
    mkdirSync(parentDir, { recursive: true });
  }
  atomicWriteFileSync(filePath, content);
  return { created: true };
}

/**
 * 仅创建工作区（目录 + config.yaml + flow.json + .info.json + dev/kb 模板），
 * 不写项目平台适配器配置文件（opencode.jsonc）/ AGENTS.md（v1.1.1：workspace-only 与 initProject 复用）。
 * 语言由参数传入，不再内部 promptLanguage。
 */
function initWorkspaceCore(
  projectPath: string,
  lang: 'zh-CN' | 'en',
): { created: string[]; updated: string[]; skipped: string[] } {
  const created: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];

  // 1. 创建 .openfeel/ 目录结构（含 plan/, roadmap/, dev/note/, 等）
  const dirs = createWorkspace(projectPath);
  created.push(...dirs);

  // 2. 写入默认配置（根据所选语言）
  const configPath = resolve(projectPath, '.openfeel', 'config.yaml');
  const configExisted = existsSync(configPath);
  if (configExisted) {
    // BUG-002 语义修复（stage-47）：已存在的用户配置不再覆盖（保留用户 defaults）。
    // stage-46 的「备份 + 仍覆盖」缓解被本语义修复取代 —— 备份是覆盖的前置，此处不再覆盖故无备份接入。
    skipped.push('.openfeel/config.yaml (已存在，保留用户配置)');
  } else {
    // 目标不存在 → 无需备份，直接新建
    writeDefaultConfig(projectPath, lang);
    created.push('.openfeel/config.yaml');
  }

  // 3. 初始化 flow.json
  const flowPath = resolve(projectPath, '.openfeel', 'flow.json');
  const flowExisted = existsSync(flowPath);
  FlowManager.initFlow(projectPath);
  if (flowExisted) {
    updated.push('.openfeel/flow.json');
  } else {
    created.push('.openfeel/flow.json');
  }

  // 4. 确保 .info.json 存在
  const infoPath = resolve(projectPath, '.openfeel', '.info.json');
  const infoExisted = existsSync(infoPath);
  ensureInfoJson(projectPath);
  if (infoExisted) {
    updated.push('.openfeel/.info.json');
  } else {
    created.push('.openfeel/.info.json');
  }

  // 4b. 将语言写入 .info.json
  writeLang(projectPath, lang);

  // 5. 生成 .openfeel/dev/dev_core.md 模板（双语）
  const devCorePath = resolve(projectPath, '.openfeel', 'dev', 'dev_core.md');
  if (writeTemplateIfMissing(devCorePath, getDevCoreTemplate(lang)).created) {
    created.push('.openfeel/dev/dev_core.md');
  }

  // 6. 生成 .openfeel/dev/current.md 模板（双语）
  const currentPath = resolve(projectPath, '.openfeel', 'dev', 'current.md');
  if (writeTemplateIfMissing(currentPath, getCurrentTemplate(lang)).created) {
    created.push('.openfeel/dev/current.md');
  }

  // 6b. 生成 .openfeel/dev/decisions.md 模板（ADR 格式）
  const decisionsPath = resolve(projectPath, '.openfeel', 'dev', 'decisions.md');
  if (writeTemplateIfMissing(decisionsPath, getDecisionsTemplate(lang)).created) {
    created.push('.openfeel/dev/decisions.md');
  }

  // 7. 生成 .openfeel/kb/index.md 模板（双语）
  const kbIndexPath = resolve(projectPath, '.openfeel', 'kb', 'index.md');
  const kbContent = lang === 'en'
    ? '# Knowledge Base Index\n\n> No entries yet.\n'
    : '# 知识库索引\n\n> 暂无条目。\n';
  if (writeTemplateIfMissing(kbIndexPath, kbContent).created) {
    created.push('.openfeel/kb/index.md');
  }

  return { created, updated, skipped };
}

/**
 * 初始化项目工作区
 * 步骤：确保全局配置 → 语言选择 → 创建工作区 → 项目平台适配器配置文件（opencode.jsonc） → package.json vitest 检测
 * （v1.1.1：拆除全局 agent/skill/core.md 部署与项目 AGENTS.md 骨架，收归 openfeel setup）
 */
export async function initProject(projectPath: string, cliLang?: string): Promise<InitResult> {
  // 0. 确保全局配置存在（首次使用时交互选择语言）
  await ensureGlobalConfig();

  // 1. 语言选择：CLI --lang 参数 > 交互式选择 > 全局默认语言
  let selectedLang: 'zh-CN' | 'en';
  if (cliLang === 'en' || cliLang === 'zh-CN') {
    selectedLang = cliLang;
    console.log(t('init.agentLangTmpl', getCliLang(projectPath), { lang: selectedLang === 'en' ? 'English' : '中文' }));
  } else if (cliLang) {
    console.warn(t('init.invalidLangWarnTmpl', getCliLang(projectPath), { lang: cliLang }));
    selectedLang = await promptLanguage();
  } else {
    selectedLang = await promptLanguage();
  }

  // 2. 创建工作区（目录 + config.yaml + flow.json + .info.json + dev/kb 模板）
  const { created, updated, skipped } = initWorkspaceCore(projectPath, selectedLang);

  // 3. 项目平台适配器配置文件（opencode.jsonc）：最小覆盖（仅 $schema），不存在则写
  //    （v1.1.1 REV-1905 从 deployOpencode 抽出到 initProject）
  const projectJsoncPath = resolve(projectPath, 'opencode.jsonc');
  if (!existsSync(projectJsoncPath)) {
    atomicWriteFileSync(projectJsoncPath, JSON.stringify(buildProjectOpencodeJsoncObj(), null, 2) + '\n');
    created.push('opencode.jsonc');
  }

  // 4. 检测 package.json，若存在 vitest 则添加 @vitest/coverage-v8
  const pkgPath = resolve(projectPath, 'package.json');
  if (existsSync(pkgPath)) {
    const pkgContent = readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);

    // 检查 vitest 是否存在于 dependencies 或 devDependencies 中
    const vitestVersion =
      pkg.dependencies?.vitest || pkg.devDependencies?.vitest;

    if (vitestVersion) {
      // 确保 devDependencies 对象存在
      if (!pkg.devDependencies) {
        pkg.devDependencies = {};
      }

      // 仅在 @vitest/coverage-v8 尚未添加时处理
      if (!pkg.devDependencies['@vitest/coverage-v8']) {
        // 提取 vitest 的主版本号，使 coverage-v8 版本匹配
        const majorMatch = vitestVersion.match(/^(?:[\^~]?)(\d+)/);
        const majorVersion = majorMatch ? majorMatch[1] : '3';
        pkg.devDependencies['@vitest/coverage-v8'] = `^${majorVersion}.0.0`;
        try {
          // 写前备份（目标已存在且本次将实际写入）
          const bkPkg = backupFileBeforeWrite(pkgPath, { command: 'init', projectPath });
          if (bkPkg) {
            appendUpdateInfo('backed', { projectRoot: projectPath, relativePath: 'package.json', backupRel: bkPkg.backupRel, command: 'init' });
            notifyBackupIfTTY(bkPkg.backupRel);
          }
          atomicWriteFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
          updated.push('package.json');
        } catch (err) {
          if (err instanceof BackupError) {
            // 备份失败 → 不写盘（磁盘 package.json 保持原样；pkg 仅在内存中被修改）
            appendUpdateInfo('anomaly', { projectRoot: projectPath, relativePath: 'package.json', note: 'backup_failed' });
            console.warn(t('init.pkgBackupSkipTmpl', getCliLang(projectPath), { err: err.message }));
            skipped.push('package.json (backup failed)');
          } else {
            throw err;
          }
        }
      }
    }
  }

  return { created, updated, skipped };
}

/**
 * 非交互轻量子命令：仅创建工作区（供 feel 空白项目自动搭建；不建全局规则/平台适配器配置（AGENTS.md/opencode.jsonc））
 * 不做语言交互、不部署全局配置。
 */
export function initWorkspaceOnly(projectPath: string, lang?: string): { created: string[]; updated: string[]; skipped: string[] } {
  const deployLang: 'zh-CN' | 'en' = (lang === 'en' || lang === 'zh-CN') ? lang : 'zh-CN';
  return initWorkspaceCore(projectPath, deployLang);
}

/**
 * 创建示例项目骨架（--demo 标志触发）
 * 在项目目录下创建简化的 TypeScript 项目结构和示例 stage。
 */
export function initDemo(projectPath: string, lang: 'zh-CN' | 'en' = 'zh-CN'): DemoResult {
  const created: string[] = [];
  const skipped: string[] = [];

  const ensureFile = (relPath: string, content: string) => {
    const fullPath = join(projectPath, relPath);
    if (existsSync(fullPath)) {
      skipped.push(relPath);
      return;
    }
    const parentDir = dirname(fullPath);
    if (!existsSync(parentDir)) {
      mkdirSync(parentDir, { recursive: true });
    }
    atomicWriteFileSync(fullPath, content);
    created.push(relPath);
  };

  // src/index.ts — 简单入口
  ensureFile(
    'src/index.ts',
    `/**\n * 示例项目入口\n */\nexport function sum(a: number, b: number): number {\n  return a + b;\n}\n`,
  );

  // tsconfig.json — TypeScript 配置
  ensureFile(
    'tsconfig.json',
    `{\n  "compilerOptions": {\n    "target": "ES2022",\n    "module": "ESNext",\n    "moduleResolution": "bundler",\n    "strict": true,\n    "esModuleInterop": true,\n    "skipLibCheck": true,\n    "outDir": "dist",\n    "rootDir": "src",\n    "declaration": true\n  },\n  "include": ["src"]\n}\n`,
  );

  // package.json — 项目清单（仅当不存在时创建）
  if (!existsSync(join(projectPath, 'package.json'))) {
    ensureFile(
      'package.json',
      `{\n  "name": "openfeel-demo",\n  "version": "0.1.0",\n  "type": "module",\n  "scripts": {\n    "test": "vitest run",\n    "dev": "vitest"\n  },\n  "devDependencies": {\n    "vitest": "^3.0.0"\n  }\n}\n`,
    );
  }

  // vitest.config.ts
  ensureFile(
    'vitest.config.ts',
    `import { defineConfig } from 'vitest/config';\n\nexport default defineConfig({\n  test: {\n    include: ['test/**/*.test.ts'],\n  },\n});\n`,
  );

  // test/index.test.ts — 示例测试
  ensureFile(
    'test/index.test.ts',
    `import { describe, it, expect } from 'vitest';\n\nfunction sum(a: number, b: number): number {\n  return a + b;\n}\n\ndescribe('sum', () => {\n  it('应正确计算两个正数之和', () => {\n    expect(sum(1, 2)).toBe(3);\n  });\n\n  it('应正确计算负数', () => {\n    expect(sum(-1, -2)).toBe(-3);\n  });\n\n  it('应处理零', () => {\n    expect(sum(0, 5)).toBe(5);\n  });\n});\n`,
  );

  // .openfeel/plan/v1/stage-01/status.md — 示例阶段（双语）
  // 示例阶段版本前缀抽为常量（path.ts DEFAULT_STAGE_VERSION），短名规范化与 init 保持一致
  const demoStageId = `${DEFAULT_STAGE_VERSION}-stage-01`; // v1.0.0-stage-01
  const statusMdContent = lang === 'en'
    ? `# ${demoStageId} Status\n\n- **Status**: planned\n- **Current Agent**: openfeel-executor\n- **Previous Agent**: none\n- **Updated**: ${new Date().toISOString().substring(0, 16).replace('T', ' ')}\n\n## Current Task\n\nInitialize project skeleton, create basic file structure.\n\n## Status Log\n\n| Time | Agent | Status Change | Description |\n|------|-------|---------------|-------------|\n| - | - | - | Sample stage |\n`
    : `# ${demoStageId} 状态\n\n- **状态**：planned\n- **当前责任 Agent**：openfeel-executor\n- **上一责任 Agent**：none\n- **更新时间**：${new Date().toISOString().substring(0, 16).replace('T', ' ')}\n\n## 当前任务\n\n初始化项目骨架，创建基础文件结构。\n\n## 状态记录\n\n| 时间 | Agent | 状态变化 | 说明 |\n|------|-------|----------|------|\n| - | - | - | 示例阶段 |\n`;
  ensureFile('.openfeel/plan/v1/stage-01/status.md', statusMdContent);

  // 确保 config.yaml 存在（含 models 节，根据语言）
  const configPath = join(projectPath, '.openfeel', 'config.yaml');
  if (!existsSync(configPath)) {
    writeDefaultConfig(projectPath, lang);
    created.push('.openfeel/config.yaml');
  }

  // 在 flow.json 中注册 v1.0.0-stage-01
  const flowMgr = new FlowManager(projectPath);
  if (flowMgr.isLoaded()) {
    flowMgr.registerStage(demoStageId, []);
    flowMgr.save();
  }

  return { created, skipped };
}
