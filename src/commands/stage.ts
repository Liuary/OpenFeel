/**
 * stage 命令组注册
 * openfeel stage status|set|task — status.md 的 CLI 原子操作管理
 *
 * 变更摘要 (stage-04: status.md CLI 管理):
 * - 新增 stage 命令组，通过 CLI 原子操作管理 status.md 读写
 * - 替代 Agent 手动 edit 工具，消除格式匹配脆弱性问题
 * - 所有写操作前自动备份 status.md 到 .openfeel/tmp/
 *
 * 参见 kb/troubleshooting.md「手动 edit status.md 频繁失败 — 格式匹配脆弱」
 */
import { Command } from 'commander';
import { existsSync, readFileSync, writeFileSync, copyFileSync, mkdirSync } from 'node:fs';
import { resolve } from 'node:path';
import fastGlob from 'fast-glob';
import { t, getCliLang } from '../core/i18n.js';

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
}

/**
 * 根据 stageId 解析 status.md 文件路径
 * 在 .openfeel/plan/ 下递归搜索匹配的目录
 */
function resolveStatusPath(projectPath: string, stageId: string): string | null {
  const planDir = resolve(projectPath, '.openfeel', 'plan');
  if (!existsSync(planDir)) {
    return null;
  }

  // 使用 fast-glob 在 plan/ 下递归搜索匹配的 status.md
  const matches = fastGlob.sync(`**/${stageId}/status.md`, {
    cwd: planDir,
    onlyFiles: true,
    caseSensitiveMatch: true,
  });

  if (matches.length === 0) {
    return null;
  }

  // 取第一个匹配项
  return resolve(planDir, matches[0]);
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
 * 解析 status.md 中的字段（`- **{key}**：{value}` 格式）
 */
function parseStatusFields(content: string): StatusFields {
  const fields: StatusFields = {};
  const fieldRegex = /^-\s*\*\*(.+?)\*\*[：:]\s*(.*)$/gm;
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
    tasks.push({
      number: parseInt(match[3], 10),
      done: match[2] === 'x',
      line: match[1],
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
    // 从路径中提取 stageId：.openfeel/plan/v4/v4-stage-04/status.md → v4-stage-04
    const parts = file.replace(/\\/g, '/').split('/');
    const stageId = parts.length >= 3 ? parts[parts.length - 2] : parts[0];

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
      // 提取任务描述（去掉 checkbox 和"任务{N}："前缀）
      const descMatch = task.line.match(/任务\d+[：:]\s*(.*)/);
      const desc = descMatch ? descMatch[1] : task.line;
      console.log(`    ${icon} ` + t('stage.task.taskItemTmpl', lang, { number: String(task.number), desc }));
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
 */
function setStatusField(statusPath: string, key: string, newValue: string): boolean {
  const content = readFileSync(statusPath, 'utf-8');

  // 匹配格式：`- **{key}**：{value}` — 支持中文冒号
  const fieldRegex = new RegExp(
    `^(-\\s*\\*\\*${escapeRegex(key)}\\*\\*[：:]\\s*)(.*)$`,
    'gm',
  );

  const updated = content.replace(fieldRegex, `$1${newValue}`);

  if (updated === content) {
    return false; // 未找到匹配字段
  }

  writeFileSync(statusPath, updated, 'utf-8');
  return true;
}

/**
 * 切换任务的 checkbox 状态
 * @param toDone true = 勾选，false = 取消勾选
 */
function toggleTask(statusPath: string, taskNo: number, toDone: boolean): boolean {
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

  writeFileSync(statusPath, updated, 'utf-8');
  return true;
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
    .action((stageId?: string) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);

      if (!stageId) {
        // 无参数：列出所有阶段
        const stages = listAllStages(projectPath);

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
        console.error(t('stage.errorStageNotFoundTmpl', lang, { stageId }));
        console.error(t('stage.errorCheckStageId', lang));
        process.exit(1);
      }

      showStageStatus(statusPath, stageId);
    });

  // ═══ stage set <stageId> --status <value> ═══
  stage
    .command('set')
    .description('设置阶段状态字段（原子更新，保留其余内容不变）')
    .argument('<stageId>', '阶段 ID（如 v4-stage-04）')
    .requiredOption('--status <value>', '状态值（如 exec_running）')
    .action((stageId: string, options: { status: string }) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      const statusPath = resolveStatusPath(projectPath, stageId);

      if (!statusPath) {
        console.error(t('stage.errorStageNotFoundTmpl', lang, { stageId }));
        process.exit(1);
      }

      // 写操作前备份
      backupStatus(statusPath, stageId);

      const ok = setStatusField(statusPath, '状态', options.status);

      if (!ok) {
        console.error(t('stage.set.errorFieldNotFoundTmpl', lang, { stageId }));
        process.exit(1);
      }

      console.log(t('stage.set.updatedTmpl', lang, { stageId, status: options.status }));
    });

  // ═══ stage task <stageId> <taskNo> --done|--undone ═══
  stage
    .command('task')
    .description('勾选或取消任务 checkbox')
    .argument('<stageId>', '阶段 ID（如 v4-stage-04）')
    .argument('<taskNo>', '任务编号（如 1）')
    .option('--done', '标记任务为已完成')
    .option('--undone', '标记任务为未完成')
    .action((stageId: string, taskNoStr: string, options: { done?: boolean; undone?: boolean }) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      const statusPath = resolveStatusPath(projectPath, stageId);

      if (!statusPath) {
        console.error(t('stage.errorStageNotFoundTmpl', lang, { stageId }));
        process.exit(1);
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

      // 写操作前备份
      backupStatus(statusPath, stageId);

      const toDone = !!options.done;
      const ok = toggleTask(statusPath, taskNo, toDone);

      if (!ok) {
        console.error(t('stage.task.errorTaskNotFoundTmpl', lang, { stageId, taskNo: String(taskNo) }));
        process.exit(1);
      }

      const actionLabel = toDone ? t('stage.task.done', lang) : t('stage.task.undone', lang);
      console.log(t('stage.task.actionLabelTmpl', lang, { label: actionLabel, stageId, taskNo: String(taskNo) }));
    });
}
