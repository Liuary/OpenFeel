/**
 * OpenFeel REPL 交互模式
 * 使用 Node.js readline 模块实现交互式命令行界面，
 * 将用户输入转发给 Commander 解析执行。
 */
import * as readline from 'node:readline';
import type { Command } from 'commander';

/**
 * 启动交互式 REPL 模式
 * 在 REPL 中通过 exitOverride 禁用 Commander 默认的 process.exit 行为，
 * 转而捕获 CommanderError 异常，确保 REPL 会话不被意外终止。
 *
 * @param program - Commander Command 实例（已注册所有子命令）
 */
export function startRepl(program: Command): void {
  // 禁用 Commander 默认的 process.exit() 行为
  // 改为抛出 CommanderError，由 REPL 捕获处理
  program.exitOverride();

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: 'openfeel> ',
  });

  console.log('OpenFeel REPL 交互模式 (输入 exit 退出, help 查看命令)');
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
      console.log('再见！');
      rl.close();
      process.exit(0);
    }

    // 帮助命令
    if (trimmed === 'help') {
      console.log(
        '可用命令：init, flow, plan, scheme, view, archive, roadmap, knowledge, instructions, update, help, exit',
      );
      rl.prompt();
      return;
    }

    // 将输入拆分为 argv 格式传给 Commander parse
    // 注意：不使用 process.argv[0]/[1]（Windows 下 node 路径含空格会导致误解析）
    // 用固定占位符替代，Commander 仅用于 help 文本显示
    try {
      const args = trimmed.split(/\s+/);
      program.parse(['node', 'openfeel', ...args], { from: 'user' });
    } catch (err: unknown) {
      // 捕获 CommanderError（包括 exitOverride 抛出的和 --help 触发的）
      // 忽略它们以保持 REPL 运行
      if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'commander.helpDisplayed'
      ) {
        // --help 输出已完成，仅忽略
      } else if (
        err &&
        typeof err === 'object' &&
        'code' in err &&
        (err as { code: string }).code === 'commander.help'
      ) {
        // help 被触发
      }
      // 其他错误静默忽略，保持 REPL 存活
    }

    rl.prompt();
  });

  rl.on('close', () => {
    process.exit(0);
  });
}
