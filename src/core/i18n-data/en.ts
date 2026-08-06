/**
 * 英文 i18n 字符串映射表
 *
 * 与 zh-CN.ts 保持完全相同的 key 结构，仅 en 字段有值。
 */
import type { I18nEntry, I18nDomain } from './types.js';

/* ==================== common ==================== */
export const common: I18nDomain = {
  error:           { key: 'common.error',           zh: '', en: 'Error' },
  errorTmpl:       { key: 'common.errorTmpl',       zh: '', en: 'Error: {msg}' },
  ok:              { key: 'common.ok',              zh: '', en: '✓' },
  none:            { key: 'common.none',            zh: '', en: '(none)' },
  noData:          { key: 'common.noData',          zh: '', en: '(no records)' },
  inProgress:      { key: 'common.inProgress',      zh: '', en: '(in progress)' },
  completed:       { key: 'common.completed',       zh: '', en: 'Completed' },
  unknown:         { key: 'common.unknown',         zh: '', en: 'Unknown' },
  cancelled:       { key: 'common.cancelled',       zh: '', en: 'Cancelled' },
  noInit:          { key: 'common.noInit',          zh: '', en: 'Pipeline not initialized (flow.json not found)' },
  noConfig:        { key: 'common.noConfig',        zh: '', en: '(no config)' },
  invalidOpId:     { key: 'common.invalidOpId',     zh: '', en: 'Invalid opId format, expected stage-xx.op-xxx (e.g. stage-01.op-001)' },
  errorNoInit:     { key: 'common.errorNoInit',     zh: '', en: 'Error: flow.json not initialized, please run openfeel init first' },
  stage:           { key: 'common.stage',           zh: '', en: 'Stage' },
  op:              { key: 'common.op',              zh: '', en: 'Op' },
  status:          { key: 'common.status',          zh: '', en: 'Status' },
  blockedBy:       { key: 'common.blockedBy',       zh: '', en: 'Blocked By' },
  retry:           { key: 'common.retry',           zh: '', en: 'Retry' },
  cancel:          { key: 'common.cancel',          zh: '', en: 'Cancel' },
};

/* ==================== flow ==================== */
export const flow: I18nDomain = {
  'status.title':               { key: 'flow.status.title',               zh: '', en: 'OpenFeel Pipeline Status' },
  'status.verboseTitle':        { key: 'flow.status.verboseTitle',        zh: '', en: 'OpenFeel Pipeline Status (verbose)' },
  'status.currentStage':        { key: 'flow.status.currentStage',        zh: '', en: 'Current Active Stage' },
  'status.stageDuration':       { key: 'flow.status.stageDuration',       zh: '', en: 'Stage Duration' },
  'status.globalStatus':        { key: 'flow.status.globalStatus',        zh: '', en: 'Global Status' },
  'status.currentStageLabel':   { key: 'flow.status.currentStageLabel',   zh: '', en: 'Current Stage' },
  'status.stagePhase':          { key: 'flow.status.stagePhase',          zh: '', en: 'Stage Phase' },
  'status.currentOp':           { key: 'flow.status.currentOp',           zh: '', en: 'Current Op' },
  'status.retryCount':          { key: 'flow.status.retryCount',          zh: '', en: 'Retry Count' },
  'status.stagesCount':         { key: 'flow.status.stagesCount',         zh: '', en: 'Stages' },
  'status.opsCount':            { key: 'flow.status.opsCount',            zh: '', en: 'Ops' },
  'status.reviewPending':       { key: 'flow.status.reviewPending',       zh: '', en: 'Pending Reviews' },
  'status.logTotal':            { key: 'flow.status.logTotal',            zh: '', en: 'Total Logs' },
  'status.cascadeTitle':        { key: 'flow.status.cascadeTitle',        zh: '', en: '── Config Cascade Status ──' },
  'status.cascadeHeader':       { key: 'flow.status.cascadeHeader',       zh: '', en: 'Field              config.yaml  status.md  Effective' },
  'status.cascadeNote':         { key: 'flow.status.cascadeNote',         zh: '', en: '(* status.md overrides config.yaml defaults)' },
  'status.recentTitleTmpl':     { key: 'flow.status.recentTitleTmpl',     zh: '', en: '── Recent {n} Status Changes ──' },
  'status.recentHeader':        { key: 'flow.status.recentHeader',        zh: '', en: 'Time              Agent          Status Change       Note' },
  'status.downstreamTitle':     { key: 'flow.status.downstreamTitle',     zh: '', en: '── Downstream Agent Readiness ──' },
  'status.noDownstream':        { key: 'flow.status.noDownstream',        zh: '', en: '(No downstream stages reachable from current stage)' },
  'status.downstreamHeader':    { key: 'flow.status.downstreamHeader',    zh: '', en: 'Reachable Stage       Responsible Agent' },
  'status.lastUpdated':         { key: 'flow.status.lastUpdated',         zh: '', en: 'Last Updated' },
  'status.recoveryTitle':       { key: 'flow.status.recoveryTitle',       zh: '', en: '── Cross-Session Recovery Info ──' },
  'status.recoveryMoreTmpl':    { key: 'flow.status.recoveryMoreTmpl',    zh: '', en: '... {n} more items' },

  'overview.title':             { key: 'flow.overview.title',             zh: '', en: 'OpenFeel Pipeline Overview' },
  'overview.currentStatus':     { key: 'flow.overview.currentStatus',     zh: '', en: '📍 Current Status' },
  'overview.stagesOverview':    { key: 'flow.overview.stagesOverview',    zh: '', en: '📋 Stages Overview' },
  'overview.noStages':          { key: 'flow.overview.noStages',          zh: '', en: '(No stage data)' },
  'overview.totalStagesTmpl':   { key: 'flow.overview.totalStagesTmpl',   zh: '', en: '{n} stage(s)' },
  'overview.noOps':             { key: 'flow.overview.noOps',             zh: '', en: '(no ops)' },
  'overview.reviewSection':     { key: 'flow.overview.reviewSection',     zh: '', en: '🔍 Reviews (REV)' },
  'overview.noReviews':         { key: 'flow.overview.noReviews',         zh: '', en: '(No review entries)' },
  'overview.reviewOpen':        { key: 'flow.overview.reviewOpen',        zh: '', en: 'Open' },
  'overview.reviewResolved':    { key: 'flow.overview.reviewResolved',    zh: '', en: 'Resolved' },
  'overview.reviewClosed':      { key: 'flow.overview.reviewClosed',      zh: '', en: 'Closed' },
  'overview.reviewPending':     { key: 'flow.overview.reviewPending',     zh: '', en: 'Pending Reviews' },
  'overview.bugSection':        { key: 'flow.overview.bugSection',        zh: '', en: '🐛 Bug Tracker' },
  'overview.bugUnreadable':     { key: 'flow.overview.bugUnreadable',     zh: '', en: '(Unable to read bug stats)' },
  'overview.bugUninitialized':  { key: 'flow.overview.bugUninitialized',  zh: '', en: '(Bug tracking not initialized)' },
  'overview.bugOpen':           { key: 'flow.overview.bugOpen',           zh: '', en: 'Open' },
  'overview.bugClosed':         { key: 'flow.overview.bugClosed',         zh: '', en: 'Closed' },
  'overview.recentLogs':        { key: 'flow.overview.recentLogs',        zh: '', en: '📝 Recent Ops (5)' },
  'overview.noLogs':            { key: 'flow.overview.noLogs',            zh: '', en: '(No log records)' },
  'overview.health':            { key: 'flow.overview.health',            zh: '', en: '💚 Health Status' },
  'overview.healthStatsTmpl':   { key: 'flow.overview.healthStatsTmpl',   zh: '', en: '✅ {n}  🟡 {m}  ❌ {k}' },

  'current.globalStatus':       { key: 'flow.current.globalStatus',       zh: '', en: 'Global Status' },
  'current.stagePhase':         { key: 'flow.current.stagePhase',         zh: '', en: 'Stage Phase' },
  'current.currentOp':          { key: 'flow.current.currentOp',          zh: '', en: 'Current Op' },
  'current.retryCount':         { key: 'flow.current.retryCount',         zh: '', en: 'Retry Count' },

  'stage.addedTmpl':            { key: 'flow.stage.addedTmpl',            zh: '', en: '✓ Stage created: {stage} → plan_pending' },

  'advance.errorNoStage':       { key: 'flow.advance.errorNoStage',       zh: '', en: 'Error: --stage parameter must specify a stage ID (e.g. stage-03)' },
  'advance.warnAutoCorrect':    { key: 'flow.advance.warnAutoCorrect',    zh: '', en: '(Non-standard phase auto-corrected, proceeding)' },
  'advance.errorInvalidFormat': { key: 'flow.advance.errorInvalidFormat', zh: '', en: 'Error: flow.json format is invalid' },
  'advance.errorInvalidPhaseTmpl': { key: 'flow.advance.errorInvalidPhaseTmpl', zh: '', en: "Error: '{phase}' is not a valid PipelinePhase." },
  'advance.labelValidPhases':   { key: 'flow.advance.labelValidPhases',   zh: '', en: 'Valid values' },
  'advance.hintUseForceFuzzy':  { key: 'flow.advance.hintUseForceFuzzy',  zh: '', en: 'Use --force to force execute (auto fuzzy fix)' },
  'advance.errorPhaseJumpTmpl': { key: 'flow.advance.errorPhaseJumpTmpl', zh: '', en: 'Error: Stage "{stage}" current phase cannot transition to "{to}"' },
  'advance.hintUseForce':       { key: 'flow.advance.hintUseForce',       zh: '', en: 'Use --force to force execute' },
  'advance.warnSkipReview':     { key: 'flow.advance.warnSkipReview',     zh: '', en: '[!] Skipping review phase directly to done, confirm to continue' },
  'advance.okTmpl':             { key: 'flow.advance.okTmpl',             zh: '', en: '✓ Advanced: {stage} → {to}' },
  'advance.opLabelTmpl':        { key: 'flow.advance.opLabelTmpl',        zh: '', en: 'Op: {op}' },
  'advance.autoRepaired':       { key: 'flow.advance.autoRepaired',       zh: '', en: 'Stage data inconsistency detected, auto-repaired' },
  'advance.saveError':          { key: 'flow.advance.saveError',          zh: '', en: 'flow.json save failed' },

  'attempt.errorInvalidResult': { key: 'flow.attempt.errorInvalidResult', zh: '', en: 'Error: --result must be pass or fail' },
  'attempt.passTmpl':           { key: 'flow.attempt.passTmpl',           zh: '', en: '✓ {op} completed successfully' },
  'attempt.failRetryTmpl':      { key: 'flow.attempt.failRetryTmpl',      zh: '', en: '⚠ {op} failed, will retry (retriable)' },
  'attempt.failReplanTmpl':     { key: 'flow.attempt.failReplanTmpl',     zh: '', en: '✗ {op} retries exhausted, needs re-planning' },
  'attempt.autoReplan':         { key: 'flow.attempt.autoReplan',         zh: '', en: '→ Auto reverted to scheme_pending, please re-plan' },

  'log.noInit':                 { key: 'flow.log.noInit',                 zh: '', en: 'Pipeline not initialized, no logs' },
  'log.noLogs':                 { key: 'flow.log.noLogs',                 zh: '', en: 'No operation logs' },
  'log.recentTitleTmpl':        { key: 'flow.log.recentTitleTmpl',        zh: '', en: 'Recent {n} operation logs' },
  'log.detail':                 { key: 'flow.log.detail',                 zh: '', en: 'Details' },

  'review.errorStageNotFoundTmpl':  { key: 'flow.review.errorStageNotFoundTmpl',  zh: '', en: 'Error: Stage "{stage}" in opId "{opId}" not found in flow.json' },
  'review.errorOpNotFoundTmpl':     { key: 'flow.review.errorOpNotFoundTmpl',     zh: '', en: 'Error: Op "{op}" in opId "{opId}" not found in stage "{stage}"' },
  'review.labelBlocking':           { key: 'flow.review.labelBlocking',           zh: '', en: '[Blocking]' },
  'review.labelNonBlocking':        { key: 'flow.review.labelNonBlocking',        zh: '', en: '[Non-blocking]' },
  'review.addedAutoFixTmpl':        { key: 'flow.review.addedAutoFixTmpl',        zh: '', en: '✓ {label} [AUTO_FIX] Review entry added and auto-fixed: {revId}' },
  'review.detail':                  { key: 'flow.review.detail',                  zh: '', en: 'Detail' },
  'review.autoFixPhase':            { key: 'flow.review.autoFixPhase',            zh: '', en: 'Pipeline skipped review_failed, advanced directly to exec_running' },
  'review.addedTmpl':               { key: 'flow.review.addedTmpl',               zh: '', en: '✓ {label} Review entry added: {revId} ({op})' },
  'review.resolvedTmpl':            { key: 'flow.review.resolvedTmpl',            zh: '', en: '✓ Review entry resolved: {revId}' },
  'review.notFoundTmpl':            { key: 'flow.review.notFoundTmpl',            zh: '', en: 'Error: Review entry {revId} not found' },

  'retry.errorNoData':              { key: 'flow.retry.errorNoData',              zh: '', en: 'Error: Unable to read pipeline data' },
  'retry.errorStageNotFoundTmpl':   { key: 'flow.retry.errorStageNotFoundTmpl',   zh: '', en: 'Error: Stage {stage} not found' },
  'retry.errorOpNotFoundTmpl':      { key: 'flow.retry.errorOpNotFoundTmpl',      zh: '', en: 'Error: Op {op} not found' },
  'retry.attemptCount':             { key: 'flow.retry.attemptCount',             zh: '', en: 'Current Attempts' },
  'retry.exhausted':                { key: 'flow.retry.exhausted',                zh: '', en: '⚠ Retries exhausted' },

  'repair.backupOk':                { key: 'flow.repair.backupOk',                zh: '', en: 'Backed up: flow.json.bak' },
  'repair.noBackup':                { key: 'flow.repair.noBackup',                zh: '', en: 'flow.json does not exist, no backup needed' },
  'repair.dryRunTitle':             { key: 'flow.repair.dryRunTitle',             zh: '', en: '[DRY-RUN Mode] The following issues will be fixed:' },
  'repair.recovered':               { key: 'flow.repair.recovered',               zh: '', en: '♻ flow.json restored from .bak' },
  'repair.dryRunHint':              { key: 'flow.repair.dryRunHint',              zh: '', en: 'Issues detected, run without --dry-run to apply fixes.' },
  'repair.fixDone':                 { key: 'flow.repair.fixDone',                 zh: '', en: '✓ flow.json repaired' },
  'repair.noFix':                   { key: 'flow.repair.noFix',                   zh: '', en: 'No issues detected' },
  'repair.fixFailed':               { key: 'flow.repair.fixFailed',               zh: '', en: '✗ Some issues could not be auto-fixed, please check flow.json manually' },
  'repair.migrationHint':           { key: 'flow.repair.migrationHint',           zh: '', en: '💡 Legacy flow.json format detected (global phase), consider running:' },
  'repair.migrationPreview':        { key: 'flow.repair.migrationPreview',        zh: '', en: '   Preview migration: openfeel flow migrate --dry-run' },

  'migrate.alreadyNew':             { key: 'flow.migrate.alreadyNew',             zh: '', en: '✓ Already up-to-date format, no migration needed' },
  'migrate.dryRunTitle':            { key: 'flow.migrate.dryRunTitle',            zh: '', en: '[DRY-RUN Mode] The following changes will be applied:' },
  'migrate.dryRunNote':             { key: 'flow.migrate.dryRunNote',             zh: '', en: '(No files modified, run without --dry-run to apply migration)' },
  'migrate.complete':               { key: 'flow.migrate.complete',               zh: '', en: 'Migration complete' },
  'migrate.failed':                 { key: 'flow.migrate.failed',                 zh: '', en: '✗ Migration failed' },
  'migrate.done':                   { key: 'flow.migrate.done',                   zh: '', en: '✓ flow.json migrated to new format' },

  'health.title':                   { key: 'flow.health.title',                   zh: '', en: 'openfeel flow health' },
  'health.pass':                    { key: 'flow.health.pass',                    zh: '', en: '🎉 Health check passed' },
  'health.hasFailures':             { key: 'flow.health.hasFailures',             zh: '', en: '⚠️  There are failures, please check errors above' },
  'health.quickMode':               { key: 'flow.health.quickMode',               zh: '', en: '(Quick mode: key checks only)' },

  'recover.title':                  { key: 'flow.recover.title',                  zh: '', en: '═══ Cross-Session Context Recovery ═══' },
  'recover.globalStatus':           { key: 'flow.recover.globalStatus',           zh: '', en: 'Global Status' },
  'recover.phase':                  { key: 'flow.recover.phase',                  zh: '', en: 'Pipeline Phase' },
  'recover.currentOp':              { key: 'flow.recover.currentOp',              zh: '', en: 'Current Op' },
  'recover.stageStatus':            { key: 'flow.recover.stageStatus',            zh: '', en: 'Stage Status' },
  'recover.pendingTasksTmpl':       { key: 'flow.recover.pendingTasksTmpl',       zh: '', en: 'Pending Tasks ({n})' },
  'recover.noTasks':                { key: 'flow.recover.noTasks',                zh: '', en: 'No pending tasks' },
  'recover.stageDuration':          { key: 'flow.recover.stageDuration',          zh: '', en: 'Stage Duration' },
  'recover.statusUninitialized':   { key: 'flow.recover.statusUninitialized',     zh: '', en: 'Uninitialized' },
  'recover.statusAutoExec':        { key: 'flow.recover.statusAutoExec',          zh: '', en: 'Auto Execute' },
  'recover.statusManualExec':      { key: 'flow.recover.statusManualExec',        zh: '', en: 'Manual Execute' },
  'recover.statusUnreadable':      { key: 'flow.recover.statusUnreadable',        zh: '', en: 'Cannot read status.md' },
  'recover.statusFileMissing':     { key: 'flow.recover.statusFileMissing',       zh: '', en: 'status.md not found' },
  'recover.statusNoCurrentStage':  { key: 'flow.recover.statusNoCurrentStage',    zh: '', en: 'No current stage' },

  'wizard.done':                    { key: 'flow.wizard.done',                    zh: '', en: '🎉 Pipeline is complete!' },
  'wizard.noStages':                { key: 'flow.wizard.noStages',                zh: '', en: 'No stages available.' },
  'wizard.selectStage':             { key: 'flow.wizard.selectStage',             zh: '', en: 'Select stage to advance' },
  'wizard.currentLabel':            { key: 'flow.wizard.currentLabel',            zh: '', en: '(current)' },
  'wizard.unavailable':             { key: 'flow.wizard.unavailable',             zh: '', en: 'Selected stage is not available.' },
  'wizard.statusHeader':            { key: 'flow.wizard.statusHeader',            zh: '', en: '═══ Pipeline Status ═══' },
  'wizard.stagePhase':              { key: 'flow.wizard.stagePhase',              zh: '', en: 'Stage Phase' },
  'wizard.retryCount':              { key: 'flow.wizard.retryCount',              zh: '', en: 'Retry Count' },
  'wizard.pendingReviews':          { key: 'flow.wizard.pendingReviews',          zh: '', en: 'Pending Reviews' },
  'wizard.noNext':                  { key: 'flow.wizard.noNext',                  zh: '', en: 'No reachable next action from current stage.' },
  'wizard.exitOption':              { key: 'flow.wizard.exitOption',              zh: '', en: 'Exit wizard' },
  'wizard.selectAction':            { key: 'flow.wizard.selectAction',            zh: '', en: 'Select next action' },
  'wizard.exited':                  { key: 'flow.wizard.exited',                  zh: '', en: 'Exited wizard.' },
  'wizard.previewTmpl':             { key: 'flow.wizard.previewTmpl',             zh: '', en: 'Preview: advance stage {stage} from {from} ({fromLabel}) to {to} ({toLabel})' },
  'wizard.confirmTitle':            { key: 'flow.wizard.confirmTitle',            zh: '', en: 'Confirm this action?' },
  'wizard.confirm':                 { key: 'flow.wizard.confirm',                 zh: '', en: 'Confirm advance' },
  'wizard.advancedTmpl':            { key: 'flow.wizard.advancedTmpl',            zh: '', en: '✓ Advanced: {stage}: {from} → {to}' },
};

/* ==================== init ==================== */
export const init: I18nDomain = {
  'errorPathNotExistTmpl':      { key: 'init.errorPathNotExistTmpl',      zh: '', en: 'Error: Path does not exist — {path}' },
  'initializingTmpl':           { key: 'init.initializingTmpl',           zh: '', en: 'Initializing OpenFeel workspace: {path}' },
  'created':                    { key: 'init.created',                    zh: '', en: 'Created' },
  'updated':                    { key: 'init.updated',                    zh: '', en: 'Updated' },
  'alreadyUpToDate':            { key: 'init.alreadyUpToDate',            zh: '', en: 'Workspace is already up-to-date, no changes needed.' },
  'complete':                   { key: 'init.complete',                   zh: '', en: '✓ OpenFeel workspace initialized' },
  'demoCreating':               { key: 'init.demoCreating',               zh: '', en: '⚙ Creating demo project skeleton...' },
  'demoCreated':                { key: 'init.demoCreated',                zh: '', en: 'Created demo files' },
  'demoSkipped':                { key: 'init.demoSkipped',                zh: '', en: 'Skipped (file already exists)' },
  'demoComplete':               { key: 'init.demoComplete',               zh: '', en: '✅ Demo project created, run npm install && npm test to start' },
  'prompt.nonInteractive':      { key: 'init.prompt.nonInteractive',      zh: '', en: 'Non-interactive environment, Agent prompt language set to zh-CN by default. Use openfeel update --lang <zh-CN|en> to change.' },
  'prompt.bilingual':           { key: 'init.prompt.bilingual',           zh: '', en: 'Select Agent prompt language / 选择 Agent 提示词语言:' },
  'agentLangTmpl':              { key: 'init.agentLangTmpl',              zh: '', en: 'Agent prompt language: {lang}' },
  'invalidLangWarnTmpl':        { key: 'init.invalidLangWarnTmpl',        zh: '', en: 'Invalid --lang value "{lang}", falling back to interactive selection' },
  // ensureGlobalConfig 非交互环境消息（REV-006）
  'firstUse.nonInteractive':    { key: 'init.firstUse.nonInteractive',    zh: '', en: 'First time using OpenFeel: Non-interactive environment detected, global default language set to zh-CN.' },
  'firstUse.changeHint':        { key: 'init.firstUse.changeHint',        zh: '', en: 'Use openfeel config set-lang <zh-CN|en> to change.' },
  // ensureGlobalConfig 交互环境消息
  'firstUse.interactiveWelcome': { key: 'init.firstUse.interactiveWelcome', zh: '', en: '🌐 Welcome to OpenFeel! Please select your global default language:' },
  'firstUse.interactiveOption':   { key: 'init.firstUse.interactiveOption',   zh: '', en: 'Please enter choice (1/2) / 请输入选项 (1/2) [2]: ' },
  'firstUse.langSetEn':           { key: 'init.firstUse.langSetEn',           zh: '', en: '✓ Global language set to English. You can change it later with: openfeel config set-lang' },
  'firstUse.langSetZh':           { key: 'init.firstUse.langSetZh',           zh: '', en: '✓ Global language set to Chinese. You can change it later with: openfeel config set-lang' },
};

/* ==================== update ==================== */
export const update: I18nDomain = {
  'errorPathNotExistTmpl':      { key: 'update.errorPathNotExistTmpl',      zh: '', en: 'Error: Path does not exist — {path}' },
  'errorUnsupportedLangTmpl':   { key: 'update.errorUnsupportedLangTmpl',   zh: '', en: 'Error: Unsupported language "{lang}". Supported values: zh-CN, en' },
  'autoInitTmpl':               { key: 'update.autoInitTmpl',               zh: '', en: 'Project not initialized, auto-running openfeel init...' },
  'autoInitCreated':            { key: 'update.autoInitCreated',            zh: '', en: 'Auto-created' },
  'cancelled':                  { key: 'update.cancelled',                  zh: '', en: 'No tool selected, cancelled.' },
  'deployingTmpl':              { key: 'update.deployingTmpl',              zh: '', en: 'Deploying adapter files to: {path}' },
  'selectedToolsTmpl':          { key: 'update.selectedToolsTmpl',          zh: '', en: 'Selected tools: {tools}' },
  'created':                    { key: 'update.created',                    zh: '', en: 'Created' },
  'updated':                    { key: 'update.updated',                    zh: '', en: 'Updated' },
  'skipped':                    { key: 'update.skipped',                    zh: '', en: 'Skipped (content unchanged)' },
  'alreadyUpToDate':            { key: 'update.alreadyUpToDate',            zh: '', en: 'All adapter files are up-to-date, no changes needed.' },
  'complete':                   { key: 'update.complete',                   zh: '', en: '✓ Adapter files deployed' },
  'errorDeployFailedTmpl':      { key: 'update.errorDeployFailedTmpl',      zh: '', en: 'Error: Deployment failed — {message}' },
  'langConflict':               { key: 'update.langConflict',               zh: '', en: '⚠️ AGENTS.md language mismatch: project is {projectLang}, requested is {requestedLang}. Use --force to override or adjust manually.' },
};

/* ==================== project ==================== */
export const project: I18nDomain = {
  'overview.title':             { key: 'project.overview.title',             zh: '', en: 'OpenFeel Project Overview' },
  'overview.basicInfo':         { key: 'project.overview.basicInfo',         zh: '', en: '📋 Basic Info' },
  'overview.projectName':       { key: 'project.overview.projectName',       zh: '', en: 'Project Name' },
  'overview.description':       { key: 'project.overview.description',       zh: '', en: 'Description' },
  'overview.language':          { key: 'project.overview.language',          zh: '', en: 'Language' },
  'overview.dirStructure':      { key: 'project.overview.dirStructure',      zh: '', en: '📁 Directory Structure' },
  'overview.dirNotExist':       { key: 'project.overview.dirNotExist',       zh: '', en: '(Directory does not exist)' },
  'overview.stats':             { key: 'project.overview.stats',             zh: '', en: '📊 Statistics' },
  'overview.entryPath':         { key: 'project.overview.entryPath',         zh: '', en: '🚪 Entry Path' },
  'overview.noSrc':             { key: 'project.overview.noSrc',             zh: '', en: '(No project structure detected — missing src/ directory)' },
  'overview.techStack':         { key: 'project.overview.techStack',         zh: '', en: '🔧 Tech Stack' },

  // 目录结构 — 描述模板（带 {n} 变量插值）
  'dir.cliTmpl':          { key: 'project.dir.cliTmpl',          zh: '', en: '— CLI Entry ({n} file(s))' },
  'dir.commandsTmpl':     { key: 'project.dir.commandsTmpl',     zh: '', en: '— CLI Commands ({n})' },
  'dir.coreTmpl':         { key: 'project.dir.coreTmpl',         zh: '', en: '— Core Logic ({n} file(s))' },
  'dir.utilsTmpl':        { key: 'project.dir.utilsTmpl',        zh: '', en: '— Utilities ({n} file(s))' },
  'dir.agentsTmpl':       { key: 'project.dir.agentsTmpl',       zh: '', en: '— Agent Definitions ({n})' },
  'dir.skillsTmpl':       { key: 'project.dir.skillsTmpl',       zh: '', en: '— Skill Definitions ({n})' },
  'dir.kbTmpl':           { key: 'project.dir.kbTmpl',           zh: '', en: '— Knowledge Base ({n} file(s))' },
  'dir.planTmpl':         { key: 'project.dir.planTmpl',         zh: '', en: '— Work Plans ({n} version(s))' },
  'dir.codeReviewTmpl':   { key: 'project.dir.codeReviewTmpl',   zh: '', en: '— Code Reviews ({n} file(s))' },
  'dir.bugs':             { key: 'project.dir.bugs',             zh: '', en: '— Bug Tracking' },
  'dir.bugsNotInit':      { key: 'project.dir.bugsNotInit',      zh: '', en: ' (not initialized)' },

  // 统计信息标签
  'stats.tsSource':       { key: 'project.stats.tsSource',       zh: '', en: 'TS Source Files' },
  'stats.agentDefs':      { key: 'project.stats.agentDefs',      zh: '', en: 'Agent Definitions' },
  'stats.cliModules':     { key: 'project.stats.cliModules',     zh: '', en: 'CLI Command Modules' },
  'stats.kbEntries':      { key: 'project.stats.kbEntries',      zh: '', en: 'KB Entries' },
  'stats.planVersions':   { key: 'project.stats.planVersions',   zh: '', en: 'Plan Versions' },

  // 入口路径标签
  'entry.cli':            { key: 'project.entry.cli',            zh: '', en: 'CLI Entry' },
  'entry.pkg':            { key: 'project.entry.pkg',            zh: '', en: 'Package Entry' },
  'entry.build':          { key: 'project.entry.build',          zh: '', en: 'Build Output' },

  // 技术栈标签
  'tech.runtime':         { key: 'project.tech.runtime',         zh: '', en: 'Runtime' },
  'tech.language':        { key: 'project.tech.language',        zh: '', en: 'Language' },
  'tech.cliFramework':    { key: 'project.tech.cliFramework',    zh: '', en: 'CLI Framework' },
  'tech.validation':      { key: 'project.tech.validation',      zh: '', en: 'Validation' },
  'tech.config':          { key: 'project.tech.config',          zh: '', en: 'Config' },
  'tech.fileMatch':       { key: 'project.tech.fileMatch',       zh: '', en: 'File Matching' },
  'tech.test':            { key: 'project.tech.test',            zh: '', en: 'Testing' },
};

/* ==================== stage ==================== */
export const stage: I18nDomain = {
  'status.noStages':             { key: 'stage.status.noStages',             zh: '', en: 'No stages found (no status.md in .openfeel/plan/)' },
  'status.foundTmpl':            { key: 'stage.status.foundTmpl',            zh: '', en: 'Found {n} stage(s)' },
  'status.hint':                 { key: 'stage.status.hint',                 zh: '', en: 'Use openfeel stage status <stageId> to view detailed status' },
  'errorStageNotFoundTmpl':      { key: 'stage.errorStageNotFoundTmpl',      zh: '', en: 'Error: status.md not found for stage "{stageId}"' },
  'errorCheckStageId':           { key: 'stage.errorCheckStageId',           zh: '', en: 'Please verify the stage ID is correct (e.g. v4-stage-04)' },
  'set.errorFieldNotFoundTmpl':  { key: 'stage.set.errorFieldNotFoundTmpl',  zh: '', en: 'Error: "status" field not found in {stageId} status.md' },
  'set.updatedTmpl':             { key: 'stage.set.updatedTmpl',             zh: '', en: '✓ Updated {stageId} status: → {status}' },
  'task.errorMutualExclusive':   { key: 'stage.task.errorMutualExclusive',   zh: '', en: 'Error: Must specify --done or --undone (mutually exclusive)' },
  'task.errorInvalidTaskNo':     { key: 'stage.task.errorInvalidTaskNo',     zh: '', en: 'Error: Task number must be a positive integer' },
  'task.errorTaskNotFoundTmpl':  { key: 'stage.task.errorTaskNotFoundTmpl',  zh: '', en: 'Error: Task {taskNo} not found in {stageId} status.md' },
  'task.done':                   { key: 'stage.task.done',                   zh: '', en: '✓ Checked' },
  'task.undone':                 { key: 'stage.task.undone',                 zh: '', en: '○ Unchecked' },
  'task.taskListTmpl':           { key: 'stage.task.taskListTmpl',           zh: '', en: 'Task list ({done}/{total} complete)' },
  'task.taskItemTmpl':           { key: 'stage.task.taskItemTmpl',           zh: '', en: 'Task {number}: {desc}' },
  'task.blockedByTmpl':          { key: 'stage.task.blockedByTmpl',          zh: '', en: 'Blocked by: {reason}' },
  'task.actionLabelTmpl':        { key: 'stage.task.actionLabelTmpl',        zh: '', en: '{label} {stageId} Task {taskNo}' },
};

/* ==================== plan ==================== */
export const plan: I18nDomain = {
  'stage.createdTmpl':           { key: 'plan.stage.createdTmpl',           zh: '', en: 'Stage created: {name}' },
  'stage.empty':                 { key: 'plan.stage.empty',                 zh: '', en: 'No working stages yet' },
  'scheme.createdTmpl':          { key: 'plan.scheme.createdTmpl',          zh: '', en: 'Op created: {opId} ({stage})' },
  'scheme.empty':                { key: 'plan.scheme.empty',                zh: '', en: 'No ops yet' },
};

/* ==================== knowledge ==================== */
export const knowledge: I18nDomain = {
  'list.empty':                      { key: 'knowledge.list.empty',                      zh: '', en: 'No knowledge entries' },
  'list.enabled':                    { key: 'knowledge.list.enabled',                    zh: '', en: 'Enabled' },
  'list.disabled':                   { key: 'knowledge.list.disabled',                   zh: '', en: 'Disabled' },
  'add.errorInvalidCategoryTmpl':    { key: 'knowledge.add.errorInvalidCategoryTmpl',    zh: '', en: 'Error: Invalid category "{category}", valid values: {valid}' },
  'add.errorNoContent':              { key: 'knowledge.add.errorNoContent',              zh: '', en: 'Error: Please use --content to provide content, or pipe content via stdin.' },
  'add.errorEmptyContent':           { key: 'knowledge.add.errorEmptyContent',           zh: '', en: 'Error: Content cannot be empty.' },
  'add.okTmpl':                      { key: 'knowledge.add.okTmpl',                      zh: '', en: '✓ Knowledge entry added: [{category}] {title}' },
  'search.noResultsTmpl':            { key: 'knowledge.search.noResultsTmpl',            zh: '', en: 'No knowledge entries found matching "{query}".' },
  'search.offsetOutOfBoundsTmpl':    { key: 'knowledge.search.offsetOutOfBoundsTmpl',    zh: '', en: '(Offset {offset} out of bounds)' },
  'search.foundTmpl':                { key: 'knowledge.search.foundTmpl',                zh: '', en: 'Found {n} match(es)' },
  'index.categoryOverview':          { key: 'knowledge.index.categoryOverview',          zh: '', en: '=== Category Overview ===' },
  'index.noCategories':              { key: 'knowledge.index.noCategories',              zh: '', en: '(No categories)' },
  'index.recentUpdates':             { key: 'knowledge.index.recentUpdates',             zh: '', en: '=== Recent Updates ===' },
  'index.noUpdates':                 { key: 'knowledge.index.noUpdates',                 zh: '', en: 'No updates yet.' },

  // knowledge list 表头列名
  'list.colCategory':     { key: 'knowledge.list.colCategory',     zh: '', en: 'Category' },
  'list.colTitle':        { key: 'knowledge.list.colTitle',        zh: '', en: 'Title' },
  'list.colDate':         { key: 'knowledge.list.colDate',         zh: '', en: 'Date' },

  // knowledge index 表头列名
  'index.colDate':        { key: 'knowledge.index.colDate',        zh: '', en: 'Date' },
  'index.colCategory':    { key: 'knowledge.index.colCategory',    zh: '', en: 'Category' },
  'index.colTitle':       { key: 'knowledge.index.colTitle',       zh: '', en: 'Title' },
};

/* ==================== archive ==================== */
export const archive: I18nDomain = {
  'errorArchiveFailedTmpl':      { key: 'archive.errorArchiveFailedTmpl',      zh: '', en: 'Error: Archive failed, please confirm stage "{stage}" exists and flow.json is initialized.' },
  'okTmpl':                      { key: 'archive.okTmpl',                      zh: '', en: '✓ Stage archived: {stage}' },
  'opsCount':                    { key: 'archive.opsCount',                    zh: '', en: 'Ops' },
  'reviewsCount':                { key: 'archive.reviewsCount',                zh: '', en: 'Review Entries' },
  'knowledgeExtracts':           { key: 'archive.knowledgeExtracts',           zh: '', en: 'Knowledge Extracts' },
  'archivePath':                 { key: 'archive.archivePath',                 zh: '', en: 'Archive File' },
};

/* ==================== roadmap ==================== */
export const roadmap: I18nDomain = {};

/* ==================== view ==================== */
export const view: I18nDomain = {
  'list.empty':                    { key: 'view.list.empty',                    zh: '', en: 'No review entries' },
  'list.filedBy':                  { key: 'view.list.filedBy',                  zh: '', en: 'Filed By' },
  'list.filedAt':                  { key: 'view.list.filedAt',                  zh: '', en: 'Time' },
  'add.errorInvalidPriorityTmpl':  { key: 'view.add.errorInvalidPriorityTmpl',  zh: '', en: 'Error: Invalid priority "{priority}", options: high / medium / low' },
  'add.okTmpl':                    { key: 'view.add.okTmpl',                    zh: '', en: '✓ Review entry added: {id} ({op}) — {title}' },
  'accept.okTmpl':                 { key: 'view.accept.okTmpl',                 zh: '', en: '✓ Review entry accepted: {id} → closed' },
  'accept.errorNotFoundTmpl':      { key: 'view.accept.errorNotFoundTmpl',      zh: '', en: 'Error: Review entry {id} not found' },
};

/* ==================== instructions ==================== */
export const instructions: I18nDomain = {};

/* ==================== help ==================== */
export const help: I18nDomain = {
  'openfeel':              { key: 'help.openfeel',              zh: '', en: 'AI Agent development workflow governance CLI tool' },
  'openfeel.version':      { key: 'help.openfeel.version',      zh: '', en: 'Output version number' },

  'init':                  { key: 'help.init',                  zh: '', en: 'Initialize project workspace, create .openfeel/ directory structure and config files' },
  'init.demo':             { key: 'help.init.demo',             zh: '', en: 'Create demo project skeleton (NumKit style)' },
  'init.lang':             { key: 'help.init.lang',             zh: '', en: 'Agent prompt language (zh-CN or en), defaults to zh-CN in non-interactive mode' },

  'update':                { key: 'help.update',                zh: '', en: 'Deploy OpenFeel adapter files to target project (interactive tool selection when no args)' },
  'update.lang':           { key: 'help.update.lang',           zh: '', en: 'Agent prompt language (zh-CN or en)' },
  'update.force':          { key: 'help.update.force',          zh: '', en: 'Skip AGENTS.md overwrite confirmation, force overwrite' },

  'flow':                  { key: 'help.flow',                  zh: '', en: 'Pipeline status management' },
  'flow.status':           { key: 'help.flow.status',           zh: '', en: 'Show pipeline status summary' },
  'flow.status.verbose':   { key: 'help.flow.status.verbose',   zh: '', en: 'Enhanced output: config cascade, recent changes, downstream agent readiness' },
  'flow.status.lines':     { key: 'help.flow.status.lines',     zh: '', en: 'Number of recent status changes (default 5)' },
  'flow.overview':         { key: 'help.flow.overview',         zh: '', en: 'Full status visualization (/opfx:status backend)' },
  'flow.current':          { key: 'help.flow.current',          zh: '', en: 'Show current stage and operation' },
  'flow.metrics':          { key: 'help.flow.metrics',          zh: '', en: 'Show Agent performance metrics' },
  'flow.stage':            { key: 'help.flow.stage',            zh: '', en: 'Stage management' },
  'flow.stage.add':        { key: 'help.flow.stage.add',        zh: '', en: 'Add pipeline stage' },
  'flow.advance':          { key: 'help.flow.advance',          zh: '', en: 'Advance pipeline stage' },
  'flow.advance.op':       { key: 'help.flow.advance.op',       zh: '', en: 'Operation ID (e.g. stage-01.op-001), for logging/display only' },
  'flow.advance.to':       { key: 'help.flow.advance.to',       zh: '', en: 'Target phase (e.g. exec_running)' },
  'flow.advance.stage':    { key: 'help.flow.advance.stage',    zh: '', en: 'Stage ID (e.g. stage-03), required' },
  'flow.advance.force':    { key: 'help.flow.advance.force',    zh: '', en: 'Force execution (skip invalid phase check and phase jump check, but not REV block check)' },
  'flow.attempt':          { key: 'help.flow.attempt',          zh: '', en: 'Record operation execution result' },
  'flow.attempt.op':       { key: 'help.flow.attempt.op',       zh: '', en: 'Operation ID (e.g. stage-01.op-001)' },
  'flow.attempt.result':   { key: 'help.flow.attempt.result',   zh: '', en: 'Execution result (pass or fail)' },
  'flow.log':              { key: 'help.flow.log',              zh: '', en: 'Show recent operation logs' },
  'flow.log.last':         { key: 'help.flow.log.last',         zh: '', en: 'Show last n entries (default 10)' },
  'flow.review':           { key: 'help.flow.review',           zh: '', en: 'Manage review entries' },
  'flow.review.add':       { key: 'help.flow.review.add',       zh: '', en: 'Add review entry' },
  'flow.review.add.op':    { key: 'help.flow.review.add.op',    zh: '', en: 'Operation ID (e.g. stage-01.op-001)' },
  'flow.review.add.title': { key: 'help.flow.review.add.title', zh: '', en: 'Review title' },
  'flow.review.add.autoFix':   { key: 'help.flow.review.add.autoFix',   zh: '', en: 'Auto-fix detail, when set skips scheme_pending and advances directly to exec_running' },
  'flow.review.add.blocking':  { key: 'help.flow.review.add.blocking',  zh: '', en: 'Whether to block pipeline (default true)' },
  'flow.review.resolve':   { key: 'help.flow.review.resolve',   zh: '', en: 'Resolve review entry' },
  'flow.retry':            { key: 'help.flow.retry',            zh: '', en: 'Query operation retry status' },
  'flow.retry.op':         { key: 'help.flow.retry.op',         zh: '', en: 'Operation ID (e.g. stage-01.op-001)' },
  'flow.repair':           { key: 'help.flow.repair',           zh: '', en: 'Auto-detect and fix common issues in flow.json' },
  'flow.repair.dryRun':    { key: 'help.flow.repair.dryRun',    zh: '', en: 'Detect only, do not fix' },
  'flow.repair.backup':    { key: 'help.flow.repair.backup',    zh: '', en: 'Backup as .bak before repair' },
  'flow.migrate':          { key: 'help.flow.migrate',          zh: '', en: 'Migrate legacy flow.json (v4.0 global phase) to new format (v4.1 stage-level phase)' },
  'flow.migrate.dryRun':   { key: 'help.flow.migrate.dryRun',   zh: '', en: 'Preview only, do not write files' },
  'flow.migrate.noBackup': { key: 'help.flow.migrate.noBackup', zh: '', en: 'Skip .bak file generation (default generates flow.json.v4.0.bak)' },
  'flow.health':           { key: 'help.flow.health',           zh: '', en: 'Comprehensive health check: flow.json / cross-file consistency / zombie states / config.yaml etc.' },
  'flow.health.quick':     { key: 'help.flow.health.quick',     zh: '', en: 'Key checks only (phase/current validity, skip other checks)' },
  'flow.recover':          { key: 'help.flow.recover',          zh: '', en: 'Cross-session context recovery: pipeline status, blockers, and pending tasks' },
  'flow.wizard':           { key: 'help.flow.wizard',           zh: '', en: 'Interactive pipeline wizard, advance stage by stage' },

  'config.get-lang':       { key: 'help.config.get-lang',       zh: '', en: 'Show global default language' },
  'config.set-lang':       { key: 'help.config.set-lang',       zh: '', en: 'Change global default language (zh-CN or en)' },
  'config.list-projects':  { key: 'help.config.list-projects',  zh: '', en: 'List all recorded project path→language mappings' },
  'config.get':            { key: 'help.config.get',            zh: '', en: 'Read a project workflow config value (project config)' },
  'config.set':            { key: 'help.config.set',            zh: '', en: 'Set a project workflow config value (project config)' },

  'project':               { key: 'help.project',               zh: '', en: 'Project management and overview' },
  'project.overview':      { key: 'help.project.overview',      zh: '', en: 'Scan project structure in real-time, output structured overview' },

  'plan':                  { key: 'help.plan',                  zh: '', en: 'Plan management' },
  'plan.stage':            { key: 'help.plan.stage',            zh: '', en: 'Work stage management' },
  'plan.stage.add':        { key: 'help.plan.stage.add',        zh: '', en: 'Add work stage' },
  'plan.stage.list':       { key: 'help.plan.stage.list',       zh: '', en: 'List all work stages' },
  'plan.scheme':           { key: 'help.plan.scheme',           zh: '', en: 'Operation scheme management' },
  'plan.scheme.create':    { key: 'help.plan.scheme.create',    zh: '', en: 'Create operation scheme' },
  'plan.scheme.list':      { key: 'help.plan.scheme.list',      zh: '', en: 'List operation schemes (optionally filter by stage)' },

  'stage':                 { key: 'help.stage',                 zh: '', en: 'Work stage status management (status.md atomic operations)' },
  'stage.status':          { key: 'help.stage.status',          zh: '', en: 'View stage status (list all stages when no arg)' },
  'stage.set':             { key: 'help.stage.set',             zh: '', en: 'Set stage status field (atomic update, preserve rest)' },
  'stage.set.status':      { key: 'help.stage.set.status',      zh: '', en: 'Status value (e.g. exec_running)' },
  'stage.task':            { key: 'help.stage.task',            zh: '', en: 'Check or uncheck task checkbox' },
  'stage.task.done':       { key: 'help.stage.task.done',       zh: '', en: 'Mark task as done' },
  'stage.task.undone':     { key: 'help.stage.task.undone',     zh: '', en: 'Mark task as not done' },

  'view':                  { key: 'help.view',                  zh: '', en: 'Review entry management' },
  'view.list':             { key: 'help.view.list',             zh: '', en: 'List review entries' },
  'view.list.op':          { key: 'help.view.list.op',          zh: '', en: 'Filter by operation ID' },
  'view.add':              { key: 'help.view.add',              zh: '', en: 'Add review entry' },
  'view.add.op':           { key: 'help.view.add.op',           zh: '', en: 'Operation ID (e.g. stage-01.op-001)' },
  'view.add.title':        { key: 'help.view.add.title',        zh: '', en: 'Review title' },
  'view.add.priority':     { key: 'help.view.add.priority',     zh: '', en: 'Priority (high/medium/low, default medium)' },
  'view.accept':           { key: 'help.view.accept',           zh: '', en: 'Accept review entry (mark as closed)' },

  'knowledge':             { key: 'help.knowledge',             zh: '', en: 'Knowledge base management' },
  'knowledge.list':        { key: 'help.knowledge.list',        zh: '', en: 'List knowledge entries' },
  'knowledge.list.type':   { key: 'help.knowledge.list.type',   zh: '', en: 'Filter by category' },
  'knowledge.add':         { key: 'help.knowledge.add',         zh: '', en: 'Add knowledge entry' },
  'knowledge.add.content': { key: 'help.knowledge.add.content', zh: '', en: 'Entry content (can also be piped via stdin)' },
  'knowledge.search':      { key: 'help.knowledge.search',      zh: '', en: 'Search knowledge base' },
  'knowledge.search.limit':  { key: 'help.knowledge.search.limit',  zh: '', en: 'Max results (default 10)' },
  'knowledge.search.offset': { key: 'help.knowledge.search.offset', zh: '', en: 'Result offset (default 0)' },
  'knowledge.index':       { key: 'help.knowledge.index',       zh: '', en: 'Show knowledge base index overview' },

  'archive':               { key: 'help.archive',               zh: '', en: 'Archive stage (summarize output, generate summary, extract knowledge)' },

  'roadmap':               { key: 'help.roadmap',               zh: '', en: 'Roadmap management' },
  'roadmap.create':        { key: 'help.roadmap.create',        zh: '', en: 'Create roadmap (version number like 1.0, 2.0)' },
  'roadmap.show':          { key: 'help.roadmap.show',          zh: '', en: 'Show roadmap content (list all if no version)' },

  'instructions':          { key: 'help.instructions',          zh: '', en: 'Generate structured instructions (XML or JSON) for an artifact' },
  'instructions.change':   { key: 'help.instructions.change',   zh: '', en: 'Change name (e.g. feat-login)' },
  'instructions.json':     { key: 'help.instructions.json',     zh: '', en: 'Output JSON format instead of XML' },
  'instructions.schema':   { key: 'help.instructions.schema',   zh: '', en: 'Schema name (default spec-driven)' },
};

/* ==================== config ==================== */
export const config: I18nDomain = {
  'get.lang':                { key: 'config.get.lang',                zh: '', en: 'Global language: {lang}' },
  'set.ok':                  { key: 'config.set.ok',                  zh: '', en: 'Global language set to: {lang}' },
  'set.invalidLang':         { key: 'config.set.invalidLang',         zh: '', en: 'Invalid language "{val}". Supported: zh-CN and en' },
  'list.title':              { key: 'config.list.title',              zh: '', en: 'Recorded project language mappings:' },
  'list.empty':              { key: 'config.list.empty',              zh: '', en: '(No projects recorded)' },
  'list.item':               { key: 'config.list.item',               zh: '', en: '  {path} → {lang}' },
  'get.result':              { key: 'config.get.result',              zh: '', en: '{key}: {value}' },
  'set.valueOk':             { key: 'config.set.valueOk',             zh: '', en: '{key} set to: {value}' },
  'set.invalidKey':          { key: 'config.set.invalidKey',          zh: '', en: 'Invalid config key "{val}". Currently supported: {keys}' },
  'set.invalidValue':        { key: 'config.set.invalidValue',        zh: '', en: 'Invalid value "{val}". {key} only supports: {values}' },
  'set.noProject':           { key: 'config.set.noProject',           zh: '', en: 'No project config file found, please run openfeel init first' },
};

/* ==================== 聚合导出 ==================== */
export const allDomains: Array<{ name: string; domain: I18nDomain }> = [
  { name: 'common',       domain: common },
  { name: 'help',         domain: help },
  { name: 'flow',         domain: flow },
  { name: 'init',         domain: init },
  { name: 'update',       domain: update },
  { name: 'project',      domain: project },
  { name: 'stage',        domain: stage },
  { name: 'plan',         domain: plan },
  { name: 'knowledge',    domain: knowledge },
  { name: 'archive',      domain: archive },
  { name: 'roadmap',      domain: roadmap },
  { name: 'view',         domain: view },
  { name: 'instructions', domain: instructions },
  { name: 'config',       domain: config },
];
