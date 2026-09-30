# v1.1.2-stage-50 — 全量审查 non-blocking 集中清理（第二批）

> **版本**：v1.1.2（**继续，不新建版本**） | **创建日期**：2026-09-30 | **Planner**：独立 openfeel-planner
> **权威来源**：`.openfeel/users/Liuary/code_review/v1.1.2-stage-49-全量审查总报告.md`（§五 修复流转裁定）+ 8 份单元报告（`REV-v1.1.2-stage-49-U1.md` ~ `U8.md`）
> **定位**：集中清理 stage-49 全量审查中**裁定为「后续补丁阶段」的全部 non-blocking 项**（T1~T57），把「增量演进欠账」（内部模式不一致 / 门禁失效面 / 死代码 / i18n 泄漏 / 测试断言缺口 / 模板口径）一次性收敛。**不含**已修的 B1~B4、已由归档官闭环的文档类、历史归档回改。

---

## 一、背景与动机

stage-49 整仓全量审查（8 单元 × 6 维度，src 62 文件 MECE 覆盖）产出 73 条发现，其中 4 条 blocking 已由 stage-49 op-010/op-011 修复并归档；**~40 条 non-blocking 代码类**裁定流入「后续补丁阶段」。总报告 §八 明确：

> 「缺陷集中在三类：① CLI 边界语义（dry-run 副作用、退出码、非 TTY、i18n 泄漏）；② **同类机制内部模式不一致**（op 分割 4 种写法、守卫不齐、时区/锁/去重策略两套）——典型的增量演进欠账；③ **测试断言缺口**（关键失败语义无回归保护）。建议把「内部模式一致性」批次登记为下一阶段主题，而非零散修改。」

本阶段即为该裁定落地：按主题分 6 批（A~F），以 7 个 op 承载。

### 已排除项（核实结论）

| 排除对象 | 核实方式 | 结论 |
|----------|----------|------|
| **B1~B4**（stage-49 op-010/op-011） | `stage-49/status.md` = `done`（已归档） | 已修复，**不重复** |
| `U6-REV-001`（`docs/commands.md` 5 处漂移） | 实测 `docs/commands.md:91` 含 `advanceAccepted`、`:163/:173-174` 含 `--auto-fix/--blocking`、`:3` 版本头 = `v1.1.2 快照 / 2026-09-30` | **归档官已闭环** |
| `U6-REV-002`（README×3） | 实测 `README.zh-CN.md:149` = 「716 用例」、模型表述与 Agent 表已修正 | **归档官已闭环** |
| `U6-REV-003`（docs 版本头过期） | 实测 `docs/GETTING_STARTED.md:3` = `v1.1.2 快照 / 2026-09-30` | **归档官已闭环** |
| `U3-008`（`manual/core/global-paths.md` 陈旧名单） | dev_last 记录归档官同步 manual 4 文件（`cli/commands.md`/`core/flow-manager.md`/`core/build.md`/`index.md`），**不含** global-paths.md | 仍 open，**归归档官**（文档类，不进本阶段） |
| `U1-N7`（注释「--force 仅降级警告」）、`U8-011`（mergeFrontmatter 注释）、`U8-012③`（manual B2 措辞）、`M5` i18n 键文案侧 | 总报告 §五「文档类归 openfeel-archiver」 | **归归档官** |
| `U8-012①②`（op-008 行号/行数漂移） | 总报告 §五「历史归档只读」 | **只注记不改原文** |
| `U7-O1`（eslint IDE-only）、`U7-O2`（fetch-depth 无消费方）、`U1-O1~O5` 观察项 | 总报告 §五「不修（收益不抵改动面）」 | 不修（`U7-O2` 随 T18 顺带清理） |
| `U3-009`/`U3-010` | 单元报告已标 `closed`（有意设计/设计使然） | 不修（`U3-010` 建议文档注明 → 归档官） |

### `U1-N5` 复核裁定（用户要求说明）

总报告 §五 曾将 `U1-N5` 列为「当阶段修（非 blocking 顺带，1 条）」并给出两个选项（**补组合键** 或 **改注释/加差异检测**）。**实测 stage-49 归档时未落地**：`.openfeel/pipeline.yaml:31-37` 的 transitions 仍为 15 个单键、无 `'review_passed|test_passed'`。

**Planner 裁定：不补组合键；改为「transitions 差异显式化」（T19）**。理由：本项目 `config.yaml` 现为 `test_enabled: true`（测试门禁启用），若在 `pipeline.yaml` 补 `'review_passed|test_passed': ['archiving']`，将使 `review_passed` 可直接跳到 `archiving`，**削弱测试门禁**——与配置意图冲突。故采纳另一选项：在 `flow phases` 中新增「运行时 transitions vs 内置默认 transitions」差异报告（与既有 `customPhases` 检测对齐），使漂移**可见**而非静默。

---

## 二、编号化待修清单（T1~T57）

> 编号规则：**T 序号 = 本阶段内唯一编号**；「来源」列给出总报告/单元报告中的原始编号（U*-N*/U*-REV-*）。统计：**57 条**（= 总报告 §五「后续补丁阶段」44 条 + 合并条目 5 条 + 用户指定必纳 4 条 + 阶段内新增一致性项 4 条）。
> 优先级沿用原报告；「修/不修」见 §三 裁定。

### 批次 A：内部模式一致性（op-001）

| T | 来源 | 问题 | 证据（文件:行号） | 影响面 | 建议修法 | 优先级 |
|:--:|------|------|------------------|--------|----------|:--:|
| T1 | U1-N1 | 推进无 pending op 的阶段时 `pipeline.current.op` 跨阶段悬空 | `src/core/flow-manager.ts:1099-1106`；下游 `:2689` checkFlowJson、`recoverContext` | health 误报、Feel 上下文失真 | `pendingOpEntry` 为空时置 `current.op=''` | **high** |
| T2 | U1-N2 | 存量缺 `ops` 时 advance/save 双 TypeError，`validate()` 漏检；同类守卫不齐 | `:1100`／`:362`／`:2689`／`:997`（有守卫：`:337/:677/:722/:1223`） | 手工/外部损坏数据崩溃 | `load()` 统一 normalize（补 `ops={}`/`deps=[]`）一处收口 | **high** |
| T3 | U1-N3 | `archive/merge.ts` 用 `indexOf('.')` 分割 REV.op，含点 stageId 取错段 | `src/core/archive/merge.ts:56-63` | 归档摘要「审查记录」恒空 | 改 `lastIndexOf('.')` 或 `startsWith(stageName+'.')` | medium |
| T4 | U1-N4 | `fuzzyCorrectPhase` 后缀匹配无唯一性检查 | `flow-manager.ts:2148-2152` | `--force` 下任意尾串误命中枚举首个 | 后缀补唯一命中检查（对齐 prefix/contains） | medium |
| T5 | U1-N6 | `logMilestone` 丢弃 `MilestoneEvent` 除 title 外全部字段 | `public-logger.ts:104-107`（消费方 `flow-manager.ts:814-820`） | 公共日志里程碑无耗时数据 | `extra:{title,...event}` | medium |
| T6 | U1-N8 | `pipeline.phase` 无条件覆写，静默清除 `paused` | `flow-manager.ts:1108-1112` | 手工暂停被首次推进解除 | 推进前 `paused` 打 WARN 或注释声明语义 | low |
| T7 | U1-N9 | instruction-loader 复制 graph 私有逻辑 + 死变量 + 空 if | `artifact-graph/instruction-loader.ts:209-227/:286/:278-283` | 双份实现漂移风险 | 公开 `collectHardDeps` 复用；删死码 | low |
| T8 | U1-N10 + U5-024 | `kb-dedup` 模块加载时固化 cwd；零测试 | `src/utils/kb-dedup.ts:34` | 与同链路 projectPath 参数化不一致 | 加 `basePath` 可选参数（默认现行为）+ **补最小测试** | low |
| T9 | U1-N11 | 生产不可达：`mapPhaseToStageStatus` 的 testEnabled 分支、`canAdvance` 零调用 | `flow-manager.ts:3088-3097`（调用 `:1127` 不传）、`:1968` | 语义不明/维护噪音 | 由 CLI 传 `test_enabled` 闭环，或收敛+deprecated | low |
| T10 | U1-N12 | `roadmap.ts` 在 core 层调用 `process.exit` | `src/core/plan/roadmap.ts:79`（core 唯一一处） | 可测试性差、层界破坏 | 抛 Error，命令层决定退出码 | low |
| T11 | U1-N13 | `PublicLogger`/`MetricsStore` 单例固化首次 projectPath/dataDir | `public-logger.ts:60-65`、`metrics.ts:55-62` | 跨项目复用进程写错目录 | 单例键含 projectPath 或显式报错 | low |
| T12 | U1-N14 | `checkpoint_mapping.archive` 死键不可达（prefix 实为 `archiving`） | `flow-manager.ts:3038` + `:1782-1785` | archiving 不更新 checkpoint（无崩溃） | 删死键或补 `archiving` 映射 | low |
| T13 | U1-N15 + M4 | REV ID 基于 `reviews.length+1`，并发/删除后重号（另：双 FlowManager 构造） | `src/core/view/entry.ts:14-18`、`src/commands/flow.ts:752` | 并发创建静默覆盖 | ID 取既有最大序号 +1 | low |
| T14 | U1-N16 | `checkZombieStates` 用无锚 `startsWith(stageId)` | `flow-manager.ts:2766`（对照 `:1064` 锚定写法） | 前缀重叠 stageId 误报 | 统一 `startsWith(stageId+'.')` | low |
| T15 | U1-N17 + M5（代码侧） | `metrics.ts summary()` 中文硬编码不走 i18n | `metrics.ts:117-142`（对照 `flow-manager.ts:668` 用 `t()`） | en 模式泄漏 | 迁 i18n 键（与 T38 同批） | low |
| T16 | U1-N20 | `autoCommitOnDone` 将 stageName 拼入 shell 串 | `flow-manager.ts:1155-1157` | core 层无注入防御（CLI 入口有校验） | 改 `execFileSync('git',[...])` 数组形式 | medium |

### 批次 B：门禁与 CI 失效面（op-002）

| T | 来源 | 问题 | 证据 | 影响面 | 建议修法 | 优先级 |
|:--:|------|------|------|--------|----------|:--:|
| T17 | U2-REV-006（代码侧） | `lint i18n`/`lint kb` 发现问题仍 exit 0 | `src/commands/lint.ts:86-96/:136-144`（对照 `flow.ts:1085-1087` health exit 1） | CI 无法作门禁 | problems>0 → exit 1（**行为变更，见 §三 R1；用户已裁定：非 0 退出，逃生阀不加**） | medium |
| T18 | M2 = U5-023 + U7-04 | CI 守卫窗口（snapshot 在 version guard/lint 之后）+ 守卫不含仓库 `.openfeel/config.yaml` + 无覆盖率观测 | `.github/workflows/ci.yml:19-59`；`package.json` 无 coverage script（`@vitest/coverage-v8` 已装） | 伪隔离/工作区污染在 CI 不可见 | ① snapshot 上移到 build 后；② 守卫加仓库 `config.yaml`；③ 加 `test:coverage` + CI **报告步骤（无阈值，R6 用户已裁定不阻断）**；④ 顺带清理 `fetch-depth: 2` | medium |
| T19 | U1-N5（§一 已裁定） | 运行时 `pipeline.yaml` 与内置默认 transitions 静默漂移（缺组合键），无差异检测 | `.openfeel/pipeline.yaml:31-37` vs `flow-manager.ts:3028`；`flow.ts:361` 有 customPhases 检测但 transitions 无 | 自描述与实际转移表不一致（潜在） | **不补组合键**（见 §一）；在 `flow phases` 增「transitions 与内置默认差异」报告 | medium |
| T20 | U7-05 | `.gitignore` 缺 `.openfeel/tmp/` | `.gitignore`（实测无 tmp 条目；`git status` 出现 `?? .openfeel/tmp/review-*.md`） | 临时产物 untracked 泄漏 | 追加一行 | low |
| T21 | U7-06 | `.gitattributes` 未覆盖生成物宿主 `template-loader.ts`/`update.ts` 的 `eol=lf` | `.gitattributes` | 跨平台 EOL 漂移风险 | 追加两行 | low |

### 批次 C：死代码与配置面（op-003）

| T | 来源 | 问题 | 证据 | 影响面 | 建议修法 | 优先级 |
|:--:|------|------|------|--------|----------|:--:|
| T22 | M3 = U5-024 | `src/utils/path.ts` 全仓（src/test/build.js）零 import、零测试 | `rg "utils/path" . --glob '!node_modules' --glob '!dist'` 零命中 | 死代码嫌疑 | **删除**（无消费证据；U1/U5/U8 三方一致倾向删除） | medium |
| T23 | U8-003 | `atomicWriteJson` 生产零调用（预留 API） | `src/core/fs/atomic-write.ts:106`（仅自测引用 `atomic-write.test.ts:7,93`） | 无复用需求的导出 | 加「预留」注释标注（保留，供 backup 类后续复用） | low |
| T24 | U8-002 | `setup` 命令层漏打印 `skipped`（init/update 均输出） | `src/commands/setup.ts`（action 无 `r.skipped` 消费）；对照 `init.ts:56-58`、`update.ts:75-77` | malformed 降级在 CLI 不可见 | 补 skipped 输出（含 anomaly 筛选提示） | low |
| T25 | U8-001 | `update_infos.md` 条目只增不减，`clearUpdateInfos` 生产零调用 | `src/core/update-infos.ts:222`（仅测试引用）；backed 不去重有测试背书 | 全局文件无限增长 | **用户已裁定：按保守默认**（不新增自动清理；仅代码注释 + 文档说明；manual 归归档官）（见 §三 R2） | low |
| T26 | U8-007 | `computeBackupRel` 相对化无 `..` 逃逸防御 | `src/core/backup.ts:50-59`（无 `startsWith('..')` 守卫）；`backup.test.ts` 无越界用例 | 越界写任意路径（当前调用域受控） | 返回前校验并抛 `BackupError` + 补单测 | low |
| T27 | U3-001 | `backup.ts` 绕过 `global-paths` 直接用 `homedir()`（N4 例外） | `src/core/backup.ts:9/:57` | 破坏「单点 mock 隔离」纪律 | `global-paths` 暴露 `getHomedir()`，backup 委托 | medium |
| T28 | U3-002 | `readProfile` 浅拷贝致模块级 `DEFAULT_PROFILE` 可被污染（实测复现） | `src/core/config.ts:184`；触发链 `commands/config.ts:201` | 同进程后续读取被污染 | 缺失分支返回结构化深拷贝 | medium |
| T29 | U3-003 | `buildCascadeConfig` 自行 parseYaml 绕过 Zod → 同键两命令行为矛盾（实测） | `flow-manager.ts:1616-1621` vs `config.ts:306` | `config effective` 可展示未校验值 | 按 `ConfigDefaultsSchema` 逐键校验（非法跳过 + warn） | medium |
| T30 | U3-004 | `config set --global` 白名单 `in` 检查原型链穿透 → TypeError 崩溃（未遂污染） | `src/commands/config.ts:179-189`；`getNestedValue:32-42` 无防护 | 未捕获崩溃（体验缺陷） | 改 `Object.hasOwn`；`getNestedValue` 跳过 `__proto__`/`constructor` | low |
| T31 | U3-005 | `projects` 非对象类型照单全收 + `recordProjectLang` 不规范化路径 | `workspace/identity.ts:149/:186-195`（对照 `config.ts:239` 有 `resolve()`） | 损坏数据 TypeError（被 try/catch 兜底） | `isPlainObject` 校验 + `resolve()` 规范化 | low |
| T32 | U3-006 | 盘符大小写不归一 → `recent_projects` 重复条目 | `src/core/config.ts:239` | Windows 去重失效 | 去重比较大小写不敏感 | low |
| T33 | U3-007 | profile 非法时 `config get --global` 静默空值（读写路径不对称） | `src/commands/config.ts`（读路径无 parseError 警告；对照写路径 B3 已拒写） | 用户误判「未设置」 | 读路径 stderr 输出 parseError 警告 | low |
| T34 | U3-011 | knowledge 标题含 `|`/换行污染 `index.md` 表格行 | `src/core/workspace/knowledge.ts:148`（解析侧 `:310`） | index.md 表格错位 | 写入前转义 `|`、折叠换行 | low |
| T35 | U2-REV-007 | `config` 组缺 description；`config get-lang` 误用带占位符的输出模板键作 description；`stage.create.desc`/`help.stage.create` 双键冗余 | `commands/config.ts:70/:75`、`commands/stage.ts:404`；`i18n-data/zh-CN.ts:366/555`、`en.ts:346/526` | 双轨求值脆弱、漂移风险 | 补组级 description；改挂独立 help 键；合并双键 | low |
| T36 | U2-REV-010 | `config set` 项目模式白名单仅 `auto_advance`，与 `config effective` 4 受管键不对称 | `commands/config.ts:214` vs `:247-252` | 其余 3 键只能手编 | **用户已裁定：扩展为全量 `defaults.*`**（schema 驱动 + 枚举校验 + 值类型归一 + get/set/effective 三口径一致；见 §三 R3） | low |
| T37 | U2-REV-011（双入口） | `view add` vs `flow review add` 同一数据源、行为细节不一致（title/priority/blocking/auto-fix/filed_by/op 校验 6 维度） | `commands/view.ts:41-69` vs `commands/flow.ts:734-804` | 用户困惑、审计口径不一 | **用户已裁定：收敛为单入口**（保留 `flow review`；`view add` 标 deprecated，**下一版本删除**；REV ID 单点分配；见 §三 R4） | low |

### 批次 D：i18n 与命令体验（op-004）

| T | 来源 | 问题 | 证据 | 影响面 | 建议修法 | 优先级 |
|:--:|------|------|------|--------|----------|:--:|
| T38 | U2-REV-003 | `applyHelpI18n` 不遍历 `cmd.arguments` → en 下 argument 描述全量中文泄漏；并发冲突文案 4+1 处重复硬编码 | `src/cli/index.ts:78-109`（缺 arguments）、`:140-142`；`commands/flow.ts:400-401/483-484/1317-1318`、`commands/stage.ts:432-433` | en 体验 + 维护单点 | walkCmd 增 arguments 遍历（键 `help.<path>.arg<name>`）+ 并发文案收敛到 `handleCliError` + i18n 键 | medium |
| T39 | U2-REV-004 | `flow wizard` 非 TTY 不静默、渲染 ANSI、失败 exit 0 | `src/commands/flow.ts:1314-1325`（无 isTTY 守卫、catch 无 exit）；对照 `stage.ts:414-417`、`model.ts:71-75` | CI/脚本误判成功 | 非 TTY 输出等价 `flow advance` 提示 + exit 1；catch 分类退出码 | medium |
| T40 | U2-REV-005 | REPL 被命令内 `process.exit` 终止；输出硬编码中文；help 列表含不存在命令、缺 7 命令组 | `src/cli/repl.ts:19/:27,:41,:49/:58-80` | REPL 可用性 + en 泄漏 | 命令错误路径改抛可捕获异常或独立 program 实例；help 动态生成 | medium |
| T41 | U2-REV-009 | `init`/`roadmap` 命令无 try-catch（堆栈外泄）；`model set --build` `execSync` 无 timeout | `commands/init.ts:35-37`、`commands/roadmap.ts:21,31`、`commands/model.ts:96` | 错误体验不一致 / 构建挂起 | 补 `common.errorTmpl`+exit 1；execSync 加超时并捕获 ETIMEDOUT | low |
| T42 | U2-REV-012 | `stage create` 与 `flow stage add` catch 块逐行复制（5+ 处拷贝） | `commands/stage.ts:429-444` vs `commands/flow.ts:397-412` | 单点修改易漏 | 随 T38 抽取「addStage 错误处理」私有 helper | low |

### 批次 E：测试质量与覆盖（op-005）

| T | 来源 | 问题 | 证据 | 影响面 | 建议修法 | 优先级 |
|:--:|------|------|------|--------|----------|:--:|
| T43 | U5-021 | `i18n.test.ts` 以 `getCliLang('.')` 断言，绑定仓库 `.info.json` + **真实** `~/.openfeel/config.json` | `test/core/i18n.test.ts:60-62`；`src/core/i18n.ts:141-160` | 用户切 en 即翻转失败（环境依赖，只读） | 改 mkdtemp + fixture `.info.json`；全局分支 `vi.mock('node:os')` | medium |
| T44 | U5-022 | `backup.test.ts` 用 `console.warn + return` 跳过 → vitest 标记 **passed** 而断言未执行 | `test/core/backup.test.ts:168-171/:192-195`（对照 `flow-concurrent.test.ts:55` `it.skipIf` 正确范式） | 「全绿掩盖未执行」盲区 | 改 `it.skipIf(...)` 使 skipped 可见 | medium |
| T45 | U5-025 | `model.test.ts` get 用例孤立弱断言（仅 exitCode + stdout truthy） | `test/commands/model.test.ts:85-89`（对照 `:79-82` list 用例充分） | 输出回归不可捕获 | 断言含 agent 名与 model 值；cwd 隔离 | low |
| T46 | U5-026 | 命令层 10/16 无直接测试；`cli/repl.ts`、`cli/index.ts` 零测试 | `src/commands` 16 vs `test/commands` 6；`rg -l "repl\|cli/index" test/` 零命中 | 覆盖缺口 | **用户已裁定：按方案默认**（补 stage/update/setup + repl smoke 4 项；其余 7 族仅登记）（见 §三 R5） | low |
| T47 | U8-004 | `REV-1103` anomaly 路径级去重**无单测断言** | 实现 `update-infos.ts:171-184`；`test/core/update-infos.test.ts` 无去重用例 | 关键失败语义无回归保护 | 补「同路径二次 append 跳过；resolved 后可再记录」单测 | low |
| T48 | U8-005 | migrate fail-fast（REV-011-B）与 `finally` 回填（REV-1405）**无单测断言** | `src/core/migrate.ts:524`（无 catch）、`:537-542`；`test/core/migrate.test.ts` 无注入（对照 `setup.test.ts:17-29` 有 `backupMock`） | 关键失败语义无回归保护 | 仿 setup.test 补备份失败注入 + 断言 fail-fast/manifest 回填/rollback 收敛 | low |
| T49 | U8-006 | `backupLegacy` ts 用 UTC 无毫秒且无撞名探测 → 同秒两次可覆盖前一次备份 | `src/core/migrate.ts:207/:209/:219/:227`（对照 `backup.ts:43-47/:94-104` 本地时区+毫秒+撞名 `-N`） | 备份丢失（单用户概率低） | 复用 backup.ts 撞名策略或 `existsSync` 递增后缀 | low |
| T50 | U8-008 | 全局 jsonc 不可读时 parse 失败降级二次抛错（EISDIR abort） | `migrate.ts:521`、`update.ts:1657`、`setup.ts:71` | 错误归因与降级预期不符 | 降级读取包 try/catch（读不到按 `'{}\n'`）或区分错误信息 | low |
| T51 | U8-009 | `saveUpdateState`（项目级）无锁，与 `saveGlobalUpdateState` 不一致 | `src/core/update-state.ts:114-121` vs `:148-153` | 并发模式不一致 | 统一「均锁 + 原子写」或注释明示理由 | low |
| T52 | U8-010 | `migrate rollback` 强制以 cwd 为项目根，无 `[path]` 参数 | `src/commands/migrate.ts:36-44`（对照主命令 `migrate [path]`） | 错误目录静默指向 cwd | help 注明「须在项目根执行」或支持可选 path | low |

### 批次 F：模板与文档口径（op-006）

| T | 来源 | 问题 | 证据 | 影响面 | 建议修法 | 优先级 |
|:--:|------|------|------|--------|----------|:--:|
| T53 | **U4-001 + `templates/BUG-003`**（用户指定必纳） | 部署型 skill 模板 **34 行** `node bin/openfeel.js` 在用户全局环境不可执行；其中 health/model-check/recover 3 skill **无任何二态加注** | `src/core/templates-data/opencode/skills/`：`openfeel-cli-usage`(26)、`openfeel-wizard`(3)、`openfeel-health`(2)、`openfeel-model-check`(2)、`openfeel-recover`(1)；生成段同步（`update.ts`/`template-loader.ts` 各 34） | 用户照抄即 `Cannot find module` | **双口径**：用户环境主口径 `openfeel <cmd>`；文首加注「本仓自举用 `node bin/openfeel.js <cmd>`」；**模板权威源改动 → `npm run build`**；建议 CI/lint 轻量断言（`node bin` 仅许出现在加注行） | low |
| T54 | U4-002（用户指定必纳） | `agents-md/en.md:438` 流转图注「验收不通过」未译 | `src/core/templates-data/agents-md/en.md:438`（zh:437 同图） | en 读者语义不可达 | 图注改英文或中英并列；build 同步 | low |
| T55 | U4-003（用户指定必纳） | `cli-usage:35` flow 子命令枚举缺 `phases`/`stage`；命令速查表缺 5 命令族 | `openfeel-cli-usage/SKILL.md:35`、`:22-33`（`src/commands/` 实有 16 族） | 自描述不完整 | 枚举串补 2 项；命令表补 5 族或在「说明」声明快照范围 | low |
| T56 | U4-004（用户指定必纳） | `build.js` 注释计数漂移（N2「三对」实为两对；步骤 8「8 带前缀/14 带前缀」实为 9/17） | `build.js:963`、`:1077`、`:1085` | 注释误导 | 改为实际计数 | low |
| T57 | U7-03 | `CHANGELOG.md` `[1.1.2]` 缺 stage-48/49 后继条目（env guard/version gate；CI 加固 `afe93dd`） | `CHANGELOG.md` `[1.1.2]` 节 | 发布记录不完整 | 补 Changed/Fixed 条目（本阶段收口时一并补 stage-50） | low |

---

## 三、裁定表（修 / 不修 + 待裁定 + 兼容性影响）

| 裁定 | 条目 | 说明 |
|------|------|------|
| **本阶段修（52 条）** | T1~T16、T18~T24、T26~T35、T38~T45、T47~T57 | 一致性/健壮性/测试补强/口径修复；均为 low~medium，改动局部 |
| **待裁定（6 条，须用户拍板）** | 见下 | 涉及行为变更或策略选择，**默认按「建议方案」实施，若用户另有裁定以用户为准** |
| **不修（3 条）** | U1-N5 补组合键（改 T19 显式化代偿）；`U3-009`/`U3-010`（有意设计/设计使然，后者文档注明 → 归档官） | 收益不抵改动面或与配置意图冲突 |
| **归归档官（不纳入）** | U3-008、U1-N7、U8-011、U8-012①②③、M5 键文案侧 | 文档/注释类，已在 §一 列明 |
| **已闭环（不纳入）** | U6-001/002/003、B1~B4 | 见 §一 核实结论 |

### 待裁定项（兼容性影响）→ **已由用户裁定（2026-09-30，不可推翻）**

> **裁定状态**：R1~R6 **全部已获用户答复**（2026-09-30）；下方「建议（Planner）」列**仅供追溯**——其中 **R1** 方向一致（正式采纳）、**R2/R5/R6** 与建议一致、**R3/R4 的建议已被用户推翻**（见各条「用户裁定」列）。已按裁定回写至 `ops/op-002.md`、`ops/op-003.md`、`ops/op-005.md`、`ops/op-006.md` 与 `ops/deps.yaml`（`decisions_taken`）。

| # | 条目 | 变更内容 | 兼容性影响 | 建议（Planner，追溯用） | **用户裁定（权威）** |
|:--:|------|----------|-----------|------------------|------|
| **R1** | T17 | `lint i18n`/`lint kb` 发现问题 → **exit 1** | **行为变更**：现有 CI/脚本若用 `lint i18n` 且忽略退出码，将由 0 → 1；当前仓库 533 键一致、`lint kb` 0 过期，故**当前不会触发**；但外部用户脚本可能受影响 | **建议采纳**（与 `flow health` 一致，是门禁必要语义）；同步更新 README/docs/manual 与 CHANGELOG（Breaking/Changed） | **改为非 0 退出**（对齐 `flow health`）。须补：兼容影响说明 + 受影响断言清单 + **逃生阀裁定 = 不新增 `--no-fail`/`--warn-only`**（调用方用 `\|\| true` 表达忽略） |
| **R2** | T25 | `update_infos.md` 清理策略 | 若新增清理命令 = 新命令面；若自动归档 resolved = 行为变更 | **建议最小化**：仅**文档化**手工清理路径（manual/core/backup.md 或 update-infos 段），**不新增命令**；`clearUpdateInfos` 保留现状（供测试/未来） | **按方案保守默认**：不新增自动清理；仅代码注释 + 文档说明「条目只增不减」现状与人工清理建议（**显式标注「按保守默认执行」**；manual 归归档官） |
| **R3** | T36 | `config set` 白名单是否扩到 4 受管键 | 扩白名单后用户可 CLI 改 `execution_mode`/`test_enabled`/`merge_mode`（会改变流水线行为） | ~~**建议不扩**：仅**改进报错文案**~~（**已被推翻**） | **扩展为全量 `defaults.*`**（`execution_mode`/`test_enabled`/`merge_mode` 等全部纳入 `config set/get`）。须补：键白名单（schema 驱动）+ 取值校验（**枚举非法须报错且不写盘**）+ `setConfigValue` **值类型归一**（boolean 键写布尔）+ `config get/set/effective` **三口径一致** + i18n 双语文案 + **T36 关系澄清**（原「不扩白名单」结论作废） |
| **R4** | T37 | 双入口（`view add` / `flow review add`）是否归一 | 归一 = 命令面变更（可能删/别名化 `view add`） | ~~**建议对齐不删除**~~（**已被推翻**） | **收敛为单入口**：保留 `flow review`（`flow review add`）；`view add` 标 **deprecated** 并在**下一版本删除**。须补：弃用提示（**TTY 输出 stderr / 非 TTY 静默**，对齐 `stage.create` 惯例）+ 文档与 manual 更新（归归档官）+ 既有测试调整 + **REV ID 归属**（归一后由单一写入方分配，避免竞态） |
| **R5** | T46 | 覆盖缺口是否本阶段补 | 补测试增加工作量（命令层 10 + repl/cli） | **建议按风险补 4 项**：`stage`/`update`/`setup` 命令层 + `repl` smoke；其余（archive/instructions/knowledge/lint/project/roadmap/view）**仅登记**，归后续 | **按方案默认**：补 4 项高价值覆盖；其余 7 族**仅登记**（**显式标注**） |
| **R6** | T18③ | 是否引入 coverage 门槛 | `@vitest/coverage-v8` 已装但无 script/阈值；启用后 CI 增加耗时与潜在红灯 | **建议引入但阈值宽松**（初值 line ≥ 60%，仅提示不阻断），或先只加 `test:coverage` script 不加阈值 | **报告不阻断**：CI 增 coverage **报告**（仅观测基线，**不设阈值失败**）；须写明「后续可收紧」路径（观测 → 单维 `lines` → 逐维 → 阻断开关） |

> **R1~R6 已全部获用户裁定（2026-09-30，权威结论见上表末列）**。R1 因属外部可见行为变更，**发布前须在 `CHANGELOG` 明示**；R3/R4 已推翻 Planner 原建议，相关 op 与 `deps.yaml` 已按裁定回写。

---

## 四、前置依赖与上下游衔接

- **hard 依赖 `v1.1.2-stage-49`**（已 done/归档）：本阶段清单全部来自其总报告与单元报告的流转裁定；`stage-49` 的 8 份单元 REV 条目状态为 `pending`，本阶段实施即为其承接。
- **soft 依赖 `v1.1.2-stage-48`**：`templates/BUG-003` 与 `U4-001` 为事件 C 口径治理的续作（stage-48 已统一「本仓自举」口径，本阶段补「用户环境口径」）。
- **下游**：无固定后继（v1.1.2 收尾）；非本阶段项（归档官文档类、R5 登记项）由归档/后续版本承接。
- **顺序**：`… → 49 → 50`。

---

## 五、op 级任务清单

| op | 批次 | 主题 | 具体改动点（文件:行号） | 验收要点 |
|:--:|:--:|------|------------------------|----------|
| op-001 | **A** | 内部模式一致性 | `flow-manager.ts`：`:1099-1106`（current.op 置空）、`:362`/`:1100`/`:2689`/`:997` 守卫收口（load normalize）、`:2148-2152`（后缀唯一性）、`:1108-1112`（paused WARN）、`:3038`+`:1782-1785`（checkpoint 死键）、`:1155-1157`（`execFileSync`）、`:1968`/`:3088-3097`（不可达收敛）；`archive/merge.ts:56-63`（`lastIndexOf`）；`public-logger.ts:104-107`（extra 展开）、`:60-65`；`metrics.ts:55-62`、`:117-142`；`instruction-loader.ts:209-227/:286/:278-283`；`plan/roadmap.ts:79`；`view/entry.ts:14-18`；`utils/kb-dedup.ts:34`（+测试） | T1~T16 逐条断言；`npm test` 相关文件不回归；`flow health` 对悬空 current 不再误报；缺 ops 的存量 flow.json 不崩 |
| op-002 | **B** | 门禁与 CI 失效面 | `.github/workflows/ci.yml:19-59`（snapshot 上移 + 增仓库 `config.yaml` + coverage **报告步骤（无阈值）** + 清 `fetch-depth`）；`src/commands/lint.ts:86-96/:136-144`（**R1 已裁定：非 0 退出**）；`src/commands/flow.ts`（`phases` 增 transitions 差异报告，T19）；`package.json`（`test:coverage`）+ `vitest.config.ts`（coverage 配置，**无 thresholds**）；`.gitignore`（+`.openfeel/tmp/`）；`.gitattributes`（+生成物宿主） | `lint i18n`/`lint kb` 异常时 exit 非 0 且正常时 exit 0（`--warn-only` **不存在**）；ci.yml YAML 合法且步骤顺序满足守卫窗口；coverage 报告步骤**永不致失败**；`flow phases` 差异报告可见；`git status` 不再出现 `.openfeel/tmp/` 泄漏 |
| op-003 | **C** | 死代码与配置面 | 删除 `src/utils/path.ts`（T22）+ 清理引用；`fs/atomic-write.ts:106` 注释；`commands/setup.ts`（skipped 输出）；`core/update-infos.ts:222`（**R2 已裁定：保守默认**）；`core/backup.ts:50-59`（越界守卫）+ `global-paths.ts` 新增 `getHomedir()`、`backup.ts:9/:57` 委托（T27）；`core/config.ts:184`（深拷贝）、`:239`（大小写去重）、`:463-483`（**R3：setConfigValue 值类型归一**）；`flow-manager.ts:1616-1621`（Zod 逐键）；`commands/config.ts:179-189`（`Object.hasOwn`）+ `getNestedValue` 防护、`:70/:75`（description）、`:214`/`:221-224`（**R3 已裁定：schema 驱动全量键 + 枚举校验**）；`workspace/identity.ts:149/:186-195`；`workspace/knowledge.ts:148`；`commands/flow.ts:734-804` + `view.ts:41-69`（**R4 已裁定：收敛单入口 + view add deprecated**） | T22~T37 逐条断言；**4 键 round-trip + 枚举非法报错不写盘 + `test_enabled` 布尔归一**；get/set/effective 三口径一致；越界备份路径抛 `BackupError`；`config set --global __proto__` 不再崩溃；`view add` TTY 下 stderr 弃用提示（非 TTY 静默） |
| op-005 | **E** | 测试质量与覆盖 | `test/core/i18n.test.ts:60-62`（隔离）；`test/core/backup.test.ts:168-171/:192-195`（`it.skipIf`）；`test/commands/model.test.ts:85-89`（强断言）；`test/core/update-infos.test.ts`（+anomaly 去重用例）；`test/core/migrate.test.ts`（+备份失败注入/rollback 收敛）；`test/core/update-state.test.ts`（+Global 函数）；按 **R5 已裁定** 新增 `stage`/`update`/`setup` 命令层与 `repl` smoke | 新增断言全部通过；**无静默 skip**（skipped 状态可见）；`npm test` 用例数 ≥ 716 + 新增；其余 7 族**仅登记** |
| op-004 | **D** | i18n 与命令体验 | `src/cli/index.ts:78-109`（arguments 遍历）+ `:140-142`（并发文案单点）；`i18n-data/{zh-CN,en}.ts`（补键，`lint i18n` 门禁）；`commands/flow.ts:1314-1325`（非 TTY + exit 1）、`:400-401/483-484/1317-1318`；`commands/stage.ts:432-433`、`:429-444`（helper）；`src/cli/repl.ts:19/:27,:41,:49/:58-80`；`commands/init.ts:35-37`、`commands/roadmap.ts:21,31`、`commands/model.ts:96`（timeout） | en 下 `--help` 的 Arguments 行为英文；wizard 非 TTY exit 1；REPL 不因命令错误退出；并发冲突文案单点且双语 |
| op-005 | **E** | 测试质量与覆盖 | `test/core/i18n.test.ts:60-62`（隔离）；`test/core/backup.test.ts:168-171/:192-195`（`it.skipIf`）；`test/commands/model.test.ts:85-89`（强断言）；`test/core/update-infos.test.ts`（+anomaly 去重用例）；`test/core/migrate.test.ts`（+备份失败注入/rollback 收敛）；`test/core/update-state.test.ts`（+Global 函数）；按 **R5** 新增 `stage`/`update`/`setup` 命令层与 `repl` smoke | 新增断言全部通过；**无静默 skip**（skipped 状态可见）；`npm test` 用例数 ≥ 716 + 新增 |
| op-006 | **F** | 模板与文档口径 | `templates-data/opencode/skills/{openfeel-cli-usage,openfeel-wizard,openfeel-health,openfeel-model-check,openfeel-recover}/SKILL.md`（34 行口径 + 3 skill 补加注，T53）；`templates-data/agents-md/en.md:438`（T54）；`SKILL.md:35/:22-33`（T55）；`build.js:963/:1077/:1085`（T56）；`CHANGELOG.md`（T57）；**`npm run build`** 重生成 `SKILL_DEFINITIONS`/`OPENCODE_SKILL_DEFINITIONS`/`AGENTS_MD_TEMPLATES` 与 `.opencode/` 自举 | `rg -c "node bin/openfeel.js" src/core/templates-data/opencode/skills` 仅余加注行；`templates/BUG-003` 可关闭；build 幂等（零 diff）；`agents-md` 双语图注一致 |
| op-007 | — | 全量回归与门禁收口 | `npm run build && npm test`；`node bin/openfeel.js lint i18n`（533 键）；`node bin/openfeel.js lint kb`（0 过期）；环境隔离核验（运行前后真实全局目录 hash+mtime 不变） | 全绿；四门禁通过；环境零污染 |

---

## 六、影响文件清单

| op | 新增 | 修改（预估） |
|:--:|------|--------------|
| op-001 | — | `src/core/flow-manager.ts`、`src/core/archive/merge.ts`、`src/core/public-logger.ts`、`src/core/metrics.ts`、`src/core/artifact-graph/instruction-loader.ts`、`src/core/plan/roadmap.ts`、`src/core/view/entry.ts`、`src/utils/kb-dedup.ts`（8） |
| op-002 | — | `.github/workflows/ci.yml`、`src/commands/lint.ts`、`src/commands/flow.ts`、`.gitignore`、`.gitattributes`、`package.json`（coverage script）（6） |
| op-003 | — | `src/utils/path.ts`（删除）、`src/core/fs/atomic-write.ts`、`src/commands/setup.ts`、`src/core/update-infos.ts`、`src/core/backup.ts`、`src/core/global-paths.ts`、`src/core/config.ts`、`src/core/flow-manager.ts`、`src/commands/config.ts`、`src/core/workspace/identity.ts`、`src/core/workspace/knowledge.ts`、`src/commands/flow.ts`、`src/commands/view.ts`（12+1 删除） |
| op-004 | — | `src/cli/index.ts`、`src/cli/repl.ts`、`src/commands/flow.ts`、`src/commands/stage.ts`、`src/commands/init.ts`、`src/commands/roadmap.ts`、`src/commands/model.ts`、`src/core/i18n-data/{zh-CN,en}.ts`（8） |
| op-005 | 新增测试用例（若 R5 采建议：+4 测试文件） | `test/core/i18n.test.ts`、`test/core/backup.test.ts`、`test/commands/model.test.ts`、`test/core/update-infos.test.ts`、`test/core/migrate.test.ts`、`test/core/update-state.test.ts`（6） |
| op-006 | — | `templates-data/opencode/skills/*/SKILL.md`（5）、`templates-data/agents-md/en.md`、`src/core/update.ts`（生成段）、`src/core/template-loader.ts`（生成段）、`.opencode/skills/*`（自举）、`.opencode/agents/*`（自举）、`build.js`、`CHANGELOG.md`（8+） |

> 合计约 **35~40 个文件**（含 1 删除、5 生成段/自举联动）。**预估改动量**：源码/配置 ~28 文件、测试 ~6~10 文件、模板/文档 ~10 文件；总净增/改行数约 **600~900 行**（以一致性小改为主，单点改动多在 1~15 行）。

---

## 七、完成标准

1. T1~T57 全部处置：52 条修复验收通过；6 条待裁定项按用户裁定或「建议方案」实施并在修订记录留痕；3 条不修项与归档/历史类显式记录（不静默遗漏）。
2. **门禁全绿**：`npm run build && npm test`（基线 **41 文件 / 716 用例**，本阶段新增后 ≥ 该数）；`node bin/openfeel.js lint i18n`（**533 键**一致）；`node bin/openfeel.js lint kb`（**0 过期**）。
3. **测试隔离硬要求**：所有测试与实测不触碰真实 `~/.openfeel/`、`~/.config/opencode/`、`~/.config/openfeel/` 与仓库 `.openfeel/config.yaml`；op-007 以 hash+mtime 双快照核验零 diff。
4. `templates/BUG-003` 满足关闭条件（34 行口径修正 + 3 skill 补加注 + build 同步）；`U4-002/003/004` 落地。
5. 行为变更项（**R1** `lint` 退出码 →非 0；**R3** `config set` 支持全量 `defaults.*`；**R4** `view add` 弃用〔下一版本移除〕；T49 备份文件名格式；T19 `flow phases` 附加输出）在 `CHANGELOG.md` 与 docs/manual 同步说明（docx/manual 正文归归档官）。
6. 生成段与 `.opencode/` 自举为 `npm run build` 产物（禁手改），build 幂等（重跑零 diff）。

---

## 八、测试策略

| 验证点 | op | 方式 |
|--------|:--:|------|
| 悬空 `current.op` | 001 | 构造「op 全 done 的阶段推进」fixture → `pipeline.current.op === ''`；`flow health --quick` 不再报「不存在的 op」 |
| 缺 `ops` 存量数据 | 001 | 手工构造缺 `ops` 的 flow.json → `advance`/`save` 不抛 TypeError；`validate()` 或 normalize 报告 |
| 含点 stageId 归档 | 001 | 构造 `v1.0.0-stage-04.op-001` 的 review → `merge` 归档摘要含审查记录 |
| fuzzy 后缀唯一性 | 001 | `advanceStagePhase(stage,'ing')` → 返回 null 或告警（不再落 `plan_pending`） |
| checkpoint 死键 | 001 | archiving 阶段推进 → checkpoint 字段行为符合裁定（删键或补映射） |
| `lint` 退出码（R1） | 002 | 人为构造键不对称 → `lint i18n` exit 1；正常仓库 exit 0 |
| CI 守卫窗口/覆盖 | 002 | 本地脚本模拟：改仓库 `config.yaml` → 守卫 diff 失败；YAML 解析通过 |
| transitions 差异报告（T19） | 002 | `flow phases` 在 pipeline.yaml 缺组合键时输出差异行 |
| 越界备份路径 | 003 | `computeBackupRel` 传入 HOME/project 外路径 → 抛 `BackupError` |
| profile 深拷贝 | 003 | 原位改 `readProfile()` 返回值 → 再次读取不被污染 |
| 级联 Zod 校验 | 003 | `config.yaml` 非法值 → `config effective` 与 `config get` 行为一致（均报错/均降级，按裁定） |
| 原型链穿透 | 003 | `config set --global __proto__ v` → 不崩溃、明确报错 |
| i18n arguments | 004 | `lang=en` → `stage create --help` 的 Arguments 行为英文 |
| wizard 非 TTY | 004 | `node bin/openfeel.js flow wizard < NUL` → exit 1 + 等价命令提示 |
| REPL 存活 | 004 | 管道输入「错误命令 + exit」→ 进程不中途退出、输出「再见」 |
| 测试静默跳过 | 005 | 无 dist 场景 → `backup.test.ts` 显示 `skipped` 而非 `passed` |
| migrate 失败语义 | 005 | 注入备份失败 → fail-fast + manifest 回填 + rollback 收敛 |
| 模板口径 | 006 | `rg -c "node bin/openfeel.js" .../skills` 仅余加注行；build 幂等零 diff |
| 全量回归 + 隔离 | 007 | 四门禁 + 环境双快照零 diff |

---

## 九、风险与注意事项

| # | 风险 | 缓解 |
|---|------|------|
| R-1 | **`lint` 退出码变更为外部可见行为**（R1） | **用户已裁定：改为非 0 退出**；当前仓库不触发（533 键一致/0 过期）；CHANGELOG + docs/manual 明示；**逃生阀裁定＝不新增 `--no-fail`/`--warn-only`**（迁移期由调用方 `\|\| true` 表达） |
| R-2 | 同类多改点触碰 `flow-manager.ts`（T1/T2/T4/T6/T9/T12/T16/T29），易合并冲突 | op-001 与 op-003 **串行**（同文件）；统一由单执行流顺序改 |
| R-3 | 删除 `utils/path.ts` 误伤（若存在动态引用） | 删除前 `rg` 全仓（含 `build.js`/测试/模板串）双重确认；无命中才删 |
| R-4 | 模板口径修复后**未 `npm run build`** → 生成段/自举不一致 | op-006 显式 build；build 内置单源一致性断言兜底；验收含 `rg` 计数 |
| R-5 | 测试新增/改动引入真实环境写入（历史事故） | **硬要求**：`vi.mock('node:os')` / 临时目录；op-007 双快照核验；沿用 backup.test 的 env 隔离范式 |
| R-6 | 批次 E 新增测试与批次 A~D 改动的**时序**（先改码后测） | op-005 在 op-001~004 之后执行（或同步推进测试）；op-007 统一回归 |
| R-7 | ~~待裁定项（R1~R6）未获裁定即实施 → 返工~~ | **已消除**：R1~R6 全部获用户裁定（2026-09-30），op 与 `deps.yaml`（`decisions_taken`）已按裁定回写；实施直接执行 |
| R-8 | 范围蔓延（把归档官文档类也改了） | §一 已列排除项；op 任务表不含 docs/README/manual（除 op-006 的 skill/agents-md 模板与 CHANGELOG）；**R1/R3/R4 的 docs/manual 更新明确归归档官** |
| R-9 | `update_infos` 清理策略（R2）若选自动归档 → 行为变更 | **用户已裁定：按保守默认**（仅代码注释 + 文档说明；不新增命令/自动归档）；零行为变更 |
| R-11 | **R3 值类型归一缺失** → `test_enabled` 写成字符串 `"true"`，致配置校验失败 | op-003 T36 步骤 3「先归一后 parse/写入」；§五 布尔归一断言 + §六 验收 11 双保险 |
| R-12 | **R4 弃用提示污染 CI** 或「下一版本删除」被遗忘 | 仅 TTY 输出 stderr（非 TTY 静默，对齐 `stage.create`）；删除项登记于 CHANGELOG `Deprecated` + op-007 登记项清单 |
| R-10 | coverage 门槛（R6）引入红灯 | **用户已裁定：报告不阻断**（`vitest.config.ts` 不设 `thresholds`；CI 步骤不参与成败判定）；收紧路径写入 op-002 T18③（观测 → 单维 `lines` → 逐维 → 阻断） |

---

## 十、op 执行顺序与依赖

```
【串行链：op-001（批次 A）→ op-003（批次 C）→ op-002（批次 B）→ op-004（批次 D）】
    理由：op-001/op-003 同改 `src/core/flow-manager.ts`；
          op-003/op-004 同改 `src/commands/flow.ts`（T37 vs T39）；
          op-002/op-004 同改 `src/commands/flow.ts`（T19 vs T39）
          → 四者由单执行流顺序触碰，避免同文件写冲突。

【并行组（与上述源码文件无交集，可并行）】
  op-005（批次 E：`test/**`）
  op-006（批次 F：`templates-data/**` + `build.js` + `CHANGELOG.md`）

                    │
                    ▼
        op-007（全量回归 + 门禁收口）
```

**建议顺序**：`op-001 → op-003 → op-002 → op-004` ∥ `op-005` ∥ `op-006` → **op-007**。

- **并行/互斥依据**：`op-001/op-003/op-002/op-004` 共享 `src/core/flow-manager.ts` 或 `src/commands/flow.ts`，**必须串行**（见上图理由）；`op-005`（`test/**`）与 `op-006`（`templates-data/**`/`build.js`/`CHANGELOG.md`）与上述源码文件**无交集**，可并行。
- `op-005` 的测试断言对象涉及 op-001~004 的实现，**建议在 op-004 之后启动（或边改边补）**。
- `op-006` 的 `npm run build` 须在源码改动稳定后执行（避免重复重生成）。
- `op-007` 最后统一回归与门禁收口。

---

## 十一、修订记录

| 时间 | 修订人 | 依据 | 修订内容 |
|------|--------|------|----------|
| 2026-09-30 | openfeel-planner | 用户需求「v1.1.2-stage-50：全量审查 non-blocking 集中清理（第二批）」 | 新建本阶段：从 stage-49 总报告 §五 筛出 ~40 条并扩展为 **T1~T57** 编号化清单（6 批次）；裁定表（52 修 / 6 待裁定 / 3 不修 / 归档与已闭环排除）；op-001~op-007；`U1-N5` 复核裁定（不补组合键，改差异显式化）；含 `templates/BUG-003` + U4-001 部署型 skill 口径修复 |
| 2026-09-30 | openfeel-schemer | **用户对 R1~R6 的裁定答复（不可推翻）** | 逐项回写方案与依赖：**§三** 待裁定表 → 「已裁定（权威）」表（R1 非 0 退出 + 逃生阀不加；R2 保守默认；**R3 扩全量 `defaults.*`〔推翻原建议〕**；**R4 收敛单入口 + `view add` deprecated 下版本删除〔推翻原建议〕**；R5 补 4 项；R6 报告不阻断）；**§二** T17/T18/T25/T36/T37/T46 行同步；**§五** op-002/op-003/op-005 行同步；**§七** 完成标准 5 扩展行为变更清单；**§九** R-1/R-7/R-9/R-10 改写 + 新增 R-11/R-12。对应 op 文件与 `ops/deps.yaml`（新增 `decisions_taken`、`decision_at: 2026-09-30`）同步修订 |
