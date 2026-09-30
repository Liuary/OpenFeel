/**
 * 操作方案管理（openfeel-schemer 产出层）
 * 负责 .openfeel/plan/{series}/{stage}/ops/ 下的操作方案文件 CRUD
 * 创建后自动同步到 flow.json 的 stages/{stage}.ops 中
 */
import { existsSync, mkdirSync, readFileSync, readdirSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { FlowManager, isFlowConcurrentError, type PipelinePhase, type Op } from '../flow-manager.js';
import { parseStageId, validateStageId, findStageDirConflict, normalizeStageId } from './path.js';
import { ensureStageSkeleton } from './stage.js';
import { t, getCliLang } from '../i18n.js';
import { atomicWriteFileSync } from '../fs/atomic-write.js';
import { withFileLock, projectLockPath } from '../fs/file-lock.js';
import { reserveSequence } from '../fs/sequence.js';

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
- **负责 Agent**：openfeel-executor
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
 * 文件名格式：op-NNN.md（新）或 op-NNN_{title}.md（历史）
 */
function extractOpId(fileName: string): string | null {
  const match = fileName.match(/^(op-\d+)/);
  return match ? match[1] : null;
}

/**
 * 读取 op 标题（兼容两种命名，N8-2）。
 * - 历史命名 `op-NNN_{title}.md`：沿用文件名解析（原行为，零变化）
 * - 新命名 `op-NNN.md`：读文件内容首个 `# op-NNN：{title}` 行（标题权威来源）
 * IO 失败 / 无标题行 → 回退文件名（去 `.md`），不抛错（列表命令需健壮）。
 * @param filePath op 文件的绝对路径
 * @param fileName 文件名（历史命名解析与回退用）
 */
function extractTitle(filePath: string, fileName: string): string {
  // ① 历史命名：op-NNN_标题.md → 文件名解析（原行为）
  const legacy = fileName.match(/^op-\d+_(.+)\.md$/);
  if (legacy) {
    return legacy[1].replace(/_/g, ' ');
  }
  // ② 新命名 op-NNN.md：读内容首行标题（模板首行为 `# {opId}：{title}`）
  try {
    const content = readFileSync(filePath, 'utf-8');
    const m = content.match(/^#\s*op-\d+[：:]\s*(.+)$/m);
    if (m) {
      return m[1].trim();
    }
  } catch {
    // IO 失败静默回退文件名（列表命令不应因单个坏文件中断）
  }
  // ③ 回退：文件名去扩展（op-NNN）
  return fileName.replace(/\.md$/, '');
}

/** 序号 → opId（3 位补零） */
function opIdOf(seq: number): string {
  return `op-${String(seq).padStart(3, '0')}`;
}

/**
 * 同步方案到 flow.json
 * 若 flow.json 不存在或对应 stage 不存在，跳过同步（不报错）
 * @param stageName 完整 stageId（如 v1.0.0-stage-01，调用方已规范化）
 */
/** 隐式注册回调信息（N3-2） */
export interface ImplicitRegisterInfo {
  /** 被隐式注册的阶段（完整 stageId） */
  stage: string;
  /** 是否补建了阶段骨架（overview.md / status.md） */
  skeletonCreated: boolean;
}

function syncToFlowJson(
  projectPath: string,
  stageName: string,
  opId: string,
  title: string,
  onImplicitRegister?: (info: ImplicitRegisterInfo) => void,
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
      // 兜底自动注册前先校验：非法 stageId / (series, stageDir) 冲突
      // （补齐 stage-41 op-002 的绕过缺口，REV-v1.1.2-stage-41 REV-003）
      const v = validateStageId(stageName);
      if (!v.ok) {
        // 不静默吞错（外层 try/catch 会吞非并发错误）：显式告警并跳过自动注册
        console.warn(`[WARN] ${v.reason}；已跳过 flow.json 自动注册（op 文件已创建）。`);
        return;
      }
      const conflict = findStageDirConflict(projectPath, stageName);
      if (conflict) {
        // 命中既有不同 stageId 映射同一目录：告警并跳过自动注册，避免写入脏键
        console.warn(
          `[WARN] 阶段 '${stageName}' 与 '${conflict}' 映射同一 (series, stageDir)；` +
          `已跳过 flow.json 自动注册（op 文件已创建），请检查 stageId。`,
        );
        return;
      }
      flowData.stages[stageName] = {
        name: stageName,
        phase: 'plan_pending' as PipelinePhase,
        status: 'planned',
        deps: [],
        ops: {},
      };

      // N3-1：隐式注册时按注册语义补齐阶段骨架（复用 ensureStageSkeleton，幂等）
      // 注意：此处位于「非法 stageId / (series,stageDir) 冲突 → 跳过注册」分支之后，
      // 跳过分支已 return，故不会为其建骨架（与跳过语义一致）。
      let skeletonCreated = false;
      try {
        skeletonCreated = ensureStageSkeleton(projectPath, stageName);
      } catch (err) {
        // 骨架创建失败（权限/IO）：告警但不中止（op 文件与 flow.json 条目已写）
        console.warn(
          t('plan.scheme.skeletonWarnTmpl', getCliLang(projectPath), {
            err: err instanceof Error ? err.message : String(err),
          }),
        );
      }
      onImplicitRegister?.({ stage: stageName, skeletonCreated });
    }

    // 将 op 注册到 stages.{stageName}.ops 中
    flowData.stages[stageName].ops[opId] = {
      id: opId,
      title,
      state: 'pending',
      assignee: 'openfeel-executor',
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

    // 审计日志（P7）：op 注册成功，记录 register_op（agent=cli）
    flowMgr.appendLog({ time: '', agent: 'cli', action: 'register_op', detail: { stageName, opId } });

    flowMgr.save();
  } catch (err) {
    // 并发冲突：op 文件已创建，但 flow.json 注册失败；不静默吞错，告警并提示兜底
    if (isFlowConcurrentError(err)) {
      console.warn(
        `[WARN] op ${opId} 已创建，但 flow.json 同步因并发冲突失败；` +
        `请执行 openfeel flow repair 兜底或重新注册该 op。`,
      );
      return;
    }
    // 其它同步失败不阻塞方案创建（既有语义：静默忽略）
  }
}

/**
 * 创建操作方案
 * 在 .openfeel/plan/{series}/{stage}/ops/ 下创建 op-NNN_{title}.md
 * NNN 自动递增（从该阶段的已有方案中计算）
 * 必须按固定模板生成，包含：目标、实施步骤（checkbox）、产出文件、自测清单、修正记录
 * 创建后自动同步到 flow.json（如果存在）；阶段未注册时按注册语义补齐阶段骨架（N3）
 * @param stageName 阶段名（短名 stage-01 或完整 v1.0.0-stage-01 均可）
 * @param options.onImplicitRegister 隐式注册回调（阶段未注册时触发，供命令层输出提示）
 * @returns opId（如 op-001）
 */
export function createScheme(
  projectPath: string,
  stageName: string,
  title: string,
  options?: { onImplicitRegister?: (info: ImplicitRegisterInfo) => void },
): string {
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

  // 2. 锁内：原子占号 + 原子写 op 文件（临界区仅含占号与写文件，不含 flow 同步）
  //
  // 命名约定（N8-1 / A5）：新建 op 固定 `op-NNN.md`——**标题不再参与命名**（写入文件内容首行
  // `# op-NNN：{title}`，模板已含），彻底规避标题含 `/` 等路径字符导致的 ENOENT 创建失败。
  // 历史 `op-NNN_{title}.md` 不迁移、不改名；读取端 extractTitle 兼容回退（N8-2）。
  // parse 正则 /^op-(\d+)/ 未改 → 历史命名仍占号，序号分配不受影响（新旧共存不撞号）。
  const lockPath = projectLockPath(projectPath, `scheme-${parsed.stageDir}`);
  const opId = withFileLock(lockPath, () => {
    const reserved = reserveSequence({
      dir: opsDir,
      candidate: (seq) => `${opIdOf(seq)}.md`,
      parse: (fileName) => {
        const m = fileName.match(/^op-(\d+)/);
        return m ? parseInt(m[1], 10) : null;
      },
    });
    const content = generateSchemeTemplate(opIdOf(reserved.seq), parsed.fullStageId, title);
    atomicWriteFileSync(reserved.path, content);
    return opIdOf(reserved.seq);
  });

  // 3. 同步到 flow.json（键用完整 stageId；由 FlowManager.save 的 flow.lock 保护）
  syncToFlowJson(projectPath, parsed.fullStageId, opId, title, options?.onImplicitRegister);

  return opId;
}

/** 删除（注销）结果（N1-1） */
export interface RemoveSchemeResult {
  /** 是否已删除 flow.json 中的 op 键 */
  removed: boolean;
  /** 未删除时的原因（错误码，供命令层映射 i18n） */
  reason?: 'stage-not-found' | 'op-not-found' | 'op-done' | 'has-checkpoint';
  /** 该 op 是否本已是「键孤儿」（opsDir 无对应文件） */
  orphan?: boolean;
}

/**
 * 判断 ops/ 目录是否存在该 op 的模板文件。
 * R1：同时匹配 `op-NNN.md` 与历史 `op-NNN_*.md` 两种命名（避免历史命名被误判为键孤儿）。
 */
function hasOpTemplateFile(projectPath: string, stageId: string, opId: string): boolean {
  const parsed = parseStageId(stageId);
  if (!parsed) {
    return false;
  }
  const opsDir = resolve(projectPath, '.openfeel', 'plan', parsed.series, parsed.stageDir, 'ops');
  if (!existsSync(opsDir)) {
    return false;
  }
  try {
    return readdirSync(opsDir).some((f) => f === `${opId}.md` || f.startsWith(`${opId}_`));
  } catch {
    // 目录不可读时视为无文件（不误判为存在）
    return false;
  }
}

/**
 * 判断该 op 是否存在 checkpoint 进展（默认拒绝删除的保护依据）。
 * 判据：① op.checkpoints 含任一非 pending 值；② 阶段 checkpoint 快照含该 op 或 current 指向该 op。
 */
function hasCheckpointProgress(projectPath: string, stageId: string, opId: string, op: Op): boolean {
  const c = op.checkpoints;
  if (c) {
    const untouched =
      c.plan === 'pending' &&
      c.scheme === 'pending' &&
      c.review === 'pending' &&
      c.test === 'pending' &&
      (c.exec?.attempts ?? 0) === 0 &&
      (c.exec?.self ?? 'pending') === 'pending';
    if (!untouched) {
      return true;
    }
  }

  // 阶段快照目录：.openfeel/checkpoints/{stageId}-*.json
  const cpDir = resolve(projectPath, '.openfeel', 'checkpoints');
  if (!existsSync(cpDir)) {
    return false;
  }
  try {
    for (const f of readdirSync(cpDir)) {
      if (!f.startsWith(`${stageId}-`) || !f.endsWith('.json')) {
        continue;
      }
      try {
        const snap = JSON.parse(readFileSync(resolve(cpDir, f), 'utf-8')) as {
          stages?: Record<string, { ops?: Record<string, unknown> }>;
          pipeline?: { current?: { op?: string } };
        };
        if (snap?.stages?.[stageId]?.ops && opId in snap.stages[stageId].ops) {
          return true;
        }
        if (snap?.pipeline?.current?.op === opId) {
          return true;
        }
      } catch {
        // 单个快照损坏忽略
      }
    }
  } catch {
    return false;
  }
  return false;
}

/**
 * 从 flow.json 注销一个 op 键（不删除 op 模板文件），并留审计日志（N1-1）。
 * 默认对「已 done」或「存在 checkpoint 进展」的 op 拒绝删除（--force 覆盖）。
 * @param projectPath 项目根路径
 * @param stageName 阶段 ID（简写或全称，经 normalizeStageId 归一）
 * @param opId op ID（op-001 或 完整 stage.op-001）
 * @param options.force 跳过保护校验；options.dryRun 仅预览不写盘
 * @returns 删除结果（成功/原因码/是否孤儿）
 */
export function removeScheme(
  projectPath: string,
  stageName: string,
  opId: string,
  options?: { force?: boolean; dryRun?: boolean },
): RemoveSchemeResult {
  const normalized = normalizeStageId(stageName) ?? stageName;
  const localOpId = opId.includes('.') ? opId.substring(opId.lastIndexOf('.') + 1) : opId;

  const mgr = new FlowManager(projectPath);
  if (!mgr.isLoaded()) {
    return { removed: false, reason: 'stage-not-found' };
  }
  const data = mgr.getData()!;
  const stage = data.stages[normalized] ?? data.stages[stageName];
  if (!stage) {
    return { removed: false, reason: 'stage-not-found' };
  }
  const op = stage.ops[localOpId];
  if (!op) {
    return { removed: false, reason: 'op-not-found' };
  }
  const stageKey = data.stages[normalized] ? normalized : stageName;
  // 孤儿（opsDir 无对应文件）：这正是回收场景，允许直接删除
  const orphan = !hasOpTemplateFile(projectPath, stageKey, localOpId);

  if (!options?.force) {
    // 保护已完成进度
    if (op.state === 'done') {
      return { removed: false, reason: 'op-done', orphan };
    }
    // 保护含 checkpoint 进展的 op
    if (hasCheckpointProgress(projectPath, stageKey, localOpId, op)) {
      return { removed: false, reason: 'has-checkpoint', orphan };
    }
  }

  // --dry-run：仅预览，不写盘
  if (options?.dryRun) {
    return { removed: true, orphan };
  }

  delete stage.ops[localOpId];
  mgr.appendLog({
    time: '',
    agent: 'cli',
    action: 'scheme_remove',
    detail: { stage: stageKey, opId: localOpId, force: !!options?.force, orphan },
  });
  mgr.save();
  return { removed: true, orphan };
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
          title: extractTitle(filePath, fileName),
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
