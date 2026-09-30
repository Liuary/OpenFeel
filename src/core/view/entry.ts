/**
 * 审查条目核心操作
 * 负责创建、查询、验收审查条目，通过 FlowManager 操作 flow.json
 */
import { FlowManager, type ReviewItem } from '../flow-manager.js';

// 重新导出类型，方便外部引用
export type { ReviewItem };

/**
 * 辅助函数：扫描既有 REV-(\d+) 取最大序号 + 1 生成 REV-ID（如 REV-001）
 * 不依赖数组长度，避免并发创建或删除后重号（T13）
 * 无论 flow.json 是否加载，始终可生成 REV-001 作为起始 ID
 */
export function generateReviewId(projectPath: string): string {
  const mgr = new FlowManager(projectPath);
  const existingReviews = mgr.getReviewItems();
  let maxSeq = 0;
  for (const r of existingReviews) {
    const m = /^REV-(\d+)$/.exec(r.id);
    if (m) {
      const n = parseInt(m[1], 10);
      if (n > maxSeq) {
        maxSeq = n;
      }
    }
  }
  return `REV-${String(maxSeq + 1).padStart(3, '0')}`;
}

/**
 * 创建审查条目
 * @param projectPath 项目路径
 * @param opId 关联的操作 ID（如 stage-01.op-001）
 * @param title 审查标题
 * @param priority 优先级，默认 medium
 * @returns 创建的 ReviewItem
 * @throws 若 flow.json 未初始化则抛出异常
 */
export function createReviewEntry(
  projectPath: string,
  opId: string,
  title: string,
  priority: 'high' | 'medium' | 'low' = 'medium',
): ReviewItem {
  const mgr = new FlowManager(projectPath);

  // 若 flow.json 未加载，直接抛出异常
  if (!mgr.isLoaded()) {
    throw new Error('flow.json 未初始化，请先运行 openfeel init');
  }

  // 自动生成 REV ID
  const revId = generateReviewId(projectPath);

  // 创建 ReviewItem（status='open', filed_by='openfeel-reviewer', filed_at=当前 ISO 时间）
  const review: ReviewItem = {
    id: revId,
    op: opId,
    status: 'open',
    priority,
    title,
    filed_by: 'openfeel-reviewer',
    filed_at: new Date().toISOString(),
  };

  // 调用 mgr.addReview() 添加条目
  mgr.addReview(review);

  // 追加日志
  mgr.appendLog({
    time: '',
    agent: 'openfeel-reviewer',
    action: 'review_add',
    detail: { reviewId: revId, opId, title, priority },
  });

  // 持久化
  mgr.save();

  return review;
}

/**
 * 添加审查条目的统一入参（T37/R4 单点）
 */
export interface AddReviewOptions {
  /** 关联的操作 ID（格式 "stageId.opId"） */
  opId: string;
  /** 审查标题（缺省时以 opId 兜底；命令层负责传入本地化标题） */
  title?: string;
  /** 优先级（默认 medium） */
  priority?: string;
  /** 自动修复说明（提供时走 addAutoFixReview） */
  autoFixDetail?: string;
  /** 是否阻塞流水线（默认 true） */
  blocking?: boolean;
  /** 提交者标识（默认 'cli'） */
  filedBy?: string;
}

/** 添加审查条目失败原因（供命令层按 code 分流 i18n 文案） */
export type AddReviewError =
  | { code: 'notLoaded' }
  | { code: 'invalidPriority'; priority: string }
  | { code: 'invalidOpId'; opId: string }
  | { code: 'stageNotFound'; opId: string; stage: string }
  | { code: 'opNotFound'; opId: string; op: string; stage: string };

/** 添加审查条目结果 */
export interface AddReviewResult {
  /** 成功时返回创建的审查条目，失败时为 null */
  review: ReviewItem | null;
  /** 失败原因（成功时为 null） */
  error: AddReviewError | null;
}

/**
 * 添加审查条目的单点实现（T37/R4）：解析 / 校验 / REV ID 分配 / 写入口归一。
 * `flow review add` 与 `view add` 均调用本函数，禁止各自维护第二套校验与 ID 生成。
 * @param projectPath 项目路径
 * @param opts 入参（见 AddReviewOptions）
 * @returns 结果对象（成功含 review；失败含 error.code）
 */
export function addReviewEntry(projectPath: string, opts: AddReviewOptions): AddReviewResult {
  const mgr = new FlowManager(projectPath);
  if (!mgr.isLoaded()) {
    return { review: null, error: { code: 'notLoaded' } };
  }

  // 优先级校验
  const priority = opts.priority ?? 'medium';
  if (!['high', 'medium', 'low'].includes(priority)) {
    return { review: null, error: { code: 'invalidPriority', priority } };
  }

  // opId 格式校验（用 lastIndexOf 分割，兼容含点 stageId）
  const dotIdx = opts.opId.lastIndexOf('.');
  if (dotIdx === -1) {
    return { review: null, error: { code: 'invalidOpId', opId: opts.opId } };
  }
  const stageId = opts.opId.substring(0, dotIdx);
  const opLocalId = opts.opId.substring(dotIdx + 1);
  const data = mgr.getData();
  if (!data || !data.stages[stageId]) {
    return { review: null, error: { code: 'stageNotFound', opId: opts.opId, stage: stageId } };
  }
  if (!data.stages[stageId].ops[opLocalId]) {
    return { review: null, error: { code: 'opNotFound', opId: opts.opId, op: opLocalId, stage: stageId } };
  }

  // REV ID 由单点按「既有最大序号 + 1」分配（T13），两入口不得自行生成
  const revId = generateReviewId(projectPath);
  const review: ReviewItem = {
    id: revId,
    op: opts.opId,
    status: 'open',
    priority: priority as 'high' | 'medium' | 'low',
    title: opts.title || opts.opId,
    filed_by: opts.filedBy ?? 'cli',
    filed_at: new Date().toISOString(),
    canAutoFix: !!opts.autoFixDetail,
    autoFixDetail: opts.autoFixDetail,
    blocking: opts.blocking ?? true,
  };

  if (opts.autoFixDetail) {
    mgr.addAutoFixReview(review, opts.opId);
  } else {
    mgr.addReview(review);
  }
  mgr.save();

  return { review, error: null };
}

/**
 * 列出审查条目
 * @param projectPath 项目路径
 * @param opId 可选操作 ID 过滤
 * @returns 审查条目数组，按 filed_at 降序排列；若未加载则返回空数组
 */
export function listReviews(projectPath: string, opId?: string): ReviewItem[] {
  const mgr = new FlowManager(projectPath);

  // 若 flow.json 未加载，返回空数组
  if (!mgr.isLoaded()) {
    return [];
  }

  // 获取审查条目（可选按 opId 过滤）
  const items = mgr.getReviewItems(opId);

  // 按 filed_at 降序排序
  items.sort((a, b) => b.filed_at.localeCompare(a.filed_at));

  return items;
}

/**
 * 验收审查条目（open→closed）
 * 通过 upsert 方式将指定审查条目标记为 closed
 * @param projectPath 项目路径
 * @param reviewId 审查条目 ID
 * @returns 更新后的 ReviewItem，若 flow.json 未加载或条目不存在则返回 null
 */
export function acceptReview(projectPath: string, reviewId: string): ReviewItem | null {
  const mgr = new FlowManager(projectPath);

  // 若 flow.json 未加载，返回 null
  if (!mgr.isLoaded()) {
    return null;
  }

  // 查找指定 ID 的审查条目
  const items = mgr.getReviewItems();
  const review = items.find((r) => r.id === reviewId);

  // 若不存在返回 null
  if (!review) {
    return null;
  }

  // 将 status 改为 'closed'
  review.status = 'closed';

  // 调用 mgr.addReview() upsert 更新
  mgr.addReview(review);

  // 追加验收日志
  mgr.appendLog({
    time: '',
    agent: 'openfeel-reviewer',
    action: 'review_accept',
    detail: { reviewId },
  });

  // 持久化
  mgr.save();

  return review;
}
