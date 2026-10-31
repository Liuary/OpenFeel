/**
 * 写命令统一 preflight 闸（v1.5.6-stage-114）
 *
 * 职责：把「先读状态再写状态」的**拒绝出口**收敛到单一函数。
 *  - 判定：一律委托 `src/core/preflight.ts` 的 `preflightGate`（off 放行 / warn 仅 TTY 提示 / strict 拒绝）；
 *  - 出口：JSON 模式 → `emitErrorEnvelope`（`INVALID_ARGUMENT` + `detail.reason='preflight-required'`）；
 *          人类模式 → 单行 stderr；
 *  - 退出：只置 `process.exitCode` 并返回 false，**不调用 `process.exit`** —— 调用点必须立即 `return`，
 *          以便其后的 catch / 回滚路径仍可收敛（非 JSON 分支若即退会破坏这一收敛）。
 *
 * 边界：本模块归**命令层**（依赖 `emitErrorEnvelope` / `isJsonMode`），不得下沉进 `src/core`
 *       （否则 core → commands 层次反转）。`src/core/preflight.ts` 零改动。
 */
import { preflightGate } from '../../core/preflight.js';
import { t } from '../../core/i18n.js';
import { getCliErrorSpec } from '../../core/errors.js';
import { emitErrorEnvelope } from './errors.js';
import { isJsonMode } from './json-output.js';

/** 当前 flow.json 是否可读（由调用方 `mgr.isLoaded()` 求值后传入） */
export type StateReadable = boolean;

/** 统一闸门选项 */
export interface PreflightGuardOptions {
  /** 覆盖主文案（缺省 `t('flow.preflightRequiredTmpl', lang)`） */
  message?: string;
  /** 自定义拒绝输出（仅 legacy `--json` 命令：`flow archive`、`req split`） */
  reject?: (message: string) => void;
  /** 状态可读性；缺省 `true`（普通命令不传 = 视为可读 → 不触发豁免） */
  stateReadable?: StateReadable;
  /**
   * 状态不可读时放行（恢复通道豁免）。
   * **仅限 `flow repair` / `flow checkpoint restore`** —— 二者在 flow.json 损坏时仍能工作，
   * 且账本只在 `mgr.isLoaded()` 时写入，不豁免会形成永久死锁。禁止泛化到其它命令。
   */
  exemptWhenStateUnreadable?: boolean;
}

/**
 * 写命令统一 preflight 闸。
 * @param projectPath 项目根（`.openfeel/` 所在目录）
 * @param lang 语言标识（`getCliLang(...)`）
 * @param options 覆盖文案 / legacy 拒绝出口 / 状态可读性豁免
 * @returns `true`=放行；`false`=已输出拒绝并置 exitCode，**调用方必须立即 return**
 */
export function enforcePreflightOrFail(
  projectPath: string,
  lang: string,
  options?: PreflightGuardOptions,
): boolean {
  const stateReadable = options?.stateReadable ?? true;
  // ① 恢复通道豁免：状态不可读 → 静默放行（否则账本永远写不出 → strict 死锁）。
  //    判定必须**先于**任何输出与判定调用，保证豁免路径零输出。
  if (options?.exemptWhenStateUnreadable === true && !stateReadable) return true;

  const message = options?.message ?? t('flow.preflightRequiredTmpl', lang);
  const gate = preflightGate(projectPath, message);
  if (gate.ok) return true;

  // 退出码单一来源（不硬编码 1）
  const exitCode = getCliErrorSpec('INVALID_ARGUMENT').exitCode;
  if (options?.reject) {
    // legacy 三键契约：由调用方自带出口，helper 不自输出
    options.reject(gate.message);
    process.exitCode = exitCode;
    return false;
  }
  if (isJsonMode()) {
    emitErrorEnvelope({
      code: 'INVALID_ARGUMENT',
      message: gate.message,
      detail: { reason: 'preflight-required', hint: 'openfeel flow next --json' },
    });
  } else {
    console.error(gate.message);
  }
  process.exitCode = exitCode;
  return false;
}
