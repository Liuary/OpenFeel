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

---

## BUG-004：en 模式下 `--help` 的 Arguments 描述仍为中文（T38 只落地遍历机制，未补齐翻译键）

- **优先级**：low ｜ **阻塞**：否 ｜ **状态**：**closed**（v1.1.2-stage-51 op-002/005/007/008 分派补齐 20 处（+1 新增）+ op-009 运行时全量门禁；测试官验收通过）｜ **来源阶段**：`v1.1.2-stage-50`（正式测试验收发现）｜ **归因**：`cli/BUG-001` 同族「双轨/漏键」——T38 只落地机制、未补键

### 核心结论

`T38`（U2-REV-003）修复了 `applyHelpI18n` 的 `arguments` **遍历机制**（`cli/index.ts` `walkCmd` 增 arguments 遍历，`hasKey` 防缺失告警），但 23 处 `.argument()` 中**仅 1 处**（`stage.create`）补了 `help.<path>.arg<name>` 键，其余 **22 处 en 下回退中文**。

实测（2026-09-30，commit `def6a33`，隔离 fixture `lang=en`）：

- `stage create --help` → `stageId  Stage ID (e.g. v1.0.0-stage-30)` ✅ 英文（T38 已覆盖）；
- `knowledge add --help` → `category 分类（...）` / `title 条目标题` ❌ **中文泄漏**；
- `view accept --help` → `rev-id  审查条目 ID（如 REV-001）` ❌ **中文泄漏**。

**行为 vs 实现**：op-004 验收要点「en 下 `--help` 的 Arguments 行为英文」实际仅 **1/23** 达成——属**验收口径与实现范围不一致**（机制已通，键未补全）。

### 影响范围

| 项 | 说明 |
|----|------|
| 触发频率 | en 用户查询任一含位置参数的命令 `--help` |
| 直接后果 | en 读者对参数说明语义不可达（Options 已英文，Arguments 仍中文） |
| 功能影响 | **无**（命令执行、退出码、参数校验均正确） |
| 关联 | T38 / U2-REV-003（stage-49 全量审查）；与 **REV-004**（`help.view.add` 未同步弃用文案）同源「双轨/漏键」 |

### 建议修复方向

1. 按 `help.<path>.arg<name>` 约定**补齐 22 处** `.argument()` 的 zh/en 双语键（`lint i18n` 自动强制中英对称）；
2. 或改为「argument 注册即取 `description` 翻译」的机制级方案（减少逐键维护与漂移面）；
3. 用 `stage.create`（已补）作样板——**建议归 `v1.1.2-stage-51`**（该阶段大量触及 CLI/i18n，天然合并；与 REV-004 下版本 `view add` 移除一并收口）。

> 沉淀：`kb/troubleshooting.md #新增 i18n 键已定义却未接入（死键）`、`kb/patterns.md #命令面收敛与弃用策略`（双轨陷阱：`desc` 键 vs `help` 域键须同批改）。

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-09-30 23:58 | openfeel-feel-tester | open（low，非阻塞） | v1.1.2-stage-50 正式验收发现；隔离 fixture 实测 23 处 `.argument()` 仅 1 处英文；已登记私域 `bugs/cli/` 并更新 index/log |
| 2026-10-01 | openfeel-feel-tester | **closed**（v1.1.2-stage-51 验收） | 隔离 HOME + en 项目下**运行时枚举 23 个含 `Arguments:` 段的命令**，逐命令实测 **CJK 零命中**；`test/cli/help-arguments.test.ts` 6 用例全绿；`lint i18n` 649 键中英对称、exit 0 |

### 关闭记录（v1.1.2-stage-51，commits `5ebd114`/`b538bdc`/`1aba277`/`b59705a`/`34385a4`）

本阶段将 BUG-004 纳入范围，按**文件所有权单一 owner** 分派补齐 `help.<命令路径点分>.arg<arg.name()>` 双语键（键约定实测于 `src/cli/index.ts:94`，`arg.name()` 原样含连字符，`hasKey` 守卫静默回退）：

| op | 分担处数 | 命令 |
|:--:|:--:|------|
| op-002 | 5 处 | `flow stage add`（`stageId`）/ `flow review resolve`（`rev-id`）/ `flow checkpoint list`（`stage`）/ `flow checkpoint restore`（`checkpoint-file`）/ `view accept`（`rev-id`） |
| op-005 | 8 处 | `stage status/set/task`（`stageId`、`taskNo`）/ `plan stage add`（`name`）/ `plan scheme create`（`stage`/`title`）/ `plan scheme list`（`stage`） |
| op-007 | 3 处 + 新增 1 处 | `knowledge add`（`category`/`title`）/ `knowledge search`（`query`）/ **新增** `knowledge dedup`（`content`） |
| op-008 | 4 处 | `archive`（`stage`）/ `instructions`（`artifactId`）/ `roadmap create/show`（`version`） |

op-009 增**运行时全量枚举门禁**（`test/cli/help-arguments.test.ts`）：动态遍历 CLI 命令树，对**每个含位置参数的命令**以 `lang=en` 渲染 `--help`，断言 `Arguments:` 段 `/[\u4e00-\u9fff]/` **零命中**（**33 个含位置参数的命令**，新增命令自动纳入，防未来漂移）。

**口径澄清**：BUG 原文记「23 处、仅 1 处已补」的「23」为**记录时点静态 `.argument()` 计数**；本次修复面 = 存量 **20 处** + 本阶段新增子命令 **1 处**（`knowledge.dedup`）+ 已补 **1 处**（`stage.create`，T38）。运行时枚举（33 命令）多于静态计数，差异来自 `.command('remove <stageId>')` 形式的声明（Commander 同样注册为 argument）——**以运行时门禁为准**。**关闭**。

---

## BUG-005：空模板检测为纯子串匹配，op 正文引用占位标记被误判「未填充」

- **优先级**：medium ｜ **阻塞**：否 ｜ **状态**：**closed** ｜ **来源阶段**：`v1.1.2-stage-52`（正式测试验收发现）｜ **归因**：stage-52 op-005（B3 `detectFillState` / B4 `publishScheme` 校验）**新引入** ｜ **修复阶段**：`v1.1.2-stage-54` op-001

### 核心结论

`EMPTY_TEMPLATE_MARKER = '- [ ] 待补充'`，而 `isTemplateEmpty()` / `detectFillState()`（`flow-manager.ts`）与 `publishScheme()` 校验（`plan/scheme.ts`）三处均为 **`content.includes(marker)` 纯子串匹配**——未要求标记**独占整行/列表项**。因此 op 方案**正文引用**该字面量（如说明「填充后将 `- [ ] 待补充` 改为 `- [x]`」）时被误判未填充：

| 后果 | 说明 |
|------|------|
| ① `plan scheme publish` **误拒（exit 1）** | **功能性**——完整方案无法发布（阻塞 draft→pending 工作流） |
| ② `flow ops list` 显示 `(empty)` + warning | 误导（模板实为已填充） |
| ③ `flow health` 误报空模板 | 健康检查不可信 |

**实证**：仓库 `flow health` 报 `空模板: 1 个… v1.1.2-stage-52.op-005`，而 `op-005.md` 为 **17112 字节完整方案**（正文含标记字面量）；隔离 fixture 复现 `publish` 误拒。

### 影响范围

- 触发条件：op 正文（任一位置）出现 `- [ ] 待补充` 字面量——含引用示例、说明性文字。
- 涉及文件：`src/core/flow-manager.ts`（`isTemplateEmpty` / `detectFillState`）、`src/core/plan/scheme.ts`（`publishScheme` 校验）。
- 数据风险：**无**（误报不影响写盘正确性，仅拒绝发布）。

### 建议修复方向（供 openfeel-schemer 拟定）

1. 将 `EMPTY_TEMPLATE_MARKER` 的**子串**判定收紧为**整行/列表项**匹配（同一来源单一实现，供 `isTemplateEmpty` / `detectFillState` / `publishScheme` / health 共用），例如锚定行首 `- [ ] 待补充` 且行内无其它有效内容；
2. 补回归断言：正文引用该标记 → `filled`；真实 `- [ ] 待补充` 独占一行 → `empty`；
3. 人工核查 `op-005.md` 等存量文件，修复后 `flow health` 空模板告警应归零。

> 沉淀：`kb/troubleshooting.md #空模板检测子串匹配误报`、`kb/patterns.md #结构化占位符检测`

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-10-01 12:05 | openfeel-feel-tester | open（medium，非阻塞） | v1.1.2-stage-52 正式测试发现；隔离 fixture 复现 publish 误拒；本仓 `flow health` 误报 op-005 |
| 2026-10-01 17:20 | openfeel-feel-tester（stage-54 验收） | 通过，closed | 修法＝`isTemplateEmpty` **整行锚定**正则（`/(?:^|\n)[ \t]*-\s*\[\s*\]\s*待补充[ \t]*(?=\r?\n|$)/`）+ `scheme.ts:455` 复用（单一来源）。**隔离 fixture 端到端**：真实独占行空模板 → `health` 仅报其 / `ops list (empty)` + warning / `publish` exit 1；正文行内引用 → `health` 不报 / `ops list (filled)` / `publish` exit 0。**本仓 `flow health` 空模板告警归零**，`stage-52.op-005` 由 `(empty)`→`(partial)` 无 warning。`rg "content.includes(EMPTY_TEMPLATE_MARKER)" src/` 零命中；59 文件/987 用例全绿。 |

---

## BUG-006：en 模式下 `flow advance --to done` 的 blocking REV 拒绝文案硬编码中文

- **优先级**：low ｜ **阻塞**：否 ｜ **状态**：**closed** ｜ **来源阶段**：`v1.1.2-stage-52`（正式测试，op-007 L5 同域残留）｜ **归因**：**预存量缺陷**（源自更早 `98fd2dd` op-002「实现 REV 闭环」，**非 stage-52 引入**）｜ **修复阶段**：`v1.1.2-stage-54` op-002

### 核心结论

en 模式下 `flow advance --stage <id> --to done` 首行检测信息为英文，但**拒绝文案仍为硬编码中文**——`src/commands/flow.ts:742-743` 直接 `console.error('检测到 blocking REV 未解决，禁止推进到 done…')` / `console.error('请先解决阻塞 REV 或通过 flow review resolve 标记为已解决…')`，**未走 `t(...)`**。op-004 抽取 `assertNoBlockingOpenRev` 时未一并 i18n 化。

**性质辨析**：op-007 声明范围为 `console.warn`（已全量清零），本处为 **`console.error`**，故未被 op-007 覆盖；与 `cli/BUG-004`（en `--help` Arguments 段中文）**同族（en 泄漏）**，属同域残留。

### 影响范围

- 触发频率：en 用户在多步/单步推进 `done` 且存在 blocking open REV 时。
- 直接后果：该错误路径 en 模式泄漏中文（i18n 不一致）；功能与退出码**正确**。
- 关联：`cli/BUG-004`（同族 en 泄漏）；另 `init.ts:48/110`、`project.ts:101`、`update.ts:93` 的 `console.log` 中文为语言菜单/可接受范围（**一并评估**）。

### 建议修复方向（供 openfeel-schemer 拟定）

1. `flow.ts:742-743` 迁 i18n 键（如 `flow.advance.blockingRevRefused` / `flow.advance.blockingRevHint`，zh/en 对称，`lint i18n` 门禁守护）；
2. 顺带评估 `project.ts:101`、`update.ts:93` 的 `console.log` 中文是否纳入 i18n。

> 沉淀：`kb/troubleshooting.md #新增 i18n 键已定义却未接入（死键）`、`kb/patterns.md #命令面收敛与弃用策略`（en 泄漏同族：`console.warn` 覆盖后须同查 `console.error`/`console.log`）

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-10-01 12:06 | openfeel-feel-tester | open（low，非阻塞） | v1.1.2-stage-52 验证 op-007 时顺带发现；`rg "console\.(warn\|error)\(.*[\x{4e00}-\x{9fff}]"` 命中 flow.ts:742-743 |
| 2026-10-01 17:20 | openfeel-feel-tester（stage-54 验收） | 通过，closed | `flow.ts:742-743` 改走 `t('flow.advance.blockingRevRefused'/'blockingRevHint')`（`zh-CN.ts:154-155`/`en.ts:145-146` 双键对称）。**en 环境端到端**（隔离 fixture lang=en + blocking REV + `--to done --force`）：**CJK=0**，输出含 `Error: cannot advance to done while blocking REVs remain unresolved.`；**zh 逐字不变**。`lint i18n` 726 键 exit 0；`flow.ts` 内裸中文 `console.*` 零命中。 |

---

## BUG-007：`docs/commands.md` 的 `project` 子命令参考陈旧（`list` / `info` 已不存在）

- **优先级**：low ｜ **阻塞**：否 ｜ **状态**：**closed**（v1.1.2-stage-56 归档官**就地修正**并留痕）｜ **来源阶段**：`v1.1.2-stage-56`（正式测试验收发现）｜ **归因**：**手写文档未纳入命令面收敛同步面**（`REV-v1.1.2-stage-56` REV-005 已指出同源陈旧，op 范围仅修权威源 skill）

### 核心结论

手写文档 `docs/commands.md` 的 `## project — 项目管理` 节记载 `openfeel project list`（列出已记录项目）与 `openfeel project info [path]`（查看项目信息），但**实测 `openfeel project --help` 仅含 `overview` 子命令**——`project list` / `info` 均报 `error: unknown command`（exit 1）。与权威源 skill（op-001 已改为「`project overview`（无 `list`/`info` 子命令）」）**同源漂移**，但 skill 已修、手写文档未纳入 op。

**根因**：`docs/commands.md` **不经 `npm run build`**，与权威源 skill / 生成段 / i18n 无一致性断言链路；命令面收敛（`project` 组由多子命令收敛为单一 `overview`）时，同步面清单遗漏了此手写文档。

### 影响范围

| 项 | 说明 |
|----|------|
| 触发条件 | 用户/Agent 查阅 `docs/commands.md` 了解 `project` 组命令时 |
| 直接后果 | 按文档执行 `project list` / `project info` 报 `unknown command`（**无数据风险、无运行时行为影响**） |
| 范围 | 手写文档 `docs/commands.md`（不经 build，须手工同步） |

### 处置（v1.1.2-stage-56 归档，openfeel-archiver）

- **归属裁定**：**文档类漂移**（载体为工作区文档、可本地修正）→ **归档官就地修正**（参照 `templates/BUG-004` 先例）。
- **修正**：`docs/commands.md` `## project — 项目管理` 节删除 `project list` / `project info [path]` 两行，改为 `openfeel project overview`（实时扫描项目结构，输出结构化概览）+ 更正注记。
- **验收**：`node bin/openfeel.js project --help` → Commands 仅 `overview` / `help`；`rg "project (list|info)" docs/commands.md` **零命中**。

### 防再犯

① 命令面**收敛**（增删子命令）与新增命令同样须走「**同步面清单**」——**手写文档 `docs/commands.md` 不经 build，是最易漏的一环**（与 `templates/BUG-005` 的「部署型 skill 模板」并列）；② 沉淀见 `kb/patterns.md #部署型资产变更的多载体同步面清单`、`kb/troubleshooting.md #新增输出键/契约的同步面清单`（已扩展为 9 载体表）。

---

## BUG-008：`--debug` / `OPENFEEL_DEBUG=1` 开关机制正确，但全仓无 debug/warn 生产者 → 真实 CLI 下无可观测 debug 输出

- **优先级**：low ｜ **阻塞**：否 ｜ **状态**：**open** ｜ **来源阶段**：`v1.1.2-stage-58`（正式测试验收发现）｜ **归因**：**新引入能力的设计缺口**（op-002 定义 switch/minLevel，但未接入任何 debug 级生产者）｜ **处置**：归档官**不改源码**（边界），维持 open 待下阶段/用户裁定

### 核心结论

`resolveRuntimeLogConfig` 已将 `minLevel` 正确切到 `debug`（`--debug`/`OPENFEEL_DEBUG=1`），级别过滤亦正确（注入 `runtimeLog('debug',…)` 后 `[DEBUG]` 正常落盘），但 `src/` 全仓 `runtimeLog()` 调用仅 **3 处**（`src/cli/index.ts:183` error、`:194`/`:200` info），**无任何 debug 级（乃至 warn 级）生产者** → minLevel 虽降为 debug，却无条目可记 → 真实 CLI 下开关**无可观测效果**。

| 项 | 说明 |
|----|------|
| 触发条件 | 任意命令附加 `--debug` 或设 `OPENFEEL_DEBUG=1` |
| 功能影响 | **无功能损毁**：日志模块（info/error）正常工作；级别过滤 / 开关 / 路径覆盖 / 并发 / UTF-8 均实测通过 |
| 预期落差 | `--help` 宣称「记录 debug 级日志」，但真实 CLI 无任何 debug 输出 → 「开关无效」观感 |
| 同类 | `warn` 级亦无生产者（模块支持 warn，注入验证可写） |
| 边界 | **不违反**用户锁定裁定（仅要求 info/warn/error 记录、debug 默认关）与 plan §2.4/B-7（仅要求 minLevel 切换）；单元测试 `test/core/runtime-log.test.ts:63-72` 已覆盖 debug 门控，故**非回归** |

### 验证（openfeel-feel-tester 实测，2026-10-02）

- 直接注入（`installRuntimeLog({argv:['--debug']})` + `runtimeLog('debug', ...)`）→ 日志出现 `[DEBUG]`（机制正确）；
- 默认配置注入 `warn`/`error`/`debug` → `[WARN]`/`[ERROR]` 落盘、`[DEBUG]` 被过滤（级别过滤正确）；
- 真实 CLI `--debug` / `OPENFEEL_DEBUG=1` → 无 `[DEBUG]`。

### 修复方向（供后续裁定，二选一）

1. **补生产者**：在关键诊断路径（如 `chcp` 探测结果、`--log-file` 解析、`install*` 生效状态）增加 `runtimeLog('debug', ...)`，使开关可观测（注意避免过度设计/噪声）；
2. **仅文档化**：在 `manual/core/runtime-log.md` 与 `--help` 描述中注明「debug 级当前为预留能力，暂无生产者；`--debug` 仅降低过滤阈值」。

> 建议倾向方案 2（最小改动、符合 AGENTS.md 过度设计约束）。
> 沉淀：`kb/patterns.md #库侧默认 no-op + 进程入口 install 的副作用隔离模式`、`kb/architecture.md #四类日志边界`

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-10-02 02:12 | openfeel-feel-tester | open（low，非阻塞） | 机制正确，缺口 = 无 debug/warn 生产者；不阻塞本阶段验收；**归档官不改源码，维持 open** |

