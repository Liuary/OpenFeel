/**
 * 命令层共享错误处理（stage-50 op-004；stage-95 op-002 扩展错误封装）
 *
 * 收敛「并发写冲突」与「addStage 失败」两类逐行复制逻辑到单点（T38 / T42）；
 * 新增 JSON 模式统一错误出口（envelope / failCli / failRefusal / failInternal），
 * kind 与 exitCode 一律经 `src/core/errors.ts` 的单一映射表读取。
 */
import { isFlowConcurrentError, StageDirConflictError } from '../../core/flow-manager.js';
import { getCliLang, t } from '../../core/i18n.js';
import { getCliErrorSpec, type CliErrorCode, type CliErrorKind } from '../../core/errors.js';
import { emitJson, isJsonMode } from './json-output.js';

/**
 * 并发写冲突退出码（与 cli/index.ts EXIT_CONCURRENT 同值）。
 * 此处独立定义以避免命令层 → cli 的循环依赖。
 */
export const EXIT_CONCURRENT = 2;

/** 新错误 envelope（stdout 单文档；`detail` 无值恒为 `null`） */
export interface ErrorEnvelope {
  schemaVersion: 1;
  error: {
    code: CliErrorCode;
    kind: CliErrorKind;
    message: string;
    detail: unknown;
  };
}

/** 错误出口入参 */
export interface FailCliInput {
  /** 稳定错误码（kind / exitCode 由码表推导） */
  code: CliErrorCode;
  /** 本地化主文案（JSON envelope.message / 非 JSON 缺省 stderr 行） */
  message: string;
  /** 可定位字段；缺省 null */
  detail?: unknown;
  /** 非 JSON 模式逐行 stderr（缺省 [message]）；用于逐字保持既有文案 */
  stderrLines?: string[];
}

/** 仅向 stdout 输出 envelope（不退出、不改退出码） */
export function emitErrorEnvelope(input: FailCliInput): void {
  const spec = getCliErrorSpec(input.code);
  const doc: ErrorEnvelope = {
    // 构造序保证 schemaVersion 为运行时首键（契约 §1.2）
    schemaVersion: 1,
    error: {
      code: spec.code,
      kind: spec.kind,
      message: input.message,
      detail: input.detail ?? null,
    },
  };
  emitJson(doc);
}

/**
 * 统一错误出口：JSON 模式输出 envelope；非 JSON 模式逐行 stderr。
 * 输出在退出之前完成（避免 Windows 管道下 stdout 被截断）。
 * JSON 模式仅置 `process.exitCode` 后返回，由调用方 `return`（REV-95-007.1）；
 * 非 JSON 模式保持既有即时退出语义（0/1/2 语义零改动）。
 * @param input 错误出口入参
 */
export function failCli(input: FailCliInput): void {
  const spec = getCliErrorSpec(input.code);
  if (isJsonMode()) {
    emitErrorEnvelope(input);
    process.exitCode = spec.exitCode;
    return;
  }
  for (const line of input.stderrLines ?? [input.message]) {
    console.error(line);
  }
  // 先置码后退出：兼容既有 `process.exitCode` 断言
  process.exitCode = spec.exitCode;
  process.exit(spec.exitCode);
}

/**
 * 预期拒绝出口：断言码表 kind 为 refusal 后委托 failCli。
 * internal 码误入本出口属编程错误，按内部错误处理（不静默降级）。
 * @param input 错误出口入参
 */
export function failRefusal(input: FailCliInput): void {
  const spec = getCliErrorSpec(input.code);
  if (spec.kind !== 'refusal') {
    failInternal(new Error(`failRefusal 收到非 refusal 错误码：${input.code}`), {
      message: input.message,
      stderrLines: input.stderrLines,
      detail: input.detail,
    });
    return;
  }
  failCli(input);
}

/**
 * 内部错误出口（INTERNAL_ERROR / exit 3）。
 * @param err 原始异常（detail 缺省取 {name,message[,stack]}）
 * @param options 可覆盖主文案 / stderr 行 / detail
 */
export function failInternal(
  err: unknown,
  options?: { message?: string; stderrLines?: string[]; detail?: unknown },
): void {
  const lang = getCliLang(process.cwd());
  const msg = err instanceof Error ? err.message : String(err);
  const defaultMessage = t('common.errorTmpl', lang, { msg });
  const detail = options?.detail ?? (
    err instanceof Error
      ? { name: err.name, message: err.message, stack: err.stack }
      : { name: 'Error', message: String(err) }
  );
  failCli({
    code: 'INTERNAL_ERROR',
    message: options?.message ?? defaultMessage,
    detail,
    stderrLines: options?.stderrLines ?? [defaultMessage],
  });
}

/**
 * 并发写冲突统一处理：输出唯一 i18n 文案并退出码 2（不返回）。
 * JSON 模式输出 FLOW_CONCURRENT_CONFLICT envelope（kind=refusal）；非 JSON 分支逐字不变。
 * @param err 并发写冲突错误（含 expectedRevision / actualRevision）
 * @param lang 语言标识
 */
export function handleConcurrentConflict(
  err: { expectedRevision: number; actualRevision: number },
  lang: string,
): never {
  if (isJsonMode()) {
    emitErrorEnvelope({
      code: 'FLOW_CONCURRENT_CONFLICT',
      message: t('common.concurrentConflict', lang, {
        expected: String(err.expectedRevision),
        actual: String(err.actualRevision),
      }),
      detail: { expectedRevision: err.expectedRevision, actualRevision: err.actualRevision },
    });
    process.exitCode = EXIT_CONCURRENT;
    // 测试 mock process.exit 后不得穿透到非 JSON 分支（人类文案）
    process.exit(EXIT_CONCURRENT);
  } else {
    console.error(t('common.concurrentConflict', lang, {
      expected: String(err.expectedRevision),
      actual: String(err.actualRevision),
    }));
    process.exit(EXIT_CONCURRENT);
  }
}

/**
 * addStage 失败统一处理（T42）：并发写冲突 / 阶段目录冲突 / 其他错误三类分流。
 * `stage create` 与 `flow stage add` 共用，保证两入口输出一致（不返回）。
 * @param err 捕获到的错误
 * @param lang 语言标识
 */
export function handleAddStageError(err: unknown, lang: string): never {
  // 并发写冲突：本次未写入 flow.json，输出可重试提示并退出码 2
  if (isFlowConcurrentError(err)) {
    handleConcurrentConflict(err, lang);
  }
  // 阶段目录冲突：按类型分流走 i18n 模板（cli/BUG-002 死键消除）
  if (err instanceof StageDirConflictError) {
    console.error(t('common.stageDirConflictTmpl', lang, { stage: err.stage, other: err.other }));
    process.exit(1);
  }
  // 其他错误：通用错误模板
  const msg = err instanceof Error ? err.message : String(err);
  console.error(t('common.errorTmpl', lang, { msg }));
  process.exit(1);
}
