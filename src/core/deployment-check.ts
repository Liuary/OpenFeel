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
import { existsSync, readFileSync } from 'node:fs';
import { getGlobalAdapterHostPath, getGlobalUpdateStatePath } from './global-paths.js';
import { loadGlobalUpdateState, getOpenfeelVersion } from './update-state.js';

/** 全局部署一致性检测结果状态（v1.3.4 增 restart-required） */
export type DeployCheckStatus = 'ok' | 'mismatch' | 'restart-required' | 'missing' | 'unknown';

/** 全局部署一致性检测结果 */
export interface DeployCheckResult {
  /** 五态判定 */
  status: DeployCheckStatus;
  /** 当前 CLI 版本（基准） */
  cliVersion: string;
  /** 全局 state 记录的已部署版本；缺失/损坏时为 null */
  deployedVersion: string | null;
  /** DSH 适配器指纹详情（仅适配器部署场景出现；用于诊断，不参与 JSON 契约冻结键） */
  adapter?: {
    /** 部署时写入的适配器指纹（空串 = 计算失败，降级为版本比较） */
    deployedHash: string;
    /** 宿主启动时回写的已加载指纹（缺失 = 宿主未加载历史不可知） */
    loadedHash: string | null;
    /** 宿主启动时间（ISO；缺失为 null） */
    startedAt: string | null;
  } | null;
}

/** 读取宿主已加载适配器标记（只读；缺失/损坏 → null） */
function readHostMarker(): { loadedHash: string; startedAt: string | null } | null {
  try {
    const markerPath = getGlobalAdapterHostPath();
    if (!existsSync(markerPath)) {
      return null;
    }
    const raw = JSON.parse(readFileSync(markerPath, 'utf-8')) as Record<string, unknown> | null;
    if (raw === null || typeof raw !== 'object') {
      return null;
    }
    const loadedHash = typeof raw.loaded_hash === 'string' ? raw.loaded_hash : '';
    const startedAt = typeof raw.started_at === 'string' ? raw.started_at : null;
    return { loadedHash, startedAt };
  } catch {
    return null;
  }
}

/**
 * 检测全局部署版本与当前 CLI 版本是否一致（只读、不写盘、不加锁）。
 * - 全局 state 文件缺失 → 'missing'
 * - 文件存在但 Schema 非法/解析失败（load 返回 null）→ 'unknown'（静默）
 * - 版本不一致 → 'mismatch'（磁盘上的部署旧）
 * - 版本一致且存在 `adapters.dsh`：
 *   - 宿主 marker 缺失或 `loaded_hash` ≠ 部署指纹 → 'restart-required'（文件已新但宿主未重启）
 *   - 指纹一致 → 'ok'
 * - 版本一致且无适配器记录（opencode / claude）→ 'ok'
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
    // 版本不一致 → mismatch（含降级：部署版本 > CLI 版本亦按 != 处理）
    if (deployedVersion !== cliVersion) {
      return { status: 'mismatch', cliVersion, deployedVersion };
    }
    // v1.3.4：版本一致时，若存在 DSH 适配器指纹，再判断「宿主是否加载了这一份」
    const dsh = state.adapters?.dsh;
    if (dsh === undefined) {
      return { status: 'ok', cliVersion, deployedVersion };
    }
    const deployedHash = dsh.hash;
    // 指纹计算失败（空串）→ 降级为版本比较（不误报 restart）
    if (deployedHash === '') {
      return { status: 'ok', cliVersion, deployedVersion, adapter: { deployedHash, loadedHash: null, startedAt: null } };
    }
    const host = readHostMarker();
    if (host === null || host.loadedHash !== deployedHash) {
      return {
        status: 'restart-required',
        cliVersion,
        deployedVersion,
        adapter: {
          deployedHash,
          loadedHash: host?.loadedHash ?? null,
          startedAt: host?.startedAt ?? null,
        },
      };
    }
    return {
      status: 'ok',
      cliVersion,
      deployedVersion,
      adapter: { deployedHash, loadedHash: host.loadedHash, startedAt: host.startedAt },
    };
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
