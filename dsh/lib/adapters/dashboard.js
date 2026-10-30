/**
 * OpenFeel × DSH 适配器 — 状态快照（复合只读视图）
 *
 * v1.2.3 起，「阶段 → 负责 Agent / 相位标签 / 合法下一相位 / 守卫 / 阻塞审查」
 * 的**决策权威在 CLI**：优先消费 `openfeel flow next --json`（v1.2.2 起的出口 #19），
 * 失败时回退到 `openfeel flow status --json` + `openfeel flow mode --json`。
 * 适配器**不再维护相位 → Agent 的本地镜像**，避免 OpenFeel 调整 Agent 编制后静默漂移。
 *
 * 关键纪律（来自 OpenFeel 的 feel 角色定义）：
 * - `pipeline.phase` 只是宏观态；**调度目标是 `phase != 'done'` 的活跃阶段**。
 * - 合法转移必须从**该阶段自己的模式**解析，而不是全局默认。
 */

import { FeelError } from './cli.js';

/** 15 个合法流水线相位（`flow phases --json.phases`）。 */
export const PIPELINE_PHASES = /** @type {const} */ ([
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
]);

/**
 * 相位前缀 → checkpoint 字段名（`pipeline.yaml` 的 `checkpoint_mapping`）。
 * @type {Record<string, string>}
 */
export const CHECKPOINT_OF_PHASE = {
  plan_pending: 'plan',
  plan_review: 'plan',
  plan_passed: 'plan',
  scheme_pending: 'scheme',
  scheme_review: 'scheme',
  scheme_passed: 'scheme',
  exec_running: 'exec',
  review_pending: 'review',
  review_failed: 'review',
  review_passed: 'review',
  test_pending: 'test',
  test_failed: 'test',
  test_passed: 'test',
  archiving: 'archive',
  done: 'archive',
};

/**
 * 各工作流模式**不可达**的相位（用于向 agent 解释「为什么这条链没走」）。
 * @type {Record<string, string[]>}
 */
export const MODE_SKIPPED_PHASES = {
  full: [],
  fast: ['scheme_pending', 'scheme_review', 'scheme_passed', 'test_pending', 'test_failed', 'test_passed'],
  general: [...PIPELINE_PHASES],
};

/**
 * 解析某一相位在指定模式下的合法下一相位。
 *
 * @param {string} phase 当前相位。
 * @param {Record<string, string[]> | undefined} transitions 该模式的转移表。
 * @returns {string[]}
 */
export function legalNextPhases(phase, transitions) {
  if (transitions === undefined) return [];
  const direct = transitions[phase];
  if (Array.isArray(direct)) return direct;

  // 支持 `|` 组合键：`'review_passed|test_passed': ['archiving']`。
  /** @type {Set<string>} */
  const merged = new Set();
  for (const [key, targets] of Object.entries(transitions)) {
    if (!key.includes('|')) continue;
    const conditions = key.split('|').map((part) => part.trim());
    if (!conditions.includes(phase)) continue;
    for (const target of targets) merged.add(target);
  }
  return [...merged];
}

/**
 * 读取状态快照。
 *
 * 并发发起 CLI 调用：
 * - `flow next --json`：调度决策的**权威来源**（v1.2.2+）；旧版 CLI 或单次失败时
 *   不阻断快照，自动回退到 `flow status` / `flow mode`。
 * - `flow status --json` 与 `flow mode --json`：阶段列表、模式与转移表（必需事实）。
 * - `req list --json`：仅在 `withRequirements` 时附带。
 *
 * @param {import('./cli.js').FeelCli} cli 已锚定 cwd 的执行器。
 * @param {object} [options]
 * @param {AbortSignal} [options.signal]
 * @param {boolean} [options.withRequirements] 是否附带需求概览。
 * @returns {Promise<Record<string, any>>}
 */
export async function readSnapshot(cli, options = {}) {
  // `flow next` 是权威决策出口；失败（旧版 CLI / 未初始化 / 单次故障）时降级，
  // 但取消信号必须继续向上传播。
  const nextPromise = cli.json(['flow', 'next', '--json'], options).catch((error) => {
    if (options.signal?.aborted === true) throw error;
    return undefined;
  });

  const tasks = [
    cli.json(['flow', 'status', '--json'], options),
    cli.json(['flow', 'mode', '--json'], options),
    nextPromise,
  ];
  if (options.withRequirements === true) {
    tasks.push(cli.json(['req', 'list', '--json'], options));
  }

  const [status, mode, nextDoc, reqs] = await Promise.all(tasks);

  if (status === undefined || typeof status !== 'object') {
    throw new FeelError('openfeel flow status --json 未返回对象', {
      kind: 'internal',
      code: 'FEEL_BAD_STATUS',
    });
  }

  const next = isRecord(nextDoc) ? nextDoc : undefined;
  const pipelinePhase = status.pipeline?.phase ?? '';
  const stages = Array.isArray(status.stages) ? status.stages : [];

  // 调度目标是第一个未完成的阶段（OpenFeel 多阶段独立状态机）。
  const activeStage = stages.find((stage) => stage.phase !== 'done');
  const currentStageId = status.pipeline?.current?.stage ?? '';
  const currentOpId = status.pipeline?.current?.op ?? '';

  // `flow next` 指向 CLI 认为的当前阶段；缺失时回退到活跃阶段。
  const nextStageId = typeof next?.stage === 'string' && next.stage !== '' ? next.stage : '';
  const focusStageId = nextStageId !== '' ? nextStageId : (activeStage?.id ?? currentStageId);
  const focusStage = stages.find((stage) => (stage.id ?? stage.name) === focusStageId) ?? activeStage;

  const modeName = typeof mode?.mode === 'string' ? mode.mode : 'fast';
  const modeSource = typeof mode?.source === 'string' ? mode.source : 'unknown';
  const modes = mode?.modes ?? {};
  const transitions = modes[modeName] ?? {};

  // 以活跃阶段自己的模式为准（阶段级覆盖优先于需求级/项目级）。
  // v1.2.3 的 status 字段名为 workflowMode；保留 snake_case 读取以兼容旧版。
  const activeStageMode = firstString(
    focusStage?.workflowMode,
    focusStage?.workflow_mode,
    next?.workflowMode,
    modeName,
  );
  const activeTransitions = modes[activeStageMode] ?? transitions;
  const nextPhase = typeof next?.phase === 'string' && next.phase !== '' ? next.phase : '';
  // 无活跃阶段时 flow next 的 phase 为 null；快照统一用空串表示「无阶段」，
  // 不回退到 pipeline.phase（宏观态 done 不等于有可调度阶段）。
  const focusPhase = nextPhase !== '' ? nextPhase : (focusStage?.phase ?? '');
  // flow next 在场时 workflowMode 也是权威值（无活跃阶段为 null）；否则按阶段/全局派生。
  const focusWorkflowMode = next !== undefined
    ? (typeof next.workflowMode === 'string' ? next.workflowMode : null)
    : activeStageMode;
  // 合法下一相位必须来自 CLI：优先 flow next；回退时用 CLI 下发的转移表推导。
  const nextPhases = Array.isArray(next?.legalNextPhases)
    ? next.legalNextPhases.filter((phase) => typeof phase === 'string')
    : legalNextPhases(focusPhase, activeTransitions);

  return {
    schemaVersion: 1,
    project: {
      root: cli.cwd ?? '',
      initialized: true,
    },
    pipeline: {
      /** 宏观态：active / paused / done（仅作元信息）。 */
      phase: pipelinePhase,
      currentStage: currentStageId,
      currentOp: currentOpId,
      totalStages: stages.length,
      activeStageCount: stages.filter((stage) => stage.phase !== 'done').length,
      doneStageCount: stages.filter((stage) => stage.phase === 'done').length,
    },
    focus: {
      stage: focusStageId,
      phase: focusPhase,
      /** 相位标签由 `flow next` 下发；无权威值时退化为相位名（不维护本地映射）。 */
      phaseLabel: typeof next?.phaseLabel === 'string' ? next.phaseLabel : focusPhase,
      status: focusStage?.status ?? '',
      deps: Array.isArray(focusStage?.deps) ? [...focusStage.deps] : [],
      ops: focusStage?.ops ?? {},
      checkpoint: CHECKPOINT_OF_PHASE[focusPhase] ?? '',
      /** 负责该相位的 Agent（CLI 权威字段；无 flow next 时为 unknown）。 */
      responsibleAgent: typeof next?.responsibleAgent === 'string' ? next.responsibleAgent : 'unknown',
      /** 阶段生效工作流模式（flow next / flow status 权威字段）。 */
      workflowMode: focusWorkflowMode,
      reviewTier: typeof next?.reviewTier === 'string' ? next.reviewTier : (focusStage?.reviewTier ?? null),
      effectiveReviewTier: typeof next?.effectiveReviewTier === 'string'
        ? next.effectiveReviewTier
        : (focusStage?.effectiveReviewTier ?? null),
      /** 该阶段在当前模式下的合法下一相位（CLI 权威；回退用 CLI 转移表推导）。 */
      legalNextPhases: nextPhases,
      /** 建议的推进命令（flow next 权威字段，空集为 null）。 */
      suggestedCommand: typeof next?.suggestedCommand === 'string' ? next.suggestedCommand : null,
      /** 守卫提示（flow next 权威字段）。 */
      guards: Array.isArray(next?.guards) ? next.guards.filter((guard) => typeof guard === 'string') : [],
      /** 当前阶段域内 blocking open REV（flow next 权威字段）。 */
      blockingReviews: Array.isArray(next?.blockingReviews) ? next.blockingReviews : [],
      /** 决策来源：flow next（权威）或 flow status（降级）。 */
      source: next === undefined ? 'flow status' : 'flow next',
    },
    mode: {
      /** 当前解析出的模式（按当前阶段派生）。 */
      current: modeName,
      /** 模式来源：status.md / requirement / config.yaml / profile.yaml / builtin。 */
      source: modeSource,
      /** 活跃阶段自身记录的模式（阶段级覆盖）。 */
      activeStageMode,
      /** 该模式下不可达的相位。 */
      skippedPhases: MODE_SKIPPED_PHASES[activeStageMode] ?? [],
      /** 全部三种模式的转移表（供 agent 自查）。 */
      transitionsByMode: modes,
    },
    stages: stages.map((stage) => ({
      id: stage.id ?? stage.name ?? '',
      phase: stage.phase ?? '',
      status: stage.status ?? '',
      deps: Array.isArray(stage.deps) ? [...stage.deps] : [],
      workflowMode: stage.workflowMode ?? stage.workflow_mode ?? null,
      requirementId: stage.requirementId ?? null,
      reviewTier: stage.reviewTier ?? null,
      effectiveReviewTier: stage.effectiveReviewTier ?? null,
      opsSummary: isRecord(stage.opsSummary) ? stage.opsSummary : summarizeOps(stage.ops),
    })),
    ...(reqs === undefined ? {} : { requirements: summarizeRequirements(reqs) }),
  };
}

/**
 * 取第一个非空字符串。
 * @param {...unknown} values
 * @returns {string}
 */
function firstString(...values) {
  for (const value of values) {
    if (typeof value === 'string' && value !== '') return value;
  }
  return '';
}

/**
 * 判定是否为普通对象（排除 null 与数组）。
 * @param {unknown} value
 * @returns {value is Record<string, any>}
 */
function isRecord(value) {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * 汇总一个阶段的 op 状态计数与逐条状态。
 * @param {unknown} ops
 * @returns {{ total: number, byState: Record<string, number>, entries: Record<string, string> }}
 */
export function summarizeOps(ops) {
  if (typeof ops !== 'object' || ops === null || Array.isArray(ops)) {
    return { total: 0, byState: {}, entries: {} };
  }
  /** @type {Record<string, number>} */
  const byState = {};
  /** @type {Record<string, string>} */
  const entries = {};
  for (const [id, state] of Object.entries(ops)) {
    const value = typeof state === 'string' ? state : String(state);
    entries[id] = value;
    byState[value] = (byState[value] ?? 0) + 1;
  }
  return { total: Object.keys(entries).length, byState, entries };
}

/**
 * 汇总需求列表。
 * @param {any} payload `req list --json` 的返回。
 * @returns {{ total: number, byStatus: Record<string, number>, unclaimed: string[], nextCandidates: string[] }}
 */
export function summarizeRequirements(payload) {
  const list = Array.isArray(payload?.requirements) ? payload.requirements : [];
  /** @type {Record<string, number>} */
  const byStatus = {};
  /** @type {string[]} */
  const unclaimed = [];
  /** @type {string[]} */
  const nextCandidates = [];

  for (const item of list) {
    const status = typeof item?.status === 'string' ? item.status : 'unknown';
    byStatus[status] = (byStatus[status] ?? 0) + 1;
    const owner = item?.owner;
    if ((owner === undefined || owner === null || owner === '') && status === 'scheduled') {
      unclaimed.push(item.id);
      nextCandidates.push(item.id);
    }
  }

  return { total: list.length, byStatus, unclaimed, nextCandidates };
}

/**
 * 计算「下一步该做什么」的建议。
 *
 * 这是 Feel 角色的核心决策：**该谁做**。返回值刻意包含三种交付形态：
 * - `cli`：可直接执行的 OpenFeel 命令（人读 / 兜底）。
 * - `toolCall`：本适配器推荐的工具调用（agent 首选）。
 * - `handoff`：OpenFeel 的 Agent 交接标记（下游 subagent 路由）。
 *
 * `phaseLabel` / `responsibleAgent` / `legalNextPhases` / `guards` /
 * `blockingReviews` / `suggestedCommand` 均直接来自快照（即 CLI 权威字段）；
 * 适配器只额外补充 `adapterHints`（与门禁无关的交互提醒），不覆盖 CLI 守卫。
 *
 * @param {Record<string, any>} snapshot `readSnapshot` 的结果。
 * @returns {Record<string, any>}
 */
export function planNextStep(snapshot) {
  const focus = snapshot.focus ?? {};
  const phase = focus.phase ?? '';
  const stage = focus.stage ?? '';
  const agent = focus.responsibleAgent ?? 'unknown';
  const stageMode = focus.workflowMode ?? snapshot.mode?.activeStageMode ?? 'fast';
  const guards = Array.isArray(focus.guards) ? focus.guards : [];

  // 无活跃阶段：CLI 约定 responsibleAgent=feel，phase/stage 为 null。
  if (phase === '' || phase === null) {
    const allDone = snapshot.pipeline?.activeStageCount === 0;
    return {
      phase: phase ?? '',
      stage: stage ?? '',
      phaseLabel: focus.phaseLabel ?? '',
      responsibleAgent: agent,
      workflowMode: focus.workflowMode ?? null,
      reviewTier: focus.reviewTier ?? null,
      effectiveReviewTier: focus.effectiveReviewTier ?? null,
      summary: allDone
        ? '无活跃阶段：所有阶段已完成。可考虑版本归档（feel_archive action=create）或接取新需求（feel_req action=next）。'
        : `当前阶段 "${stage}" 已完成；flow.current 尚未指向新阶段。使用 feel_stage action=list 选择下一个未完成阶段。`,
      legalNextPhases: [],
      suggestedCommand: focus.suggestedCommand ?? null,
      guards,
      adapterHints: [],
      cli: focus.suggestedCommand ?? (allDone ? 'openfeel flow status' : 'openfeel plan stage list'),
      toolCall: null,
      handoff: null,
    };
  }

  const nextPhases = Array.isArray(focus.legalNextPhases) ? focus.legalNextPhases : [];
  /** @type {string[]} */
  const adapterHints = [];
  if (phase === 'plan_passed' && stageMode !== 'general') {
    adapterHints.push('若项目 auto_advance=disabled（手动执行模式），推进前必须询问用户是否开启自动推进。');
  }
  if (phase === 'review_failed' || phase === 'test_failed') {
    adapterHints.push('失败回环：决定「重试 / 回退重定方案 / 请求人工介入」，并把结论记入 REV 条目。');
  }

  const cliCommand = typeof focus.suggestedCommand === 'string' && focus.suggestedCommand !== ''
    ? focus.suggestedCommand
    : `openfeel flow advance --stage ${stage} --to <${nextPhases[0] ?? 'phase'}>`;

  return {
    phase,
    stage,
    phaseLabel: focus.phaseLabel ?? phase,
    responsibleAgent: agent,
    workflowMode: focus.workflowMode ?? null,
    reviewTier: focus.reviewTier ?? null,
    effectiveReviewTier: focus.effectiveReviewTier ?? null,
    summary: `阶段 "${stage}" 处于 ${phase}（${focus.phaseLabel ?? phase}）→ 由 ${agent} 负责。`,
    legalNextPhases: nextPhases,
    suggestedCommand: focus.suggestedCommand ?? null,
    guards,
    adapterHints,
    cli: cliCommand,
    toolCall: nextPhases.length === 0
      ? null
      : { tool: 'feel_flow', arguments: { action: 'advance', stage, to: nextPhases[0] } },
    /** OpenFeel 的交接标记；DSH 侧建议配合 `subagent` 工具派发。 */
    handoff: agent === 'none' || agent === 'unknown' ? null : `[HANDOFF: ${agent}]`,
  };
}
