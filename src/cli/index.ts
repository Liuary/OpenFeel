/**
 * OpenFeel CLI 程序定义
 * 基于 Commander 构建命令行入口
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

// 注册默认 --help（Commander 自动处理）

export { program };
