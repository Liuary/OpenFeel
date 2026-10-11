# 归档摘要 — v1.2.0-stage-82

- **归档时间**：2026-10-12
- **阶段名称**：v1.2.0-stage-82（需求命令面 — **主题一「需求流转系统」第二阶段 / 命令面**）
- **阶段状态**：archiving → done
- **依赖阶段**：hard `v1.2.0-stage-81`（需求核心引擎已归档，`src/core/req/` 冻结面）；下游 = `v1.2.0-stage-83`（聚合判定与回写，消费本阶段命令面与引擎硬补丁）
- **归档人**：openfeel-archiver

## 阶段目标

把 stage-81 冻结的**需求引擎面**暴露为 **CLI 控制**的命令面（用户诉求「这个流程也是 CLI 控制的」在需求主题的落点）：① 新建 `src/commands/req.ts`（`openfeel req` 顶层命令组，**10 子命令** `add`/`list`/`show`/`claim`/`release`/`set`/`link`/`advance`/`board`/`next`）；② `src/cli/index.ts` **两行注册**；③ 引擎**授权小幅补丁**（新增导出 `getAllowedNextStatuses` + `addRequirement` 非数组守卫收口 `req/BUG-001`）；④ i18n 双表成对（829 → **908**）；⑤ 命令层**零业务逻辑**（校验/流转/占用/关联唯一性单点在引擎）；⑥ `--json` 契约 + 退出码 0/1/2 + help 键双规与防死键双向断言。

## 操作产出

| ID | 标题 | 状态 | Commit |
|----|------|------|--------|
| op-001 | 引擎小幅补丁与命令组骨架（`getAllowedNextStatuses` + BUG-001 收口 + `add`/`list`/`show` + 两行注册；29 键） | done | —（未提交） |
| op-002 | 写命令全组（`claim`/`release`/`set`/`link`/`advance` + 分流矩阵；39 键） | done | —（未提交） |
| op-003 | 看板与推荐、help 键全覆盖断言与全门禁收口（`board`/`next` + T4/T6；**阶段收口 op**，含自测报告；11 键） | done | —（未提交） |

> 注：executor 按 `ops/deps.yaml`「不 commit」约定，产出停留工作区（HEAD `c5f1d53`，**本阶段未 commit**）；执行序 = `op-001 → op-002 → op-003`（严格串行）。审查：plan_review 首轮 **fail（3 blocking + 11 非阻塞）→ 修订 → pass** / scheme_review（pass）/ code_review（pass）。验收 **通过、0 Bug**。

## 改动文件

- **`src/commands/req.ts`**（**新建**）：`registerReqCommand(program)` + 4 私有 helpers（`failJson` / `asJsonOf`〔防御合并 `command.parent?.opts().json`〕/ `failNoInit` / `isValidReqId`）+ 10 子命令。**文件头中文注释**声明「命令层零业务逻辑」与正交边界（措辞规避禁用串字面量）。
  - 读命令（`--json`）：`list`（`--status`/`--target-version`/`--owner`，多条件 AND；`--status` 值域取 `REQ_STATUSES`）、`show`（关联阶段**仅原始 id 枚举**，零 done/进度聚合）、`board`（7 组固定顺序 = `REQ_STATUSES`，恒含空组）、`next`（scheduled ∧ 未认领；排序冻结：target_version 升序→created_at→id）。
  - 写命令（无 `--json`）：`add`（引擎抛错分流；正文骨架直传本体；骨架失败不 save）、`claim`（四码分流 + `--owner` 三级链 + 同 owner 幂等）、`release`（未占用 no-op 恒 exit 0）、`set`（命令层零校验；无字段守卫）、`link`（互斥守卫；仅一次 `normalizeStageId`；`already_linked` 硬拒）、`advance`（零校验；done 门引擎单点；不设 `--force`）。
- **`src/core/req/requirement-ops.ts`**（**授权小幅补丁**）：① `addRequirement` 非数组守卫收口——`data.requirements ??= []` → `Array.isArray(...) ? ... : []`（重建续建，与其余 8 原语「非数组 ≡ 空集」口径统一；`req/BUG-001` = REV-81-019 同一处，**单点修复勿双改**）；② 新增导出 `getAllowedNextStatuses(status)`（只读纯函数、返回副本、域外 → `[]`；`ALLOWED_TRANSITIONS` 保持**模块私有**——防第二读点漂移）；③ REV-81-018 登记注释（add 抛错 vs update 错误码的接受差异）。
- **`src/core/i18n-data/{zh-CN,en}.ts`**：新增 `req` 域 **42 消息键** + `help` 域 **37 键**（双表成对）+ `allDomains` 追加 `req` 域。
- **`src/core/i18n.ts`**（**超范围必需偏差**，REV-82-022 登记）：运行时域数组追加 `req`（import `req` + `zhDomains`/`enDomains` 各 +1）——该文件不消费 `allDomains`，仅改 i18n-data 双表则 `t('req.*')` 返键自身；纯增量、既有域零改。
- **`src/cli/index.ts`**（**仅两行**）：`import { registerReqCommand }` + `registerReqCommand(program)`（核验 B11：`registerReqCommand` 恰出现 2 次）。
- **测试**：`test/core/req.test.ts`（追加「T5.7 承接回归（stage-82）」段：BUG-001 三变体 + `getAllowedNextStatuses` 全表/域外/副本）+ `test/commands/req.test.ts`（**新建**：隔离骨架 + T-A1~A10 / T-B1~B11 / T-C1~C5）。
- **方案层**：`.openfeel/plan/v1/stage-82/ops/{deps.yaml,op-001~003.md}`；**报告**：`.openfeel/tmp/stage-82-selftest-report.md`（工作区，不入版本管理）。

## 关键不变量（设计裁定与实测）

| 不变量 | 内容 | 实证 |
|--------|------|------|
| **命令层零业务逻辑** | 校验 / 状态流转合法性 / 认领占用 / 关联唯一性 / done 门**单点在引擎**；命令层仅错误码→文案映射 | T-B7（`set`/`advance` 目标值文案逐字 = `getAllowedNextStatuses(当前状态).join(', ')`，零命令层枚举）；plan_review REV-82-003 blocking 闭合 |
| **`--json` 成功/失败同契约** | 四读命令成功/失败均走 **stdout 纯 JSON 单文档**（`schemaVersion:1`）+ **stderr 零输出** + exit 非 0（失败） | T-A6/A8/C1/C2；自测报告 §三 契约表 |
| **退出码 0/1/2** | 成功 0（不置 `process.exitCode`）/ 各错误 1（`process.exitCode = 1`，**禁 `process.exit(1)`**）/ 并发 2（`handleConcurrentConflict` 单点） | T-B10 并发注入 + 各失败路径 |
| **命令层零写盘（失败路径）** | 全部失败路径 flow.json 逐字节不变；`changed:false` 幂等路径 revision 不变、零审计 | T-A2/T-B2/T-B6（文件快照 + revision 断言） |
| **正交 / 越界** | 直读 `src/commands/req.ts` 全内容（含注释）：`ALLOWED_TRANSITIONS`/`workflow_mode`/`getValidTargets`/`flow-archive`/`.phase`/`allLinkedStagesDone`/`padStart` **7 禁止串零命中** + 6 正控命中 | T-C5 静态断言 |
| **help 键防死键** | arg 键 = `arg`+参数名逐字（非 camelCase）；option 键 = 长名 camelCase；**37 键双向逐键断言**（正向 hasKey + 反向命令树 ⊆ 期望清单） | T-C3（REV-82-011） |
| **`--owner` 三级链** | `.info.json user` → `git config user.name` → 哨兵 `'unknown'` 显式拒绝（提示 `--owner`）；禁硬编码 | T-B4 四路径（REV-82-012） |

## 审查记录

### 计划审查轮（plan_review，2026-10-12，首轮 fail：3 blocking + 11 非阻塞 → 修订 → pass）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-82-001 | `link` 覆盖/替换语义 vs 引擎 `already_linked` 硬拒 | **closed** | high（**blocking**） |
| REV-82-002 | `add [--source]` 与冻结契约冲突 + 漏登 `add` 抛错语义 | **closed** | high（**blocking**） |
| REV-82-003 | `set`/`advance` 命令层重做校验 → 第二份流转表 + 枚举漏项 | **closed** | high（**blocking**） |
| REV-82-004 | 承接 REV/Bug 零交代（第 3 次复发，唯一收口窗口） | closed | high |
| REV-82-005 | i18n 基线 796 过期 → 实测 829 | closed | medium |
| REV-82-006 | `link` 存在性校验与引擎仅查 `data.stages` 不一致 | closed | medium |
| REV-82-007 | `--json` 失败路径契约缺失 | closed | medium |
| REV-82-008 | 选项命名分叉（`--target-version` vs `--version`） | closed | medium |
| REV-82-009 | `claim` 漏 `invalid_field`（owner 空串） | closed | low |
| REV-82-010 | `release` 应直接定 exit 0（引擎 no-op 成功） | closed | low |
| REV-82-011 | help arg 键名非 camelCase | closed | low |
| REV-82-012 | `--owner` 缺省硬编码 `Liuary` | closed | low |
| REV-82-013 | `show` 聚合摘要占位越界 | closed | low |
| REV-82-014 | 行号锚点无 HEAD 声明且 2 处漂移 | closed | low |

### 计划审查复审（修订验收，2026-10-12，结论 pass：001~014 全闭合 + 新增 1 条）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-82-015 | §一锚点残余微漂移 2 处（`program.version @ :23→:24` / `flow mode @ :487`） | pending（文档层锚点精度，无功能影响） | low |

### 方案审查轮（scheme_review，2026-10-12，结论 pass：0 阻塞 + 6 非阻塞）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-82-016 | `list --status` 值域守卫缺 `undefined` 前置判定（已落实补判定） | pending（已落实，台账保留） | medium |
| REV-82-017 | `--json` 失败对象 `error` 码风格混用（引擎 snake vs 命令层 kebab） | pending（已登记为可接受裁量） | low |
| REV-82-018 | `link --stage` 短名归一硬钉 `v1.0.0`（多版本失效） | pending（已落实 help 文案注明） | low |
| REV-82-019 | 跨阶段措辞张力（`requirements` 创建归属） | pending（已落实 deps 消解） | low |
| REV-82-020 | KB 锚点引用文字不精确 | pending（已落实全称） | low |
| REV-82-021 | 消息键命名分组不一致（`req.invalidIdTmpl` 散键 vs `req.err.*`） | pending（登记为接受差异） | low |

### 代码审查轮（code_review，2026-10-12，结论 pass：0 阻塞 + 2 非阻塞）

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-82-022 | `src/core/i18n.ts` 超范围产出未登记 op 产出清单 | pending（**本归档轮补入 op 产出清单**；登记为接受偏差） | low |
| REV-82-023 | `req next` 硬编码状态字面量 `'scheduled'` | pending（方案 S-82-3 已冻结；可保留或提为命名常量） | low |

> 结论：**passed（全 23 条：closed 14 / pending 9，0 blocking 遗留）**。REV-82-001/002/003（计划轮 blocking）经修订轮闭合。归档官处置：**REV-82-022 本归档轮补入 op 产出清单**（`op-001/002/003.md` 产出文件列入 `src/core/i18n.ts`——命令面 i18n 生效必需、纯增量）；**REV-82-015**（计划文档层锚点精度）随 v1.2.0 收口（stage-85）处置；**016~021 / 023**（方案·代码轮非阻塞，均已落实或登记为接受裁量）保留 pending，随 v1.2.0 收口轮处置。

## 缺陷记录

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| `req/BUG-001` | `addRequirement` 对非数组 `requirements` 抛 TypeError（其余 8 个原语均宽容） | **closed**（本阶段 op-001 收口：`??=` → `Array.isArray` 重建续建；含 core 三变体 + 命令层回归 T-A4） | low |

> 测试官正式验收 **通过**（0 Bug）。承接自 stage-81 的 `req/BUG-001`（low 非阻塞，= REV-81-019 同一处）经 op-001 步骤 1.1 单点修复（`data.requirements ??= []` → `Array.isArray(data.requirements) ? data.requirements : []`），core 三变体（`{}` / `'x'` / `123`）+ 命令层回归（`requirements: {}` → `req add` exit 0 不崩）锁定；BUG-001 状态置 **closed** 并回填验收。

## 门禁

- `npm test` **70 文件 / 1506 用例 0 skipped / 0 failed**（stage-81 基线 69 文件 / 1476 用例 → 本阶段 +1 文件 `test/commands/req.test.ts` +30 用例）
- `npx tsc --noEmit` → exit 0
- `node bin/openfeel.js lint i18n` → **908**（入口基线 829 + 新键 **79** = 42 消息 + 37 help，双表成对；实测吻合无漂移）
- `node bin/openfeel.js lint kb` → **0**（过期引用；共检查 478 引用）
- `npm run build` ×2 → 幂等（`dist` 内容哈希两次一致）
- `node bin/openfeel.js --help` 冒烟 → 新增 `req` 一节 + 既有 16 命令组名全在（17 组）
- **真实工作区零触碰**：无 `.openfeel/requirements/` 目录；真实 `flow.json` 无 `requirements` 键；`package.json`/`build.js`/`pipeline.yaml`/phase 枚举零触碰；测试全程 fixture `tmpDir` + 隔离 HOME + `process.cwd` spy + 模块期 `REAL_CWD` 反守卫
- HEAD 恒 `c5f1d53`（零 commit）

## 知识沉淀

| 分类 | 标题 | 动作 |
|------|------|------|
| architecture | 需求命令面架构：引擎单点 + 命令层零业务逻辑（校验/流转/占用/关联唯一性） | 新增 |
| patterns | CLI `--json` 成功/失败同契约：stdout 纯单文档 + 失败含 error 码 + stderr 零输出 + 退出码 0/1/2 | 新增 |
| patterns | help 键命名双规 + 防死键双向逐键断言：arg 取参数名逐字 / option 取 camelCase | 新增 |
| patterns | 身份缺省链解析：三级链 + 末端哨兵拒绝 + 禁硬编码用户名 | 新增 |

> 去重（`node bin/openfeel.js knowledge dedup`）：architecture 候选（①命令面分层）最高 **1.8%**；patterns 候选（②`--json` 同契约）最高 **6.8%**、（③help 键双规）最高 **1.0%**、（④身份缺省链）最高 **1.0%**，均 ≪ 80% → 4 条均判**新增**。kb 分类计数：architecture 40→**41**、patterns 170→**173**。troubleshooting（59）本阶段**无新增条目**（死键坑已有既有条目 `#新增 i18n 键已定义却未接入` 覆盖）。

## manual 更新

- **`core/req.md`**（补命令面）：新增「命令面（`openfeel req`）」节——10 子命令功能矩阵（读 / 写、`--json` 有无）、`--json` 契约 + 退出码 0/1/2、命令层零业务逻辑 + 引擎单点、引擎小幅补丁（`getAllowedNextStatuses` 导出 + `addRequirement` 非数组守卫收口）、`--owner` 三级链、help 键双规；变更历史增 stage-82 行。
- **`cli/commands.md`**：命令注册清单增 `src/commands/req.ts  registerReqCommand`；新增 `req` 命令组说明（10 子命令 + `--json` 四读命令 + 退出码 + help 键双规 + `--owner` 三级链）。
- **`index.md`**：模块树「需求核心引擎（req）」条目补命令面；维护规则 req 行补命令面检查项。

## 遗留与下游

- ★ **flow 状态推进**：`v1.2.0-stage-82` → `done`（**由主会话** Feel 经 `openfeel flow advance --stage v1.2.0-stage-82 --to done` 执行；archiver 不直写 flow.json）。`archive_stage` 由该 advance 补记。
- **REV 遗留（9 条 pending 非阻塞，0 blocking）**：计划轮复审 **015**（锚点精度）/ 方案轮 **016~021** / 代码轮 **022·023**——均已落实或登记为接受裁量，随 v1.2.0 收口（stage-85）处置。**0 blocking 遗留**。
- **Bug 遗留**：无（`req/BUG-001` 本阶段 op-001 收口并 **closed**）。
- **下游契约**：`openfeel req` 10 子命令 + 引擎导出 `getAllowedNextStatuses` 交 stage-83（聚合回写：`computeRequirementAggregate` 须与 `allLinkedStagesDone` **语义等价**，禁第二套判定）。
- **兼容承诺**：写命令无 `--json`（本阶段边界，后续增补属纯增量）；`req add` 首次真实创建 `.openfeel/requirements/` 与 `flow.json.requirements` 键**随首次实际使用**发生，不属本阶段；存量 `flow.json` 无字段全路径零报错。
- **未 commit / 未 push / 未 publish / 未改版本**（版本保持 1.1.7，版本收口归 stage-85）。

> 归档方式：手工生成摘要（沿用先例，未运行 `openfeel archive <stage>` CLI 以避免其副作用）。
