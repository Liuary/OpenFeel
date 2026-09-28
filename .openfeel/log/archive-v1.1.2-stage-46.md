# 归档摘要 — v1.1.2-stage-46

- **归档时间**：2026-09-29（本地）
- **阶段名称**：v1.1.2-stage-46
- **阶段状态**：archiving → done
- **依赖阶段**：hard after `v1.1.2-stage-45`（已 satisfied）；mutual_exclusion before `v1.1.2-stage-47`
- **实现 commit**：`d5556a4`（主体）+ `9441ec8`（自测报告补记）

## 操作产出

| ID | 标题 | 状态 | 尝试次数 |
|----|------|------|----------|
| op-001 | 备份基础设施（global-paths 路径函数 + backup.ts + 锁临界区） | done | 1/3 |
| op-002 | `update_infos` 扩展「备份」类（含读侧节识别） | done | 1/3 |
| op-003 | 四链路写入接入（setup、update、init、migrate 覆盖前备份） | done | 1/3 |
| op-004 | feel.md 检查规则扩展与 build 重生成 | done | 1/3 |
| op-005 | 备份测试与全量回归 | done | 1/3 |

## 审查记录

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| (无) | - | - | - |

## 审查与知识沉淀（归档官补记）

> 本归档摘要由归档官**按既有规范手工生成**（未运行 `openfeel archive`，理由见文末「偏差登记」第 1 项），格式对齐 `archive-v1.1.2-stage-45.md`。

### 需求与语义裁定

用户指令：「如果部署时已有文件，则将原始文件备份，并在全局状态文件中提示 agent 检查」。

| # | 裁定 | 落实 |
|---|------|------|
| 1 | 全局状态文件 = `~/.openfeel/update_infos.md` | op-002 + op-004（第三类 `backed`） |
| 2 | 备份根 = `~/.openfeel/backup/{timestamp}/` | op-001 + B1（HOME 相对分区 + `manifest.json`） |
| 3 | 备份范围 = **所有「目标已存在且本次会被写入/覆盖」的文件**（不可推翻） | B9 全景表 + op-003 四链路 |
| — | **备份成功后仍覆盖**；**备份失败绝不覆盖** | B3 + REV-004 / REV-008 |

### REV 汇总（v1.1.2-stage-46）

| REV | 阶段 | 优先级 | blocking | 状态 |
|-----|------|:--:|:--:|:--:|
| REV-001 | 计划 | high | true | closed |
| REV-002 | 计划 | medium | true | closed |
| REV-003 | 计划 | medium | true | closed |
| REV-004 | 计划 | medium | false | closed |
| REV-005 | 计划 | medium | false | closed |
| REV-006 | 计划 | low | false | closed |
| REV-007 | 二轮计划复审 | low | false | closed |
| REV-008 | 三审 | high | true | closed |
| REV-009 | 三审 | low | false | closed |
| REV-010 | 四审 | low | false | closed |
| REV-011 | 五审（代码审查） | low | false | **pending → 归属 stage-47** |

- **计划阶段（REV-001~006）**：`config.yaml` 为计划外覆盖写路径（裁定 #3 漏网 + §3.1 事实错误，REV-001 high blocking）/ migrate 链路未裁定（REV-002）/ `loadUpdateInfos` 节切换硬编码遗漏（REV-003）三项 blocking 均经 planner 修订后逐项行号复核验收 closed；REV-004~006（anomaly 语义冲突、`{ts}`+manifest 同临界区、边缘路径 4 项合并）非阻塞。
- **二轮计划复审（REV-007）**：`flow.json` 创建守卫归属更正（实测 `FlowManager.initFlow` = `flow-manager.ts:2924-2932`，原引 `:2704-2707` 实为 `healthCheck` 一致性扫描）+ `profile.yaml` 豁免范围显式记录。原 REV-007② 中的函数名 `updateProfileOnProjectSwitch` 经 `rg` 实证为**幻觉引用**（src 全域零命中），落地版已用正确表述规避，不影响裁定。
- **三审（REV-008 blocking high / REV-009 low）**：op-003「改动 4」伪代码控制流自相矛盾（`writeDefaultConfig` 落在 `if` 之外 → 按字面实现仍会覆盖，与注释相反）→ schemer 重排为**两处写**（备份成功 `try` 内 / `else` 目标不存在）+ 改动 5 补 `BackupError` try/catch；REV-009 五项（命名对齐 / 未用 import / `skipped` 口径统一 / `startsWith` 全标题改 `SECTION_PREFIXES` 短前缀 / BUG-002 关闭标准 + 残余风险）同批消化。
- **四审（REV-010 low）**：op-005④ 缺「`init` 备份失败」集成断言 → executor 收编（`test/core/init.test.ts:191`），五审实测通过 closed。
- **五审（REV-011 low，非阻塞）**：jsonc 三处直写路径备份失败未捕获（`BackupError` 上抛中止命令 exit 1），与受管路径「跳过文件继续」语义分叉。五审裁定为**可接受的非阻塞 fail-fast**（数据无损 / state 自愈 / 失败响亮；唯一实质偏差＝「部分部署 + exit 1」），**归属 stage-47**（planner 已裁定：`setup`/`update` 补 try/catch 对齐 B3、`migrate` 保留 fail-fast + 文档化）。归档官不代改，仅沉淀。

### 独立验证（归档官复核）

| 项 | 结论 | 证据 |
|----|------|------|
| 备份范围无遗漏 | ✅ | 全局资产（`writeManagedFile` 三分支）+ 全局 `opencode.jsonc`（3 处）+ 项目 `config.yaml` + `package.json`；`created` / no-op `skipped` / `malformed` / `flow.json` / 项目 `opencode.jsonc` 不备份 |
| 备份失败绝不覆盖 | ✅ | `init.ts:190/:204` 仅两条 `writeDefaultConfig` 路径（备份成功 try 内 / else）；`:192-201` `BackupError` → `anomaly(note='backup_failed')` + `warn` + `skipped.push`；`update.ts:1346-1356` 同构 |
| 锁临界区 / 撞名 / 原子写 | ✅ | `backup.ts:92-120` 全程单一 `withFileLock(globalLockPath('backup'))`；`:98-101` 撞名 `-N`；副本与 manifest 走 `atomicWriteFileSync` |
| 锁序（无嵌套） | ✅ | `setup.ts:64→:69` / `update.ts:1529→:1535` / `migrate.ts:524→:529` 备份先于 jsonc 锁完成 |
| 读侧向后兼容 | ✅ | `update-infos.ts:52-56` `SECTION_PREFIXES` 短前缀（三前缀互不包含；条目行 `- [`、头注行 `>` 不以 `## ` 开头）+ 旧行尾部段可选 |
| `deployGlobalAsset` 调用点 | ✅ | 定义 `update.ts:1409`、9 处调用全传 `command`（setup×3 / update×3 / migrate×3），tsc 兜底 |
| 测试 | ✅ | 41 文件 / **685 用例全绿**；`tsc --noEmit` exit 0；`npm run build` 幂等（build 后对 src/.opencode/test 零输出） |
| i18n / kb 门禁 | ✅ | `lint i18n` 502 键一致零错误；`lint kb` exit 0（1 条**既有**过期引用 `kb/architecture.md:497`，非本阶段引入） |
| 隔离与污染 | ✅ | 端到端隔离 HOME 实测 10 场景（A~J）；真实 `~/.openfeel/` 无 `backup/`、无 `update_infos.md`，`config.json` / `update_state.json` SHA256 与基线一致 |
| config 三值 | ✅ | `.openfeel/config.yaml` `auto` / `enabled` / `true` 未被覆写（stage-42 教训未重演） |
| Bug | ✅ | 本阶段 **0 新增**；`config/BUG-002` **仅缓解**，`status: open` 未动，executor 报告无「已修复」表述 |
| 源文件数 / Agent 数 | ✅ | `glob src/**/*.ts` = **62**（概览原记 61 → 已更新）、`glob .opencode/agents/*.md` = 9（概览记 9 → 无需更新） |

### 知识沉淀（去重通过，全部新增）

| 分类 | 新增条目 |
|------|----------|
| patterns | 部署覆盖前自动备份机制：写前备份 + HOME 相对分区 + manifest + 单锁临界区 + 绝不覆盖既有备份 |
| patterns | 全局状态文件多类条目扩展与短前缀读侧分类：向后兼容的读侧改造 |
| patterns | 全局路径测试的单点 mock 隔离模式：`vi.mock('node:os')` 一处覆盖全部全局路径 |
| troubleshooting | 「备份失败绝不覆盖」的失败路径语义分叉：受管文件跳过继续 vs jsonc 直写整体中止 |

**去重记录**（`kb-dedup` 真实模块，LF 归一化副本，见 `kb/troubleshooting.md #kb-dedup CRLF 失效`）：

| 候选 | 分类 | 命中条目数 | 最高相似度 | 判定 |
|------|------|:--:|:--:|------|
| 部署覆盖前自动备份机制 | patterns | 75 | **7.31%**（全局/项目双 state 路由模式） | 新增 |
| 全局状态文件多类条目与短前缀读侧分类 | patterns | 73 | **4.55%**（控制区标记模式） | 新增 |
| 全局路径单点 mock 隔离模式 | patterns | 74 | **6.92%**（测试 cwd 隔离模式） | 新增 |
| 备份失败 fail-fast 语义分叉 | troubleshooting | 24 | **5.53%**（migrate 中途失败排查） | 新增 |

最高 7.31% ≪ 80% 阈值 → **全部新增，无合并/覆盖**。

### manual 同步（归档官复核 + 3 处补正）

| 文档 | 处置 |
|------|------|
| `manual/index.md` | 模块树已含 `core/backup.md`（executor op-004）；归档官**补「维护规则」表一行**（backup.ts → `core/backup.md` 检查点） |
| `manual/core/backup.md` | 新增模块（executor）；归档官**补 REV-011 fail-fast 现状记录**（归属 stage-47，不改代码） |
| `manual/core/update-infos.md` | executor 已同步（第三类 backed、`note`、尾部段、`SECTION_PREFIXES`、调用关系、变更历史）——复核**无需追加** |
| `manual/core/update.md` | executor 已补「覆盖前备份」段；归档官**修正 `deployGlobalAsset` 签名**（stage-46 起 `command` 为必填第 4 参，破坏性变更 9 调用点全改） |
| `manual/core/global-paths.md` | executor 已补 `getGlobalBackupRootPath` 行 + 变更历史——复核**无需追加** |
| `manual/core/{init,setup,migrate}.md` | 复核：`init.md` 已含 `skipped` 字段；`setup.md` `SetupResult` 含 `skipped`；`migrate.md` 项目内备份与全局备份差异已在 `backup.md` 说明——**无需追加** |

### 关联产物

- 私域详版审查：`.openfeel/users/Liuary/code_review/REV-v1.1.2-stage-46.md`（545 行，五轮独立取证会话）
- 公共审查摘要：`.openfeel/code_review/v1.1.2-stage-46.md`
- 公共 Bug 归档：`.openfeel/bugs/config.md`（BUG-002 缓解记录）+ `.openfeel/bugs/index.md`
- 执行报告：`.openfeel/users/Liuary/log/op-v1.1.2-stage-46-report-2026-09-29.md`
- 测试报告：`.openfeel/users/Liuary/log/test-v1.1.2-stage-46-report-2026-09-29.md`
- 归档报告：`.openfeel/users/Liuary/log/archive-v1.1.2-stage-46-report-2026-09-29.md`

## 偏差登记

1. **`openfeel archive` 未运行**（沿用 stage-45 先例）。经源码核对 `src/core/archive/merge.ts:111-139`，该 CLI 有三项副作用：① 覆盖写 `.openfeel/log/archive-<stage>.md`（会冲掉本手工摘要）；② `mgr.appendLog(...)` + `mgr.save()` → **直接写 flow.json**（违反归档官「不直接修改 flow.json」约束）；③ 对全部 closed/resolved REV 逐个 `addKnowledgeEntry(projectPath, 'patterns', ...)`（绕过去重，向 `kb/patterns.md` 追加 11 条 `[REV-xxx] 标题` 低质条目）。故改为**手工生成**归档摘要并逐条做去重后写入 kb；flow.json 的 `archive_stage` 审计条目由 Feel 的 `flow advance --to done` 补记。
2. `plan/index.md`「各版本阶段对照」表仍止于 `v1.0.0-stage-34`（stage-35~46 行缺失，历史遗留，stage-42/44/45 已登记）——本次仅更新系列导航行，未补历史表。
3. `log/index.md` / `log.md` 为**历史混合编码文件**（含 66 / 2 个已物化的 U+FFFD 字符，均为合法 UTF-8）：追加时保持原编码、行尾与既有段落，未整文件重写；`log.md` 文末存在空的重复表头（历史遗留）未整理。
4. `day_index.md` 既有 `-015` 行重复（并发写所致）未动；本条目另取 `036` 号（取号前已扫描当日 001~035）。
5. `kb/architecture.md:497` 过期引用（`.opencode/instructions/core.md`，`git ls-tree HEAD` 证实从未存在）为**既有问题**，裁定归 **stage-43 版本收口**或由 stage-47 顺手处理；本次归档**未改动**该历史条目。
6. 未运行 `npm test` / `npm run build`（归档官职责为归档与沉淀，不重复验证）；回归数字采信审查官五审与测试官验收的**独立实测**结果（双方一致：41 文件 / 685 用例）。
