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

        // 各阶段 phase 展示
        const data = mgr.getData();
        if (data?.pipeline?.current?.stage && data.stages[data.pipeline.current.stage]) {
          const curStage = data.pipeline.current.stage;
          const curPhase = data.stages[curStage].phase;
          console.log(`\n当前活跃阶段: ${curStage} (${curPhase})`);
        }

        // 阶段耗时统计（含 phase 显示）
        const allStats = mgr.getAllStageStats();
        if (Object.keys(allStats).length > 0) {
          console.log('\n阶段耗时:');
          for (const [stageId, s] of Object.entries(allStats)) {
            const duration = formatDuration(s.duration_ms);
            const stagePhase = data?.stages[stageId]?.phase ?? '';
            console.log(`  ${stageId} [${stagePhase}]: ${duration}${s.end_time ? '' : ' (进行中)'}`);
          }
        }
        return;
      }

      const n = Math.max(1, parseInt(options.lines, 10) || 5);
      const v = mgr.verboseSummary(n);

      // ── 基本摘要 ──
      const mgrData = mgr.getData();
      const stagePhase = mgrData?.pipeline?.current?.stage && mgrData.stages[mgrData.pipeline.current.stage]
        ? mgrData.stages[mgrData.pipeline.current.stage].phase
        : '(无)';
      console.log('OpenFeel 流水线状态（verbose）\n');
      console.log(`全局状态: ${v.basic.phase}`);
      console.log(`当前阶段: ${mgrData?.pipeline?.current?.stage ?? '(无)'} — 阶段阶段: ${stagePhase}`);
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
      const curStagePhase = current?.stage && data?.stages[current.stage]
        ? data.stages[current.stage].phase
        : phase;
      console.log(`   阶段:  ${curStagePhase}`);
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
          console.log(`   ${stageId}: phase=${stageData.phase} ${bar} ${opsDone}/${opsTotal} ${marker}`);
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

  // flow current — 显示全局状态 + stage + stage phase + op + retry
  flow
    .command('current')
    .description('显示当前阶段和操作')
    .action(() => {
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.log('流水线未初始化（flow.json 不存在）');
        return;
      }
      const phase = mgr.getPhase();     // MetaPhase: active/paused/done
      const current = mgr.getCurrent();
      const summary = mgr.getSummary();
      const data = mgr.getData();
      const stagePhase = current?.stage && data?.stages[current.stage]
        ? data.stages[current.stage].phase
        : '(无)';
      console.log(`全局状态: ${phase}`);
      console.log(`阶段: ${current?.stage ?? '(无)'}`);
      console.log(`阶段阶段: ${stagePhase}`);
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

  // flow stage — 阶段管理子命令组
  const stageCmd = flow
    .command('stage')
    .description('阶段管理');

  // flow stage add <stageId>
  stageCmd
    .command('add')
    .description('新增流水线阶段')
    .argument('<stageId>', '阶段 ID（如 v4.3）')
    .action((stageId: string) => {
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.error('错误：flow.json 未初始化，请先运行 openfeel init');
        process.exit(1);
      }
      try {
        mgr.addStage(stageId);
        mgr.save();
        console.log(`✓ 已创建阶段: ${stageId} → plan_pending`);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`错误：${msg}`);
        process.exit(1);
      }
    });

  // flow advance --stage <id> --to <phase> [--op <id>] [--force]
  flow
    .command('advance')
    .description('推进流水线阶段')
    .option('--op <id>', '操作 ID（如 stage-01.op-001），仅用于日志/展示')
    .requiredOption('--to <phase>', '目标阶段（如 exec_running）')
    .option('--stage <id>', '阶段 ID（如 stage-03），必须指定')
    .option('--force', '强制执行（跳过非法 phase 校验和阶段跳跃检查）')
    .action((options: { op?: string; to: string; stage?: string; force?: boolean }) => {
      // 自定义 --stage 必选校验（提供中文错误提示）
      if (!options.stage) {
        console.error('错误：--stage 参数必须指定阶段 ID（如 stage-03）');
        process.exit(1);
      }

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

      // 阶段跳跃保护：基于 stage phase 检查当前 phase 到目标 phase 是否存在直接路径
      if (!options.force) {
        const phaseResult = PipelinePhaseSchema.safeParse(options.to);
        if (phaseResult.success && !mgr.hasTransition(options.to, options.stage)) {
          console.error(`错误: 阶段 "${options.stage}" 当前 phase 无法跳转到 "${options.to}"`);
          console.error(`使用 --force 强制执行`);
          process.exit(1);
        }
      }

      // 安全提示：跳过审查直接 done
      const SKIP_WARN_PHASES: PipelinePhase[] = ['exec_running', 'review_pending'];
      if (options.to === 'done' && options.stage) {
        const stage = (mgr.getData()?.stages || {})[options.stage];
        if (stage && SKIP_WARN_PHASES.includes(stage.phase as PipelinePhase)) {
          console.warn('[!] 跳过审查阶段直接标记 done，确认继续');
        }
      }

      try {
        mgr.advanceStagePhase(options.stage, options.to as PipelinePhase);
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`错误：${msg}`);
        process.exit(1);
      }
      mgr.save();
      console.log(`✓ 已推进: ${options.stage} → ${options.to}`);
      if (options.op) {
        console.log(`  操作: ${options.op}`);
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

      // 检测旧格式并建议迁移
      if (mgr.isLoaded() && mgr.needsMigration()) {
        console.log('\n💡 检测到旧版 flow.json 格式（全局 phase），建议运行:');
        console.log('   openfeel flow migrate');
        console.log('   查看迁移预览: openfeel flow migrate --dry-run');
      }
    });

  // flow migrate [--dry-run] [--no-backup]
  flow
    .command('migrate')
    .description('将旧版 flow.json（v4.0 全局 phase）迁移到新版格式（v4.1 阶段级 phase）')
    .option('--dry-run', '仅检测预览，不实际写入文件')
    .option('--no-backup', '跳过 .bak 文件生成（默认生成 flow.json.v4.0.bak）')
    .action((options: { dryRun?: boolean; backup?: boolean }) => {
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.error('错误：flow.json 未初始化');
        process.exit(1);
      }

      // 检测是否已为新格式
      if (!mgr.needsMigration()) {
        console.log('✓ 已是新版格式，无需迁移');
        return;
      }

      // Commander 的 --no-backup 生成 backup=false（而非 noBackup=true）
      const noBackup = options.backup === false;

      // --dry-run 输出迁移预览
      if (options.dryRun) {
        console.log('[DRY-RUN 模式] 以下变更将被执行:\n');
        const result = mgr.migrate(true, noBackup);
        for (const change of result.changes) {
          console.log(`  ${change}`);
        }
        if (result.migrated) {
          console.log('\n（未实际修改文件，使用不带 --dry-run 执行以应用迁移）');
        }
        return;
      }

      // 执行迁移
      const result = mgr.migrate(false, noBackup);

      if (!result.migrated) {
        // 非迁移失败场景（如已是新版格式）已在上方 return
        for (const change of result.changes) {
          if (change.includes('失败')) {
            console.error(`  ${change}`);
          } else {
            console.log(`  ${change}`);
          }
        }
        if (result.changes.some((c) => c.includes('失败'))) {
          console.error('\n✗ 迁移失败');
          process.exit(1);
        }
        return;
      }

      // 持久化
      mgr.save();

      console.log('迁移完成:\n');
      for (const change of result.changes) {
        console.log(`  ${change}`);
      }
      console.log('\n✓ flow.json 已迁移至新版格式');
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
      console.log(`全局状态:   ${mgr.getPhase() ?? '(未知)'}`);
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

  // flow wizard — 交互式推进流水线（支持多 stage 选择，基于 stage phase）
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

          const metaPhase = mgr.getPhase();   // MetaPhase: active/paused/done
          const current = mgr.getCurrent();
          const summary = mgr.getSummary();
          const data = mgr.getData();

          // 终态判断：pipeline.phase === 'done' 或所有 stage phase 均为 'done'
          const allStagesDone = data && Object.keys(data.stages).length > 0
            ? Object.values(data.stages).every(s => s.phase === 'done')
            : false;
          if (metaPhase === 'done' || allStagesDone) {
            console.log('🎉 流水线已完成！');
            return;
          }

          // 确定当前推进的 stage
          const stages = data ? Object.keys(data.stages) : [];
          let currentStage = current?.stage;

          if (stages.length === 0) {
            console.log('无可用阶段。');
            return;
          }

          if (stages.length > 1) {
            // 多个 stage 时让用户选择
            currentStage = await select({
              message: '选择要推进的阶段',
              choices: stages.map(s => ({
                name: s + (s === current?.stage ? ' (当前)' : ''),
                value: s,
              })),
            });
          } else {
            currentStage = stages[0];
          }

          if (!currentStage || !data?.stages[currentStage]) {
            console.log('选择的阶段不可用。');
            return;
          }

          const stagePhase = data.stages[currentStage].phase;

          // 显示当前状态
          console.log('\n═══ 流水线状态 ═══');
          console.log(`全局状态: ${metaPhase}`);
          console.log(`阶段: ${currentStage}`);
          console.log(`阶段阶段: ${stagePhase} (${phaseLabels[stagePhase] ?? '未知'})`);
          if (current && current.stage === currentStage) {
            console.log(`当前操作: ${current.stage}.${current.op}`);
          }
          console.log(`重试次数: ${summary.retryCount}`);
          console.log(`待处理审查: ${summary.reviewItemsOpen}`);
          console.log('═══════════════════\n');

          // 获取可达的下一步阶段（基于选定 stage 的 phase）
          const availablePhases = mgr.getAvailablePhases(currentStage);

          if (availablePhases.length === 0) {
            console.log('当前阶段无可达的下一步操作。');
            return;
          }

          // 构建选项列表（含退出选项）
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
          const prevLabel = phaseLabels[stagePhase] ?? stagePhase;
          const nextLabel = phaseLabels[targetPhase] ?? targetPhase;
          console.log(`\n预览: 将阶段 ${currentStage} 从 ${stagePhase} (${prevLabel}) 推进到 ${targetPhase} (${nextLabel})`);

          const confirmed = await select({
            message: '确认执行此操作？',
            choices: [
              { name: '确认推进', value: 'yes' },
              { name: '取消', value: 'no' },
            ],
          });

          if (confirmed !== 'yes') {
            console.log('已取消。');
            continue;
          }

          // 执行推进（使用 advanceStagePhase）
          mgr.advanceStagePhase(currentStage, targetPhase);
          mgr.save();
          console.log(`\n✓ 已推进: ${currentStage}: ${stagePhase} → ${targetPhase}`);

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
