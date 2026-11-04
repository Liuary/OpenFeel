/**
 * 看板数据聚合层（D-125-02 / D-125-03）
 *
 * 职责：把命令层注入的 `data` / `statusDoc` / `healthReport` 聚合成 `dashboard --json` 的冻结契约
 * （`requirements` / `stages` / `releases` / `blockingReviews` / `health` / `metrics` + `project` 元信息）。
 *
 * 边界（硬约束）：
 * - 只 import `src/core/**` 与 Node 内建（禁 `commands/` / `cli/` 说明符——层次禁令见
 *   `src/commands/shared/preflight-gate.ts:11-12`；由 T24 单测机械守住）；
 * - 纯聚合：零控制台输出、零写盘、零进程退出调用、零 CWD 读取（路径只来自入参 `projectPath`）；
 * - **不** `new FlowManager`、**不**二次读 `flow.json`（`data` / `statusDoc` / `healthReport` 由命令层注入）；
 * - 只读 IO 恰好三处：`{projectPath}/package.json`（失败宽容为 null）、
 *   `.openfeel/metrics.json`（经 `MetricsStore` 显式 dataDir）、
 *   `.openfeel/flow-archive/*.json`（`listArchiveVersions` / `readArchiveFile`）。
 */
import { existsSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  computeRequirementAggregate,
  listLinkedStages,
  requirementHealthItems,
  type LinkedStage,
} from '../req/aggregate.js';
import {
  listRequirements,
  releaseCheckRequirements,
  type ReleaseCheckResult,
} from '../req/requirement-ops.js';
import { REQ_STATUSES, type RequirementData, type RequirementStatus } from '../req/types.js';
import { listArchiveVersions, readArchiveFile } from '../flow-archive/archive-ops.js';
import type { ArchiveCounts } from '../flow-archive/archive-file.js';
import { archiveHealthItems } from '../flow-archive/archive-health.js';
import {
  listStageBlockingOpenReviews,
  type FlowData,
  type HealthCheckItem,
  type HealthCheckResult,
  type ReviewItem,
} from '../flow-manager.js';
import { MetricsStore } from '../metrics.js';
import { getOpenfeelVersion } from '../update-state.js';

// ═══ 契约类型（键集 / 键序冻结，改动须过 docs/json-contract.md 与 T1）═══

/** 项目元信息（`package.json` 缺失 / 解析失败 / 字段非字符串 → 对应字段 null，不抛） */
export interface DashboardProjectMeta {
  root: string;
  name: string | null;
  version: string | null;
}

/** 需求行 = `RequirementData` 逐字 + 关联阶段 + 进度（对齐 `req list --json`） */
export interface DashboardRequirementItem extends RequirementData {
  linkedStages: LinkedStage[];
  progress: { done: number; total: number };
}

/** 需求块：`groups` / `counts` 键序恒 = `REQ_STATUSES` 声明序，7 组恒在（空组 `[]`） */
export interface DashboardRequirementsBlock {
  groups: Record<RequirementStatus, DashboardRequirementItem[]>;
  counts: Record<RequirementStatus, number>;
  total: number;
}

/** stage 行（`statusDoc.stages[]` 的投影：不是逐字照搬，只留契约键） */
export interface DashboardStageItem {
  id: string;
  phase: string;
  status: string;
  opsTotal: number;
  opsDone: number;
  workflowMode: string | null;
  requirementId: string | null;
}

/** 流水线宏观位（逐字取自注入的 statusDoc） */
export interface DashboardPipeline {
  phase: string | null;
  current: { stage: string | null; op: string | null };
}

/** 阶段块 */
export interface DashboardStagesBlock {
  pipeline: DashboardPipeline;
  items: DashboardStageItem[];
  counts: { total: number; done: number; active: number };
}

/** 发布门行（只含**未归档**版本；`unfinished` 为需求 ID 串数组） */
export interface DashboardReleaseGate {
  version: string;
  counts: ReleaseCheckResult['counts'];
  unfinished: string[];
}

/** 归档版本行（`counts` 损坏 / 不可读 → null） */
export interface DashboardArchivedRelease {
  version: string;
  counts: ArchiveCounts | null;
}

/** 版本块：已归档版本**只出现在** `archived[]` */
export interface DashboardReleasesBlock {
  gates: DashboardReleaseGate[];
  archived: DashboardArchivedRelease[];
}

/** 阻塞审查行（只计 `phase !== 'done'` 的阶段） */
export interface DashboardBlockingReview {
  stage: string;
  op: string;
  id: string;
  title: string;
  priority: ReviewItem['priority'];
}

/** 健康块（`items` 三来源顺序：注入项 → 归档对账 → 需求对账；`ok` 恒取注入的 `healthReport.ok`） */
export interface DashboardHealthBlock {
  ok: boolean;
  items: HealthCheckItem[];
}

/** 指标块（`getSummaryData()` 逐字，不含 `processHealth`） */
export type DashboardMetrics = ReturnType<MetricsStore['getSummaryData']>;

/**
 * 看板聚合结果（顶层键序冻结：`schemaVersion` 恒首键、`generatedAt` 唯一时间字段）。
 * 测试不得断言 `generatedAt` 的值。
 */
export interface DashboardData {
  schemaVersion: 1;
  generatedAt: string;
  generator: string;
  project: DashboardProjectMeta;
  requirements: DashboardRequirementsBlock;
  stages: DashboardStagesBlock;
  releases: DashboardReleasesBlock;
  blockingReviews: DashboardBlockingReview[];
  health: DashboardHealthBlock;
  metrics: DashboardMetrics;
}

/**
 * 命令层注入的 `flow status --json` 结构（`buildStatusJson` 输出，唯一消费方是这里）。
 * 只声明本层实际读取的键：`opsTotal` 用 `opsSummary.total`、`opsDone` 用 `opsSummary.byState.done`。
 */
export interface DashboardStatusStage {
  id: string;
  phase: string;
  status: string;
  opsSummary: { total: number; byState: Record<string, number> };
  /** 已由命令层经 `FlowManager.resolveStageWorkflowMode` 派生——core 层不得自行派生 */
  workflowMode?: string;
  /** 首个关联需求（已由命令层派生，可空） */
  requirementId?: string | null;
}

/** 命令层注入的 `flow status --json` 文档（只留聚合所需三键） */
export interface DashboardStatusDoc {
  pipeline: DashboardPipeline;
  stages: DashboardStatusStage[];
  counts: { total: number; done: number; active: number };
}

/** 注入的聚合输入（`data` / `statusDoc` / `healthReport` 均由命令层构造，本层零二次读盘） */
export interface CollectDashboardInput {
  data: FlowData;
  statusDoc: DashboardStatusDoc;
  healthReport: HealthCheckResult;
  lang?: string;
}

// ═══ 聚合实现 ═══

/** 版本号归一（**仅比较用**）：trim + 去单个前导 `v`（`v1.5.8` 与 `1.5.8` 视为同版本） */
function compareVersionKey(version: string): string {
  const trimmed = typeof version === 'string' ? version.trim() : '';
  return trimmed.startsWith('v') ? trimmed.slice(1) : trimmed;
}

/**
 * `listArchiveVersions` 的读侧降级包装：`.openfeel/flow-archive` 被占用为**普通文件**时
 * `readdirSync` 抛 `ENOTDIR`；快照出口不得因此变成 `INTERNAL_ERROR`/3（3 只保留给写盘失败）
 * → 捕获后按「无归档版本」降级为空数组（`archive-ops.ts` 不在本层边界内，仅在此收口）。
 */
function safeListArchiveVersions(projectPath: string): string[] {
  try {
    return listArchiveVersions(projectPath);
  } catch {
    return [];
  }
}

/** 读项目 `package.json` 的 name / version（任何失败 → null，不抛；这是本层唯一新增只读 IO） */
function readProjectMeta(projectPath: string): DashboardProjectMeta {
  const empty: DashboardProjectMeta = { root: projectPath, name: null, version: null };
  try {
    const pkgPath = resolve(projectPath, 'package.json');
    if (!existsSync(pkgPath)) {
      return empty;
    }
    const parsed = JSON.parse(readFileSync(pkgPath, 'utf-8')) as unknown;
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return empty;
    }
    const record = parsed as { name?: unknown; version?: unknown };
    return {
      root: projectPath,
      name: typeof record.name === 'string' ? record.name : null,
      version: typeof record.version === 'string' ? record.version : null,
    };
  } catch {
    return empty; // 读盘失败 / JSON 解析失败 → 宽容为 null（不抛）
  }
}

/** 需求行投影（关联阶段 + 进度共用既有 core 单点，禁第二份实现） */
function toRequirementItem(data: FlowData, requirement: RequirementData): DashboardRequirementItem {
  const aggregate = computeRequirementAggregate(data, requirement.id);
  return {
    ...requirement,
    linkedStages: listLinkedStages(data, requirement.id),
    progress: { done: aggregate.doneCount, total: aggregate.stageCount },
  };
}

/**
 * 需求块：沿 `REQ_STATUSES` 常量内联分组（唯一有意重复——`req board` 的分组是 action 内联 3 行不可复用；
 * 值域单点仍是常量）。键序恒 = 常量声明序、7 组恒在。
 */
function collectRequirements(data: FlowData): DashboardRequirementsBlock {
  const rows = listRequirements(data, {});
  const groups = {} as Record<RequirementStatus, DashboardRequirementItem[]>;
  const counts = {} as Record<RequirementStatus, number>;
  for (const status of REQ_STATUSES) {
    const items = rows.filter((r) => r.status === status).map((r) => toRequirementItem(data, r));
    groups[status] = items;
    counts[status] = items.length;
  }
  return { groups, counts, total: rows.length };
}

/**
 * 阶段块：`pipeline` / `counts` 逐字取自注入的 `statusDoc`；`items[]` 是 `statusDoc.stages[]` 的投影
 * （只留契约键，且不改写 `statusDoc` 形状）。
 */
function collectStages(statusDoc: DashboardStatusDoc): DashboardStagesBlock {
  const items = (statusDoc.stages ?? []).map((row) => ({
    id: row.id,
    phase: row.phase,
    status: row.status,
    opsTotal: row.opsSummary?.total ?? 0,
    opsDone: row.opsSummary?.byState?.done ?? 0, // byState 无零值键 → ?? 0
    workflowMode: row.workflowMode ?? null, // 直接透传 statusDoc 行同名键（core 层不得自行派生）
    requirementId: row.requirementId ?? null,
  }));
  return {
    pipeline: {
      phase: statusDoc.pipeline?.phase ?? null,
      current: {
        stage: statusDoc.pipeline?.current?.stage ?? null,
        op: statusDoc.pipeline?.current?.op ?? null,
      },
    },
    items,
    counts: {
      total: statusDoc.counts?.total ?? items.length,
      done: statusDoc.counts?.done ?? 0,
      active: statusDoc.counts?.active ?? 0,
    },
  };
}

/**
 * 版本块（F2）：`gates` 只含**未归档**版本——需求 `target_version` 去重并集减去
 * `listArchiveVersions` 集合（按去前导 `v` 归一化比较）；已归档版本只出现在 `archived[]`。
 * `unfinished` 必须是 **ID 串数组**（`releaseCheckRequirements` 返回 `RequirementData[]`）。
 */
function collectReleases(
  projectPath: string,
  data: FlowData,
): DashboardReleasesBlock {
  const archivedVersions = safeListArchiveVersions(projectPath);
  const archivedKeys = new Set(archivedVersions.map((v) => compareVersionKey(v)));

  // 归一化键 → 展示版本（取首次出现的原始 trim 值，保序去重；键排序保证确定性）
  const gateVersions = new Map<string, string>();
  for (const requirement of listRequirements(data, {})) {
    const target = typeof requirement.target_version === 'string' ? requirement.target_version.trim() : '';
    if (target === '') {
      continue;
    }
    const key = compareVersionKey(target);
    if (key === '' || archivedKeys.has(key) || gateVersions.has(key)) {
      continue;
    }
    gateVersions.set(key, target);
  }

  const gates = [...gateVersions.keys()]
    .sort()
    .map((key) => {
      const check = releaseCheckRequirements(data, gateVersions.get(key) as string);
      return {
        version: check.version, // 已 trim
        counts: check.counts, // 逐字透传
        unfinished: check.unfinished.map((r) => r.id), // 契约要 ID 串数组
      };
    });

  const archived = archivedVersions.map((version) => ({
    version,
    counts: readArchiveFile(projectPath, version)?.counts ?? null,
  }));

  return { gates, archived };
}

/** 阻塞审查块：只遍历 `phase !== 'done'` 的阶段（done 阶段的 blocking REV 不计入） */
function collectBlockingReviews(data: FlowData): DashboardBlockingReview[] {
  const reviews = Array.isArray(data.reviews) ? data.reviews : [];
  const result: DashboardBlockingReview[] = [];
  for (const [stageId, stage] of Object.entries(data.stages ?? {})) {
    if (stage?.phase === 'done') {
      continue;
    }
    for (const review of listStageBlockingOpenReviews(reviews, stageId)) {
      result.push({
        stage: stageId,
        op: review.op,
        id: review.id,
        title: review.title,
        priority: review.priority,
      });
    }
  }
  return result;
}

/**
 * 健康块（F3）：`items` 三来源合并顺序同 `src/commands/flow.ts:2515-2519`
 * （注入项 → 归档对账 → 需求对账）；`ok` 恒取 `healthReport.ok`（合并项恒 warn-only，不翻转 ok）。
 * 本层**不得**调 `healthCheck` 或 `new FlowManager`（core 内不可达）。
 */
function collectHealth(
  projectPath: string,
  data: FlowData,
  healthReport: HealthCheckResult,
  lang?: string,
): DashboardHealthBlock {
  // 归档对账也经 `listArchiveVersions`：目录被占用为文件时同样降级（不改变 ok、不抛）
  let archiveItems: HealthCheckItem[] = [];
  try {
    archiveItems = archiveHealthItems({ projectPath, data });
  } catch {
    archiveItems = [];
  }
  const requirementItems = requirementHealthItems({ data, lang });
  const items: HealthCheckItem[] = [...healthReport.items, ...archiveItems, ...requirementItems].map((item) => ({
    section: item.section,
    status: item.status,
    message: item.message,
  }));
  return { ok: healthReport.ok, items };
}

/** 指标块（F5）：显式 dataDir（缺省按 CWD 会与 `--project` 脱钩）；逐字 `getSummaryData()`，不含 `processHealth` */
function collectMetrics(projectPath: string): DashboardMetrics {
  const store = MetricsStore.getInstance(resolve(projectPath, '.openfeel'));
  store.load();
  return store.getSummaryData();
}

/**
 * 看板数据聚合入口（纯聚合；给定入参相同输出，唯一时间字段 `generatedAt` 除外）。
 *
 * @param projectPath 项目根（唯一路径来源；不读 CWD）
 * @param input.data 由命令层唯一 `FlowManager` 注入的 flow 数据（本层不再读 flow.json）
 * @param input.statusDoc 由命令层 `buildStatusJson` 产出的阶段快照
 * @param input.healthReport 由命令层 `mgr.healthCheck(false)` 产出的健康报告（原生形状）
 * @param input.lang 健康项文案语言（缺省由 `requirementHealthItems` 回退 zh-CN）
 */
export function collectDashboardData(
  projectPath: string,
  input: CollectDashboardInput,
): DashboardData {
  const { data, statusDoc, healthReport, lang } = input;
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    generator: `openfeel/${getOpenfeelVersion()}`,
    project: readProjectMeta(projectPath),
    requirements: collectRequirements(data),
    stages: collectStages(statusDoc),
    releases: collectReleases(projectPath, data),
    blockingReviews: collectBlockingReviews(data),
    health: collectHealth(projectPath, data, healthReport, lang),
    metrics: collectMetrics(projectPath),
  };
}
