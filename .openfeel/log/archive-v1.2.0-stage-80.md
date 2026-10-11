# 归档摘要 — v1.2.0-stage-80

- **归档时间**：2026-10-12
- **阶段名称**：v1.2.0-stage-80（归档消费点适配与存量迁移 — **本仓自举**；**v1.2.0 归档主题收官阶段**）
- **阶段状态**：archiving → done
- **依赖阶段**：hard `v1.2.0-stage-78` + `v1.2.0-stage-79`（引擎 + 命令面就绪后方可适配消费点并执行真实迁移）；下游 = `v1.2.0-stage-81`（需求核心引擎，在收缩后的活跃集上开发）
- **归档人**：openfeel-archiver

## 阶段目标

把 stage-78/79 的归档能力**接入既有消费点**并完成**本仓自举迁移**：① 跨版本 stage deps 判定适配（**单一口径** `isArchivedVersionOf`，含 `plan stage add --deps` + `flow stage set --deps` 两写侧校验点 + health 读侧 `checkDanglingDeps`）；② `flow health` 归档一致性检查（a 双向对账 / b 活跃集残留 / c 悬空读侧，全 warn-only）；③ `config set --sync-stages --stage` 已归档目标降级 + `syncConfigFieldToStages` 循环重构；④ 恢复（checkpoint restore）与归档的关系落文案；⑤ **本仓 78 阶段九组一次性迁移**（备份 + 判据门 + 回滚路径成文）；⑥ 端到端验证（归档后既有命令全绿 + flow.json 体积实测下降）。

## 操作产出

| ID | 标题 | 状态 | Commit |
|----|------|------|--------|
| op-001 | 跨版本 deps 判定适配（单一口径 helper `isArchivedVersionOf` + 命令层两处校验点）（T1；i18n 826→828） | done | —（未提交） |
| op-002 | health 归档一致性（`archive-health.ts` a/b/c）+ config 已归档目标降级 + `syncConfigFieldToStages` 循环重构（T2 + T7 + REV-80-009；i18n 828→829） | done | —（未提交） |
| op-003 | 存量迁移（本仓自举）+ 零触碰验证程序 + 全门禁 + 承接收口（T3 + T4 + T5 + T6；**最终 op**，含不可逆数据动作 + 用户确认门） | done | —（未提交） |
| op-004 | REV-80-019 修复——「归档残留」b 项判据收窄为**键级两段式**（含 REV-80-020/021/022/023 处置） | done | —（未提交） |

> 注：executor 按 `ops/deps.yaml`「不 commit」约定，产出停留工作区（HEAD `fdfebc9`）；执行序 = `op-001 → op-002 → op-003 → op-004`（严格按 `execution_order`；op-004 为 review_failed 后修复 op）。

## 改动文件

- **`src/core/plan/path.ts`**：新增 **`isArchivedVersionOf(stageId, archivedVersions): boolean`**——**版本粒度**判定（显式版本前缀 ∧ 版本段 ∈ `archivedVersions`）；经 `parseStageId` **探针法**派生（`parsed.fullStageId !== stageId` 即拒，**零自写正则**）；**短名恒 `false`**（REV-80-001）。**全仓唯一实现，4 调用点**（`commands/plan.ts` / `commands/flow.ts` 两写侧校验点 + `core/flow-manager.ts` `checkDanglingDeps` 读侧 + `commands/config.ts` 降级）。落本模块（**非 `flow-archive/*`**）以避 `flow-manager → flow-archive` 反向依赖成环（REV-80-005）。
- **`src/core/flow-archive/archive-health.ts`**（**新增**）：`archiveHealthItems({ projectPath, data }): HealthCheckItem[]` 纯函数（恒无 `fail`、仅 pass/warn）——**a** 索引（`meta.archived_versions`）↔ 归档目录清单双向对账（section `归档一致性`）；**b** 活跃集残留（section `归档残留`；**两段式键粒度**——版本前缀 ∈ `archived_versions` 预筛 ∧ `stageId ∈ readArchiveFile(version).stages` 键集，REV-80-019）；**c** 悬空读侧（经 `checkDanglingDeps`）。对 flow-manager 仅 `import type`；**仅被 `src/commands/flow.ts` 消费**；常规零读归档文件、b 项候选分支按版本惰性读一次快照。
- **`src/core/flow-manager.ts`**：`checkDanglingDeps` 的 `known` 并入 `isArchivedVersionOf`（**读侧同口径**，REV-80-002）；`syncConfigFieldToStages` **循环重构**——遍历集 = `onlyStages ∪ Object.keys(stages)` 归一化去重（缺省活跃集全量，零回归），使 off-set 目标可达；冗余写入三点 `:3637/:3646/:3667` 加注册守卫，REV-80-009）。
- **`src/commands/plan.ts`** / **`src/commands/flow.ts`**：`--deps` 两写侧校验点接入 `isArchivedVersionOf`（已归档版本视为已满足）；`flow health` 命令层合并 `archiveHealthItems`（warn-only，不改退出码，非 quick，不参与 `--fix`）。
- **`src/commands/config.ts`**：`config set --sync-stages --stage <已归档显式全名>` 降级（status.md 照常同步 + flow.json 冗余跳过 + info；短名/未注册 → 原路径 exit 1 逐字）。
- **`src/core/i18n-data/{zh-CN,en}.ts`**（**+3 键：826 → 829**）：`plan.stage.archivedDepsTmpl` / `stage.set.archivedDepsTmpl`（op-001 两键）+ `config.set.syncArchivedStageTmpl`（op-002 一键），双表成对、逐键有消费点。
- **测试**：`test/core/plan/path.test.ts`（helper 单测含反例）、`test/commands/plan.test.ts` / `flow.test.ts`（短名 typo 不翻转 + 显式前缀已归档正例双命令对称）、`test/core/flow-archive.test.ts`（health a/b/c + 边界两段式 + `vi.spyOn(readArchiveFile)` 零读/每版本一次断言 + 短名键假阴性最小断言）、`test/core/flow-manager.test.ts`（循环重构零回归 + off-set 可达）、`test/commands/config.test.ts`（降级实写 status.md + flow.json 零冗余零 save）。
- **迁移产物（经 CLI 生成，非手改）**：`.openfeel/flow-archive/{v1.0.0,v1.1.0…v1.1.7}.json` × 9 + `.openfeel/flow.json`（收缩）；`.openfeel/tmp/backup-stage-80/{flow.json,flow.json.bak,flow.json.sha256}`（备份，不入版本管理）。
- **方案层**：`.openfeel/plan/v1/stage-80/ops/{deps.yaml,op-001~004.md}`（随阶段纳入版本管理）。
- **报告**：`.openfeel/tmp/stage-80-{selftest,migration,gate}-report.md` + `.openfeel/tmp/stage-80-op-004-fix-report.md`（工作区）。

## 迁移成果（本仓自举，T4）

| 指标 | 迁移前（现场 2026-10-12 03:31） | 迁移后（现场） |
|------|-------------------------------|---------------|
| `flow.json` 字节数 | **425323 B** | **~59-62KB**（迁移时点 58978 B / 现场漂移 59225→61256 B；体积比 **0.1392× ≤ 1/5** ✅） |
| 阶段数 | **86** | **8**（仅 v1.2.0 阶段；`post non-v1.2.0 stages = 0`） |
| log 条数 | **1364** | **233** |
| `meta.archived_versions` | — | **9**（v1.0.0 ~ v1.1.7） |
| 文件孤儿 | **89** | **0** |
| 归档维度 health | — | **零 warn**（`归档索引与归档文件一致（9 个版本）`） |

- 九组归档文件大小：`v1.0.0.json` 89990 B / `v1.1.0` 20995 / `v1.1.1` 3558 / `v1.1.2` 164023 / `v1.1.3` 7001 / `v1.1.4` 24626 / `v1.1.5` 12564 / `v1.1.6` 22317 / `v1.1.7` 29219。
- 全量备份 + SHA256（源/备份双行，`-c` 两行 OK）→ 逐版本 `--dry-run` 判据门（9 组全过、零写盘核对）→ 顺序实跑 9 组（每组后 `flow health` 通过）→ 回滚路径预先成文。**用户确认门（Q9）已满足**。
- `flow health --fix` 迁移收尾：回写 stage-78/79 status.md「状态」`planned → done`（各 1 行）→ 零 warn（跨文件一致性 8/8 + 归档一致性 pass）。

## 审查记录

### 计划审查轮（plan_review，2026-10-12，结论 fail → 复审 pass）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-80-001 | 版本前缀判定对短名 dep 误接受 | closed | high（**blocking**） |
| REV-80-002 | 跨版本 deps 适配漏 health 读侧 `checkDanglingDeps` | closed | high（**blocking**） |
| REV-80-003 | `config set --sync-stages --stage` 已归档阶段迁移后硬失败 | closed | medium |
| REV-80-004 | 承接的 REV-79 8 条 pending 零交代 | closed | medium |
| REV-80-005 | deps.yaml `produces_core` 缺 9 个归档文件 + T2 落点二义 | closed | medium |
| REV-80-006 | T5「全命令绿」二义 | closed | low |
| REV-80-007 | 行号锚点漂移 + 基线数据过期 | closed | low |
| REV-80-008 | 验收「体积显著下降」无阈值/无复现命令 | closed | low |

> 计划审查复审（修订验收）新增：REV-80-009（T7 降级路由不可达，medium）/ 010（helper 内联判据正则第二信源，low）/ 011（锚点偏 2 行 + 措辞，low）→ 均 pending（009 经 op-002 落实、010 经 op-001 落实）。

### 方案审查轮（scheme_review，2026-10-12，结论 pass：0 阻塞 + 7 非阻塞）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-80-012 | 归档 health 项 section 常量未在实现步骤定稿 | pending | low |
| REV-80-013 | REV-80-010 附注「版本粒度放行」固化用例缺失 | pending | low |
| REV-80-014 | `flow health --fix` 未在 plan.md 登记（op 级新增写动作） | pending | low |
| REV-80-015 | off-set 运行 `appendLog` 只压内存不落盘 | pending | low |
| REV-80-016 | 行号锚点微漂移 | pending | low |
| REV-80-017 | 迁移命令 Windows 便携性 | pending | low |
| REV-80-018 | 基线数值快照口径不一 | pending | low |

### 代码审查轮（code_review，2026-10-12，结论 fail → op-004 修复 → 复审 pass）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-80-019 | T2-b「归档残留」对默认版本新建阶段误报 | **closed**（op-004 修复 + 复审隔离复现四态全中） | high（**blocking**） |
| REV-80-020 | REV-80-011/014/016 仅部分落实（计划文档层） | **pending**（移交 planner） | low |
| REV-80-021 | 备份 `flow.json.sha256` 现时 `-c` 源行 FAILED（时点快照语义） | resolved | low |
| REV-80-022 | 迁移报告数值为迁移时点，现场已漂移 | resolved | low |
| REV-80-023 | 提交卫生未执行 + `archive-health.ts` untracked + 状态陈旧 | **pending**（移交主会话） | low |

### 方案审查轮（op-004 修复方案审查，结论 pass：0 阻塞 + 5 非阻塞）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-80-024 | `plan.md` 契约修订落点错引「§四.4」 | resolved | medium |
| REV-80-025 | 命令层测试实写快照缺 `writeArchiveFile` import 登记 | resolved | low |
| REV-80-026 | 「常规路径零读 / 每版本至多读一次」无可证伪用例 | resolved | low |
| REV-80-027 | deps 判定（版本粒度）vs health b 项（键粒度）口径分层未文档化 | resolved | low |
| REV-80-028 | `flow.json` 短名键情形未覆盖 | resolved | low |

### 代码审查复审（op-004 修复复审，结论 pass）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-80-029 | REV-80-028「由 a 项兜底」不成立 + 代码注释登记与报告陈述不符 | **pending**（报告层措辞归档轮已修正；代码注释登记移交 executor；转 stage-85） | low |

> 结论：**passed（全 29 条：closed 9 / resolved 7 / pending 13，0 blocking 遗留）**。REV-80-001/002（计划轮 blocking）+ REV-80-019（代码轮 blocking）均已闭合。归档官处置：**029** 报告层措辞修正（`stage-80-op-004-fix-report.md` 删「由 a 项兜底」→「属未覆盖边界」）+ 代码注释部分移交 executor；**020** 移交 planner（plan.md 文档层）；**023** 移交主会话（提交卫生/状态对账）；均可随 v1.2.0 收口（stage-85）处置。

## 缺陷记录

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| — | 无新增缺陷（测试验收通过、0 Bug） | — | — |

## 门禁

- `npm test` **68 文件 / 1408 用例 0 skipped / 0 failed**（stage-79 基线 68/1372 → op-001+002 +24 → op-003 +3 → op-004 +9）
- `npx tsc --noEmit` → exit 0
- `node bin/openfeel.js lint i18n` → **829**（基线 826 → +3；双处显式登记）
- `node bin/openfeel.js lint kb` → **0**（449 引用）
- `npm run build` ×2 → 幂等（`IDEMPOTENT=YES`，dist 全量 sha256 `3dcd2c82…` 两次恒等）
- **static import 面**：`rg "from '.*flow-archive/" src/ --glob '!src/core/flow-archive/*'` 命中**仅 `src/commands/flow.ts`**；`flow-manager.ts` 对 `flow-archive` **零命中**；`isArchivedVersionOf` 定义 1 + 调用 6；`archiveHealthItems` 定义/消费各 1
- **活跃集收缩断言**：`flow status --json` `counts.total = 8`；`flow overview` 无被归档版本阶段行；`plan stage list` 仍列归档目录（文件系统视图不变）；`stage status v1.0.0-stage-01` exit 0；v1.2.0 阶段 phase/status **0 diff**
- 本仓迁移后 `flow.json` sha1 变化属**设计预期**（迁移产物）；HEAD 恒 `fdfebc9`（零 commit）

## 知识沉淀

| 分类 | 标题 | 动作 |
|------|------|------|
| architecture | 归档消费面口径分层架构：deps 判定（版本粒度）vs health 残留（键粒度）+ 单一口径 4 调用点 | 新增 |
| patterns | 版本分片存量迁移程序：全量备份（SHA256 双行）+ 逐版本判据门（dry-run 先行）+ 顺序实跑 + 回滚路径预先成文 | 新增 |
| patterns | `syncConfigFieldToStages` 循环重构：遍历集「只增不减」去重（`onlyStages` ∪ `Object.keys(stages)`）使 off-set 目标可达 | 新增 |
| troubleshooting | 长寿命索引与「版本前缀判据」陷阱：短名 stageId 经 `parseStageId` 归一默认版本 `v1.0.0` → 误接受/误报 | 新增 |

> 去重（`node bin/openfeel.js knowledge dedup`）：architecture 候选最高 **1.0%**、patterns 候选（迁移程序）最高 **5.6%**、（循环重构）最高 **1.1%**、troubleshooting 候选最高 **2.4%**，均 ≪ 80% → 4 条均判**新增**。kb 分类计数：architecture 37→**38**、patterns 166→**168**、troubleshooting 58→**59**。

## manual 更新

- **`core/flow-archive.md`**：模块分层表增 `archive-health.ts` 行；新增 `archiveHealthItems` API 节；新增**消费点适配**节（deps 判定 4 调用点 / health a·b·c / config 降级 / 恢复路径文案 / 本仓迁移程序与成果）；变更历史增 stage-80 行
- **`core/flow-manager.md`**：`checkDanglingDeps` 增**读侧同口径**说明（并入 `isArchivedVersionOf`）；`syncConfigFieldToStages` 增**循环重构**说明（遍历集只增不减去重 + 注册守卫）
- **`core/config.md`**：`config set --sync-stages` 增**已归档目标降级**说明
- **`core/plan-path.md`**：核心 API 表增 `isArchivedVersionOf`；变更历史增 stage-80 行
- **`cli/commands.md`**：`flow health` 增归档一致性项（a/b/c）+ 悬空依赖读侧同口径；`plan stage add --deps` / `flow stage set --deps` 增「已归档版本视为已满足」
- **`index.md`**：模块树 flow-archive 条目更新（含 `archive-health.ts` + 消费点适配）；维护规则表 flow-archive / plan-path / flow-manager / config / 命令注册-行更新

## 遗留与下游

- ★ **flow 状态推进**：`v1.2.0-stage-80` → `done`（**由主会话** Feel 经 `openfeel flow advance --stage v1.2.0-stage-80 --to done` 执行；archiver 不直写 flow.json）。`archive_stage` 由该 advance 补记。
- **REV 遗留（13 条 pending 非阻塞，转 v1.2.0 收口 / 移交）**：009~018（计划·方案轮）；020（移交 planner，plan.md 文档层）；023（移交主会话，提交卫生/状态对账）；029（报告层措辞已修正 + 代码注释登记移交 executor）。**0 blocking 遗留**。
- **下游契约**：`isArchivedVersionOf`（版本粒度）+ `archiveHealthItems`（键粒度）登记于 `ops/deps.yaml` `downstream_contracts`（含 `note_granularity` 口径分层「禁互相套用」）；交 stage-81（在收缩后活跃集上开发）/ stage-84（Agent/skill 契约）/ stage-85（文档与版本收口）。
- **兼容承诺**：迁移后既有命令零报错；`flow archive` 归档文件缺失/损坏读侧宽容；阶段枚举视图随活跃集收缩属设计预期（非回归，文档明示）。
- **未 commit / 未 push / 未 publish / 未改版本**（版本保持 1.1.7，版本收口归 stage-85）。

> 归档方式：手工生成摘要（沿用先例，未运行 `openfeel archive <stage>` CLI 以避免其副作用）。
