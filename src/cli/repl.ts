/**
 * OpenFeel REPL 交互模式
 * 使用 Node.js readline 模块实现交互式命令行界面，
 * 将用户输入转发给 Commander 解析执行。
 *
 * T40：命令内 process.exit 不得终止 REPL 主循环——执行期间临时拦截 process.exit 为可捕获哨兵；
 * 输出文案迁 i18n（repl.* 键）；help 列表由命令树动态生成（不再硬编码）。
 */
import * as readline from 'node:readline';
import type { Command } from 'commander';
import { t, getCliLang } from '../core/i18n.js';

/** REPL 内拦截 process.exit 抛出的哨兵（表示命令请求退出，但不终止主循环） */
class ReplExitSignal extends Error {
  readonly code: number | string | null | undefined;
  constructor(code: number | string | null | undefined) {
    super('REPL exit signal');
    this.name = 'ReplExitSignal';
    this.code = code;
  }
}

/**
 * 启动交互式 REPL 模式
 * 在 REPL 中禁用 Commander 默认的 process.exit 行为（exitOverride），
 * 并临时拦截 process.exit，确保 REPL 会话不被命令内退出请求意外终止。
 *
 * @param program - Commander Command 实例（已注册所有子命令）
 */
export function startRepl(program: Command): void {
  // 禁用 Commander 默认的 process.exit() 行为，改为抛出 CommanderError，由 REPL 捕获处理
  program.exitOverride();

  const lang = getCliLang(process.cwd());

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: t('repl.prompt', lang),
  });

  console.log(t('repl.welcome', lang));
  rl.prompt();

  rl.on('line', (line: string) => {
    const trimmed = line.trim();

    // 空行直接继续
    if (!trimmed) {
      rl.prompt();
      return;
    }

    // 退出命令
    if (trimmed === 'exit' || trimmed === 'quit') {
      console.log(t('repl.bye', lang));
      rl.close();
      process.exit(0);
    }

    // 帮助命令：由命令树动态生成（避免含不存在命令/缺命令组，T40）
    if (trimmed === 'help' || trimmed === '?') {
      console.log(t('repl.helpTitle', lang));
      for (const sub of program.commands) {
        console.log(`  ${sub.name()}  ${sub.description()}`);
      }
      rl.prompt();
      return;
    }

    // 将输入拆分为 argv 格式传给 Commander parse
    // 注意：不使用 process.argv[0]/[1]（Windows 下 node 路径含空格会导致误解析）
    const args = trimmed.split(/\s+/);
    const originalExit = process.exit;
    try {
      // 临时拦截 process.exit：命令内退出请求转为可捕获哨兵，避免杀死 REPL 主循环（T40）
      process.exit = ((code?: number | string | null) => {
        throw new ReplExitSignal(code);
      }) as typeof process.exit;
      program.parse(['node', 'openfeel', ...args]);
    } catch (err: unknown) {
      if (err instanceof ReplExitSignal) {
        // 命令请求退出（如错误路径 exit 1/2）→ REPL 继续存活
      } else if (err && typeof err === 'object' && 'code' in err) {
        const code = (err as { code?: string }).code;
        // Commander 的 help/version 已完成输出，静默；其余错误打印
        if (code !== 'commander.helpDisplayed' && code !== 'commander.help' && code !== 'commander.version') {
          console.error(t('repl.errorPrefix', lang) + (err instanceof Error ? err.message : String(err)));
        }
      } else if (err instanceof Error) {
        console.error(t('repl.errorPrefix', lang) + err.message);
      }
    } finally {
      process.exit = originalExit;
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}
