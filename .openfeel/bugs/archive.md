# archive 模块 Bug 归档

> 来源阶段：`v1.1.2-stage-41`（CLI 自描述与可纠错能力，实现 commit `47a5462`）
> 登记人：openfeel-feel-tester ｜ 登记时间：2026-09-29 ｜ 私域详细报告：`.openfeel/users/Liuary/bugs/archive/`

---

## BUG-001：`openfeel archive` 对缺 `deps` 字段的存量阶段抛 TypeError

- **优先级**：low ｜ **阻塞**：否 ｜ **状态**：**closed**（v1.1.2-stage-47 `op-002` 最小修复 + 验收通过）

### 核心结论

对**无 `deps` 字段的存量阶段**执行 `openfeel archive <stage>` 时崩溃，exit 1：

```
错误：Cannot read properties of undefined (reading 'length')
```

**崩溃点**（唯一）：`src/core/archive/merge.ts:85`

```ts
- **依赖阶段**：${stage.deps.length > 0 ? stage.deps.join(', ') : '无'}
```

`stage` 直接取自 `data.stages[stageName]`（flow.json 原始数据），`FlowManager` 的加载路径**未对 `deps` 做默认值归一化**，故存量数据访问 `.length` 抛 TypeError。

**对比**：stage-41 新增的 `FlowManager.checkRemovable` 对同字段使用 `Array.isArray(otherStage.deps) ? otherStage.deps : []` 守卫（`flow-manager.ts:1202`），`removeStage` 的快照亦用 `Array.isArray(stage.deps)` 守卫，故 `flow stage remove` 路径**不崩**。

**归因**：**预存量缺陷**（`merge.ts` 未被 commit `47a5462` 修改）；stage-41 op-004 让 `deps` 成为真实语义数据后，该缺口的可见性提升。stage-41 op-003「风险与回滚 #8」已预先记录。

### 影响范围

- 触发条件：仅对**无 `deps` 字段的存量阶段**执行 `openfeel archive`；所有经 CLI（`registerStage`/`addStage`/`plan stage add`）创建的阶段均带 `deps`，不受影响。
- 实际影响：存量阶段（本仓 `v1.0.0-*` / `v1.1.0-*` 共 41 个）若需重新归档则报错退出——而归档正是流水线归档阶段（openfeel-archiver）的入口命令。
- 涉及文件：`src/core/archive/merge.ts:85`（唯一崩溃点）；可选在 `FlowManager` 加载路径统一归一化。

### 建议修复方向

1. 最小修复：`(stage.deps ?? []).length > 0 ? (stage.deps ?? []).join(', ') : '无'`；
2. 彻底修复：`FlowManager` 加载 flow.json 时对 `StageData.deps` 统一补 `[]` 默认值，消除同类隐患。

### 归档影响说明（本轮）

stage-41 自身的 `deps` 字段存在（值为 `[]`），故本轮 `openfeel archive v1.1.2-stage-41` **未触发**该缺陷。

> 沉淀：`kb/patterns.md #破坏性命令安全校验清单模式`（`Array.isArray` 存量守卫的正面样本）

### 关闭记录（v1.1.2-stage-47，commit `2fb38fa`）

最小修复：`src/core/archive/merge.ts:85` 加 `Array.isArray(stage.deps) && stage.deps.length > 0` 守卫（唯一读取点）。测试官隔离端到端实测：构造缺 `deps` 字段的存量阶段（`flow.json` 中删除该键，`deps === undefined`）→ `openfeel archive v1.0.0-stage-01` **exit 0**，生成归档摘要且含「- **依赖阶段**：无」。**关闭**。

**防再犯**：① **读取存量数据前先归一化判据**——可选字段（`deps`、`meta`）一律用 `Array.isArray` / `??=` 之类守卫，不假设「类型声明即存在」（存量 `flow.json` 由旧版本写入，字段可能整体缺失）；② 采取**最小修复**并记录范围裁定：仅守卫唯一读取点，**不做**加载路径全量归一化（后者会改变写回内容，范围更大，留观察）；③ 同类伴随缺陷（同阶段 `save()` 缺 `meta` 抛 `TypeError`，`REV-41` REV-008）以 `this.data.meta ??=` 同批修复，避免只修一半。沉淀见 `kb/patterns.md #破坏性命令安全校验清单模式`（`Array.isArray` 存量守卫的正面样本）。
