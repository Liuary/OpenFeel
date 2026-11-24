/**
 * req 命令组注册 — 需求流转命令面（stage-82）
 *
 * 职责：注册 `openfeel req` 顶层命令组（15 子命令）与输出呈现。
 * 命令层零业务逻辑：解析 / 校验 / ID 分配 / 写入全部单点在 `src/core/req/`；本文件仅做
 *   「参数解析 → 调用引擎原语 → 错误码→文案映射 → 退出码」。
 * 命令层零校验：状态流转合法性 / 认领占用 / 关联唯一性 / 写命令字段校验一律由引擎单点判定。
 * 模式边界：需求可携带模式属性（`--workflow-mode` 选项 / 传参给引擎）；模式解析与下发单点在引擎与 FlowManager，
 *   本层不做值域 / 载体判定；不依赖归档层；不计算 done / 进度 / 聚合摘要。
 * 退出码：成功 0；校验 / 占用 / 存在性失败 1（恒经 `process.exitCode`）；并发写冲突 2（共享单点）。
 */
import { Command } from 'commander';
import { existsSync, rmSync } from 'node:fs';
import { t, getCliLang } from '../core/i18n.js';
import { enforcePreflightOrFail } from './shared/preflight-gate.js';
import { FlowManager, isFlowConcurrentError, type FlowData } from '../core/flow-manager.js';
import { type WorkflowMode } from '../core/config.js';
import { handleConcurrentConflict } from './shared/errors.js';
import {
  addRequirement, getRequirement, getRequirements, listRequirements,
  claimRequirement, releaseRequirement, updateRequirement, advanceRequirement, linkRequirement,
  getAllowedNextStatuses, splitRequirement, requirementDoneBlocker,
  recordRequirementReview, recordRequirementVerification,
  releaseCheckRequirements, rolloverRequirements, isTerminalRequirementStatus,
  waiveRequirement, revokeRequirementWaiver,
  markRequirementTrivial, clearRequirementTrivial,
  raiseRequirementSeqFloor,
  forceRequirementPlanDeviation,
  forceRequirementBodyWaiver, forceRequirementPlanWaiver, requirementBodyEmptySections,
  type RequirementErrorCode,
} from '../core/req/requirement-ops.js';
import { REQ_STATUSES, REQ_ID_PATTERN, type RequirementStatus, type RequirementPriority, type RequirementData } from '../core/req/types.js';
import { writeRequirementBodySkeleton, updateRequirementBody, importRequirementBodySections, getRequirementBodyPath, RequirementBodyUpdateError } from '../core/req/body-file.js';
import { writeRequirementPlanSkeleton, toRequirementPlanSeed, RequirementPlanFileError } from '../core/req/plan-file.js';
import { computeRequirementAggregate, listLinkedStages } from '../core/req/aggregate.js';
import { stageRequirementIds } from '../core/req/stage-links.js';
import { findArchivedRequirement, listArchivedRequirements, archivedRequirementMaxSeq } from '../core/flow-archive/archive-ops.js';
import { withSchemaVersion, emitJson } from './shared/json-output.js';
import { CLI_ERROR_CODES, getCliErrorSpec, type CliErrorCode } from '../core/errors.js';
import { getUserName } from '../core/workspace/identity.js';
import { normalizeStageId, getRequirementPlanRelPath } from '../core/plan/path.js';
import { getSessionId, resolveActorName } from '../core/session.js';
import { maybeSyncDevStatus } from '../core/dev-status.js';

/** 当前会话标识（写入审查/验证记录，用于人机区分与回溯；v1.5.24 / REQ-049） */
function currentSession(): string {
  return getSessionId({ projectPath: process.cwd() });
}

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

/**
 * 需求 ID 的数值序号（排序用；v1.5.8 / REQ-030）。
 * 解析 `REQ-(\d+)` 后取 int；解析失败返回 null（调用方退回字符串比较——异常 id 不崩）。
 */
function reqIdSeq(id: string): number | null {
  const m = REQ_ID_PATTERN.exec(id);
  if (!m) { return null; }
  const n = Number.parseInt(m[1], 10);
  return Number.isFinite(n) ? n : null;
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

/** 引擎错误码 → 本地化文案（与 {@link failCode} 同源；`--json` 失败出口复用） */
function codeMessage(
  lang: string,
  code: RequirementErrorCode,
  msgs: Partial<Record<RequirementErrorCode, string>>,
): string {
  return msgs[code] ?? t('common.errorTmpl', lang, { msg: code });
}

/**
 * 需求门码 → CLI 稳定错误码（**单点映射**；v1.6.1 / REQ-063 A63.3）。
 *
 * 只登记「与具体门一一对应」的五个码（A63.2 两码 + 既有三码）；其余需求侧码
 * （`not_found` / `invalid_status` / `invalid_field` / `already_claimed` …）与门无关，
 * 归 `INVALID_ARGUMENT`——它们表达的是参数 / 存在性 / 流转表拒绝，不冒充门禁码。
 */
const REQ_GATE_ERROR_CODE: Partial<Record<RequirementErrorCode, CliErrorCode>> = {
  body_empty: 'REQ_BODY_GATE',
  plan_missing: 'REQ_PLAN_GATE',
  plan_deviation: 'REQ_PLAN_DEVIATION',
  review_required: 'REQ_REVIEW_REQUIRED',
  verification_required: 'REQ_VERIFY_REQUIRED',
};

/** 需求侧错误码 → CLI 码（非法码兜底 `INVALID_ARGUMENT`，防 `getCliErrorSpec` 取空） */
function reqJsonCode(code: RequirementErrorCode | CliErrorCode): CliErrorCode {
  const mapped = REQ_GATE_ERROR_CODE[code as RequirementErrorCode];
  if (mapped !== undefined) { return mapped; }
  return Object.prototype.hasOwnProperty.call(CLI_ERROR_CODES, code) ? (code as CliErrorCode) : 'INVALID_ARGUMENT';
}

/**
 * `req claim/advance/complete --json` 的失败文档（A63.3）：
 * `{ schemaVersion, error:{code,kind,message,detail}, errorKind }`——`error.code` 为稳定码，
 * `errorKind` 为 legacy 兼容末键（与既有 `failJson` 同语义），stdout **恰一个**文档。
 */
function failReqJson(code: CliErrorCode, message: string, detail?: unknown): void {
  const spec = getCliErrorSpec(code);
  console.log(JSON.stringify({
    schemaVersion: 1,
    error: { code: spec.code, kind: spec.kind, message, detail: detail ?? null },
    errorKind: spec.kind,
  }, null, 2));
  process.exitCode = spec.exitCode;
}

/**
 * 需求写命令统一失败出口（v1.6.1 / REQ-063 A63.3）：
 * `--json` → 单文档 + 门码（`REQ_*`）；human → stderr 文案 + exit 1（既有语义零改动）。
 */
function failReqWrite(
  lang: string,
  asJson: boolean,
  code: RequirementErrorCode | CliErrorCode,
  message: string,
  detail?: unknown,
): void {
  if (asJson) {
    failReqJson(reqJsonCode(code), message, detail);
    return;
  }
  console.error(message);
  process.exitCode = 1;
}

/**
 * 需求写命令 `--json` 成功文档（A63.3 键序冻结）：
 * `schemaVersion, id, from, to, status`，`gates` 为**条件出现键**（仅 `--force` 实际放行过门时）。
 * 值为门名闭集（与 `src/core/flow/gate-override.ts` 的 `GateOverrideGate` 同源）。
 */
function emitReqWriteJson(doc: { id: string; from: string; to: string; status: string; gates?: string[] }): void {
  emitJson(withSchemaVersion({
    id: doc.id,
    from: doc.from,
    to: doc.to,
    status: doc.status,
    ...(doc.gates !== undefined && doc.gates.length > 0 ? { gates: doc.gates } : {}),
  }));
}

/** 通用错误文案 + 退出码 1（非并发异常统一出口；不 return，由调用方 return） */
function failGeneric(lang: string, err: unknown): void {
  const msg = err instanceof Error ? err.message : String(err);
  console.error(t('common.errorTmpl', lang, { msg }));
  process.exitCode = 1;
}

/**
 * done 门拒绝文案分流（v1.5.8 / REQ-027「完成必审验」）。
 * 触发前提（既有判类，stage-93 BUG-002）：静态流转表放行 `done` 而引擎仍返回 invalid_status ⇒ 唯一可能是完成门。
 * 判据单源 = `requirementDoneBlocker`（引擎）；命令层只做「判据 → i18n 模板」映射：
 * 未审 → `req.err.reviewRequiredTmpl`；未验 → `req.err.verificationRequiredTmpl`；阶段相位 → 既有 `doneGateTmpl`。
 */
function doneGateMessage(lang: string, data: FlowData, id: string, current: string): string {
  const req = getRequirement(data, id);
  const blocker = req ? requirementDoneBlocker(data, req) : null;
  if (blocker === 'review') {
    return t('req.err.reviewRequiredTmpl', lang, { id, current });
  }
  if (blocker === 'verification') {
    return t('req.err.verificationRequiredTmpl', lang, { id, current });
  }
  return t('req.err.doneGateTmpl', lang, { id, current });
}

/**
 * 正文门拒绝文案（v1.6.0 / stage-132 T4）。
 * 判据单源 = `requirementBodyBlocker`（引擎）；本层只把「未写实的小节名」拼进 i18n 模板，
 * 并给出可复制的 `req body` 补写命令（A2 的「提示用 req body 补写」要求）。
 */
function bodyGateMessage(lang: string, data: FlowData, id: string): string {
  const req = getRequirement(data, id);
  const sections = req ? requirementBodyEmptySections(process.cwd(), req) : [];
  return t('req.err.bodyEmptyTmpl', lang, {
    id,
    sections: sections.length > 0 ? sections.join('、') : '摘要、目标与验收',
  });
}

/**
 * 需求级计划门拒绝文案（v1.6.0 / stage-132 T7）。
 * `openfeel req plan` 尚不存在，因此文案给出**按模板创建文件**的具体路径与必备小节
 * （真实指引优于虚构命令）。
 */
function planGateMessage(lang: string, id: string): string {
  return t('req.err.planMissingTmpl', lang, { id });
}

/**
 * 保存并收敛并发：成功返回 true；并发冲突 → 单点处理（JSON 置码 2 返回 / 非 JSON exit 2），
 * 其他异常 → 通用文案 exit 1 并返回 false。返回 false 时调用方须早返回。
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

/**
 * v1.6.0 / REQ-059 T8：**写成功出口**自动同步开发账本（`.openfeel/dev/**` + `dev_last.md`）。
 * 需求写操作已成功，因此同步失败**不改变退出码**，只输出一行 stderr（不再静默吞掉）。
 * 调用点仅限写命令成功出口（advance / complete / review / verify / body），读命令不调。
 */
function syncDevAfterWrite(projectPath: string, lang: string): void {
  const sync = maybeSyncDevStatus(projectPath);
  if (sync.error !== undefined) {
    console.warn(t('flow.dev.syncFailedTmpl', lang, { err: sync.error }));
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
    .option('--claim', '创建后立即认领（v1.5.23：一次开单+认领）')
    .option('--stage <stageId>', '创建后立即关联到该阶段（v1.5.23：一次开单+关联）')
    .option('--start', '创建后直接进入 in_progress（自动 scheduled → in_progress；v1.5.25 / REQ-053）')
    .option('--summary <md>', '正文 ## 摘要 小节（v1.6.0：正文写实；与 --goal/--acceptance 配合即可一步写实）')
    .option('--problem <md>', '正文 ## 问题 小节（v1.6.0：正文写实）')
    .option('--goal <md>', '正文 ## 目标与验收 → 目标 子节（v1.6.0：正文写实）')
    .option('--acceptance <md>', '正文 ## 目标与验收 → 验收 子节（v1.6.0：正文写实）')
    .option('--plan <md>', '正文 ## 初步规划 小节（v1.6.0：正文写实）')
    .action((title: string, options: { targetVersion?: string; priority?: string; workflowMode?: string; claim?: boolean; stage?: string; start?: boolean; summary?: string; problem?: string; goal?: string; acceptance?: string; plan?: string }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        failNoInit(lang, false);
        return;
      }
      const data = mgr.getData()!;
      // v1.5.5：需求写操作前先读状态（strict 拒绝；warn 仅 TTY 提示）
      // v1.5.6-stage-114：收敛到统一 helper
      if (!enforcePreflightOrFail(process.cwd(), lang)) return;
      try {
        // v1.5.17：分配前把**已归档**需求最大号并入下限——`meta.last_req_seq` 不感知归档，
        // 否则归档过的 ID 会被复用（本仓 v1.5.8 归档 REQ-025~030 后计数器停在 24）。
        raiseRequirementSeqFloor(data, archivedRequirementMaxSeq(process.cwd()));
        // 运行期值域由引擎单点判定（命令层零校验）；priority / workflow_mode 断言仅编译期
        const created = addRequirement(data, {
          title,
          target_version: options.targetVersion,
          priority: options.priority as RequirementPriority | undefined,
          workflow_mode: options.workflowMode as WorkflowMode | undefined,
        });
        // v1.5.23 / REQ-043（六期反馈 #1）：一次开单 + 认领 + 关联
        // v1.6.0 / REV-013：claim / advance 都**显式传项目根**（不靠 cwd 推导）——
        // claim 自 REV-013 起不校验正文（认领 ≠ 开工），但传根保证调用面同形；
        // advance 的正文门（scheduled / in_progress / done）必须能定位正文文件。
        let claimedOwner: string | undefined;
        if (options.claim === true) {
          const owner = getUserName(process.cwd());
          const c = claimRequirement(data, created.id, owner, { projectPath: process.cwd() });
          if (!c.ok) {
            failGeneric(lang, new Error(t('req.add.claimFailedTmpl', lang, { id: created.id })));
            return;
          }
          claimedOwner = owner;
        }
        let linkedStage: string | undefined;
        if (options.stage !== undefined) {
          // v1.5.23：短名/全名都要能命中（与 flow 命令同一归一化 + 双键回退）
          const normalizedStage = normalizeStageId(options.stage);
          const stageKey = normalizedStage !== null && data.stages?.[normalizedStage] !== undefined
            ? normalizedStage
            : options.stage;
          const l = linkRequirement(data, stageKey, created.id);
          if (!l.ok) {
            failCode(lang, l.code, {
              not_found: t('req.err.notFoundTmpl', lang, { id: created.id }),
              stage_not_found: t('req.add.linkFailedTmpl', lang, { id: created.id, stage: options.stage }),
              invalid_field: t('req.add.linkFailedTmpl', lang, { id: created.id, stage: options.stage }),
              invalid_status: t('req.add.linkFailedTmpl', lang, { id: created.id, stage: options.stage }),
              general_mode_conflict: t('req.err.generalModeConflictTmpl', lang, { id: created.id }),
            });
            return;
          }
          linkedStage = stageKey;
        }
        // 正文骨架 + 可选业务小节：**先于** `--start` 落盘。
        // 原因（REV-013）：`add --start` 走真实状态流转，正文门必须判到「本轮写下的正文」
        // 而不是「还没有正文文件 ⇒ 无正文可判 ⇒ 放行」的空档；同时 `--goal/--acceptance`
        // 等先写入，带正文内容的 `--start` 不会被误拦。
        let bodyPath: string;
        const bodyFilePath = getRequirementBodyPath(process.cwd(), created.id);
        const bodyExistedBefore = existsSync(bodyFilePath);
        /** 失败路径清理本轮新建的正文文件（不把孤儿正文留给下一次同 ID 复用） */
        const discardNewBody = (): void => {
          if (bodyExistedBefore) { return; }
          try { rmSync(bodyFilePath, { force: true }); } catch { /* 清理失败不掩盖主错误 */ }
        };
        try {
          bodyPath = writeRequirementBodySkeleton(process.cwd(), created);
        } catch (err) {
          failGeneric(lang, err);
          return;
        }
        // v1.6.0-stage-132 / T2：可选正文业务小节（未给的保持骨架占位；元信息小节不碰）
        try {
          const bodyActor = resolveActorName(process.cwd(), undefined);
          const writeSection = (section: string, text: string): void => {
            updateRequirementBody(process.cwd(), created, {
              section,
              text,
              createSectionIfMissing: true,
              by: bodyActor,
            });
          };
          if (options.summary !== undefined) {
            // v1.6.0-stage-132 / T2（REQ-061）：## 摘要 与 ## 目标与验收 都写实 ⇒ add --start 可一步过正文门
            writeSection('摘要', options.summary);
          }
          if (options.problem !== undefined) {
            writeSection('问题', options.problem);
          }
          if (options.goal !== undefined || options.acceptance !== undefined) {
            // --goal 与 --acceptance 合并进 目标与验收 的两个子标题
            const parts: string[] = [];
            if (options.goal !== undefined) { parts.push(`### 目标\n\n${options.goal.trim()}`); }
            if (options.acceptance !== undefined) { parts.push(`### 验收\n\n${options.acceptance.trim()}`); }
            writeSection('目标与验收', parts.join('\n\n'));
          }
          if (options.plan !== undefined) {
            writeSection('初步规划', options.plan);
          }
        } catch (err) {
          discardNewBody();
          failGeneric(lang, err);
          return;
        }
        // v1.5.25 / REQ-053：一次开单到 in_progress（scheduled → in_progress 属引擎流转，
        // 命令层不另写判据；失败则整体不 save，并清掉本轮新建的正文文件）
        // v1.6.0 / REV-013：显式传项目根 —— 空壳正文在 scheduled 步即被正文门拦下。
        let startedStatus: string | undefined;
        if (options.start === true) {
          for (const step of ['scheduled', 'in_progress'] as const) {
            const moved = advanceRequirement(data, created.id, step, { projectPath: process.cwd() });
            if (!moved.ok) {
              discardNewBody();
              failCode(lang, moved.code, {
                not_found: t('req.err.notFoundTmpl', lang, { id: created.id }),
                invalid_field: t('req.err.invalidFieldTmpl', lang, { id: created.id }),
                invalid_status: t('req.err.invalidStatusTmpl', lang, {
                  id: created.id, to: step, current: created.status, targets: getAllowedNextStatuses(created.status).join(', '),
                }),
                general_mode_conflict: t('req.err.generalModeConflictTmpl', lang, { id: created.id }),
                body_empty: bodyGateMessage(lang, data, created.id),
                plan_missing: planGateMessage(lang, created.id),
              });
              return;
            }
          }
          startedStatus = 'in_progress';
        }
        if (!saveOrFail(mgr, lang)) {
          return;
        }
        console.log(t('req.add.doneTmpl', lang, { id: created.id, title: created.title }));
        console.log(t('req.add.bodyTmpl', lang, { path: bodyPath }));
        if (claimedOwner !== undefined) {
          console.log(t('req.add.claimedTmpl', lang, { owner: claimedOwner }));
        }
        if (linkedStage !== undefined) {
          console.log(t('req.add.linkedTmpl', lang, { stage: linkedStage }));
        }
        if (startedStatus !== undefined) {
          console.log(t('req.add.startedTmpl', lang, { id: created.id, status: startedStatus }));
        }
      } catch (err) {
        // 唯一抛错路径（空 title / 非法 priority / 空 target_version）→ 通用模板 exit 1
        failGeneric(lang, err);
      }
    });

  // ── req list [--status <s>] [--target-version <v>] [--owner <o>] [--include-archived] [--json] ──
  req
    .command('list')
    .description('列出需求（可按状态/版本/认领人过滤；--include-archived 合并已随版本归档的需求）')
    .option('--status <status>', '按状态过滤（draft/scheduled/in_progress/review_pending/done/blocked/cancelled/rejected）')
    .option('--target-version <version>', '按预估版本过滤')
    .option('--owner <owner>', '按认领人过滤')
    .option('--include-archived', '包含已随版本归档的需求（只读；合并 .openfeel/flow-archive/*.json）')
    .option('--json', '以 JSON 输出 { schemaVersion, requirements }')
    .action((options: { status?: string; targetVersion?: string; owner?: string; includeArchived?: boolean; json?: boolean }, command: Command) => {
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
      // v1.5.8 / REQ-030：--include-archived 合并归档文件中的终态需求（只读；活跃需求优先，不重复输出）
      const archivedRows: RequirementData[] = [];
      const activeIds = new Set(rows.map((r) => r.id));
      if (options.includeArchived === true) {
        const seen = new Set<string>();
        for (const { requirement } of listArchivedRequirements(process.cwd())) {
          if (activeIds.has(requirement.id) || seen.has(requirement.id)) { continue; }
          // 归档只收终态：读到非终态（人工篡改）跳过，避免把活跃需求当归档输出
          if (!isTerminalRequirementStatus(requirement.status)) { continue; }
          seen.add(requirement.id);
          if (options.status !== undefined && requirement.status !== options.status) { continue; }
          if (options.targetVersion !== undefined && requirement.target_version !== options.targetVersion) { continue; }
          if (options.owner !== undefined && requirement.owner !== options.owner) { continue; }
          archivedRows.push(requirement);
        }
      }
      if (asJson) {
        // 末位追加关联阶段与进度（既有 RequirementData 键序零改；聚合/关联阶段共用单点实现）；
        // 归档需求末位再追加 `archived: true`（可选键，活跃需求不出现）
        const requirements = [
          ...rows.map((r) => {
            const agg = computeRequirementAggregate(data, r.id);
            return {
              ...r,
              linkedStages: listLinkedStages(data, r.id),
              progress: { done: agg.doneCount, total: agg.stageCount },
            };
          }),
          ...archivedRows.map((r) => ({
            ...r,
            linkedStages: [] as Array<{ id: string; phase: string }>,
            progress: { done: 0, total: 0 },
            archived: true,
          })),
        ];
        emitJson(withSchemaVersion({ requirements }));
        return;
      }
      if (rows.length === 0 && archivedRows.length === 0) {
        console.log(t('req.list.empty', lang));
        return;
      }
      for (const r of rows) {
        console.log(t('req.list.itemTmpl', lang, { id: r.id, status: r.status, title: r.title }));
      }
      for (const r of archivedRows) {
        console.log(t('req.list.itemTmpl', lang, { id: r.id, status: r.status, title: r.title })
          + t('req.list.archivedSuffixTmpl', lang));
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
      const active = getRequirement(data, id);
      // 子需求行（活跃集存储顺序枚举；不额外排序——避免第二排序源；对齐 stages 无排序先例）
      /** 统一人类 / JSON 输出（活跃与归档共用，键序零改动） */
      const emitRequirement = (
        r: RequirementData,
        stageIds: string[],
        childRows: RequirementData[],
        archivedVersion: string | null,
      ): void => {
        const children = childRows.map((c) => c.id);
        // 父需求 ID **原样回显**（悬空不报错、不做存在性判定——悬空对账职责单点在 requirementHealthItems，REV-87-004①）
        const parent = r.parent_id ?? null;
        if (asJson) {
          // `archived` 为**末尾可选键**（仅归档回退路径出现；活跃需求既有 5 键键序零改）
          console.log(JSON.stringify(
            archivedVersion === null
              ? { schemaVersion: 1, requirement: r, stages: stageIds, parent, children }
              : { schemaVersion: 1, requirement: r, stages: stageIds, parent, children, archived: true },
            null,
            2,
          ));
          return;
        }
        if (archivedVersion !== null) {
          console.log(t('req.show.archivedTmpl', lang, { version: archivedVersion }));
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
        if (stageIds.length === 0) {
          console.log(t('req.show.stagesNone', lang));
        } else {
          console.log(t('req.show.stagesLabel', lang));
          for (const s of stageIds) {
            console.log(t('req.show.stageItemTmpl', lang, { stage: s }));
          }
        }
      };
      if (!active) {
        // 已归档回退（只读；v1.5.8 / REQ-030）：命中归档文件 → 标记 archived；否则维持 not_found
        const hit = findArchivedRequirement(process.cwd(), id);
        if (!hit) {
          if (asJson) {
            failJson({ error: 'not_found', id });
          } else {
            console.error(t('req.err.notFoundTmpl', lang, { id }));
            process.exitCode = 1;
          }
          return;
        }
        // 关联阶段 / 子需求从归档文件派生（单点 stageRequirementIds；读侧宽容）
        const archivedStages = Object.entries(hit.file.stages ?? {})
          .filter(([, stage]) => stageRequirementIds(stage).includes(id))
          .map(([stageId]) => stageId);
        const archivedChildren = (Array.isArray(hit.file.requirements) ? hit.file.requirements : [])
          .filter((c) => c?.parent_id === id);
        emitRequirement(hit.requirement, archivedStages, archivedChildren, hit.version);
        return;
      }
      // 关联阶段 = 原始只读枚举（零聚合计算 / 零阶段推进字段读取——归后续阶段）；命令层输出面复用单点过滤（REV-97-006）
      emitRequirement(active, listLinkedStages(data, id).map((l) => l.id), getRequirements(data).filter((r) => r.parent_id === id), null);
    });

  // ── req claim <id> [--owner <name>] [--force] [--json] ──
  req
    .command('claim <id>')
    .description('认领需求（占用校验；已被他人认领则拒绝）')
    .option('--owner <owner>', '认领人（缺省：.openfeel/.info.json user → git config user.name）')
    .option('--force', '正文门留痕放行（写 body_waiver + 审计 requirement_body_forced；仍应先补写正文）')
    .option('--json', '以 JSON 输出 { schemaVersion, id, from, to, status, gates? }（v1.6.1 / REQ-063）')
    .action((id: string, options: { owner?: string; force?: boolean; json?: boolean }, command: Command) => {
      const lang = getCliLang(process.cwd());
      const asJson = asJsonOf(options, command);
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        failReqWrite(lang, asJson, 'NO_INIT', t('common.errorNoInit', lang), { reason: 'no-init' });
        return;
      }
      const data = mgr.getData()!;
      if (!isValidReqId(id)) {
        failReqWrite(lang, asJson, 'INVALID_ARGUMENT', t('req.invalidIdTmpl', lang, { input: id }), { field: 'id', value: id });
        return;
      }
      // v1.5.5：认领前先读状态（放在 ID 校验之后，避免非法参数先报 preflight）
      // v1.5.6-stage-114：收敛到统一 helper；**位置不变**（ID 校验仍在门前）
      if (!enforcePreflightOrFail(process.cwd(), lang, asJson
        ? { reject: (m: string): void => failReqJson('INVALID_ARGUMENT', m, { reason: 'preflight-required' }) }
        : undefined)) return;
      // --owner 缺省链：.info.json user → git config user.name → 哨兵 'unknown' 拒绝（禁硬编码）
      let owner = options.owner;
      if (owner === undefined) {
        const resolved = getUserName(process.cwd());
        if (resolved === '' || resolved === 'unknown') {
          failReqWrite(lang, asJson, 'invalid_field', t('req.claim.ownerUnresolvedTmpl', lang));
          return;
        }
        owner = resolved;
      }
      const projectPath = process.cwd();
      const beforeStatus = getRequirement(data, id)?.status ?? '';
      // 返回码分流（命令层仅映射，零校验）：占用 / 终态均由引擎单点判定。
      // v1.6.0 / REV-013：claim **不再校验正文**（认领 ≠ 开工），因此 `body_empty` 分支
      // 目前不可达——保留 `--force` 选项与分支只为兼容旧脚本（选项键仍在 help 锁内）。
      let r = claimRequirement(data, id, owner, { projectPath });
      let bodyForced = false;
      if (!r.ok && r.code === 'body_empty' && options.force === true) {
        // v1.6.0 / T4（A2c）：--force = 留痕放行（body_waiver + 审计），随后用同一谓词重试
        const forced = forceRequirementBodyWaiver(data, id, {
          by: resolveActorName(projectPath), reason: 'claim-force', gate: 'claim',
        });
        if (!forced.ok) {
          failReqWrite(lang, asJson, forced.code, codeMessage(lang, forced.code, {
            not_found: t('req.err.notFoundTmpl', lang, { id }),
            invalid_status: t('req.claim.terminalTmpl', lang, { id, status: getRequirement(data, id)?.status ?? '' }),
          }), { id });
          return;
        }
        r = claimRequirement(data, id, owner, { projectPath });
        bodyForced = r.ok;
      }
      if (!r.ok) {
        failReqWrite(lang, asJson, r.code, codeMessage(lang, r.code, {
          not_found: t('req.err.notFoundTmpl', lang, { id }),
          already_claimed: t('req.err.alreadyClaimedTmpl', lang, { id }),
          invalid_field: t('req.err.invalidFieldTmpl', lang, { id }),
          invalid_status: t('req.claim.terminalTmpl', lang, { id, status: getRequirement(data, id)?.status ?? '' }),
          body_empty: bodyGateMessage(lang, data, id),
        }), { id });
        return;
      }
      // 状态不因认领而变（claim 只写 owner/claimed_at）：`from` / `to` 同为当前状态
      const statusNow = getRequirement(data, id)?.status ?? beforeStatus;
      const gates = bodyForced ? ['req_body'] : undefined;
      if (!r.changed) {
        // 同 owner 幂等：不 save（revision 不变）
        if (asJson) {
          emitReqWriteJson({ id, from: beforeStatus, to: statusNow, status: statusNow, gates });
          return;
        }
        console.log(t('req.claim.idempotentTmpl', lang, { id, owner }));
        return;
      }
      if (!saveOrFail(mgr, lang)) {
        return;
      }
      if (asJson) {
        emitReqWriteJson({ id, from: beforeStatus, to: statusNow, status: statusNow, gates });
        return;
      }
      console.log(t('req.claim.doneTmpl', lang, { id, owner })
        + (bodyForced ? t('req.claim.bodyForcedSuffix', lang) : ''));
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
      // v1.5.6-stage-114：写前 preflight（ID 校验已在门前，strict 拒绝；warn 仅 TTY 提示）
      if (!enforcePreflightOrFail(process.cwd(), lang)) return;
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
      // v1.5.6-stage-114：写前 preflight（ID / 无字段守卫已在门前）
      if (!enforcePreflightOrFail(process.cwd(), lang)) return;
      // 命令层零校验：白名单 / 值域 / 流转全由引擎单点判定
      const r = updateRequirement(data, id, {
        status: options.status as RequirementStatus | undefined,
        title: options.title,
        target_version: options.targetVersion,
        priority: options.priority as RequirementPriority | undefined,
        workflow_mode: options.workflowMode as WorkflowMode | undefined,
      }, { projectPath: process.cwd() });
      if (!r.ok) {
        const current = getRequirement(data, id)?.status ?? '';
        // done 门专用文案（stage-93 BUG-002）：静态表放行 done 而仍被拒 ⇒ 唯一可能是完成门
        const doneGate = options.status === 'done'
          && (getAllowedNextStatuses(current as RequirementStatus) as readonly string[]).includes('done');
        // v1.6.1 / REQ-063 A63.1：`in_progress → done` 直连被流转表拒绝 → 指向 review_pending
        const reviewPhaseBlocked = options.status === 'done' && current === 'in_progress' && r.code === 'invalid_status';
        failCode(lang, r.code, {
          not_found: t('req.err.notFoundTmpl', lang, { id }),
          invalid_field: t('req.err.invalidFieldTmpl', lang, { id }),
          // v1.6.0 / REQ-056 T6：`set --status done` 与 advance 同判据（done 门通过后才可能到这）
          plan_deviation: t('req.err.planDeviationTmpl', lang, { id }),
          // v1.6.0 / stage-132 T4 · T7：正文门 / 需求级计划门（`set` 无 --force，文案指向 advance --force）
          body_empty: bodyGateMessage(lang, data, id),
          plan_missing: planGateMessage(lang, id),
          // v1.6.1 / REQ-063 A63.2：done 门两码（`set` 无 --json，沿用 human 文案）
          review_required: t('req.err.reviewRequiredTmpl', lang, { id, current }),
          verification_required: t('req.err.verificationRequiredTmpl', lang, { id, current }),
          invalid_status: reviewPhaseBlocked
            ? t('req.err.reviewPhaseRequiredTmpl', lang, { id })
            : (doneGate
              ? doneGateMessage(lang, data, id, current)
              : t('req.err.invalidStatusTmpl', lang, {
                id,
                to: options.status ?? '',
                current,
                targets: getAllowedNextStatuses(current as RequirementStatus).join(', '),
              })),
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
        // 命令层输出面复用单点过滤（REV-97-006）；保留既有短名归一语义与 onlyStages 作用域
        const linked = listLinkedStages(data, id).map((l) => normalizeStageId(l.id) ?? l.id);
        if (linked.length > 0) {
          const synced = mgr.syncConfigFieldToStages('workflow_mode', options.workflowMode, { onlyStages: linked });
          const wrote = synced.filter((s) => s.result === 'updated' || s.result === 'inserted').length;
          console.log(t('req.set.modeSyncedTmpl', lang, { id, mode: options.workflowMode, count: String(wrote) }));
        }
        // 零关联阶段（含 general 门后）→ 仅更新需求字段，零副作用（不输出下发提示）
      }
      console.log(t('req.set.doneTmpl', lang, { id }));
    });

  // ── req link --stage <stageId> (--requirement <id> [--unlink] | --unlink) ──
  req
    .command('link')
    .description('关联需求到阶段（可多个）/ 解绑（--unlink 单个或全部）')
    .requiredOption('--stage <stageId>', '阶段 ID（stage-NN 或 vX.Y.Z-stage-NN）')
    .option('--requirement <id>', '需求 ID（关联用；与 --unlink 同用时表示只解绑该需求）')
    .option('--unlink', '解除该阶段的需求关联（缺省清空全部；与 --requirement 同用只解该需求）')
    .action((options: { stage: string; requirement?: string; unlink?: boolean }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        failNoInit(lang, false);
        return;
      }
      const data = mgr.getData()!;
      // 参数守卫（argument-shape）：至少提供一个（v1.5.8 / REQ-028：两者同用 = 只解绑该需求）
      const hasRequirement = options.requirement !== undefined;
      const hasUnlink = options.unlink === true;
      if (!hasRequirement && !hasUnlink) {
        console.error(t('req.link.needArgTmpl', lang));
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
      // v1.5.6-stage-114：写前 preflight（参数守卫 / reqId 校验已在门前）
      if (!enforcePreflightOrFail(process.cwd(), lang)) return;
      // 三分支：link（追加）/ unlink 单个 / unlink 全部
      const r = hasUnlink
        ? linkRequirement(data, stageKey, null, hasRequirement ? { unlinkRequirementId: requirementId! } : {})
        : linkRequirement(data, stageKey, requirementId);
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
      if (!hasUnlink && hasRequirement && requirementId) {
        const reqLinked = getRequirement(data, requirementId);
        if (reqLinked?.workflow_mode) {
          const synced = mgr.syncConfigFieldToStages('workflow_mode', reqLinked.workflow_mode, { onlyStages: [stageKey] });
          if (synced.some((s) => s.result === 'updated' || s.result === 'inserted')) {
            console.log(t('req.link.modeSyncedTmpl', lang, { stage: stageKey, mode: reqLinked.workflow_mode }));
          }
        }
      }
      if (hasUnlink) {
        console.log(hasRequirement
          ? t('req.link.unlinkOneTmpl', lang, { stage: stageKey, id: requirementId ?? '' })
          : t('req.link.unlinkDoneTmpl', lang, { stage: stageKey }));
      } else {
        console.log(t('req.link.doneTmpl', lang, { stage: stageKey, id: requirementId ?? '' }));
      }
    });

  // ── req advance <id> --to <status> [--force] [--json] ──
  req
    .command('advance <id>')
    .description('显式推进需求状态（合法目标由引擎流转表判定；done 须先经 review_pending，零关联可直接完成，关联阶段进入 exec_running 及之后相位即可完成）')
    .requiredOption('--to <status>', '目标状态（合法目标由引擎判定）')
    .option('--force', '门留痕放行（正文/计划门写 waiver、计划偏差 +1、in_progress→done 跳链记 req_review；均留审计，文件仍须补写）')
    .option('--json', '以 JSON 输出 { schemaVersion, id, from, to, status, gates? }（v1.6.1 / REQ-063）')
    .action((id: string, options: { to: string; force?: boolean; json?: boolean }, command: Command) => {
      const lang = getCliLang(process.cwd());
      const asJson = asJsonOf(options, command);
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        failReqWrite(lang, asJson, 'NO_INIT', t('common.errorNoInit', lang), { reason: 'no-init' });
        return;
      }
      const data = mgr.getData()!;
      if (!isValidReqId(id)) {
        failReqWrite(lang, asJson, 'INVALID_ARGUMENT', t('req.invalidIdTmpl', lang, { input: id }), { field: 'id', value: id });
        return;
      }
      // 读当前状态仅供成功文案与失败 targets 渲染（纯读，非校验）
      const before = getRequirement(data, id)?.status;
      // v1.5.6-stage-114：写前 preflight（ID 校验已在门前）
      if (!enforcePreflightOrFail(process.cwd(), lang, asJson
        ? { reject: (m: string): void => failReqJson('INVALID_ARGUMENT', m, { reason: 'preflight-required' }) }
        : undefined)) return;
      const projectPath = process.cwd();
      // v1.6.0 / REQ-056 T6：未盖章历史需求（plan? 缺省）在 done 时**放行但提示**——
      // 不阻塞存量，审计另记 `plan_unstamped:true`（在 requirement_status 条目里）。
      const planUnstamped = options.to === 'done' && getRequirement(data, id)?.plan === undefined;
      // 命令层零校验：合法目标 + 正文门 + 计划门 + done 门 + 计划偏差门均在引擎单点
      let r = advanceRequirement(data, id, options.to as RequirementStatus, { projectPath });
      let planDeviationForced = false;
      let gateForced = false;
      /** 是否走过「审查相位跳链」留痕通道（`--force`；后续重试必须继续携带，否则表外再拒） */
      let reviewSkipped = false;
      /** 实际被 `--force` 放行的门（JSON 成功文档的 `gates`；与 GateOverrideGate 同闭集） */
      const gates: string[] = [];
      // v1.6.1 / REQ-063 A63.1：`in_progress → done` 的跳链留痕放行（唯一例外通道）——
      // 引擎侧 `allowReviewSkip` 只放行**流转表**这一条拒绝，done 门（review+verify）照旧生效。
      if (!r.ok && r.code === 'invalid_status' && options.to === 'done'
        && before === 'in_progress' && options.force === true) {
        r = advanceRequirement(data, id, 'done', {
          projectPath,
          allowReviewSkip: true,
          by: resolveActorName(projectPath),
          gateReason: 'advance-force',
        });
        reviewSkipped = true;
      }
      /** 重试选项：跳链已放行时必须续带 `allowReviewSkip`（否则同一条流转又被流转表拒绝） */
      const retryOpts = (extra: { allowPlanDeviation?: boolean } = {}): {
        projectPath: string; allowReviewSkip?: boolean; allowPlanDeviation?: boolean; by?: string; gateReason?: string;
      } => ({
        projectPath,
        ...(reviewSkipped
          ? { allowReviewSkip: true, by: resolveActorName(projectPath), gateReason: 'advance-force' }
          : {}),
        ...extra,
      });
      // v1.6.0 / stage-132 T4 · T7：正文门 / 计划门的 --force 通道——
      // 写入 waiver（留痕）+ 审计后，用**同一谓词**重新求值（门本体不重写）。
      // 同一次流转可能**连撞两门**（空壳正文 + 无计划）：循环上限 = 门数（2），逐个留痕放行。
      for (let i = 0; i < 2 && !r.ok && options.force === true
        && (r.code === 'body_empty' || r.code === 'plan_missing'); i += 1) {
        const forced = r.code === 'body_empty'
          ? forceRequirementBodyWaiver(data, id, { by: resolveActorName(projectPath), reason: 'advance-force', gate: 'advance' })
          : forceRequirementPlanWaiver(data, id, { by: resolveActorName(projectPath), reason: 'advance-force', gate: 'advance' });
        if (!forced.ok) {
          failReqWrite(lang, asJson, forced.code, codeMessage(lang, forced.code, {
            not_found: t('req.err.notFoundTmpl', lang, { id }),
            invalid_status: t('req.err.invalidStatusTmpl', lang, {
              id, to: options.to, current: before ?? '',
              targets: before !== undefined ? getAllowedNextStatuses(before).join(', ') : '',
            }),
          }), { id, to: options.to });
          return;
        }
        const forcedGate = r.code === 'body_empty' ? 'req_body' : 'req_plan';
        r = advanceRequirement(data, id, options.to as RequirementStatus, retryOpts());
        if (r.ok) {
          if (!gates.includes(forcedGate)) { gates.push(forcedGate); }
          gateForced = true;
        }
      }
      if (!r.ok && r.code === 'plan_deviation' && options.force === true) {
        // 留痕放行：先记偏差次数 + 审计（判据本体不重写），再走同一门放行通道
        const forced = forceRequirementPlanDeviation(data, id, { by: resolveActorName(projectPath) });
        if (!forced.ok) {
          failReqWrite(lang, asJson, forced.code, codeMessage(lang, forced.code, {
            not_found: t('req.err.notFoundTmpl', lang, { id }),
            invalid_status: t('req.advance.forceRequiresStampTmpl', lang, { id }),
          }), { id, to: options.to });
          return;
        }
        r = advanceRequirement(data, id, options.to as RequirementStatus, retryOpts({ allowPlanDeviation: true }));
        planDeviationForced = r.ok;
        if (r.ok && !gates.includes('req_plan')) { gates.push('req_plan'); }
      }
      // 跳链与偏差可能在不同重试轮次才成功：成功时统一补登 `req_review`（审计已在引擎侧写入）
      if (r.ok && reviewSkipped) {
        gateForced = true;
        if (!gates.includes('req_review')) { gates.unshift('req_review'); }
      }
      const statusNow = getRequirement(data, id)?.status ?? (before ?? '');
      if (!r.ok) {
        // done 门专用文案（stage-93 BUG-002）：静态表放行 done 而仍被拒 ⇒ 唯一可能是完成门
        const doneGate = options.to === 'done'
          && before !== undefined
          && (getAllowedNextStatuses(before) as readonly string[]).includes('done');
        // v1.6.1 / REQ-063 A63.1：`in_progress → done` 直连被流转表拒绝 → 指向 review_pending
        const reviewPhaseBlocked = options.to === 'done' && before === 'in_progress' && r.code === 'invalid_status';
        failReqWrite(lang, asJson, r.code, codeMessage(lang, r.code, {
          not_found: t('req.err.notFoundTmpl', lang, { id }),
          // v1.6.0 / REQ-056 T6：计划被执行改动且 `## 偏差与回写` 未写实（done 门已通过后才可能到这）
          plan_deviation: t('req.err.planDeviationTmpl', lang, { id }),
          // v1.6.0 / stage-132 T4 · T7：正文门 / 需求级计划门（补写指引 + 可复制的命令）
          body_empty: bodyGateMessage(lang, data, id),
          plan_missing: planGateMessage(lang, id),
          // v1.6.1 / REQ-063 A63.2：done 门两码（判据单源 requirementDoneBlocker）
          review_required: t('req.err.reviewRequiredTmpl', lang, { id, current: before ?? '' }),
          verification_required: t('req.err.verificationRequiredTmpl', lang, { id, current: before ?? '' }),
          invalid_status: reviewPhaseBlocked
            ? t('req.err.reviewPhaseRequiredTmpl', lang, { id })
            : (doneGate
              ? doneGateMessage(lang, data, id, before ?? '')
              : t('req.err.invalidStatusTmpl', lang, {
                id,
                to: options.to,
                current: before ?? '',
                targets: before !== undefined ? getAllowedNextStatuses(before).join(', ') : '',
              })),
        }), { id, to: options.to, current: before ?? null });
        return;
      }
      if (!r.changed) {
        if (asJson) {
          emitReqWriteJson({ id, from: before ?? statusNow, to: options.to, status: statusNow, gates });
          return;
        }
        console.log(t('req.advance.noopTmpl', lang, { id, to: options.to }));
        return;
      }
      if (!saveOrFail(mgr, lang)) {
        return;
      }
      if (planUnstamped) {
        console.warn(t('req.warn.planUnstampedTmpl', lang, { id }));
      }
      if (asJson) {
        emitReqWriteJson({ id, from: before ?? '', to: options.to, status: statusNow, gates });
        return;
      }
      console.log(t('req.advance.doneTmpl', lang, { id, from: before ?? '', to: options.to })
        + (planDeviationForced ? t('req.advance.planDeviationForcedSuffix', lang) : '')
        + (gateForced ? t('req.advance.gateForcedSuffix', lang) : ''));
      // v1.6.0 / REQ-059 T8：流转成功即自动同步开发账本
      syncDevAfterWrite(projectPath, lang);
    });

  // ── req waive <id> --reason <text> [--by] [--revoke] ──（v1.5.23 / REQ-043 / 六期 #8）
  req
    .command('waive <id>')
    .description('显式豁免：移出阶段 done 门并记录原因（与 cancelled 区分；--revoke 撤销）')
    .option('--reason <text>', '放弃原因（豁免时必需）')
    .option('--by <who>', '决策人（缺省 = 项目用户）')
    .option('--revoke', '撤销豁免')
    .action((id: string, options: { reason?: string; by?: string; revoke?: boolean }) => {
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
      if (!enforcePreflightOrFail(process.cwd(), lang)) return;
      const by = resolveActorName(process.cwd(), options.by);
      const r = options.revoke === true
        ? revokeRequirementWaiver(data, id)
        : waiveRequirement(data, id, { reason: options.reason, by });
      if (!r.ok) {
        failCode(lang, r.code, {
          not_found: t('req.err.notFoundTmpl', lang, { id }),
          invalid_field: t('req.waive.reasonTmpl', lang),
          invalid_status: options.revoke === true
            ? t('req.waive.noWaiverTmpl', lang, { id })
            : t('req.waive.alreadyDoneTmpl', lang, { id }),
        });
        return;
      }
      if (!saveOrFail(mgr, lang)) {
        return;
      }
      console.log(options.revoke === true
        ? t('req.waive.revokedTmpl', lang, { id })
        : t('req.waive.doneTmpl', lang, { id, reason: options.reason ?? '' }));
    });

  // ── req trivial <id> --reason <text> [--by] [--revoke] ──（v1.5.23 / REQ-043 / 六期 #5）
  req
    .command('trivial <id>')
    .description('标记为 trivial（免审验：docs/文案/测试注释类；--revoke 撤销）')
    .option('--reason <text>', '为什么算 trivial（标记时必需）')
    .option('--by <who>', '标记人（缺省 = 项目用户）')
    .option('--revoke', '撤销标记')
    .action((id: string, options: { reason?: string; by?: string; revoke?: boolean }) => {
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
      if (!enforcePreflightOrFail(process.cwd(), lang)) return;
      const by = resolveActorName(process.cwd(), options.by);
      const r = options.revoke === true
        ? clearRequirementTrivial(data, id)
        : markRequirementTrivial(data, id, { reason: options.reason, by });
      if (!r.ok) {
        failCode(lang, r.code, {
          not_found: t('req.err.notFoundTmpl', lang, { id }),
          invalid_field: t('req.trivial.reasonTmpl', lang),
          invalid_status: options.revoke === true
            ? t('req.trivial.noMarkTmpl', lang, { id })
            : t('req.trivial.alreadyDoneTmpl', lang, { id }),
        });
        return;
      }
      if (!saveOrFail(mgr, lang)) {
        return;
      }
      console.log(options.revoke === true
        ? t('req.trivial.revokedTmpl', lang, { id })
        : t('req.trivial.doneTmpl', lang, { id, reason: options.reason ?? '' }));
    });

  // ── req complete <id> --result pass --note <t> [--kind] [--evidence] [--by] [--independent|--self] [--force] [--json] ──
  // v1.5.23 / REQ-043（六期反馈 #1）：一次收口 = review + verify + advance(done)。
  // 复用既有判据单点（recordRequirementReview / recordRequirementVerification / advanceRequirement
  // → canCompleteRequirement）；任一步失败即返回，**不 save ⇒ flow.json 零变更**。
  // v1.6.1 / REQ-063 A63.1：收口链改为 in_progress → review_pending → done（审查相位不再被跳过）。
  req
    .command('complete <id>')
    .description('一次收口：记录审查+验证并推进 done（经 review_pending 相位；复用既有 done 门；任一失败零写盘）')
    .requiredOption('--result <result>', '审验结论（pass / fail；pass 才能收口）')
    .option('--kind <kind>', '验证种类（test / manual / build；缺省 manual）')
    .requiredOption('--note <text>', '结论摘要（进入归档摘要）')
    .option('--by <who>', '审查者 / 验证者（缺省 = 项目用户）')
    .option('--evidence <path>', '证据（测试命令 / 报告路径 / 摘要）')
    .option('--independent', '独立审查（推荐）')
    .option('--self', '自我审查（非独立；归档摘要标注 self-review）')
    .option('--force', '门留痕放行（正文/计划门写 waiver + 审计；文件仍须补写）')
    .option('--json', '以 JSON 输出 { schemaVersion, id, from, to, status, gates? }（v1.6.1 / REQ-063）')
    .action((id: string, options: {
      result: string; kind?: string; note: string; by?: string; evidence?: string;
      independent?: boolean; self?: boolean; force?: boolean; json?: boolean;
    }, command: Command) => {
      const lang = getCliLang(process.cwd());
      const asJson = asJsonOf(options, command);
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        failReqWrite(lang, asJson, 'NO_INIT', t('common.errorNoInit', lang), { reason: 'no-init' });
        return;
      }
      const data = mgr.getData()!;
      if (!isValidReqId(id)) {
        failReqWrite(lang, asJson, 'INVALID_ARGUMENT', t('req.invalidIdTmpl', lang, { input: id }), { field: 'id', value: id });
        return;
      }
      if (options.independent === true && options.self === true) {
        failReqWrite(lang, asJson, 'INVALID_ARGUMENT', t('req.review.exclusiveFlagTmpl', lang));
        return;
      }
      if (!enforcePreflightOrFail(process.cwd(), lang, asJson
        ? { reject: (m: string): void => failReqJson('INVALID_ARGUMENT', m, { reason: 'preflight-required' }) }
        : undefined)) return;
      const by = resolveActorName(process.cwd(), options.by);
      const independent = options.independent === true;
      // v1.5.24 / REQ-051：收口请求可直接从 draft / scheduled 起——自动补状态链
      // （这正是一条命令收口的完整语义；blocked / 终态仍需人工先处理）。
      // v1.6.1 / REQ-063 A63.1：`review_pending` 亦为合法起点（已挂审查窗口的需求可一次收口）。
      const fromStatus = getRequirement(data, id)?.status ?? '';
      let stateNow = fromStatus;
      if (!(['draft', 'scheduled', 'in_progress', 'review_pending'] as string[]).includes(stateNow)) {
        failReqWrite(lang, asJson, 'invalid_status', t('req.complete.statusTmpl', lang, { id, status: stateNow }), { id });
        return;
      }
      const projectPath = process.cwd();
      /** 实际被 `--force` 放行的门（JSON 成功文档的 `gates`） */
      const gates: string[] = [];
      /** 门的 --force 通道（T4 正文 / T7 计划）：写 waiver + 审计后由调用方用同一谓词重试 */
      const forceGate = (code: 'body_empty' | 'plan_missing'): boolean => {
        const forced = code === 'body_empty'
          ? forceRequirementBodyWaiver(data, id, { by, reason: 'complete-force', gate: 'complete' })
          : forceRequirementPlanWaiver(data, id, { by, reason: 'complete-force', gate: 'complete' });
        if (!forced.ok) {
          failReqWrite(lang, asJson, forced.code, codeMessage(lang, forced.code, {
            not_found: t('req.err.notFoundTmpl', lang, { id }),
            invalid_status: t('req.complete.statusTmpl', lang, { id, status: getRequirement(data, id)?.status ?? '' }),
          }), { id });
          return false;
        }
        const forcedGate = code === 'body_empty' ? 'req_body' : 'req_plan';
        if (!gates.includes(forcedGate)) { gates.push(forcedGate); }
        return true;
      };
      let gateForced = false;
      for (const step of ['scheduled', 'in_progress'] as const) {
        if (stateNow !== 'draft' && stateNow !== 'scheduled') break;
        let moved = advanceRequirement(data, id, step, { projectPath });
        // 同一流转可能连撞两门（正文 + 计划）：循环上限 = 门数（2），逐个留痕放行
        for (let i = 0; i < 2 && !moved.ok && options.force === true
          && (moved.code === 'body_empty' || moved.code === 'plan_missing'); i += 1) {
          if (!forceGate(moved.code)) return;
          moved = advanceRequirement(data, id, step, { projectPath });
          gateForced = moved.ok;
        }
        if (!moved.ok) {
          failReqWrite(lang, asJson, moved.code, codeMessage(lang, moved.code, {
            not_found: t('req.err.notFoundTmpl', lang, { id }),
            invalid_field: t('req.err.invalidFieldTmpl', lang, { id }),
            // v1.6.0 / stage-132 T4 · T7：自动补链同样过正文门 / 计划门（不因「一条命令」而绕过）
            body_empty: bodyGateMessage(lang, data, id),
            plan_missing: planGateMessage(lang, id),
            invalid_status: t('req.err.invalidStatusTmpl', lang, {
              id, to: step, current: stateNow, targets: getAllowedNextStatuses(stateNow as RequirementStatus).join(', '),
            }),
            general_mode_conflict: t('req.err.generalModeConflictTmpl', lang, { id }),
          }), { id, to: step, current: stateNow });
          return;
        }
        stateNow = step;
      }
      const review = recordRequirementReview(data, id, { result: options.result, by, note: options.note, independent, session: currentSession() });
      if (!review.ok) {
        failReqWrite(lang, asJson, review.code, codeMessage(lang, review.code, {
          not_found: t('req.err.notFoundTmpl', lang, { id }),
          invalid_status: t('req.review.terminalTmpl', lang, { id, status: getRequirement(data, id)?.status ?? '' }),
          invalid_field: t('req.review.invalidTmpl', lang),
        }), { id });
        return;
      }
      const verification = recordRequirementVerification(data, id, {
        result: options.result,
        kind: options.kind ?? 'manual',
        by,
        note: options.note,
        evidence: options.evidence,
        session: currentSession(),
      });
      if (!verification.ok) {
        failReqWrite(lang, asJson, verification.code, codeMessage(lang, verification.code, {
          not_found: t('req.err.notFoundTmpl', lang, { id }),
          invalid_status: t('req.verify.terminalTmpl', lang, { id, status: getRequirement(data, id)?.status ?? '' }),
          invalid_field: t('req.verify.invalidTmpl', lang),
        }), { id });
        return;
      }
      // v1.6.1 / REQ-063 A63.1：先入审查相位（in_progress → review_pending），再由审查相位 → done。
      // 这一步不经 `--force`：一条命令收口的语义就是「走完整条链」，跳链只留给显式 advance --force。
      if (stateNow === 'in_progress') {
        const hop = advanceRequirement(data, id, 'review_pending', { projectPath });
        if (!hop.ok) {
          failReqWrite(lang, asJson, hop.code, codeMessage(lang, hop.code, {
            not_found: t('req.err.notFoundTmpl', lang, { id }),
            invalid_status: t('req.err.invalidStatusTmpl', lang, {
              id, to: 'review_pending', current: stateNow,
              targets: getAllowedNextStatuses(stateNow as RequirementStatus).join(', '),
            }),
          }), { id, to: 'review_pending', current: stateNow });
          return;
        }
        stateNow = 'review_pending';
      }
      const current = getRequirement(data, id)?.status ?? stateNow;
      let advanced = advanceRequirement(data, id, 'done', { projectPath });
      for (let i = 0; i < 2 && !advanced.ok && options.force === true
        && (advanced.code === 'body_empty' || advanced.code === 'plan_missing'); i += 1) {
        if (!forceGate(advanced.code)) return;
        advanced = advanceRequirement(data, id, 'done', { projectPath });
        gateForced = advanced.ok;
      }
      if (!advanced.ok) {
        // 走到这里 = 审验记录已写但状态没推进：不 save（零写盘），按 done 门文案说明缺什么
        failReqWrite(lang, asJson, advanced.code, codeMessage(lang, advanced.code, {
          not_found: t('req.err.notFoundTmpl', lang, { id }),
          invalid_field: t('req.err.invalidFieldTmpl', lang, { id }),
          // v1.6.0 / REQ-056 T6：计划偏差门（done 门通过后）
          plan_deviation: t('req.err.planDeviationTmpl', lang, { id }),
          // v1.6.0 / stage-132 T4 · T7：正文门 / 计划门（先于 done 门）
          body_empty: bodyGateMessage(lang, data, id),
          plan_missing: planGateMessage(lang, id),
          // v1.6.1 / REQ-063 A63.2：done 门两码
          review_required: t('req.err.reviewRequiredTmpl', lang, { id, current }),
          verification_required: t('req.err.verificationRequiredTmpl', lang, { id, current }),
          invalid_status: doneGateMessage(lang, data, id, current),
          general_mode_conflict: t('req.err.generalModeConflictTmpl', lang, { id }),
        }), { id, to: 'done', current });
        return;
      }
      if (!saveOrFail(mgr, lang)) {
        return;
      }
      if (asJson) {
        emitReqWriteJson({ id, from: fromStatus, to: 'done', status: 'done', gates });
        return;
      }
      const suffix = independent ? '' : t('req.review.selfSuffix', lang);
      console.log(t('req.complete.doneTmpl', lang, {
        id, result: options.result, kind: options.kind ?? 'manual',
      }) + suffix + (gateForced ? t('req.complete.gateForcedSuffix', lang) : ''));
      // v1.6.0 / REQ-059 T8：收口成功即自动同步开发账本
      syncDevAfterWrite(projectPath, lang);
    });

  // ── req review <id> --result pass|fail --by <who> --note <text> [--independent|--self] ──
  req
    .command('review <id>')
    .description('记录需求审查（v1.5.8 完成必审：done 门要求 review.result=pass；--independent 独立审查 / --self 自我审查）')
    .requiredOption('--result <result>', '审查结论（pass / fail）')
    .option('--by <who>', '审查者（缺省 = 项目用户）')
    .requiredOption('--note <text>', '结论摘要（进入归档摘要）')
    .option('--independent', '独立审查（推荐）')
    .option('--self', '自我审查（非独立；归档摘要标注 self-review）')
    .action((id: string, options: { result: string; by?: string; note: string; independent?: boolean; self?: boolean }) => {
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
      // 参数互斥守卫（argument-shape，非业务校验）
      if (options.independent === true && options.self === true) {
        console.error(t('req.review.exclusiveFlagTmpl', lang));
        process.exitCode = 1;
        return;
      }
      // v1.5.6-stage-114：写前 preflight（ID / 互斥守卫已在门前）
      if (!enforcePreflightOrFail(process.cwd(), lang)) return;
      // 命令层零校验：值域（result）/ 非空（by/note）/ 终态全在引擎单点
      // v1.5.23 / REQ-042（六期 #12）：--by 可省，缺省 = 项目用户
      const by = resolveActorName(process.cwd(), options.by);
      const r = recordRequirementReview(data, id, {
        result: options.result,
        by,
        note: options.note,
        independent: options.independent === true,
        session: currentSession(),
      });
      if (!r.ok) {
        failCode(lang, r.code, {
          not_found: t('req.err.notFoundTmpl', lang, { id }),
          invalid_status: t('req.review.terminalTmpl', lang, { id, status: getRequirement(data, id)?.status ?? '' }),
          invalid_field: t('req.review.invalidTmpl', lang),
        });
        return;
      }
      if (!saveOrFail(mgr, lang)) {
        return;
      }
      const suffix = options.independent === true ? '' : t('req.review.selfSuffix', lang);
      console.log(t('req.review.doneTmpl', lang, { id, result: options.result, by }) + suffix);
      // v1.6.0 / REQ-059 T8：审查记录写入成功即自动同步开发账本
      syncDevAfterWrite(process.cwd(), lang);
    });

  // ── req verify <id> --result pass|fail --kind test|manual|build --by <who> --note <text> [--evidence <path>] ──
  req
    .command('verify <id>')
    .description('记录需求验证（v1.5.8 完成必验：done 门要求 verification.result=pass）')
    .requiredOption('--result <result>', '验证结论（pass / fail）')
    .requiredOption('--kind <kind>', '验证种类（test / manual / build）')
    .option('--by <who>', '验证者（缺省 = 项目用户）')
    .requiredOption('--note <text>', '结论摘要（进入归档摘要）')
    .option('--evidence <path>', '证据（测试命令 / 报告路径 / 摘要）')
    .action((id: string, options: { result: string; kind: string; by?: string; note: string; evidence?: string }) => {
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
      // v1.5.6-stage-114：写前 preflight（ID 校验已在门前）
      if (!enforcePreflightOrFail(process.cwd(), lang)) return;
      // 命令层零校验：值域（result / kind）/ 非空（by/note）/ 终态全在引擎单点
      // v1.5.23 / REQ-042（六期 #12）：--by 可省，缺省 = 项目用户
      const by = resolveActorName(process.cwd(), options.by);
      const r = recordRequirementVerification(data, id, {
        result: options.result,
        kind: options.kind,
        by,
        note: options.note,
        evidence: options.evidence,
        session: currentSession(),
      });
      if (!r.ok) {
        failCode(lang, r.code, {
          not_found: t('req.err.notFoundTmpl', lang, { id }),
          invalid_status: t('req.verify.terminalTmpl', lang, { id, status: getRequirement(data, id)?.status ?? '' }),
          invalid_field: t('req.verify.invalidTmpl', lang),
        });
        return;
      }
      if (!saveOrFail(mgr, lang)) {
        return;
      }
      console.log(t('req.verify.doneTmpl', lang, { id, kind: options.kind, result: options.result, by }));
      // v1.6.0 / REQ-059 T8：验证记录写入成功即自动同步开发账本
      syncDevAfterWrite(process.cwd(), lang);
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
      // v1.5.6-stage-114：写前 preflight（legacy 三键：只放 `error` 值，不带 hint —— REV-008）；
      // `--into` 守卫已在前（ID / 空 --into 先报）
      const reject = (m: string): void => {
        if (asJson) failJson({ error: 'preflight-required' });
        else console.error(m);
      };
      if (!enforcePreflightOrFail(process.cwd(), lang, { reject })) return;
      // v1.5.17：同 req add —— 分配前把已归档需求最大号并入下限（禁 ID 复用）
      raiseRequirementSeqFloor(data, archivedRequirementMaxSeq(process.cwd()));
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
    .description('需求看板（按状态分组；8 组固定顺序 = REQ_STATUSES 声明序）')
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
      // 8 组固定顺序 = 状态值域声明序（v1.6.1 / REQ-063：新增 review_pending，旧 7 组一个不删）
      // 恒含空组（域外脏状态不渲染）
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
        if (a.id !== b.id) {
          // 第三排序键 = **数值**升序（v1.5.8 / REQ-030：字符串比较会让 REQ-1000 排在 REQ-999 之前）；
          // 解析失败退回字符串比较（异常 id 不崩、确定性不变）
          const an = reqIdSeq(a.id);
          const bn = reqIdSeq(b.id);
          if (an !== null && bn !== null && an !== bn) { return an - bn; }
          return a.id < b.id ? -1 : 1;
        }
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

  // ── req release-check <version> [--json] ──（v1.5.8 / REQ-030）
  req
    .command('release-check <version>')
    .description('发布门（软）：列出该版本的已完成 / 未完成 / 其它需求；只读、退出码恒 0')
    .option('--json', '以 JSON 输出 { schemaVersion, version, done, unfinished, counts }')
    .action((version: string, options: { json?: boolean }, command: Command) => {
      const lang = getCliLang(process.cwd());
      const asJson = asJsonOf(options, command);
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        failNoInit(lang, asJson);
        return;
      }
      const data = mgr.getData()!;
      // 只读保证：不 save / 不 appendLog / 零写盘；软门恒 exit 0（未完成需求只报告，不拒绝）
      const check = releaseCheckRequirements(data, version);
      if (asJson) {
        emitJson(withSchemaVersion({
          version: check.version,
          done: check.done.map((r) => r.id),
          unfinished: check.unfinished.map((r) => r.id),
          counts: check.counts,
        }));
        return;
      }
      console.log(t('req.releaseCheck.titleTmpl', lang, { version: check.version, total: String(check.counts.total) }));
      const section = (label: string, rows: RequirementData[]): void => {
        console.log(label);
        if (rows.length === 0) {
          console.log(t('req.releaseCheck.emptySection', lang));
          return;
        }
        for (const r of rows) {
          console.log(t('req.releaseCheck.itemTmpl', lang, { id: r.id, status: r.status, title: r.title }));
        }
      };
      section(t('req.releaseCheck.doneLabel', lang, { n: String(check.counts.done) }), check.done);
      section(t('req.releaseCheck.unfinishedLabel', lang, { n: String(check.counts.unfinished) }), check.unfinished);
      section(t('req.releaseCheck.otherLabel', lang, { n: String(check.counts.other) }), check.other);
      console.log(t('req.releaseCheck.countsTmpl', lang, {
        done: String(check.counts.done),
        unfinished: String(check.counts.unfinished),
        other: String(check.counts.other),
        total: String(check.counts.total),
      }));
      if (check.unfinished.length > 0) {
        console.log(t('req.releaseCheck.unfinishedHintTmpl', lang, { version: check.version }));
      }
    });

  // ── req rollover --from <version> --to <version> (--id <REQ> | --all) ──（v1.5.8 / REQ-030）
  req
    .command('rollover')
    .description('顺延未完成需求到新版本（改写 target_version + carried_from 溯源；仅非终态需求）')
    .requiredOption('--from <version>', '来源版本（如 v1.5.8）')
    .requiredOption('--to <version>', '目标版本（如 v1.6.0）')
    .option('--id <id>', '只顺延该需求（与 --all 互斥）')
    .option('--all', '顺延该版本全部未完成需求（与 --id 互斥）')
    .action((options: { from: string; to: string; id?: string; all?: boolean }) => {
      const lang = getCliLang(process.cwd());
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        failNoInit(lang, false);
        return;
      }
      const data = mgr.getData()!;
      // argument-shape 守卫（非业务校验）：--id 与 --all 必须且只能提供一个
      if ((options.id !== undefined) === (options.all === true)) {
        console.error(t('req.rollover.exclusiveTmpl', lang));
        process.exitCode = 1;
        return;
      }
      if (options.id !== undefined && !isValidReqId(options.id)) {
        console.error(t('req.invalidIdTmpl', lang, { input: options.id }));
        process.exitCode = 1;
        return;
      }
      // v1.5.6-stage-114：写前 preflight（参数 / ID 校验已在门前）
      if (!enforcePreflightOrFail(process.cwd(), lang)) return;
      // 命令层零校验：版本门 / 终态门 / 归属门 / carried_from 与审计全在引擎单点
      const r = rolloverRequirements(data, options.from, options.to, {
        ...(options.id !== undefined ? { id: options.id } : {}),
        all: options.all === true,
      });
      if (!r.ok) {
        failCode(lang, r.code, {
          not_found: t('req.err.notFoundTmpl', lang, { id: options.id ?? '' }),
          invalid_status: t('req.rollover.terminalTmpl', lang, {
            id: options.id ?? '',
            status: options.id !== undefined ? (getRequirement(data, options.id)?.status ?? '') : '',
          }),
          invalid_field: options.id !== undefined
            ? t('req.rollover.notInVersionTmpl', lang, {
              id: options.id,
              from: options.from,
              current: getRequirement(data, options.id)?.target_version ?? t('common.none', lang),
            })
            : t('req.rollover.invalidVersionTmpl', lang, { from: options.from, to: options.to }),
        });
        return;
      }
      if (r.moved.length === 0) {
        // no-op：不 save（revision 不变）
        console.log(t('req.rollover.noopTmpl', lang, { from: options.from }));
        return;
      }
      if (!saveOrFail(mgr, lang)) {
        return;
      }
      console.log(t('req.rollover.doneTmpl', lang, {
        count: String(r.moved.length),
        from: options.from,
        to: options.to,
      }));
      for (const moved of r.moved) {
        console.log(t('req.rollover.itemTmpl', lang, { id: moved.id, status: moved.status, title: moved.title }));
      }
    });

  // ── req plan <id> [--force] [--json] ──（v1.6.1 / REQ-064 A64.1）
  // 需求级计划从「照模板手写」变成一条命令生成：四节内容一律从需求正文派生（不编判据）。
  req
    .command('plan <id>')
    .description('生成需求级计划骨架（.openfeel/plan/reqs/REQ-NNN.plan.md；已存在默认拒绝，--force 覆盖）')
    .option('--force', '已存在时覆盖（会冲掉手写内容；默认拒绝且零写盘）')
    .option('--json', '以 JSON 输出 { schemaVersion, id, path, created, overwritten, lines }')
    .action((id: string, options: { force?: boolean; json?: boolean }, command: Command) => {
      const lang = getCliLang(process.cwd());
      const asJson = asJsonOf(options, command);
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        failNoInit(lang, asJson);
        return;
      }
      if (!isValidReqId(id)) {
        if (asJson) {
          failJson({ error: 'invalid-argument', field: 'id', value: id });
        } else {
          console.error(t('req.invalidIdTmpl', lang, { input: id }));
          process.exitCode = 1;
        }
        return;
      }
      const data = mgr.getData()!;
      const req_ = getRequirement(data, id);
      if (!req_) {
        if (asJson) {
          failJson({ error: 'not_found', id });
        } else {
          console.error(t('req.err.notFoundTmpl', lang, { id }));
          process.exitCode = 1;
        }
        return;
      }
      // v1.5.6-stage-114：写前 preflight（参数 / ID / 存在性校验已在门前）
      if (!enforcePreflightOrFail(process.cwd(), lang)) return;
      try {
        const result = writeRequirementPlanSkeleton(process.cwd(), toRequirementPlanSeed(req_), {
          force: options.force === true,
          by: resolveActorName(process.cwd(), undefined),
        });
        if (asJson) {
          const doc: Record<string, unknown> = {
            id: req_.id,
            path: result.path,
            created: result.created,
            overwritten: result.overwritten,
            lines: result.lines,
          };
          // v1.6.1 / REQ-065（REQ-064 A64.1 的 `replaced:true` 取证键）：
          // 只在**覆盖了已存在的计划**时末位追加条件键 `replaced:true`——
          // 新建路径的 6 键键集/键序与出口 #50 的冻结契约（`test/cli/json-contract.test.ts`）逐字不变，
          // 覆盖路径则同时给出 `overwritten`（语义等价）与 `replaced`（判据要求的键名）。
          if (result.overwritten) {
            doc.replaced = true;
          }
          emitJson(withSchemaVersion(doc));
        } else {
          console.log(result.created
            ? `已生成需求计划 ${req_.id}：${result.path}（${result.lines} 行）`
            : `已覆盖需求计划 ${req_.id}：${result.path}（${result.lines} 行）`);
        }
        // 写后自检（A64.1）：未写实说明需求正文摘要/验收仍是空壳——如实提示，不伪造内容
        if (!result.filled) {
          console.error(
            `注意：${req_.id} 的计划尚未通过写实判据（\`isRequirementPlanFilled\`）；`
            + '请先用 `req body` 补写 `## 摘要` / `## 目标与验收`，再 `req plan --force` 重新生成。',
          );
        }
      } catch (err) {
        if (err instanceof RequirementPlanFileError) {
          if (err.code === 'exists') {
            if (asJson) {
              // legacy 失败形态（`error` 恒 string，兼容既有消费方）+ 机器可读 `code`
              // （与 `error` 同值的稳定码；`errorKind:'refusal'` 由 failJson 统一追加在末尾）。
              failJson({
                error: 'plan_exists',
                code: 'plan_exists',
                id,
                path: getRequirementPlanRelPath(id),
                hint: 'use --force to overwrite',
              });
            } else {
              console.error(
                `需求计划已存在：${err.existingPath ?? ''}；如需覆盖请加 --force（会冲掉手写内容）。`,
              );
              process.exitCode = 1;
            }
            return;
          }
          if (asJson) {
            // 其它计划文件错误（如 invalid_field）：同样保留 legacy `error` 字符串，
            // 并追加机器可读 `code`（`errorKind:'refusal'` 由 failJson 统一追加在末尾）。
            failJson({ error: err.code, code: err.code, id });
          } else {
            console.error(err.message);
            process.exitCode = 1;
          }
          return;
        }
        failGeneric(lang, err);
      }
    });

  // ── req body <id> --section <name> (--text <md> | --file <path>) [--append|--replace] [--json] ──
  // v1.6.0-stage-132 / T2：需求正文**唯一写入口**（元信息小节受保护；每次写入追加 `## 变更记录`）
  // v1.6.1 / REQ-064 A64.2：新增 `--from <md>` —— 按 `##` 一次导入多节，元信息小节跳过并报告
  req
    .command('body <id>')
    .description('写入需求正文的业务小节（元信息小节受保护；每次写入追加变更记录）')
    .option('--section <name>', '小节名（如 摘要 / 目标与验收 / 问题 / 初步规划；与 --from 二选一）')
    .option('--from <path>', '从 Markdown 文件按 `##` 分节一次导入多个业务小节（与 --section/--text/--file 互斥）')
    .option('--text <md>', '小节正文（Markdown；与 --file 二选一）')
    .option('--file <path>', '从文件读取小节正文（与 --text 二选一；相对路径按项目根解析）')
    .option('--append', '追加到该小节末尾（缺省替换整节）')
    .option('--replace', '替换整节（缺省；与 --append 互斥）')
    .option('--json', '以 JSON 输出 { schemaVersion, id, section, path, lines, created }（--from 时为 { schemaVersion, id, sections }）')
    .action((id: string, options: { section?: string; from?: string; text?: string; file?: string; append?: boolean; replace?: boolean; json?: boolean }, command: Command) => {
      const lang = getCliLang(process.cwd());
      const asJson = asJsonOf(options, command);
      const mgr = createManager();
      if (!mgr.isLoaded()) {
        failNoInit(lang, asJson);
        return;
      }
      if (!isValidReqId(id)) {
        if (asJson) {
          failJson({ error: 'invalid-argument', field: 'id', value: id });
        } else {
          console.error(t('req.invalidIdTmpl', lang, { input: id }));
          process.exitCode = 1;
        }
        return;
      }
      const data = mgr.getData()!;
      const req_ = getRequirement(data, id);
      if (!req_) {
        if (asJson) {
          failJson({ error: 'not_found', id });
        } else {
          console.error(t('req.err.notFoundTmpl', lang, { id }));
          process.exitCode = 1;
        }
        return;
      }
      // argument-shape 守卫（非业务校验）：
      //   --from 独占（不与 --section/--text/--file 同用）；否则 --section 必填 + --text/--file 恰一；--append/--replace 互斥
      const hasFrom = options.from !== undefined;
      const hasText = options.text !== undefined;
      const hasFile = options.file !== undefined;
      const sectionName = options.section ?? '';
      if (hasFrom) {
        if (options.section !== undefined || hasText || hasFile) {
          if (asJson) {
            failJson({ error: 'invalid_field', id, field: 'from' });
          } else {
            console.error('--from 与 --section / --text / --file 互斥：一次只能选一种导入方式。');
            process.exitCode = 1;
          }
          return;
        }
        // --from 恒整节替换；--append / --replace 在该通道无意义，显式拒绝而不是静默忽略
        if (options.append === true || options.replace === true) {
          if (asJson) {
            failJson({ error: 'invalid_field', id, field: 'append' });
          } else {
            console.error('--from 恒整节替换：不要与 --append / --replace 同用。');
            process.exitCode = 1;
          }
          return;
        }
      } else {
        if (sectionName.trim() === '') {
          if (asJson) {
            failJson({ error: 'invalid_field', id, field: 'section' });
          } else {
            console.error('需要 --section <name>（或用 --from <file> 一次导入多节）。');
            process.exitCode = 1;
          }
          return;
        }
        if (!hasText && !hasFile) {
          if (asJson) {
            failJson({ error: 'empty_text', id, section: sectionName });
          } else {
            console.error(t('req.body.noTextTmpl', lang));
            process.exitCode = 1;
          }
          return;
        }
        if (hasText && hasFile) {
          if (asJson) {
            failJson({ error: 'invalid_field', id, section: sectionName, field: 'file' });
          } else {
            console.error(t('req.body.exclusiveTmpl', lang));
            process.exitCode = 1;
          }
          return;
        }
      }
      if (options.append === true && options.replace === true) {
        if (asJson) {
          failJson({ error: 'invalid_field', id, section: sectionName, field: 'append' });
        } else {
          console.error(t('req.body.flagExclusiveTmpl', lang));
          process.exitCode = 1;
        }
        return;
      }
      // v1.5.6-stage-114：写前 preflight（参数 / ID 校验已在门前）
      if (!enforcePreflightOrFail(process.cwd(), lang)) return;

      // ── --from：按 `##` 一次导入多节（A64.2；元信息小节跳过并报告，每节各追加一条变更记录） ──
      if (hasFrom) {
        try {
          const imported = importRequirementBodySections(process.cwd(), req_, {
            file: options.from as string,
            by: resolveActorName(process.cwd(), undefined),
          });
          if (imported.sections.length === 0) {
            if (asJson) {
              failJson({ error: 'invalid_field', id, field: 'from', detail: imported.skipped });
            } else {
              console.error(`未写入任何小节（元信息受保护 / 空白 / 名称非法）：${imported.skipped.join('、')}`);
              process.exitCode = 1;
            }
            return;
          }
          // v1.6.0 / REQ-059 T8：正文写入成功即自动同步开发账本（--json 的告警走 stderr，不污染 stdout）
          syncDevAfterWrite(process.cwd(), lang);
          if (imported.skipped.length > 0) {
            console.error(`已跳过小节：${imported.skipped.join('、')}（元信息受保护 / 空白 / 名称非法）`);
          }
          if (asJson) {
            emitJson(withSchemaVersion({ id: req_.id, sections: imported.sections }));
            return;
          }
          console.log(
            `已从 ${options.from as string} 导入 ${imported.sections.length} 个小节到 ${req_.id} 正文（${imported.path}）：`,
          );
          for (const section of imported.sections) {
            console.log(`  ${section.name}（${section.lines} 行${section.created ? '，新建' : ''}）`);
          }
          return;
        } catch (err) {
          if (err instanceof RequirementBodyUpdateError) {
            if (asJson) {
              failJson({ error: err.code, id, field: 'from' });
              return;
            }
            console.error(`导入失败：${err.message}`);
            process.exitCode = 1;
            return;
          }
          failGeneric(lang, err);
          return;
        }
      }

      try {
        const result = updateRequirementBody(process.cwd(), req_, {
          section: sectionName,
          ...(options.text !== undefined ? { text: options.text } : {}),
          ...(options.file !== undefined ? { file: options.file } : {}),
          append: options.append === true,
          replace: options.replace === true,
          createSectionIfMissing: true,
          by: resolveActorName(process.cwd(), undefined),
        });
        // v1.6.0 / REQ-059 T8：正文写入成功即自动同步开发账本（--json 的告警走 stderr，不污染 stdout）
        syncDevAfterWrite(process.cwd(), lang);
        if (asJson) {
          emitJson(withSchemaVersion({
            id: req_.id,
            section: result.section,
            path: result.path,
            lines: result.lines,
            created: result.created,
          }));
          return;
        }
        const actionKey = result.created
          ? 'req.body.actionCreated'
          : (options.append === true ? 'req.body.actionAppended' : 'req.body.actionReplaced');
        console.log(t('req.body.doneTmpl', lang, {
          id: req_.id,
          section: result.section,
          lines: String(result.lines),
          path: result.path,
          action: t(actionKey, lang),
        }));
      } catch (err) {
        if (err instanceof RequirementBodyUpdateError) {
          if (asJson) {
            failJson({ error: err.code, id, section: sectionName });
            return;
          }
          const key = err.code === 'protected_section'
            ? 'req.body.protectedTmpl'
            : (err.code === 'empty_text' ? 'req.body.emptyTmpl' : 'req.body.invalidFieldTmpl');
          console.error(t(key, lang, { id, section: sectionName }));
          process.exitCode = 1;
          return;
        }
        failGeneric(lang, err);
      }
    });
}
