# Changelog

本项目的全部重要变更记录在本文档中，格式遵循 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [1.1.2] - 2026-09-29

### Added
- `openfeel flow phases [--json]`：自描述全部合法 phase 与运行时转移表（`--json` 含 `schemaVersion`/`phases`/`transitions`/`advanceAccepted`/`transitionsDiff`）
- `openfeel flow stage remove <stageId>`：安全移除阶段（ops 非空 / 当前活跃 / 被依赖时默认拒绝；`--force` 越过、`--dry-run` 预览、`--purge` 删目录）
- `openfeel plan stage add <name> --deps <ids...>`：CLI 暴露依赖声明（写入 `flow.json.stages[].deps` + `overview.md`）
- `openfeel config effective [key]`：输出配置有效值 + 生效来源（`status.md > config.yaml > profile.yaml > builtin`）
- stageId 校验与冲突检测：`validateStageId` / `suggestStageId` / `findStageDirConflict`（`(series, stageDir)` 冲突阻止 + 建议名）
- 部署覆盖前自动备份：全局根 `~/.openfeel/backup/{ts}/` + `update_infos.md` 新增「备份」类条目 + `feel.md` 检查规则
- 新增 skill `openfeel-cli-usage`（CLI 命令/参数/phase/stageId 用法按需加载参考；skill 总数 16 → 17）
- [stage-50] CI 环境守卫与版本门禁（stage-48）：测试前后对全局目录 + 仓库项目配置做 sha256 快照比对（守卫窗口前移），`--version` 与 `package.json.version` 一致性门禁
- [stage-50] **Added（R3）**：`openfeel config set`/`get` 支持**全量 `defaults.*`** 键（`execution_mode` / `test_enabled` / `merge_mode` 等），含枚举值校验与布尔类型归一
- [stage-50] **Added（R6）**：`npm run test:coverage` 与 CI 覆盖率**报告**（仅观测基线，不阻断）
- [stage-58] **Added**：输出编码自适应——`--encoding <utf8|gbk|auto>` / `OPENFEEL_ENCODING`；Windows 非 TTY（管道/重定向）按控制台 `chcp` 转码；`--json` **恒 UTF-8**（第 1 步最高优先）；不可编码字符降 `?` 不告警
- [stage-58] **Added**：CLI 运行日志——`~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log`（**恒 UTF-8、默认开启**）；`--log-file <path>` / `--no-log` / `--debug`；与 `.openfeel/log/**`、`flow.json.log[]`、`update_infos.md` 四类日志**语义分离**；`error` 仅记命令处理中抛出的异常（解析期错误不入日志）
- [stage-58] **Added**：直接依赖 `iconv-lite@^0.7.2`（MIT；原已经由 `@inquirer` 间接在 prod 依赖树中，本阶段提升为直接依赖）

### Changed
- `auto_advance` 口径统一为「项目 `config.yaml` 优先、全局画像兜底」三级有效链
- `pipeline.phase` 改为全量 done 判定（所有阶段均 done 时置 `done`）
- 命令职责分层：`plan stage add`（完整入口）> `flow stage add`（仅注册）> `stage create`（弃用，运行时提示）
- 成功注册阶段 / 操作补审计日志（`register_stage` / `register_op`）
- 9 个 agent 模板补 `external_directory: "allow"`（opencode 适配器）；`openfeel-utility` 的 `write` 改回 `edit`
- 平台强限定描述泛化（去「唯一 harness」表述，零行为变更）
- 文档/手册与 CLI 同步（`docs/commands.md` 新增 `## config` 节等）
- 版本号 1.1.0 → 1.1.2 全链路同步（`package.json` / `config.yaml` / `config.ts` 模板 / agents-md 模板 / `AGENTS.md` / `package-lock.json` / `CHANGELOG`）
- [stage-50] CI 加固（stage-49，commit `afe93dd`）：环境守卫覆盖仓库项目配置、coverage 报告步骤、`fetch-depth` 清理
- [stage-50] **Changed（行为变更，R1）**：`openfeel lint i18n` / `lint kb` 发现问题改为**非 0 退出**（门禁语义，对齐 `flow health`；外部脚本若忽略退出码将受影响）
- [stage-50] **Changed（行为变更）**：`openfeel migrate` 备份目录名改为**本地时区 + 毫秒 + 撞名后缀**（T49，防同秒两次备份互相覆盖）
- [stage-50] `openfeel flow phases --json` 追加 `transitionsDiff` 字段（T19，运行时与内置默认转移表差异可见；既有 `phases`/`transitions`/`advanceAccepted` 保留）

### Deprecated
- [stage-50] **Deprecated（R4）**：`openfeel view add` 已弃用，**将于下一版本移除**；请迁移至 `openfeel flow review add`（本版本仅弃用 + 运行时提示）

### Removed
- **`openfeel view add` 子命令已移除**（v1.1.2-stage-52，A4，**破坏性变更**）。迁移：改用 `openfeel flow review add`（同一单点实现 `addReviewEntry`，行为等价，支持 `--priority` / `--blocking` / `--auto-fix`）。保留 `openfeel view list` 与 `openfeel view accept`（列出与验收，与 `flow review` 无重叠语义）。

### Fixed
- `config/BUG-004`：`identity.test.ts` 直写真实 `~/.openfeel/config.json` 的测试隔离缺口——改为 N4 单点 mock + 新增隔离守护用例（真实文件 mtime/SHA-256 前后不变）
- 已登记缺陷集中清理：`cli/BUG-001`、`cli/BUG-002`（stageId 冲突 i18n）、`archive/BUG-001`、`config/BUG-002`（`config.yaml` 覆盖语义）、`config/BUG-003`、`templates/BUG-002`
- 移除随包 `postinstall` 补丁（`scripts/patch-inquirer.js`）：该补丁在用户端 `node_modules` 布局下必然静默失效（`util.styleText` 自 Node 20.12 起已内置，允许区间内无需补丁）
- `engines.node` 由 `>=20.0.0` 收窄为 `>=20.17.0`，与 `@inquirer/core` 要求一致，避免 Node 20.0~20.16 下交互命令崩溃
- 移除 `src/index.ts` 中从未生效的死导出 `VERSION`（值恒为 `0.1.0`、全仓零引用；`exports["."]` 不再暴露错误版本号；CLI 版本仍取自 `package.json`）
- [stage-50] **内部模式一致性（批次 A，T1~T16）**：`pipeline.current.op` 改由 `FlowManager.syncCurrentOp` **单点同步**（修复推进无 pending op 的阶段时 `current.op` 跨阶段悬空）；`load()` 一处收口补 `ops={}`/`deps=[]`（存量缺字段不再 `TypeError`）；`fuzzyCorrectPhase` 后缀补唯一命中检查；`logMilestone` 保留 `MilestoneEvent` 全字段；`checkpoint_mapping` 补 `archiving` 键；`autoCommitOnDone` 改 `execFileSync('git', [...])`；`roadmap` core 层改抛 `Error`；`PublicLogger`/`MetricsStore` 单例键含路径；REV ID 取既有最大序号 +1；僵尸检测锚定 `stageId + '.'`；`metrics.summary` 走 i18n
- [stage-50] **门禁与 CI 失效面（批次 B，T17~T21）**：`lint i18n`/`lint kb` 非 0 退出（**R1**，见 Changed）；`flow phases --json` 增 `transitionsDiff`（T19）；CI 守卫窗口前移 + 覆盖仓库 `.openfeel/config.yaml`；`.gitignore` 补 `.openfeel/tmp/`；`.gitattributes` 补生成物宿主 `template-loader.ts`/`update.ts` `eol=lf`
- [stage-50] **死代码与配置面（批次 C，T22~T37）**：删除死模块 `src/utils/path.ts`（T22，全仓零 import/引用）；`atomicWriteJson` 加「预留」注释；`setup` 补 `skipped` 输出；`update_infos` **保守默认**（**R2**，T25）；`computeBackupRel` 越界抛 `BackupError`；`backup.ts` 委托 `getHomedir()`；`readProfile` 缺失分支改深拷贝（防 `DEFAULT_PROFILE` 被污染）；`buildCascadeConfig` 逐键 Zod 校验；`config set --global` 原型链防护（`Object.hasOwn` + `getNestedValue` 跳过 `__proto__`/`constructor`）；`config set/get` 支持**全量 `defaults.*`**（**R3**，T36，见 Added）；`view add` **弃用**（**R4**，T37，见 Deprecated）；`recent_projects` 去重大小写不敏感；`config get --global` 非法画像 stderr 提示；knowledge 标题写入前转义 `|` 与折叠换行
- [stage-50] **i18n 与命令体验（批次 D，T38~T42）**：`applyHelpI18n` 遍历 `arguments`（en 下位置参数描述走 i18n）；并发冲突文案收敛至 `handleCliError` 单点；`flow wizard` 非 TTY 输出等价提示 + `exit 1`；REPL 不因命令错误退出 + help 动态生成；`init`/`roadmap` 补 try-catch（无堆栈外泄）；`model set --build` 的 `execSync` 加超时并捕获 `ETIMEDOUT`；`stage create`/`flow stage add` 错误处理抽 `handleAddStageError` helper
- [stage-50] **测试质量与覆盖（批次 E，T43~T52）**：`i18n.test` 隔离（不再依赖真实 home/仓库 `.info.json`）；静默 `console.warn` 跳过改 `it.skipIf`（skipped 可见）；`model.test` get 强断言；补 anomaly 去重 / migrate 失败语义 / `update-state` 全局函数断言；`backupLegacy` 改本地时区 + 毫秒 + 撞名后缀（见 Changed）；jsonc 降级安全读取；`saveUpdateState` 加锁 + 原子写；`migrate rollback` 非项目根明确报错；补 `stage`/`update`/`setup` + `repl` smoke **4 项覆盖**（**R5**，其余 7 族登记归后续）
- [stage-50] **模板与文档口径（批次 F，T53~T57）**：5 个部署型 skill 模板改**双口径**（用户环境主口径 `openfeel <cmd>` + 本仓自举加注 `node bin/openfeel.js <cmd>`；`templates/BUG-003` **关闭**）；`agents-md/en.md` 图注改中英并列；`openfeel-cli-usage` skill 枚举补 `phases`/`stage` 与 5 命令族；`build.js` 注释计数修正（「两对」「9/17 带前缀」）

- [stage-51] **纠正/清理侧 CLI 补齐（反馈 08，N1~N11）**：
  - **Added**：`openfeel knowledge dedup [content] [--project <path>] [--category <name>] [--threshold <n>]`（检索相似知识条目，**只读建议**，随包分发）；`openfeel plan scheme remove <stage> <opId>`（注销 op 注册键，done/checkpoint 保护 + `--force`/`--dry-run`）；`openfeel flow stage set <stageId> --deps <ids...>`（悬空校验 exit 1）；`openfeel flow review update <revId>` / `flow review remove <revId>`；`openfeel stage task <id> --add "<描述>"`；`openfeel plan stage add <name> --tasks "<t1>" "<t2>"`；`openfeel flow advance --quiet`；`stage set` 字段扩展 `--exec-mode`/`--auto-advance`/`--review-agent`；`flow repair --prune-orphans`（仅清理键孤儿）
  - **Changed（行为变更）**：op 文件名固定 `op-NNN.md`（标题写入内容首行；历史 `op-NNN_标题.md` **不迁移**，读取端 `extractTitle` 兼容回退）；公共日志未来写入统一为嵌套 `log/{yyyy}/{MM}/{dd}/`（**不迁移历史**，根索引同时反映两套布局 + 布局标注）；`flow advance` 默认仅在 `--to done` 提示 git 脏区（非 done 不再调用 `git status`）；`stage set` 同值由「报错」改为「**no-op 成功 exit 0**」且 `.bak` 仅在确认变更后生成；`flow repair` 输出新增孤儿 op 对账（默认只报告，零写盘）；`plan scheme create` 隐式注册时补建 `overview.md`/`status.md` 骨架（消除「半注册」）；`knowledge index`/`add` 放宽段头/表头/列数解析（标准格式输出不变）
  - **Fixed**：`cli/BUG-004`（en 模式 `--help` 的 Arguments 描述仍为中文）——补齐 20 处（+1 新增）`help.<path>.arg<name>` 双语键 + 运行时全量枚举门禁；`REV-004`（`help.view.add` 未同步弃用文案）——单键合并（删 `view.add.desc`）；op 标题含 `/` 时创建失败（ENOENT）已修复；`flow health` 新增孤儿 op `warn`（**非 `fail`，不改变退出码**）

- [stage-52] **反馈 09（可编排性/可观测性）+ 遗留清账 + 约束体系精简**：
  - **Added**：`openfeel flow status|current|health|metrics|overview --json`（顶层对象 + `schemaVersion:1`，纯 JSON 单文档，与人类可读互斥）；`openfeel flow health --fix`（以 `flow.json` 为权威**仅回写 `status.md`「状态」字段**，`--dry-run` 预览）；`openfeel flow ops list [--stage] [--json]`（state + 模板填充度 + 空模板 warning）；`openfeel plan scheme create --draft` + `openfeel plan scheme publish <stage> <opId>`；`openfeel plan scheme rename <stage> <opId> --title "<title>"`；`openfeel advance --to` **自动逐步**（`--dry-run` 打印完整路径）；全局 `--no-color` 选项
  - **Changed（行为变更）**：`flow advance --to` 在存在唯一路径时**自动逐步推进**（未提供 `--to` 的单步行为不变；多义/非法目标仍 exit 1 + 列可达目标；每步复检 blocking REV）；`flow phases --json` 追加 `schemaVersion`（既有 `phases`/`transitions`/`advanceAccepted`/`transitionsDiff` 不变）；`op.state` 取值域新增 `draft`（health 不报 draft 空模板、advance/统计/归档不计入、`flow attempt` 对 draft op 拒绝）；`flow current` 无 op 时回退显示 `current.stage` +「(无 op)」；尊重 `NO_COLOR`/`--no-color`
  - **Removed**：`openfeel view add`（**破坏性**，见上；改用 `openfeel flow review add`，保留 `view list`/`accept`）
  - **Fixed**：`kb-dedup` CRLF 去重失效（`parseKbFile` 读取处行尾归一化——`patterns.md` / `troubleshooting.md` 解析量 **2→105 / 0→31**）；**stage 解析归一化闭包 10 处**（`flow advance` / `flow stage remove` / `flow attempt` / `flow review add --auto-fix` / `archive` / `checkpoint list` 等的**短名 stage / 短名 opId 前缀不再失效**，统一 `normalizeStageId(x) ?? x` + 双键回退）；`console.warn` 硬编码中文全量 i18n 化（en 模式零泄漏）
  - **Changed（约束体系精简，C1~C4）**：全局约束「简洁设计」改为去硬编码的定性表述（zh/en 语义对等，删除「文件数 > 3」等阈值）；agent 模板（`feel.md`/`openfeel-planner.md`/`openfeel-tool-usage`）B 组规模阈值**定性化**（**保留 D 组工程阈值**）；仓库根 `AGENTS.md` 与模板权威源逐字对齐；「14 个 Skill」计数漂移修正为 **17** 处。**注**：`~/.config/opencode/AGENTS.md` 须运行 `openfeel setup` 方生效
  - **登记（非阻塞）**：`cli/BUG-005`（medium，空模板检测纯子串匹配误报）/ `cli/BUG-006`（low，en 模式 blocking REV 拒绝文案硬编码中文）
- [stage-53] **记忆/状态文件职能与格式重构（current.md / dev_last.md）**：
  - **Changed**：全局约束写入**两条设计目的**（保存核心信息便于恢复 / 避免无关信息污染上下文）+ 索引层/主题层/详情层**三层分层**；**`current.md` 改团队文件格式**——仅个人提交时更新、只描述整体信息、**无 agent 细节、无 `## @成员` 段**、仅留近期 **5** 条记录，旧记录自动归档 `.openfeel/dev/current_archive/`（`openfeel init` 自动创建该目录，`DEV_SUB_DIRS` 新增 `current_archive`）；**`dev_last.md` 改为索引 + 同名主题目录**（活跃主题 ≤5、索引摘要 ≤5 条 ×≤100 字、主题文件 ≤10 条 ×≤300 字、超量详情转 `users/{username}/tmp/` 并记地址、**超期记录不归档**；主题数 >5 时**就地收敛**不迁移文件；主题文件名一律英文 kebab-case）；`feel.md` 记忆加载与会话写入同步改写；`openfeel-sync-status` skill 改读各用户 `dev_last` 主题索引 + `flow.json` 聚合（skill 总数仍 17）
  - **Fixed**：`templates/BUG-004`（迁移后本仓 `current.md` 统计行沿用「执行中」快照、用例数陈旧）——归档时就地修正（942→949 + kb 计数刷新 + stage-53 记录措辞改为「归档完成」）
- [stage-54] **收尾：遗留缺陷清理（发布前清账）**：
  - **Fixed**：`cli/BUG-005`（medium，空模板检测**纯子串**误报——正文行内引用占位标记即被误判未填充，导致 `plan scheme publish` 误拒 / `flow ops list` 误报 `(empty)` / `flow health` 误报）——`isTemplateEmpty` 改**整行锚定**（`EMPTY_TEMPLATE_LINE_RE`，容错缩进/CRLF/行尾空白）+ `detectFillState` 的 `partial` 分支同口径收紧 + `plan/scheme.ts` 复用 `isTemplateEmpty`（**单一来源**）；`cli/BUG-006`（low，en 模式 `flow advance --to done` 的 blocking REV 拒绝文案硬编码中文）——迁 i18n（`flow.advance.blockingRevRefused` / `blockingRevHint`，zh 逐字不变 / en 对称）；`cli/BUG-003`（low **复发**，`flow phases --help` 文案缺 `transitionsDiff`）——仅补 i18n help 文案（**JSON 输出契约未变**）
  - **登记（非阻塞）**：`templates/BUG-005`（low，部署型 skill 模板 `openfeel-cli-usage/SKILL.md` 的 `flow phases --json` 输出说明记 3 键、实测 5 键，**新增输出键的同步面遗漏 skill 模板**）
  - **内部（非随包行为）**：全仓 REV pending **分层统计**（清账层 38 / 历史层 88 / 无法判定 3）+ 清账层收口（**closed 31 / 维持 pending 7**）；`bugs/index.md` 统计修正（open 3 / closed 13）；门禁 `lint i18n` 724 → **726 键**（E2 新增 2 键）

- [stage-55] **清掉项目级约束与 Agent（发布前最后阶段）**：
  - **Removed（仓库自身，非随包行为）**：不再保留**项目级部署资产**——删除根 `AGENTS.md`、根 `opencode.jsonc`、`.opencode/agents/**`（9）、`.opencode/skills/**`（17）、`.opencode/ADAPTER.md`（opencode 适配器构建产物），并删除 `build.js` **自举步骤 8**（`.opencode/` 自举重生成，含 `regenerateOpencodeInstance` / `insertGeneratedMark` 与失效 import，**防 `npm run build` 复活**）；`.opencode/` 仅保留 opencode 运行时目录。框架资产（9 agent / 17 skill / 全局 `AGENTS.md` / 全局 `opencode.jsonc`）统一由 `openfeel setup` 部署到全局 `~/.config/opencode/`。
  - **Changed**：全局约束模板新增「**模块手册 / Module Manuals**」节（`templates-data/agents-md/{zh-CN,en}.md`，双语）——原仓库根 `AGENTS.md` 独有内容迁入全局模板，删除根文件后该约束仍随全局生效；`kb/architecture.md` 原「全局部署架构 N1（仓库自身 `.opencode/` 不动）」决策**追加式 supersede**（原行保留 + 注记块），`dev/decisions.md` 补 ADR-002；`docs/GETTING_STARTED.md` 死链处置；`.openfeel/manual/{core/build,agents/feel,cli/commands,index}.md` 引用同步。
  - **Changed（内部/非随包）**：测试迁移——删除 `test/core/opencode-instance.test.ts`（4 it 随对象消失 / 3 组断言迁至模板源 / 3 it 发布元数据整体迁至**新文件** `test/core/release-metadata.test.ts`）+ 新增「仓库无项目级受管资产」「`build.js` 源码无自举函数」防回归断言；用例 987 → **985**；`npm run build` 不再生成 `.opencode/**` 受管文件。
  - **Fixed（内部）**：`REV-003`（low，覆盖回归）补齐 reviewer 纪律节的**模板源断言**（zh/en 各 1 it，经 `loadOpencodeAgentTemplate`）；`REV-002`（low，it 计数表述）登记更正。
  - **生效**：全局刷新（`openfeel setup`）**须重启 opencode 会话**方生效（本仓不再提供项目级 `.opencode/**`；项目级约束/配置改由全局提供）。

- [stage-56] **发布前最后一轮收尾（发布就绪）**：
  - **Changed（部署产物）**：`openfeel-cli-usage` skill 权威源全量对齐 v1.1.2——补齐 **16 项**命令/参数（`flow ops list`、`plan scheme remove`/`rename`/`publish` + `create --draft`、`flow review update`/`remove`、`flow stage set --deps`、`stage set --exec-mode`/`--auto-advance`/`--review-agent`、`stage task --add`/`--done`/`--undone`、`plan stage add --tasks`、`flow health --fix`、`flow advance --quiet` + `--to` 自动逐步、`flow status`/`current`/`health`/`metrics`/`overview --json`、`knowledge dedup`、`lint` 非 0 退出、`config set`/`get` 全量 `defaults.*`、flow 子命令补 `ops`/`migrate`、`view add` 已移除），修正 `advanceAccepted` 误称（**内置 15 phase 推进白名单**，非组合条件路径）+ 补 `transitionsDiff` 注记；`npm run build` 传播生成段 + `openfeel setup` 刷新全局副本（**须重启 harness 会话生效**）。
  - **Fixed（文档口径）**：`flow phases --json` **5 键**（`schemaVersion`/`phases`/`transitions`/`advanceAccepted`/`transitionsDiff`）全链路同步（`docs/commands.md` / `.openfeel/manual/cli/commands.md` / `CHANGELOG` / 生成段）；`templates/BUG-005`（low，部署型 skill 模板 `flow phases --json` 输出说明缺 `transitionsDiff`）**关闭**；`cli/BUG-007`（low，`docs/commands.md` 的 `project list`/`info` 子命令已不存在）——归档官就地修正为 `openfeel project overview` 并**关闭**。
  - **内部（非随包行为）**：`agents-md/en.md` 图注 CJK 归零（`acceptance rejected`）；`managed-region.ts:182` 注释校准（incoming 全字段覆盖 + existing 独有 passthrough）；`manual/core/backup.md` 措辞（每进程（通常即每命令））；公域 Bug 索引补齐至 **17**（新建 `bugs/kb.md`）。**v1.1.2 累计 18 条 Bug 全部关闭（open 0 / closed 18）。**

- [stage-57] **发布收尾（CI 修复 + CI 可观测性 + README 更新）**：
  - **Fixed（CI）**：`test/core/config.test.ts` 的 T32 盘符用例平台化——拆为「跨平台用例」（前置断言 `expect(preset).not.toBe(target)` 防假绿）与「Windows 专属用例」（`it.skipIf(process.platform !== 'win32')`，Linux skip 不计 failure）。根因（POSIX 下 `C:\Proj\X` 非绝对路径）在**测试侧**，`src/core/config.ts` 无改动；修复后 CI 两个 matrix job 恢复通过（此前 run #51 在 `npm test` 步骤失败、`publish` 被 skip）。
  - **Added（CI 可观测性）**：`.github/workflows/ci.yml` 测试步骤改 `set -o pipefail` + `npm test -- --reporter=verbose --no-color 2>&1 | tee "$RUNNER_TEMP/test.log"`；新增 `if: failure()` 注解步骤（`sed` 剥 ANSI 色码 → `grep` 提取失败用例 → `echo "::error::"`，上限 20、`exit 0`、零写盘、不改 job 判定），失败用例名可经 GitHub `check-runs/{id}/annotations` API 自助读取。
  - **Fixed（文档）**：三份 README 与 `docs/commands.md` 版本快照对齐（测试数 **986 用例 / 59 文件** + Linux 跳过说明、`v1.1.2 新增能力` 节、命令表修正、全局部署架构图注与分层小节、zh/en 逐节对等、旧版本号零残留）；归档官就地修正 README 架构图 Core 层 `backup/` → **`backup.ts`**（REV-005，粒度与真实单文件一致）并清理 `docs/GETTING_STARTED.md` 旧版本号残留。
  - **内部（非随包行为）**：本轮无新登记 Bug（公域 18 全 closed）；知识沉淀 3 条（patterns）。

> 说明：本仓库 `.openfeel/dev/current.md` / `.openfeel/users/{username}/dev_last.md` 为工作区数据（非随包分发产物），格式约定经 `openfeel setup` 部署到全局约束层后生效。


> 完整逐条处置与验证证据见 `.openfeel/code_review/v1.1.2-stage-50.md` 与 `.openfeel/users/Liuary/log/op-v1.1.2-stage-50-report-2026-09-30.md`（T1~T57 覆盖表）。

## [1.1.1] - 2026-09-26

### Added
- `openfeel setup` 命令：纯全局部署（全局 AGENTS.md + 9 agent + 16 skill + 全局 opencode.jsonc），不建立项目 `.openfeel/`，幂等可重跑
- `openfeel init --workspace-only --non-interactive`：非交互轻量子命令，仅创建 `.openfeel/` 工作区（不建 AGENTS.md/opencode.jsonc），供 Feel 空白项目自动搭建
- 新增 skill：`openfeel-workspace`（会话启动自检操作步骤）、`openfeel-tool-usage`（Agent 工具使用规范）；skill 总数 14 → 16
- `openfeel migrate --clean-global-core-md`：显式删除已废弃的全局 core.md（默认仅提示不删）
- `detectDeprecatedCompat`：检测全局旧 core.md / 存量项目 AGENTS.md 并提示

### Changed
- 全局化彻底化：所有约束统一到全局 `~/.config/opencode/AGENTS.md`（移除 core.md）；op-000 实测全局 AGENTS.md 自动加载 = YES，故全局 opencode.jsonc 移除 `instructions` 字段
- 约束/操作分离：core.md 约束类并入全局 AGENTS.md，操作类拆为按需加载 skill（`openfeel-workspace` / `openfeel-tool-usage`）
- AGENTS.md 模板改为「全局行为约束」（移除 `{项目名称}` 占位符；新增「项目特有约束（可选化）」声明节 + 「.openfeel 工作区结构（约束）」节）
- init 收敛：拆除全局 agent/skill/core.md 部署与项目 AGENTS.md 骨架，仅做项目初始化（.openfeel/ 工作区 + 项目 opencode.jsonc）
- update 收敛：拆除项目 AGENTS.md 部署；全局资产部署目标由 core.md 改为全局 AGENTS.md；存量全局 state 的 core.md key 一次性重映射
- migrate：`remapLegacyKey` 目标与全局部署路径改全局 AGENTS.md
- 版本号 1.1.0 → 1.1.1 全链路同步（package.json / agents-md 模板 / CHANGELOG）

## [1.1.0] - 2026-09-25

### Added
- 并发保护基础设施：统一原子写（唯一名 temp + fsync + rename）、跨进程文件锁（O_EXCL + 指数退避 + 陈旧锁抢占）、序号分配原子化，覆盖 flow.json/公共日志/status.md/update_state.json 等高风险写入点
- 全局部署架构：框架资产（9 agent / 14 skill / core.md / opencode.jsonc）从项目内嵌升级为全局安装 `~/.config/opencode/` + 项目精简（项目仅 .openfeel/ + AGENTS.md + opencode.jsonc）；全局/项目双 update_state
- 控制区标记增量更新：`<!-- openfeel:begin/end -->` 受管区 + 部署三态（不存在写 / 无标记追加 + 记录 update_infos.md / 含标记覆盖区内）
- `openfeel migrate` 命令：存量旧布局项目一键迁移（检测/备份/迁移/回滚 + --dry-run + --remap-assignee），项目自定义资产保留

### Changed
- 模板单源收敛：templates-data/ 为唯一权威源，仓库 .opencode/ 降级为构建产物
- 命名前缀统一：8 agent + 14 skill 加 `openfeel-` 前缀（feel 保留）；`/opfx:` 混合命名空间按真实类型引用并清零
- 版本号 1.0.9 → 1.1.0 全链路同步（package.json / config.yaml / config.ts / agents-md 模板 / AGENTS.md / CHANGELOG）

## [1.0.9] - 2026-08-15

### Added
- 路径映射权威工具：新增 `src/core/plan/path.ts`（stageId ↔ plan 目录双向映射唯一权威，含历史格式与短名兼容，findStatusPath 三级回退），init 示例阶段多级化部署到 `plan/v1/stage-01/`

### Changed
- plan 目录多级化与路径统一：阶段工作目录统一为 `plan/{series}/{stage}/`（series = v{MAJOR}），`plan stage add` / `plan scheme create` 从 `.openfeel/stages/` 迁移写入；findStatusPath 三级回退（plan 精确 → plan 递归 → stages 只读兜底）；命令层 stageId 映射修正、模板与 skill 文案同步、docs 文档路径引用统一
- 版本号 1.0.8 → 1.0.9 全链路同步（package.json / config.yaml / config.ts / CHANGELOG）

## [1.0.8] - 2026-08-15

### Added
- 任务类型路由：AGENTS.md 新增「任务类型路由」节，非编码任务（调研/探索、选型讨论）成为一等公民，flow.json 不必为所有任务空转
- decisions.md 纳入框架标准：新增 `.openfeel/dev/decisions.md`（ADR 轻量格式，决策+理由+日期+状态），init 自动生成，core.md 会话自检纳入

### Changed
- Feel 日志纪律解耦：「必须记录的事件」改为「委托任意下游 Agent（含 general / explore / utility 等调研类）都须落公域日志」，删除「委托 Executor / 事务官」的排他性表述，明确不受任务类型豁免
- 轻量决策边界：Feel / Planner / AGENTS 三层统一定义——对话式选型（产出结论不产出 plan.md）由 Feel 直接处理，仅产出正式计划文档或达规模阈值才委托 Planner
- 版本号 1.0.7 → 1.0.8 全链路同步（package.json / config.yaml / config.ts / AGENTS 版本声明）

## [1.0.0] - 2026-08-07

### Added
- GitHub Actions CI/CD 工作流（`.github/workflows/ci.yml`）：push/PR 触发，Node.js 20.x/22.x 双版本矩阵，`npm ci` → `npm run build` → `npm test`
- `CHANGELOG.md` 项目变更日志（本文档）与 `docs/GETTING_STARTED.md` 用户入门指南
- `openfeel lint` 质量门禁落地（i18n 422 键对称性校验 + kb 过期引用检测），为 CI 集成提供前置检查

### Changed
- 版本号统一为 v1.0.0：flow.json 25 个 stageId 从 v0.x.x 体系重映射为 v1.0.0-stage-04 ~ v1.0.0-stage-28，同步更新 plan/index.md 对照表、kb/index.md、dev/current.md
- npm 发布工程准备：package.json 元数据完善（bin/exports 入口、files 白名单、publishConfig）

## [0.5.0] - 2026-08-07

### Added
- 框架级记忆体系：全局用户画像 `~/.config/openfeel/profile.yaml` + `dev_last.md` 生命周期模板 + `openfeel config --global` 标志
- 跨 Agent Handoff 委派原语（`[HANDOFF: agent_name]` 标记）、Checkpoint 快照自动保存与组合终止条件（transitions `|` 运算符）
- `openfeel lint` 质量门禁命令组（i18n 键对称性 + kb 引用检测）与 4 个新 skill 落地（roadmap/health/recover/wizard）

### Changed
- 版本管理规范（主.次.修订语义）与计划目录按大版本系列分组重构（v4/、v5/）；规范迁移 dev_core.md → core.md

### Fixed
- 缺陷修复系列：autoCommitOnDone 时序修正、AGENTS.md 模板补齐版本管理节、init 创建 manual/ 目录、部署传播内容哈希比对

## [0.4.0] - 2026-07-15

### Changed
- 15→7 Agent 精简体系（删除/合并/替代/划归四类操作）；废弃自动闭环，改为 Feel 总统领调度 + CLI 推进模型

### Added
- 知识库自动化体系：检索→去重→沉淀三环闭环，check-kb 技能自包含语义检索
- i18n 基础设施（12 功能域，206 entries × 2 语言）、多语言模板数据管线与双语 CLI 交互（init 选择 → .info.json 持久化 → update 读取）
- Vision 视觉官（8→9 Agent 扩展，qwen-vl-plus 多模态模型）与分级模块文档系统 `.openfeel/manual/`

### Fixed
- 流水线安全增强：REV 闭环双路兜底（flow-manager + 命令层，--force 不可绕过）、公域日志批量聚合降噪 85%+、git 钩子 + 日志骨架

## [0.3.0] - 2026-06-28

### Added
- 流水线 Agent 体系 v3 架构：Feel/Schemer/Executor/Reviewer/Tester/Archiver 六角色 + flow.json + FlowManager + 模型分工（推理/快速/异种）
- 交互式 wizard、demo、知识库与边界处理等体验增强（v3.0 四阶段 21 项任务闭环，测试 217/219 通过）
- Schemer 自动生成 deps.yaml 依赖声明（hard/soft/mutual_exclusion 三档）

### Changed
- Flow CLI 严格校验（非法 phase 拒绝推进，新增 --force/--verbose）、文档路径绝对化与知识库搜索增强（--limit/--offset）

### Fixed
- v3.1/v3.2 补丁系列 + 生产加固验证（5 项目全流水线测试，DateKit 终验零 Bug）

## [0.2.0] - 2026-06-27

### Added
- v2 架构：feel Agent 链 + 三层计划体系（大计划/小计划/操作方案）
- 统一工作区结构（.openfeel/ 命名）+ 核心+适配器分层 + 交互式 CLI

### Changed
- v2.0 七阶段 28 项改进全部闭环（59 文件变更，217/219 测试通过）
- 计划扩展：新增 stage-07 可扩展性重构（pipeline 数据化 / config 通用化 / 指令参数化 / CLI 自动发现）

### Fixed
- 一期部署复盘：deploy-review 对比分析与 blueprint-test-project 蓝图归档至 .openfeel/docs/

## [0.1.0] - 2026-06-24

### Added
- OpenFeel 项目创立，制定 v1.0 开发计划（9 阶段）
- 一期核心流水线搭建（Agent 工作区目录结构 + 状态文件体系）

### Changed
- 工作区命名全局替换为 `.openfeel/`，确立公共域 + 私域分区原则

### Fixed
- 一期部署验证：首个测试项目端到端跑通，产出部署对比分析报告
