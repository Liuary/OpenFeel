# v1.6.5-stage-138

## 目标

1.6.5 是一个 patch：补一处 **CLI 对称性缺口**、拆掉两处**稳定性/可用性**债、并把「克制」做成**机制**，不改任何已发布功能的语义。三条需求合并为**一次发布**（不拆 1.6.6）。

1. **`config unset`（REQ-073）**：`config set` 能写但没有任何删除入口，退役键（旧项目 `.openfeel/config.yaml` 的 `models:` 段）只能让人类手改（该文件受 guard 保护，agent 直写被拒）。新增通用 `openfeel config unset <key>`：支持 `defaults.X` 与顶层段，走同一 YAML Document 路径（`deleteIn` + 原子写回，保留注释与其它键序），键不存在 exit 1，`--json` 输出 `{schemaVersion,key,removed,path}`；DSH 侧暴露 `feel_verify action=config_unset`（工具仍 15 个，只扩 action）。仓库旧 `models:` 段作为首个真实样本。
2. **release dry-run 门禁白名单（REQ-072）**：`node scripts/release.mjs --dry-run` 被 guard 按「高风险 node 脚本正文不可判定」class1 拒绝，文档里的发布预演命令 agent 无法执行。改为：只对**仓库自身**的 `scripts/release.mjs` + 纯预演参数（`--dry-run`/`--skip-build`，且不含 `--publish`/`--commit-archive`/`--tag`/`--push`）按 class 4 warn 放行并审计；放行判定**绑定项目根**（realpath 位于含 `.openfeel/` 的项目根下、相对路径恰为 `scripts/release.mjs`；TEMP 里的同名脚本一律拒绝）；任何真实发布/提交参数仍 class1 拒绝。
3. **全量测试 flaky 隔离（REQ-072）**：`migrate.test` 的全局 `opencode.jsonc` 用例改为**真隔离 homedir**（`vi.mock('node:os')` 的 `homedir()` → 每测试临时目录 + 显式 `HOME`/`USERPROFILE`/`CLAUDE_CONFIG_DIR` + **真实文件哈希零变化**断言），连续 3 次 `npm test` 0 failed；根因复现不出只登记「未复现」，不声称已解决。
4. **克制机制（REQ-074）**：把「批次发布」从文档规则变成**可执行机制**。事实：1.6.0—1.6.4 五个版本、17 个 REQ、约 50.1 小时；1.6.2 与 1.6.3 归档相隔 32 秒且同属「不预设模型」，本应合并（**5 版 → 3 版**）。根因：批次规则只在 `docs/VERSIONS.md:8-14`，没进提示词；版本在开发期写死；发布前没有门禁。本版落地：提示词加「版本纪律」检查点（版本只在发布时动；一次发布=一个批次；新想法进 backlog；同批不连发 patch）；`scripts/release.mjs` 加 `--bump/--confirm/--confirm-twice/--reason`（**`--confirm` 只约束 bump**，publish/push 语义不变）、发布前打印**按版本过滤**的本批次清单、距上次发布 <24h 再发 patch 给 warn 且真实 bump 额外要 `--confirm-twice`；批次清单**绝不全量取 `status=done`**（现有 17 条旧 done 必须排除）；`dev_core`/`DEV_CORE` 加「版本与范围纪律」；reviewer 加「过度设计」5 判据与「计划外改动」（落 blocking REV）；阶段/需求计划模板加 `## 不做清单` / `## 允许改动`；`docs/VERSIONS.md` 由 R3 写 §发布节奏+指标定义、R4 写 v1.6.5 段（串行，采集/批次锁/硬门登记后续，本版不实现）。

依据：REQ-072（A72.1—A72.6）、REQ-073（A73.1—A73.7）、REQ-074（A74.1—A74.7），详见 `plan.md` 与 `../reqs/REQ-07{2,3,4}.plan.md`。

## 关联需求

| 需求 | 标题 | 判据 | 本阶段任务 |
|---|---|---|---|
| REQ-073 | 通用 config unset：补齐配置删除入口（含 models 迁移） | A73.1—A73.7 | R1（+ R4 文档/版本） |
| REQ-072 | 1.6.5：release dry-run 门禁白名单 + 全量测试 flaky 隔离 | A72.1—A72.6 | R2（+ R4 文档/版本） |
| REQ-074 | 克制机制：版本纪律 + 范围收敛 + 反过度设计 + 反自由发挥 | A74.1—A74.7 | R3（+ R4 文档/版本） |

三条需求共用同一个 patch 版本（1.6.5）与同一批全量门禁：**版本字段 4 处**（root `version`、dsh `version`、lock 顶层 `version`、lock `packages[""].version`）+ 5 处文档/契约引用共 9 处、CHANGELOG/VERSIONS/release notes 只写一次（R4）。**本批次一次性发布，不拆 1.6.6**（A74.7）：1.6.0—1.6.4 的教训正是「一个需求一升版」——同批需求拆阶段、不拆版本；发布后本会话不再逐项升版。

## 节奏

fast 模式，**严格串行**（文件集可并行，但默认不并行）：

| 步 | 任务 | 产出 |
|---|---|---|
| S1 | R1 config unset 原语 + CLI + i18n + feel_verify + 测试；仓库 `models:` 样本清理 | `src/core/config.ts`、`src/commands/config.ts`、`i18n-data/{zh-CN,en}.ts`、`dsh/lib/tools/index.js`、测试四件、`.openfeel/config.yaml`（经 CLI 删） |
| S2 | R2 guard 白名单（项目根绑定）+ 用例；migrate 全局配置用例隔离硬化（mock homedir + CLAUDE_CONFIG_DIR + 真实哈希） | `dsh/lib/guard.js`、`dsh/test/guard.js`、`test/core/migrate.test.ts` |
| S3 | R3 提示词版本纪律 + release 批次门（`--bump/--confirm/--confirm-twice/--reason`、幂等 no-op、按版本过滤批次清单、24h warn）+ dev_core/模板 + reviewer/计划模板（blocking REV）+ 指标定义 + §发布节奏 | `dsh/lib/surface/prompt.js`、4 份 `feel.md`、`template-loader.ts`（build）、`test/cli/feel-prompt-budget.test.ts`、`src/core/templates.ts`、`.openfeel/dev/dev_core.md`、4 份 `openfeel-reviewer.md`/`openfeel-planner.md`、`src/core/req/plan-file.ts`、`scripts/release.mjs`、`test/scripts/release.test.ts`、`docs/VERSIONS.md`（§发布节奏 + 指标定义节） |
| S4 | R4 文档 + 同源计数 + **三条需求先置 done** + 发布窗口 bump（`npm run release -- --bump patch --confirm --confirm-twice`，本批次距 v1.6.4 <24h）+ **版本字段 4 处/9 处引用** + release notes + 全量门禁 C8 | `docs/commands.md`、`dsh/docs/compat/commands.md`、`dsh/ADAPTER.md`、`dsh/README.md`、`dsh/ACTION-GUIDE.md`、`CHANGELOG.md`、`docs/VERSIONS.md`（v1.6.5 段）、`docs/releases/v1.6.5.md`、两包 pkg + lockfile |
| S5 | reviewer 独立复跑 C1—C10 与 diff 复核（含 A74.4 自身 scope creep 审查） | 只读 |

**串行理由**：R1 先（改动面小、且 `models:` 段真实删除会牵引后续 lint/init 断言）；`src/**` 与 `dsh/lib/guard.js` 文件集不相交、技术上可双写者并行，但测试计数要进同一批文档（R4）且 dsh 五测是全量串跑，并行会拖慢并把 flaky 归因搅浑 —— 因此默认单 executor 串行，若 lead 要求并行则按 `plan.md` §2.0 白名单双写者、禁交叉写。R3→R4 严格串行（R4 用 R3 的 `--bump`，且 `docs/VERSIONS.md` 同文件分节：**R3 写 §发布节奏 + 指标定义节，R4 只写 v1.6.5 段与顶部 highlight**，不得同时写）。**R1—R3 期间版本号保持 1.6.4**（版本只在 R4 发布窗口动）；R4 bump 前先把 REQ-072/073/074 置 done（否则批次清单为空）。

## 验收

- **A73.1—A73.6**：`config unset` 可删 `defaults.X` 与顶层段且保留注释/键序；不存在 exit 1、`--json` 键序 `schemaVersion,key,removed,path`；删 `defaults.X` 后 `effective` 回落并打印来源；仓库 `models:` 段清理后 `readConfig` 无该段、`lint`/`init` 不受影响；`feel_verify action=config_unset` 走同一 CLI 且工具数仍 15；`tsc`/`npm test`/`build`×2/dsh 五测/`lint i18n` 全绿。
- **A72.1—A72.4/A72.6**：仓库自身 `node scripts/release.mjs --dry-run`（含 `--skip-build`）class4 warn 放行 + 审计 `release-dry-run-allowlisted`（判定经 realpath 绑定含 `.openfeel/` 的项目根、相对路径恰为 `scripts/release.mjs`）；仓外/TEMP 同名脚本仍拒绝；`--publish`/`--commit-archive`/`--tag`/`--push` 仍 class1 拒绝且既有断言零改动；`dsh/test/guard.js` 全绿（新增 ≥5 用例）；migrate 全局 jsonc 用例 `×10` 稳定（mock homedir + `CLAUDE_CONFIG_DIR` 隔离 + 真实文件哈希不变）；`npm test` 连续 3 次 0 failed。
- **A74.1—A74.7**：四组渲染态 ≤1200 字符 / ≤25 行（实测目标 zh 802/919、en 1070/1186，16/19/15/18 行；en 含 `no back-to-back patches` 与 `patch/minor/major`）、parity 5/5；`release --dry-run --bump patch` 打印 old→new 与**按版本过滤**的批次清单且零写盘；`--bump` 缺 `--confirm` exit 1 零写盘、重跑打印 no-op 零写盘；minor/major 缺 `--reason` exit 1；<24h 再发 patch 有明确 warn 且真实 bump 需 `--confirm-twice`；`--publish`/`--push` 语义不变、`docs/VERSIONS:11` 兜底命令不改；`dev_core`/`DEV_CORE` 有「版本与范围纪律」；reviewer 5 判据 + 计划外改动（blocking REV）+ 计划模板两节落地；`docs/VERSIONS.md` 有 5 项指标定义且明确「dashboard/metrics、批次锁、<24h 硬门本版不做」；`docs/commands.md` release 段同步；1.6.5 一次性发布（3 条需求同批、4 个版本字段 + 5 处文档引用同批）。
- **A72.5/A73.7/A74.7**：1.6.5 双包 lockstep（`requiresCli >=1.6.5`）、**版本字段 4 处 + 5 处文档/契约引用**同批、`npm run release -- --dry-run --skip-build` 通过；push master 后 CI 自动发布（人类执行，不手动 publish、不打 tag）；diff 复核无真实发布通道被放开、无 guard 规则外改动、无计划外文件。

## 风险

- **提示词预算/同源分叉**：en-disabled 现状 1194/1200（余 6），任何顺手加句都会破上限；目标压到 **1186/1200（余 14，15/18 行）**，zh 802/919；改动必须四组实测 + parity 5/5 + `npm run build` 重新生成 `template-loader.ts`（禁手改）。
- **release.mjs 回归**：`STEPS` 与既有 `--json` 键序、**既有 20 个 `it`** 被测试冻结（`--bump` 不得改旧用例）；`--bump` 必须独立模式（与 `--publish/--push/--notes-only` 互斥）；**`--confirm` 只给 `--bump`**，`--publish`/`--push` 语义与 `docs/VERSIONS:11` 兜底命令不动；bump 目标从「上次发布基线」递增，重跑=no-op；写盘失败无事务回滚，以 `git status` 兜底。
- **批次清单混入旧 done/基线选错**：现有 **17 条 `status=done` 全是旧 target_version（v1.2.2—v1.5.6）**，绝不能按 status 全量取；必须按 `target_version===当前发布版本` 或「关联本版本阶段」过滤，并加「陈旧 done 不混入」fixture；仓库已存在 `v1.7.0.json`（比目标新）→ 基线按 semver 选、不按 mtime；flow.json 不可读时降级为 `null` 且不阻断发布。
- **白名单变后门 / guard 新参数边界**：闭合参数集合 + **realpath 必须位于含 `.openfeel/` 的项目根下且 basename=`release.mjs`**（TEMP 同名脚本拒绝）+ `continue`（不 `return`，防多语句逃检）+ strict 仍 deny + 负向用例；`--bump/--reason/--confirm/--confirm-twice` 不进白名单，一律走 `npm run release -- ...`（class4 warn），**已知边界不改 guard**。
- **过度设计自证**：本版不实现 dashboard/metrics 采集、不做 `BATCH_LOCKED`、不做 `<24h` 硬门（只 warn + `--confirm-twice`）、REQ-074 不新增 CLI/工具/JSON 出口；reviewer 按 A74.4 的 5 条判据审本批次自身 diff，计划外改动落 blocking REV。
- **删配置打穿 schema**：`ConfigSchema` 三层全 optional + 删后 `safeParse` 复验（失败零写盘）+ 只删 `hasIn` 命中路径；仓库样本删前 `git status` 干净，可 `git checkout -- .openfeel/config.yaml` 回退。
- **flaky 根因未明**：只 mock `node:os` 已被证明不够；交付物是「mock homedir + HOME/USERPROFILE/CLAUDE_CONFIG_DIR 隔离 + **真实文件哈希零变化** + 3 次全量 0 failed」，复现不出根因时登记「未复现」，**不伪称已消除**。
- **生效时机误判**：`dsh/lib/guard.js` / `dsh/lib/tools/index.js` / 提示词 / agent 模板都由宿主启动时加载，改文件后当前会话仍跑旧代码；验收只用新进程测试。

## 依赖

无外部阶段依赖。事实前置：REQ-071（v1.6.4，config `models:` 迁移提示已文档化，本次补上真正的删除入口）、`scripts/release.mjs` 的六参数面（`--dry-run`/`--skip-build`/`--publish`/`--commit-archive`/`--tag`/`--push`）、`docs/VERSIONS.md:8-14` 的批次规则（只进文档、未进提示词的现状）。不动发布链路与 guard 对真实发布/提交的拒绝语义。

## 操作方案

按 `plan.md` §二 的 R1→R2→R3→R4 串行执行；每步收尾立即跑对应 C1—C10 取证，执行中偏差按 `REQ-07{2,3,4}.plan.md` 的「偏差与回写」格式登记。版本只在 R4 发布窗口动：先把 REQ-072/073/074 置 `done`，再 `npm run release -- --bump patch --confirm --confirm-twice`（`--bump` 不得走裸 `node`：guard class1 拒绝；本批次距 v1.6.4 <24h，缺 `--confirm-twice` 会 exit 1），重跑 bump 为 no-op；guard/tool/提示词改动以新进程测试为验收（宿主重启前不生效）；`git push` / tag / `npm publish` 归人类（push master 后由 CI 发布 1.6.5）。
