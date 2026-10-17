# v1.2.4-stage-100 计划 — DSH A1~A5 收口与版本 1.2.4 收口（fast）

- **阶段**：`v1.2.4-stage-100`（单阶段；`workflowMode=fast`；计划审查已通过，当前 `phase=exec_running`，以 flow.json 为准）
- **依赖**：**无**（上游 `v1.2.3-stage-99` 已 done / 已归档；flow.json `deps=[]`）
- **优先级**：P1（A1 数据安全 P1；A2/A3 P1；A4/A5 P2）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-17 ｜ **修订轮**：修订 1（REV-100-001）
- **基线**：**HEAD `62f09d8`** + 当前工作区。CLI `1.2.3`；flow.json `revision 1289` / 注册阶段 9 / `archived_versions` 12 / `requirements` 1（REQ-001 done）/ `reviews` 0 / `log` 361；测试 **75 文件 / 1911 用例**；`lint i18n` **983**；`lint kb` **0 过期 / 643 引用**；成功 JSON 出口 **33** / 注册 `--json` 选项 **34**。
- **定位**：只做 `dsh/ACTION-GUIDE.md` 的 **A1~A5** 与版本 **1.2.4** 收口；**范围锁定，不扩项**；**不修改 `dsh/`**。
- **fast 纪律**：本计划为轻量计划（保留目标 / 任务表 / 依赖 / 验收 / 约束 / KB / 变更点 / 风险 / 承接），但仍**必经 openfeel-reviewer 单轮计划审查**（`plan_review` → `plan_passed`），不得跳过。
- **文件边界**：本计划只产出规划文档；不修改 `stage-100/status.md` / `overview.md`，不直写 `flow.json`，不推进 phase（由 Feel 经 CLI 执行）。

## 目标

1. **A1（P1，数据安全）**：`archive <stage>` 已有归档时拒绝覆盖（`ARCHIVE_EXISTS`/refusal/1，**零写盘**）；新增 `--force` 显式覆盖；人类与 `--json` 双保护。
2. **A2（P1）**：`plan stage list --json`（flow.json 注册阶段调度视图；七键 + `count`）。
3. **A3（P1）**：`model list|get --json`（provider/model/source；三层来源可区分）。
4. **A4（P2）**：`flow retry` / `lint kb|i18n` / `roadmap show --json`。
5. **A5（P2）**：`config get --all --json`（项目模式一次取全量，不再 `key-required`）。
6. **版本 1.2.4 收口**：A/B/C/D/E + CHANGELOG + 文档多载体 + supplement 增量 + build 双生成物；`--version` = 1.2.4。

## KB 检索（`openfeel-check-kb`）

已加载 `.openfeel/kb/index.md`（architecture / patterns / troubleshooting / setup，2026-10-17 更新）。**高度相关条目**：

- `kb/patterns.md #CLI --json 结构化输出约定：顶层对象 + schemaVersion + 纯 JSON 单文档` → A2~A5 统一单文档/首键/空态。
- `kb/patterns.md #JSON 空态约定：全 null + 显式缺省主体 + 单一守卫（禁混合态）` → A2/A4 空态与 `null`/`[]` 规则。
- `kb/architecture.md #CLI JSON 输出契约冻结与错误封装分层架构` → 复用 `withSchemaVersion` / `emitJson` / `failRefusal`，不另起实现。
- `kb/patterns.md #版本号全链路收口清单模式：A 必改 / B 生成段 / C 传播 / D 禁改 / E 无载体` → T6 逐类核对；B 类双生成物。
- `kb/patterns.md #收口期冻结：版本号写入后零业务代码改动` → T6 为最终任务组。
- `kb/troubleshooting.md #零回归取证范式：补丁前基线捕获 → 补丁后复跑 diff 为空 + golden 内联常量 + 正控防假绿` → 人类输出零回归取证。
- `kb/troubleshooting.md #新增输出键/契约的同步面清单：i18n help + docs + manual + kb + 部署型 skill 模板` → 每个新出口的同步面。
- `kb/troubleshooting.md #零回归口径的「数量词陷阱」：须按带 --json 的命令数计` → 计数核验按命令面（lint 双命令面）。
- `kb/patterns.md #测试 cwd 隔离模式` + `#默认开启写真实用户目录的副作用防护` → A1 零写盘测试必须隔离 HOME/cwd，禁止读写真实 `.openfeel/flow.json`。
- `kb/patterns.md #归档引擎分层与独立锁模式` → A1 写盘顺序与幂等覆盖认知；本版改为拒绝覆盖 + `--force`。

> 执行任务前，若知识库中有相关条目，务必参考。重复踩过的坑不可再犯。

## 计数锁定（核验后）

- **成功 JSON 出口：40**（新增 #34 `plan stage list`、#35 `model list`、#36 `model get`、#37 `flow retry`、#38 `lint i18n`、#39 `lint kb`、#40 `roadmap show`）。
- **注册 `--json` 选项：41**（40 + `flow advance` 错误模式开关）。
- **较任务预估 39/40 +1**：`lint kb` / `lint i18n` 是两个独立 Commander 子命令，冻结计数测试按命令树遍历，各需注册；采用可执行口径 **40/41**，同步 `test/commands/knowledge.test.ts` 计数用例。
- `config get --all` 与 `archive --force` 为既有出口/选项扩展，**不计新增出口**。

## 任务表（T1~T7）

| 任务 | 主题 | 主要文件 | 验收要点 |
|:--:|------|----------|----------|
| **T1** | A1 归档覆盖保护 + `--force` | `src/core/archive/merge.ts`；`src/commands/archive.ts`；`src/core/errors.ts`；i18n zh/en；`test/commands/archive.test.ts`；`test/core/archive/merge.test.ts`；`test/cli/error-envelope.test.ts`；`test/cli/json-contract.test.ts` #33；契约 §3/#33 | 已有归档 + 无 force → exit 1 + `ARCHIVE_EXISTS`/refusal；归档文件内容哈希（SHA-256）、flow.json revision、`log[]` 长度、KB 条目数零变化（mtime 仅辅助，并发/时间粒度下稳定）；`--force` → exit 0 + #33 六键；未归档回归；错误码表 13 行 |
| **T2** | A2 `plan stage list --json` | `src/commands/plan.ts`；i18n help；`test/commands/plan.test.ts`；契约测试 #34；契约 §5 | `{schemaVersion,stages,count}`；七键；flow.json 注册序；空态 `[]/0`；`workflowMode` 单点；人类输出不变 |
| **T3** | A3 `model list|get --json` | `src/commands/model.ts`；i18n help；`test/commands/model.test.ts`；契约测试 #35/#36；契约 §5 | list/get 键序；首个 `/` 切分；`source` default > project > global；无效 scope → `INVALID_ARGUMENT`；人类不变 |
| **T4** | A4 三命令面 | `src/commands/flow.ts`；`src/commands/lint.ts`；`src/core/plan/roadmap.ts`；`src/commands/roadmap.ts`；i18n help；三测试文件；契约测试 #37~#39；契约 §5 | retry 六键；lint `target,ok,issues`，`ok:false` + exit 1；roadmap 里程碑 3/4 列兼容；人类输出不变 |
| **T5** | A5 `config get --all --json` | `src/commands/config.ts`；i18n help；`test/commands/config.test.ts`；契约测试 #27 扩展；契约 §5 | `{scope:"project",defaults}` 四键；不再 `key-required`；冲突组合拒绝；人类 `--all` 逐行；既有输出不变 |
| **T6** | 版本 1.2.4 收口 | A 类 6 载体/8 文件/10 处；B 类双生成物；C 类文档；CHANGELOG；supplement | A 类 10 处 = 1.2.4；build ×2 幂等；`--version` = 1.2.4；文档 40/41；历史节保留 |
| **T7** | 门禁与验收 | 全仓 | `npm test` 0 failed/0 skipped；`tsc` 0；`lint i18n`；`lint kb` 0 过期；build ×2；契约 #1~#40；人类输出零回归；`dsh/` 零 diff；无新增依赖 |

## A1 零写盘判据与别名边界（REV-100-001）

- **零写盘主判据**（按此断言，不做 mtime 等值主断言）：
  1. 归档文件**内容哈希**（SHA-256）不变；
  2. `flow.json` revision 不变；
  3. `flow.json.log[]` 长度不变；
  4. KB 条目数不变（`.openfeel/kb/**` 文件数与条目数）。
  `mtime` 仅作辅助信号；测试须在**并发/时间粒度下稳定**（同进程或子进程重跑均不依赖时间戳等值）。
- **别名边界（归档文件级，非阶段级）**：
  - `openfeel archive v1.2.0-stage-78` → `.openfeel/log/archive-v1.2.0-stage-78.md`
  - `openfeel archive stage-78` → `.openfeel/log/archive-stage-78.md`
  - 两者派生**不同目标文件**，互不触发覆盖保护；保护只针对本次命令的写入目标文件。
- **正控**：`--force` 必须真实覆盖（内容哈希变化 / revision 递增），防止「什么都没写」的假绿。

## 依赖与执行顺序

- **阶段依赖**：无（flow.json `deps=[]`；上游 v1.2.3-stage-99 done/archived）。
- **阶段内**：T1~T5 文件域互不重叠，可并行；建议顺序 T1 → T2 → T3 → T4 → T5（T1 优先，数据安全）。
- **T6 硬依赖 T1~T5**；**T7 硬依赖 T6**。
- **op 级依赖**：由 openfeel-schemer 在 `stage-100/ops/deps.yaml` 细化；本计划仅给任务级顺序。

## 关键变更点清单

| 变更点 | 文件 | 性质 |
|--------|------|------|
| `ArchiveExistsError` + 覆盖检查 + `--force` | `src/core/archive/merge.ts` | 新增防护；写盘顺序前置 |
| `ARCHIVE_EXISTS` 错误码 | `src/core/errors.ts` | 映射表 12 → 13 行 |
| archive 命令 `--force` / 拒绝分支 | `src/commands/archive.ts` | 新选项 + refusal |
| plan stage list JSON | `src/commands/plan.ts` | 新出口 #34 |
| model list/get JSON | `src/commands/model.ts` | 新出口 #35/#36 |
| flow retry JSON | `src/commands/flow.ts` | 新出口 #37 |
| lint 结构化 issues + JSON | `src/commands/lint.ts` | 新出口 #38/#39；人类输出同源 |
| roadmap 里程碑解析 + JSON | `src/core/plan/roadmap.ts` + `src/commands/roadmap.ts` | 新出口 #40；人类字符串不变 |
| config get `--all` | `src/commands/config.ts` | 既有出口 #27 扩展 |
| i18n help / 文案 | `src/core/i18n-data/zh-CN.ts` / `en.ts` | 新键 zh/en 对称 |
| 契约 / 文档 / 版本 | `docs/json-contract.md`、`docs/commands.md`、README×3、manual、skill、supplement、CHANGELOG、A 类载体 | T6 收口 |
| 测试 | 上述 7 个测试文件 + `test/cli/json-contract.test.ts` / `error-envelope.test.ts` | 契约 + 零回归 |

## 验收要点（fast 汇总）

| 项 | 判据 |
|----|------|
| A1 | 已有归档拒绝 + 零写盘（内容哈希/revision/log 长度/KB 条目数；mtime 辅助）；`--force` 成功；未归档回归；human + JSON 双保护；别名双示例互不触发 |
| A2 | 单文档、七键、注册序、空态 `[]/0`、人类不变 |
| A3 | 单文档、键序、首个 `/` 切分、source 三层、人类不变 |
| A4 | retry 六键；lint `ok:false` + exit 1；roadmap 3/4 列兼容；人类不变 |
| A5 | `defaults` 四键、不再 key-required、冲突拒绝、人类仅 `--all` 新输出 |
| 计数 | 40 成功出口 / 41 注册选项；三处对齐 |
| 版本 | `--version` = 1.2.4；A 类 10 处；build ×2；文档同步 |
| 门禁 | `npm test` 0 failed/0 skipped；`tsc` 0；`lint i18n`；`lint kb` 0 过期；`dsh/` 零 diff |

## 约束与红线

1. **范围锁定**：只做 A1~A5 + 版本收口；不新增功能/命令组/配置键/依赖；不改 phase 枚举/转移表。
2. **dsh 边界**：不修改 `dsh/`；不把 `dsh/` 纳入 lint/build/发布扫描；不镜像 Agent 编制。
3. **单一业务判定**：JSON 与人类输出共享判定；复用 `failCli` / `emitJson` / `isJsonMode`；不复制第二套。
4. **A1 数据安全**：检查必须在任何写盘之前；`--force` 仅绕过文件覆盖保护；保护层级为**归档文件级**（非阶段级），别名双示例见下节。
5. **A2 视图边界**：JSON = flow.json 注册阶段调度视图；人类 = 计划目录清单；契约显式登记。
6. **计数**：40/41；`lint` 双命令面各计 1；文档/源码/测试三处对齐。
7. **版本收口**：T6 为最终任务组；版本写入后零业务代码改动；B 类双生成物禁手改；`package-lock.json` 禁 `npm install`；`config.yaml` 单行 edit。
8. **流程边界**：不直写 `flow.json`；不推进 phase；不 commit/push；不 `npm publish`。

## 风险

| # | 风险 | 缓解 |
|:-:|------|------|
| R-1 | A1 检查点晚于写盘 → 零写盘失败 | 检查置于阶段解析后、全部写盘前；主判据 = 内容哈希 + revision + `log[]` 长度 + KB 条目数（mtime 辅助）；`--force` 正控防假绿 |
| R-2 | A1 短名/全名别名保护缺口 | 保护为归档文件级（非阶段级）；双示例 `archive v1.2.0-stage-78` / `archive stage-78` 派生不同文件、互不触发；契约登记已知边界 |
| R-3 | A2 JSON/人类视图差异误解 | 契约显式写明两种视图；空态明确 |
| R-4 | A3 source 链与 effective 不一致 | 复用 `byScope` + REV-1606 链；三层单测 |
| R-5 | lint 人类输出回归 | issues 与人类行同源；golden 快照 |
| R-6 | roadmap 表格格式差异 | 表头驱动 + 3/4 列用例 + 空态回落 |
| R-7 | 计数漂移（39/40 vs 40/41） | 逐项核验；更新计数测试；三处对齐 |
| R-8 | 版本收口遗漏 / `dsh` 误改 | A 类 file:line + 内容扫描 + build ×2 + `dsh/` 零 diff |

## 承接与外部项

| 来源 | 条目 | 处置 |
|------|------|------|
| `dsh/ACTION-GUIDE.md` §3~§7 | A1~A5 | **本阶段关闭**（T1~T5） |
| `dsh/ACTION-GUIDE.md` §8 | 四条边界约定 | **本阶段遵守**（T7 验证） |
| — | OUT-1：DSH 适配器消费 v1.2.4 新出口 | **仓库外项**，Feel/DSH 单独执行；不纳入本仓文件清单 |

> **计划审查**：已通过 openfeel-reviewer 单轮 `plan_review`；REV-100-001（low）修订已回填。阶段 phase 由 Feel 经 CLI 推进（本计划不写 flow.json）。

## 修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-17 | openfeel-planner | 修订 1（REV-100-001）：A1 零写盘主判据改为内容哈希 + revision + `log[]` 长度 + KB 条目数（mtime 辅助，要求并发/时间粒度稳定）；补别名双示例并明确保护为归档文件级。**只改计划文档**。 |
