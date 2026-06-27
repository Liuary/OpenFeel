/**
 * 项目初始化编排
 * 协调创建工作区、写入配置、初始化 flow.json、确保身份文件、
 * 生成 dev_core.md/current.md/instructions/core.md 模板。
 */
import { writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { createWorkspace } from './workspace/structure.js';
import { ensureInfoJson } from './workspace/identity.js';
import { writeDefaultConfig } from './config.js';
import { FlowManager } from './flow-manager.js';
import {
  DEV_CORE_TEMPLATE,
  CURRENT_TEMPLATE,
  CORE_INSTRUCTIONS_TEMPLATE_B64,
} from './templates.js';

/** 初始化结果 */
export interface InitResult {
  created: string[]; // 创建的目录列表
  updated: string[]; // 更新的文件列表
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

  // 7. 生成 .opencode/instructions/core.md 模板
  const coreInstructionsPath = resolve(
    projectPath,
    '.opencode',
    'instructions',
    'core.md',
  );
  // base64 解码模板内容
  const coreContent = Buffer.from(CORE_INSTRUCTIONS_TEMPLATE_B64, 'base64').toString(
    'utf-8',
  );
  const coreResult = writeTemplateIfMissing(coreInstructionsPath, coreContent);
  if (coreResult.created) {
    created.push('.opencode/instructions/core.md');
  }

  return { created, updated };
}
