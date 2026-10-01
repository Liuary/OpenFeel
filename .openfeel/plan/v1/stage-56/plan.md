# v1.1.2-stage-56 计划 — 发布前收尾（遗留清理 + skill 全量对齐 + 全局刷新 + 发布就绪）

- **阶段**：`v1.1.2-stage-56`
- **依赖**：`hard: v1.1.2-stage-55`（已登记）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-01
- **定位**：v1.1.2 **发布前最后一轮收尾**——清掉发布前应修的遗留项，随后 `npm publish`。本阶段是「收尾」，**不含实际 `npm publish`**（由用户决定执行）。
- **用户长期指示（须贯彻）**：跨项目/版本可能已解决 → **重复项仅标记 + 验证**，每条先**实测验证**，已解决项仅登记不修。
- **范围约束**：不改业务源码（允许改：`templates-data/**` 模板、`docs/**`、`.openfeel/**`、`manual/**`、`CHANGELOG.md`、`build.js` 注释、`src/core/managed-region.ts` 注释）；**不改 `flow.json`**；**不创建 op 文件**（由 openfeel-schemer 产出）；**不执行 `npm publish`**。
- **KB 检索**：已加载 `openfeel-check-kb`。相关条目：`kb/patterns.md #CLI 用法 skill 化（权威源单文件 + build 双注入 + 快照声明）`、`#CLI --json 结构化输出约定`、`#CLI 退出码语义`、`#命令面收敛与弃用策略`、`#部署语境 vs 本仓语境的命令口径二分`、`#真实全局目录操作的安全程序（全量备份+判据门+回滚）`、`#死导出/漂移 API 清理判据`、`#新增输出键/契约的同步面清单`、`#REV/缺陷状态收口的分层口径`、`kb/architecture.md #仓库自身不再保留项目级部署资产（supersede N1）`、`kb/troubleshooting.md #文档根因须实测复核`、`#多源文案同步陷阱`、`#新增输出键/契约的同步面清单`。

---

## 一、用户裁定 / 边界（不可推翻）

| 项 | 裁定 |
|:--:|------|
| 用户长期指示 | 重复项**先实测验证**，已解决项**仅登记不修**（跨版本可能已解决） |
| 本阶段性质 | **发布前最后收尾**；`npm publish` 在本阶段**之后**由用户决定 |
| 全局刷新 | 改模板/skill 后须 `npm run build` **并** 执行一次 `openfeel setup` 刷新 `~/.config/opencode/**`（否则全局副本滞后）；**这是本阶段唯一触碰真实全局目录的操作**，须先备份 |
| 不改 `flow.json` | 状态推进由 Feel 执行 `openfeel flow advance`，planner 不写 flow.json |
| 不创建 op 文件 | op 文件由 openfeel-schemer 统一产出 |

---

## 二、盘点实测结论总表（S1~S6）

> 全部结论以本轮**命令实测**（`node bin/openfeel.js <cmd> --help`、`rg`、源码交叉验证）为准。

| # | 主题 | 实测结论 | 依据（本轮命令/证据） |
|:-:|------|----------|----------------------|
| **S1** | `flow phases --json` 键数 | **仍存在**：实测 **5 键**（`schemaVersion`/`phases`/`transitions`/`advanceAccepted`/`transitionsDiff`）；SKILL.md:46（3 键）、`update.ts:419`、`template-loader.ts:6825`（3 键）；`docs/commands.md:91`、`manual/cli/commands.md:65`（4 键，缺 `schemaVersion`）；`CHANGELOG.md:8`（3 键） | `node bin/openfeel.js flow phases --json` 实测输出 5 键；`rg "advanceAccepted"` 定位全部载体 |
| **S2** | `openfeel-cli-usage` skill 全量对齐 | **仍存在**：13 项遗漏（命令/子命令/参数）+ 1 处错误（`:82`）+ 1 张过时表（「本版本新增」旧 4 条） | 逐条 `--help` 实测：`flow ops list`、`plan scheme remove/rename/publish`、`flow stage set --deps`、`stage set --exec-mode/--auto-advance/--review-agent`、`stage task --add`、`plan stage add --tasks`、`flow health --fix`、`flow advance --quiet`、`flow status/current/health/metrics/overview --json`、`knowledge dedup` 等**全部真实存在**（详见 §三） |
| **S3-1** | `REV-U4-002` en.md 图注未译 | **部分存在**：现为 `验收不通过 / review failed`（en.md **仅剩 1 行 CJK**）；语义已可达，但中文残留 | `Select-String en.md '[\u4e00-\u9fff]'` → 仅 494 行 |
| **S3-2** | `REV-U4-004` build.js 注释漂移 | **已解决**：`build.js:962/1016/1021/1036` 已为**两对**；步骤 8 注释/计数（8/14）已随 stage-55 删步骤 8 消失 | `rg "三对|两对|8 带前缀|14 带前缀" build.js` → 仅「两对」；步骤 8 已移除 |
| **S3-3** | `REV-U8-003` `atomicWriteJson` 零调用 | **已解决**：`atomic-write.ts:105` 已有「**预留 API**…若移除须同步删对应测试（T23）」注释（stage-50 T22-37 落地） | `rg atomicWriteJson` + 读 `atomic-write.ts:102-112` |
| **S3-4** | `REV-U8-011` mergeFrontmatter 注释不符 | **仍存在**：`managed-region.ts:182` 注释「**字段级白名单**（REV-904）」，实现为 `{...existing, ...incoming}` **全量 spread**（无白名单过滤） | 读 `managed-region.ts:180-191` |
| **S3-5** | `REV-U8-012` 文档行号/措辞漂移 | **仍存在（③）**：`manual/core/backup.md:36`「**每次命令一个独立目录**」——cachedTs 为进程级缓存，实为「每进程」；①② 为历史方案文件 `op-008.md`（**前 62 行内不改**） | 读 `backup.md:36`；读 REV-U8-012 原文 |
| **S4** | Bug 索引计数一致性 | **仍存在**：公域 `.openfeel/bugs/index.md` = open 1 / closed **14** / 合计 **15**；私域 `.openfeel/users/Liuary/bugs/index.md` = open 1 / closed **16** / 合计 **17**；实测私域 `BUG-*.md` 文件数 = **17** | `Get-ChildItem -Recurse bugs -Filter BUG-*.md` 计数 = 17；两 index 读原文。**差异 2 条 = `kb/BUG-001`（模块整个缺失）+ `templates/BUG-001`（公域明示「未收录」）**——非 Feel 疑测的 cli/BUG-005/006（二者在公域已列） |
| **S5** | build 传播 + 全局副本刷新 | **须执行**：全局 skills=17/agents=9 已在；但**全局 skill 与权威源不等**（全局含 `<!-- openfeel:begin/end -->` 包裹 + YAML description 折叠，哈希不同）→ 改源后必须 `npm run build` + `setup` | `Get-FileHash` 全局 vs 源 = 不同；全局文件读头尾确认 markers |
| **S6** | 回归门禁 + 发布就绪 | **基线复核通过**：`npm test` **59 文件 / 985 用例全绿**；`tsc` **0**；`lint i18n` **726 键**（exit 0）；`lint kb` **0 过期**（248 引用）；`--version` = **1.1.2**；`npm pack --dry-run` = **263 文件 / 554.5 kB** | 本轮全部实跑 |

---

## 三、编号化清单（S1~S6 细化）

### S1 — `flow phases --json` 键数全链路同步

**权威源 → build 传播 → 全局副本 完整同步链**：

```
权威源  src/core/templates-data/opencode/skills/openfeel-cli-usage/SKILL.md:46
  └─ build.js 步骤 4（:176-204）→ src/core/update.ts  SKILL_DEFINITIONS 生成段（:419）
  └─ build.js 步骤 6（:258-292）→ src/core/template-loader.ts OPENCODE_SKILL_DEFINITIONS 生成段（:6825）
  └─ node bin/openfeel.js setup → 全局 ~/.config/opencode/skills/openfeel-cli-usage/SKILL.md
手写文档（不经 build，须手工同步）：
  docs/commands.md:91、.openfeel/manual/cli/commands.md:65、CHANGELOG.md:8
```

| 编号 | 目标 | 精确改动点（文件:行号 → 现状 → 改后） | 影响文件 | 验收要点 |
|:--:|------|--------------------------------------|----------|----------|
| **S1-1** | 权威源键数 | `SKILL.md:46`：`{ phases, transitions, advanceAccepted }` → `{ schemaVersion, phases, transitions, advanceAccepted, transitionsDiff }` | `templates-data/.../SKILL.md` | 与 `flow phases --json` 实测 5 键逐字一致 |
| **S1-2** | docs 键数 | `docs/commands.md:91`：`{ phases, transitions, advanceAccepted, transitionsDiff }` → **补 `schemaVersion`**（5 键） | `docs/commands.md` | 文案含 5 键名 |
| **S1-3** | manual 键数 | `.openfeel/manual/cli/commands.md:65`：4 键 → **补 `schemaVersion`**（5 键） | `manual/cli/commands.md` | 同上 |
| **S1-4** | CHANGELOG 键数 | `CHANGELOG.md:8`（[1.1.2] Added）：3 键 → 5 键（`schemaVersion`/`transitionsDiff` 已被同版 Changed 行覆盖，此处补全初稿描述） | `CHANGELOG.md` | [1.1.2] Added 行含 5 键 |
| **S1-5** | 生成段传播 | `update.ts:419`、`template-loader.ts:6825`（**禁手改**）→ 由 op-004 `npm run build` 从 S1-1 重生成 | 生成段（build 产物） | `npm run build` 后 `rg` 生成段 = 5 键；build 幂等 |

> **同时**：`update.ts:455`、`template-loader.ts:6861` 是同一 skill 正文的 `:82` 错误行，随 S2-2 一并传播。

### S2 — `openfeel-cli-usage` skill 全量对齐 v1.1.2（本阶段主要工作量）

**定位边界不变**：查询型参考手册（只读、不自执行）；与 `openfeel-wizard`（执行型向导）互引边界不变；保留「本仓 `node bin/openfeel.js` / 安装后 `openfeel`」**双口径**与「以 `--help` 实时输出为准」**快照声明**。

**逐条实测复核结论（对应任务清单 13 项遗漏 + 1 错误 + 1 过时表）**：

| 编号 | 遗漏/错误项 | 实测验证（本轮 `--help`） | 结论 |
|:--:|-------------|---------------------------|------|
| **S2-1** | `flow ops list [--stage <id>] [--json]`（stage-52 B3） | `flow ops list --help` 实测存在 | 补 |
| **S2-2** | `plan scheme remove <stage> <opId> [--force] [--dry-run]`（stage-51 N1） | 实测存在（仅删 flow.json 键，不删 op 文件） | 补 |
| **S2-3** | `plan scheme rename <stage> <opId> --title <text>`（stage-52 B6） | 实测存在 | 补 |
| **S2-4** | `plan scheme publish <stage> <opId>` + `plan scheme create --draft`（stage-52 B4） | 实测存在（draft→pending；publish 校验非空） | 补 |
| **S2-5** | `flow stage set <stageId> --deps <ids...>`（stage-51 N2） | 实测存在（覆盖写入；不带 `--deps` 视为清空） | 补 |
| **S2-6** | `stage set --exec-mode <manual\|auto>` / `--auto-advance <enabled\|disabled>` / `--review-agent <agent>` + **幂等语义**（stage-51 N7） | 实测存在；手动读 `manual/cli/commands.md:90` 确认「同值 no-op + 按需 `.bak`」 | 补 |
| **S2-7** | `stage task --add <desc>` / `--done` / `--undone`（stage-51 N6） | 实测存在 | 补 |
| **S2-8** | `plan stage add --tasks "<t1>" "<t2>"`（stage-51 N6） | 实测存在（生成到 status.md；与 `stage task --add` 同函数） | 补 |
| **S2-9** | `flow health --fix [--dry-run]` + `--quick` + `--json`（stage-52 B2） | 实测存在（`--fix` 仅回写 status.md「状态」字段） | 补 |
| **S2-10** | `flow advance --quiet`（stage-51 N11）+ `--to <远距 phase>` 自动逐步 + `--dry-run` 完整路径（stage-52 B5） | 实测存在（`--quiet`/`--dry-run`）；自动逐步见 `CHANGELOG:59`「存在唯一路径时自动逐步推进」 | 补 |
| **S2-11** | `flow status/current/health/metrics/overview` 的 `--json`（stage-52 B1） | 实测五命令均含 `--json`（纯 JSON 单文档 + `schemaVersion`） | 补 |
| **S2-12** | `knowledge dedup [content] [--project] [--category] [--threshold]`（stage-51 A6）+ `knowledge index` / `knowledge add` 宽容解析（stage-51 N9） | 实测存在；REV-51 载「宽容解析对象为 index/add」（本仓自定义格式 index.md 解析成功） + `addKnowledgeEntry ... safeTitle` 写入 | 补 |
| **S2-13** | `lint i18n` / `lint kb` **非 0 退出**语义（stage-50 R1） | `src/commands/lint.ts:29-44` 实测 `process.exitCode = 1` | 补 |
| **S2-14** | `config set/get` 支持**全量 `defaults.*`**（stage-50 R3） | `docs/commands.md:406` + `manual/cli/commands.md:79` 实测；schema 驱动 + 值类型归一 | 补 |
| **S2-15** | flow 子命令枚举补 `ops` / `migrate`（漏列）+ `repair --prune-orphans`（stage-51 A2） | `flow --help` 实测含 `ops`/`migrate`；`flow repair --help` 含 `--prune-orphans` | 补 |
| **S2-16** | `flow review update|remove`（stage-51 N2）+ `view add` **已移除**（stage-52 A4，改用 `flow review add`） | `manual/cli/commands.md:86-105` 实测；CHANGELOG Removed | 补 |
| **S2-2 错误** | `SKILL.md:82`：`advanceAccepted` 被误称「组合条件路径」 | 实为**内置 15 个 phase 名列表**（`flow.ts:402-405`：`advanceAccepted: [...PIPELINE_PHASES]`） | 改为准确表述 + 注明 stage-50 裁定 |
| **S2-3 过时表** | `SKILL.md:42-49`「本版本（v1.1.2）新增」旧 4 条 | 未覆盖 stage-41~55 实际新增 | **重写**（见 §四） |

**S2-2（错误）精确改动点**：

| 文件:行号 | 现状 | 改后 |
|-----------|------|------|
| `SKILL.md:82`（生成段 `update.ts:455`/`template-loader.ts:6861`） | `- 推进：\`openfeel flow advance --stage <id> --to <phase>\`（组合条件路径另见 \`advanceAccepted\`）。` | `- 推进：\`openfeel flow advance --stage <id> --to <phase>\`。**\`advanceAccepted\` = 内置 15 个 phase 的「推进白名单」**（\`flow advance\` 只接受这 15 个值），**不是**组合条件路径。**组合条件差异**（如内置默认含 \`review_passed\|test_passed\`，本仓 \`pipeline.yaml\` 未列）经 \`--json.transitionsDiff.missing\` **显式可见**（stage-50 裁定：**不补组合键**，改以 \`transitionsDiff\` 显式化）。` |

**S2-3（过时表）重写**：见 §四「skill 重写方案」。

- **影响文件**：`src/core/templates-data/opencode/skills/openfeel-cli-usage/SKILL.md`（唯一权威源）→ op-004 build 传播至 `update.ts` / `template-loader.ts` → op-004 `setup` 传播全局。
- **验收要点**：`SKILL.md` 覆盖上表 16 项；`:82` 表述准确；`rg "组合条件路径" SKILL.md` 零命中；`npm run build` 幂等；`lint i18n` 仍 726 键。

### S3 — 5 条 trivial REV 顺带清

| 编号 | REV | 判定 | 精确改动点 | 验收 |
|:--:|-----|------|-----------|------|
| **S3-1** | `REV-U4-002` | **部分存在**（en.md 仅剩 494 行 CJK） | `templates-data/agents-md/en.md:494`：`验收不通过 / review failed` → `acceptance rejected`（纯英文，与 en 侧全文一致） | `Select-String en.md '[\u4e00-\u9fff]'` = **0 行**；`npm run build` 传播 |
| **S3-2** | `REV-U4-004` | **已解决** | **不修**（`build.js` 已为「两对」；步骤 8 已删） | 登记：`rg "三对\|8 带前缀\|14 带前缀" build.js` = 0 |
| **S3-3** | `REV-U8-003` | **已解决** | **不修**（`atomic-write.ts:105` 已有「预留 API」注释） | 登记：注释存在 |
| **S3-4** | `REV-U8-011` | **仍存在** | `src/core/managed-region.ts:182`：`* 合并 frontmatter（REV-904）字段级白名单（浅合并）` → `* 合并 frontmatter（REV-904）：incoming 全字段覆盖 + existing 独有字段 passthrough（浅合并，无白名单过滤）` | 注释与实现 `{...existing, ...incoming}` 一致；`update.test.ts:721` 断言不翻转 |
| **S3-5** | `REV-U8-012` | **仍存在（③）** | `.openfeel/manual/core/backup.md:36`：「每次命令一个独立目录」→「**每进程（通常即每命令）一个独立目录**（`cachedTs` 为进程级缓存）」；①② `op-008.md` 历史方案文件**不改**（仅登记） | 措辞与 `backup.ts:36-40` 一致 |

- **影响文件**：`agents-md/en.md`、`managed-region.ts`（注释）、`manual/core/backup.md`。
- **REV 状态收口**：S3-1/S3-4/S3-5 修后由 openfeel-reviewer/feel-tester 置 `resolved→closed`；S3-2/S3-3 登记「已解决」并置 `closed`（**须在 REV 文件中留痕，不改历史原文**）。

### S4 — Bug 索引计数一致性

**实测比对**：

| 索引 | open | closed | 合计 | 实测文件数 |
|------|:--:|:--:|:--:|:--:|
| 公域 `.openfeel/bugs/index.md` | 1 | 14 | **15** | — |
| 私域 `.openfeel/users/Liuary/bugs/index.md` | 1 | 16 | **17** | **17** |
| **差异** | 0 | **2** | **2** | — |

**差异 2 条**：
1. `kb/BUG-001`（`lint kb 重复引用未检出`，closed）——公域**整个 `kb` 模块缺失**（无 `.openfeel/bugs/kb.md`）。
2. `templates/BUG-001`（规则版本标识未加前缀，closed）——公域 index 尾部注记「**未收录本目录**」（有意保留私域）。

> **更正 Feel 盘点的疑测**：差异**不是** `cli/BUG-005`/`cli/BUG-006`（二者公域已列，状态 closed），而是上述 2 条。

**修正方案（推荐补齐，使公域与实际一致 → 17）**：
- S4-1：新建 `.openfeel/bugs/kb.md`（模块摘要：`kb/BUG-001` 结论 + 根因 + 修复要点），并在公域 `index.md` 新增「### kb」段 + `kb/BUG-001` 行。
- S4-2：公域 `index.md` 的「### templates」段补 `templates/BUG-001` 行；删除/改写尾部注记中「templates BUG-001 未收录」表述。
- S4-3：公域 `index.md` 统计表改为 **open 1 / closed 16 / 合计 17**，与私域及实测文件数一致。
- **备选方案（保留设计）**：维持 15，但把尾部注记改写为显式「公域为**核心结论摘要**，`kb/BUG-001` 与 `templates/BUG-001` **有意不收录**（仅私域），故公域计数 = 实际 − 2」——**列为待裁定 A4**。
- **验收**：公域统计 = open 1 / closed 16 / 合计 17（或备选方案注记显式说明）；`node bin/openfeel.js lint kb` 0 过期（`kb.md` 新增引用须有效）。

### S5 — `npm run build` 传播 + 全局副本刷新（**唯一真实全局目录操作**）

**安全程序（参照 stage-55 op-002）**：

| 步骤 | 动作 | 命令/判据 |
|:--:|------|-----------|
| S5-1 | **先构建** | `npm run build`（幂等；`node bin/openfeel.js` 走 `dist`） |
| S5-2 | **人工整目录备份**（仓库外） | `Copy-Item -Recurse "$env:USERPROFILE\.config\opencode" "$env:TEMP\opencode\stage56-global-backup"` + SHA256 清单；`Test-Path` 真 + 计数 > 0 → **失败即停** |
| S5-3 | **刷新全局** | `node bin/openfeel.js setup`（纯全局、幂等、带写前备份 `~/.openfeel/backup/{ts}/`） |
| S5-4 | **门判据（内容级）** | ① 全局 skills = **17**；② 全局 `openfeel-cli-usage/SKILL.md` 的 **managed-region 正文**（`<!-- openfeel:begin -->`…`end`）与权威源**正文一致**（**排除 markers 与 YAML description 折叠差异**——`Get-FileHash` 逐字节比对会误判）；③ 全局 `AGENTS.md` 与模板受管区一致；④ 全局 agents = **9**；⑤ 全局 `opencode.jsonc` 保留 `default_agent` + `$schema`；⑥ 备份目录存在 |
| S5-5 | **仓库零变化** | `git status --porcelain` 不因 `setup` 变化（`setup` 不动项目） |

- **顺序不变量**：`npm run build` 与**本地门禁（S6）通过之后**，才执行备份 + `setup`。
- **回滚**：`Remove-Item -Recurse` 全局目录后从备份恢复；或依赖 `~/.openfeel/backup/{ts}/` 逐文件回滚。

### S6 — 回归门禁 + 发布就绪复核

| 编号 | 命令 | 期望（本轮基线实测） |
|:--:|------|----------------------|
| S6-1 | `npm run build` | 幂等；**且不复活 `.opencode/agents\|skills\|ADAPTER.md`**（stage-55 防复活） |
| S6-2 | `npm test` | **59 文件 / 985 用例 0 skipped**（不因本阶段降至基线以下） |
| S6-3 | `npx tsc --noEmit` | **0** |
| S6-4 | `node bin/openfeel.js lint i18n` | **726 键**一致（exit 0；R1 后失败非 0 退出） |
| S6-5 | `node bin/openfeel.js lint kb` | **0 过期**（当前 248 引用） |
| S6-6 | `node bin/openfeel.js --version` | **1.1.2** |
| S6-7 | `npm pack --dry-run` + `npm publish --dry-run` | 复核成功（当前 263 文件 / 554.5 kB）；**不执行实际 `npm publish`** |
| S6-8 | `flow health`（可选） | 空模板告警 0、无新异常 |

---

## 四、skill 重写方案（S2-3 定稿建议）

### 4.1 结构（两段式，避免无限膨胀）

保留现有节骨架，仅调整两处：

1. **`## 命令速查`**（现有表，**补全**缺列命令族：`archive` / `instructions` / `project` / `roadmap` / `view` / `plan scheme`）。
2. **`## flow 子命令`**（现有枚举串，补 `ops` / `migrate`）。
3. **`## v1.1.2 新增能力（stage-41~55）`** ← **替换**原「本版本（v1.1.2）新增」4 条表，改为**分组列表**（不逐条堆表）：
   - **A. 自描述与可纠错（stage-41）**：`flow phases [--json]`（**5 键**）、`flow stage remove --force/--dry-run/--purge`、stageId 校验/冲突检测、`plan stage add --deps`、三入口收敛。
   - **B. 状态与口径（stage-42）**：`config effective [key]`（值+来源）、`pipeline.phase=done`（全量 done 判定）、审计日志 `register_stage`/`register_op`。
   - **C. 部署与备份（stage-46）**：写前备份 `~/.openfeel/backup/{ts}/` + `update_infos.md`「备份」类。
   - **D. 纠正/清理侧命令面（stage-51/52）**：`plan scheme remove/rename/publish` + `create --draft`、`flow stage set --deps`、`flow review update|remove`、`stage set`（幂等 + `--exec-mode/--auto-advance/--review-agent`）、`stage task --add`、`plan stage add --tasks`、`flow repair --prune-orphans`、`flow health --fix`、`flow ops list`、`flow advance --quiet` + `--to` 自动逐步、`knowledge dedup`。
   - **E. 输出/门禁/约定（stage-50/52）**：`flow status/current/health/metrics/overview --json`（`schemaVersion`）、`lint i18n`/`lint kb` **非 0 退出**、`config set/get` 全量 `defaults.*`、`view add` **已移除**（改用 `flow review add`）、`NO_COLOR`/`--no-color`。
4. **`## phase 枚举与转移表`**：保留；修 `:82`（见 S2-2）+ 补 `transitionsDiff` 裁定注记。
5. 其余节（`stageId 命名与目录映射` / `典型场景` / `权限模型要点` / `与 openfeel-wizard 的区别`）保留。

### 4.2 篇幅上限建议

- **≤ 200 行 / ≤ ~14 KB**（当前 120 行 → 预计 160~190 行）。超出即说明堆砌，应改为「分类 + 一行摘要」，细节指向 `--help`。

### 4.3 必须保留（不可删）

- **双口径声明**（SKILL.md:14-16）：本仓 `node bin/openfeel.js`、安装后 `openfeel`。
- **快照声明**（SKILL.md:14）：v1.1.2 快照，命令细节以 `openfeel <cmd> --help` 实时输出为准。
- **边界**：查询型 vs `openfeel-wizard` 执行型；与 `openfeel-tool-usage` 协同。

### 4.4 frontmatter description 更新

`SKILL.md:3` description 的「本版本新增能力（flow phases、flow stage remove、plan stage add --deps、config effective、部署备份）」**已过时** → 改为覆盖 v1.1.2 全部新增（自描述/可纠错/`--json`/`health --fix`/`draft`/`knowledge dedup`/纠正清理侧命令面），保留触发词「CLI 命令、参数、phase、stageId」。

---

## 五、op 划分与执行顺序（4 op，全串行）

| op | 主题 | 覆盖 | 关键产出 | 依赖 |
|:--:|------|------|----------|------|
| **op-001** | **skill 对齐** | S2（含 S1-1） | `templates-data/opencode/skills/openfeel-cli-usage/SKILL.md`：16 项补全 + `:82` 修正 + 过时表重写 + description 更新 + `:46` 5 键 | — |
| **op-002** | **模板与文档同步** | S1-2/S1-3/S1-4 | `docs/commands.md:91`、`manual/cli/commands.md:65`、`CHANGELOG.md:8` | — |
| **op-003** | **5 条 REV** | S3 | `agents-md/en.md:494`（纯英文）、`managed-region.ts:182`（注释校准）、`manual/core/backup.md:36`（措辞）；REV 状态留痕（S3-1/4/5 修后 resolved；S3-2/3 登记 closed） | — |
| **op-004** | **索引与全局刷新与门禁** | S1-5 + S4 + S5 + S6 | `npm run build` 传播生成段；公域 bug 索引补齐；全局备份 + `setup` + 门判据；`test`/`tsc`/`lint`/`version`/`pack` 复核 | op-001、op-002、op-003 |

**顺序：op-001 → op-002 → op-003 → op-004**（**硬约束：全局刷新（op-004 内）严格晚于 build 与本地门禁**）。

> op-001/002/003 改动文件**互不相交**（skill 源 / docs / 模板+REV），必要时可并行；但 **build、本地门禁、全局刷新统一收口在 op-004**，故建议串行以便门禁一次通过、全局仅刷一次。

**边界声明**：op-004 是本阶段**唯一操作真实全局目录**的 op → 备份先行、逐条判据留痕；全程**不改 `flow.json`**、**不执行 `npm publish`**、**不创建 op 文件**。

---

## 六、测试与门禁

### 6.1 门禁基线（阶段末，实测值）

同 §S6。**数字说明**：本阶段以文案/注释/skill 为主，预期用例数**不变**（985）；若 op-001~003 未新增断言，则 `npm test` 应严格 = 59 文件 / 985 用例；若新增断言（如 skill 键数断言），按**实测值**记录，不得沿用旧快照。

### 6.2 建议新增断言（可选，防回归）

| 类别 | 断言 | 归属 |
|------|------|------|
| S1 防回归 | `flow phases --json` 顶层键含 `schemaVersion`（既有 `flow.test.ts:690` 已覆盖 → **优先复用，不重复新增**） | — |
| S2 防回归 | skill 源含 `advanceAccepted` 的准确表述（可读模板源断言） | op-001/004 |
| S3 防回归 | `agents-md/en.md` 无 CJK（或加 1 条断言） | op-002 |

> **翻转清单**：预计 **0 项强制翻转**（未改行为/契约；`flow phases --json` 契约本就 5 键，本阶段仅同步文案）。

---

## 七、风险与回滚

| # | 风险 | 影响 | 缓解 / 回滚 |
|:-:|------|------|-------------|
| R-1 | **全局刷新失败/降级**（`setup` 中途失败） | 高 | ① 备份先行（S5-2）+ 失败即停；② `setup` 内置写前备份 `~/.openfeel/backup/{ts}/`；③ 整目录回滚 |
| R-2 | **全局 vs 源「逐字节哈希」误判**（全局含 markers + YAML 折叠 → 天然不等） | 中 | **门判据改为内容级**（managed-region 正文比对），不依赖 `Get-FileHash` 全文件 |
| R-3 | **skill 重写引入错误/膨胀** | 中 | build 单源一致性校验（步骤 4/6 断言）+ `lint i18n`/`lint kb` + 篇幅上限 ≤200 行 + `rg "组合条件路径"` 零残留 |
| R-4 | **`setup` 误改仓库文件** | 中 | `setup` 为纯全局；S5-5 断言 `git status` 无变化 |
| R-5 | 公域/私域 bug 索引口径分歧（补齐 vs 保留设计） | 低 | 列**待裁定 A4**；两方案均留痕；`lint kb` 0 过期 |
| R-6 | 改 `agents-md/en.md` 后生成段未同步 | 低 | op-004 `npm run build` 统一传播；`manual`/`docs` 无 en.md 直读 |
| R-7 | `managed-region.ts` 仅改注释却误改逻辑 | 低 | 仅改注释行；`update.test.ts:721` 不翻转；`tsc` 0 |
| R-8 | 历史方案文件被误改（`op-008.md`） | 低 | S3-5 明确**不改**历史方案文件；仅改 `manual/core/backup.md` |

---

## 八、裁定表

| # | 议题 | 建议结论 | 依据 | 状态 |
|:-:|------|----------|------|------|
| **A1** | 生成段传播归属 | 生成段 `update.ts`/`template-loader.ts` **禁手改**，统一由 op-004 `npm run build` 从权威源重生成 | 单源架构 + 零行为变更验证法 | planner 建议 + **待确认** |
| **A2** | `REV-U4-002` 处置 | en.md:494 改为**纯英文** `acceptance rejected`（而非保留中英并列） | en 侧唯一 CJK，双语对齐 | planner 建议 + **待确认** |
| **A3** | `REV-U4-004` / `REV-U8-003` | **已解决 → 仅登记 + 置 closed**，不改代码 | 用户长期指示「已解决仅登记」；实测证据 | planner 建议 + **待确认** |
| **A4** | 公域 Bug 索引 | **推荐补齐至 17**（新建 `bugs/kb.md` + `templates/BUG-001` 行 + 统计 open1/closed16）；**备选**保留 15 并改写注记显式说明 2 条有意排除 | 用户「补齐使其与实际一致」 vs 公域「核心摘要」设计 | **待裁定**（需用户/Feel 定） |
| **A5** | skill 篇幅上限 | **≤ 200 行 / ~14 KB**，超出改「分类 + 一行摘要」 | 查询型手册可读性 | planner 建议 + **待确认** |
| **A6** | `setup` 作为全局刷新命令 | **采用 `openfeel setup`**（纯全局、幂等、带写前备份）；不用 `update` | stage-55 同裁定 | planner 建议 + **待确认** |
| **A7** | `npm publish` | 本阶段**不含实际发布**；仅做 `--dry-run` 复核 | 用户明确指令 | **已由用户指令确定** |
| **A8** | `CHANGELOG.md:8` 是否同步 | **同步**（[1.1.2] 尚未发布，初稿描述补全 5 键） | 发布前文案准确性 | planner 建议 + **待确认** |

---

## 九、验收标准（阶段级）

1. **S1**：`flow phases --json` 5 键与 `SKILL.md:46` / `docs/commands.md:91` / `manual/cli/commands.md:65` / `CHANGELOG.md:8` 逐字一致；生成段由 build 重生成（`rg` 命中 5 键）。
2. **S2**：`SKILL.md` 覆盖 16 项遗漏 + `:82` 准确 + 过时表重写 + description 更新；保留双口径与快照声明；篇幅 ≤ 200 行；`rg "组合条件路径" SKILL.md` 零命中。
3. **S3**：`REV-U4-002`/`REV-U8-011`/`REV-U8-012`(③) 已修；`REV-U4-004`/`REV-U8-003` 登记已解决；5 条状态在 REV 文件中留痕。
4. **S4**：公域 bug 索引与实测一致（推荐 17）或注记显式说明差异；`lint kb` 0 过期。
5. **S5**：全局备份快照存在；`setup` 执行成功；门判据（skills 17 / skill 正文一致 / AGENTS.md / agents 9 / jsonc 保留键 / 备份存在）全过；仓库 `git status` 无变化。
6. **S6**：`build` 幂等且不复活；`npm test` 59/985 全绿；`tsc` 0；`lint i18n` 726；`lint kb` 0；`--version` 1.1.2；`npm pack`/`publish --dry-run` 通过。
7. **无越界**：未改 `flow.json`；未创建 op 文件；未执行 `npm publish`；未改业务源码（限模板/文档/注释/skill）。

---

## 十、修订记录

| 时间 | 制定人 | 版本 | 说明 |
|------|--------|------|------|
| 2026-10-01 | openfeel-planner | v1 | 初稿：S1~S6 逐条**实测验证**（S2 16 项 `--help` 复核、S3 2 条已解决、S4 更正差异为 `kb/BUG-001`+`templates/BUG-001`）；skill 两段式重写方案 + ≤200 行上限；op 划分 4 个（skill / 模板文档 / REV / 索引+全局+门禁）；S5 全局刷新安全程序（备份+内容级门判据+回滚）；裁定 A1~A8（A4 待裁定） |
