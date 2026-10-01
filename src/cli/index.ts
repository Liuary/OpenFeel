/**
 * OpenFeel CLI 程序定义
 * 基于 Commander 构建命令行入口，静态导入并注册所有命令模块。
 * 新增命令只需在 src/commands/ 下创建模块并在本文件末尾追加 import + register 调用。
 */
import { Command } from 'commander';
import { createRequire } from 'node:module';
import { t, getCliLang, hasKey } from '../core/i18n.js';
import { isFlowConcurrentError } from '../core/flow-manager.js';
import { handleConcurrentConflict } from '../commands/shared/errors.js';

// 读取 package.json 获取版本号
const require = createRequire(import.meta.url);
const pkg = require('../../package.json') as { version: string };

// 创建主程序
const program = new Command();

program
  .name('openfeel')
  .description('AI Agent 开发流程治理 CLI 工具')
  .version(pkg.version, '-v, --version', '输出版本号')
  // B7-2：全局 --no-color（negate 选项；描述在注册时按当前语言求值，applyHelpI18n 会跳过 negate）
  .option('--no-color', t('help.global.noColor', getCliLang(process.cwd())));

/**
 * 是否启用彩色输出（B7-1，单一判定入口）。
 * 优先级：`--no-color`（显式关闭，commander 解析为 color=false） > `NO_COLOR` 环境变量（存在且**非空**即关闭，
 * 遵循 no-color.org，**不解析其值**） > 默认（允许彩色）。
 *
 * 注：当前实现**无着色逻辑**，故实际输出恒无 ANSI；本函数为**契约与未来保护**——
 * 将来引入着色时必须经此判定（禁止绕过）。
 * @param options commander 解析结果（`color === false` 表示显式 --no-color）
 */
export function shouldUseColor(options?: { color?: boolean }): boolean {
  // 显式 --no-color → 关闭
  if (options?.color === false) {
    return false;
  }
  // NO_COLOR 存在且非空 → 关闭（空串按未设置处理）
  const noColor = process.env.NO_COLOR;
  if (typeof noColor === 'string' && noColor.length > 0) {
    return false;
  }
  // 默认允许彩色（当前无着色实现 → 零可见变化）
  return true;
}

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
import { registerStageCommand } from '../commands/stage.js';
import { registerProjectCommand } from '../commands/project.js';
import { registerConfigCommand } from '../commands/config.js';
import { registerLintCommand } from '../commands/lint.js';
import { registerMigrateCommand } from '../commands/migrate.js';
import { registerModelCommand } from '../commands/model.js';
import { registerSetupCommand } from '../commands/setup.js';

registerInitCommand(program);
registerFlowCommand(program);
registerPlanCommand(program);
registerViewCommand(program);
registerArchiveCommand(program);
registerRoadmapCommand(program);
registerInstructionsCommand(program);
registerUpdateCommand(program);
registerKnowledgeCommand(program);
registerStageCommand(program);
registerProjectCommand(program);
registerConfigCommand(program);
registerLintCommand(program);
registerMigrateCommand(program);
registerModelCommand(program);
registerSetupCommand(program);

// ── --help 国际化注入 ──
// 在所有命令注册完成后，遍历 Commander 命令树，
// 将 .description() 和 .option() 的硬编码文本替换为当前语言对应的翻译。
export function applyHelpI18n(program: Command): void {
  const lang = getCliLang(process.cwd());

  /**
   * 将 kebab-case 或 --prefixed 字符串转为 camelCase。
   * 例: '--auto-fix' → 'autoFix', 'no-backup' → 'noBackup'
   */
  function toCamelCase(flag: string): string {
    return flag
      .replace(/^--?/, '')
      .replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());
  }

  /**
   * 递归遍历 Commander 命令树，替换描述文本。
   */
  function walkCmd(cmd: Command, path: string[]): void {
    const keyPrefix = 'help.' + path.join('.');

    // 替换当前命令的 description（仅当已有描述文本时才查找替换）
    if (cmd.description()) {
      const descKey = keyPrefix;
      const descTranslated = t(descKey, lang);
      if (descTranslated !== descKey) {
        cmd.description(descTranslated);
      }
    }

    // 替换当前命令的 arguments 描述（键约定 help.<commandPath>.arg<name>，T38）
    // 仅命中既有键时替换，避免对未补键的 argument 触发缺失告警
    for (const arg of cmd.registeredArguments ?? []) {
      const argKey = `${keyPrefix}.arg${arg.name()}`;
      if (hasKey(argKey, lang)) {
        arg.description = t(argKey, lang);
      }
    }

    // 替换当前命令的 option 描述
    for (const opt of cmd.options) {
      // 跳过 Commander 自动生成的 --no- 选项（negate 标记为 true）
      if ((opt as { negate?: boolean }).negate) continue;
      // 跳过无长/短选项的内部 option
      const flag = opt.long || opt.short;
      if (!flag) continue;
      const optName = toCamelCase(flag);
      const optKey = `${keyPrefix}.${optName}`;
      const optTranslated = t(optKey, lang);
      if (optTranslated !== optKey) {
        opt.description = optTranslated;
      }
    }

    // 递归处理子命令
    for (const sub of cmd.commands) {
      walkCmd(sub, [...path, sub.name()]);
    }
  }

  // 处理根程序（openfeel）的描述和选项
  const rootKey = 'help.' + program.name();
  const rootTranslated = t(rootKey, lang);
  if (rootTranslated !== rootKey) {
    program.description(rootTranslated);
  }
  for (const opt of program.options) {
    if ((opt as { negate?: boolean }).negate) continue;
    const flag = opt.long || opt.short;
    if (!flag) continue;
    const optName = toCamelCase(flag);
    const optKey = `help.${program.name()}.${optName}`;
    const optTranslated = t(optKey, lang);
    if (optTranslated !== optKey) {
      opt.description = optTranslated;
    }
  }
  // 子命令路径从命令名开始（不含 root），与 help 域 key 命名对齐
  for (const sub of program.commands) {
    walkCmd(sub, [sub.name()]);
  }
}

/** 并发写冲突退出码：与通用错误 1 区分，便于自动化识别「可重试」冲突 */
export const EXIT_CONCURRENT = 2;

/** 统一 CLI 错误处理：识别 flow.json 并发写冲突并输出可重试提示（单点，T38） */
export function handleCliError(err: unknown): never {
  if (isFlowConcurrentError(err)) {
    handleConcurrentConflict(err, getCliLang(process.cwd()));
  }
  throw err;
}

/** CLI 启动入口：包裹 program.parse，统一处理并发写冲突 */
export function runCli(): void {
  try {
    program.parse();
  } catch (err) {
    handleCliError(err);
  }
}

export { program };
export { startRepl } from './repl.js';
