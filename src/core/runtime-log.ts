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
import { getSessionId } from './session.js';

/**
 * CLI 进程序号起点（T2 duration_ms 口径）。
 * 口径登记：自本模块加载 ≈ 进程早段起算——含其后的模块解析 / 加载 + 命令执行；
 * 不含 node bootstrap 与更早加载；幂等，不随 installRuntimeLog 重装重置。
 */
const PROCESS_START_MS = Date.now();

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

/** done 行一次性旗标（正常路径已写 → exit 兜底 / 信号路径不重复写） */
let cliDoneLogged = false;

/** start / done 行共用的元信息后缀（方括号键值对——空格路径安全；T2） */
function cliMetaSuffix(): string {
  return ' [project=' + process.cwd() + '] [session=' + getSessionId() + ']';
}

/** CLI 起始行（含 project / session 后缀；与 done 行对称） */
export function logCliStart(argv: string[]): void {
  runtimeLog('info', 'cli start: ' + argv.join(' ') + cliMetaSuffix());
}

/**
 * CLI 完成行（一次性旗标防双写；done 行含 duration_ms）。
 * 旗标**置位先于写入**——即使日志被 `--no-log` / `OPENFEEL_LOG=0` 关闭也置位，
 * 保「done 事件已发生」语义。
 */
export function logCliDone(exitCode: number): void {
  if (cliDoneLogged) {
    return; // 一次性：正常路径已写 → exit 兜底 / 信号路径不重复
  }
  cliDoneLogged = true;
  runtimeLog(
    'info',
    'cli done exit=' + exitCode + ' [duration_ms=' + (Date.now() - PROCESS_START_MS) + ']' + cliMetaSuffix(),
  );
}

/** 测试用：重置 done 旗标（模块态隔离） */
export function resetDoneFlagForTest(): void {
  cliDoneLogged = false;
}

/**
 * 安装进程退出兜底（仅 bin 调用；库侧不自动安装；**不设 VITEST/env 守卫**）。
 * 覆盖 process.exit / 正常结束 / 未捕获异常 / SIGINT / SIGTERM：
 * - `exit` 为**单源**写盘点：正常路径已写则由旗标跳过；异常 / 中断 / process.exit 路径由此补齐。
 * - 信号仅保中断语义（130=SIGINT / 143=SIGTERM）；写行由 exit 钩子单源承担。
 * @param proc 进程对象（缺省 = process；注入 EventEmitter 以便单测）
 */
export function installExitHooks(proc: Pick<NodeJS.Process, 'on' | 'once'> = process): void {
  try {
    proc.on('exit', (code) => {
      try {
        // 退出码归一（@types/node 中 process.exitCode 为 number | string）；非数值 → 0
        logCliDone(
          typeof code === 'number' ? code : (typeof process.exitCode === 'number' ? process.exitCode : 0),
        );
      } catch {
        // 钩子体内任何异常不得影响进程退出
      }
    });
    proc.once('SIGINT', () => {
      try {
        process.exit(130);
      } catch {
        // 同上：best-effort
      }
    });
    proc.once('SIGTERM', () => {
      try {
        process.exit(143);
      } catch {
        // 同上：best-effort
      }
    });
  } catch {
    // 钩子安装失败不得中断 CLI
  }
}
