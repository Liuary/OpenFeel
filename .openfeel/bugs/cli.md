# cli 模块 Bug 归档

> 来源阶段：`v1.1.2-stage-41`（CLI 自描述与可纠错能力，实现 commit `47a5462`）
> 登记人：openfeel-feel-tester ｜ 登记时间：2026-09-29 ｜ 私域详细报告：`.openfeel/users/Liuary/bugs/cli/`

---

## BUG-001：`flow phases` 自描述 phase 与 `flow advance` 接受集合不一致

- **优先级**：low ｜ **阻塞**：否 ｜ **状态**：open（待 openfeel-schemer 裁定排期）

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

---

## BUG-002：阶段目录冲突错误未走 i18n 键 + `common.stageDirConflictTmpl` 死键

- **优先级**：low ｜ **阻塞**：否 ｜ **状态**：open（待 openfeel-schemer 裁定排期）

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
