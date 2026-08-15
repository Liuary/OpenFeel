/**
 * 工作阶段管理
 * 负责 .openfeel/plan/{series}/ 下的阶段目录创建与列取
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { FlowManager } from '../flow-manager.js';
import { parseStageId } from './path.js';

/** 工作阶段 */
export interface Stage {
  /** 阶段名，如 stage-01 */
  name: string;
  /** 相对路径 .openfeel/plan/v1/stage-01/ */
  path: string;
  /** overview.md 内容 */
  overview: string;
}

/**
 * 添加工作阶段
 * 在 .openfeel/plan/{series}/ 下创建 {stage}/ 目录，包含 overview.md 和 status.md 骨架
 * @param deps 依赖的阶段名列表（可选，写入 overview.md）
 */
export function addStage(projectPath: string, name: string, deps?: string[]): void {
  // 解析 stageId（短名/完整），无法解析时抛错
  const parsed = parseStageId(name);
  if (!parsed) {
    throw new Error(`非法阶段名: ${name}（应为 stage-NN 或 vX.Y.Z.W-stage-NN）`);
  }

  const stageDir = resolve(projectPath, '.openfeel', 'plan', parsed.series, parsed.stageDir);

  // 确保阶段目录存在
  if (!existsSync(stageDir)) {
    mkdirSync(stageDir, { recursive: true });
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
    writeFileSync(overviewPath, overviewContent, 'utf-8');
  }

  // 创建 status.md（若不存在）— 标题用完整 stageId
  const statusPath = join(stageDir, 'status.md');
  if (!existsSync(statusPath)) {
    const statusContent = `# ${parsed.fullStageId} 状态

- **执行模式**：manual
- **自动推进**：disabled
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

> 待补充

## 阻塞 / 暂停原因

无

## 状态记录

| 时间 | Agent | 状态变化 | 说明 |
|------|-------|----------|------|
| ${new Date().toISOString().replace('T', ' ').substring(0, 16)} | user | planned | 阶段已创建 |
`;
    writeFileSync(statusPath, statusContent, 'utf-8');
  }

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
