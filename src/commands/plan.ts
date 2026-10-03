/**
 * plan 命令组注册
 * openfeel plan stage add|list + scheme create|list
 */
import { Command } from 'commander';
import { addStage, listStages } from '../core/plan/stage.js';
import type { StageSkeletonOverrides } from '../core/plan/stage.js';
import { createScheme, listSchemes, removeScheme, publishScheme, renameScheme } from '../core/plan/scheme.js';
import { validateStageId, suggestStageId, normalizeStageId } from '../core/plan/path.js';
import { t, getCliLang } from '../core/i18n.js';
import { StageDirConflictError, FlowManager } from '../core/flow-manager.js';
import { getConfigFieldLegalValues } from '../core/config.js';

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
    .action((name: string, options: { deps?: string[]; tasks?: string[]; execMode?: string; autoAdvance?: string }) => {
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

      // B2 修复：校验 deps ⊆ 已注册 stages（短名/完整名按 normalizeStageId 归一化比较）
      if (deps.length > 0) {
        const fmCheck = new FlowManager(projectPath);
        // flow.json 未初始化时 registered 为空 → 任何 deps 均判无效（无阶段可依赖）
        const registered = fmCheck.isLoaded() ? Object.keys(fmCheck.getData()!.stages) : [];
        const known = new Set(registered.map((k) => normalizeStageId(k) ?? k));
        const invalid = deps.filter((d) => !known.has(normalizeStageId(d) ?? d));
        if (invalid.length > 0) {
          // 存在未注册的依赖阶段：列出无效项与已注册阶段后退出码 1
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
        // 阶段目录冲突等错误：命令层统一展示并退出码 1
        const msg = err instanceof Error ? err.message : String(err);
        console.error(t('common.errorTmpl', lang, { msg }));
        process.exit(1);
      }
      console.log(t('plan.stage.createdTmpl', lang, { name }));
    });

  // plan stage list
  stageCmd
    .command('list')
    .description('列出所有工作阶段')
    .action(() => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
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

  // plan scheme create <stage> <title>
  // plan scheme create <stage> <title> [--draft]
  schemeCmd
    .command('create')
    .description('创建操作方案')
    .argument('<stage>', '阶段 ID（如 stage-01 或 v1.0.0-stage-01）')
    .argument('<title>', '方案标题')
    .option('--draft', '以 draft（未发布）状态创建；填充后需 plan scheme publish 发布')
    .action((stage: string, title: string, options: { draft?: boolean }) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
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
    .action((stage?: string) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      const schemes = listSchemes(projectPath, stage);

      if (schemes.length === 0) {
        console.log(t('plan.scheme.empty', lang));
        return;
      }

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
}
