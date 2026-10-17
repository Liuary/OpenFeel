# OpenFeel 1.2.3 / 1.2.4 补充材料（供 OpenFeel-DSH 合并到 `docs/CLI-REQUIREMENTS.md`）

> **状态**：已实现并验收（OpenFeel `v1.2.2` + `v1.2.3` + `v1.2.4`）
> **基线**：`v1.2.1` → 当前 `v1.2.4`
> **日期**：2026-10-17
> **权威契约**：OpenFeel 仓库 `docs/json-contract.md`
> **对应需求单**：OpenFeel-DSH `docs/CLI-REQUIREMENTS.md`（11 项 P0/P1/P2 已全部交付）+ ACTION-GUIDE A1~A5
>
> **边界声明**：本文档由 OpenFeel 仓库提供，供 OpenFeel-DSH **自行合并/取用**；
> OpenFeel 不直接修改 DSH 仓库内容。DSH 可将其作为 `CLI-REQUIREMENTS.md` 的补充章节，
> 或拆分为独立文档自行维护。文件名保留 `1.2.3` 以维持既有链接稳定，内容已增量至 v1.2.4。

---

## 1. 结论

OpenFeel-DSH 需求单中的 **11 项 CLI 需求全部落地**，并额外完成 4 项收口修复：

- 读命令不再需要解析中文文本；
- 「下一步该谁做」由 CLI 单一权威输出；
- 失败原因以稳定 `code` + `kind` 结构化给出；
- 适配器不再需要镜像 `PHASE_AGENT_MAP`。

DSH 适配器侧的对应改造（OUT-1）也已完成：`PHASE_AGENT` 本地镜像已退役，
调度字段改为消费 `flow next --json`；`errorFromResult` 改为消费错误 envelope。

---

## 2. 版本与交付范围

| 版本 | 阶段 | 内容 |
|---|---|---|
| `v1.2.2` | `stage-95` | JSON 契约基础设施、错误封装、`--version --json`、全局 `--project` |
| `v1.2.2` | `stage-96` | `flow next --json`、`flow status --json.stages[]` 调度属性、档位消歧 |
| `v1.2.2` | `stage-97` | 13 个读命令面 `--json`、`req list` 扩展、`flow archive --dry-run`、`archive <stage>` |
| `v1.2.2` | `stage-98` | 文档与版本收口、CHANGELOG、DSH 端到端验收 |
| `v1.2.3` | `stage-99` | 转出项补丁：并发 JSON 退出统一、`--review-tier` help、锁超时 E2E 钩子、`req` 过滤单点 |
| `v1.2.4` | `stage-100` | ACTION-GUIDE A1~A5：归档覆盖保护（`ARCHIVE_EXISTS` + `--force`）、`plan stage list` / `model list|get` / `flow retry` / `lint i18n|kb` / `roadmap show` 新 `--json`、`config get --all` |

**最终契约规模（v1.2.4）**：

- **40 个成功 `--json` 出口** / **41 个注册 `--json` 选项**（v1.2.3 为 33 / 34）
- 测试：**75 文件 / 1941 用例 / 0 failed / 0 skipped**
- `--version` = **1.2.4**

> 计数口径：`flow advance --json` 仅用于失败 envelope（成功仍为人类输出），**不计入** 40 个成功出口；`--version --json` 单列，也不计入 40。`lint i18n` 与 `lint kb` 是两个独立子命令，各计 1 个注册选项。

---

## 3. 新增与变更的 CLI 契约

### 3.1 `openfeel flow next [--json]`

适配器做「下一步该谁做」的首选调用。

```json
{
  "schemaVersion": 1,
  "stage": "v1.2.3-stage-99",
  "phase": "exec_running",
  "phaseLabel": "执行中",
  "responsibleAgent": "openfeel-executor",
  "workflowMode": "fast",
  "reviewTier": "lean",
  "effectiveReviewTier": "full",
  "legalNextPhases": ["review_pending"],
  "suggestedCommand": "openfeel flow advance --stage v1.2.3-stage-99 --to review_pending",
  "guards": [],
  "blockingReviews": []
}
```

| 字段 | 语义 |
|---|---|
| `stage` | 活跃阶段 ID（无活跃阶段时为 `'-'` 初始化占位） |
| `phase` / `phaseLabel` | 当前相位与本地化标签 |
| `responsibleAgent` | 该相位的负责 Agent（CLI 单一权威） |
| `workflowMode` | 阶段解析后的生效模式 |
| `reviewTier` / `effectiveReviewTier` | 展示档位 / `flow advance` 缺省生效档位（`full`） |
| `legalNextPhases` | **直接可达**下一相位；每一项均被 `flow advance` 接受 |
| `suggestedCommand` | 可直接执行的命令串；无合法目标时为 `null` |
| `guards` | 守卫提示（如 `auto_advance=disabled`、blocking REV、依赖未就绪） |
| `blockingReviews` | 当前阶段域内 blocking open REV |

**空态**：`phase` / `phaseLabel` / `workflowMode` / `reviewTier` / `effectiveReviewTier` 为 `null`，
`responsibleAgent` 为 `'feel'`，`legalNextPhases` / `blockingReviews` 为 `[]`，
`suggestedCommand` 为 `null`，`guards` 含 `noActiveStage`。

**语义边界**：`legalNextPhases` 是「直接可达」集合，是 `flow advance` 接受集合的子集；
多步目标（如 `done`）可能被 advance 接受，但不会出现在 `legalNextPhases` 中。

### 3.2 `flow status --json` 的 `stages[]`

既有 `id` / `phase` / `status` / `deps` / `ops` **键序与类型零改动**，末尾追加：

| 新增字段 | 说明 |
|---|---|
| `workflowMode` | 该阶段解析后的生效模式 |
| `requirementId` | 关联需求 ID（无则 `null`） |
| `reviewTier` | 展示档位 |
| `effectiveReviewTier` | `flow advance` 缺省生效档位（`full`） |
| `opsSummary` | `{ total, byState }`，与 `ops` 同源；空态 `{ total: 0, byState: {} }` |

一次调用即可为所有阶段构建调度视图，无需按阶段逐个调用 `flow mode`。

### 3.3 `flow phases --json` 的档位消歧

既有 7 键零改动，末位追加：

- `displayReviewTier`：与既有 `reviewTier` 同值（展示档位）
- `effectiveReviewTier`：`flow advance` 缺省生效档位，恒为 `full`

**只增不改**：既有 `reviewTier` 保留，适配器可继续读取。

### 3.4 读命令 `--json` 全量补全

以下命令现在均支持 `--json`（单文档、`schemaVersion` 首键）：

| 命令面 | 关键结构化字段 |
|---|---|
| `stage status [stageId]` | `stages[]` / 单阶段 `fields` / `tasks` / `blockedBy` |
| `flow recover` | `initialized` / `phase` / `currentOp` / `stageStatus` / `blockedBy` / `pendingTasks` / `stageStats` |
| `flow checkpoint list [stage]` | `stage` / `checkpoints[]` / `count` |
| `flow log --last <n>` | `count` / `entries[]`（`time` / `agent` / `action` / `detail`） |
| `project overview` | `project` / `dirs` / `stats` / `entries` / `techStack` |
| `knowledge search <q>` | 检索结果条目 |
| `knowledge list` / `index` / `dedup` | 知识库概览 / 索引 / 去重结果 |
| `config get` / `effective` | 值、生效值与来源 |
| `view list` | REV 条目（`blocking` 为布尔） |
| `plan scheme list [stage]` | op 列表与 `fill` 填充度 |

### 3.5 `req list --json` 扩展

每个需求新增：

```json
{
  "linkedStages": [{ "id": "v1.2.2-stage-95", "phase": "done" }],
  "progress": { "done": 3, "total": 4 }
}
```

零关联时 `linkedStages: []`、`progress: { "done": 0, "total": 0 }`。既有需求字段零破坏。

### 3.6 `flow archive <version> --dry-run --json`

新增判据明细：

```json
{
  "eligible": false,
  "unfinishedStages": ["v1.2.2-stage-98"],
  "blockingReviews": ["REV-98-006"]
}
```

- `eligible: true` 时两个数组为空；
- 保留 legacy `error` / `notDone` / `blockingOpen` 与 `errorKind`；
- `--dry-run` 零写盘。

### 3.7 `openfeel archive <stage> --json`

```json
{
  "schemaVersion": 1,
  "stage": "v1.2.2-stage-95",
  "archivePath": ".openfeel/log/archive-v1.2.2-stage-95.md",
  "opsCount": 4,
  "reviewsCount": 9,
  "knowledgeExtracts": 5
}
```

失败：`ARCHIVE_FAILED` / `kind=refusal` / exit 1；内部异常 `INTERNAL_ERROR` / `kind=internal` / exit 3。

### 3.8 `openfeel --version --json`

```json
{ "schemaVersion": 1, "version": "1.2.3", "node": "v24.18.1" }
```

不带 `--json` 时保持原纯文本输出。

### 3.9 全局 `--project <path>`

```bash
openfeel --project /path/to/project flow status --json
openfeel flow status --project /path/to/project --json
openfeel flow status --project=/path/to/project --json
```

- 等效于以该路径为 `cwd` 解析项目根；不传时仍用 `process.cwd()`；
- `knowledge dedup` 的本地 `--project` **保留**，与全局同名选项并行；
- 路径不存在 → `PROJECT_NOT_FOUND` / refusal / exit 1；文件路径 → `not-directory`；
- 语言与 `--log-file` 相对路径按目标项目/原始 cwd 的既定口径处理。

### 3.10 错误 envelope 与退出码

`--json` 失败时输出单文档：

```json
{
  "schemaVersion": 1,
  "error": {
    "code": "PHASE_TRANSITION_ILLEGAL",
    "kind": "refusal",
    "message": "…本地化文本…",
    "detail": { "from": "done", "to": "bogus", "stage": "v1.2.2-stage-98" }
  }
}
```

**退出码语义**：

| 退出码 | 含义 | `kind` |
|:--:|---|---|
| 0 | 成功 | — |
| 1 | 预期拒绝（门禁 / 相位非法 / 参数与用法错误） | `refusal` |
| 2 | 并发写冲突（flow.json 乐观锁，唯一可重试信号） | `refusal` |
| 3 | 内部错误（未捕获异常 / 内部故障） | `internal` |

**legacy 兼容**：

- 既有 `{ "schemaVersion": 1, "error": "…" }` 字符串载荷**保留**，仅在末尾追加 `errorKind`（`refusal|internal`）；
- `error` 类型恒为 `string`，既有键序不变；
- 双形态判别规则：`typeof doc.error === 'string'` → legacy；`object` → 新 envelope。

**稳定 code 示例**：`PHASE_TRANSITION_ILLEGAL`、`PHASE_PATH_NOT_FOUND`、`INVALID_ARGUMENT`、
`PROJECT_NOT_FOUND`、`NO_INIT`、`FLOW_CONCURRENT_CONFLICT`、`INTERNAL_ERROR`、
`ARCHIVE_FAILED`、`ARCHIVE_WRITE_FAILED`。

---

### 3.11 v1.2.4 A1~A5（DSH ACTION-GUIDE 收口）

**A1 `archive <stage> [--json] [--force]`**

```jsonc
// 已有归档且未 --force → 失败 envelope
{ "schemaVersion": 1, "error": { "code": "ARCHIVE_EXISTS", "kind": "refusal",
  "message": "……", "detail": { "stage": "v1.2.0-stage-78",
  "archivePath": "<abs>/.openfeel/log/archive-v1.2.0-stage-78.md" } } }   // exit 1，零写盘
```

- 零写盘：归档内容 SHA-256、`flow.json` revision、`log[]` 长度、KB 条目数均不变。
- 保护为**归档文件级**：`archive v1.2.0-stage-78` 与 `archive stage-78` 派生不同文件、互不触发。
- `--force` 走原写盘路径，成功出口 #33 六键不变。

**A2 `plan stage list --json`（#34）**

```json
{ "schemaVersion": 1, "stages": [ { "id": "v1.2.3-stage-99", "phase": "done",
  "status": "done", "deps": [], "workflowMode": "full", "opsTotal": 4, "opsDone": 4 } ],
  "count": 1 }
```

**A3 `model list|get --json`（#35/#36）**

```jsonc
// list
{ "schemaVersion": 1, "scope": "project", "agents": [ { "agent": "openfeel-executor",
  "provider": "deepseek", "model": "deepseek-flash", "source": "project" } ] }
// get
{ "schemaVersion": 1, "scope": null, "agent": "openfeel-executor",
  "provider": "deepseek", "model": "deepseek-flash", "source": "default" }
```

**A4 `flow retry` / `lint` / `roadmap show`（#37~#40）**

```jsonc
// flow retry --op <id>
{ "schemaVersion": 1, "op": "…", "attempts": 1, "maxAttempts": 3,
  "exhausted": false, "state": "failed" }
// lint kb|i18n（ok:false 仍为成功文档 + exit 1）
{ "schemaVersion": 1, "target": "kb", "ok": true, "issues": [ { "path": "…", "message": "…" } ] }
// roadmap show [version]（不传 version → null/[]）
{ "schemaVersion": 1, "version": "1.2.4",
  "milestones": [ { "title": "M54 …", "theme": "收口", "stage": "stage-100", "deliverable": "……" } ] }
```

**A5 `config get --all --json`**

```json
{ "schemaVersion": 1, "scope": "project",
  "defaults": { "execution_mode": "manual", "auto_advance": "enabled",
                "merge_mode": "manual", "workflow_mode": "full" } }
```

- 仅项目模式；`--all`+`--global` → `INVALID_ARGUMENT`（`all-global-conflict`）；`--all`+key → `all-with-key`。

---

## 4. DSH 适配器侧已完成（OUT-1）

| 文件 | 变更 |
|---|---|
| `plugin/lib/adapters/dashboard.js` | 删除 `PHASE_AGENT` / `PHASE_LABEL` 镜像；`readSnapshot` 优先并发调用 `flow next --json`，失败按 `AbortSignal` 规则降级到 `flow status` + `flow mode`；`focus` 字段直出 CLI |
| `plugin/lib/adapters/cli.js` | `errorFromResult` 优先解析 envelope 的 `error.code/kind/message/detail`；退出码 2 → refusal、3 → internal、1 按 kind；legacy / 无 JSON 保留启发式兜底 |
| `plugin/lib/tools/index.js` | 调度字段改用 CLI 权威值；本地提醒移入 `adapterHints` |
| `plugin/lib/surface/prompt.js` | 提示词口径同步 |
| `plugin/test/verify.js` | 增加「`flow next` 权威字段」断言 |
| `plugin/package.json` | `openfeel.requiresCli = ">=1.2.3"` |
| `plugin/README.md` / `README.md` / `docs/` | 更新消费口径与兼容说明 |

**验证结果**：

- `plugin/test/contract.js`：42/42
- `plugin/test/verify.js`：56/56（PATH shim 指向本地 1.2.3）
- `plugin/test/integration.js`：10/10
- 另用全局 1.2.1 验证降级路径成功（回退 `flow status`，不崩溃）

---

## 5. 兼容性

| 项目 | 结论 |
|---|---|
| 既有 18 个成功出口 | 字段零删除、零重排、类型零改；仅按 P2-1 增量补 `null` 占位 |
| `instructions --json` / `flow archive show --json` | 首键补 `schemaVersion`（有意增量，已登记） |
| 退出码 0/1/2 | 语义不变；新增 3 仅用于内部错误 |
| legacy 错误载荷 | 保留原类型与键序，仅末尾追加 `errorKind` |
| `knowledge dedup --project` | 本地声明保留，全局同名选项并行 |
| 人类输出 | 除已登记帮助行外逐字不变 |
| phase 枚举 / 转移表 | 15 项不变；本版不新增、不裁剪边 |
| 依赖 | 无新增第三方依赖 |

---

## 6. 其他适配器迁移清单

1. **不要镜像 `PHASE_AGENT_MAP`**：消费 `flow next --json.responsibleAgent`。
2. **不要解析中文文本**：读命令均有 `--json`；失败读 `error.kind` / `error.code`。
3. **不要用「有无堆栈」分类失败**：`kind` 为分类权威，退出码为冗余信号。
4. **单进程多项目**：使用全局 `--project`，不要改 `process.cwd()`。
5. **`flow next` 空态**：按 §3.1 处理 `null` / `[]` / `noActiveStage`。
6. **`flow advance --json`**：仅失败 envelope，成功仍为人类输出；不要把它当作成功 JSON 出口。
7. **档位**：展示用 `reviewTier` / `displayReviewTier`；推进决策用 `effectiveReviewTier`。

---

## 7. 验收与复现

```bash
# 版本
openfeel --version
openfeel --version --json

# 决策权威
openfeel flow next --json
openfeel flow status --json
openfeel flow phases --json

# 读命令（示例）
openfeel stage status --json
openfeel flow recover --json
openfeel knowledge list --json
openfeel req list --json

# 错误 envelope
openfeel flow advance --stage <done-stage> --to bogus --dry-run --json
# → PHASE_TRANSITION_ILLEGAL / refusal / exit 1

# 版本归档判据
openfeel flow archive <version> --dry-run --json
```

OpenFeel 侧最终门禁（v1.2.4）：75 文件 / 1941 用例 / 0 failed；tsc 0；lint i18n 通过；
lint kb 0 过期；build ×2 幂等；`--version` = 1.2.4；`dsh/` 零 diff。

---

## 8. 已知边界 / 未做

1. **`flow advance --json` 不是成功出口**：成功仍打印人类文本；适配器如需成功结果，应重新读取 `flow next` / `flow status --json`。
2. **`legalNextPhases` ⊆ advance 接受集合**：多步目标不会出现在直接可达集合中。
3. **锁等待超时**：E2E 使用 `OPENFEEL_TEST_MODE=1` 的测试 seam；生产路径仍归 `INTERNAL_ERROR` / internal / exit 3。
4. **未 `npm publish`**：本次仅 push 到 GitHub `master`；全局 CLI 由本地构建安装为 1.2.3。
5. **OpenFeel-DSH 不是 git 仓库**：适配器改动已落盘，但没有对应 commit/push。
6. **DSH 文档中的历史需求单**：`CLI-REQUIREMENTS.md` 保留原文，作为需求溯源；实现状态以本文档为准。
7. **归档保护为文件级（v1.2.4）**：短名/全名别名派生不同目标文件、互不触发；跨别名保护不在本版范围。
8. **`lint --json` 退出码（v1.2.4）**：`ok:false` 仍输出成功文档（单文档、无 `error` 键），但退出码保持 **1** 门禁语义；适配器应读 `ok` 而非仅看退出码。
9. **`config get --all` 仅项目模式（v1.2.4）**：`--all` 与 `--global` / 位置 key 组合返回 `INVALID_ARGUMENT`；全局全量仍用 `config get --global --json` 的 `values`。

---

## 9. 参考

- OpenFeel 契约：[`docs/json-contract.md`](json-contract.md)
- 需求原文：OpenFeel-DSH 仓库 `docs/CLI-REQUIREMENTS.md`（由 DSH 自行维护）
- DSH 适配器说明：OpenFeel-DSH 仓库 `plugin/README.md`（由 DSH 自行维护）
- 兼容性说明：OpenFeel-DSH 仓库 `docs/compat/kb-skills.md`（由 DSH 自行维护）
- OpenFeel 版本提交：
  - `v1.2.2` 阶段归档：`25ebc4e` / `87df0b7` / `cdef4ae` / `861f0b5`
  - `v1.2.3` 阶段归档：`ea9aa68`；版本分片与记忆：`c05a420`
