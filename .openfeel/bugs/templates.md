# templates 模块 Bug 归档

> 来源阶段：`v1.1.2-stage-45`（平台强限定内容「描述泛化」，实现 commit `8e1e186`）
> 登记人：openfeel-feel-tester ｜ 登记时间：2026-09-29 ｜ 私域详细报告：`.openfeel/users/Liuary/bugs/templates/`
> 本文件为 **templates 模块首次建立**的公共 Bug 归档。

---

## BUG-002：全局约束模板 `agents-md` 权限部署路径行未泛化（与仓库根 `AGENTS.md` 同类表述处理不一致）

- **优先级**：medium ｜ **阻塞**：否 ｜ **状态**：**closed**（v1.1.2-stage-47 `op-005` 权威源泛化 + build + 验收通过）

### 核心结论

模板权威源 `src/core/templates-data/agents-md/{zh-CN,en}.md:112`（`## 权限模型（Agent permission）` 节首句）仍将 opencode 专属全局绝对路径 `~/.config/opencode/agents/*.md` 直接表述为**框架的部署目标**——**既未泛化、也未按本阶段要求显式标注为「opencode 适配器」**：

```
zh-CN.md:112  9 个 agent 各自内联 `permission:` 白名单（`openfeel setup` 部署到 `~/.config/opencode/agents/*.md`），含 `external_directory: "allow"`。
en.md:112     Each of the 9 agents inlines a `permission:` allowlist (deployed by `openfeel setup` to `~/.config/opencode/agents/*.md`), including `external_directory: "allow"`.
```

对照仓库根 `AGENTS.md:122`（**本阶段 op-003 ① 已泛化**）：

```
由 `openfeel setup` 部署到**全局 agents 目录**（opencode 适配器：`~/.config/opencode/agents/*.md`）。
```

复现命令：`rg -n "agents/\*\.md" src/core/templates-data/agents-md AGENTS.md`

**根因**：**双源不同步**——同一语义句在「模板权威源（部署源）」与「仓库根 `AGENTS.md`（手工维护、仅本仓库可见）」双份存在，本阶段仅改了后者。`build.js:143` 对 agents-md 仅注入 `AGENTS_MD_TEMPLATES` 生成段，**不写仓库根 `AGENTS.md`**，两者无单一源约束、无一致性断言，故「改一处」不会触发任何失败。

**归因**：**清单外遗漏**。stage-45 plan §2.2 A 类盘点仅登记 `agents-md:3`（部署路径行），未覆盖 stage-44 新增的 `:112`（权限部署落点行）→ 属盘点清单覆盖缺口，非 executor 越界或漏执行。

### 影响范围

- **用户可见性最高**：该模板经 `openfeel setup` 部署为**所有 OpenFeel 项目的全局 `AGENTS.md`**（`getGlobalAgentsMdPath()` 落点），可见度**高于**仓库根 `AGENTS.md`（后者仅本仓库可见）——恰是用户指令点名要清理的「强限定平台」同类内容。
- **违反双源同步约定**：与 `templates/BUG-001`（closed）同属一个**重复模式**（「仓库根 `AGENTS.md` 已改、`templates-data/agents-md/*` 未同步」）。
- **生成副本**：`src/core/template-loader.ts:2798`（en）/ `:3251`（zh）`AGENTS_MD_TEMPLATES` 生成段随 `npm run build` 复制该句 → 修复须**改权威源 + 重新 build**（**禁手改生成段**）。
- **功能影响：无**（纯模板文本，无路径解析或运行时行为变更）；不影响流水线推进，故为**非阻塞**。

### 建议修复方向（供 openfeel-schemer，不由测试官实施）

1. 修改 `src/core/templates-data/agents-md/zh-CN.md:112` 与 `en.md:112`，套用 op-003 对仓库根 `AGENTS.md:122` 的措辞——先给无平台限定的定位（「全局 agents 目录 / the global agents directory」），再以括号保留并标注精确落点（"deployed to the global agents directory (opencode adapter: `~/.config/opencode/agents/*.md`)"）。**opencode 硬编码全局绝对路径不得再以「框架部署目标」口吻呈现**。
2. `npm run build` 重生成 `template-loader.ts` 生成段与 `.opencode/` 自举实例；跑 `npm test`（40 文件 / 659 用例）并做 `npm run build` 后 `git status` 零 diff 复核。
3. 同批一并复核 `templates/BUG-001` 遗留的「双源同步」检查清单，避免第三次同类遗漏。

### 关联观察（低优先级，非本 Bug 断言）

- `.openfeel/manual/core/setup.md:30-32` 部署落点表（`~/.config/opencode/AGENTS.md` / `agents/` / `skills/`）未逐行标注「opencode 适配器」（`:33` 配置行已标注）。该文档为内部模块手册、上下文即 opencode 适配器部署，判定为**可接受残留**；若 schemer 一并处置可提升一致性。

> 沉淀：`kb/troubleshooting.md #多源文案同步陷阱`（本阶段新增）

### 关闭记录（v1.1.2-stage-47，commit `2fb38fa`）

修复：权威源 `templates-data/agents-md/{zh-CN,en}.md:112` 套用 `AGENTS.md:122` 口径（「部署到**全局 agents 目录**（opencode 适配器：`~/.config/opencode/agents/*.md`）」/ 英文对应），`npm run build` 重生成 `template-loader.ts` 生成段与 `.opencode/` 自举实例。测试官实测：`rg -n "agents/\*\.md" src/core/templates-data/agents-md AGENTS.md` **三处口径一致**、zh/en 同步；二次 `npm run build` 退出 0 且 `git status -- src/` **零 diff**（生成段幂等）。**关闭**。

**防再犯**：① **文案类改动收尾必做「关键句全仓 `rg`」**——同语义句存在多份副本（模板权威源 `templates-data/agents-md/*`、仓库根 `AGENTS.md`、手册/README），按行号盘点无法覆盖「其它副本」（本 Bug 即 A 类清单只登记 `agents-md:3`、漏掉 stage-44 新增的 `:112`；`templates/BUG-001` 已发生过一次，属**重复模式**）；② 只改**权威源**，生成段/自举实例一律由 `npm run build` 传播（禁手改 `AUTO-GENERATED` 锚点区），并以「二次 build 零 diff」自证幂等；③ 可为「双份同句」加一致性断言，把人工核对变成机器护栏。沉淀见 `kb/troubleshooting.md #多源文案同步陷阱`。

---

## BUG-003：部署到用户全局环境的 skill 模板被改为 `node bin/openfeel.js`，用户项目不可执行（与同类部署模板处置相反）

- **优先级**：low ｜ **阻塞**：否 ｜ **状态**：**closed**（v1.1.2-stage-50 `op-006` T53 双口径修复 + `npm run build` 幂等验收通过）｜ **归因**：**计划口径未覆盖部署语境**（实现与 op-003 ① 一致，非执行偏差）
- **登记阶段**：v1.1.2-stage-48 正式测试验收（事件 C 全仓口径扫描）｜ **登记人**：openfeel-feel-tester
- **私域详细报告**：`.openfeel/users/Liuary/bugs/templates/BUG-003_部署型skill模板改为node-bin口径在用户项目不可执行.md`

### 核心结论

`openfeel-cli-usage` / `openfeel-wizard` 的 skill 权威源（`templates-data/opencode/skills/{name}/SKILL.md`）在事件 C 中被统一改为 `node bin/openfeel.js` 口径（cli-usage 26 处 / wizard 3 处；生成段 `update.ts` / `template-loader.ts` 各 34 处），但这两个 skill 与 agent / agents-md **同属「`openfeel setup`/`update` 部署到用户全局环境」**的产物（落点 `~/.config/opencode/skills/{name}/SKILL.md`）。**用户项目无本仓 `bin/`** → 照指引执行必然报模块不存在：

```
# 用户项目（非 OpenFeel 仓库）
node bin/openfeel.js flow status
# → Error: Cannot find module '...\bin\openfeel.js'
```

**口径矛盾**：`REV-009` 已裁定 agent / agents-md 模板**保留裸 `openfeel`**（理由＝用户环境无本仓 `bin/openfeel.js`），而 skill 模板（同样部署到用户全局）被改为 `node bin/openfeel.js` —— **同类产物处置相反**。

### 影响范围

| 项 | 说明 |
|----|------|
| 触发条件 | 用户在自有项目使用 OpenFeel（skill 由 `openfeel setup` 部署到全局） |
| 直接后果 | 按 skill 指引执行报模块不存在；Agent 需自行回退 `openfeel <cmd>` |
| 功能影响 | 无（CLI 本身正确；本仓内 `node bin/openfeel.js` 口径正确且是事件 C 的修复目标） |
| 严重度依据 | 文案/口径问题 + 同文件已有「旧版风险」加注（cli-usage:16 / wizard:24）部分缓解 + 可自愈 → low |

### 建议修复方向（供 stage-49 裁定）

1. **期望 A**：部署型 skill 的**用户可见命令一律保留 `openfeel <cmd>`**，仅在「本仓开发」语境段落加注 `node bin/openfeel.js`；
2. **或期望 B**：skill 顶部统一声明「命令二态」——用户环境 `openfeel <cmd>` / 本仓 `node bin/openfeel.js <cmd>`，正文不再单列一种形态；
3. 采纳期望 A 时须同步回改 `SKILL_DEFINITIONS` / `OPENCODE_SKILL_DEFINITIONS` 生成段（`npm run build`）与 `.opencode/skills/` 自举；
4. 建议增一条**轻量口径断言或 kb 条目**：「部署型模板（agents / agents-md / skills）一律保留用户视角命令口径」。

> **合并处置建议**：与 `REV-v1.1.2-stage-48` REV-009（low，pending，转 stage-49 U4/U6/U7）**合并移交** `v1.1.2-stage-49`。

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-09-29 22:40 | openfeel-feel-tester | open（low，非阻塞） | v1.1.2-stage-48 验收（事件 C 扫描）发现；证据：模板源 26/3 处、生成段 34/34 处、真实全局 skill（`~/.config/opencode/skills/openfeel-wizard/SKILL.md:14`）仍为旧形态「`openfeel flow wizard`」（待下一次 setup/update 传播） |

> 沉淀：`kb/patterns.md`（本阶段待归档条目「查询型 vs 执行型」判据可扩展至**部署语境**——「部署到用户环境的模板」≠「本仓执行的文档」）。

### 裁定记录（v1.1.2-stage-49，2026-09-30）

- **合并处置已落地**：本 Bug 与 `REV-v1.1.2-stage-48` REV-009② **并入** `v1.1.2-stage-49` **U4-REV-001**（`REV-v1.1.2-stage-49-U4.md`），作为同一条目承接。
- **范围扩围（U4 全量扫描）**：由 stage-48 上报的 **29 行 / 2 skill** 扩至 **34 行 / 5 skill**——新增 **`openfeel-health`（2 行）/ `openfeel-model-check`（2 行）/ `openfeel-recover`（1 行）** 三个 skill **连二态加注都没有**（cli-usage 26 行 / wizard 3 行原有加注）；生成段同源（`update.ts SKILL_DEFINITIONS` / `template-loader.ts OPENCODE_SKILL_DEFINITIONS` 各 34 处）。
- **裁定**：**不修于 stage-49**（本阶段定位「整仓审查 + 4 条 blocking 修复」，仅 B1~B4，未夹带 non-blocking）；**归后续补丁阶段**，修复清单见 U4-REV-001 §五（逐文件 7 步：5 skill 改 `openfeel <cmd>` + 补二态加注 + `npm run build` 重注 + 建议加 lint 断言）。
- **口径判据已沉淀**：`kb/patterns.md #部署语境 vs 本仓语境的命令口径二分：产物落点是唯一判据`（2026-09-30 新增）。
- **状态维持 `open`**（已裁定去处，待补丁阶段执行）。

### 关闭记录（v1.1.2-stage-50，op-006 T53，commit `f50960f`）

采纳**期望 B（双口径）**：5 个部署型 skill 模板（权威源 `src/core/templates-data/opencode/skills/{openfeel-cli-usage,openfeel-wizard,openfeel-health,openfeel-model-check,openfeel-recover}/SKILL.md`）**用户环境主口径 `openfeel <cmd>`**，文首统一加注「本仓自举用 `node bin/openfeel.js <cmd>`」；其中 health/model-check/recover 3 个原**无任何二态加注**的 skill 一并补齐。

验收证据（op-007 收口 + 测试官抽验）：`rg -c "node bin/openfeel.js" src/core/templates-data/opencode/skills/**` 五文件**计数均为 1**（各仅加注行）、其余 skill 为 0；`npm run build` 重生成 `SKILL_DEFINITIONS`/`OPENCODE_SKILL_DEFINITIONS`/`AGENTS_MD_TEMPLATES` 与 `.opencode/` 自举且**重跑零 diff（幂等）**；新增 `test/core/templates.test.ts` 轻量断言（`node bin` 仅许出现在加注行）。满足与 `U4-001` 的关闭条件。

**防再犯**：① **判据用「产物落点」而非「查询型/执行型」**——部署到用户全局的 skill 属部署产物，须与 agent/agents-md 同口径（沉淀 `kb/patterns.md #部署语境 vs 本仓语境的命令口径二分`）；② 模板权威源改动**必跑 `npm run build`**，以「二次 build 零 diff」自证幂等；③ 加轻量断言把人工核对变为机器护栏。

---

## BUG-004：迁移后 `current.md` 统计行沿用「执行中」快照、用例数陈旧（942 vs 实测 949）

- **优先级**：low ｜ **阻塞**：否 ｜ **状态**：**closed**（v1.1.2-stage-53 归档官**就地修正**并留痕）
- **登记阶段**：v1.1.2-stage-53 正式测试验收（迁移准确性核对）｜ **登记人**：openfeel-feel-tester
- **私域详细报告**：`.openfeel/users/Liuary/bugs/templates/BUG-004_current统计行沿用执行中快照且用例数陈旧.md`

### 核心结论

`current.md` 统计行的用例数停留在 **op-004（`4377822`）** 迁移时点的 **942**（`plan` D7-2 要求「统计取**实测现值**」），而 **op-005（`27ce06e`）新增 7 断言**使实测变为 **949**，**未回写** `current.md`（亦未按「一次提交 = 一条记录」追加密记录）；且 stage-53 记录行写「**执行中**」与总进度行「已收官 ✅」措辞扞格。其余统计（59 文件 / 724 键 / 0 过期 / kb 182 / Agent 9 / Skill 17 / 源文件 63）实测均准确。

### 影响范围

- **触发条件**：阅读 `.openfeel/dev/current.md`（团队级视图）。
- **直接后果**：统计数字偏小（陈旧 7）；stage-53 记录措辞与总进度行冲突。
- **功能影响**：无（纯数据/展示，不影响流水线与时序逻辑）。
- **严重度依据**：数据/文案陈旧、其余统计准确 → **low**、**非阻塞**。

### 处置（v1.1.2-stage-53 归档，2026-10-01）

**归属裁定**：该 Bug 的载体为本仓 `.openfeel/dev/current.md`（**工作区存量数据，可本地修正**），**非模板权威源** `templates-data/**`——故由**归档官就地修正**（若属权威源则不得手改、须标注归后续阶段）。

**修正内容**（已留痕于本条目）：
1. 统计行「**942 用例**」→ **949 用例**；知识库计数随本轮归档刷新（182 → **187 条目**，architecture 28 + patterns 116 + troubleshooting 37 + setup 6）。
2. stage-53 记录行「执行中」→「**归档完成**」（含存量迁移），消除与总进度行「已收官 ✅」的措辞扞格。

### 防再犯

① **统计行 = 快照，末次提交必回写**：校验计数类改动（新增断言、新增知识条目）后须同步刷新 `current.md` 统计行，避免「迁移时点快照」被误当终值；② **记录措辞与总进度行须一致**（阶段进入归档即刷新记录表述）；③ 归档官在归档收尾核对统计行（本阶段已纳入归档清单）。

> 沉淀：本条目为 `current.md` 新格式（团队文件）下的**首个统计准确性 Bug**——新格式引入「自动归档轮换 + ≤5 条记录」后，统计行的时效性由「末次提交回写」承载，须作为归档固定检查点。

