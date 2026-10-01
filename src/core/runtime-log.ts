/**
 * CLI 运行日志模块（stage-58 op-002）
 *
 * 职责：把 CLI 进程的命令/结果/错误写入 ~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log（恒 UTF-8），
 * 供跨项目诊断。与三类既有日志语义严格分离：
 *   - ~/.openfeel/cli/logs/*.log = CLI 进程运行日志（本模块，跨项目诊断）
 *   - .openfeel/log/**          = 项目工作区审计日志（public-logger，团队级事件）
 *   - flow.json.log[]           = 流水线状态审计（阶段推进/注册）
 *   - update_infos.md           = 部署更新记录
 *
 * 设计边界：
 * - **库侧默认 disabled**：模块内部 config=null，未调用 installRuntimeLog 时 runtimeLog 全 no-op
 *   （in-process 测试零写盘）。
 * - **不设 VITEST/env 守卫**（REV-001/004 裁定方案 b）：与 output-encoding 隔离策略统一；安装仅由 bin 调用。
 * - **恒 UTF-8**：appendFileSync(..., {encoding:'utf-8'})，与 console 编码完全解耦。
 * - **best-effort**：任何写失败（磁盘/权限/锁超时）均吞掉，绝不中断 CLI。
 * - **按日一文件、不自动清理**；**不记录 stdout 内容**（仅 argv + 状态 + 错误消息）。
 */
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join, resolve as resolvePath } from 'node:path';
import { getCliLogsDir } from './global-paths.js';
import { globalLockPath, withFileLock } from './fs/file-lock.js';

/** 运行日志级别（debug 默认关） */
export type RuntimeLogLevel = 'debug' | 'info' | 'warn' | 'error';

/** 运行日志配置 */
export interface RuntimeLogConfig {
  enabled: boolean;
  minLevel: RuntimeLogLevel;
  filePath: string;
}

/** installRuntimeLog 选项（注入以便单测） */
export interface InstallRuntimeLogOptions {
  env?: NodeJS.ProcessEnv;
  argv?: string[];
}

/** 级别权重（级别过滤） */
const LEVEL_ORDER: Record<RuntimeLogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** 模块级配置；null = 未安装 → 全 no-op */
let config: RuntimeLogConfig | null = null;

/** 两位补零 */
function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

/** 本地日期 YYYY-MM-DD */
function formatDate(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/** 当日运行日志文件路径：~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log */
export function getRuntimeLogPath(date: Date = new Date()): string {
  return join(getCliLogsDir(), `openfeel-${formatDate(date)}.log`);
}

/** 从 argv 读取 --log-file（支持 `--log-file x` 与 `--log-file=x`） */
function readLogFileArg(argv: string[]): string | undefined {
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--log-file') {
      return argv[i + 1];
    }
    if (arg.startsWith('--log-file=')) {
      return arg.slice('--log-file='.length);
    }
  }
  return undefined;
}

/** 解析运行日志配置（纯函数） */
export function resolveRuntimeLogConfig(env: NodeJS.ProcessEnv, argv: string[]): RuntimeLogConfig {
  // 开关：默认 on；--no-log / OPENFEEL_LOG=0 / OPENFEEL_NO_LOG=1 关闭
  const disabled = argv.includes('--no-log') || env.OPENFEEL_LOG === '0' || env.OPENFEEL_NO_LOG === '1';
  // 级别：默认 info；--debug / OPENFEEL_DEBUG=1 开 debug
  const debug = argv.includes('--debug') || env.OPENFEEL_DEBUG === '1';
  // 路径覆盖：--log-file > OPENFEEL_LOG_FILE > 默认按日文件
  const override = readLogFileArg(argv) ?? ((env.OPENFEEL_LOG_FILE ?? '').length > 0 ? env.OPENFEEL_LOG_FILE : undefined);
  return {
    enabled: !disabled,
    minLevel: debug ? 'debug' : 'info',
    filePath: override ? resolvePath(override) : getRuntimeLogPath(),
  };
}

/**
 * 安装/刷新运行日志配置（幂等：以最新 env/argv 重算）。仅由 bin/openfeel.js 调用。
 * 未调用时模块内部 config=null → runtimeLog 全 no-op。
 */
export function installRuntimeLog(opts: InstallRuntimeLogOptions = {}): void {
  config = resolveRuntimeLogConfig(opts.env ?? process.env, opts.argv ?? process.argv.slice(2));
}

/** 写入一条运行日志（best-effort；未安装/关闭/级别不足/任何异常均静默跳过） */
export function runtimeLog(level: RuntimeLogLevel, message: string): void {
  if (!config || !config.enabled) {
    return;
  }
  if (LEVEL_ORDER[level] < LEVEL_ORDER[config.minLevel]) {
    return;
  }
  const filePath = config.filePath;
  try {
    const line = `[${new Date().toISOString()}][${level.toUpperCase()}][${process.pid}] ${message}\n`;
    mkdirSync(dirname(filePath), { recursive: true });
    // 跨进程安全：建议性文件锁（~/.openfeel/locks/runtime-log.lock）
    withFileLock(globalLockPath('runtime-log'), () => {
      appendFileSync(filePath, line, { encoding: 'utf-8' });
    });
  } catch {
    // 写日志失败（磁盘/权限/锁超时）不得中断 CLI
  }
}
