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
 * - 新增 flow overview 子命令，实现 openfeel flow overview 全状态可视化
 *
 * 变更摘要 (stage-04: 体验补全):
 * - 新增 flow wizard 子命令，交互式推进流水线阶段
 *
 * 变更摘要 (stage-04: 性能指标):
 * - 新增 flow metrics 子命令，展示 Agent 性能指标
 */
import { Command } from 'commander';
import { execSync } from 'node:child_process';
import { existsSync, copyFileSync, readFileSync, rmSync } from 'node:fs';
import { resolve } from 'node:path';
import { FlowManager, isFlowConcurrentError, normalizeAgentName, detectFillState, type PipelinePhase, type RecoveryContext, type StageStats, type StatusReconcileItem, type ReviewItem, PHASE_PATH_MAX_DEPTH } from '../core/flow-manager.js';
import { PipelinePhaseSchema, PIPELINE_PHASES } from '../core/pipeline-schema.js';
import { validateStageId, suggestStageId, normalizeStageId } from '../core/plan/path.js';
import { MetricsStore } from '../core/metrics.js';
import { addReviewEntry } from '../core/view/entry.js';
import { handleAddStageError, handleConcurrentConflict } from './shared/errors.js';
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
    .option('--json', 'Output as JSON (machine-readable, single JSON document)')
    .action((options: { verbose?: boolean; lines: string; json?: boolean }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      // B1-1：--json 分支须为首行输出且纯 JSON 单文档（不打印标题/颜色/提示行）
      if (options.json) {
        console.log(JSON.stringify(buildStatusJson(mgr), null, 2));
        return;
      }
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
        ...Object.keys(v.cascade.profileDefaults),
        ...Object.keys(v.cascade.configDefaults),
        ...Object.keys(v.cascade.statusOverrides),
      ]);
      if (allKeys.size === 0) {
        console.log(t('common.noConfig', lang));
      } else {
        console.log(t('flow.status.cascadeHeader', lang));
        console.log('─────────────────────────────────────────────────');
        for (const key of [...allKeys].sort()) {
          const prof = v.cascade.profileDefaults[key] ?? '-';
          const def = v.cascade.configDefaults[key] ?? '-';
          const over = v.cascade.statusOverrides[key] ?? '-';
          const eff = v.cascade.effective[key] ?? '-';
          const overFlag = v.cascade.statusOverrides[key] ? '*' : ' ';
          console.log(`${key.padEnd(18)} ${prof.padEnd(12)} ${def.padEnd(12)} ${overFlag}${over.padEnd(11)} ${eff}`);
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
            `${change.time.padEnd(17)} ${normalizeAgentName(change.agent).padEnd(14)} ${change.change.padEnd(20)} ${change.description}`,
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
          console.log(`${dp.phase.padEnd(20)} ${normalizeAgentName(dp.responsibleAgent)}`);
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

  // flow overview — 全状态可视化（openfeel flow overview 的后端实现）
  flow
    .command('overview')
    .description('全状态可视化视图（openfeel flow overview 的后端实现）')
    .option('--json', 'Output as JSON')
    .action((options: { json?: boolean }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        // B1 契约：--json 时仍输出纯 JSON 单文档
        if (options.json) {
          console.log(JSON.stringify({ schemaVersion: 1, initialized: false }));
          return;
        }
        console.log(t('common.noInit', lang));
        return;
      }

      // B1-5：--json 分支纯 JSON 单文档（不打印任何标题/颜色/提示行）
      if (options.json) {
        console.log(JSON.stringify(buildOverviewJson(mgr), null, 2));
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
          console.log(`   [${time}] ${normalizeAgentName(entry.agent)}: ${entry.action}`);
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
    .option('--json', 'Output as JSON')
    .action((options: { json?: boolean }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        // B1 契约：--json 时仍输出纯 JSON 单文档（未初始化 → 空串字段）
        if (options.json) {
          console.log(JSON.stringify({ schemaVersion: 1, stage: '', op: '', phase: '' }));
          return;
        }
        console.log(t('common.noInit', lang));
        return;
      }
      const phase = mgr.getPhase();     // MetaPhase: active/paused/done
      const current = mgr.getCurrent();
      const data = mgr.getData();
      // B8：getCurrent() 在 op 为空时返回 null（契约不变）；命令层回退读取 pipeline.current 展示 stage + 「（无 op）」
      const rawCurrent = data?.pipeline.current;
      const displayStage = current?.stage ?? rawCurrent?.stage ?? '';
      const displayOp = current?.op ?? rawCurrent?.op ?? '';

      // B1-2：--json 分支纯 JSON 单文档（op 为空串而非 null，便于机器消费）
      if (options.json) {
        console.log(JSON.stringify({ schemaVersion: 1, stage: displayStage, op: displayOp, phase: phase ?? '' }));
        return;
      }

      const summary = mgr.getSummary();
      const stagePhase = displayStage && data?.stages[displayStage]
        ? data.stages[displayStage].phase
        : t('common.none', lang);
      console.log(t('flow.current.globalStatus', lang) + `: ${phase}`);
      // B8：stage 存在但无 op → `{stage}（无 op）`；stage 亦空 → 保持既有「(无)」文案
      if (!displayStage) {
        console.log(t('common.stage', lang) + `: ${t('common.none', lang)}`);
      } else if (!displayOp) {
        console.log(t('common.stage', lang) + `: ` + t('flow.current.noOpTmpl', lang, { stage: displayStage }));
      } else {
        console.log(t('common.stage', lang) + `: ${displayStage}`);
      }
      console.log(t('flow.current.stagePhase', lang) + `: ${stagePhase}`);
      console.log(t('flow.current.currentOp', lang) + `: ${displayOp ? `${displayStage}.${displayOp}` : t('common.none', lang)}`);
      console.log(t('flow.current.retryCount', lang) + `: ${summary.retryCount}`);
    });

  // flow metrics — 展示 Agent 性能指标
  flow
    .command('metrics')
    .description('展示 Agent 性能指标')
    .option('--json', 'Output as JSON')
    .action((options: { json?: boolean }) => {
      const lang = getCliLang(process.cwd());
      const store = MetricsStore.getInstance();
      store.load();
      // B1-4：--json 输出结构化指标（顶层对象 + schemaVersion），不输出人类可读表格
      if (options.json) {
        console.log(JSON.stringify({ schemaVersion: 1, ...store.getSummaryData() }, null, 2));
        return;
      }
      console.log(store.summary(lang));
    });

  // flow phases — 自描述：列出全部合法 phase 与运行时转移表
  flow
    .command('phases')
    .description('列出全部合法 phase 及其流转映射（自描述）')
    .option('--json', 'Output { phases, transitions, advanceAccepted, schemaVersion } as JSON')
    .action((options: { json?: boolean }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      const phases = mgr.getPipelinePhases();
      const transitions = mgr.getPipelineTransitions();
      // 运行时 vs 内置默认 transitions 差异（T19：使漂移可见，不补组合键）
      const defaults = mgr.getDefaultTransitions();
      const missingKeys = Object.keys(defaults).filter((k) => !(k in transitions));
      const extraKeys = Object.keys(transitions).filter((k) => !(k in defaults));
      const changedKeys = Object.keys(defaults).filter(
        (k) => k in transitions && JSON.stringify(defaults[k]) !== JSON.stringify(transitions[k]),
      );
      const transitionsDiff = { missing: missingKeys, extra: extraKeys, changed: changedKeys };

      if (options.json) {
        // advanceAccepted = 内置 15 phase（flow advance 的推进白名单），与 phases（运行时存在视图，可含自定义）显式区分
        // 既有三字段（phases/transitions/advanceAccepted）+ transitionsDiff 逐字保留；仅追加 schemaVersion:1（B1-6）
        // 注：schemaVersion 未来变更须递增版本号
        console.log(JSON.stringify({ schemaVersion: 1, phases, transitions, advanceAccepted: [...PIPELINE_PHASES], transitionsDiff }, null, 2));
        return;
      }

      console.log(t('flow.phases.title', lang));
      console.log(t('flow.phases.listLabel', lang) + `: ${phases.length}`);
      for (const p of phases) {
        console.log(`  - ${p}`);
      }
      console.log('');
      console.log(t('flow.phases.transitionsLabel', lang) + ':');
      for (const [key, targets] of Object.entries(transitions)) {
        console.log(`  ${key} → [${targets.join(', ')}]`);
      }
      console.log('');
      // 差异提示（非空时输出）——T19
      if (missingKeys.length + extraKeys.length + changedKeys.length > 0) {
        const parts: string[] = [];
        if (missingKeys.length > 0) { parts.push(t('flow.phases.transitionsDiffMissing', lang, { keys: missingKeys.join(', ') })); }
        if (extraKeys.length > 0) { parts.push(t('flow.phases.transitionsDiffExtra', lang, { keys: extraKeys.join(', ') })); }
        if (changedKeys.length > 0) { parts.push(t('flow.phases.transitionsDiffChanged', lang, { keys: changedKeys.join(', ') })); }
        console.log(t('flow.phases.transitionsDiffNote', lang, { detail: parts.join('; ') }));
      }
      // 边界：运行时 pipeline.yaml 含内置 15 phase 之外的 phase 时提示差异（cli/BUG-001 方案 B）
      const customPhases = phases.filter((p) => !(PIPELINE_PHASES as readonly string[]).includes(p));
      if (customPhases.length > 0) {
        console.log(t('flow.phases.customPhaseNote', lang, { phases: customPhases.join(', ') }));
      }
      console.log(t('flow.phases.hint', lang));
    });

  // flow stage — 阶段管理子命令组
  const stageCmd = flow
    .command('stage')
    .description('阶段管理');

  // flow stage add <stageId>
  stageCmd
    .command('add')
    .description('新增流水线阶段（仅注册 flow.json，不建目录；通常应使用 openfeel plan stage add）')
    .argument('<stageId>', '阶段 ID（如 v1.1.2-stage-41）')
    .action((stageId: string) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      // 非法 stageId 统一报错 + 建议名（op-002 校验底座）
      const v = validateStageId(stageId);
      if (!v.ok) {
        console.error(t('common.stageIdInvalidTmpl', lang, { input: stageId }));
        console.error(t('common.stageIdSuggestTmpl', lang, { suggest: suggestStageId(projectPath, stageId) }));
        process.exit(1);
      }
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
        // addStage 错误统一处理（并发写冲突 / 目录冲突 / 其他），与 stage create 共用单点（T42）
        handleAddStageError(err, lang);
      }
    });

  // flow stage remove <stageId> [--force] [--dry-run] [--purge]
  stageCmd
    .command('remove <stageId>')
    .description('移除流水线阶段（安全校验；默认仅注销 flow.json，不删目录）')
    .option('--force', '越过安全校验（ops 非空 / 当前活跃阶段 / 被其它阶段依赖）')
    .option('--dry-run', '仅预览，不写盘')
    .option('--purge', '同时删除 plan/{series}/{stageDir}/ 目录（非 TTY 须配 --force）')
    .action(async (stageId: string, options: { force?: boolean; dryRun?: boolean; purge?: boolean }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.error(t('common.errorNoInit', lang));
        process.exit(1);
      }
      const data = mgr.getData();
      // REV-007：命令层归一化（短名 → 全名），与 stage set / ops list / op-012 advance 同范式
      const stageArg = normalizeStageId(stageId) ?? stageId;
      if (!data?.stages[stageArg]) {
        console.error(t('flow.stage.remove.notFoundTmpl', lang, { stage: stageArg }));
        process.exit(1);
        return;
      }

      // --dry-run：复用 checkRemovable 做安全校验，失败同样 exit 1（REV-005），并呈现引用者（REV-004）
      if (options.dryRun) {
        const info = mgr.checkRemovable(stageArg, { force: options.force });
        console.log(t('flow.stage.remove.dryRunTitle', lang));
        console.log(`  ` + t('common.stage', lang) + `: ${stageArg}`);
        console.log(`  ops: ${info.opCount}`);
        console.log(`  current: ${data.pipeline.current.stage}${info.isCurrent ? ' ←' : ''}`);
        console.log(`  ` + t('flow.stage.remove.dryRunReferencing', lang) + `: ` +
          (info.referencing.length > 0 ? info.referencing.join(', ') : t('common.none', lang)));
        if (!info.ok) {
          console.error(t('common.errorTmpl', lang, { msg: info.reason ?? '' }));
          process.exit(1);
          return;
        }
        console.log(t('flow.stage.remove.dryRunOk', lang));
        return;
      }

      // --purge 非 TTY 守卫
      if (options.purge && !options.force && !process.stdout.isTTY) {
        console.error(t('flow.stage.remove.purgeNeedForce', lang));
        process.exit(1);
        return;
      }

      try {
        // --purge TTY 二次确认（--force 跳过）
        if (options.purge && !options.force) {
          const { confirm } = await import('@inquirer/prompts');
          const ok = await confirm({ message: t('flow.stage.remove.purgeConfirm', lang), default: false });
          if (!ok) {
            console.log(t('common.cancelled', lang));
            return;
          }
        }
        // 事务顺序（REV-009）：先注销内存注册 → save() 落盘成功 → 再删目录。
        // save() 失败则不会到达目录删除，杜绝「目录已删但注册仍在」的中间态。
        const { purgeTarget } = mgr.removeStage(stageArg, { force: options.force, purge: options.purge });
        mgr.save();
        if (purgeTarget) {
          rmSync(purgeTarget, { recursive: true, force: true });
          console.log(t('flow.stage.remove.purgedTmpl', lang));
        }
        console.log(t('flow.stage.remove.okTmpl', lang, { stage: stageArg }));
      } catch (err: unknown) {
        // 并发写冲突：统一单点（i18n 文案 + 退出码 2）；其余走通用错误
        if (isFlowConcurrentError(err)) {
          handleConcurrentConflict(err, lang);
        }
        const msg = err instanceof Error ? err.message : String(err);
        console.error(t('common.errorTmpl', lang, { msg }));
        process.exit(1);
      }
    });

  // flow stage set <stageId> [--deps <ids...>]
  stageCmd
    .command('set <stageId>')
    .description('设置阶段依赖（覆盖写入；未指定 --deps 视为清空）')
    .option('--deps <ids...>', '依赖阶段 ID 列表（空格或逗号分隔；含变长参数，建议置于命令末尾）')
    .action((stageId: string, options: { deps?: string[] }) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      // 非法 stageId 统一报错 + 建议名
      const v = validateStageId(stageId);
      if (!v.ok) {
        console.error(t('common.stageIdInvalidTmpl', lang, { input: stageId }));
        console.error(t('common.stageIdSuggestTmpl', lang, { suggest: suggestStageId(projectPath, stageId) }));
        process.exit(1);
      }
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.error(t('common.errorNoInit', lang));
        process.exit(1);
      }
      const data = mgr.getData()!;
      // 兼容 --deps a,b 与 --deps a b：逐项按逗号再切分、去空（与 plan stage add 对齐）
      const deps = (options.deps ?? [])
        .flatMap((d) => d.split(','))
        .map((s) => s.trim())
        .filter(Boolean);

      // 悬空依赖：命令层强制校验（核心层仅 warn），非法一律 exit 1 且不写盘
      const known = new Set(Object.keys(data.stages).map((k) => normalizeStageId(k) ?? k));
      const invalid = deps.filter((d) => !known.has(normalizeStageId(d) ?? d));
      if (invalid.length > 0) {
        console.error(t('stage.set.depsDanglingTmpl', lang, { deps: invalid.join(', ') }));
        process.exit(1);
        return;
      }

      // 目标阶段必须存在
      const target = normalizeStageId(stageId) ?? stageId;
      if (!data.stages[target]) {
        console.error(t('common.stageIdInvalidTmpl', lang, { input: stageId }));
        process.exit(1);
        return;
      }

      try {
        mgr.setStageDeps(stageId, deps);
      } catch (err: unknown) {
        if (isFlowConcurrentError(err)) {
          handleConcurrentConflict(err, lang);
        }
        const msg = err instanceof Error ? err.message : String(err);
        console.error(t('common.errorTmpl', lang, { msg }));
        process.exit(1);
        return;
      }
      console.log(t('stage.set.depsOkTmpl', lang, {
        stage: target,
        deps: deps.length > 0 ? deps.join(', ') : t('common.none', lang),
      }));
    });

  // flow stage reset <stageId> --to <phase> [--dry-run]
  stageCmd
    .command('reset <stageId>')
    .description('复位阶段 phase（允许回退；受合法值域与 to=done 的 REV 阻塞约束）')
    .requiredOption('--to <phase>', '目标 phase（如 review_pending / test_pending / done）；合法值见 openfeel flow phases')
    .option('--dry-run', '仅预览，不写盘')
    .action((stageId: string, options: { to: string; dryRun?: boolean }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.error(t('common.errorNoInit', lang));
        process.exit(1);
      }
      const stageArg = normalizeStageId(stageId) ?? stageId;
      try {
        const result = mgr.resetStagePhase(stageArg, options.to, { dryRun: options.dryRun });
        if (options.dryRun) {
          console.log(t('flow.stage.reset.previewTitle', lang));
          console.log(t('flow.stage.reset.previewTmpl', lang, {
            stage: stageArg,
            from: result.from,
            to: result.to,
            status: result.status,
          }));
          return;
        }
        if (!result.changed) {
          console.log(t('flow.stage.reset.noopTmpl', lang, { stage: stageArg, phase: result.to }));
          return;
        }
        // 核心层仅改内存；命令层 save()（与 advance 同范式）
        mgr.save();
        console.log(t('flow.stage.reset.okTmpl', lang, {
          stage: stageArg,
          from: result.from,
          to: result.to,
        }));
      } catch (err: unknown) {
        // 并发写冲突：统一单点（i18n 文案 + 退出码 2）；其余走通用错误
        if (isFlowConcurrentError(err)) {
          handleConcurrentConflict(err, lang);
        }
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
    .requiredOption('--to <phase>', '目标阶段（如 exec_running）。合法 phase 与转移表：openfeel flow phases')
    .option('--stage <id>', '阶段 ID（如 stage-03），必须指定')
    .option('--force', '强制执行（跳过非法 phase 校验和阶段跳跃检查，但不可绕过 REV 阻塞检查）')
    .option('--dry-run', '仅验证不执行修改（预览输出）。与 --force 组合时跳过校验但仍不执行修改')
    .option('--quiet', '静默非错误输出（成功确认与 Git 警告均不打印）')
    .action((options: { op?: string; to: string; stage?: string; force?: boolean; dryRun?: boolean; quiet?: boolean }) => {
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

      // REV-005：命令层归一化（短名 → 全名），与 plan.ts / flow.ts 其它 stage 解析点同范式
      const stageArg = normalizeStageId(options.stage) ?? options.stage;

      // 自动修复 phase/status 不一致（在 validate() 前执行）
      if (options.stage) {
        // B1 修复：dry-run 走预览模式（不写内存/不写盘），仅在非 dry-run 时 save()
        const repairResult = mgr.autoRepairInconsistency(stageArg, { dryRun: options.dryRun });
        if (repairResult.fixed) {
          console.log(
            options.dryRun
              ? t('flow.advance.autoRepairPreview', lang) + `: ${repairResult.detail}`
              : t('flow.advance.autoRepaired', lang) + `: ${repairResult.detail}`,
          );
          if (!options.dryRun) {
            mgr.save();
          }
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

      // 阶段路径解析（B5-1）：非 --force 时求「当前 phase → to」的唯一可达路径
      // - 唯一路径（含单步）→ 沿路径逐步推进；单步时与既有行为完全一致
      // - 无路径 / 多义 / 超深 → 拒绝（exit 1 + 可达目标；保留既有跳转诊断）
      // - 已在 to → no-op 成功
      let phasePath: string[] = [options.to];
      if (!options.force) {
        const pathResult = mgr.findPhasePath(stageArg, options.to);
        if (pathResult.reason === 'no-path' || pathResult.reason === 'ambiguous' || pathResult.reason === 'depth-exceeded') {
          const data = mgr.getData();
          const currentPhase = data?.stages[stageArg]?.phase ?? t('common.unknown', lang);
          const availableTargets = mgr.getAvailablePhases(stageArg);
          if (pathResult.reason === 'ambiguous') {
            console.error(t('flow.advance.ambiguousTmpl', lang));
          } else if (pathResult.reason === 'depth-exceeded') {
            console.error(t('flow.advance.depthExceededTmpl', lang, { max: String(PHASE_PATH_MAX_DEPTH) }));
          } else {
            console.error(t('flow.advance.noPathTmpl', lang, {
              from: currentPhase,
              to: options.to,
              targets: availableTargets.length > 0 ? `[${availableTargets.join(', ')}]` : t('common.none', lang),
            }));
          }
          // 保留既有跳转诊断（可达目标）——与现状一致
          console.error(t('flow.advance.errorPhaseJumpTmpl', lang, { stage: stageArg, to: options.to }));
          console.error(t('flow.advance.currentPhaseTmpl', lang, { phase: currentPhase }));
          if (availableTargets.length > 0) {
            console.error(t('flow.advance.availableTargets', lang) + `: [${availableTargets.join(', ')}]`);
          } else {
            console.error(t('flow.advance.noAvailableTargets', lang));
          }
          console.error(t('flow.advance.hintUseForce', lang));
          process.exit(1);
          return;
        }
        if (pathResult.reason === 'already-at-target') {
          // 已在目标 phase → no-op 成功
          if (!options.quiet) {
            console.log(t('flow.advance.alreadyAtTargetTmpl', lang, { stage: stageArg, to: options.to }));
          }
          return;
        }
        phasePath = pathResult.path;
      }

      // 安全提示：跳过审查直接 done（保持既有条件）
      const SKIP_WARN_PHASES: PipelinePhase[] = ['exec_running', 'review_pending'];
      if (options.to === 'done' && options.stage) {
        const stage = (mgr.getData()?.stages || {})[stageArg];
        if (stage && SKIP_WARN_PHASES.includes(stage.phase as PipelinePhase)) {
          console.warn(t('flow.advance.warnSkipReview', lang));
        }
      }

      // REV 闭环（命令层兜底）：推进到 done 时检查 blocking REV（单步入口；多步循环每步后另复检，B5-3）
      if (options.to === 'done' && options.stage) {
        const blockingOpen = assertNoBlockingOpenRev(mgr, stageArg, lang);
        if (blockingOpen.length > 0) {
          if (options.force) {
            console.warn(t('flow.advance.forceRevRefused', lang));
          }
          console.error(t('flow.advance.blockingRevRefused', lang));
          console.error(t('flow.advance.blockingRevHint', lang));
          process.exit(1);
          return;
        }
      }

      // 起始 phase（供多步逐步输出）；REV-005/REV-006：以归一化后的 stageArg 索引
      const startPhase = mgr.getData()?.stages[stageArg]?.phase ?? t('common.unknown', lang);

      // --dry-run：仅验证合法性，不实际修改 flow.json（B5-2：多步时打印完整路径）
      if (options.dryRun) {
        if (options.force) {
          console.warn(t('flow.advance.dryRunForceWarn', lang));
        }
        console.log(t('flow.advance.dryRunTitle', lang));
        console.log(`  ` + t('common.stage', lang) + `: ${stageArg}`);
        console.log(`  ` + t('flow.advance.dryRunFrom', lang) + `: ${startPhase}`);
        console.log(`  ` + t('flow.advance.dryRunTo', lang) + `: ${options.to}`);
        if (phasePath.length > 1) {
          const fullPath = [startPhase, ...phasePath].join(t('flow.advance.pathArrow', lang));
          console.log(`  ` + t('flow.advance.pathTitle', lang) + ` ${fullPath}`);
        }
        console.log('');
        console.log(t('flow.advance.dryRunOk', lang));
        return;
      }

      // 逐步推进（B5-2 / A3）：唯一路径 → 依次调用 advanceStagePhase（保留每步校验/日志/checkpoint）
      // 中间态不回滚（A3）；失败 → 输出「已完成 / 失败点 / 剩余路径」+ exit 1
      const totalSteps = phasePath.length;
      let archivedAny = false;
      for (let i = 0; i < totalSteps; i++) {
        const next = phasePath[i];
        let archived = false;
        try {
          archived = mgr.advanceStagePhase(stageArg, next as PipelinePhase, 'cli');
        } catch (err: unknown) {
          if (totalSteps > 1) {
            const remaining = phasePath.slice(i).join(t('flow.advance.pathArrow', lang));
            const doneTo = i > 0 ? phasePath[i - 1] : t('common.none', lang);
            console.error(t('flow.advance.partialFailTmpl', lang, { done: doneTo, failed: next, remaining }));
          }
          const msg = err instanceof Error ? err.message : String(err);
          console.error(t('common.errorTmpl', lang, { msg }));
          process.exit(1);
          return;
        }
        archivedAny = archivedAny || archived;
        mgr.save();
        // 归档 commit 必须在 flow.json save 之后执行，确保 commit 包含本次 phase 变更
        if (archived) {
          mgr.autoCommitOnDone(stageArg);
        }
        // 多步时逐步输出（单步保持既有静默，不新增输出）
        if (totalSteps > 1 && !options.quiet) {
          console.log(t('flow.advance.stepOkTmpl', lang, {
            stage: stageArg,
            from: i > 0 ? phasePath[i - 1] : startPhase,
            to: next,
          }));
        }
        // B5-3（REV-52-001）：多步路径每步完成后复检 blocking open REV（至少进入 done 前一次）
        // 等价论证：addAutoFixReview 强制 status='resolved'（恒非 blocking open）且 advance 路径不创建 review，
        // 故此复检为**防御性加固**（防未来语义漂移）。
        if (totalSteps > 1) {
          const blockingOpen = assertNoBlockingOpenRev(mgr, stageArg, lang);
          if (blockingOpen.length > 0) {
            const remainingPath = phasePath.slice(i + 1);
            console.error(t('flow.advance.blockedByRevTmpl', lang, {
              revs: blockingOpen.map((r) => r.id).join(', '),
              remaining: remainingPath.length > 0 ? remainingPath.join(t('flow.advance.pathArrow', lang)) : t('common.none', lang),
            }));
            process.exit(1);
            return;
          }
        }
      }

      // 成功确认（单步与多步统一）；--quiet 完全静默
      if (!options.quiet) {
        console.log(t('flow.advance.okTmpl', lang, { stage: stageArg, to: options.to }));
      }

      // git 脏区检查（安全网）：默认仅 --to done 时提示；--quiet / 非 done → 完全跳过（含跳过 git 子进程）
      if (!options.quiet && (options.to === 'done' || archivedAny)) {
        try {
          const gitStatus = execSync('git status --porcelain', {
            cwd: process.cwd(),
            encoding: 'utf-8',
            timeout: 5000,
          }).trim();
          if (gitStatus) {
            console.warn(t('flow.advance.gitDirtyBoxTop', lang));
            console.warn(t('flow.advance.gitDirtyBoxMsg', lang));
            console.warn(t('flow.advance.gitDirtyBoxHint', lang));
            console.warn(t('flow.advance.gitDirtyBoxBottom', lang));
          }
        } catch {
          // git 不可用（无 .git 目录或 git 未安装）时静默跳过
        }
      }

      if (options.op && !options.quiet) {
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

      // B4-5（A1 第 5 条）/ REV-52-002：draft op 拒绝记录执行结果（命令层守卫；核心层 recordAttempt 另有兜底）
      if (mgr.getOpState(options.op) === 'draft') {
        const dotIdx = options.op.lastIndexOf('.');
        const stageId = dotIdx >= 0 ? options.op.substring(0, dotIdx) : '';
        const localOpId = dotIdx >= 0 ? options.op.substring(dotIdx + 1) : options.op;
        console.error(t('flow.attempt.draftRefusedTmpl', lang, { stage: stageId, opId: localOpId }));
        process.exit(1);
        return;
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

      // N4-2：输出当前指针（只读，与 flow current 同源；attempt 后 current.op 已由 syncCurrentOp 同步）
      const cur = mgr.getData()?.pipeline.current;
      if (cur && cur.stage) {
        if (cur.op) {
          console.log(t('flow.attempt.currentOpTmpl', lang, { stage: cur.stage, op: cur.op }));
        } else {
          console.log(t('flow.attempt.currentOpEmptyTmpl', lang, { stage: cur.stage }));
        }
      }
    });

  // flow ops list [--stage <id>] [--json] — B3-1：操作方案视图（状态 + 模板填充度 + draft 分组）
  const opsCmd = flow
    .command('ops')
    .description('操作方案视图');

  opsCmd
    .command('list')
    .description('列出操作方案（含状态与模板填充度）')
    .option('--stage <id>', '仅列出指定阶段')
    .option('--json', 'Output as JSON')
    .action((options: { stage?: string; json?: boolean }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        if (options.json) {
          console.log(JSON.stringify({ schemaVersion: 1, ops: [] }));
          return;
        }
        console.log(t('common.noInit', lang));
        return;
      }
      const filterStage = options.stage ? (normalizeStageId(options.stage) ?? options.stage) : undefined;
      const data = mgr.getData()!;
      const items: Array<{ stage: string; opId: string; title: string; state: string; fill: 'empty' | 'partial' | 'filled' }> = [];
      for (const [stageId, stage] of Object.entries(data.stages)) {
        if (filterStage && stageId !== filterStage) {
          continue;
        }
        const opsMap = stage.ops && typeof stage.ops === 'object' && !Array.isArray(stage.ops) ? stage.ops : {};
        for (const [opId, op] of Object.entries(opsMap)) {
          // 填充度：复用 flow-manager 的单一标记判定。
          // 已知边界（stage-54 E1-补 / A9）：content 为 null（op 文件缺失 / 命名不含前缀 / 目录不可读）时视为 filled，
          // 与 health 的「null 跳过不报」为同向漏检（非分叉）；现行数据短名命中故不可复现，
          // 不扩展 detectFillState 返回域与 --json 契约。
          const content = mgr.readOpTemplate(stageId, opId);
          const fill = content === null ? 'filled' : detectFillState(content);
          items.push({
            stage: stageId,
            opId,
            title: (op as { title?: string }).title ?? '',
            state: (op as { state?: string }).state ?? '',
            fill,
          });
        }
      }

      if (options.json) {
        // 复用 op-001 口径：顶层对象 + schemaVersion:1
        const ops = items.map((it) => ({
          stage: it.stage,
          opId: it.opId,
          title: it.title,
          state: it.state,
          fill: it.fill,
          ...(it.fill === 'empty' ? { warning: t('flow.ops.emptyWarningTmpl', lang, { opId: it.opId }) } : {}),
        }));
        console.log(JSON.stringify({ schemaVersion: 1, ops }, null, 2));
        return;
      }

      console.log(t('flow.ops.title', lang));
      const published = items.filter((i) => i.state !== 'draft');
      const drafts = items.filter((i) => i.state === 'draft');
      const printGroup = (label: string, list: typeof items): void => {
        if (list.length === 0) {
          return;
        }
        console.log(label);
        for (const it of list) {
          console.log(`  ${it.stage}.${it.opId} [${it.state}] (${it.fill}) ${it.title}`);
          // 空模板 warning（draft 亦提示，引导 publish 前先填充）
          if (it.fill === 'empty') {
            console.log(t('flow.ops.emptyWarningTmpl', lang, { opId: it.opId }));
          }
        }
      };
      printGroup(t('flow.ops.groupActive', lang), published);
      printGroup(t('flow.ops.groupDraft', lang), drafts);
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
        console.log(`[${time}] ${normalizeAgentName(entry.agent)} — ${entry.action}`);
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
      // 单点实现：解析 / 校验 / REV ID 分配 / 写入均由 addReviewEntry 统一处理（T37/R4）
      const blocking = options.blocking !== undefined
        ? !(options.blocking === 'false' || options.blocking === false)
        : true;
      const result = addReviewEntry(process.cwd(), {
        opId: options.op,
        title: options.title || t('flow.review.detail', lang) + `: ${options.op}`,
        priority: 'medium',
        autoFixDetail: options.autoFix,
        blocking,
      });

      if (result.error) {
        // 错误路径：按错误码分流 i18n 文案（单点返回 code，命令层只负责呈现）
        switch (result.error.code) {
          case 'notLoaded':
            console.error(t('common.errorNoInit', lang));
            break;
          case 'invalidOpId':
            console.error(t('common.invalidOpId', lang));
            break;
          case 'stageNotFound':
            console.error(t('flow.review.errorStageNotFoundTmpl', lang, { opId: result.error.opId, stage: result.error.stage }));
            break;
          case 'opNotFound':
            console.error(t('flow.review.errorOpNotFoundTmpl', lang, { opId: result.error.opId, op: result.error.op, stage: result.error.stage }));
            break;
          case 'invalidPriority':
            console.error(t('flow.review.errorInvalidPriorityTmpl', lang, { priority: result.error.priority }));
            break;
        }
        process.exit(1);
        return;
      }

      const review = result.review!;
      const blockingLabel = review.blocking !== false ? t('flow.review.labelBlocking', lang) : t('flow.review.labelNonBlocking', lang);
      if (options.autoFix) {
        console.log(t('flow.review.addedAutoFixTmpl', lang, { label: blockingLabel, revId: review.id }));
        console.log(`  ` + t('common.op', lang) + `: ${options.op}`);
        console.log(`  ` + t('flow.review.detail', lang) + `: ${options.autoFix}`);
        console.log(t('flow.review.autoFixPhase', lang));
      } else {
        console.log(t('flow.review.addedTmpl', lang, { label: blockingLabel, revId: review.id, op: options.op }) + (options.title ? ` — ${options.title}` : ''));
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

  // flow review update <rev-id> [--priority] [--title] [--blocking]
  reviewCmd
    .command('update <rev-id>')
    .description('更新审查条目字段（至少提供一个选项）')
    .option('--priority <level>', '优先级（high/medium/low）')
    .option('--title <text>', '审查标题')
    .option('--blocking <true|false>', '是否阻塞流水线（true/false）')
    .action((revId: string, options: { priority?: string; title?: string; blocking?: string }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.error(t('common.errorNoInit', lang));
        process.exit(1);
      }

      const patch: { priority?: 'high' | 'medium' | 'low'; title?: string; blocking?: boolean } = {};
      let hasField = false;

      if (options.priority !== undefined) {
        // 枚举校验：非法优先级 exit 1
        if (options.priority !== 'high' && options.priority !== 'medium' && options.priority !== 'low') {
          console.error(t('flow.review.errorInvalidPriorityTmpl', lang, { priority: options.priority }));
          process.exit(1);
          return;
        }
        patch.priority = options.priority;
        hasField = true;
      }
      if (options.title !== undefined) {
        patch.title = options.title;
        hasField = true;
      }
      if (options.blocking !== undefined) {
        // 布尔解析：非法值 exit 1
        if (options.blocking !== 'true' && options.blocking !== 'false') {
          console.error(t('flow.review.invalidBlockingTmpl', lang, { value: options.blocking }));
          process.exit(1);
          return;
        }
        patch.blocking = options.blocking === 'true';
        hasField = true;
      }

      // 无字段可更新：exit 1
      if (!hasField) {
        console.error(t('flow.review.updateNoFieldTmpl', lang));
        process.exit(1);
        return;
      }

      const ok = mgr.updateReview(revId, patch);
      if (!ok) {
        console.error(t('flow.review.notFoundTmpl', lang, { revId }));
        process.exit(1);
        return;
      }
      console.log(t('flow.review.updateOkTmpl', lang, { revId }));
    });

  // flow review remove <rev-id>
  reviewCmd
    .command('remove <rev-id>')
    .description('删除审查条目（留审计日志；打印被删条目标题）')
    .action((revId: string) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        console.error(t('common.errorNoInit', lang));
        process.exit(1);
      }
      // 先取标题供追溯（删除后不可得）
      const item = mgr.getReviewItems().find((r) => r.id === revId);
      if (!item) {
        console.error(t('flow.review.notFoundTmpl', lang, { revId }));
        process.exit(1);
        return;
      }
      const ok = mgr.removeReview(revId);
      if (!ok) {
        console.error(t('flow.review.notFoundTmpl', lang, { revId }));
        process.exit(1);
        return;
      }
      console.log(t('flow.review.removeOkTmpl', lang, { revId, title: item.title }));
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
      const rawStageId = options.op.substring(0, dotIdx);
      const opLocalId = options.op.substring(dotIdx + 1);

      // REV-007：短名前缀归一化（与 op-012 advance 同范式）+ 双键回退（归一化键优先）
      const stageId = normalizeStageId(rawStageId) ?? rawStageId;
      const stage = data.stages[stageId] ?? data.stages[rawStageId];
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
    .option('--prune-orphans', '清理键孤儿（flow.json 中已注册但 ops/ 无文件的 op 键；不删除文件）')
    .action((options: { dryRun?: boolean; backup?: boolean; pruneOrphans?: boolean }) => {
      const lang = getCliLang(process.cwd());
      // 复用统一构造入口 createManager()，避免第二处 new FlowManager（T13）
      const mgr = createManager();

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

      const result = mgr.repair(options.dryRun ?? false, { pruneOrphans: options.pruneOrphans ?? false });

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

      // N1-2：孤儿 op 对账报告（A2：默认只报告，不删任何条目）
      const orphans = result.orphans;
      if (orphans && orphans.keyOrphans.length + orphans.fileOrphans.length > 0) {
        console.log('\n' + t('flow.repair.orphansTitle', lang));
        if (orphans.keyOrphans.length > 0) {
          console.log(t('flow.repair.orphanKeyTmpl', lang, {
            items: orphans.keyOrphans.map((o) => `${o.stage}.${o.opId}`).join(', '),
          }));
        }
        if (orphans.fileOrphans.length > 0) {
          // L7-1：文件孤儿只读统计（条数 + 前 5 条清单 + 说明）；按 A6 不提供清理入口
          console.log(t('flow.repair.fileOrphanTitle', lang) + ` ${orphans.fileOrphans.length}`);
          const sample = orphans.fileOrphans.slice(0, 5).map((o) => `${o.stage}.${o.opId}`).join(', ');
          console.log(t('flow.repair.orphanFileTmpl', lang, {
            items: sample + (orphans.fileOrphans.length > 5 ? ' …' : ''),
          }));
          console.log(t('flow.repair.fileOrphanNote', lang));
        }
        // --prune-orphans：仅清理 keyOrphans（正式执行才输出）
        if (options.pruneOrphans && !options.dryRun && orphans.keyOrphans.length > 0) {
          console.log(t('flow.repair.pruneOkTmpl', lang, { n: String(orphans.keyOrphans.length) }));
        }
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

  // flow checkpoint restore <checkpoint-file> [--force] [--stage <id>] [--dry-run]
  checkpointCmd
    .command('restore')
    .description('从 Checkpoint 快照恢复 flow.json（默认全量覆盖，需 --force 确认；--stage 选择性、--dry-run 预览）')
    .argument('<checkpoint-file>', '快照文件名（如 v5.3-stage-01-20260807T162300-exec_running.json）')
    .option('--force', '确认恢复操作（覆盖当前 flow.json）')
    .option('--stage <id>', '仅回退指定阶段子树（选择性恢复；缺省为全量覆盖）')
    .option('--dry-run', '仅预览差异，不写盘')
    .action((file: string, options: { force?: boolean; stage?: string; dryRun?: boolean }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();

      // --dry-run：只读预览（零写盘），不要求 --force
      if (options.dryRun) {
        const preview = mgr.previewRestore(file, { stage: options.stage });
        if (preview.ok && preview.conflicts) {
          console.error(t('flow.manager.snapshotRestoreRefused', lang));
          process.exit(1);
          return;
        }
        if (!preview.ok) {
          if (preview.reason === 'stage-not-in-snapshot') {
            console.error(t('flow.checkpoint.restoreStageMissingTmpl', lang, { stage: options.stage ?? '' }));
          } else {
            console.error(t('flow.checkpoint.restoreFailTmpl', lang, { file }));
          }
          process.exit(1);
          return;
        }
        console.log(t('flow.checkpoint.restoreDryRunTitle', lang) + (options.stage ? ` [${options.stage}]` : ''));
        if (preview.diffs.length === 0) {
          console.log(t('flow.checkpoint.restoreNoDiff', lang));
        } else {
          for (const d of preview.diffs) {
            console.log(t('flow.checkpoint.restoreDiffTmpl', lang, {
              stage: d.stage,
              fromPhase: d.fromPhase,
              toPhase: d.toPhase,
              fromStatus: d.fromStatus,
              toStatus: d.toStatus,
            }));
          }
        }
        return;
      }

      // 安全确认：恢复会覆盖当前 flow.json，必须显式 --force
      if (!options.force) {
        console.error(t('flow.checkpoint.restoreNeedForce', lang));
        process.exit(1);
      }
      const ok = mgr.restoreCheckpoint(file, { stage: options.stage });
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
    .option('--json', 'Output as JSON')
    .option('--fix', 'Reconcile status.md "Status" field against flow.json (that field only)')
    .option('--dry-run', 'Preview only (combine with --fix); nothing is written')
    .action((options: { quick?: boolean; json?: boolean; fix?: boolean; dryRun?: boolean }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();

      // B2-2：--fix 状态对账（仅回写 status.md「状态」字段；--dry-run 预览不写盘）
      let reconciled: StatusReconcileItem[] | undefined;
      if (options.fix) {
        try {
          reconciled = mgr.reconcileStatusMd({ dryRun: options.dryRun });
        } catch (err: unknown) {
          // 写盘失败 → 明确错误 + 非 0 退出
          const msg = err instanceof Error ? err.message : String(err);
          console.error(t('common.errorTmpl', lang, { msg }));
          process.exit(1);
          return;
        }
      }

      // B1-3：--json 分支纯 JSON 单文档；退出码语义不变（有 fail → 非 0）
      if (options.json) {
        const report = mgr.getHealthReport(options.quick ?? false);
        const payload: Record<string, unknown> = { schemaVersion: 1, ok: report.ok, items: report.items };
        // 与 op-001 的 health --json 合并字段（--fix 时追加 reconciled）
        if (reconciled) {
          payload.reconciled = reconciled;
        }
        console.log(JSON.stringify(payload, null, 2));
        if (!report.ok) {
          process.exit(1);
        }
        return;
      }

      // 人类可读：先打印对账结果（仅 --fix 时）
      if (reconciled) {
        console.log(t('flow.health.fixTitle', lang));
        for (const item of reconciled) {
          console.log(t('flow.health.fixItemTmpl', lang, {
            stage: item.stage,
            from: item.from || '-',
            to: item.to,
            result: item.result,
          }));
        }
        if (options.dryRun) {
          console.log(t('flow.health.fixDryRunNote', lang));
        } else {
          const applied = reconciled.filter((i) => i.result === 'applied').length;
          console.log(t('flow.health.fixAppliedTmpl', lang, { n: String(applied) }));
        }
        const skipped = reconciled.filter((i) => i.result === 'skipped-not-found').length;
        if (skipped > 0) {
          console.log(t('flow.health.fixSkippedTmpl', lang, { n: String(skipped) }));
        }
        console.log(t('flow.health.fixOnlyStatusNote', lang));
        console.log('');
      }

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
      // 非 TTY 守卫：脚本/CI 中不渲染 ANSI 交互，输出等价指引并非 0 退出（T39）
      if (!process.stdin.isTTY || !process.stdout.isTTY) {
        console.error(t('flow.wizard.nonTtyHint', lang));
        process.exitCode = 1;
        return;
      }
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

            // 无阶段时引导用户交互式创建首个阶段，创建成功后重新进入主循环
            const { select: sel, input: inp } = await import('@inquirer/prompts');
            const shouldCreate = await sel({
              message: t('flow.wizard.createPrompt', lang),
              choices: [
                { name: t('flow.wizard.createYes', lang), value: 'yes' },
                { name: t('flow.wizard.createNo', lang), value: 'no' },
              ],
            });

            if (shouldCreate === 'yes') {
              const stageId = await inp({
                message: t('flow.wizard.createInput', lang),
                validate: (val: string) => {
                  if (!val.trim()) return t('flow.wizard.createEmpty', lang);
                  return true;
                },
              });
              mgr.addStage(stageId.trim());
              mgr.save();
              console.log(t('flow.wizard.createdTmpl', lang, { stage: stageId.trim() }));
              continue; // 重新进入主循环，此时 stages 已非空
            } else {
              console.log(t('flow.wizard.createSkipped', lang));
              return;
            }
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
        // 并发写冲突：统一单点（i18n 文案 + 退出码 2）
        if (isFlowConcurrentError(err)) {
          handleConcurrentConflict(err, lang);
        }
        // 失败：统一错误模板 + 非 0 退出（T39）
        const msg = err instanceof Error ? err.message : String(err);
        console.error(t('common.errorTmpl', lang, { msg }));
        process.exitCode = 1;
      }
    });
}

/** 创建 FlowManager 实例（使用当前工作目录） */
function createManager(): FlowManager {
  return new FlowManager(process.cwd());
}

/**
 * 断言不存在阻塞中的 open REV（REV 闭环兜底，B5-3 / REV-52-001）。
 * 命中 → 打印列出并返回命中的 REV 列表（调用方决定退出码与文案）；无命中 → 空数组。
 * 单步 advance 与多步循环共用（禁止双实现）。
 * @param mgr FlowManager 实例
 * @param stage 阶段 ID（可选；未提供时返回空）
 * @param lang 语言标识（保留参数，供后续 i18n 化）
 */
function assertNoBlockingOpenRev(mgr: FlowManager, stage: string | undefined, lang: string): ReviewItem[] {
  if (!stage) {
    return [];
  }
  // REV-007：补 `.` 分隔符（与 core flow-manager.ts 的 stageId + '.' 范式一致），避免 stageId 前缀重叠误拦
  const stageReviews = mgr.getReviewItems().filter(
    (r) => r.op === stage || r.op.startsWith(stage + '.'),
  );
  const blockingOpen = stageReviews.filter((r) => r.blocking !== false && r.status === 'open');
  if (blockingOpen.length > 0) {
    console.warn(t('flow.advance.revBlockedTitleTmpl', lang, { n: String(blockingOpen.length) }));
    for (const rev of blockingOpen) {
      console.warn(t('flow.advance.revBlockedItemTmpl', lang, {
        id: rev.id,
        title: rev.title,
        priority: rev.priority,
      }));
    }
  }
  return blockingOpen;
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

/**
 * 归一化 stage.ops 为 [opId, state] 映射（类型守卫：跳过 null/undefined/数组）。
 * 供 flow status/overview 的 --json 结构化输出共用。
 */
function collectOpStates(stage: { ops?: unknown }): Record<string, string> {
  const opsMap = stage.ops && typeof stage.ops === 'object' && !Array.isArray(stage.ops)
    ? (stage.ops as Record<string, { state?: string }>)
    : {};
  const result: Record<string, string> = {};
  for (const [opId, op] of Object.entries(opsMap)) {
    result[opId] = op?.state ?? '';
  }
  return result;
}

/**
 * 构建 `flow status --json` 的结构化输出（B1-1）。
 * 顶层对象 + schemaVersion:1；stages 为数组，ops 为 opId→state 映射；counts 为阶段计数。
 */
function buildStatusJson(mgr: FlowManager): Record<string, unknown> {
  const data = mgr.getData();
  if (!data) {
    return {
      schemaVersion: 1,
      pipeline: { phase: '', current: { stage: '', op: '' } },
      stages: [],
      counts: { total: 0, done: 0, active: 0 },
    };
  }
  const stages = Object.entries(data.stages).map(([id, stage]) => ({
    id,
    phase: stage.phase,
    status: stage.status,
    deps: stage.deps ?? [],
    ops: collectOpStates(stage),
  }));
  const total = stages.length;
  const done = stages.filter((s) => s.phase === 'done').length;
  return {
    schemaVersion: 1,
    pipeline: {
      phase: data.pipeline.phase,
      current: { stage: data.pipeline.current.stage, op: data.pipeline.current.op },
    },
    stages,
    counts: { total, done, active: total - done },
  };
}

/**
 * 构建 `flow overview --json` 的结构化输出（B1-5）。
 * 顶层对象 + schemaVersion:1；含阶段计数、审查统计、健康统计、日志数等。
 */
function buildOverviewJson(mgr: FlowManager): Record<string, unknown> {
  const data = mgr.getData();
  const phase = mgr.getPhase();
  const summary = mgr.getSummary();
  const health = mgr.healthCheck(true); // quick mode（与人类可读分支一致）

  const stages = data
    ? Object.entries(data.stages).map(([id, stage]) => {
        const ops = collectOpStates(stage);
        const states = Object.values(ops);
        return {
          id,
          phase: stage.phase,
          status: stage.status,
          opsTotal: states.length,
          opsDone: states.filter((s) => s === 'done').length,
        };
      })
    : [];

  const reviews = data?.reviews ?? [];
  const openReviews = reviews.filter((r) => r.status === 'open');

  return {
    schemaVersion: 1,
    phase: phase ?? '',
    current: {
      stage: data?.pipeline.current.stage ?? '',
      op: data?.pipeline.current.op ?? '',
    },
    summary,
    stages,
    reviews: {
      open: openReviews.length,
      blockingOpen: openReviews.filter((r) => r.blocking !== false).length,
      nonBlockingOpen: openReviews.filter((r) => r.blocking === false).length,
      resolved: reviews.filter((r) => r.status === 'resolved').length,
      closed: reviews.filter((r) => r.status === 'closed').length,
    },
    health: {
      ok: health.ok,
      pass: health.items.filter((i) => i.status === 'pass').length,
      warn: health.items.filter((i) => i.status === 'warn').length,
      fail: health.items.filter((i) => i.status === 'fail').length,
    },
    logs: data?.log.length ?? 0,
  };
}
