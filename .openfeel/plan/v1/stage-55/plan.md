# v1.1.2-stage-55 计划 — 清掉项目级约束与 Agent（发布前收口）

- **阶段**：`v1.1.2-stage-55`
- **依赖**：`hard: v1.1.2-stage-54`（已登记）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-01
- **用户指令**：「**先收尾**，然后清掉项目级别的约束和 Agent，之后发布」→ 本阶段 = 第二阶段（**清项目级约束与 Agent**）；`npm publish` 在其后由用户决定
- **范围约束**：**不改业务源码**（允许改：`build.js`、`templates-data/**` 模板、`docs/**`、`.openfeel/**` 工作区数据、`.gitattributes`）；**不创建 op 文件**；**不改 `flow.json`**；**不执行 `npm publish`**
- **KB 检索**：已加载 `openfeel-check-kb`。相关：`kb/architecture.md #仓库自身 .opencode/ 不清理（N1）`（**本阶段 supersede**）、`kb/patterns.md #模板单源架构/构建产物`、`kb/index.md:15,51`（`.opencode/` 记为自举产物）；`kb/patterns.md:2416`（B 类保留清单含 `.opencode/` 操作指令）→ 需同步说明

---

## 一、用户裁定（不可推翻，2026-10-01）

| 项 | 裁定 |
|:--:|------|
| 删除范围 | 删**根 `AGENTS.md`** ＋ 删 **`.opencode/agents/**`** ＋ 删 **`.opencode/skills/**`** ＋ 删 **`.opencode/ADAPTER.md`** ＋ 删**根 `opencode.jsonc`** ＋ 删 **`build.js` 自举步骤**（防复活） |
| 「模块手册」节 | **迁入全局约束模板** `templates-data/agents-md/{zh-CN,en}.md`（随 `setup` 部署到全局） |
| 全局刷新 | **先刷新全局再删**（避免降级运行） |
| 验证方式 | 删除后**开新会话验证** agent / skill / 约束仍正常加载 |
| 发布 | `npm publish` **不在本阶段**（用户决定，且在本阶段之后） |

---

## 二、盘点基线（已抽查复核）

| # | 事实 | 证据（实测） |
|---|------|--------------|
| 1 | 根 `AGENTS.md` = **162 行**手写混合体：`1-123` 框架级（与模板/全局重复）、`125-137` **版本管理**（项目级，含 v1.1.2）、`139-141` **模块手册**（全局模板**无**，独有）、`143-162` 项目流程工具；**非 build 产物** | `rg -n "^#{1,3} " AGENTS.md`；`rg -c "模块手册" templates-data/agents-md/*.md` → **0** |
| 2 | 其唯一运行时引用 = 根 `opencode.jsonc` 的 `instructions: ["AGENTS.md"]` | `opencode.jsonc` 实测 |
| 3 | `.opencode/agents`(9) / `skills`(17) / `ADAPTER.md` 均为 **build.js 步骤 8** 产物（含 `<!-- openfeel:generated`） | `build.js:1056-1099`（定义）、`:1121-1122`（调用）；`git ls-files .opencode` = **27**（9+17+1） |
| 4 | **只删文件不改 build → `npm run build` 全部复活** | 同上（步骤 8 每次 build `rmSync` 后重生） |
| 5 | 唯一依赖仓库根 `.opencode` 的测试 = `test/core/opencode-instance.test.ts`（agents 9 / skills 17 / 27 受管文件 / 生成标记 / frontmatter 位置 / CRLF / external_directory / reviewer 纪律节） | 该文件 `:39-98`；其余测试的 `.opencode` 用法均指向 **tmp 项目或 fixture** |
| 6 | **全局部署落后**：全局 `AGENTS.md` **442** 行 vs 模板 **503** 行（缺「模块手册」等）；全局 **skills 16**（缺 `openfeel-cli-usage`）；全局 agents 偏旧（feel 404 vs 项目 419） | 实测 `~/.config/opencode/`；`node -e` 差集 = `openfeel-cli-usage` |
| 7 | 全局 `opencode.jsonc` **已有** `default_agent: feel` + `openfeel-vision/reviewer` 模型覆盖 ✓；**无** `permission` 键 | 实测全局 jsonc 内容 vs `buildGlobalOpencodeFrameworkObj()`（`opencode-config.ts:15-26`，**不含 `instructions`**——v1.1.1 起全局 AGENTS.md 自动加载） |
| 8 | 根 `opencode.jsonc` 携带 `instructions: ["AGENTS.md"]`（随 AGENTS.md 删除而失效）+ `permission: "allow"`（全局无对应键） | 实测；`kb` 载「顶层 `permission: "allow"` 会覆盖 `external_directory`，但 **agent `.md` 同键优先**」（权限合并语义）→ 各 agent 已声明 `external_directory: "allow"` |
| 9 | `.opencode/` 下 `node_modules/`（+`package.json`/`package-lock.json`/`.gitignore`）为 **opencode 运行时目录，须保留**（未跟踪，属 `.opencode/.gitignore` 管理） | `Get-ChildItem .opencode`；`git ls-files .opencode` 仅 27 个受管文件 |
| 10 | `.gitattributes` 有 `.opencode/** text eol=lf`（删后冗余）；根 `.gitignore` **无** `.opencode` 规则 | 实测两文件 |
| 11 | **冲突裁定**：`kb/architecture.md:398`「**仓库自身 `.opencode/` 不清理（N1）**」与本次删除冲突 → 须 **supersede** | `kb/architecture.md:398` |
| 12 | 引用同步面：`docs/GETTING_STARTED.md:127`（链接 `../AGENTS.md`）；`.openfeel/manual/core/build.md:9,12,14,28,34,38`（步骤 8 / 自举 / `.gitattributes`）；`kb/{index,patterns,architecture}.md` 多处 | 实测（docs 仅 1 处链接根 AGENTS.md） |
| 13 | 根 `opencode.jsonc` / `AGENTS.md` **不在 npm 包内**（`package.json files = ["dist","bin","schemas"]`）→ 删除不影响 `npm pack` | `node -e` 读 `package.json` |

---

## 三、工作项（F 编号）

### F1 — 前置：刷新全局部署（**本机真实全局目录操作**）

- **目标**：把全局资产刷到与当前模板一致（含本阶段 F2 新增的「模块手册」节），**避免删除项目级资产后降级运行**。
- **命令裁定（读源码确认）**：

| 命令 | 实现 | 语义 | 判定 |
|------|------|------|------|
| `openfeel setup` | `src/core/setup.ts:29-110`（`setupGlobalFramework`） | **纯全局**：全局 `AGENTS.md` + 9 agent + 17 skill + 全局 `opencode.jsonc` 深度合并；走 `deployGlobalAsset`（受管区三态 + **写前备份**，`setup.ts:12,67-71`）；幂等 | ✅ **采用** |
| `openfeel update` | `src/core/update.ts:1572+`（`updateProject`） | 同上部署全局，**另**处理**项目** `opencode.jsonc` + legacy 目录提示（`update.ts:1593-1598`，仅 `console.warn` 非交互阻塞） | ❌ 本阶段不用（会触碰即将删除的项目侧文件，制造交叠） |

- **实施**：
  1. **先构建**：`npm run build`（保证 `dist` 与模板/F2 改动一致——`node bin/openfeel.js` 走 `dist`）。
  2. **人工备份全局**（在 CLI 自带备份之外再做一份快照，便于整目录回滚）：
     `Copy-Item -Recurse "$env:USERPROFILE\.config\opencode" "$env:TEMP\opencode\stage55-global-backup"`（保留 `node_modules` 可排除以省时）。
  3. **执行**：`node bin/openfeel.js setup`（幂等，可重跑）。
- **验证全局已最新的判据（逐条实测）**：
  | 判据 | 期望 |
  |------|------|
  | 全局 skills 数 | **17**（含 `openfeel-cli-usage`） |
  | 全局 `AGENTS.md` | 含 **「模块手册」** 节；与 `templates-data/agents-md/zh-CN.md` 的受管区内容一致 |
  | 全局 agents 数 | **9**；均为最新（含 stage-48 纪律节 / `external_directory`） |
  | 全局 `opencode.jsonc` | 保留 `default_agent` + 两处模型覆盖；含 `$schema` |
  | 本仓 `flow health`（可选） | 无异常（`setup` 不动项目） |
- **验收要点**：`node -e` 差集为空（模板 17 vs 全局 17）；`rg -c "模块手册" ~/.config/opencode/AGENTS.md` ≥ 1；备份目录存在且可读。
- **影响面**：**仅本机全局目录**（不入 git）；不产生仓库文件改动。
- **回滚**：`Remove-Item -Recurse "$env:USERPROFILE\.config\opencode"` 后从备份恢复；或依赖 `~/.openfeel/backup/{ts}/` 中的写前备份 + `openfeel/update_infos.md` 的「备份」条目（stage-46 机制）。

### F2 — 「模块手册」节迁入全局模板（双语）+ build 传播

- **目标**：把根 `AGENTS.md:139-141` 独有内容迁入模板权威源，使删除后该约束仍随全局生效。
- **改动点**：

| 文件:行号 | 现状 | 改后 |
|-----------|------|------|
| `src/core/templates-data/agents-md/zh-CN.md`（现 `:136-137` 后） | `### 项目流程工具`（`:136`）紧跟 `### 版本管理`（`:122-134`），**无「模块手册」节** | 在 `### 项目流程工具` **之前**插入 `### 模块手册` 节（承接根 `AGENTS.md:139-141` 语义，并入「项目特有约束（可选化）」之下） |
| `src/core/templates-data/agents-md/en.md`（对应位点） | 同上（英文 `### Project Flow Tools` 前） | 插入 `### Module Manuals`（**双语对齐**） |
| 根 `AGENTS.md` | 含该节 | **本阶段删除**（F3）；内容已迁模板，无信息丢失 |

- **建议新节文本（zh，供 schemer/executor 定稿）**：
  ```markdown
  ### 模块手册

  `.openfeel/manual/` 为分级模块文档系统，记录项目主要模块的职责、核心 API 与结构（见 `manual/index.md` 模块树）。归档官在归档时必须检查本阶段涉及的模块，若其 API、结构或职责发生变更，须同步更新 `manual/` 中对应模块文档。
  ```
- **影响文件**：`templates-data/agents-md/{zh-CN,en}.md` → `npm run build` 传播至 `template-loader.ts`（AUTO-GENERATED `AGENTS_MD_TEMPLATES`）与全局部署内容。
- **验收要点**：`rg -c "模块手册" templates-data/agents-md/zh-CN.md` ≥ 1、`rg -c "Module Manuals" en.md` ≥ 1；`npm run build` 幂等；`test/core/templates.test.ts:24-40`（T54 zh/en 代码块等长）不受影响（未触及 `pending/open` 块）。
- **备注**：根 `AGENTS.md` 的 `1-123`（框架级）与 `143-162`（项目流程工具）**内容已在模板中有对应节**（模板 `:143-149` `### 项目流程工具`）→ **不迁移**；`125-137` **版本管理**为项目实例值（`package.json` / `CHANGELOG` / `roadmap` 已承载）→ **不迁移**（见裁定 A2）。

### F3 — 删除项目级资产（文件类，5 项）

> **前置门**：F1 的五条判据**全部通过**后方可执行（否则先修复全局再删）。

| # | 删除对象 | 现状证据 | 命令（示例） |
|---|----------|----------|--------------|
| 1 | 根 `AGENTS.md`（162 行） | 手写混合体；唯一引用 = 根 `opencode.jsonc` | `git rm AGENTS.md` |
| 2 | `.opencode/agents/**`（9 个） | build 产物（含生成标记） | `git rm -r .opencode/agents` |
| 3 | `.opencode/skills/**`（17 目录） | 同上 | `git rm -r .opencode/skills` |
| 4 | `.opencode/ADAPTER.md` | 同上 | `git rm .opencode/ADAPTER.md` |
| 5 | 根 `opencode.jsonc` | `instructions` 指向被删 `AGENTS.md`；`permission: "allow"` 与全局无对应（见 §二.7/8） | `git rm opencode.jsonc` |

- **保留（不动）**：`.opencode/node_modules/`、`.opencode/package.json`、`.opencode/package-lock.json`、`.opencode/.gitignore`（**opencode 运行时目录**，未跟踪，删除会破坏本机 opencode 运行环境）。
- **验收要点**：`Test-Path` 五项均为 False；`git status` 显示 27 个受管文件 + 2 文件（`AGENTS.md`/`opencode.jsonc`）为 deleted；`.opencode/` 仍含运行时目录 4 项。
- **风险**：删除内容可从 git 全量恢复（`git checkout <sha> -- <path>`）——见 §七 回滚。

### F4 — 删除 `build.js` 自举步骤（防复活）+ 测试翻转 + 行尾/忽略规则核对

- **改动点**：

| 文件:行号 | 现状 | 改后 |
|-----------|------|------|
| `build.js:1056-1099` | `async function regenerateOpencodeInstance()`（步骤 8：清空并重生 `.opencode/{agents,skills,ADAPTER.md}`） | **整函数删除**（含 `insertGeneratedMark` `:1043-1049`——仅被步骤 8 使用，须一并核查引用） |
| `build.js:1121-1122` | `// 步骤 8…` 注释 + `await regenerateOpencodeInstance();` | **删除调用** |
| `build.js:1040`（步骤 8 分区注释） | `// ── 步骤 8：.opencode/ 自举实例重生成（D36-3 / N4）──` | 删除或改写为说明「已于 stage-55 移除」 |
| `test/core/opencode-instance.test.ts`（1-99 全文） | 断言仓库根 `.opencode`：agents 9 / skills 17 / **受管 27 含生成标记** / frontmatter 位置 / `template-loader.ts`+`update.ts` 无 CRLF / 9 agent 含 `external_directory` / reviewer 纪律节 | **删除该文件**（其断言对象已不存在）。**替代覆盖**（防覆盖缺口）：① CRLF 断言迁至新用例或并入 `test/core/templates.test.ts`（对象改为 `template-loader.ts`/`update.ts`，**仍成立**）；② `external_directory` 断言**已由** `test/core/templates.test.ts` / `template-loader.test.ts` 的模板源断言覆盖（须在 op-003 报告核实并登记结论）；③ reviewer 纪律节断言改为读**模板源** `templates-data/opencode/agents/zh-CN/openfeel-reviewer.md`（若既有测试未覆盖则新增 1 条） |
| `.gitattributes:3` | `.opencode/** text eol=lf` | **删除该行**（受管文件已不存在；`.opencode/` 未跟踪文件无需行尾规则） |
| 根 `.gitignore` | **无 `.opencode` 规则** | **确认不改**（新增文件若出现在 `.opencode/` 下则属运行时，由 `.opencode/.gitignore` 管理；不误忽略 `node_modules`） |

- **验收要点**：`rg -n "regenerateOpencodeInstance|insertGeneratedMark" build.js` **零命中**；`npm run build` **幂等**且**不再生成** `.opencode/agents|skills|ADAPTER.md`（`Test-Path` 仍为 False——**复活防护的实证**）；`rg -n "\.opencode" .gitattributes` 零命中。
- **翻转清单**：见 §六.2。

### F5 — 引用同步（docs / manual / kb）

| 文件:行号 | 现状 | 改后 |
|-----------|------|------|
| `docs/GETTING_STARTED.md:127` | `- [项目行为约束](../AGENTS.md) — AI Agent 协作核心规范` | 改为指向全局约束：`- [框架行为约束](...)`（**建议**：删除该行，或改为文字说明「框架约束由 `openfeel setup` 部署到全局，见 `README`」——**不得留死链**） |
| `.openfeel/manual/core/build.md:9` | 「从唯一权威源 …读取 agent/skill/instructions/AGENTS.md 模板，内联为 TS 常量写入 `template-loader.ts` 与 `update.ts`」 | ✅ 事实仍成立（**保留**；`instructions` 为历史表述，可顺带精化） |
| `.openfeel/manual/core/build.md:12` | 「4. 重生 `.opencode/` 自举实例（步骤 8，含生成物标记）」 | 改为「4. （**stage-55 已移除**）原步骤 8 `.opencode/` 自举重生——仓库不再保留项目级部署实例」 |
| `.openfeel/manual/core/build.md:28,34,38-40` | 「唯一权威源 = templates-data/opencode/；`.opencode/` 降级为构建产物（自举实例）」「`.gitattributes`：`.opencode/**` 统一 lf」「## 步骤 8：…」 | 同步：删/改自举实例表述与 `.gitattributes` 行；步骤 8 节标注「已移除（stage-55）」并保留原因（防复活） |
| `.openfeel/kb/index.md:15`（关键目录） | 「`.opencode/agents/`（Agent 定义，自举实例由 build 生成）」 | **追加说明**（不改写历史行）：`（stage-55 起仓库不再保留项目级 .opencode 部署实例）` |
| `.openfeel/kb/index.md:51` | 「`.opencode/` 降级为构建产物（步骤8 自举重生）」 | 同上（追加 supersede 注记） |
| `.openfeel/kb/patterns.md:2416` | 「B 类保留清单（不得泛化）：…适配器目录本体 `.opencode/`…及其操作指令」 | **不改**（历史条目）；在 **F6 supersede 条目**中说明适用边界变化（**仓库自身**不再有受管 `.opencode/`，但**目标项目**的 `.opencode/` 仍存在） |
| `.openfeel/kb/patterns.md` 其余 `.opencode/agents` 提及（`:577,600,800,807,868,1189,1294,1297,1315-1316,1580,1858-1859`） | 历史记录/示例 | **不改**（历史归档性质；如为「可执行示例」类且已成死引用，由 `lint kb` 判定——须 0 过期） |
| `docs/commands.md:504,530` | 描述 `setup`/`update` 部署**全局** AGENTS.md/agent/skill | **不改**（事实正确） |

- **验收要点**：`rg -n "\]\(\.\./AGENTS\.md\)" docs/` 零命中；`node bin/openfeel.js lint kb` **0 过期**（须重点复核 `.opencode/agents/...` 类引用是否被判过期——`lint kb` 会解析 kb 中反引号路径；若历史条目被判过期，按「**只读历史不改写**」原则改为**去掉反引号**或加占位标记，**不删除历史内容**）。

### F6 — supersede 记录（N1 决策变更）

- **目标**：显式记录 `.openfeel/kb/architecture.md:398` 的 N1 决策「**仓库自身 `.opencode/` 不清理**」被本阶段推翻。
- **改动点**：
  | 文件:行号 | 改后 |
  |-----------|------|
  | `.openfeel/kb/architecture.md:398` | **保留原行**（历史决策），**追加一句**：`> **【supersede｜2026-10-01｜v1.1.2-stage-55】** 本决策已变更：仓库自身不再保留项目级 `.opencode/` 受管实例（agents/skills/ADAPTER）与根 AGENTS.md/opencode.jsonc；理由 = 全局部署已完备（setup 幂等刷新）+ 消除双份资产漂移与 build 复活负担；防复活机制 = 删除 build 步骤 8。适用边界：**目标项目**的 `.opencode/` 相关语义不受影响。` |
  | `.openfeel/kb/index.md`（决策索引区） | 追加 1 行索引/摘要（如该文件有决策表） |
  | `.openfeel/dev/decisions.md`（若存在 ADR 机制） | 追加 **ADR**（决策/理由/日期/状态 `accepted` 并注明 supersede N1） |
  | `.openfeel/manual/core/build.md` | 步骤 8 节标注口径同 F5 |
- **验收要点**：`rg -n "supersede" .openfeel/kb/architecture.md` 命中；ADR 条目存在；`lint kb` 0 过期。

### F7 — 验证（静态 + 新会话）+ 门禁

- **静态验证（可自动化）**：
  1. 删除对象均不存在（F3 五条）。
  2. 复活防护：`npm run build` 后 `.opencode/agents|skills|ADAPTER.md` **仍不存在**。
  3. 全局齐备：F1 五条判据复跑（skills 17 / AGENTS.md 含模块手册 / agents 9 / jsonc 保留键）。
  4. 门禁：`npm run build`（幂等）→ `npm test`（基线 **59 文件 / 979 用例**，扣除被删测试文件后按实测值）→ `npx tsc --noEmit` 0 → `node bin/openfeel.js lint i18n`（**726 键**，stage-54 后值）→ `node bin/openfeel.js lint kb`（0 过期）。
  5. 环境零污染核验（仓库 `.openfeel/config.yaml` hash/mtime 前后一致）。
- **新会话验证指引（须写入交互与日志，供用户执行）**：
  1. **重启 opencode 会话**（配置变更仅在重启后生效）；
  2. 确认：`openfeel-workspace` / `openfeel-cli-usage` 等 **skill 可加载**（尝试 `skill` 列出或调用 1 个）；
  3. 确认：**9 个 agent 可用**（如 `task` 分派 `openfeel-planner` / `openfeel-executor` 各 1 次冒烟）；
  4. 确认：**全局约束生效**（会话系统提示中应含「OpenFeel 全局行为约束」，含新增「模块手册」节）；
  5. 确认：`feel` 为默认 agent（`default_agent`）；
  6. 若某项失败 → 按 §七 回滚（git 恢复项目文件 / 全局备份恢复）。

---

## 四、执行顺序与安全门（**全串行**）

```
F2（模板迁入 + npm run build）
  ↓  [门 A] 模板含「模块手册」+ build 幂等
F1（备份全局 → openfeel setup → 判据 5 条）
  ↓  [门 B] 全局已最新（skills 17 / AGENTS.md 含模块手册 / agents 9）
F3（删除 5 项项目级资产）
  ↓  [门 C] 五项不存在；.opencode 运行时目录保留
F4（删 build 步骤 8 + 测试翻转 + .gitattributes）
  ↓  [门 D] rg 零命中 + build 后不复活
F5（引用同步 docs/manual/kb）
F6（supersede 记录 N1）
  ↓  [门 E] lint kb 0 过期 + supersede 可检索
F7（静态验证 + 门禁 + 新会话指引）
```

> **顺序说明（相对用户 F 编号的微调）**：把 **F2 前置到 F1 之前**——否则 `setup` 刷新出的全局 `AGENTS.md` 不含「模块手册」节，F2 后须**再刷一次**。**关键不变量不变**：**F1（刷新全局）严格早于 F3（删除项目资产）**。
> **门 A~E 均为"可验证中断点"**：任一门失败即停止后续步骤（此时项目资产尚未删除，无回滚成本）。

## 五、op 划分（4 op，全串行）

| op | 主题 | 覆盖 | 关键产出 | 依赖 |
|----|------|------|----------|------|
| **op-001** | 模板迁移（模块手册 → 全局模板） | F2 | `templates-data/agents-md/{zh-CN,en}.md`（新增节，双语）+ `npm run build` 传播 | — |
| **op-002** | **刷新全局部署**（本机真实全局操作） | F1 | 全局备份快照 + `node bin/openfeel.js setup` + 5 条判据实测记录 | op-001（模板须先就绪） |
| **op-003** | 删除与防复活 + 测试翻转 | F3 / F4 | 删 5 项项目资产；`build.js` 步骤 8（函数 + 调用 + 分区注释 + `insertGeneratedMark`）；删 `test/core/opencode-instance.test.ts` 并**迁移仍有效断言**（CRLF / `external_directory` / reviewer 纪律节 → 模板源）；`.gitattributes` 去 `.opencode/**` 行 | op-002（**门 B 通过后**） |
| **op-004** | 引用同步 + supersede + 验证 | F5 / F6 / F7 | `docs/GETTING_STARTED.md:127`、`manual/core/build.md`、`kb/{index,architecture}`（追加式）、`dev/decisions.md` ADR；静态验证 + 五门禁 + 新会话验证指引 | op-003 |

**顺序**：`op-001 → op-002 → op-003 → op-004`（**硬约束：op-002 必须早于 op-003**，即「先刷新全局、后删项目资产」）。

**边界声明**：op-002 是本流水线中**唯一操作本机真实全局目录**的 op → 须**备份先行**、逐条判据留痕；op-003 的删除**不回滚 `flow.json`**、不触碰 `.openfeel/**` 与 `src/**`（除 `build.js`）。

---

## 六、测试与门禁

### 六.1 门禁基线（阶段末）

| 步骤 | 命令 | 期望 |
|------|------|------|
| 1 | `npm run build` | 幂等；**且不再重生 `.opencode/` 受管文件**（复活防护实证） |
| 2 | `npm test` | 全绿（基线 **59 文件 / 979 用例** − 被删测试文件内用例 + op-003 迁移/新增断言 → 以**实测值**记录，不得沿用旧快照） |
| 3 | `npx tsc --noEmit` | 0 |
| 4 | `node bin/openfeel.js lint i18n` | **726 键**（stage-54 后基线；本阶段不增删 i18n 键） |
| 5 | `node bin/openfeel.js lint kb` | **0 过期**（重点：`.opencode/**` 类历史引用的处置） |

### 六.2 翻转清单

| 类别 | 项 | 判定 |
|------|----|------|
| **强制翻转/删除** | `test/core/opencode-instance.test.ts`（**整文件**，`:39-98` 全部断言以仓库根 `.opencode` 为对象） | **删除**（对象不存在）；其中 **CRLF 断言（`:78-83`）**、**`external_directory`（`:85-92`）**、**reviewer 纪律节（`:94-98`）** 须**迁移为模板源断言** |
| 既有断言保持 | `test/core/templates.test.ts`（T54 zh/en 代码块等长 `:24-40`、skill 通用检查 `:19-20`、T55 `:42-49`） | 不翻转（F2 未触及 `pending/open` 块；skill 源未动） |
| 既有断言保持 | `test/core/update.test.ts:128-129`（「项目精简：无 `.opencode/`」——对象为 **tmp 项目**） | 不翻转 ✓ |
| 既有断言保持 | `test/core/update.test.ts:402+`、`test/core/migrate.test.ts`、`test/commands/migrate.test.ts`（legacy 布局提示，对象为 **tmp 项目/fixture**） | 不翻转 ✓ |
| 既有断言保持 | `test/core/global-paths.test.ts`、`test/core/model-config.test.ts`（路径函数与模板源） | 不翻转 ✓ |
| **建议新增断言** | ① 「仓库根不存在项目级受管资产」：`AGENTS.md` / `opencode.jsonc` / `.opencode/agents` / `.opencode/skills` / `.opencode/ADAPTER.md` 均不存在（防回归：防止重新引入） | op-003 |
| | ②「build 不复活」：断言 `build.js` 源码中不含 `regenerateOpencodeInstance`（静态断言，轻量） | op-003 |
| | ③ 模板含「模块手册」节（zh/en 各 1 条） | op-004 |

> **门禁数字说明**：删除 `opencode-instance.test.ts` 会减少用例数（该文件 **7 个 `it`**）——**不得**在计划与归档中固化为「979」，须以 op-004 实测记录（预期 ≈ 979 − 7 + 迁移/新增，按实测）。

---

## 七、风险与回滚

| # | 风险 | 影响 | 缓解 / 回滚 |
|---|------|------|-------------|
| R-1 | **全局刷新失败/降级**（`setup` 中途失败、模板异常） | 高（agent/skill 加载异常） | ① 备份先行（F1 步骤 2）→ 整目录恢复；② `setup` 内置写前备份（`deployGlobalAsset` + `~/.openfeel/backup/{ts}/`）可逐文件回滚；③ **门 B 未过不得进 F3** |
| R-2 | 删除后**无法回退**（误删有用资产） | 中 | 全部删除对象**受 git 跟踪** → `git checkout <sha> -- AGENTS.md opencode.jsonc .opencode/` 完整恢复；F4 的 build 步骤亦可 `git revert` 恢复 |
| R-3 | `npm run build` **复活**受管文件（若无 F4） | 高 | **F4 消除**（删步骤 8 定义 + 调用）；门 D 以「build 后仍不存在」实证 |
| R-4 | 删根 `opencode.jsonc` 丢失 `permission: "allow"` 语义 | 中 | 全局 jsonc **已有** `default_agent` + 模型；各 agent `.md` 声明 `external_directory: "allow"`（**同键 agent 优先**）→ 预期不影响；**F7 新会话验证**确认；若异常 → 在**全局** jsonc 补等价键（不改仓库） |
| R-5 | 删根 `AGENTS.md` 后全局约束**未自动加载** | 高 | 事实依据：v1.1.1 实测「全局 AGENTS.md **自动加载**」（`opencode-config.ts:24` 注释），全局 jsonc 不设 `instructions`；**F7 新会话验证**为唯一权威判据 |
| R-6 | `lint kb` 因 `.opencode/**` 历史引用判过期 | 中 | 原则：**历史只读不改写** → 优先「去反引号 / 加占位标记」；**不删历史内容**；必要时在 `manual/core/build.md` 说明 |
| R-7 | 测试覆盖缺口（删除 `opencode-instance.test.ts` 后 CRLF/权限断言丢失） | 中 | F4 要求**迁移**三条断言（CRLF / external_directory / reviewer 纪律节）到模板源；op-003 报告须登记「迁移去向」对照 |
| R-8 | `.opencode/node_modules` 被误删 | 高（本机 opencode 运行环境） | F3 明确「保留 4 项运行时目录」；验收含 `Test-Path .opencode/node_modules` |
| R-9 | 删除时误伤未跟踪/本地文件 | 低 | 使用 `git rm`（仅跟踪文件）；删除前后 `git status` 对照 |

---

## 八、裁定表

| # | 议题 | 建议结论 | 依据 | 状态 |
|---|------|----------|------|------|
| **A1** | 执行顺序微调（F2 先于 F1） | **采纳**：模板迁入 → 刷新全局 → 删除（**不变量**：刷新严格早于删除） | 避免二次刷新；用户裁定的关键顺序（先刷新后删）不变 | planner 建议 + **待 Feel/用户确认** |
| **A2** | 根 `AGENTS.md` 的「版本管理」（`125-137`）是否迁移 | **不迁移**（信息已在 `package.json` / `CHANGELOG` / `roadmap`；模板 `:122-134` 已有通用版本管理节，且其 `:134` 已载「当前 v1.1.2」） | 避免双权威源；用户裁定仅指定迁「模块手册」 | planner 建议 + **待 Feel/用户确认** |
| **A3** | 刷新全局的命令 | **`openfeel setup`**（纯全局、幂等、带写前备份）；**不用 `update`**（会触碰项目侧文件） | `setup.ts:29-110` vs `update.ts:1572+`（读源码） | planner 建议 + **待 Feel/用户确认** |
| **A4** | `docs/GETTING_STARTED.md:127` 死链处置 | **删除该行**（或改为无链接文字指引）——**不得留死链** | 指向被删文件 | planner 建议 + **待 Feel/用户确认** |
| **A5** | `test/core/opencode-instance.test.ts` 处置 | **删除文件 + 迁移 3 组仍有效断言**（CRLF / `external_directory` / reviewer 纪律节 → 模板源）；并新增「仓库无项目级受管资产」防回归断言 | 断言对象消失；避免覆盖缺口 | planner 建议 + **待 Feel/用户确认** |
| **A6** | `.opencode/` 运行时目录（node_modules 等 4 项） | **保留**（不属于「项目级约束与 Agent」范畴；删除会破坏本机 opencode 环境） | 用户裁定删除范围为 agents/skills/ADAPTER；运行时目录未列 | **已由用户裁定范围推定**（如需变更由 Feel/用户裁决） |
| **A7** | kb 历史条目的 `.opencode/**` 引用 | **只读不改写**（追加 supersede 注记；必要时去反引号以满足 `lint kb`） | 知识库历史性质（沿用 stage-51 A7 口径） | planner 建议 + **待 Feel/用户确认** |
| **A8** | 本阶段是否含 `npm publish` | **不含**（用户指令：收尾 → 清项目级 → **之后**发布） | 用户明确指令 | **已由用户指令确定** |

> **溯源**：A1~A5/A7 为 planner 建议并附依据（**待确认**）；A6 由用户删除范围推定；A8 直接来自用户指令。本计划**不虚构确认来源**。

---

## 九、验收标准（阶段级）

1. **模板层**：`templates-data/agents-md/{zh-CN,en}.md` 均含「模块手册 / Module Manuals」节；`npm run build` 幂等。
2. **全局层**：全局 skills = **17**（含 `openfeel-cli-usage`）；全局 `AGENTS.md` 含「模块手册」节；全局 agents = 9；全局 `opencode.jsonc` 保留 `default_agent` + 2 处模型覆盖；**备份快照存在**。
3. **删除层**：根 `AGENTS.md`、根 `opencode.jsonc`、`.opencode/{agents,skills,ADAPTER.md}` **均不存在**；`.opencode/` 仍含 4 项运行时目录。
4. **防复活**：`build.js` 无 `regenerateOpencodeInstance` / `insertGeneratedMark`；`npm run build` 后上述 5 项**仍不存在**。
5. **引用同步**：`docs/` 无指向 `../AGENTS.md` 的死链；`manual/core/build.md` 步骤 8 标注已移除；`lint kb` **0 过期**。
6. **supersede**：`kb/architecture.md` 的 N1 条目含 2026-10-01 supersede 注记；`dev/decisions.md` 有对应 ADR（如启用）。
7. **测试**：`test/core/opencode-instance.test.ts` 已删且 3 组断言已迁移（登记去向）；新增防回归断言通过；`npm test` 全绿（按实测记录文件/用例数）。
8. **门禁**：`build` 幂等、`tsc` 0、`lint i18n` 726 键、`lint kb` 0 过期。
9. **新会话验证**：指引已交付并由用户执行确认（agent / skill / 约束 / default_agent）。
10. **无越界**：未改 `flow.json`；未创建 op 文件；未改 `src/**`（除 `build.js` 与模板）；未执行 `npm publish`。

---

## 十、修订记录

| 时间 | 制定人 | 版本 | 说明 |
|------|--------|------|------|
| 2026-10-01 | openfeel-planner | v1 | 初稿：F1~F7（7 项）、执行顺序（**F2 → F1 → F3**，含微调说明）、安全门 A~E、op 划分（4 op）、§二 盘点 13 条（含源码级复核）、裁定 A1~A8、风险 R-1~R-9、验收 10 条 |


