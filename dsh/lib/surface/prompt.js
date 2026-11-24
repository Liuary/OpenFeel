/**
 * OpenFeel × DSH 适配器 — 系统提示段落
 *
 * 本段落只在 Feel 模式启用时注入，用来教会 agent **OpenFeel 的纪律**，
 * 而不是重复工具说明。
 *
 * v1.6.0 / T10（REQ-060）：按 plan §5.1 重写。
 * - 正文压到 **≤1000 字符 / ≤20 行**（渲染后总数含 Free Mode 附录 ≤1200，A10 判据）；
 * - 只留三件事：角色、三个可判定检查点（条件 → 动作 → 拒绝形态）、一句兜底；
 * - 版本号 / 退出码 / shell 档位 / 15 相位表 / 模式表 / 重复细则**全部移出**
 *   （去向：`feel_flow action=phases`、`feel_next().dispatch`、skill 渐进披露）。
 *
 * 正文常量 `FEEL_BODY_ZH` / `FEEL_BODY_EN` 是**单一源**：五处副本
 * （`src/core/template-loader.ts` 与 claude/opencode 的四份 `feel.md`）用
 * `<!-- feel-prompt-parity:begin/end -->` 包住同一段文本，
 * `test/cli/feel-prompt-parity.test.ts` 断言 5 处副本 sha256 与源一致。
 */

/** 段落放置顺序：紧跟工具说明，位于长上下文之前。 */
export const FEEL_PROMPT_ORDER = 40;

/** 段落名（稳定标识；同层重名会抛错）。 */
export const FEEL_PROMPT_NAME = 'feel-mode';

/**
 * 中文正文（单一源；四份副本逐字镜像）。
 *
 * 三个检查点按「条件 → 动作 → 拒绝形态」写死，不留「建议 / 好习惯」这类不可判定的措辞。
 * @type {string}
 */
export const FEEL_BODY_ZH = `## 你的角色：调度者，不是执行者
写文件 / 改代码 / 跑测试都由子 agent 完成；你只判断该谁做、派发、记账、裁决。

## 三个检查点（条件 → 动作 → 拒绝形态）
1. 无开启阶段或没有需求 → 先 \`feel_stage action=add\`，再 \`feel_req action=add\`（**必带 \`summary\` + \`goal\` + \`acceptance\`**，否则 \`start\` 被正文门拦 \`REQ_BODY_GATE\`）；写入被拒即 \`no active stage\`。
2. 需求没有 \`.openfeel/plan/reqs/REQ-NNN.plan.md\`（或仍是占位空壳）→ 不执行：先补正文（\`feel_req action=body\`）与需求级计划；否则被拒 \`REQ_PLAN_GATE\` / \`STAGE_PLAN_GATE\`。
3. 要执行任何一步 → 必须派发子 agent（planner 定计划 / executor 执行 / reviewer 审查）并用 \`feel_dispatch\` 记账，主会话只收 ≤10 行回报；主会话直接改仓库即违规（台账无记录 = 未派发）。

## 兜底
不确定时调 \`feel_status\` / \`feel_next\`，不要凭记忆；禁手改 \`flow.json\` / \`status.md\`。
`;

/**
 * 英文正文（与中文同构；单一源）。
 * @type {string}
 */
export const FEEL_BODY_EN = `## Your role: orchestrator, not implementer
Subagents write files, edit code and run tests; you decide who acts, dispatch, log and judge.

## Three checkpoints (condition → action → refusal)
1. No open stage or requirement → \`feel_stage action=add\`, then \`feel_req action=add\` **with \`summary\` + \`goal\` + \`acceptance\`** (else \`start\` is refused by \`REQ_BODY_GATE\`); writes denied = \`no active stage\`.
2. No \`.openfeel/plan/reqs/REQ-NNN.plan.md\` (or placeholder) → stop; write body + plan first; else \`REQ_PLAN_GATE\` / \`STAGE_PLAN_GATE\`.
3. Before executing → dispatch a subagent (planner / executor / reviewer) and log it with \`feel_dispatch\`; main session gets ≤10 lines; direct repo edits = violation.

Unsure? \`feel_status\` / \`feel_next\`; never memory-only. Never hand-edit \`flow.json\` / \`status.md\`.
`;

/**
 * 生成系统提示段落正文。
 *
 * @param {object} [options]
 * @param {string} [options.projectRoot] 当前项目根（用于指路）。
 * @param {boolean} [options.detected] 是否检测到 .openfeel/。
 * @param {string} [options.language] 'zh-CN' | 'en'。
 * @returns {string}
 */
export function renderFeelPrompt(options = {}) {
  const language = options.language ?? 'zh-CN';
  // v1.5.17：feel_mode=disabled → 软关闭（只放松流程强制；硬门与写入门禁不变）
  const feelDisabled = options?.feelMode?.value === 'disabled';
  const merged = { ...options, feelDisabled };
  if (language === 'en') return renderEnglish(merged);
  return renderChinese(merged);
}

/**
 * 自由模式节（中文；v1.5.17；v1.6.0 压到 ≤120 字符）。
 *
 * 只放松「流程强制」：是否建需求/阶段由 AI 自行判断、可直接干活；
 * 状态机 / done 门 / 阶段验证 / 归档判据 / blocking REV / 写入门禁全部保留。
 * @returns {string}
 */
function renderFreeModeChinese() {
  return `## Free Mode（feel_mode=disabled）
流程与检查点可选、可直接干活（写入门禁仍生效）；禁手改 \`flow.json\`/\`status.md\`；\`done\` 门/归档判据/blocking REV 不变。`;
}

/**
 * 自由模式节（英文；v1.5.17）。
 * @returns {string}
 */
function renderFreeModeEnglish() {
  return `## Free Mode (feel_mode=disabled)
optional; direct work OK (guard stays); never edit state files; gates unchanged.`;
}

/**
 * 生成「未初始化工作区」的短 bootstrap 段落。
 *
 * 只在 `activation=auto` 且 `resolveWorkspace().initialized === false` 时注入；
 * 不展开完整 Feel 纪律，避免把任意目录都灌成流程提示。
 *
 * @param {object} [options]
 * @param {string} [options.projectRoot]
 * @param {'zh-CN'|'en'} [options.language]
 * @param {'off'|'project'|'always'} [options.enforce]
 * @returns {string}
 */
export function renderBootstrapPrompt(options = {}) {
  const language = options.language ?? 'zh-CN';
  const enforce = options.enforce === 'off' || options.enforce === 'project' || options.enforce === 'always'
    ? options.enforce
    : 'always';
  return language === 'en' ? renderBootstrapEnglish(enforce, options.projectRoot) : renderBootstrapChinese(enforce, options.projectRoot);
}

/**
 * 未初始化 bootstrap（中文）。
 * @param {'off'|'project'|'always'} enforce
 * @param {string} [projectRoot]
 * @returns {string}
 */
function renderBootstrapChinese(enforce, projectRoot) {
  const where = typeof projectRoot === 'string' && projectRoot !== '' ? `（\`${projectRoot}\`）` : '';
  const writeRule = enforce === 'always'
    ? '- 写文件（代码/文档）：默认 `enforce=always`，写入门禁会**拒绝**，直到运行 `openfeel init` 并建立需求/阶段；或请用户把 profile 的 `enforce` 改为 `project` / `off`。'
    : enforce === 'project'
      ? '- 写文件（代码/文档）：当前 `enforce=project`，非 OpenFeel 工作区不拦截；建议先 `openfeel init` → `feel_req add` → `feel_stage add`。'
      : '- 写文件（代码/文档）：当前 `enforce=off`，不拦截；建议先 `openfeel init` → `feel_req add` → `feel_stage add`。';

  return `<feel_mode>
OpenFeel 未初始化：当前工作区尚未检测到 \`.openfeel/\`${where}。

## 只读任务
- 只读任务可直接进行。

## 写文件
${writeRule}
- 用户要求使用 OpenFeel 时：先确认，再 \`openfeel init\` → \`feel_req add\` → \`feel_stage add\`。
- 不要假装 Feel 模式已激活；不要手改 \`.openfeel/flow.json\` / \`status.md\`。
</feel_mode>`;
}

/**
 * 未初始化 bootstrap（英文）。
 * @param {'off'|'project'|'always'} enforce
 * @param {string} [projectRoot]
 * @returns {string}
 */
function renderBootstrapEnglish(enforce, projectRoot) {
  const where = typeof projectRoot === 'string' && projectRoot !== '' ? ` (${projectRoot})` : '';
  const writeRule = enforce === 'always'
    ? '- Writing files (code/docs): the default `enforce=always` write guard will **deny** until you run `openfeel init` and create a requirement/stage; or ask the user to set the profile `enforce` to `project` / `off`.'
    : enforce === 'project'
      ? '- Writing files (code/docs): `enforce=project` does not intercept non-OpenFeel workspaces; prefer `openfeel init` → `feel_req add` → `feel_stage add` first.'
      : '- Writing files (code/docs): `enforce=off` does not intercept; prefer `openfeel init` → `feel_req add` → `feel_stage add` first.';

  return `<feel_mode>
OpenFeel is not initialized: no \`.openfeel/\` detected in this workspace${where}.

## Read-only work
- Read-only work may proceed directly.

## Writing files
${writeRule}
- If the user wants OpenFeel: confirm first, then \`openfeel init\` → \`feel_req add\` → \`feel_stage add\`.
- Do not pretend Feel mode is active; never hand-edit \`.openfeel/flow.json\` / \`status.md\`.
</feel_mode>`;
}

/**
 * 中文段落。
 * @param {{ projectRoot?: string, detected?: boolean, feelDisabled?: boolean }} options
 * @returns {string}
 */
function renderChinese(options) {
  const where = options.detected === true && options.projectRoot !== undefined
    ? `当前项目：\`${options.projectRoot}\`（已初始化 \`.openfeel/\`）。`
    : '当前工作区尚未检测到 `.openfeel/`：若用户要求使用 Feel 流程，先提示运行 `openfeel init`。';
  const status = options.detected === true
    ? (options.feelDisabled === true ? 'Free Mode（自由模式）已启用' : 'Feel Mode（流程模式）已启用')
    : 'Feel 模式未初始化';
  // 空行口径（v1.5.17 回归锁定，v1.6.0 保持）：
  // - enabled：where 行后恰一个空行接正文；
  // - disabled：where → 空行 → Free Mode 节 → 空行 → 正文。
  const freeMode = options.feelDisabled === true ? `\n${renderFreeModeChinese()}\n` : '';
  return `<feel_mode>
${status}：本会话在 OpenFeel 流程治理下工作。${where}
${freeMode}
${FEEL_BODY_ZH}</feel_mode>`;
}

/**
 * 英文段落。
 * @param {{ projectRoot?: string, detected?: boolean, feelDisabled?: boolean }} options
 * @returns {string}
 */
function renderEnglish(options) {
  const where = options.detected === true && options.projectRoot !== undefined
    ? `Project: \`${options.projectRoot}\` (initialized \`.openfeel/\`).`
    : 'No `.openfeel/` detected in this workspace: if the user asks for the Feel process, suggest `openfeel init` first.';
  const status = options.detected === true
    ? (options.feelDisabled === true ? 'Free Mode is active' : 'Feel Mode is active')
    : 'Feel mode is not initialized';
  const freeMode = options.feelDisabled === true ? `\n${renderFreeModeEnglish()}\n` : '';
  return `<feel_mode>
${status}: this session works under OpenFeel process governance. ${where}
${freeMode}
${FEEL_BODY_EN}</feel_mode>`;
}
