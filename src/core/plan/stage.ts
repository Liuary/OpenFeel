/**
 * 工作阶段管理
 * 负责 .openfeel/plan/{series}/ 下的阶段目录创建与列取
 */
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { FlowManager } from '../flow-manager.js';
import { parseStageId, findStageStatusPath } from './path.js';
import { atomicWriteFileSync } from '../fs/atomic-write.js';
import { resolveConfigDefaults } from '../config.js';

/** 工作阶段 */
export interface Stage {
  /** 阶段名，如 stage-01 */
  name: string;
  /** 相对路径 .openfeel/plan/v1/stage-01/ */
  path: string;
  /** overview.md 内容 */
  overview: string;
}

/** 阶段骨架初值显式覆盖（`plan stage add` 透传；缺省时取 config 默认） */
export interface StageSkeletonOverrides {
  /** 执行模式覆盖值 */
  executionMode?: 'manual' | 'auto';
  /** 自动推进覆盖值 */
  autoAdvance?: 'disabled' | 'enabled';
}

/** 折叠任务描述：去除首尾空白，内部换行折叠为空格（防结构破坏） */
export function sanitizeTaskDesc(desc: string): string {
  return desc.replace(/\s*[\r\n]+\s*/g, ' ').trim();
}

/**
 * 构建任务行块（`- [ ] 任务N：desc`，编号从 1 连续）。
 * 供 `plan stage add --tasks`（初始化）与 `stage task --add`（追加）共用，保证两路径格式逐字节一致。
 * @param tasks 任务描述列表
 * @returns 多行任务块（\n 分隔，无尾换行）
 */
export function buildTaskLines(tasks: string[]): string {
  return tasks.map((d, i) => `- [ ] 任务${i + 1}：${sanitizeTaskDesc(d)}`).join('\n');
}

/**
 * 向 status.md 的「## 当前任务」小节追加一条任务行（编号 = 既有任务行最大编号 + 1，保证连续性）。
 * @param projectPath 项目根路径
 * @param stageId 阶段 ID
 * @param desc 任务描述
 * @returns 新任务的编号
 * @throws Error 阶段 status.md 不存在（STATUS_NOT_FOUND）或缺少「## 当前任务」小节（TASK_SECTION_MISSING）
 */
export function appendStatusTask(projectPath: string, stageId: string, desc: string): number {
  const statusPath = findStageStatusPath(projectPath, stageId);
  if (!statusPath) {
    throw new Error('STATUS_NOT_FOUND');
  }
  const content = readFileSync(statusPath, 'utf-8');
  const headerMatch = content.match(/^##\s*当前任务\s*$/m);
  if (!headerMatch || headerMatch.index === undefined) {
    throw new Error('TASK_SECTION_MISSING');
  }

  // 既有任务最大编号（避免删除后重号）
  let max = 0;
  const taskRegex = /^-\s*\[[ x]\]\s*任务(\d+)[：:]/gm;
  let tm: RegExpExecArray | null;
  while ((tm = taskRegex.exec(content)) !== null) {
    max = Math.max(max, parseInt(tm[1], 10));
  }
  const no = max + 1;
  const newLine = `- [ ] 任务${no}：${sanitizeTaskDesc(desc)}`;

  // 定位小节内容边界（下一个 `\n## ` 或文末）
  const headerEnd = headerMatch.index + headerMatch[0].length;
  const rest = content.slice(headerEnd);
  const nextSection = rest.search(/\n##\s/);
  const bodyEnd = nextSection === -1 ? content.length : headerEnd + nextSection;

  // 清理空行与占位行 `> 待补充`，再追加新任务行
  const body = content
    .slice(headerEnd, bodyEnd)
    .split('\n')
    .map((l) => l.trimEnd())
    .filter((l) => l.trim() !== '' && l.trim() !== '> 待补充');
  body.push(newLine);

  const updated = content.slice(0, headerEnd) + '\n' + body.join('\n') + '\n' + content.slice(bodyEnd);
  atomicWriteFileSync(statusPath, updated);
  return no;
}

/**
 * 确保阶段目录与 overview.md / status.md 骨架存在（幂等：已存在不覆盖）。
 * 从 addStage 抽出，供 addStage 与 plan scheme create 的隐式注册共用（单一实现，避免双份骨架文本）。
 * @param projectPath 项目根路径
 * @param name 阶段 ID（简写或全称）
 * @param deps 依赖阶段 ID 列表（仅用于新建 overview.md 时写入「依赖」段）
 * @param tasks 初始任务列表（仅用于新建 status.md 时生成任务行；缺省写占位 `> 待补充`）
 * @param overrides 骨架初值显式覆盖（执行模式/自动推进；缺省取 config defaults）
 * @returns 是否发生了创建（true = 补建了目录或骨架文件）
 */
export function ensureStageSkeleton(projectPath: string, name: string, deps?: string[], tasks?: string[], overrides?: StageSkeletonOverrides): boolean {
  // 解析 stageId（短名/完整），无法解析时抛错
  const parsed = parseStageId(name);
  if (!parsed) {
    throw new Error(`非法阶段名: ${name}（应为 stage-NN 或 vX.Y.Z.W-stage-NN）`);
  }

  const stageDir = resolve(projectPath, '.openfeel', 'plan', parsed.series, parsed.stageDir);
  let created = false;

  // 确保阶段目录存在
  if (!existsSync(stageDir)) {
    mkdirSync(stageDir, { recursive: true });
    created = true;
  }

  // 若目录已存在，不覆盖已有文件，只创建缺失的

  // 创建 overview.md（若不存在）— 标题用完整 stageId
  const overviewPath = join(stageDir, 'overview.md');
  if (!existsSync(overviewPath)) {
    const depsText = deps && deps.length > 0 ? deps.map((d) => `- ${d}`).join('\n') : '无';
    const overviewContent = `# ${parsed.fullStageId}

## 目标

> 待补充

## 依赖

${depsText}

## 操作方案

> 待补充
`;
    atomicWriteFileSync(overviewPath, overviewContent);
    created = true;
  }

  // 创建 status.md（若不存在）— 标题用完整 stageId
  const statusPath = join(stageDir, 'status.md');
  if (!existsSync(statusPath)) {
    // N6-2：有初始任务时生成任务行（与 stage task --add 共用 buildTaskLines）；否则占位 `> 待补充`
    const tasksBlock = tasks && tasks.length > 0 ? buildTaskLines(tasks) : '> 待补充';
    // 初值取 config defaults（不读 status.md / 不做 effective 合并）；overrides 显式优先
    const configDefaults = resolveConfigDefaults(projectPath);
    const executionMode = overrides?.executionMode ?? configDefaults.execution_mode;
    const autoAdvance = overrides?.autoAdvance ?? configDefaults.auto_advance;
    const statusContent = `# ${parsed.fullStageId} 状态

- **执行模式**：${executionMode}
- **自动推进**：${autoAdvance}
- **状态**：planned
- **当前责任 Agent**：user
- **上一责任 Agent**：none
- **更新时间**：${new Date().toISOString().replace('T', ' ').substring(0, 16)}

## Worktree / Session

- **工作模式**：manual
- **分支名**：-
- **Session 名称**：-
- **合并状态**：not_started
- **清理策略**：manual

## 当前任务

${tasksBlock}

## 阻塞 / 暂停原因

无

## 状态记录

| 时间 | Agent | 状态变化 | 说明 |
|------|-------|----------|------|
| ${new Date().toISOString().replace('T', ' ').substring(0, 16)} | user | planned | 阶段已创建 |
`;
    atomicWriteFileSync(statusPath, statusContent);
    created = true;
  }

  return created;
}

/**
 * 添加工作阶段
 * 在 .openfeel/plan/{series}/ 下创建 {stage}/ 目录，包含 overview.md 和 status.md 骨架，
 * 并注册到 flow.json（键用完整 stageId）。
 * 骨架生成复用 ensureStageSkeleton（保持行为与文案一致）。
 * @param deps 依赖的阶段名列表（可选，写入 overview.md 与 flow.json）
 * @param tasks 初始任务列表（可选，写入 status.md 的「## 当前任务」小节）
 * @param overrides 骨架初值显式覆盖（可选，透传 ensureStageSkeleton）
 */
export function addStage(projectPath: string, name: string, deps?: string[], tasks?: string[], overrides?: StageSkeletonOverrides): void {
  // 解析 stageId（短名/完整），无法解析时抛错
  const parsed = parseStageId(name);
  if (!parsed) {
    throw new Error(`非法阶段名: ${name}（应为 stage-NN 或 vX.Y.Z.W-stage-NN）`);
  }

  // 目录 + overview.md + status.md 骨架（幂等）
  ensureStageSkeleton(projectPath, name, deps, tasks, overrides);

  // 同步到 flow.json（若存在）— 键用完整 stageId
  const flowMgr = new FlowManager(projectPath);
  if (flowMgr.isLoaded()) {
    flowMgr.registerStage(parsed.fullStageId, deps ?? []);
    flowMgr.save();
  }
}

/**
 * 列出所有工作阶段
 */
export function listStages(projectPath: string): Stage[] {
  const planDir = resolve(projectPath, '.openfeel', 'plan');

  // 目录不存在时返回空列表
  if (!existsSync(planDir)) {
    return [];
  }

  const result: Stage[] = [];

  // 遍历 plan/{series}/ 下的 series 目录，再遍历其下 stage-NN 目录
  const seriesEntries = readdirSync(planDir, { withFileTypes: true });
  for (const seriesEntry of seriesEntries) {
    if (!seriesEntry.isDirectory()) {
      continue;
    }
    const seriesDir = join(planDir, seriesEntry.name);

    let stageEntries: import('node:fs').Dirent[];
    try {
      stageEntries = readdirSync(seriesDir, { withFileTypes: true });
    } catch {
      continue; // series 目录不可读时跳过
    }

    for (const stageEntry of stageEntries) {
      if (!stageEntry.isDirectory()) {
        continue;
      }

      const stageDirPath = join(seriesDir, stageEntry.name);
      const overviewPath = join(stageDirPath, 'overview.md');

      let overview = '';
      if (existsSync(overviewPath)) {
        overview = readFileSync(overviewPath, 'utf-8');
      }

      result.push({
        name: stageEntry.name,
        path: `.openfeel/plan/${seriesEntry.name}/${stageEntry.name}/`,
        overview,
      });
    }
  }

  // 按名称排序
  result.sort((a, b) => a.name.localeCompare(b.name));

  return result;
}
