# OpenFeel v1.2.3 — v1.2.2 转出项收口（补丁版本）

> **版本**：v1.2.3（Patch） | **创建日期**：2026-10-17 | **Planner**：openfeel-planner
> **规模判定**：**小规模**（单阶段；4 项小范围修复 + 版本收口；无架构变更、无新增命令/字段/依赖）→ fast 快线；仍必经 openfeel-reviewer **单轮计划审查**。
> **定位**：只做 v1.2.2 收官遗留的**仓库内转出项**与版本收尾；**范围锁定，不扩项**。
> **阶段计划**：`.openfeel/plan/v1/stage-99/plan.md`。
> **路线图**：`.openfeel/roadmap/v1.2.3.md`。
> **依赖声明**：`.openfeel/plan/v1/v1.2.3/deps.yaml`。
> **系列**：`v1`；`stageDir` 映射 `stage-99`；阶段 ID `v1.2.3-stage-99`（承接 v1.2.2-stage-98）。
> **基线**（实测，HEAD `2ede21a` + 当前工作区）：CLI **1.2.2**；flow 注册阶段 **9**（v1.2.0-stage-78~85 全 done + stage-99）；`flow.json` `revision 1280` / `archived_versions` **11** / `requirements` **1**（REQ-001 done）/ `reviews` **0**；测试 **74 文件 / 1894 用例**（v1.2.2 收口登记值）；`lint i18n` **983**；`lint kb` **0 过期 / 622 引用**；agent **10** / skills **22**；本仓 `config.yaml defaults.workflow_mode: full`；stage-99 `status.md` / flow.json 覆盖为 **fast**（生效模式 fast）。

---

## 一、范围（锁定）

### 1.1 仓库内必做（5 组）

| # | 转出项 | 来源 | 落点 |
|:-:|------|------|------|
| 1 | **并发 JSON 退出机制统一**：`handleConcurrentConflict` JSON 分支由 `process.exit(2)` 改为「输出 envelope → 置 `exitCode=2` → return」；非 JSON 分支与退出码 2 语义零改动 | REV-95-009 | T1 |
| 2 | **`flow advance --help --review-tier` 文案订正**：现文「缺省=按模式派生」→ 实际「缺省=`full`（零裁剪）」；按模式派生的是 `flow phases --json.reviewTier` 展示值 | REV-98-003 第 6 项 | T2 |
| 3 | **锁等待超时 E2E 测试钩子**：增加仅测试可用的确定性注入（env seam），使 `withFileLock` 超时路径可在 CLI E2E 稳定断言 `INTERNAL_ERROR/internal/3` | REV-98-006① / REV-95-008 覆盖缺口 | T3 |
| 4 | **`req` 内联 `requirement_id` 过滤单点化**：`req show` 改用 `listLinkedStages`；源码实测第二处为 **`req set --workflow-mode`**（非 `req split`），一并改用单点；单点范围限定为**命令层输出面 + 聚合投影**，core 引擎层 `allLinkedStagesDone` / `hasLinked` 等 done 判定原语保留；纯等价重构、行为零变化 | REV-97-006 | T4 |
| 5 | **版本 1.2.3 全链路收口**：A/B/C/D/E 载体 + CHANGELOG + 文档多载体 + build 双生成物 + `--version` = 1.2.3 | v1.2.2 版本收口惯例 | T5 |

### 1.2 仓库外项（仅登记，不入本仓文件清单）

| # | 外部项 | 内容 | 归属 |
|:-:|------|------|------|
| **OUT-1** | OpenFeel-DSH 适配器跟进 | ① 退役 `PHASE_AGENT` 镜像（`dashboard.js:35/:38`，REV-98-006②），改为消费 `flow next --json`；② `errorFromResult` 消费 envelope 的 `kind`/`code`/`detail`（不再只给 `FEEL_CLI_REFUSED` 通用分类）；③ 更新 DSH 测试并跑 verify | Feel 单独委派；**不纳入 stage-99 文件清单**；不阻塞本仓收口 |

### 1.3 不做

- 不新增功能 / 命令 / 字段 / 配置键 / 第三方依赖；不改 phase 枚举 15 项与转移表语义。
- 不改 33 个成功 JSON 出口 / 34 个注册选项的键集与键序。
- 不改 `req split` 命令与 `splitRequirement` 引擎（源码实测其无 `requirement_id` 内联过滤）。
- 不重写历史文档节（v1.2.1 历史 README/skill 节保留，由 v1.2.3 订正条 supersede）。
- 不直写 `flow.json`；不推进 phase；不代 push；是否 `npm publish` 由用户决定。

---

## 二、关键裁定

| # | 议题 | 裁定 | 理由 |
|:-:|------|------|------|
| D-1 | 版本号 | **1.2.3**（三段补丁号） | npm/semver 不接受四段号；`1.2.2.1` 非法 |
| D-2 | 工作流模式 | **fast** 单阶段 | 小范围修复；fast 表仍含 `plan_pending → plan_review`，计划审查不可跳过 |
| D-3 | 并发 JSON 退出 | **JSON：emit → `process.exitCode=2` → return**；**非 JSON：保持 `process.exit(2)`** | 与 `failCli` 机制一致，规避 Windows 管道 stdout 截断；0/1/2 语义零改动 |
| D-4 | 调用点纪律 | `handleConcurrentConflict` / `handleAddStageError` 返回类型由 `never` 改 **`void`**；**10 个调用点**（直接 8 + `handleAddStageError` 调用方 2）在 handler 后显式 `return`，禁止落入通用错误分支 | JSON 模式不再即时退出，必须由调用方返回保证不二次输出/不改 exit 1；2 处 `handleAddStageError` 调用方为 catch 末语句，fallthrough 风险为零 |
| D-5 | `req` 单点化落点 | `req show`（`req.ts:241-243`）+ `req set --workflow-mode`（`req.ts:436-438`）；`req split` 零改动 | 源码实测；REV-97-006 的「req split」标签与基线 `87df0b7` 实际命令块不符，按实测落点并留痕 |
| D-6 | 锁超时测试钩子 | `OPENFEEL_TEST_MODE=1` 门控 + `OPENFEEL_TEST_LOCK_TIMEOUT_MS` / `OPENFEEL_TEST_LOCK_STALE_MS`；仅当调用点未显式传 `options` 时生效；非法值回落默认；**非公开 CLI 契约** | E2E 子进程唯一可行注入面；门控 + 默认零影响；比「外部进程持续 touch mtime」更确定 |
| D-7 | help 文案载体 | `flow.ts` 字面量 + i18n zh/en 双键同批；历史 README/skill 节不回溯改，由 v1.2.3 订正条 supersede | help 实际经 `applyHelpI18n` 替换，三载体缺一即不生效；历史节保留审计链 |
| D-8 | 版本收口时点 | T5 为最终任务组；版本号写入后零业务代码改动；T6 只跑门禁与实测登记 | 承 v1.2.2 收口期冻结纪律 |
| D-9 | 外部项 | OUT-1 仅登记，不纳入本仓文件清单、不作为 stage-99 完成判据 | 任务明确仓库外项由 Feel 单独委派 |

---

## 三、阶段与任务表

| 阶段 | 名称 | 依赖 | 模式 | 任务 |
|------|------|------|:--:|------|
| `v1.2.3-stage-99` | v1.2.2 转出项收口与版本 1.2.3 收口 | 无（上游 stage-98 done/archived） | fast | T1~T6 |

| 任务 | 主题 | 主要文件 | 验收要点 |
|:--:|------|----------|----------|
| **T1** | 并发 JSON 退出统一 | `src/commands/shared/errors.ts`；`src/commands/flow.ts`（694/768/829/882/2041/2563）；`src/commands/stage.ts`（679）；`src/commands/req.ts`（87-96）；`src/cli/index.ts`（224-227）；`test/cli/error-envelope.test.ts` | JSON 并发：stdout 恰 1 envelope、`process.exit` 未调用、`exitCode=2`、无通用错误/exit 1 二次输出；非 JSON：stderr 文案 + `process.exit(2)` 逐字不变；10 个调用点（直接 8 + `handleAddStageError` 调用方 2）逐点核对 |
| **T2** | `--review-tier` help 文案订正 | `src/commands/flow.ts:899`；`src/core/i18n-data/zh-CN.ts:740`；`src/core/i18n-data/en.ts:707`；`docs/commands.md:239`；`docs/GETTING_STARTED.md:246`；`SKILL.md` 订正条 | zh「缺省=full（零裁剪）」/ en「default = full (zero pruning)」；help 范围无「按模式派生」/「derived from the workflow mode」；缺省行为不变；lint i18n 对称 |
| **T3** | 锁等待超时 E2E 钩子 | `src/core/fs/file-lock.ts`；`test/core/fs/file-lock.test.ts`；新增 `test/cli/lock-timeout.test.ts`；`docs/json-contract.md` §14.1；`.openfeel/manual/core/fs.md` | gate off 零影响；gate on + 合法值生效、非法值回落、显式 options 优先；E2E 预置 fresh `flow.lock` + timeout 200ms + stale 60000ms → `archive <stage> --json` exit 3 + 单 envelope `INTERNAL_ERROR/internal`；生产默认 5000/3000ms 不变 |
| **T4** | `req` 过滤单点化 | `src/commands/req.ts`（241-243 / 436-438）；`test/commands/req.test.ts`；`test/core/req.test.ts`（静态单点断言） | `req show --json.stages` 与 `listLinkedStages(...).map(id)` 同序同值；`req set --workflow-mode` 分发集合与 normalize 语义不变；`req.ts` 内联 filter 归零；`req split` 零 diff；core done 判定原语保留、不受影响 |
| **T5** | 版本 1.2.3 收口 | A 类 8 文件 / 10 处；B 类双生成物；C 类文档；`docs/json-contract.md` §14.1/§14.2；`.openfeel/manual/**`；`SKILL.md` | A 类残留 0；build ×2 幂等；`--version` = 1.2.3；CHANGELOG `[1.2.3]`；§14.2 改为「已统一」；文档与 `--help` 实测一致 |
| **T6** | 门禁与验收 | 全仓 | `npm test` 0 failed / 0 skipped（登记新计数）；`tsc` 0；`lint i18n`；`lint kb` 0 过期；build ×2 幂等；E2E 实跑通过；零回归清单 |

### 3.1 阶段内执行顺序

```text
T1（并发退出）──▶ T2（help 文案）──▶ T3（锁超时钩子）──▶ T4（req 单点）
   ──▶ T5（版本收口，最终任务组）──▶ T6（门禁）
说明：T1/T2 同文件不同区域，建议串行；T3/T4 独立，可顺序执行；T5 必须在全部代码改动之后。
```

---

## 四、版本收口清单（1.2.2 → 1.2.3，A/B/C/D/E）

> 依据 `kb/patterns.md #版本号全链路收口清单模式`；以**内容特征**判定，不以行号为准；B 类为双生成物。

### A 类：手工载体（6 载体 / 8 文件 / 10 处）

| # | 文件 | 位置 | 现值 → 目标 |
|:-:|------|------|-------------|
| A1 | `package.json` | `:3` | `1.2.2` → `1.2.3` |
| A2 | `package-lock.json` | root `:3` / `:9` | `1.2.2` → `1.2.3`（**禁 `npm install` 重生成**；`:3211` 依赖自身版本禁改） |
| A3 | `.openfeel/config.yaml` | `:7` | `1.2.2` → `1.2.3`（**单行 edit，禁整文件重写**） |
| A4 | `src/core/config.ts` | `:436` / `:493` | `1.2.2` → `1.2.3` |
| A5 | `src/core/templates-data/agents-md/zh-CN.md` / `en.md` | `:135` ×2 | `v1.2.2` → `v1.2.3` |
| A6 | `src/core/templates-data/claude/constraint/zh-CN.md` / `en.md` | `:138` ×2 | `v1.2.2` → `v1.2.3` |

### B 类：生成段（双份，禁手改）

- `src/core/template-loader.ts` + `src/core/update.ts`，由 `npm run build` 重生成；**禁手改**；`git status --porcelain src/` 干净断言。

### C 类：传播载体

| 载体 | 处置 |
|------|------|
| `CHANGELOG.md` | 追加 `## [1.2.3] - 2026-10-17`：Fixed（并发 JSON 退出统一 / help 文案 / `req` 单点化）+ Changed（锁超时测试钩子，test-only；版本 1.2.3）+ Compatibility（0/1/2 语义与 JSON 契约零破坏） |
| `README.md` / `README.zh-CN.md` / `README.en.md` | 最新版本横幅/补丁节 → v1.2.3；测试计数按 T6 实测更新；v1.2.2 历史节保留 |
| `docs/GETTING_STARTED.md` | `:3` 快照 → v1.2.3；`:246` 「源码 help 订正转 v1.2.3」→「已于 v1.2.3 订正」；补丁速览 |
| `docs/commands.md` | `:3` 快照 → v1.2.3；`:239` 注记更新；错误封装节补「并发 JSON 退出机制已统一（v1.2.3）」 |
| `docs/json-contract.md` | 标题/口径 → v1.2.3；§14.1 补测试钩子与 E2E 证据；**§14.2 改为「已统一」**（JSON：emit → exitCode → return；非 JSON：`process.exit(2)` 不变） |
| `.openfeel/manual/**` | `index.md` / `cli/commands.md` / `core/json-contract.md` / `core/fs.md` 按模块最小补正；`core/req.md` 若涉及单点口径按需补一行 |
| `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md` | 快照 → v1.2.3；description / 快照行 / 订正条 / v1.2.3 修复条目 |

### D 类：禁改 / 白名单

- `src/**` 历史阶段批注（`v1.2.2-stage-*` 等）、依赖自身版本、`test/**` 注释、`docs/phase-*/**`、历史 REV / 计划 / 归档文件、`kb/**` 历史条目、`.openfeel/dev/**` 私域记忆。
- 历史文档节中的旧口径（如 README v1.2.1 节「缺省按模式派生」）**不回溯改**；由 v1.2.3 订正条 supersede（追加式）。
- 「残留 = 0」白名单化：D 类命中逐条列出 file:line 与理由，禁广谱 sed。

### E 类：无载体

- `docs/design-philosophy.md` 等非版本型文档；仅当能力描述因本版修复失实时按需改。

---

## 五、全局验收标准（版本级）

1. **T1 并发退出**：JSON 模式并发冲突 stdout 恰 1 个 envelope、`process.exit` 未调用、exit 2；非 JSON 模式 stderr 文案与 `process.exit(2)` 逐字不变；无调用点落入通用错误分支。
2. **T2 help 文案**：zh/en help 均为「缺省 full（零裁剪）」；`flow advance` 缺省行为不变。
3. **T3 锁超时 E2E**：gate 语义单测全绿；E2E 稳定断言 `INTERNAL_ERROR/internal/3`；生产默认值零改动。
4. **T4 req 单点**：`req show` / `req set` 行为零变化；`req.ts` 内联过滤归零；`req split` 零 diff。
5. **T5 版本**：A 类 10 处全部 1.2.3；`--version` / `--version --json` = 1.2.3；B 类双生成物 build ×2 幂等；C 类文档同步；§14.2 已统一。
6. **T6 门禁**：`npm test` 0 failed / 0 skipped；`npx tsc --noEmit` 0；`openfeel lint i18n` 通过；`openfeel lint kb` 0 过期；`npm run build` ×2；`git status --porcelain src/` 空。
7. **零回归**：33 个成功 JSON 出口 / 34 个注册选项键集键序不变；退出码 0/1/2 语义不变；`req show` / `req set` / `flow advance` 人类输出不变；存量 `flow.json` 零迁移零注入。
8. **外部项**：OUT-1 已登记并交接 Feel；本仓不声称 DSH 侧完成。

---

## 六、风险与回滚

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| R-1 | `handleConcurrentConflict` 返回类型改为 `void` 后，某调用点漏加 `return` → JSON 模式继续执行通用错误分支（二次输出 / exit 1） | **高** | 全量枚举 **10 个调用点**（直接 8：`cli/index.ts:225`、`flow.ts:768/829/882/2041/2563`、`req.ts:93`、`errors.ts:163`；`handleAddStageError` 调用方 2：`flow.ts:694`、`stage.ts:679`）；handler 后显式 `return`；新增 2 个 fallthrough 回归用例；静态 grep 复核 |
| R-2 | 测试钩子泄漏为生产行为或命名不当 | 中 | `OPENFEEL_TEST_MODE=1` 门控 + `OPENFEEL_TEST_*` 命名 + 非公开契约声明 + 单测覆盖 gate off / 非法值 / 显式 options 优先 |
| R-3 | 版本收口遗漏载体或生成物漂移 | 中 | A 类 file:line 清单 + 内容特征扫描兜底 + D 类白名单 + build ×2 + `--porcelain` 断言 |
| R-4 | REV-97-006 标签「req split」误导执行者 | 中 | 计划显式写明实测落点为 `req set --workflow-mode`；`req split` 零 diff 纳入验收 |
| R-5 | E2E 计时抖动 | 低 | timeout 200ms（留足余量）+ stale 60000ms（等待窗口内不回收）+ 预置 fresh 锁；失败信息含命令/版本/环境三要素 |
| R-6 | 历史节旧文案被误判为残留 | 低 | D 类白名单显式登记；「残留 = 0」只对活文档口径，不对历史节 |

**回滚**：各任务均为独立小提交，可 `git revert`；T1 回滚即恢复 `process.exit(2)`；T2 为文案；T3 删除钩子与测试；T4 为纯等价重构；T5 为文本/版本载体。**无数据格式破坏**（不触碰 `flow.json` 结构 / phase 枚举 / JSON 契约键集）。

---

## 七、承接 REV 与遗留处置

| 来源 | 条目 | 处置 | 落点 |
|------|------|------|------|
| REV-95-009 | `handleConcurrentConflict` JSON 分支仍 `process.exit(2)` | **本阶段关闭**（T1） | `shared/errors.ts` + 调用点 + 测试 |
| REV-98-006① | 锁等待超时 E2E 不可稳定触发 | **本阶段关闭**（T3） | `file-lock.ts` 测试钩子 + E2E |
| REV-98-006② | DSH `errorFromResult` 未消费 envelope；`PHASE_AGENT` 镜像未退役 | **转 OUT-1 外部项**（Feel 单独委派） | 不在本仓 stage 文件清单 |
| REV-98-003 第 6 项 | `--review-tier` 源码 help 文案陈旧 | **本阶段关闭**（T2） | `flow.ts` + i18n zh/en + 文档注记 |
| REV-97-006 | `req show` / 「req split」内联过滤未单点化 | **本阶段关闭**（T4）；实测第二处为 `req set --workflow-mode`，`req split` 零改动 | `req.ts` + 测试 |
| REV-95-008 | 锁超时归类 `INTERNAL_ERROR/internal/3` | 已由 stage-97 关闭（契约 §14.1 + 单元级 ⑩）；**本阶段补 E2E 证据** | `docs/json-contract.md` §14.1 |
| 其他 v1.2.2 REV | REV-95-001~007 / 96 / 97 其余 / 98-001~005 | 已 closed，无动作 | — |

---

## 八、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-17 | openfeel-planner | 初稿：单阶段 fast 计划；4 项仓库内转出项 + 版本 1.2.3 收口 + OUT-1 外部项；T1~T6 任务表；A/B/C/D/E 清单；R-1~R-6。**只写计划文档，未改源码、未直写 flow.json、未推进 phase。** |
| 2026-10-17 | openfeel-archiver | 归档回填：stage-99 归档完成（T1~T6 全部达成）；M53 = done；版本 1.2.3 收口成立；OUT-1 外部项待 Feel 处理。 |

## 九、执行进度（归档回填）

| 里程碑 | 阶段 | 状态 | 归档 | 备注 |
|--------|:--:|:--:|------|------|
| M53 v1.2.2 转出项收口与 v1.2.3 收官 | `v1.2.3-stage-99` | **done（已归档）** | [archive-v1.2.3-stage-99.md](../../../log/archive-v1.2.3-stage-99.md) | T1~T6 全达成：四项转出项闭环（REV-95-009 / 98-003⑥ / 98-006① / 97-006）+ 版本 1.2.3 全链路 + 门禁 75 文件 / 1911 用例全绿；审查 passed（REV-99-001~003 全 closed）；OUT-1（DSH）外部项待 Feel 处理 |

**版本级收口声明**：v1.2.3（补丁版本）单阶段收口完成；A 类残留 0、`--version` = 1.2.3、33 成功出口 / 34 注册选项与退出码 0/1/2 语义均不变。阶段 phase 由 Feel 经 CLI 推进至 `done`。
