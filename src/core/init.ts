/**
 * 项目初始化编排
 * 协调创建工作区、写入配置、初始化 flow.json、确保身份文件、
 * 生成 dev_core.md/current.md 模板。
 *
 * 注意：`.opencode/instructions/core.md` 由 update 命令创建（适配器层，
 * 非核心层），不在 init 阶段生成。
 *
 * 变更摘要：
 * - stage-04: 新增 initDemo() 支持 --demo 标志
 * - stage-04 第二轮：移除了 .opencode/instructions/core.md 创建（移至 update.ts）
 */
import { writeFileSync, readFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname, join, basename } from 'node:path';
import { createWorkspace } from './workspace/structure.js';
import { ensureInfoJson, isFirstUse, getGlobalConfig, setGlobalConfig, DEFAULT_GLOBAL_CONFIG } from './workspace/identity.js';
import { writeDefaultConfig } from './config.js';
import { FlowManager } from './flow-manager.js';
import { getDevCoreTemplate, getCurrentTemplate } from './templates.js';
import { loadTemplate, loadOpencodeAgentTemplate, loadOpencodeSkillTemplate, loadOpencodeConfigTemplate, listOpencodeAgentIds, listOpencodeSkillNames } from './template-loader.js';
import { t, getCliLang } from './i18n.js';
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
 * 提示用户是否部署 OpenCode 平台适配器
 * 交互模式：提问 Y/n（默认 Y），非交互模式：静默返回 false
 */
async function promptOpencodeDeploy(lang: 'zh-CN' | 'en'): Promise<boolean> {
  if (!process.stdout.isTTY) {
    return false; // 非交互模式，跳过
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({
      input: process.stdin,
      output: process.stdout,
    });
    const prompt = lang === 'en'
      ? 'Deploy OpenCode platform adapter? [Y/n] '
      : '是否部署 OpenCode 平台适配器？[Y/n] ';
    rl.question(prompt, (answer) => {
      rl.close();
      const trimmed = answer.trim().toLowerCase();
      // 默认 Y（仅显式 n/no 时拒绝）
      resolve(trimmed !== 'n' && trimmed !== 'no');
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
    writeFileSync(infoPath, JSON.stringify(info, null, 2) + '\n', 'utf-8');
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
  opencode?: OpencodeDeployResult; // 如部署了 opencode 则有此字段
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
  writeFileSync(filePath, content, 'utf-8');
  return { created: true };
}

/** opencode 部署结果 */
export interface OpencodeDeployResult {
  created: number;
  skipped: number;
}

/**
 * 部署 OpenCode 平台适配器到目标项目
 * 所有写入遵循"已存在不覆盖"原则
 * ⚠️ 不部署 package.json（REV-001）
 * 导出供测试直接调用（不依赖交互流程）
 */
export function deployOpencode(projectPath: string, lang: 'zh-CN' | 'en'): OpencodeDeployResult {
  let created = 0;
  let skipped = 0;

  const track = (result: { created: boolean }) => {
    if (result.created) created++; else skipped++;
  };

  // 1. 部署 Agent 定义（9 个）
  const agentIds = listOpencodeAgentIds(lang);
  for (const agentId of agentIds) {
    const content = loadOpencodeAgentTemplate(lang, agentId);
    const filePath = resolve(projectPath, '.opencode', 'agents', `${agentId}.md`);
    track(writeTemplateIfMissing(filePath, content));
  }

  // 2. 部署 Skill 定义（14 个）
  const skillNames = listOpencodeSkillNames();
  for (const skillName of skillNames) {
    const content = loadOpencodeSkillTemplate(skillName);
    const skillDir = resolve(projectPath, '.opencode', 'skills', skillName);
    const filePath = join(skillDir, 'SKILL.md');
    track(writeTemplateIfMissing(filePath, content));
  }

  // 3. 部署 instructions/core.md
  track(writeTemplateIfMissing(
    resolve(projectPath, '.opencode', 'instructions', 'core.md'),
    loadOpencodeConfigTemplate(lang, 'instructions'),
  ));

  // 4. 部署 opencode.jsonc（替换 {项目名称}）
  const configContent = loadOpencodeConfigTemplate(lang, 'opencode_jsonc')
    .replace(/\{项目名称\}/g, basename(projectPath));
  track(writeTemplateIfMissing(
    resolve(projectPath, 'opencode.jsonc'),
    configContent,
  ));

  // 5. 部署 ADAPTER.{lang}.md（文件名保留语言后缀）
  const adapterSuffix = lang === 'en' ? 'en' : 'zh-CN';
  track(writeTemplateIfMissing(
    resolve(projectPath, '.opencode', `ADAPTER.${adapterSuffix}.md`),
    loadOpencodeConfigTemplate(lang, 'adapter'),
  ));

  // 6. 部署 .gitignore
  track(writeTemplateIfMissing(
    resolve(projectPath, '.opencode', '.gitignore'),
    loadOpencodeConfigTemplate(lang, 'gitignore'),
  ));

  // ⚠️ 不部署 package.json（REV-001）

  return { created, skipped };
}

/**
 * 初始化项目工作区
 * 步骤：创建目录 → 写入 config.yaml → 初始化 flow.json → 创建 .info.json
 *       → 语言选择 → 生成 dev_core.md → 生成 current.md → 生成 AGENTS.md
 */
export async function initProject(projectPath: string, cliLang?: string): Promise<InitResult> {
  const created: string[] = [];
  const updated: string[] = [];

  // 0. 确保全局配置存在（首次使用时交互选择语言）
  await ensureGlobalConfig();

  // 1. 创建 .openfeel/ 目录结构（含 plan/, stages/, roadmap/, dev/note/, 等）
  const dirs = createWorkspace(projectPath);
  created.push(...dirs);

  // 1a. 语言选择：CLI --lang 参数 > 交互式选择 > 全局默认语言
  //     提前选择，以便后续写入的模板文件使用正确语言
  const globalLang = getGlobalConfig().lang;
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

  // 1b. OpenCode 部署确认
  const deployOpencodeFlag = await promptOpencodeDeploy(selectedLang);

  // 2. 写入默认配置（根据所选语言）
  const configPath = resolve(projectPath, '.openfeel', 'config.yaml');
  const configExisted = existsSync(configPath);
  writeDefaultConfig(projectPath, selectedLang);
  if (configExisted) {
    updated.push('.openfeel/config.yaml');
  } else {
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
  writeLang(projectPath, selectedLang);

  // 5. 生成 .openfeel/dev/dev_core.md 模板（双语）
  const devCorePath = resolve(projectPath, '.openfeel', 'dev', 'dev_core.md');
  const devCoreResult = writeTemplateIfMissing(devCorePath, getDevCoreTemplate(selectedLang));
  if (devCoreResult.created) {
    created.push('.openfeel/dev/dev_core.md');
  }

  // 6. 生成 .openfeel/dev/current.md 模板（双语）
  const currentPath = resolve(projectPath, '.openfeel', 'dev', 'current.md');
  const currentResult = writeTemplateIfMissing(currentPath, getCurrentTemplate(selectedLang));
  if (currentResult.created) {
    created.push('.openfeel/dev/current.md');
  }

  // 7. 生成 .openfeel/kb/index.md 模板（双语）
  const kbIndexPath = resolve(projectPath, '.openfeel', 'kb', 'index.md');
  const kbContent = selectedLang === 'en'
    ? '# Knowledge Base Index\n\n> No entries yet.\n'
    : '# 知识库索引\n\n> 暂无条目。\n';
  const kbResult = writeTemplateIfMissing(kbIndexPath, kbContent);
  if (kbResult.created) {
    created.push('.openfeel/kb/index.md');
  }

  // 7b. 部署 opencode 适配器（如用户确认）
  let opencodeResult: OpencodeDeployResult | undefined;
  if (deployOpencodeFlag) {
    opencodeResult = deployOpencode(projectPath, selectedLang);
  }

  // 8. 生成 AGENTS.md 骨架文件（项目根目录），根据语言选择加载模板
  const agentsMdPath = resolve(projectPath, 'AGENTS.md');
  const agentsMdContent = loadTemplate(selectedLang, 'agents-md');
  const projectName = basename(projectPath);
  const replacedContent = agentsMdContent.replace(/\{项目名称\}/g, projectName);
  const agentsMdResult = writeTemplateIfMissing(agentsMdPath, replacedContent);
  if (agentsMdResult.created) {
    created.push('AGENTS.md');
  }

  // 9. 检测 package.json，若存在 vitest 则添加 @vitest/coverage-v8
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
        writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n', 'utf-8');
        updated.push('package.json');
      }
    }
  }

  // 10. 重启提醒（仅在 opencode 首次部署时，且为交互模式）
  if (opencodeResult && opencodeResult.created > 0 && process.stdout.isTTY) {
    console.log(
      selectedLang === 'en'
        ? 'opencode configuration deployed. Please restart opencode to load the new configuration.'
        : 'opencode 配置已部署，请重启 opencode 以加载新配置。'
    );
  }

  return { created, updated, opencode: opencodeResult };
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
    writeFileSync(fullPath, content, 'utf-8');
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

  // .openfeel/plan/stage-01/status.md — 示例阶段（双语）
  const statusMdContent = lang === 'en'
    ? `# stage-01 Status\n\n- **Status**: planned\n- **Current Agent**: executor\n- **Previous Agent**: none\n- **Updated**: ${new Date().toISOString().substring(0, 16).replace('T', ' ')}\n\n## Current Task\n\nInitialize project skeleton, create basic file structure.\n\n## Status Log\n\n| Time | Agent | Status Change | Description |\n|------|-------|---------------|-------------|\n| - | - | - | Sample stage |\n`
    : `# stage-01 状态\n\n- **状态**：planned\n- **当前责任 Agent**：executor\n- **上一责任 Agent**：none\n- **更新时间**：${new Date().toISOString().substring(0, 16).replace('T', ' ')}\n\n## 当前任务\n\n初始化项目骨架，创建基础文件结构。\n\n## 状态记录\n\n| 时间 | Agent | 状态变化 | 说明 |\n|------|-------|----------|------|\n| - | - | - | 示例阶段 |\n`;
  ensureFile('.openfeel/plan/stage-01/status.md', statusMdContent);

  // 确保 config.yaml 存在（含 models 节，根据语言）
  const configPath = join(projectPath, '.openfeel', 'config.yaml');
  if (!existsSync(configPath)) {
    writeDefaultConfig(projectPath, lang);
    created.push('.openfeel/config.yaml');
  }

  // 在 flow.json 中注册 stage-01
  const flowMgr = new FlowManager(projectPath);
  if (flowMgr.isLoaded()) {
    flowMgr.registerStage('stage-01', []);
    flowMgr.save();
  }

  return { created, skipped };
}
