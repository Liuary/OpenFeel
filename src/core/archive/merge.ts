/**
 * 阶段归档模块
 * 负责汇总阶段产出、生成归档摘要、提取知识条目，通过 FlowManager 操作 flow.json
 *
 * v1.5.8（REQ-024）归档官增强：归档时额外
 *   ① 汇总该版本 `status === 'done'` 的需求（并入阶段关联需求集 `stageRequirementIds(stage)` 指向的 done 需求）；
 *   ② 生成 `docs/releases/<version>.md` 发布说明草稿（已存在不覆盖，`force` 时覆盖）；
 *   ③ 按探测到的 harness 生成 `<skillDir>/<slug>/SKILL.md`（仅当传入 `skill`）。
 * 版本号派生复用 `parseStageId`（格式唯一权威，禁自写正则）。
 */
import { FlowManager, reviewStageOf } from '../flow-manager.js';
import { normalizeStageId, parseStageId } from '../plan/path.js';
import { existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { atomicWriteFileSync } from '../fs/atomic-write.js';
import { initKnowledgeBase, addKnowledgeEntry } from '../workspace/knowledge.js';
import type { RequirementData } from '../req/types.js';
import type { StageData } from '../flow-manager.js';
import { stageRequirementIds } from '../req/stage-links.js';   // 阶段↔需求关联读取单点（v1.5.8 / REQ-028）
import { detectHarnesses } from '../harness.js';

/**
 * 归档文件已存在错误（A1 数据安全保护）。
 * 在解析到阶段后、任何写盘之前抛出，保证拒绝路径零写盘。
 */
export class ArchiveExistsError extends Error {
  /** 用户输入的阶段名原值 */
  readonly stage: string;
  /** 本次命令的目标归档文件绝对路径 */
  readonly archivePath: string;

  constructor(stage: string, archivePath: string) {
    super(`归档文件已存在：${archivePath}`);
    this.name = 'ArchiveExistsError';
    this.stage = stage;
    this.archivePath = archivePath;
  }
}

/** skill slug 格式（小写字母/数字起，后续可含连字符；直接作目录名，禁路径分隔符） */
export const SKILL_SLUG_PATTERN = /^[a-z0-9][a-z0-9-]*$/;

/**
 * 非法 skill slug 错误（v1.5.8）。
 * 与 `ArchiveExistsError` 同样在**任何写盘之前**抛出，保证拒绝路径零写盘。
 */
export class InvalidSkillSlugError extends Error {
  /** 用户输入的原值 */
  readonly skill: string;

  constructor(skill: string) {
    super(`非法 skill slug：${skill}`);
    this.name = 'InvalidSkillSlugError';
    this.skill = skill;
  }
}

/** 归档生成物（路径均为相对项目根） */
export interface ArchiveGenerated {
  /** 发布说明草稿路径；未生成（版本无法派生 / 已存在且未 force）为 null */
  releaseNotes: string | null;
  /** 本次真实写入的 SKILL.md 路径（已存在且未 force 的跳过项不计入） */
  skills: string[];
  /** 汇总进归档摘要的已完成需求 ID */
  requirements: string[];
}

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
  /** v1.5.8 归档官生成物 */
  generated: ArchiveGenerated;
}

/** 归档选项 */
export interface ArchiveOptions {
  /** 显式覆盖已有归档文件 / 发布说明 / skill（仅绕过文件覆盖保护） */
  force?: boolean;
  /** 生成开发 skill 的 slug（`/^[a-z0-9][a-z0-9-]*$/`；非法抛 InvalidSkillSlugError） */
  skill?: string;
}

/** 表格单元格转义（标题可能含 `|` 或换行，避免破坏 Markdown 表） */
function escapeTableCell(value: string): string {
  return String(value ?? '').replace(/\|/g, '\\|').replace(/\r?\n/g, ' ');
}

/**
 * slug 标题化：`openfeel-archive` → `Openfeel Archive`（skill 标题默认值）。
 * slug 已由 SKILL_SLUG_PATTERN 限制为小写字母/数字/连字符。
 */
function titleizeSlug(slug: string): string {
  return slug
    .split('-')
    .filter((word) => word.length > 0)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

/**
 * 收集归档需要汇总的「已完成需求」。
 *
 * 口径（v1.5.8 / REQ-028 多值关联）：`status === 'done'` ∧ (`target_version === version` ∨ `id` ∈ 阶段关联需求集)；
 * 去重保序（版本命中在前，阶段关联命中按 `stageRequirementIds` 声明序并入）。
 *
 * @param requirements flow.json 顶层需求列表（可选字段，读侧宽容）
 * @param version 由阶段 ID 派生的版本号（无法派生时为 null：只保留阶段关联的 done 需求）
 * @param linkedIds 阶段 `stageRequirementIds(stage)`（无关联为空数组）
 */
function collectCompletedRequirements(
  requirements: RequirementData[] | undefined,
  version: string | null,
  linkedIds: readonly string[],
): RequirementData[] {
  const done = (Array.isArray(requirements) ? requirements : []).filter((req) => req?.status === 'done');
  const picked: RequirementData[] = [];
  const seen = new Set<string>();

  if (version !== null) {
    for (const req of done) {
      if (req.target_version === version) {
        picked.push(req);
        seen.add(req.id);
      }
    }
  }

  for (const linkedId of linkedIds) {
    const linked = done.find((req) => req.id === linkedId);
    if (linked && !seen.has(linked.id)) {
      picked.push(linked);
      seen.add(linked.id);
    }
  }

  return picked;
}

/** 归档摘要「已完成需求」表格（无则「无」） */
function renderCompletedRequirementsTable(requirements: RequirementData[]): string {
  if (requirements.length === 0) {
    return '无';
  }
  const rows = requirements.map((req) => {
    return `| ${escapeTableCell(req.id)} | ${escapeTableCell(req.title)} | ${req.priority ?? '-'} | ${req.updated_at ?? '-'} |`;
  });
  return [
    '| ID | 标题 | 优先级 | 更新时间 |',
    '|----|------|--------|----------|',
    ...rows,
  ].join('\n');
}

/**
 * 归档摘要「审查 / 验证」小节（v1.5.8 / REQ-027「完成必审验」）。
 * 逐需求列出 review（结果 / 审查者 / 是否独立）与 verification（种类 / 结果 / 验证者 / 说明 / 证据），
 * 并单行列阶段自身 verification。缺记录的项以 `-` / 「无」占位（不省略小节，便于审计对比）。
 */
function renderReviewVerificationSection(requirements: RequirementData[], stage: StageData): string {
  const noRows = '| (无) | - | - | - | - | - | - |';
  const rows = requirements.map((req) => {
    const review = req.review;
    const verification = req.verification;
    const cells = [
      escapeTableCell(req.id),
      review ? escapeTableCell(review.result) : '-',
      review ? escapeTableCell(`${review.by}${review.independent ? '' : '（self-review）'}`) : '-',
      verification ? escapeTableCell(verification.result) : '-',
      verification ? escapeTableCell(verification.kind) : '-',
      verification ? escapeTableCell(verification.by) : '-',
      verification
        ? escapeTableCell(`${verification.note}${verification.evidence ? `（证据：${verification.evidence}）` : ''}`)
        : '-',
    ];
    return `| ${cells.join(' | ')} |`;
  });
  const sv = stage.verification;
  const stageLine = sv
    ? `- 阶段验证：${escapeTableCell(sv.kind)} / ${escapeTableCell(sv.result)}（by ${escapeTableCell(sv.by)}，${escapeTableCell(sv.at)}）：${escapeTableCell(sv.note)}${
      sv.evidence ? `（证据：${escapeTableCell(sv.evidence)}）` : ''
    }`
    : '- 阶段验证：无';
  return `### 需求审查与验证

| ID | 审查 | 审查者 | 验证 | 种类 | 验证者 | 验证说明 |
|----|------|--------|------|------|--------|----------|
${rows.length > 0 ? rows.join('\n') : noRows}

### 阶段验证

${stageLine}`;
}

/** 发布说明中的需求列表（无则「无」） */
function renderRequirementList(requirements: RequirementData[]): string {  if (requirements.length === 0) {
    return '无';
  }
  return requirements
    .map((req) => `- **${req.id}** ${req.title}${req.priority ? `（${req.priority}）` : ''}`)
    .join('\n');
}

/** 生成 release notes 草稿正文（结构固定：标题 / 生成信息 / 已完成需求 / 变更摘要 / 升级与验证） */
function buildReleaseNotes(input: {
  version: string;
  stageName: string;
  archivedAt: string;
  requirements: RequirementData[];
  opsCount: number;
  reviewsCount: number;
}): string {
  const { version, stageName, archivedAt, requirements, opsCount, reviewsCount } = input;
  return `# ${version} 发布说明

- **生成时间**：${archivedAt}
- **来源阶段**：${stageName}
- **归档摘要**：\`.openfeel/log/archive-${stageName}.md\`

## 已完成需求

${renderRequirementList(requirements)}

## 变更摘要

- 操作产出 **${opsCount}** 项、审查记录 **${reviewsCount}** 条。
- 完整明细见 \`.openfeel/log/archive-${stageName}.md\`。

## 升级与验证

- **升级**：\`npm i -g openfeel@${version}\`（本地开发：\`pnpm build\` 后使用 \`openfeel\`）
- **验证**：\`openfeel flow status\` → \`npx tsc --noEmit\` → \`npx vitest run\`
`;
}

/** 生成 SKILL.md 正文（标题 / 生成来源 / 何时使用 / 步骤 / 参考） */
function buildSkillContent(input: {
  title: string;
  version: string | null;
  archivedAt: string;
  stageName: string;
  requirements: RequirementData[];
  knowledgeExtracts: string[];
  releaseNotesRel: string | null;
}): string {
  const { title, version, archivedAt, stageName, requirements, knowledgeExtracts, releaseNotesRel } = input;

  const whenLines: string[] = [];
  if (requirements.length > 0) {
    whenLines.push(`- 处理与阶段 \`${stageName}\` 已完成需求相近的任务：`);
    for (const req of requirements) {
      whenLines.push(`  - ${req.id} ${req.title}`);
    }
  }
  if (knowledgeExtracts.length > 0) {
    whenLines.push('- 归档沉淀的知识条目：');
    for (const entry of knowledgeExtracts) {
      whenLines.push(`  - ${entry}`);
    }
  }
  if (whenLines.length === 0) {
    whenLines.push('- 本阶段未记录已完成需求或知识条目；仍可参考归档摘要复现同类流程。');
  }

  const releaseRef = releaseNotesRel ? `\`${releaseNotesRel}\`` : '（本阶段未生成发布说明）';

  return `# ${title}

> 由 OpenFeel 归档生成（${version ?? '版本未识别'} · ${archivedAt.slice(0, 10)}）

## 何时使用

${whenLines.join('\n')}

## 步骤

1. 阅读归档摘要 \`.openfeel/log/archive-${stageName}.md\`，确认操作产出与审查结论。
2. 对照发布说明 ${releaseRef}，确认已完成需求与升级提示。
3. 按需检索知识库 \`.openfeel/kb/\`，复用既有模式与结论。
4. 改动完成后运行 \`npx tsc --noEmit\` 与 \`npx vitest run\` 验证。

## 参考

- 归档摘要：\`.openfeel/log/archive-${stageName}.md\`
- 发布说明：${releaseRef}
`;
}

/**
 * 归档指定阶段
 * 汇总阶段产出、生成 Markdown 摘要、提取知识条目并写入归档文件；
 * v1.5.8 起同时生成发布说明草稿，并在传入 `skill` 时按 harness 生成 SKILL.md。
 * @param projectPath 项目路径
 * @param stageName 阶段名称（如 stage-06）
 * @param options.force 显式覆盖已有归档文件 / 发布说明 / skill（仅绕过文件覆盖保护）
 * @param options.skill 生成开发 skill 的 slug（非法抛 InvalidSkillSlugError）
 * @returns ArchiveResult，若 flow.json 未加载或阶段不存在则返回 null
 * @throws ArchiveExistsError 目标归档文件已存在且未显式 force（零写盘）
 * @throws InvalidSkillSlugError skill slug 非法（零写盘）
 */
export function archiveStage(
  projectPath: string,
  stageName: string,
  options?: ArchiveOptions,
): ArchiveResult | null {
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
  // REV-009：短名归一化 + 双键回退（openfeel archive <stage> 的 help 示例为短名）
  const key = normalizeStageId(stageName) ?? stageName;
  const stage = data.stages[key] ?? data.stages[stageName];
  if (!stage) {
    return null;
  }

  // v1.5.8：skill slug 校验位于任何写盘之前（非法 → 零写盘拒绝）
  const skillSlug = options?.skill;
  if (skillSlug !== undefined && !SKILL_SLUG_PATTERN.test(skillSlug)) {
    throw new InvalidSkillSlugError(skillSlug);
  }

  // A1 数据安全：目标文件存在性检查必须位于任何写盘（mkdir / 归档文件 / flow.json / KB）之前。
  // 保护为归档文件级：目标文件名由本次输入原值派生，别名（短名/全名）派生不同文件、互不触发。
  const force = options?.force === true;
  const logDir = join(projectPath, '.openfeel', 'log');
  const archivePath = join(logDir, `archive-${stageName}.md`);
  if (existsSync(archivePath) && !force) {
    throw new ArchiveExistsError(stageName, archivePath);
  }

  // 版本派生（v1.5.8）：parseStageId 是 stageId 格式的唯一权威；剥离 `-{stageDir}` 后缀得版本段。
  // 无法解析的阶段名（存量脏数据）→ version = null，跳过发布说明生成，但仍归档。
  const parsed = parseStageId(stageName);
  const version = parsed
    ? parsed.fullStageId.slice(0, -(parsed.stageDir.length + 1))
    : null;

  // 已完成需求汇总（版本命中 ∪ 阶段关联需求命中的 done 需求；v1.5.8 / REQ-028 多值逐条并入）
  const linkedRequirementIds = stageRequirementIds(stage);
  const completedRequirements = collectCompletedRequirements(
    data.requirements,
    version,
    linkedRequirementIds,
  );

  // 统计该阶段所有 ops
  const ops = Object.values(stage.ops);
  const opsCount = ops.length;

  // 收集该阶段相关审查条目：op 级格式 "stageName.opXxx"；stage 级（v1.3.3）op 即 stageId。
  // 归属解析统一走 reviewStageOf 单点（显式 stage 字段 > stage 级 op > op 前缀），避免 lastIndexOf 误切含点 stageId。
  const relatedReviews = data.reviews.filter((r) => {
    const reviewStage = reviewStageOf(r);
    if (!reviewStage) {
      return false;
    }
    return reviewStage === key
      || reviewStage === stageName
      || (normalizeStageId(reviewStage) ?? reviewStage) === key;
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

  // 归档时间（发布说明 / skill 生成时间同源，保证三份产物时间一致）
  const archivedAt = new Date().toISOString();

  // 生成 Markdown 格式归档摘要
  const summary = `# 归档摘要 — ${stageName}

- **归档时间**：${archivedAt}
- **阶段名称**：${stageName}
- **版本**：${version ?? '（未识别）'}
- **阶段状态**：${stage.status}
- **依赖阶段**：${Array.isArray(stage.deps) && stage.deps.length > 0 ? stage.deps.join(', ') : '无'}
- **关联需求**：${linkedRequirementIds.length > 0 ? linkedRequirementIds.join(', ') : '无'}

## 已完成需求

${renderCompletedRequirementsTable(completedRequirements)}

## 审查 / 验证

${renderReviewVerificationSection(completedRequirements, stage)}

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

  // 确保 .openfeel/log/ 目录存在（仅在通过覆盖保护后才会执行）
  if (!existsSync(logDir)) {
    mkdirSync(logDir, { recursive: true });
  }

  // 写入归档摘要文件（每阶段唯一，不加锁；flow 同步走 mgr.save()）
  atomicWriteFileSync(archivePath, summary);

  // ── 生成物 1：发布说明草稿 docs/releases/<version>.md（已存在不覆盖，force 时覆盖） ──
  let generatedReleaseNotes: string | null = null;
  const releaseNotesRel = version ? join('docs', 'releases', `${version}.md`) : null;
  if (version && releaseNotesRel) {
    const releaseNotesAbs = join(projectPath, releaseNotesRel);
    if (force || !existsSync(releaseNotesAbs)) {
      atomicWriteFileSync(releaseNotesAbs, buildReleaseNotes({
        version,
        stageName,
        archivedAt,
        requirements: completedRequirements,
        opsCount,
        reviewsCount,
      }));
      generatedReleaseNotes = releaseNotesRel;
    }
  }

  // ── 生成物 2：开发 skill（仅当传入 skill；对每个探测到的 harness 各写一份） ──
  // 已存在同名 SKILL.md 不覆盖（与发布说明同语义；--force 时才覆盖）。
  const generatedSkills: string[] = [];
  if (skillSlug) {
    const content = buildSkillContent({
      title: titleizeSlug(skillSlug),
      version,
      archivedAt,
      stageName,
      requirements: completedRequirements,
      knowledgeExtracts,
      releaseNotesRel,
    });
    for (const harness of detectHarnesses(projectPath)) {
      const skillRel = join(harness.skillDir, skillSlug, 'SKILL.md');
      const skillAbs = join(projectPath, skillRel);
      if (!force && existsSync(skillAbs)) {
        continue;
      }
      atomicWriteFileSync(skillAbs, content);
      generatedSkills.push(skillRel);
    }
  }

  // 追加归档日志到 flow.json
  mgr.appendLog({
    time: '',
    agent: 'openfeel-archiver',
    action: 'archive_stage',
    detail: {
      stageName,
      opsCount,
      reviewsCount,
      knowledgeCount: knowledgeExtracts.length,
      archivePath,
      requirementsCount: completedRequirements.length,
      releaseNotes: generatedReleaseNotes,
      skillsCount: generatedSkills.length,
    },
  });

  // 持久化
  mgr.save();

  // 自动同步知识库：将提取的知识条目写入 kb/
  if (knowledgeExtracts.length > 0) {
    initKnowledgeBase(projectPath);
    for (const entry of knowledgeExtracts) {
      // 知识提取格式为 "[REV-XXX] 标题"，默认归入 patterns 分类
      addKnowledgeEntry(projectPath, 'patterns', entry, `归档自阶段 ${stageName}`);
    }
  }

  return {
    summary,
    opsCount,
    reviewsCount,
    knowledgeExtracts,
    generated: {
      releaseNotes: generatedReleaseNotes,
      skills: generatedSkills,
      requirements: completedRequirements.map((req) => req.id),
    },
  };
}
