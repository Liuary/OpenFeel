# cli 模块 Bug 归档

> 来源阶段：`v1.1.2-stage-41`（CLI 自描述与可纠错能力，实现 commit `47a5462`）
> 登记人：openfeel-feel-tester ｜ 登记时间：2026-09-29 ｜ 私域详细报告：`.openfeel/users/Liuary/bugs/cli/`

---

## BUG-001：`flow phases` 自描述 phase 与 `flow advance` 接受集合不一致

- **优先级**：low ｜ **阻塞**：否 ｜ **状态**：**closed**（v1.1.2-stage-47 `op-001` 方案 B 修复 + 验收通过）

### 核心结论

自描述命令 `openfeel flow phases` 的 **phase 转移表**已统一到运行时 `pipelineConfig`（与 `advance` 校验同源），但 **phase 合法性判定**仍是硬编码（`PipelinePhaseSchema` / `PIPELINE_PHASES`）。因此当 `.openfeel/pipeline.yaml` 的 `phases` 含内置 15 项之外的 phase（如 `gate`）时：

| 路径 | 行为 |
|------|------|
| `openfeel flow phases` | 把 `gate` 列为合法且可达（展示 `plan_passed → [gate]`） |
| `openfeel flow advance --to gate` | 拒绝：`'gate' 不是合法的 PipelinePhase`，exit 1 |
| 同上 + `--force` | 仍失败：模糊修正基于硬编码枚举 → `非法 phase 'gate'，模糊修正失败` |

**根因**：第二信源残留。转移表已收敛，合法性判定未收敛；而 `pipeline.yaml` 头部声明「新增/修改流水线阶段只需编辑此文件，不改 TS 源码」，使缺口更具误导性。

**归因**：**预存量缺陷**（`advance` 的 enum 校验早于本阶段存在）；stage-41 新增的自描述命令使其**首次可见**。

### 影响范围

- 触发条件：仅当 `pipeline.yaml` 的 `phases` 含内置 15 项之外的 phase（属受支持的自定义用法）。
- 实际项目：本仓及默认初始化项目 `pipeline.yaml` 与内置枚举一致 → **无实际影响**。
- 涉及文件：`src/commands/flow.ts`（`phases` action）、`src/core/flow-manager.ts`（`getPipelinePhases`）、`src/core/pipeline-schema.ts`（`PIPELINE_PHASES`）、`advance` 的 enum 校验与 `advanceStagePhase` 模糊修正。

### 建议修复方向

1. 将 `advance` 的 phase 合法性校验也收敛到运行时 `pipelineConfig.phases`（真正单一数据源）；
2. 或为 `flow phases` 增补说明行，标注「`advance --to` 目前仅接受内置 15 个 phase」；
3. 或在 `pipeline.yaml` 加载时对未知 phase 告警。

> 沉淀：`kb/troubleshooting.md #flow phases 自描述 phase 与 flow advance 接受集合不一致`、`kb/patterns.md #CLI 自描述命令模式`

### 关闭记录（v1.1.2-stage-47，commit `2fb38fa`）

采纳**方案 B**：`flow phases` 人类输出在运行时含内置 15 之外的 phase 时追加边界说明（i18n `flow.phases.customPhaseNote` zh/en）；`--json` 新增 `advanceAccepted`（= `PIPELINE_PHASES` 内置 15），使差异**可编程消费**。测试官隔离端到端实测：自定义 `pipeline.yaml`（含 `gate`）下 `phases`=16（含 gate）、`advanceAccepted`=15（不含 gate）；`flow advance --to gate` 与 `--force` 均按 advanceAccepted 拒绝（exit 1）→ 自描述边界与 `advance` 实际接受集合一致。**关闭**。

**防再犯**：① **「存在视图」与「推进白名单」是不同的语义角色，不要强行合并数据源**——合并会波及 `PipelinePhase` 类型系统与模糊修正链（影响面远大于收益）；② 差异必须**同时**落到「人类可读边界说明」与「`--json` 可编程字段」，只写一句文档免责等于把风险转嫁给脚本；③ 新增/暴露集合时按「语义角色是否相同」判别：角色相同（如转移表展示 vs 校验）→ 必须同源；角色不同 → 显式化。沉淀见 `kb/patterns.md #CLI 自描述集合的「存在视图 vs 推进白名单」区分`。

---

## BUG-002：阶段目录冲突错误未走 i18n 键 + `common.stageDirConflictTmpl` 死键

- **优先级**：low ｜ **阻塞**：否 ｜ **状态**：**closed**（v1.1.2-stage-47 `op-001` 结构化错误 + i18n 分流修复 + 验收通过）

### 核心结论

en 语言下，`plan stage add` / `flow stage add` 的 `(series, stageDir)` 冲突错误仍输出**中文**（仅前缀走英文 `common.errorTmpl`）：

```
Error: 阶段目录冲突：'v4.0.0-stage-04' 与 'v4-stage-04' 映射同一 (series, stageDir)，请改用其它 stage-NN
```

同时核查发现 op-002 新增的键 `common.stageDirConflictTmpl`（zh/en 双侧均已定义）**在全仓无任何引用**（死键）——即命令层绕过了为本场景准备的 i18n 键。

**根因**：核心层 `registerStage`/`addStage` 抛错文案为中文硬编码（项目既有惯例，如 `Stage '...' already exists`），命令层 `catch` 统一用 `common.errorTmpl` 渲染；专为该场景定义的键未接入任何调用点。`openfeel lint i18n` 只校验 zh/en 对称性，不校验键是否被引用，故死键不报错。

**归因**：本阶段新引入（键由 op-002 新增）。

### 影响范围

- 触发条件：仅在 en 语言下暴露；冲突检测与退出码等**行为完全正确**。
- 涉及文件：`src/commands/plan.ts`（catch 分支）、`src/commands/flow.ts`（catch 分支）、`src/core/flow-manager.ts`（`registerStage`/`addStage` 抛中文）、`src/core/i18n-data/{zh-CN,en}.ts`（死键）。
- 风险：死键长期存在会被误认为已覆盖该路径，后续语言改动易漏改。

### 建议修复方向

1. `registerStage`/`addStage` 改为抛结构化错误（含 `stage`/`other` 字段），命令层用 `common.stageDirConflictTmpl` 渲染；
2. 或最小改动：命令层 `catch` 按错误类型分流，命中冲突时用该键展示，并移除死键（或保留至接入后）。

> 沉淀：`kb/troubleshooting.md #新增 i18n 键已定义却未接入（死键）`

### 关闭记录（v1.1.2-stage-47，commit `2fb38fa`）

新增结构化 `StageDirConflictError`（含 `stage`/`other`），`registerStage`/`addStage` 改抛该错误（message 文本不变，既有 `toThrow(/阶段目录冲突/)` 不破）；三入口命令层（`plan stage add` / `flow stage add` / `stage create`）按错误类型分流，命中时用 `common.stageDirConflictTmpl` 渲染 → **死键消除**。测试官隔离端到端实测：`lang=en` 下冲突 stderr 为纯英文 `Stage dir conflict: v4.0.0-stage-04 and v4-stage-04 map to the same directory`（**无中文残留**），`lang=zh-CN` 渲染同一中文模板。**关闭**。

**防再犯**：① **`lint i18n` 只查对称性、不查引用**——新增键必须在**同一提交**内接入调用点，并以 `rg "<key>" src/` 引用校验兜底（本次 3 处使用点已断言）；② 需要独立渲染的错误场景，核心层应抛**结构化错误**（携带字段）而非中文文案字符串，命令层按类型分流——既消除硬编码文案，又不破坏既有 `toThrow` 断言；③ 误判校正留档：`zh-CN.ts` 内 `en: ''` 属「单语分文件」模式正常值（en 值在 `en.ts`），死键本质是**无使用点**而非值缺失。沉淀见 `kb/troubleshooting.md #新增 i18n 键已定义却未接入（死键）`（已更新）。
