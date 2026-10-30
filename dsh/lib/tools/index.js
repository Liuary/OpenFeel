/**
 * OpenFeel × DSH 适配器 — 工具集
 *
 * 每个工具 = 一个 `openfeel` CLI 命令组 + 一个 `action` 判别器。
 * **所有写操作都经由 CLI**，因此 OpenFeel 的全部门禁（相位转移表、
 * 需求 done 门、REV 阻塞、归档判据、revision CAS）都保持单一权威。
 *
 * 适配器自己只做三件事：
 * 1. 把动作翻译为精确 argv；
 * 2. 把 CLI 的人类文本 / JSON 归一化为工具结果；
 * 3. 在拒绝时给出**可操作的下一步**（改哪个参数、先跑哪条命令）。
 */

import { FeelError } from '../adapters/cli.js';
import { legalNextPhases, planNextStep, readSnapshot } from '../adapters/dashboard.js';
import { resolveWorkspace } from '../adapters/workspace.js';
import {
  boolean,
  compileParameters,
  envelopeSchema,
  integer,
  presentCall,
  pushFlag,
  pushOption,
  pushPositional,
  renderEnvelope,
  requireArg,
  string,
  stringArray,
  stringConst,
  stringEnum,
  toWireEnvelope,
} from './shared.js';

/** 15 个合法相位。 */
const PHASES = [
  'plan_pending',
  'plan_review',
  'plan_passed',
  'scheme_pending',
  'scheme_review',
  'scheme_passed',
  'exec_running',
  'review_pending',
  'review_failed',
  'review_passed',
  'test_pending',
  'test_failed',
  'test_passed',
  'archiving',
  'done',
];

/** 工作流模式（general 仅需求级合法）。 */
const MODES = ['full', 'fast', 'general'];
/** 审查档位。 */
const TIERS = ['full', 'lean', 'skip'];
/** 需求状态。 */
const REQ_STATUSES = ['draft', 'scheduled', 'in_progress', 'done', 'blocked', 'cancelled', 'rejected'];
/** 需求优先级。 */
const REQ_PRIORITIES = ['P0', 'P1', 'P2'];
/** 知识库分类（闭集）。 */
const KB_CATEGORIES = ['architecture', 'patterns', 'troubleshooting', 'setup'];

/**
 * 工具工厂的公共依赖。
 * @typedef {object} FeelToolContext
 * @property {import('../adapters/cli.js').FeelCli} cli CLI 执行器。
 * @property {(exec: object, args: object) => { projectRoot: string, initialized: boolean }} workspace 工作区解析。
 */

/**
 * 一次工具执行。
 * @typedef {object} ToolExecution
 * @property {Record<string, any>} args 模型参数。
 * @property {object} exec DSH 工具执行上下文（含 agent / signal）。
 */

/**
 * 包装一次 CLI 调用为工具结果。
 *
 * 实现侧用 `{ summary, data, next }`；wire 侧由 `toWireEnvelope` 把 `data`
 * 与 `next.arguments` 序列化为字符串（原因见 `shared.js` 的 `envelopeSchema`）。
 *
 * @param {string} action
 * @param {() => Promise<{ data: unknown, summary: string, next?: { tool: string, arguments: unknown, why: string } | null }>} body
 * @returns {Promise<any>}
 */
async function envelope(action, body) {
  const result = await body();
  return toWireEnvelope(action, {
    summary: result.summary,
    data: result.data,
    next: result.next,
  });
}

/**
 * 构造全部工具定义。
 *
 * @param {FeelToolContext} context
 * @returns {Array<Record<string, any>>}
 */
export function createTools(context) {
  const { cli } = context;

  /**
   * 在目标项目上执行（把 cwd 锚定到解析出的项目根）。
   * @param {object} exec
   * @param {Record<string, any>} args
   * @returns {{ cwd: string, sessionCwd: string }}
   */
  const target = (exec, args) => {
    const workspace = resolveWorkspace(exec, {
      projectPath: typeof args.project === 'string' ? args.project : undefined,
      fallback: cli.cwd,
    });
    return { cwd: workspace.projectRoot, sessionCwd: workspace.sessionCwd, initialized: workspace.initialized };
  };

  /**
   * 要求项目已初始化（配置可放宽）。
   * @param {{ initialized: boolean, cwd: string }} resolved
   */
  const requireInitialized = (resolved) => {
    if (resolved.initialized) return;
    throw new FeelError(
      `目录 ${resolved.cwd} 不是 OpenFeel 项目（缺少 .openfeel/）。请先在该目录执行 \`openfeel init\`，或用参数 project 指定已初始化的项目路径。`,
      { kind: 'refusal', code: 'FEEL_NOT_INITIALIZED', detail: { projectRoot: resolved.cwd } },
    );
  };

  /* ══════════════════════════ 1. feel_status ══════════════════════════ */

  const feelStatus = {
    name: 'feel_status',
    description:
      '读取 OpenFeel 项目当前状态快照：宏观 pipeline 相位、**每个阶段的相位**（调度目标是 phase!=done 的活跃阶段）、当前工作流模式与来源、该阶段在此模式下的**合法下一相位**、负责 Agent、审查档位、守卫与阻塞审查。调度字段优先消费 `flow next --json` 权威输出（失败时回退 `flow status`/`flow mode`）。做任何推进/委派前先调用它。',
    parameters: {
      action: stringConst('status', '固定为 status（读取快照）。'),
      project: string('项目根目录（相对会话工作区或绝对路径）。缺省时从会话工作区向上回溯 .openfeel/。'),
      with_requirements: boolean('是否附带需求概览（多一次 CLI 调用）。'),
    },
    output: { schema: envelopeSchema(), render: renderEnvelope },
    async execute(args, exec) {
      const resolved = target(exec, args);
      requireInitialized(resolved);
      return envelope('status', async () => {
        const snapshot = await readSnapshot(cli, {
          cwd: resolved.cwd,
          signal: exec.signal,
          withRequirements: args.with_requirements === true,
        });
        snapshot.project.root = resolved.cwd;
        const focus = snapshot.focus;
        return {
          data: snapshot,
          summary: `pipeline=${snapshot.pipeline.phase || '(空)'} 活跃阶段=${focus.stage || '(无)'} phase=${focus.phase || '(空)'} mode=${snapshot.mode.current}(${snapshot.mode.source}) 负责=${focus.responsibleAgent} 可推进到=[${(focus.legalNextPhases ?? []).join(', ') || '无'}]`,
          next: focus.phase === 'done' || focus.phase === ''
            ? null
            : { tool: 'feel_next', arguments: {}, why: '获取「下一步该谁做」的明确建议。' },
        };
      });
    },
    presentCall: () => presentCall('读取 Feel 状态', 'get'),
  };

  /* ══════════════════════════ 2. feel_next ══════════════════════════ */

  const feelNext = {
    name: 'feel_next',
    description:
      '返回「下一步该做什么、该谁做」。直接消费 `openfeel flow next --json` 的权威决策（负责 Agent / 相位标签 / 合法下一相位 / 建议命令 / 守卫 / 阻塞审查），并给出推荐工具调用与 OpenFeel 交接标记；适配器不持有相位→Agent 映射。Feel 角色在每次调度前应调用它，而不是自行推断。',
    parameters: {
      action: stringConst('next', '固定为 next（决定下一步该谁做）。'),
      project: string('项目根目录。缺省从会话工作区回溯。'),
    },
    output: { schema: envelopeSchema(), render: renderEnvelope },
    async execute(args, exec) {
      const resolved = target(exec, args);
      requireInitialized(resolved);
      return envelope('next', async () => {
        const snapshot = await readSnapshot(cli, { cwd: resolved.cwd, signal: exec.signal });
        snapshot.project.root = resolved.cwd;
        const plan = planNextStep(snapshot);
        return {
          data: plan,
          summary: plan.summary,
          next: plan.toolCall === null || plan.toolCall === undefined
            ? null
            : { tool: plan.toolCall.tool, arguments: plan.toolCall.arguments, why: `推进到 ${plan.toolCall.arguments.to}` },
        };
      });
    },
    presentCall: () => presentCall('决定下一步', 'read'),
  };

  /* ══════════════════════════ 3. feel_flow ══════════════════════════ */

  const feelFlow = {
    name: 'feel_flow',
    description:
      '流水线操作（openfeel flow）。action=advance 推进相位（受转移表 + done 门 + blocking REV 门约束；--force 只能跳过相位合法性，**不能**绕过 blocking REV）；action=current/overview/log/metrics/retry 为只读；action=phases 列出合法相位与流转；action=mode 查看模式与来源；action=review_* 管理审查条目（REV）；action=repair 修复 flow.json；action=migrate 升级旧版 flow.json。',
    parameters: {
      action: stringEnum(
        ['advance', 'current', 'overview', 'phases', 'mode', 'log', 'metrics', 'retry', 'repair', 'migrate', 'review_add', 'review_resolve', 'review_update', 'review_remove'],
        '操作。',
        { required: true },
      ),
      stage: string('阶段 ID（advance/retry 必需；review_add 与 op 二选一；phases/mode 可选用于按阶段派生模式）。'),
      to: stringEnum(PHASES, 'advance 的目标相位。'),
      op: string('操作 ID（如 v1.2.1-stage-93.op-001）；review_add 与 stage 二选一。'),
      force: boolean('advance 时跳过相位合法性与跳跃检查（不能绕过 blocking REV 门）。'),
      dry_run: boolean('仅校验/预览，不写盘。'),
      review_tier: stringEnum(TIERS, '审查档位：full=零裁剪 / lean=裁 scheme_review / skip=再裁 plan_review。缺省不裁剪（=full）。'),
      quiet: boolean('静默非错误输出。'),
      mode: stringEnum(['full', 'fast', 'general'], 'phases 时显式指定工作流模式。'),
      last: integer('log 显示的最近条数。', { minimum: 1 }),
      rev_id: string('REV 条目 ID（review_resolve/review_update/review_remove 必需，如 REV-001）。'),
      title: string('review_add/review_update 的标题。'),
      priority: stringEnum(['high', 'medium', 'low'], 'review_update 的优先级。'),
      blocking: boolean('review_add/review_update 是否阻塞流水线（缺省视为阻塞）。'),
      auto_fix: string('review_add 的自动修复说明；设置后跳过 scheme_pending 直接推进 exec_running。'),
      result: stringEnum(['pass', 'fail'], '未使用，保留占位。'),
      prune_orphans: boolean('repair 时清理键孤儿。'),
      backup: boolean('repair 前备份为 .bak。'),
      project: string('项目根目录。'),
    },
    output: { schema: envelopeSchema(), render: renderEnvelope },
    async execute(args, exec) {
      const { cwd } = target(exec, args);
      const action = args.action;
      const opts = { cwd, signal: exec.signal };

      switch (action) {
        case 'advance': {
          const stage = requireArg(args, 'stage', action);
          const to = requireArg(args, 'to', action);
          const argv = ['flow', 'advance', '--stage', stage, '--to', to];
          pushOption(argv, '--op', args.op);
          pushFlag(argv, '--force', args.force);
          pushFlag(argv, '--dry-run', args.dry_run);
          pushOption(argv, '--review-tier', args.review_tier);
          pushFlag(argv, '--quiet', args.quiet);
          return envelope(action, async () => {
            const out = args.dry_run === true
              ? await cli.run(argv, opts)
              : await cli.run(argv, opts);
            if (out.code !== 0) throw cli.errorFromResult(out, argv);
            const snapshot = await readSnapshot(cli, opts).catch(() => undefined);
            return {
              data: { stage, to, dryRun: args.dry_run === true, output: out.stdout },
              summary: args.dry_run === true
                ? `预演通过：${stage} → ${to}（未写盘）。`
                : `${stage} 已推进到 ${to}。当前活跃阶段=${snapshot?.focus?.stage ?? '?'} phase=${snapshot?.focus?.phase ?? '?'}`,
              next: snapshot === undefined ? null : snapshotNext(snapshot),
            };
          });
        }
        case 'current':
        case 'overview':
        case 'log':
        case 'metrics':
        case 'retry':
        case 'phases':
        case 'mode': {
          const argv = ['flow', action];
          pushOption(argv, '--stage', args.stage);
          pushOption(argv, '--mode', args.mode);
          pushOption(argv, '--last', args.last);
          pushFlag(argv, '--json', true);
          return envelope(action, async () => {
            const data = await cli.json(argv, opts);
            return { data, summary: `已读取 flow ${action}。` };
          });
        }
        case 'repair': {
          const argv = ['flow', 'repair'];
          pushFlag(argv, '--dry-run', args.dry_run);
          pushFlag(argv, '--backup', args.backup);
          pushFlag(argv, '--prune-orphans', args.prune_orphans);
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return { data: { output: out.text }, summary: args.dry_run === true ? '修复预演完成（未写盘）。' : '修复完成。' };
          });
        }
        case 'migrate': {
          const argv = ['flow', 'migrate'];
          pushFlag(argv, '--dry-run', args.dry_run);
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return { data: { output: out.text }, summary: '旧版 flow.json 迁移完成。' };
          });
        }
        case 'review_add': {
          const argv = ['flow', 'review', 'add'];
          // v1.3.4：op / stage 二选一透传（fast 无 op 场景必须能挂阶段级 REV）
          if (!args.op && !args.stage) {
            throw new FeelError('review_add 需要 op 或 stage 之一', { kind: 'usage', code: 'FEEL_BAD_USAGE' });
          }
          if (args.op) pushOption(argv, '--op', args.op);
          else pushOption(argv, '--stage', args.stage);
          pushOption(argv, '--title', requireArg(args, 'title', action));
          pushOption(argv, '--auto-fix', args.auto_fix);
          if (args.blocking !== undefined) argv.push('--blocking', args.blocking === true ? 'true' : 'false');
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return { data: { output: out.text }, summary: '审查条目已添加。' };
          });
        }
        case 'review_resolve':
        case 'review_remove': {
          const revId = requireArg(args, 'rev_id', action);
          const argv = ['flow', 'review', action === 'review_resolve' ? 'resolve' : 'remove', revId];
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return { data: { revId, output: out.text }, summary: `REV ${revId} 已${action === 'review_resolve' ? '解决' : '删除'}。` };
          });
        }
        case 'review_update': {
          const revId = requireArg(args, 'rev_id', action);
          const argv = ['flow', 'review', 'update', revId];
          pushOption(argv, '--priority', args.priority);
          pushOption(argv, '--title', args.title);
          if (args.blocking !== undefined) argv.push('--blocking', args.blocking === true ? 'true' : 'false');
          if (argv.length === 4) throw new FeelError('review_update 至少需要 priority / title / blocking 之一', { kind: 'usage', code: 'FEEL_BAD_USAGE' });
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return { data: { revId, output: out.text }, summary: `REV ${revId} 已更新。` };
          });
        }
        default:
          throw new FeelError(`未知 action: ${action}`, { kind: 'usage', code: 'FEEL_UNKNOWN_ACTION' });
      }
    },
    presentCall: (args) => presentCall(`Feel 流水线 ${args.action}`, args.action, args.stage ?? args.rev_id),
  };

  /* ══════════════════════════ 4. feel_stage ══════════════════════════ */

  const feelStage = {
    name: 'feel_stage',
    description:
      '工作阶段与 status.md 操作。action=list 列出工作阶段；action=add 添加工作阶段（建目录 + overview/status + 注册 flow.json，这是**唯一完整入口**）；action=status 查看阶段状态；action=set 原子更新 status.md 字段（状态/执行模式/自动推进/责任 Agent/工作流模式）；action=task 勾选或追加任务；action=deps 设置依赖；action=reset 复位相位；action=remove 移除阶段。禁止直接编辑 status.md 或 flow.json。',
    parameters: {
      action: stringEnum(['list', 'add', 'status', 'set', 'task', 'deps', 'reset', 'remove'], '操作。', { required: true }),
      stage: string('阶段 ID（如 v1.2.1-stage-93 或 stage-93）。除 list/add 外必需。'),
      deps: stringArray('依赖阶段 ID 列表（add/deps）。'),
      tasks: stringArray('初始任务列表（add）。'),
      exec_mode: stringEnum(['manual', 'auto'], '执行模式（add/set）。'),
      auto_advance: stringEnum(['enabled', 'disabled'], '自动推进（add/set）。'),
      workflow_mode: stringEnum(MODES, '工作流模式（add/set）。**general 仅需求级合法**，阶段级会被拒绝。'),
      status: stringEnum(['planned', 'review_failed', 'review_passed', 'testing', 'archiving', 'done'], '阶段粗粒度状态（set）。'),
      review_agent: string('当前责任 Agent（set，如 openfeel-executor）。'),
      task_no: integer('任务编号（task 的勾选操作）。', { minimum: 1 }),
      task_add: string('追加一条任务描述（task）。'),
      done: boolean('task：标记为已完成。'),
      undone: boolean('task：标记为未完成。'),
      to: stringEnum(PHASES, 'reset 的目标相位。'),
      dry_run: boolean('仅预览（reset/remove）。'),
      force: boolean('remove 时越过安全校验。'),
      purge: boolean('remove 时同时删除阶段目录（非 TTY 须配 force）。'),
      project: string('项目根目录。'),
    },
    output: { schema: envelopeSchema(), render: renderEnvelope },
    async execute(args, exec) {
      const { cwd } = target(exec, args);
      const action = args.action;
      const opts = { cwd, signal: exec.signal };

      switch (action) {
        case 'list': {
          return envelope(action, async () => {
            const data = await cli.json(['plan', 'stage', 'list', '--json'], opts);
            const stages = Array.isArray(data?.stages) ? data.stages : [];
            return { data, summary: `已列出工作阶段（${stages.length} 个）。` };
          });
        }
        case 'add': {
          const stage = requireArg(args, 'stage', action);
          const argv = ['plan', 'stage', 'add', stage];
          if (Array.isArray(args.deps) && args.deps.length > 0) argv.push('--deps', ...args.deps);
          if (Array.isArray(args.tasks) && args.tasks.length > 0) argv.push('--tasks', ...args.tasks);
          pushOption(argv, '--exec-mode', args.exec_mode);
          pushOption(argv, '--auto-advance', args.auto_advance);
          pushOption(argv, '--workflow-mode', args.workflow_mode);
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return { data: { stage, output: out.text }, summary: `阶段 ${stage} 已添加并注册。` };
          });
        }
        case 'status': {
          const stage = args.stage === undefined ? [] : [requireArg(args, 'stage', action)];
          return envelope(action, async () => {
            const data = await cli.json(['stage', 'status', ...stage, '--json'], opts);
            return { data, summary: '已读取阶段状态。' };
          });
        }
        case 'set': {
          const stage = requireArg(args, 'stage', action);
          const argv = ['stage', 'set', stage];
          pushOption(argv, '--status', args.status);
          pushOption(argv, '--exec-mode', args.exec_mode);
          pushOption(argv, '--auto-advance', args.auto_advance);
          pushOption(argv, '--review-agent', args.review_agent);
          pushOption(argv, '--workflow-mode', args.workflow_mode);
          if (argv.length === 3) throw new FeelError('stage set 至少需要一个字段（status/exec_mode/auto_advance/review_agent/workflow_mode）', { kind: 'usage', code: 'FEEL_BAD_USAGE' });
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return { data: { stage, output: out.text }, summary: `阶段 ${stage} 字段已更新。` };
          });
        }
        case 'task': {
          const stage = requireArg(args, 'stage', action);
          const argv = ['stage', 'task', stage];
          if (args.task_no !== undefined) argv.push(String(args.task_no));
          pushOption(argv, '--add', args.task_add);
          pushFlag(argv, '--done', args.done);
          pushFlag(argv, '--undone', args.undone);
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return { data: { stage, output: out.text }, summary: '阶段任务已更新。' };
          });
        }
        case 'deps': {
          const stage = requireArg(args, 'stage', action);
          const argv = ['flow', 'stage', 'set', stage];
          if (Array.isArray(args.deps) && args.deps.length > 0) argv.push('--deps', ...args.deps);
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return { data: { stage, deps: args.deps ?? [], output: out.text }, summary: `阶段 ${stage} 依赖已${Array.isArray(args.deps) && args.deps.length > 0 ? '设置' : '清空'}。` };
          });
        }
        case 'reset': {
          const stage = requireArg(args, 'stage', action);
          const argv = ['flow', 'stage', 'reset', stage];
          pushOption(argv, '--to', requireArg(args, 'to', action));
          pushFlag(argv, '--dry-run', args.dry_run);
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return { data: { stage, to: args.to, dryRun: args.dry_run === true, output: out.text }, summary: `阶段 ${stage} 相位已复位到 ${args.to}。` };
          });
        }
        case 'remove': {
          const stage = requireArg(args, 'stage', action);
          const argv = ['flow', 'stage', 'remove', stage];
          pushFlag(argv, '--force', args.force);
          pushFlag(argv, '--dry-run', args.dry_run);
          pushFlag(argv, '--purge', args.purge);
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return { data: { stage, output: out.text }, summary: `阶段 ${stage} 已${args.dry_run === true ? '预演移除' : '移除'}。` };
          });
        }
        default:
          throw new FeelError(`未知 action: ${action}`, { kind: 'usage', code: 'FEEL_UNKNOWN_ACTION' });
      }
    },
    presentCall: (args) => presentCall(`Feel 阶段 ${args.action}`, args.action, args.stage),
  };

  /* ══════════════════════════ 5. feel_op ══════════════════════════ */

  const feelOp = {
    name: 'feel_op',
    description:
      '操作方案（op）与执行结果。action=list 列出方案（含状态与模板填充度）；action=create 创建方案（draft）；action=publish 把 draft 发布为 pending；action=rename 改标题；action=remove 注销方案（不删模板文件）；action=register 补注册文件孤儿；action=attempt 记录执行结果 pass/fail（驱动重试计数）；action=retry 查询重试状态。',
    parameters: {
      action: stringEnum(['list', 'create', 'publish', 'rename', 'remove', 'register', 'attempt', 'retry'], '操作。', { required: true }),
      stage: string('阶段 ID。除 retry 外必需。'),
      op: string('操作 ID（如 op-001，或 attempt/retry 用的完整 ID v1.2.1-stage-93.op-001）。'),
      title: string('方案标题（create/rename）。'),
      result: stringEnum(['pass', 'fail'], 'attempt 的执行结果。'),
      project: string('项目根目录。'),
    },
    output: { schema: envelopeSchema(), render: renderEnvelope },
    async execute(args, exec) {
      const { cwd } = target(exec, args);
      const action = args.action;
      const opts = { cwd, signal: exec.signal };

      switch (action) {
        case 'list': {
          const argv = ['flow', 'ops', 'list'];
          pushOption(argv, '--stage', args.stage);
          argv.push('--json');
          return envelope(action, async () => {
            const data = await cli.json(argv, opts);
            return { data, summary: '已列出操作方案。' };
          });
        }
        case 'create': {
          const stage = requireArg(args, 'stage', action);
          const argv = ['plan', 'scheme', 'create', stage];
          pushPositional(argv, args.title);
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return { data: { stage, output: out.text }, summary: `已为 ${stage} 创建操作方案。` };
          });
        }
        case 'publish': {
          const stage = requireArg(args, 'stage', action);
          const op = requireArg(args, 'op', action);
          return envelope(action, async () => {
            const out = await cli.write(['plan', 'scheme', 'publish', stage, op], opts);
            return { data: { stage, op, output: out.text }, summary: `方案 ${op} 已发布为可执行。` };
          });
        }
        case 'rename': {
          const stage = requireArg(args, 'stage', action);
          const op = requireArg(args, 'op', action);
          const argv = ['plan', 'scheme', 'rename', stage, op];
          pushOption(argv, '--title', args.title);
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return { data: { stage, op, output: out.text }, summary: `方案 ${op} 标题已更新。` };
          });
        }
        case 'remove': {
          const stage = requireArg(args, 'stage', action);
          const op = requireArg(args, 'op', action);
          return envelope(action, async () => {
            const out = await cli.write(['plan', 'scheme', 'remove', stage, op], opts);
            return { data: { stage, op, output: out.text }, summary: `方案 ${op} 已注销。` };
          });
        }
        case 'register': {
          const stage = requireArg(args, 'stage', action);
          const argv = ['plan', 'scheme', 'register', stage];
          pushPositional(argv, args.op);
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return { data: { stage, output: out.text }, summary: '文件孤儿方案已补注册。' };
          });
        }
        case 'attempt': {
          const op = requireArg(args, 'op', action);
          const result = requireArg(args, 'result', action);
          return envelope(action, async () => {
            const out = await cli.write(['flow', 'attempt', '--op', op, '--result', result], opts);
            return { data: { op, result, output: out.text }, summary: `已记录 ${op} 执行结果=${result}。` };
          });
        }
        case 'retry': {
          const op = requireArg(args, 'op', action);
          return envelope(action, async () => {
            const data = await cli.json(['flow', 'retry', '--op', op, '--json'], opts);
            const attempts = typeof data?.attempts === 'number' ? data.attempts : 0;
            const max = typeof data?.maxAttempts === 'number' ? data.maxAttempts : 0;
            const exhausted = data?.exhausted === true ? '（重试次数已用尽）' : '';
            return { data, summary: `${op} 重试状态：${data?.state ?? '?'}，${attempts}/${max}${exhausted}。` };
          });
        }
        default:
          throw new FeelError(`未知 action: ${action}`, { kind: 'usage', code: 'FEEL_UNKNOWN_ACTION' });
      }
    },
    presentCall: (args) => presentCall(`Feel 方案 ${args.action}`, args.action, args.op),
  };

  /* ══════════════════════════ 6. feel_req ══════════════════════════ */

  const feelReq = {
    name: 'feel_req',
    description:
      '需求分发系统（openfeel req，7 状态）。action=add 创建需求（ID 自动分配）；list 过滤列表；show 详情；board 看板（7 组固定顺序）；next 推荐下一个可接取需求；claim 认领（占用校验、无 TTL）；release 释放；set 更新白名单字段；link 关联/解绑阶段；advance 显式推进状态（**done 门：非 general 需求须全部关联阶段 done**）；split 拆分（子需求直接入 scheduled，父需求仅留 parent_id 溯源）。',
    parameters: {
      action: stringEnum(['add', 'list', 'show', 'board', 'next', 'claim', 'release', 'set', 'link', 'advance', 'split'], '操作。', { required: true }),
      id: string('需求 ID（如 REQ-001）。show/claim/release/set/advance/split 必需。'),
      title: string('需求标题（add 必需；set 为改标题）。'),
      target_version: string('预估版本（如 v1.3.0；纯展示/过滤维度，非门禁）。'),
      priority: stringEnum(REQ_PRIORITIES, '优先级。'),
      workflow_mode: stringEnum(MODES, '需求级工作流模式（general = 无流水线，仅需求级合法）。'),
      status: stringEnum(REQ_STATUSES, '状态（list 过滤 / set 目标状态）。'),
      owner: string('认领人（claim/next 视角；缺省取 .info.json user → git config user.name）。'),
      limit: integer('next 返回候选上限。', { minimum: 1 }),
      stage: string('阶段 ID（link 必需）。'),
      requirement: string('需求 ID（link 关联用）。'),
      unlink: boolean('link 时解除该阶段的需求关联。'),
      to: stringEnum(REQ_STATUSES, 'advance 的目标状态。'),
      into: stringArray('split 的子需求标题列表（至少一项）。'),
      project: string('项目根目录。'),
    },
    output: { schema: envelopeSchema(), render: renderEnvelope },
    async execute(args, exec) {
      const { cwd } = target(exec, args);
      const action = args.action;
      const opts = { cwd, signal: exec.signal };

      switch (action) {
        case 'add': {
          const argv = ['req', 'add', requireArg(args, 'title', action)];
          pushOption(argv, '--target-version', args.target_version);
          pushOption(argv, '--priority', args.priority);
          pushOption(argv, '--workflow-mode', args.workflow_mode);
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return { data: { output: out.text }, summary: '需求已创建。' };
          });
        }
        case 'list': {
          const argv = ['req', 'list', '--json'];
          pushOption(argv, '--status', args.status);
          pushOption(argv, '--target-version', args.target_version);
          pushOption(argv, '--owner', args.owner);
          return envelope(action, async () => {
            const data = await cli.json(argv, opts);
            const count = Array.isArray(data?.requirements) ? data.requirements.length : 0;
            return { data, summary: `共 ${count} 条需求。` };
          });
        }
        case 'board': {
          const argv = ['req', 'board', '--json'];
          pushOption(argv, '--target-version', args.target_version);
          return envelope(action, async () => {
            const data = await cli.json(argv, opts);
            return { data, summary: '已读取需求看板（7 组固定顺序）。' };
          });
        }
        case 'next': {
          const argv = ['req', 'next', '--json'];
          pushOption(argv, '--owner', args.owner);
          pushOption(argv, '--limit', args.limit);
          return envelope(action, async () => {
            const data = await cli.json(argv, opts);
            const picked = data?.requirement;
            return {
              data,
              summary: picked === undefined || picked === null ? '当前没有可接取的 scheduled 需求。' : `推荐接取 ${picked.id ?? ''} ${picked.title ?? ''}`.trim(),
              next: picked === undefined || picked === null || picked.id === undefined
                ? null
                : { tool: 'feel_req', arguments: { action: 'claim', id: picked.id }, why: '认领该需求以占用，防并发覆盖。' },
            };
          });
        }
        case 'show': {
          const id = requireArg(args, 'id', action);
          return envelope(action, async () => {
            const data = await cli.json(['req', 'show', id, '--json'], opts);
            return { data, summary: `已读取需求 ${id}。` };
          });
        }
        case 'claim': {
          const id = requireArg(args, 'id', action);
          const argv = ['req', 'claim', id];
          pushOption(argv, '--owner', args.owner);
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return { data: { id, output: out.text }, summary: `需求 ${id} 已认领。` };
          });
        }
        case 'release': {
          const id = requireArg(args, 'id', action);
          return envelope(action, async () => {
            const out = await cli.write(['req', 'release', id], opts);
            return { data: { id, output: out.text }, summary: `需求 ${id} 已释放。` };
          });
        }
        case 'set': {
          const id = requireArg(args, 'id', action);
          const argv = ['req', 'set', id];
          pushOption(argv, '--status', args.status);
          pushOption(argv, '--title', args.title);
          pushOption(argv, '--target-version', args.target_version);
          pushOption(argv, '--priority', args.priority);
          pushOption(argv, '--workflow-mode', args.workflow_mode);
          if (argv.length === 3) throw new FeelError('req set 至少需要一个字段（status/title/target_version/priority/workflow_mode）', { kind: 'usage', code: 'FEEL_BAD_USAGE' });
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return { data: { id, output: out.text }, summary: `需求 ${id} 字段已更新。` };
          });
        }
        case 'link': {
          const stage = requireArg(args, 'stage', action);
          const argv = ['req', 'link', '--stage', stage];
          if (args.unlink === true) {
            argv.push('--unlink');
          } else {
            argv.push('--requirement', requireArg(args, 'requirement', action));
          }
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return {
              data: { stage, requirement: args.requirement ?? null, unlinked: args.unlink === true, output: out.text },
              summary: args.unlink === true ? `阶段 ${stage} 需求关联已解除。` : `阶段 ${stage} 已关联需求 ${args.requirement}。`,
            };
          });
        }
        case 'advance': {
          const id = requireArg(args, 'id', action);
          const argv = ['req', 'advance', id];
          pushOption(argv, '--to', requireArg(args, 'to', action));
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return { data: { id, to: args.to, output: out.text }, summary: `需求 ${id} 已推进到 ${args.to}。` };
          });
        }
        case 'split': {
          const id = requireArg(args, 'id', action);
          const into = Array.isArray(args.into) ? args.into.filter((item) => typeof item === 'string' && item.trim() !== '') : [];
          if (into.length === 0) {
            throw new FeelError('req split 需要至少一个 --into 子需求标题', { kind: 'usage', code: 'FEEL_BAD_USAGE' });
          }
          const argv = ['req', 'split', id, '--json'];
          for (const title of into) argv.push('--into', title);
          return envelope(action, async () => {
            const data = await cli.json(argv, opts);
            const children = Array.isArray(data?.children) ? data.children : [];
            return {
              data,
              summary: `需求 ${id} 已拆分为 ${children.length} 个子需求（均已入 scheduled）。`,
              next: children.length === 0 || children[0].id === undefined
                ? null
                : { tool: 'feel_req', arguments: { action: 'next' }, why: '选取下一个可接取的子需求。' },
            };
          });
        }
        default:
          throw new FeelError(`未知 action: ${action}`, { kind: 'usage', code: 'FEEL_UNKNOWN_ACTION' });
      }
    },
    presentCall: (args) => presentCall(`Feel 需求 ${args.action}`, args.action, args.id ?? args.title),
  };

  /* ══════════════════════════ 7. feel_checkpoint ══════════════════════════ */

  const feelCheckpoint = {
    name: 'feel_checkpoint',
    description:
      'Checkpoint 快照管理：相位推进时自动保存 flow.json 快照。action=list 列出快照（可按阶段过滤）；action=restore 从快照恢复（覆盖当前 flow.json，需 force 确认；可用 stage 做选择性回退、dry_run 预览差异）。',
    parameters: {
      action: stringEnum(['list', 'restore'], '操作。', { required: true }),
      stage: string('阶段 ID（list 过滤 / restore 选择性回退）。'),
      checkpoint_file: string('快照文件名（restore 必需，如 v1.2.1-stage-93-20260807T162300-exec_running.json）。'),
      force: boolean('restore 确认（覆盖当前 flow.json）。'),
      dry_run: boolean('restore 仅预览差异。'),
      project: string('项目根目录。'),
    },
    output: { schema: envelopeSchema(), render: renderEnvelope },
    async execute(args, exec) {
      const { cwd } = target(exec, args);
      const action = args.action;
      const opts = { cwd, signal: exec.signal };

      if (action === 'list') {
        const argv = ['flow', 'checkpoint', 'list'];
        pushPositional(argv, args.stage);
        argv.push('--json');
        return envelope(action, async () => {
          const data = await cli.json(argv, opts);
          return { data, summary: '已列出 Checkpoint 快照。' };
        });
      }

      const file = requireArg(args, 'checkpoint_file', action);
      const argv = ['flow', 'checkpoint', 'restore', file];
      pushFlag(argv, '--force', args.force);
      pushOption(argv, '--stage', args.stage);
      pushFlag(argv, '--dry-run', args.dry_run);
      if (args.dry_run !== true && args.force !== true) {
        throw new FeelError('restore 会覆盖当前 flow.json；请显式传 force=true 确认，或先用 dry_run=true 预览差异。', {
          kind: 'usage',
          code: 'FEEL_RESTORE_NEEDS_FORCE',
        });
      }
      return envelope(action, async () => {
        const out = await cli.write(argv, opts);
        return {
          data: { checkpointFile: file, stage: args.stage ?? null, dryRun: args.dry_run === true, output: out.text },
          summary: args.dry_run === true ? '已预览恢复差异（未写盘）。' : `已从 ${file} 恢复 flow.json。`,
        };
      });
    },
    presentCall: (args) => presentCall(`Feel Checkpoint ${args.action}`, args.action, args.checkpoint_file),
  };

  /* ══════════════════════════ 8. feel_archive ══════════════════════════ */

  const feelArchive = {
    name: 'feel_archive',
    description:
      '版本管理。action=list 列出已归档版本；action=show 查看某归档版本；action=create 执行 flow.json 版本分片归档（判据门：该版本全部阶段 done **且** 无 blocking open REV；**无 force 覆盖**；归档后该版本阶段从 flow.json 移除）；action=stage_summary 是**另一个**功能（顶层 openfeel archive <stage>，生成阶段摘要到 .openfeel/log/，不动 flow.json）。v1.2.4 起 stage_summary **拒绝覆盖**已存在的归档文件（`ARCHIVE_EXISTS`，零写盘）；确需覆盖须传 force=true。',
    parameters: {
      action: stringEnum(['list', 'show', 'create', 'stage_summary'], '操作。', { required: true }),
      version: string('版本号（如 v1.2.0；前缀 v 可省略）。show/create 必需。'),
      stage: string('阶段 ID（stage_summary 必需）。'),
      dry_run: boolean('create 仅预览判据与将归档内容，零写盘。'),
      force: boolean('stage_summary 覆盖已存在的归档文件（默认拒绝；覆盖会冲掉既有摘要）。'),
      project: string('项目根目录。'),
    },
    output: { schema: envelopeSchema(), render: renderEnvelope },
    async execute(args, exec) {
      const { cwd } = target(exec, args);
      const action = args.action;
      const opts = { cwd, signal: exec.signal };

      switch (action) {
        case 'list':
          return envelope(action, async () => {
            const data = await cli.json(['flow', 'archive', 'list', '--json'], opts);
            const versions = Array.isArray(data?.versions) ? data.versions : [];
            return { data, summary: `已归档 ${versions.length} 个版本。` };
          });
        case 'show': {
          const version = requireArg(args, 'version', action);
          return envelope(action, async () => {
            const data = await cli.json(['flow', 'archive', 'show', version, '--json'], opts);
            return { data, summary: `已读取归档版本 ${version}。` };
          });
        }
        case 'create': {
          const version = requireArg(args, 'version', action);
          const argv = ['flow', 'archive', version, '--json'];
          pushFlag(argv, '--dry-run', args.dry_run);
          return envelope(action, async () => {
            const data = await cli.json(argv, opts);
            return {
              data,
              summary: args.dry_run === true ? `归档判据预演（${version}）：未写盘。` : `版本 ${version} 已分片归档。`,
            };
          });
        }
        case 'stage_summary': {
          const stage = requireArg(args, 'stage', action);
          return envelope(action, async () => {
            // 出口 #33（json-contract §5）：archive <stage> --json。
            // v1.2.4 起 CLI 会**拒绝覆盖**已存在的归档文件（ARCHIVE_EXISTS / refusal /
            // 零写盘）；force=true 才显式覆盖。这里把拒绝翻译成可操作的提示，
            // 而不是让模型盲目重试。
            const argv = ['archive', stage, '--json'];
            if (args.force === true) argv.push('--force');
            try {
              const data = await cli.json(argv, opts);
              const ops = typeof data?.opsCount === 'number' ? data.opsCount : 0;
              const reviews = typeof data?.reviewsCount === 'number' ? data.reviewsCount : 0;
              return {
                data,
                summary: args.force === true
                  ? `阶段 ${stage} 归档已**覆盖重写**：${ops} 个 op、${reviews} 条 REV。`
                  : `阶段 ${stage} 摘要已归档：${ops} 个 op、${reviews} 条 REV。`,
              };
            } catch (error) {
              if (error instanceof FeelError && error.code === 'ARCHIVE_EXISTS') {
                throw new FeelError(
                  `阶段 ${stage} 的归档文件已存在，OpenFeel 已拒绝覆盖且未写盘。\n`
                    + '如确认要用自动生成的内容**覆盖**既有摘要（会丢失人工整理内容），请以 force=true 重试；'
                    + '否则无需任何操作——既有归档保持不变。',
                  { kind: 'refusal', code: 'ARCHIVE_EXISTS', detail: { ...error.detail, stage } },
                );
              }
              throw error;
            }
          });
        }
        default:
          throw new FeelError(`未知 action: ${action}`, { kind: 'usage', code: 'FEEL_UNKNOWN_ACTION' });
      }
    },
    presentCall: (args) => presentCall(`Feel 版本 ${args.action}`, args.action, args.version),
  };

  /* ══════════════════════════ 9. feel_kb ══════════════════════════ */

  const feelKb = {
    name: 'feel_kb',
    description:
      '知识库（.openfeel/kb/，4 个固定分类）。action=list 按分类列出；action=add 添加条目；action=search 关键词检索（大小写不敏感子串，带高亮）；action=index 索引概览；action=dedup 相似度检查（只读建议，阈值默认 0.8）。沉淀前先去重。',
    parameters: {
      action: stringEnum(['list', 'add', 'search', 'index', 'dedup'], '操作。', { required: true }),
      category: stringEnum(KB_CATEGORIES, '分类（list 过滤 / add 必需 / dedup 限定）。'),
      title: string('条目标题（add 必需）。'),
      content: string('条目内容（add；省略则从 stdin 读，本适配器要求显式提供）。'),
      query: string('搜索关键词（search 必需）。'),
      limit: integer('search 结果上限。', { minimum: 1 }),
      offset: integer('search 偏移量。', { minimum: 0 }),
      threshold: string('dedup 相似度阈值 0~1（默认 0.8）。'),
      project: string('项目根目录。'),
    },
    output: { schema: envelopeSchema(), render: renderEnvelope },
    async execute(args, exec) {
      const { cwd } = target(exec, args);
      const action = args.action;
      const opts = { cwd, signal: exec.signal };

      switch (action) {
        case 'list': {
          const argv = ['knowledge', 'list'];
          pushOption(argv, '--type', args.category);
          argv.push('--json');
          return envelope(action, async () => {
            const data = await cli.json(argv, opts);
            return { data, summary: '已列出知识条目。' };
          });
        }
        case 'add': {
          const category = requireArg(args, 'category', action);
          const title = requireArg(args, 'title', action);
          const argv = ['knowledge', 'add', category, title];
          pushOption(argv, '--content', requireArg(args, 'content', action));
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return { data: { category, title, output: out.text }, summary: `知识条目「${title}」已归档到 ${category}。` };
          });
        }
        case 'search': {
          const query = requireArg(args, 'query', action);
          const argv = ['knowledge', 'search', query];
          pushOption(argv, '--limit', args.limit);
          pushOption(argv, '--offset', args.offset);
          argv.push('--json');
          return envelope(action, async () => {
            const data = await cli.json(argv, opts);
            return { data, summary: `已检索「${query}」。` };
          });
        }
        case 'index':
          return envelope(action, async () => {
            const data = await cli.json(['knowledge', 'index', '--json'], opts);
            return { data, summary: '已读取知识库索引概览。' };
          });
        case 'dedup': {
          const content = requireArg(args, 'content', action);
          const argv = ['knowledge', 'dedup', content];
          pushOption(argv, '--category', args.category);
          pushOption(argv, '--threshold', args.threshold);
          argv.push('--json');
          return envelope(action, async () => {
            const data = await cli.json(argv, opts);
            return { data, summary: '已检查相似知识条目（只读）。' };
          });
        }
        default:
          throw new FeelError(`未知 action: ${action}`, { kind: 'usage', code: 'FEEL_UNKNOWN_ACTION' });
      }
    },
    presentCall: (args) => presentCall(`Feel 知识库 ${args.action}`, args.action, args.query ?? args.title),
  };

  /* ══════════════════════════ 10. feel_verify ══════════════════════════ */

  const feelVerify = {
    name: 'feel_verify',
    description:
      '健康检查与对账。action=health 全面检查 flow.json / 跨文件一致性 / 僵尸状态 / config.yaml（fix=true 时以 flow.json 为权威回写 status.md 的状态字段）；action=lint 项目健康检查（i18n 键一致性 / kb 引用有效性）；action=recover 跨会话上下文恢复（流水线状态、阻塞原因、待处理任务），换会话或中断后先跑它；action=project 结构化项目概览；action=config_get / config_set 读写项目配置（workflow_mode / auto_advance / merge_mode / execution_mode）。',
    parameters: {
      action: stringEnum(['health', 'lint', 'recover', 'project', 'config_get', 'config_set', 'config_effective'], '操作。', { required: true }),
      quick: boolean('health 仅检查关键项。'),
      fix: boolean('health 以 flow.json 为权威回写 status.md 状态字段。'),
      dry_run: boolean('health fix 仅预览。'),
      target: stringEnum(['i18n', 'kb'], 'lint 的目标。'),
      key: string('配置键（config_get/config_set；支持 defaults.X 或 X）。'),
      value: string('配置值（config_set）。'),
      sync_stages: boolean('config_set 时同步写入所有已注册阶段的 status.md。'),
      project: string('项目根目录。'),
    },
    output: { schema: envelopeSchema(), render: renderEnvelope },
    async execute(args, exec) {
      const { cwd } = target(exec, args);
      const action = args.action;
      const opts = { cwd, signal: exec.signal };

      switch (action) {
        case 'health': {
          const argv = ['flow', 'health', '--json'];
          pushFlag(argv, '--quick', args.quick);
          pushFlag(argv, '--fix', args.fix);
          pushFlag(argv, '--dry-run', args.dry_run);
          return envelope(action, async () => {
            const data = await cli.json(argv, opts);
            return { data, summary: '已执行流水线健康检查。' };
          });
        }
        case 'lint': {
          const target = args.target ?? 'kb';
          return envelope(action, async () => {
            const data = await cli.json(['lint', target, '--json'], opts);
            const ok = data?.ok !== false;
            const issues = Array.isArray(data?.issues) ? data.issues.length : 0;
            return { data, summary: `lint ${target} ${ok ? '通过' : '发现问题'}（${issues} 项）。` };
          });
        }
        case 'recover':
          return envelope(action, async () => {
            const data = await cli.json(['flow', 'recover', '--json'], opts);
            const pending = Array.isArray(data?.pendingTasks) ? data.pendingTasks.length : 0;
            const blocked = typeof data?.blockedBy === 'string' && data.blockedBy !== '' ? `，阻塞：${data.blockedBy}` : '';
            return { data, summary: `已恢复跨会话上下文：阶段状态=${data?.stageStatus ?? '(未知)'}，待处理任务 ${pending} 项${blocked}。` };
          });
        case 'project':
          return envelope(action, async () => {
            const data = await cli.json(['project', 'overview', '--json'], opts);
            return { data, summary: '已输出项目概览。' };
          });
        case 'config_get': {
          // v1.2.4 起 `config get` 无 key 不再报 key-required，而是 `--all` 返回全量。
          // 有 key 时保持原行为。
          const argv = ['config', 'get'];
          if (args.key === undefined || args.key === '') {
            argv.push('--all', '--json');
          } else {
            argv.push(args.key, '--json');
          }
          return envelope(action, async () => {
            const data = await cli.json(argv, opts);
            const summary = args.key === undefined || args.key === ''
              ? `已读取全量配置（scope=${data?.scope ?? '?'}）。`
              : `已读取配置 ${args.key} = ${JSON.stringify(data?.value)}（scope=${data?.scope ?? '?'}）。`;
            return { data, summary };
          });
        }
        case 'config_effective': {
          const argv = ['config', 'effective'];
          pushPositional(argv, args.key);
          argv.push('--json');
          return envelope(action, async () => {
            const data = await cli.json(argv, opts);
            return { data, summary: '已读取配置有效值与来源。' };
          });
        }
        case 'config_set': {
          const key = requireArg(args, 'key', action);
          const value = requireArg(args, 'value', action);
          const argv = ['config', 'set', key, value];
          pushFlag(argv, '--sync-stages', args.sync_stages);
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return { data: { key, value, output: out.text }, summary: `配置 ${key} 已设为 ${value}。` };
          });
        }
        default:
          throw new FeelError(`未知 action: ${action}`, { kind: 'usage', code: 'FEEL_UNKNOWN_ACTION' });
      }
    },
    presentCall: (args) => presentCall(`Feel 校验 ${args.action}`, args.action, args.key ?? args.target),
  };

  /* ══════════════════════════ 11. feel_review ══════════════════════════ */

  const feelReview = {
    name: 'feel_review',
    description:
      '审查条目（REV）视图。action=list 列出（可按 op 过滤）；action=accept 验收（标记 closed）。新增/修改/删除请用 feel_flow 的 review_add / review_update / review_remove。blocking 未被显式设为 false 的 open REV 会阻塞进入 done 与版本归档。',
    parameters: {
      action: stringEnum(['list', 'accept'], '操作。', { required: true }),
      op: string('按操作 ID 过滤（list）。'),
      rev_id: string('REV 条目 ID（accept 必需）。'),
      project: string('项目根目录。'),
    },
    output: { schema: envelopeSchema(), render: renderEnvelope },
    async execute(args, exec) {
      const { cwd } = target(exec, args);
      const action = args.action;
      const opts = { cwd, signal: exec.signal };

      if (action === 'list') {
        const argv = ['view', 'list'];
        pushOption(argv, '--op', args.op);
        argv.push('--json');
        return envelope(action, async () => {
          const data = await cli.json(argv, opts);
          const total = Array.isArray(data?.reviews) ? data.reviews.length : Array.isArray(data?.items) ? data.items.length : 0;
          return { data, summary: `已列出审查条目（${total} 条）。` };
        });
      }

      const revId = requireArg(args, 'rev_id', action);
      return envelope(action, async () => {
        const out = await cli.write(['view', 'accept', revId], opts);
        return { data: { revId, output: out.text }, summary: `REV ${revId} 已验收（closed）。` };
      });
    },
    presentCall: (args) => presentCall(`Feel 审查 ${args.action}`, args.action, args.rev_id),
  };

  /* ══════════════════════════ 12. feel_plan ══════════════════════════ */

  const feelPlan = {
    name: 'feel_plan',
    description:
      '计划与路线图。action=stage_add 是 feel_stage.add 的别名（完整入口）；action=stage_list 列出工作阶段；action=scheme_list 列出操作方案；action=roadmap_create 创建版本分期大纲；action=roadmap_show 查看大纲；action=instructions 为指定 artifact 生成结构化指令（XML 或 JSON）。',
    parameters: {
      action: stringEnum(['stage_list', 'scheme_list', 'roadmap_create', 'roadmap_show', 'instructions'], '操作。', { required: true }),
      stage: string('阶段 ID（scheme_list 过滤）。'),
      version: string('版本号（roadmap_create 必需，如 1.0；roadmap_show 可选）。'),
      artifact: string('artifact ID（instructions 必需，如 proposal / implementation）。'),
      change: string('变更名称（instructions 的 --change）。'),
      json: boolean('instructions 以 JSON 输出。'),
      project: string('项目根目录。'),
    },
    output: { schema: envelopeSchema(), render: renderEnvelope },
    async execute(args, exec) {
      const { cwd } = target(exec, args);
      const action = args.action;
      const opts = { cwd, signal: exec.signal };

      switch (action) {
        case 'stage_list':
          return envelope(action, async () => {
            const data = await cli.json(['plan', 'stage', 'list', '--json'], opts);
            const stages = Array.isArray(data?.stages) ? data.stages : [];
            return { data, summary: `已列出工作阶段（${stages.length} 个）。` };
          });
        case 'scheme_list': {
          const argv = ['plan', 'scheme', 'list'];
          pushPositional(argv, args.stage);
          argv.push('--json');
          return envelope(action, async () => {
            const data = await cli.json(argv, opts);
            return { data, summary: '已列出操作方案。' };
          });
        }
        case 'roadmap_create': {
          const version = requireArg(args, 'version', action);
          return envelope(action, async () => {
            const out = await cli.write(['roadmap', 'create', version], opts);
            return { data: { version, output: out.text }, summary: `已创建 ${version} 分期大纲。` };
          });
        }
        case 'roadmap_show': {
          const argv = ['roadmap', 'show'];
          pushPositional(argv, args.version);
          argv.push('--json');
          return envelope(action, async () => {
            const data = await cli.json(argv, opts);
            const milestones = Array.isArray(data?.milestones) ? data.milestones.length : 0;
            // 不传版本时 CLI 返回空态 { version: null, milestones: [] }（不自动发现版本）。
            const summary = data?.version === null || data?.version === undefined
              ? '未指定版本：roadmap show --json 不自动发现版本，请显式传 version。'
              : `已读取 ${data.version} 分期大纲（${milestones} 个里程碑）。`;
            return { data, summary };
          });
        }
        case 'instructions': {
          const artifact = requireArg(args, 'artifact', action);
          const argv = ['instructions', artifact];
          pushOption(argv, '--change', args.change);
          pushFlag(argv, '--json', args.json);
          return envelope(action, async () => {
            // `instructions` 默认产出 XML 文本；显式 json=true 时按 JSON 解析，
            // 避免把结构化结果当字符串塞给模型。
            if (args.json === true) {
              const data = await cli.json(argv, opts);
              return { data, summary: `已生成 ${artifact} 的结构化指令（JSON）。` };
            }
            const out = await cli.text(argv, opts);
            return { data: { artifact, format: 'xml', output: out.text }, summary: `已生成 ${artifact} 的结构化指令（XML）。` };
          });
        }
        default:
          throw new FeelError(`未知 action: ${action}`, { kind: 'usage', code: 'FEEL_UNKNOWN_ACTION' });
      }
    },
    presentCall: (args) => presentCall(`Feel 计划 ${args.action}`, args.action, args.artifact ?? args.version),
  };

  /* ══════════════════════════ 13. feel_model ══════════════════════════ */

  const feelModel = {
    name: 'feel_model',
    description:
      'Agent 模型配置（三层级：default / global / project）。action=list 列出所有 agent 的模型；action=get 读取某 agent 的模型；action=set 设置某 agent 的模型。注意：这是 OpenFeel 的**模型意识**配置，不改变 DSH 实际使用的模型；用户主权键 model 在部署时永不被覆盖。',
    parameters: {
      action: stringEnum(['list', 'get', 'set'], '操作。', { required: true }),
      agent: string('Agent ID（get/set 必需，如 openfeel-executor）。'),
      model: string('模型 ID（set 必需，如 deepseek/deepseek-flash）。'),
      scope: stringEnum(['default', 'global', 'project'], '层级，缺省 project。'),
      project: string('项目根目录。'),
    },
    output: { schema: envelopeSchema(), render: renderEnvelope },
    async execute(args, exec) {
      const { cwd } = target(exec, args);
      const action = args.action;
      const opts = { cwd, signal: exec.signal };

      switch (action) {
        case 'list': {
          const argv = ['model', 'list'];
          pushOption(argv, '--scope', args.scope);
          argv.push('--json');
          return envelope(action, async () => {
            const data = await cli.json(argv, opts);
            const agents = Array.isArray(data?.agents) ? data.agents.length : 0;
            // scope 为 null 表示「未指定层级 → 展示生效值」，不是缺失。
            const scopeLabel = data?.scope === null || data?.scope === undefined
              ? '生效值（未指定层级）'
              : String(data.scope);
            return { data, summary: `已列出 agent 模型配置（${agents} 个，scope=${scopeLabel}）。` };
          });
        }
        case 'get': {
          const agent = requireArg(args, 'agent', action);
          const argv = ['model', 'get', agent];
          pushOption(argv, '--scope', args.scope);
          argv.push('--json');
          return envelope(action, async () => {
            const data = await cli.json(argv, opts);
            const summary = data?.model === null || data?.model === undefined
              ? `${agent} 未配置模型（未命中任何层级）。`
              : `${agent} 的模型：${data.model}（provider=${data.provider ?? '?'}，来源=${data.source ?? '?'}）。`;
            return { data, summary };
          });
        }
        case 'set': {
          const agent = requireArg(args, 'agent', action);
          const model = requireArg(args, 'model', action);
          const argv = ['model', 'set', agent, model];
          pushOption(argv, '--scope', args.scope);
          return envelope(action, async () => {
            const out = await cli.write(argv, opts);
            return { data: { agent, model, output: out.text }, summary: `${agent} 的模型已设为 ${model}。` };
          });
        }
        default:
          throw new FeelError(`未知 action: ${action}`, { kind: 'usage', code: 'FEEL_UNKNOWN_ACTION' });
      }
    },
    presentCall: (args) => presentCall(`Feel 模型 ${args.action}`, args.action, args.agent),
  };

  return [
    feelStatus,
    feelNext,
    feelFlow,
    feelStage,
    feelOp,
    feelReq,
    feelCheckpoint,
    feelArchive,
    feelKb,
    feelVerify,
    feelReview,
    feelPlan,
    feelModel,
    // 注册表既不编译也不校验 parameters（本插件不经 defineTool），
    // 因此在交给注册表前统一转成子集接受的裸 JSON Schema。
  ].map((tool) => ({ ...tool, parameters: compileParameters(tool.parameters) }));
}

/**
 * 从快照推导建议的下一步（内部复用）。
 * @param {Record<string, any>} snapshot
 * @returns {{ tool: string, arguments: any, why: string } | null}
 */
function snapshotNext(snapshot) {
  const plan = planNextStep(snapshot);
  if (plan.toolCall === null || plan.toolCall === undefined) return null;
  return { tool: plan.toolCall.tool, arguments: plan.toolCall.arguments, why: `推进到 ${plan.toolCall.arguments.to}` };
}

export { PHASES, MODES, TIERS, REQ_STATUSES, KB_CATEGORIES, legalNextPhases };
