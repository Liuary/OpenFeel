/**
 * flow 命令组注册
 * openfeel flow status|current|advance|attempt|log|review|retry
 */
import { Command } from 'commander';
import { FlowManager, PipelinePhase } from '../core/flow-manager.js';

export function registerFlowCommand(program: Command): void {
  const flow = program
    .command('flow')
    .description('流水线状态管理');

  // flow status — 输出流水线摘要
  flow
    .command('status')
    .description('显示流水线状态摘要')
    .action(() => {
      const mgr = createManager();
      console.log(mgr.summary());
    });

  // flow current — 显示当前 phase + op + retry
  flow
    .command('current')
    .description('显示当前阶段和操作')
    .action(() => {
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.log('流水线未初始化（flow.json 不存在）');
        return;
      }
      const phase = mgr.getPhase();
      const current = mgr.getCurrent();
      const summary = mgr.getSummary();
      console.log(`阶段: ${phase}`);
      console.log(`当前操作: ${current ? `${current.stage}.${current.op}` : '(无)'}`);
      console.log(`重试次数: ${summary.retryCount}`);
    });

  // flow advance --op <id> --to <phase>
  flow
    .command('advance')
    .description('推进流水线阶段')
    .option('--op <id>', '操作 ID（如 stage-01.op-001），全局阶段（如 done）可不传')
    .requiredOption('--to <phase>', '目标阶段（如 plan_passed）')
    .action((options: { op?: string; to: string }) => {
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.error('错误：flow.json 未初始化，请先运行 openfeel init');
        process.exit(1);
      }

      const { valid, errors } = mgr.validate();
      if (!valid) {
        console.error('错误：flow.json 格式不合法');
        for (const err of errors) {
          console.error(`  - ${err}`);
        }
        // validate() 可能已自动修正，允许在有修正的情况下继续
        const correctedErrors = errors.filter(e => e.includes('已自动修正'));
        const realErrors = errors.filter(e => !e.includes('已自动修正'));
        if (realErrors.length > 0) {
          process.exit(1);
        }
        console.log('（非标准 phase 已自动修正，继续推进）');
      }

      // 全局推进（无 opId）时跳过 canAdvance 检查
      if (options.op) {
        if (!mgr.canAdvance(options.op, options.to as PipelinePhase)) {
          console.error(`错误：无法从当前阶段推进到 "${options.to}"（不合法或 op 不存在）`);
          process.exit(1);
        }
      }

      mgr.advancePhase(options.op ?? null, options.to as PipelinePhase);
      mgr.save();
      if (options.op) {
        console.log(`✓ 已推进: ${options.op} → ${options.to}`);
      } else {
        console.log(`✓ 已全局推进 → ${options.to}`);
      }
    });

  // flow attempt --op <id> --result <pass|fail>
  flow
    .command('attempt')
    .description('记录操作执行结果')
    .requiredOption('--op <id>', '操作 ID（如 stage-01.op-001）')
    .requiredOption('--result <pass|fail>', '执行结果（pass 或 fail）')
    .action((options: { op: string; result: string }) => {
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.error('错误：flow.json 未初始化，请先运行 openfeel init');
        process.exit(1);
      }

      if (options.result !== 'pass' && options.result !== 'fail') {
        console.error('错误：--result 必须为 pass 或 fail');
        process.exit(1);
      }

      const outcome = mgr.recordAttempt(options.op, options.result as 'pass' | 'fail');
      mgr.save();

      if (options.result === 'pass') {
        console.log(`✓ ${options.op} 执行成功`);
      } else if (outcome.shouldRetry) {
        console.log(`⚠ ${options.op} 执行失败，将重试（${outcome.shouldRetry ? '可重试' : '重试耗尽'}）`);
      } else if (outcome.shouldReplan) {
        console.log(`✗ ${options.op} 重试耗尽，需要重新规划`);
        // BUG-03 修复：shouldReplan 时自动推进到 scheme_pending
        mgr.advancePhase(options.op, 'scheme_pending');
        mgr.save();
        console.log(`→ 已自动回退到 scheme_pending，请重新规划方案`);
      }
    });

  // flow log [--last <n>]
  flow
    .command('log')
    .description('显示最近操作日志')
    .option('--last <n>', '显示最近 n 条（默认 10）', '10')
    .action((options: { last: string }) => {
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.log('流水线未初始化，无日志');
        return;
      }

      const n = Math.max(1, parseInt(options.last, 10) || 10);
      const data = mgr.getData();
      if (!data || data.log.length === 0) {
        console.log('暂无操作日志');
        return;
      }

      const recent = data.log.slice(-n);
      console.log(`最近 ${recent.length} 条操作日志:\n`);
      for (const entry of recent) {
        const time = entry.time.substring(0, 19).replace('T', ' ');
        console.log(`[${time}] ${entry.agent} — ${entry.action}`);
        if (Object.keys(entry.detail).length > 0) {
          console.log(`  详情: ${JSON.stringify(entry.detail)}`);
        }
        console.log('');
      }
    });

  // flow review — 审查子命令组
  const reviewCmd = flow
    .command('review')
    .description('管理审查条目');

  // flow review add --op <id> [--title]
  reviewCmd
    .command('add')
    .description('添加审查条目')
    .requiredOption('--op <id>', '操作 ID（如 stage-01.op-001）')
    .option('--title <title>', '审查标题')
    .action((options: { op: string; title?: string }) => {
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.error('错误：flow.json 未初始化，请先运行 openfeel init');
        process.exit(1);
      }

      // 自动生成 REV ID（基于已有审查条目数量递增）
      const existingReviews = mgr.getReviewItems();
      const revId = `REV-${String(existingReviews.length + 1).padStart(3, '0')}`;

      mgr.addReview({
        id: revId,
        op: options.op,
        status: 'open',
        priority: 'medium',
        title: options.title || `审查: ${options.op}`,
        filed_by: 'cli',
        filed_at: new Date().toISOString(),
      });
      mgr.save();
      console.log(`✓ 审查条目已添加: ${revId} (${options.op})${options.title ? ` — ${options.title}` : ''}`);
    });

  // flow review resolve <rev-id>
  reviewCmd
    .command('resolve')
    .description('解决审查条目')
    .argument('<rev-id>', '审查条目 ID（如 REV-001）')
    .action((revId: string) => {
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.error('错误：flow.json 未初始化，请先运行 openfeel init');
        process.exit(1);
      }

      const ok = mgr.resolveReview(revId);
      if (ok) {
        mgr.save();
        console.log(`✓ 审查条目已解决: ${revId}`);
      } else {
        console.error(`错误：未找到审查条目 ${revId}`);
        process.exit(1);
      }
    });

  // flow retry --op <id>
  flow
    .command('retry')
    .description('查询操作的重试状态')
    .requiredOption('--op <id>', '操作 ID（如 stage-01.op-001）')
    .action((options: { op: string }) => {
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.error('错误：flow.json 未初始化，请先运行 openfeel init');
        process.exit(1);
      }

      // 通过 getData() 获取 op 的 max_attempts
      const data = mgr.getData();
      if (!data) {
        console.error('错误：无法读取流水线数据');
        process.exit(1);
      }

      // 解析 opId 查找 op
      const dotIdx = options.op.lastIndexOf('.');
      if (dotIdx === -1) {
        console.error('错误：opId 格式不正确，应为 stage-xx.op-xxx');
        process.exit(1);
      }
      const stageId = options.op.substring(0, dotIdx);
      const opLocalId = options.op.substring(dotIdx + 1);

      const stage = data.stages[stageId];
      if (!stage) {
        console.error(`错误：未找到阶段 ${stageId}`);
        process.exit(1);
      }

      const op = stage.ops[opLocalId];
      if (!op) {
        console.error(`错误：未找到操作 ${options.op}`);
        process.exit(1);
      }

      const retryCount = mgr.getRetryCount(options.op);
      console.log(`操作: ${options.op}`);
      console.log(`状态: ${op.state}`);
      console.log(`当前尝试次数: ${retryCount} / ${op.max_attempts}`);
      if (retryCount >= op.max_attempts) {
        console.log('⚠ 重试次数已用尽');
      }
    });
}

/** 创建 FlowManager 实例（使用当前工作目录） */
function createManager(): FlowManager {
  return new FlowManager(process.cwd());
}
