/**
 * flow 命令组注册
 * openfeel flow status|current|metrics|advance|attempt|log|review|retry|repair|health|wizard
 *
 * 变更摘要 (stage-01: flow.json 鲁棒性加固):
 * - 新增 flow repair 子命令，自动检测并修复 flow.json 常见问题
 * - 所有 flow.json 操作通过 FlowManager 实例完成
 *
 * 变更摘要 (stage-03: 效率优化):
 * - flow review add 新增 --auto-fix 标志，支持轻量修正路径
 * - 新增 flow health 子命令，全面健康检查
 *
 * 变更摘要 (stage-03: 流水线可视化):
 * - 新增 flow overview 子命令，实现 /opfx:status 全状态可视化
 *
 * 变更摘要 (stage-04: 体验补全):
 * - 新增 flow wizard 子命令，交互式推进流水线阶段
 *
 * 变更摘要 (stage-04: 性能指标):
 * - 新增 flow metrics 子命令，展示 Agent 性能指标
 */
import { Command } from 'commander';
import { existsSync, copyFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FlowManager, type PipelinePhase, type RecoveryContext, type StageStats } from '../core/flow-manager.js';
import { PipelinePhaseSchema, PIPELINE_PHASES } from '../core/pipeline-schema.js';
import { MetricsStore } from '../core/metrics.js';

export function registerFlowCommand(program: Command): void {
  const flow = program
    .command('flow')
    .description('流水线状态管理');

  // flow status — 输出流水线摘要
  flow
    .command('status')
    .description('显示流水线状态摘要')
    .option('--verbose', '增强输出：配置级联、最近状态变更、下游 Agent 就绪状态')
    .option('-n, --lines <n>', '最近状态变更条数（默认 5）', '5')
    .action((options: { verbose?: boolean; lines: string }) => {
      const mgr = createManager();
      if (!options.verbose) {
        console.log(mgr.summary());

        // 阶段耗时统计
        const allStats = mgr.getAllStageStats();
        if (Object.keys(allStats).length > 0) {
          console.log('\n阶段耗时:');
          for (const [stageId, s] of Object.entries(allStats)) {
            const duration = formatDuration(s.duration_ms);
            console.log(`  ${stageId}: ${duration}${s.end_time ? '' : ' (进行中)'}`);
          }
        }
        return;
      }

      const n = Math.max(1, parseInt(options.lines, 10) || 5);
      const v = mgr.verboseSummary(n);

      // ── 基本摘要 ──
      console.log('OpenFeel 流水线状态（verbose）\n');
      console.log(`当前阶段: ${v.basic.phase}`);
      console.log(`当前操作: ${v.basic.currentOp ?? '(无)'}`);
      console.log(`重试次数: ${v.basic.retryCount}`);
      console.log(`阶段数: ${v.basic.stagesCount}`);
      console.log(`操作数: ${v.basic.opsCount}`);
      console.log(`待处理审查: ${v.basic.reviewItemsOpen}`);
      console.log(`日志总数: ${v.basic.recentLogs}`);
      console.log('');

      // ── 配置级联状态 ──
      console.log('── 配置级联状态 ──');
      const allKeys = new Set([
        ...Object.keys(v.cascade.configDefaults),
        ...Object.keys(v.cascade.statusOverrides),
      ]);
      if (allKeys.size === 0) {
        console.log('（无配置）');
      } else {
        console.log('字段               config.yaml  status.md  生效值');
        console.log('─────────────────────────────────────────────────');
        for (const key of [...allKeys].sort()) {
          const def = v.cascade.configDefaults[key] ?? '-';
          const over = v.cascade.statusOverrides[key] ?? '-';
          const eff = v.cascade.effective[key] ?? '-';
          const overFlag = v.cascade.statusOverrides[key] ? '*' : ' ';
          console.log(`${key.padEnd(18)} ${def.padEnd(12)} ${overFlag}${over.padEnd(11)} ${eff}`);
        }
        console.log('（* 表示 status.md 覆盖了 config.yaml 默认值）');
      }
      console.log('');

      // ── 最近 N 条状态变更 ──
      console.log(`── 最近 ${n} 条状态变更 ──`);
      if (v.recentChanges.length === 0) {
        console.log('（无记录）');
      } else {
        console.log('时间              Agent          状态变化            说明');
        console.log('───────────────────────────────────────────────────────');
        for (const change of v.recentChanges) {
          console.log(
            `${change.time.padEnd(17)} ${change.agent.padEnd(14)} ${change.change.padEnd(20)} ${change.description}`,
          );
        }
      }
      console.log('');

      // ── 下游 Agent 就绪状态 ──
      console.log('── 下游 Agent 就绪状态 ──');
      if (v.downstreamPhases.length === 0) {
        console.log('（当前阶段无下游可达阶段）');
      } else {
        console.log('可达阶段            负责 Agent');
        console.log('──────────────────────────────────');
        for (const dp of v.downstreamPhases) {
          console.log(`${dp.phase.padEnd(20)} ${dp.responsibleAgent}`);
        }
      }
      console.log('');

      // ── 跨会话恢复信息 ──
      const recovery = mgr.recoverContext();
      console.log('── 跨会话恢复信息 ──');
      console.log(`  阶段: ${recovery.phase ?? '(未知)'}`);
      console.log(`  操作: ${recovery.currentOp ?? '(无)'}`);
      console.log(`  状态: ${recovery.stageStatus}`);
      if (recovery.blockedBy) {
        console.log(`  阻塞原因: ${recovery.blockedBy}`);
      }
      if (recovery.pendingTasks.length > 0) {
        console.log('  待处理任务:');
        for (let i = 0; i < Math.min(recovery.pendingTasks.length, 10); i++) {
          console.log(`    ${i + 1}. ${recovery.pendingTasks[i]}`);
        }
        if (recovery.pendingTasks.length > 10) {
          console.log(`    ... 还有 ${recovery.pendingTasks.length - 10} 项`);
        }
      }
    });

  // flow overview — 全状态可视化（/opfx:status 的后端实现）
  flow
    .command('overview')
    .description('全状态可视化视图（/opfx:status 的后端实现）')
    .action(() => {
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.log('流水线未初始化（flow.json 不存在）');
        return;
      }

      const phase = mgr.getPhase();
      const current = mgr.getCurrent();
      const summary = mgr.getSummary();
      const data = mgr.getData();

      // ═══ 标题 ═══
      console.log('');
      console.log('╔══════════════════════════════════════════╗');
      console.log('║     OpenFeel 流水线全景视图              ║');
      console.log('╚══════════════════════════════════════════╝');
      console.log('');

      // ── 当前状态 ──
      console.log('📍 当前状态');
      console.log(`   阶段:  ${phase}`);
      console.log(`   操作:  ${current ? `${current.stage}.${current.op}` : '(无)'}`);
      console.log(`   重试:  ${summary.retryCount} 次`);
      console.log('');

      // ── 阶段总览 ──
      console.log('📋 阶段总览');
      if (!data || Object.keys(data.stages).length === 0) {
        console.log('   （无阶段数据）');
      } else {
        console.log(`   共 ${Object.keys(data.stages).length} 个阶段:`);
        for (const [stageId, stageData] of Object.entries(data.stages)) {
          const opsTotal = Object.keys(stageData.ops).length;
          const opsDone = Object.values(stageData.ops).filter(
            (o: unknown) => (o as { state?: string }).state === 'done'
          ).length;
          const marker = current?.stage === stageId ? '← 当前' : '';
          const bar = opsTotal > 0
            ? '█'.repeat(opsDone) + '░'.repeat(opsTotal - opsDone)
            : '(无操作)';
          console.log(`   ${stageId}: ${bar} ${opsDone}/${opsTotal} ${marker}`);
        }
      }
      console.log('');

      // ── 审查条目 ──
      console.log('🔍 审查条目 (REV)');
      if (!data || data.reviews.length === 0) {
        console.log('   （无审查条目）');
      } else {
        const openReviews = data.reviews.filter((r) => r.status === 'open');
        const resolvedReviews = data.reviews.filter((r) => r.status === 'resolved');
        const closedReviews = data.reviews.filter((r) => r.status === 'closed');
        const blockingOpen = openReviews.filter((r) => r.blocking !== false);
        const nonBlockingOpen = openReviews.filter((r) => r.blocking === false);

        console.log(`   打开: ${openReviews.length}（阻塞 ${blockingOpen.length} / 非阻塞 ${nonBlockingOpen.length}）`);
        console.log(`   已解决: ${resolvedReviews.length}`);
        console.log(`   已关闭: ${closedReviews.length}`);

        if (openReviews.length > 0) {
          console.log('');
          console.log('   待处理审查:');
          for (const rev of openReviews) {
            const blockIcon = rev.blocking !== false ? '🔴' : '🟡';
            const priIcon = rev.priority === 'high' ? '↑' : rev.priority === 'low' ? '↓' : '=';
            console.log(`     ${blockIcon} [${priIcon}] ${rev.id}: ${rev.title} (${rev.op})`);
          }
        }
      }
      console.log('');

      // ── Bug 统计 ──
      console.log('🐛 Bug 追踪');
      const bugsIndexPath = resolve(process.cwd(), '.openfeel', 'bugs', 'index.md');
      if (existsSync(bugsIndexPath)) {
        try {
          const bugsContent = readFileSync(bugsIndexPath, 'utf-8');
          const openMatch = bugsContent.match(/open[:：]\s*(\d+)/i);
          const closedMatch = bugsContent.match(/closed[:：]\s*(\d+)/i);
          const openBugs = openMatch ? parseInt(openMatch[1]) : 0;
          const closedBugs = closedMatch ? parseInt(closedMatch[1]) : 0;
          console.log(`   打开: ${openBugs}  已关闭: ${closedBugs}`);
        } catch {
          console.log('   （无法读取 Bug 统计）');
        }
      } else {
        console.log('   （Bug 追踪未初始化）');
      }
      console.log('');

      // ── 最近日志 ──
      console.log('📝 最近操作（5 条）');
      if (!data || data.log.length === 0) {
        console.log('   （无日志记录）');
      } else {
        const recentLogs = data.log.slice(-5).reverse();
        for (const entry of recentLogs) {
          const time = entry.time.substring(0, 19).replace('T', ' ');
          console.log(`   [${time}] ${entry.agent}: ${entry.action}`);
        }
      }
      console.log('');

      // ── 健康状态 ──
      console.log('💚 健康状态');
      const health = mgr.healthCheck(true); // quick mode
      const passCount = health.items.filter((i) => i.status === 'pass').length;
      const warnCount = health.items.filter((i) => i.status === 'warn').length;
      const failCount = health.items.filter((i) => i.status === 'fail').length;
      console.log(`   ✅ ${passCount}  🟡 ${warnCount}  ❌ ${failCount}`);
      if (!health.ok) {
        console.log('');
        for (const item of health.items.filter((i) => i.status === 'fail')) {
          console.log(`   ❌ ${item.section}: ${item.message}`);
        }
      }
      console.log('');
      console.log('════════════════════════════════════════════');
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

  // flow metrics — 展示 Agent 性能指标
  flow
    .command('metrics')
    .description('展示 Agent 性能指标')
    .action(() => {
      const store = MetricsStore.getInstance();
      store.load();
      console.log(store.summary());
    });

  // flow advance --op <id> --to <phase> [--stage <id>] [--force]
  flow
    .command('advance')
    .description('推进流水线阶段')
    .option('--op <id>', '操作 ID（如 stage-01.op-001），全局阶段（如 done）可不传')
    .requiredOption('--to <phase>', '目标阶段（如 plan_passed）')
    .option('--stage <id>', '同步更新 stage 状态')
    .option('--force', '强制执行（跳过非法 phase 校验和阶段跳跃检查）')
    .action((options: { op?: string; to: string; stage?: string; force?: boolean }) => {
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.error('错误：flow.json 未初始化，请先运行 openfeel init');
        process.exit(1);
      }

      const { valid, errors, warnings } = mgr.validate();

      // 输出自动修正警告
      if (warnings.length > 0) {
        for (const w of warnings) {
          console.warn(`[WARN] ${w}`);
        }
        console.log('（非标准 phase 已自动修正，继续推进）');
      }

      if (!valid) {
        console.error('错误：flow.json 格式不合法');
        for (const err of errors) {
          console.error(`  - ${err}`);
        }
        process.exit(1);
      }

      // 非法 phase 校验（P1）：拒绝不在枚举中的目标 phase
      if (!options.force) {
        const phaseResult = PipelinePhaseSchema.safeParse(options.to);
        if (!phaseResult.success) {
          console.error(`错误: '${options.to}' 不是合法的 PipelinePhase。`);
          console.error(`合法值: [${PIPELINE_PHASES.join(', ')}]`);
          console.error('使用 --force 强制执行（自动模糊修正）');
          process.exit(1);
        }
      }

      // 阶段跳跃保护（P2）：检查当前 phase 到目标 phase 是否存在直接路径
      if (!options.force) {
        const phaseResult = PipelinePhaseSchema.safeParse(options.to);
        if (phaseResult.success && !mgr.hasTransition(options.to)) {
          console.error(`该阶段跳转可能不合法，使用 --force 强制执行`);
          process.exit(1);
        }
      }

      // 全局推进（无 opId）时跳过 canAdvance 检查
      if (options.op) {
        if (!mgr.canAdvance(options.op, options.to as PipelinePhase)) {
          if (!options.force) {
            console.error(`错误：无法从当前阶段推进到 "${options.to}"（不合法或 op 不存在）`);
            console.error(`使用 --force 强制执行`);
            process.exit(1);
          }
        }
      }

      try {
        mgr.advancePhase(options.op ?? null, options.to as PipelinePhase, options.stage, options.force ?? false);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`错误：${msg}`);
        process.exit(1);
      }
      mgr.save();
      if (options.op) {
        console.log(`✓ 已推进: ${options.op} → ${options.to}`);
      } else {
        console.log(`✓ 已全局推进 → ${options.to}`);
      }
      if (options.stage) {
        console.log(`✓ 已同步更新 stage "${options.stage}" 状态`);
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

  // flow review add --op <id> [--title] [--auto-fix <detail>]
  reviewCmd
    .command('add')
    .description('添加审查条目')
    .requiredOption('--op <id>', '操作 ID（如 stage-01.op-001）')
    .option('--title <title>', '审查标题')
    .option('--auto-fix <detail>', '自动修复说明，设置后跳过 scheme_pending 直接推进到 exec_running')
    .option('--blocking [boolean]', '是否阻塞流水线（默认 true）', 'true')
    .action((options: { op: string; title?: string; autoFix?: string; blocking?: string | boolean }) => {
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.error('错误：flow.json 未初始化，请先运行 openfeel init');
        process.exit(1);
      }

      // 自动生成 REV ID（基于已有审查条目数量递增）
      const existingReviews = mgr.getReviewItems();
      const revId = `REV-${String(existingReviews.length + 1).padStart(3, '0')}`;

      const reviewItem = {
        id: revId,
        op: options.op,
        status: 'open' as const,
        priority: 'medium' as const,
        title: options.title || `审查: ${options.op}`,
        filed_by: 'cli',
        filed_at: new Date().toISOString(),
        canAutoFix: !!options.autoFix,
        autoFixDetail: options.autoFix,
        blocking: options.blocking !== undefined ? (options.blocking === 'false' || options.blocking === false ? false : true) : true,
      };

      if (options.autoFix) {
        // opId 格式校验（来自 REV-011：命令层校验，避免无效 opId 穿透到 addAutoFixReview）
        const dotIdx = options.op.lastIndexOf('.');
        if (dotIdx === -1) {
          console.error('错误：opId 格式不正确，应为 stage-xx.op-xxx（如 stage-01.op-001）');
          process.exit(1);
        }
        const stageId = options.op.substring(0, dotIdx);
        const opLocalId = options.op.substring(dotIdx + 1);

        // 校验 stage 是否存在于 flow.json
        const data = mgr.getData();
        if (!data || !data.stages[stageId]) {
          console.error(`错误：opId "${options.op}" 中的阶段 "${stageId}" 在 flow.json 中不存在`);
          process.exit(1);
        }

        // 校验 op 是否存在于对应 stage 中
        if (!data.stages[stageId].ops[opLocalId]) {
          console.error(`错误：opId "${options.op}" 中的操作 "${opLocalId}" 在阶段 "${stageId}" 中不存在`);
          process.exit(1);
        }

        // 自动修复路径：记录 REV 条目（状态直接 resolved），跳过 review_failed → scheme_pending
        mgr.addAutoFixReview(reviewItem, options.op);
        mgr.save();
        const blockingLabel = reviewItem.blocking !== false ? '[阻塞]' : '[非阻塞]';
        console.log(`✓ ${blockingLabel} [AUTO_FIX] 审查条目已添加并自动修复: ${revId}`);
        console.log(`  操作: ${options.op}`);
        console.log(`  说明: ${options.autoFix}`);
        console.log(`  流水线已跳过 review_failed，直接推进到 exec_running`);
      } else {
        mgr.addReview(reviewItem);
        mgr.save();
        const blockingLabel = reviewItem.blocking !== false ? '[阻塞]' : '[非阻塞]';
        console.log(`✓ ${blockingLabel} 审查条目已添加: ${revId} (${options.op})${options.title ? ` — ${options.title}` : ''}`);
      }
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

  // flow repair [--dry-run] [--backup]
  flow
    .command('repair')
    .description('自动检测并修复 flow.json 中的常见问题')
    .option('--dry-run', '仅检测不修复')
    .option('--backup', '修复前备份为 .bak')
    .action((options: { dryRun?: boolean; backup?: boolean }) => {
      const mgr = new FlowManager(process.cwd());

      // --backup 选项：修复前手动备份
      if (options.backup) {
        const fp = resolve(process.cwd(), '.openfeel', 'flow.json');
        if (existsSync(fp)) {
          copyFileSync(fp, fp + '.bak');
          console.log('已备份: flow.json.bak');
        } else {
          console.log('flow.json 不存在，无需备份');
        }
      }

      const result = mgr.repair(options.dryRun ?? false);

      if (options.dryRun) {
        console.log('[DRY-RUN 模式] 以下问题将被修复:');
      }

      if (result.recovered) {
        console.log('♻ flow.json 从 .bak 恢复成功');
      }

      for (const change of result.changes) {
        console.log(`  - ${change}`);
      }

      if (result.fixed) {
        if (options.dryRun) {
          console.log('\n检测到可修复的问题，使用不带 --dry-run 执行以应用修复。');
        } else {
          console.log('\n✓ flow.json 修复完成');
        }
      } else {
        if (options.dryRun && result.changes.length > 0) {
          console.log('\n检测到以下问题（dry-run 模式）:');
          // changes 已在上面输出
          console.log('使用不带 --dry-run 执行以应用修复。');
        } else if (result.changes.length === 1 && result.changes[0] === '未检测到需要修复的问题') {
          console.log('\n未检测到需要修复的问题');
        } else {
          console.error('\n✗ 部分问题无法自动修复，请手动检查 flow.json');
          process.exit(1);
        }
      }
    });

  // flow health [--quick]
  flow
    .command('health')
    .description('全面健康检查 flow.json / 跨文件一致性 / 僵尸状态 / config.yaml 等')
    .option('--quick', '仅检查关键项（phase/current 合法性，跳过其他检查）')
    .action((options: { quick?: boolean }) => {
      const mgr = createManager();

      console.log('openfeel flow health\n');

      const result = mgr.healthCheck(options.quick ?? false);

      // 图标映射
      const icon = (status: 'pass' | 'warn' | 'fail') => {
        if (status === 'pass') return '✅';
        if (status === 'warn') return '⚠️ ';
        return '❌';
      };

      for (const item of result.items) {
        console.log(`${icon(item.status)} ${item.section}: ${item.message}`);
      }

      console.log('');
      if (result.ok) {
        console.log('🎉 健康检查通过');
      } else {
        console.log('⚠️  存在不通过项，请检查上述错误');
      }

      if (options.quick) {
        console.log('（快速模式：仅检查关键项）');
      }

      if (!result.ok) {
        process.exit(1);
      }
    });

  // flow recover — 跨会话上下文恢复
  flow
    .command('recover')
    .description('跨会话上下文恢复：输出流水线状态、阻塞原因和待处理任务')
    .action(() => {
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.log('流水线未初始化（flow.json 不存在）');
        return;
      }

      const recovery = mgr.recoverContext();

      console.log('');
      console.log('═══ 跨会话上下文恢复 ═══');
      console.log('');
      console.log(`流水线阶段: ${recovery.phase ?? '(未知)'}`);
      console.log(`当前操作:   ${recovery.currentOp ?? '(无)'}`);
      console.log(`阶段状态:   ${recovery.stageStatus}`);

      if (recovery.blockedBy) {
        console.log(`阻塞原因:   ${recovery.blockedBy}`);
      }

      if (recovery.pendingTasks.length > 0) {
        console.log('');
        console.log(`待处理任务 (${recovery.pendingTasks.length}):`);
        for (let i = 0; i < recovery.pendingTasks.length; i++) {
          console.log(`  ${i + 1}. ${recovery.pendingTasks[i]}`);
        }
      } else {
        console.log('');
        console.log('无待处理任务');
      }

      // 阶段耗时一览
      const allStats = mgr.getAllStageStats();
      if (Object.keys(allStats).length > 0) {
        console.log('');
        console.log('阶段耗时:');
        for (const [stageId, s] of Object.entries(allStats)) {
          const duration = formatDuration(s.duration_ms);
          const status = s.end_time ? '已完成' : '进行中';
          console.log(`  ${stageId}: ${duration} (${status})`);
        }
      }

      console.log('');
      console.log('═══════════════════════════');
    });

  // flow wizard — 交互式推进流水线
  flow
    .command('wizard')
    .description('交互式流水线向导，逐步推进阶段')
    .action(async () => {
      const mgr = createManager();

      if (!mgr.isLoaded()) {
        console.log('流水线未初始化（flow.json 不存在）');
        return;
      }

      // 阶段标签映射（从 pipelineConfig.phases 动态生成）
      const phaseLabels = mgr.getPhaseLabels();

      try {
        const { select } = await import('@inquirer/prompts');

        // 交互主循环
        for (;;) {
          // 刷新当前状态
          mgr.load();

          const phase = mgr.getPhase();
          const current = mgr.getCurrent();
          const summary = mgr.getSummary();

          // 到达终态时自动退出
          if (phase === 'done') {
            console.log('🎉 流水线已完成！');
            return;
          }

          // 显示当前状态
          console.log('\n═══ 流水线状态 ═══');
          console.log(`阶段: ${phase} (${phaseLabels[phase ?? ''] ?? '未知'})`);
          console.log(`当前操作: ${current ? `${current.stage}.${current.op}` : '(无)'}`);
          console.log(`重试次数: ${summary.retryCount}`);
          console.log(`待处理审查: ${summary.reviewItemsOpen}`);
          console.log('═══════════════════\n');

          // 获取可达的下一步阶段
          const availablePhases = mgr.getAvailablePhases();

          if (availablePhases.length === 0) {
            console.log('当前阶段无可达的下一步操作。');
            return;
          }

          // 构建选项列表（含退出选项，类型扩展支持 '__exit__'）
          type WizardChoice = { name: string; value: PipelinePhase | '__exit__' };
          const choices: WizardChoice[] = availablePhases.map((p, idx) => ({
            name: `${idx + 1}. ${p} → ${phaseLabels[p] ?? p}`,
            value: p,
          }));

          // 添加退出选项
          choices.push({
            name: '退出向导',
            value: '__exit__',
          });

          const targetPhase = await select<PipelinePhase | '__exit__'>({
            message: '选择下一步操作',
            choices,
            pageSize: 10,
          });

          // 用户选择退出
          if (targetPhase === '__exit__') {
            console.log('已退出向导。');
            return;
          }

          // 预览变更
          const prevLabel = phaseLabels[phase ?? ''] ?? phase;
          const nextLabel = phaseLabels[targetPhase] ?? targetPhase;
          console.log(`\n预览: 将阶段从 ${phase} (${prevLabel}) 推进到 ${targetPhase} (${nextLabel})`);

          const confirmChoices = [
            { name: '确认推进', value: 'yes' },
            { name: '取消', value: 'no' },
          ];

          const confirmed = await select({
            message: '确认执行此操作？',
            choices: confirmChoices,
          });

          if (confirmed !== 'yes') {
            console.log('已取消。');
            continue;
          }

          // 执行推进
          const currentOp = current ? `${current.stage}.${current.op}` : null;
          mgr.advancePhase(currentOp, targetPhase);
          mgr.save();
          console.log(`\n✓ 已推进: ${phase} → ${targetPhase}`);

          // 到达终态时退出循环
          if (targetPhase === 'done') {
            console.log('🎉 流水线已完成！');
            return;
          }
        }
      } catch (err) {
        // 非 TTY 环境或用户中断等异常
        if (err instanceof Error) {
          console.error(`错误: ${err.message}`);
        }
      }
    });
}

/** 创建 FlowManager 实例（使用当前工作目录） */
function createManager(): FlowManager {
  return new FlowManager(process.cwd());
}

/** 格式化毫秒时长为人类可读形式 */
function formatDuration(ms: number): string {
  if (ms <= 0) {
    return '0ms';
  }
  if (ms < 1000) {
    return `${ms}ms`;
  }
  if (ms < 60000) {
    return `${(ms / 1000).toFixed(1)}s`;
  }
  const minutes = Math.floor(ms / 60000);
  const seconds = Math.round((ms % 60000) / 1000);
  if (seconds === 0) {
    return `${minutes}m`;
  }
  return `${minutes}m ${seconds}s`;
}
