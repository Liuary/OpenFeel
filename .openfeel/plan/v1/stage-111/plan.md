# v1.5.3-stage-111 计划 — 批次：派发契约 + 恢复包 + 结构化交接 + 同步去重

- **阶段**：`v1.5.3-stage-111`（fast；**批次发布：全部完成才发 1.5.3，中间不发小版本**）
- **关联需求**：REQ-012
- **基线**：v1.5.2（HEAD `00fbfc3`）；82/2021；dsh 42+91+58+10=201
- **依据**：`docs/research/dispatch-persistence-2026-10-31.md`（含 Codex 评审取舍）
- **目标**：让「派发—返回—恢复」有硬契约，减少主会话上下文与跨会话重建成本；发布节奏改为批次。

## 1. 派发/返回契约（P0-2）

- 新增 `dsh/lib/adapters/dispatch.js`：`buildDispatchTemplate(snapshot)` 生成紧凑任务信封：
  `goal`（目标）/ `inputs`（只给需要的文件）/ `boundaries`（可写范围；**禁止读** `dev_last*` / `current.md` / `status.md` / `flow.json`）/ `returnFormat`（≤10 行：结论 / 改动 / 验证 / 阻塞；文件路径而非全文）。
- `feel_next` 返回 `dispatch`（当前阶段/模式感知的模板）；DSH 提示段要求 Feel 按模板派发，子 agent 按格式返回。
- `openfeel-delegation` skill 增补同一契约；子 agent 模板不改（避免 10 份重复），以 delegation skill + 派发 prompt 为准。

## 2. 恢复包（P0-3）

- 新增 `dsh/lib/adapters/recovery.js`：只读 `flow.json` + `dev_last.md`，输出
  `{ lastTransition, handoff, nextAction }`（handoff 提取「交接摘要」/「公共交接区」原文，截断 ≤600 字）。
- `feel_status` 返回 `recovery`；`feel_next` 的 plan 也带 `recovery`。
- 新会话恢复路径固定为：`feel_status`（1 次）→ 需要细节再看当前 stage 的 plan/op（≤1 次）；不再启动即读 `dev_last` 全文。

## 3. 结构化交接 + 同步去重（P1-1）

- `dev-status.ts` 的 AUTO 块追加固定键（由 CLI 从 flow 推导，模型只补 `next`/`block`）：
  `- 上次：\`action\` @ time`、`- 下一步：{next}`、`- 阻塞：{block}`。
- `openfeel dev sync` 在 AUTO 内容未变化时**不重写 dev_last**（仅刷新 `.sync.json`），减少无意义写与审计噪音。
- `openfeel-memory` 的交接摘要模板改为 `done / next / block` 三行固定键。

## 4. 发布节奏（流程策略）

- `docs/VERSIONS.md` 增加「发布节奏」：**批次发布**——小功能合并到同一 minor/patch，禁止单功能即发版；每个批次开始即锁定范围，完成门禁后统一 push + CI publish。
- 本阶段只在全部四项完成、门禁通过后发 **1.5.3**；不发布 1.5.3-rc/中间版本。

## 涉及文件

- `dsh/lib/adapters/dispatch.js`（新）、`dsh/lib/adapters/recovery.js`（新）、`dsh/lib/tools/index.js`、`dsh/lib/surface/prompt.js`
- `src/core/dev-status.ts`、`src/core/templates-data/skills/openfeel-delegation/SKILL.md`、`openfeel-memory/SKILL.md`
- 测试：`dsh/test/verify.js`、`test/core/dev-status.test.ts`、guard 回归
- 文档：`docs/VERSIONS.md`、`docs/research/...`、README/CHANGELOG、dsh README/ADAPTER、`docs/commands.md`

## 验收

- a) `feel_next.dispatch` 含 goal/inputs/boundaries/returnFormat，boundaries 明确禁止子 agent 读状态文件；提示段含派发/返回规则。
- b) `feel_status.recovery` 含 `lastTransition`、`handoff`（≤600 字）、`nextAction`；无 dev_last 时降级不报错。
- c) `dev sync` 第二次运行内容不变 → 不重写 dev_last（mtime 不变），`.sync.json` 刷新；AUTO 块含固定键。
- d) 门禁：82 文件全绿、dsh 201+、tsc/i18n/kb、build ×2；`--version` 1.5.3；单次发布。
- e) 发布策略文档落地：批次发布规则可被下个版本引用。
