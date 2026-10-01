# Bug 归档索引（公共域）

> 汇总各模块 Bug 归档结论（按模块组织）。私域 Bug 条目关闭后，核心结论归入本目录对应模块文件。
> 详细登记、复现步骤与验收记录见私域 `.openfeel/users/{username}/bugs/{module}/`。

## 统计

| 状态 | 数量 |
|------|:--:|
| open | 0 |
| fixed | 0 |
| closed | 18 |
| **合计** | **18** |

> **v1.1.2-stage-43 收口（2026-09-29，commit `cbc606f`）**：`config/BUG-004`（medium，测试隔离缺口）经 openfeel-feel-tester **外部独立进程比对**验收**关闭**——`identity.test.ts`（11/11）与全量 `npm test`（41 文件 / 694 用例）前后真实 `~/.openfeel/config.json` 的 **mtime + SHA-256 均不变**；修复＝N4 单点 `vi.mock('node:os')` + 删除 `savedConfig` 伪隔离 + 新增只读隔离守护用例。**新登记 `cli/BUG-003`**（low，非阻塞）：`flow phases --json` 的 `--help` 文案只列 `{ phases, transitions }`，实际输出含 `advanceAccepted`（`cli/BUG-001` 修复的收尾遗漏）——**裁定归下一版本或由用户决定**，v1.1.2 不修。至此 v1.1.2 遗留缺陷清零（仅 1 条 low 非阻塞顺延）。
>
> **v1.1.2-stage-47 集中清理收口（2026-09-29，commit `2fb38fa`）**：6 个 `resolved` Bug 经 openfeel-feel-tester 隔离端到端验收**全部通过并关闭**（每条的根因 / 修法 / **防再犯** 三要素已写入对应模块文件）；`config/BUG-001` 复核维持 closed。验收中新登记 `config/BUG-004`（medium，测试隔离缺口，非阻塞，**归档官裁定归属 `v1.1.2-stage-43`**——发布前清零点，含 455 条历史死映射评估）。
>
> 本批共性防再犯（跨模块）：① **写策略按资产归属二分**（用户配置不覆盖 / 框架资产备份后覆盖，见 `config/BUG-002`）；② **文案变更收尾必做关键句全仓 `rg`**（见 `templates/BUG-002`，与 `templates/BUG-001` 同模式重复发生；`cli/BUG-003` 为同类「新增输出字段未同步 help 文案」变体）；③ **测试禁止直写真实全局目录**（保存/恢复≠隔离，见 `config/BUG-004`）；④ **验收/门禁命令用 `node bin/openfeel.js`**（PATH 全局旧版会给出错误口径）。
>
> **v1.1.2-stage-48 事件加固收口（2026-09-29，commits `afe93dd`~`b3b9b58`）**：① `cli/BUG-003`（low，`flow phases --json` help 缺 `advanceAccepted`，遗留 #1；即上方 stage-43 收口注中「顺延下一版本」者）经 op-004 修复（i18n 真源 + `flow.ts` fallback 双处）并由测试官验收**关闭**；② **新登记 `templates/BUG-003`**（low，非阻塞，open）——部署到用户全局环境的 skill 模板被改为 `node bin/openfeel.js`，用户项目无本仓 `bin/` 故不可执行，与 agent / agents-md「保留裸 `openfeel`」裁定口径相反；**建议与 `REV-v1.1.2-stage-48` REV-009 合并移交 `v1.1.2-stage-49`（U4/U6/U7）**。本阶段三大过程事件（审查官幻觉 / `npm test` 覆写真实环境 / 裸跑命中全局旧版）已机制加固，其防再犯条目见 `kb/patterns.md`（干净机器验证法 / 环境哈希守卫 / REV 可信度声明）、`kb/troubleshooting.md`（真实环境一次性数据清理规范）；`profile.yaml` 健壮性（非法 YAML 不覆盖）与 455 条死映射清理（455→0）为遗留 #7/#8/#13 落地点，均非 Bug 单（未开单）。
>
> **v1.1.2-stage-49 收口（2026-09-30，commits `3f023e3`/`1a8546a`）**：**本轮无新 Bug 登记**——整仓全量审查的 4 条 blocking（dry-run 写盘 / 悬空依赖 / postinstall 失效+engines / VERSION 死导出）以 **REV** 形式登记（见 `code_review/v1.1.2-stage-49.md`）并经 `op-010`/`op-011` 修复闭环，未开 Bug 单。`templates/BUG-003`（low）经 **U4-REV-001** 合并处置：范围由 29 行/2 skill **扩至 34 行/5 skill**，**裁定归后续补丁阶段**（状态维持 `open`）。统计维持 **10 条（open 1 / closed 9）**。
>
> **v1.1.2-stage-50 收口（2026-09-30，commits `feae65e`~`def6a33`）**：① **`templates/BUG-003`（low）关闭**——5 个部署型 skill 模板「用户环境主口径 `openfeel <cmd>` + 本仓自举加注」双口径落地（`node bin/openfeel.js` 计数各 = 1 仅加注行），3 个原无加注 skill（health/model-check/recover）补齐，`npm run build` 幂等；满足与 `U4-001` 的关闭条件（op-006 T53）。② **新登记 `cli/BUG-004`**（low，open，非阻塞）——en 模式下 `--help` 的 Arguments 描述仍为中文（T38 只落地 `walkCmd` 遍历机制，23 处 `.argument()` 仅 `stage.create` 补键）；**建议归 `v1.1.2-stage-51`**（该阶段大量触及 CLI/i18n，与 REV-004 下版本 `view add` 移除一并收口）。统计 **11 条（open 1 / closed 10）**。
>
> **v1.1.2-stage-53 收口（2026-10-01，commits `627805e`/`3792b77`/`ae0d6e2`/`4377822`/`27ce06e`）**：**新登记 `templates/BUG-004`（low）并就地关闭**——迁移后本仓 `current.md` 统计行沿用「stage-53 执行中」快照、用例数陈旧（**942 vs 实测 949**），且「执行中」与总进度行「已收官 ✅」措辞扞格；**归属裁定**：载体为本仓 `.openfeel/dev/current.md`（可本地修正，非模板权威源）→ **归档官就地修正**（用例数 942→949 + kb 计数随归档刷新 182→187 + stage-53 记录「执行中」→「归档完成」）并写入 `.openfeel/bugs/templates.md`。统计 **12 条（open 0 / closed 12）**。防再犯：统计行 = 快照，末次提交必回写 + 记录措辞与总进度行一致，归档纳入固定检查点。
>
> **v1.1.2-stage-51 收口（2026-10-01，commits `5ebd114`/`b538bdc`/`1aba277`/`b59705a`/`34385a4`）**：**`cli/BUG-004`（low）关闭**——en 模式下 `--help` 的 Arguments 描述仍为中文的问题，由 op-002（5）/ op-005（8）/ op-007（3 + 新增 1）/ op-008（4）分派补齐 **20 处（+1 新增）** `help.<path>.arg<name>` 双语键，op-009 增**运行时全量枚举门禁**（en 下 `Arguments:` 段 CJK 零命中，**33 个含位置参数的命令**）；测试官隔离 HOME + en 项目验收通过（6 用例全绿、`lint i18n` 649 键对称）。口径澄清：「23 处」为记录时点静态计数，实际修复面 = 20 存量 + 1 新增 + 1 已补（`stage.create`）。**自 v1.1.2 起累计 Bug 全部清零：11 条（open 0 / closed 11）**。
>
> **v1.1.2-stage-52 收口（2026-10-01，commits `c6d89f6`~`facf825` + `6abd4fb`/`820855b`/`9e56c45`）**：**新登记 2 条非阻塞**——`cli/BUG-005`（medium）空模板检测为纯子串匹配，op 正文引用占位标记 `- [ ] 待补充` 即被误判未填充（① `plan scheme publish` **误拒**〔功能性〕；② `flow ops list` 误报 `(empty)`；③ `flow health` 误报空模板〔本仓实测 op-005〕）；建议检测收紧为整行/列表项匹配。`cli/BUG-006`（low）en 模式下 `flow advance --to done` 的 blocking REV 拒绝文案硬编码中文（`flow.ts:742-743`，未走 `t(...)`）——**预存量缺陷**（源自更早 `98fd2dd` op-002），op-007 范围为 `console.warn`（已全量清零），本处为 `console.error`，与 `cli/BUG-004` 同族（en 泄漏）。二者均**不阻塞阶段收尾**，登记备查。统计 **14 条（open 2 / closed 12）**。防再犯：① **占位符检测须结构判定（整行/列表项），纯子串命中即误报**——凡「标记字符串 vs 内容」，先问「是否要求独占结构位」；② **i18n 覆盖面按输出通道枚举**（`console.warn` 清零不等于 `console.error`/`console.log` 全覆盖），`rg "console\.(warn|error|log)\(.*[\x{4e00}-\x{9fff}]"` 三类同查。

> **v1.1.2-stage-54 收口（2026-10-01，commits `740a79d`/`8fd49af`/`35278b4`）**：**存量 2 条 `cli/BUG-005`/`cli/BUG-006` 收口关闭**——op-001 将 `isTemplateEmpty` 由纯子串改为**整行锚定**正则并令 `scheme.ts` 复用（单一来源），op-002 将 blocking REV 拒绝文案迁 i18n（+2 键）。测试官隔离 fixture 实测：真实独占行空模板 → `publish` exit 1 / `health` 仅报其；正文行内引用 → `publish` exit 0 / `ops list (filled)` / `health` 不报；仓库自身 `flow health` 空模板告警归零；en 拒绝路径 CJK=0、zh 逐字不变。**`templates/BUG-003` 复核关闭**（`cli-usage`/`wizard` 各 1 处顶部双态声明，用户主口径为裸 `openfeel`）。**stage-52 起的 2 条非阻塞缺陷（`cli/BUG-005`/`cli/BUG-006`）全部清零**；`templates/BUG-003` 复核维持 closed。**测试中新登记 1 条非阻塞**：`templates/BUG-005`（low，部署型 skill 模板 `flow phases --json` 输出说明缺 `transitionsDiff`）→ open；公共域统计 **15 条（open 1 / closed 14）**。防再犯（承接 stage-52）：① 占位符/标记类检测以**整行锚定**为默认（行内引用不误报）；② 状态行与实测**以脚本实时重跑为准**，历史快照数字不得沿用；③ **新增 JSON 输出键的同步面须含部署型 skill 模板**（`BUG-005` 因该面遗漏而生）。

> **v1.1.2-stage-55 收口（2026-10-01，commits `9e0a978`/`a646573`/`ebac4ea`/`0ad0b8e`/`17ff5be`）**：**本轮无新增缺陷**——阶段为「删除项目级资产（根 `AGENTS.md`/`opencode.jsonc`/`.opencode/{agents,skills,ADAPTER.md}`）+ 删 `build.js` 自举步骤 8（防复活）+ 「模块手册」迁入全局模板 + 全局刷新」，测试官端到端 + 全局刷新核验 + 环境零污染全通过，零阻塞缺陷。**`templates/BUG-005`（low）维持 `open`**——本阶段未触及部署型 skill 模板的 `flow phases --json` 输出说明，且删除动作不涉及该同步面；如实登记备查（建议随下次模板/文档同步收口）。统计维持 **15 条（open 1 / closed 14）**。

> **v1.1.2-stage-56 收口（2026-10-01，op-003）**：**公域索引补齐至 17**（A4 裁定，见 `REV-v1.1.2-stage-56` REV-001）——补入此前遗漏的 **2 条**：`kb/BUG-001`（新建 `### kb` 模块段 + `kb.md`，模块首次建立）与 `templates/BUG-001`（`### templates` 段补首行，zh-CN 双语不同步）。至此公域统计与私域 `index.md`（open 1 / closed 16 / 合计 17）及私域 `BUG-*.md` 实测文件数（17）**三者一致**；公域模块条目 6(cli)+4(config)+1(archive)+5(templates)+1(kb)=**17**。本次**不改历史注记原文**。

## 模块索引

### cli

| 编号 | 标题 | 优先级 | 状态 | 来源阶段 |
|------|------|:--:|:--:|----------|
| [BUG-001](cli.md) | `flow phases` 自描述 phase 与 `advance` 接受集合不一致（自定义 `pipeline.yaml` 下的第二信源） | low | **closed** | v1.1.2-stage-41 |
| [BUG-002](cli.md) | 阶段目录冲突错误未走 i18n 键（en 下为中文）+ `common.stageDirConflictTmpl` 死键 | low | **closed** | v1.1.2-stage-41 |
| [BUG-003](cli.md) | `flow phases --json` 的 `--help` 文案只列 `{ phases, transitions }`，实际输出含 `advanceAccepted`（`cli/BUG-001` 收尾遗漏） | low | **closed** | v1.1.2-stage-48 |
| [BUG-004](cli.md) | en 模式下 `--help` 的 Arguments 描述仍为中文（T38 只落地遍历机制，23 处 `.argument()` 仅 1 处补键） | low | **closed**（stage-51 补齐 20 处 + 新增 1 处 + 运行时 CJK 门禁验收通过） | v1.1.2-stage-50 |
| [BUG-005](cli.md) | 空模板检测为纯子串匹配，op 正文引用占位标记被误判「未填充」（`publish` 误拒 + health/ops list 误报） | medium | **closed**（stage-54 op-001 整行锚定；隔离 fixture 端到端验收通过） | v1.1.2-stage-52 |
| [BUG-006](cli.md) | en 模式下 `flow advance --to done` 的 blocking REV 拒绝文案硬编码中文（`flow.ts:742-743`；op-007 仅覆盖 `console.warn`） | low | **closed**（stage-54 op-002 i18n 补键；en CJK=0 验收通过） | v1.1.2-stage-52 |
| [BUG-007](cli.md) | `docs/commands.md` 的 `project` 子命令参考陈旧（`list`/`info` 已不存在，实测仅 `overview`） | low | **closed**（stage-56 归档官**就地修正** `docs/commands.md`：改 `project overview`；`rg "project (list\|info)"` 零命中） | v1.1.2-stage-56 |

### config

| 编号 | 标题 | 优先级 | 状态 | 来源阶段 |
|------|------|:--:|:--:|----------|
| [BUG-001](config.md) | `config set lang` 参数解析异常（Commander 参数吞噬） | high | **closed** | v0.4.4（遗留） |
| [BUG-002](config.md) | `openfeel init` 无条件覆盖已存在的 `config.yaml`（数据丢失；stage-46 缓解 → **stage-47 语义修复**） | high | **closed** | v1.1.2-stage-42 |
| [BUG-003](config.md) | `config effective` 无 `profile.yaml` 时 `auto_advance` 来源标为 `profile.yaml` 而非 `builtin` | medium | **closed** | v1.1.2-stage-42 |
| [BUG-004](config.md) | `test/core/workspace/identity.test.ts` 直写真实 `~/.openfeel/config.json`（测试隔离缺口，非阻塞） | medium | **closed**（stage-43 N4 隔离修复验收通过） | v1.1.2-stage-47 |

### archive

| 编号 | 标题 | 优先级 | 状态 | 来源阶段 |
|------|------|:--:|:--:|----------|
| [BUG-001](archive.md) | `openfeel archive` 对缺 `deps` 字段的存量阶段抛 TypeError（预存量缺陷） | low | **closed** | v1.1.2-stage-41 |

### kb

| 编号 | 标题 | 优先级 | 状态 | 来源阶段 |
|------|------|:--:|:--:|----------|
| [BUG-001](kb.md) | `lint kb` 过期引用未清理（`core.md` 残留 + `|` 列举误解析） | medium | **closed**（stage-42 修复验收通过） | v1.1.2-stage-42 |

### templates

| 编号 | 标题 | 优先级 | 状态 | 来源阶段 |
|------|------|:--:|:--:|----------|
| [BUG-001](templates.md) | 事务官标识列未加前缀（zh-CN 双语不同步） | medium | **closed** | v1.1.2-stage-41 |
| [BUG-002](templates.md) | 全局约束模板 `agents-md` 权限部署路径行未泛化（双源不同步） | medium | **closed** | v1.1.2-stage-45 |
| [BUG-003](templates.md) | 部署到用户全局环境的 skill 模板被改为 `node bin/openfeel.js`，用户项目不可执行（与 agent / agents-md 保留裸 `openfeel` 的口径相反） | low | **closed**（stage-50 op-006 T53 双口径 + build 幂等验收通过） | v1.1.2-stage-48 |
| [BUG-004](templates.md) | 迁移后 `current.md` 统计行沿用「执行中」快照、用例数陈旧（942 vs 实测 949）+ 措辞扞格 | low | **closed**（stage-53 归档官就地修正：942→949 + kb 计数刷新 + 记录措辞改为「归档完成」） | v1.1.2-stage-53 |
| [BUG-005](templates.md) | `openfeel-cli-usage` skill 的 `flow phases --json` 输出说明缺 `transitionsDiff`（与实测 5 键不一致，`transitionsDiff` 同步面遗漏 skill 模板） | low | **closed**（stage-56 op-001 全链路对齐 5 键；权威源→生成段→全局副本 content-equal 验收通过） | v1.1.2-stage-54 |

> 注：`templates/BUG-001`（事务官标识列未加前缀）与 `kb/BUG-001`（`lint kb` 过期引用）此前仅存私域，已于 **`v1.1.2-stage-56` 补齐**——分别见本目录 `templates.md` / `kb.md`。至此公域计数与私域一致（17）。

> **v1.1.2-stage-56 收口（2026-10-01，测试官验收）**：`templates/BUG-005`（low）经 openfeel-feel-tester 全链路独立复测**验收通过并关闭**——部署型 skill 模板 `openfeel-cli-usage/SKILL.md` 的 `flow phases --json` 输出说明已由 op-001 补齐为实测 **5 键**（`schemaVersion`/`phases`/`transitions`/`advanceAccepted`/`transitionsDiff`），且「权威源 → `npm run build` 生成段（`update.ts`/`template-loader.ts`）→ 全局 `~/.config/opencode` 副本」三处一致（全局副本正文与权威源 **CONTENT-EQUAL**）。核心结论见本目录 `templates.md`。**同阶段测试中新登记 1 条非阻塞**：`cli/BUG-007`（low，`docs/commands.md:522-523` 的 `project list`/`info` 子命令已被移除仍记于文档）。

> **v1.1.2-stage-56 归档收口（2026-10-01，openfeel-archiver）**：`cli/BUG-007`（low，文档漂移）经**归档官就地修正并关闭**——`docs/commands.md` 的 `## project — 项目管理` 节删除 `openfeel project list` / `openfeel project info [path]` 两行，改为实测存在的 `openfeel project overview`（+ 更正注记）；`project --help` 实测仅 `overview`，`rg "project (list|info)" docs/commands.md` 零命中。**至此 v1.1.2 累计 18 条 Bug 全部 `closed`（open 0 / closed 18）**，与私域 `index.md` 及实测 `BUG-*.md` 文件数（18）三者一致；公共域模块条目 = cli(7) + config(4) + archive(1) + templates(5) + kb(1) = **18**。防再犯沉淀：命令面**收敛**同样须走多载体同步面清单（手写 `docs/commands.md` 不经 build，最易漏）。
