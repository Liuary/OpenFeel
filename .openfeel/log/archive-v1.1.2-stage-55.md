# v1.1.2-stage-55 归档 — 清掉项目级约束与 Agent（发布前最后阶段）

- **归档 Agent**：openfeel-archiver（deepseek-flash）
- **归档时间**：2026-10-01（本地）
- **阶段**：`v1.1.2-stage-55`（**5 op**：op-001 F2 / op-002 F1 / op-003 F3+F4 / op-004 F5+F6+F7 / op-005 REV-003 补齐；归档时 phase = `archiving`，目标 phase = `done`，由 Feel 执行 CLI）
- **实现 commit**：`9e0a978`(op-001 F2) / `a646573`(op-002 F1) / `ebac4ea`(op-003 F3+F4) / `0ad0b8e`(op-004 F5+F6+F7) / `17ff5be`(op-005 REV-003)
- **来源**：用户指令「先收尾（stage-54）→ **清掉项目级别的约束和 Agent** → 发布」→ 本阶段 = 清项目级资产；**继续 v1.1.2，不改版本号**；`npm publish` 不在本阶段（用户决定）
- **前置**：`v1.1.2-stage-54`（hard）；**后继**：`npm publish`（用户决定）
- **⚠️ 生效条件**：本阶段刷新了**真实全局目录**（`~/.config/opencode/`），**须重启 opencode 会话**方使新部署生效（本会话 `available_skills` 仍为刷新前快照——测试官实测 `openfeel-cli-usage` 未出现在会话 skill 列表但已落全局目录）

---

## 一、归档产物清单

| # | 文件 | 操作 | 说明 |
|---|------|------|------|
| 1 | `.openfeel/log/archive-v1.1.2-stage-55.md` | 新建 | **本归档摘要**（手工生成；未运行 `openfeel archive`，理由见偏差 1） |
| 2 | `.openfeel/code_review/v1.1.2-stage-55.md` | 新建 | 阶段公共审查摘要（结论 `passed`；三段审查 + REV-002/003 + 关键裁定/发现 + 编号不一致留痕 + 门禁 + 缺陷 + 过程偏差） |
| 3 | `.openfeel/code_review/index.md` | 更新 | 统计 `passed 24` → **`passed 25`**；系列总结追加 stage-55 段；v1.1.2 表追加 stage-55 行 |
| 4 | `.openfeel/code_review/log.md` | 更新 | 追加 stage-55 审查摘要条目 |
| 5 | `.openfeel/bugs/index.md` | 更新 | 追加 **stage-55 收口注**：**本轮无新增缺陷**；`templates/BUG-005`（low）维持 `open`；统计维持 **15 条（open 1 / closed 14）** |
| 6 | `.openfeel/bugs/cli.md` / `.openfeel/bugs/templates.md` | 核对 | 状态如实（cli 全部 closed；templates/BUG-005 open）——本轮未改 |
| 7 | `.openfeel/kb/architecture.md` | 更新（**+1 新增**） | 「仓库自身不再保留项目级部署资产：框架资产全局化后的项目级精简（supersede N1）」 |
| 8 | `.openfeel/kb/patterns.md` | 更新（**+2 新增**） | 「真实全局目录操作的安全程序：全量备份 + 判据门 + 回滚」；「supersede 历史决策的追加式记录：保留原行 + 追加注记块」 |
| 9 | `.openfeel/kb/troubleshooting.md` | 更新（**+2 新增**） | 「自举实例移除须连带删除 build 生成步骤（否则 `npm run build` 复活）」；「模板断言的保护边界：build 注入常量 vs 源文件直读（改源忘 build 窗口）」 |
| 10 | `.openfeel/kb/index.md` | 更新 | 快速概览「最近更新」刷新为 stage-55（stage-54 转「上一里程碑」）；分类计数 architecture 28 → **29**、patterns 123 → **125**、troubleshooting 41 → **43**（合计 198 → **203**）；三分类摘要表追加/精化对应行；「最近更新」表追加 stage-55 行 |
| 11 | `.openfeel/manual/agents/feel.md` | 更新（2 处） | 权威源改为 `templates-data/opencode/agents/**` + 全局部署副本 `~/.config/opencode/agents/*.md`；删除「仓库 `.opencode/agents/` 副本」表述（stage-55 起不再保留） |
| 12 | `.openfeel/manual/cli/commands.md` | 更新（1 处） | `openfeel-cli-usage` skill 落点改为「`setup` 部署至全局」；删除「自举 `.opencode/skills/**`」（已随步骤 8 移除） |
| 13 | `.openfeel/manual/core/build.md` | 更新（+1 行） | 变更历史表追加 **stage-55** 行（移除步骤 8 自举重生成 + `.gitattributes` 去 `.opencode/**` 行） |
| 14 | `.openfeel/manual/index.md` | 更新（1 行） | 维护规则 build.js 行补「自举步骤 8 已于 stage-55 移除」 |
| 15 | `.openfeel/log/2026/10/01/2026-10-01-Liuary-046.md` | 新建 | 公共日志条目（`stage_archived`；**取 046 号**，取号前扫描 2026-10-01 已用 001~045） |
| 16 | `.openfeel/log/2026/10/01/day_index.md` | 更新 | 追加 stage-55 归档条目（046） |
| 17 | `.openfeel/log/index.md` | 更新 | `## 2026-10` 节追加 stage-55 归档条目 |
| 18 | `.openfeel/log/log.md` | 更新 | 首表追加 stage-55 归档摘要行（046），保持约 30 条 |
| 19 | `.openfeel/plan/index.md` | 更新 | v1.1.2 系列说明/阶段对照表：stage-55 改**已归档**（**十五阶段全部闭环**） |
| 20 | `.openfeel/plan/plan_log.md` | 更新 | 追加 stage-55 归档条目 |
| 21 | `.openfeel/plan/v1/stage-55/status.md` | 更新 | 漂移（`review_passed`）→ **`done`**（以 `flow.json` 为准，留痕 + 全时间线） |
| 22 | `.openfeel/roadmap/v1.1.2.md` | 更新 | 头部状态、M11 **done**、发布行、收官摘要刷新；阶段完成改 **15/15**（41~55）；修订记录追加 |
| 23 | `.openfeel/dev/current.md` | 更新 | 头部 + 统计刷新（59/985、kb **203**、`lint i18n` 726）+ 新增 stage-55 记录（≤5 条，最旧 stage-50 轮换入 `current_archive/`） |
| 24 | `.openfeel/dev/current_archive/current-2026-10-01-002.md` | 新建 | 归档 current.md 超 5 条时移除的 stage-50 记录 |
| 25 | `CHANGELOG.md` | 更新（`[1.1.2]` 追加 `[stage-55]` 块） | Removed（项目级资产 6 项）+ Changed（全局化收口）+ Fixed（REV-003 断言补齐） |
| 26 | `.openfeel/users/Liuary/dev_last.md` + `dev_last/*.md` | 更新 | 索引摘要刷新（stage-55）+ 5 主题文件追加记录 |
| 27 | `.openfeel/users/Liuary/log/archive-v1.1.2-stage-55-report-2026-10-01.md` | 新建 | 完整归档报告（私域） |

> **未触碰**：`flow.json`（**不直写**）；`src/**`（归档官不改源码）；`.openfeel/plan/v1/stage-55/ops/**`（只读）。

---

## 二、交付要点（F1~F7）

| 项 | 交付 |
|:--:|------|
| **F2** | 「模块手册」节迁入全局约束模板 `templates-data/agents-md/{zh-CN,en}.md`（zh「### 模块手册」/ en「### Module Manuals」，同位置同要素）+ `npm run build` 传播（生成段幂等） |
| **F1** | 刷新全局部署（**唯一触碰真实全局目录的操作**）：`node bin/openfeel.js setup` 纯全局幂等——skills **16 → 17**（补 `openfeel-cli-usage`）、全局 `AGENTS.md` **293 → 509 行**（新增模块手册节 + 权限模型节齐备）、agents 9 刷至最新、jsonc 保留 `default_agent` + `$schema` + 2 处模型覆盖；备份 `%TEMP%\opencode\stage55-global-backup`（3689 文件 / 52.5 MB + SHA256 清单）+ setup 写前备份 `~/.openfeel/backup/20261001T170145270/`；仓库 `git status` 无变化 |
| **F3** | 删除 **6 项项目级资产**（根 `AGENTS.md`、根 `opencode.jsonc`、`.opencode/{agents(9),skills(17),ADAPTER.md}`），仅用 `git rm`（未误伤未跟踪/运行时文件）；`.opencode/` 仅留运行时 4 项（`node_modules`/`package.json`/`package-lock.json`/`.gitignore`） |
| **F4** | 删除 `build.js` 自举步骤 8（`regenerateOpencodeInstance` 函数 + 调用 + 分区注释 + 仅其使用的 `insertGeneratedMark` + 失效 `mkdirSync` import）（**防复活**）；测试迁移（`opencode-instance.test.ts` 整文件删除：4 删 / 3 迁模板源 / 3 整体迁至新文件 `release-metadata.test.ts` + 防回归断言）；`.gitattributes` 去 `.opencode/**` 行；根 `.gitignore` 确认不改 |
| **F5/F6** | 引用同步（`docs/GETTING_STARTED.md` 死链处置、`manual/core/build.md` 步骤 8 标注、`kb/{index,patterns,troubleshooting}` 历史反引号路径去引号 → `lint kb` 12 处过期 → 0）；supersede `kb/architecture.md:398` N1（**追加式**：原行保留 + L400 注记）+ `dev/decisions.md` ADR-002 + `kb/index.md` 摘要行 |
| **F7** | 静态验证（5 项不存在 + build 后不复活 + 全局齐备复跑）+ 五门禁 + **新会话验证指引（6 步）** |

---

## 三、知识沉淀（**5 条新增**）

| # | 分类 | 标题 | 依据 | 去重 |
|---|------|------|------|------|
| 1 | architecture | 仓库自身不再保留项目级部署资产：框架资产全局化后的项目级精简（supersede N1） | stage-55 全阶段 / F1+F3+F4 | 最高 8.3% → 新增 |
| 2 | patterns | 真实全局目录操作的安全程序：全量备份 + 判据门 + 回滚 | op-002（F1）/ 门 B | 最高 2.7% → 新增 |
| 3 | patterns | supersede 历史决策的追加式记录：保留原行 + 追加注记块 | op-004（F6） | 最高 3.3% → 新增 |
| 4 | troubleshooting | 自举实例移除须连带删除 build 生成步骤（否则 `npm run build` 复活） | op-003（F4）/ 门 D | 最高 6.3% → 新增 |
| 5 | troubleshooting | 模板断言的保护边界：build 注入常量 vs 源文件直读（「改源忘 build」窗口） | op-005（REV-003） | 最高 2.4% → 新增 |

> **去重口径**：`findSimilarEntries` 直接调用（`dist/utils/kb-dedup.js`，CRLF 已修）；5 条候选最高相似度 **8.3%** ≪ 80% → **全判新增**。kb 计数：architecture 28→29、patterns 123→125、troubleshooting 41→43，合计 198→**203**。

---

## 四、Bug 收口

- **本轮无新增缺陷**（测试官端到端 + 全局刷新核验 + 迁移完整性 + 环境零污染全通过，零阻塞）。
- **`templates/BUG-005`（low）维持 `open`**——本阶段未触及部署型 skill 模板的 `flow phases --json` 输出说明，且删除动作不涉及该同步面；如实登记备查。
- **统计**：公共域 **15 条（open 1 / closed 14）**（与 `bugs/index.md` / frontmatter 一致）。

---

## 五、需 Feel 执行的命令（flow.json 不直写）

```bash
# 将 stage-55 标记为完成（唯一状态变更，归档官不直写 flow.json）
node bin/openfeel.js flow advance --stage v1.1.2-stage-55 --to done
```

> 归档完成后阶段 phase 必须为 `done`（不得使用 `completed` 等非标准值）；`archive_stage` 审计条目由该命令补记。完成后 **v1.1.2 十五阶段（41~55）全部 `done`**，`npm publish` 前置闭合。

---

## 六、用户待执行动作（重要）

1. **重启 opencode 会话**（**必须**）：本阶段刷新了真实全局目录，配置变更仅重启后生效。测试官本会话实测 `available_skills` **不含** `openfeel-cli-usage`（该 skill 已落全局目录），证明当前会话的 skill 注册为**刷新前快照**。重启后按 6 步验证：① 重启；② skill 可加载（`openfeel-workspace` / `openfeel-cli-usage`）；③ 9 个 agent 可用（`task` 冒烟各 1 次）；④ 全局约束生效（会话系统提示含「OpenFeel 全局行为约束」+ 新增「模块手册」节）；⑤ `feel` 为默认 agent；⑥ 失败则按回滚（`git checkout <sha> -- AGENTS.md opencode.jsonc .opencode/` + 全局备份整目录恢复）。
2. **`npm publish`**：发布时机由用户决定（本阶段不执行）。就绪状态：15 阶段全闭环、门禁全绿（59 文件 / 985 用例、`lint i18n` 726 键、`lint kb` 0 过期）、`npm pack` 263 文件；`CHANGELOG` `[1.1.2]` 发布日期保持 `2026-09-29`（用户可决定是否刷新）。

---

## 七、偏差与登记

1. **未运行 `openfeel archive`**（沿用先例）：CLI `archive` 具三副作用（覆盖手工摘要 / `appendLog` + `save()` 直写 `flow.json`〔越权〕/ 对 closed REV 绕过去重追加低质条目）→ 改为**手工生成归档摘要**，`archive_stage` 由 Feel 的 `flow advance --to done` 补记。
2. **`status.md` 与 `flow.json` 漂移**：`stage-55/status.md` 测试期与 `flow.json` 漂移（`flow health` 报 30/31，Feel 已 `flow health --fix` 同步）；归档官刷新为 `done`（**以 `flow.json` 为准**）并留痕。
3. **REV 编号不一致（留痕）**：`REV-v1.1.2-stage-55.md:10` 结论摘要称「REV-003 B9 场景残留」，而独立 REV-003 小节与 exec_review 终局结论以「reviewer 纪律节模板源断言补齐」为准 → 按后者实施并登记。
4. **REV-003 保护边界（登记）**：`loadOpencodeAgentTemplate` 读 build 注入常量（非直读模板源）→ 断言在「正常工作流（改源→build→test/CI）」下必拦，缺口仅「改源忘 build」本地窗口（有 CI 兜底）；追加建议「源文件直读断言」为 low、不单独立项。
5. **全局刷新不可在隔离 HOME 下验证**：op-002 为本流水线**唯一操作真实全局目录**的 op → 全量备份先行 + 判据门 + 回滚路径，测试官仅只读核对备份与判据（未实际回滚）。
6. **归档官未重复 `npm test`/`build`**：门禁数字采信执行/测试官独立实测（一致：59 文件 / 985 用例、0 skipped、`tsc` 0、build 幂等且不复活、`lint i18n` 726 键、`lint kb` 0 过期）。
7. **`CHANGELOG` `[1.1.2]` 节发布日期保持 `2026-09-29`**（沿用先例）；发布时机待用户决定是否刷新。
8. **`flow health` 文件孤儿 62 仅报告**（既定裁定 A6，本次不清理）；**本条目取 046 号**（取号前扫描 2026-10-01 已用 001~045）。
9. **归档官边界**：本阶段源码/模板改动均由 executor 完成；归档官仅改 `CHANGELOG.md` / `.openfeel/**` / 私域日志，**未改 `src/**`**，符合「归档和沉淀知识、不修改源码」边界。
