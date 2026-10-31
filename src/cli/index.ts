/**
 * OpenFeel CLI 程序定义
 * 基于 Commander 构建命令行入口，静态导入并注册所有命令模块。
 * 新增命令只需在 src/commands/ 下创建模块并在本文件末尾追加 import + register 调用。
 */
import { Command, CommanderError } from 'commander';
import { createRequire } from 'node:module';
import { t, getCliLang, hasKey } from '../core/i18n.js';
import { isFlowConcurrentError } from '../core/flow-manager.js';
import { emitErrorEnvelope, handleConcurrentConflict } from '../commands/shared/errors.js';
import {
  isJsonMode,
  resolveJsonMode,
  setJsonMode,
  resolveVersionFlag,
  withSchemaVersion,
  emitJson,
} from '../commands/shared/json-output.js';
import { runtimeLog, logCliStart, logCliDone } from '../core/runtime-log.js';
import { emitGlobalDeployCheck } from './deploy-check-output.js';
import { applyProjectOption } from './project-option.js';

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
  .option('--no-color', t('help.global.noColor', getCliLang(process.cwd())))
  // stage-58 A-5：全局 --encoding（默认 auto；仅用于 --help 展示 + 防 commander 未知选项报错；实际解析从 argv/env 读取）
  .option('--encoding <encoding>', t('help.global.encoding', getCliLang(process.cwd())), 'auto')
  // stage-58 B-4：运行日志全局选项
  .option('--log-file <path>', t('help.global.logFile', getCliLang(process.cwd())))
  .option('--no-log', t('help.global.noLog', getCliLang(process.cwd())))
  .option('--debug', t('help.global.debug', getCliLang(process.cwd())))
  // stage-95 op-003：全局 --project（预扫描 + 单点 chdir；help 文案语言在模块加载期按原始 cwd 求值）
  .option('--project <path>', t('help.global.project', getCliLang(process.cwd())));

// ── stage-95 op-002：Commander 机制（须在子命令注册前安装，子命令创建时继承） ──
// 用法错误（未知命令/未知选项/缺参）的 JSON 模式封装：
//  - exitCode===0（--help / --version）放行，走 Commander 原生 process.exit(0)；
//  - JSON 模式 throw CommanderError → runCli catch 转 INVALID_ARGUMENT envelope + exit 1；
//  - 非 JSON 模式 process.exit(err.exitCode)，与现状逐字等价。
program.exitOverride((err) => {
  if (err.code === 'commander.executeSubCommandAsync') return;
  if (err.exitCode === 0) return;
  if (isJsonMode()) throw err;
  process.exit(err.exitCode);
});
// JSON 模式下静默 Commander 人类错误文本（防止混入 stdout/stderr）；非 JSON 逐字不变
program.configureOutput({
  writeErr: (str) => {
    if (!isJsonMode()) {
      process.stderr.write(str);
    }
  },
});

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
import { registerReqCommand } from '../commands/req.js';
import { registerChoreCommand } from '../commands/chore.js';
import { registerDevCommand } from '../commands/dev.js';

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
registerReqCommand(program);
registerChoreCommand(program);
registerDevCommand(program);

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
      // 仅命中既有键时替换，避免对未补键的选项触发缺失告警（与 argument 同策略）
      if (hasKey(optKey, lang)) {
        opt.description = t(optKey, lang);
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
    // 仅命中既有键时替换，避免对未补键的选项（如 help.openfeel.encoding）触发每命令缺失告警
    if (hasKey(optKey, lang)) {
      opt.description = t(optKey, lang);
    }
  }
  // 子命令路径从命令名开始（不含 root），与 help 域 key 命名对齐
  for (const sub of program.commands) {
    walkCmd(sub, [sub.name()]);
  }
}

/** 并发写冲突退出码：与通用错误 1 区分，便于自动化识别「可重试」冲突 */
export const EXIT_CONCURRENT = 2;

/**
 * 统一 CLI 错误处理（单点，T38；stage-95 op-002 扩展 JSON 模式）。
 * 分类优先级：并发冲突（exit 2）→ Commander 用法错误（JSON：INVALID_ARGUMENT/1）→ 其他（JSON：INTERNAL_ERROR/3）。
 * 非 JSON 模式：并发冲突与用法错误保持既有形态；其他异常输出堆栈并置 exit 3（本版新增内部错误码）。
 * @param err 捕获到的异常
 */
export function handleCliError(err: unknown): void {
  // stage-58 B-6：记录「命令处理中抛出的异常」。error 级语义边界（REV-002）：
  // commander 解析期错误（未知命令/未知选项/缺参）经 program.error() 直接 process.exit(1)，不抛异常、不达此处 → 不入日志。
  // stage-95 op-002：JSON 模式下解析期错误经 exitOverride throw 后到达此处（记日志，形态无回归）。
  runtimeLog('error', 'cli error: ' + (err instanceof Error ? err.message : String(err)));
  if (isFlowConcurrentError(err)) {
    handleConcurrentConflict(err, getCliLang(process.cwd()));
    return;
  }
  const lang = getCliLang(process.cwd());
  if (err instanceof CommanderError) {
    // JSON 模式：用法错误 → INVALID_ARGUMENT envelope + exit 1
    if (isJsonMode()) {
      emitErrorEnvelope({
        code: 'INVALID_ARGUMENT',
        message: t('common.invalidArgumentTmpl', lang, { detail: err.message }),
        detail: { commanderCode: err.code },
      });
      process.exitCode = 1;
      return;
    }
    // 非 JSON：保持既有未捕获形态（正常路径到不了此处，exitOverride 已 process.exit）
    throw err;
  }
  if (isJsonMode()) {
    // JSON 模式：其他未捕获异常 → INTERNAL_ERROR envelope + exit 3
    const msg = err instanceof Error ? err.message : String(err);
    emitErrorEnvelope({
      code: 'INTERNAL_ERROR',
      message: t('common.errorTmpl', lang, { msg }),
      detail: err instanceof Error
        ? { name: err.name, message: err.message, stack: err.stack }
        : { name: 'Error', message: String(err) },
    });
    process.exitCode = 3;
    return;
  }
  // 非 JSON：保持既有含堆栈形态，退出码归本版新增的 3（内部错误）
  console.error(err instanceof Error ? (err.stack ?? err.message) : String(err));
  process.exitCode = 3;
}

/**
 * CLI 启动入口：JSON 模式单点预扫描 + `--project` 项目锚定 + 统一 catch（并发 / 用法错误 / 内部错误）。
 *
 * 顺序契约（stage-95 op-003，严格）：
 * 1. `setJsonMode` —— 错误输出模式须在 `--project` 失败前已知；
 * 2. `--version --json` 短路 —— 纯信息命令，不进入 Commander、不依赖项目（非法 `--project` 不阻断）；
 *    `--help --json` 不拦截（帮助文本保持）；
 * 3. `applyProjectOption` —— 预扫描 + 单点 chdir，必须早于 `logCliStart`（日志 project 字段 = 目标项目）；
 * 4. `logCliStart` → `emitGlobalDeployCheck` → `program.parse` → `logCliDone`。
 */
export function runCli(): void {
  // stage-95 op-002：JSON 模式单点（命令层只读 isJsonMode()，不得各自解析 argv）
  const argv = process.argv.slice(2);
  setJsonMode(resolveJsonMode(argv));

  // stage-95 op-003：--version/-v + --json → 单文档并返回（不进入 Commander；纯信息命令）
  if (resolveVersionFlag(argv) && isJsonMode()) {
    logCliStart(argv);
    emitJson(withSchemaVersion({ version: pkg.version, node: process.version }));
    logCliDone(0);
    return;
  }

  // stage-95 op-003：--project 预扫描必须在 logCliStart 之前（日志 project 字段 = 目标项目）
  if (!applyProjectOption(argv)) {
    // JSON 模式 failCli 仅置 process.exitCode 不退出 → 此处 return 保 logCliDone 记录真实码
    logCliDone(typeof process.exitCode === 'number' ? process.exitCode : 1);
    return;
  }

  // stage-58 B-6：命令（argv）+ 结果入运行日志；不记录 stdout 内容。
  // 注：--help/--version 经 commander 输出后 exit → 由 exit 兜底记「cli done」（v1.2.1-stage-86 有意变更）；
  // 错误路径经 handleCliError 置退出码后落到 logCliDone，记录真实退出码。
  logCliStart(argv);
  // stage-67：被动部署提示（门控内置于适配器；异常静默，不影响主命令）
  emitGlobalDeployCheck();
  try {
    program.parse();
  } catch (err) {
    handleCliError(err);
  }
  logCliDone(typeof process.exitCode === 'number' ? process.exitCode : 0);
}

export { program };
export { startRepl } from './repl.js';
