# v1.1.2-stage-41 — CLI 自描述与可纠错能力

> **版本**：v1.1.2 | **创建日期**：2026-09-28 | **Planner**：独立 openfeel-planner
> **上级计划**：`.openfeel/plan/v1/v1.1.2/plan.md`
> **定位**：补齐「计划 → 流水线」落地环节的**自描述**（phase/转移表、stageId 约定）与**可纠错**（移除阶段、声明依赖、冲突检测、三入口收敛），直接对应 Pantheogen 反馈 #1/#2/#3（缺口部分）/#4/#9。

---

## 一、阶段目标与定位

| 反馈 # | 目标 | 对应 op |
|:--:|------|:--:|
| #2 | `--help` 不自描述 phase 枚举与合法转移 → 新增 `openfeel flow phases`（含 `--json`） | op-001 |
| #3 | stageId 命名/目录映射**规则已文档化**，真实缺口 = 唯一性/冲突校验 → 补 `(series, stageDir)` 冲突检测 + 非法 id 建议名 | op-002 |
| #1 | 缺移除阶段命令 → 新增 `openfeel flow stage remove`（安全校验 + `current` 兜底） | op-003 |
| #4 | `plan stage add` 不支持 `--deps` → 暴露该参数并落 `flow.json` | op-004 |
| #9 | 三入口（`plan stage add` / `flow stage add` / `stage create`）职责重叠 → 两层 + deprecated 提示 + 统一校验 | op-005 |

**不属于本阶段**：#5/#6/#7（入 stage-42）；反馈 #8 经核实无需改动（不实现）。

**边界裁决（沿用上级 P13）**：`flow phases` 的转移表**必须来自运行时 `pipelineConfig`**，不得直引 `PIPELINE_PHASES` 硬编码枚举，避免「展示与实际转移表不一致」。

---

## 二、前置依赖与上下游衔接

- **前置依赖**：无（hard/soft 均无）。本阶段全部为命令层/核心层**增量**改动。
- **下游衔接**：
  - `v1.1.2-stage-42` **soft 依赖**本阶段——两者均改 `src/core/flow-manager.ts` 与 `src/i18n-data/{zh-CN,en}.ts`，顺序执行可避免同文件并发改动与 i18n 键冲突。
  - `v1.1.2-stage-43` **hard 依赖**本阶段——其新 skill `openfeel-cli-usage` 必须文档化本阶段新增的 `flow phases` / `flow stage remove` / `plan stage add --deps`，且文档同步依赖三入口分层结论。
- **对外契约变更**：新增 3 处 CLI 命令面（`flow phases`、`flow stage remove`、`plan stage add --deps`），`stage create` 进入 deprecated（功能保留）。

---

## 三、op 级任务清单

| op | 主题 | 具体改动点（文件:行号） | 验收要点 |
|----|------|------------------------|----------|
| op-001 | `flow phases` 子命令 | ① `src/core/flow-manager.ts`：在 `getAvailablePhases`（`:1270-1280`）附近新增公共访问器 `getPipelinePhases(): string[]`（取 `this.pipelineConfig?.phases`）与 `getPipelineTransitions(): Record<string, string[]>`（取 `this.pipelineConfig?.transitions`），缺省回退 `getDefaultPipelineConfig()`（`:2749-2792`）；② `src/commands/flow.ts`：在 `flow metrics`（`:318-327`）与 `flow stage`（`:329-332`）之间插入 `.command('phases')`，默认输出 phase 列表（15 项，`PIPELINE_PHASES` `pipeline-schema.ts:14-20`）+ 转移表（`key → [targets]`，组合 key 原样展示 `\|`），`--json` 输出 `{ phases, transitions }`；③ 在 `flow advance` 的 `--to` 选项描述（`:368`）追加提示「合法 phase 与转移表：`openfeel flow phases`」 | `openfeel flow phases` 输出含 15 个 phase；`--json` 可 `JSON.parse` 且键为 `phases`/`transitions`；自定义 `.openfeel/pipeline.yaml` 时展示其中转移表（fixture 测试）；`advance --help` 指向该命令 |
| op-002 | stageId 校验 + 建议名 + 冲突检测 | ① `src/core/plan/path.ts`（在 `normalizeStageId` `:83-86` 之后新增）：`validateStageId(input): {ok:boolean; reason?:string}`、`suggestStageId(projectPath, input): string`（非法输入给建议名：若形如版本号 `v0.0.1` → `v0.0.1-stage-{NN}`，NN = 目标 series 内 `flow.json.stages` + `plan/{series}/` 目录的 max+1）、`findStageDirConflict(projectPath, stageId): string \| null`（复用 `planDirToStageId` `:99-128` 的 flow.json 读取模式，返回映射同一 `(series, stageDir)` 的其它 stageId）；② `src/core/flow-manager.ts`：`registerStage`（`:704-718`）保留同 stageId 静默跳过（幂等），但写入前冲突检测抛错；`addStage`（`:1117-1123`）在存在性检查后追加冲突检测；③ 三入口命令层接入 `validateStageId` + 建议名输出；④ **`scheme.ts` 兜底路径处置（REV-41-003）**：`src/core/plan/scheme.ts` 的 `syncToFlowJson`（`:87-146`）在 stage 未注册时直接写 `flowData.stages[stageName]`（`:107-115`），**不经过 `registerStage`**，会绕过冲突检测——该缺口**并入 stage-42 op-004** 接入（该 op 已改 scheme.ts，避免跨阶段重复改同一文件、避免并行写冲突） | 非法 id（`foo`/`v1`/空）报格式错误 + 建议名；`v4-stage-04` 已存在时添加 `v4.0.0-stage-04` 抛错；同 stageId 重复添加静默幂等；`path.test.ts` 新增用例；`scheme.ts` 兜底路径的冲突检测由 stage-42 op-004 覆盖（见该阶段计划） |
| op-003 | `flow stage remove <stageId>` | ① `src/core/flow-manager.ts`：在 `addStage`（`:1141`）之后新增 `removeStage(stageId, options:{force?:boolean}): void`——默认拒绝 `ops` 非空或 `pipeline.current.stage === stageId`（`:1131-1134`/`:1053-1056` 语义）；移除后若 `current.stage` 指向被删阶段 → 按 `stages` 插入序回退「首个非 done 阶段」，无则清空 `{stage:'', op:''}`；追加 `appendLog({time:'', agent:'cli', action:'remove_stage', detail:{stageId, purged}}) `（`appendLog` `:1696`）；默认**不删** `plan/{series}/{stageDir}/` 目录；② `src/commands/flow.ts`：在 `stageCmd` 的 `add`（`:335-361`）之后插入 `.command('remove <stageId>')`，选项 `--force`、`--dry-run`、`--purge`（删除目录，非 TTY 时须配 `--force`），并发冲突复用 `isFlowConcurrentError`（`:352`）+ 退出码 2 | `ops` 非空拒绝、当前活跃阶段拒绝；`--force` 越过；`--dry-run` 不写盘；移除 current 后 `pipeline.current.stage` 不悬空；`--purge` 删除目录；`flow.json.log` 出现 `remove_stage` |
| op-004 | `plan stage add --deps` | ① `src/commands/plan.ts:21-30`：新增 `.option('--deps <ids...>', '依赖阶段 ID 列表')`，透传 `addStage(projectPath, name, deps)`；② 核心链路已就绪，无需改动：`src/core/plan/stage.ts:26`（`addStage` 签名）、`:45`（写 `overview.md`「## 依赖」）、`:103`（`registerStage(fullStageId, deps)` 落 `flow.json.stages[].deps`）；③ 帮助文本示例 `openfeel plan stage add v1.1.2-stage-41 --deps v1.1.2-stage-40` | `flow.json.stages[x].deps == ['a','b']`；`overview.md`「## 依赖」列出；不传 `--deps` 行为不变（`deps` 为空数组） |
| op-005 | 三入口职责收敛 | ① `src/commands/plan.ts:20-30`：帮助文本明示「完整入口：建目录 + overview/status + 注册 flow.json」；② `src/commands/flow.ts:335-361`：帮助文本明示「仅注册 flow.json，不建目录；通常应使用 `openfeel plan stage add`」；③ `src/commands/stage.ts:401-429`（`stage create`）：运行时输出 deprecated 提示（stderr；非 TTY 静默，对齐 kb「init/update 重启提醒对称输出模式」），功能保留；④ 三入口统一接入 op-002 校验；⑤ 文档同步见「四、影响文件清单」 | 三入口 help 互相交叉引用；`stage create` TTY 下有 deprecated 提示、非 TTY 无输出；三入口非法 id 均报错+建议名；`docs/commands.md` 与 `manual/cli/commands.md` 关系表一致 |

---

## 四、每个 op 的预期影响文件清单

| op | 新增 | 修改 |
|----|------|------|
| op-001 | — | `src/core/flow-manager.ts`、`src/commands/flow.ts`、`src/core/i18n-data/zh-CN.ts`、`src/core/i18n-data/en.ts` |
| op-002 | — | `src/core/plan/path.ts`、`src/core/flow-manager.ts`、`src/commands/plan.ts`、`src/commands/flow.ts`、`src/commands/stage.ts`、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-003 | — | `src/core/flow-manager.ts`、`src/commands/flow.ts`、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-004 | — | `src/commands/plan.ts`、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-005 | — | `src/commands/{plan,flow,stage}.ts`、`docs/commands.md`（`:57-129` flow 节、`:160-182` plan 节）、`.openfeel/manual/cli/commands.md`（`:56-67`）、`src/core/i18n-data/{zh-CN,en}.ts` |
| 测试 | 新增用例（不新增测试文件） | `test/core/plan/path.test.ts`、`test/core/plan/stage.test.ts`、`test/commands/plan.test.ts`、`test/core/flow-manager.test.ts`、`test/core/i18n.test.ts`（键对称自动校验） |

---

## 五、完成标准

1. `openfeel flow phases` 输出 15 个 phase 与运行时转移表；`--json` 结构稳定；`flow advance --help` 指向该命令。
2. 非法 stageId 在三入口均返回「格式错误 + 建议名」；`(series, stageDir)` 冲突被阻止；同 stageId 重复添加幂等。
3. `openfeel flow stage remove <id>`：`ops` 非空 / 当前活跃阶段默认拒绝，`--force` 越过，`--dry-run` 不写盘；移除后 `pipeline.current.stage` 不悬空；有 `remove_stage` 审计日志。
4. `openfeel plan stage add x --deps a,b` 使 `flow.json.stages[x].deps == ['a','b']` 且 `overview.md` 列出依赖；不传 `--deps` 行为不变。
5. 三入口 help 分层清晰 + 交叉引用；`stage create` 有 deprecated 提示（非 TTY 静默）。
6. `npm run build && npm test` 全绿；`openfeel lint i18n` 零错误。

---

## 六、风险与注意事项

| # | 风险 | 缓解 |
|---|------|------|
| 1 | `flow phases` 展示与 `advance` 实际转移表不一致 | 统一走运行时 `pipelineConfig`（上级 P13）；fixture 测试覆盖自定义 `pipeline.yaml` |
| 2 | 建议名 NN 推导跨 series 串号 | NN 计算限定在目标 series 内；不跨 series 取 max |
| 3 | `--purge` 误删计划产物 | 默认不删目录；`--purge` 显式 + 非 TTY 拒绝；文档标注先 `--dry-run` |
| 4 | `removeStage` 后 `current` 悬空导致后续 `advance` 失败 | 显式兜底回退首个非 done；无阶段时清空；测试断言 |
| 5 | `stage create` deprecated 提示污染 CI 输出 | 非 TTY 静默（复用既有 TTY 判定惯例） |
| 6 | i18n 键不对称 | 新增键同时补 `zh-CN.ts`/`en.ts`，靠 `lint i18n` 兜底 |
| 7 | 三入口共享校验后引入循环依赖 | 校验逻辑放 `path.ts`（无 flow-manager 依赖），命令层单向引用 |

---

## 七、op 执行顺序与依赖

```
op-002（path.ts 校验/冲突，供全阶段复用）
   │
   ├─→ op-001（flow phases，独立）
   ├─→ op-003（flow stage remove，复用 op-002 校验）
   ├─→ op-004（plan stage add --deps，独立）
   └─→ op-005（三入口收敛，依赖 op-002 校验落地）
```

**建议顺序**：op-002 → op-001 → op-003 → op-004 → op-005。

- op-002 先行：为其余命令提供统一校验与冲突检测底座。
- op-001 与 op-004 无相互依赖，可并行。
- op-005 最后：收敛三入口帮助文本与文档，须待校验能力（op-002）与各命令改动稳定后统一收口。

---

## 八、修订记录

| 时间 | 修订人 | 依据 REV | 修订内容 |
|------|--------|----------|----------|
| 2026-09-28 | openfeel-planner | REV-v1.1.2-stage-41 REV-001（版本级） | 本阶段无直接改动；版本收口清单扩充落在版本级计划 §3.1 与 stage-43 op-003 |
| 2026-09-28 | openfeel-planner | REV-v1.1.2-stage-41 REV-002 | 本阶段计划无写死计数；数字漂移修正落在版本级计划与 stage-42 op-003 |
| 2026-09-28 | openfeel-planner | REV-v1.1.2-stage-41 REV-003 | op-002 新增 ④：`scheme.ts` 自动注册兜底路径的冲突检测**并入 stage-42 op-004**（消除绕过缺口，避免跨阶段重复改同一文件） |

> 三处核心裁定不变（#5 画像仅兜底 / #6 只修全量 done、不做 current 回退 / 技能源扁平单文件无 `{lang}`）。
