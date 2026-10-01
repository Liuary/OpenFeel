# v1.1.2-stage-53

> current.md / dev_last.md 职能与格式重构

## 目标

把 `dev/current.md` 从「成员进度流水」改为**用户级的跨用户整体信息**（仅个人提交时更新、≤5 条近期记录、旧记录自动归档至 `dev/current_archive/`）；把 `users/{username}/dev_last.md` 从「单会话覆盖写的 7 节文件」改为**索引文件 + 同名目录（主题文件）**，并引入**公共交接区**（仅文档位置 + 核心摘要）。

**两条设计目的（写入整体约束）**：① 保存核心信息便于恢复；② 避免无关信息污染上下文。

## 依赖

- **硬依赖**：`hard: v1.1.2-stage-52`（`flow.json` 当前 deps 为空，须由 Feel 执行 `flow stage set v1.1.2-stage-53 --deps v1.1.2-stage-52`）
- 阶段状态：`planned`（phase `plan_pending`），执行模式 manual

## 关键裁定

| # | 议题 | 结论 | 依据 / 状态（可追溯） |
|---|------|------|------|
| A1 | Pantheogen `current.md`（123 行） | **反面参照**（问题样本），不作模板来源 | 需求原文（含「用户已裁定①」） |
| A2 | 旧记录归档位置 | `.openfeel/dev/current_archive/`（公共域，纳入版本管理） | 需求原文（用户已裁定②） |
| A3 | dev_last 7 节拆分 | 「用户偏好」「公共交接区」留索引；其余 6 节按主题拆入 `dev_last/*.md` | 需求原文（用户已裁定③） |
| A4 | 实施载体 | 新开 `v1.1.2-stage-53` | 需求原文（用户已裁定④） |
| A5 | current 记录内联 `@{username}` | **已由用户裁定（2026-10-01）**：保留为**提交者标识**（非「成员进度段」，仍无 agent 细节） | 与 planner 建议一致 |
| A6 | `openfeel-sync-status` skill 去向 | **已由用户裁定（2026-10-01）**：**改写并保留**（读各用户 `dev_last` 索引 + `flow.json`）；**skill 总数仍 17** | 与 planner 建议一致 |
| A7 | 仓库根 `AGENTS.md` 是否镜像工作区节 | **不改**；若后续该文件新增 current/dev_last 类节须一并同步（折中：仅增一行指引，不镜像全文） | **已由 Feel 裁定** + 事实依据（实测 `rg` **0 命中**；权威源为 `agents-md` 模板） |
| A8 | 本仓 current 历史里程碑表去向 | **仅归档**到 `current_archive/`，**不迁入 roadmap** | **已由 Feel 裁定** + 依据（归档保留原文、roadmap 已有摘要，重复迁移无增量价值） |
| A9 | 多会话并发写 dev_last | **已由用户裁定（2026-10-01）**：**加锁保护**——`withFileLock` + `atomicWriteFileSync`；**每用户一把锁**（`dev-last-{username}`，索引与主题文件共用）→ `.openfeel/tmp/locks/dev-last-{username}.lock`（已 gitignore）；临界区含读取；**锁 + 合并双保险**（保留冲突双侧保留） | **推翻 planner「不加锁」建议** |
| A10 | 主题文件命名 | **已由用户裁定（2026-10-01）**：**文件名一律英文 kebab-case**（`pending.md`/`decisions.md`/`pipeline-state.md`/`last-operation.md`/`experience.md`）；**索引显示名可中文**；zh/en 共用同一套英文名 | **推翻 planner「中文名」建议** |
| A11 | **主题数 >5 时的处理**（REV-002） | **就地收敛，不归档**：优先合并同类主题；无可合并则最旧已完结主题降为「已收敛主题」一行摘要（≤100 字 + 路径），文件**不迁移不归档** | **已由 Feel 裁定**：REV-002 原建议「移入 `tmp/` 归档」**与用户约束「超期文件不做归档处理」冲突 → 以用户约束为准** |

## 改动面（受影响文件）

**权威源（改后须 `npm run build` 传播）**
- `src/core/templates-data/agents-md/{zh-CN,en}.md`：`:158-172`（两条目的 + 分层表）、`:206-212`（current 规则 + `current_archive/`）、`:249`（自动计划化口径）、`:314-356`（dev_last 索引规则 + 骨架）
- `src/core/templates-data/opencode/agents/{zh-CN,en}/feel.md`：`:317-333`（记忆加载）、`:371-375`（决策追加）、`:389-395`（会话结束写入）、`:403`
- `src/core/templates-data/opencode/skills/openfeel-{workspace,recover,sync-status}/SKILL.md`

**源码（仅模板/常量）**
- `src/core/templates.ts:17-34`（current init 模板 zh/en）
- `src/core/workspace/structure.ts:32`（`DEV_SUB_DIRS` += `current_archive`）
- `src/core/init.ts:220-224`（逻辑不变，目录由 `createWorkspace` 覆盖）

**本仓存量数据**
- `.openfeel/dev/current.md`（82 行 → 新格式）、**新增** `.openfeel/dev/current_archive/current-2026-10-01-001.md`
- `.openfeel/users/Liuary/dev_last.md`（53 行 → 索引）、**新增** `dev_last/` 下 5 个主题文件

**文档/手册**
- `.openfeel/manual/agents/feel.md:54`、`.openfeel/manual/core/init.md:7`（+ 实测核对其余）
- 仓库根 `AGENTS.md`、`docs/**`、`README*.md`、`CHANGELOG.md`：**实测无需变更**（见 A7）

**构建产物（勿手改，由 build 生成）**
- `src/core/template-loader.ts`（AUTO-GENERATED 段）、`src/core/update.ts`（skill 注入）、仓库 `.opencode/**`（自举）

## 测试翻转清单

- **强制翻转：0 项**（`init.test.ts:269` / `:132`、`templates.test.ts:24-40`(T54)、`template-loader.test.ts:334`、`setup.test.ts:56,83` 均不受影响）
- **文本保持约束（改则红，executor 须保留）**：`template-loader.test.ts:166-201` 依赖 feel.md 的 `update_infos`/`` `- [ ]` ``/`` `- [x]` ``/`edit 工具`/`重启会话`、workspace skill 的 `update_infos.md`/`会话启动修复`、en.md 的 `Global Behavioral Constraints`；`templates.test.ts:19-20` 依赖每个 skill 含「程序自检」+ `` `openfeel ``
- **建议新增断言**：`current_archive/` 目录创建；current 模板不含 `团队成员进度` 且含 `current_archive`；agents-md 含「主题索引（最多 5 个）」

## op 划分

| op | 范围 | 产出 |
|----|------|------|
| op-001 | D1 + D2 | 两条目的、current 规则与模板（agents-md zh/en + templates.ts） |
| op-002 | D3 + D4 | dev_last 索引/主题骨架、feel.md 记忆加载与会话写入 |
| op-003 | D5 + D6 | 3 个 skill 同步、`DEV_SUB_DIRS` 常量 |
| op-004 | D7 | 本仓存量迁移（current 重写 + 归档 + dev_last 拆 5 主题） |
| op-005 | D8 + D9 + D10 | manual 同步、build 幂等、三门禁、新增断言 |

顺序：`op-001 → op-002 → op-003 → op-004 → op-005`

## 门禁

`npm run build`（幂等）→ `npm test`（基线 **56 文件 / 869 用例**，全绿）→ `node bin/openfeel.js lint i18n`（**649 键**）→ `node bin/openfeel.js lint kb`（0 过期）

## 风险

R-1 旧格式 dev_last 惰性迁移 ｜ R-2 多会话并发（不引入锁）｜ R-3 归档只增不删 ｜ R-4 部署生效需 `openfeel setup`（本阶段不执行）｜ R-5 sync-status 口径改写 ｜ R-6 zh/en 漂移 ｜ R-7 迁移丢信息（先归档后重写）｜ R-8 `current_archive/` 误入 gitignore ｜ **R-9 主题数 >5 无规则（REV-002）→ §五.2 R4 就地收敛（优先合并，不归档）**

## 格式要点补充（REV-002）

`dev_last.md` 索引含两个小节：**「主题索引」（活跃主题 ≤5）** + **「已收敛主题」（一行一条，不设硬限，仅 ≤100 字摘要 + 文件路径）**；主题数 >5 时**优先合并同类主题**，无可合并则**就地收敛**（文件不迁移、不归档 —— 受用户「超期文件不做归档处理」约束）。
