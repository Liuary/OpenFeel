/**
 * 流程入口闸（v1.5.2）
 *
 * 目的：把「无活跃阶段时不得开始需要落盘/多步调查的任务」从提示词约定
 * 变成 feel_status / feel_next 的结构化字段，避免模型以「只读调研」为由跳过阶段。
 *
 * 纯函数、无 IO；由工具层在读取快照后调用。
 */

/**
 * @param {Record<string, any>} snapshot readSnapshot 的结果
 * @returns {{ required: boolean, reason: string|null, message: string, actions: string[] }}
 */
export function computeWorkflowGate(snapshot) {
  const phase = snapshot?.focus?.phase;
  const hasActiveStage = phase !== '' && phase !== null && phase !== undefined;
  if (hasActiveStage) {
    return { required: false, reason: null, message: '', actions: [] };
  }
  return {
    required: true,
    reason: 'no-active-stage',
    message:
      '当前无活跃阶段：任何会产出仓库文件（含 docs/research/**、方案、计划）或需要多步调查/实现的任务，必须先建立阶段；纯只读问答可例外。',
    actions: [
      'feel_req action=add title="<需求>"',
      'feel_req action=claim id=REQ-NNN',
      'feel_stage action=add stage=<vX.Y.Z-stage-N> tasks=[...]',
    ],
  };
}
