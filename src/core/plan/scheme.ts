/**
 * 操作方案管理（Schemer 产出层）
 * 负责 .openfeel/plan/{series}/{stage}/ops/ 下的操作方案文件 CRUD
 * 创建后自动同步到 flow.json 的 stages/{stage}.ops 中
 */
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { FlowManager, type PipelinePhase } from '../flow-manager.js';
import { parseStageId } from './path.js';

/** 操作方案 */
export interface Scheme {
  /** 如 op-001 */
  opId: string;
  /** 所属阶段名 */
  stage: string;
  /** 方案标题 */
  title: string;
  /** Markdown 全文 */
  content: string;
  /** 相对路径 .openfeel/plan/{series}/{stage}/ops/op-001_{title}.md */
  filePath: string;
}

/**
 * 生成操作方案的固定 Markdown 模板
 */
function generateSchemeTemplate(opId: string, stageName: string, title: string): string {
  return `# ${opId}：${title}

- **阶段**：${stageName}
- **状态**：pending
- **前置**：无
- **负责 Agent**：Executor
- **最多重试**：3

## 目标
${title}

## 实施步骤
- [ ] 待补充

## 产出文件
- 待补充

## 自测清单
- [ ] 待补充

## 修正记录
| 次数 | 时间 | 问题 | 修正内容 |
|------|------|------|----------|
`;
}

/**
 * 从文件名中提取 opId
 * 文件名格式：op-NNN_{title}.md
 */
function extractOpId(fileName: string): string | null {
  const match = fileName.match(/^(op-\d+)/);
  return match ? match[1] : null;
}

/**
 * 从文件名中提取标题
 * 文件名格式：op-NNN_{title}.md
 */
function extractTitle(fileName: string): string {
  // 去掉 op-NNN_ 前缀和 .md 后缀
  const noPrefix = fileName.replace(/^op-\d+_?/, '');
  return noPrefix.replace(/\.md$/, '').replace(/_/g, ' ');
}

/**
 * 计算下一个 opId（基于已有方案中的最大编号 +1）
 */
function getNextOpId(opsDir: string): string {
  if (!existsSync(opsDir)) {
    return 'op-001';
  }

  const files = readdirSync(opsDir).filter((f) => f.endsWith('.md'));
  let maxNum = 0;

  for (const file of files) {
    const match = file.match(/^op-(\d+)/);
    if (match) {
      const num = parseInt(match[1], 10);
      if (num > maxNum) {
        maxNum = num;
      }
    }
  }

  return `op-${String(maxNum + 1).padStart(3, '0')}`;
}

/**
 * 同步方案到 flow.json
 * 若 flow.json 不存在或对应 stage 不存在，跳过同步（不报错）
 * @param stageName 完整 stageId（如 v1.0.0-stage-01，调用方已规范化）
 */
function syncToFlowJson(
  projectPath: string,
  stageName: string,
  opId: string,
  title: string,
): void {
  const flowJsonPath = resolve(projectPath, '.openfeel', 'flow.json');
  if (!existsSync(flowJsonPath)) {
    return;
  }

  try {
    const flowMgr = new FlowManager(projectPath);
    const flowData = flowMgr.getData();
    if (!flowData) {
      return;
    }

    // 检查 stage 是否存在
    // 若 stage 未在 flow.json 中注册，自动注册
    if (!flowData.stages[stageName]) {
      flowData.stages[stageName] = {
        name: stageName,
        phase: 'plan_pending' as PipelinePhase,
        status: 'planned',
        deps: [],
        ops: {},
      };
    }

    // 将 op 注册到 stages.{stageName}.ops 中
    flowData.stages[stageName].ops[opId] = {
      id: opId,
      title,
      state: 'pending',
      assignee: 'Executor',
      attempts: 0,
      max_attempts: 3,
      checkpoints: {
        plan: 'pending',
        scheme: 'pending',
        exec: { attempts: 0, self: 'pending' },
        review: 'pending',
        test: 'pending',
      },
    };

    flowMgr.save();
  } catch {
    // 同步失败不阻塞方案创建（静默忽略）
  }
}

/**
 * 创建操作方案
 * 在 .openfeel/plan/{series}/{stage}/ops/ 下创建 op-NNN_{title}.md
 * NNN 自动递增（从该阶段的已有方案中计算）
 * 必须按固定模板生成，包含：目标、实施步骤（checkbox）、产出文件、自测清单、修正记录
 * 创建后自动同步到 flow.json（如果存在）
 * @param stageName 阶段名（短名 stage-01 或完整 v1.0.0-stage-01 均可）
 * @returns opId（如 op-001）
 */
export function createScheme(projectPath: string, stageName: string, title: string): string {
  // 解析 stageId（短名/完整）得到 series + stageDir + 完整 ID
  const parsed = parseStageId(stageName);
  if (!parsed) {
    throw new Error(`非法阶段名: ${stageName}（应为 stage-NN 或 vX.Y.Z.W-stage-NN）`);
  }

  // 1. 确保 .openfeel/plan/{series}/{stageDir}/ops/ 目录存在
  const opsDir = resolve(projectPath, '.openfeel', 'plan', parsed.series, parsed.stageDir, 'ops');
  if (!existsSync(opsDir)) {
    mkdirSync(opsDir, { recursive: true });
  }

  // 2. 计算下一个 opId
  const opId = getNextOpId(opsDir);

  // 3. 生成模板内容并写入文件
  // 文件名中空格用下划线替换
  const safeTitle = title.replace(/\s+/g, '_');
  const fileName = `${opId}_${safeTitle}.md`;
  const filePath = join(opsDir, fileName);

  const content = generateSchemeTemplate(opId, parsed.fullStageId, title);
  writeFileSync(filePath, content, 'utf-8');

  // 4. 同步到 flow.json（键用完整 stageId）
  syncToFlowJson(projectPath, parsed.fullStageId, opId, title);

  // 5. 返回 opId
  return opId;
}

/**
 * 读取操作方案
 * @param opId 操作ID（如 op-001）或完整 opId（如 stage-01.op-001 / v1.0.0-stage-01.op-001）
 * @returns Scheme 或 null
 */
export function getScheme(projectPath: string, opId: string): Scheme | null {
  let targetStage: string | null = null;
  let targetOpId: string;

  // 解析 opId：'{stage}.{op-XXX}' 或纯 '{op-XXX}'
  // 用正则锚定尾部 .op-NNN，避免完整 stageId 版本号中的点号干扰
  const match = opId.match(/^(.+)\.(op-\d+)$/);
  if (match) {
    targetStage = match[1];
    targetOpId = match[2];
  } else {
    targetStage = null;
    targetOpId = opId;
  }

  // 若指定阶段，解析出 stageDir 后遍历查找
  let targetStageDir: string | null = null;
  if (targetStage) {
    const parsed = parseStageId(targetStage);
    if (!parsed) {
      return null; // 阶段名非法
    }
    targetStageDir = parsed.stageDir;
  }

  for (const scheme of listSchemes(projectPath, targetStageDir ?? undefined)) {
    if (scheme.opId === targetOpId) {
      return scheme;
    }
  }
  return null;
}

/**
 * 列出操作方案
 * @param stageName 可选，不传则列出所有阶段的方案
 */
export function listSchemes(projectPath: string, stageName?: string): Scheme[] {
  const planDir = resolve(projectPath, '.openfeel', 'plan');
  const result: Scheme[] = [];

  if (!existsSync(planDir)) {
    return result;
  }

  // 解析目标 stageDir（若指定阶段过滤）
  let targetStageDir: string | null = null;
  if (stageName) {
    const parsed = parseStageId(stageName);
    if (!parsed) {
      return result; // 阶段名非法时返回空
    }
    targetStageDir = parsed.stageDir;
  }

  // 遍历 plan/{series}/stage-NN/ 两层目录
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
      continue;
    }

    for (const stageEntry of stageEntries) {
      if (!stageEntry.isDirectory()) {
        continue;
      }
      if (targetStageDir && stageEntry.name !== targetStageDir) {
        continue;
      }

      const opsDir = join(seriesDir, stageEntry.name, 'ops');
      if (!existsSync(opsDir)) {
        continue;
      }

      const opFiles = readdirSync(opsDir).filter((f) => f.endsWith('.md'));
      for (const fileName of opFiles) {
        const opId = extractOpId(fileName);
        if (!opId) {
          continue;
        }

        const filePath = join(opsDir, fileName);
        const content = readFileSync(filePath, 'utf-8');

        result.push({
          opId,
          stage: stageEntry.name,
          title: extractTitle(fileName),
          content,
          filePath: `.openfeel/plan/${seriesEntry.name}/${stageEntry.name}/ops/${fileName}`,
        });
      }
    }
  }

  // 按阶段名 + opId 排序
  result.sort((a, b) => {
    const cmp = a.stage.localeCompare(b.stage);
    if (cmp !== 0) {
      return cmp;
    }
    return a.opId.localeCompare(b.opId);
  });

  return result;
}
