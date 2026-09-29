# v1.1.2-stage-49 — 整仓全量审查

> **版本**：v1.1.2（继续，不新建版本；本阶段**不改版本号**） | **创建日期**：2026-09-29 | **Planner**：独立 openfeel-planner
> **定位**：**纯审查阶段**。范围**不限 v1.1.2**——对整个仓库做一次全面审查（正确性 / 一致性 / 文档-实现对齐 / 边界与健壮性 / 安全面 / 过度设计），产出**审查报告 + REV**，修复项按裁定流转（阻塞项当阶段修，其余归后续阶段）。

---

## 一、背景与定位

v1.1.2 主线（41→…→43）已归档，stage-48 完成事件加固与遗留清理。在**发布后基线**上对整仓做一次系统审查，目的是发现跨阶段、跨模块的**结构性欠账**（而非单点 bug），并形成可追溯的 REV 清单。

- **不做**：新功能开发、无关重构、版本号变更。
- **做**：按 **8** 个领域分区并行审查 → 汇总报告 → REV 登记 → 修复项流转裁定。

---

## 二、审查总则（全局约束，适用于全部 op）

| 项 | 要求 |
|----|------|
| **范围** | 整仓（`src/`、`test/`、`.openfeel/`、`docs/`、`manual/`、`kb/`、`build.js`、`.github/`、根配置与 README）；**历史归档只读**（`CHANGELOG.md`、`docs/phase-*`、`.openfeel/kb/**` 历史条目、fixture）——回改即违规 |
| **必查维度** | ① 正确性 ② 一致性（跨文件/双语/双源） ③ **文档-实现对齐** ④ 边界与健壮性（空值/存量数据/异常路径） ⑤ **安全面**（路径越界、注入、权限、环境覆写） ⑥ **过度设计**（无复用需求的抽象层/中间件/设计模式包装） |
| **取证要求** | 每条结论须可**第三方复现**：`命令 + 工具版本（node/opencode）+ 环境` 三要素；**关键事实以命令行（`rg`/`Get-Content`/实测执行）为准**，与 `read`/`glob` 冲突时以命令行为准（H2 纪律） |
| **可信度** | 沿用 stage-48 op-001 的可信度规范：会话若发生工具调用异常（输出重放/路径漂移/虚构内容），**立即中止并如实报告**，不得续写结论；**不得继承**可疑历史结论，须独立取证 |
| **测试隔离** | 审查中的**任何实测**不得触碰真实 `~/.openfeel/`、`~/.config/opencode/`、`~/.config/openfeel/` 与仓库 `.openfeel/config.yaml`；一律隔离 HOME / 临时目录 |
| **产出** | 每个单元产出：**审查报告**（`.openfeel/tmp/review-stage-49-{unit}.md`）+ **REV 条目**（`.openfeel/users/Liuary/code_review/REV-v1.1.2-stage-49-{unit}.md`，含 `状态/优先级/blocking/问题描述/证据/建议`） |
| **修复流转** | `blocking=true` → **当阶段（stage-49）修复**；其余 → **归后续阶段**（记录至版本级计划或新建补丁阶段）；**文档类**归归档官；**历史归档勘误**只在别处注记、不改原文 |

---

## 三、审查分区设计（8 单元 + 汇总）

| # | 单元 | 审查目标 | 必查项（要点） |
|:--:|------|----------|----------------|
| **U1** | **核心流水线 `flow-manager`** | 状态机正确性与并发安全 | ① `advanceStagePhase` 全路径（含 `pipeline.phase` 全量 done 判定）；② 权限/校验边界（`validate`/`hasTransition`/`getValidTargets` 数据源一致）；③ 乐观并发（`meta.revision`）与 `.bak`/checkpoint；④ 存量数据健壮性（缺 `meta`/`deps`/`stats`）；⑤ 组合条件 `\|` 语义；⑥ 日志与 `appendLog` 覆盖完整 |
| **U2** | **CLI 命令层 `src/commands`** | 命令行为与 i18n 一致性 | ① 全部子命令 help 文案 vs 实际行为（含 `flow phases`/`stage remove`/`config effective`/`plan stage add --deps`）；② 退出码约定（0/1/2，并发冲突）；③ `--dry-run`/`--force` 全命令覆盖一致性；④ 三入口（`plan stage add`/`flow stage add`/`stage create`）职责与 deprecated 口径；⑤ 中文硬编码残留（应走 i18n）；⑥ 非 TTY 静默惯例 |
| **U3** | **配置与画像 `config.ts` / `workspace/`** | 配置语义与全局状态安全 | ① 级联有效值与来源（status > config > profile > builtin）正确性；② profile 读写（子 Schema passthrough、非法 YAML 不覆盖、默认值合并）；③ 全局状态文件（`~/.openfeel/config.json`、`update_state.json`、`update_infos.md`）读写安全与锁；④ 语言三级回退；⑤ 全局路径单点（`global-paths.ts` N4 收口） |
| **U4** | **模板 / agent / skill** | 单一源与部署链路 | ① `build.js` 各步骤与双注入对象（`SKILL_DEFINITIONS`/`OPENCODE_SKILL_DEFINITIONS`/`AGENT_TEMPLATES`/`AGENTS_MD_TEMPLATES`）一致性断言覆盖；② zh/en 双语同步；③ 生成段与 `.opencode/` 自举为构建产物（禁手改）标记完整；④ agent frontmatter（`permission`/`model`/`reasoning_effort`）与 opencode schema 对齐；⑤ skill `description` 触发词有效性；⑥ 受管区标记/三态在 agent.md 与 AGENTS.md 的行为 |
| **U5** | **测试体系 `test/`** | 隔离纪律与覆盖质量 | ① **全部**测试文件 `homedir`/`cwd` 隔离（`vi.mock('node:os')`、`spyOn(process,'cwd')` + 反向守卫）——逐一核对（非抽查）；② 是否存在其它「保存/恢复」伪隔离；③ 断言有效性（是否仅断言值而漏 `source`/`kind` 等语义）；④ fixture 与真实数据结构同步；⑤ 测试与实现的行号引用是否漂移 |
| **U6** | **文档 / 手册 / kb** | 文档-实现对齐 | ① `.openfeel/manual/**` API/结构/行号 vs 源码实盘；② `kb/**` 条目时效性（已退役路径/命令/流程）与 `lint kb` 零过期引用；③ `docs/**`（含 `commands.md`）vs CLI 实况；④ 根 `README*` 与 `AGENTS.md` 一致性；⑤ 历史归档未被回改（只读核验） |
| **U7** | **构建与发布链路** | 可发布性与可复现性 | ① `build.js` 幂等性与产物确定性（重跑零 diff）；② `ci.yml` 步骤充分性（版本门禁/lint/环境守卫）；③ `package.json` 文件清单、`engines`、`bin` 可执行性（`node bin/openfeel.js` 各命令）；④ 发布链路（版本比对、token、publish）无死配置；⑤ 依赖与 `package-lock` 一致性（含既有 1.0.7 漂移）；⑥ npm pack 内容是否含生成期临时文件 |
| **U8** | **部署与更新链路**（REV-49-001 新增） | 部署/更新/迁移/备份的代码语义与事务性 | ① `update.ts` `writeManagedFile` **五分支**（created/updated/adopt/appended/malformed）语义与动作返回一致性；② `deployGlobalAsset` 破坏性签名调用点完备（`setup.ts`/`update.ts`/`migrate.ts` 三链路 `command` 透传）；③ `setup.ts` 全局部署流程与 state/hash 更新时序；④ `migrate.ts` **事务边界**（备份 → 部署 → state 拆分 → 清理 → finally 回填 → rollback 可收敛）；⑤ `backup.ts` 三步保护（判存/原子写/manifest）与**锁作用域**（`globalLockPath('backup')` 临界区）；⑥ `managed-region.ts` 四策略与三态（含 `SECTION_PREFIXES` 读侧匹配）；⑦ `update-state.ts`/`update-infos.ts` 双 state 路由与 `backed/anomaly` 语义；⑧ `fs/**`（atomic-write/file-lock/sequence）作为写入基础设施的正确性；⑨ **实现 ↔ 测试断言一致性**（update/setup/migrate/backup/managed-region 相关测试文件；与 U5 边界见下） |

> **U5 / U8 边界（REV-49-001 要求）**：**U5 = 横切**（全部测试文件的隔离纪律 `vi.mock('node:os')`/`cwd` 守卫、伪隔离反例、断言有效性）；**U8 = 纵切**（部署/更新链路**实现正确性**与该链路**测试断言是否覆盖实现分支**）。二者交叉点在「该链路测试文件」，U5 查隔离与断言质量，U8 查实现-测试对应；产出时在报告中互相引用，避免重复或漏空。

### 覆盖矩阵（MECE 复核，REV-49-001）

| 源文件 / 目录 | 归属单元 |
|---------------|:--:|
| `core/flow-manager.ts`、`core/pipeline-schema.ts` | U1 |
| `core/plan/{path,stage,scheme,roadmap}.ts` | U1 |
| `core/archive/merge.ts`、`core/view/entry.ts`、`core/metrics.ts`、`core/public-logger.ts`、`core/artifact-graph/**`、`core/schema.ts` | U1 |
| **`utils/kb-dedup.ts`**（归档去重，与 `archive/merge.ts` 同链路，REV-49-004 补） | **U1** |
| `commands/**`、`cli/index.ts`、`core/i18n.ts`、`core/i18n-data/**` | U2 |
| **`cli/repl.ts`**（REPL 交互入口，REV-49-004 补） | **U2** |
| **`index.ts`**（占位导出桶，REV-49-004 补；**附**：`:10` `export const VERSION = '0.1.0'` 全仓零引用且与 `package.json.version`(1.1.2) 漂移 → 交 U7 交叉核对） | **U2** |
| `core/config.ts`、`core/global-paths.ts`、`core/model-config.ts`、`core/opencode-config.ts`、`core/workspace/**` | U3 |
| `core/template-loader.ts`、`core/templates.ts`、`templates-data/**`、`build.js` 注入段 | U4 |
| `test/**`（横切：隔离与断言质量） | U5 |
| `.openfeel/manual/**`、`.openfeel/kb/**`、`docs/**`、`README*`、根 `AGENTS.md` | U6 |
| `build.js`（构建管线）、`.github/**`、`package.json`、`package-lock.json`、`.npmignore`/`files` | U7 |
| `core/update.ts`、`core/setup.ts`、`core/migrate.ts`、`core/init.ts`、`core/backup.ts`、`core/managed-region.ts`、`core/update-state.ts`、`core/update-infos.ts`、`core/fs/**` | **U8** |
| **`utils/path.ts`**（file:// URL ↔ 路径转换，与 `fs/**` 同类基础设施，REV-49-004 补） | **U8** |

### 全量 `src/**/*.ts` 映射自检（62/62，REV-49-004）

> 复核命令：`Get-ChildItem src -Recurse -Filter *.ts`（实测 **62** 个 `.ts`；REV-49-004 原文称 59 —— **以实测 62 为准**，差异 3 个不影响结论，全量映射见下）。

| 单元 | 文件数 | 文件清单 |
|:--:|:--:|----------|
| **U1** | 18 | `core/flow-manager.ts`、`core/pipeline-schema.ts`、`core/plan/path.ts`、`core/plan/stage.ts`、`core/plan/scheme.ts`、`core/plan/roadmap.ts`、`core/archive/merge.ts`、`core/view/entry.ts`、`core/metrics.ts`、`core/public-logger.ts`、`core/artifact-graph/{graph,index,instruction-loader,resolver,state,types}.ts`、`core/schema.ts`、`utils/kb-dedup.ts` |
| **U2** | 23 | `index.ts`、`cli/index.ts`、`cli/repl.ts`、`core/i18n.ts`、`core/i18n-data/{en,types,zh-CN}.ts`、`commands/{archive,config,flow,init,instructions,knowledge,lint,migrate,model,plan,project,roadmap,setup,stage,update,view}.ts`（16） |
| **U3** | 7 | `core/config.ts`、`core/global-paths.ts`、`core/model-config.ts`、`core/opencode-config.ts`、`core/workspace/{identity,knowledge,structure}.ts` |
| **U4** | 2 | `core/template-loader.ts`、`core/templates.ts`（+ 非 `.ts` 的 `templates-data/**`、`build.js` 注入段） |
| **U8** | 12 | `core/update.ts`、`core/setup.ts`、`core/migrate.ts`、`core/init.ts`、`core/backup.ts`、`core/managed-region.ts`、`core/update-state.ts`、`core/update-infos.ts`、`core/fs/{atomic-write,file-lock,sequence}.ts`、`utils/path.ts` |
| **合计** | **62** | 18 + 23 + 7 + 2 + 12 = 62 ✓（U5/U6/U7 为横切/非 `src/**/*.ts` 范围：`test/**`、文档、构建与发布配置） |

> MECE 自检：每个 `src/**/*.ts` 恰属一个单元（U4 与 U8 对 `update.ts` 的交叉已按「U4 只看其**生成段**、U8 看其**逻辑函数**」切分）；横切单元（U5/U6/U7）与纵切单元（U1~U4/U8）在报告中互相引用，无遗漏。

### 修复项流转

```
审查单元产出 REV
   ├── blocking=true  → stage-49 内新增 op 修复（本阶段收口）
   ├── 非阻塞代码/测试 → 归「后续补丁阶段」（记录至版本级计划 §变更汇总/新建 stage-50+ 建议）
   ├── 文档/手册/kb    → 归 openfeel-archiver（归档阶段）
   └── 历史归档勘误    → 只在不改原文的前提下注记（归档官）
```

### 产出与登记（REV-49-002）

- 单元报告：`.openfeel/tmp/review-stage-49-U{1..8}.md`；单元 REV：`.openfeel/users/Liuary/code_review/REV-v1.1.2-stage-49-u{1..8}.md`（按单元拆分合理，避免单文件过长）。
- **但须补 index 登记**：op-009 汇总时把 8 个单元 REV 文件路径补入 `.openfeel/users/Liuary/code_review/index.md` 的阶段分组索引，使审计链可从 index **一跳到达**；汇总报告的 REV 索引须含**文件级跳转**。

### 分层深度策略（REV-49-003）

各单元必查项工作量差异大（U5 全量测试、U4 双语 diff、U8 五分支为重单元）。采用「**先广度后深挖**」两轮：

1. **第一轮（广度）**：各单元对全部分区做广度扫描，产出 **REV 候选**（可用「待实测」标注机制，§二已具备）。
2. **第二轮（深挖）**：op-009 汇总后，**仅对 `blocking` 候选**要求完整证据链 + 复现路径，集中深挖；其余候选标注优先级后按流转处理。
3. 目的：避免单单元无限展开挤占 op-009 与 blocking 修复时间（R7）。

---

## 四、op 级任务清单

| op | 主题 | 具体做法 / 产出 | 验收要点 |
|----|------|----------------|----------|
| op-001 | 审查单元 **U1 核心流水线** | 按 §三 U1 必查项逐条取证（`rg`/`Get-Content`/隔离 HOME 实测；可运行 `flow` 命令族验证）；产出 `.openfeel/tmp/review-stage-49-U1.md` + `REV-v1.1.2-stage-49-u1.md` | 每条结论附 `命令 + 版本 + 环境`；REV 条目含状态/优先级/blocking/证据/建议；未确证项标「待实测」 |
| op-002 | 审查单元 **U2 CLI 命令层** | 同法覆盖全部命令族（含 help 输出、退出码、dry-run/force、i18n 覆盖） | 同上；help 文案与实际行为逐条对照表 |
| op-003 | 审查单元 **U3 配置与画像** | 同法（隔离 HOME 构造 profile/config 组合；级联来源矩阵验证） | 同上；级联 4×N 组合矩阵 |
| op-004 | 审查单元 **U4 模板/agent/skill** | 同法（build 产物比对、双语 diff、frontmatter vs opencode schema） | 同上；双源/双语一致性证据 |
| op-005 | 审查单元 **U5 测试体系** | 同法（**全量逐一**核对隔离；反例搜索「savedConfig 式伪隔离」） | 同上；隔离核对表（文件 → 是否有 `vi.mock('node:os')`） |
| op-006 | 审查单元 **U6 文档/手册/kb** | 同法（`lint kb`、manual 引用抽样全量、README/AGENTS 一致性） | 同上；`lint kb` 零过期引用证据 |
| op-007 | 审查单元 **U7 构建与发布** | 同法（build 幂等实测、ci.yml 步骤缺口、pack 内容核对） | 同上；build 重跑零 diff 证据 |
| op-008 | 审查单元 **U8 部署与更新链路**（REV-49-001 新增） | 同法（`writeManagedFile` 五分支语义、`deployGlobalAsset` 调用点、`migrate` 事务边界、`backup` 三步与锁作用域、`managed-region` 三态、`update-state`/`update-infos` 语义、`fs/**` 基础设施；并核对**该链路实现 ↔ 测试断言**一致性） | 同上；五分支逐分支证据 + 事务边界/锁作用域证据 |
| op-009 | **汇总报告 + REV 索引登记 + 修复流转裁定** | ① 汇总 8 单元产出：`.openfeel/tmp/review-stage-49-summary.md`（全部 REV 索引、去重、优先级分布、**文件级跳转**）；② 公共摘要写入 `.openfeel/code_review/stage-49.md`；③ **把 8 个单元 REV 文件路径登记到 `.openfeel/users/Liuary/code_review/index.md` 阶段分组索引**（REV-49-002，审计链一跳可达）；④ 依 §三「修复项流转」逐条裁定归属并在版本级计划登记；⑤ 存在 `blocking=true` 项 → **在本阶段末尾新增修复 op**（或在报告中说明为何改判非阻塞） | 汇总报告含完整 REV 索引与流转结论；**index 已登记 8 个单元 REV 路径**；公共摘要存在；blocking 项有明确去处 |

---

## 五、影响文件清单

| op | 新增 | 修改 |
|----|------|------|
| op-001~008 | `.openfeel/tmp/review-stage-49-U{1..8}.md`、`.openfeel/users/Liuary/code_review/REV-v1.1.2-stage-49-u{1..8}.md` | 无（纯审查，不动源码） |
| op-009 | `.openfeel/tmp/review-stage-49-summary.md`、`.openfeel/code_review/stage-49.md` | `.openfeel/users/Liuary/code_review/index.md`（8 个单元 REV 登记）、`.openfeel/plan/v1/v1.1.2/plan.md`（流转登记）、可能 `.openfeel/roadmap/v1.1.2.md` |
| （blocking 修复，如有） | — | 由 op-009 裁定后新增 op 指定 |

> 纯审查阶段默认**不改源码**；仅当出现 `blocking=true` 项时由 op-009 追加修复 op。
> 产出目录说明（REV-49-002 更正）：`.openfeel/tmp/` 为**项目公共临时目录**（公共域），非私域；产出不入版本管理（`package.json` `files` 不含之）。

---

## 六、完成标准

1. **8 个**审查单元全部产出报告 + REV，覆盖 §三 各单元必查项与**覆盖矩阵**（无遗漏模块；MECE 自检通过）。
2. 每条结论满足「命令 + 版本 + 环境」可复现三要素；未确证项显式标注「待实测」及原因。
3. 汇总报告 + 公共摘要 `code_review/stage-49.md` 生成，含完整 REV 索引（**文件级跳转**）与**修复流转裁定**；**`code_review/index.md` 已登记 8 个单元 REV 路径**。
4. `blocking=true` 项：全部在本阶段修复或在报告中给出**改判理由**（不得留空）。
5. 审查过程**未触碰**真实全局目录与仓库 `config.yaml`（环境哈希前后一致）；未回改任何历史归档。
6. 全量回归（`npm run build && npm test` + `lint i18n`/`lint kb`）保持全绿（若本阶段含修复 op，则修复后须复跑）。

---

## 七、风险与注意事项

| # | 风险 | 缓解 |
|---|------|------|
| R1 | 审查结论不可信（事件 A 复现） | 严格执行 §二 可信度与取证要求；会话工具异常即中止并由 Feel 重开；关键结论命令行独立复现 |
| R2 | 范围过大导致深度不足 | 8 单元分区 + **「先广度后深挖」两轮策略**（§三）；优先级：正确性/安全面优先 |
| R3 | 审查中的实测覆写真实环境（事件 B 复现） | §二 测试隔离硬要求；隔离 HOME / 临时目录；CI 环境守卫（stage-48 op-002）为防线 |
| R4 | 误将「历史遗留设计」判为新缺陷 | 判缺陷须给出**影响 + 可复现路径**；无影响的历史事实仅作「观察项」 |
| R5 | 过度设计判定主观化 | 以 AGENTS.md 约束 2 的量化阈值（新增/修改 >3 文件、新抽象层无复用、单一功能引入第三方库）为判据 |
| R6 | 产出 REPO 内污染（tmp 文件被提交） | 审查产物置于 `.openfeel/tmp/`（**项目公共临时目录**，非私域），不入版本管理；`package.json` `files` 清单不含之 |
| R7 | blocking 项在审查末期才发现、修复挤占时间 | **op-009** 显式允许「新增修复 op」或「改判并论证」；两者均须留痕（REV-49-004 更正：原写 op-008） |
| R8 | 修复项流转无人承接 | §三 流转表 + 版本级计划登记，确保非阻塞项有明确后续归属 |

---

## 八、op 执行顺序与依赖

```
【第一轮·广度】op-001(U1) op-002(U2) op-003(U3) op-004(U4) op-005(U5) op-006(U6) op-007(U7) op-008(U8)
                          （可并行；各自产出 REV 候选，允许「待实测」标注）
                                    │
                                    ▼
【第二轮·深挖】op-009（汇总 + REV 索引登记 + 修复流转裁定；对 blocking 候选补齐完整证据链）
                                    │
                                    ▼
                        （如有 blocking）新增修复 op → 回归
```

**建议顺序**：op-001~op-008 **可并行派发**（各单元产出独立文件，无写交集）；op-009 串行收口（含第二轮深挖与 index 登记）。

- 依赖：**hard `v1.1.2-stage-48`**（提供稳定基线：隔离纪律落地、CI 守卫、执行口径统一）。
- 各单元并行时若需运行 `npm run build`/`npm test`，须避免同时触发（同一工作区）；建议**只读命令并行、构建/测试串行**或串行门控。
- 分层策略见 §三「分层深度策略」：第一轮广度 → 第二轮仅对 blocking 深挖（REV-49-003）。

---

## 九、修订记录

| 时间 | 修订人 | 依据 | 修订内容 |
|------|--------|------|----------|
| 2026-09-29 | openfeel-planner | 用户需求「v1.1.2 追加 stage-49（整仓全量审查）」 | 新建本阶段：审查总则（§二）+ 7 单元分区设计（§三）+ op-001~op-008 + 修复流转裁定 |
| 2026-09-29 | openfeel-planner | REV-v1.1.2-stage-49 REV-001（blocking, high） | **新增 U8「部署与更新链路」**（裁定：选方案①；理由见 §三 U8 说明），op 清单扩至 `op-001~op-008`（单元）+ `op-009`（汇总）；补 **U5/U8 边界** 与 **覆盖矩阵（MECE 复核）**；§八 顺序图同步 |
| 2026-09-29 | openfeel-planner | REV-v1.1.2-stage-49 REV-002（low） | §二 新增「产出与登记」节：op-009 须将 8 个单元 REV 补入 `code_review/index.md` 阶段分组索引 + 汇总索引含文件级跳转；§七 R6 措辞更正 `.openfeel/tmp/` 为**项目公共临时目录**（非私域） |
| 2026-09-29 | openfeel-planner | REV-v1.1.2-stage-49 REV-003（low） | §二 新增「分层深度策略」（**先广度后深挖**两轮）；§三/§八 体现；R2 缓解同步 |
| 2026-09-29 | openfeel-planner | REV-v1.1.2-stage-49 REV-004（low） | ① 覆盖矩阵补 **4 个漏网文件**（`cli/repl.ts`→U2、`index.ts`→U2、`utils/kb-dedup.ts`→U1、`utils/path.ts`→U8），并新增**「全量 `src/**/*.ts` 映射自检（62/62）」表**（逐单元列清单；**实测 62 个，REV 原文称 59，以实测为准**）；② §七 R7「op-008」更正为 **op-009**；③ `overview.md` 的「7 个领域分区」同步为 **8** |
