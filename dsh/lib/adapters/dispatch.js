/**
 * 派发 / 返回契约（v1.6.0 / REQ-057）
 *
 * Feel 派发给 subagent 的能力/边界/返回格式模板。
 * 目的：主会话不把子任务细节留在自己的上下文里；子 agent 不重复探索、不读写状态文件。
 *
 * v1.6.0 / T9 step2：`goal` 与 `boundaries.write` 改为**用真实快照填充**
 * （stage / phase / phaseLabel / responsibleAgent / 关联需求），不再输出
 * 泛型占位句——占位文案会被模型原样粘进 subagent prompt，等于没派发。
 * `returnFormat` 是固定契约（≤10 行），不由快照派生。
 */

/**
 * 取当前阶段关联需求（**只用快照已有字段**，零新增 I/O）。
 *
 * 优先级：
 * 1. `snapshot.recovery.requirement`（CLI 交接标记，`flow` 侧的权威值）；
 * 2. 回退 `snapshot.stages[*].requirementId`（`flow status --json` 的阶段条目）。
 *
 * @param {Record<string, any>} snapshot readSnapshot 结果
 * @returns {string} 需求 ID；取不到 → 空串
 */
function requirementOf(snapshot) {
  const recovery = snapshot?.recovery?.requirement;
  if (typeof recovery === 'string' && recovery !== '') return recovery;
  const stageId = snapshot?.focus?.stage;
  const stages = Array.isArray(snapshot?.stages) ? snapshot.stages : [];
  const stage = stages.find((entry) => entry?.id === stageId || entry?.name === stageId);
  return typeof stage?.requirementId === 'string' ? stage.requirementId : '';
}

/**
 * @param {Record<string, any>} snapshot readSnapshot 结果
 * @returns {{ goal: string, context: string[], boundaries: Record<string, any>, returnFormat: string, budget: Record<string, any> }}
 */
export function buildDispatchTemplate(snapshot) {
  const focus = snapshot?.focus ?? {};
  const hasFocus = typeof focus.stage === 'string' && focus.stage !== '';
  const stage = hasFocus ? focus.stage : '(无活跃阶段)';
  const phase = typeof focus.phase === 'string' && focus.phase !== '' ? focus.phase : (hasFocus ? '(无相位)' : '(无)');
  const phaseLabel = typeof focus.phaseLabel === 'string' && focus.phaseLabel !== '' ? focus.phaseLabel : phase;
  const agent = typeof focus.responsibleAgent === 'string' && focus.responsibleAgent !== ''
    ? focus.responsibleAgent
    : '(未知角色)';
  const requirement = requirementOf(snapshot);
  const suggested = typeof focus.suggestedCommand === 'string' ? focus.suggestedCommand : '';

  // goal 用真实调度上下文填充：做什么（阶段/相位）、给谁（Agent）、哪个需求、怎么算完成。
  // 无活跃阶段时不留占位句，而是把「现在没有可派发对象」说清楚（避免被原样粘进 prompt）。
  const goal = !hasFocus
    ? '当前无活跃阶段：先用 feel_status 选定阶段/需求，再据此填写一句话目标（须可验收：命令 + 退出码）'
    : (requirement === ''
      ? `在 ${stage} 的 ${phase}（${phaseLabel}）由 ${agent} 交付本相位产物；完成判据须可验收（给出命令与退出码）`
      : `在 ${stage} 的 ${phase}（${phaseLabel}）由 ${agent} 完成需求 ${requirement} 的本相位产物；完成判据须可验收（给出命令与退出码）`);

  return {
    goal,
    context: [
      `阶段：${stage} / ${phase}（${phaseLabel}）；负责 Agent：${agent}`,
      requirement === '' ? '关联需求：无（按阶段产物验收）' : `关联需求：${requirement}`,
      ...(suggested === '' ? [] : [`CLI 权威下一步：${suggested}`]),
      '只附必要文件路径（plan / op / REV / 目标源码），不附整目录或整仓内容',
    ],
    boundaries: {
      // 写面按当前阶段派生：本任务文件由派发方在 goal 里点明，未点明的一律只读。
      write: hasFocus
        ? [
          `${stage} / ${phase} 下本任务的文件（派发时点明具体路径；未点明的一律只读）`,
          '.openfeel/plan/**（仅计划/方案文档；需求正文走 feel_req action=body）',
        ]
        : ['(无活跃阶段：无可写面；先开阶段或接取需求)'],
      neverRead: ['dev_last*', 'dev/current.md', 'status.md', 'flow.json'],
      neverWrite: ['dev_last*', 'dev/current.md', 'status.md', 'flow.json'],
      escalate: '越界或需要用户决策时立即停止并回报，不要自行扩大范围',
    },
    returnFormat:
      '≤10 行：结论 / 改动文件 / 验证结果 / 阻塞或下一步；只给文件路径，不贴全文 diff、日志或大段代码',
    budget: {
      maxReadFiles: 5,
      noRepoWideScan: true,
      handoff: '信息由 Feel 在派发 prompt 里传递，不读写持久化状态文件',
    },
  };
}
