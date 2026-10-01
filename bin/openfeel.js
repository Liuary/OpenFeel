#!/usr/bin/env node
// OpenFeel CLI 入口 — 加载并启动 Commander 程序
// 无参数时进入 REPL 交互模式，有参数时正常 CLI 模式
import { program, applyHelpI18n, startRepl, runCli } from '../dist/cli/index.js';
import { installOutputEncoding } from '../dist/cli/output-encoding.js';
import { installRuntimeLog } from '../dist/core/runtime-log.js';

const args = process.argv.slice(2);
// 进程入口安装：输出编码 + 运行日志（单一咽喉；库/测试侧未调用即 no-op）
installOutputEncoding();
installRuntimeLog();
// 在 parse 前注入翻译，此时命令树已就绪
applyHelpI18n(program);
if (args.length === 0) {
  startRepl(program);
} else {
  runCli();
}
