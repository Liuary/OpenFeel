/**
 * stage 命令组注册
 * openfeel stage status|set|task|create — status.md 的 CLI 原子操作管理
 *
 * 变更摘要 (stage-04: status.md CLI 管理):
 * - 新增 stage 命令组，通过 CLI 原子操作管理 status.md 读写
 * - 替代 Agent 手动 edit 工具，消除格式匹配脆弱性问题
 * - 所有写操作前自动备份 status.md 到 .openfeel/tmp/
 *
 * 参见 kb/troubleshooting.md「手动 edit status.md 频繁失败 — 格式匹配脆弱」
 */
import { Command } from 'commander';
import { existsSync, readFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve, basename, dirname } from 'node:path';
import { atomicWriteFileSync } from '../core/fs/atomic-write.js';
import { withFileLock, projectLockPath } from '../core/fs/file-lock.js';
import fastGlob from 'fast-glob';
import { t, getCliLang } from '../core/i18n.js';
import { FlowManager, STAGE_STATUS_VALUES } from '../core/flow-manager.js';
import { failRefusal, handleAddStageError } from './shared/errors.js';
import { enforcePreflightOrFail } from './shared/preflight-gate.js';
import { withSchemaVersion, emitJson } from './shared/json-output.js';
import { findStageStatusPath, planDirToStageId, parseStageId, validateStageId, suggestStageId, normalizeStageId } from '../core/plan/path.js';
import { appendStatusTask } from '../core/plan/stage.js';
import { getConfigFieldLegalValues, type WorkflowMode } from '../core/config.js';

/** 状态字段键值对 */
interface StatusFields {
  [key: string]: string;
}

/** 任务条目 */
interface TaskEntry {
  /** 任务编号（如 1, 2, 3） */
  number: number;
  /** 是否已完成 */
  done: boolean;
  /** 完整的原始行文本 */
  line: string;
  /** 任务描述（去掉 checkbox 与「任务{N}：」前缀） */
  description: string;
}

/** 规范化状态字段（JSON 契约：7 个 camelCase 键 + raw 原始中文键值对） */
interface CanonicalStatusFields {
  execMode: string | null;
  autoAdvance: string | null;
  status: string | null;
  reviewAgent: string | null;
  previousReviewAgent: string | null;
  updatedAt: string | null;
  workflowMode: string | null;
  raw: StatusFields;
}

/** 将 status.md 原始中文字段映射为规范化键（缺失 → null） */
function buildCanonicalFields(raw: StatusFields): CanonicalStatusFields {
  return {
    execMode: raw['执行模式'] ?? null,
    autoAdvance: raw['自动推进'] ?? null,
    status: raw['状态'] ?? null,
    reviewAgent: raw['当前责任 Agent'] ?? null,
    previousReviewAgent: raw['上一责任 Agent'] ?? null,
    updatedAt: raw['更新时间'] ?? null,
    workflowMode: raw['工作模式'] ?? null,
    raw,
  };
}

/** 提取「## 阻塞 / 暂停原因」正文；无内容或「无」→ null */
function extractBlockedReason(content: string): string | null {
  const m = content.match(/^## 阻塞 \/ 暂停原因\n\n(.+?)(?:\n##|\n*$)/ms);
  const text = m?.[1]?.trim() ?? '';
  return text === '' || text === '无' ? null : text;
}

/**
 * 根据 stageId 解析 status.md 文件路径
 * 三级回退：plan/{series}/ 精确 → plan 递归 → stages 兜底（委托 path.ts）
 */
function resolveStatusPath(projectPath: string, stageId: string): string | null {
  return findStageStatusPath(projectPath, stageId);
}

/** status.md 的锁路径：按阶段目录隔离（status-stage-35.lock），锁粒度最小化 */
function statusLockPath(projectPath: string, statusPath: string): string {
  const stageDir = basename(dirname(statusPath)); // .openfeel/plan/v1/stage-35/status.md → stage-35
  return projectLockPath(projectPath, `status-${stageDir}`);
}

/**
 * 备份 status.md 到 .openfeel/tmp/status.{stageId}.bak
 */
function backupStatus(statusPath: string, stageId: string): void {
  const tmpDir = resolve(process.cwd(), '.openfeel', 'tmp');
  if (!existsSync(tmpDir)) {
    mkdirSync(tmpDir, { recursive: true });
  }

  const backupPath = resolve(tmpDir, `status.${stageId}.bak`);
  copyFileSync(statusPath, backupPath);
}

/**
 * 同步 flow.json 中 `stages[id].workflow_mode` 冗余字段（写入点②，裁定 G：可选冗余、不参与级联）。
 * 仅在实际写入发生时调用；未加载 / 未注册（归一化双键均未命中）→ 静默跳过。
 * @param mgr 已构造的 FlowManager（循环内可复用同一实例）
 * @param stageId 用户输入原值（归一化后回退查询）
 * @param value 目标值
 */
function syncWorkflowModeRedundancy(mgr: FlowManager, stageId: string, value: string): void {
  if (!mgr.isLoaded()) {
    return;
  }
  const data = mgr.getData()!;
  const key = normalizeStageId(stageId) ?? stageId;
  const target = data.stages[key];
  if (!target) {
    return; // 未注册阶段（允许作用于未注册目录）→ 无冗余条目，跳过
  }
  target.workflow_mode = value as WorkflowMode;
  mgr.save();
}

/**
 * 解析 status.md 中的字段（`- **{key}**：{value}` 格式）
 */
function parseStatusFields(content: string): StatusFields {
  const fields: StatusFields = {};
  const fieldRegex = /^-\s*(?:\*\*)?(.+?)(?:\*\*)?[：:]\s*(.*)$/gm;
  let match: RegExpExecArray | null;

  while ((match = fieldRegex.exec(content)) !== null) {
    const key = match[1].trim();
    const value = match[2].trim();
    fields[key] = value;
  }

  return fields;
}

/**
 * 解析 status.md 中的任务列表（`- [ ] 任务{N}：...` 或 `- [x] 任务{N}：...`）
 */
function parseTasks(content: string): TaskEntry[] {
  const tasks: TaskEntry[] = [];
  const taskRegex = /^(- \[([ x])\] 任务(\d+)[：:].*)$/gm;
  let match: RegExpExecArray | null;

  while ((match = taskRegex.exec(content)) !== null) {
    const descMatch = match[1].match(/任务\d+[：:]\s*(.*)/);
    tasks.push({
      number: parseInt(match[3], 10),
      done: match[2] === 'x',
      line: match[1],
      description: descMatch ? descMatch[1] : match[1],
    });
  }

  return tasks;
}

/**
 * 列出所有已发现的阶段及其状态
 */
function listAllStages(projectPath: string): { stageId: string; statusPath: string; status: string }[] {
  const planDir = resolve(projectPath, '.openfeel', 'plan');
  if (!existsSync(planDir)) {
    return [];
  }

  // 搜索所有 status.md 文件
  const statusFiles = fastGlob.sync('**/status.md', {
    cwd: planDir,
    onlyFiles: true,
    caseSensitiveMatch: true,
  });

  const results: { stageId: string; statusPath: string; status: string }[] = [];

  for (const file of statusFiles) {
    // 从路径中提取目录名：.openfeel/plan/v1/stage-33/status.md → stage-33
    //                     .openfeel/plan/v4/v4-stage-04/status.md → v4-stage-04（历史）
    const parts = file.replace(/\\/g, '/').split('/');
    const rawDir = parts.length >= 3 ? parts[parts.length - 2] : parts[0];

    // 反向映射：目录名 → 完整 stageId（回查 flow.json 匹配 *-stage-NN）
    let stageId: string;
    const parsed = parseStageId(rawDir);
    if (parsed) {
      const full = planDirToStageId(projectPath, parsed.stageDir);
      stageId = full ?? parsed.fullStageId; // 回查失败兜底用解析结果
    } else {
      stageId = rawDir; // 无法解析时直接用目录名
    }

    try {
      const content = readFileSync(resolve(planDir, file), 'utf-8');
      const fields = parseStatusFields(content);
      results.push({
        stageId,
        statusPath: `.openfeel/plan/${file.replace(/\\/g, '/')}`,
        status: fields['状态'] || 'unknown',
      });
    } catch {
      // 文件读取失败时跳过
    }
  }

  // 按 stageId 排序
  results.sort((a, b) => a.stageId.localeCompare(b.stageId));
  return results;
}

/**
 * 显示单个阶段的详细状态
 */
function showStageStatus(statusPath: string, stageId: string): void {
  const lang = getCliLang(process.cwd());
  const content = readFileSync(statusPath, 'utf-8');
  const fields = parseStatusFields(content);
  const tasks = parseTasks(content);

  console.log(`\n── ${stageId} ──\n`);

  // 输出字段
  const fieldOrder = ['执行模式', '自动推进', '状态', '当前责任 Agent', '上一责任 Agent', '更新时间', '工作模式', '分支名', 'Session 名称', '合并状态', '清理策略', '前置依赖', '依赖状态'];
  for (const key of fieldOrder) {
    if (fields[key] !== undefined) {
      console.log(`  ${key}: ${fields[key]}`);
    }
  }

  // 输出其他未在 fieldOrder 中的字段
  for (const [key, value] of Object.entries(fields)) {
    if (!fieldOrder.includes(key)) {
      console.log(`  ${key}: ${value}`);
    }
  }

  // 输出任务列表
  if (tasks.length > 0) {
    const doneCount = tasks.filter((t) => t.done).length;
    console.log(t('stage.task.taskListTmpl', lang, { done: String(doneCount), total: String(tasks.length) }));
    for (const task of tasks) {
      const icon = task.done ? '✅' : '⬜';
      // 任务描述已在 parseTasks 内同源提取（人类输出逐字不变）
      console.log(`    ${icon} ` + t('stage.task.taskItemTmpl', lang, { number: String(task.number), desc: task.description }));
    }
  }

  // 输出阻塞原因
  const blockLine = content.match(/^## 阻塞 \/ 暂停原因\n\n(.+?)(?:\n##|\n*$)/ms);
  if (blockLine && blockLine[1].trim() !== '无' && blockLine[1].trim() !== '') {
    console.log(t('stage.task.blockedByTmpl', lang, { reason: blockLine[1].trim() }));
  }

  console.log('');
}

/**
 * 更新 status.md 中指定字段的值
 * 使用正则精确定位 `- **{key}**：{value}` 行，替换 value 部分，保留其余内容不变
 * 读-改-写整体在 status-{stageDir}.lock 临界区内完成
 */
function setStatusField(
  projectPath: string,
  statusPath: string,
  key: string,
  newValue: string,
): boolean {
  const lockPath = statusLockPath(projectPath, statusPath);
  return withFileLock(lockPath, () => {
    const content = readFileSync(statusPath, 'utf-8');

    // 匹配格式：`- **{key}**：{value}` 或 `- {key}：{value}` — 支持中文冒号
    const fieldRegex = new RegExp(
      `^(-\\s*(?:\\*\\*)?${escapeRegex(key)}(?:\\*\\*)?[：:]\\s*)(.*)$`,
      'gm',
    );

    const updated = content.replace(fieldRegex, `$1${newValue}`);
    if (updated === content) {
      return false; // 未找到匹配字段
    }

    atomicWriteFileSync(statusPath, updated);
    return true;
  });
}

/**
 * 探测字段写入结果（纯读，不写盘，N5-1）。
 * - `not-found`：status.md 中不存在该字段行
 * - `unchanged`：字段存在且值逐字符相同（同值 → no-op 成功）
 * - `will-change`：字段存在且值不同（将发生变更）
 * @param statusPath status.md 绝对路径
 * @param field 字段名（如「状态」「执行模式」）
 * @param value 目标值
 */
function probeStatusField(
  statusPath: string,
  field: string,
  value: string,
): 'not-found' | 'unchanged' | 'will-change' {
  const content = readFileSync(statusPath, 'utf-8');
  const fieldRegex = new RegExp(
    `^(-\\s*(?:\\*\\*)?${escapeRegex(field)}(?:\\*\\*)?[：:]\\s*)(.*)$`,
    'm',
  );
  const m = content.match(fieldRegex);
  if (!m) {
    return 'not-found';
  }
  return m[2] === value ? 'unchanged' : 'will-change';
}

/**
 * 切换任务的 checkbox 状态
 * 读-改-写整体在 status-{stageDir}.lock 临界区内完成
 * @param toDone true = 勾选，false = 取消勾选
 */
function toggleTask(
  projectPath: string,
  statusPath: string,
  taskNo: number,
  toDone: boolean,
): boolean {
  const lockPath = statusLockPath(projectPath, statusPath);
  return withFileLock(lockPath, () => {
    const content = readFileSync(statusPath, 'utf-8');

    // 匹配格式：`- [ ] 任务{N}：...` 或 `- [x] 任务{N}：...`
    const taskRegex = new RegExp(
      `^(- \\[)([ x])(\\] 任务${taskNo}[：:].*)$`,
      'gm',
    );

    let found = false;
    const updated = content.replace(taskRegex, (_match, before, _current, after) => {
      found = true;
      const newMarker = toDone ? 'x' : ' ';
      return `${before}${newMarker}${after}`;
    });

    if (!found) {
      return false;
    }

    atomicWriteFileSync(statusPath, updated);
    return true;
  });
}

/**
 * 转义正则表达式特殊字符
 */
function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 注册 stage 命令组到 Commander 程序
 */
export function registerStageCommand(program: Command): void {
  const stage = program
    .command('stage')
    .description('工作阶段状态管理（status.md 原子操作）');

  // ═══ stage status [<stageId>] ═══
  stage
    .command('status')
    .description('查看阶段状态（无参数时列出所有阶段）')
    .argument('[stageId]', '阶段 ID（如 v4-stage-04）')
    .option('--json', t('help.stage.status.json', getCliLang(process.cwd())))
    .action((stageId: string | undefined, options: { json?: boolean }) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);

      if (!stageId) {
        // 无参数：列出所有阶段
        const stages = listAllStages(projectPath);

        // JSON 分支须为首行纯 JSON 单文档（statusPath 统一绝对路径）
        if (options.json) {
          emitJson(withSchemaVersion({
            stages: stages.map((s) => ({
              stageId: s.stageId,
              status: s.status,
              statusPath: resolve(projectPath, s.statusPath),
            })),
            count: stages.length,
          }));
          return;
        }

        if (stages.length === 0) {
          console.log(t('stage.status.noStages', lang));
          return;
        }

        console.log(t('stage.status.foundTmpl', lang, { n: String(stages.length) }));
        for (const s of stages) {
          const statusIcon = s.status === 'done'
            ? '✅'
            : s.status === 'coding'
            ? '🔧'
            : s.status === 'planned'
            ? '📋'
            : '  ';
          console.log(`  ${statusIcon} ${s.stageId}  →  ${s.status}`);
        }
        console.log(`\n${t('stage.status.hint', lang)}\n`);
        return;
      }

      // 有参数：显示指定阶段详细状态
      const statusPath = resolveStatusPath(projectPath, stageId);
      if (!statusPath) {
        // JSON 模式：预期拒绝 envelope（失败 envelope 判定经 isJsonMode() 单点）
        if (options.json) {
          failRefusal({
            code: 'STAGE_NOT_FOUND',
            message: t('stage.errorStageNotFoundTmpl', lang, { stageId }),
            detail: { stageId, hint: t('stage.errorCheckStageId', lang) },
          });
          return;
        }
        console.error(t('stage.errorStageNotFoundTmpl', lang, { stageId }));
        console.error(t('stage.errorCheckStageId', lang));
        process.exit(1);
      }

      // JSON 分支：单文档输出（fields 7 规范键 + raw；tasks 精简三元组）
      if (options.json) {
        const content = readFileSync(statusPath, 'utf-8');
        const fields = parseStatusFields(content);
        const tasks = parseTasks(content);
        emitJson(withSchemaVersion({
          stageId,
          statusPath,
          fields: buildCanonicalFields(fields),
          tasks: tasks.map(({ number, done, description }) => ({ number, done, description })),
          blockedBy: extractBlockedReason(content),
        }));
        return;
      }

      showStageStatus(statusPath, stageId);
    });

  // ═══ stage set <stageId> [--status|--exec-mode|--auto-advance|--review-agent] ═══
  stage
    .command('set')
    .description('设置阶段状态字段（原子更新，保留其余内容不变）')
    .argument('<stageId>', '阶段 ID（如 v4-stage-04）')
    .option('--status <value>', '状态值（如 exec_running）')
    .option('--exec-mode <mode>', '执行模式（manual | auto）')
    .option('--auto-advance <value>', '自动推进（enabled | disabled）')
    .option('--review-agent <agent>', '当前责任 Agent（如 openfeel-executor）')
    .option('--workflow-mode <mode>', '工作流模式（full | fast | general）')
    .action((stageId: string, options: { status?: string; execMode?: string; autoAdvance?: string; reviewAgent?: string; workflowMode?: string }) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      const statusPath = resolveStatusPath(projectPath, stageId);

      if (!statusPath) {
        console.error(t('stage.errorStageNotFoundTmpl', lang, { stageId }));
        process.exit(1);
      }

      // N7-1：字段白名单（A4）+ 固定写入顺序（状态 → 执行模式 → 自动推进 → 工作流模式 → 当前责任 Agent）
      const jobs: { field: string; value: string; allowed?: string[] }[] = [];
      if (options.status !== undefined) {
        jobs.push({ field: '状态', value: options.status, allowed: [...STAGE_STATUS_VALUES] });
      }
      if (options.execMode !== undefined) {
        jobs.push({ field: '执行模式', value: options.execMode, allowed: ['manual', 'auto'] });
      }
      if (options.autoAdvance !== undefined) {
        jobs.push({ field: '自动推进', value: options.autoAdvance, allowed: ['enabled', 'disabled'] });
      }
      if (options.workflowMode === 'general') {
        // 载体制约束：general 仅需求级合法（阶段级写入面拒绝；前置 → 批量场景零写盘）
        console.error(t('common.generalOnlyRequirement', lang));
        process.exit(1);
        return;
      }
      if (options.workflowMode !== undefined) {
        jobs.push({ field: '工作流模式', value: options.workflowMode, allowed: getConfigFieldLegalValues('workflow_mode') ?? [] });
      }
      if (options.reviewAgent !== undefined) {
        const agent = options.reviewAgent.trim();
        if (!agent) {
          // 空 agent：非法值 → exit 1 且不写盘
          console.error(t('stage.set.invalidValueTmpl', lang, { field: '当前责任 Agent', value: options.reviewAgent, allowed: 'non-empty' }));
          process.exit(1);
          return;
        }
        jobs.push({ field: '当前责任 Agent', value: agent });
      }

      if (jobs.length === 0) {
        console.error(t('stage.set.noOptionTmpl', lang));
        process.exit(1);
        return;
      }

      // 枚举校验：任一非法 → exit 1 且不写盘
      for (const job of jobs) {
        if (job.allowed && !job.allowed.includes(job.value)) {
          console.error(t('stage.set.invalidValueTmpl', lang, { field: job.field, value: job.value, allowed: job.allowed.join(' / ') }));
          process.exit(1);
          return;
        }
      }

      // v1.5.6-stage-114：写前 preflight（REQ-015 验收项 4：阶段存在性 / 枚举 / general 载体制校验全在门前）
      if (!enforcePreflightOrFail(projectPath, lang)) return;
      // N5-2：先探测后写（同值 no-op 成功；`.bak` 仅在确认变更后生成）
      const applied: string[] = [];
      const flowMgr = new FlowManager(projectPath);
      for (const job of jobs) {
        const probe = probeStatusField(statusPath, job.field, job.value);
        if (probe === 'not-found') {
          // 「工作流模式」为新受管键：字段缺失 → 改道「插入」语义（锚点链）；其余字段保持既有 exit 1
          if (job.field === '工作流模式') {
            const r = flowMgr.insertStatusField(statusPath, stageId, job.field, job.value);
            if (r === 'no-anchor') {
              if (applied.length > 0) {
                console.error(t('stage.set.multiPartialTmpl', lang, { done: applied.join(', '), field: job.field }));
              }
              console.error(t('stage.set.noAnchorTmpl', lang, { stageId, field: job.field }));
              process.exit(1);
              return;
            }
            if (r === 'inserted') {
              console.log(t('stage.set.insertedTmpl', lang, { stageId, field: job.field, value: job.value }));
            } else {
              // 竞态防御：锁内发现字段已就位 → 回退替换语义（不产生双行）
              backupStatus(statusPath, stageId);
              setStatusField(projectPath, statusPath, job.field, job.value);
              console.log(t('stage.set.updatedTmpl', lang, { stageId, field: job.field, value: job.value }));
            }
            applied.push(job.field);
            syncWorkflowModeRedundancy(flowMgr, stageId, job.value);
            continue;
          }
          if (applied.length > 0) {
            console.error(t('stage.set.multiPartialTmpl', lang, { done: applied.join(', '), field: job.field }));
          }
          console.error(t('stage.set.errorFieldNotFoundTmpl', lang, { stageId, field: job.field }));
          process.exit(1);
          return;
        }
        if (probe === 'unchanged') {
          console.log(t('stage.set.noopTmpl', lang, { field: job.field }));
          continue;
        }
        // will-change：备份 → 原子写
        backupStatus(statusPath, stageId);
        const ok = setStatusField(projectPath, statusPath, job.field, job.value);
        if (!ok) {
          console.error(t('stage.set.errorFieldNotFoundTmpl', lang, { stageId, field: job.field }));
          process.exit(1);
          return;
        }
        applied.push(job.field);
        console.log(t('stage.set.updatedTmpl', lang, { stageId, field: job.field, value: job.value }));
        // 冗余写入点②：仅实际写入（will-change 成功）时同步 flow.json 冗余字段
        if (job.field === '工作流模式') {
          syncWorkflowModeRedundancy(flowMgr, stageId, job.value);
        }
      }
    });

  // ═══ stage task <stageId> [taskNo] [--done|--undone] | --add <desc> ═══
  stage
    .command('task')
    .description('勾选/取消任务 checkbox，或追加任务')
    .argument('<stageId>', '阶段 ID（如 v4-stage-04）')
    .argument('[taskNo]', '任务编号（如 1；--add 模式下可省略）')
    .option('--add <desc>', '追加一条任务（与 --done/--undone 互斥）')
    .option('--done', '标记任务为已完成')
    .option('--undone', '标记任务为未完成')
    .action((stageId: string, taskNoStr: string | undefined, options: { add?: string; done?: boolean; undone?: boolean }) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      const statusPath = resolveStatusPath(projectPath, stageId);

      if (!statusPath) {
        console.error(t('stage.errorStageNotFoundTmpl', lang, { stageId }));
        process.exit(1);
      }

      // N6-1：--add 模式（与 --done/--undone 互斥）
      if (options.add !== undefined) {
        if (options.done || options.undone) {
          console.error(t('stage.task.addMutualExclusiveTmpl', lang));
          process.exit(1);
          return;
        }
        // v1.5.6-stage-114：`--add` 分支独立门（REV-006：`appendStatusTask` 在本分支内写盘，主路径门到不了）
        if (!enforcePreflightOrFail(projectPath, lang)) return;
        try {
          const no = appendStatusTask(projectPath, stageId, options.add);
          console.log(t('stage.task.addOkTmpl', lang, { no: String(no), desc: options.add.trim() }));
        } catch (err: unknown) {
          const msg = err instanceof Error ? err.message : String(err);
          if (msg === 'TASK_SECTION_MISSING') {
            console.error(t('stage.task.sectionMissingTmpl', lang));
          } else {
            console.error(t('common.errorTmpl', lang, { msg }));
          }
          process.exit(1);
        }
        return;
      }

      // 既有勾选路径：缺 taskNo → 提示 --add 用法
      if (!taskNoStr) {
        console.error(t('stage.task.addUsageTmpl', lang));
        process.exit(1);
        return;
      }

      // 互斥校验
      if (options.done === options.undone) {
        console.error(t('stage.task.errorMutualExclusive', lang));
        process.exit(1);
      }

      const taskNo = parseInt(taskNoStr, 10);
      if (isNaN(taskNo) || taskNo < 1) {
        console.error(t('stage.task.errorInvalidTaskNo', lang));
        process.exit(1);
      }

      // v1.5.6-stage-114：写前 preflight（阶段存在 / taskNo 校验已在门前）
      if (!enforcePreflightOrFail(projectPath, lang)) return;
      // 写操作前备份
      backupStatus(statusPath, stageId);

      const toDone = !!options.done;
      const ok = toggleTask(projectPath, statusPath, taskNo, toDone);

      if (!ok) {
        console.error(t('stage.task.errorTaskNotFoundTmpl', lang, { stageId, taskNo: String(taskNo) }));
        process.exit(1);
      }

      const actionLabel = toDone ? t('stage.task.done', lang) : t('stage.task.undone', lang);
      console.log(t('stage.task.actionLabelTmpl', lang, { label: actionLabel, stageId, taskNo: String(taskNo) }));
    });

  // ═══ stage create <stageId> ═══
  stage
    .command('create')
    .description(t('help.stage.create', getCliLang(process.cwd())))
    .argument('<stageId>', '阶段 ID（如 v1.0.0-stage-30）')
    .action((stageId: string) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      const mgr = new FlowManager(projectPath);
      if (!mgr.isLoaded()) {
        console.error(t('common.errorNoInit', lang));
        process.exit(1);
      }
      // 弃用提示：仅 TTY 输出到 stderr，非 TTY 静默（避免污染 CI，对齐 init/update 对称静默惯例）
      if (process.stdout.isTTY) {
        console.error(t('stage.create.deprecated', lang));
      }
      // 非法 stageId 统一报错 + 建议名（op-002 校验底座）
      const v = validateStageId(stageId);
      if (!v.ok) {
        console.error(t('common.stageIdInvalidTmpl', lang, { input: stageId }));
        console.error(t('common.stageIdSuggestTmpl', lang, { suggest: suggestStageId(projectPath, stageId) }));
        process.exit(1);
      }
      // v1.5.6-stage-114：写前 preflight（写盘在 addStage 内）
      if (!enforcePreflightOrFail(projectPath, lang)) return;
      try {
        mgr.addStage(stageId);
        mgr.save();
        console.log(t('stage.create.addedTmpl', lang, { stage: stageId }));
      } catch (err: unknown) {
        // addStage 错误统一处理（与 flow stage add 共用单点，T42）
        handleAddStageError(err, lang);
      }
    });
}
