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
import { execSync } from 'node:child_process';
import { existsSync, copyFileSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FlowManager, type PipelinePhase, type RecoveryContext, type StageStats } from '../core/flow-manager.js';
import { PipelinePhaseSchema, PIPELINE_PHASES } from '../core/pipeline-schema.js';
import { MetricsStore } from '../core/metrics.js';
import { t, getCliLang } from '../core/i18n.js';

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
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!options.verbose) {
        console.log(mgr.summary(lang));

        // 各阶段 phase 展示
        const data = mgr.getData();
        if (data?.pipeline?.current?.stage && data.stages[data.pipeline.current.stage]) {
          const curStage = data.pipeline.current.stage;
          const curPhase = data.stages[curStage].phase;
          console.log('\n' + t('flow.status.currentStage', lang) + `: ${curStage} (${curPhase})`);
        }

        // 阶段耗时统计（含 phase 显示）
        const allStats = mgr.getAllStageStats();
        if (Object.keys(allStats).length > 0) {
          console.log('\n' + t('flow.status.stageDuration', lang) + ':');
          for (const [stageId, s] of Object.entries(allStats)) {
            const duration = formatDuration(s.duration_ms);
            const stagePhase = data?.stages[stageId]?.phase ?? '';
            console.log(`  ${stageId} [${stagePhase}]: ${duration}${s.end_time ? '' : ' ' + t('common.inProgress', lang)}`);
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
      console.log(t('flow.status.verboseTitle', lang) + '\n');
      console.log(t('flow.status.globalStatus', lang) + `: ${v.basic.phase}`);
      console.log(t('flow.status.currentStageLabel', lang) + `: ${mgrData?.pipeline?.current?.stage ?? t('common.none', lang)} — ` + t('flow.status.stagePhase', lang) + `: ${stagePhase}`);
      console.log(t('flow.status.currentOp', lang) + `: ${v.basic.currentOp ?? t('common.none', lang)}`);
      console.log(t('flow.status.retryCount', lang) + `: ${v.basic.retryCount}`);
      console.log(t('flow.status.stagesCount', lang) + `: ${v.basic.stagesCount}`);
      console.log(t('flow.status.opsCount', lang) + `: ${v.basic.opsCount}`);
      console.log(t('flow.status.reviewPending', lang) + `: ${v.basic.reviewItemsOpen}`);
      console.log(t('flow.status.logTotal', lang) + `: ${v.basic.recentLogs}`);
      console.log('');

      // ── 配置级联状态 ──
      console.log(t('flow.status.cascadeTitle', lang));
      const allKeys = new Set([
        ...Object.keys(v.cascade.configDefaults),
        ...Object.keys(v.cascade.statusOverrides),
      ]);
      if (allKeys.size === 0) {
        console.log(t('common.noConfig', lang));
      } else {
        console.log(t('flow.status.cascadeHeader', lang));
        console.log('─────────────────────────────────────────────────');
        for (const key of [...allKeys].sort()) {
          const def = v.cascade.configDefaults[key] ?? '-';
          const over = v.cascade.statusOverrides[key] ?? '-';
          const eff = v.cascade.effective[key] ?? '-';
          const overFlag = v.cascade.statusOverrides[key] ? '*' : ' ';
          console.log(`${key.padEnd(18)} ${def.padEnd(12)} ${overFlag}${over.padEnd(11)} ${eff}`);
        }
        console.log(t('flow.status.cascadeNote', lang));
      }
      console.log('');

      // ── 最近 N 条状态变更 ──
      console.log(t('flow.status.recentTitleTmpl', lang, { n: String(n) }));
      if (v.recentChanges.length === 0) {
        console.log(t('common.noData', lang));
      } else {
        console.log(t('flow.status.recentHeader', lang));
        console.log('───────────────────────────────────────────────────────');
        for (const change of v.recentChanges) {
          console.log(
            `${change.time.padEnd(17)} ${change.agent.padEnd(14)} ${change.change.padEnd(20)} ${change.description}`,
          );
        }
      }
      console.log('');

      // ── 下游 Agent 就绪状态 ──
      console.log(t('flow.status.downstreamTitle', lang));
      if (v.downstreamPhases.length === 0) {
        console.log(t('flow.status.noDownstream', lang));
      } else {
        console.log(t('flow.status.downstreamHeader', lang));
        console.log('──────────────────────────────────');
        for (const dp of v.downstreamPhases) {
          console.log(`${dp.phase.padEnd(20)} ${dp.responsibleAgent}`);
        }
      }
      console.log('');

      // ── 跨会话恢复信息 ──
      const recovery = mgr.recoverContext(lang);
      console.log(t('flow.status.recoveryTitle', lang));
      console.log(`  ` + t('common.stage', lang) + `: ${recovery.phase ?? t('common.unknown', lang)}`);
      console.log(`  ` + t('common.op', lang) + `: ${recovery.currentOp ?? t('common.none', lang)}`);
      console.log(`  ` + t('common.status', lang) + `: ${recovery.stageStatus}`);
      if (recovery.blockedBy) {
        console.log(`  ` + t('common.blockedBy', lang) + `: ${recovery.blockedBy}`);
      }
      if (recovery.pendingTasks.length > 0) {
        console.log('  ' + t('flow.recover.pendingTasksTmpl', lang, { n: String(Math.min(recovery.pendingTasks.length, 10)) }) + ':');
        for (let i = 0; i < Math.min(recovery.pendingTasks.length, 10); i++) {
          console.log(`    ${i + 1}. ${recovery.pendingTasks[i]}`);
        }
        if (recovery.pendingTasks.length > 10) {
          console.log(t('flow.status.recoveryMoreTmpl', lang, { n: String(recovery.pendingTasks.length - 10) }));
        }
      }
    });

  // flow overview — 全状态可视化（/opfx:status 的后端实现）
  flow
    .command('overview')
    .description('全状态可视化视图（/opfx:status 的后端实现）')
    .action(() => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.log(t('common.noInit', lang));
        return;
      }

      const phase = mgr.getPhase();
      const current = mgr.getCurrent();
      const summary = mgr.getSummary();
      const data = mgr.getData();

      // ═══ 标题 ═══
      console.log('');
      console.log('╔══════════════════════════════════════════╗');
      console.log('║' + t('flow.overview.title', lang).padStart(38) + '              ║');
      console.log('╚══════════════════════════════════════════╝');
      console.log('');

      // ── 当前状态 ──
      console.log(t('flow.overview.currentStatus', lang));
      const curStagePhase = current?.stage && data?.stages[current.stage]
        ? data.stages[current.stage].phase
        : phase;
      console.log(`   ` + t('common.stage', lang) + `:  ${curStagePhase}`);
      console.log(`   ` + t('common.op', lang) + `:  ${current ? `${current.stage}.${current.op}` : t('common.none', lang)}`);
      const retrySuffix = t('common.retry', lang).toLowerCase() === 'retry' ? 'times' : '次';
      console.log(`   ` + t('common.retry', lang) + `:  ${summary.retryCount} ${retrySuffix}`);
      console.log('');

      // ── 阶段总览 ──
      console.log(t('flow.overview.stagesOverview', lang));
      if (!data || Object.keys(data.stages).length === 0) {
        console.log('   ' + t('flow.overview.noStages', lang));
      } else {
        console.log(`   ` + t('flow.overview.totalStagesTmpl', lang, { n: String(Object.keys(data.stages).length) }) + `:`);
        for (const [stageId, stageData] of Object.entries(data.stages)) {
          // 类型守卫：仅统计普通对象 ops（跳过 null/undefined/数组）
          const opsMap = stageData.ops && typeof stageData.ops === 'object' && !Array.isArray(stageData.ops)
            ? stageData.ops
            : {};
          const opsTotal = Object.keys(opsMap).length;
          const opsDone = Object.values(opsMap).filter(
            (o: unknown) => (o as { state?: string }).state === 'done'
          ).length;
          const marker = current?.stage === stageId ? '← ' + t('flow.wizard.currentLabel', lang) : '';
          const bar = opsTotal > 0
            ? '█'.repeat(opsDone) + '░'.repeat(opsTotal - opsDone)
            : t('flow.overview.noOps', lang);
          console.log(`   ${stageId}: phase=${stageData.phase} ${bar} ${opsDone}/${opsTotal} ${marker}`);
        }
      }
      console.log('');

      // ── 审查条目 ──
      console.log(t('flow.overview.reviewSection', lang));
      if (!data || data.reviews.length === 0) {
        console.log('   ' + t('flow.overview.noReviews', lang));
      } else {
        const openReviews = data.reviews.filter((r) => r.status === 'open');
        const resolvedReviews = data.reviews.filter((r) => r.status === 'resolved');
        const closedReviews = data.reviews.filter((r) => r.status === 'closed');
        const blockingOpen = openReviews.filter((r) => r.blocking !== false);
        const nonBlockingOpen = openReviews.filter((r) => r.blocking === false);

        console.log(`   ` + t('flow.overview.reviewOpen', lang) + `: ${openReviews.length}` + `（` + t('flow.review.labelBlocking', lang) + ` ${blockingOpen.length} / ` + t('flow.review.labelNonBlocking', lang) + ` ${nonBlockingOpen.length}）`);
        console.log(`   ` + t('flow.overview.reviewResolved', lang) + `: ${resolvedReviews.length}`);
        console.log(`   ` + t('flow.overview.reviewClosed', lang) + `: ${closedReviews.length}`);

        if (openReviews.length > 0) {
          console.log('');
          console.log('   ' + t('flow.overview.reviewPending', lang) + ':');
          for (const rev of openReviews) {
            const blockIcon = rev.blocking !== false ? '🔴' : '🟡';
            const priIcon = rev.priority === 'high' ? '↑' : rev.priority === 'low' ? '↓' : '=';
            console.log(`     ${blockIcon} [${priIcon}] ${rev.id}: ${rev.title} (${rev.op})`);
          }
        }
      }
      console.log('');

      // ── Bug 统计 ──
      console.log(t('flow.overview.bugSection', lang));
      const bugsIndexPath = resolve(process.cwd(), '.openfeel', 'bugs', 'index.md');
      if (existsSync(bugsIndexPath)) {
        try {
          const bugsContent = readFileSync(bugsIndexPath, 'utf-8');
          const openMatch = bugsContent.match(/open[:：]\s*(\d+)/i);
          const closedMatch = bugsContent.match(/closed[:：]\s*(\d+)/i);
          const openBugs = openMatch ? parseInt(openMatch[1]) : 0;
          const closedBugs = closedMatch ? parseInt(closedMatch[1]) : 0;
          console.log(`   ` + t('flow.overview.bugOpen', lang) + `: ${openBugs}  ` + t('flow.overview.bugClosed', lang) + `: ${closedBugs}`);
        } catch {
          console.log('   ' + t('flow.overview.bugUnreadable', lang));
        }
      } else {
        console.log('   ' + t('flow.overview.bugUninitialized', lang));
      }
      console.log('');

      // ── 最近日志 ──
      console.log(t('flow.overview.recentLogs', lang));
      if (!data || data.log.length === 0) {
        console.log('   ' + t('flow.overview.noLogs', lang));
      } else {
        const recentLogs = data.log.slice(-5).reverse();
        for (const entry of recentLogs) {
          const time = entry.time.substring(0, 19).replace('T', ' ');
          console.log(`   [${time}] ${entry.agent}: ${entry.action}`);
        }
      }
      console.log('');

      // ── 健康状态 ──
      console.log(t('flow.overview.health', lang));
      const health = mgr.healthCheck(true); // quick mode
      const passCount = health.items.filter((i) => i.status === 'pass').length;
      const warnCount = health.items.filter((i) => i.status === 'warn').length;
      const failCount = health.items.filter((i) => i.status === 'fail').length;
      console.log('   ' + t('flow.overview.healthStatsTmpl', lang, { n: String(passCount), m: String(warnCount), k: String(failCount) }));
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
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.log(t('common.noInit', lang));
        return;
      }
      const phase = mgr.getPhase();     // MetaPhase: active/paused/done
      const current = mgr.getCurrent();
      const summary = mgr.getSummary();
      const data = mgr.getData();
      const stagePhase = current?.stage && data?.stages[current.stage]
        ? data.stages[current.stage].phase
        : t('common.none', lang);
      console.log(t('flow.current.globalStatus', lang) + `: ${phase}`);
      console.log(t('common.stage', lang) + `: ${current?.stage ?? t('common.none', lang)}`);
      console.log(t('flow.current.stagePhase', lang) + `: ${stagePhase}`);
      console.log(t('flow.current.currentOp', lang) + `: ${current ? `${current.stage}.${current.op}` : t('common.none', lang)}`);
      console.log(t('flow.current.retryCount', lang) + `: ${summary.retryCount}`);
    });

  // flow metrics — 展示 Agent 性能指标
  flow
    .command('metrics')
    .description('展示 Agent 性能指标')
    .action(() => {
      const lang = getCliLang(process.cwd());
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
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.error(t('common.errorNoInit', lang));
        process.exit(1);
      }
      try {
        mgr.addStage(stageId);
        mgr.save();
        console.log(t('flow.stage.addedTmpl', lang, { stage: stageId }));
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(t('common.errorTmpl', lang, { msg }));
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
    .option('--force', '强制执行（跳过非法 phase 校验和阶段跳跃检查，但不可绕过 REV 阻塞检查）')
    .action((options: { op?: string; to: string; stage?: string; force?: boolean }) => {
      const lang = getCliLang(process.cwd());
      // 自定义 --stage 必选校验（提供中文错误提示）
      if (!options.stage) {
        console.error(t('flow.advance.errorNoStage', lang));
        process.exit(1);
      }

      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.error(t('common.errorNoInit', lang));
        process.exit(1);
      }

      // 自动修复 phase/status 不一致（在 validate() 前执行）
      if (options.stage) {
        const repairResult = mgr.autoRepairInconsistency(options.stage);
        if (repairResult.fixed) {
          console.log(t('flow.advance.autoRepaired', lang) + `: ${repairResult.detail}`);
          mgr.save();
        }
      }

      const { valid, errors, warnings } = mgr.validate();

      // 输出自动修正警告
      if (warnings.length > 0) {
        for (const w of warnings) {
          console.warn(`[WARN] ${w}`);
        }
        console.log(t('flow.advance.warnAutoCorrect', lang));
      }

      if (!valid) {
        console.error(t('flow.advance.errorInvalidFormat', lang));
        for (const err of errors) {
          console.error(`  - ${err}`);
        }
        process.exit(1);
      }

      // 非法 phase 校验（P1）：拒绝不在枚举中的目标 phase；--force 可跳过此项，但不可绕过 REV 阻塞检查
      if (!options.force) {
        const phaseResult = PipelinePhaseSchema.safeParse(options.to);
        if (!phaseResult.success) {
          console.error(t('flow.advance.errorInvalidPhaseTmpl', lang, { phase: options.to }));
          console.error(t('flow.advance.labelValidPhases', lang) + `: [${PIPELINE_PHASES.join(', ')}]`);
          console.error(t('flow.advance.hintUseForceFuzzy', lang));
          process.exit(1);
        }
      }

      // 阶段跳跃保护：基于 stage phase 检查当前 phase 到目标 phase 是否存在直接路径
      if (!options.force) {
        const phaseResult = PipelinePhaseSchema.safeParse(options.to);
        if (phaseResult.success && !mgr.hasTransition(options.to, options.stage)) {
          console.error(t('flow.advance.errorPhaseJumpTmpl', lang, { stage: options.stage || '', to: options.to }));
          console.error(t('flow.advance.hintUseForce', lang));
          process.exit(1);
        }
      }

      // 安全提示：跳过审查直接 done
      const SKIP_WARN_PHASES: PipelinePhase[] = ['exec_running', 'review_pending'];
      if (options.to === 'done' && options.stage) {
        const stage = (mgr.getData()?.stages || {})[options.stage];
        if (stage && SKIP_WARN_PHASES.includes(stage.phase as PipelinePhase)) {
          console.warn(t('flow.advance.warnSkipReview', lang));
        }
      }

      // REV 闭环（命令层兜底）：推进到 done 时检查 blocking REV
      if (options.to === 'done' && options.stage) {
        const allReviews = mgr.getReviewItems();
        const stageReviews = allReviews.filter(
          (r) => r.op.startsWith(options.stage!) || r.op === options.stage,
        );
        const blockingOpen = stageReviews.filter(
          (r) => r.blocking !== false && r.status === 'open',
        );
        if (blockingOpen.length > 0) {
          console.warn(`[!] 检测到 ${blockingOpen.length} 个未解决的阻塞 REV：`);
          for (const rev of blockingOpen) {
            console.warn(`    ${rev.id}: ${rev.title} (priority=${rev.priority})`);
          }
          if (options.force) {
            console.warn('[!] --force 已指定，但 REV 安全检查不可绕过。拒绝推进。');
          }
          console.error('错误：blocking REV 未解决前禁止推进到 done。');
          console.error('请先解决上述 REV 或通过 flow review resolve 标记为非阻塞。');
          process.exit(1);
        }
      }

      let archived = false;
      try {
        archived = mgr.advanceStagePhase(options.stage, options.to as PipelinePhase, 'cli');
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(t('common.errorTmpl', lang, { msg }));
        process.exit(1);
      }
      mgr.save();
      // 归档 commit 必须在 flow.json save 之后执行，确保 commit 包含本次 phase 变更
      if (archived) {
        mgr.autoCommitOnDone(options.stage);
      }
      console.log(t('flow.advance.okTmpl', lang, { stage: options.stage || '', to: options.to }));

      // git 脏区检查（安全网）：Executor 未提交时输出醒目警告
      try {
        const gitStatus = execSync('git status --porcelain', {
          cwd: process.cwd(),
          encoding: 'utf-8',
          timeout: 5000,
        }).trim();
        if (gitStatus) {
          console.warn('[!] ╔════════════════════════════════════════╗');
          console.warn('[!] ║  ⚠ Git 脏区警告：存在未提交的变更     ║');
          console.warn('[!] ║  请确认 Executor 已完成 git commit    ║');
          console.warn('[!] ╚════════════════════════════════════════╝');
        }
      } catch {
        // git 不可用（无 .git 目录或 git 未安装）时静默跳过
      }

      if (options.op) {
        console.log(t('flow.advance.opLabelTmpl', lang, { op: options.op }));
      }
    });

  // flow attempt --op <id> --result <pass|fail>
  flow
    .command('attempt')
    .description('记录操作执行结果')
    .requiredOption('--op <id>', '操作 ID（如 stage-01.op-001）')
    .requiredOption('--result <pass|fail>', '执行结果（pass 或 fail）')
    .action((options: { op: string; result: string }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.error(t('common.errorNoInit', lang));
        process.exit(1);
      }

      if (options.result !== 'pass' && options.result !== 'fail') {
        console.error(t('flow.attempt.errorInvalidResult', lang));
        process.exit(1);
      }

      const outcome = mgr.recordAttempt(options.op, options.result as 'pass' | 'fail');
      mgr.save();

      if (options.result === 'pass') {
        console.log(t('flow.attempt.passTmpl', lang, { op: options.op }));
      } else if (outcome.shouldRetry) {
        console.log(t('flow.attempt.failRetryTmpl', lang, { op: options.op }));
      } else if (outcome.shouldReplan) {
        console.log(t('flow.attempt.failReplanTmpl', lang, { op: options.op }));
        // BUG-03 修复：shouldReplan 时自动推进到 scheme_pending
        mgr.advancePhase(options.op, 'scheme_pending');
        mgr.save();
        console.log(t('flow.attempt.autoReplan', lang));
      }
    });

  // flow log [--last <n>]
  flow
    .command('log')
    .description('显示最近操作日志')
    .option('--last <n>', '显示最近 n 条（默认 10）', '10')
    .action((options: { last: string }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.log(t('flow.log.noInit', lang));
        return;
      }

      const n = Math.max(1, parseInt(options.last, 10) || 10);
      const data = mgr.getData();
      if (!data || data.log.length === 0) {
        console.log(t('flow.log.noLogs', lang));
        return;
      }

      const recent = data.log.slice(-n);
      console.log(t('flow.log.recentTitleTmpl', lang, { n: String(recent.length) }) + ':\n');
      for (const entry of recent) {
        const time = entry.time.substring(0, 19).replace('T', ' ');
        console.log(`[${time}] ${entry.agent} — ${entry.action}`);
        if (Object.keys(entry.detail).length > 0) {
          console.log(`  ` + t('flow.log.detail', lang) + `: ${JSON.stringify(entry.detail)}`);
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
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.error(t('common.errorNoInit', lang));
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
        title: options.title || t('flow.review.detail', lang) + `: ${options.op}`,
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
          console.error(t('common.invalidOpId', lang));
          process.exit(1);
        }
        const stageId = options.op.substring(0, dotIdx);
        const opLocalId = options.op.substring(dotIdx + 1);

        // 校验 stage 是否存在于 flow.json
        const data = mgr.getData();
        if (!data || !data.stages[stageId]) {
          console.error(t('flow.review.errorStageNotFoundTmpl', lang, { opId: options.op, stage: stageId }));
          process.exit(1);
        }

        // 校验 op 是否存在于对应 stage 中
        if (!data.stages[stageId].ops[opLocalId]) {
          console.error(t('flow.review.errorOpNotFoundTmpl', lang, { opId: options.op, op: opLocalId, stage: stageId }));
          process.exit(1);
        }

        // 自动修复路径：记录 REV 条目（状态直接 resolved），跳过 review_failed → scheme_pending
        mgr.addAutoFixReview(reviewItem, options.op);
        mgr.save();
        const blockingLabel = reviewItem.blocking !== false ? t('flow.review.labelBlocking', lang) : t('flow.review.labelNonBlocking', lang);
        console.log(t('flow.review.addedAutoFixTmpl', lang, { label: blockingLabel, revId }));
        console.log(`  ` + t('common.op', lang) + `: ${options.op}`);
        console.log(`  ` + t('flow.review.detail', lang) + `: ${options.autoFix}`);
        console.log(t('flow.review.autoFixPhase', lang));
      } else {
        mgr.addReview(reviewItem);
        mgr.save();
        const blockingLabel = reviewItem.blocking !== false ? t('flow.review.labelBlocking', lang) : t('flow.review.labelNonBlocking', lang);
        console.log(t('flow.review.addedTmpl', lang, { label: blockingLabel, revId, op: options.op }) + (options.title ? ` — ${options.title}` : ''));
      }
    });

  // flow review resolve <rev-id>
  reviewCmd
    .command('resolve')
    .description('解决审查条目')
    .argument('<rev-id>', '审查条目 ID（如 REV-001）')
    .action((revId: string) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.error(t('common.errorNoInit', lang));
        process.exit(1);
      }

      const ok = mgr.resolveReview(revId);
      if (ok) {
        mgr.save();
        console.log(t('flow.review.resolvedTmpl', lang, { revId }));
      } else {
        console.error(t('flow.review.notFoundTmpl', lang, { revId }));
        process.exit(1);
      }
    });

  // flow retry --op <id>
  flow
    .command('retry')
    .description('查询操作的重试状态')
    .requiredOption('--op <id>', '操作 ID（如 stage-01.op-001）')
    .action((options: { op: string }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.error(t('common.errorNoInit', lang));
        process.exit(1);
      }

      // 通过 getData() 获取 op 的 max_attempts
      const data = mgr.getData();
      if (!data) {
        console.error(t('flow.retry.errorNoData', lang));
        process.exit(1);
      }

      // 解析 opId 查找 op
      const dotIdx = options.op.lastIndexOf('.');
      if (dotIdx === -1) {
        console.error(t('common.invalidOpId', lang));
        process.exit(1);
      }
      const stageId = options.op.substring(0, dotIdx);
      const opLocalId = options.op.substring(dotIdx + 1);

      const stage = data.stages[stageId];
      if (!stage) {
        console.error(t('flow.retry.errorStageNotFoundTmpl', lang, { stage: stageId }));
        process.exit(1);
      }

      const op = stage.ops[opLocalId];
      if (!op) {
        console.error(t('flow.retry.errorOpNotFoundTmpl', lang, { op: options.op }));
        process.exit(1);
      }

      const retryCount = mgr.getRetryCount(options.op);
      console.log(t('common.op', lang) + `: ${options.op}`);
      console.log(t('common.status', lang) + `: ${op.state}`);
      console.log(t('flow.retry.attemptCount', lang) + `: ${retryCount} / ${op.max_attempts}`);
      if (retryCount >= op.max_attempts) {
        console.log(t('flow.retry.exhausted', lang));
      }
    });

  // flow repair [--dry-run] [--backup]
  flow
    .command('repair')
    .description('自动检测并修复 flow.json 中的常见问题')
    .option('--dry-run', '仅检测不修复')
    .option('--backup', '修复前备份为 .bak')
    .action((options: { dryRun?: boolean; backup?: boolean }) => {
      const lang = getCliLang(process.cwd());
      const mgr = new FlowManager(process.cwd());

      // --backup 选项：修复前手动备份
      if (options.backup) {
        const fp = resolve(process.cwd(), '.openfeel', 'flow.json');
        if (existsSync(fp)) {
          copyFileSync(fp, fp + '.bak');
          console.log(t('flow.repair.backupOk', lang));
        } else {
          console.log(t('flow.repair.noBackup', lang));
        }
      }

      const result = mgr.repair(options.dryRun ?? false);

      if (options.dryRun) {
        console.log(t('flow.repair.dryRunTitle', lang));
      }

      if (result.recovered) {
        console.log(t('flow.repair.recovered', lang));
      }

      for (const change of result.changes) {
        console.log(`  - ${change}`);
      }

      if (result.fixed) {
        if (options.dryRun) {
          console.log('\n' + t('flow.repair.dryRunHint', lang));
        } else {
          console.log('\n' + t('flow.repair.fixDone', lang));
        }
      } else {
        if (options.dryRun && result.changes.length > 0) {
          console.log('\n' + t('flow.repair.dryRunHint', lang));
        } else if (!result.recovered && result.changes.length === 0) {
          console.log('\n' + t('flow.repair.noFix', lang));
        } else {
          console.error('\n' + t('flow.repair.fixFailed', lang));
          process.exit(1);
        }
      }

      // 检测旧格式并建议迁移
      if (mgr.isLoaded() && mgr.needsMigration()) {
        console.log('\n' + t('flow.repair.migrationHint', lang));
        console.log('   openfeel flow migrate');
        console.log('   ' + t('flow.repair.migrationPreview', lang));
      }
    });

  // flow migrate [--dry-run] [--no-backup]
  flow
    .command('migrate')
    .description('将旧版 flow.json（v4.0 全局 phase）迁移到新版格式（v4.1 阶段级 phase）')
    .option('--dry-run', '仅检测预览，不实际写入文件')
    .option('--no-backup', '跳过 .bak 文件生成（默认生成 flow.json.v4.0.bak）')
    .action((options: { dryRun?: boolean; backup?: boolean }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.error(t('common.errorNoInit', lang));
        process.exit(1);
      }

      // 检测是否已为新格式
      if (!mgr.needsMigration()) {
        console.log(t('flow.migrate.alreadyNew', lang));
        return;
      }

      // Commander 的 --no-backup 生成 backup=false（而非 noBackup=true）
      const noBackup = options.backup === false;

      // --dry-run 输出迁移预览
      if (options.dryRun) {
        console.log(t('flow.migrate.dryRunTitle', lang) + '\n');
        const result = mgr.migrate(true, noBackup);
        for (const change of result.changes) {
          console.log(`  ${change}`);
        }
        if (result.migrated) {
          console.log('\n' + t('flow.migrate.dryRunNote', lang));
        }
        return;
      }

      // 执行迁移
      const result = mgr.migrate(false, noBackup);

      if (!result.migrated) {
        // 非迁移失败场景（如已是新版格式）已在上方 return
        for (const change of result.changes) {
          console.log(`  ${change}`);
        }
        if (result.failed) {
          console.error('\n' + t('flow.migrate.failed', lang));
          process.exit(1);
        }
        return;
      }

      // 持久化
      mgr.save();

      console.log(t('flow.migrate.complete', lang) + ':\n');
      for (const change of result.changes) {
        console.log(`  ${change}`);
      }
      console.log('\n' + t('flow.migrate.done', lang));
    });

  // flow checkpoint — Checkpoint 快照管理子命令组
  const checkpointCmd = flow
    .command('checkpoint')
    .description('Checkpoint 快照管理（phase 推进时自动保存 flow.json 快照）');

  // flow checkpoint list [stage]
  checkpointCmd
    .command('list')
    .description('列出所有（或指定阶段的）Checkpoint 快照')
    .argument('[stage]', '阶段 ID（可选），如 v5.3-stage-01')
    .action((stage?: string) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      const snapshots = mgr.listCheckpoints(stage);
      if (snapshots.length === 0) {
        console.log(stage
          ? t('flow.checkpoint.noSnapshotsStageTmpl', lang, { stage })
          : t('flow.checkpoint.noSnapshots', lang));
        return;
      }
      console.log(t('flow.checkpoint.listTitle', lang) + (stage ? ` [${stage}]` : '') + ':');
      for (const s of snapshots) {
        console.log(`  ${s}`);
      }
      console.log(t('flow.checkpoint.listCountTmpl', lang, { n: String(snapshots.length) }));
    });

  // flow checkpoint restore <checkpoint-file> [--force]
  checkpointCmd
    .command('restore')
    .description('从 Checkpoint 快照恢复 flow.json（覆盖当前文件，需 --force 确认）')
    .argument('<checkpoint-file>', '快照文件名（如 v5.3-stage-01-20260807T162300-exec_running.json）')
    .option('--force', '确认恢复操作（覆盖当前 flow.json）')
    .action((file: string, options: { force?: boolean }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      // 安全确认：恢复会覆盖当前 flow.json，必须显式 --force
      if (!options.force) {
        console.error(t('flow.checkpoint.restoreNeedForce', lang));
        process.exit(1);
      }
      const ok = mgr.restoreCheckpoint(file);
      if (ok) {
        console.log(t('flow.checkpoint.restoreOkTmpl', lang, { file }));
      } else {
        console.error(t('flow.checkpoint.restoreFailTmpl', lang, { file }));
        process.exit(1);
      }
    });

  // flow health [--quick]
  flow
    .command('health')
    .description('全面健康检查 flow.json / 跨文件一致性 / 僵尸状态 / config.yaml 等')
    .option('--quick', '仅检查关键项（phase/current 合法性，跳过其他检查）')
    .action((options: { quick?: boolean }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();

      console.log(t('flow.health.title', lang) + '\n');

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
        console.log(t('flow.health.pass', lang));
      } else {
        console.log(t('flow.health.hasFailures', lang));
      }

      if (options.quick) {
        console.log(t('flow.health.quickMode', lang));
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
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.log(t('common.noInit', lang));
        return;
      }

      const recovery = mgr.recoverContext(lang);

      console.log('');
      console.log(t('flow.recover.title', lang));
      console.log('');
      console.log(t('flow.recover.globalStatus', lang) + `:   ${mgr.getPhase() ?? t('common.unknown', lang)}`);
      console.log(t('flow.recover.phase', lang) + `: ${recovery.phase ?? t('common.unknown', lang)}`);
      console.log(t('flow.recover.currentOp', lang) + `:   ${recovery.currentOp ?? t('common.none', lang)}`);
      console.log(t('flow.recover.stageStatus', lang) + `:   ${recovery.stageStatus}`);

      if (recovery.blockedBy) {
        console.log(t('common.blockedBy', lang) + `:   ${recovery.blockedBy}`);
      }

      if (recovery.pendingTasks.length > 0) {
        console.log('');
        console.log(t('flow.recover.pendingTasksTmpl', lang, { n: String(recovery.pendingTasks.length) }) + ':');
        for (let i = 0; i < recovery.pendingTasks.length; i++) {
          console.log(`  ${i + 1}. ${recovery.pendingTasks[i]}`);
        }
      } else {
        console.log('');
        console.log(t('flow.recover.noTasks', lang));
      }

      // 阶段耗时一览
      const allStats = mgr.getAllStageStats();
      if (Object.keys(allStats).length > 0) {
        console.log('');
        console.log(t('flow.recover.stageDuration', lang) + ':');
        for (const [stageId, s] of Object.entries(allStats)) {
          const duration = formatDuration(s.duration_ms);
          const status = s.end_time ? t('common.completed', lang) : t('common.inProgress', lang);
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
      const lang = getCliLang(process.cwd());
      const mgr = createManager();

      if (!mgr.isLoaded()) {
        console.log(t('common.noInit', lang));
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
            console.log(t('flow.wizard.done', lang));
            return;
          }

          // 确定当前推进的 stage
          const stages = data ? Object.keys(data.stages) : [];
          let currentStage = current?.stage;

          if (stages.length === 0) {
            console.log(t('flow.wizard.noStages', lang));
            return;
          }

          if (stages.length > 1) {
            // 多个 stage 时让用户选择
            currentStage = await select({
              message: t('flow.wizard.selectStage', lang),
              choices: stages.map(s => ({
                name: s + (s === current?.stage ? ' ' + t('flow.wizard.currentLabel', lang) : ''),
                value: s,
              })),
            });
          } else {
            currentStage = stages[0];
          }

          if (!currentStage || !data?.stages[currentStage]) {
            console.log(t('flow.wizard.unavailable', lang));
            return;
          }

          const stagePhase = data.stages[currentStage].phase;

          // 显示当前状态
          console.log('\n' + t('flow.wizard.statusHeader', lang));
          console.log(t('flow.status.globalStatus', lang) + `: ${metaPhase}`);
          console.log(t('common.stage', lang) + `: ${currentStage}`);
          console.log(t('flow.wizard.stagePhase', lang) + `: ${stagePhase} (${phaseLabels[stagePhase] ?? t('common.unknown', lang)})`);
          if (current && current.stage === currentStage) {
            console.log(t('flow.status.currentOp', lang) + `: ${current.stage}.${current.op}`);
          }
          console.log(t('flow.wizard.retryCount', lang) + `: ${summary.retryCount}`);
          console.log(t('flow.wizard.pendingReviews', lang) + `: ${summary.reviewItemsOpen}`);
          console.log('═══════════════════\n');

          // 获取可达的下一步阶段（基于选定 stage 的 phase）
          const availablePhases = mgr.getAvailablePhases(currentStage);

          if (availablePhases.length === 0) {
            console.log(t('flow.wizard.noNext', lang));
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
            name: t('flow.wizard.exitOption', lang),
            value: '__exit__',
          });

          const targetPhase = await select<PipelinePhase | '__exit__'>({
            message: t('flow.wizard.selectAction', lang),
            choices,
            pageSize: 10,
          });

          // 用户选择退出
          if (targetPhase === '__exit__') {
            console.log(t('flow.wizard.exited', lang));
            return;
          }

          // 预览变更
          const prevLabel = phaseLabels[stagePhase] ?? stagePhase;
          const nextLabel = phaseLabels[targetPhase] ?? targetPhase;
          console.log(t('flow.wizard.previewTmpl', lang, { stage: currentStage, from: stagePhase, fromLabel: prevLabel, to: targetPhase, toLabel: nextLabel }));

          const confirmed = await select({
            message: t('flow.wizard.confirmTitle', lang),
            choices: [
              { name: t('flow.wizard.confirm', lang), value: 'yes' },
              { name: t('common.cancel', lang), value: 'no' },
            ],
          });

          if (confirmed !== 'yes') {
            console.log(t('common.cancelled', lang));
            continue;
          }

          // 执行推进（使用 advanceStagePhase，标记为 CLI 触发）
          const archived = mgr.advanceStagePhase(currentStage, targetPhase, 'cli');
          mgr.save();
          // 归档 commit 必须在 flow.json save 之后执行，确保 commit 包含本次 phase 变更
          if (archived) {
            mgr.autoCommitOnDone(currentStage);
          }
          console.log(t('flow.wizard.advancedTmpl', lang, { stage: currentStage, from: stagePhase, to: targetPhase }));

          // 到达终态时退出循环
          if (targetPhase === 'done') {
            console.log(t('flow.wizard.done', lang));
            return;
          }
        }
      } catch (err) {
        // 非 TTY 环境或用户中断等异常
        if (err instanceof Error) {
          console.error(t('common.errorTmpl', lang, { msg: err.message }));
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
