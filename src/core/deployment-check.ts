/**
 * deployment-check.ts — 全局部署版本一致性检测核心（stage-66）
 *
 * 职责：只读检测 `~/.openfeel/update_state.json.openfeel_version` 与当前 CLI 版本是否一致，
 * 并提供「是否应输出被动部署提示」的纯函数门控策略。
 * 本模块**不接 CLI**（接入归 stage-67）；检测**只读**、不加锁、不写盘。
 *
 * ── 集成契约（stage-67 复用，勿改结构；R-4）──────────────────────────
 * - checkGlobalDeployment({ currentVersion? }) => DeployCheckResult
 *     四态：ok | mismatch | missing | unknown（unknown 静默）
 * - shouldRunDeployCheck({ argv, isTTY, env, alreadyWarned }) => boolean
 *     true  = 允许输出被动提示；false = 静默
 * ────────────────────────────────────────────────────────────────
 */
import { existsSync } from 'node:fs';
import { getGlobalUpdateStatePath } from './global-paths.js';
import { loadGlobalUpdateState, getOpenfeelVersion } from './update-state.js';

/** 全局部署一致性检测结果状态 */
export type DeployCheckStatus = 'ok' | 'mismatch' | 'missing' | 'unknown';

/** 全局部署一致性检测结果 */
export interface DeployCheckResult {
  /** 四态判定 */
  status: DeployCheckStatus;
  /** 当前 CLI 版本（基准） */
  cliVersion: string;
  /** 全局 state 记录的已部署版本；缺失/损坏时为 null */
  deployedVersion: string | null;
}

/**
 * 检测全局部署版本与当前 CLI 版本是否一致（只读、不写盘、不加锁）。
 * - 全局 state 文件缺失 → 'missing'
 * - 文件存在但 Schema 非法/解析失败（load 返回 null）→ 'unknown'（静默）
 * - 版本一致 → 'ok'；不一致 → 'mismatch'
 * - 任何读取异常（权限/占用/EISDIR）→ 'unknown'（静默，不抛）
 * @param options.currentVersion 覆盖 CLI 版本基准（测试注入用；缺省取 getOpenfeelVersion()）
 */
export function checkGlobalDeployment(options?: { currentVersion?: string }): DeployCheckResult {
  const cliVersion = options?.currentVersion ?? getOpenfeelVersion();
  try {
    const statePath = getGlobalUpdateStatePath();
    // 文件不存在 → 部署缺失（与「存在但非法」区分；loadGlobalUpdateState 对二者均返回 null）
    if (!existsSync(statePath)) {
      return { status: 'missing', cliVersion, deployedVersion: null };
    }
    const state = loadGlobalUpdateState();
    // 文件存在但 Schema 非法/解析失败 → unknown 静默（避免 Schema 演进误报）
    if (state === null) {
      return { status: 'unknown', cliVersion, deployedVersion: null };
    }
    const deployedVersion = state.openfeel_version;
    // 版本一致 → ok；否则 mismatch（含降级：部署版本 > CLI 版本亦按 != 处理）
    return deployedVersion === cliVersion
      ? { status: 'ok', cliVersion, deployedVersion }
      : { status: 'mismatch', cliVersion, deployedVersion };
  } catch {
    // 读取异常（权限/占用/目录占位等）→ unknown 静默，不抛
    return { status: 'unknown', cliVersion, deployedVersion: null };
  }
}

/** 门控纯函数输入（stage-67 由 runCli/startRepl 构造） */
export interface DeployCheckGateInput {
  /** 进程参数（不含 node/bin） */
  argv: string[];
  /** process.stdout.isTTY */
  isTTY: boolean;
  /** process.env */
  env: NodeJS.ProcessEnv;
  /** 本进程是否已提示过（每进程一次） */
  alreadyWarned: boolean;
}

/** 部署修复类命令白名单：避免「提示用户去做他正在做的事」 */
const DEPLOY_COMMANDS = new Set(['setup', 'update', 'init', 'migrate']);

/** 环境变量真值判定：仅识别 '1' / 'true'（大小写与首尾空白不敏感）；CI=yes 等其它值不识别，由门控的 !isTTY 兜底（REV-003） */
function isTruthyEnv(value: string | undefined): boolean {
  if (value === undefined) { return false; }
  const v = value.trim().toLowerCase();
  return v === '1' || v === 'true';
}

/**
 * 是否应执行/输出被动部署提示（纯函数，输入全显式，便于单测矩阵）。
 * 返回 false（静默）的条件（任一）：
 * - 非 TTY；已提示过；
 * - argv 含 --json / --quiet；
 * - argv 含 --version / -v / --help / -h；
 * - 首个非选项 token ∈ {setup, update, init, migrate}；
 * - CI / OPENFEEL_NO_UPDATE_CHECK 为真值。
 */
export function shouldRunDeployCheck(input: DeployCheckGateInput): boolean {
  // 非交互（CI/测试/管道）→ 静默
  if (!input.isTTY) { return false; }
  // 每进程一次 → 已提示则静默
  if (input.alreadyWarned) { return false; }
  // 机器可读/安静模式 → 静默（保护 --json stdout 契约）
  if (input.argv.includes('--json') || input.argv.includes('--quiet')) { return false; }
  // 帮助/版本次命令 → 静默
  if (
    input.argv.includes('--version') || input.argv.includes('-v') ||
    input.argv.includes('--help') || input.argv.includes('-h')
  ) { return false; }
  // 部署修复类命令 → 静默
  const firstToken = input.argv.find((a) => !a.startsWith('-'));
  if (firstToken !== undefined && DEPLOY_COMMANDS.has(firstToken)) { return false; }
  // CI / 显式禁用 → 静默
  if (isTruthyEnv(input.env.CI) || isTruthyEnv(input.env.OPENFEEL_NO_UPDATE_CHECK)) { return false; }
  return true;
}
