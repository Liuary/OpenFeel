/**
 * 流程入口闸（v1.5.2；v1.5.7 需求导向；v1.5.11 增加门禁自检）
 *
 * 目的：把「每个需求都要建/推进阶段」纠正为「阶段是版本容器、长期保持开启」。
 * 已开启阶段时不做任何催促（需求在阶段内完成，阶段关闭由用户在发布节点决定）。
 *
 * v1.5.11（D-126-04）：若 `snapshot.guard` 显示门禁**自身**不可信
 * （未注册 / cwd 解析失败 / 来自旧进程或旧适配器），优先提示它 —— 「门禁看着在跑
 * 其实没生效」比「没开阶段」严重得多。**无 `guard` 字段时行为完全不变**（零回归）。
 *
 * 纯函数、无 IO；由工具层在读取快照后调用。
 */

/**
 * @param {Record<string, any>} snapshot readSnapshot 的结果
 * @returns {{ required: boolean, reason: string|null, message: string, actions: string[] }}
 */
export function computeWorkflowGate(snapshot) {
  const guard = snapshot?.guard;
  if (guard !== null && guard !== undefined && typeof guard === 'object') {
    if (guard.registered === false) {
      return {
        required: true,
        reason: 'guard-inactive',
        message:
          '写入门禁未生效（guard-state 缺失或 guard 未注册，例如 profile 的 enforce=off 或宿主未加载适配器）：'
          + '当前对源码/文档的写入没有门禁保护。请重启宿主让适配器重新注册，或确认 enforce 不是 off。',
        actions: [
          '确认 profile（cordis.patch.yml）的 openfeel-feel.enforce 为 project 或 always',
          '重启 DSH 宿主（guard 只在宿主启动时注册）',
          'feel_status 的 guard 段应显示 registered:true；否则看 .openfeel/dev/guard-state.json 与 ~/.openfeel/adapter-host-dsh.json',
        ],
      };
    }
    if (guard.cwd === null || guard.cwdSource === 'unresolved') {
      return {
        required: true,
        reason: 'guard-cwd-unresolved',
        message:
          '写入门禁无法确定会话工作区（cwd 解析失败），已按 fail-closed 拒绝写入。'
          + '修复（任一）：① profile 的 cordis.patch.yml 给 openfeel-feel 配 cwd: "<项目绝对路径>"；'
          + '② 设环境变量 OPENFEEL_GUARD_CWD 后重启；③ 重启会话让提示装配登记 cwd。',
        actions: [
          'cordis.patch.yml 配 cwd: "<项目绝对路径>" 后重启',
          '或设 OPENFEEL_GUARD_CWD=<项目绝对路径> 后重启',
          '重启会话让提示装配写入会话 cwd 登记表',
        ],
      };
    }
    if (guard.stale === true) {
      return {
        required: true,
        reason: 'guard-stale',
        message:
          '门禁来自旧进程/旧适配器，判定不可信（适配器文件已更新但宿主仍加载旧模块，或状态来自更早的进程）。'
          + '请完全重启 DSH 宿主后再写入。',
        actions: [
          '完全重启 DSH 宿主（不是重载会话）',
          '重启后确认 feel_status.guard.stale === false',
          '确认 ~/.openfeel/adapter-host-dsh.json 的 loaded_hash 与 .openfeel/dev/guard-state.json 一致',
        ],
      };
    }
  }

  const phase = snapshot?.focus?.phase;
  // v1.5.8：『开启阶段』= phase 非空且非 done。仅剩 done 阶段时同样要求开新阶段
  // （此前 done 被当成活跃阶段，导致需求导向下永远不提示开阶段）。
  const hasOpenStage = typeof phase === 'string' && phase !== '' && phase !== 'done';
  if (hasOpenStage) {
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
