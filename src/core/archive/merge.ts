/**
 * 阶段归档模块
 * 负责汇总阶段产出、生成归档摘要、提取知识条目，通过 FlowManager 操作 flow.json
 */
import { FlowManager } from '../flow-manager.js';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

/** 归档结果 */
export interface ArchiveResult {
  /** 归档摘要（Markdown 格式） */
  summary: string;
  /** 操作方案数量 */
  opsCount: number;
  /** 审查条目数量 */
  reviewsCount: number;
  /** 从审查条目提取的知识描述 */
  knowledgeExtracts: string[];
}

/**
 * 归档指定阶段
 * 汇总阶段产出、生成 Markdown 摘要、提取知识条目并写入归档文件
 * @param projectPath 项目路径
 * @param stageName 阶段名称（如 stage-06）
 * @returns ArchiveResult，若 flow.json 未加载或阶段不存在则返回 null
 */
export function archiveStage(projectPath: string, stageName: string): ArchiveResult | null {
  const mgr = new FlowManager(projectPath);

  // 若 flow.json 未加载，返回 null
  if (!mgr.isLoaded()) {
    return null;
  }

  // 获取 flow 数据
  const data = mgr.getData();
  if (!data) {
    return null;
  }

  // 查找 stageName 对应的阶段
  const stage = data.stages[stageName];
  if (!stage) {
    return null;
  }

  // 统计该阶段所有 ops
  const ops = Object.values(stage.ops);
  const opsCount = ops.length;

  // 收集该阶段相关审查条目：op 字段格式为 "stageName.opXxx"
  // 提取 op 的 stage 部分（'.' 前），与 stageName 比较
  const relatedReviews = data.reviews.filter((r) => {
    const dotIdx = r.op.indexOf('.');
    if (dotIdx === -1) {
      return false;
    }
    const opStage = r.op.substring(0, dotIdx);
    return opStage === stageName;
  });
  const reviewsCount = relatedReviews.length;

  // 生成操作产出表格行
  const opRows = ops.map((op) => {
    return `| ${op.id || '(无)'} | ${op.title} | ${op.state} | ${op.attempts}/${op.max_attempts} |`;
  }).join('\n') || '| (无) | - | - | - |';

  // 生成审查记录表格行
  const reviewRows = relatedReviews.map((r) => {
    return `| ${r.id} | ${r.title} | ${r.status} | ${r.priority} |`;
  }).join('\n') || '| (无) | - | - | - |';

  // 归档时间
  const archivedAt = new Date().toISOString();

  // 生成 Markdown 格式归档摘要
  const summary = `# 归档摘要 — ${stageName}

- **归档时间**：${archivedAt}
- **阶段名称**：${stageName}
- **阶段状态**：${stage.status}
- **依赖阶段**：${stage.deps.length > 0 ? stage.deps.join(', ') : '无'}

## 操作产出

| ID | 标题 | 状态 | 尝试次数 |
|----|------|------|----------|
${opRows}

## 审查记录

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
${reviewRows}
`;

  // 从 closed/resolved 状态的审查条目中提取知识描述
  const knowledgeExtracts = relatedReviews
    .filter((r) => r.status === 'closed' || r.status === 'resolved')
    .map((r) => `[${r.id}] ${r.title}`);

  // 确保 .openfeel/log/ 目录存在
  const logDir = join(projectPath, '.openfeel', 'log');
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  // 写入归档摘要文件
  const archivePath = join(logDir, `archive-${stageName}.md`);
  writeFileSync(archivePath, summary, 'utf-8');

  // 追加归档日志到 flow.json
  mgr.appendLog({
    time: '',
    agent: 'archiver',
    action: 'archive_stage',
    detail: {
      stageName,
      opsCount,
      reviewsCount,
      knowledgeCount: knowledgeExtracts.length,
      archivePath,
    },
  });

  // 持久化
  mgr.save();

  return {
    summary,
    opsCount,
    reviewsCount,
    knowledgeExtracts,
  };
}
