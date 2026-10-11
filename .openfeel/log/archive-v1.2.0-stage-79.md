# 归档摘要 — v1.2.0-stage-79

- **归档时间**：2026-10-12
- **阶段名称**：v1.2.0-stage-79（归档命令面：`flow archive` 子命令组 — **v1.2.0 归档主题第二阶段**）
- **阶段状态**：archiving → done
- **依赖阶段**：hard `v1.2.0-stage-78`（消费 `src/core/flow-archive/` 全部原语）；下游 = `v1.2.0-stage-80`（消费点适配与存量迁移）
- **归档人**：openfeel-archiver

## 阶段目标

把 stage-78 的**引擎能力**暴露为 **CLI 控制**的命令面（用户诉求「这个流程也是 CLI 控制的」的直接落点）：① `flow archive <version>`（执行归档：**版本存在性门** → 判据门 → `--dry-run` 预览 → **两步事务顺序** → 审计 → `pipeline` 处置）；② `flow archive list` / `flow archive show <version> [--json]` 只读读取（**不进常规路径**）。挂既有 `flow` 命令、不改顶层命令树；与既有顶层 `openfeel archive <stage>`（阶段摘要）**职责分离**（裁定 O3）。

## 操作产出

| ID | 标题 | 状态 | Commit |
|----|------|------|--------|
| op-001 | `flow archive <version>` 执行命令 + pipeline 处置 + flow-archive 小幅补丁（T1 + T3 + REV-78-015） | done | —（未提交） |
| op-002 | `flow archive list` / `show` 只读命令 + 其余 i18n（T2 + T4） | done | —（未提交） |
| op-003 | 常规路径零触碰可执行验证、全量回归与门禁（T5.7 + T6；**本阶段最终 op**） | done | —（未提交） |

> 注：executor 按 `ops/deps.yaml`「不 commit」约定，产出停留工作区（HEAD `6c22784`）；执行序 = `op-001 → op-002 → op-003`（严格按 `execution_order`）。

## 改动文件

- **`src/commands/flow.ts`**（**+238**）：新增 `flow archive` **子命令组**——`archive <version>`（执行）+ `archive list` + `archive show <version>`；**版本存在性门前置**（`listArchivableCandidates` 无该 version 候选 → exit 1 零写盘，文案区分「版本未注册于活跃 flow.json」）；**判据门**（`allDone !== true` 或 `listBlockingOpenRevsForVersion` 非空 → exit 1 零写盘，列未满足项）；`--dry-run` 预览（深拷 pipeline，**四写盘点零写盘**）；**两步事务顺序**（先 `writeArchiveFile`〔独立锁 `flow-archive`〕→ 内存移除三段 + `addArchivedVersion` → `applyArchivePipelineDisposition` → `mgr.save()`〔后，捕获并发冲突 → `handleConcurrentConflict` exit 2〕）；`--json` 成功载荷 `{ schemaVersion:1, version, stages, reviews, log, dryRun }`、失败**纯 JSON 单文档** + exit 1；`writeArchiveFile` 包 try/catch（`archive-write-failed`，REV-79-013）；**子命令 action 合并 `command.parent?.opts().json`**（REV-79-018）。
- **`src/core/flow-archive/`**（补丁：**导出 4 helper**）：
  - `archive-ops.ts`：`normalizeArchiveVersion(input): string | null`（归一 = **去 v 再加 v**，trim，非法 null）、`applyArchivePipelineDisposition(data, version): { currentCleared, phase }`（**纯内存**——current 命中版本 → `{stage:'',op:''}`；phase = 活跃集非空且全 done ? `'done'` : `'active'`，**空集 → active**）、`isValidArchiveVersion` 导出。
  - `grouping.ts`：`listBlockingOpenRevsForVersion(data, version)`（谓词恒 `r.blocking !== false && r.status === 'open'`，版本作用域经 `versionOfReviewOp` 同源解析，返回副本）。
- **`src/core/flow-manager.ts`**（**净减法 −4**）：移除 `load()` 的 `archived_versions` 读侧补齐（`??= []`）——**REV-78-015 处置定稿**；「缺失 ≡ []」语义由 `getArchivedVersions()`（自带 `Array.isArray` 防御）承担，`meta.archived_versions` 仅在归档 `save()` 时落盘。
- **`src/core/i18n-data/{zh-CN,en}.ts`**（**+30 键**：**796 → 826**）：21 消息键（`flow.archive.*`：执行 11 + 只读 10）+ 9 help 键（`help.flow.archive` / `.argversion` / `.dryRun` / `.json` / `.list` / `.list.json` / `.show` / `.show.argversion` / `.show.json`），双表成对、逐键有消费点。
- **测试**：`test/commands/flow.test.ts`（T5.1~T5.6）+ `test/core/flow-archive.test.ts`（跨层断言 + 翻转「load 读侧补齐」用例为「load **不注入**该键」）。
- **方案层**：`.openfeel/plan/v1/stage-79/ops/{deps.yaml,op-001~003.md}`（随阶段纳入版本管理）。
- **报告**：`.openfeel/tmp/stage-79-{selftest,gate}-report.md` + `op-v1.2.0-stage-79.op-00{1,2,3}-test-report.md`（工作区）。

## 审查记录

### 计划审查轮（plan_review，2026-10-12，结论 pass：0 阻塞 + 10 非阻塞 → 001~010 全闭合）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-79-001 | 不存在/已归档版本请求写空归档并覆盖既有归档 | closed | high（**blocking**） |
| REV-79-002 | 判据门 blocking 谓词与全仓既有谓词不一致 | closed | high（**blocking**） |
| REV-79-003 | `flow archive show --json` 载荷口径 T2 与 R-79-4 矛盾 | closed | medium |
| REV-79-004 | `<version>` 归一方向与引擎键相反 + 校验 helper 未导出 | closed | medium |
| REV-79-005 | T3「`pipeline` 处置」与 stage-80 交付面双 owner | closed | medium |
| REV-79-006 | T4 i18n 键缺 arg/option help 键 | closed | medium |
| REV-79-007 | 「常规路径零触碰」缺可执行验证 | closed | medium |
| REV-79-008 | 行号锚点漂移 + T3 空集措辞二义 | closed | low |
| REV-79-009 | T1 未列 `SplitResult.archive` 装配步骤 | closed | low |
| REV-79-010 | REV-78-015 未交代 + `list` 顺序未定 + manual 零 import 声明将失效 | closed | low |

### 方案审查轮（scheme_review，2026-10-12，结论 pass：0 阻塞 + 5 非阻塞）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-79-013 | 归档文件写盘无异常保护，破坏 `--json` 单文档契约 | closed | medium |
| REV-79-014 | op-001 步骤 2.2 自检断言事实错误（谓词命中计数） | closed | medium |
| REV-79-015 | `--dry-run` 预览浅拷贝致 live `data.pipeline` 被就地改写 | closed | low |
| REV-79-016 | 步骤 1.1 旧名引用清单不全 | closed | low |
| REV-79-017 | 大计划 A5/裁定 P④/Q3 双口径未随 D3 冻结收敛 | **pending**（转 v1.2.0 收口） | low |

### 代码审查轮（code_review，2026-10-12，结论 pass：0 阻塞 + 5 非阻塞）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-79-018 | Commander 父命令 `archive` 声明 `--json` 致子命令 `options.json` 不可达 | **closed**（修复已实测生效） | medium |
| REV-79-019 | op-001.md 参考实现未同步 REV-79-013/015 落实结果（文档-代码双口径） | **pending**（转 v1.2.0 收口） | medium |
| REV-79-020 | `archive-write-failed` 未登记进冻结失败错误码契约 | **pending**（转 v1.2.0 收口） | low |
| REV-79-021 | 行号锚点漂移 | **pending**（转 v1.2.0 收口） | low |
| REV-79-022 | `flow.archive.rearchivedTmpl` 覆盖分支无测试覆盖 | **pending**（转 v1.2.0 收口） | low |
| REV-79-023 | 风格 nit（`--json` 失败出口与防御强度不齐） | **pending**（转 v1.2.0 收口） | low |

> REV-79-013~016 经审查官独立复核验收 closed（修复已实测生效）；018 由 executor 修复（子命令 action 合并父级 opts）经审查官实测两命令均出纯 JSON 后 **closed**；其余 7 条为**非阻塞遗留**（计划文档 / deps.yaml 契约层 / op-001.md 参考实现同步 / 行号 / 测试缺口 / 风格），保留 pending、注明「转 v1.2.0 收口」，不影响阶段结论。

> 结论：**passed（计划轮 10 + 方案轮 5 + 代码轮 6，其中 14 条闭合、7 条非阻塞 pending 转收口，0 blocking 遗留）**。

## 缺陷记录

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| — | 无新增缺陷（测试验收通过、0 Bug） | — | — |

## 门禁

- `npm test` **68 文件 / 1372 用例 0 skipped / 0 failed**（基线 68 / 1337 → +35 用例）
- `npx tsc --noEmit` → exit 0
- `node bin/openfeel.js lint i18n` → **826**（基线 796 → +30；双处显式登记）
- `node bin/openfeel.js lint kb` → **0 过期**（439 引用）
- `npm run build` ×2 → 幂等（`git status --porcelain src/` 前后逐字一致、`??` 零命中）
- 路径单点：`rg "flow-archive" src/` 命中仅 `src/core/flow-archive/**` + `src/commands/flow.ts`（**stage-79 起 flow.ts 已 import 引擎**；`src/cli/**` 零命中）
- 契约导出：3 新 helper（`normalizeArchiveVersion` / `applyArchivePipelineDisposition` / `listBlockingOpenRevsForVersion`）签名对齐 `ops/deps.yaml` `downstream_contracts`
- diff 归因：`flow-manager.ts` = **净 −4**（REV-78-015 移除 `load()` 读侧补齐）
- 本仓零触碰：`.openfeel/flow.json` sha1 前后一致 `9d6b78ea…`；HEAD 恒 `6c22784`（零 commit）
- 常规路径零触碰（T5.7 可执行验证）：静态 import 面断言 + 归档目录重命名后 `flow status`/`overview`/`current`/`ops list`/`mode`/`phases`/`log` 全绿 + 既有输出逐字不变

## 知识沉淀

| 分类 | 标题 | 动作 |
|------|------|------|
| architecture | 归档命令面架构：引擎面/命令面分层 + 判据门前置（存在性门 + 全 done + 无 blocking open REV）+ 两步事务顺序 + `pipeline` 处置同事务（owner 单一） | 新增 |
| patterns | Commander 父子命令 `--json` 标志传递陷阱：父命令先行消费致子命令 `options.json` 不可达 + 子命令 action 合并 `command.parent?.opts().json` | 新增 |
| troubleshooting | 版本归一方向陷阱（去 v 再加 v，禁复用 `normalizeVersion` 的去 v 方向）+ 路径穿越封堵（探针法校验 version，非法抛错零写盘） | 新增 |

> 去重（`node bin/openfeel.js knowledge dedup`）：architecture 候选最高 **2.2%**、patterns 候选最高 **0.7%**、troubleshooting 候选最高 **1.0%**，均 ≪ 80% → 3 条均判**新增**。

## manual 更新

- **`core/flow-archive.md`**：新增**消费面**节（`flow archive <version>` / `list` / `show` 命令组 + 判据门 + 两步事务 + `--json` 契约）；**订正零 import 表述**——原「零常规路径触碰（`src/commands/**` 零 import）」声明已失效，现 `src/commands/flow.ts` 已 import 引擎（stage-79 起消费面成立）；`flow-manager.ts` 变更行更新为「REV-78-015 移除 `load()` 读侧补齐（净 −4）」
- **`cli/commands.md`**：`flow` 命令面补 `flow archive` 子命令组（执行/列表/查看 + `--dry-run` + `--json`）
- **`index.md`**：模块树「版本分片归档（flow-archive）」条目更新为含命令面；维护规则表对应行更新

## 遗留与下游

- ★ **flow 状态推进**：`v1.2.0-stage-79` → `done`（**由主会话** Feel 经 `openfeel flow advance --stage v1.2.0-stage-79 --to done` 执行；archiver 不直写 flow.json）。`archive_stage` 由该 advance 补记。
- **REV 遗留（转 v1.2.0 收口，7 条 pending 非阻塞）**：REV-79-011/012/017/020（计划文档 / deps.yaml 契约层）、REV-79-019（op-001.md 参考实现同步）、REV-79-021/022/023（行号/测试缺口/风格）。
- **下游契约**：命令面交 stage-80（存量迁移）/ stage-84（skill）/ stage-85（文档）；3 新 helper + `flow archive` 命令面契约登记于 `ops/deps.yaml` `downstream_contracts`。
- **兼容承诺**：`meta.archived_versions` 仅在归档 `save()` 时落盘；REV-78-015 后 `load→save` 恒不注入该键。
- **未 commit / 未 push / 未 publish / 未改版本**（版本保持 1.1.7，版本收口归 stage-85）。

> 归档方式：手工生成摘要（沿用先例，未运行 `openfeel archive` CLI 以避免其副作用）。
