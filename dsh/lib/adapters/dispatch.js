/**
 * 派发 / 返回契约（v1.5.3）
 *
 * Feel 派发给 subagent 的能力/边界/返回格式模板。
 * 目的：主会话不把子任务细节留在自己的上下文里；子 agent 不重复探索、不读写状态文件。
 */

/**
 * @param {Record<string, any>} snapshot readSnapshot 结果
 * @returns {{ goal: string, context: string[], boundaries: Record<string, any>, returnFormat: string, budget: Record<string, any> }}
 */
export function buildDispatchTemplate(snapshot) {
  const focus = snapshot?.focus ?? {};
  const stage = focus.stage || '(无活跃阶段)';
  const phase = focus.phase || '(无)';
  return {
    goal: '<一句话目标：要达成什么，可验收>',
    context: [
      `阶段：${stage} / ${phase}`,
      '只附必要文件路径（plan / op / REV / 目标源码），不附整目录或整仓内容',
    ],
    boundaries: {
      write: '<本任务允许写的文件或目录；其余只读>',
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
