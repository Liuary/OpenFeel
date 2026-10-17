# OpenFeel × DSH — OpenFeel 侧操作指南

> **读者**：OpenFeel 本体维护方
> **来源**：DSH 适配器（`OpenFeel/dsh/`）在 v1.2.3 上的实测复核
> **日期**：2026-10-17 ｜ **基线**：OpenFeel `1.2.3` / DSH `0.2.0-rc.2`
> **权威契约**：[`../docs/json-contract.md`](../docs/json-contract.md)
>
> **一句话**：11 项需求已确认交付，适配器工作正常。剩余 **5 项待办**（1 项数据安全 P1、
> 2 项高频 `--json` P1、2 项 P2），以及 **4 条边界约定**需要 OpenFeel 侧遵守。

---

## 目录

- [1. 现状基线](#1-现状基线)
- [2. 待办总览](#2-待办总览)
- [3. A1（P1）`archive <stage>` 覆盖保护](#3-a1p1archive-stage-覆盖保护)
- [4. A2（P1）`plan stage list --json`](#4-a2p1plan-stage-list---json)
- [5. A3（P1）`model list|get --json`](#5-a3p1model-listget---json)
- [6. A4（P2）`flow retry` / `lint` / `roadmap show --json`](#6-a4p2flow-retry--lint--roadmap-show---json)
- [7. A5（P2）`config get --all --json`](#7-a5p2config-get---all---json)
- [8. 边界约定（请勿做）](#8-边界约定请勿做)
- [9. 已知边界（无需改动）](#9-已知边界无需改动)
- [10. 交付后 DSH 侧会做什么](#10-交付后-dsh-侧会做什么)
- [11. 验收与自测](#11-验收与自测)

---

## 1. 现状基线

| 项 | 值 |
|---|---|
| OpenFeel 版本 | `1.2.3`（`openfeel --version --json` 实测） |
| 成功 `--json` 出口 | **33**（契约 §5 冻结表） |
| 适配器已消费 | **25** 个出口（`cli.json` 调用点 25 处） |
| 适配器文本回显 | **8** 处 —— 其中 **7** 处因 6 个命令面缺 `--json`，1 处为 `instructions` 的 XML 默认形态（合理） |
| 适配器验证 | contract 42/42、verify 58/58、integration 10/10 = **110 断言全绿** |
| 适配器位置 | `OpenFeel/dsh/`（与 `claude/`、`kilo/` 同级的一等适配器） |

**为什么要关心文本回显那 7 处**：适配器要把结构化结果交给模型。落地为人类中文文本后，
只能整段回显——不可筛选、不可断言、换语言即坏、且 token 成本高。这也是
DSH 需求单 P0-2「读命令不再需要解析中文文本」的初衷。

---

## 2. 待办总览

| ID | 事项 | 优先级 | 影响 | 完成后收益 |
|---|---|:--:|---|---|
| **A1** | `archive <stage>` 覆盖既有归档摘要 | **P1** | **数据丢失** | 审计链安全 |
| **A2** | `plan stage list --json` | **P1** | 适配器 2 处文本 | `feel_stage list` / `feel_plan stage_list` 结构化 |
| **A3** | `model list` / `model get --json` | **P1** | 适配器 2 处文本 | `feel_model list/get` 结构化 |
| **A4** | `flow retry` / `lint` / `roadmap show --json` | P2 | 适配器 3 处文本 | 低频面结构化 |
| **A5** | `config get --all --json` | P2 | 无 key 时拒绝 | 一次取全量配置 |

> 全部 5 项都不阻塞交付。**A1 建议优先**，因为它是唯一会造成不可逆数据丢失的问题。

---

## 3. A1（P1）`archive <stage>` 覆盖保护

### 现象

对一个**已有归档**的阶段重跑 `openfeel archive <stage>`，会**静默覆盖**既有归档摘要：

```bash
openfeel archive v1.2.0-stage-78
```

实测后果（DSH 侧一次误操作取证）：

```
.openfeel/log/archive-v1.2.0-stage-78.md
  覆盖前：115 行（阶段目标 / 操作产出表 / REV 处置等人工整理内容）
  覆盖后： 20 行（自动生成的存根）

.openfeel/flow.json
  meta.revision      1288 → 1289
  log[] 追加一条     action: "archive_stage"
```

- **无任何提示**表明将覆盖既有内容；
- **无 `--force` 门槛**，重复执行即重复覆盖；
- **不可逆**——被覆盖的人工内容无法从 CLI 侧恢复。

### 为什么算缺陷

阶段摘要是审计链的一部分。`docs/compat` 与 `flow.json` 的 `log[]` 都会引用它，
但内容一旦被压成存根，后续任何「回看这个阶段当时做了什么」的诉求都失效。
这与 OpenFeel 自身的「归档即固化」语义相冲突：一个归档动作不应销毁另一个归档的产物。

### 建议修复（任选其一，按推荐序）

1. **拒绝覆盖 + `--force`**（最小改动、最安全）
   目标文件已存在时：`exit 1`，`code: "ARCHIVE_EXISTS"`，`kind: "refusal"`，**零写盘**；
   显式 `--force` 才覆盖。
2. **合并写入**：保留既有正文，追加本次产出段落（如 `## 重新归档（{date}）`）。
3. **时间戳文件名**：写入 `archive-<stage>-<timestamp>.md`，并在 `index.md` 登记版本，
   既有文件不动。

### 验收标准

```bash
# 1) 已有归档时拒绝，且零写盘
openfeel archive v1.2.0-stage-78 --json
#   期望：exit 1 / code=ARCHIVE_EXISTS / kind=refusal
#   期望：.openfeel/log/archive-v1.2.0-stage-78.md 的 mtime 与内容不变
#   期望：flow.json revision 不变

# 2) 显式 force 才覆盖
openfeel archive v1.2.0-stage-78 --json --force
#   期望：exit 0 / 返回 outlet #33 五键文档

# 3) 未归档阶段正常执行（回归）
openfeel archive <某个没有归档文件的阶段> --json
#   期望：exit 0，行为与现状一致
```

> 若选方案 2 或 3，请同步更新 [`../docs/json-contract.md`](../docs/json-contract.md)
> 的 outlet #33（`archivePath` 语义与 `knowledgeExtracts` 变更）。

---

## 4. A2（P1）`plan stage list --json`

### 现象

```bash
openfeel plan stage list --json
# exit 1
# { "schemaVersion": 1, "error": { "code": "INVALID_ARGUMENT", "kind": "refusal",
#   "message": "参数或用法错误：error: unknown option '--json'",
#   "detail": { "commanderCode": "commander.unknownOption" } } }
```

### 影响

适配器两处调用受影响（同一命令）：

| 适配器调用 | 位置 |
|---|---|
| `feel_stage action=list` | `lib/tools/index.js` L370 |
| `feel_plan action=stage_list` | `lib/tools/index.js` L1066 |

阶段列表是 Feel 角色选择「下一个要推进哪个阶段」的入口，文本形态无法做依赖/相位筛选。

### 建议输出

```json
{
  "schemaVersion": 1,
  "stages": [
    { "id": "v1.2.3-stage-99", "phase": "done", "status": "done",
      "deps": [], "workflowMode": "full", "opsTotal": 4, "opsDone": 4 }
  ],
  "count": 1
}
```

### 验收标准

```bash
openfeel plan stage list --json   # exit 0，单文档，schemaVersion 首键，stages[] 为数组
```

---

## 5. A3（P1）`model list|get --json`

### 现象

```bash
openfeel model list --json        # INVALID_ARGUMENT / commander.unknownOption
openfeel model get executor --json # 同上
```

### 影响

适配器两处：`feel_model action=list`（L1142）、`action=get`（L1151）。

模型意识配置（三层级 default / global / project）在适配器里要展示「哪个 agent 用哪个模型、
值来自哪一层」。文本形态无法区分生效来源与层级覆盖关系。

### 建议输出

```json
{
  "schemaVersion": 1,
  "scope": "project",
  "agents": [
    { "agent": "openfeel-executor", "provider": "deepseek",
      "model": "deepseek-flash", "source": "project" }
  ]
}
```

`model get` 单 agent 时返回 `{ schemaVersion, scope, agent, provider, model, source }`。

### 验收标准

```bash
openfeel model list --json          # exit 0，单文档
openfeel model get executor --json  # exit 0，单文档
```

---

## 6. A4（P2）`flow retry` / `lint` / `roadmap show --json`

三个低频只读面，当前均以 `commander.unknownOption` 拒绝。对应适配器 3 处文本回显：

| 命令 | 适配器调用 | 位置 |
|---|---|---|
| `flow retry --op <id>` | `feel_op action=retry` | L543 |
| `lint kb` / `lint i18n` | `feel_verify action=lint` | L952 |
| `roadmap show [version]` | `feel_plan action=roadmap_show` | L1090 |

### 建议输出（各取所需字段）

```jsonc
// flow retry
{ "schemaVersion": 1, "op": "…", "attempts": 1, "maxAttempts": 3,
  "exhausted": false, "state": "failed" }

// lint kb / lint i18n
{ "schemaVersion": 1, "target": "kb", "ok": true,
  "issues": [ { "path": "…", "message": "…" } ] }

// roadmap show
{ "schemaVersion": 1, "version": "1.2", "milestones": [ … ] }
```

### 验收标准

三条命令各自 `--json` 均 `exit 0` 且为单文档。

---

## 7. A5（P2）`config get --all --json`

### 现象

```bash
openfeel config get defaults.workflow_mode --json
# exit 0 → { schemaVersion, scope, key, value }        ✓ 已有

openfeel config get --json
# exit 1 → INVALID_ARGUMENT / detail.reason = "key-required"
```

### 建议

新增 `--all`，一次性返回项目配置全量：

```json
{ "schemaVersion": 1, "scope": "project",
  "defaults": { "execution_mode": "auto", "auto_advance": "enabled",
                "merge_mode": "manual", "workflow_mode": "full" } }
```

### 验收标准

```bash
openfeel config get --all --json   # exit 0，单文档，defaults 为对象
```

> 若认为该形态与全局 `config get`（无 key 返回 `values`）不一致会造成歧义，
> 也可改为「项目模式无 key 时与全局同形返回 `values`」，只要不再报 `key-required` 即可。

---

## 8. 边界约定（请勿做）

DSH 适配器已并入本仓库 `dsh/`（与 `claude/`、`kilo/` 同级），但**代码归属 DSH 侧**。
请约定以下四条：

1. **不要直接修改 `dsh/` 下的文件**。适配器实现由 DSH 侧维护；若发现适配器 bug，
   请以 issue/文档形式反馈，不要就地改代码——否则两侧会各自演化，重演「两套实现漂移」。
2. **不要把 `dsh/` 纳入 lint / 构建 / 发布扫描**。当前已验证零影响：
   - `vitest.config.ts` → `include: ['test/**/*.test.ts']`
   - `tsconfig.json` → `include: ["src/**/*.ts"]`、`exclude: [..., "test"]`
   - `build.js` → 只读 `src/core/templates-data/**`
   - `package.json.files` → `["dist","bin","schemas"]`，不含 `dsh`
   请保持现状；若未来引入全仓扫描（如 markdown lint、eslint 全仓），请显式排除 `dsh/`。
3. **不要镜像 Agent 编制到 CLI 之外**。`flow next --json.responsibleAgent` 是唯一权威；
   适配器已退役本地 `PHASE_AGENT_MAP` 副本，请勿在文档或模板里再引入第二份映射。
4. **不要为 JSON 分支复制第二套业务判定**。契约 §1.5 已明确要求「JSON 与人类输出共享
   同一业务判定」；新增出口时请复用既有 `failCli` / 判定单点，不要另起平行实现。

---

## 9. 已知边界（无需改动）

以下为已登记、**不需要** OpenFeel 处理的行为，列此以免被误认为缺陷：

1. **`flow advance --json` 不是成功出口**。成功仍打印人类文本，`--json` 仅用于失败
   envelope（契约 §7/§8）。适配器推进成功后重新读取 `flow next` / `flow status` 取结果。
2. **`legalNextPhases` ⊆ advance 接受集合**。多步目标（如 `done`）不会出现在「直接可达」
   集合中，这是设计意图，不是遗漏。
3. **`knowledge dedup --project` 与全局 `--project` 并行**。本地声明保留，
   两者语义不同（前者是知识库去重目标，后者是项目锚定）。
4. **`flow next` 空态**：`phase`/`phaseLabel`/`workflowMode`/`reviewTier`/
   `effectiveReviewTier` 为 `null`，`responsibleAgent` 为 `'feel'`，数组为 `[]`，
   `guards` 含 `noActiveStage`。适配器已按此处理。

---

## 10. 交付后 DSH 侧会做什么

适配器侧**无需重新设计**，改动点已逐条预留注释（搜索 `尚未支持`）：

| 触发 | DSH 侧动作 |
|---|---|
| A2 + A3 + A4 交付 | 7 处 `cli.text()` 改为 `cli.json()`，文本回显 **8 → 1**（仅剩 `instructions` XML 形态），`--json` 调用点 **25 → 32** |
| A1 交付 | 视方案更新 `feel_archive` 的 `stage_summary` 语义（`--force` 透传 / 返回合并标记） |
| A5 交付 | `feel_verify action=config_get` 支持无 key 全量读取 |
| 任意新出口 | 在 `dsh/test/contract.js` + `verify.js` 增补断言；`openfeel.requiresCli` 跟随升级 |

同时 DSH 侧会把这轮复核结论同步回
`OpenFeel-DSH\docs\CLI-REQUIREMENTS.md`（§复核结论），保持需求溯源与实现状态一致。

---

## 11. 验收与自测

### OpenFeel 侧自证（每条命令）

```bash
# 通用判据：exit 0 + 单文档 + schemaVersion 首键 + 无 error 键
openfeel plan stage list --json
openfeel model list --json
openfeel model get executor --json
openfeel flow retry --op <某 op> --json
openfeel lint kb --json
openfeel roadmap show --json
openfeel config get --all --json
openfeel archive <已有归档的阶段> --json        # 期望 refusal，零写盘
openfeel archive <已有归档的阶段> --json --force # 期望成功
```

> ⚠️ **判据陷阱**：v1.2.2+ 起失败也输出 JSON envelope，因此「首行是 `{`」**不能**
> 作为支持 `--json` 的证据。必须同时满足 `exit=0` 且文档中**没有** `error` 键。
> DSH 侧首轮复核曾因此全部误判为「已支持」，特此提醒。

### DSH 侧复验（OpenFeel 完成后，由 DSH 侧执行）

```bash
cd <repo>/dsh
node test/contract.js      # DSH schema 契约
node test/verify.js        # 行为（真实 CLI + 真实 .openfeel 副本）
node test/integration.js   # 真实 cordis + 真实 ToolRuntime 挂载
```

`verify.js` 会在 `os.tmpdir()` 的 `.openfeel` 副本上做写测试，并断言原项目 `flow.json`
revision 与归档摘要未被改动。

---

## 附：需求溯源

- 完整需求单：[`OpenFeel-DSH\docs\CLI-REQUIREMENTS.md`](../../OpenFeel-DSH/docs/CLI-REQUIREMENTS.md)
  - §复核结论（L211）— 6 个缺 `--json` 命令面的实测证据
  - §新增需求 P1-5（L266）— A1 的完整取证
- 更新说明：[`OpenFeel-DSH\docs\OPENFEEL-1.2.3-UPDATE.md`](../../OpenFeel-DSH/docs/OPENFEEL-1.2.3-UPDATE.md)
- 适配器边界：[`ADAPTER.md`](ADAPTER.md)
- 兼容性契约（v1.2.1 逆向，仅供回归参照）：[`docs/compat/`](docs/compat/)
