/**
 * 命令层共享错误处理（stage-50 op-004）
 * 收敛「并发写冲突」与「addStage 失败」两类逐行复制逻辑到单点（T38 / T42）。
 */
import { isFlowConcurrentError, StageDirConflictError } from '../../core/flow-manager.js';
import { t } from '../../core/i18n.js';

/**
 * 并发写冲突退出码（与 cli/index.ts EXIT_CONCURRENT 同值）。
 * 此处独立定义以避免命令层 → cli 的循环依赖。
 */
export const EXIT_CONCURRENT = 2;

/**
 * 并发写冲突统一处理：输出唯一 i18n 文案并退出码 2（不返回）。
 * @param err 并发写冲突错误（含 expectedRevision / actualRevision）
 * @param lang 语言标识
 */
export function handleConcurrentConflict(
  err: { expectedRevision: number; actualRevision: number },
  lang: string,
): never {
  console.error(t('common.concurrentConflict', lang, {
    expected: String(err.expectedRevision),
    actual: String(err.actualRevision),
  }));
  process.exit(EXIT_CONCURRENT);
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
