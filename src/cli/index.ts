/**
 * OpenFeel CLI 程序定义
 * 基于 Commander 构建命令行入口，静态导入并注册所有命令模块。
 * 新增命令只需在 src/commands/ 下创建模块并在本文件末尾追加 import + register 调用。
 */
import { Command } from 'commander';
import { createRequire } from 'node:module';
import { t, getCliLang } from '../core/i18n.js';

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
import { registerStageCommand } from '../commands/stage.js';
import { registerProjectCommand } from '../commands/project.js';
import { registerConfigCommand } from '../commands/config.js';

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

export { program };
export { startRepl } from './repl.js';
