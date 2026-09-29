# cli 模块 Bug 归档

> 来源阶段：`v1.1.2-stage-41`（CLI 自描述与可纠错能力，实现 commit `47a5462`）；BUG-003 于 `v1.1.2-stage-43`（CLI 文档 skill 化与版本收口，commit `cbc606f`）验收新登记
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

---

## BUG-003：`flow phases --json` 的 help 文案只列 `{ phases, transitions }`，实际输出还含 `advanceAccepted`

- **优先级**：low ｜ **阻塞**：否 ｜ **状态**：**closed**（v1.1.2-stage-48 op-004 修复 + 测试官验收通过；遗留 #1）｜ **归因**：**预存量缺陷**（`cli/BUG-001` 修复时新增 `advanceAccepted` 输出，help 文案未同步）

### 核心结论

`flow phases --help` 的 `--json` 选项说明（`src/commands/flow.ts:336`，i18n 键 `flow.phases.json`）只写「以 JSON 输出 `{ phases, transitions }`」，而实际输出（`:345`）为**三个键**：

```js
JSON.stringify({ phases, transitions, advanceAccepted: [...PIPELINE_PHASES] }, ...)
```

实测（commit `cbc606f`）：`node bin/openfeel.js flow phases --help` → `--json  以 JSON 输出 { phases, transitions }`；`node bin/openfeel.js flow phases --json` → `{ "phases": [...], "transitions": {...}, "advanceAccepted": [...] }`。

**根因**：`cli/BUG-001` 采纳方案 B 时**新增了 `advanceAccepted` 输出**（使「存在视图 vs 推进白名单」差异可编程消费），但 `--help` 文案（i18n 双语文案）未同步——属**同一变更内的收尾遗漏**。

### 影响范围

| 项 | 说明 |
|----|------|
| 触发频率 | 每次 `flow phases --help` |
| 直接后果 | 仅读 `--help` 的 Agent/用户会误判输出键集，可能忽略 `advanceAccepted`（`flow advance` 的**推进白名单**）字段——正是该字段的存在意义所在 |
| 功能影响 | **无**（CLI 行为正确；`.openfeel/manual/cli/commands.md` 与 `openfeel-cli-usage` skill 均已正确记录三键） |
| 关联 | `cli/BUG-001`（`flow phases` 自描述 phase 与 advance 接受集合不一致）修复的**收尾遗漏** |

### 建议修复方向

1. 同步 i18n 键 `flow.phases.json`（zh/en 对称）：`以 JSON 输出 { phases, transitions, advanceAccepted }` / `Output { phases, transitions, advanceAccepted } as JSON`；
2. **或**改为不逐一列举键（如「以 JSON 输出完整结构」）——避免后续字段新增再次漂移（**推荐**：与 `kb/patterns.md #CLI 自描述命令模式`「展示与校验同源、减少第二信源」的精神一致，降低文案维护面积）。

> 沉淀建议：`kb/patterns.md #CLI 自描述命令模式`（新增输出字段时须同批核对 `--help` 文案；**枚举式文案**是漂移源）

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|
| 2026-09-29 | openfeel-executor | **本阶段不修**（裁定）：`v1.1.2-stage-43` 为版本最后阶段，该缺陷 low/非阻塞且与版本收口无耦合；登记为**下一版本候选**或由用户决定是否即时修复。本阶段 skill 已正确描述三键，不构成发布阻塞 | — |

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-09-29 06:55 | openfeel-feel-tester | open（low，非阻塞） | v1.1.2-stage-43 验收（**skill 内容准确性实测**）发现；源码交叉验证 `src/commands/flow.ts:336` 文案 vs `:345` 输出 |
| 2026-09-29 22:15 | openfeel-feel-tester | **closed**（v1.1.2-stage-48 验收） | zh `flow phases --help` / `--json --help` 均含 `advanceAccepted`；en 环境同；`--json` 顶层键 `['phases','transitions','advanceAccepted']` 长度 15；回归断言 `i18n.test.ts:72-77` + `flow.test.ts:91-101` |

### 关闭记录（v1.1.2-stage-48，commit `bbcd242`）

修复（采纳**建议修复方向 1**——同步 i18n 键，未改为不列举键）：`flow.phases.json` 键值补第三键 `advanceAccepted`——真文案源 `src/core/i18n-data/zh-CN.ts:481`（`以 JSON 输出 { phases, transitions, advanceAccepted }（advanceAccepted = 内置 15 phase，即 flow advance 的推进白名单）`）+ `en.ts:456`；`src/commands/flow.ts:336` **fallback 硬编码**同步（防未走 `applyHelpI18n` 路径时缺词）。**未改行为**（实现 `:345` 早已输出三键，本项仅补文案）。测试官实测：zh/en 双语 `--help` 均含 `advanceAccepted`；`--json` 顶层键集与长度正确；`lint i18n` 531 键一致。**关闭**。

**防再犯**：① **新增/暴露输出字段时，`--help` 文案必须同批核对**——本 Bug 正是 `cli/BUG-001`（stage-47）新增 `advanceAccepted` 输出后的**收尾遗漏**，与 `templates/BUG-002`（文案双源不同步）同族；② **枚举式 help 文案是漂移源**：逐一列举键集（`{ phases, transitions }`）注定在字段新增时滞后，可考虑改为「输出完整结构」类不枚举表述（本阶段按最小改动保留枚举并补全，该建议留待后续评估）；③ 文案源有「i18n 键（真源）+ 命令层 fallback（硬编码）」双处，须成对修改（`rg "phases, transitions" src/` 兜底）。沉淀见 `kb/patterns.md #CLI 自描述命令模式`。

> 流程偏差（如实记录）：executor 修复时未按生命周期翻转 `fixing`/`resolved`，直接由测试官于验收时关闭。
