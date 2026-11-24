/**
 * 动作型 next + 每步提醒（v1.6.0 / T10，REQ-060）
 *
 * 两个职责，都是**纯投影**（不做 I/O、不跑 CLI）：
 *
 * 1. `deriveNextAction(snapshot)`：把「下一步该 who do what」变成可执行动作
 *    （`dispatch` / `command` / `idle`），由 `feel_status` / `feel_next` 返回。
 *    旧 `next` 字符串/对象保留（不破坏既有断言），内容改成动作型。
 * 2. 运行时提醒：`rememberFocus()` 由工具层在读到快照时喂入，
 *    `noteToolCall()` 由 `dsh/lib/index.js` 的 `tools/post-execute` 观察者喂入，
 *    `reminderText()` 供 `ctx.systemPrompt.context()` 每请求取值。
 *
 * 为什么提醒走 `systemPrompt.context` 而不是 `additionalContexts`：
 * `tools/post-execute` + `additionalContexts` 在宿主侧确实存在（`dsh-tools/src/events.ts`、
 * `contracts.ts` 的 `PostToolDecision.additionalContexts`），但 `additionalContexts`
 * 的元素必须是 `UserMessage`，只能由 `@deepseek-ai/dsh-llm` 的 `createUserMessage()`
 * 构造；本适配器零运行时依赖（`dsh/package.json` 无 dependencies），实测
 * `createRequire(...).resolve('@deepseek-ai/dsh-llm')` → `MODULE_NOT_FOUND`。
 * 手搓一个 `source.kind` 未注册的 UserMessage 会流进 `agent/inbox/spliced` 持久事件，
 * 无运行时证据前不能赌它不破坏会话。故按 plan §5.3 降级 1：`systemPrompt.context`
 * （动态 user 快照、逐请求刷新），post-execute 只做**观察**（不构造消息、不改结果）。
 * 证据见 `.openfeel/tmp/stage-132/spike.md`。
 *
 * @module openfeel-dsh/adapters/next-action
 */

import { buildDispatchTemplate } from './dispatch.js';

/** 提醒上下文名（`ctx.systemPrompt.context` 的唯一标识；重名会抛错）。 */
export const REMINDER_CONTEXT_NAME = 'openfeel-feel-next';

/** 每 N 步至少提醒一次（plan §5.3：写类工具之后 + 每 5 步）。 */
export const REMINDER_EVERY_STEPS = 5;

/**
 * 当前阶段是否「开启」（phase 非空且非 done）。
 * @param {unknown} phase
 * @returns {boolean}
 */
function isOpenPhase(phase) {
  return typeof phase === 'string' && phase !== '' && phase !== 'done';
}

/**
 * 取当前阶段关联需求。
 *
 * 与 `dispatch.js` 同源口径（优先 CLI 交接标记，回退阶段条目的 `requirementId`），
 * 但这里不 import `requirementOf`（它未导出），保持两份实现的字段读取一致即可。
 * @param {Record<string, any>} snapshot
 * @returns {string}
 */
function requirementOf(snapshot) {
  const fromRecovery = snapshot?.recovery?.requirement;
  if (typeof fromRecovery === 'string' && fromRecovery !== '') return fromRecovery;
  const stageId = snapshot?.focus?.stage;
  const stages = Array.isArray(snapshot?.stages) ? snapshot.stages : [];
  const stage = stages.find((entry) => entry?.id === stageId || entry?.name === stageId);
  return typeof stage?.requirementId === 'string' ? stage.requirementId : '';
}

/**
 * 相位 → 默认负责角色（只用于「本相位缺哪个角色」的判定，不替代 CLI 权威）。
 * @param {string} phase
 * @param {string} responsibleAgent
 * @returns {string} planner | executor | reviewer | tester | archiver | ''
 */
function roleForPhase(phase, responsibleAgent) {
  const byPhase =
    phase.startsWith('plan_') ? 'planner'
      : phase.startsWith('scheme_') ? 'planner'
        : phase === 'exec_running' ? 'executor'
          : phase.startsWith('review_') ? 'reviewer'
            : phase.startsWith('test_') ? 'tester'
              : phase === 'archiving' ? 'archiver'
                : '';
  if (byPhase !== '') return byPhase;
  // CLI 的 responsibleAgent 形如 `openfeel-executor` / `feel-tester`，截取末段对齐角色闭集
  const tail = typeof responsibleAgent === 'string' ? responsibleAgent.split('-').pop() : '';
  return ['planner', 'schemer', 'executor', 'reviewer', 'tester', 'archiver'].includes(tail ?? '')
    ? (tail === 'schemer' ? 'planner' : tail)
    : '';
}

/**
 * 构造一条 `command` 动作。
 * @param {string} tool
 * @param {Record<string, any>} args
 * @param {string} goal
 * @param {string} reason
 * @returns {{ kind: 'command', tool: string, args: Record<string, any>, goal: string, prompt: string, reason: string }}
 */
function command(tool, args, goal, reason) {
  return {
    kind: 'command',
    tool,
    args,
    goal,
    prompt: `调用 \`${tool}\`：${JSON.stringify(args)}。为什么：${reason}`,
    reason,
  };
}

/**
 * 构造一条 `idle` 动作（无可执行步骤）。
 * @param {string} reason
 * @returns {{ kind: 'idle', tool: null, args: {}, goal: string, prompt: string, reason: string }}
 */
function idle(reason) {
  return { kind: 'idle', tool: null, args: {}, goal: '', prompt: '', reason };
}

/**
 * 由快照派生「下一步该做什么」——三态：`dispatch` / `command` / `idle`。
 *
 * 判定顺序（先阻塞项，后推进项）：
 * 1. 无开启阶段 → `command`（开阶段；门禁自检失败时先修门禁）；
 * 2. 本相位派发台账缺当前角色 / 尚无记录 → `dispatch`（`subagent` + `feel_dispatch` 记账）；
 * 3. `exec_running` 且已派发 → `idle`（阶段是版本容器，不催推进；等子 agent 回报或继续派发下一任务）；
 * 4. 其它相位有合法下一相位 → `command`（`feel_flow action=advance`）；
 * 5. 兜底 → `idle`。
 *
 * @param {Record<string, any>} snapshot `readSnapshot()` 结果（缺失字段按空处理）
 * @returns {{ kind: 'dispatch'|'command'|'idle', tool: string|null, args: Record<string, any>, goal: string, prompt: string, reason: string }}
 */
export function deriveNextAction(snapshot) {
  const focus = snapshot?.focus ?? {};
  const stage = typeof focus.stage === 'string' ? focus.stage : '';
  const phase = typeof focus.phase === 'string' ? focus.phase : '';
  const phaseLabel = typeof focus.phaseLabel === 'string' && focus.phaseLabel !== '' ? focus.phaseLabel : phase;
  const agent = typeof focus.responsibleAgent === 'string' && focus.responsibleAgent !== ''
    ? focus.responsibleAgent
    : 'openfeel-executor';
  const requirement = requirementOf(snapshot);
  const legal = Array.isArray(focus.legalNextPhases) ? focus.legalNextPhases : [];
  const suggested = typeof focus.suggestedCommand === 'string' && focus.suggestedCommand !== ''
    ? focus.suggestedCommand
    : '';

  /* 1) 没有开启阶段：先开阶段（门禁自检失败时先修门禁，别急着建阶段）。 */
  if (!isOpenPhase(phase)) {
    const gate = snapshot?.workflowGate;
    if (gate !== null && gate !== undefined && typeof gate === 'object' && gate.required === true
      && typeof gate.reason === 'string' && gate.reason.startsWith('guard-')) {
      return command(
        'feel_status',
        { action: 'status' },
        '核对写入门禁状态',
        `写入门禁不可信（${gate.reason}）：先按 guard 段的修复动作处理，再安排阶段。`,
      );
    }
    return command(
      'feel_stage',
      { action: 'add', workflow_mode: 'full', exec_mode: 'auto' },
      '按当前小版本开一个阶段（保持 exec_running）',
      '没有开启阶段（phase 为空或 done）：先开阶段，再在版本下建需求；阶段是版本容器，完成需求不推进阶段。',
    );
  }

  /* 2) 本相位缺派发记录：必须先派子 agent（这是「调度者不是执行者」的唯一检查点）。 */
  const ledger = snapshot?.dispatch;
  const sincePhase = Number.isFinite(ledger?.sincePhase) ? ledger.sincePhase : 0;
  const missingRoles = Array.isArray(ledger?.missingRoles) ? ledger.missingRoles : [];
  const role = roleForPhase(phase, agent);
  const roleMissing = role !== '' && missingRoles.includes(role);
  if (sincePhase === 0 || roleMissing) {
    const template = buildDispatchTemplate(snapshot);
    const goal = goalFor({ stage, phase, phaseLabel, agent, requirement });
    const dispatchReason = sincePhase === 0
      ? `phase=${phase} 尚无派发记录：任何执行都必须先派子 agent（feel_dispatch 记账）。`
      : `phase=${phase} 缺 ${role} 角色的派发记录：先派 ${role}，再动手。`;
    return {
      kind: 'dispatch',
      tool: 'subagent',
      args: {
        goal,
        context: template.context,
        boundaries: template.boundaries,
        returnFormat: template.returnFormat,
      },
      goal,
      prompt: templatePrompt(goal, template),
      reason: dispatchReason,
    };
  }

  /* 3) exec_running 已派发：阶段长期保持，不催推进（等回报或继续派发下一个任务）。 */
  if (phase === 'exec_running') {
    return idle(
      `${stage} 已在 exec_running 且本相位已派发 ${sincePhase} 条：继续派发下一个任务，或等子 agent 回报；不要为了「完成需求」推进阶段。`,
    );
  }

  /* 4) 其它相位：有合法下一相位就推进（命令动作）。 */
  if (legal.length > 0) {
    const to = legal[0];
    return command(
      'feel_flow',
      { action: 'advance', stage, to },
      `把 ${stage} 从 ${phase} 推进到 ${to}`,
      suggested !== '' ? suggested : `phase=${phase} 的权威合法下一相位是 ${to}。`,
    );
  }

  /* 5) 兜底：读一次状态，别凭记忆。 */
  return idle(`${stage}/${phase} 已派发 ${sincePhase} 条且没有合法下一相位：用 feel_status 复核，不要凭记忆推进。`);
}

/**
 * 派发目标的一句话（可验收：点名阶段/相位/角色/需求）。
 * @param {{ stage: string, phase: string, phaseLabel: string, agent: string, requirement: string }} input
 * @returns {string}
 */
function goalFor({ stage, phase, phaseLabel, agent, requirement }) {
  const who = requirement === '' ? '本相位产物' : `需求 ${requirement} 的本相位产物`;
  return `在 ${stage} 的 ${phase}（${phaseLabel}）由 ${agent} 交付${who}；完成判据须可验收（给出命令与退出码）。`;
}

/**
 * 四段式派发 prompt（可直接粘贴进 `subagent`）。
 * @param {string} goal
 * @param {ReturnType<typeof buildDispatchTemplate>} template
 * @returns {string}
 */
function templatePrompt(goal, template) {
  return [
    `goal：${goal}`,
    `context：${template.context.join('；')}`,
    `boundaries：写 ${JSON.stringify(template.boundaries.write)}；禁读 ${template.boundaries.neverRead.join('/')}；禁写 ${template.boundaries.neverWrite.join('/')}`,
    `returnFormat：${template.returnFormat}`,
  ].join('\n');
}

/**
 * 把动作对象转成工具 wire 的 `next`（`idle` → null，与既有「无建议」语义一致）。
 * @param {ReturnType<typeof deriveNextAction> | null | undefined} action
 * @returns {{ tool: string, arguments: Record<string, any>, why: string } | null}
 */
export function toWireNext(action) {
  if (action === null || action === undefined || action.kind === 'idle' || typeof action.tool !== 'string') {
    return null;
  }
  // dispatch 的完整 prompt 在 `data.nextAction.prompt` 里；wire 只给可扫读的一句话目标，
  // 避免 `renderEnvelope` 把整段 context/boundaries 拼进「下一步建议」。
  const args = action.kind === 'dispatch'
    ? { goal: action.goal }
    : (action.args ?? {});
  return { tool: action.tool, arguments: args, why: action.reason };
}

/**
 * 动作型一句话（`recovery.nextAction` 字符串；保留旧键、内容换成动作）。
 * @param {ReturnType<typeof deriveNextAction> | null | undefined} action
 * @returns {string | null}
 */
export function nextActionLine(action) {
  if (action === null || action === undefined || action.kind === 'idle') return null;
  if (action.kind === 'dispatch') return `dispatch → subagent（goal：${action.goal}）`;
  return `command → ${action.tool} ${JSON.stringify(action.args ?? {})}`;
}

/* ─────────────── 运行时提醒状态（进程内，逐请求取值） ─────────────── */

/** @type {{ stage: string, phase: string, line: string }} */
let focusMemo = { stage: '', phase: '', line: '' };
/** 已观察到多少次工具调用（每 N 步兜底提醒一次）。 */
let observedSteps = 0;
/** 本轮是否需要注入提醒（写类工具之后 / 每 N 步）。 */
let pending = false;

/**
 * 记住最近一次快照派生的动作（工具层在 `feel_status` / `feel_next` 成功后调用）。
 * @param {Record<string, any>} snapshot
 * @param {ReturnType<typeof deriveNextAction>} [action] 已派生的动作（省一次重算）
 * @returns {void}
 */
export function rememberFocus(snapshot, action) {
  try {
    const derived = action ?? deriveNextAction(snapshot);
    const stage = typeof snapshot?.focus?.stage === 'string' ? snapshot.focus.stage : '';
    const phase = typeof snapshot?.focus?.phase === 'string' ? snapshot.focus.phase : '';
    focusMemo = { stage, phase, line: reminderLineOf(stage, phase, derived) };
  } catch {
    /* 提醒是提示级：绝不影响工具结果 */
  }
}

/**
 * 组装提醒行：`阶段 <stage> / <phase>｜下一步：subagent(goal=…)`。
 * @param {string} stage
 * @param {string} phase
 * @param {ReturnType<typeof deriveNextAction>} action
 * @returns {string}
 */
function reminderLineOf(stage, phase, action) {
  const where = `阶段 ${stage || '(无)'} / ${phase || '(无相位)'}`;
  if (action?.kind === 'dispatch') return `${where}｜下一步：subagent(goal=${action.goal})`;
  if (action?.kind === 'command') return `${where}｜下一步：${action.tool}(${JSON.stringify(action.args ?? {})})`;
  if (action?.kind === 'idle') return `${where}｜下一步：无（等回报或继续派发）`;
  return `${where}｜下一步：先 feel_status 拿阶段/相位`;
}

/**
 * 观察一次工具调用（`tools/post-execute` 里调用，**只记状态**）。
 *
 * 触发提醒：写类工具之后（`mutatingTools` 命中）或每 `REMINDER_EVERY_STEPS` 步。
 * @param {string} toolName
 * @param {Iterable<string>} [mutatingTools] 写类工具名（来自 `config.mutatingTools`）
 * @returns {void}
 */
export function noteToolCall(toolName, mutatingTools) {
  observedSteps += 1;
  const writes = mutatingTools === undefined
    ? new Set(['edit', 'write', 'apply_patch', 'bash', 'pwsh'])
    : new Set(mutatingTools);
  pending = writes.has(toolName) || observedSteps % REMINDER_EVERY_STEPS === 0;
}

/**
 * 取本请求要注入的提醒文本（空串 = 不注入，零 token 开销）。
 * @returns {string}
 */
export function reminderText() {
  if (!pending) return '';
  if (focusMemo.line === '') return '阶段(未读) / (未读相位)｜下一步：先 feel_status 拿阶段/相位';
  return focusMemo.line;
}

/**
 * 复位提醒状态（仅测试用）。
 * @returns {void}
 */
export function resetReminderState() {
  focusMemo = { stage: '', phase: '', line: '' };
  observedSteps = 0;
  pending = false;
}
