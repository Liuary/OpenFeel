# v1.2.2-stage-95 计划 — JSON 输出契约与错误封装基础设施

- **阶段**：`v1.2.2-stage-95`（v1.2.2 四阶段之一 · 基础设施）
- **依赖**：**无**（上游 `v1.2.1-stage-94` 已 done；flow.json `deps=[]`）
- **优先级**：P0（全版本地基：契约冻结 + 错误封装 + 全局项目锚定 + 版本 JSON）
- **关联需求**：REQ-001（CLI 机器可读契约与调度决策下沉（DSH 适配器需求）；关联由 Feel 经 `openfeel req link` 执行）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-17 ｜ **修订轮**：修订 1（计划审查闭环：REV-95-001~004 + 用户最终裁定 R-cp-1/R-cp-2 + 扩展优先原则）
- **基线**：**HEAD `38f1e05`** + 当前工作区（REQ-001 已登记 `draft`）。全表实测；行号 / 键值以该基线为准（漂移按**内容特征**复核）。
- **上游基线**：`npm test` **71 文件 / 1719 用例**（README 登记；文件数本会话实测 71）；`npx tsc --noEmit` = 0（登记值）；`lint i18n` = **945**（本会话实测）；`lint kb` = 0 过期 / 624 引用（本会话实测）；`--version` = **1.2.1**；flow.json `revision 1188` / 17 stages 全 done / `requirements` 1（REQ-001 draft）/ `reviews` 0。
- **定位**：为 v1.2.2 后续三阶段提供**唯一契约助手与错误出口**，并一次性落地两个独立入口能力（`--version --json`、全局 `--project`）。本阶段不改任何既有命令的业务行为。
- **范围（文件级）**：
  - **新增**：`src/core/errors.ts`（错误类型与稳定码表）；`src/commands/shared/json-output.ts`（单文档输出 / JSON 模式单点）；`src/cli/project-option.ts`（`--project` 预扫描与 chdir）；`docs/json-contract.md`（契约正文）；`test/cli/{json-contract,error-envelope,project-option}.test.ts`。
  - **修改**：`src/cli/index.ts`（全局选项 / runCli 预扫描 / JSON catch / 非 JSON 内部错误 exit 3）；`src/commands/shared/errors.ts`（failRefusal/failInternal/并发 JSON）；`src/commands/flow.ts`（JSON 模式相关失败路径；`flow archive` legacy 载荷追加 `errorKind`）；`src/commands/req.ts`（legacy 载荷追加 `errorKind`）；`src/commands/knowledge.ts`（dedup 的 `--project` 扩展路径）；`src/commands/instructions.ts`（补 `schemaVersion`）；`src/commands/setup.ts`（如需错误封装）；`src/core/i18n-data/{zh-CN,en}.ts`；相关测试。
  - **只读**：`src/core/flow-manager.ts`、`src/core/pipeline-schema.ts`、`src/commands/{stage,config,view,plan,project,archive}.ts`（本阶段不改其行为；stage-97 处理）。
- **边界**：
  1. **不改任何既有命令的人类输出**（逐字不变；以补丁前/后快照 diff 取证）；退出码 0/1/2 语义零改动，新增 3 仅用于内部错误（见「扩展优先原则」C4）。
  2. **不改既有 18 个 `--json` 出口字段**（只允许 P2-1 的增量：`instructions` 补 `schemaVersion` 首键、条件键 `null` 占位、legacy 载荷末尾追加 `errorKind`；不删除、不重排、不改类型）。
  3. **不迁移** `init` / `migrate` / `update` / `model` 等人类专用失败路径（契约文档列明边界）。
  4. **不引入第三方依赖**；不改 `package.json` 依赖；不改 CI。
  5. **不直写 `flow.json`**；不推进 phase；阶段注册 / REQ-001 关联由 Feel 经 CLI 执行。
  6. **不实现** `flow next` / 读命令 `--json` / 调度属性（归 stage-96/97）。
  7. **`--project` 单点注入**：不得在命令层新增第二套项目根解析；不替换 121 处 `process.cwd()`。

## 审查闭环记录（REV-95-001~004 · plan_review 2026-10-17）

> 审查来源：`.openfeel/users/Liuary/code_review/REV-95.md`（结论 `plan_pending`）。以下为用户最终裁定后的处置结论；**2 条 blocking + 2 条 non-blocking 全部在计划层闭环**，不再留待方案期。

| REV | 级别 | 处置结论 | 修订位置 |
|-----|:--:|------|------|
| **REV-95-001** | blocking / high | **已闭环（采纳替代方案 R-cp-1）**：退出码扩展为 **0/1/2/3**——`0` 成功；`1` 预期拒绝（`kind=refusal`，含门禁拒绝、相位非法、非法参数/用法错误）；`2` 并发写冲突（保留既有 `EXIT_CONCURRENT` 语义，不得改变）；`3` 内部错误（`kind=internal`，未捕获异常/内部故障）。`error.kind` 仍为分类权威（仅 `refusal`/`internal`），退出码为冗余信号。**并发冲突的 kind 归为 `refusal`**（预期、可重试，不是内部故障），`exitCode=2` 与之并行。REQ-001 L80「2=内部错误或用法错误」登记为**需求文本勘误**（以本裁定为准），在计划、`docs/json-contract.md` 与 `CHANGELOG`（stage-98）留痕。 | §二「退出码」；T2「退出码裁定」；§五.2；§六 R-95-8；版本计划 D-1.3/D-1.6/D-1.6.1；`deps.yaml` 不变量 |
| **REV-95-002** | blocking / high | **已闭环（采纳建议一 R-cp-2）**：legacy `{schemaVersion,error:'...'}` 载荷**追加顶层 `errorKind`**（值域 `refusal|internal`），**不改 `error` 字符串类型、不改既有键序**（新键恒末尾）；使全部 `--json` 失败路径 100% 可分类；`typeof doc.error` 形状判别规则仍写入契约文档。T2 增补 **12 行 `code → kind → exitCode` 三列映射表**（11 个阶段内 code + 1 个 stage-97 预留 `ARCHIVE_FAILED`），作为 `error-envelope.test.ts` 断言基线；显式 `FLOW_CONCURRENT_CONFLICT → refusal/2`、`ARCHIVE_WRITE_FAILED → internal/3`、`INVALID_ARGUMENT`（用法错误）`→ refusal/1`。 | §二「错误封装/错误映射」；T2；T5 legacy 段；§五.1/2；§六 R-95-2/R-95-9；版本计划 D-1.3/D-1.5/D-1.6.2；`deps.yaml` |
| **REV-95-003** | non-blocking / medium | **已闭环（四项全部计划层裁定）**：① chdir 后语言**按目标项目解析**（理由与影响见 T3）；② `--log-file` 相对路径**定稿为 chdir 前按原始 cwd 解析**（示例见 T3）；③ `--project` 预扫描误判面与 `--json` **成对缓解**（跳过取值选项 token + 文档边界 + 共用测试组）；④ 明示「**CLI 单进程单命令 → chdir 每进程一次 → 无进程内多项目并发**」前提，防止误读为常驻进程。 | T3 边界裁定；§四 Q2/Q4；§六 R-95-3/R-95-4；§五.3 |
| **REV-95-004** | non-blocking / low | **已闭环**：T1 增补**构造顺序约束** `{ schemaVersion: 1, ...doc }`（运行时首键保证，类型签名不保证）；Q3 增补可操作**豁免判据**（仅当已知外部消费者对键集做严格相等断言时才豁免；豁免须在冻结表登记为**条件键**并附依据）。 | T1；§四 Q3；T5 条件键段；§五.1 |

**审查闭环结论**：两项 blocking 的语义权威缺口（退出码口径、legacy 双形态分类 + code→kind 映射表）均已在计划层定稿，op-001/op-002 可直接方案化；非阻塞两项已登记为显式裁定/判据。计划可提交 `plan_review` 复审。

## 扩展优先原则（v1.2.2 全局约束 · 用户强制输入）

> **OpenFeel 本体必须保持正常可用。** 本原则为 v1.2.2 **全局不变量**（同步登记于版本计划 §三 D-0、§八 与 `deps.yaml` `invariants`），stage-95 逐项落实。

1. **如非必要，只扩展、不修改**：新增字段 / 新增退出码 / 新增选项优先，既有语义零改动。
2. **确实必须修改时，原本的适配必须同步跟进**：受影响的既有适配器 / 模板 / 技能 / 文档（opencode / Claude Code 适配模板、`openfeel-cli-usage` skill、`docs` / `manual` / `README`）必须在**同一版本内**同步更新，不得让任何既有消费者静默失效。
3. **本阶段存量声明（属「只扩展」）**：
   - **退出码**：既有 **0 成功 / 1 预期拒绝 / 2 并发冲突** 语义**零改动**；**3 为新增**（内部错误分类补全；原路径为未捕获异常/通用失败，未纳入既有语义表）。
   - **legacy `error` 字符串载荷**：`error` 类型恒为 `string`，既有键与键序**零改动**；仅在末尾**追加**顶层 `errorKind`。
   - 新增 `--project` / `--version --json` / `errorKind` / 映射表均为增量；无既有字段删除、无重排。
4. **本阶段「若不得不修改」候选项**（逐项给扩展实现与同步跟进清单；**优先扩展路径**）：

| # | 候选项 | 扩展实现（优先） | 必要时同步跟进清单 |
|:-:|------|------|------|
| **C1** | `instructions --json` 补首键 `schemaVersion`（P2-1 明确要求，无法回避） | `{ schemaVersion: 1, ...doc }` 只增一键，既有 9 键相对顺序不变 | `docs/json-contract.md`（冻结表 + 有意变更登记）、`test/core/artifact-graph/instruction-loader.test.ts` + 命令测试断言、`openfeel-cli-usage` skill 出口示例、README/docs 若列键集、DSH 适配器契约断言（stage-98）、CHANGELOG（stage-98） |
| **C2** | `knowledge dedup --project` 处置（扩展优先） | **保留本地 `--project` 声明**（help / 语法零变化），同时注册根全局 `--project`；动作经 `optsWithGlobals()` 读取（Commander 语义：全局优先）；两者同时给出且解析路径不一致 → `INVALID_ARGUMENT`（refusal/1） | 若实测同名双注册引发 help 重复/解析歧义而必须删除本地声明：`docs/commands.md`、`.openfeel/manual/cli/commands.md`、`openfeel-cli-usage` skill、`test/commands/knowledge.test.ts` 同步；CHANGELOG（stage-98） |
| **C3** | 条件键 `null` 占位（`flow health.reconciled` / `flow ops list[].warning`） | 只增键，`null` 占位；不删/不改既有键 | 冻结表登记（恒在键 vs 条件键）；豁免仅按 Q3 判据；`openfeel-cli-usage` skill 示例；CHANGELOG（若豁免） |
| **C4** | 非 JSON 模式内部错误退出码 | **只新增 3**：既有 0/1/2 语义零改动；内部故障原为未捕获异常（未纳入既有语义表），本版归入新增 3 | 契约文档明确「0/1/2 语义不变；3=internal」；CHANGELOG（stage-98）；DSH 适配器分类断言（stage-98） |
| **C5** | legacy `errorKind` 追加 | 仅追加键（末尾），`error` 类型与键序零改动 | 冻结表/契约文档登记；`error-envelope.test.ts`；DSH 适配器可改用 `errorKind`；CHANGELOG（stage-98） |
| **C6** | 全局 `--project` 新增 | 纯新增根选项 + 预扫描 chdir；不传时行为逐字不变 | `docs/commands.md` / manual / skill / README 选项表（stage-98）；help 键 zh/en 成对（本阶段） |

> **结论**：C1 为唯一「必须修改既有输出键集」项（需求 P2-1 强制）；C2~C6 均存在扩展路径。C1 的代码/契约测试面在 stage-95 内完成，文档载体由版本计划 §六 C 于 stage-98 收口（**同一版本内，不静默失效**）。


## KB 检索（`openfeel-check-kb`）

已加载 `.openfeel/kb/index.md` 分类摘要。**高度相关条目**：

- `kb/patterns.md #CLI --json 成功/失败同契约（单文档 + schemaVersion:1 + 退出码语义）` → 契约助手与错误 envelope 的既有范式。
- `kb/patterns.md #help 键命名双规` → 新增全局 `--project` 与命令选项的 help 键须 zh/en 成对。
- `kb/patterns.md #CLI 退出码语义（0 成功 / 1 拒绝 / 2 并发）` → 保留既有 0/1/2，新增 3=internal；`kind` 为分类权威。
- `kb/patterns.md #顶层可选字段「读侧宽容不注入」模式` → 条件键补 `null` 时不得改变既有读取语义。
- `kb/patterns.md #零回归取证范式（补丁前/后归一化快照 diff 空）` → 人类输出逐字不变与 18 出口键序冻结的取证方法。
- `kb/patterns.md #陈旧计数「全枚举」纪律` → 契约文档中的出口计数 / 键数须全枚举，禁「约 / 等」。
- `kb/troubleshooting.md #断言串与落文逐字核对纪律` + `#多源文案同步陷阱` → 错误码 / 文案 / 断言同批原子更新。
- `kb/troubleshooting.md #默认开启写真实用户目录的副作用防护（VITEST 继承 + OPENFEEL_LOG=0）` → `--project` / 契约测试的隔离环境纪律。
- `kb/troubleshooting.md #改 templates-data 源须同批重生成「双生成物」` → 本阶段如触碰模板版本行（不应触碰）须 build；以 `--porcelain` 兜底。
- **无**「统一错误封装 / 全局 --project / JSON 契约冻结」既有条目 → 归档轮补沉 architecture 与 patterns。

> 执行任务前，若知识库中有相关条目，务必参考。重复踩过的坑不可再犯。

---

## 一、实测清单（基线 HEAD `38f1e05`）

### 表 A：JSON 出口与契约现状

| # | 事实（实测） | 位置 | 结论 |
|:-:|------|------|------|
| A1 | 实际注册 **18** 个 `--json` 选项：`flow.ts` 11（status/overview/current/metrics/phases/mode/ops list/archive/archive list/archive show/health）+ `req.ts` 5（list/show/split/board/next）+ `instructions.ts` 1 + `setup.ts` 1 | `grep -rn "option('--json" src/commands` | 冻结集 = 18；需求单正文 17 个（未含 setup） |
| A2 | `instructions --json` 返回 `artifact/task/project_context/rules/dependencies/output/instruction/template/unlocks`，**无 `schemaVersion`** | `src/core/artifact-graph/instruction-loader.ts:365-398` | P2-1 须补首键 `schemaVersion:1`；显式登记为有意变更 |
| A3 | `flow status --json.stages[]` 元素恰 `{id,phase,status,deps,ops}` | `flow.ts:2467-2473`（实测输出） | 本阶段仅冻结；stage-96 追加 |
| A4 | `flow phases --json` 恰 7 键，`reviewTier` 为展示值 | `flow.ts:454` | 本阶段仅冻结；stage-96 追加 |
| A5 | `flow archive <version> --json` 判据拒绝输出 `{schemaVersion,error:'gate-rejected',version,notDone,blockingOpen}`；成功 dry-run 无 `eligible` | `flow.ts:1746-1750 / 1783-1785` | legacy 载荷保留；stage-97 追加 |
| A6 | `req` 失败经 `failJson` 输出 `{schemaVersion,error:'...'}` 字符串 | `req.ts:33-36` | legacy 载荷保留；类型判别文档化 |
| A7 | `flow health --json` 仅在 `--fix` 时追加 `reconciled`；`flow ops list --json` 仅在 `fill==='empty'` 时追加 `warning` | `flow.ts:1981-1988 / 1182-1191` | P2-1 条件键 `null` 占位评估项 |
| A8 | `setup --check --json` 为 `{schemaVersion,status,cliVersion,deployedVersion}` | `setup.ts:24-32` | 冻结 |

### 表 B：错误处理现状

| # | 事实（实测） | 位置 | 结论 |
|:-:|------|------|------|
| B1 | 无 `src/core/errors`；命令层 `process.exit(1)` 143 / `exitCode=1` 37 / `console.error` 220 | `src/commands/**` | 分层迁移；本阶段只覆盖 JSON 模式相关失败 |
| B2 | `handleCliError` 记录运行日志后重新抛出；`runCli` 无 catch | `src/cli/index.ts:183-207` | 增加 JSON 模式 catch；非 JSON 保持 |
| B3 | `handleConcurrentConflict` 输出本地化 stderr + `process.exit(2)` | `shared/errors.ts:19-28` | JSON 模式改为 envelope + exit 2 |
| B4 | `flow advance` 非法相位 / 无路径 / blocking REV 均走 `process.exit(1)` + 中文本地化 stderr | `flow.ts:800-1000` 区间 | 迁移为 `failRefusal`（P0-3 主场景） |
| B5 | `flow phases` / `flow mode` 非法参数与未知阶段走 stderr | `flow.ts:398-430 / 498-520` | JSON 模式迁移为 envelope |

### 表 C：`--project` 与 CLI 骨架

| # | 事实（实测） | 位置 | 结论 |
|:-:|------|------|------|
| C1 | 仅 `knowledge dedup` 有 `--project <path>` | `knowledge.ts:178` | **保留本地 `--project` 声明**（零修改）；全局同名选项并行提供，二者取值一致时语法兼容。按扩展优先原则不收敛、不删除本地选项。 |
| C2 | `process.cwd()` 在 `src/commands` 121 处；项目根解析散落命令层 | 实测 | 不改调用点；预扫描 chdir |
| C3 | 根全局选项 `--no-color` / `--encoding` / `--log-file` / `--no-log` / `--debug` 可置于子命令之后（实测 exit 0） | `src/cli/index.ts:21-32` | `--project` 按同范式注册 |
| C4 | `runCli` 顺序：`logCliStart` → `emitGlobalDeployCheck` → `program.parse` → `logCliDone` | `src/cli/index.ts:194-207` | `--project` 预扫描须在 `logCliStart` 之前（保证日志 project 字段正确） |

### 表 D：`--version` 现状

| # | 事实（实测） | 位置 | 结论 |
|:-:|------|------|------|
| D1 | `program.version(pkg.version, '-v, --version')`；`--version --json` 当前输出纯文本 `1.2.1`（忽略 `--json`） | `src/cli/index.ts:21-24`；实测 | 预扫描拦截；纯文本不变 |
| D2 | 无 `VERSION` 常量；版本直读 `package.json` | `src/cli/index.ts:15-16` | JSON 复用同一来源 |

### 表 E：门禁基线

| 项 | 起点 | 阶段末目标 |
|----|------|------|
| `npm test` | 71 文件 / 1719 用例 | 新基线（新增契约/错误/项目测试逐项登记） |
| `npx tsc --noEmit` | 0 | 0 |
| `lint i18n` | 945 | ≥ 945 + 新 help/错误文案键（逐键列名） |
| `lint kb` | 0 过期 / 624 引用 | 0 |
| `npm run build` | ×2 幂等 | ×2 幂等（本阶段不应触碰 templates-data） |
| `--version` | 1.2.1 | 1.2.1（版本收口归 stage-98） |
| 人类输出 | 基线快照 | **逐字不变**（补丁前/后 diff 空） |

---

## 二、目标语义与不变量

| 维度 | 内容 |
|------|------|
| JSON 契约 | `schemaVersion` 恒为首键且为 1；stdout 单文档；新输出可选字段 `null` / 数组 `[]` / 映射 `{}`；18 个既有出口只增不改、键序保留 |
| 错误封装 | 新 envelope `{schemaVersion:1,error:{code,kind,message,detail}}` 覆盖文本型失败；`kind ∈ {refusal,internal}`；legacy `{schemaVersion,error:'...'}` **保留原类型与键序并追加顶层 `errorKind`**；`typeof doc.error` 为双形态判别唯一规则；`code` 语言无关 |
| 退出码 | **0** 成功；**1** 预期拒绝（`kind=refusal`，含门禁拒绝、相位非法、非法参数/用法错误）；**2** 并发写冲突（`kind=refusal`，保留 `EXIT_CONCURRENT` 语义）；**3** 内部错误（`kind=internal`）。`kind` 为分类权威，退出码为冗余信号；**0/1/2 语义零改动，3 为新增** |
| 错误映射 | `code → kind → exitCode` 三列映射表为单一权威（12 行，见 T2）；契约文档与 `error-envelope.test.ts` 同源断言；legacy 字符串 code → 稳定 code 的完整清单在方案期全枚举 |
| 项目锚定 | `--project <path>` 等效 cwd；单点注入；不传回退 `process.cwd()`；非法路径明确失败；**chdir 后语言按目标项目解析**；`--log-file` 相对路径在 chdir 前按原始 cwd 解析；**单进程单命令**前提 |
| 版本 JSON | `--version --json` → `{schemaVersion:1,version,node}`；纯文本不变 |
| 零回归 | 18 出口字段零破坏；人类输出逐字不变；存量 `flow.json` 零注入；phase 枚举不变 |

**不变量**：

1. 新增 helper 为**纯增量**；不改变既有命令的控制流（除 JSON 模式失败输出与 `--project` 预扫描）。
2. `--json` 模式检测**单点**：`runCli` 预扫描 argv → `setJsonMode`；命令层只读 `isJsonMode()`，不得各自解析。
3. 错误码表为**单一来源**（`src/core/errors.ts`）；命令层不得硬编码字符串码。
4. `--project` 预扫描只处理 `--project <path>` / `--project=<path>`；不吞其它选项值；路径解析以**原始 cwd** 为基准。
5. `knowledge dedup --project` 的命令行语法与语义保持不变；**实现位置不收敛**（保留本地声明，全局同名选项并行提供；两者冲突按 C2 判据处理）。
6. 18 出口冻结表以**实测键序**为准；`instructions` 补首键为唯一结构性新增。
7. 不引入第三方依赖；不改 CI；不直写 `flow.json`。
8. **扩展优先原则**（见同名章节）：只增不改；C1~C6 候选项优先扩展路径，必须修改时同版本同步跟进，既有消费者不得静默失效。
9. **legacy `error` 字符串载荷零改动**：类型恒为 `string`、既有键与键序不变，仅末尾追加 `errorKind`（`refusal|internal`）。
10. **退出码 0/1/2 语义零改动，3 为新增内部错误码**；`kind` 恒为分类权威，退出码仅作冗余信号。
11. `--log-file` 相对路径以**原始 cwd** 为基准；chdir 后语言随目标项目；CLI 为单进程单命令（chdir 每进程至多一次）。

---

## 三、变更点清单（编号 T）

### T1 — JSON 契约助手与 `docs/json-contract.md`

- **实现**：新增 `src/commands/shared/json-output.ts`：
  - `withSchemaVersion<T extends object>(doc: T): { schemaVersion: 1 } & T`——构造首键。**构造顺序约束（REV-95-004）**：实现必须写 `{ schemaVersion: 1, ...doc }`（对象字面量先写 `schemaVersion`），**不得**写 `{ ...doc, schemaVersion: 1 }`；类型签名不保证运行时首键，契约测试 `Object.keys(doc)[0] === 'schemaVersion'` 兜底。
  - `emitJson(doc)`——`console.log(JSON.stringify(doc, null, 2))` 单文档。
  - `setJsonMode(boolean)` / `isJsonMode()`——进程级单点；测试可显式设置。
  - `resolveJsonMode(argv: string[]): boolean`——扫描 `--json`（至少覆盖 `--json`；是否支持 `--json=true` 方案期定稿）。
- **契约正文** `docs/json-contract.md`：
  - 单文档规则、首键规则、null/[]/{} 规则、数组元素字段冻结规则、**退出码 0/1/2/3 语义表**、**`code → kind → exitCode` 三列映射表（12 行，与 T2 同源）**、错误 envelope、legacy `error` 双形态判别（`typeof doc.error`）与 `errorKind` 增量、**REQ-001 L80 需求文本勘误留痕**、**扩展优先原则与 C1~C6 同步清单**、18 出口冻结表、本版新增出口表、迁移边界（哪些命令不在 JSON 模式错误封装范围）。
  - 冻结表：每个出口列出「顶层键序 + 数组元素键集 + 条件键占位」；以实测为准。**条件键必须以「条件出现键」或「恒在键」二选一登记**；豁免为条件键时须附依据。
- **测试**：`test/cli/json-contract.test.ts` 骨架（stage-97 扩展全部新出口）；`test/cli/index.test.ts` 增 `resolveJsonMode` 单测；`withSchemaVersion` 首键构造顺序单测（含 `{ ...doc, schemaVersion: 1 }` 反例说明）。
- **边界**：不改任何命令输出；`instructions` 的 `schemaVersion` 补齐归 T5；映射表只定义不实现错误层（归 T2）。

### T2 — 错误层与 `runCli` JSON 模式单点

- **实现**：
  - `src/core/errors.ts`：`CliErrorKind = 'refusal' | 'internal'`、稳定码表（12 个：`NO_INIT` / `INVALID_ARGUMENT` / `STAGE_NOT_FOUND` / `PHASE_TRANSITION_ILLEGAL` / `PHASE_PATH_NOT_FOUND` / `BLOCKING_REVIEWS` / `ARCHIVE_GATE_REJECTED` / `ARCHIVE_WRITE_FAILED` / `PROJECT_NOT_FOUND` / `FLOW_CONCURRENT_CONFLICT` / `INTERNAL_ERROR` / `ARCHIVE_FAILED`（stage-97 预留））、`CliError` 类型、`isCliError`；码表内嵌 `kind` 与 `exitCode`（**单一来源**，供命令层与测试共用）。
  - `src/commands/shared/errors.ts`：`failRefusal({ code, message, detail })`（JSON → envelope；非 JSON → stderr 本地化文案 + 按表退出码）、`failInternal(err)`（`kind:'internal'`、`INTERNAL_ERROR`、exit 3）；`handleConcurrentConflict` 增 JSON 分支（envelope `code:'FLOW_CONCURRENT_CONFLICT'`、**`kind:'refusal'`**、exit 2）。
  - `src/cli/index.ts`：`runCli` 开头 `setJsonMode(resolveJsonMode(argv))`；`program.parse()` 外层统一 catch——JSON 模式输出 envelope（`kind:'internal'`，`code:'INTERNAL_ERROR'`，exit 3），运行日志记录堆栈；非 JSON 模式记录日志、保持既有 stderr 形态后将退出码置 3（不再依赖未捕获异常）。
  - **用法错误覆盖**：JSON 模式下 Commander 解析期错误（未知命令 / 未知选项 / 缺参）也须输出 `INVALID_ARGUMENT` envelope + exit 1；实现机制（`exitOverride` 限定 JSON 模式并放行 `exitCode 0` 的 `--help`/`--version`）方案期定稿；**非 JSON 模式零变化**。
  - `flow.ts` 迁移范围：`flow advance`（非法相位 / 无路径 / blocking REV / dry-run 校验失败）、`flow phases` / `flow mode` 参数与未知阶段失败、`flow archive` 文本型失败（legacy JSON 载荷仅追加 `errorKind`）、`flow health` 失败（已有 JSON 输出，保留）、`flow status/overview/current/metrics/ops list` 的空态文档（已符合）。
  - `setup.ts` / `instructions.ts`：JSON 模式失败接入 envelope（`instructions` 的 artifact 不存在等）。
  - **legacy `errorKind` 增量（R-cp-2）**：`flow archive*` / `req *` 的 `{schemaVersion,error:'...'}` 失败载荷**追加顶层 `errorKind`**（`refusal|internal`），`error` 字符串类型与既有键序**零改动**（新键恒末尾）。`flow archive` 的 `archive-write-failed` → `errorKind:'internal'` 且退出码 1 → 3（按映射表，登记为分类补全）；其余 legacy 字符串 → `refusal`/1。`typeof doc.error === 'string'` 仍为双形态判别规则，写入契约文档。`failJson` 需扩展为可指定退出码（默认 1）。
- **退出码裁定（R-cp-1，权威口径）**：`0` 成功；`1` 预期拒绝（`kind=refusal`，含门禁拒绝、相位非法、非法参数/用法错误）；`2` 并发写冲突（保留 `EXIT_CONCURRENT`，`kind=refusal`——预期、可重试，不是内部故障）；`3` 内部错误（`kind=internal`，未捕获异常/内部故障）。`error.kind` 仍是分类权威，退出码为冗余信号。**既有 0/1/2 语义零改动；3 为新增**。**REQ-001 L80「2=内部错误或用法错误」登记为需求文本勘误（以本裁定为准），在 `docs/json-contract.md` 与 `CHANGELOG`（stage-98 收口）留痕。**
- **`code → kind → exitCode` 映射表（12 行；单一权威，入 `docs/json-contract.md`，作为 `error-envelope.test.ts` 断言基线）**：

| code | kind | exitCode | 说明 |
|------|------|:--:|------|
| `NO_INIT` | refusal | 1 | 项目未初始化，可引导 init（预期拒绝） |
| `INVALID_ARGUMENT` | refusal | 1 | 非法参数 / 用法错误（含 Commander 解析期错误） |
| `STAGE_NOT_FOUND` | refusal | 1 | 阶段不存在 |
| `PHASE_TRANSITION_ILLEGAL` | refusal | 1 | 相位转移非法 |
| `PHASE_PATH_NOT_FOUND` | refusal | 1 | 无合法推进路径 |
| `BLOCKING_REVIEWS` | refusal | 1 | blocking open REV 门禁拒绝 |
| `ARCHIVE_GATE_REJECTED` | refusal | 1 | 版本归档判据拒绝 |
| `ARCHIVE_WRITE_FAILED` | internal | 3 | 归档写盘失败（用户无法通过修正输入解决） |
| `PROJECT_NOT_FOUND` | refusal | 1 | `--project` 路径不存在/非目录（用法错误） |
| `FLOW_CONCURRENT_CONFLICT` | refusal | 2 | 并发写冲突：预期、可重试；**保留既有 exit 2** |
| `INTERNAL_ERROR` | internal | 3 | 未捕获异常 / 内部故障 |
| `ARCHIVE_FAILED` | refusal | 1 | stage-97 预留（`archive <stage> --json` 失败；本阶段不实现，仅登记映射） |

- **要求**：`detail` 含可定位字段（如 `{stage,from,to}` / `{key,value,allowed}`）；`message` 本地化；`code` 恒定，zh/en 一致；退出码按上表。
- **测试**：`test/cli/error-envelope.test.ts`——隔离 fixture + spawn CLI：refusal/internal/并发/zh-en code 一致/非 JSON 不变；**逐行断言 12 行映射表（code↔kind↔exitCode）**；**legacy 载荷断言 `error` 为 string、既有键序不变、`errorKind` 存在且正确**；**exit 3 的 JSON 与非 JSON 双模式**；用法错误 exit 1；并发 `kind:'refusal'` + exit 2。
- **边界**：不迁移 `init/migrate/update/model`；非 JSON 模式人类文案逐字不变；退出码除「internal 归入新增 3」外不变（0/1/2 语义零改动）。

### T3 — 全局 `--project <path>`

- **实现**：
  - `src/cli/index.ts` 根命令新增 `.option('--project <path>', t('help.global.project', ...))`（help 键双表成对）。
  - 新增 `src/cli/project-option.ts`：`extractProjectArg(argv): string | null`（支持 `--project <path>` / `--project=<path>`；取首个出现；缺失值 → 明确错误）；`applyProjectOption(argv, { json })`——`resolve(originalCwd, path)` → `statSync` 校验目录 → `process.chdir(abs)`；失败：JSON → `PROJECT_NOT_FOUND` envelope exit 1；非 JSON → stderr + exit 1。
  - `runCli` 顺序：`setJsonMode` → `applyProjectOption` → `logCliStart` → `emitGlobalDeployCheck` → `program.parse`。**注意**：JSON 模式需在 `--project` 失败前已知，故先 `setJsonMode`；`--log-file` 相对路径在 `applyProjectOption` 之前按原始 cwd 解析（见边界裁定 2）。
  - `knowledge.ts`：**扩展路径优先（C2）**——保留本地 `.option('--project <path>')`（help / 语法零变化），同时全局选项生效；dedup 动作从 `command.optsWithGlobals().project` 读取（Commander 语义：全局优先）；两者同时给出且解析后路径不一致 → `INVALID_ARGUMENT`（refusal/1）。若方案期实测同名双注册引发 help 重复/解析歧义，则改为删除本地声明并同步 C2 清单（方案期定稿并登记）。
- **边界裁定（REV-95-003，计划层定稿）**：
  1. **语言解析**：chdir 后 `getCliLang(process.cwd())` 按**目标项目**解析 → 命令输出/错误文案跟随目标项目语言。理由：`--project` 的语义即「以该路径为项目上下文」，语言属项目级配置；影响：根选项描述在模块加载期（chdir 前）求值、`applyHelpI18n` 在 parse 前（chdir 后）求值，A/B 项目语言配置不同时可能出现「根选项描述语言 ≠ 命令输出语言」。该边界写入契约文档与命令文档；**不改为原始 cwd 解析**（避免同一命令内两套语言源）。
  2. **`--log-file` 相对路径**：**定稿为 chdir 前按原始 cwd 解析**。示例：`cd /work && openfeel --project /work/projB --log-file logs/run.log flow status` → 日志写入 `/work/logs/run.log`（而非 `/work/projB/logs/run.log`）。理由：路径由用户在调用目录键入，日志是调用侧工件；绝对路径行为不变。实现：预扫描阶段在 chdir 前解析为绝对路径（或记录 `originalCwd` 后按原始 cwd 解析）。
  3. **预扫描误判面（与 `--json` 成对缓解）**：`--project` 与 `--json` 共用同一扫描器与同一测试组；扫描器跳过已知取值选项的下一个 token（至少 `--encoding` / `--log-file` / `--project` / `--title` 等），并登记边界「选项取值恰为裸 `--xxx` token 时不保证识别」；测试覆盖 `--title --json` 与 `--encoding --project` 两类误判。
  4. **并发前提**：CLI 为**单次进程单命令** → `chdir` 每进程至多一次 → **不存在进程内多项目并发**；`--project` 不得被解读为常驻进程的多项目会话能力（REQ-001 P1-2 的「单进程服务多项目会话」指适配器每次调用传 `--project`）。该前提写入契约文档与风险表。
- **测试**：`test/cli/project-option.test.ts`——临时目录 A/B：从 A 执行 `--project B flow status --json` / `knowledge list --json`；`--project` 后置；`--project=path`；无效路径；`knowledge dedup --project` 回归；**A/B 语言配置不同时命令文案跟随 B**；**`--log-file` 相对路径落在原始 cwd**；**`--title --json` / `--encoding --project` 误判对**。
- **边界**：不改 121 处 `process.cwd()`；不改变无 `--project` 时的行为；`--log-file` 相对路径按**原始 cwd** 解析（不是 chdir 后）；不承诺常驻进程内多项目切换。

### T4 — `--version --json`

- **实现**：`runCli` 预扫描：若 argv 同时含 `--version`/`-v` 与 `--json`，输出 `{schemaVersion:1,version:pkg.version,node:process.version}` 并 `return`（不进入 Commander）。纯文本路径不变。
- **测试**：`test/cli/index.test.ts` 或 `test/cli/json-contract.test.ts`——`--version --json` / `-v --json` 精确形态；`--version` 纯文本仍为 `1.2.1`。
- **边界**：`--help --json` 不处理（Commander 帮助文本保持）；不引入 `VERSION` 常量。

### T5 — 18 出口契约审计（P2-1）

- **实现**：
  - 逐个出口建立「现有键序 → 冻结键序」表（`docs/json-contract.md`）；每个键登记为**恒在键**或**条件出现键**，不得含糊。
  - `instructions --json`：在命令层用 `withSchemaVersion` 包装（优先命令层，避免核心层耦合输出契约）；**本项为 C1「必须修改」候选：只增首键，既有 9 键相对顺序不变**；需同步 `test/core/artifact-graph/instruction-loader.test.ts` / 命令测试的键断言。
  - 条件键评估：`flow health.reconciled`（无 `--fix` 时补 `null`）、`flow ops list[].warning`（非 empty 时补 `null`）；**豁免判据（REV-95-004）**：仅当存在**已知外部消费者对键集做严格相等断言**时才可豁免；豁免须在冻结表登记为**条件出现键**并附依据（消费者名称 + 断言位置）；否则默认补 `null`。
  - `flow archive` / `req` legacy `error` 字符串载荷：`error` 类型与键序不改；由 **op-002（T2）** 在末尾追加 `errorKind`；契约文档登记双形态判别（`typeof doc.error`）与映射。
- **测试**：`test/cli/json-contract.test.ts` 对 18 出口逐个断言：`Object.keys(doc)[0]==='schemaVersion'`、`doc.schemaVersion===1`、键序/键集与冻结表一致、stdout 单文档；**条件键按登记类型断言（恒在/条件出现）**；**legacy 失败载荷断言 `errorKind` + 既有键序**。
- **边界**：不删除 / 不重排既有键；条件键补 `null` 须逐个评估并登记；不改数组元素既有字段类型；**豁免禁止默认化（无依据即视为恒在键）**。

### T6 — i18n + 门禁 + 扩展同步核对

- 新增 help 键（`help.global.project`）、错误文案键（若 `failRefusal` 需要 `message` 键）、`--version --json` 无文案；zh/en 成对。
- **既有适配/文档同步核对（扩展优先原则）**：按 §扩展优先原则 C1~C6 清单逐项给出「已同步 / 无需变更（依据）」结论，禁止留空。本阶段直接落盘 `docs/json-contract.md` + 代码/测试面；其余载体（`docs/commands.md` / `GETTING_STARTED` / README×3 / `.openfeel/manual/**` / `openfeel-cli-usage` skill / opencode 与 Claude Code 适配模板 / CHANGELOG）登记于版本计划 §六 C，由 stage-98 在**同一版本内**收口。
- 门禁：`npm test` / `npx tsc --noEmit` / `lint i18n` / `lint kb` / `npm run build` ×2（预期无模板改动，仍复跑）/ 人类输出快照 diff 空 / 18 出口契约测试全绿 / **映射表 12 行断言全绿**。

---

## 四、开放问题（方案期 / 执行期定稿）

- **Q1**：legacy `error` 字符串 → 稳定 `code` 的**完整清单**（执行期全枚举 `flow archive*` / `req *` 全部 failJson 字符串）与 `detail` 最小字段集；**映射表 12 行已在 T2 定稿，不再开放**。
- **Q2**：预扫描器「已知取值选项」的最终名单（至少 `--encoding` / `--log-file` / `--project` / `--title`）；是否支持 `--json=true` 等价形态；**误判边界规则已在 T3.3 定稿**，方案期仅定稿名单与实现。
- **Q3**：条件键 `null` 占位的逐键评估（`reconciled` / `warning` / 其他）与冻结表登记（恒在键 / 条件出现键）；**豁免判据已定稿（REV-95-004）：仅当已知外部消费者对键集做严格相等断言时才豁免，且须附依据；否则默认补 `null`**。
- **Q4**：`--project` 缺失值 / 非法路径文案；`knowledge dedup` 同名双注册的实测结论（保留本地声明 vs 删除本地声明 + C2 同步清单）；**语言解析与 `--log-file` 相对路径已定稿（T3.1/T3.2），不再开放**。
- **Q5**：`instructions --json` 补 `schemaVersion` 的位置（命令层包装 vs 核心返回）与既有断言修订面（方案期定稿；倾向命令层包装）。
- **Q6**：JSON 模式 Commander 解析期错误（未知命令/选项/缺参）的捕获机制（`exitOverride` 限定 JSON 模式并放行 `exitCode 0` 的 help/version）；**契约口径已定（`INVALID_ARGUMENT` / refusal / exit 1）**，方案期仅定稿机制与回归面。

## 五、验收要点（阶段级）

1. **契约**：18 出口首键 / 键序 / 键集冻结测试全绿；`docs/json-contract.md` 与实测一致，含**退出码 0/1/2/3 语义表**、**12 行 `code → kind → exitCode` 映射表**、legacy 双形态判别与 `errorKind`、REQ-001 勘误留痕；`instructions --json` 补 `schemaVersion`（首键构造序 `{ schemaVersion: 1, ...doc }`）；条件键按恒在/条件出现登记。
2. **错误**：JSON 模式下 `flow advance` 非法转移 / 无路径 / blocking REV、`flow phases` 非法参数、`instructions` 未知 artifact、Commander 用法错误 → `kind:'refusal'` + 稳定 `code` + exit 1；模拟内部异常 → `kind:'internal'` + **exit 3**；并发冲突 → **`kind:'refusal'` + exit 2**；zh/en `code` 一致；**12 行映射表逐行断言**；legacy 失败载荷全部含 `errorKind` 且 `error` 仍为 string、既有键序不变（`archive-write-failed` → internal/3）；非 JSON 模式人类文案逐字不变、0/1/2 语义不变。
3. **项目**：`--project` 前置/后置、`--project=path`、无效路径、无 `--project` 回退、`knowledge dedup --project` 六场景通过；**语言按目标项目解析**；**`--log-file` 相对路径按原始 cwd 解析**；**`--title --json` / `--encoding --project` 误判对通过**；单进程单命令前提登记。
4. **版本**：`--version --json` / `-v --json` 精确形态；纯文本不变。
5. **零回归**：人类输出补丁前/后快照 diff 空；既有 18 出口字段零删除 / 零重排 / 类型零改；legacy `error` 字符串载荷零改动（仅末尾 `errorKind`）；存量 `flow.json` 零注入。
6. **门禁**：测试 / tsc / i18n / kb / build 全绿；新增测试文件与用例登记。
7. **扩展同步核对**：C1~C6 逐项给出「已同步 / 无需变更（依据）」结论；`docs/json-contract.md` 已落盘；其余载体在版本计划 §六 C 登记并由 stage-98 同版本收口；**无既有消费者静默失效**。

## 六、风险

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| R-95-1 | **契约冻结误伤**（键序/类型/新增 null 键） | 高 | 只增不改 + 18 出口逐项冻结表 + DSH 验收（stage-98）+ 契约测试 |
| R-95-2 | **错误双形态与 legacy 键集断言**（string vs object；`errorKind` 追加） | 高 | 契约文档 `typeof doc.error` 判别 + 映射表 12 行 + `errorKind` 仅末尾追加 + 两类测试 + 冻结表登记 |
| R-95-3 | **chdir 副作用**（语言解析漂移 / 相对日志路径 / 相对参数 / 全局命令） | 中 | 单点注入 + 路径校验 + **语言按目标项目（文档化）** + **`--log-file` 在 chdir 前按原始 cwd 解析** + 子进程测试 + **单进程单命令前提登记** |
| R-95-4 | **预扫描误判**（argv 扫描把选项值当 `--json` / `--project`） | 中 | 仅识别 `--json` / `--project` / `--project=` token；跳过已知取值选项下一 token；`--title --json` 与 `--encoding --project` 成对测试；文档登记「裸 `--xxx` 取值」边界 |
| R-95-5 | **`instructions` 补键破坏旧断言** | 低 | 增量首键 + 同批修订断言 + 变更登记（C1 同步清单） |
| R-95-6 | **i18n 漏键 / 死键** | 中 | zh/en 成对 + 消费点接入 + lint 逐键列名 |
| R-95-7 | **人类输出被顺手改动** | 中 | 快照 diff 空取证 + 审查聚焦 diff 面 |
| R-95-8 | **退出码扩展的调用方假设**（内部错误归入新增 3） | 中 | 0/1/2 语义零改动 + exit 3 仅新增 + 契约文档/CHANGELOG 留痕 + 0/1/2/3 四值测试矩阵 + DSH 验收（stage-98） |
| R-95-9 | **legacy 载荷追加 `errorKind` 触发严格键集断言** | 中 | 仅末尾追加 + 冻结表/契约文档双形态登记 + 既有键序快照断言 + DSH 端到端（stage-98） |
| R-95-10 | **既有适配/文档未同步导致静默失效** | 高 | 扩展优先原则 + C1~C6 同步跟进清单 + §五.7 核对项 + stage-98 多载体收口 |

**回滚**：新增模块删除即回退；`runCli` 改动 revert；`--project` 单点 revert；`instructions` 补键 revert；无数据格式破坏。

## 七、承接 REV 与处置表（REV-85-002 固化口径）

- **判据源**：`.openfeel/flow.json`（`reviews: 0` 官方空账）+ `.openfeel/users/Liuary/code_review/REV-92.md` / `REV-94.md`（用户台账 pending）+ v1.2.1-stage-93 收官处置表 + 本会话实测。
- **上游 v1.2.1 收口**：官方 `reviews` 空账；stage-93 已处置三 BUG + E-89-6，其余转主会话 / 台账保留。

| 上游条目 | 优先级 | 去向 | 依据 |
|---------|:--:|------|------|
| REV-92-005（stage-92 门禁未独立复跑） | medium | **本阶段证据补强**（本阶段门禁独立复跑并登记） | 本阶段 T6 门禁全量 |
| REV-92-006（`findPhasePath` 报错语义） | low | **台账保留**（非本阶段面；`flow next` 不使用 BFS） | stage-93 已评估；本版不改 |
| REV-94-005 / 006（status.md 旧文案 / plan 未入管） | low | **转主会话 / stage-98 文档核对** | 流程态遗留；本阶段零动作 |
| REV-94-007（旧部署实例模板默认值） | low | **台账保留**（部署侧语义，本版不涉） | stage-94 已留痕 |
| REV-86-009 / 010（flow-manager 测试 / session 守卫） | low | **台账保留**（非本阶段面） | 承 stage-92/93 口径 |
| 其余 REV-92 / REV-94 已闭合条目 | — | **零动作**（登记） | 台账实测 |

- **三分结论**：本阶段处置 1（REV-92-005 证据补强）／显式转出 2（REV-94-005/006 → stage-98）／台账保留 3（REV-92-006、REV-94-007、REV-86-009/010 合并计）→ **零灭失成立**。

## 八、op 拆分建议（供 openfeel-schemer 定稿；`est_ops = 4`）

| op | 内容 | 主要文件 | 依赖 |
|:--:|------|------|------|
| `op-001` | **T1 契约助手 + T5 18 出口审计**：json-output（含首键构造顺序约束）/ `docs/json-contract.md`（含退出码表、12 行映射表、legacy 双形态、REQ-001 勘误、扩展同步清单）/ `instructions` 首键 / 条件键评估与登记 / 契约测试 | `src/commands/shared/json-output.ts`、`src/commands/instructions.ts`、`src/commands/flow.ts`（仅条件键）、`docs/json-contract.md`、`test/cli/json-contract.test.ts`、`test/cli/index.test.ts` | — |
| `op-002` | **T2 错误层**：errors.ts（12 行映射内嵌 kind/exitCode）/ shared/errors.ts / runCli catch（JSON + 非 JSON 内部错误 exit 3）/ Commander 用法错误 / flow 失败迁移 / **legacy `errorKind`（flow archive + req）** / 错误测试 | `src/core/errors.ts`、`src/commands/shared/errors.ts`、`src/cli/index.ts`、`src/commands/flow.ts`、`src/commands/req.ts`、`test/cli/error-envelope.test.ts`、`test/commands/req.test.ts` | hard: op-001（契约助手 + 映射表） |
| `op-003` | **T3 全局 --project + T4 --version --json**：project-option / 根选项 / dedup 扩展路径（本地声明保留 + `optsWithGlobals`）/ `--log-file` 原始 cwd 解析 / 预扫描成对防误判 / 版本预扫描 + 测试 | `src/cli/project-option.ts`、`src/cli/index.ts`、`src/commands/knowledge.ts`、`test/cli/project-option.test.ts` | hard: op-001（JSON 模式） |
| `op-004` | **T6 i18n + 门禁 + 收尾**：双表文案 / 人类输出快照 / 全量门禁 / 契约测试补全 / **C1~C6 同步核对表** | i18n 双表、`test/**` | hard: op-001 / op-002 / op-003 |

- **文件冲突（mutual_exclusion）**：`src/cli/index.ts` 由 op-002 与 op-003 共同触碰 → 串行；`src/commands/flow.ts` 由 op-001（条件键）与 op-002（错误层）共同触碰 → 串行（op-001 先行）；op-004 为收尾（恒末位）。
- **扩展路径优先**：op-003 的 `knowledge dedup --project` 按 C2 优先保留本地声明；若方案期实测必须收敛，按 C2 同步清单同批更新文档/测试。
- **op 级依赖与文件清单由 openfeel-schemer 落 `ops/deps.yaml`**。

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-17 | openfeel-planner | 初稿：依据大计划 §二/§三/附录 A「stage-95」+ `docs/v1.2.2-requirements.md` + REQ-001 + 源码实测（5 表 20+ 项）；变更点 T1~T6；开放问题 Q1~Q5；风险 R-95-1~7；承接三分（处置 1 / 转出 2 / 保留 3）；op 拆分 4 项。**只写本计划文档**（未改源码 / 未直写 flow.json / 未推进 phase）。 |
| 2026-10-17 | openfeel-planner | **修订 1（计划审查闭环）**：新增「审查闭环记录」（REV-95-001~004 逐条处置）与「扩展优先原则」（v1.2.2 全局约束 + C1~C6 候选项）。按用户最终裁定落地：R-cp-1 退出码 0/1/2/3（并发冲突 `kind=refusal` + exit 2；内部错误 exit 3；REQ-001 L80 登记需求文本勘误）；R-cp-2 legacy 载荷追加顶层 `errorKind` + 12 行 `code→kind→exitCode` 映射表。REV-95-003 四项边界（语言按目标项目 / `--log-file` 原始 cwd / 预扫描成对防误判 / 单进程单命令）与 REV-95-004（构造顺序约束 / Q3 豁免判据）全部写实。同步更新 T1/T2/T3/T5/T6、Q1~Q6、验收 1~7、风险 R-95-1~10、op 拆分与文件冲突声明。**只写计划文档**。 |
