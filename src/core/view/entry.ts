/**
 * 审查条目核心操作
 * 负责创建、查询、验收审查条目，通过 FlowManager 操作 flow.json
 */
import { FlowManager, type ReviewItem } from '../flow-manager.js';

// 重新导出类型，方便外部引用
export type { ReviewItem };

/**
 * 辅助函数：基于已有审查条目数量，自动生成 REV-ID（如 REV-001）
 * 无论 flow.json 是否加载，始终可生成 REV-001 作为起始 ID
 */
export function generateReviewId(projectPath: string): string {
  const mgr = new FlowManager(projectPath);
  const existingReviews = mgr.getReviewItems();
  return `REV-${String(existingReviews.length + 1).padStart(3, '0')}`;
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

  // 创建 ReviewItem（status='open', filed_by='reviewer', filed_at=当前 ISO 时间）
  const review: ReviewItem = {
    id: revId,
    op: opId,
    status: 'open',
    priority,
    title,
    filed_by: 'reviewer',
    filed_at: new Date().toISOString(),
  };

  // 调用 mgr.addReview() 添加条目
  mgr.addReview(review);

  // 追加日志
  mgr.appendLog({
    time: '',
    agent: 'reviewer',
    action: 'review_add',
    detail: { reviewId: revId, opId, title, priority },
  });

  // 持久化
  mgr.save();

  return review;
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
    agent: 'reviewer',
    action: 'review_accept',
    detail: { reviewId },
  });

  // 持久化
  mgr.save();

  return review;
}
