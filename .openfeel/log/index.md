# 公共日志索引

> 按日期组织，仅记录团队级重要事件�?
## 2026-10

> **布局说明（v1.1.2-stage-51，A7 用户裁定）**：自本阶段起**新日志统一写入嵌套目录** `log/{yyyy}/{MM}/{dd}/`；历史**扁平目录** `log/{yyyy-mm-dd}/`（如 `2026-08-07`/`2026-08-09`/`2026-08-11`）保持原状、**不迁移**；两套布局的条目在本索引与 `day_index.md` 中**并存可检索**（根索引由代码生成时附 `（嵌套）`/`（历史扁平）` 布局标注）。
- [03 日](2026/10/03/2026-10-03-Liuary-020.md) — Archiver 归档 + **v1.1.4 版本收官** **v1.1.4-stage-65（checkpoint 选择性恢复与阶段复位 + 版本 1.1.4 收口 — 问题 3）**：把 `checkpoint restore` 升级为**按阶段选择性、可预览、可精准复位**——`restoreCheckpoint(filename, {stage?, dryRun?})`（无 `stage` 全量逐字节不变；`stage` 仅替换 `stages[id]` 单子树 + `status` 按 phase 投影 + `current` 命中协调）、`previewRestore` 只读差异预览（哨兵 `(absent)`/`(removed)`）+ `--dry-run` 零写盘；新增 **`flow stage reset <id> --to <phase> [--dry-run]`**（`advance` 的对称复位，允许回退，受合法 phase 值域 + `to=done` 阻塞 REV 约束，不触发归档 commit / 不写快照）；恢复路径三件套文档化（**全量 restore 为最后手段**）。3 op（`1f1414e`/`516a1d1`/`c0b8414`）。**版本 1.1.3→1.1.4 全链路收口**（A 类 6 处 + B 类 build 重生成；`1.1.3` 载体残留 0）；i18n 基线 739→**753**（+14 键）。门禁 `npm test` 61 文件 / **1087 用例 0 skipped / 0 failed**、`tsc` 0、`lint i18n` **753**、`lint kb` 0（325 引用）、build ×2 幂等不复活。审查 **passed**（**REV-001/002/003 全 low 非阻塞 open**；**跨阶段 stage-62 REV-001 一并登记**，建议后续版本收敛）；**无新增 Bug**；知识沉淀 **2 条**（patterns）；manual 三载体复核一致（归档官补正 manual 快照声明 v1.1.2→v1.1.4）；roadmap/大计划回填 **M21 done**。**v1.1.4 四阶段（62~65）全部闭环 = 版本收官，7 问题（1~7）全部修复**。**不推进 flow 至 done（由 Feel 执行）／未 push／未 `npm publish`**
- [03 日](2026/10/03/2026-10-03-Liuary-019.md) — openfeel-executor 完成 **v1.1.4 版本收口（1.1.3 → 1.1.4）**：A/B/C/D/E 全链路同步（`package.json` / `package-lock.json`(×2) / `config.yaml` / `config.ts`(zh/en) / `agents-md`(zh/en) / `CHANGELOG` / `docs/commands.md`；`--version`=**1.1.4**）；命令面新增 `flow checkpoint restore --stage/--dry-run` + `flow stage reset`，故障恢复路径文档化；门禁 `npm test` 61 文件 / **1087 用例 0 skipped / 0 failed**、`tsc` 0、`lint i18n` **753**、`lint kb` 0（325 引用）、build 幂等不复活；**不推进 flow 至 done（由 Feel 执行）／未 push**
- [03 日](2026/10/03/2026-10-03-Liuary-010.md) — Archiver 归档 **v1.1.4-stage-63（配置默认值解析与阶段创建继承，问题 1/6）**：新阶段 status.md 的 `执行模式`/`自动推进` 初值由**硬编码**改为取 `config.yaml.defaults`（新增 `resolveConfigDefaults`，只读 defaults、不读 status.md、不做 effective 合并）；`plan stage add --exec-mode/--auto-advance` 显式覆盖（值域非法 exit 1 不建阶段）；`config set/get` 支持 **`defaults.X ≡ X`**（`normalizeConfigKey` 单一来源，先归一再校验）；新增 **`config set --sync-stages`** 批量同步既有阶段（同值 no-op、无阶段字段跳过报告、`--global` 组合拒绝）。3 op（`e280ec0`/`04c121d`/`1d22bf4`）。**有效值级联优先序零触碰**（`buildCascadeConfig`/`resolveEffectiveConfig` 3 commits 零 diff）。门禁 **61 文件 / 1046 用例 0 skipped / 0 failed**、`tsc` 0、`lint i18n` 730、`lint kb` 0（312 引用）、build 幂等不复活。审查 **passed**（**REV-001/002/003 全 low 非阻塞 open**；含审查官一次已完全回滚的 cwd 误操作事故披露）；**无新增 Bug**；知识沉淀 **2 条**（patterns）；manual 复核 + 补改 `core/flow-manager.md`；大计划/roadmap 回填 **M19**。**不推进 flow 至 done（由 Feel 执行）／未 push → v1.1.4 第二阶段闭环**
- [03 日](2026/10/03/2026-10-03-Liuary-005.md) — Archiver 归档 **v1.1.4-stage-62（状态/相位单一事实源收敛，v1.1.4 首阶段）**：把 `status` 明确为 `phase` 的**粗粒度投影**（单一事实源 = `phase`），消除 `test_enabled=false` 触发的 `phase` 单向锁 `done` 确定性缺陷（`docs/08` 问题 12，本轮 **6/6 复发**）。3 op（`26629e6`〔op-001 核心修复：映射去 `testEnabled` + auto-repair 方向反转仅 `phase→status` + `stage set --status` 值域校验 + 回归测试〕/`abcab76`〔op-002 `test_enabled` 全链移除 + 向后兼容〕/`fa7f4f8`〔op-003 manual/docs + KB 备注 + 门禁〕）。**锁根因消除（决定性）**：fixture `{phase:review_passed, status:done}` → `advance --to test_pending` exit 0，`phase` 未前推。门禁 `npm test` **61 文件 / 1023 用例 0 skipped / 0 failed**、`tsc` 0、`lint i18n` **730 键**、`lint kb` 0（311 引用）、build 不复活。审查 **passed**（**REV-001 medium / REV-002·003 low 全非阻塞 open**；REV-001 边界 KB 注记）；**无新增 Bug**；知识沉淀 **4 条**（supersede 1 + 补沉 1 + 新增 2）；manual 复核一致；大计划/roadmap 进度回填（M18）。**不推进 flow 至 done（由 Feel 执行）→ v1.1.4 首阶段闭环**
- [02 日](2026/10/02/2026-10-02-Liuary-022.md) — Archiver 归档 **stage-61（CLI 输出编码 `auto` 语义修正 — 方案 A，v1.1.3）**：修正 stage-58 引入的**回归**——`resolveTargetEncoding` 第⑤步 `win32 && !isTTY` 由「`chcp` 探测→GBK」改为**直接 `utf8`**（对齐 Node 默认与 UTF-8 管道/CI 消费者）；**GBK 仅显式**（`--encoding gbk`/`OPENFEEL_ENCODING=gbk`）；`--json` 恒 UTF-8 与 5 步优先序不变；删 chcp 死代码 5 项。3 op（`ae98397`〔op-001 行为+死代码+单测+i18n〕/`a6be03f`〔op-002 文档+版本收口+门禁〕/`c4cc5af`〔op-003 REV-001 lock 缩进 closed〕）；版本 **1.1.2→1.1.3** 全链路收口（A 类 6 处 + B 类 build 重生成）。验证：`npm test` **61 文件 / 1016 用例 / 0 skipped / 0 failed**、`tsc` 0、`lint i18n` **730 键**、`lint kb` 0、build 成功 `.opencode` 零复活、环境零污染；win32 实测 `auto`→合法 UTF-8、`--encoding gbk`→GBK、`--json` 旁路逐字节相同。审查 **passed**（**REV-001 closed**）；**无新 Bug**（公域 19：open 1 / closed 18）；知识沉淀 **1 条**（troubleshooting）；manual 更新 `cli/output-encoding.md` + `index.md`；roadmap/大计划复核一致。**未 push（push 触发 CI 自动 `npm publish`，由 Feel/用户决定时机）→ v1.1.3 单阶段闭环，发布就绪**
- [02 日](2026/10/02/2026-10-02-Liuary-010.md) — Archiver 归档 **stage-58（CLI 输出编码自适应 + 运行日志）**：用户需求「CLI 输出编码自适应 + 运行日志」——解决 Windows 传统 CJK 代码页（非 TTY）下中文乱码 + 新增跨项目 CLI 进程诊断日志。3 op（`ae79c4e`〔op-001 A+C+D〕/`e9036e1`〔op-002 B+E〕/`91da64c`〔op-003 F+门禁〕）。交付 **A** 输出编码自适应（`src/cli/output-encoding.ts` + `bin` 单一咽喉包装 `stdout/stderr.write`，**不设 `VITEST` 守卫**；`--encoding <utf8|gbk|auto>` 默认 auto + `OPENFEEL_ENCODING`；auto 5 步优先序；Buffer 直通 / 回调保留 / 不可编码降 `?`）+ **C** `--json` 恒 UTF-8 最高优先 + **B** 运行日志（`src/core/runtime-log.ts` + `global-paths.getCliLogsDir()` → `~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log`，**默认开启、恒 UTF-8**、`[ISO][LEVEL][pid]`、info/warn/error、debug 默认关；`--log-file`/`--no-log`/`--debug`；`withFileLock('runtime-log')` + best-effort；不记 stdout；库侧默认 no-op）+ **D** `iconv-lite@^0.7.2` 提直接依赖（MIT）+ **E** 测试 **+32 用例**（编码 24 含**正控** + 日志 8）+ **F** manual ×2 新建 + ×3 更新、README ×2、`CHANGELOG`、`docs`（四类日志边界 / UTF-8 字符串语义 / 解析期错误不入日志）。验证：`npm test` **61 文件 / 1018 用例 0 skipped**、`tsc` 0、build 幂等**不复活**、`lint i18n` **730 键**、`lint kb` 0、`npm pack` 271 文件；测试官确认**真实 `~/.openfeel/cli/logs/` 在 `npm test` 前后零变化**。审查 **REV-001~008 全 closed**（REV-001/REV-006 blocking）；**新登记 `cli/BUG-008`（low, open）**——`--debug` 机制正确但全仓无 debug/warn 生产者；知识沉淀 **5 条**（architecture 1 + patterns 2 + troubleshooting 2）。**M14 done → v1.1.2 十八阶段（41~58）全部闭环，发布就绪；本地领先 origin，待 Feel 统一 push（stage-57+58）→ CI → 自动 `npm publish`**
- [02 日](2026/10/02/2026-10-02-Liuary-005.md) — Archiver 归档 **stage-57（发布收尾：CI 修复 + CI 可观测性 + README 更新）**：v1.1.2 发布收尾——CI run #51（`f178600`）失败（T32 盘符用例 POSIX 必失败 + `publish` skip），本阶段修复并补 CI 失败可观测性。3 op（commits `3278251`/`68e787f`〔op-001 C1+C2〕、`48345a9`〔op-002 README〕；op-003 验证型）。交付 **C1** T32 平台化（拆「跨平台用例 + Windows 专属 `it.skipIf`」，前置断言 `expect(preset).not.toBe(target)` 防假绿；`src/core/config.ts` **零 diff**）；**C2** CI 失败注解（`set -o pipefail` + `--no-color` + `sed` 剥色 + `if: failure()` `::error::`，上限 20 / `exit 0` / 零写盘 / 不改判定）；**C3** README×3（28 处）+ `docs/commands.md`（测试数 **986/59**〔Linux 跳过 1〕、v1.1.2 能力节、命令表修正、全局部署架构、zh/en 各 178 行对等、`1.1.1` 四文件零残留）。验证：`npm test` **59 文件 / 986 用例 0 skipped**、`tsc` 0、build 双跑幂等**不复活**、`lint i18n` **726 键**、`lint kb` 0 过期；测试官确认 **Linux 预览 985 passed / 1 skipped / 0 failed → CI 将转绿、`publish` 不再 skip**。审查 **REV-001~004 closed**（REV-004 blocking 已修 + 独立复现）+ **REV-005（low，README 架构图 `backup/` 粒度失真）归档官就地修正 `backup.ts` 后 closed**；`docs/GETTING_STARTED.md:5` 同类旧版本号残留一并清理；**无新 Bug**（公域 18 全 closed）；知识沉淀 **3 条**（patterns）。**M13 done → v1.1.2 十七阶段（41~57）全部闭环，可推送 / 发布（推送与 `npm publish` 由用户执行）**
- [01 日](2026/10/01/2026-10-01-Liuary-052.md) — Archiver 归档 **stage-56（发布前最后一轮收尾 → v1.1.2 发布就绪）**：用户指令「清掉发布前应修的遗留项，随后 `npm publish`」→ 本阶段为 **v1.1.2 发布前最终收尾**（**不含实际 `npm publish`**），4 op（commits `4aa43ba`/`e4b2b2e`/`b4af6fc`/`48ea6d8`/`c557bd1`/`c8a8d33`/`db4b6a4`/`844a87b`）。交付 **S2** `openfeel-cli-usage` skill 全量对齐 v1.1.2（补 **16 项**命令/参数 + 修正 `advanceAccepted` 误称〔**内置 15 phase 推进白名单**〕+ `transitionsDiff` 注记 + 重写「新增能力」；**123 行/11001B**）；**S1** 键数全链同步（`docs`/`manual`/`CHANGELOG`/生成段 → 实测 **5 键**）；**S3/S4**（`agents-md/en.md` CJK 归零、`managed-region.ts` 注释校准、`manual/core/backup.md` 措辞、**新建 `bugs/kb.md`** + 公域 Bug 索引补齐至 **17**）；**S5/S6**（`npm run build` → 门禁 → 备份 **3690 文件** + `openfeel setup` → **门⑤ `CONTENT-EQUAL`**〔17 skill 全量〕→ 回归；全局 17 skill / 9 agent / jsonc / `AGENTS.md` 含模块手册+权限模型节）。验证：`npm test` **59 文件 / 985 用例全绿（0 skipped）**、`tsc` 0、build 幂等**不复活**、`lint i18n` **726 键**、`lint kb` 0 过期、`npm pack` 263 文件 / `publish --dry-run` 通过；环境零污染。审查三段零阻塞（**REV-001~008 全 closed**）；测试官端到端 + 全局刷新只读复核全通过；`templates/BUG-005` **closed** + `cli/BUG-007`（归档官就地修正后 **closed**）→ **v1.1.2 累计 18 条 Bug 全部 closed（open 0）**；知识沉淀 **3 条新增 + 1 条更新**。**⚠️ 须重启 harness 会话使全局新部署生效；`npm publish` 由用户执行。M12 done → v1.1.2 十六阶段（41~56）全部闭环，达到可发布状态**
- [01 日](2026/10/01/2026-10-01-Liuary-046.md) — Archiver 归档 **stage-55（清掉项目级约束与 Agent·发布前最后阶段）**：删除 6 项项目级资产（根 `AGENTS.md`/`opencode.jsonc`/`.opencode/{agents,skills,ADAPTER.md}`）+ 删 `build.js` 自举步骤 8（**防复活**），`.opencode/` 仅留运行时 4 项；「模块手册」迁入全局模板（zh/en 双语）+ **刷新全局部署（唯一真实全局目录操作）**——skills **16→17**、全局 `AGENTS.md` **293→509 行**、备份 **3689 文件**；测试迁移（`opencode-instance.test.ts` 整文件删除：4 删 / 3 迁模板源 / 3 迁新文件 `release-metadata.test.ts` + 防回归）；引用同步 + supersede N1（**追加式**）+ ADR-002 + **新会话验证指引（6 步）**；**59 文件 / 985 用例全绿（0 skipped）**、`tsc` 0、build 幂等**不复活**、`lint i18n` **726 键**、`lint kb` 0 过期（217 引用）；三段审查零阻塞（**REV-002 low / REV-003 low 全 closed**）；测试官端到端 + 全局刷新核验 + 环境零污染全通过；**无新增缺陷**（`templates/BUG-005` low 维持 open）；知识沉淀 **5 条**（architecture 1 + patterns 2 + troubleshooting 2）。**⚠️ 须重启 opencode 会话使全局新部署生效；`npm publish` 待用户决定。M11 done → v1.1.2 十五阶段（41~55）全部闭环，发布就绪**
- [01 日](2026/10/01/2026-10-01-Liuary-039.md) — Archiver 归档 stage-54（**v1.1.2 收尾 — 遗留缺陷清理（发布前清账）**）：承接用户指令「**先收尾**，然后清掉项目级约束与 Agent，之后发布」；E1~E12 逐条**实测验证**（需修 3 / 已解决 5 / 登记 4 / 门禁 1），3 op（commits `740a79d`/`8fd49af`/`35278b4`）。**E1 `cli/BUG-005`（medium）** 空模板检测由**纯子串**改**整行锚定**（`EMPTY_TEMPLATE_LINE_RE` + `detectFillState` 的 `partial` 同口径 + `plan/scheme.ts` 复用 `isTemplateEmpty` 单一来源）——消除「正文行内引用占位标记被误判空模板」导致的 `publish` 误拒与 `health`/`ops list` 误报，**仓库 `flow health` 空模板告警 1 → 0**；**E2 `cli/BUG-006`（low）** en 模式 blocking REV 拒绝文案 i18n 化（`flow.advance.blockingRevRefused`/`blockingRevHint`）；**E3 `cli/BUG-003`（low 复发）** `flow phases --help` 补 `transitionsDiff`（**JSON 5 键契约未动**）；**E6 分层统计**（总 270 / **清账层 38** / **历史层 88** / 无法判定 3）；**E4~E11 登记收口** + `bugs/index.md` 统计修正；**E11/A6 仅登记不改 `flow.json`**。验证：`npm test` **59 文件 / 987 用例全绿（0 skipped）**、`tsc` 0、build 幂等、`lint i18n` **726 键**（E12：724 + E2 两键）、`lint kb` 0 过期（265 引用）、`flow health` 空模板 0；环境零污染。审查三段零阻塞（**REV-001 medium blocking / REV-002 low 全 closed**）；测试官 E1/E2/E3 端到端 + E6 独立复算 + 污染零 diff 全通过。**Bug 收口（测试官）**：清账层 REV **closed 31 / 维持 pending 7**；`cli/BUG-005`/`cli/BUG-006`/`templates/BUG-003` → **closed**；**新登记 `templates/BUG-005`（low, open）**（部署型 skill 模板 `flow phases --json` 说明缺 `transitionsDiff`——新增键同步面遗漏 skill 模板）；知识沉淀 **4 条**（patterns 2 + troubleshooting 2，含 1 条更新）
- [01 日](2026/10/01/2026-10-01-Liuary-034.md) — Archiver 归档 stage-52（**v1.1.2 反馈 09 可编排性/可观测性 + 遗留清账 + 约束体系精简**）：承接 `docs/phase-5/09-openfeel-automation-feedback.md`（8 条）+ 遗留 L1~L8，**逐条先在当前代码实测验证**（F3 主体/F7/F8 已解决仅登记）；**B1~B9 全落地** —— `flow status/current/health/metrics/overview --json`（含 `schemaVersion`）/ `flow health --fix`（以 flow.json 为权威**仅回写 status.md「状态」字段**）/ `flow ops list`（填充度 + 空模板 warning）/ `scheme create --draft` + `publish`（**窄兼容 5 条**）/ `advance --to` 自动逐步（BFS 唯一路径 + **每步 REV 复检**）/ `plan scheme rename` / `NO_COLOR`/`--no-color` / **L8 `kb-dedup` CRLF 修复**（patterns **2→105** / troubleshooting **0→31**）；**用户裁定 A1~A7 全落地**（**A4 本阶段移除 `view add`**〔破坏性 + CHANGELOG `Removed` + 迁移指引〕、A5 CRLF、A6 文件孤儿 62 条仅报告、A7 实测不复现→不做编码 hack）+ **C1~C4 约束体系精简**（简洁约束单行 / B 组阈值定性化**保留 D 组** / 根 `AGENTS.md` 与模板源逐字对齐 / 「14 个 Skill」→ **17**）；**修复轮 op-012/013/014：stage 解析归一化闭包 10 处收口**（统一 `normalizeStageId` + 双键回退，`rg` 独立确认**无第 11 处**）；14 op（主链 11 + 修复轮 3，commits `c6d89f6`~`facf825`/`6abd4fb`/`820855b`/`9e56c45`）；**59 文件 / 979 用例全绿（0 skipped）**、`tsc` 0、build 幂等、`lint i18n` **724 键**、`lint kb` 0 过期；环境零污染；三段审查零阻塞（**REV-001~003/005~009 全 closed**）；测试官 14 项抽验全通过；新登记 `cli/BUG-005`（medium）/ `cli/BUG-006`（low）；知识沉淀 **8 条**（patterns 5 + troubleshooting 3）；**v1.1.2 十三阶段（41~53）全部闭环**，发布就绪（`npm publish` 待用户决定）
- [01 日](2026/10/01/2026-10-01-Liuary-030.md) — Archiver 归档 stage-53（**v1.1.2 current.md / dev_last.md 职能与格式重构**）：承接 stage-52，**两条设计目的**（保存核心信息便于恢复 / 避免无关信息污染上下文）+ **索引层/主题层/详情层三层分层**写入全局框架约束层；`current.md` 改**团队文件**新格式（仅个人提交时更新 / 整体信息 / 无 agent 细节与 @成员段 / ≤5 条记录 + 旧记录自动归档 `current_archive/`）；`dev_last.md` 改**索引 + 同名主题目录**（活跃主题 ≤5 / 索引 ≤5 条 ≤100 字 / 主题文件 ≤10 条 ≤300 字 / 超量转 `tmp/` 记地址 / **超期不归档** / **R1~R6** 含 R4 就地收敛与 R6 加锁）；**用户裁定 A5/A6/A9/A10 全落地**（A5 内联 `@{username}`、A6 `openfeel-sync-status` 改写保留 17 skill、**A9 dev_last 写入加锁** `withFileLock`+`dev-last-{username}.lock` 读写均在锁内、A10 主题文件英文名）；**存量迁移零丢失**（`current_archive/current-2026-10-01-001.md` 全文超集、current 82→14 行、dev_last 53→34 行 + 5 主题、`DEV_SUB_DIRS` +`current_archive`）；5 op（commits `627805e`/`3792b77`/`ae0d6e2`/`4377822`/`27ce06e`）；**59 文件 / 949 用例 0 skipped**、`tsc` 0、build 幂等、`lint i18n` **724 键**、`lint kb` 0 过期；三段审查零阻塞（**REV-003 closed**）；测试官端到端 + 数量约束机检 + 并发（含无锁对照）+ 迁移零丢失全通过；新登记 `templates/BUG-004`（low，**归档官就地修正关闭**）；知识沉淀 **5 条**（architecture 2 + patterns 2 + troubleshooting 1）；**v1.1.2 十三阶段（41~53）全部闭环**，全局产物须用户运行 `openfeel setup` 生效
- [01 日](2026/10/01/2026-10-01-Liuary-011.md) — Archiver 归档 stage-51（**v1.1.2 流水线状态维护与 CLI 可维护性·反馈 08**）：承接 `docs/phase-5/08-openfeel-workflow-feedback.md`（11 条），编号化 **N1~N11**（3 批次 H1~H3）/ **9 op**（commits `a008f69`~`34385a4`）；补齐「**纠正/清理侧**」CLI——`plan scheme remove` + `findOrphanOps` 对账（默认只报告 / `--prune-orphans` 仅清键孤儿 / 文件孤儿永不自动删）/ `flow stage set --deps`（悬空 exit 1）/ `flow review update·remove` / `ensureStageSkeleton` 消除半注册 / `syncCurrentOp` 单一 owner 复用 / `stage set` 三态幂等 + 字段白名单 / `stage task --add` + `plan stage add --tasks` / op 命名 `op-NNN.md` + 兼容回退 / knowledge 宽容解析 + **`openfeel knowledge dedup`**（随包分发、只读建议）/ 日志未来写入统一 + 索引共存 / `advance --quiet` 降噪；**用户裁定 A2/A5/A6/A7 全落地**；**56 文件 / 869 用例全绿（0 skipped）**、`tsc` 0、build 幂等、`lint i18n` **649 键**、`lint kb` 0 过期（242 引用）、`npm pack` 263 文件含 `dist/utils/kb-dedup.js`、环境零污染；三段审查零阻塞零新增 REV、**REV-004 closed**、**`cli/BUG-004` 关闭**（en `--help` Arguments 段 CJK 零命中，运行时 33 命令）；知识沉淀 **5 条**（architecture 1 + patterns 4 + troubleshooting 1 更新）；**v1.1.2 十一阶段（41~51）全部闭环**，`npm publish` 待用户决定

## 2026-09
- [30 日](2026/09/30/2026-09-30-Liuary-010.md) — Archiver 归档 stage-50（**v1.1.2 全量审查 non-blocking 集中清理·第二批**）：承接 stage-49 总报告 §五 流转裁定，**T1~T57**（6 批次 A~F）7 op（commits `feae65e`~`def6a33`）；**用户裁定 R1~R6 全落地**（R1 `lint` 非 0 退出〔无逃生阀〕/ R3 `config set/get` 扩全量 `defaults.*`〔schema 驱动 + 枚举校验不写盘 + 值类型归一〕/ R4 审查条目收敛单入口〔`view add` deprecated，下版本删除〕/ R2 `update_infos` 保守默认 / R5 覆盖补 4 项 / R6 coverage 报告不阻断）；关键实现 `syncCurrentOp` 单一 owner（T1）/ `kb-dedup` `basePath` 参数化（T8）/ lint 退出码（T17）/ `transitionsDiff`（T19）/ 死代码删除（T22）/ config 白名单（T36）/ 双入口收敛（T37）/ 部署型 skill 双口径（T53）；**54 文件 / 790 用例全绿（0 skipped）**、`tsc` 0、build 幂等、`lint i18n` **560 键**、`lint kb` 0 过期；环境零污染；REV-001 closed / REV-002·003 resolved / REV-004（low）归下版本；`templates/BUG-003` **关闭** + 新登记 `cli/BUG-004`；知识沉淀 5 条（patterns 4 + troubleshooting 1）；文档/manual/CHANGELOG 同步由归档官落地
- [30 日](2026/09/30/2026-09-30-Liuary-001.md) — Archiver 归档 stage-49（**v1.1.2 整仓全量审查 + blocking 修复**）：8 单元 MECE 覆盖 `src/**/*.ts` 全 62 文件；原始 73 条 → 去重 68 条；**blocking 4/4 独立复现成立并修复闭环**（B1 dry-run 写盘 / B2 悬空依赖 / B3 postinstall 失效+engines / B4 VERSION 死导出；commits `3f023e3`/`1a8546a`）；**41 文件 / 716 用例全绿**、`tsc` 0、build 幂等、`lint i18n` 533 键、`lint kb` 0 过期；离线安装实测（`npm pack` 259 文件）、真实环境零污染；知识沉淀 7 条（patterns 6 + troubleshooting 1）；文档类修复 `docs/commands.md` + README×3 落地；~40 条 non-blocking 裁定流入后续补丁阶段
- [29 日](2026/09/29/2026-09-29-Liuary-052.md) — Archiver 归档 stage-43 + **v1.1.2 版本级收官**（CLI 文档 skill 化与版本收口）：新增 `openfeel-cli-usage` skill（权威源单文件 + build 双注入 + 自举 + 快照声明，16→17 skill）+ **版本 1.1.2 全链路收口**（A1~A8 + B 生成段 + C `CHANGELOG` + D/E；`package-lock` 手工两行零依赖树变动）+ `docs/commands.md` config 节 + `AGENTS.md` 命令清单/skill 指向 + `config/BUG-004` 测试隔离修复（N4 mock + 删伪隔离 + 只读守护用例）+ skill 计数同步 14 处 + `REV-44` 归属闭环；**41 文件 / 694 用例全绿**、`lint i18n` 531 键、`lint kb` 0 过期引用；REV-006 终裁「502 = PATH 全局旧版 CLI 环境污染」并撤销 stage-47 微瑕判定；知识沉淀 4 条（patterns 2 + troubleshooting 2）；**v1.1.2 七阶段全部闭环，`npm publish` 就绪**
- [29 日](2026/09/29/2026-09-29-Liuary-064.md) — **Reviewer 完成 stage-49 op-009 全量审查汇总**：8 单元（U1~U8）报告交叉核对 + 去重（73→68 条）+ blocking 独立抽验——**4/4 成立**（① `flow advance --dry-run` 校验前 autoRepair 写盘，隔离实测 revision 2→3；② `plan stage add --deps` 悬空依赖静默入库且 health 不告警；③ postinstall 用户端必然静默失效（布局模拟实测）+ engines `>=20.0.0` 与 `@inquirer/core ^20.17.0` 崩坏；④ `src/index.ts:10` VERSION='0.1.0' 死导出经 exports 暴露错误版本）；跨单元矛盾裁定 1 处（skill 部署口径 34 行违规以 U4 全量为准，U6 抽样偏差）；REV-49-005（基线 706）closed；U8 过程偏差（真实 update_state.json 内容不变重写）留痕 + 整改要求；**stage-49 pending，blocking 修复闭环后即可发布 1.1.2**
- [29 日](2026/09/29/2026-09-29-Liuary-062.md) — Archiver 归档 stage-48（**v1.1.2 事件加固 + 遗留问题修复**）：三大过程事件机制加固（A 审查官幻觉：reviewer 模板四条纪律 + `feel.md` 健康探测 + H12 + 新建 `manual/core/code-review.md`；B `npm test` 覆写真实环境：两测试补 `vi.mock('node:os')` + 干净机器模拟 + 对照实验 + CI 环境哈希守卫；C 裸跑命中全局旧版：执行型口径统一 `node bin/openfeel.js` + CI 版本门禁双 job）+ 13 项遗留全部落地（含 **455 条死映射 455→0**、`profile.yaml` 健壮性、权限措辞「平台默认 ask」、`cli/BUG-003` 收口）；7 op，**41 文件 / 706 用例全绿**、`tsc` 0、build 幂等、`lint i18n` 531 键、`lint kb` 0 过期/226 引用；真实全局环境零污染（逐文件 SHA-256 全等）；REV-001~008 closed（含 2 blocking）、REV-009 转 stage-49；`cli/BUG-003` closed + 新登记 `templates/BUG-003`（low 非阻塞，建议并入 stage-49）；知识 4 条（patterns 2 + troubleshooting 1 + 1 批注）；manual 更新 4 文件
- [28 ��](2026/09/28/2026-09-28-Liuary-001.md) �� Reviewer �ƻ���� v1.1.2 ���׶Σ�������ͨ�����ϱ� 2 �� blocking ȱ�ݣ��汾�տ��嵥��© / P2a ��ʵǰ�����

- [26 日](2026/09/26/2026-09-26-Liuary-001.md) �?Archiver 归档 stage-01（全局化彻底化改造：约束统一全局 AGENTS.md + setup 纯全局部署，知识沉淀 4 条）
- [26 日](2026/09/26/2026-09-26-Liuary-002.md) �?阶段 v1.1.1-stage-01 完成
- [25 日](2026/09/25/2026-09-25-Liuary-010.md) �?Archiver 归档 stage-40（模型配置接口，知识沉淀 3 �?+ 修正优先级矛盾；v1.1.0 六阶段闭环）
- [25 日](2026/09/25/2026-09-25-Liuary-009.md) �?阶段 v1.1.0-stage-40 完成
- [25 日](2026/09/25/2026-09-25-Liuary-008.md) �?Archiver 归档 stage-39（存量迁移与兼容收尾，知识沉淀 4 条）
- [25 日](2026/09/25/2026-09-25-Liuary-007.md) �?阶段 v1.1.0-stage-39 完成
- [25 日](2026/09/25/2026-09-25-Liuary-006.md) �?Archiver 归档 stage-38（控制区标记增量更新，知识沉淀 4 条）
- [25 日](2026/09/25/2026-09-25-Liuary-005.md) �?阶段 v1.1.0-stage-38 完成
- [25 日](2026/09/25/2026-09-25-Liuary-004.md) �?Archiver 归档 stage-37（全局部署架构，知识沉淀 5 条）
- [25 日](2026/09/25/2026-09-25-Liuary-003.md) �?阶段 v1.1.0-stage-37 完成
- [25 日](2026/09/25/2026-09-25-Liuary-002.md) �?Archiver 归档 stage-36（模板源收敛 + 命名前缀统一，知识沉淀 4 条）
- [25 日](2026/09/25/2026-09-25-Liuary-001.md) �?阶段 v1.1.0-stage-36 完成
- [12 日](2026/09/12/2026-09-12-Liuary-001.md) �?v1.1.0 计划制定与审查（Planner + Reviewer），stage-35 进入 plan_review
- [12 日](2026/09/12/2026-09-12-Liuary-002.md) �?Archiver 归档 stage-35（并发保护基础设施，知识沉淀 6 条）

## 2026-08

- [15 日](2026/08/15/2026-08-15-Liuary-003.md) �?Archiver 归档 stage-34（plan 目录多级化与路径统一，知识沉淀 4 条）
- [11 日](2026-08-11/2026-08-11-Liuary-001.md) �?Archiver 归档 stage-32（update 增量更新 + 冲突标记，知识沉淀 2 条）
- [09 日](2026-08-09/2026-08-09-liuary-001.md) �?Archiver 归档 stage-30（Pantheogen 兼容性修复，知识沉淀 3 条）
- [09 日](2026-08-09/2026-08-09-liuary-002.md) �?Archiver 归档 stage-31（CLI 体验优化 4 项，知识沉淀 3 条）- [08 日](2026/08/08/day_index.md) �?Vision Agent 模型配置排查与修�?- [07 日](2026/08/07/day_index.md) �?stage-03 审查阻塞问题上报（REV-001�?| [2026-08-07](2026/08/07/day_index.md) | 阶段 v1.0.0-stage-03 完成 |
| [2026-08-08](2026/08/08/day_index.md) | 阶段 v1.0.0-stage-29 完成 |
| [2026-08-09](2026/08/09/day_index.md) | 阶段 v1.0.0-stage-30 完成 |
| [2026-08-11](2026/08/11/day_index.md) | 阶段 v1.0.0-stage-32 完成 |
| [2026-08-15](2026/08/15/day_index.md) | 阶段 v1.0.0-stage-33 完成 + stage-34 归档 |
| [2026-09-13](2026/09/13/day_index.md) | 阶段 v1.1.0-stage-35 完成 |
| [2026-09-25](2026/09/25/day_index.md) | 阶段 v1.1.0-stage-36 完成 |
| [2026-09-26](2026/09/26/day_index.md) | 阶段 v1.1.1-stage-01 完成 |
| [2026-09-30](2026/09/30/day_index.md) | 阶段 v1.1.2-stage-49 完成 |
| [2026-10-01](2026/10/01/day_index.md) | 阶段 v1.1.2-stage-50 完成 |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-51.op-008 执行通过 （嵌套） |
| [2026-08-07](2026-08-07/day_index.md) | 历史扁平目录（2026-08-07） （历史扁平） |
| 2026-08-09 | 历史扁平目录（2026-08-09）：无 day_index.md （历史扁平） |
| 2026-08-11 | 历史扁平目录（2026-08-11）：无 day_index.md （历史扁平） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-51.op-005 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-51.op-007 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-51.op-009 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | 阶段 v1.1.2-stage-51 完成 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-52.op-001 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-52.op-003 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-52.op-004 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-52.op-005 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-52.op-006 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-52.op-007 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-52.op-002 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-52.op-008 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-52.op-009 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-52.op-011 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-52.op-010 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-52.op-012 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-53.op-001 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-53.op-002 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-53.op-003 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-53.op-004 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-53.op-005 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-52.op-013 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | 阶段 v1.1.2-stage-53 完成 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-52.op-014 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | 阶段 v1.1.2-stage-52 完成 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-54.op-001 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-54.op-002 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-54.op-003 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | 阶段 v1.1.2-stage-54 完成 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-55.op-001 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-55.op-002 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-55.op-003 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-55.op-004 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-55.op-005 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | 阶段 v1.1.2-stage-55 完成 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-56.op-001 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-56.op-002 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-56.op-003 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | v1.1.2-stage-56.op-004 执行通过 （嵌套） |
| [2026-10-01](2026/10/01/day_index.md) | 阶段 v1.1.2-stage-56 完成 （嵌套） |
| [2026-10-02](2026/10/02/day_index.md) | v1.1.2-stage-57.op-001 执行通过 （嵌套） |
| [2026-10-02](2026/10/02/day_index.md) | v1.1.2-stage-57.op-002 执行通过 （嵌套） |
| [2026-10-02](2026/10/02/day_index.md) | v1.1.2-stage-57.op-003 执行通过 （嵌套） |
| [2026-10-02](2026/10/02/day_index.md) | 阶段 v1.1.2-stage-57 完成 （嵌套） |
| [2026-10-02](2026/10/02/day_index.md) | v1.1.2-stage-58.op-001 执行通过 （嵌套） |
| [2026-10-02](2026/10/02/day_index.md) | v1.1.2-stage-58.op-002 执行通过 （嵌套） |
| [2026-10-02](2026/10/02/day_index.md) | v1.1.2-stage-58.op-003 执行通过 （嵌套） |
| [2026-10-02](2026/10/02/day_index.md) | 阶段 v1.1.2-stage-58 完成 （嵌套） |
| [2026-10-02](2026/10/02/day_index.md) | v1.1.2-stage-59.op-001 执行通过 （嵌套） |
| [2026-10-02](2026/10/02/day_index.md) | v1.1.2-stage-59.op-002 执行通过 （嵌套） |
| [2026-10-02](2026/10/02/day_index.md) | v1.1.2-stage-60.op-001 执行通过 （嵌套） |
| [2026-10-02](2026/10/02/day_index.md) | v1.1.2-stage-60 归档完成（CI publish 并发控制 / 方案 A） （嵌套） |
| [2026-10-02](2026/10/02/day_index.md) | 阶段 v1.1.2-stage-60 完成 （嵌套） |
| [2026-10-02](2026/10/02/day_index.md) | v1.1.2-stage-59 归档完成（修复 CI 环境守卫误报 → 让 CI 转绿并发布） （嵌套） |
| [2026-10-02](2026/10/02/day_index.md) | 阶段 v1.1.2-stage-59 完成 （嵌套） |
| [2026-10-02](2026/10/02/day_index.md) | v1.1.3-stage-61.op-001 执行通过 （嵌套） |
| [2026-10-02](2026/10/02/day_index.md) | v1.1.3-stage-61.op-002 执行通过 （嵌套） |
| [2026-10-02](2026/10/02/day_index.md) | v1.1.3-stage-61.op-003 执行通过 （嵌套） |
| [2026-10-02](2026/10/02/day_index.md) | 阶段 v1.1.3-stage-61 完成 （嵌套） |
| [2026-10-03](2026/10/03/day_index.md) | v1.1.4-stage-62.op-001 执行通过 （嵌套） |
| [2026-10-03](2026/10/03/day_index.md) | v1.1.4-stage-62.op-002 执行通过 （嵌套） |
| [2026-10-03](2026/10/03/day_index.md) | v1.1.4-stage-62.op-003 执行通过 （嵌套） |
| [2026-10-03](2026/10/03/day_index.md) | 阶段 v1.1.4-stage-62 完成 （嵌套） |
| [2026-10-03](2026/10/03/day_index.md) | v1.1.4-stage-63.op-001 执行通过 （嵌套） |
| [2026-10-03](2026/10/03/day_index.md) | v1.1.4-stage-63.op-002 执行通过 （嵌套） |
| [2026-10-03](2026/10/03/day_index.md) | v1.1.4-stage-63.op-003 执行通过 （嵌套） |
| [2026-10-03](2026/10/03/day_index.md) | 阶段 v1.1.4-stage-63 完成 （嵌套） |
| [2026-10-03](2026/10/03/day_index.md) | v1.1.4-stage-64.op-001 执行通过 （嵌套） |
| [2026-10-03](2026/10/03/day_index.md) | v1.1.4-stage-64.op-002 执行通过 （嵌套） |
| [2026-10-03](2026/10/03/day_index.md) | v1.1.4-stage-64.op-003 执行通过 （嵌套） |
| [2026-10-03](2026/10/03/day_index.md) | 阶段 v1.1.4-stage-64 完成 （嵌套） |
| [2026-10-03](2026/10/03/day_index.md) | v1.1.4-stage-65.op-001 执行通过 （嵌套） |
| [2026-10-03](2026/10/03/day_index.md) | v1.1.4-stage-65.op-002 执行通过 （嵌套） |
| [2026-10-03](2026/10/03/day_index.md) | v1.1.4-stage-65.op-003 执行通过 （嵌套） |
| [2026-10-03](2026/10/03/day_index.md) | 阶段 v1.1.4-stage-65 完成 （嵌套） |

- [29 日](2026/09/29/2026-09-29-Liuary-001.md) — Reviewer 审查 stage-46 计划（部署覆盖前备份，有条件通过：1 high + 2 medium blocking REV，config.yaml 覆盖路径漏备份上报）（末尾追加：文件含历史混合编码，避免整文件重写）
| [2026-09-29](2026/09/29/day_index.md) | v1.1.2-stage-41.op-001 执行通过 |
- [29 日](2026/09/29/2026-09-29-Liuary-007.md) — feel-tester 上报 BUG-002（high）：`openfeel init` 无条件覆盖 config.yaml 静默丢失用户配置（stage-41 事故根因，关联 stage-46 REV-001）
- [29 日](2026/09/29/2026-09-29-Liuary-008.md) — Archiver 归档 stage-41（v1.1.2 CLI 自描述与可纠错能力：`flow phases` / `flow stage remove` / `plan stage add --deps` / stageId 校验与冲突检测 / 三入口分层，知识沉淀 5 条至 patterns(2) + troubleshooting(3)）
- [29 日](2026/09/29/2026-09-29-Liuary-016.md) — Archiver 归档 stage-42（v1.1.2 配置口径与流水线状态正确性：`auto_advance` 四级级联 + `openfeel config effective` + `pipeline.phase` 全量 done 判定 + 审计日志补齐；知识沉淀 5 条至 architecture(1) + patterns(3) + troubleshooting(1)；config 模块首次建公共 Bug 归档）

- [29 日](2026/09/29/2026-09-29-Liuary-023.md) — Archiver 归档 stage-44（v1.1.2 权限模型修正：18 模板补 `external_directory: "allow"` + `utility` 的 `write` → `edit` + 覆盖/合并语义文档化 + 权限断言测试；658/658 测试全绿、`lint i18n` 529 键；REV-001/002 closed + REV-003（low，归档处置）闭环；0 Bug；知识沉淀 3 条至 architecture(1) + patterns(1) + troubleshooting(1)；**实测推翻需求原文 §二.2**，docs/07 已追加勘误节）
- [29 日](2026/09/29/2026-09-29-Liuary-029.md) — Archiver 归档 stage-45（v1.1.2 平台强限定内容「描述泛化」：源码注释/命令文案/i18n 双语 7 键 + 模板权威源 + 规则/文档/手册 24 文件（含用户点名处 AGENTS.md:82）+ 泛化锁断言；零行为变更，659/659 测试全绿、lint i18n 529 键；REV-001 low closed、三段审查零阻塞；Bug templates/BUG-002 medium 非阻塞（归 stage-47）；知识沉淀 3 条至 patterns(2) + troubleshooting(1)）
- [29 日](2026/09/29/2026-09-29-Liuary-036.md) — Archiver 归档 stage-46（v1.1.2 部署已有文件备份 + 全局状态文件提示：新增 `backup.ts`（写前备份 + `~/.openfeel/backup/{ts}/` 分区 + `manifest.json` + 单锁临界区 + 撞名绝不覆盖 + 备份失败绝不覆盖）+ `update_infos.md` 第三类 `backed`（短前缀读侧分类、旧行兼容）+ 四链路接入（`writeManagedFile` 三分支 / 全局 `opencode.jsonc` 三处 / `init` 的 `config.yaml`、`package.json`）+ `deployGlobalAsset` 破坏性签名变更（增 `command`，9 调用点全改）+ `feel.md` 双语启动检查扩为三类；685/685 测试全绿（41 文件）、`lint i18n` 502 键、`tsc` 0、build 幂等；REV-001~010 closed + REV-011（low 非阻塞，归 stage-47）；Bug 0 新增，`config/BUG-002` 仅缓解（保持 open，语义修复归 stage-47）；知识沉淀 4 条至 patterns(3) + troubleshooting(1)；manual 新增 core/backup.md）
- [29 日](2026/09/29/2026-09-29-Liuary-045.md) — Archiver 归档 stage-47（v1.1.2 已登记缺陷集中清理：`config/BUG-002`（high）语义修复——`init` 不再覆盖已存在 `config.yaml`（删 stage-46 备份接入块 + `init.skipped` 提示）+ `config/BUG-003` 画像层双条件 + `cli/BUG-001` `--json.advanceAccepted` + `cli/BUG-002` `StageDirConflictError` 三入口 i18n 分流（死键消除）+ `archive/BUG-001` deps 守卫 + `save()` meta 守卫 + `removeStage` 事务顺序 + jsonc 备份失败 A/B 分流 + `agents-md:112` 泛化 + `lint kb` 0 过期引用；693/693 测试全绿（41 文件）、`tsc` 0、build 幂等；REV-001~005 全 closed（2 条 blocking）；Bug 6 条 closed + `config/BUG-001` 维持 closed + 新登记 `config/BUG-004`（medium，归 stage-43）；知识沉淀 7 条至 patterns(3) + troubleshooting(1) + 既有条目 9 处批注；manual 更新 6 文件）
