# v1.5.0-stage-108 计划 — 工作流瘦身（状态 / 日志 / 记忆）

- **阶段**：`v1.5.0-stage-108`（fast；行为契约变更 → 次版本 1.5.0）
- **关联需求**：REQ-009
- **基线**：v1.4.0（HEAD `06f0a29`）；测试 80/2013；dsh 42+87+55+10=194
- **用户诉求**：日志/写状态消耗 token 与时间、经常空转；只有 Feel 写状态；日志不强制；交接文档即可；子 agent 不读写 last 文件；last 等状态文件改为「开始 / 转折 / 结束」节点更新 + CLI 定期检查（默认 30 分钟）触发。

## 一、状态归属（Only-Feel）

- **唯一写者**：Feel / 主会话。
- **子 agent 明确禁止**：读/写 `dev_last*`、`.openfeel/dev/current.md`、`status.md`、`flow.json`；上下文只从调度 prompt / 交接文档（plan / op / REV）获取；产出以**返回摘要 + 文件**交接。
- 落点：`agents-md/{zh,en}.md`、`claude/constraint/{zh,en}.md`、`opencode|claude/agents/*/feel.md`、全部子 agent 模板（一句总则）、DSH `<feel_mode>` 提示段。

## 二、日志降级（brief）

- **flow.json.log**：保留最近 **200** 条（`appendLog` 截断），仅 `time/agent/action/detail` 一行式；不再要求逐操作手写日志。
- **openfeel-logging skill**：改写为「默认不写日志；仅在跨会话/公共事件写一条 ≤3 行摘要」；删除「必录事件清单 / 逐阶段实时写入 / 禁止事项」等强制流水账；保留归档机械核对清单（命令化）。
- **openfeel-memory skill**：改写为「默认不加载、不写回」；仅在 `recover` / 用户要求交接时读；删除「会话结束前必须写 dev_last / 阶段结束清单」；保留 A9 锁协议（仅在确实写时使用）。
- **dev/current.md**：降级为可选，不再要求维护（模板保留）。

## 三、dev_last 节点 + 30 分钟 CLI 同步

- 新 core `src/core/dev-status.ts`：
  - `.openfeel/dev/.sync.json`：`{version,last_sync,interval_minutes:30}`；
  - `getDevStatus()`：due、活跃阶段/需求、最近操作；
  - `syncDevStatus()`：只替换 `dev_last.md` 内 `<!-- openfeel:auto:begin/end -->` 受管块（CLI 简要状态），不碰手写内容；
  - `isSyncNodePhase()`：`exec_running` / `review_passed` / `archiving` / `done`。
- CLI `openfeel dev sync` / `openfeel dev status`（**无 --json**，零 JSON 契约变更）。
- `flow advance` 成功后自动同步：首次 / 超过 30 分钟 / 节点相位；失败不影响推进。
- 适配器：`feel_next` / `feel_status` 增加 `statusSync`（due、lastSync、intervalMinutes），提示段要求：`due` 时 Feel 只更新**交接摘要**（≤5 行）并执行一次 `dev sync`，不写流水账。
- 子 agent 不读 `dev_last`；交接信息由 Feel 在派发 prompt 里带。

## 四、涉及文件

- `src/core/dev-status.ts`（新）、`src/core/flow-manager.ts`（log cap）、`src/commands/dev.ts`（新）、`src/cli/index.ts`、`src/commands/flow.ts`（自动同步）
- `dsh/lib/adapters/dev-status.js`（新）、`dsh/lib/tools/index.js`、`dsh/lib/surface/prompt.js`
- 模板：agents-md ×2、claude constraint ×2、opencode/claude feel ×4、archiver ×4、skills（memory / logging / workspace / context-hygiene / recover）
- 测试：`test/core/dev-status.test.ts`、`test/commands/dev.test.ts`、dsh `test/verify.js`（statusSync + 提示段）
- 版本 1.5.0 收口：CHANGELOG / VERSIONS / README / GETTING_STARTED / cli-usage skill / dsh README/ADAPTER

## 五、验收

- a) `dev sync` 生成/更新 AUTO 块与 `.sync.json`；再次 sync 不重复块、手写内容保留。
- b) 30 分钟内 `due=false`；改 `.sync.json` 旧时间后 `due=true`。
- c) `flow advance` 后自动同步（节点相位）；`.sync.json.last_sync` 前进。
- d) `feel_next`/`feel_status` 返回 `statusSync`；DSH 提示段含「Only-Feel / 子 agent 禁读写 / 30 分钟」。
- e) 全量测试 + tsc + i18n + kb + dsh + build ×2 绿；`--version` 1.5.0。

## 六、边界

- 不改相位机 / 审查 / 归档语义；不删 `dev_last.md`（只改写入责任与频率）。
- 不新增 JSON 出口（`dev` 无 `--json`）；注册选项不变。
- 日志截断只保留最近 200 条，不迁移历史。
