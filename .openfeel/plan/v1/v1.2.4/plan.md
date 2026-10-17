# OpenFeel v1.2.4 — DSH ACTION-GUIDE A1~A5 收口（补丁版本）

> **版本**：v1.2.4（Patch） | **创建日期**：2026-10-17 | **Planner**：openfeel-planner
> **规模判定**：**小规模**（单阶段；1 项数据安全修复 + 5 组只读 JSON 扩展 + 版本收口；无架构变更、无新增依赖、无 phase 枚举变更）→ **fast 快线**；仍必经 openfeel-reviewer **单轮计划审查**。
> **定位**：只做 `dsh/ACTION-GUIDE.md` 的 **A1~A5** 与版本收尾；**范围锁定，不扩项**；**不修改 `dsh/` 下任何文件**。
> **计划审查**：已通过（REV-100-001 low 修订已回填）；阶段 phase 由 Feel 经 CLI 推进。
> **阶段计划**：`.openfeel/plan/v1/stage-100/plan.md`。
> **路线图**：`.openfeel/roadmap/v1.2.4.md`。
> **依赖声明**：`.openfeel/plan/v1/v1.2.4/deps.yaml`。
> **系列**：`v1`；`stageDir` 映射 `stage-100`；阶段 ID `v1.2.4-stage-100`（承接 v1.2.3-stage-99）。
> **基线**（实测，HEAD `62f09d8` + 当前工作区）：CLI **1.2.3**；flow.json `revision 1289` / 注册阶段 **9**（v1.2.0-stage-78~85 全 done + `v1.2.4-stage-100` plan_pending）/ `archived_versions` **12** / `requirements` **1**（REQ-001 done）/ `reviews` **0** / `log` **361**；测试 **75 文件 / 1911 用例**；`lint i18n` **983**；`lint kb` **0 过期 / 643 引用**；agent **10** / skills **22**；本仓 `config.yaml defaults.workflow_mode: full`；stage-100 `status.md` 覆盖为 **fast**（生效模式 fast）；成功 JSON 出口 **33** / 注册 `--json` 选项 **34**；`--version` = **1.2.3**。

---

## 一、范围（锁定）

### 1.1 必做（A1~A5 + 版本收口）

| # | 事项 | 优先级 | 来源 | 落点 |
|:-:|------|:--:|------|------|
| **A1** | `archive <stage>` 覆盖保护 + `--force` | **P1** | `dsh/ACTION-GUIDE.md` §3 | T1 |
| **A2** | `plan stage list --json` | **P1** | §4 | T2 |
| **A3** | `model list|get --json` | **P1** | §5 | T3 |
| **A4** | `flow retry` / `lint kb|i18n` / `roadmap show --json` | P2 | §6 | T4 |
| **A5** | `config get --all --json` | P2 | §7 | T5 |
| **VER** | 版本 1.2.4 全链路收口 | — | v1.2.3 惯例 | T6 |
| **GATE** | 门禁与验收 | — | — | T7 |

### 1.2 不做（边界红线）

- **不修改 `dsh/` 下任何文件**；不把 `dsh/` 纳入 lint / build / 发布扫描（保持 `vitest.config.ts` / `tsconfig.json` / `build.js` / `package.json.files` 现状）。
- **不在 CLI 之外镜像 Agent 编制**；`flow next --json.responsibleAgent` 仍是唯一权威。
- **不为 JSON 分支复制第二套业务判定**：新增出口复用既有 core 单点与 `failCli` / `emitJson` / `isJsonMode`；不做平行实现。
- 不新增功能 / 命令组 / 配置键 / 第三方依赖；不改 phase 枚举 15 项与转移表。
- 不改既有 33 个成功出口的字段键集、键序与类型；不改既有命令的人类输出。
- 不直写 `flow.json`；不推进 phase；不 commit / push；不 `npm publish`。
- 不回溯修改历史文档节（README v1.2.3 节、CHANGELOG `[1.2.3]`、manual 历史行等）；由 v1.2.4 增量 supersede。

---

## 二、关键裁定

| # | 议题 | 裁定 | 理由 |
|:-:|------|------|------|
| D-1 | 版本号 | **1.2.4**（三段补丁号） | 任务已定；semver 合法 |
| D-2 | 工作流模式 | **fast** 单阶段 | 任务已定；fast 表仍含 `plan_pending → plan_review`，计划审查不可跳过 |
| D-3 | A1 方案 | **拒绝覆盖 + `--force`**；`code=ARCHIVE_EXISTS`、`kind=refusal`、`exit 1`、**零写盘** | ACTION-GUIDE 推荐序第 1 项；最小改动、最安全；不改变 `archivePath` 语义 |
| D-4 | A1 零写盘落点 | 在 `archiveStage` 解析到阶段后、**任何写盘之前**检查目标文件；命中且无 `force` → 抛 `ArchiveExistsError` | 保证归档文件**内容哈希（SHA-256）**、flow.json revision、`log[]` 长度、KB 条目数不变；`mtime` 仅辅助（并发/时间粒度下不稳定，不作主断言） |
| D-5 | A1 保护范围 | **归档文件级**（非阶段级）：保护本次写入目标 `archive-<输入原值>.md`；`archive v1.2.0-stage-78` → `archive-v1.2.0-stage-78.md`，`archive stage-78` → `archive-stage-78.md`，互不触发 | 保持既有 `archivePath` 行为零改动；跨别名保护不在本版范围，登记为已知边界 |
| D-6 | A1 `--force` 语义 | 仅绕过归档文件覆盖保护；知识提取、flow 日志、`mgr.save()` 语义不变 | 不扩项；重复归档可能重复写 KB 条目，去重仍由 `knowledge dedup` 负责 |
| D-7 | A2 数据源 | JSON 枚举 **flow.json 注册阶段**（声明序），字段取 flow.json + `resolveStageWorkflowMode` 单点；人类输出保持**计划目录清单** | DSH 用途是「选择下一个要推进的阶段」，必须有 phase/deps/ops；目录清单无法提供。两者是不同视图，非同一输出双实现 |
| D-8 | A3 派生 | `provider`/`model` 按生效值首个 `/` 切分；`source` = 生效层（**default > project > global**，同 REV-1606）；`scope` 回显 `--scope`，未指定为 `null` | 复用 `getAgentModel` / `listAgentModels` 的既有解析链，不新建来源判定 |
| D-9 | A4 lint | 两子命令共用 `{schemaVersion,target,ok,issues:[{path,message}]}`；`ok:false` 仍为成功文档 + **exit 1**（既有门禁语义）；人类输出逐字不变 | 与 `flow health` 的「成功文档 + 非 0」先例一致；结构化 issue 与人类行同源 |
| D-10 | A4 roadmap | 里程碑按 **表头驱动**解析（兼容 3 列/4 列历史格式）；元素键固定 `title,theme,stage,deliverable`；不传版本 → `version:null,milestones:[]` | 历史 roadmap 表头存在 3 列/4 列两种；固定元素键便于 DSH 消费；无版本时无单一文档可解析 |
| D-11 | A5 形态 | `{schemaVersion,scope:"project",defaults:{execution_mode,auto_advance,merge_mode,workflow_mode}}`，值取 `resolveConfigDefaults` | 项目配置语义就是 `defaults` 块；与全局 profile 的 `values` 键域不同，避免消费端误判同形；四键恒在、缺省回退 `DEFAULT_CONFIG` |
| D-12 | 计数 | **40 成功出口 / 41 注册 `--json` 选项** | 逐命令面核验：`lint kb` 与 `lint i18n` 是两个独立子命令，各需注册 `--json`；冻结计数测试按命令树遍历。详见 §三 |
| D-13 | 版本收口时点 | T6 为最终任务组；版本写入后零业务代码改动；T7 只跑门禁与实测登记 | 承 v1.2.2 / v1.2.3 收口期冻结纪律 |
| D-14 | 发布 | 完成后由 Feel commit/push；本计划不代 push | 任务已定 |

---

## 三、计数核验（任务预估 39/40 → 锁定 40/41）

### 3.1 现状（实测）

- 源码 `option('--json'` 去重计数 = **34**；冻结计数测试遍历命令树，`withJson.length = 34`，其中 `flow advance` 为错误模式开关，**成功出口 = 33**。
- 口径：`flow advance --json` 仅失败 envelope，不计成功出口；`--version --json` 单列，不计 34/33。

### 3.2 新增逐项核验

| # | 新命令面 | 新增 `--json` 注册 | 新增成功出口 | 说明 |
|:-:|----------|:--:|:--:|------|
| 34 | `plan stage list` | +1 | +1 | 既有子命令，新增选项 |
| 35 | `model list` | +1 | +1 | 既有子命令，新增选项 |
| 36 | `model get <agent>` | +1 | +1 | 既有子命令，新增选项 |
| 37 | `flow retry --op <id>` | +1 | +1 | 既有子命令，新增选项 |
| 38 | `lint i18n` | +1 | +1 | 独立 Commander 子命令 |
| 39 | `lint kb` | +1 | +1 | 独立 Commander 子命令 |
| 40 | `roadmap show [version]` | +1 | +1 | 既有子命令，新增选项 |
| — | `archive <stage> --force` | 0 | 0 | 既有出口 #33 的选项扩展 |
| — | `config get --all` | 0 | 0 | 既有出口 #27 的选项扩展 |
| **合计** | | **+7 → 41** | **+7 → 40** | |

### 3.3 锁定结论

- **成功 JSON 出口：40**（#1~#40；新增 #34~#40）。
- **注册 `--json` 选项：41**（40 成功出口 + `flow advance` 错误模式开关）。
- **较任务预估 +1**：任务把 `lint` 计为 1 项；实际 `lint kb` / `lint i18n` 是两个独立子命令，冻结计数测试按命令树遍历，二者各需注册。若强行按「lint 命令族」计 1，会破坏既有不变量「注册选项数 − 1 = 成功出口数」；本计划采用可执行口径 **40/41**。
- **三处对齐**：源码命令树 / `docs/json-contract.md` §5+§7 / `test/cli/json-contract.test.ts` #1~#40；`test/commands/knowledge.test.ts` 计数用例同步改为 **41/40**。
- `test/cli/error-envelope.test.ts` 错误码表由 **12 行 → 13 行**（新增 `ARCHIVE_EXISTS`）。
- **契约 §7 分解**：flow 16（+`retry`）+ req 5 + instructions 1 + setup 1 + stage 1 + knowledge 4 + config 2 + view 1 + plan 2（+`stage list`）+ project 1 + archive 1 + model 2 + lint 2 + roadmap 1 = **40**；注册 **41**（+`flow advance`）。

---

## 四、阶段与任务表

| 阶段 | 名称 | 依赖 | 模式 | 任务 |
|------|------|------|:--:|------|
| `v1.2.4-stage-100` | DSH A1~A5 收口与版本 1.2.4 收口 | 无（上游 stage-99 done/archived） | fast | T1~T7 |

| 任务 | 主题 | 主要文件 | 验收要点 |
|:--:|------|----------|----------|
| **T1** | **A1 归档覆盖保护 + `--force`** | `src/core/archive/merge.ts`；`src/commands/archive.ts`；`src/core/errors.ts`；`src/core/i18n-data/zh-CN.ts` / `en.ts`；`test/commands/archive.test.ts`；`test/core/archive/merge.test.ts`；`test/cli/error-envelope.test.ts`；`test/cli/json-contract.test.ts` #33；`docs/json-contract.md` §3/#33 | 已有归档 + 无 `--force` → exit 1 + `ARCHIVE_EXISTS`/refusal（JSON 单文档；人类 stderr）；归档文件**内容哈希（SHA-256）**、flow.json revision、`log[]` 长度、KB 条目数 **零变化**（mtime 仅辅助；并发/时间粒度下稳定）；`--force` → exit 0 + #33 六键；未归档阶段回归；错误码表 13 行 |
| **T2** | **A2 `plan stage list --json`** | `src/commands/plan.ts`；i18n help 键；`test/commands/plan.test.ts`；`test/cli/json-contract.test.ts` #34；契约 §5/#34 | 单文档 `{schemaVersion,stages,count}`；`stages[]` 七键 `id,phase,status,deps,workflowMode,opsTotal,opsDone`；flow.json 注册序；空态 `[]/0` + exit 0；`workflowMode` 经 `resolveStageWorkflowMode` 单点；人类输出逐字不变 |
| **T3** | **A3 `model list|get --json`** | `src/commands/model.ts`；i18n help 键；`test/commands/model.test.ts`；`test/cli/json-contract.test.ts` #35/#36；契约 §5/#35/#36 | list：`schemaVersion,scope,agents`；元素 `agent,provider,model,source`；get：`schemaVersion,scope,agent,provider,model,source`；首个 `/` 切分；`source` 链 default > project > global；无效 scope → `INVALID_ARGUMENT`；人类输出不变 |
| **T4** | **A4 三命令面 JSON** | `src/commands/flow.ts`（retry）；`src/commands/lint.ts`；`src/core/plan/roadmap.ts` + `src/commands/roadmap.ts`；i18n help 键；`test/commands/flow.test.ts` / `lint.test.ts` / `roadmap.test.ts`；`test/cli/json-contract.test.ts` #37~#39（lint 为 #38/#39） | retry：`op,attempts,maxAttempts,exhausted,state`；lint：`target,ok,issues[{path,message}]`，`ok:false` + exit 1；roadmap：`version,milestones[{title,theme,stage,deliverable}]`，3/4 列表头兼容，无版本 `null/[]`；三者人类输出逐字不变 |
| **T5** | **A5 `config get --all --json`** | `src/commands/config.ts`；i18n help 键；`test/commands/config.test.ts`；`test/cli/json-contract.test.ts` #27 扩展；契约 §5/#27 | 项目模式 `--all --json` → `{schemaVersion,scope:"project",defaults}`；四键固定序；不再报 `key-required`；`--all`+key / `--global --all` → `INVALID_ARGUMENT`；人类 `--all` 逐行；既有 get 输出不变 |
| **T6** | **版本 1.2.4 收口** | A/B/C/D/E 载体（见 §六）；CHANGELOG；README×3；GETTING_STARTED；commands；json-contract；manual；skill；supplement | A 类 10 处 = 1.2.4；build ×2 幂等；`--version` = 1.2.4；文档计数 40/41；CHANGELOG `[1.2.4]`；supplement 增量到 v1.2.4；历史节保留 |
| **T7** | **门禁与验收** | 全仓 | `npm test` 0 failed / 0 skipped；`tsc` 0；`lint i18n`；`lint kb` 0 过期；build ×2 幂等；`--version` = 1.2.4；契约 #1~#40；人类输出零回归；`dsh/` 零 diff；无新增依赖；phase 枚举不变 |

### 4.1 阶段内执行顺序

```text
T1（A1）──┐
T2（A2）──┤
T3（A3）──┼──▶ T6（版本收口，最终任务组）──▶ T7（门禁）
T4（A4）──┤
T5（A5）──┘
说明：T1~T5 文件域互不重叠，可并行；建议单 executor 顺序执行（T1 优先，数据安全）。
T6 必须在全部代码/契约增量之后；T7 必须在 T6 之后。
```

### 4.2 契约文档维护纪律

- 每个任务**同批更新**其对应的 `docs/json-contract.md` 段落（§3 / §5 / §6 / §15），不把契约拖到 T6。
- T6 只做**全局计数、版本号、跨载体同步**（§7、标题、README / manual / skill / supplement）。
- 契约测试 `test/cli/json-contract.test.ts` 与源码同批新增用例，禁止事后补。
- `test/cli/json-contract.test.ts` 当前只注册了 flow/req/instructions/setup/stage/knowledge/config/view/plan/project/archive；新增 #35/#36（model）与 #38/#39/#40（lint/roadmap）用例前，须补 `registerModelCommand` / `registerLintCommand` / `registerRoadmapCommand`（`src/cli/index.ts` 已全局注册，但契约测试使用独立 `program`）。

---

## 五、契约增量规格（精确形态）

### 5.1 A1：`archive <stage> [--json] [--force]`

- **判定顺序**：`FlowManager` 只读加载 → 阶段解析（短名归一 + 双键回退）→ **目标文件存在性检查** → 计算摘要 → 写归档 → `appendLog` → `save()` → KB 同步。
- **拒绝条件**：`join(projectPath, '.openfeel', 'log', 'archive-' + stageName + '.md')` 已存在且未传 `force`。
- **别名双示例（保护为归档文件级，非阶段级）**：`archive v1.2.0-stage-78` → `.openfeel/log/archive-v1.2.0-stage-78.md`；`archive stage-78` → `.openfeel/log/archive-stage-78.md`；两者不同文件、互不触发覆盖保护。
- **零写盘保证**：检查点位于 `mkdirSync(logDir)` / `atomicWriteFileSync` / `appendLog` / `save()` / `initKnowledgeBase` / `addKnowledgeEntry` 之前；`FlowManager` 构造与阶段解析均为只读。**主判据** = 归档文件内容哈希（SHA-256）+ flow.json revision + `log[]` 长度 + KB 条目数；`mtime` 仅辅助，测试须在**并发/时间粒度下稳定**。
- **正控**：`--force` 必须真实覆盖（内容哈希变化 / revision 递增），防止「什么都没写」的假绿。
- **错误出口**：`ARCHIVE_EXISTS` / `kind=refusal` / `exit 1`；JSON `detail={stage,archivePath}`；人类 stderr 单行 + exit 1。
- **成功出口 #33 不变**：`{schemaVersion,stage,archivePath,opsCount,reviewsCount,knowledgeExtracts}` 六键；`--force` 不新增返回键。
- **`knowledgeExtracts` 语义**：保持不变；`--force` 重复归档可能重复写入 KB 条目，去重由既有 `knowledge dedup` 承担（已知边界）。
- **错误码表**：`src/core/errors.ts` 增 `ARCHIVE_EXISTS`（refusal/1），**追加在 `ARCHIVE_FAILED` 之后**（第 13 行），12 行 → **13 行**；契约 §3 与 `test/cli/error-envelope.test.ts` 期望数组同步。
- **人类模式**：同样拒绝覆盖；新增本地化文案 `archive.errorArchiveExistsTmpl`（zh/en）。

### 5.2 A2：`plan stage list --json`

```json
{
  "schemaVersion": 1,
  "stages": [
    { "id": "v1.2.4-stage-100", "phase": "plan_pending", "status": "planned",
      "deps": [], "workflowMode": "fast", "opsTotal": 0, "opsDone": 0 }
  ],
  "count": 1
}
```

- **数据源**：`FlowManager.getData().stages`（flow.json 注册阶段，声明序）；不枚举计划目录。
- **字段**：
  - `id` = flow.json stages 键；
  - `phase` / `status` = `stage.phase ?? null` / `stage.status ?? null`（键恒在，缺省 `null`）；
  - `deps` = `Array.isArray(stage.deps) ? stage.deps : []`；
  - `workflowMode` = `mgr.resolveStageWorkflowMode(id).value`（单点；不直接读 `stage.workflow_mode` 冗余）；
  - `opsTotal` = `Object.keys(stage.ops ?? {}).length`；
  - `opsDone` = `Object.values(stage.ops ?? {}).filter(op => op.state === 'done').length`；
  - `count` = `stages.length`。
- **空态 / 未初始化**：`{schemaVersion:1, stages:[], count:0}`，exit 0（镜像人类「无阶段」）。
- **人类输出**：保持 `listStages()` 目录清单逐字不变；JSON 与人类是两种视图（文档显式登记）。

### 5.3 A3：`model list|get --json`

```json
// model list
{ "schemaVersion": 1, "scope": "project",
  "agents": [ { "agent": "openfeel-executor", "provider": "deepseek",
                "model": "deepseek-flash", "source": "project" } ] }

// model get <agent>
{ "schemaVersion": 1, "scope": null, "agent": "openfeel-executor",
  "provider": "deepseek", "model": "deepseek-flash", "source": "default" }
```

- **数据源**：`listAgentModels(scope)` / `getAgentModel(agent, scope)`；不新增模型解析实现。
- **`scope`**：回显 `--scope`；未指定为 `null`（生效值模式）。
- **值**：指定 scope 时取 `byScope[scope]`；否则取 `effective`。
- **切分**：有效值首个 `/` 前为 `provider`、后为 `model`；无 `/` 时 `provider:null`、`model` 为原值；无有效值时三者均 `null`。
- **`source`**：指定 scope 且值非空 → 该 scope；未指定 → 解析链 **default > project > global** 中首个非空层；无值 → `null`。
- **`agent`**：归一化后的 agent id（`getAgentModel` 返回值）。
- **失败**：非法 scope → `INVALID_ARGUMENT`/refusal；人类输出逐字不变。

### 5.4 A4：三命令面

#### 5.4.1 `flow retry --op <id> --json`

```json
{ "schemaVersion": 1, "op": "v1.2.4-stage-100.op-001",
  "attempts": 1, "maxAttempts": 3, "exhausted": false, "state": "failed" }
```

- `attempts` = `mgr.getRetryCount(op)`（既有语义）；`maxAttempts` = `op.max_attempts`；`exhausted` = `attempts >= maxAttempts`；`state` = `op.state`。
- 只读；不写盘。
- 失败：未初始化 → `NO_INIT`；阶段不存在 → `STAGE_NOT_FOUND`；非法 opId / op 不存在 → `INVALID_ARGUMENT`（detail 含 reason）；人类输出逐字不变。

#### 5.4.2 `lint i18n|kb --json`

```json
{ "schemaVersion": 1, "target": "kb", "ok": false,
  "issues": [ { "path": ".openfeel/kb/patterns.md", "message": "……" } ] }
```

- `target` ∈ `i18n` / `kb`；`ok = issues.length === 0`。
- `issues[].path`：i18n = `src/core/i18n-data/zh-CN.ts` 或 `en.ts`；kb = 源 KB 文件的项目根相对路径 `.openfeel/kb/<file>`。
- `issues[].message`：复用既有本地化问题文案（i18n 键 / 过期引用 + 行号）。
- **退出码**：`ok:false` 时仍输出成功文档，并保持既有 `process.exitCode = 1` 门禁语义；`ok:true` exit 0。
- **单一业务判定**：重构 `runLintI18n` / `runLintKb` 为「收集结构化 issues + 人类行打印」同一来源；人类输出逐字不变。
- `lint kb` 无 KB 目录 → `ok:true, issues:[]`，exit 0（镜像人类「无目录」）。

#### 5.4.3 `roadmap show [version] --json`

```json
{ "schemaVersion": 1, "version": "1.2.4",
  "milestones": [ { "title": "M54 …", "theme": "收口",
                    "stage": "stage-100", "deliverable": "……" } ] }
```

- `version` = 归一化后的版本号（去前导 `v`）；不传版本 → `version:null`、`milestones:[]`。
- `milestones[]` 从 `## 里程碑` 小节表格解析；元素键固定 `title,theme,stage,deliverable`；表头驱动（`里程碑/主题/阶段/交付物`），缺列 → `null`；3 列历史格式（无主题）→ `theme:null`。
- 无里程碑小节 / 占位文案 → `milestones:[]`（不抛错）。
- 版本不存在 → `INVALID_ARGUMENT`/refusal（JSON）；人类输出逐字不变（stderr + exitCode 1）。
- 解析器为 core 只读纯函数；`showRoadmap` 人类字符串输出不变。

### 5.5 A5：`config get --all --json`

```json
{ "schemaVersion": 1, "scope": "project",
  "defaults": { "execution_mode": "manual", "auto_advance": "enabled",
                "merge_mode": "manual", "workflow_mode": "full" } }
```

- **仅项目模式**：`--all` 与 `--global` 组合 → `INVALID_ARGUMENT`（detail reason `all-global-conflict`）；`--all` 与位置 key 组合 → `INVALID_ARGUMENT`（reason `all-with-key`）。
- **值来源**：`resolveConfigDefaults(process.cwd())` 四键（缺失/非法逐键回退 `DEFAULT_CONFIG`）；键序固定 `execution_mode,auto_advance,merge_mode,workflow_mode`。
- **不再 `key-required`**：项目模式无 key 且带 `--all` → 成功文档 exit 0。
- **人类 `--all`**：四行 `key: value`（复用 `config.get.result` 模板）；不带 `--all` 的既有输出逐字不变。
- **形态理由**：项目配置语义是 `defaults` 块；全局 `values` 是 profile 六键，键域不同；用 `defaults` 避免消费端误判同形。

---

## 六、版本收口清单（1.2.3 → 1.2.4，A/B/C/D/E）

> 依据 `kb/patterns.md #版本号全链路收口清单模式`；以**内容特征**判定，不以行号为准；B 类为双生成物。

### A 类：手工载体（6 载体 / 8 文件 / 10 处）

| # | 文件 | 位置 | 现值 → 目标 |
|:-:|------|------|-------------|
| A1 | `package.json` | `:3` | `1.2.3` → `1.2.4` |
| A2 | `package-lock.json` | root `:3` / `:9` | `1.2.3` → `1.2.4`（**禁 `npm install` 重生成**；`queue-microtask` 自身 `1.2.3` 禁改） |
| A3 | `.openfeel/config.yaml` | `:7` | `1.2.3` → `1.2.4`（**单行 edit，禁整文件重写**） |
| A4 | `src/core/config.ts` | `:436` / `:493` | `1.2.3` → `1.2.4` |
| A5 | `src/core/templates-data/agents-md/zh-CN.md` / `en.md` | `:135` ×2 | `v1.2.3` → `v1.2.4` |
| A6 | `src/core/templates-data/claude/constraint/zh-CN.md` / `en.md` | `:138` ×2 | `v1.2.3` → `v1.2.4` |

### B 类：生成段（双份，禁手改）

- `src/core/template-loader.ts` + `src/core/update.ts`，由 `npm run build` 重生成；**禁手改**；`git status --porcelain src/` 干净断言（除本版明确源码改动）。

### C 类：传播载体

| 载体 | 处置 |
|------|------|
| `CHANGELOG.md` | 追加 `## [1.2.4] - 2026-10-17`：Added（A2~A5 新出口与扩展）+ Fixed（A1 归档覆盖保护）+ Changed（`ARCHIVE_EXISTS` 错误码 / 计数 40/41 / 版本 1.2.4）+ Compatibility（0/1/2/3 语义、既有出口、人类输出零破坏） |
| `README.md` / `README.zh-CN.md` / `README.en.md` | 最新版本横幅 + v1.2.4 能力节；测试计数按 T7 实测更新；v1.2.3 历史节保留 |
| `docs/GETTING_STARTED.md` | 快照 → v1.2.4；补丁速览；计数 40/41 |
| `docs/commands.md` | 快照 → v1.2.4；新增 A1~A5 命令/选项说明；错误码表 12 → 13 行；出口一览 33/34 → 40/41 |
| `docs/json-contract.md` | 标题/口径 → v1.2.4；§3 增 `ARCHIVE_EXISTS`（13 行）；§5 增 #34~#40、更新 #33/#27；§6 有意增量登记；§7 计数 40/41；新增 §15 v1.2.4 细则 |
| `.openfeel/manual/**` | `index.md`（json-contract / cli-usage 摘要计数）、`cli/commands.md`（快照 + 新命令 + 13 行 + 40/41）、`core/json-contract.md`（13 行 + 40/41 + v1.2.4 历史行）、`cli/model.md`（JSON 形态）、`core/config.md`（`--all` 形态）按模块最小补正 |
| `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md` | description / 快照行 → v1.2.4；新增 A1~A5 能力条目；计数 40/41；历史节保留 |
| `docs/dsh-cli-requirements-supplement-1.2.3.md` | **原地增量**到 v1.2.4 口径：状态/基线/最终契约规模 40/41；交付表增 v1.2.4-stage-100 行；新增 A1~A5 契约段；§7 门禁计数；§8 已知边界（归档别名 / lint exit 1 / `--all` 项目限定）；文件名保留以维持链接稳定 |

### D 类：禁改 / 白名单

- `dsh/**`（代码归属 DSH 侧，**零 diff**）；依赖自身版本（`queue-microtask 1.2.3` 等）；历史阶段批注、`test/**` 注释、`docs/phase-*/**`、历史 REV / 计划 / 归档文件、`kb/**` 历史条目、`.openfeel/dev/**` 私域记忆。
- 历史文档节中的旧口径（README v1.2.3 节、CHANGELOG `[1.2.3]`、manual 历史行、SKILL v1.2.3 节）**不回溯改**；由 v1.2.4 增量 supersede。
- 「残留 = 0」白名单化：D 类命中逐条列出 file:line 与理由，禁广谱 sed。

### E 类：无载体

- `docs/design-philosophy.md` 等非版本型文档；仅当能力描述因本版扩展失实时按需改。

---

## 七、全局验收标准（版本级）

1. **A1 数据安全**：已有归档 + 无 `--force` → JSON 单 envelope `ARCHIVE_EXISTS`/refusal/1（人类 stderr + exit 1）；归档文件**内容哈希（SHA-256）**、flow.json revision、`log[]` 长度、KB 条目数 **零变化**（mtime 仅辅助；测试在并发/时间粒度下稳定）；`--force` → exit 0 + #33 六键；未归档阶段行为不变；错误码表 13 行。
2. **A2**：`plan stage list --json` exit 0、单文档、`stages[]` 七键、flow.json 注册序、空态 `[]/0`；人类输出逐字不变。
3. **A3**：`model list|get --json` exit 0、单文档、键序与派生正确、三层来源可区分；人类输出逐字不变。
4. **A4**：`flow retry` / `lint kb|i18n` / `roadmap show --json` 均 exit 0（lint 有问题时成功文档 + exit 1）、单文档、形态符合 §5.4；人类输出逐字不变。
5. **A5**：`config get --all --json` exit 0、`defaults` 四键固定序、不再 `key-required`；冲突组合拒绝；人类仅 `--all` 新输出。
6. **版本**：A 类 10 处 = 1.2.4；`--version` / `--version --json` = 1.2.4；B 类 build ×2 幂等；C 类文档同步；CHANGELOG `[1.2.4]`；supplement 增量完成。
7. **计数**：40 成功出口 / 41 注册选项；源码命令树 / 契约 §5+§7 / 冻结测试 #1~#40 三处对齐；`knowledge.test.ts` 计数用例 = 41/40。
8. **门禁**：`npm test` 0 failed / 0 skipped（登记实测文件/用例数）；`npx tsc --noEmit` 0；`lint i18n` 通过（登记键数）；`lint kb` 0 过期；build ×2；人类输出零回归。
9. **边界**：`git diff -- dsh/` 空；`vitest.config.ts` / `tsconfig.json` / `build.js` / `package.json.files` 未纳入 `dsh/`；无新增第三方依赖；phase 枚举 15 项 / 转移表不变；不直写 `flow.json`。
10. **外部项**：OUT-1（DSH 适配器消费 v1.2.4 新出口）已登记并交接 Feel/DSH；本仓不声称 DSH 侧完成。

---

## 八、风险与回滚

| # | 风险 | 影响 | 缓解 |
|:-:|------|------|------|
| R-1 | A1 检查点晚于任一写盘 → 零写盘失败 | **高** | 检查置于阶段解析后、`mkdirSync`/写文件/`appendLog`/`save`/KB 之前；主判据 = 内容哈希 + revision + `log[]` 长度 + KB 条目数（mtime 辅助）；正控（`--force` 内容哈希变化 / revision 递增）防假绿 |
| R-2 | A1 短名/全名别名导致保护绕过 | 中 | 保护为归档文件级（非阶段级）；契约 §15 登记双示例与已知边界；测试覆盖同输入重跑；跨别名保护不在本版范围 |
| R-3 | A2 JSON 与人类视图不一致引发消费端误解 | 中 | 契约显式写明「JSON = 注册阶段调度视图 / 人类 = 计划目录清单」；`id/phase` 非空；空态明确 |
| R-4 | A3 `source` 推导与既有 `effective` 链不一致 | 中 | 复用 `getAgentModel` 的 `byScope` 与 REV-1606 链；三层来源单测；不新建解析逻辑 |
| R-5 | lint 重构改变人类输出 | 中 | 结构化 issues 与人类行同源；两 target 的 golden 内联快照；exit 1 语义保持 |
| R-6 | roadmap 里程碑表格式差异导致解析漏/错 | 中 | 表头驱动 + 3/4 列用例 + 无小节/占位空态；解析失败回落 `[]` |
| R-7 | 计数口径漂移（39/40 vs 40/41） | **高** | §三逐项核验；更新 `knowledge.test.ts` 计数用例；源码/契约/测试三处对齐；文档统一 40/41 |
| R-8 | 版本收口遗漏载体或生成物漂移 | 中 | A 类 file:line + 内容扫描 + D 类白名单 + build ×2 + `--porcelain` 断言 |
| R-9 | 误改 `dsh/` 或将其纳入扫描 | 中 | 边界 diff 检查；不触碰 `dsh/`；`package.json.files` / tsconfig / vitest / build.js 零改动 |

**回滚**：各任务独立，可 `git revert`；A1 回滚恢复覆盖写（不推荐）；A2~A5 删除 JSON 分支与选项；T6 回退版本/文档。**无数据格式破坏**（不触碰 flow.json 结构 / phase 枚举 / 既有 JSON 契约键集）。

---

## 九、承接与外部项

| 来源 | 条目 | 处置 | 落点 |
|------|------|------|------|
| `dsh/ACTION-GUIDE.md` §3 | A1 归档覆盖保护 | **本阶段关闭**（T1） | `core/archive/merge.ts` + `commands/archive.ts` + 错误码 + 测试 |
| `dsh/ACTION-GUIDE.md` §4 | A2 `plan stage list --json` | **本阶段关闭**（T2） | `commands/plan.ts` + 契约 + 测试 |
| `dsh/ACTION-GUIDE.md` §5 | A3 `model list|get --json` | **本阶段关闭**（T3） | `commands/model.ts` + 契约 + 测试 |
| `dsh/ACTION-GUIDE.md` §6 | A4 三命令面 | **本阶段关闭**（T4） | `flow.ts` / `lint.ts` / `roadmap.ts` + 契约 + 测试 |
| `dsh/ACTION-GUIDE.md` §7 | A5 `config get --all --json` | **本阶段关闭**（T5） | `commands/config.ts` + 契约 + 测试 |
| `dsh/ACTION-GUIDE.md` §8 | 四条边界约定 | **本阶段遵守**（零改动验证） | T7 边界清单 |
| — | **OUT-1**：DSH 适配器消费 v1.2.4 新出口 | **仓库外项**，Feel/DSH 单独执行 | 不纳入本仓 stage 文件清单；不阻塞本仓收口 |

> **OUT-1 内容**：DSH 侧把 7 处 `cli.text()` 改为 `cli.json()`（文本回显 8 → 1）、`--json` 调用点 25 → 32；`feel_archive` 透传 `--force`；`feel_verify action=config_get` 支持无 key 全量；`openfeel.requiresCli` 升级；增补 contract/verify 断言。由 DSH 侧维护，**本仓不修改 `dsh/`**。

---

## 十、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-17 | openfeel-planner | 初稿：单阶段 fast 计划；A1~A5 + 版本 1.2.4 收口；T1~T7 任务表；计数核验锁定 **40 成功出口 / 41 注册选项**（较任务预估 +1，因 lint 双命令面）；契约增量规格；A/B/C/D/E 清单；R-1~R-9。**只写计划文档，未改源码、未直写 flow.json、未推进 phase。** |
| 2026-10-17 | openfeel-planner | 修订 1（REV-100-001）：A1 零写盘主判据改为归档文件内容哈希（SHA-256）+ flow.json revision + `log[]` 长度 + KB 条目数（mtime 仅辅助，测试在并发/时间粒度下稳定）；补别名双示例并明确保护为**归档文件级**（非阶段级）。**只改计划文档。** |
| 2026-10-17 | openfeel-archiver | 归档回填：stage-100 归档完成（A1~A5 + 版本 1.2.4 全部达成）；M54 = done；版本 1.2.4 收口成立；OUT-1（DSH 消费新出口）DSH 侧转出。 |

## 十一、执行进度（归档回填）

| 里程碑 | 阶段 | 状态 | 归档 | 备注 |
|--------|:--:|:--:|------|------|
| M54 DSH A1~A5 收口与 v1.2.4 收官 | `v1.2.4-stage-100` | **done（已归档）** | [archive-v1.2.4-stage-100.md](../../../log/archive-v1.2.4-stage-100.md) | A1~A5 全达成：归档覆盖保护（零写盘 + `--force`）+ 7 个新 `--json` 出口 + `config get --all` + 版本 1.2.4 全链路；契约 **40/41**；门禁 **75 文件 / 1941 用例** 0 failed / 0 skipped、`tsc` 0、`lint i18n` 994、`lint kb` 0 过期 / 643 引用、build ×2 幂等、`--version` 1.2.4、`dsh/` 零 diff；审查 passed（REV-100-001/002 全 closed，0 blocking）；OUT-1（DSH）DSH 侧转出 |

**版本级收口声明**：v1.2.4（补丁版本）单阶段收口完成；A 类残留 0、`--version` = 1.2.4、契约 **40 成功出口 / 41 注册选项**；既有 33 出口键集键序与退出码 0/1/2 语义不变。阶段 phase 由 Feel 经 CLI 推进至 `done`。
