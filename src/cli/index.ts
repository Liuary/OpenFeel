/**
 * OpenFeel CLI 程序定义
 * 基于 Commander 构建命令行入口，静态导入并注册所有命令模块。
 * 新增命令只需在 src/commands/ 下创建模块并在本文件末尾追加 import + register 调用。
 */
import { Command } from 'commander';
import { createRequire } from 'node:module';

// 读取 package.json 获取版本号
const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

// 创建主程序
const program = new Command();

program
  .name('openfeel')
  .description('AI Agent 开发流程治理 CLI 工具')
  .version(pkg.version, '-v, --version', '输出版本号');

// ── 静态导入命令模块（新增命令在此追加） ──

import { registerInitCommand } from '../commands/init.js';
import { registerFlowCommand } from '../commands/flow.js';
import { registerPlanCommand } from '../commands/plan.js';
import { registerViewCommand } from '../commands/view.js';
import { registerArchiveCommand } from '../commands/archive.js';
import { registerRoadmapCommand } from '../commands/roadmap.js';
import { registerInstructionsCommand } from '../commands/instructions.js';
import { registerUpdateCommand } from '../commands/update.js';
import { registerKnowledgeCommand } from '../commands/knowledge.js';

registerInitCommand(program);
registerFlowCommand(program);
registerPlanCommand(program);
registerViewCommand(program);
registerArchiveCommand(program);
registerRoadmapCommand(program);
registerInstructionsCommand(program);
registerUpdateCommand(program);
registerKnowledgeCommand(program);

export { program };
export { startRepl } from './repl.js';
