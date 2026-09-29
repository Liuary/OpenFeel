# 审查报告：v1.1.2-stage-49 U6 文档·手册·kb（op-006）

> **完整报告（含 REV 条目）**：`.openfeel/users/Liuary/code_review/REV-v1.1.2-stage-49-U6.md`
> 本文件为 tmp 侧摘要，满足 op-006 验收取证锚点；两者如有出入以 REV 文件为准。

## 取证环境

- HEAD `20670b8`（stage-48 归档基线）｜ node v24.18.1 ｜ git 2.55.0.windows.3 ｜ win32
- 门禁命令一律 `node bin/openfeel.js`；全程只读，未触碰真实全局目录与仓库 config.yaml。

## manual 引用核对表（抽样 17 处，全吻合）

| manual 引用 | 源码实测 |
|------------|---------|
| `core/flow-manager.md:23` removeStage 签名 | `flow-manager.ts:1278` ✅ |
| `core/flow-manager.md:96` 审计 detail 四字段 | `:1330` ✅ |
| `core/flow-manager.md:24` getPipelinePhases/Transitions | `:1480/:1489` ✅ |
| `core/flow-manager.md:15` advanceStagePhase | `:1034` ✅ |
| `core/flow-manager.md:25` buildCascadeConfig(私有)/resolveEffectiveConfig | `:1591/:1662` ✅ |
| `core/flow-manager.md:22,42` checkRemovable | `:1214` ✅ |
| `core/flow-manager.md:26` FlowConcurrentModificationError/isFlowConcurrentError | `:113/:128` ✅ |
| `core/flow-manager.md:124` 模块级 normalizeAgentName | `:3069` ✅ |
| `core/backup.md:16-22` BackupCommand/BackupError.filePath/三函数 | `backup.ts:16/27-28/84/124/38` ✅ |
| `core/backup.md:19` getGlobalBackupRootPath | `global-paths.ts:76` ✅ |
| `core/permission.md` 9 agent 键集 | `templates-data/opencode/agents/zh-CN/*.md` 9 文件逐一吻合 ✅ |
| `cli/commands.md:14-29` 16 命令注册表 | `src/commands/` 16 .ts ✅ |
| `cli/commands.md:46` EXIT_CONCURRENT=2 等 | `cli/index.ts:135/138/149/62` ✅ |
| `cli/commands.md:62` flow advance --stage --to | `flow advance --help` 实测 ✅ |
| `cli/commands.md:63` --json 三键结构 | `flow phases --json` 实测 ✅ |
| `cli/commands.md:82` skill 17 / phase 15 | 目录实测 17 / 命令实测 15 ✅ |
| `core/backup.md:16` getGlobalProfilePath（flow-manager.md:51） | `global-paths.ts:66` ✅ |

## docs/commands.md vs CLI 对照表

| 文档位置 | 文档说法 | CLI 实测 | 判定 |
|---------|---------|---------|:--:|
| `commands.md:103,108` | `--op` 必填 | `--stage` 必填、`--op` 仅日志展示 | ❌ |
| `commands.md:89` | `--json` = `{phases,transitions}` | 实含 `advanceAccepted` | ❌ |
| `commands.md:158-162` | review add 仅 `--op/--title` | 实有 `--auto-fix`、`--blocking`(默认 true) | ❌ |
| `commands.md` 全文 | 10 个命令组节 | CLI 16 组（缺 stage/project/model/setup/migrate/lint） | ❌ |
| `commands.md:385` | `config effective [key]` | 实测存在（stage-43 已补，复核通过） | ✅ |
| `commands.md:216,236-242` | 三入口分层 + stage create 弃用 | 与 manual/实测一致 | ✅ |

## kb 时效与计数

- `node bin/openfeel.js lint kb` → ✅ 5 文件 228 引用零过期。
- 独立计数（`## [+]` 条目格式）vs `kb/index.md`：architecture 25=25 / patterns 100=100 / troubleshooting 34=34 / setup 6=6，全部一致。
- kb-dedup CRLF 失效为已知问题（troubleshooting 在案），行为实测归 U1。

## README×3 一致性

- 双口径声明三份齐备（README.md:7 / zh:5 / en:11）✅。
- 缺陷：update 行重复（zh:56+64 / en:56+64）；README.md:5「Alibaba-CN」与权威源（`openfeel-vision.md:4` deepseek/deepseek-flash）及 zh/en 矛盾；395 用例过期（实测 706）；zh:84「事务官|事务官」；缺 7 命令组。

## 双口径区分说明（与 U4 互引）

| 场景 | 口径 | 实测 |
|------|------|------|
| **部署模板**（agents-md/{zh-CN,en}，用户环境） | `openfeel <cmd>` | ✅（U4 已审；本单元复核根 AGENTS.md 无裸 `openfeel <cmd>` 残留） |
| **本仓自举/开发**（manual 正文、根 AGENTS.md、wizard skill） | `node bin/openfeel.js <cmd>` | ✅ 全部符合（cli/commands.md:60、cli/setup.md:11、cli/model.md:17 口径警告行在案） |
| README/docs/GETTING_STARTED（用户场景示例） | `openfeel <cmd>` + 双口径注记 | ✅ 注记齐备（commands.md:5、GETTING_STARTED:5） |

结论：stage-48 事件 C 口径治理**零残留**；templates/BUG-003 关注的模板侧口径由 U4 复核，本单元文档侧（manual/README/AGENTS.md）无违规书写位置。

## 历史归档只读核验

CHANGELOG.md→`cbc606f`(stage-43 合法写入)、docs/phase-5→`c8b8821`(stage-44)、kb/architecture.md→`2fb38fa`(stage-47)；stage-48/49 期零回改 ✅。

## 发现索引

- REV-001 docs/commands.md 与 CLI 实况漂移（high，blocking=false）
- REV-002 README×3 一致性缺陷（medium，blocking=false）
- REV-003 docs 版本头声明过期（low，blocking=false）
- REV-004 manual/kb 重复度观察项（low，blocking=false）

全部文档类非阻塞，按 plan §二流转 **openfeel-archiver**（op-009 裁定）。
