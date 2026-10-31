/**
 * plan 命令组注册
 * openfeel plan stage add|list + scheme create|list
 */
import { Command } from 'commander';
import { addStage, listStages } from '../core/plan/stage.js';
import type { StageSkeletonOverrides } from '../core/plan/stage.js';
import { createScheme, createSchemesFromTasks, listSchemes, removeScheme, publishScheme, renameScheme, registerSchemes } from '../core/plan/scheme.js';
import { validateStageId, suggestStageId, normalizeStageId, isArchivedVersionOf, parseStageId } from '../core/plan/path.js';
import { t, getCliLang } from '../core/i18n.js';
import { enforcePreflightOrFail } from './shared/preflight-gate.js';
import { StageDirConflictError, StageDirOccupiedError, FlowManager, detectFillState } from '../core/flow-manager.js';
import { formatStageOccupiedError } from './shared/errors.js';
import { getConfigFieldLegalValues, type WorkflowMode } from '../core/config.js';
import { withSchemaVersion, emitJson } from './shared/json-output.js';

export function registerPlanCommand(program: Command): void {
  const plan = program
    .command('plan')
    .description('计划管理');

  // ── plan stage 子命令组 ──
  const stageCmd = plan
    .command('stage')
    .description('工作阶段管理');

  // plan stage add <name>
  stageCmd
    .command('add')
    .description('添加工作阶段（完整入口：建目录 + overview/status + 注册 flow.json；仅注册请用 openfeel flow stage add）')
    .argument('<name>', '阶段 ID（如 stage-01 或 v1.0.0-stage-01）')
    .option('--deps <ids...>', '依赖阶段 ID 列表（空格或逗号分隔，如 --deps a b 或 --deps a,b）')
    .option('--tasks <items...>', '初始任务列表（空格或逗号分隔，生成到 status.md）')
    .option('--exec-mode <mode>', '执行模式（manual | auto），覆盖 config 默认')
    .option('--auto-advance <value>', '自动推进（enabled | disabled），覆盖 config 默认')
    .option('--workflow-mode <mode>', '工作流模式（full | fast | general），覆盖 config 默认')
    .action((name: string, options: { deps?: string[]; tasks?: string[]; execMode?: string; autoAdvance?: string; workflowMode?: string }) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      // 非法 stageId 统一报错 + 建议名（op-002 校验底座）
      const v = validateStageId(name);
      if (!v.ok) {
        console.error(t('common.stageIdInvalidTmpl', lang, { input: name }));
        console.error(t('common.stageIdSuggestTmpl', lang, { suggest: suggestStageId(projectPath, name) }));
        process.exit(1);
        return;
      }

      // 显式初值值域校验（schema 派生；非法 → exit 1 且不建阶段）
      if (options.execMode !== undefined) {
        const allowed = getConfigFieldLegalValues('execution_mode') ?? [];
        if (!allowed.includes(options.execMode)) {
          console.error(t('stage.set.invalidValueTmpl', lang, { field: '执行模式', value: options.execMode, allowed: allowed.join(', ') }));
          process.exit(1);
          return;
        }
      }
      if (options.autoAdvance !== undefined) {
        const allowed = getConfigFieldLegalValues('auto_advance') ?? [];
        if (!allowed.includes(options.autoAdvance)) {
          console.error(t('stage.set.invalidValueTmpl', lang, { field: '自动推进', value: options.autoAdvance, allowed: allowed.join(', ') }));
          process.exit(1);
          return;
        }
      }
      if (options.workflowMode !== undefined) {
        const allowed = getConfigFieldLegalValues('workflow_mode') ?? [];
        if (!allowed.includes(options.workflowMode)) {
          // 非法值 → exit 1 且不建阶段
          console.error(t('stage.set.invalidValueTmpl', lang, { field: '工作流模式', value: options.workflowMode, allowed: allowed.join(', ') }));
          process.exit(1);
          return;
        }
      }
      if (options.workflowMode === 'general') {
        // 载体制约束：general 仅需求级合法（阶段级写入面拒绝；零写盘）
        console.error(t('common.generalOnlyRequirement', lang));
        process.exit(1);
        return;
      }

      // 兼容 --deps a,b 与 --deps a b：逐项按逗号再切分、去空
      const deps = (options.deps ?? [])
        .flatMap((d) => d.split(','))
        .map((s) => s.trim())
        .filter(Boolean);
      // N6-2：--tasks 解析与 --deps 对齐（空格/逗号两种写法）
      const tasks = (options.tasks ?? [])
        .flatMap((d) => d.split(','))
        .map((s) => s.trim())
        .filter(Boolean);

      // B2 修复（stage-80 适配）：校验 deps ⊆ 已注册 stages（短名/完整名按 normalizeStageId 归一化比较）
      if (deps.length > 0) {
        const fmCheck = new FlowManager(projectPath);
        const fmData = fmCheck.isLoaded() ? fmCheck.getData() : undefined;
        // flow.json 未初始化时 registered 为空 → 任何 deps 均判无效（无阶段可依赖）
        const registered = fmData ? Object.keys(fmData.stages) : [];
        const known = new Set(registered.map((k) => normalizeStageId(k) ?? k));
        // 已归档依赖（显式版本前缀 ∧ 版本 ∈ archived_versions）→ 视为已满足（info 提示，REV-80-001）；
        // 恒传原始 d —— 不得传归一化产物（否则短名会被误判为已归档）
        const archivedOk = deps.filter(
          (d) => !known.has(normalizeStageId(d) ?? d) && isArchivedVersionOf(d, fmData?.meta?.archived_versions),
        );
        const invalid = deps.filter(
          (d) => !known.has(normalizeStageId(d) ?? d) && !isArchivedVersionOf(d, fmData?.meta?.archived_versions),
        );
        if (archivedOk.length > 0) {
          console.log(t('plan.stage.archivedDepsTmpl', lang, { deps: archivedOk.join(', ') }));
        }
        if (invalid.length > 0) {
          // 原负例路径：存在未注册且未归档的依赖阶段：列出无效项与已注册阶段后退出码 1（零写盘）
          console.error(t('plan.stage.invalidDepsTmpl', lang, {
            deps: invalid.join(', '),
            known: registered.length > 0 ? registered.join(', ') : t('common.none', lang),
          }));
          process.exit(1);
        }
      }

      // 构造显式覆盖（缺省键不置入，保持「取 config 默认」语义）
      const overrides: StageSkeletonOverrides = {};
      if (options.execMode !== undefined) {
        overrides.executionMode = options.execMode as 'manual' | 'auto';
      }
      if (options.autoAdvance !== undefined) {
        overrides.autoAdvance = options.autoAdvance as 'disabled' | 'enabled';
      }
      if (options.workflowMode !== undefined) {
        overrides.workflowMode = options.workflowMode as WorkflowMode;
      }

      // v1.5.5：建阶段前先读状态（strict 拒绝；warn 仅 TTY 提示）
      // v1.5.6-stage-114：收敛到统一 helper
      if (!enforcePreflightOrFail(projectPath, lang)) return;

      try {
        addStage(
          projectPath,
          name,
          deps.length > 0 ? deps : undefined,
          tasks.length > 0 ? tasks : undefined,
          Object.keys(overrides).length > 0 ? overrides : undefined,
        );
      } catch (err: unknown) {
        // 阶段目录冲突：按类型分流走 i18n 模板（cli/BUG-002 死键消除）
        if (err instanceof StageDirConflictError) {
          console.error(t('common.stageDirConflictTmpl', lang, { stage: err.stage, other: err.other }));
          process.exit(1);
        }
        // v1.5.7：目录已被历史阶段占用 / 该阶段已归档 → 拒绝并提示换号（零写盘）
        if (err instanceof StageDirOccupiedError) {
          for (const line of formatStageOccupiedError(err, lang, projectPath)) {
            console.error(line);
          }
          process.exit(1);
        }
        // 阶段目录冲突等错误：命令层统一展示并退出码 1
        const msg = err instanceof Error ? err.message : String(err);
        console.error(t('common.errorTmpl', lang, { msg }));
        process.exit(1);
      }
      console.log(t('plan.stage.createdTmpl', lang, { name }));
      // v1.3.3 P2-3：回显实际 plan 目录（stageId ↔ 目录映射可对账）
      const created = parseStageId(name);
      if (created) {
        console.log('  ' + t('plan.stage.createdDirTmpl', lang, {
          name: created.fullStageId,
          dir: `.openfeel/plan/${created.series}/${created.stageDir}/`,
        }));
      }
    });

  // plan stage list
  stageCmd
    .command('list')
    .description('列出所有工作阶段')
    .option('--json', t('help.plan.stage.list.json', getCliLang(process.cwd())))
    .action((options: { json?: boolean }) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);

      // JSON 视图 = flow.json 注册阶段的调度视图（与人类「计划目录清单」是两种视图）
      if (options.json) {
        const mgr = new FlowManager(projectPath);
        const data = mgr.isLoaded() ? mgr.getData() : null;
        const stages = data
          ? Object.entries(data.stages).map(([id, stage]) => ({
              id,
              phase: stage.phase ?? null,
              status: stage.status ?? null,
              deps: Array.isArray(stage.deps) ? stage.deps : [],
              // 工作流模式经单点解析（不读 stage.workflow_mode 冗余）
              workflowMode: mgr.resolveStageWorkflowMode(id).value,
              opsTotal: Object.keys(stage.ops ?? {}).length,
              opsDone: Object.values(stage.ops ?? {}).filter((op) => op.state === 'done').length,
            }))
          : [];
        emitJson(withSchemaVersion({ stages, count: stages.length }));
        return;
      }

      const stages = listStages(projectPath);

      if (stages.length === 0) {
        console.log(t('plan.stage.empty', lang));
        return;
      }

      for (const stage of stages) {
        console.log(`- ${stage.name}  ${stage.path}`);
      }
    });

  // ── plan scheme 子命令组 ──
  const schemeCmd = plan
    .command('scheme')
    .description('操作方案管理');

  // ── v1.5.6-stage-114 门前只读预检（REV-009：非法目标必须先报 not-found，再报 preflight）──

  /** op 目标探针结果（门前只读，不构成第二套真值） */
  interface OpProbe {
    /** 已注册到 flow.json（`stage.ops[localOpId]`，与 scheme 写函数的 not-found 分支同源） */
    registered: boolean;
    /** 注册条目的 state（`publishScheme` 的 `not-draft` 判定源；未注册为 undefined） */
    state: string | undefined;
    /** 模板文件可读（`FlowManager.readOpTemplate` 非 null，与 publishScheme / renameScheme 同源） */
    templateReadable: boolean;
    /** stageKey 可归一为 plan 目录（`renameScheme` 在文件检查**之前**先判 parseStageId，失败即 not-found） */
    stageParsed: boolean;
    /** 模板文件的项目相对路径（`renameScheme` 的 file-missing 报告口径） */
    templatePath: string;
  }

  /**
   * op 目标只读探针：把「未注册」「非 draft」「模板文件缺失」「阶段键不可归一」四态分开，
   * 供 commands 在门之前**按写函数同一判定序**给出同一错误（REV-016 / REV-018）。
   * 真值源：`stage.ops[localOpId]` + `FlowManager.readOpTemplate(...)` + `parseStageId(...)`，
   * 全部复用既有导出，不新增判定规则。
   */
  function probeOp(projectPath: string, stageName: string, opId: string): OpProbe {
    const localOpId = opId.includes('.') ? opId.substring(opId.lastIndexOf('.') + 1) : opId;
    const mgr = new FlowManager(projectPath);
    const normalized = normalizeStageId(stageName) ?? stageName;
    const data = mgr.isLoaded() ? mgr.getData() : null;
    const stageData = data ? (data.stages[normalized] ?? data.stages[stageName]) : undefined;
    // 与写函数同一 stageKey 口径（已注册全名优先，否则用入参原值）
    const stageKey = data && data.stages[normalized] ? normalized : stageName;
    const op = stageData?.ops?.[localOpId];
    const registered = op !== undefined;
    const state = op?.state;
    const templateReadable = mgr.isLoaded() ? mgr.readOpTemplate(stageKey, localOpId) !== null : false;
    const parsed = parseStageId(stageKey);
    const templatePath = parsed
      ? `.openfeel/plan/${parsed.series}/${parsed.stageDir}/ops/${localOpId}.md`
      : '';
    return { registered, state, templateReadable, stageParsed: parsed !== null, templatePath };
  }

  /**
   * `plan scheme remove` 的目标只认**注册键**（`removeScheme` 的 not-found 分支即 `stage.ops[localOpId]`）。
   * 模板文件缺失但注册键存在（孤儿 op）**仍允许注销**（N1-1 孤儿用例）；「有文件无注册键」属未注册 → not-found
   * （REV-017：不把遮蔽面扩到文件系统）。
   */
  function isRemovableOp(projectPath: string, stageName: string, opId: string): boolean {
    return probeOp(projectPath, stageName, opId).registered;
  }

  // plan scheme create <stage> <title>
  // plan scheme create <stage> <title> [--draft]
  // plan scheme create <stage> --from-tasks  （机械铺 op 骨架 + ops/deps.yaml 占位）
  schemeCmd
    .command('create')
    .description('创建操作方案')
    .argument('<stage>', '阶段 ID（如 stage-01 或 v1.0.0-stage-01）')
    .argument('[title]', '方案标题（使用 --from-tasks 时省略）')
    .option('--draft', '以 draft（未发布）状态创建；填充后需 plan scheme publish 发布')
    .option('--from-tasks', '从阶段任务表机械生成 ops/op-NNN.md 骨架 + ops/deps.yaml 占位（不调用任何 Agent）')
    .action((stage: string, title: string | undefined, options: { draft?: boolean; fromTasks?: boolean }) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);

      // --from-tasks：机械铺（无 Agent 调用、无隐式副作用）
      if (options.fromTasks) {
        // 互斥校验：--from-tasks 不接受 title（标题由任务行派生）
        if (title !== undefined) {
          console.error(t('plan.scheme.create.fromTasksMutualTmpl', lang));
          process.exit(1);
          return;
        }
        // v1.5.6-stage-114：写前 preflight（`STATUS_NOT_FOUND` 属读 status.md 的写函数内部状态 → 保留遮蔽，§3.4）
        if (!enforcePreflightOrFail(projectPath, lang)) return;
        try {
          const r = createSchemesFromTasks(projectPath, stage);
          if (r.created.length === 0) {
            console.log(t('plan.scheme.fromTasks.emptyTmpl', lang, { stage }));
          } else {
            console.log(t('plan.scheme.fromTasks.okTmpl', lang, {
              count: String(r.created.length),
              ops: r.created.join(', '),
              skipped: String(r.skippedTaskNos.length),
              stage,
            }));
          }
          return;
        } catch (err) {
          // 错误路径：status.md 缺失 → 阶段未找到文案；其余 → 通用错误
          const msg = err instanceof Error ? err.message : String(err);
          if (msg === 'STATUS_NOT_FOUND') {
            console.error(t('stage.errorStageNotFoundTmpl', lang, { stageId: stage }));
          } else {
            console.error(t('common.errorTmpl', lang, { msg }));
          }
          process.exit(1);
          return;
        }
      }

      // 无 --from-tasks 时 title 必填（原 `<title>` 必填语义的运行时校验）
      if (title === undefined) {
        console.error(t('plan.scheme.create.titleRequiredTmpl', lang));
        process.exit(1);
        return;
      }

      // v1.5.6-stage-114：写前 preflight（title 必填校验已在门前）
      if (!enforcePreflightOrFail(projectPath, lang)) return;
      const opId = createScheme(projectPath, stage, title, {
        draft: options.draft,
        // N3-2：阶段未注册时提示已按注册语义补齐阶段骨架
        onImplicitRegister: (info) => {
          console.log(t('plan.scheme.implicitRegisterTmpl', lang, { stage: info.stage }));
        },
      });
      console.log(t('plan.scheme.createdTmpl', lang, { opId, stage }));
    });

  // plan scheme publish <stage> <opId> — draft → pending（B4-3）
  schemeCmd
    .command('publish')
    .description('将 draft 操作方案发布为执行态（draft → pending）')
    .argument('<stage>', '阶段 ID（如 stage-01 或 v1.0.0-stage-01）')
    .argument('<opId>', '操作方案 ID（如 op-001 或完整 stage.op-001）')
    .action((stage: string, opId: string) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      // v1.5.6-stage-114：op 只读预检先于门（REV-009 / REV-016 / REV-018）。
      // **判定序必须与 `publishScheme` 逐条一致**（core/plan/scheme.ts:727-747）：
      //   ① 未注册（含阶段不存在）→ not-found
      //   ② 已注册但 state !== 'draft' → not-draft（先于模板检查）
      //   ③ draft 且模板不可读 → not-found（写函数 readOpTemplate === null 时同样返回 not-found）
      const probe = probeOp(projectPath, stage, opId);
      if (!probe.registered) {
        console.error(t('plan.scheme.publish.notFoundTmpl', lang, { stage, opId }));
        process.exit(1);
        return;
      }
      if (probe.state !== 'draft') {
        console.error(t('plan.scheme.publish.notDraftTmpl', lang, { opId }));
        process.exit(1);
        return;
      }
      if (!probe.templateReadable) {
        console.error(t('plan.scheme.publish.notFoundTmpl', lang, { stage, opId }));
        process.exit(1);
        return;
      }
      // v1.5.6-stage-114：写前 preflight（strict 拒绝；warn 仅 TTY 提示）
      if (!enforcePreflightOrFail(projectPath, lang)) return;
      const result = publishScheme(projectPath, stage, opId);
      if (result.published) {
        console.log(t('plan.scheme.publish.okTmpl', lang, { opId }));
        return;
      }
      // 错误路径：按原因码分流 i18n 文案 + exit 1
      switch (result.reason) {
        case 'empty-template':
          console.error(t('plan.scheme.publish.emptyTmpl', lang, { opId }));
          break;
        case 'not-draft':
          console.error(t('plan.scheme.publish.notDraftTmpl', lang, { opId }));
          break;
        default:
          console.error(t('plan.scheme.publish.notFoundTmpl', lang, { stage, opId }));
          break;
      }
      process.exit(1);
    });

  // plan scheme rename <stage> <opId> --title "…" — 更新 op 标题（B6-2）
  schemeCmd
    .command('rename')
    .description('更新操作方案标题')
    .argument('<stage>', '阶段 ID（如 stage-01 或 v1.0.0-stage-01）')
    .argument('<opId>', '操作方案 ID（如 op-001 或完整 stage.op-001）')
    .requiredOption('--title <text>', '新标题（必填）')
    .action((stage: string, opId: string, options: { title: string }) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      // 空标题（含全空白）→ 报错 + exit 1
      if (!options.title || options.title.trim() === '') {
        console.error(t('plan.scheme.rename.emptyTitleTmpl', lang));
        process.exit(1);
        return;
      }
      // v1.5.6-stage-114：op 只读预检先于门（REV-009 / REV-016 / REV-018）。
      // **判定序与 `renameScheme` 一致**（core/plan/scheme.ts:797-825）：
      //   ① 未注册 → not-found；② stageKey 不可归一（parseStageId 失败）→ not-found（先于文件检查）；
      //   ③ 模板文件缺失 → file-missing
      const probe = probeOp(projectPath, stage, opId);
      if (!probe.registered) {
        console.error(t('plan.scheme.rename.notFoundTmpl', lang, { stage, opId }));
        process.exit(1);
        return;
      }
      if (!probe.stageParsed) {
        console.error(t('plan.scheme.rename.notFoundTmpl', lang, { stage, opId }));
        process.exit(1);
        return;
      }
      if (!probe.templateReadable) {
        console.error(t('plan.scheme.rename.fileMissingTmpl', lang, { opId, path: probe.templatePath }));
        process.exit(1);
        return;
      }
      // v1.5.6-stage-114：写前 preflight（空标题校验已在门前）
      if (!enforcePreflightOrFail(projectPath, lang)) return;
      const result = renameScheme(projectPath, stage, opId, options.title);
      if (result.renamed) {
        console.log(t('plan.scheme.rename.okTmpl', lang, {
          opId,
          from: result.previousTitle ?? '',
          to: options.title.trim(),
        }));
        return;
      }
      switch (result.reason) {
        case 'title-unchanged':
          console.log(t('plan.scheme.rename.unchangedTmpl', lang, { opId }));
          return;
        case 'file-missing':
          console.error(t('plan.scheme.rename.fileMissingTmpl', lang, { opId, path: result.path ?? '' }));
          process.exit(1);
          return;
        default:
          console.error(t('plan.scheme.rename.notFoundTmpl', lang, { stage, opId }));
          process.exit(1);
          return;
      }
    });

  // plan scheme list [stage]
  schemeCmd
    .command('list')
    .description('列出操作方案（可选按阶段过滤）')
    .argument('[stage]', '阶段名（可选）')
    .option('--json', t('help.plan.scheme.list.json', getCliLang(process.cwd())))
    .action((stage: string | undefined, options: { json?: boolean }) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      const schemes = listSchemes(projectPath, stage);

      // B4-3：draft 标记（便于识别未发布；仅在行尾追加，保持既有字段顺序/输出）
      const draftIds = new Set<string>();
      const fm = new FlowManager(projectPath);
      if (fm.isLoaded()) {
        for (const st of Object.values(fm.getData()!.stages)) {
          const opsMap = st.ops && typeof st.ops === 'object' && !Array.isArray(st.ops) ? st.ops : {};
          for (const [opId, op] of Object.entries(opsMap)) {
            if ((op as { state?: string }).state === 'draft') {
              draftIds.add(opId);
            }
          }
        }
      }

      // JSON 分支须为首行纯 JSON 单文档（filePath 为项目根相对路径）
      if (options.json) {
        emitJson(withSchemaVersion({
          stage: stage ?? null,
          count: schemes.length,
          schemes: schemes.map((s) => ({
            stage: s.stage,
            opId: s.opId,
            title: s.title,
            filePath: s.filePath,
            draft: draftIds.has(s.opId),
            fill: detectFillState(s.content),
          })),
        }));
        return;
      }

      if (schemes.length === 0) {
        console.log(t('plan.scheme.empty', lang));
        return;
      }

      for (const scheme of schemes) {
        const suffix = draftIds.has(scheme.opId) ? ' [draft]' : '';
        console.log(`[${scheme.stage}] ${scheme.opId} — ${scheme.title}${suffix}`);
      }
    });

  // plan scheme remove <stage> <opId> [--force] [--dry-run]
  schemeCmd
    .command('remove')
    .description('注销操作方案（仅从 flow.json 删除注册键，不删除 op 模板文件）')
    .argument('<stage>', '阶段 ID（如 stage-01 或 v1.0.0-stage-01）')
    .argument('<opId>', '操作方案 ID（如 op-001 或完整 stage.op-001）')
    .option('--force', '越过保护校验（op 已 done / 存在 checkpoint 进展）')
    .option('--dry-run', '仅预览，不写盘')
    .action((stage: string, opId: string, options: { force?: boolean; dryRun?: boolean }) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      // v1.5.6-stage-114：op 只读预检先于门（REV-009 / REV-017）——
      // **只认 flow.json 注册键**（`removeScheme` 的 not-found 口径）；文件存在但未注册 → not-found。
      // （模板缺失但注册键存在 = 孤儿 op，仍允许注销，故不因文件缺失而拒绝。）
      if (!isRemovableOp(projectPath, stage, opId)) {
        console.error(t('plan.scheme.remove.notFoundTmpl', lang, { stage, opId }));
        process.exit(1);
        return;
      }
      // v1.5.6-stage-114：写前 preflight（`--dry-run` 零写盘 → 免门，REV-001）
      if (!options.dryRun && !enforcePreflightOrFail(projectPath, lang)) return;
      const result = removeScheme(projectPath, stage, opId, {
        force: options.force,
        dryRun: options.dryRun,
      });

      if (!result.removed) {
        // 错误路径：按原因码分流 i18n 文案
        switch (result.reason) {
          case 'op-done':
            console.error(t('plan.scheme.remove.reasonDone', lang, { opId }));
            break;
          case 'has-checkpoint':
            console.error(t('plan.scheme.remove.reasonCheckpoint', lang, { opId }));
            break;
          default:
            console.error(t('plan.scheme.remove.notFoundTmpl', lang, { stage, opId }));
            break;
        }
        process.exit(1);
        return;
      }

      // dry-run 与正式执行分别输出
      console.log(
        options.dryRun
          ? t('plan.scheme.remove.dryRunTmpl', lang, { opId, stage })
          : t('plan.scheme.remove.okTmpl', lang, { opId, stage }),
      );
      if (result.orphan) {
        console.log(t('plan.scheme.remove.orphanNote', lang));
      }
    });

  // plan scheme register <stage> [opId] [--dry-run] — 补注册未注册的 op 文件（fileOrphans）
  schemeCmd
    .command('register')
    .description('补注册 ops/ 目录中未注册到 flow.json 的操作方案（fileOrphans）')
    .argument('<stage>', '阶段 ID（如 stage-01 或 v1.0.0-stage-01）')
    .argument('[opId]', '操作方案 ID（可选；缺省补注册该阶段全部未注册文件）')
    .option('--dry-run', '仅预览，不写盘')
    .action((stage: string, opId: string | undefined, options: { dryRun?: boolean }) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      // v1.5.6-stage-114：显式 opId 时做只读预检先于门（REV-009 / §12.4：无 opId 的「补注册全部孤儿」
      // 语义下预检会误判，故仅显式分支生效）；`--dry-run` 零写盘 → 免门（REV-001）。
      // 判定与 registerSchemes 的 skipped 口径同源：未注册 ∧ 模板不可读 → not-found
      if (opId !== undefined) {
        const probe = probeOp(projectPath, stage, opId);
        if (!probe.registered && !probe.templateReadable) {
          console.error(t('plan.scheme.publish.notFoundTmpl', lang, { stage, opId }));
          process.exit(1);
          return;
        }
      }
      if (!options.dryRun && !enforcePreflightOrFail(projectPath, lang)) return;
      const result = registerSchemes(projectPath, stage, opId, { dryRun: options.dryRun });

      if (!result.ok) {
        // 阶段未找到 → 复用既有「未找到」键
        console.error(t('plan.scheme.publish.notFoundTmpl', lang, { stage, opId: opId ?? '' }));
        process.exit(1);
        return;
      }
      if (result.skipped.length > 0) {
        // 指定 opId 无对应文件 → 未找到 + exit 1
        console.error(t('plan.scheme.publish.notFoundTmpl', lang, { stage, opId: result.skipped.join(', ') }));
        process.exit(1);
        return;
      }
      if (result.registered.length > 0) {
        const vars = { count: String(result.registered.length), ops: result.registered.join(', '), stage: result.stage };
        console.log(
          result.dryRun
            ? t('plan.scheme.register.dryRunTmpl', lang, vars)
            : t('plan.scheme.register.okTmpl', lang, vars),
        );
        return;
      }
      if (result.noop.length > 0) {
        console.log(t('plan.scheme.register.noopTmpl', lang, { opId: result.noop.join(', ') }));
        return;
      }
      console.log(t('plan.scheme.register.noneTmpl', lang, { stage: result.stage }));
    });
}
