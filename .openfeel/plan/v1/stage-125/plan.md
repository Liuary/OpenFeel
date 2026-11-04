# v1.5.10-stage-125 计划 — `openfeel dashboard`（单文件自包含 HTML 看板 + `--json`）

> **修订 r4**（2026-11-02，r3 PASS 后收尾）：6 处外科式修正 —— T24 改为「动态枚举**当前已存在**的 `src/core/dashboard/*.ts`」（否则 op-001 因 `render.ts` 未建而必红）；F3 由 `healthCheck(...)` 改为注入的 **`healthReport.items` / `healthReport.ok`**（`healthCheck` 已留在命令层、`FlowManager.projectPath` 为 `private` 无访问器 → core 内不可达）；H1 口径对齐 T13（无本地 `src=`/`href=`）；§0.4.1 扫描 ① 换为 `toCommandTree(rootProgram)`（原「同行共现」设计在本仓零命中且有 32 行噪音）；更正 `json-contract.test.ts` 实际覆盖到 **#41**（`:1065`）而非 #40；新增**测试语言确定性约束**（纯 render 用例显式 `{lang:'zh-CN'}`；CLI 层用例断言 HTML 文案前须先设定项目语言）。
>
> **修订 r3**（2026-11-02，第二次审查后）：补 **P0 —— 新发现的根命令精确枚举 `test/core/lint-req.test.ts:63-69`**（`toEqual([...19 名...])`，既无 `length` 也无 `dashboard` 字样，故 r2 的「已逐个核实」不成立），并把该风险从「人工枚举」升级为**机械化穷举规则 §0.4.1**（验收判据 = 全量 `npm test` 绿，不是清单勾完）；修 P1 —— **26 个 `dashboard.html.*` 键与 `render.ts`/T16 的 op 错配**（缺键时 `t()` 返回 key 本身 → op-002 假绿、op-003 转红），键**前移至 op-002** + 空态节点加 `data-i18n` 属性让断言与文案解耦；8 项 P2 —— SKILL.md 漏 `:58`（共 5 处）、层间门禁改为**单测**（禁串覆盖 `commands/` 与 `cli/`）、`data` 注入消除二次读盘与耗时论据矛盾、T13 改断言无本地资源引用、T19 不断言 errno、json-contract 章节引用纠正（§18 不存在）、`VALUE_OPTIONS` 措辞、op-004 增「R2 有意滞后」标注动作。
>
> **修订 r2**（2026-11-02，审查 BLOCK 后重写）：修正 2 个 P0（`req.test.ts` 顶层命令计数硬断言漏项、CSP 与内联 JS 自相矛盾）+ 11 个 P1（i18n 覆盖与产物语言、health 口径分裂、`buildStatusJson` 引入层、文档计数位、SKILL.md 快照裁定、op 拆分可验证性、H1/H8/H9/H10 无对应用例）+ 10 项 P2 事实/口径修正。所有「已核实」行号均于修订时重新 `grep` 取。

- **阶段**：`v1.5.10-stage-125`（工作流模式 **full**；需求导向，阶段保持 `exec_running`）
- **关联需求**：REQ-018（形态已由用户确认：**单文件自包含 HTML，数据内嵌**；**不做** HTTP 服务、**不做** `fetch` 外部 JSON）
- **基线**：v1.5.9（`package.json:3` = `1.5.9`）——`--json` 注册选项 **43** / 成功出口 **42** / 错误码 **13** / i18n zh+en **各 1110 键** / 测试文件 **94** / 根命令 **19**
- **目标**：新增 `openfeel dashboard [--json] [--out <file>] [--open]`——进程内聚合「需求看板 / 阶段流水线 / 版本发布门与归档历史 / 阻塞 REV 与流程健康」四块数据，默认生成**单文件、零外链、零网络、零可执行脚本、双击即开**的 HTML 看板；`--json` 输出同一份数据的单文档（`schemaVersion` 首键）。
- **修订后仍待确认**：无（原「命名与 `dsh/lib/adapters/dashboard.js` 同名」一项已裁定保留，见 §0.6 备注）。

---

## 0. 事实核对结果（r3 全部重核）

### 0.1 需求侧 core 单点

| 符号 | 位置 | 签名/形状 | 用途 |
|---|---|---|---|
| `REQ_STATUSES` | `src/core/req/types.ts` | 7 值常量 | 分组**只准**沿此常量迭代 |
| `listRequirements` | `src/core/req/requirement-ops.ts` | `(data, filter)` → `RequirementData[]` | 需求行 |
| `listLinkedStages` | `src/core/req/aggregate.ts:62` | `(data, reqId)` → `LinkedStage[]` | 逐字复用 `req list --json` 元素第 1 个追加键 |
| `computeRequirementAggregate` | `src/core/req/aggregate.ts:73` | `(data, reqId)` → `{stageCount,doneCount,…}` | 派生 `progress:{done,total}` |
| `requirementHealthItems` | `src/core/req/aggregate.ts:171` | `({data, lang})` → `HealthCheckItem[]` | 健康项合并（**需要 `lang`**） |
| `releaseCheckRequirements` | `src/core/req/requirement-ops.ts:542` | `(data, version)` → `{version,done,unfinished,counts{done,unfinished,other,total}}` | 版本发布门，逐字取 `counts`/`unfinished` |
| `listStageBlockingOpenReviews` | **`src/core/flow-manager.ts:228`** | `(reviews, stage)` → `ReviewItem[]` | 阻塞 REV（**r1 误记为 `core/req/aggregate.ts`，已更正**；形参名 `stage`） |
| `HealthCheckItem` | `src/core/flow-manager.ts:443` | `{section, status:'pass'\|'warn'\|'fail', message}` | 健康项**原生形状**（dashboard 用此形状） |
| `archiveHealthItems` | `src/core/flow-archive/archive-health.ts`（`flow.ts:46` 引入） | `({projectPath, data})` → `HealthCheckItem[]` | 健康项合并 |
| `listArchiveVersions` / `readArchiveFile` | `src/core/flow-archive/archive-ops.ts`（`flow.ts:45`） | 字典序版本数组 / 归档文件（`counts` 或 `null`） | 归档历史，逐字复用 `flow archive list` 两单点 |

`req board --json`（`src/commands/req.ts:863-897`，JSON 在 885-887）的形状 = `{schemaVersion, groups}`，`groups` 键序 = `REQ_STATUSES` 声明序、7 组恒在；其分组实现是 **action 内联 3 行（881-884）**，不可复用 → 见 D-125-02 ④。

### 0.2 流水线侧事实

| 事实 | 位置 | 结论 |
|---|---|---|
| `buildStatusJson(mgr)` | `flow.ts:3024-3064` | **模块私有，未导出**（`flow.ts` 仅导出 `registerFlowCommand`(50)、`shouldPromptWorkflowMode`(2897)）。返回 `{schemaVersion, pipeline{phase,current{stage,op}}, stages[], counts{total,done,active}}`；`stages[]` 元素含 `opsSummary = {total, byState}`，`byState` **无零值键** → `opsDone = byState.done ?? 0` |
| `flow health --json` 的健康项**是合并后的** | `flow.ts:2489-2496`（构造 `archiveItems` / `reqItems`）+ `2515-2519`（`items = [...report.items, ...archiveItems.map({name,status,detail}), ...reqItems.map(…)]`） | 只取 `healthCheck()` 原生项会让**看板健康 ≠ 命令健康** → 必须同样合并（D-125-03 F3） |
| `flow health --json` 的 `{name,status,detail}` | `2516-2518` | 是 action 内联别名映射，**不可导出** → dashboard 用 `HealthCheckItem` 原生 `{section,status,message}`，键名差异写进契约 |
| `flow metrics --json` | `511-547`（JSON 在 521-524） | `{schemaVersion, agents}`，`agents` = `getSummaryData()`；键集恒定；`computeProcessHealth` 健康块**仅人类输出、不进 JSON**（537-545 注释）→ dashboard **不含** `processHealth` |
| `MetricsStore` | `src/core/metrics.ts` | `getInstance(dataDir?)`（71，**按 dataDir 缓存单例**）、`resetInstance()`（82，测试隔离）、`load()`（189）、`getSummaryData()`（170）。**必须显式传 `resolve(projectPath,'.openfeel')`**，否则默认 `CWD/.openfeel`（71 行注释）与 `--project` 语义脱钩 |
| `flow archive list --json` | `2378-2400`（JSON 在 2395） | `{schemaVersion, versions:[{version, counts:{stages,reviews,log,requirements?}\|null}]}`，`versions` = 引擎字典序；`counts` 损坏 → `null` |
| 读命令 preflight | `65`（`flow status` 会 `recordPreflight`） | 本命令**不记录**：零 `flow.json` 写、不属写门命令面；唯一写盘 = `--out` |
| 层间依赖禁令 | `src/commands/shared/preflight-gate.ts:11-12`：「本模块归**命令层**…不得下沉进 `src/core`（否则 core → commands 层次反转）」 | **`src/core/dashboard/**` 禁止 import 任何 `src/commands/**`**（D-125-02 的硬约束来源） |
| 错误码表 | `src/core/errors.ts:27-41`（13 码）+ `src/commands/shared/errors.ts:66` `failCli` | 本命令只复用 `NO_INIT`(1) / `INVALID_ARGUMENT`(1) / `INTERNAL_ERROR`(3)，**不新增码** |
| 写盘失败口径 | `flow.ts:2324-2329`（REV-79-013）、`flow.ts:2505-2508`（D-95-11） | 写盘失败 → **exit 3 / `internal`**；`ARCHIVE_WRITE_FAILED` 语义专于归档，**不复用** |

### 0.3 i18n 事实与**产物语言策略**

- 两文件同构：`export const <domain>: I18nDomain` + 末尾 `allDomains`（zh 1371 / en 1326 起）；条目 `{key, zh, en}`，zh 侧填 `zh`+`en:''`，en 侧填 `zh:''`+`en`。help 文案进 `help` 域（`help.req.board` 在 zh 1073），运行时文案进命令域（`req.board.groupTmpl` 在 `req` 域 zh 1327）。
- 键数 zh/en **各 1110**；`lint i18n` 只查「空值 / 中文独有键 / 英文独有键」，**无测试断言总键数**（`grep "1110|键数"` 仅命中 `templates-migration.test.ts` 的 skill 键数 22）→ 新增键只需成对非空。
- **HTML 文案语言 = `getCliLang(projectPath)`**（与 `--json` 无关；`--json` 输出语言中性字段，仅 `health.items[].message` 天然带语言，因其源自 `requirementHealthItems({lang})`）。**写死**：`render(data, {lang})` 全部标签经 `t()`，**禁止**在 `render.ts` 出现中文/英文字面量（门禁：`render.ts` 除注释外零 CJK）。理由：本仓「人类输出按 cli lang」是既成契约（`getCliLang` 全局单点），HTML 是另一种人类输出，不能例外。

### 0.4 硬断言（**三处**；r3 补上 `lint-req` 精确枚举）

| 门禁 | 位置 | 断言 | 影响 |
|---|---|---|---|
| 计数（注册选项 / 成功出口） | `test/commands/knowledge.test.ts:384`（用例名）、**`:397` `toHaveLength(43)`**、`:400` `errorOnly`=1、**`:401` `toBe(42)`** | 遍历全命令树 | 新增任何 `--json` 子命令 → **必红** → 改 44 / 43 + 用例名 |
| 顶层命令组数（数量式） | **`test/commands/req.test.ts:1146`（用例名「共 19 个」）、`:1158` `expect(rootProgram.commands.length).toBe(19)`** | 根命令 19 | 新增 root 命令 `dashboard` → **必红** → 改 20 + 用例名（同用例 1150-1157 的 `toContain` 白名单**无需**加 `dashboard`，但**建议**加一行 `expect(names).toContain('dashboard')` 使其成为正控） |
| 顶层命令集（**精确数组式**，r2 漏） | **`test/core/lint-req.test.ts:63-69`**：`const roots = TREE.map((n) => n.name).sort(); expect(roots).toEqual(['archive','chore','config',…19 名…])` | 排序后的**完整根命令集** | 新增 `dashboard` → **必红** → 数组插入 **`'dashboard'` 于 `'config'` 与 `'dev'` 之间**（字典序），并更新用例名（`63` 行「恰 19 项」→ 20 项） |
| 出口键序冻结 | `test/cli/json-contract.test.ts`（标题「33 出口冻结」；实际覆盖 **#1~#41** —— `#41 lint req` 用例在 **`:1065`**，`#40` 反而排在 `:1106`） | — | **落点更正（r4）**：`#41` 在 `json-contract.test.ts:1065`；`#42` 在 `test/commands/req.test.ts`；**本阶段 #43 的键序断言放 `test/commands/dashboard.test.ts`**，不改 json-contract.test.ts |
| SKILL.md 快照声明 | `test/core/templates.test.ts:521`（正控数组含 `'本文档为 v1.5.8 快照'`） | **正向 `toContain`** | 改快照行 → 必红 → **本阶段不动**（裁定见 D-125-03 R2） |
| skill 双注入一致 | `test/core/templates-migration.test.ts:50-56` | 逐字节 | 改 SKILL.md 后**必须 `npm run build`** |
| 已核实**不**受影响 | `test/core/update.test.ts:485`（`toContain('update')`）、`test/cli/help-arguments.test.ts:197`（`checked.length >= 20`，dashboard 无位置参数） | — | 不增不减 |

#### 0.4.1 机械化穷举规则（**取代「人工枚举 + 自称已核实」**）

r1/r2 两次都漏了「精确数组式」断言（`req.test.ts` 是数量式、`lint-req.test.ts:63-69` 是数组式，形状不同）→ **不再依赖计划里的清单完备性**，改为可机械执行的两条：

1. **验收判据 = 全量 `npm test` 全绿**，不是「§2 清单里的文件都改完了」。op-003 的执行顺序固定为：先注册命令 → 立刻跑全量 `npm test` → **把每一处红逐条修完**（红即证据，不靠预判）。
2. **穷举扫描（复制即用，在 op-003 开跑前执行一遍，结果贴进 op 结果）**：

```bash
# ① 命令树级枚举：凡把 rootProgram 转成树/清单再做集合断言的用例都属此类
grep -rn "toCommandTree(rootProgram)" test/            # → test/core/lint-req.test.ts:21（TREE 定义；数组断言在 63-69）
grep -rn "toEqual(\[" test/core/lint-req.test.ts       # 直接看该文件的集合式断言
grep -rn "rootProgram" test/ | grep -vE "spyOn|import|toCommandTree"
# ② 直接锁命令数/出口数的数字断言（保留；已知 5 条噪音，判定后忽略）
grep -rnE "toHaveLength\(4[0-9]\)|toBe\(4[0-9]\)|toBe\(19\)|toBe\(20\)" test/
#    噪音：test/core/config.test.ts:339,356（custom_pref）、test/core/file-lock.test.ts:88、
#          test/core/templates.test.ts:905,986 —— 均为无关数字，非命令/出口计数
```

> **r4 更正**：r3 的扫描 ① 要求「命令名清单」与 `toEqual([` / `.sort()` 出现在**同一行**，而真实数组断言跨 L64-68 三行 → **恰好在它要防的那类上零命中**，还会产出 32 行噪音。已换为上面的「树级枚举」判据（`toCommandTree(rootProgram)` 是命中 `lint-req.test.ts` 的唯一入口）。

已知命中（**必须修**，3 处）：`req.test.ts:1158`（数量式）、`lint-req.test.ts:63-69`（数组式）、`knowledge.test.ts:397/401`（出口计数）。已知**非**命中：`update.test.ts:485`、`help-arguments.test.ts:197`、`release-metadata.test.ts:44-51`（files 清单，与本命令无关）。


**已核实「无测试钉住」的文档**：`docs/*.md`、`dsh/ADAPTER.md`（`grep "ADAPTER.md|commands.md"` 仅命中 `release-metadata.test.ts` 的 files 清单校验）→ 可直接改数字。

### 0.5 SKILL.md 是「一处源 + 两处生成物」

权威源 `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`：命令速查表在 **21-42**（表头 21-22，行 23-42；新行追加在 42 之后）；`42 出口 / 43 注册` 口径出现在 **44、54、58、60、88（共 5 处；r2 漏 `:58`「读命令 `--json` 全量补全」段末「累计 **42 个成功出口 / 43 个注册选项**」）**；快照声明在 **15**。生成物 = `src/core/update.ts:441` 起与 `src/core/template-loader.ts:4455` 起的 `AUTO-GENERATED` 段，由 **`npm run build`**（`build.js`：注入 → `npx tsc`）从 `templates-data/` 重生成；`template-loader.ts:4-5` 明写禁止手改。

**基线异常（本阶段必须绕开，不得顺手修）**：`package.json` 已是 `1.5.9`，但 SKILL.md **缺 v1.5.9 节**、快照仍写 v1.5.8 → 文档债已存在于上一版本。

### 0.6 文档同步点（**17 处**，r3 校正 r2 的错误章节引用 + 补 `:58`）

| # | 文件 | 行 | 现状 → 目标 | 测试钉住？ |
|---|---|---|---|---|
| 1 | `docs/json-contract.md` | 3 | 「42 个成功出口」→ 43（追加 v1.5.10 说明行） | 无 |
| 2 | 同上 | 6-9 | 版本追加段落 → 新增 v1.5.10 段（#43） | 无 |
| 3 | 同上 | **101** | **§5 标题「42 出口冻结表」→「43 出口冻结表」**（r1 漏） | 无 |
| 4 | 同上 | 103 | 计数口径「42 个成功 JSON 出口（#1~#42）」→ 43 / #1~#43 | 无 |
| 5 | 同上 | 148 | §5 表末追加 `\| 43 \| dashboard \| … \|` 行 | 无 |
| 6 | 同上 | **152-171** | **§6「本版新增 / 有意变更登记（全枚举）」追加第 19 项**（现有末项为 L171 的「18. v1.5.8…」；**该文件无 §18，r2 的「§18」引用错误，已改正**）+ **§7 计数口径（L175/176/180）分项新增 `dashboard 1`、总数 42 → 43** | 无 |
| 7 | 同上 | 182 | 「注册的 `--json` 选项数为 43」→ 44 | 无 |
| 8 | 同上 | **183** | **「三处对齐：源码去重计数 43 / 本文件 42+43 / knowledge 用例 43/42」→ 44 / 43+44 / 44/43**（r1 漏）。**同句顺带修正事实**：原文称 `json-contract.test.ts` 覆盖「#1~#42」→ 改为 **「#1~#41」**（实际覆盖到 `:1065` 的 `#41`），句尾注「**#42 在 `req.test.ts`、#43 在 `dashboard.test.ts`**」 | 无 |
| 9 | 同上 | 184 | 「不计入 42 个成功出口、也不计入 43 个注册选项」→ 43 / 44 | 无 |
| 10 | `docs/commands.md` | 28 | 同句 42/43 → 43/44 | 无 |
| 11 | 同上 | **1157** | **「## JSON 出口一览（v1.5.8 快照…）」→ 改标题为 v1.5.10 快照并列入 #43**（r1 漏） | 无 |
| 12 | 同上 | 1159 | 「42 个成功出口 / 45 个注册选项」→ **43 / 46**（46 = 44 `--json` + `chore --end`/`--status`） | 无 |
| 13 | 同上 | 1177-1207 | 命令面概览表加 #43 行；1207 快照说明句同步 | 无 |
| 14 | `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md` | **21-42** | 命令速查表追加 `openfeel dashboard` 行（标 `（v1.5.10 起）`） | 无（表行不被断言） |
| 15 | 同上 | **15 / 44 / 54 / 58 / 60 / 88** | **不动**（裁定 R2：快照声明被 `templates.test.ts:521` 正面钉住；且文档缺 v1.5.9 节，单升 v1.5.10 会失真。计数口径行与快照声明**同批**留发布阶段；**r2 漏 `:58` 已补**） | **有**（521） |
| 16 | 同上（生成物） | `update.ts:441` / `template-loader.ts:4455` | **不手改**，`npm run build` 重生成 | **有**（T4.4） |
| 17 | `dsh/ADAPTER.md` | 16 | 「v1.5.8 起 42 个成功出口 / 43 个注册 `--json` 选项」→ 43 / 44（r1 漏；无测试钉住，live 契约文档，必须同步） | 无 |
| — | `README*.md` | — | `grep "req board\|req release-check"` 零命中 → **不动** | 无 |
| — | `CHANGELOG.md` / `docs/VERSIONS.md` | — | **本阶段不写**，归档阶段 archiver 统一登记 | 无 |

> **命名备注（r1 待确认项，r2 裁定）**：CLI 顶层命令 `dashboard` 与 DSH 内部模块 `dsh/lib/adapters/dashboard.js` **同名不同层**（后者是适配器内部快照/决策模块，非 CLI 命令），无运行时冲突；本阶段保留 `dashboard` 名称，仅在 `docs/commands.md` 新段落首句写一句消歧说明，不改名、不动 `dsh/`。

---

## 1. 决策点（执行者照此实现，不得改形）

### D-125-01 命令签名与默认输出路径

```text
openfeel dashboard                    → 生成 HTML 到默认路径 + 3 行人类摘要（exit 0）
openfeel dashboard --out <file>       → 写到指定路径（相对 cwd）；父目录不存在则递归创建
openfeel dashboard --open             → 写默认路径并打开（**无 --out 时即打开默认产物**）
openfeel dashboard --json             → stdout 单 JSON 文档，**不写任何文件、不拉起进程**
```

**互斥（显式拒绝、先于任何读盘/写盘/聚合）**：`--json` × `--out`、`--json` × `--open` → `INVALID_ARGUMENT`（exit 1，`detail:{conflict:'json-out'|'json-open'}`）。理由：`--json` 的契约是「stdout 恰好一个 JSON 文档」，若允许附带写盘/拉起浏览器，同一出口就出现「有副作用 / 无副作用」二元态，消费方与测试无法判定。

**默认 `--out` = `<projectRoot>/.openfeel/tmp/dashboard.html`**，理由（均核实）：

1. **`.gitignore:7`** 已整目录忽略 `.openfeel/tmp/`（注释「项目级临时目录（共享数据/构建产物）」）→ **零 `.gitignore` 改动、零仓库 churn**，且不与 `.openfeel/` 正式数据面（`plan/` `kb/` `requirements/`）混放。
2. 默认路径按**项目根**（顶层 `--project` 已 chdir，等价）→ 子目录内运行行为一致。
3. 人类输出**恒打印绝对路径**，发现性由输出保证。

**否决**：仓库根 `dashboard.html`（CWD 污染、必进 git）、`os.tmpdir()`（多项目同名互撞、重启难找）、`.openfeel/dashboard/index.html`（要改 `.gitignore`，且把临时产物放进正式工作区）。`--out` 本身**完全开放**（用户要分享就显式给路径），命令不限制目标位置。

**`--open` 实现**：`spawn(cmd,args,{detached:true,stdio:'ignore'}).unref()`；Windows `cmd /c start "" <absPath>`、macOS `open <absPath>`、Linux `xdg-open <absPath>`；**禁 `shell:true`**（路径含空格/引号注入面）。打开失败（`error` 事件/ENOENT/无 DISPLAY）→ **仅 warn，恒 exit 0**（无浏览器是常态，不是命令失败）。

### D-125-02 数据获取方式 —— 进程内，**命令层算 statusDoc、core 层只收数据**

**结论**：单进程内 `new FlowManager(projectPath)` → `isLoaded()` → `getData()`；四块数据全部经既有 core 单点取。**层间硬约束（P1-5 修）**：

```
src/commands/dashboard.ts（命令层）
  ├─ mgr = new FlowManager(projectPath) → isLoaded() → data = getData()
  ├─ statusDoc = buildStatusJson(mgr)     ← 从 src/commands/flow.ts 导入（命令层 → 命令层，合法）
  ├─ healthReport = mgr.healthCheck(false) ← FlowManager 方法，留在命令层
  └─ collectDashboardData(projectPath, { data, statusDoc, healthReport, lang })
src/core/dashboard/aggregate.ts（core 层）
  └─ 只 import src/core/**（req / flow-archive / metrics / i18n / flow-manager 的**类型**）
     ❌ 禁止 import src/commands/** 或 src/cli/**（依据 preflight-gate.ts:11-12 层次禁令；由 T24 单测机械守住）
```

- **为什么把 `data` / `healthReport` 注入而不是让 aggregate 自己建 manager（P2-3 修）**：`FlowManager` **没有公开 `projectPath` 访问器**（已核实：`src/core/flow-manager.ts` 里 `projectPath` 只作为函数形参出现），aggregate 若要在内部新建 manager 或调 `healthCheck`，就必须自建第二个 `FlowManager` → **二次读 flow.json**，与 §5「一次读盘」的耗时论据矛盾。**写死**：命令层构造**唯一**一个 `FlowManager`，把 `data`（`FlowData`）、`statusDoc`、`healthReport`（`HealthCheckResult` 原生形状）显式注入 core；core 内**不再 `new FlowManager`**。
- `buildStatusJson` 在 `flow.ts` 加 **`export`**（一个词，零行为变更），仅供命令层 `dashboard.ts` 复用；`flow.ts` 内加注释「形状冻结：改动须过 `json-contract.test.ts` #1 断言；若出现第三个消费者再下沉 core」。
- **否决子进程**：① 5 次 `execFileSync` = 5 次 Commander 引导 + 5 次 flow.json 读盘（看板是「一键快照」，不该秒级启动）；② Windows 编码/管道风险（本仓 `--encoding` + `iconv-lite` 正为此存在）；③ 把类型安全降级为字符串回环；④ 沙箱环境（如 DSH 的 stdio/管道限制）直接失败。
- **否决「core 直接 import flow.ts」**：层次反转（`preflight-gate.ts:11-12`），且会让 core 单元测试被迫加载 Commander 树。
- **`req board` 分组不抽公共函数**：其实现是 action 内联 3 行（`req.ts:881-884`），抽出需改 `req.ts` 公共面；dashboard 侧**沿 `REQ_STATUSES` 迭代内联重写**，并由 T3 钉死 `groups` 键序 === `REQ_STATUSES`（与 `json-contract.test.ts:475-477` 同款）。这是**唯一**有意重复，值域单点仍是常量。
- **`MetricsStore` 显式 dataDir**：`MetricsStore.getInstance(resolve(projectPath,'.openfeel'))` + `load()`（缺省按 CWD，会在 `--project` 场景读错项目）；测试 `beforeEach` 调 `resetInstance()`（`metrics.ts:82`）。
- **preflight 不记录**（同 §0.2）。**聚合函数 IO 边界**：唯一 IO = `MetricsStore.load()` 读 `.openfeel/metrics.json` + `listArchiveVersions`/`readArchiveFile` 读 `.openfeel/flow-archive/*.json`（均只读、无副作用）；**不读 `flow.json`**（由命令层注入 `data`），零 `console`、零写盘、零 `process.exit`、零 `process.cwd()`（路径全靠入参），与 `project.ts:5-6` 的「先聚合后渲染」范式一致。

### D-125-03 `--json` 契约（含三处 r1 缺陷修正）

**登记结论：登记为出口 #43 / 注册选项 44**（理由：不登记会产生「有出口不入表」的契约黑洞，成本高于 17 处文档 + 2 处测试的同步）。同步清单见 §0.6 + §0.4。

**键集键序（冻结，`schemaVersion` 恒运行时首键）**：

```jsonc
{
  "schemaVersion": 1,
  "generatedAt": "<ISO8601>",        // ⚠ 非确定字段（成功出口中首个），占第 2 键；测试不得断言其值
  "generator": "openfeel/1.5.9",
  "project": { "root": "<abs>", "name": "<package.json name|null>", "version": "<version|null>" },
  "requirements": {
    "groups": { "draft": [], "scheduled": [], "in_progress": [], "done": [], "blocked": [], "cancelled": [], "rejected": [] },
    "counts":  { "draft": 0, "scheduled": 0, "in_progress": 0, "done": 0, "blocked": 0, "cancelled": 0, "rejected": 0 },
    "total": 0
  },                                  // groups/counts 键序恒 = REQ_STATUSES；元素 = RequirementData + linkedStages + progress（逐字沿用 req list --json）
  "stages": {
    "pipeline": { "phase": "<meta phase|null>", "current": { "stage": "<id|null>", "op": "<id|null>" } },
    "items": [ { "id": "…", "phase": "…", "status": "…", "opsTotal": 3, "opsDone": 1, "workflowMode": "full", "requirementId": "REQ-018" } ],
    "counts": { "total": 0, "done": 0, "active": 0 }
  },
  "releases": {
    "gates": [ { "version": "v1.5.10", "counts": { "done": 3, "unfinished": 2, "other": 0, "total": 5 },
                 "unfinished": ["REQ-019","REQ-020"] } ],
    "archived": [ { "version": "v1.5.8", "counts": { "stages": 9, "reviews": 12, "log": 40 } } ]
  },
  "blockingReviews": [ { "stage": "<id>", "op": "<opId>", "id": "REV-…", "title": "…", "priority": "high" } ],
  "health": { "ok": true, "items": [ { "section": "…", "status": "pass|warn|fail", "message": "…" } ] },
  "metrics": { "agents": [] }
}
```

**F1（P1-3 修）语言策略**：数据字段语言中性；`health.items[].message` 随 `getCliLang(projectPath)`（源自 `requirementHealthItems({lang})`）→ **契约标注「`health.items[].message` 与 HTML 文案是唯一语言相关面」**。

**F2（P2 修）`releases.gates` 只含「未归档版本」**：版本集合 = 需求 `target_version` 去重并集 **减去** `listArchiveVersions()` 集合（按去前导 `v` 归一化比较）。理由：否则已归档版本会同时在 `gates`（全 0 行）与 `archived[]` 出现，看板出现重复空行。T5 断言「已归档版本只出现在 `archived[]`、`gates` 中不存在该 `version`」。

**F3（P1-4 修）health 与 `flow health --json` 内容对齐、键名不同**：`items = [...healthReport.items, ...archiveHealthItems({projectPath,data}), ...requirementHealthItems({data,lang})]`（顺序同 `flow.ts:2515-2519`），元素统一为 `HealthCheckItem` 的 `{section,status,message}`；`ok = healthReport.ok`（合并项恒 warn-only，不影响 ok —— 与 `flow.ts:2511` 注释一致）。**`healthReport` 是命令层 `mgr.healthCheck(false)` 的返回值，经 `collectDashboardData` 入参注入**——**不要**在 aggregate 里调 `healthCheck`（core 内不可达：`healthCheck` 是 `FlowManager` 实例方法，而 `FlowManager.projectPath` 为 `private`、无公开访问器，aggregate 无法重建 manager）。**契约显式标注**：与 `flow health --json` 的差异仅键名（`name/detail` ↔ `section/message`），因为该别名映射是 `flow.ts:2516-2518` 的 action 内联代码、不可导出。

**F4（P2 修）`health.ok === false` 时 dashboard 仍 exit 0**：dashboard 是**快照命令**，不是门禁命令（`flow health` 的 exit 1 语义属于它自身）；在 §5 与契约注释中写明，避免消费方误判。

**F5** `metrics` = `getSummaryData()` 逐字（`{agents}`），**不含** `processHealth`（v1.5.6 口径：健康块仅人类输出）。

**F6 空数据合法**：零需求/零阶段/零归档 → `groups` 恒 7 空组、`items: []`、`gates: []`、`archived: []`、`blockingReviews: []`、`health.items` 仍出真实检查项、exit 0。

**F7 失败形态**：统一 `failCli` **envelope**（`{schemaVersion, error:{code,kind,message,detail}}`），不沿用 `req.ts` 的 legacy `{error:'no-init',errorKind}`（`docs/json-contract.md` §8 迁移边界：新命令面走 envelope）。

**R2（P1-7 裁定）SKILL.md 的计数与快照行本阶段不动**：`SKILL.md:15` 的快照声明被 `test/core/templates.test.ts:521` 正向 `toContain('本文档为 v1.5.8 快照')` 钉住；升它须连动该测试的正控/负控数组（6+ 行），且文档当前**缺 v1.5.9 节**（§0.5 基线异常）——单升 v1.5.10 会让「快照版本」失真。故：本阶段 SKILL.md **只加命令速查表一行**（§0.6 #14），**5 处**计数（44/54/58/60/88）与 15 快照同批留给**发布阶段（archiver，与 VERSIONS/CHANGELOG 同批）**，并在 §6 登记。authoritative 计数以 `docs/json-contract.md` 为准（它无快照语义、明文按版本追加）。**op-004 必须在 op 结果与提交说明里显式写「SKILL.md 计数有意滞后（R2），发布阶段合并升 v1.5.9+v1.5.10」**，防止下游审查把它当漏改。

### D-125-04 HTML 产物硬约束（**r2 改为「零可执行脚本」**，解 P0-2 自相矛盾）

**P0-2 裁定：选 (b) —— 砍掉一切增强脚本，CSP 保持 strict。** 理由：看板是**快照**，折叠/复制这类增强不值得为它在 `script-src` 上开口子；且服务端渲染后「无 JS 也能完整阅读」本身就是更强、更可断言的保证（若选 (a)，`script-src 'unsafe-inline'` 会让「内联脚本与 CSP 自洽」变成需要长期维护的软约束）。

| # | 约束 | 实现 / 断言 |
|---|---|---|
| H1 | **单文件自包含**：产物**不含**指向本地/相对资源的 `src=` / `href=`（≡ 无同目录依赖、无需伴随文件） | T13 断言产物无 `src=` / `href=`（唯一「外链」面被完全关闭，故单文件性质由「零资源引用」保证，而非靠「目录里只有一个文件」这种测试自证） |
| H2 | **零外链**：无 `<link>`、无 `<script src=>`、无远程 `<img>`；系统字体栈 | 模板段（空数据产物）断言不含 `http://`/`https://`/`//cdn`/`<script src=`/`<link ` |
| H3 | **零网络 + strict CSP**：`<meta http-equiv="Content-Security-Policy" content="default-src 'none'; script-src 'none'; style-src 'unsafe-inline'; img-src data:">`；**无 `fetch`/`XHR`/WebSocket** | 断言含 `script-src 'none'`；不含 `fetch(`、`XMLHttpRequest` |
| H4 | **零可执行脚本**：产物**不含**任何可执行 `<script>`；核心视图 100% 服务端渲染 | `<script` 出现次数 **恰 1**，且该标签带 `type="application/json"`（T14）；人工「禁用 JS」演练 |
| H5 | **数据以惰性 JSON 注入**：`<script id="openfeel-data" type="application/json">` + `JSON.stringify` 后把 `< > & U+2028 U+2029` 转义为 `\uXXXX`（JSON 合法转义） | `</script>` 出现次数 **恰 1**；注入含 `</script>` 的标题后仍为 1（T14）。**CSP 事实说明**：`type="application/json"` 是惰性数据块、不执行、不受 `script-src` 约束；即便被极端 UA 丢弃，页面仍完整可读——这正是 H4 的兜底价值 |
| H6 | **文本转义**：动态文本全量 `escapeHtml`（`& < > " '`）；属性值只允许字面量 | 标题塞 `<img src=x onerror=alert(1)>` → 产物含 `&lt;img`（T15） |
| H7 | **`<meta charset="utf-8">` 必须是 `<head>` 的第一个子元素** | file:// 无 HTTP 头，缺 charset 必 CJK 乱码；T18 断言 `/<head>\s*<meta charset="utf-8">/` |
| H8 | **空数据可渲染**：零需求/零阶段/零归档 → 各区块出空态文案（i18n `dashboard.html.empty`），页面无 `undefined`/`NaN`/空 `<table>` | T16 |
| H9 | **确定性**：唯一时间字段 = 页脚 `generatedAt`；其余渲染与运行时刻无关 | T17：同数据生成两次，剔除 `generatedAt` 值后逐字相等 |
| H10 | **可重复生成**：不写随机 id/hash（见 H9） | T17 |

**布局**（信息架构，供执行者对齐）：① KPI 条（需求总数 / 已完成 / 活跃阶段 / 阻塞 REV / 归档版本）→ ② 需求看板 7 列（列内 P0>P1>P2，显示版本 + 认领人）→ ③ 阶段表（phase + `opsDone/opsTotal` 进度条 + 模式 + 关联需求）→ ④ 版本发布门表 + 归档历史表 → ⑤ 阻塞 REV → ⑥ 流程健康项 → ⑦ 指标表 → ⑧ 页脚（生成时间 / `generator` / 项目根）。

### D-125-05 退出码与失败语义（0 / 1 / 3，**无 2**）

| 场景 | 判定（**顺序即实现顺序**） | 人类输出 | `--json` | exit |
|---|---|---|---|---|
| 参数互斥 / 空值 / 指向目录 | ① 纯参数校验（**先于任何读盘、聚合、写盘**） | 对应 i18n 文案 | `INVALID_ARGUMENT` envelope | **1** |
| `flow.json` 不存在 | ② `mgr.isLoaded() === false` | `t('common.errorNoInit')` | `NO_INIT` envelope | **1** |
| 成功（含空数据、含 `health.ok=false`） | ③ 完成渲染 / 写盘 | 3 行摘要 | 单文档 | **0** |
| `--out` 父目录不存在 | ③ 内 `mkdirSync(parent,{recursive:true})` 后继续（默认路径同策略，避免「默认能跑、自定义就报错」） | — | 不可达（`--json` 与 `--out` 互斥） | 0 |
| 目录创建失败（父路径是已存在文件 → `ENOTDIR`）/ 写盘失败（EACCES / ENOSPC） | ③ 捕获异常 | `failInternal` → `common.errorTmpl` | `INTERNAL_ERROR` envelope | **3** |
| `--open` 拉起失败 | ③ 之后 | 仅 warn（`dashboard.openFailedTmpl`），不改退出码 | 不可达（互斥） | **0** |

**P2 修①**：`--out` 判定必须 `existsSync(p) && statSync(p).isDirectory()`——直接 `statSync` 在路径不存在时抛 `ENOENT`，会被误归为「写盘失败 exit 3」。
**P2 修②**：写盘失败归 exit 3 沿用 `flow.ts:2324-2329`（REV-79-013）与 `2505-2508`（D-95-11）口径；**不复用** `ARCHIVE_WRITE_FAILED`、**不新增**错误码（13 行表不动）。**不用 2**：本命令零 `flow.json` 写、不加锁，无并发冲突面。

### D-125-06 测试策略（**25 项**，每项标注所属 op，解 P1-8）

**语言确定性约束（r4 新增，防 CI 抖动）**：HTML 文案语言走 `getCliLang(projectPath)`（读项目 `config.yaml` / 环境），而断言里比对 `t(key, lang)` 时的 `lang` 必须**与渲染时同源**——
- **纯 render 用例**（T13~T18 直接调 `renderDashboardHtml`）：**显式传 `{lang:'zh-CN'}`，断言里用同一个 `'zh-CN'`**；禁止依赖进程默认语言，也禁止 `t(key)` 省略 lang。
- **CLI 层用例**（T11 / T12 / T21，走 command action）：若断言 HTML 文案或错误文案，**必须先显式设定项目语言**（`config set-lang zh-CN` 或构造项目 config），再以同一 lang 求期望值；否则开发机 locale / `LANG` 差异会导致同一断言在不同环境通过/失败。
- 不断言文案、只断言结构的用例（如 T10/T14/T19）不受此约束。

`test/commands/dashboard.test.ts`（新建，1 文件；范式照抄 `test/commands/req.test.ts:24-35,83-84`：`mkdtempSync` → `initProject` → 挂到全新 `new Command()` → spy `console.log` → `afterEach` 清理；`beforeEach` 调 `MetricsStore.resetInstance()`）。

| # | 用例 | 断言要点 | op |
|---|---|---|---|
| T1 | `--json` 顶层键序 | `Object.keys(d)` 全等 `['schemaVersion','generatedAt','generator','project','requirements','stages','releases','blockingReviews','health','metrics']`；`d.schemaVersion===1` | **op-003** |
| T2 | `--json` 单文档 | stdout `trim()` 可 `JSON.parse`，前后零杂行（JSON 模式人类摘要零输出） | **op-003** |
| T3 | `requirements.groups` 键序 | `Object.keys(d.requirements.groups)` 全等 `[...REQ_STATUSES]`；元素含 `linkedStages`/`progress` | op-001 |
| T4 | `stages.items` 派生 | 2 阶段（`ops:{op1:done,op2:running}`）→ `opsTotal:2 / opsDone:1` | op-001 |
| T5 | `releases` | 需求 vA(done)/vB(scheduled) → `gates` 两行且 `unfinished` 正确；**已归档版本只出现在 `archived[]`**（F2） | op-001 |
| T6 | `blockingReviews` 跨阶段 | 两非 done 阶段各 1 open blocking REV → 长 2 且各带 `stage`；done 阶段的 blocking REV 不计入 | op-001 |
| T7 | `health` 合并口径（F3） | 造归档孤儿 / 需求悬空关联 → `items` 含**注入的 `healthReport` 项** + `archiveHealthItems` 项 + `requirementHealthItems` 项（三来源各至少 1 项、顺序为「注入项在前、两个合并来源在后」）；`ok` 取自 `healthReport.ok` 且不受 warn 影响 | op-001 |
| T8 | 空数据聚合形状（F6） | `init` 后不加数据 → 7 空组、`items/gates/archived/blockingReviews` 均 `[]` | op-001 |
| T9 | 未初始化 | `--json`：`error.code==='NO_INIT'`、`kind==='refusal'`、exit 1；人类：stderr 含 `common.errorNoInit` | op-003 |
| T10 | 互斥/参数矩阵 | `--json --out x` / `--json --open` / `--out ''` / `--out <已存在目录>` → 四例 `INVALID_ARGUMENT` + exit 1，**且零文件被创建** | op-003 |
| T11 | 写盘成功（父目录不存在） | `--out <tmp>/sub/b.html` → 文件存在、含 `<!doctype html`、含 `<meta charset="utf-8"` | op-003 |
| T12 | 默认路径 | 无 `--out` → `<tmp>/.openfeel/tmp/dashboard.html` 存在 | op-003 |
| T13 | H1/H2 单文件 + 零外链（**P2 修**） | 用**空数据项目**产物（或先剥离 `openfeel-data` 数据块）断言：产物中**不存在指向本地资源的引用**（无 `src=` / 无 `href=`，即无 `<script src=>` / `<link>` / `<img src=…>` 本地资源），且不含 `http://`/`https://`/`//cdn`/`fetch(`/`XMLHttpRequest`，含 `script-src 'none'`。（**r2 的「输出目录仅 1 文件」是测试自己写的、恒真，已删**） | op-002 |
| T14 | H4/H5 | `<script` 出现次数 **恰 1** 且带 `type="application/json"`；`</script>` **恰 1**；标题注入 `</script><script>alert(1)</script>` 后仍为 1 且含 `\u003c/script` | op-002 |
| T15 | H6 转义 | 标题 `<img src=x onerror=alert(1)>` → 含 `&lt;img`，不含 `<img src=x` | op-002 |
| T16 | H8 空数据 HTML（**P1-3 修：与文案解耦**） | 空数据产物：① 空态节点带 `data-i18n="dashboard.html.empty"` 属性（断言属性存在，**不断言译文**）；② 断言产物**含 `t('dashboard.html.empty', lang)` 的实际返回值**（对 **op-002 已前移的 26 键**生效）；③ 不含 `undefined`/`NaN`。**禁止**断言产物里出现 `dashboard.html.empty` 这个 key 字符串本身（缺键时 `t()` 返回 key（`i18n.ts:120/133`）→ 会让 op-002 假绿、op-003 转红） | op-002 |
| T17 | H9/H10 确定性 | 同数据（同一 lang）两次渲染，剔除 `generatedAt` 后**逐字相等** | op-002 |
| T18 | H7 charset 首位 | `/<head>\s*<meta charset="utf-8">/` 命中 | op-002 |
| T19 | 写盘失败 → exit 3（**P2 定稿**） | `--out` 的**父路径是已存在文件** → `mkdirSync(recursive)` 抛错 → envelope `code='INTERNAL_ERROR'` + exit 3。**只锁 code/kind/exitCode，不断言 errno**（Windows 可能 `ENOTDIR`/`ENOENT`/`EPERM`，跨平台不稳）；errno 仅允许出现在 `detail` 里 | op-003 |
| T20 | `--open` 失败容错 | `vi.spyOn(child_process,'spawn')` 抛错 / emit `error` → exit 0 + warn 文案 | op-003 |
| T21 | `--open` 不带 `--out`（**P2 补**） | 断言 `spawn` 收到的是默认产物绝对路径，且该文件已生成 | op-003 |
| T22 | 计数用例更新 | `knowledge.test.ts`：44 / 43（+ 用例名） | op-003 |
| T23 | 顶层命令数更新 | `req.test.ts:1158` 19 → 20（+ `:1146` 用例名；建议加 `expect(names).toContain('dashboard')`） | op-003 |
| T24 | **层间依赖禁串单测**（P2-2 修：把 `grep` 门落成测试） | 用 `readdirSync('src/core/dashboard')` **动态枚举当前已存在的 `.ts` 文件**（**不硬编码文件名**：op-001 时仅 `aggregate.ts`；op-002 新增 `render.ts` 后自动纳入，无需改测试），对每个文件用正则抽全部 `from '<spec>'` 说明符，断言**无一**匹配 `/(^\|\/)commands\//` 或 `/(^\|\/)cli\//`（含 `../src/commands`、`../../commands`、`@/cli` 等变体）；范式照抄 `test/commands/req.test.ts:1161-1171` 的「禁止串零命中」写法。**CJK 检查同样只扫描「当前已存在」的文件**（`render.ts` 到 op-002 才存在 → op-001 不会因它不存在而红；op-002 起该文件自动被覆盖） | op-001 |
| T25 | **`lint-req` 根命令集更新**（P0 修） | `test/core/lint-req.test.ts:63-69`：数组插入 `'dashboard'`（`'config'` 与 `'dev'` 之间）+ 用例名「恰 19 项」→「恰 20 项」 | op-003 |

**人工验证（非自动化，写进 op-005 证据）**：① `openfeel dashboard --out …/board.html` 双击打开 → 全区块渲染；② DevTools→Network **零请求**、Console 零 error；③ 断网/Offline 重开仍可用；④ 设置禁用 JavaScript → 全部区块可读（H4）；⑤ 空项目生成 → 空态文案、无 `undefined`/`NaN`；⑥ 中文 + emoji 标题 → 无乱码（H7）。

---

## 2. 文件改动清单

**新建（4）**

| 文件 | 职责 |
|---|---|
| `src/core/dashboard/aggregate.ts` | `collectDashboardData(projectPath, {data, statusDoc, healthReport, lang}): DashboardData`——纯聚合（**命令层注入唯一一份 `data`/`healthReport`，core 不建 FlowManager、二次读盘为零**）；**只 import `src/core/**`**；`MetricsStore.getInstance(resolve(projectPath,'.openfeel'))` |
| `src/core/dashboard/render.ts` | `renderDashboardHtml(data, {lang}): string`——服务端渲染；`escapeHtml` / `escapeJsonForScript` 私有；**零 CJK 字面量**（全走 `t()`）；区块/表头/空态节点带 `data-i18n` 属性（供 T16 与文案解耦） |
| `src/commands/dashboard.ts` | `registerDashboardCommand(program)`：参数解析 → 互斥校验 → 建**唯一** `FlowManager` → `buildStatusJson(mgr)` / `mgr.healthCheck(false)` → 聚合 → 渲染/写盘/`--open` → 退出码 |
| `test/commands/dashboard.test.ts` | T1~T25（T24 层间禁串、T25 见 `test/core/lint-req.test.ts`） |

**修改（9）**

| 文件 | 位置 | 改动 |
|---|---|---|
| `src/commands/flow.ts` | 3024 | `function buildStatusJson` → `export function buildStatusJson`（+ 形状冻结注释） |
| `src/cli/index.ts` | 108 / 128 后 | import + `registerDashboardCommand(program)` |
| `src/commands/shared/json-output.ts` | 56-97 `VALUE_OPTIONS` | 加 `'--out'`。**理由（P2-7 改措辞）**：该集合是 argv 单点扫描的「取值选项」**唯一名单**，漏登记会让扫描器把 `--out` 的**取值 token** 当开关再解释一遍（`--out x` 的 `x` 若形如选项会被二次消费）；Commander 侧本就报 missing-argument，与本条无关。结论不变：必须登记 |
| `src/core/i18n-data/zh-CN.ts` | `help` 域（725+）+ 新增 `dashboard` 域 | **38 键，分两批交付**（见下）：**26 个 `dashboard.html.*` 归 op-002**（与 `render.ts` 同批，否则 op-002 的 T16 会因缺键假绿）；**4 `help` + 8 命令文案归 op-003** |
| `src/core/i18n-data/en.ts` | `help` 域（697+）+ 对应位置 | 同 38 键（en 文案），同样两批 |
| `test/commands/knowledge.test.ts` | 384 / 397 / 401 | 44 / 43 + 用例名 |
| **`test/commands/req.test.ts`** | **1146 / 1158** | **20** + 用例名（**r2 漏项**） |
| **`test/core/lint-req.test.ts`** | **63-69** | 精确数组插入 `'dashboard'`（`'config'` 与 `'dev'` 之间）+ 用例名 19 → 20（**r3 新增 P0**） |
| `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md` + `npm run build` 产物 | 21-42 | 只加 1 行；**15/44/54/58/60/88 不动**（R2）；随后 `npm run build` |
| `dsh/ADAPTER.md` | 16 | 42/43 → 43/44 |

**i18n 38 键（zh/en 成对非空；**26 键随 op-002、12 键随 op-003**）**

- **op-002 交付 26 键**：`dashboard.html.*`（落 `dashboard` 域，键值前缀 `dashboard.html.`，与 `req.board.groupTmpl` 同范式）：
  `title`；`kpi.total`、`kpi.done`、`kpi.activeStages`、`kpi.blockingReviews`、`kpi.archived`；
  `section.requirements`、`section.stages`、`section.releases`、`section.archived`、`section.blockingReviews`、`section.health`、`section.metrics`；
  `th.requirement`、`th.status`、`th.priority`、`th.version`、`th.owner`、`th.phase`、`th.ops`、`th.count`；
  `empty`；`footer.generatedAt`、`footer.generator`、`footer.projectRoot`、`footer.note`
  → **与 `render.ts` 必须同一 op 落地**；缺键时 `t()` 返回 key 本身（`i18n.ts:120/133`），会让 T16 先假绿后转红。
- **op-003 交付 12 键**：
  - `help` 域 4：`help.dashboard`、`help.dashboard.json`、`help.dashboard.out`、`help.dashboard.open`
  - `dashboard` 域 8（命令文案）：`title`、`statsTmpl`、`writtenTmpl`、`openFailedTmpl`、`jsonOutConflict`、`jsonOpenConflict`、`outEmpty`、`outIsDirectory`

**不动**：`src/core/flow-manager.ts`、`src/core/req/**`、`src/core/flow-archive/**`、`src/core/metrics.ts`、`.gitignore`、`README*`、`CHANGELOG.md`、`docs/VERSIONS.md`、`dsh/**`（除 `ADAPTER.md:16` 一行）。

---

## 3. op 拆分与门禁（**r3 定稿**：T1/T2 在命令层；计数与新发现的两处枚举修复并入 op-003；26 个 html 键前移 op-002）

| op | 标题 | 交付 | 单测 | 门禁 |
|---|---|---|---|---|
| **op-001** | 数据聚合层 | `src/core/dashboard/aggregate.ts` + `DashboardData` 类型 | T3~T8、**T24**（层间禁串单测） | `npx tsc -p .` 通过；T3~T8、T24 绿（**层次门不再是 `grep`，而是 T24 单测**，覆盖 `commands/` 与 `cli/` 两类禁串） |
| **op-002** | HTML 渲染层 | `src/core/dashboard/render.ts` + **26 个 `dashboard.html.*` i18n 键**（zh/en） | T13~T18 | T13~T18 绿；`render.ts` 除注释外零 CJK；本节结束时 `t('dashboard.html.empty', lang)` 已返回译文（**缺键会让 T16 假绿**） |
| **op-003** | 命令层 + 注册 + **全部计数/枚举修复** | `src/commands/dashboard.ts`、`flow.ts` 导出、`cli/index.ts`、**12 键**（4 help + 8 命令）、`VALUE_OPTIONS`、`--open` | T1、T2、T9~T12、T19~T23、**T25** | 顺序固定：注册命令 → **立刻跑全量 `npm test`** → 逐条修所有红（3 处：`knowledge` 44/43、`req.test` 20、`lint-req` 数组）→ 判据 = **全量绿**；另 `openfeel dashboard --help` 双语正常、互斥矩阵四例 exit 1 |
| **op-004** | 文档与生成物 | `docs/json-contract.md`(9 处)、`docs/commands.md`(4 处)、`SKILL.md`(1 行)、`dsh/ADAPTER.md`(1 行) + `npm run build` | — | `npm run build` 后 `git diff` 仅含预期 AUTO-GENERATED 变更；`npm test` 全绿（含 `templates-migration` T4.4）；**op 结果与提交说明必须写「SKILL.md 计数有意滞后（R2），发布阶段合并升 v1.5.9+v1.5.10」** |
| **op-005** | 全量收口 + 人工验证 | 全量 `npm test`、`lint i18n`、§0.4.1 穷举扫描留档、D-125-06 人工 6 步 | — | 全绿 + 人工结果与扫描输出写入 op 结果（供 archiver 引用） |

严格串行 op-001 → 002 → 003 → 004 → 005。**计数/枚举修复全部在 op-003**——与「注册命令」同一 op，避免门禁出现「预期红」；但**判据仍是全量绿而非清单已勾**（§0.4.1 规则 1）。

---

## 4. 验收清单

```bash
npm run build                                         # 注入 + tsc
npm test                                              # 全量（含 dashboard.test.ts / knowledge / req T-C4 / templates T4.4）
npx tsx src/cli/index.ts lint i18n                    # 0 issue
npx tsx src/cli/index.ts dashboard --json > /tmp/d.json && node -e "const d=require('/tmp/d.json');console.log(Object.keys(d).join(','))"
npx tsx src/cli/index.ts dashboard --out /tmp/of/board.html && ls -l /tmp/of/board.html
npx tsx src/cli/index.ts dashboard --json --out /tmp/x.html; echo "exit=$?"        # 期望 1 且 /tmp/x.html 不存在
npx tsx src/cli/index.ts dashboard --open                                          # 打开默认路径产物
```

人工 `file://` 六步见 D-125-06 末段。

---

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| `buildStatusJson` 被 export 后被人改形状 → 破坏 `flow status --json` | 注释「形状冻结，改动须过 `json-contract.test.ts` #1」；本阶段零形状改动 |
| core 层被顺手 import 命令层（层次反转） | **T24 单测**（op-001 门禁）+ op-005 全量复跑；禁串覆盖 `commands/` 与 `cli/` |
| 计数 / 文档漏改一处 → CI 红 | §0.4（**3 处测试**）+ §0.6（17 处文档/表）逐条勾选，**并以全量 `npm test` 绿为最终判据**（§0.4.1；r1/r2 两次漏项即因只靠清单） |
| `generatedAt` 使产物不可字节复现 | 页脚唯一时间字段；T17 剔除该字段后比对；契约标注「非确定，测试不得断言」 |
| `health.ok=false` 被消费方误当退出码 | 契约 + D-125-05 + 本表三处写明「快照命令恒 exit 0」 |
| 大仓库聚合耗时 | 命令层建**唯一** `FlowManager`（一次 flow.json 读）+ `data` 注入 core；无子进程/无 glob。注意 aggregate 仍有两次只读 IO（`metrics.json`、`flow-archive/*.json`），量级为 O(1) 文件；>1000 需求再议（本阶段不做） |
| `--open` 平台差异（WSL/无 DISPLAY/容器） | 只 warn 不改退出码；T20 覆盖失败分支 |
| 生成物误入 git | 默认路径在已忽略的 `.openfeel/tmp/`；人类输出打印绝对路径便于自查 |
| SKILL.md 口径滞后于 json-contract（42 vs 43） | 显式裁定 R2：快照类文档按快照语义保留，authoritative 以 `docs/json-contract.md` 为准；发布阶段同批升 |

## 6. 明确不做（边界）

- 不做 HTTP/静态服务器、不做 `fetch`/外部 JSON、不做自动刷新、不做多页站点、不引入前端框架/CDN。
- **不注入任何可执行脚本**（D-125-04 选 (b)）：无折叠/复制/过滤交互，可读性由服务端渲染保证。
- 不做 `--watch`、不做历史趋势/时序图（需新存储，超出 REQ-018）。
- **不改 `SKILL.md:15/44/54/58/60/88`（快照声明与 **5 处**计数口径）**：`templates.test.ts:521` 正面钉住快照串，且文档缺 v1.5.9 节；与 `docs/VERSIONS.md`/`CHANGELOG.md` 同批由发布阶段（archiver）处理（R2）。**这条「有意滞后」必须写进 op-004 的 op 结果与提交说明**，否则会被后续审查判为漏改。
- 不改 `flow.json` / `status.md` / `.openfeel/` 正式数据面（唯一写盘 = `--out` 的 HTML）。
- 不动 `dsh/**`（仅 `ADAPTER.md:16` 一行数字）、不动 `README*`、不写 `CHANGELOG.md` / `docs/VERSIONS.md`。
- 不改 `test/cli/json-contract.test.ts`（#43 的键序断言按 #41/#42 惯例落在 `dashboard.test.ts`）。

## 7. 执行期注意（行号漂移）

本文行号为 2026-11-02 r3 核对值。护栏若被前置 op 位移，**按语义重查**而非按行号盲改：

```bash
grep -n "42 个成功出口" docs/json-contract.md docs/commands.md src/core/templates-data/skills/openfeel-cli-usage/SKILL.md dsh/ADAPTER.md
grep -n "43 个注册" docs/json-contract.md docs/commands.md dsh/ADAPTER.md
grep -rn "rootProgram.commands.length\|roots).toEqual" test/
grep -n "本文档为 v1.5.8 快照" src/core/templates-data/skills/openfeel-cli-usage/SKILL.md
```

任何超出 §2 清单的文件改动，先报 Feel 裁决；但**清单不完备不是漏改的理由**——最终判据永远是 §0.4.1 的全量 `npm test` 绿。
