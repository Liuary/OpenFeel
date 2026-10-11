/**
 * 归档一致性健康检查项构造 — 纯函数
 * 职责：构造 `flow health` 的「归档一致性」检查项——
 *       a. 归档索引（`meta.archived_versions`）↔ 归档目录清单**双向对账**（恒产生 1 条 pass/warn）；
 *       b. 活跃集残留（flow.json `stages` 仍含已归档版本阶段；仅非空时产生一条 warn）。
 * 边界：**只读**——读取轻量索引（`getArchivedVersions`）+ 归档目录清单级（`listArchiveVersions`，目录级）；
 *       **b 项候选分支**（活跃键版本前缀 ∈ 索引）按版本**惰性读一次**匹配快照（`readArchiveFile`，
 *       仅取 `stages` 键集，不读 reviews/log）；常规（无候选）零读归档文件；不写盘、不加锁。
 * 契约修订（REV-80-019；落点更正 REV-80-024）：原「不读归档文件内容」契约实际落点 =
 *       `stage-80/plan.md §二 不变量 4`（:61）+ 大计划 `v1.2.0/plan.md §八 item 4`（:266）/ 裁定 Q（:118），
 *       **不在 `§四.4`**（plan.md 措辞按 REV-80-020 移交 planner 修订）。
 * 依赖方向（REV-80-005）：对 flow-manager 仅 `import type`（编译期擦除，零运行时依赖边）；
 *       本文件仅被 `src/commands/flow.ts` 消费，禁 `flow-manager → flow-archive` 运行时依赖。
 */
import type { FlowData, HealthCheckItem } from '../flow-manager.js';
import { getArchivedVersions, listArchiveVersions, readArchiveFile } from './archive-ops.js';
import { versionOfStageId } from './grouping.js';

/** a 项 section 常量（双向对账；与测试断言一致，REV-80-012） */
const SECTION_INDEX = '归档一致性';
/** b 项 section 常量（活跃集残留；与测试断言一致，REV-80-012） */
const SECTION_RESIDUAL = '归档残留';

/**
 * 构造归档一致性检查项（a 双向对账 + b 活跃集残留）。
 *
 * - a 项（恒产生 1 条 pass/warn）：`archived_versions` ↔ `.openfeel/flow-archive/*.json` 目录清单双向对账；
 *   两侧差集均空 → pass；否则 warn（索引有文件缺 / 文件有索引缺）。
 * - b 项（仅非空时产生 warn，**两段式判据**——REV-80-019）：候选 = ① 版本前缀 ∈ `archived_versions`
 *   （索引级廉价预筛）**∧** ② 键 ∈ 对应归档快照 `stages` 键集（`readArchiveFile`，键级精确证据）——
 *   「默认版本新建阶段」（键 ∉ 快照）不误报；快照不可读（缺失/损坏 → 读侧宽容 null）→ 不可证实 → 不报
 *   （索引/文件不一致由 a 项承担）。
 *
 * @param input.projectPath 项目根路径（扫描目录清单；b 项候选分支读匹配版本快照以取 `stages` 键集）
 * @param input.data 当前 flow.json 数据（只读）
 * @returns HealthCheckItem[]；全部项 `status ∈ {'pass','warn'}`（**恒无 fail**）
 */
export function archiveHealthItems(input: { projectPath: string; data: FlowData }): HealthCheckItem[] {
  const items: HealthCheckItem[] = [];
  const { projectPath, data } = input;

  // a. 双向对账（索引 ↔ 文件目录清单）
  const indexed = getArchivedVersions(data); // 快照副本
  const files = listArchiveVersions(projectPath); // 目录清单级、字典序
  const indexedSet = new Set(indexed);
  const filesSet = new Set(files);
  const missingFiles = indexed.filter((v) => !filesSet.has(v)); // 索引有、文件缺
  const missingIndex = files.filter((v) => !indexedSet.has(v)); // 文件有、索引缺
  if (missingFiles.length === 0 && missingIndex.length === 0) {
    items.push({
      section: SECTION_INDEX,
      status: 'pass',
      message: `归档索引与归档文件一致（${indexed.length} 个版本）`,
    });
  } else {
    // 两侧差集任一非空 → warn（展示各≤5 条）
    items.push({
      section: SECTION_INDEX,
      status: 'warn',
      message: `归档索引与文件不一致：索引有文件缺 [${missingFiles.slice(0, 5).join(', ')}]；文件有索引缺 [${missingIndex.slice(0, 5).join(', ')}]（可经 flow archive list / flow archive show 复核）`,
    });
  }

  // b. 活跃集残留（仅非空时产生 warn；判据两段式——REV-80-019）：
  //    ① 版本前缀 ∈ archived_versions（索引级廉价预筛；归一化派生不单独构成判据——REV-80-001）；
  //    ② 键 ∈ 对应归档快照的 stages 键集（键级精确证据——「默认版本新建阶段」不误报）。
  //    快照不可读（缺失/损坏，readArchiveFile 读侧宽容 → null）→ 不可证实 → 不报（索引/文件不一致由 a 项承担）。
  const residual: string[] = [];
  const snapshotStageKeys = new Map<string, Set<string>>(); // version → 快照 stages 键集（每版本至多读一次）
  for (const stageId of Object.keys(data.stages)) {
    const version = versionOfStageId(stageId);
    if (!version || !indexedSet.has(version)) {
      continue; // 不可解析 或 版本未归档 → 非候选（不读归档文件）
    }
    let keys = snapshotStageKeys.get(version);
    if (keys === undefined) {
      const snapshot = readArchiveFile(projectPath, version);
      keys = new Set(Object.keys(snapshot?.stages ?? {}));
      snapshotStageKeys.set(version, keys);
    }
    if (keys.has(stageId)) {
      residual.push(stageId);
    }
  }
  if (residual.length > 0) {
    items.push({
      section: SECTION_RESIDUAL,
      status: 'warn',
      message: `flow.json 仍含已归档版本阶段：${residual.slice(0, 5).join(', ')}（可能由 checkpoint restore 带回或重复归档残留；须重新执行 flow archive <version> 收敛）`,
    });
  }

  return items;
}
