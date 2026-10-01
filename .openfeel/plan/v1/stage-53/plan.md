# v1.1.2-stage-53 计划 — current.md / dev_last.md 职能与格式重构

- **阶段**：`v1.1.2-stage-53`
- **依赖**：`hard: v1.1.2-stage-52`（stage-52 先跑；`flow.json` 当前 deps 为空，**须由 Feel 执行** `node bin/openfeel.js flow stage set v1.1.2-stage-53 --deps v1.1.2-stage-52` 落点）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-01
- **范围约束**：**不改业务源码**（允许改：`templates-data/**` 模板权威源、`src/core/templates.ts` 的 init 文案模板、`src/core/workspace/structure.ts` 的目录常量、`manual/**`、仓库根文档、本仓 `.openfeel/**` 存量数据）；**不创建 op 文件**；**不修改 `flow.json`**。
- **KB 检索**：已加载 `openfeel-check-kb`。相关既有条目：`kb/patterns.md`「模板源收敛与 build 双注入」「暴露内部模块为 CLI 子命令的判据」「未来写入统一 + 历史共存」；`kb/architecture.md`「纠正侧能力对称原则」；`kb/troubleshooting.md`「临时项目 init 前须先建目标目录」。知识库中**暂无** current/dev_last 格式相关条目（本阶段将新增沉淀）。

---

## 一、背景与问题

### 1.1 问题样本（反面参照）

- 用户指定问题样本：`Pantheogen/.openfeel/dev/current.md`（**123 行**）——含 `## 团队成员进度` + `### @agent` 逐条流水、数百行；**仅作反面对照，不作为模板来源**。
- 本仓同类问题：`.openfeel/dev/current.md`（**82 行**）——大量版本里程碑表、逐阶段关键产出明细、统计明细；信息价值高但**粒度错位**（属 roadmap/plan 的内容堆在 current）。

### 1.2 职能重合与多会话风险

- `current.md` 与 `dev_last.md` 职能原先部分重合（两者都写「正在做什么」）。
- `dev_last.md` 现为**单会话覆盖写**（`agents-md/zh-CN.md:316`「对话末尾覆盖写入」）→ **本地开多会话时后写者覆盖先写者**，存在信息丢失风险。

### 1.3 用户意图（逐条落实）

| # | 意图 | 落地位置 |
|---|------|----------|
| U1 | current 是**用户级别**的（非给 agent 用）：仅个人提交时更新、只描述整体信息、不含 agent 细节 / 不含 @成员段 | D2 |
| U2 | current 每次提交**自动归档旧记录**，仅按时间保留**近期 5 份**；归档到 `.openfeel/dev/current_archive/` | D2、D6、D7 |
| U3 | `@agent` 式细节 → 改放 `dev_last` 的详情文件 | D3、D4 |
| U4 | dev_last 改**索引文件 + 同名目录**；超期文件**不归档**；主题 ≤5、索引内每主题 ≤5 条 / 每条 ≤100 字；主题文件每主题 ≤10 条 / 每条 ≤300 字；超量转 `tmp/` 并在文件内记地址 | D3、D4 |
| U5 | dev_last 允许**公共区域**（跨会话传信息），但**不允许描述过多细节**——只列**交接文档位置 + 核心摘要** | D3、D4 |
| U6 | 两条设计目的写入整体约束：① 保存核心信息便于恢复；② 避免无关信息污染上下文 | D1 |

---

## 二、设计目的（写入整体约束的两条）

> 以下两条为**总纲**，current / dev_last 的一切规则均由它们推导。

1. **保存核心信息便于恢复**：任何时刻打开索引（`current.md` / `dev_last.md`）即可在**有限上下文**内恢复到可继续工作的程度。
2. **避免无关信息污染上下文**：索引层只放「结论与位置」，**细节下沉**到主题文件 / `tmp/` 文档；索引不承载过程性明细。

**推导出的分层原则**（新规则的总口径）：

| 层 | 载体 | 粒度上限 | 读者 |
|----|------|----------|------|
| 索引层 | `dev/current.md`、`users/{username}/dev_last.md` | 条数硬限 + 字数硬限 | 用户 / 会话启动 |
| 主题层 | `users/{username}/dev_last/{english-name}.md` | ≤10 条、≤300 字/条 | 按需读取 |
| 详情层 | `users/{username}/tmp/` 文档 | 不限（仅记**地址**） | 显式指定时读取 |

---

## 三、职能划分（裁定基线）

| 文件 | 职能 | 更新时机 | 关键约束 |
|------|------|----------|----------|
| `.openfeel/dev/current.md` | 记录**跨用户操作**与**整体信息** | **仅个人提交时更新** | 不含 agent 细节、不含 @成员段；≤5 条记录；旧记录自动归档 |
| `.openfeel/dev/current_archive/` | 归档被轮换出的 current 记录 | 随 current 更新 | 公共域 → **纳入版本管理**（`.gitignore` 仅忽略 `users/`、`tmp/`） |
| `.openfeel/users/{username}/dev_last.md` | **本地状态恢复与操作记录**（索引） | 会话末尾**更新**（非整文件覆盖） | 主题 ≤5；每主题摘要 ≤5 条、≤100 字/条；含「公共交接区」 |
| `.openfeel/users/{username}/dev_last/{english-name}.md` | 主题详情 | 随索引同步 | ≤10 条、≤300 字/条；超量 → `tmp/` 记地址 |

---

## 四、工作项（D 编号）

### D1 — 整体约束：两条目的 + 职能定位

- **目标**：在**全局框架约束层**（权威源）写入「保存核心信息便于恢复 / 避免无关信息污染上下文」两条目的与 current/dev_last 职能定位。
- **改动点**：

| 文件:行号 | 现状 | 改后 |
|-----------|------|------|
| `src/core/templates-data/agents-md/zh-CN.md:158` | `## .openfeel 工作区结构（约束）` | 追加引言段：两条设计目的 + 索引层/主题层/详情层分层原则（§二 全文带入） |
| `src/core/templates-data/agents-md/zh-CN.md:164-170` | `### 设计原则`（公共域/私域两句） | 在「公共域/私域」前插入「**分层原则**」子段（见 §二表） |
| `src/core/templates-data/agents-md/en.md:158`、`:164-172` | 同上（英文） | 同上，**双语逐段对齐** |
| 仓库根 `AGENTS.md`（项目级） | 实测 `rg "current\.md\|dev_last" AGENTS.md` **0 命中**（170 行，不含「工作区结构」节；该节只存在于全局约束模板） | **不改**（**已由 Feel 裁定**，§六 A7）：工作区结构节属全局约束层（`templates-data/agents-md/{zh-CN,en}.md` → `openfeel setup` → `~/.config/opencode/AGENTS.md`），项目级文件镜像会导致**双权威源漂移**。**注意**：需求要点 1 原文曾列「仓库根 `AGENTS.md`（项目级，同步对齐）」——与本结论的**指令层冲突**已由 Feel 显式裁定并留痕（见 `REV-v1.1.2-stage-53.md` REV-001）。**回退条件**：若后续根 `AGENTS.md` 新增 current/dev_last 类规则节，须一并同步 |

- **影响文件**：`agents-md/{zh-CN,en}.md`（权威源）；`src/core/template-loader.ts`（AUTO-GENERATED 段，由 build 传播）；`~/.config/opencode/AGENTS.md`（部署产物，须用户运行 `openfeel setup`，**本阶段不自动执行**）。
- **验收要点**：zh/en 两版均含两条目的与三层表；build 后 `template-loader.ts` 的 `AGENTS_MD_TEMPLATES` 段同步；`rg -c "避免无关信息污染上下文"` 命中 zh 源；`rg -c "Avoid polluting the context"` 命中 en 源。

### D2 — current.md 规则改写 + 新模板

- **目标**：把「成员进度范式」改为「个人提交的整体信息 + 自动归档 + 留近期 5 份」。
- **改动点**：

| 文件:行号 | 现状 | 改后 |
|-----------|------|------|
| `agents-md/zh-CN.md:206-208` | `> .openfeel/dev/current.md` + 「记录当前正在进行的工作，按 `@{username} 描述正在进行的工作` 范式维护各成员进度，顶部维护总进度状态。」 | 替换为 §五.1 规则块（团队文件 / 仅个人提交时更新 / 整体信息 / 无 agent 细节 / 无 @成员段 / 旧记录自动归档至 `current_archive/` / 仅留近期 5 条）+ **内联新模板骨架** |
| `agents-md/zh-CN.md:210-212` | `> .openfeel/dev/note/dev_note.md` | 位置前**插入** `> .openfeel/dev/current_archive/` 说明段（归档目录职责 + 命名约定 + 纳入版本管理） |
| `agents-md/en.md:207-214` | 对应英文（`Development Directory` 节） | 同上，双语对齐 |
| `agents-md/zh-CN.md:249`（en `:250`） | 「自动计划化…主动在 `plan.md` 中创建对应条目或更新 `current.md`」 | 改为「…更新 `plan.md`；**仅当属跨用户整体进度时才更新 `current.md`**」 |
| `src/core/templates.ts:17-24` | `CURRENT_TEMPLATE_ZH` = `# 当前工作进度` + `## 团队成员进度` + 「暂无活跃成员。」 | 替换为 §五.1 新骨架（zh） |
| `src/core/templates.ts:27-34` | `CURRENT_TEMPLATE_EN` | 同骨架英文版 |
| `src/core/init.ts:220-224` | `writeTemplateIfMissing(currentPath, getCurrentTemplate(lang))` | **不改逻辑**（仍生成 `current.md`）；**新增** `current_archive/` 目录创建（归 D6） |

- **影响文件**：`templates.ts`、`agents-md/{zh-CN,en}.md`、`init.ts`（D6）。
- **验收要点**：新 init 产出的 `current.md` **不含**「团队成员进度」「@{username}」；含「近期提交记录（≤5）」「`current_archive/`」字样；`rg "@{username} 描述正在进行的工作"` **零残留**。

### D3 — dev_last.md 规则改写 + 索引/主题模板

- **目标**：dev_last 由「单会话覆盖写的 7 节文件」改为「**索引 + 同名目录（主题文件）**」。
- **改动点**：

| 文件:行号 | 现状 | 改后 |
|-----------|------|------|
| `agents-md/zh-CN.md:314-316` | 「记录上一次操作结束时的简要状态，**对话末尾覆盖写入**…」 | 替换为 §五.2 规则块（索引文件 + `dev_last/` 目录 + 活跃主题 ≤5 + 各级字数上限 + 超量转 `tmp/` 记地址 + 超期**不归档** + **主题数 >5 时的合并/就地收敛（R4）** + 公共交接区）+ 索引骨架（含「已收敛主题」小节） |
| `agents-md/zh-CN.md:318-356` | 旧 7 节模板 + 「写入说明」 | 替换为：**索引骨架**（含 R1~R6 规则表〔**R6 = A9 加锁协议**〕+ 「已收敛主题」小节 + **英文文件名**约定）+ **主题文件骨架** + 写入说明（Read → 合并 → 写回索引；主题文件**按英文文件名**定位/新建；**新增主题致 >5 时按 R4 合并或收敛，不移入归档目录**；**读写均在 `withFileLock` 临界区内**） |
| `agents-md/en.md:313-357` | 对应英文 | 同上，双语对齐 |

- **一致性约束**：`agents-md` 中的骨架与 §五.2 必须**逐字一致**（后续 schemer/executor 以此为准，避免两处漂移）。
- **影响文件**：`agents-md/{zh-CN,en}.md`。
- **验收要点**：`rg "对话末尾覆盖写入"` 零残留（zh）；`rg "overwrite at the end of the conversation"` 零残留（en）；新模板含「主题索引（最多 5 个）」「已收敛主题」「公共交接区」；**主题 >5 的处置规则（R4）可复现**——构造 6 主题 fixture：① 有可合并同类 → 合并后活跃主题 = 5；② 无可合并 → 最旧已完结主题移入「已收敛主题」（一行 ≤100 字 + 路径），其文件**仍在原路径**（未被移动/归档）；③ 全流程**不产生任何归档目录**（`dev_last/archive/` 不存在）。

### D4 — feel.md 记忆加载 / 会话结束写入改写

- **目标**：Feel 的启动读取与会话写入适配新格式（含旧格式兼容与超量转 `tmp/`）。
- **改动点**：

| 文件:行号 | 现状 | 改后 |
|-----------|------|------|
| `opencode/agents/zh-CN/feel.md:323` | 「**项目记忆**：读取 `…/dev_last.md`，提取「上次操作状态」「关键决策」「待续事项」。」 | 「读取 `…/dev_last.md`（**索引**）：先取「用户偏好」「主题索引」「公共交接区」；**按需**再读 `dev_last/{english-name}.md` 详情；旧格式（无主题索引节）→ 触发惰性迁移（§八 R-2）」 |
| `feel.md:333` | 「**更新 dev_last.md**：将合并后的偏好写入「用户偏好」节。」 | 「将合并后的偏好写入索引「用户偏好」节（不整文件覆盖）」 |
| `feel.md:371-375`（决策追加） | 决策追加到「决策历史」节 | 「追加到 **`dev_last/decisions.md`** 主题文件；索引仅在主题摘要变化时更新对应 ≤100 字摘要」 |
| `feel.md:389-395`（会话结束写入） | 4 步：填偏好 / 追加决策 / 更新快照 / 更新上次操作与待续 | 重写为 5 步：① 更新索引「用户偏好」；② 更新/新建主题文件（**单条 >300 字或 >10 条时按 R2 转 `tmp/` 并记地址**）；③ 刷新索引「主题索引」摘要（≤5 活跃主题 × ≤5 条 × ≤100 字）；**若新增主题致 >5 → 按 R4 先合并同类、无可合并则把最旧已完结主题移入「已收敛主题」（不归档、不移动文件）**；④ 更新「公共交接区」（仅文档位置 + 核心摘要）；⑤ （若属跨用户整体进度）按 D2 规则更新 `dev/current.md` 并轮换归档 |
| `feel.md:397-405`（阶段结束检查） | `- [ ] 状态已落档（flow.json / status.md / dev_last.md）？` | 保留，补括号说明「dev_last 指索引 + 主题文件」 |
| `opencode/agents/en/feel.md:317-403` | 对应英文各节 | 同上，双语对齐 |

- **影响文件**：`opencode/agents/{zh-CN,en}/feel.md`。
- **验收要点**：`rg "dev_last/"` 命中 zh/en feel.md；`rg "公共交接区"` 命中；**须保留**既有断言字符串（见 §十 T-2）。

### D5 — 相关 skill 同步

- **改动点**：

| 文件:行号 | 现状 | 改后 |
|-----------|------|------|
| `opencode/skills/openfeel-workspace/SKILL.md:24` | 个人阶段目录清单（`log/`、`note/`、`code_review/`、`bugs/`、`tmp/`） | **新增** `dev_last/`（主题记录目录） |
| `…/openfeel-workspace/SKILL.md:27` | `.openfeel/users/{username}/dev_last.md` | 补「（索引；同名目录 `dev_last/` 存主题文件）」；`:21` 公共空文件清单**不变** |
| `…/openfeel-workspace/SKILL.md:18` | 公共目录清单（`dev/note/`…） | **新增** `.openfeel/dev/current_archive/` |
| `…/openfeel-recover/SKILL.md:17` | 「读取 `…/dev_last.md` 恢复上次操作状态与待续事项」 | 改为「读取索引（偏好 / 主题索引 / 公共交接区）→ 按需读主题文件」 |
| `…/openfeel-sync-status/SKILL.md:12,18,31,54` | 全部基于 `current.md` 的 `@{username}` 行提取 | **改口径（A6 已裁定改写，保留 skill）**：成员进度改由**各用户 `dev_last.md` 索引的「主题索引」+ `flow.json` 阶段状态**聚合；「遗漏登记」改为对比 `flow.json` active stages vs 用户 dev_last 索引；`:54` 示例文案同步；**不淘汰**（skill 数维持 17） |
| `AGENTS.md`（仓库根）「跨 Agent 工具使用约束」 | 未提及 current/dev_last 格式 | **不改**（见 A3） |

- **影响文件**：`templates-data/opencode/skills/{openfeel-workspace,openfeel-recover,openfeel-sync-status}/SKILL.md`（权威源）→ build 传播至 `template-loader.ts`(SKILL_DEFINITIONS) + `update.ts`(注入) + 仓库 `.opencode/skills/**`（**自举生成，勿手改**）。
- **验收要点**：`rg "@\{username\}"` 在 `openfeel-sync-status/SKILL.md` 零残留；`rg "dev_last/"` 在 workspace/recover 命中。

### D6 — 工作区目录创建（常量级）

- **改动点**：

| 文件:行号 | 现状 | 改后 |
|-----------|------|------|
| `src/core/workspace/structure.ts:32` | `const DEV_SUB_DIRS = ['note'];` | `['note', 'current_archive']`（`createWorkspace` `:56-64` 自动创建 → `.openfeel/dev/current_archive/`） |
| `src/core/init.ts:220-224` | 仅写 `current.md` | 不变（目录由 `createWorkspace` 统一创建；确认 init 链路调用它） |
| `.gitignore` | 忽略 `users/`、`tmp/` | **不改**（`dev/current_archive/` 为公共域须纳入版本管理；`users/**` 已忽略 → `dev_last/` 天然不入库） |
| `.openfeel/users/{username}/dev_last/` | 无创建逻辑（用户目录由 workspace skill 指示 mkdir） | 由 D5 的 workspace skill 步骤 4 覆盖（**不新增源码目录常量**——该目录在用户私域，随用随建） |

- **影响文件**：`structure.ts`；`templates-data/opencode/skills/openfeel-workspace/SKILL.md`（D5）。
- **验收要点**：`openfeel init` 后 `Test-Path .openfeel/dev/current_archive` 为真；二次 init `created.length === 0`（幂等保持）。

### D7 — 本仓存量迁移

- **目标**：把本仓 `current.md`（82 行）与 `dev_last.md`（53 行）迁到新格式。
- **改动点**：见 §七 迁移映射（含逐节落点与丢弃项）。
- **验收要点**：`current.md` ≤5 条记录且无 `@agent` 段；`current_archive/` 至少 1 个归档文件；`dev_last.md` 为主题索引 + `dev_last/` 下 5 个主题文件；`dev_last.md` 行数显著下降（目标 ≤60 行，含索引骨架）。

### D8 — 文档 / 手册同步

- **改动点**：

| 文件:行号 | 现状 | 改后 |
|-----------|------|------|
| `.openfeel/manual/agents/feel.md:54` | 引用 dev_last.md「决策历史」节 | 改为 `dev_last/decisions.md`（主题文件） |
| `.openfeel/manual/core/init.md:7` | 「生成模板文件（`dev_core.md`、`current.md`、`decisions.md`、`kb/index.md`）」 | 补「+ 创建 `dev/current_archive/`」 |
| `.openfeel/manual/index.md`、`.openfeel/manual/core/template-loader.md` | 核对是否描述工作区结构/模板清单 | 按实测需要同步（预计 `.openfeel/manual/` 内 `rg "current\.md\|dev_last"` 共 2 处，见 §十） |
| `docs/GETTING_STARTED.md` / `docs/commands.md` / `README*.md` | 实测 `rg "current\.md\|dev_last"` **0 命中** | **不改** |
| `CHANGELOG.md` | 现状 | **不改**（归档阶段统一收口） |

- **验收要点**：`rg "决策历史" .openfeel/manual/` 零残留；manual 描述与实际目录一致。

### D9 — build 传播与门禁

- **目标**：权威源改动经 build 传播并过门禁。
- **步骤**：`npm run build`（传播 `templates-data/**` → `template-loader.ts` AUTO-GENERATED 段 + `update.ts` skill 注入 + `.opencode/` 自举），再 `npm test`。
- **验收要点**：`npm run build` **幂等**（二次 build `git diff --stat` 不变）；见 §九 门禁。

### D10 — 测试核对与新增断言

- **目标**：确认零强制翻转 + 补新增断言。
- **改动点**：见 §十 翻转清单。
- **验收要点**：`npm test` ≥ 基线 869 用例全绿；新增断言（`current_archive/` 目录创建 + current 模板不含 `@agent` 段）通过。

---

## 五、新格式模板（完整骨架，供 schemer 直接引用）

### 五.1 `current.md` 骨架（团队文件 / 跨用户）

```markdown
# 当前进度

> {一句话整体进度}（整体信息，用户级视图）

## 近期提交记录（最多 5 条，最新在上）

- **{yyyy-mm-dd HH:MM}** @{username}：{整体信息：做了什么、处于什么状态（不写 agent 细节、不写逐条流水）}
- **{yyyy-mm-dd HH:MM}** @{username}：{…}

> 更早记录见 `.openfeel/dev/current_archive/`（每次提交自动归档最旧一条；本文件仅保留近期 5 份）。
```

**规则**：
1. 仅**个人提交时**更新（一次提交 = 一条记录）。
2. 描述**整体信息**；**禁止** agent 细节、**禁止** `## @成员` 段（逐条流水改放 `dev_last` 主题文件）。
3. 新增记录后若条数 > 5，将**最旧一条**移出至 `current_archive/`。
4. 归档文件名：`current-{yyyy-mm-dd}-{NNN}.md`（NNN 三位递增，同日多份递增）；归档文件内容 = 被移出的记录行 + `>` 元信息行（原日期、移出时间）。
5. 归档**不删除**（保留全部历史，属公共域纳入版本管理）。

> 是否在条目内标注 `@{username}`：**planner 建议保留**（单行内联标识，非「@成员段」；用于区分跨用户提交者），见裁定 **A5**（**待 Feel/用户确认**，可覆写）。

### 五.2 `dev_last.md`（索引）骨架

```markdown
# dev_last — 索引（{username}）

> 本文件为**索引**：只列主题与核心摘要。详情在 `dev_last/{english-name}.md`（每主题 ≤10 条、每条 ≤300 字）；超量详情写入 `.openfeel/users/{username}/tmp/`，并在主题文件记录其地址。超期文件**不做归档**。

## 用户偏好
- 语言：{lang} ｜ 自动推进：{auto_advance} ｜ 审查模式：{review_mode}
- 沟通风格：{communication} ｜ 确认阈值：{confirm_threshold}

## 主题索引（最多 5 个）

- **{主题1}**（`dev_last/{english-name}.md`）
  - {近期工作核心内容，≤100 字}
  - {…最多 5 条}
- **{主题2}**（`dev_last/{english-name}.md`）
  - {…}

## 已收敛主题（不计入上方 5 个上限；仅一行，文件就地保留）

- **{主题E}**（`dev_last/{english-name}.md`，收敛于 {yyyy-mm-dd}）：{≤100 字摘要}

## 公共交接区（跨会话传递信息）

> 仅列**交接文档位置 + 核心摘要**，不描述细节。

- 交接文档：`{路径（可为 dev_last/{english-name}.md 或 tmp 文档）}`
- 核心摘要：{一句话}
```

**规则（编号 R1~R6，供 D3 逐条落地；current 侧规则见 §五.1）**：

| 规则 | 内容 |
|------|------|
| R1 | 主题索引**活跃主题 ≤5 个**；每主题摘要 **≤5 条**、每条 **≤100 字** |
| R2 | 主题文件每条 **≤300 字**、**≤10 条**；超量 → 写入 `.openfeel/users/{username}/tmp/` 文档，并在主题文件记**地址**（用户 1.3 明确允许） |
| R3 | **超期记录不做归档处理**（用户 1.3 约束）——就地保留，或由用户手动清理 |
| R4 | **主题数 >5 时**（REV-002 补）：① **优先合并同类主题**（把新主题内容并入最相近主题文件作为一条记录，索引摘要仍 ≤5 条）；② 无可合并时，将**最旧且已完结**主题**降级为一行摘要**，从「主题索引」移入「**已收敛主题**」小节（≤100 字 + 文件路径 + 收敛日期）；③ 该主题文件**就地保留，不迁移、不归档**（受 R3 约束，不可移入 `archive/` 或 `tmp/` 作为归档） |
| R5 | 「已收敛主题」小节条数**不设硬限**（一行一条），但**不得**承载细节（仅 1 行 ≤100 字） |
| **R6** | **并发写加锁协议（A9 用户裁定 2026-10-01）**：索引与全部主题文件**共用一把锁**（**每用户一把**，名 `dev-last-{username}`）；锁路径 = `projectLockPath(projectPath,'dev-last-{username}')` → **`.openfeel/tmp/locks/dev-last-{username}.lock`**（`.openfeel/tmp/` 已 gitignore，不污染版本库）；临界区 = **`withFileLock(lockPath, () => { 读索引 + 读主题文件 → 合并 → atomicWriteFileSync })`**（**一次进出、读也在锁内**）；超时/陈旧沿用默认（5000/3000ms，`src/core/fs/file-lock.ts:31/33`）；**锁 + 合并双保险**（锁防并发覆盖；合并防跨会话/锁外读取丢失 + 承担冲突双侧保留语义）；降级（`dist` 不可用）→ 至少「读-合并-写」并标注「未加锁」 |

> **文件名约定（A10 用户裁定 2026-10-01）**：`dev_last/{english-name}.md` **文件名一律英文 kebab-case**；**索引中的显示主题名可中文**；zh/en 共用同一套英文名。映射：待续事项→`pending.md`、决策记录→`decisions.md`、流水线状态→`pipeline-state.md`、上次操作→`last-operation.md`、经验暂存→`experience.md`。

> **R4 与「超期不归档」的边界（REV-002 明确）**：REV-002 原建议「移入 `tmp/` 归档文档」**与用户约束冲突** → 以**用户约束为准**（用户明确「dev_last 超期文件不做归档处理」）。故 R4 采用**合并 / 就地收敛**策略，**不产生任何归档动作**；「详情超量转 `tmp/`」（R2）与「主题超限收敛」（R4）是**不同维度**：前者是**内容细节外置**（用户允许），后者是**索引入口收敛**（不搬迁文件）。

### 五.3 `dev_last/{english-name}.md` 骨架

```markdown
# 主题：{主题名}

> 详情记录：近期 ≤10 条、每条 ≤300 字。超出则写入 `tmp/` 文档并在此记录地址。

- **{yyyy-mm-dd}** {近期工作核心内容（≤300 字）}
- **{yyyy-mm-dd}** {…}

> 超量详情：`{tmp 文档路径}`（如 `.openfeel/users/{username}/tmp/{file}.md`）
> 超期记录：**不归档**（就地保留或由用户手动清理）。
```

### 五.4 硬约束汇总（供验收机检）

| 项 | 上限 | 机检方式 |
|----|------|----------|
| current 记录条数 | 5 | 计数 `^- \*\*` 行 |
| dev_last **活跃主题数**（「主题索引」节） | 5 | 计数 `^- \*\*.*（\`dev_last/` 行 |
| dev_last「已收敛主题」条数 | 不设限（**每条 1 行 ≤100 字**） | 计数该节 `^- ` 行；超长行检测 |
| 索引内每主题摘要条数 | 5 | 人工/正则（缩进 `  - `） |
| 索引摘要单条字数 | 100 | `rg` 超长行检测 |
| 主题文件条数 | 10 | 计数 |
| 主题文件单条字数 | 300 | `rg` 超长行检测 |

---

## 六、裁定表

| # | 议题 | 结论 | 依据 / 状态（可追溯） |
|---|------|------|------|
| A1 | 问题样本判定 | `Pantheogen/.openfeel/dev/current.md`（123 行）= **反面参照**，不作模板来源 | 依据：**stage-53 需求原文**「参考 `Pantheogen\.openfeel\dev\current.md` —— 该文件为**问题样本**」+ 需求「用户已裁定（4 项）①」 |
| A2 | 旧记录归档位置 | `.openfeel/dev/current_archive/` | 依据：**需求原文**「归档位置：`.openfeel/dev/current_archive/`（用户已裁定）」+ 需求「用户已裁定②」 |
| A3 | dev_last 现有 7 节拆分 | 「用户偏好」「公共交接区」**留索引**；「上次操作状态 / 上下文快照 / 待续事项 / 关键决策 / 决策历史 / 经验暂存」**按主题拆入主题文件** | 依据：**需求原文**「用户已裁定③」 |
| A4 | 新建阶段实施 | 新开 `v1.1.2-stage-53` 实施 | 依据：**需求原文**「用户已裁定④」 |
| A5 | 是否在 current 记录内联 `@{username}` | **保留**（单行内联作为**提交者标识**，非「@成员段」；跨用户场景需要提交者标识） | **已由用户裁定（2026-10-01）· 与 planner 建议一致**：需求原文明确「用户已裁定 4 项」；与「禁止 @成员段」不冲突（行内标识 ≠ 分节）；本轮判定「**仍无 agent 细节**」 |
| A6 | `openfeel-sync-status` skill 去向 | **改写并保留**：改读「各用户 `dev_last.md` 索引主题 + `flow.json` 阶段状态」聚合；**skill 总数仍 17** | **已由用户裁定（2026-10-01）· 与 planner 建议一致**：current 规则移除后该 skill 现口径（`SKILL.md:18` 提取 `@{username}` 行）失效；淘汰依据不足 → 改写保留 |
| A7 | 仓库根 `AGENTS.md` 是否镜像工作区节 | **不改**（维持）。**若后续根 `AGENTS.md` 新增 current/dev_last 类规则节，须一并同步**；折中备选（用户若坚持）：仅在根 `AGENTS.md` 增一行指引「工作区结构详见全局约束」，**不镜像全文** | **已由 Feel 裁定**（本轮 Feel 修订指令）。事实依据：实测 `rg "current\.md\|dev_last" AGENTS.md` **0 命中**——仓库根 `AGENTS.md`（170 行）为精简版、**不含「工作区结构」节**；该节权威源为 `templates-data/agents-md/{zh-CN,en}.md`，经 `openfeel setup` 部署为全局约束 |
| A8 | 本仓 `current.md` 历史里程碑表（v1.0.0 / v1.1.0 / v1.1.2 大表）去向 | **仅归档，不迁入 roadmap**：三张表整体原样归档到 `current_archive/current-2026-10-01-001.md`；新 current 只留「总进度 1 行 + 统计 1 行 + 近期 5 条记录」 | **已由 Feel 裁定**（本轮 Feel 修订指令）。事实依据：`current_archive/` **保留原文可查**，roadmap 已有摘要（M1~M8 + 阶段划分），重复迁移**无增量价值**且引入双维护 |
| A9 | 多会话并发写 dev_last | **加锁保护**（复用 `withFileLock` + `atomicWriteFileSync`）：**每用户一把锁**（`dev-last-{username}`，索引与全部主题文件共用）+ **锁 + 合并双保险**（保留「读-合并-写 + 冲突双侧保留」） | **已由用户裁定（2026-10-01）· 推翻 planner「不引入锁」建议**：`withFileLock`（`src/core/fs/file-lock.ts:122`）+ `projectLockPath`（`:59-61`）→ `.openfeel/tmp/locks/dev-last-{username}.lock`（**已 gitignore**，不污染版本库、不侵入 `users/` 私域）；临界区一次进出（**读也在锁内**）；合并语义仍保留（锁防并发覆盖，合并防跨会话/锁外读取丢失 + 承担冲突取舍） |
| A10 | 主题文件命名规范 | **文件名一律英文 kebab-case**（`pending.md`/`decisions.md`/`pipeline-state.md`/`last-operation.md`/`experience.md`，新主题同理）；**索引中的显示主题名可中文**；zh/en 共用同一套英文名 | **已由用户裁定（2026-10-01）· 推翻 planner「中文名」建议**：需求 1.3 未规定命名语言；英文文件名跨平台安全、免 slug 心智负担；「显示名（中文）↔ 文件名（英文）」由索引中的路径保证唯一对应 |
| A11 | **主题数 >5 时的处理**（REV-002 补） | **就地收敛，不归档**（见 §五.2 规则 R4）：优先**合并同类主题**；无可合并时将**最旧且已完结**主题降为索引「已收敛主题」小节的一行摘要（≤100 字 + 文件路径），主题文件**就地保留、不迁移、不归档** | **已由 Feel 裁定**（本轮 Feel 修订指令：REV-002 建议的「移入 tmp 归档」与用户约束「超期文件不做归档处理」**冲突 → 以用户约束为准**）；事实依据：需求 1.3「**超期文件不做归档处理**」 |

---

## 七、本仓存量迁移映射

### 7.1 `current.md`（82 行 → 新格式）

| 现状区间 | 内容 | 处置 |
|----------|------|------|
| `:1-14` | 标题 + 收官摘要 + 状态/知识库/Agent/测试/版本统计 | **摘要化**：保留 `# 当前进度` + 总进度 1 行（合并 `:3`、`:82` 结论）；统计明细（`:9-14`）**压缩为 1 行**（保留测试/键数/条目数关键数字） |
| `:16-30` | v1.1.2 里程碑表（11 行） | **归档**（→ `current_archive/current-2026-10-01-001.md` 原样保留） |
| `:32-44` | v1.0.0 里程碑表 | **归档** |
| `:46-55` | v1.1.0 里程碑表 | **归档** |
| `:57-73` | 旧 v0.5 系列表（含知识沉淀统计） | **归档** |
| `:75-81` | 整体统计节 | **归档**（关键数字已压缩进新 current 的统计行） |
| `:82` | 收官结论 + 非阻塞遗留清单 | **拆分**：收官结论 → 新 current 总进度行；遗留清单（`view add` 移除、登记项 7 条）→ **移入 `dev_last/pending.md`**（它本属私域待续，不应留在公共 current） |

**新 current.md 目标内容**（≤5 条）：总进度 1 行 + 统计 1 行 + 近期提交记录 5 条（建议：stage-49 归档 / stage-50 归档 / stage-51 归档 / stage-52 计划（含 REV 修订）/ stage-53 计划）。

### 7.2 `dev_last.md`（53 行，7 节 → 索引 + 5 主题）

| 现状区间 | 节 | 目标 | 说明 |
|----------|-----|------|------|
| `:1-6` | 上次操作状态（时间/阶段/操作/文件/当前状态） | `dev_last/last-operation.md` | 「操作」段过长（`:4` 单行千余字）→ 按 ≤300 字拆分为主题文件内的多条记录 |
| `:8-13` | 用户偏好 | **留索引**「用户偏好」节 | 保持 5 项，压为 2 行 |
| `:15-18` | 上下文快照 | `dev_last/pipeline-state.md` | 读 `flow.json` 复核后写入（`stage-52` 状态已变：`plan_pending`） |
| `:20-27` | 待续事项（8 条） | `dev_last/pending.md` | 含 7.1 迁入的遗留清单；索引摘要取 ≤5 条 × ≤100 字 |
| `:29-35` | 关键决策（6 条） | `dev_last/decisions.md` | 与「决策历史」**合并为一个主题**（主题数控制） |
| `:37-45` | 决策历史（8 条） | `dev_last/decisions.md` | 同上；旧条目 >=10 条 → 仅保留近期 10 条，更早条目转 `tmp/` 并记地址 |
| `:47-53` | 经验暂存（6 条，其中 3 条已勾选） | `dev_last/experience.md` | 已勾选条目收敛为 1 行归档说明；未勾选候选保留 |
| 新增 | — | 索引「公共交接区」 | 由 `:21`（待 Feel 执行 advance）等提炼：交接文档 = `dev_last/pending.md`；核心摘要 1 行 |

**主题数校验**：上次操作 / 流水线状态 / 待续事项 / 决策记录 / 经验暂存 = **5 个活跃主题** ✅（符合「最多 5 个」）→ 本仓迁移**不触发 R4 收敛**；「已收敛主题」小节初始为空（或省略，待首个超限主题出现时由 Feel 按 R4 创建）。

**丢弃项**：无内容丢弃。「用户偏好」仅格式压缩（原值保留）。

### 7.3 附注（不改动，仅记录）

`.openfeel/dev/` 下另有 `task_claim.md`、`todo-current.md` 两个**未被约束层文档化**的文件 → 超出本阶段范围（严格修改范围原则），**不处理**；作为观察项记入 `dev_last/pending.md`。

---

## 八、兼容性与风险

| # | 风险 | 缓解 | 级别 |
|---|------|------|------|
| R-1 | **旧格式 dev_last 读取**（存量用户/本仓迁移前） | **惰性迁移**：Feel 启动读取时检测「无 `## 主题索引` 节」→ 判定旧格式 → 按 §7.2 映射拆分生成 `dev_last/` + 索引，**原文保留**（不删）；仅提示一次，不阻塞会话 | 中 |
| R-2 | **多会话并发写 dev_last** | 见 **A9（用户裁定：加锁）**：`withFileLock(projectLockPath(cwd,'dev-last-{username}'), …)` 内「读 → 合并 → `atomicWriteFileSync`」（**一次进出、读也在锁内**）+ **同主题冲突双侧保留 + 冲突标记**（锁 + 合并双保险）；降级（`dist` 不可用）→ 至少「读-合并-写」并标注「未加锁」；**禁退回整文件覆盖写** | 中 |
| **R-2b** | 锁超时（`timeoutMs=5000`）/ 陈旧锁（`staleMs=3000`） | 超时 → 明确报错（含锁路径）且**不写半成品**；陈旧锁由 `withFileLock` 内置 `rename` 原子抢占；建议会话末尾**集中一次写入**（短临界区） | 低 |
| **R-2c** | 英文文件名（A10）与既有中文引用不一致 | 本仓迁移（op-004）与 manual（op-005）**同批**改用英文文件名；验收含「映射齐备 + 中文文件名零残留」机检；存量用户由 Feel 惰性迁移按映射表生成英文名 | 低 |
| R-3 | current 归档无限增长 | 归档**只增不删**（公共域历史）；索引侧硬限 5 条即可控；不做自动清理（历史备查，符合既有 A7「不迁移历史」口径） | 低 |
| R-4 | 模板改动的**部署生效延迟** | `npm run build` 只更新权威源与 `template-loader.ts`；`~/.config/opencode/AGENTS.md` 须用户运行 `openfeel setup` 才生效 → 在验收中明确「产物路径 + 重启要求」，**本阶段不自动执行 setup** | 低 |
| R-5 | `sync-status` skill 改口径后语义弱化 | 按 A6 裁定执行（**已定：改写**）：成员进度改由**各用户 `dev_last.md` 主题索引 + `flow.json` 阶段状态**聚合；「遗漏登记」逻辑改为对比 `flow.json` active stages vs 用户 dev_last 索引；**保留 skill（17 个不变）** | 低 |
| R-6 | zh/en 双版漂移 | D1~D4 均以「同一表内并列 zh/en 行号」执行；验收加 zh/en 关键句对照 `rg` | 中 |
| R-7 | 本仓迁移把关键信息弄丢 | 归档**先写后改**（先落 `current_archive/`，再重写 current）；`git diff` 复核无未归档删除行 | 中 |
| R-8 | `current_archive/` 误入 `.gitignore` | 明确不改 `.gitignore`；验收 `git check-ignore .openfeel/dev/current_archive/x` 返回非忽略 | 低 |
| R-9（REV-002） | **主题数 >5 时无规则可依**（第 6 个主题出现时合并/收敛哪个、如何记录） | §五.2 **R4** 给出可复现规则：优先合并同类 → 无可合并则「已收敛主题」一行摘要（文件**就地保留、不归档**，受用户约束 R3）；与「超期不归档」的边界已在 §五.2 注中显式区分；D3 验收含 6 主题 fixture（含「无归档目录产生」断言） | 中 |

---

## 九、build 与门禁

| 步骤 | 命令 | 基线 / 期望 |
|------|------|-------------|
| 1 | `npm run build` | 传播 `templates-data/**`；**幂等**（重跑零 diff） |
| 2 | `npm test` | **≥ 56 文件 / 869 用例** 全绿（新增断言后用例数增加） |
| 3 | `node bin/openfeel.js lint i18n` | 基线 **649 键**，本阶段**不新增/删除 i18n 键**（预期仍 649；R1 后失败非 0 退出） |
| 4 | `node bin/openfeel.js lint kb` | 0 过期引用 |
| 5 | `tsc --noEmit`（或 `npm run build` 内） | 0 错误 |

> **本阶段不涉及 i18n 键增删**（纯模板/文档/常量/存量数据）：若 executor 发现需新增键（如 init 提示），须在 plan 备注中登记并同步 zh/en 双版。

---

## 十、测试翻转清单

### 10.1 强制翻转（预期 **0 项**）

| 测试 | 现状断言 | 是否翻转 | 原因 |
|------|----------|----------|------|
| `test/core/init.test.ts:269` | `existsSync(.openfeel/dev/current.md) === true` | **否** | `current.md` 仍由 init 生成，仅内容变 |
| `test/core/init.test.ts:132` | 二次 init `created.length === 0` | **否** | 新增目录仅首次创建，幂等保持 |
| `test/core/templates.test.ts:24-40`（T54） | `agents-md` zh/en 中 `pending/open` 代码块行数一致 | **否** | 未触及「审查/追踪 生命周期」节（zh `:430` / en `:428`） |
| `test/core/template-loader.test.ts:334` | `opencode/agents/{lang}/openfeel-archiver.md` 内容 | **否** | 未触及 archiver |
| `test/core/setup.test.ts:56,83` | 全局 AGENTS.md 路径 + 幂等 | **否** | 部署路径不变，仅内容变 |
| `test/core/view.test.ts` | `view` 家族 | **否** | 本阶段不涉及（`view add` 移除属 stage-52） |

### 10.2 文本保持约束（**非翻转，但会红** —— executor 必须保留以下字符串）

| 测试:行号 | 必须保留的字符串 | 位于 |
|-----------|------------------|------|
| `template-loader.test.ts:166-174` | `update_infos`、`` `- [ ]` ``、`` `- [x]` ``、`edit 工具`、`重启会话`；且**不得**出现 `resolveUpdateInfo`/`clearUpdateInfos` | `opencode/agents/zh-CN/feel.md`（改 `:317-405` 时勿动 `:355-369`） |
| `template-loader.test.ts:178-185` | `update_infos`、`` `- [ ]` ``、`` `- [x]` ``、`edit tool`、`restart` | `opencode/agents/en/feel.md` |
| `template-loader.test.ts:189-194` | `update_infos.md`、`会话启动修复` | `openfeel-workspace/SKILL.md`（D5 编辑时保留） |
| `template-loader.test.ts:196-201` | `Global Behavioral Constraints` | `agents-md/en.md`（标题保留） |
| `templates.test.ts:19-20`（14 skill 通用检查） | 每个 `SKILL.md` 含「程序自检」与 `` `openfeel `` | 所有 skill |
| `templates.test.ts:42-49`（T55） | `openfeel-cli-usage/SKILL.md` 含 `phases`/`stage`/5 命令族 | 未触及 |

### 10.3 建议新增断言（executor 补）

1. `init.test.ts`：`existsSync(.openfeel/dev/current_archive) === true`（D6）。
2. `templates.test.ts` 或新用例：`CURRENT_TEMPLATE_ZH/EN` **不含** `团队成员进度` / `Team Member Progress`，**含** `current_archive`（D2）。
3. `templates.test.ts`：`agents-md/{zh-CN,en}.md` 含「主题索引（最多 5 个）」/「Public Handoff Section」关键句（D3）。
4. （可选）`structure.test.ts`（若存在）：`DEV_SUB_DIRS` 含 `current_archive`。
5. **（A9 用户裁定）加锁协议断言**：`template-loader.test.ts` — `agents-md/{zh-CN,en}.md` 与 `opencode/agents/{zh-CN,en}/feel.md` 均含 `withFileLock`、锁名 `dev-last-`、路径 `.openfeel/tmp/locks/`、`atomicWriteFileSync`；**并发 fixture**（`mkdtemp` 内 2 写者复用 `withFileLock`）→ **无丢失/无覆盖**（executor 手测 + 报告留证）。
6. **（A10 用户裁定）英文文件名断言**：`template-loader.test.ts` — zh/en 模板含 5 个英文文件名（`pending.md`/`decisions.md`/`pipeline-state.md`/`last-operation.md`/`experience.md`）；`rg` **中文文件名零残留**（`dev_last/[^`]*[一-龥][^`]*\.md` → 零命中）。

---

## 十一、op 划分建议（5 op）

| op | 范围 | D 项 | 关键产出 | 依赖 |
|----|------|------|----------|------|
| op-001 | 约束层：两条目的 + current.md 规则/模板 | D1 + D2 | `agents-md/{zh-CN,en}.md`（工作区结构节 + 开发目录节）、`src/core/templates.ts` | — |
| op-002 | dev_last 索引化：格式与 Feel 行为 | D3 + D4 | `agents-md`（私域节 + 索引/主题骨架）、`feel.md`（zh/en 记忆加载 + 会话结束写入 + 决策追加） | op-001（同文件顺序编辑） |
| op-003 | skill 与目录常量 | D5 + D6 | 3 个 SKILL.md、`structure.ts` | op-001/002（口径一致） |
| op-004 | 本仓存量迁移 | D7 | `.openfeel/dev/current.md`、`current_archive/**`、`users/Liuary/dev_last.md` + `dev_last/*.md` | op-001/002（格式已定） |
| op-005 | 文档/手册 + build + 门禁 + 测试 | D8 + D9 + D10 | `manual/**`、新增断言、build 幂等、三门禁 | op-001~004 |

**执行顺序**：`op-001 → op-002 → op-003 → op-004 → op-005`（op-003/004 在格式落定后即可并行，建议仍串行以降低 review 成本）。

---

## 十二、验收标准（阶段级）

1. **约束层**：`templates-data/agents-md/{zh-CN,en}.md` 含两条设计目的 + 三层分层表 + current 新规则 + dev_last 索引规则（双语对齐）；`rg "描述正在进行的工作|@{username} 描述正在进行的工作"` 零残留。
2. **模板**：`src/core/templates.ts` 的 current 模板为新骨架；`openfeel init` 产物 `current.md` 含「近期提交记录（最多 5 条）」且不含 `团队成员进度`。
3. **目录**：`openfeel init` 创建 `.openfeel/dev/current_archive/`；`createWorkspace` 幂等。
4. **feel.md**：zh/en 均含「索引 + 按需读主题文件 + 公共交接区 + 超量转 tmp」；`rg "dev_last/"` 命中。
5. **skill**：`openfeel-workspace` 含 `current_archive/` 与 `dev_last/`；`openfeel-recover` 改读索引；`openfeel-sync-status` 无 `@{username}` 提取依赖（按 A6 裁定）。
6. **迁移**：`current.md` ≤5 条记录、无 `@agent` 段；`current_archive/` 含 ≥1 归档文件（原 82 行全文）；`dev_last.md` 为索引且 `dev_last/` 下**恰好 5 个**主题文件（**A10：文件名为 `last-operation.md`/`pipeline-state.md`/`pending.md`/`decisions.md`/`experience.md`**）；主题数/条数/字数**全部达标**（§五.4 机检）。
7. **主题超限规则（REV-002）+ 加锁（A9）+ 命名（A10）**：① `agents-md/{zh-CN,en}.md` 均含 **R1~R6** 与「已收敛主题」小节约定；6 主题 fixture 验证「合并优先 / 就地收敛 / **零归档动作**」（`dev_last/archive/` 不存在、主题文件路径不变）；② **A9**：zh/en 模板与 feel.md 均含 `withFileLock` + 锁名 `dev-last-{username}` + 路径 `.openfeel/tmp/locks/` + 合并语义；**并发 fixture（2 写者）无丢失/无覆盖**；③ **A10**：5 个英文文件名映射齐备，`rg` 中文文件名**零残留**。
8. **A5/A6/A7/A8 表述**：计划内**无**无据「用户已确认/用户已裁定」表述——A1~A4 引**需求原文**；A7/A8/A11 = **已由 Feel 裁定**（附事实依据）；**A5/A6/A9/A10 = 已由用户裁定（2026-10-01）**（A5/A6 与建议一致；**A9/A10 推翻 planner 建议**并已回写 op 方案与 deps.yaml `decisions_taken`）。
9. **门禁**：`npm run build` 幂等；`npm test` ≥869 用例全绿；`lint i18n` 649 键；`lint kb` 0 过期。
10. **一致性**：`.openfeel/manual/` 内描述与实测目录一致；`git status` 仅含本阶段预期文件。

---

## 十三、修订记录

| 时间 | 制定人 | 版本 | 说明 |
|------|--------|------|------|
| 2026-10-01 | openfeel-planner | v1 | 初稿：D1~D10、§五 三份骨架、§七 迁移映射、A1~A10 裁定表、§八 风险 R-1~R-8、§十 翻转清单、§十一 5 op 划分 |
| 2026-10-01 | openfeel-planner | v2 | A6/A7/A8 结论落定（sync-status 改写并保留 / 仓库根 `AGENTS.md` 不改 / 里程碑表仅归档）；A5/A9/A10 按 planner 建议；同步 §四 D5、§八 R-5 与 `overview.md`。**（v3 已修正本行「裁定来源」表述——v2 原文标注「用户裁定」不可取证，改由 REV-001 处理）** |
| 2026-10-01 | openfeel-planner | v3 | **REV-v1.1.2-stage-53 修订**：**REV-001（medium）** —— 裁定表改写为「**依据 / 状态（可追溯）**」列，删去 A7/A8 无据「用户已裁定」（改为「**已由 Feel 裁定** + 事实依据 + 回退条件」），A5/A6/A9/A10 改为「**planner 依据 + 待 Feel/用户确认**」，A1~A4 引**需求原文**；D1 表补「指令层冲突已留痕（REV-001）」；修正两处**陈旧交叉引用**（`§四 D1` 原「见待裁定 A3」→ A7；`§五.1` 原「见待裁定 A4」→ A5）；§十二 新增验收 8。**REV-002（low）** —— §五.2 新增规则表 **R1~R5**（R4 = 主题数 >5 时「优先合并同类 → 就地收敛为一行摘要，文件不迁移不归档」）+ 索引骨架增「**已收敛主题**」小节 + 显式说明与「超期不归档」的**边界**（REV-002 原建议「移入 `tmp/` 归档」**与用户约束冲突 → 以用户约束为准**）；§五.4 机检表区分「活跃主题 ≤5 / 已收敛不限」；D3（含 6 主题 fixture 验收）、D4 步骤③、§7.2、§八 **R-9**、§十二 验收 7 同步 |

| 2026-10-01 | openfeel-schemer | v4 | **用户裁定 A5/A6/A9/A10 回写**（不可推翻）：**A5/A6 与建议一致**（current 记录内联 `@{username}` 作为**提交者标识**、仍无 agent 细节、非「成员进度段」；`openfeel-sync-status` **改写并保留**、skill 总数 17）→ 仅复核无改动；**A9 推翻「不加锁」** → §五.2 新增 **R6 加锁协议**（`withFileLock`（`src/core/fs/file-lock.ts:122`）+ `projectLockPath`（`:59-61`）→ `.openfeel/tmp/locks/dev-last-{username}.lock`，`.gitignore` 已忽略；**每用户一把锁、索引与全部主题文件共用、临界区含读取**；保留「读-合并-写 + 冲突双侧保留」为**第二道保险**；降级路径标注「未加锁」）+ §八 **R-2 改写**、新增 **R-2b**（锁超时）/ **R-2c**（英文文件名）+ §10.3 新增断言 5（锁协议 + 并发 fixture）/ 6（英文文件名）；**A10 推翻「中文名」** → §五.2 新增**文件名约定**（英文 kebab-case + 索引显示名可中文）+ §五.3/§七.2 路径改 `dev_last/{english-name}.md` 与 5 个英文文件名 + §十二 验收 7/8 同步；同步 `ops/`（op-002 §三.4/§三.5、op-003/op-004/op-005）与 `deps.yaml`（`decisions_taken` A5/A6/A9/A10 + `directory_constants` 新增锁目录项） |