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
import { resolve, dirname, join } from 'node:path';
import { createWorkspace } from './workspace/structure.js';
import { ensureInfoJson } from './workspace/identity.js';
import { writeDefaultConfig } from './config.js';
import { FlowManager } from './flow-manager.js';
import {
  DEV_CORE_TEMPLATE,
  CURRENT_TEMPLATE,
} from './templates.js';

/** 初始化结果 */
export interface InitResult {
  created: string[]; // 创建的目录列表
  updated: string[]; // 更新的文件列表
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

/**
 * 初始化项目工作区
 * 步骤：创建目录 → 写入 config.yaml → 初始化 flow.json → 创建 .info.json
 *       → 生成 dev_core.md → 生成 current.md → 生成 instructions/core.md
 */
export function initProject(projectPath: string): InitResult {
  const created: string[] = [];
  const updated: string[] = [];

  // 1. 创建 .openfeel/ 目录结构（含 plan/, stages/, roadmap/, dev/note/, 等）
  const dirs = createWorkspace(projectPath);
  created.push(...dirs);

  // 2. 写入默认配置
  const configPath = resolve(projectPath, '.openfeel', 'config.yaml');
  const configExisted = existsSync(configPath);
  writeDefaultConfig(projectPath);
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

  // 5. 生成 .openfeel/dev/dev_core.md 模板
  const devCorePath = resolve(projectPath, '.openfeel', 'dev', 'dev_core.md');
  const devCoreResult = writeTemplateIfMissing(devCorePath, DEV_CORE_TEMPLATE);
  if (devCoreResult.created) {
    created.push('.openfeel/dev/dev_core.md');
  }

  // 6. 生成 .openfeel/dev/current.md 模板
  const currentPath = resolve(projectPath, '.openfeel', 'dev', 'current.md');
  const currentResult = writeTemplateIfMissing(currentPath, CURRENT_TEMPLATE);
  if (currentResult.created) {
    created.push('.openfeel/dev/current.md');
  }

  // 7. 生成 .openfeel/kb/index.md 模板
  const kbIndexPath = resolve(projectPath, '.openfeel', 'kb', 'index.md');
  const kbResult = writeTemplateIfMissing(kbIndexPath, '# 知识库索引\n\n> 暂无条目。\n');
  if (kbResult.created) {
    created.push('.openfeel/kb/index.md');
  }

  // 8. 检测 package.json，若存在 vitest 则添加 @vitest/coverage-v8
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

  return { created, updated };
}

/**
 * 创建示例项目骨架（--demo 标志触发）
 * 在项目目录下创建简化的 TypeScript 项目结构和示例 stage。
 */
export function initDemo(projectPath: string): DemoResult {
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
    `/**\n * OpenFeel 示例项目入口\n */\nexport function greet(name: string): string {\n  return \`你好，\${name}！欢迎使用 OpenFeel。\`;\n}\n`,
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
    `import { describe, it, expect } from 'vitest';\n\n// TODO: 替换为项目实际的模块路径\nconst greet = (name: string): string => \`你好，\${name}！欢迎使用 OpenFeel。\`;\n\ndescribe('greet', () => {\n  it('应返回正确的问候语', () => {\n    expect(greet('世界')).toBe('你好，世界！欢迎使用 OpenFeel。');\n  });\n\n  it('应处理空字符串', () => {\n    expect(greet('')).toBe('你好，！欢迎使用 OpenFeel。');\n  });\n});\n`,
  );

  // .openfeel/plan/stage-01/status.md — 示例阶段
  ensureFile(
    '.openfeel/plan/stage-01/status.md',
    `# stage-01 状态\n\n- **状态**：planned\n- **当前责任 Agent**：executor\n- **上一责任 Agent**：none\n- **更新时间**：${new Date().toISOString().substring(0, 16).replace('T', ' ')}\n\n## 当前任务\n\n初始化项目骨架，创建基础文件结构。\n\n## 状态记录\n\n| 时间 | Agent | 状态变化 | 说明 |\n|------|-------|----------|------|\n| - | - | - | 示例阶段 |\n`,
  );

  // 确保 config.yaml 存在（含 models 节）
  const configPath = join(projectPath, '.openfeel', 'config.yaml');
  if (!existsSync(configPath)) {
    writeDefaultConfig(projectPath);
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
