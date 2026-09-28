# v1.1.2-stage-42 — 配置口径与流水线状态正确性

> **版本**：v1.1.2 | **创建日期**：2026-09-28 | **Planner**：独立 openfeel-planner
> **上级计划**：`.openfeel/plan/v1/v1.1.2/plan.md`
> **定位**：修复内部状态与配置口径的两处不一致——`auto_advance` 级联（实现与文档不符）与 `pipeline.phase` 在 `done` 时不置位；并为关键 CLI 状态变更补齐 `flow.json` 审计日志。对应反馈 #5/#6/#7。

---

## 一、阶段目标与定位

| 反馈 # | 目标 | 对应 op |
|:--:|------|:--:|
| #5 | `auto_advance` 口径冲突 + 无「有效值+来源」出口 → 统一四级有效链 + `openfeel config effective` | op-001、op-002 |
| #6 | `pipeline.phase` 在 `targetPhase==='done'` 时仍恒置 `active`（真缺陷） → 改为「全量 done 判定」 | op-003 |
| #7 | `plan stage add` / `plan scheme create` 不写审计日志 → 补 `appendLog`（`agent='cli'`） | op-004 |

### 关键裁定（沿用上级 P2/P2a/P3/P3a/P7）

1. **#5 优先级链（P2）**：`status.md 局部 > .openfeel/config.yaml defaults > ~/.config/openfeel/profile.yaml preferences > 内置默认 disabled`。全局画像**仅作最低优先级兜底**（此前从未接入）。
2. **#5 事实前提（P2a，经 REV-42-001 更正）**：本阶段要修的是**框架级「文档 vs 实现」不一致**——模板/文案宣称「`auto_advance` 优先取全局画像」，而 `buildCascadeConfig` 从不读全局画像。**不涉本项目具体生效值**：本项目 `config.yaml` 现为 `execution_mode: auto` / `auto_advance: enabled` / `test_enabled: true`，与 profile 一致、**无冲突**；该基线由用户决策设定，**非本阶段交付内容**（见「环境基线变更记录」）。

### 环境基线变更记录（非本阶段交付内容）

> 依据 **REV-v1.1.2-stage-42 REV-001**。规划完成后，用户明确决策将本项目执行模式改为「自动推进 + 启用正式测试阶段」。

- 当前实测：`.openfeel/config.yaml:18` `execution_mode: auto`、`:22` `auto_advance: enabled`、`:26` `test_enabled: true`；`~/.config/openfeel/profile.yaml` 的 `preferences.auto_advance` 亦为 `enabled`。
- **约束**：本阶段各 op **不得覆写**上述三值（由用户基线决定）；如需验证非默认组合，一律在**测试 fixture / 临时 HOME** 中构造。
- **连带修正**：`.openfeel/config.yaml:13` 与其权威源 `src/core/config.ts:314`(zh)/`:371`(en) 的注释「部署模板默认 auto+enabled，仓库自身默认 manual+disabled」中「仓库自身默认 manual+disabled」已不成立，op-001 须同步修正（仅改注释，不动三值）。
2. **#6（P3）**：`pipeline.phase = 所有 stage 均 done ? 'done' : 'active'`——**只修全量 done 判定**。
3. **#6（P3a）**：**不实施** `current` 自动回退（核实为设计行为，非缺陷），不扩大范围。
4. **#7（P7）**：仅补 `registerStage` 与 `plan scheme create` 两处缺失日志，**不重构**既有 10 处 `appendLog` 调用。

**边界**：反馈 #8（非 git 噪声）不在本阶段，且经核实无需改动。

---

## 二、前置依赖与上下游衔接

- **前置依赖**：**soft 依赖 `v1.1.2-stage-41`**——两者均修改 `src/core/flow-manager.ts` 与 `src/i18n-data/{zh-CN,en}.ts`，顺序执行避免同文件并发改动与 i18n 键冲突。
- **下游衔接**：`v1.1.2-stage-43` **soft 依赖**本阶段——其文档/skill 须收录 `openfeel config effective` 与修正后的 `pipeline.phase` 语义。
- **行为变更提示**：op-001（接入 profile 层）与 op-003（`pipeline.phase` 语义）均为**行为变更**，须在审查中显式确认。

---

## 三、op 级任务清单

| op | 主题 | 具体改动点（文件:行号） | 验收要点 |
|----|------|------------------------|----------|
| op-001 | `auto_advance` 口径统一（P2/P2a） | ① `src/core/flow-manager.ts`：`CascadeConfig`（`:143-147`）新增 `profileDefaults: Record<string,string>`；`buildCascadeConfig`（`:1375-1423`）新增 profile 读取层——调用 `readProfile()`（`src/core/config.ts:181-205`，缺省 `DEFAULT_PROFILE` `:154`）取 `preferences.auto_advance` 等，按 `statusOverrides > configDefaults > profileDefaults` 计算 `effective`；`verboseSummary`（`:1359-1372`）自动透出；② `src/commands/flow.ts` verbose 级联表（`:89-106`）增加 profile 列（`flow.status.cascade*` i18n 键同步）；③ 文案修正：`src/core/templates-data/opencode/agents/zh-CN/feel.md:324`、`en/feel.md:324` 的「优先使用全局画像」→「项目 `config.yaml` 优先、全局画像兜底」，随后 `npm run build` 重生成生成段（`src/core/template-loader.ts:334` en、`:1661` zh）；④ 连带修正陈旧注释：`.openfeel/config.yaml:13` 与 `src/core/config.ts:314`(zh)/`:371`(en)（**仅改注释，不动三值**）。**不得覆写本项目 `config.yaml` 的 `execution_mode`/`auto_advance`/`test_enabled`** | 隔离 fixture 下三级不同值时有效值取 `status.md`；仅 config 时取 config；仅 profile 时取 profile；全无时 `disabled`；Grep 无「优先使用全局画像」残留；Grep 注释无「仓库自身默认 manual+disabled」残留 |
| op-002 | `openfeel config effective [key]`（P9） | ① `src/core/flow-manager.ts`：将级联解析暴露给命令层——新增公共方法 `resolveEffectiveConfig(): Record<string, {value:string; source:'status.md'\|'config.yaml'\|'profile.yaml'\|'builtin'}>`（内部复用 op-001 的 `buildCascadeConfig` + 来源判定）；② `src/commands/config.ts`（`registerConfigCommand` `:68`，在 `get`/`set` 之后 `:227` 前）新增 `.command('effective [key]')`：无 key 输出四键（`execution_mode`/`auto_advance`/`test_enabled`/`merge_mode`）的有效值+来源表，有 key 输出单键；③ 内置默认取 `DEFAULT_CONFIG`（`src/core/config.ts:123-128`）；④ i18n 键 `config.effective.*` 中英对称 | `openfeel config effective` 输出含「有效值 + 来源」；**在隔离 fixture / 临时 HOME 中**：画像 `enabled` + 项目 `disabled` → `disabled`/`config.yaml`；项目 `enabled` + 画像 `disabled` → `enabled`/`config.yaml`；仅画像 → `profile.yaml`；全无 → `disabled`/`builtin`；`openfeel config effective auto_advance` 单键输出。**禁止依赖或写死本项目真实配置值** |
| op-003 | `pipeline.phase` done 修正（P3） | ① `src/core/flow-manager.ts:1058-1059`（`advanceStagePhase` 内，注释「同步更新 pipeline.phase 为 'active'」）：改为判定「`Object.values(this.data.stages).every(s => s.phase === 'done')` → `'done'`，否则 `'active'`」；② 确认 `validate()` 的 `MetaPhaseSchema` 校验（`:1769-1785`）对 `done` 通过、`getPhase()`（`:525-529`）语义不变；③ **不改** `:1053-1056` 的 `current` 逻辑（P3a）；④ 历史 `flow.json` 数据（阶段/日志/checkpoint 计数**以实施时实盘为准**；撰写时实测 44 阶段 / 431 条日志）**不迁移**（仅影响后续推进）；⑤ **同步翻转既有测试断言**：既有「`advance` 到 `done` 后 `pipeline.phase` 仍为 `active`」类断言须改为 `done`（见风险 2） | 单阶段推进到 `done` 后 `pipeline.phase === 'done'`；多阶段仅一个 done 时仍为 `active`；恢复 checkpoint 后行为不变；`validate()` 通过 |
| op-004 | 审计日志补齐（P7） | ① `src/core/flow-manager.ts`：`registerStage`（`:704-718`）成功新增后 `appendLog({time:'', agent:'cli', action:'register_stage', detail:{stageName, deps}})`（`appendLog` `:1696`）——同 stageId 幂等跳过时**不写**；② `src/core/plan/scheme.ts`：`syncToFlowJson`（`:87-146`）在 op 注册完成、`flowMgr.save()`（`:134`）之前追加 `flowMgr.appendLog({time:'', agent:'cli', action:'register_op', detail:{stageName, opId}})`；③ **同一处接入 stage-41 op-002 的冲突检测**：`syncToFlowJson` 的「stage 未注册时自动注册」兜底路径（`:107-115`）不经过 `registerStage`，须改为调用 `path.ts` 的 `findStageDirConflict`/`validateStageId`（消除 REV-v1.1.2-stage-41 REV-003 指出的绕过缺口；因 scheme.ts 已在本 op 改动，避免跨阶段重复改同一文件）；④ 确认不重复写（同 stageId 幂等跳过时也不写日志）；⑤ **双轨日志说明（REV-42-002）**：`flow-manager.addStage`（`:1135-1140`）已有 `add_stage` 日志（对应 `flow stage add`/`stage create`「仅注册层」），本 op 新增的 `register_stage` 对应 `plan stage add`「完整层」；两者入口不同，非重复，须在注释与（stage-43）skill 文档中说明以免审计查询歧义 | `plan stage add` 后 `flow.json.log` 末条 action 为 `register_stage`；`plan scheme create` 后为 `register_op`；`advance` 路径日志数量不因本阶段增加；`scheme.ts` 兜底自动注册路径对非法/冲突 stageId 报错 |

---

## 四、每个 op 的预期影响文件清单

| op | 新增 | 修改 |
|----|------|------|
| op-001 | — | `src/core/flow-manager.ts`、`src/commands/flow.ts`、`src/core/templates-data/opencode/agents/{zh-CN,en}/feel.md`、`src/core/template-loader.ts`（生成段）、`src/core/templates-data/agents-md/{zh-CN,en}.md`（按需）、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-002 | — | `src/core/flow-manager.ts`、`src/commands/config.ts`、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-003 | — | `src/core/flow-manager.ts` |
| op-004 | — | `src/core/flow-manager.ts`、`src/core/plan/scheme.ts` |
| 测试 | 新增用例 | `test/core/flow-manager.test.ts`、`test/core/config.test.ts`、`test/core/plan/scheme.test.ts`、`test/core/plan/stage.test.ts`、`test/core/i18n.test.ts` |

> 说明：op-003 为单点改动（`:1058-1059`），但影响 `pipeline.phase` 语义，须重点回归 wizard/health/status 消费方。

---

## 五、完成标准

1. `openfeel config effective` 输出「有效值 + 来源」；**验收基于隔离 fixture / 临时 HOME 构造的组合场景**（画像 enabled + 项目 disabled → `disabled`/`config.yaml`；项目 enabled + 画像 disabled → `enabled`/`config.yaml`；仅画像 → `profile.yaml`；全无 → `disabled`/`builtin`）；**禁止依赖或写死本项目真实配置值**。
2. 模板文案与实际级联一致（Grep 无「优先使用全局画像」残留）；生成段与权威源一致（`npm run build` 后校验通过）。
3. 最后一个阶段推进到 `done` 后 `flow.json.pipeline.phase === 'done'`；多阶段未全 done 时仍为 `active`；`current` 行为不变。
4. `plan stage add` 与 `plan scheme create` 各产生一条 `agent='cli'` 的审计日志；既有 10 处 `appendLog` 未被重构。
5. `npm run build && npm test` 全绿（新增：级联来源、`config effective`、`pipeline.phase` 两场景、审计日志断言）；`openfeel lint i18n` 零错误。

---

## 六、风险与注意事项

| # | 风险 | 缓解 |
|---|------|------|
| 1 | 接入 profile 层改变既有级联结果（行为变更） | 仅作**最低优先级兜底**；已显式声明 `auto_advance` 的项目实际值不变；`config effective` 可即时验证；审查确认 |
| 2 | `pipeline.phase` 语义变化影响 `getPhase()` 消费方（wizard/health/status） | `done` 仅在「全量 done」时出现；正常推进过程行为不变；测试覆盖 wizard/health 不回归；**同步翻转既有「advance 到 done 后 phase 仍为 active」类断言**（REV-42-003）；审查确认两备选（P3 vs 备选 A） |
| 3 | `flow-manager` → `config.ts` 引入循环依赖 | 实施前 `tsc`/依赖检查实测；若成环，改由命令层读 profile 后注入（`buildCascadeConfig` 接收可选参数） |
| 4 | i18n 键不对称（新增 `config.effective.*`、级联表 profile 列） | 同时补 `zh-CN.ts`/`en.ts`；`openfeel lint i18n` 兜底 |
| 5 | 文案修正遗漏生成段（手工改权威源但未 `npm run build`） | 严格走「改权威源 → build 重生成」流程；kb「模板单源架构」 |
| 6 | 审计日志改变 `flow.json.log` 计数，干扰既有断言 | 同步更新受影响测试断言；确认 `advance` 路径计数不变 |

---

## 七、op 执行顺序与依赖

```
op-001（级联接入 profile）───→ op-002（config effective，复用 op-001 的级联来源）

op-003（pipeline.phase，独立）
op-004（审计日志 + scheme.ts 兜底冲突检测，独立）
```

**建议顺序**：op-003 → op-004 → op-001 → op-002。

- op-003 / op-004 为小而独立的点状修复，与 op-001 并列（**无先后依赖**），先行可快速收口状态正确性。
- op-001 → op-002 存在强关联（op-002 复用 op-001 暴露的级联与来源），须依序执行。

### 修订记录

| 时间 | 修订人 | 依据 REV | 修订内容 |
|------|--------|----------|----------|
| 2026-09-28 | openfeel-planner | REV-v1.1.2-stage-42 REV-001 | P2a 更正为框架级「文档 vs 实现」不一致；新增「环境基线变更记录」；op-001/op-002 与完成标准改为隔离 fixture 验收；新增「不得覆写本项目三值」约束 + 陈旧注释连带修正 |
| 2026-09-28 | openfeel-planner | REV-v1.1.2-stage-42 REV-002 | op-004 补「双轨日志说明」（`add_stage`=仅注册层 vs `register_stage`=完整层） |
| 2026-09-28 | openfeel-planner | REV-v1.1.2-stage-42 REV-003 | 依赖图修正（op-003/op-004 与 op-001 并列）；风险 2 补「既有断言翻转」；数字漂移改为「以实施时实盘为准」 |
| 2026-09-28 | openfeel-planner | REV-v1.1.2-stage-41 REV-003 | op-004 ③ 接入 `scheme.ts` 自动注册兜底路径的冲突检测（消除绕过缺口） |
