/**
 * 流程入口闸（v1.5.2；v1.5.7 改为需求导向语义）
 *
 * 目的：把「每个需求都要建/推进阶段」纠正为「阶段是版本容器、长期保持开启」。
 * 无开启阶段时提示按当前小版本开一个（保持 exec_running），而不是把它当成一次性任务；
 * 已开启阶段时不做任何催促（需求在阶段内完成，阶段关闭由用户在发布节点决定）。
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
      '当前没有开启的阶段：默认按当前小版本开一个阶段（保持 exec_running），需求在该版本内逐个推进；'
      + '不要每完成一个需求就推进/关闭阶段——归档与发布只在用户确认的节点执行。',
    actions: [
      'feel_req action=add title="<需求>"（target_version 取小版本）',
      'feel_req action=claim id=REQ-NNN',
      'feel_stage action=add stage=<vX.Y.Z-stage-N>（保持 exec_running，不随需求关闭）',
    ],
  };
}
