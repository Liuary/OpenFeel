/**
 * 项目初始化编排
 * 协调创建工作区、写入配置、初始化 flow.json、确保身份文件、更新 .gitignore。
 */
import { readFileSync, writeFileSync, existsSync, appendFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createWorkspace } from './workspace/structure.js';
import { ensureInfoJson } from './workspace/identity.js';
import { writeDefaultConfig } from './config.js';
import { FlowManager } from './flow-manager.js';

/** 初始化结果 */
export interface InitResult {
  created: string[]; // 创建的目录列表
  updated: string[]; // 更新的文件列表
}

/**
 * 检查 .gitignore 是否包含指定模式
 */
function gitignoreContains(gitignorePath: string, pattern: string): boolean {
  if (!existsSync(gitignorePath)) {
    return false;
  }
  const content = readFileSync(gitignorePath, 'utf-8');
  const lines = content.split(/\r?\n/);
  return lines.some((line) => line.trim() === pattern);
}

/**
 * 初始化项目工作区
 * 步骤：创建目录 → 写入 config.yaml → 初始化 flow.json → 创建 .info.json → 更新 .gitignore
 */
export function initProject(projectPath: string): InitResult {
  const created: string[] = [];
  const updated: string[] = [];

  // 1. 创建 .openfeel/ 目录结构
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

  // 5. 检查并更新 .gitignore
  const gitignorePath = resolve(projectPath, '.gitignore');
  const gitignoreExisted = existsSync(gitignorePath);
  const ignorePattern = '.openfeel/';
  if (!gitignoreContains(gitignorePath, ignorePattern)) {
    if (!gitignoreExisted) {
      writeFileSync(gitignorePath, `${ignorePattern}\n`, 'utf-8');
      created.push('.gitignore');
    } else {
      appendFileSync(gitignorePath, `\n${ignorePattern}\n`, 'utf-8');
      updated.push('.gitignore');
    }
  }

  return { created, updated };
}
