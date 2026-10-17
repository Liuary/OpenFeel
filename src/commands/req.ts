/**
 * req 命令组注册 — 需求流转命令面（stage-82）
 *
 * 职责：注册 `openfeel req` 顶层命令组（10 子命令）与输出呈现。
 * 命令层零业务逻辑：解析 / 校验 / ID 分配 / 写入全部单点在 `src/core/req/`；本文件仅做
 *   「参数解析 → 调用引擎原语 → 错误码→文案映射 → 退出码」。
 * 命令层零校验：状态流转合法性 / 认领占用 / 关联唯一性 / 写命令字段校验一律由引擎单点判定。
 * 模式边界：需求可携带模式属性（`--workflow-mode` 选项 / 传参给引擎）；模式解析与下发单点在引擎与 FlowManager，
 *   本层不做值域 / 载体判定；不依赖归档层；不计算 done / 进度 / 聚合摘要。
 * 退出码：成功 0；校验 / 占用 / 存在性失败 1（恒经 `process.exitCode`）；并发写冲突 2（共享单点）。
 */
import { Command } from 'commander';
import { t, getCliLang } from '../core/i18n.js';
import { FlowManager, isFlowConcurrentError } from '../core/flow-manager.js';
import { type WorkflowMode } from '../core/config.js';
import { handleConcurrentConflict } from './shared/errors.js';
import {
  addRequirement, getRequirement, getRequirements, listRequirements,
  claimRequirement, releaseRequirement, updateRequirement, advanceRequirement, linkRequirement,
  getAllowedNextStatuses, splitRequirement, type RequirementErrorCode,
} from '../core/req/requirement-ops.js';
import { REQ_STATUSES, REQ_ID_PATTERN, type RequirementStatus, type RequirementPriority, type RequirementData } from '../core/req/types.js';
import { writeRequirementBodySkeleton } from '../core/req/body-file.js';
import { computeRequirementAggregate, listLinkedStages } from '../core/req/aggregate.js';
import { withSchemaVersion, emitJson } from './shared/json-output.js';
import { getUserName } from '../core/workspace/identity.js';
import { normalizeStageId } from '../core/plan/path.js';

/** 创建 FlowManager（当前工作目录） */
function createManager(): FlowManager {
  return new FlowManager(process.cwd());
}

/**
 * JSON 失败载荷（legacy 形态）：纯单文档走 stdout（不混 stderr——对齐既有 flow archive 范式），并置退出码 1。
 * `error` 恒 string、既有键序零改动；`errorKind` 恒为末尾键（REV-95-002 / D-95-09）。
 */
function failJson(payload: Record<string, unknown>): void {
  console.log(JSON.stringify({ schemaVersion: 1, ...payload, errorKind: 'refusal' }, null, 2));
  process.exitCode = 1;
}

/**
 * 判定是否走 `--json`：子命令显式 `--json` 或父级命令 `req` 的 `--json`（防御合并）。
 * 注：父级 `req` 当前未声明 `--json`，取值为 `undefined` 不影响本判定。
 */
function asJsonOf(options: { json?: boolean }, command: Command): boolean {
  return options.json === true || command.parent?.opts().json === true;
}

/** 未初始化分流：JSON 走 `no-init` 纯文档；human 走 `common.errorNoInit`；均 exit 1 */
function failNoInit(lang: string, asJson: boolean): void {
  if (asJson) {
    failJson({ error: 'no-init' });
    return;
  }
  console.error(t('common.errorNoInit', lang));
  process.exitCode = 1;
}

/** 需求 ID 格式校验（取 core 常量单点，防 typo） */
function isValidReqId(id: string): boolean {
  return REQ_ID_PATTERN.test(id);
}

/** --into 累积（repeatable option；**本仓首个 repeatable**——既有先例为 variadic `<ids...>`（`flow.ts:665` 选项描述自警「建议置于命令末尾」），其有吞后续参数风险故不采用） */
function collectInto(value: string, previous: string[]): string[] {
  return [...previous, value];
}

/** 引擎错误码 → i18n 文案映射（命令层仅映射，零校验）；未登记码走通用模板兜底 */
function failCode(lang: string, code: RequirementErrorCode, msgs: Partial<Record<RequirementErrorCode, string>>): void {
  console.error(msgs[code] ?? t('common.errorTmpl', lang, { msg: code }));
  process.exitCode = 1;
}

/** 通用错误文案 + 退出码 1（非并发异常统一出口；不 return，由调用方 return） */
function failGeneric(lang: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(t('common.errorTmpl', lang, { msg }));
  process.exitCode = 1;
}

/**
 * 保存并收敛并发：成功返回 true；并发冲突 → 单点 exit 2（不返回）；其他异常 → 通用文案 exit 1 并返回 false。
 */
function saveOrFail(mgr: FlowManager, lang: string): boolean {
  try {
    mgr.save();
    return true;
  } catch (err) {
    if (isFlowConcurrentError(err)) {
      handleConcurrentConflict(err, lang);
    } else {
      failGeneric(lang, err);
    }
    return false;
  }
}

/** `req` 命令组注册入口 */
export function registerReqCommand(program: Command): void {
  const req = program
    .command('req')
    .description('需求管理（需求流转命令组）');

  // ── req add <title> [--target-version <v>] [--priority <p>] ──
  req
    .command('add <title>')
    .description('创建需求（ID 自动分配；正文骨架铺到 .openfeel/requirements/）')
    .option('--target-version <version>', '预估版本（如 v1.3.0）')
    .option('--priority <priority>', '优先级（P0/P1/P2）')
    .option('--workflow-mode <mode>', '工作流模式（full / fast / general；缺省不设置）')
    .action((title: string, options: { targetVersion?: string; priority?: string; workflowMode?: string }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        failNoInit(lang, false);
        return;
      }
      const data = mgr.getData()!;
      try {
        // 运行期值域由引擎单点判定（命令层零校验）；priority / workflow_mode 断言仅编译期
        const created = addRequirement(data, {
          title,
          target_version: options.targetVersion,
          priority: options.priority as RequirementPriority | undefined,
          workflow_mode: options.workflowMode as WorkflowMode | undefined,
        });
        // 正文骨架：严格直传引擎返回本体（禁浅副本）；写失败 → 不 save（flow.json 零变更）
        let bodyPath: string;
        try {
          bodyPath = writeRequirementBodySkeleton(process.cwd(), created);
        } catch (err) {
          failGeneric(lang, err);
          return;
        }
        if (!saveOrFail(mgr, lang)) {
          return;
        }
        console.log(t('req.add.doneTmpl', lang, { id: created.id, title: created.title }));
        console.log(t('req.add.bodyTmpl', lang, { path: bodyPath }));
      } catch (err) {
        // 唯一抛错路径（空 title / 非法 priority / 空 target_version）→ 通用模板 exit 1
        failGeneric(lang, err);
      }
    });

  // ── req list [--status <s>] [--target-version <v>] [--owner <o>] [--json] ──
  req
    .command('list')
    .description('列出需求（可按状态/版本/认领人过滤）')
    .option('--status <status>', '按状态过滤（draft/scheduled/in_progress/done/blocked/cancelled/rejected）')
    .option('--target-version <version>', '按预估版本过滤')
    .option('--owner <owner>', '按认领人过滤')
    .option('--json', '以 JSON 输出 { schemaVersion, requirements }')
    .action((options: { status?: string; targetVersion?: string; owner?: string; json?: boolean }, command: Command) => {
      const lang = getCliLang(process.cwd());
      const asJson = asJsonOf(options, command);
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        failNoInit(lang, asJson);
        return;
      }
      const data = mgr.getData()!;
      // 读命令过滤值域仅取 core 常量防 typo；undefined = 未过滤（不得进非法分支）
      if (options.status !== undefined && !(REQ_STATUSES as readonly string[]).includes(options.status)) {
        if (asJson) {
          failJson({ error: 'invalid-argument', field: 'status', value: options.status, allowed: [...REQ_STATUSES] });
        } else {
          console.error(t('req.list.invalidStatusTmpl', lang, {
            value: options.status,
            allowed: REQ_STATUSES.join(', '),
          }));
          process.exitCode = 1;
        }
        return;
      }
      // 只读保证：不 save / 不 appendLog / 零写盘
      const rows = listRequirements(data, {
        status: options.status as RequirementStatus | undefined,
        target_version: options.targetVersion,
        owner: options.owner,
      });
      if (asJson) {
        // 末位追加关联阶段与进度（既有 RequirementData 键序零改；聚合/关联阶段共用单点实现）
        const requirements = rows.map((r) => {
          const agg = computeRequirementAggregate(data, r.id);
          return {
            ...r,
            linkedStages: listLinkedStages(data, r.id),
            progress: { done: agg.doneCount, total: agg.stageCount },
          };
        });
        emitJson(withSchemaVersion({ requirements }));
        return;
      }
      if (rows.length === 0) {
        console.log(t('req.list.empty', lang));
        return;
      }
      for (const r of rows) {
        console.log(t('req.list.itemTmpl', lang, { id: r.id, status: r.status, title: r.title }));
      }
    });

  // ── req show <id> [--json] ──
  req
    .command('show <id>')
    .description('查看需求详情（关联阶段为原始只读枚举）')
    .option('--json', '以 JSON 输出 { schemaVersion, requirement, stages, parent, children }')
    .action((id: string, options: { json?: boolean }, command: Command) => {
      const lang = getCliLang(process.cwd());
      const asJson = asJsonOf(options, command);
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        failNoInit(lang, asJson);
        return;
      }
      const data = mgr.getData()!;
      if (!isValidReqId(id)) {
        if (asJson) {
          failJson({ error: 'invalid-argument', field: 'id', value: id });
        } else {
          console.error(t('req.invalidIdTmpl', lang, { input: id }));
          process.exitCode = 1;
        }
        return;
      }
      const r = getRequirement(data, id);
      if (!r) {
        if (asJson) {
          failJson({ error: 'not_found', id });
        } else {
          console.error(t('req.err.notFoundTmpl', lang, { id }));
          process.exitCode = 1;
        }
        return;
      }
      // 关联阶段 = 原始只读枚举（零聚合计算 / 零阶段推进字段读取——归后续阶段）
      const stages = Object.entries(data.stages ?? {})
        .filter(([, s]) => (s.requirement_id ?? null) === id)
        .map(([k]) => k);
      // 子需求 = 存储顺序枚举（不额外排序——避免第二排序源；对齐 stages 无排序先例）
      const childRows = getRequirements(data).filter((r) => r.parent_id === id);
      const children = childRows.map((c) => c.id);
      // 父需求 ID **原样回显**（悬空不报错、不做存在性判定——悬空对账职责单点在 requirementHealthItems，REV-87-004①）
      const parent = r.parent_id ?? null;
      if (asJson) {
        console.log(JSON.stringify({ schemaVersion: 1, requirement: r, stages, parent, children }, null, 2));
        return;
      }
      console.log(t('req.show.titleTmpl', lang, { id: r.id, title: r.title }));
      console.log(t('req.show.metaTmpl', lang, {
        status: r.status,
        targetVersion: r.target_version ?? t('common.none', lang),
        priority: r.priority ?? t('common.none', lang),
      }));
      console.log(r.owner
        ? t('req.show.ownerTmpl', lang, { owner: r.owner, claimedAt: r.claimed_at ?? '' })
        : t('req.show.ownerNone', lang));
      console.log(t('req.show.timesTmpl', lang, { created: r.created_at, updated: r.updated_at }));
      console.log(t('req.show.bodyTmpl', lang, { path: r.body_path ?? t('common.none', lang) }));
      console.log(parent !== null
        ? t('req.show.parentTmpl', lang, { parent })
        : t('req.show.parentNone', lang));
      if (childRows.length === 0) {
        console.log(t('req.show.childrenNone', lang));
      } else {
        console.log(t('req.show.childrenLabel', lang));
        for (const c of childRows) {
          console.log(t('req.show.childItemTmpl', lang, { id: c.id, status: c.status, title: c.title }));
        }
      }
      if (stages.length === 0) {
        console.log(t('req.show.stagesNone', lang));
      } else {
        console.log(t('req.show.stagesLabel', lang));
        for (const s of stages) {
          console.log(t('req.show.stageItemTmpl', lang, { stage: s }));
        }
      }
    });

  // ── req claim <id> [--owner <name>] ──
  req
    .command('claim <id>')
    .description('认领需求（占用校验；已被他人认领则拒绝）')
    .option('--owner <owner>', '认领人（缺省：.openfeel/.info.json user → git config user.name）')
    .action((id: string, options: { owner?: string }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        failNoInit(lang, false);
        return;
      }
      const data = mgr.getData()!;
      if (!isValidReqId(id)) {
        console.error(t('req.invalidIdTmpl', lang, { input: id }));
        process.exitCode = 1;
        return;
      }
      // --owner 缺省链：.info.json user → git config user.name → 哨兵 'unknown' 拒绝（禁硬编码）
      let owner = options.owner;
      if (owner === undefined) {
        const resolved = getUserName(process.cwd());
        if (resolved === '' || resolved === 'unknown') {
          console.error(t('req.claim.ownerUnresolvedTmpl', lang));
          process.exitCode = 1;
          return;
        }
        owner = resolved;
      }
      // 返回码分流（命令层仅映射，零校验）：占用 / 终态 / owner 空串均由引擎单点判定
      const r = claimRequirement(data, id, owner);
      if (!r.ok) {
        failCode(lang, r.code, {
          not_found: t('req.err.notFoundTmpl', lang, { id }),
          already_claimed: t('req.err.alreadyClaimedTmpl', lang, { id }),
          invalid_field: t('req.err.invalidFieldTmpl', lang, { id }),
          invalid_status: t('req.claim.terminalTmpl', lang, { id, status: getRequirement(data, id)?.status ?? '' }),
        });
        return;
      }
      if (!r.changed) {
        // 同 owner 幂等：不 save（revision 不变）
        console.log(t('req.claim.idempotentTmpl', lang, { id, owner }));
        return;
      }
      if (!saveOrFail(mgr, lang)) {
        return;
      }
      console.log(t('req.claim.doneTmpl', lang, { id, owner }));
    });

  // ── req release <id> ──
  req
    .command('release <id>')
    .description('释放认领（未认领为 no-op 成功）')
    .action((id: string) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        failNoInit(lang, false);
        return;
      }
      const data = mgr.getData()!;
      if (!isValidReqId(id)) {
        console.error(t('req.invalidIdTmpl', lang, { input: id }));
        process.exitCode = 1;
        return;
      }
      const r = releaseRequirement(data, id);
      if (!r.ok) {
        failCode(lang, r.code, { not_found: t('req.err.notFoundTmpl', lang, { id }) });
        return;
      }
      if (!r.changed) {
        // 未占用 no-op：不 save，恒 exit 0
        console.log(t('req.release.noopTmpl', lang, { id }));
        return;
      }
      if (!saveOrFail(mgr, lang)) {
        return;
      }
      console.log(t('req.release.doneTmpl', lang, { id }));
    });

  // ── req set <id> [--status] [--title] [--target-version] [--priority] ──
  req
    .command('set <id>')
    .description('更新需求字段（白名单；状态流转合法性由引擎判定）')
    .option('--status <status>', '目标状态（合法性与 done 门由引擎判定）')
    .option('--title <title>', '新标题')
    .option('--target-version <version>', '新预估版本')
    .option('--priority <priority>', '新优先级（P0/P1/P2）')
    .option('--workflow-mode <mode>', '新工作流模式（full / fast / general；general 仅限无关联阶段的需求）')
    .action((id: string, options: { status?: string; title?: string; targetVersion?: string; priority?: string; workflowMode?: string }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        failNoInit(lang, false);
        return;
      }
      const data = mgr.getData()!;
      if (!isValidReqId(id)) {
        console.error(t('req.invalidIdTmpl', lang, { input: id }));
        process.exitCode = 1;
        return;
      }
      // 无字段守卫（argument-shape，非业务校验）
      if (options.status === undefined && options.title === undefined
        && options.targetVersion === undefined && options.priority === undefined
        && options.workflowMode === undefined) {
        console.error(t('req.set.noFieldsTmpl', lang));
        process.exitCode = 1;
        return;
      }
      // 命令层零校验：白名单 / 值域 / 流转全由引擎单点判定
      const r = updateRequirement(data, id, {
        status: options.status as RequirementStatus | undefined,
        title: options.title,
        target_version: options.targetVersion,
        priority: options.priority as RequirementPriority | undefined,
        workflow_mode: options.workflowMode as WorkflowMode | undefined,
      });
      if (!r.ok) {
        const current = getRequirement(data, id)?.status ?? '';
        // done 门专用文案（stage-93 BUG-002）：静态表放行 done 而仍被拒 ⇒ 唯一可能是完成门
        const doneGate = options.status === 'done'
          && (getAllowedNextStatuses(current as RequirementStatus) as readonly string[]).includes('done');
        failCode(lang, r.code, {
          not_found: t('req.err.notFoundTmpl', lang, { id }),
          invalid_field: t('req.err.invalidFieldTmpl', lang, { id }),
          invalid_status: doneGate
            ? t('req.err.doneGateTmpl', lang, { id, current })
            : t('req.err.invalidStatusTmpl', lang, {
              id,
              to: options.status ?? '',
              current,
              targets: getAllowedNextStatuses(current as RequirementStatus).join(', '),
            }),
          general_mode_conflict: t('req.err.generalModeConflictTmpl', lang, { id }),
        });
        return;
      }
      if (!r.changed) {
        console.log(t('req.set.noopTmpl', lang, { id }));
        return;
      }
      if (!saveOrFail(mgr, lang)) {
        return;
      }
      // stage-90 T2.3：需求级模式下发（先落盘主变更 → 再下发；单点 syncConfigFieldToStages：status.md 字段 + flow.json 冗余同批）
      if (options.workflowMode !== undefined) {
        const linked = Object.entries(data.stages ?? {})
          .filter(([, s]) => (s.requirement_id ?? null) === id)
          .map(([k]) => normalizeStageId(k) ?? k);
        if (linked.length > 0) {
          const synced = mgr.syncConfigFieldToStages('workflow_mode', options.workflowMode, { onlyStages: linked });
          const wrote = synced.filter((s) => s.result === 'updated' || s.result === 'inserted').length;
          console.log(t('req.set.modeSyncedTmpl', lang, { id, mode: options.workflowMode, count: String(wrote) }));
        }
        // 零关联阶段（含 general 门后）→ 仅更新需求字段，零副作用（不输出下发提示）
      }
      console.log(t('req.set.doneTmpl', lang, { id }));
    });

  // ── req link --stage <stageId> (--requirement <id> | --unlink) ──
  req
    .command('link')
    .description('关联需求到阶段 / 解绑（--requirement 与 --unlink 二选一）')
    .requiredOption('--stage <stageId>', '阶段 ID（stage-NN 或 vX.Y.Z-stage-NN）')
    .option('--requirement <id>', '需求 ID（关联用；与 --unlink 互斥）')
    .option('--unlink', '解除该阶段的需求关联')
    .action((options: { stage: string; requirement?: string; unlink?: boolean }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        failNoInit(lang, false);
        return;
      }
      const data = mgr.getData()!;
      // 互斥守卫（argument-shape）：both / neither 均拒绝
      const hasRequirement = options.requirement !== undefined;
      const hasUnlink = options.unlink === true;
      if (hasRequirement === hasUnlink) {
        console.error(t('req.link.exclusiveTmpl', lang));
        process.exitCode = 1;
        return;
      }
      // 归一单点（仅此一次；禁自写解析 / 不做双键回退）；阶段存在性以引擎为唯一门
      const stageKey = normalizeStageId(options.stage) ?? options.stage;
      let requirementId: string | null = null;
      if (hasRequirement) {
        if (!isValidReqId(options.requirement!)) {
          console.error(t('req.invalidIdTmpl', lang, { input: options.requirement! }));
          process.exitCode = 1;
          return;
        }
        requirementId = options.requirement!;
      }
      const r = linkRequirement(data, stageKey, requirementId);
      if (!r.ok) {
        failCode(lang, r.code, {
          stage_not_found: t('req.err.stageNotFoundTmpl', lang, { stage: stageKey }),
          not_found: t('req.err.notFoundTmpl', lang, { id: requirementId ?? '' }),
          invalid_status: t('req.link.terminalTmpl', lang, {
            id: requirementId ?? '',
            status: requirementId ? (getRequirement(data, requirementId)?.status ?? '') : '',
          }),
          already_linked: t('req.err.alreadyLinkedTmpl', lang, { stage: stageKey }),
          general_mode_conflict: t('req.err.generalTargetTmpl', lang, { id: requirementId ?? '' }),
        });
        return;
      }
      if (!r.changed) {
        console.log(t('req.link.noopTmpl', lang, { stage: stageKey }));
        return;
      }
      if (!saveOrFail(mgr, lang)) {
        return;
      }
      // stage-90 T2.3：需求级模式下发（需求携带 workflow_mode 时经单点同步到关联阶段）
      if (hasRequirement && requirementId) {
        const reqLinked = getRequirement(data, requirementId);
        if (reqLinked?.workflow_mode) {
          const synced = mgr.syncConfigFieldToStages('workflow_mode', reqLinked.workflow_mode, { onlyStages: [stageKey] });
          if (synced.some((s) => s.result === 'updated' || s.result === 'inserted')) {
            console.log(t('req.link.modeSyncedTmpl', lang, { stage: stageKey, mode: reqLinked.workflow_mode }));
          }
        }
      }
      console.log(hasRequirement
        ? t('req.link.doneTmpl', lang, { stage: stageKey, id: requirementId ?? '' })
        : t('req.link.unlinkDoneTmpl', lang, { stage: stageKey }));
    });

  // ── req advance <id> --to <status> ──
  req
    .command('advance <id>')
    .description('显式推进需求状态（合法目标由引擎流转表判定；done：非 general 需求须全部关联阶段 done）')
    .requiredOption('--to <status>', '目标状态（合法目标由引擎判定）')
    .action((id: string, options: { to: string }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        failNoInit(lang, false);
        return;
      }
      const data = mgr.getData()!;
      if (!isValidReqId(id)) {
        console.error(t('req.invalidIdTmpl', lang, { input: id }));
        process.exitCode = 1;
        return;
      }
      // 读当前状态仅供成功文案与失败 targets 渲染（纯读，非校验）
      const before = getRequirement(data, id)?.status;
      // 命令层零校验：合法目标 + done 门均在引擎单点
      const r = advanceRequirement(data, id, options.to as RequirementStatus);
      if (!r.ok) {
        // done 门专用文案（stage-93 BUG-002）：静态表放行 done 而仍被拒 ⇒ 唯一可能是完成门
        const doneGate = options.to === 'done'
          && before !== undefined
          && (getAllowedNextStatuses(before) as readonly string[]).includes('done');
        failCode(lang, r.code, {
          not_found: t('req.err.notFoundTmpl', lang, { id }),
          invalid_status: doneGate
            ? t('req.err.doneGateTmpl', lang, { id, current: before ?? '' })
            : t('req.err.invalidStatusTmpl', lang, {
              id,
              to: options.to,
              current: before ?? '',
              targets: before !== undefined ? getAllowedNextStatuses(before).join(', ') : '',
            }),
        });
        return;
      }
      if (!r.changed) {
        console.log(t('req.advance.noopTmpl', lang, { id, to: options.to }));
        return;
      }
      if (!saveOrFail(mgr, lang)) {
        return;
      }
      console.log(t('req.advance.doneTmpl', lang, { id, from: before ?? '', to: options.to }));
    });

  // ── req split <id> --into <title> [--into <title>...] [--json] ──
  req
    .command('split <id>')
    .description('拆分需求为若干子需求（拆分即发布：子需求入 scheduled）')
    .option('--into <title>', '子需求标题（可重复；至少一项）', collectInto, [] as string[])
    .option('--json', '以 JSON 输出 { schemaVersion, parent, children }')
    .action((id: string, options: { into?: string[]; json?: boolean }, command: Command) => {
      const lang = getCliLang(process.cwd());
      const asJson = asJsonOf(options, command);
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        failNoInit(lang, asJson);
        return;
      }
      const data = mgr.getData()!;
      if (!isValidReqId(id)) {
        if (asJson) {
          failJson({ error: 'invalid-argument', field: 'id', value: id });
        } else {
          console.error(t('req.invalidIdTmpl', lang, { input: id }));
          process.exitCode = 1;
        }
        return;
      }
      // argument-shape 守卫（非业务校验——对齐 req link 互斥守卫先例）
      const into = options.into ?? [];
      if (into.length === 0) {
        if (asJson) {
          failJson({ error: 'invalid-argument', field: 'into' });
        } else {
          console.error(t('req.split.noIntoTmpl', lang));
          process.exitCode = 1;
        }
        return;
      }
      // 命令层零业务校验：父门 / 终态门 / 子项校验 / ID 分配 / 审计全在引擎单点
      const r = splitRequirement(data, id, into.map((title) => ({ title })));
      if (!r.ok) {
        if (asJson) {
          failJson({ error: r.code, id });
          return;
        }
        failCode(lang, r.code, {
          not_found: t('req.err.notFoundTmpl', lang, { id }),
          invalid_status: t('req.split.terminalTmpl', lang, { id, status: getRequirement(data, id)?.status ?? '' }),
          invalid_field: t('req.split.invalidFieldTmpl', lang),
        });
        return;
      }
      // 正文骨架逐条铺（严格直传引擎返回本体，禁浅副本）；任一失败 → 不 save（flow.json 零变更——对齐 req add 先例）
      const bodies: string[] = [];
      try {
        for (const child of r.children) {
          bodies.push(writeRequirementBodySkeleton(process.cwd(), child));
        }
      } catch (err) {
        failGeneric(lang, err);
        return;
      }
      if (!saveOrFail(mgr, lang)) {
        return;
      }
      if (asJson) {
        console.log(JSON.stringify({ schemaVersion: 1, parent: id, children: r.children }, null, 2));
        return;
      }
      console.log(t('req.split.doneTmpl', lang, {
        id, n: String(r.children.length), children: r.children.map((c) => c.id).join(', '),
      }));
      for (let i = 0; i < r.children.length; i += 1) {
        console.log(t('req.split.childTmpl', lang, {
          id: r.children[i].id, title: r.children[i].title, path: bodies[i],
        }));
      }
    });

  // ── req board [--target-version <v>] [--json] ──
  req
    .command('board')
    .description('需求看板（按状态分组；7 组固定顺序）')
    .option('--target-version <version>', '按预估版本过滤')
    .option('--json', '以 JSON 输出 { schemaVersion, groups }')
    .action((options: { targetVersion?: string; json?: boolean }, command: Command) => {
      const lang = getCliLang(process.cwd());
      const asJson = asJsonOf(options, command);
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        failNoInit(lang, asJson);
        return;
      }
      const data = mgr.getData()!;
      // 只读保证：不 save / 不 appendLog / 零写盘
      const rows = listRequirements(data, { target_version: options.targetVersion });
      // 7 组固定顺序 = 状态值域声明序；恒含空组（域外脏状态不渲染）
      const groups = {} as Record<RequirementStatus, RequirementData[]>;
      for (const s of REQ_STATUSES) {
        groups[s] = rows.filter((r) => r.status === s);
      }
      if (asJson) {
        console.log(JSON.stringify({ schemaVersion: 1, groups }, null, 2));
        return;
      }
      for (const s of REQ_STATUSES) {
        console.log(t('req.board.groupTmpl', lang, { status: s, n: String(groups[s].length) }));
        for (const r of groups[s]) {
          let line = t('req.board.itemTmpl', lang, { id: r.id, title: r.title });
          if (r.owner) { line += t('req.board.ownedSuffixTmpl', lang, { owner: r.owner }); }
          console.log(line);
        }
      }
    });

  // ── req next [--owner <name>] [--limit <n>] [--json] ──
  req
    .command('next')
    .description('推荐下一个可接取需求（scheduled 且未认领；按预估版本升序）')
    .option('--owner <owner>', '认领人视角（含该认领人已认领的 scheduled 需求）')
    .option('--limit <n>', '返回候选条数上限（≥1 的整数；缺省 1）')
    .option('--json', '以 JSON 输出 { schemaVersion, requirement }')
    .action((options: { owner?: string; limit?: string; json?: boolean }, command: Command) => {
      const lang = getCliLang(process.cwd());
      const asJson = asJsonOf(options, command);
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        failNoInit(lang, asJson);
        return;
      }
      const data = mgr.getData()!;
      // --limit 解析（REV-87-004② 定稿：判定基准 = **解析后数值**，非「是否传参」——显式 1 与缺省同形态）
      const parsed = options.limit === undefined ? 1 : (/^\d+$/.test(options.limit) ? Number(options.limit) : NaN);
      if (!Number.isInteger(parsed) || parsed < 1) {
        if (asJson) {
          failJson({ error: 'invalid-argument', field: 'limit', value: options.limit ?? '' });
        } else {
          console.error(t('req.next.limitInvalidTmpl', lang, { value: options.limit ?? '' }));
          process.exitCode = 1;
        }
        return;
      }
      const limit = parsed;
      // 只读保证：不 save / 不 appendLog / 零写盘
      const rows = listRequirements(data, { status: 'scheduled' });
      // 候选：无 --owner = scheduled 且未认领；有 --owner = scheduled 且（未认领 ∨ owner === 该认领人）
      const candidates = rows.filter((r) => !r.owner || (options.owner !== undefined && r.owner === options.owner));
      // 排序（冻结）：① 预估版本升序（未指定恒最后）② 创建时间升序 ③ id 升序兜底
      // listRequirements 返回副本数组 → 原地 sort 不污染 flow.json 内存
      candidates.sort((a, b) => {
        const av = a.target_version;
        const bv = b.target_version;
        if (av !== bv) {
          if (av === undefined) { return 1; }
          if (bv === undefined) { return -1; }
          if (av < bv) { return -1; }
          if (av > bv) { return 1; }
        }
        if (a.created_at !== b.created_at) { return a.created_at < b.created_at ? -1 : 1; }
        if (a.id !== b.id) { return a.id < b.id ? -1 : 1; }
        return 0;
      });
      const picked = candidates.slice(0, limit);       // 切片只作用于**已排序**结果——候选池与排序冻结语义零变
      const top = picked[0] ?? null;
      if (asJson) {
        // 只增不改：limit === 1 恒既有两键（显式 1 与缺省一致）；limit > 1 追加 candidates（既有两键逐字）
        console.log(JSON.stringify(limit === 1
          ? { schemaVersion: 1, requirement: top }
          : { schemaVersion: 1, requirement: top, candidates: picked }, null, 2));
        return;
      }
      if (!top) { console.log(t('req.next.empty', lang)); return; }
      if (limit === 1) {
        // 既有单行路径逐字（含 owner 后缀）
        let line = t('req.next.foundTmpl', lang, { id: top.id, status: top.status, title: top.title });
        if (top.owner) { line += t('req.next.ownedSuffixTmpl', lang, { owner: top.owner }); }
        console.log(line);
        return;
      }
      console.log(t('req.next.multiLabel', lang, { n: String(picked.length) }));
      for (const r of picked) {
        let line = t('req.next.itemTmpl', lang, { id: r.id, status: r.status, title: r.title });
        if (r.owner) { line += t('req.next.ownedSuffixTmpl', lang, { owner: r.owner }); }
        console.log(line);
      }
    });
}
