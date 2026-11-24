/**
 * 空壳检测（`openfeel lint fill` / `lint req` 的 `fill` 块） — **只读扫描，零写盘**
 *
 * 职责：把「正文/计划/阶段文档没写实」变成可枚举清单。**判据一律来自 `./filled.ts`**，
 * 本文件不定义任何占位字面量、字数阈值或第二套正则（plan §4.3 单一来源强制）。
 *
 * 扫描范围（与 `lintRequirements` 同口径的「无目录即通过」）：
 * - 需求正文：`.openfeel/requirements/*.md`（一层，不递归；符号链接不跟随）；
 * - 需求级计划：全局固定 `.openfeel/plan/reqs/REQ-NNN.plan.md`（经 `findRequirementPlanPath` 单点解析，
 *   本文件**不派生第二份路径**）；
 * - 阶段文档：`.openfeel/plan/<series>/stage-NN/` 下的 `overview.md` 与 `plan.md`。
 *
 * 语义边界（有意设定，写清以免误读）：
 * - **「空」= 文件存在但未写实**。缺失的文件不算空壳：阶段 `plan.md` 缺失是常态（CLI 从不创建，
 *   见 `path.ts:findStagePlanPath` 注释），把它计入会让清单长期被 100+ 条"缺失"淹没；
 *   需求级计划缺失则由 {@link lintRequirementBodies} 的 `missingPlan` 单独列出（它可被动作化补齐）。
 * - **`empty`（正文空壳）保持全量**：正文是需求的固有产物，done/draft 需求同样值得观察存量债务。
 * - **`missingPlan` 只统计在办需求**（v1.6.0 / REV-019）：状态经 `FlowManager` 读 `flow.json`，
 *   「在办」= {@link AUTO_DONE_PRECONDITION}（`scheduled` / `in_progress`，与阶段 exec 门同一份定义）。
 *   已 `done` / `cancelled` / `rejected` / `blocked` / `draft` 的需求不再需要执行前计划；
 *   已随版本归档（`flow-archive` 中有记录）的需求同样视为已处置，不计入。
 *   状态**未知**且未归档（无 `flow.json` / 读取失败 / flow 数据里未登记）→ 保守保留（宁可多列，不漏列）。
 * - 阶段目录标识 `stageId` 取目录名（短名，如 `stage-132`）；`parseStageId` 可直接消费，
 *   与 `.openfeel/plan/{series}/stage-NN/` 的目录名同源。
 *
 * 返回结构稳定（键序/元素形状固定），可直接 JSON 化：数组按文件名字典序 / 目录相对路径升序，
 * 保证同一项目多次扫描输出逐字相同。
 */
import { existsSync, readdirSync, readFileSync, type Dirent } from 'node:fs';
import { basename, join, relative, resolve } from 'node:path';
import {
  REQUIREMENT_BODY_CRITERIA_SECTIONS,
  REQUIREMENT_BODY_SECTIONS,
  findEmptySections,
  isStageOverviewFilled,
  isStagePlanFilled,
} from './filled.js';
import { findRequirementPlanPath } from './path.js';
import { getRequirementBodyPath, getRequirementsDir } from '../req/body-file.js';
import { FlowManager } from '../flow-manager.js';
import { AUTO_DONE_PRECONDITION } from '../req/aggregate.js';
import { listArchivedRequirements } from '../flow-archive/archive-ops.js';
import type { RequirementStatus } from '../req/types.js';

/** 需求正文空壳条目（`emptySections` 保持必备小节的声明顺序） */
export interface RequirementBodyLintEntry {
  /** 需求 ID（文件名去 `.md`，如 `REQ-055`） */
  id: string;
  /** 未写实的小节名（`摘要` / `目标与验收` 子集） */
  emptySections: string[];
}

/** 缺需求级计划的条目 */
export interface RequirementPlanLintEntry {
  id: string;
}

/** `lintRequirementBodies` 报告 */
export interface RequirementBodyLintReport {
  /** 扫描到的需求正文文件数（人类输出计数同源） */
  checked: number;
  /** 正文未写实的需求（按文件名字典序） */
  empty: RequirementBodyLintEntry[];
  /** 无 `.openfeel/plan/reqs/REQ-NNN.plan.md` 的需求（按文件名字典序） */
  missingPlan: RequirementPlanLintEntry[];
}

/** 阶段文档空壳（`stageId` = 目录名短名，如 `stage-132`） */
export interface StageDocLintReport {
  /** `overview.md` 存在但 `## 目标` / `## 操作方案` 未写实 */
  overviewEmpty: Array<{ stageId: string }>;
  /** `plan.md` 存在但整体信息量不足（`isStagePlanFilled` 为假） */
  planEmpty: Array<{ stageId: string }>;
}

/** 阶段目录名形态（`.openfeel/plan/{series}/stage-NN`） */
const STAGE_DIR_RE = /^stage-\d+$/;
/** 阶段目录递归深度上限（`plan/{series}/stage-NN` 只需 2 层；上限防异常深目录/软链环） */
const STAGE_DIR_MAX_DEPTH = 4;

/** 需求状态查询（`undefined` = 状态未知；缺省实现由 `FlowManager` 读 `flow.json`） */
export type RequirementStatusLookup = (id: string) => RequirementStatus | undefined;

/** {@link lintRequirementBodies} 选项（单测注入；命令层零改动） */
export interface LintRequirementBodiesOptions {
  /** 覆盖状态读取（缺省 = 读 `flow.json`；注入后不触碰 FlowManager） */
  statusOf?: RequirementStatusLookup;
}

/**
 * 从 `flow.json` 读「需求 ID → 状态」（只读；`FlowManager` 为状态读取单点，禁第二份解析），
 * 并附「已归档需求 ID 集」（已随版本归档 ⇒ 已处置，不再要求执行前计划）。
 * 无 `flow.json` / 读取或解析失败 → 状态恒未知（调用方按保守口径处理）。
 */
function readRequirementStatusLookup(projectPath: string): {
  statusOf: RequirementStatusLookup;
  archivedIds: Set<string>;
} {
  const root = resolve(projectPath);
  const archivedIds = new Set<string>();
  try {
    for (const { requirement } of listArchivedRequirements(root)) {
      if (requirement && typeof requirement.id === 'string' && requirement.id !== '') {
        archivedIds.add(requirement.id);
      }
    }
  } catch {
    // 归档目录不可读 → 不额外排除（advisory 清单宁可多列）
  }
  const unknown = () => undefined;
  if (!existsSync(join(root, '.openfeel', 'flow.json'))) {
    return { statusOf: unknown, archivedIds };
  }
  try {
    const manager = new FlowManager(root);
    const data = manager.getData();
    if (!data) {
      return { statusOf: unknown, archivedIds };
    }
    const statusById = new Map<string, RequirementStatus>();
    for (const req of Array.isArray(data.requirements) ? data.requirements : []) {
      if (req && typeof req.id === 'string' && req.id !== '') {
        statusById.set(req.id, req.status);
      }
    }
    return { statusOf: (id) => statusById.get(id), archivedIds };
  } catch {
    return { statusOf: unknown, archivedIds };
  }
}

/**
 * 列出需求正文空壳与缺计划需求（只读）。
 *
 * @param projectPath 项目根（相对路径按进程 cwd 解析）
 * @param options 状态读取覆盖（缺省由 `FlowManager` 读 `flow.json`）
 * @returns `{checked, empty, missingPlan}`；`.openfeel/requirements` 不存在/不可读 → 三项全空。
 *   `empty` 全量；`missingPlan` 只含在办（`scheduled` / `in_progress`）与状态未知的需求。
 */
export function lintRequirementBodies(
  projectPath: string,
  options: LintRequirementBodiesOptions = {},
): RequirementBodyLintReport {
  const root = resolve(projectPath);
  const names = listRequirementFileNames(getRequirementsDir(root));
  // 注入 lookup（单测）时不读归档；缺省读 flow.json + 归档索引。
  const source = options.statusOf !== undefined
    ? { statusOf: options.statusOf, archivedIds: new Set<string>() }
    : readRequirementStatusLookup(root);
  const empty: RequirementBodyLintEntry[] = [];
  const missingPlan: RequirementPlanLintEntry[] = [];

  for (const name of names) {
    const id = name.slice(0, -'.md'.length);
    const content = readFileSync(getRequirementBodyPath(root, id), 'utf-8');
    const emptySections = findEmptySections(
      content,
      REQUIREMENT_BODY_SECTIONS,
      REQUIREMENT_BODY_CRITERIA_SECTIONS,
    );
    // 正文空壳：全量（含 done / draft——存量债务观察口径，REV-019）
    if (emptySections.length > 0) {
      empty.push({ id, emptySections });
    }
    // 缺计划：只在办需求（与阶段 exec 门同一份 AUTO_DONE_PRECONDITION 口径）。
    // 状态未知 → 已归档的不列（已处置）；未登记的保守列出（孤儿正文值得观察）。
    const status = source.statusOf(id);
    const active = status !== undefined
      ? (AUTO_DONE_PRECONDITION as readonly string[]).includes(status)
      : !source.archivedIds.has(id);
    if (active && findRequirementPlanPath(root, id) === null) {
      missingPlan.push({ id });
    }
  }

  return { checked: names.length, empty, missingPlan };
}

/**
 * 列出阶段文档空壳（只读）。
 *
 * 遍历 `.openfeel/plan` 下所有 `stage-NN/` 目录；**只报存在但未写实**的 `overview.md` / `plan.md`
 * （见模块头「语义边界」）。`.openfeel/plan` 不存在 → 两个数组均为空。
 *
 * @param projectPath 项目根（相对路径按进程 cwd 解析）
 */
export function lintStageDocs(projectPath: string): StageDocLintReport {
  const root = resolve(projectPath);
  const planDir = join(root, '.openfeel', 'plan');
  const overviewEmpty: Array<{ stageId: string }> = [];
  const planEmpty: Array<{ stageId: string }> = [];

  for (const relDir of listStageDirRels(planDir)) {
    const dirAbs = join(planDir, relDir);
    const stageId = basename(dirAbs);

    const overviewPath = join(dirAbs, 'overview.md');
    if (existsSync(overviewPath) && !isStageOverviewFilled(readFileSync(overviewPath, 'utf-8'))) {
      overviewEmpty.push({ stageId });
    }

    const planPath = join(dirAbs, 'plan.md');
    if (existsSync(planPath) && !isStagePlanFilled(readFileSync(planPath, 'utf-8'))) {
      planEmpty.push({ stageId });
    }
  }

  return { overviewEmpty, planEmpty };
}

/**
 * 读取需求正文文件名（一层、不递归、文件名字典序；只取 `isFile()` 项——符号链接天然跳过）。
 * 目录不存在/不可读 → 空数组（镜像 `lint-req.ts:readRequirementFiles` 的「无目录即通过」）。
 */
function listRequirementFileNames(dir: string): string[] {
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }
  return entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();
}

/**
 * 递归收集 `.openfeel/plan` 下的阶段目录（返回相对 `planDir` 的路径，正斜杠归一、升序）。
 * 只递归真实目录（`Dirent.isDirectory()`），符号链接目录不跟随；命中 `stage-NN` 后不再深入。
 */
function listStageDirRels(planDir: string): string[] {
  if (!existsSync(planDir)) {
    return [];
  }
  const found: string[] = [];
  const walk = (dir: string, depth: number): void => {
    if (depth > STAGE_DIR_MAX_DEPTH) {
      return;
    }
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory()) {
        continue;
      }
      const abs = join(dir, entry.name);
      if (STAGE_DIR_RE.test(entry.name)) {
        found.push(relative(planDir, abs).split('\\').join('/'));
        continue;
      }
      walk(abs, depth + 1);
    }
  };
  walk(planDir, 0);
  return found.sort();
}
