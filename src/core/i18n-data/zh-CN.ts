/**
 * 中文 i18n 字符串映射表
 *
 * 按功能域组织，键名对照 I18nEntry.key。
 * 本文件为唯一真相源——所有中文字符串集中管理于此。
 */
import type { I18nEntry, I18nDomain } from './types.js';

/* ==================== common 域：跨命令共享字符串 ==================== */
export const common: I18nDomain = {
  error:           { key: 'common.error',           zh: '错误',       en: '' },
  errorTmpl:       { key: 'common.errorTmpl',       zh: '错误：{msg}', en: '' },
  ok:              { key: 'common.ok',              zh: '✓',         en: '' },
  none:            { key: 'common.none',            zh: '(无)',      en: '' },
  noData:          { key: 'common.noData',          zh: '（无记录）',  en: '' },
  inProgress:      { key: 'common.inProgress',      zh: '(进行中)',   en: '' },
  completed:       { key: 'common.completed',       zh: '已完成',     en: '' },
  unknown:         { key: 'common.unknown',         zh: '未知',       en: '' },
  cancelled:       { key: 'common.cancelled',       zh: '已取消',     en: '' },
  noInit:          { key: 'common.noInit',          zh: '流水线未初始化（flow.json 不存在）', en: '' },
  noConfig:        { key: 'common.noConfig',        zh: '（无配置）',  en: '' },
  invalidOpId:     { key: 'common.invalidOpId',     zh: 'opId 格式不正确，应为 stage-xx.op-xxx（如 stage-01.op-001）', en: '' },
  errorNoInit:     { key: 'common.errorNoInit',     zh: '错误：flow.json 未初始化，请先运行 openfeel init', en: '' },
  stage:           { key: 'common.stage',           zh: '阶段',       en: '' },
  op:              { key: 'common.op',              zh: '操作',       en: '' },
  status:          { key: 'common.status',          zh: '状态',       en: '' },
  blockedBy:       { key: 'common.blockedBy',       zh: '阻塞原因',   en: '' },
  retry:           { key: 'common.retry',           zh: '重试',       en: '' },
  cancel:          { key: 'common.cancel',          zh: '取消',       en: '' },
};

/* ==================== flow 域：流水线状态管理 ==================== */
export const flow: I18nDomain = {
  // flow status
  'status.title':               { key: 'flow.status.title',               zh: 'OpenFeel 流水线状态',                     en: '' },
  'status.verboseTitle':        { key: 'flow.status.verboseTitle',        zh: 'OpenFeel 流水线状态（verbose）',           en: '' },
  'status.currentStage':        { key: 'flow.status.currentStage',        zh: '当前活跃阶段',                            en: '' },
  'status.stageDuration':       { key: 'flow.status.stageDuration',       zh: '阶段耗时',                               en: '' },
  'status.globalStatus':        { key: 'flow.status.globalStatus',        zh: '全局状态',                               en: '' },
  'status.currentStageLabel':   { key: 'flow.status.currentStageLabel',   zh: '当前阶段',                               en: '' },
  'status.stagePhase':          { key: 'flow.status.stagePhase',          zh: '阶段状态',                               en: '' },
  'status.currentOp':           { key: 'flow.status.currentOp',           zh: '当前操作',                               en: '' },
  'status.retryCount':          { key: 'flow.status.retryCount',          zh: '重试次数',                               en: '' },
  'status.stagesCount':         { key: 'flow.status.stagesCount',         zh: '阶段数',                                 en: '' },
  'status.opsCount':            { key: 'flow.status.opsCount',            zh: '操作数',                                 en: '' },
  'status.reviewPending':       { key: 'flow.status.reviewPending',       zh: '待处理审查',                              en: '' },
  'status.logTotal':            { key: 'flow.status.logTotal',            zh: '日志总数',                               en: '' },
  'status.cascadeTitle':        { key: 'flow.status.cascadeTitle',        zh: '── 配置级联状态 ──',                     en: '' },
  'status.cascadeHeader':       { key: 'flow.status.cascadeHeader',       zh: '字段               config.yaml  status.md  生效值', en: '' },
  'status.cascadeNote':         { key: 'flow.status.cascadeNote',         zh: '（* 表示 status.md 覆盖了 config.yaml 默认值）', en: '' },
  'status.recentTitleTmpl':     { key: 'flow.status.recentTitleTmpl',     zh: '── 最近 {n} 条状态变更 ──',             en: '' },
  'status.recentHeader':        { key: 'flow.status.recentHeader',        zh: '时间              Agent          状态变化            说明', en: '' },
  'status.downstreamTitle':     { key: 'flow.status.downstreamTitle',     zh: '── 下游 Agent 就绪状态 ──',             en: '' },
  'status.noDownstream':        { key: 'flow.status.noDownstream',        zh: '（当前阶段无下游可达阶段）',              en: '' },
  'status.downstreamHeader':    { key: 'flow.status.downstreamHeader',    zh: '可达阶段            负责 Agent',          en: '' },
  'status.lastUpdated':         { key: 'flow.status.lastUpdated',         zh: '最后更新',                               en: '' },
  'status.recoveryTitle':       { key: 'flow.status.recoveryTitle',       zh: '── 跨会话恢复信息 ──',                   en: '' },
  'status.recoveryMoreTmpl':    { key: 'flow.status.recoveryMoreTmpl',    zh: '... 还有 {n} 项',                        en: '' },

  // flow overview
  'overview.title':             { key: 'flow.overview.title',             zh: 'OpenFeel 流水线全景视图',                 en: '' },
  'overview.currentStatus':     { key: 'flow.overview.currentStatus',     zh: '📍 当前状态',                             en: '' },
  'overview.stagesOverview':    { key: 'flow.overview.stagesOverview',    zh: '📋 阶段总览',                             en: '' },
  'overview.noStages':          { key: 'flow.overview.noStages',          zh: '（无阶段数据）',                          en: '' },
  'overview.totalStagesTmpl':   { key: 'flow.overview.totalStagesTmpl',   zh: '共 {n} 个阶段',                           en: '' },
  'overview.noOps':             { key: 'flow.overview.noOps',             zh: '(无操作)',                               en: '' },
  'overview.reviewSection':     { key: 'flow.overview.reviewSection',     zh: '🔍 审查条目 (REV)',                       en: '' },
  'overview.noReviews':         { key: 'flow.overview.noReviews',         zh: '（无审查条目）',                          en: '' },
  'overview.reviewOpen':        { key: 'flow.overview.reviewOpen',        zh: '打开',                                   en: '' },
  'overview.reviewResolved':    { key: 'flow.overview.reviewResolved',    zh: '已解决',                                 en: '' },
  'overview.reviewClosed':      { key: 'flow.overview.reviewClosed',      zh: '已关闭',                                 en: '' },
  'overview.reviewPending':     { key: 'flow.overview.reviewPending',     zh: '待处理审查',                              en: '' },
  'overview.bugSection':        { key: 'flow.overview.bugSection',        zh: '🐛 Bug 追踪',                            en: '' },
  'overview.bugUnreadable':     { key: 'flow.overview.bugUnreadable',     zh: '（无法读取 Bug 统计）',                   en: '' },
  'overview.bugUninitialized':  { key: 'flow.overview.bugUninitialized',  zh: '（Bug 追踪未初始化）',                    en: '' },
  'overview.bugOpen':           { key: 'flow.overview.bugOpen',           zh: '打开',                                   en: '' },
  'overview.bugClosed':         { key: 'flow.overview.bugClosed',         zh: '已关闭',                                 en: '' },
  'overview.recentLogs':        { key: 'flow.overview.recentLogs',        zh: '📝 最近操作（5 条）',                     en: '' },
  'overview.noLogs':            { key: 'flow.overview.noLogs',            zh: '（无日志记录）',                          en: '' },
  'overview.health':            { key: 'flow.overview.health',            zh: '💚 健康状态',                             en: '' },
  'overview.healthStatsTmpl':   { key: 'flow.overview.healthStatsTmpl',   zh: '✅ {n}  🟡 {m}  ❌ {k}',                 en: '' },

  // flow current
  'current.globalStatus':       { key: 'flow.current.globalStatus',       zh: '全局状态',                               en: '' },
  'current.stagePhase':         { key: 'flow.current.stagePhase',         zh: '阶段状态',                               en: '' },
  'current.currentOp':          { key: 'flow.current.currentOp',          zh: '当前操作',                               en: '' },
  'current.retryCount':         { key: 'flow.current.retryCount',         zh: '重试次数',                               en: '' },

  // flow stage add
  'stage.addedTmpl':            { key: 'flow.stage.addedTmpl',            zh: '✓ 已创建阶段: {stage} → plan_pending',   en: '' },

  // flow advance
  'advance.errorNoStage':       { key: 'flow.advance.errorNoStage',       zh: '错误：--stage 参数必须指定阶段 ID（如 stage-03）', en: '' },
  'advance.warnAutoCorrect':    { key: 'flow.advance.warnAutoCorrect',    zh: '（非标准 phase 已自动修正，继续推进）',     en: '' },
  'advance.errorInvalidFormat': { key: 'flow.advance.errorInvalidFormat', zh: '错误：flow.json 格式不合法',               en: '' },
  'advance.errorInvalidPhaseTmpl': { key: 'flow.advance.errorInvalidPhaseTmpl', zh: "错误: '{phase}' 不是合法的 PipelinePhase。", en: '' },
  'advance.labelValidPhases':   { key: 'flow.advance.labelValidPhases',   zh: '合法值',                                 en: '' },
  'advance.hintUseForceFuzzy':  { key: 'flow.advance.hintUseForceFuzzy',  zh: '使用 --force 强制执行（自动模糊修正）',    en: '' },
  'advance.errorPhaseJumpTmpl': { key: 'flow.advance.errorPhaseJumpTmpl', zh: '错误: 阶段 "{stage}" 当前 phase 无法跳转到 "{to}"', en: '' },
  'advance.hintUseForce':       { key: 'flow.advance.hintUseForce',       zh: '使用 --force 强制执行',                   en: '' },
  'advance.warnSkipReview':     { key: 'flow.advance.warnSkipReview',     zh: '[!] 跳过审查阶段直接标记 done，确认继续',   en: '' },
  'advance.okTmpl':             { key: 'flow.advance.okTmpl',             zh: '✓ 已推进: {stage} → {to}',               en: '' },
  'advance.opLabelTmpl':        { key: 'flow.advance.opLabelTmpl',        zh: '操作: {op}',                              en: '' },
  'advance.autoRepaired':       { key: 'flow.advance.autoRepaired',       zh: '检测到阶段数据不一致，已自动修复',          en: '' },
  'advance.saveError':          { key: 'flow.advance.saveError',          zh: 'flow.json 保存失败',                      en: '' },
  'advance.gitCommitOkTmpl':    { key: 'flow.advance.gitCommitOkTmpl',    zh: '✓ 阶段 {stage} 已自动 git commit 归档',    en: '' },
  'advance.gitCommitSkipTmpl':  { key: 'flow.advance.gitCommitSkipTmpl',  zh: '（跳过自动 git commit：非 git 仓库或无变更）{stage}', en: '' },

  // flow attempt
  'attempt.errorInvalidResult': { key: 'flow.attempt.errorInvalidResult', zh: '错误：--result 必须为 pass 或 fail',       en: '' },
  'attempt.passTmpl':           { key: 'flow.attempt.passTmpl',           zh: '✓ {op} 执行成功',                         en: '' },
  'attempt.failRetryTmpl':      { key: 'flow.attempt.failRetryTmpl',      zh: '⚠ {op} 执行失败，将重试（可重试）',         en: '' },
  'attempt.failReplanTmpl':     { key: 'flow.attempt.failReplanTmpl',     zh: '✗ {op} 重试耗尽，需要重新规划',            en: '' },
  'attempt.autoReplan':         { key: 'flow.attempt.autoReplan',         zh: '→ 已自动回退到 scheme_pending，请重新规划方案', en: '' },

  // flow log
  'log.noInit':                 { key: 'flow.log.noInit',                 zh: '流水线未初始化，无日志',                   en: '' },
  'log.noLogs':                 { key: 'flow.log.noLogs',                 zh: '暂无操作日志',                            en: '' },
  'log.recentTitleTmpl':        { key: 'flow.log.recentTitleTmpl',        zh: '最近 {n} 条操作日志',                     en: '' },
  'log.detail':                 { key: 'flow.log.detail',                 zh: '详情',                                   en: '' },

  // flow checkpoint
  'checkpoint.listTitle':           { key: 'flow.checkpoint.listTitle',           zh: 'Checkpoint 快照',                        en: '' },
  'checkpoint.noSnapshots':         { key: 'flow.checkpoint.noSnapshots',         zh: '（暂无 Checkpoint 快照）',                en: '' },
  'checkpoint.noSnapshotsStageTmpl':{ key: 'flow.checkpoint.noSnapshotsStageTmpl', zh: '（阶段 {stage} 暂无 Checkpoint 快照）',    en: '' },
  'checkpoint.listCountTmpl':       { key: 'flow.checkpoint.listCountTmpl',       zh: '共 {n} 个快照',                          en: '' },
  'checkpoint.restoreNeedForce':    { key: 'flow.checkpoint.restoreNeedForce',    zh: '错误：恢复操作将覆盖当前 flow.json，请使用 --force 确认', en: '' },
  'checkpoint.restoreOkTmpl':       { key: 'flow.checkpoint.restoreOkTmpl',       zh: '✓ 已从快照 {file} 恢复 flow.json（当前文件已备份为 flow.json.bak）', en: '' },
  'checkpoint.restoreFailTmpl':     { key: 'flow.checkpoint.restoreFailTmpl',     zh: '错误：无法从快照 {file} 恢复（文件不存在、名称非法或内容无效）', en: '' },

  // flow review
  'review.errorStageNotFoundTmpl':  { key: 'flow.review.errorStageNotFoundTmpl',  zh: '错误：opId "{opId}" 中的阶段 "{stage}" 在 flow.json 中不存在', en: '' },
  'review.errorOpNotFoundTmpl':     { key: 'flow.review.errorOpNotFoundTmpl',     zh: '错误：opId "{opId}" 中的操作 "{op}" 在阶段 "{stage}" 中不存在', en: '' },
  'review.labelBlocking':           { key: 'flow.review.labelBlocking',           zh: '[阻塞]',                             en: '' },
  'review.labelNonBlocking':        { key: 'flow.review.labelNonBlocking',        zh: '[非阻塞]',                            en: '' },
  'review.addedAutoFixTmpl':        { key: 'flow.review.addedAutoFixTmpl',        zh: '✓ {label} [AUTO_FIX] 审查条目已添加并自动修复: {revId}', en: '' },
  'review.detail':                  { key: 'flow.review.detail',                  zh: '说明',                               en: '' },
  'review.autoFixPhase':            { key: 'flow.review.autoFixPhase',            zh: '流水线已跳过 review_failed，直接推进到 exec_running', en: '' },
  'review.addedTmpl':               { key: 'flow.review.addedTmpl',               zh: '✓ {label} 审查条目已添加: {revId} ({op})', en: '' },
  'review.resolvedTmpl':            { key: 'flow.review.resolvedTmpl',            zh: '✓ 审查条目已解决: {revId}',             en: '' },
  'review.notFoundTmpl':            { key: 'flow.review.notFoundTmpl',            zh: '错误：未找到审查条目 {revId}',          en: '' },

  // flow retry
  'retry.errorNoData':              { key: 'flow.retry.errorNoData',              zh: '错误：无法读取流水线数据',               en: '' },
  'retry.errorStageNotFoundTmpl':   { key: 'flow.retry.errorStageNotFoundTmpl',   zh: '错误：未找到阶段 {stage}',               en: '' },
  'retry.errorOpNotFoundTmpl':      { key: 'flow.retry.errorOpNotFoundTmpl',      zh: '错误：未找到操作 {op}',                  en: '' },
  'retry.attemptCount':             { key: 'flow.retry.attemptCount',             zh: '当前尝试次数',                          en: '' },
  'retry.exhausted':                { key: 'flow.retry.exhausted',                zh: '⚠ 重试次数已用尽',                       en: '' },

  // flow repair
  'repair.backupOk':                { key: 'flow.repair.backupOk',                zh: '已备份: flow.json.bak',                  en: '' },
  'repair.noBackup':                { key: 'flow.repair.noBackup',                zh: 'flow.json 不存在，无需备份',              en: '' },
  'repair.dryRunTitle':             { key: 'flow.repair.dryRunTitle',             zh: '[DRY-RUN 模式] 以下问题将被修复:',        en: '' },
  'repair.recovered':               { key: 'flow.repair.recovered',               zh: '♻ flow.json 从 .bak 恢复成功',            en: '' },
  'repair.dryRunHint':              { key: 'flow.repair.dryRunHint',              zh: '检测到可修复的问题，使用不带 --dry-run 执行以应用修复。', en: '' },
  'repair.fixDone':                 { key: 'flow.repair.fixDone',                 zh: '✓ flow.json 修复完成',                   en: '' },
  'repair.noFix':                   { key: 'flow.repair.noFix',                   zh: '未检测到需要修复的问题',                  en: '' },
  'repair.fixFailed':               { key: 'flow.repair.fixFailed',               zh: '✗ 部分问题无法自动修复，请手动检查 flow.json', en: '' },
  'repair.migrationHint':           { key: 'flow.repair.migrationHint',           zh: '💡 检测到旧版 flow.json 格式（全局 phase），建议运行:', en: '' },
  'repair.migrationPreview':        { key: 'flow.repair.migrationPreview',        zh: '查看迁移预览: openfeel flow migrate --dry-run', en: '' },

  // flow migrate
  'migrate.alreadyNew':             { key: 'flow.migrate.alreadyNew',             zh: '✓ 已是新版格式，无需迁移',                en: '' },
  'migrate.dryRunTitle':            { key: 'flow.migrate.dryRunTitle',            zh: '[DRY-RUN 模式] 以下变更将被执行:',         en: '' },
  'migrate.dryRunNote':             { key: 'flow.migrate.dryRunNote',             zh: '（未实际修改文件，使用不带 --dry-run 执行以应用迁移）', en: '' },
  'migrate.complete':               { key: 'flow.migrate.complete',               zh: '迁移完成',                               en: '' },
  'migrate.failed':                 { key: 'flow.migrate.failed',                 zh: '✗ 迁移失败',                             en: '' },
  'migrate.done':                   { key: 'flow.migrate.done',                   zh: '✓ flow.json 已迁移至新版格式',            en: '' },

  // flow health
  'health.title':                   { key: 'flow.health.title',                   zh: 'openfeel flow health',                    en: '' },
  'health.pass':                    { key: 'flow.health.pass',                    zh: '🎉 健康检查通过',                         en: '' },
  'health.hasFailures':             { key: 'flow.health.hasFailures',             zh: '⚠️  存在不通过项，请检查上述错误',         en: '' },
  'health.quickMode':               { key: 'flow.health.quickMode',               zh: '（快速模式：仅检查关键项）',              en: '' },

  // flow recover
  'recover.title':                  { key: 'flow.recover.title',                  zh: '═══ 跨会话上下文恢复 ═══',               en: '' },
  'recover.globalStatus':           { key: 'flow.recover.globalStatus',           zh: '全局状态',                               en: '' },
  'recover.phase':                  { key: 'flow.recover.phase',                  zh: '流水线阶段',                             en: '' },
  'recover.currentOp':              { key: 'flow.recover.currentOp',              zh: '当前操作',                               en: '' },
  'recover.stageStatus':            { key: 'flow.recover.stageStatus',            zh: '阶段状态',                               en: '' },
  'recover.pendingTasksTmpl':       { key: 'flow.recover.pendingTasksTmpl',       zh: '待处理任务 ({n})',                       en: '' },
  'recover.noTasks':                { key: 'flow.recover.noTasks',                zh: '无待处理任务',                            en: '' },
  'recover.stageDuration':          { key: 'flow.recover.stageDuration',          zh: '阶段耗时',                               en: '' },
  'recover.statusUninitialized':   { key: 'flow.recover.statusUninitialized',    zh: '未初始化',                               en: '' },
  'recover.statusAutoExec':        { key: 'flow.recover.statusAutoExec',          zh: '自动执行',                               en: '' },
  'recover.statusManualExec':      { key: 'flow.recover.statusManualExec',        zh: '手动执行',                               en: '' },
  'recover.statusUnreadable':      { key: 'flow.recover.statusUnreadable',        zh: '无法读取 status.md',                     en: '' },
  'recover.statusFileMissing':     { key: 'flow.recover.statusFileMissing',       zh: 'status.md 不存在',                       en: '' },
  'recover.statusNoCurrentStage':  { key: 'flow.recover.statusNoCurrentStage',    zh: '无当前阶段',                             en: '' },

  // flow wizard
  'wizard.done':                    { key: 'flow.wizard.done',                    zh: '🎉 流水线已完成！',                       en: '' },
  'wizard.noStages':                { key: 'flow.wizard.noStages',                zh: '无可用阶段。',                            en: '' },
  'wizard.selectStage':             { key: 'flow.wizard.selectStage',             zh: '选择要推进的阶段',                        en: '' },
  'wizard.currentLabel':            { key: 'flow.wizard.currentLabel',            zh: '(当前)',                                 en: '' },
  'wizard.unavailable':             { key: 'flow.wizard.unavailable',             zh: '选择的阶段不可用。',                      en: '' },
  'wizard.statusHeader':            { key: 'flow.wizard.statusHeader',            zh: '═══ 流水线状态 ═══',                      en: '' },
  'wizard.stagePhase':              { key: 'flow.wizard.stagePhase',              zh: '阶段状态',                               en: '' },
  'wizard.retryCount':              { key: 'flow.wizard.retryCount',              zh: '重试次数',                               en: '' },
  'wizard.pendingReviews':          { key: 'flow.wizard.pendingReviews',          zh: '待处理审查',                              en: '' },
  'wizard.noNext':                  { key: 'flow.wizard.noNext',                  zh: '当前阶段无可达的下一步操作。',            en: '' },
  'wizard.exitOption':              { key: 'flow.wizard.exitOption',              zh: '退出向导',                               en: '' },
  'wizard.selectAction':            { key: 'flow.wizard.selectAction',            zh: '选择下一步操作',                          en: '' },
  'wizard.exited':                  { key: 'flow.wizard.exited',                  zh: '已退出向导。',                            en: '' },
  'wizard.previewTmpl':             { key: 'flow.wizard.previewTmpl',             zh: '预览: 将阶段 {stage} 从 {from} ({fromLabel}) 推进到 {to} ({toLabel})', en: '' },
  'wizard.confirmTitle':            { key: 'flow.wizard.confirmTitle',            zh: '确认执行此操作？',                        en: '' },
  'wizard.confirm':                 { key: 'flow.wizard.confirm',                 zh: '确认推进',                               en: '' },
  'wizard.advancedTmpl':            { key: 'flow.wizard.advancedTmpl',            zh: '✓ 已推进: {stage}: {from} → {to}',       en: '' },
};

/* ==================== init 域：初始化命令 ==================== */
export const init: I18nDomain = {
  'errorPathNotExistTmpl':      { key: 'init.errorPathNotExistTmpl',      zh: '错误：路径不存在 — {path}',                en: '' },
  'initializingTmpl':           { key: 'init.initializingTmpl',           zh: '正在初始化 OpenFeel 工作区: {path}',        en: '' },
  'created':                    { key: 'init.created',                    zh: '已创建',                                  en: '' },
  'updated':                    { key: 'init.updated',                    zh: '已更新',                                  en: '' },
  'alreadyUpToDate':            { key: 'init.alreadyUpToDate',            zh: '工作区已是最新状态，无需变更。',            en: '' },
  'complete':                   { key: 'init.complete',                   zh: '✓ OpenFeel 工作区初始化完成',              en: '' },
  'demoCreating':               { key: 'init.demoCreating',               zh: '⚙ 创建示例项目骨架...',                   en: '' },
  'demoCreated':                { key: 'init.demoCreated',                zh: '已创建示例文件',                           en: '' },
  'demoSkipped':                { key: 'init.demoSkipped',                zh: '已跳过（文件已存在）',                     en: '' },
  'demoComplete':               { key: 'init.demoComplete',               zh: '✅ 示例项目已创建，运行 npm install && npm test 开始', en: '' },
  // promptLanguage 函数内的字符串（用于 op-004/op-005）
  'prompt.nonInteractive':      { key: 'init.prompt.nonInteractive',      zh: '非交互环境，Agent 提示词语言默认设置为 zh-CN。使用 openfeel update --lang <zh-CN|en> 可修改。', en: '' },
  'prompt.bilingual':           { key: 'init.prompt.bilingual',           zh: 'Select Agent prompt language / 选择 Agent 提示词语言:', en: '' },
  // init.ts 中 initProject 里额外的 console 字符串
  'agentLangTmpl':              { key: 'init.agentLangTmpl',              zh: 'Agent 提示词语言: {lang}',                  en: '' },
  'invalidLangWarnTmpl':        { key: 'init.invalidLangWarnTmpl',        zh: '无效的 --lang 值 "{lang}"，回退到交互式选择', en: '' },
  // ensureGlobalConfig 非交互环境消息（REV-006）
  'firstUse.nonInteractive':    { key: 'init.firstUse.nonInteractive',    zh: '首次使用 OpenFeel：检测到非交互环境，全局默认语言设置为 zh-CN。', en: 'First time using OpenFeel: Non-interactive environment detected, global default language set to zh-CN.' },
  'firstUse.changeHint':        { key: 'init.firstUse.changeHint',        zh: '使用 openfeel config set-lang <zh-CN|en> 可修改。', en: 'Use openfeel config set-lang <zh-CN|en> to change.' },
  // ensureGlobalConfig 交互环境消息
  'firstUse.interactiveWelcome': { key: 'init.firstUse.interactiveWelcome', zh: '🌐 欢迎使用 OpenFeel！请选择全局默认语言', en: '🌐 Welcome to OpenFeel! Please select your global default language:' },
  'firstUse.interactiveOption':   { key: 'init.firstUse.interactiveOption',   zh: '请输入选项 (1/2) / Enter choice (1/2) [2]: ', en: '' },
  'firstUse.langSetEn':           { key: 'init.firstUse.langSetEn',           zh: '✓ 全局语言已设置为英文。后续可通过以下命令修改：openfeel config set-lang', en: '✓ Global language set to English. You can change it later with: openfeel config set-lang' },
  'firstUse.langSetZh':           { key: 'init.firstUse.langSetZh',           zh: '✓ 全局语言已设置为中文。后续可通过以下命令修改：openfeel config set-lang', en: '✓ Global language set to Chinese. You can change it later with: openfeel config set-lang' },
};

/* ==================== update 域：更新命令 ==================== */
export const update: I18nDomain = {
  'errorPathNotExistTmpl':      { key: 'update.errorPathNotExistTmpl',      zh: '错误：路径不存在 — {path}',                en: '' },
  'errorUnsupportedLangTmpl':   { key: 'update.errorUnsupportedLangTmpl',   zh: '错误：不支持的语言 "{lang}"。支持的值：zh-CN, en', en: '' },
  'autoInitTmpl':               { key: 'update.autoInitTmpl',               zh: '检测到项目尚未初始化，正在自动执行 openfeel init...', en: '' },
  'autoInitCreated':            { key: 'update.autoInitCreated',            zh: '已自动创建', en: '' },
  'cancelled':                  { key: 'update.cancelled',                  zh: '未选择任何工具，已取消。',                  en: '' },
  'deployingTmpl':              { key: 'update.deployingTmpl',              zh: '正在部署适配文件到: {path}',               en: '' },
  'selectedToolsTmpl':          { key: 'update.selectedToolsTmpl',          zh: '选定工具: {tools}',                        en: '' },
  'created':                    { key: 'update.created',                    zh: '已创建',                                  en: '' },
  'updated':                    { key: 'update.updated',                    zh: '已更新',                                  en: '' },
  'skipped':                    { key: 'update.skipped',                    zh: '已跳过（内容一致）',                       en: '' },
  'alreadyUpToDate':            { key: 'update.alreadyUpToDate',            zh: '所有适配文件已是最新状态，无需变更。',      en: '' },
  'complete':                   { key: 'update.complete',                   zh: '✓ 适配文件部署完成',                       en: '' },
  'errorDeployFailedTmpl':      { key: 'update.errorDeployFailedTmpl',      zh: '错误：部署失败 — {message}',               en: '' },
  'langConflict':               { key: 'update.langConflict',               zh: '⚠️ AGENTS.md 语言差异：当前项目为 {projectLang}，请求部署为 {requestedLang}。使用 --force 覆盖或手动调整。', en: '' },
};

/* ==================== project 域：项目概览命令 ==================== */
export const project: I18nDomain = {
  'overview.title':             { key: 'project.overview.title',             zh: 'OpenFeel 项目结构化概览',                  en: '' },
  'overview.basicInfo':         { key: 'project.overview.basicInfo',         zh: '📋 基本信息',                              en: '' },
  'overview.projectName':       { key: 'project.overview.projectName',       zh: '项目名',                                  en: '' },
  'overview.description':       { key: 'project.overview.description',       zh: '定位',                                    en: '' },
  'overview.language':          { key: 'project.overview.language',          zh: '语言',                                    en: '' },
  'overview.dirStructure':      { key: 'project.overview.dirStructure',      zh: '📁 目录结构',                              en: '' },
  'overview.dirNotExist':       { key: 'project.overview.dirNotExist',       zh: '（目录不存在）',                           en: '' },
  'overview.stats':             { key: 'project.overview.stats',             zh: '📊 统计信息',                              en: '' },
  'overview.entryPath':         { key: 'project.overview.entryPath',         zh: '🚪 入口路径',                              en: '' },
  'overview.noSrc':             { key: 'project.overview.noSrc',             zh: '（未检测到项目结构——缺少 src/ 目录）',      en: '' },
  'overview.techStack':         { key: 'project.overview.techStack',         zh: '🔧 技术栈',                               en: '' },

  // 目录结构 — 描述模板（带 {n} 变量插值）
  'dir.cliTmpl':          { key: 'project.dir.cliTmpl',          zh: '— CLI 入口程序（{n} 个文件）',   en: '' },
  'dir.commandsTmpl':     { key: 'project.dir.commandsTmpl',     zh: '— CLI 命令模块（{n} 个）',       en: '' },
  'dir.coreTmpl':         { key: 'project.dir.coreTmpl',         zh: '— 核心逻辑（{n} 个文件）',       en: '' },
  'dir.utilsTmpl':        { key: 'project.dir.utilsTmpl',        zh: '— 工具函数（{n} 个文件）',       en: '' },
  'dir.agentsTmpl':       { key: 'project.dir.agentsTmpl',       zh: '— Agent 定义（{n} 个）',         en: '' },
  'dir.skillsTmpl':       { key: 'project.dir.skillsTmpl',       zh: '— 技能定义（{n} 个）',           en: '' },
  'dir.kbTmpl':           { key: 'project.dir.kbTmpl',           zh: '— 项目知识库（{n} 个文件）',     en: '' },
  'dir.planTmpl':         { key: 'project.dir.planTmpl',         zh: '— 工作计划（{n} 个版本）',       en: '' },
  'dir.codeReviewTmpl':   { key: 'project.dir.codeReviewTmpl',   zh: '— 代码审查记录（{n} 个文件）',   en: '' },
  'dir.bugs':             { key: 'project.dir.bugs',             zh: '— Bug 追踪',                      en: '' },
  'dir.bugsNotInit':      { key: 'project.dir.bugsNotInit',      zh: '（未初始化）',                     en: '' },

  // 统计信息标签
  'stats.tsSource':       { key: 'project.stats.tsSource',       zh: 'TS 源文件',       en: '' },
  'stats.agentDefs':      { key: 'project.stats.agentDefs',      zh: 'Agent 定义',      en: '' },
  'stats.cliModules':     { key: 'project.stats.cliModules',     zh: 'CLI 命令模块',    en: '' },
  'stats.kbEntries':      { key: 'project.stats.kbEntries',      zh: 'KB 条目',         en: '' },
  'stats.planVersions':   { key: 'project.stats.planVersions',   zh: '计划版本',        en: '' },

  // 入口路径标签
  'entry.cli':            { key: 'project.entry.cli',            zh: 'CLI 入口',        en: '' },
  'entry.pkg':            { key: 'project.entry.pkg',            zh: '包入口',          en: '' },
  'entry.build':          { key: 'project.entry.build',          zh: '构建产物',        en: '' },

  // 技术栈标签
  'tech.runtime':         { key: 'project.tech.runtime',         zh: '运行时',    en: '' },
  'tech.language':        { key: 'project.tech.language',        zh: '语言',      en: '' },
  'tech.cliFramework':    { key: 'project.tech.cliFramework',    zh: 'CLI 框架',  en: '' },
  'tech.validation':      { key: 'project.tech.validation',      zh: '校验',      en: '' },
  'tech.config':          { key: 'project.tech.config',          zh: '配置',      en: '' },
  'tech.fileMatch':       { key: 'project.tech.fileMatch',       zh: '文件匹配',  en: '' },
  'tech.test':            { key: 'project.tech.test',            zh: '测试',      en: '' },
};

/* ==================== stage 域：阶段管理命令 ==================== */
export const stage: I18nDomain = {
  'status.noStages':             { key: 'stage.status.noStages',             zh: '未发现任何阶段（.openfeel/plan/ 中无 status.md 文件）', en: '' },
  'status.foundTmpl':            { key: 'stage.status.foundTmpl',            zh: '发现 {n} 个阶段',                         en: '' },
  'status.hint':                 { key: 'stage.status.hint',                 zh: '使用 openfeel stage status <stageId> 查看详细状态', en: '' },
  'errorStageNotFoundTmpl':      { key: 'stage.errorStageNotFoundTmpl',      zh: '错误：未找到阶段 "{stageId}" 的 status.md 文件', en: '' },
  'errorCheckStageId':           { key: 'stage.errorCheckStageId',           zh: '请确认阶段 ID 是否正确（如 v4-stage-04）', en: '' },
  'set.errorFieldNotFoundTmpl':  { key: 'stage.set.errorFieldNotFoundTmpl',  zh: '错误：在 {stageId} 的 status.md 中未找到「状态」字段', en: '' },
  'set.updatedTmpl':             { key: 'stage.set.updatedTmpl',             zh: '✓ 已更新 {stageId} 状态: → {status}',     en: '' },
  'task.errorMutualExclusive':   { key: 'stage.task.errorMutualExclusive',   zh: '错误：必须指定 --done 或 --undone（二者互斥）', en: '' },
  'task.errorInvalidTaskNo':     { key: 'stage.task.errorInvalidTaskNo',     zh: '错误：任务编号必须为正整数',                en: '' },
  'task.errorTaskNotFoundTmpl':  { key: 'stage.task.errorTaskNotFoundTmpl',  zh: '错误：在 {stageId} 的 status.md 中未找到「任务{taskNo}」', en: '' },
  'task.done':                   { key: 'stage.task.done',                   zh: '✓ 已勾选',                                en: '' },
  'task.undone':                 { key: 'stage.task.undone',                 zh: '○ 已取消勾选',                             en: '' },
  'task.taskListTmpl':           { key: 'stage.task.taskListTmpl',           zh: '任务列表 ({done}/{total} 完成)',           en: '' },
  'task.taskItemTmpl':           { key: 'stage.task.taskItemTmpl',           zh: '任务{number}: {desc}',                     en: '' },
  'task.blockedByTmpl':          { key: 'stage.task.blockedByTmpl',          zh: '阻塞原因: {reason}',                       en: '' },
  'task.actionLabelTmpl':        { key: 'stage.task.actionLabelTmpl',        zh: '{label} {stageId} 任务{taskNo}',           en: '' },
};

/* ==================== plan 域：计划命令 ==================== */
export const plan: I18nDomain = {
  'stage.createdTmpl':           { key: 'plan.stage.createdTmpl',           zh: '已创建阶段: {name}',                       en: '' },
  'stage.empty':                 { key: 'plan.stage.empty',                 zh: '暂无工作阶段',                            en: '' },
  'scheme.createdTmpl':          { key: 'plan.scheme.createdTmpl',          zh: '已创建操作方案: {opId}（{stage}）',        en: '' },
  'scheme.empty':                { key: 'plan.scheme.empty',                zh: '暂无操作方案',                            en: '' },
};

/* ==================== knowledge 域：知识库命令 ==================== */
export const knowledge: I18nDomain = {
  'list.empty':                      { key: 'knowledge.list.empty',                      zh: '暂无知识条目',                            en: '' },
  'list.enabled':                    { key: 'knowledge.list.enabled',                    zh: '启用',                                   en: '' },
  'list.disabled':                   { key: 'knowledge.list.disabled',                   zh: '禁用',                                   en: '' },
  'add.errorInvalidCategoryTmpl':    { key: 'knowledge.add.errorInvalidCategoryTmpl',    zh: '错误：无效分类 "{category}"，有效值：{valid}', en: '' },
  'add.errorNoContent':              { key: 'knowledge.add.errorNoContent',              zh: '错误：请使用 --content 提供内容，或通过管道提供内容。', en: '' },
  'add.errorEmptyContent':           { key: 'knowledge.add.errorEmptyContent',           zh: '错误：内容不能为空。',                    en: '' },
  'add.okTmpl':                      { key: 'knowledge.add.okTmpl',                      zh: '✓ 已添加知识条目: [{category}] {title}',   en: '' },
  'search.noResultsTmpl':            { key: 'knowledge.search.noResultsTmpl',            zh: '未找到与 "{query}" 相关的知识条目。',      en: '' },
  'search.offsetOutOfBoundsTmpl':    { key: 'knowledge.search.offsetOutOfBoundsTmpl',    zh: '（偏移量 {offset}，已越界）',              en: '' },
  'search.foundTmpl':                { key: 'knowledge.search.foundTmpl',                zh: '找到 {n} 条匹配',                         en: '' },
  'index.categoryOverview':          { key: 'knowledge.index.categoryOverview',          zh: '=== 分类概览 ===',                         en: '' },
  'index.noCategories':              { key: 'knowledge.index.noCategories',              zh: '（无分类）',                              en: '' },
  'index.recentUpdates':             { key: 'knowledge.index.recentUpdates',             zh: '=== 最近更新 ===',                         en: '' },
  'index.noUpdates':                 { key: 'knowledge.index.noUpdates',                 zh: '暂无更新记录。',                          en: '' },

  // knowledge list 表头列名
  'list.colCategory':     { key: 'knowledge.list.colCategory',     zh: '分类', en: '' },
  'list.colTitle':        { key: 'knowledge.list.colTitle',        zh: '标题', en: '' },
  'list.colDate':         { key: 'knowledge.list.colDate',         zh: '日期', en: '' },

  // knowledge index 表头列名
  'index.colDate':        { key: 'knowledge.index.colDate',        zh: '日期', en: '' },
  'index.colCategory':    { key: 'knowledge.index.colCategory',    zh: '分类', en: '' },
  'index.colTitle':       { key: 'knowledge.index.colTitle',       zh: '标题', en: '' },
};

/* ==================== archive 域：归档命令 ==================== */
export const archive: I18nDomain = {
  'errorArchiveFailedTmpl':      { key: 'archive.errorArchiveFailedTmpl',      zh: '错误：归档失败，请确认阶段 "{stage}" 存在且 flow.json 已初始化。', en: '' },
  'okTmpl':                      { key: 'archive.okTmpl',                      zh: '✓ 阶段已归档: {stage}',                     en: '' },
  'opsCount':                    { key: 'archive.opsCount',                    zh: '操作数',                                  en: '' },
  'reviewsCount':                { key: 'archive.reviewsCount',                zh: '审查条目数',                              en: '' },
  'knowledgeExtracts':           { key: 'archive.knowledgeExtracts',           zh: '知识提取',                                en: '' },
  'archivePath':                 { key: 'archive.archivePath',                 zh: '归档文件',                                en: '' },
};

/* ==================== roadmap 域：路线图命令 ==================== */
export const roadmap: I18nDomain = {};

/* ==================== view 域：审查视图命令 ==================== */
export const view: I18nDomain = {
  'list.empty':                    { key: 'view.list.empty',                    zh: '暂无审查条目',                            en: '' },
  'list.filedBy':                  { key: 'view.list.filedBy',                  zh: '提交人',                                 en: '' },
  'list.filedAt':                  { key: 'view.list.filedAt',                  zh: '时间',                                   en: '' },
  'add.errorInvalidPriorityTmpl':  { key: 'view.add.errorInvalidPriorityTmpl',  zh: '错误：无效的优先级 "{priority}"，可选值：high / medium / low', en: '' },
  'add.okTmpl':                    { key: 'view.add.okTmpl',                    zh: '✓ 审查条目已添加: {id} ({op}) — {title}', en: '' },
  'accept.okTmpl':                 { key: 'view.accept.okTmpl',                 zh: '✓ 审查条目已验收: {id} → closed',         en: '' },
  'accept.errorNotFoundTmpl':      { key: 'view.accept.errorNotFoundTmpl',      zh: '错误：未找到审查条目 {id}',                en: '' },
};

/* ==================== instructions 域：说明命令 ==================== */
export const instructions: I18nDomain = {};

/* ==================== help 域：命令帮助文本（--help 输出用语） ==================== */
export const help: I18nDomain = {
  // openfeel 顶层
  'openfeel':              { key: 'help.openfeel',              zh: 'AI Agent 开发流程治理 CLI 工具', en: '' },
  'openfeel.version':      { key: 'help.openfeel.version',      zh: '输出版本号',                      en: '' },

  // init
  'init':                  { key: 'help.init',                  zh: '初始化项目工作区，创建 .openfeel/ 目录结构和配置文件', en: '' },
  'init.demo':             { key: 'help.init.demo',             zh: '创建带示例骨架的项目（NumKit 风格）', en: '' },
  'init.lang':             { key: 'help.init.lang',             zh: 'Agent 提示词语言（zh-CN 或 en），非交互环境默认 zh-CN', en: '' },

  // update
  'update':                { key: 'help.update',                zh: '部署 OpenFeel 适配文件到目标项目（无参数时交互式选择工具）', en: '' },
  'update.lang':           { key: 'help.update.lang',           zh: 'Agent prompt language (zh-CN or en)', en: '' },
  'update.force':          { key: 'help.update.force',          zh: '跳过 AGENTS.md 覆盖确认，直接覆盖', en: '' },

  // flow
  'flow':                  { key: 'help.flow',                  zh: '流水线状态管理', en: '' },
  'flow.status':           { key: 'help.flow.status',           zh: '显示流水线状态摘要', en: '' },
  'flow.status.verbose':   { key: 'help.flow.status.verbose',   zh: '增强输出：配置级联、最近状态变更、下游 Agent 就绪状态', en: '' },
  'flow.status.lines':     { key: 'help.flow.status.lines',     zh: '最近状态变更条数（默认 5）', en: '' },
  'flow.overview':         { key: 'help.flow.overview',         zh: '全状态可视化视图（/opfx:status 的后端实现）', en: '' },
  'flow.current':          { key: 'help.flow.current',          zh: '显示当前阶段和操作', en: '' },
  'flow.metrics':          { key: 'help.flow.metrics',          zh: '展示 Agent 性能指标', en: '' },
  'flow.stage':            { key: 'help.flow.stage',            zh: '阶段管理', en: '' },
  'flow.stage.add':        { key: 'help.flow.stage.add',        zh: '新增流水线阶段', en: '' },
  'flow.advance':          { key: 'help.flow.advance',          zh: '推进流水线阶段', en: '' },
  'flow.advance.op':       { key: 'help.flow.advance.op',       zh: '操作 ID（如 stage-01.op-001），仅用于日志/展示', en: '' },
  'flow.advance.to':       { key: 'help.flow.advance.to',       zh: '目标阶段（如 exec_running）', en: '' },
  'flow.advance.stage':    { key: 'help.flow.advance.stage',    zh: '阶段 ID（如 stage-03），必须指定', en: '' },
  'flow.advance.force':    { key: 'help.flow.advance.force',    zh: '强制执行（跳过非法 phase 校验和阶段跳跃检查，但不可绕过 REV 阻塞检查）', en: '' },
  'flow.attempt':          { key: 'help.flow.attempt',          zh: '记录操作执行结果', en: '' },
  'flow.attempt.op':       { key: 'help.flow.attempt.op',       zh: '操作 ID（如 stage-01.op-001）', en: '' },
  'flow.attempt.result':   { key: 'help.flow.attempt.result',   zh: '执行结果（pass 或 fail）', en: '' },
  'flow.log':              { key: 'help.flow.log',              zh: '显示最近操作日志', en: '' },
  'flow.log.last':         { key: 'help.flow.log.last',         zh: '显示最近 n 条（默认 10）', en: '' },
  'flow.review':           { key: 'help.flow.review',           zh: '管理审查条目', en: '' },
  'flow.review.add':       { key: 'help.flow.review.add',       zh: '添加审查条目', en: '' },
  'flow.review.add.op':    { key: 'help.flow.review.add.op',    zh: '操作 ID（如 stage-01.op-001）', en: '' },
  'flow.review.add.title': { key: 'help.flow.review.add.title', zh: '审查标题', en: '' },
  'flow.review.add.autoFix':   { key: 'help.flow.review.add.autoFix',   zh: '自动修复说明，设置后跳过 scheme_pending 直接推进到 exec_running', en: '' },
  'flow.review.add.blocking':  { key: 'help.flow.review.add.blocking',  zh: '是否阻塞流水线（默认 true）', en: '' },
  'flow.review.resolve':   { key: 'help.flow.review.resolve',   zh: '解决审查条目', en: '' },
  'flow.retry':            { key: 'help.flow.retry',            zh: '查询操作的重试状态', en: '' },
  'flow.retry.op':         { key: 'help.flow.retry.op',         zh: '操作 ID（如 stage-01.op-001）', en: '' },
  'flow.repair':           { key: 'help.flow.repair',           zh: '自动检测并修复 flow.json 中的常见问题', en: '' },
  'flow.repair.dryRun':    { key: 'help.flow.repair.dryRun',    zh: '仅检测不修复', en: '' },
  'flow.repair.backup':    { key: 'help.flow.repair.backup',    zh: '修复前备份为 .bak', en: '' },
  'flow.migrate':          { key: 'help.flow.migrate',          zh: '将旧版 flow.json（v4.0 全局 phase）迁移到新版格式（v4.1 阶段级 phase）', en: '' },
  'flow.migrate.dryRun':   { key: 'help.flow.migrate.dryRun',   zh: '仅检测预览，不实际写入文件', en: '' },
  'flow.migrate.noBackup': { key: 'help.flow.migrate.noBackup', zh: '跳过 .bak 文件生成（默认生成 flow.json.v4.0.bak）', en: '' },
  'flow.health':           { key: 'help.flow.health',           zh: '全面健康检查 flow.json / 跨文件一致性 / 僵尸状态 / config.yaml 等', en: '' },
  'flow.health.quick':     { key: 'help.flow.health.quick',     zh: '仅检查关键项（phase/current 合法性，跳过其他检查）', en: '' },
  'flow.checkpoint':       { key: 'help.flow.checkpoint',       zh: 'Checkpoint 快照管理（phase 推进时自动保存 flow.json 快照）', en: '' },
  'flow.checkpoint.list':  { key: 'help.flow.checkpoint.list',  zh: '列出所有（或指定阶段的）Checkpoint 快照', en: '' },
  'flow.checkpoint.restore':      { key: 'help.flow.checkpoint.restore',      zh: '从 Checkpoint 快照恢复 flow.json（覆盖当前文件，需 --force 确认）', en: '' },
  'flow.checkpoint.restore.force':{ key: 'help.flow.checkpoint.restore.force', zh: '确认恢复操作（覆盖当前 flow.json）', en: '' },
  'flow.recover':          { key: 'help.flow.recover',          zh: '跨会话上下文恢复：输出流水线状态、阻塞原因和待处理任务', en: '' },
  'flow.wizard':           { key: 'help.flow.wizard',           zh: '交互式流水线向导，逐步推进阶段', en: '' },

  // config
  'config.get-lang':       { key: 'help.config.get-lang',       zh: '显示全局默认语言', en: '' },
  'config.set-lang':       { key: 'help.config.set-lang',       zh: '修改全局默认语言（zh-CN 或 en）', en: '' },
  'config.list-projects':  { key: 'help.config.list-projects',  zh: '列出所有已记录的项目路径→语言映射', en: '' },
  'config.get':            { key: 'help.config.get',            zh: '读取配置项的值（项目配置；--global 时读取全局 profile）', en: '' },
  'config.get.global':     { key: 'help.config.get.global',     zh: '操作全局 profile（~/.config/openfeel/profile.yaml）', en: '' },
  'config.set':            { key: 'help.config.set',            zh: '设置配置项的值（项目配置；--global 时写入全局 profile）', en: '' },
  'config.set.global':     { key: 'help.config.set.global',     zh: '操作全局 profile（~/.config/openfeel/profile.yaml）', en: '' },

  // project
  'project':               { key: 'help.project',               zh: '项目管理与概览', en: '' },
  'project.overview':      { key: 'help.project.overview',      zh: '实时扫描项目结构，输出结构化概览', en: '' },

  // plan
  'plan':                  { key: 'help.plan',                  zh: '计划管理', en: '' },
  'plan.stage':            { key: 'help.plan.stage',            zh: '工作阶段管理', en: '' },
  'plan.stage.add':        { key: 'help.plan.stage.add',        zh: '添加工作阶段', en: '' },
  'plan.stage.list':       { key: 'help.plan.stage.list',       zh: '列出所有工作阶段', en: '' },
  'plan.scheme':           { key: 'help.plan.scheme',           zh: '操作方案管理', en: '' },
  'plan.scheme.create':    { key: 'help.plan.scheme.create',    zh: '创建操作方案', en: '' },
  'plan.scheme.list':      { key: 'help.plan.scheme.list',      zh: '列出操作方案（可选按阶段过滤）', en: '' },

  // stage
  'stage':                 { key: 'help.stage',                 zh: '工作阶段状态管理（status.md 原子操作）', en: '' },
  'stage.status':          { key: 'help.stage.status',          zh: '查看阶段状态（无参数时列出所有阶段）', en: '' },
  'stage.set':             { key: 'help.stage.set',             zh: '设置阶段状态字段（原子更新，保留其余内容不变）', en: '' },
  'stage.set.status':      { key: 'help.stage.set.status',      zh: '状态值（如 exec_running）', en: '' },
  'stage.task':            { key: 'help.stage.task',            zh: '勾选或取消任务 checkbox', en: '' },
  'stage.task.done':       { key: 'help.stage.task.done',       zh: '标记任务为已完成', en: '' },
  'stage.task.undone':     { key: 'help.stage.task.undone',     zh: '标记任务为未完成', en: '' },

  // view
  'view':                  { key: 'help.view',                  zh: '审查条目管理', en: '' },
  'view.list':             { key: 'help.view.list',             zh: '列出审查条目', en: '' },
  'view.list.op':          { key: 'help.view.list.op',          zh: '按操作 ID 过滤', en: '' },
  'view.add':              { key: 'help.view.add',              zh: '添加审查条目', en: '' },
  'view.add.op':           { key: 'help.view.add.op',           zh: '操作 ID（如 stage-01.op-001）', en: '' },
  'view.add.title':        { key: 'help.view.add.title',        zh: '审查标题', en: '' },
  'view.add.priority':     { key: 'help.view.add.priority',     zh: '优先级（high/medium/low，默认 medium）', en: '' },
  'view.accept':           { key: 'help.view.accept',           zh: '验收审查条目（标记为 closed）', en: '' },

  // knowledge
  'knowledge':             { key: 'help.knowledge',             zh: '知识库管理', en: '' },
  'knowledge.list':        { key: 'help.knowledge.list',        zh: '列出知识条目', en: '' },
  'knowledge.list.type':   { key: 'help.knowledge.list.type',   zh: '按分类过滤', en: '' },
  'knowledge.add':         { key: 'help.knowledge.add',         zh: '添加知识条目', en: '' },
  'knowledge.add.content': { key: 'help.knowledge.add.content', zh: '条目内容（也可通过管道 stdin 传入）', en: '' },
  'knowledge.search':      { key: 'help.knowledge.search',      zh: '搜索知识库', en: '' },
  'knowledge.search.limit':  { key: 'help.knowledge.search.limit',  zh: '返回结果数量上限（默认 10）', en: '' },
  'knowledge.search.offset': { key: 'help.knowledge.search.offset', zh: '结果偏移量（默认 0）', en: '' },
  'knowledge.index':       { key: 'help.knowledge.index',       zh: '显示知识库索引概览', en: '' },

  // archive
  'archive':               { key: 'help.archive',               zh: '归档指定阶段（汇总产出、生成摘要、提取知识）', en: '' },

  // roadmap
  'roadmap':               { key: 'help.roadmap',               zh: '分期大纲管理', en: '' },
  'roadmap.create':        { key: 'help.roadmap.create',        zh: '创建分期大纲（版本号如 1.0、2.0）', en: '' },
  'roadmap.show':          { key: 'help.roadmap.show',          zh: '显示分期大纲内容（不传版本则列出所有）', en: '' },

  // instructions
  'instructions':          { key: 'help.instructions',          zh: '为指定 artifact 生成结构化指令（XML 或 JSON）', en: '' },
  'instructions.change':   { key: 'help.instructions.change',   zh: '变更名称（如 feat-login）', en: '' },
  'instructions.json':     { key: 'help.instructions.json',     zh: '输出 JSON 格式而非 XML', en: '' },
  'instructions.schema':   { key: 'help.instructions.schema',   zh: 'Schema 名称（默认 spec-driven）', en: '' },
};

/* ==================== config 域：配置管理命令 ==================== */
export const config: I18nDomain = {
  'get.lang':                { key: 'config.get.lang',                zh: '全局语言：{lang}',                     en: '' },
  'set.ok':                  { key: 'config.set.ok',                  zh: '全局语言已设置为：{lang}',              en: '' },
  'set.invalidLang':         { key: 'config.set.invalidLang',         zh: '无效的语言值 "{val}"，仅支持 zh-CN 和 en', en: '' },
  'list.title':              { key: 'config.list.title',              zh: '已记录的项目语言映射：',                 en: '' },
  'list.empty':              { key: 'config.list.empty',              zh: '（暂无记录的项目）',                     en: '' },
  'list.item':               { key: 'config.list.item',               zh: '  {path} → {lang}',                     en: '' },
  'get.result':              { key: 'config.get.result',              zh: '{key}：{value}',                          en: '' },
  'get.noProject':           { key: 'config.get.noProject',           zh: '项目配置读取失败：{err}',                  en: '' },
  'get.globalProfileNotFound': { key: 'config.get.globalProfileNotFound', zh: '全局 profile 未设置（使用默认值）',       en: '' },
  'get.globalKeyNotFound':   { key: 'config.get.globalKeyNotFound',   zh: '{key}：未设置',                            en: '' },
  'get.globalResult':        { key: 'config.get.globalResult',        zh: '{key}: {value}',                           en: '' },
  'set.valueOk':             { key: 'config.set.valueOk',             zh: '{key} 已设置为：{value}',                 en: '' },
  'set.invalidKey':          { key: 'config.set.invalidKey',          zh: '无效的配置键 "{val}"，当前仅支持：{keys}', en: '' },
  'set.invalidValue':        { key: 'config.set.invalidValue',        zh: '无效的值 "{val}"。{key} 仅支持：{values}', en: '' },
  'set.error':               { key: 'config.set.error',               zh: '项目配置写入失败：{err}',                  en: '' },
  'set.globalInvalidKey':    { key: 'config.set.globalInvalidKey',    zh: '无效的全局配置键 "{val}"',                en: '' },
  'set.globalInvalidValue':  { key: 'config.set.globalInvalidValue',  zh: '无效的值 "{val}"。{key} 仅支持：{values}', en: '' },
  'set.globalValueOk':       { key: 'config.set.globalValueOk',       zh: '✓ 全局配置已设置：{key} = {value}',       en: '' },
  'set.globalAllowedKeys':   { key: 'config.set.globalAllowedKeys',   zh: '支持的全局配置键：{keys}',                en: '' },
};

/* ==================== 聚合导出 ==================== */
/** 所有功能域的聚合数组（供 i18n.ts 构建 Map 使用） */
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
