# Plan — stage-30: Pantheogen 兼容性 Bug 修复 (3 项)

> **版本**：v1.0.0-stage-30
> **创建日期**：2026-08-09
> **Planner**：独立 Planner（推理模型 DeepSeek V4 Pro）
> **规模判定**：小规模（单阶段、3 文件、无架构变更，但需求涉及流水线核心路径，走 Planner 确保分析完整性）

---

## 知识库参考

- kb/troubleshooting.md #"手动 edit status.md 频繁失败 — 格式匹配脆弱"：本阶段 Bug #2（正则格式兼容）为此问题的延续，status.md 的读写应通过 CLI 原子操作，正则需同时兼容粗体和非粗体格式
- kb/patterns.md #CLI 原子管理模式：Agent 通过 CLI 命令操作数据文件，不直接 edit

知识库中暂无与 Bug #1（flow-manager load 崩溃）和 Bug #3（stage create 入口缺失）直接相关的记录。

---

## 背景与动机

来自外部项目 Pantheogen 的 Bug 报告，OpenFeel CLI 在目标项目中有三个兼容性问题：

| # | Bug | 现象 | 根因 |
|---|-----|------|------|
| 1 | `flow status`/`current`/`overview` 报告 "flow.json 不存在" | 命令无法加载已存在的 flow.json | `load()` 中 `Object.entries(stage.ops)` 遇到 null/undefined ops 时抛异常被静默捕获，导致 `this.data = null` |
| 2 | `stage set` 找不到「状态」字段 | 设置阶段状态时报错 | `setStatusField()` 正则仅匹配粗体格式 `- **状态**：value`，不兼容手写的非粗体格式 |
| 3 | 缺少 CLI 阶段创建入口 | init 后 stages 为空 `{}`，无 CLI 命令创建首个阶段 | `flow stage add` 已存在但藏在 flow 子命令下；`stage` 命令组无 `create` 子命令 |

---

## 工作阶段

### Stage-30-01：三项 Bug 修复

> **目标**：修复 flow-manager 加载健壮性、stage 命令正则兼容性、新增 stage create 入口。
> **前置依赖**：无（三个 Bug 相互独立）
> **预计涉及文件数**：3 个（`flow-manager.ts`、`stage.ts`、2 个 i18n 数据文件）

#### 任务分解

| # | 任务 | Bug | 描述 | 涉及文件 |
|---|------|:--:|------|----------|
| 1 | `load()` ops 类型守卫 + `repair()` ops 修复 | #1 | ① `load()` (L261) 处增加 `stage.ops` 的类型守卫：仅在 ops 存在且为普通对象时遍历恢复 op.id<br>② `repair()` 方法增加 ops 字段修复逻辑：检测 stage.ops 缺失或非对象时，将其重置为空对象 `{}` | MODIFY: `src/core/flow-manager.ts` |
| 2 | `setStatusField` / `parseStatusFields` 正则兼容非粗体 | #2 | 将两处正则从 `- **{key}**：value` 扩展为同时匹配 `- {key}：value`（非粗体）格式。关键改动：`(-\s*(?:\*\*)?${escapeRegex(key)}(?:\*\*)?[：:]\s*)` — 粗体标记改为可选 | MODIFY: `src/commands/stage.ts` |
| 3 | 新增 `stage create` 子命令 | #3 | 在 `registerStageCommand()` 中（`stage task` 命令之后）新增 `stage create <stageId>` 子命令。复用 `FlowManager.addStage()` 逻辑（与 `flow stage add` 等价）。同时新增 i18n 键 `stage.create.addedTmpl` 到中英 i18n 数据文件 | MODIFY: `src/commands/stage.ts`<br>MODIFY: `src/core/i18n-data/zh-CN.ts`<br>MODIFY: `src/core/i18n-data/en.ts` |

#### 详细技术方案

##### Bug #1：`load()` ops 类型守卫

**当前代码**（`src/core/flow-manager.ts` L259-264）：
```typescript
if (this.data && this.data.stages) {
  for (const [, stage] of Object.entries(this.data.stages)) {
    for (const [opKey, op] of Object.entries(stage.ops)) {
      op.id = opKey;
    }
  }
}
```

**修复后**：
```typescript
if (this.data && this.data.stages) {
  for (const [, stage] of Object.entries(this.data.stages)) {
    // 类型守卫：仅当 ops 为普通对象时才遍历（跳过 null/undefined/数组）
    if (stage.ops && typeof stage.ops === 'object' && !Array.isArray(stage.ops)) {
      for (const [opKey, op] of Object.entries(stage.ops)) {
        op.id = opKey;
      }
    }
  }
}
```

**`repair()` 新增 ops 修复**（在现有 stages 修复段 L2050-2055 之后，即修复 stage phase 的循环内）：
```typescript
// 修复缺失的 ops 字段
const s = stage as unknown as Record<string, unknown>;
if (!s.ops || typeof s.ops !== 'object' || Array.isArray(s.ops)) {
  s.ops = {};
  changes.push(`已为阶段 ${stageId} 补全缺失的 ops`);
  modified = true;
}
```

##### Bug #2：正则兼容非粗体格式

**`parseStatusFields()`**（L74-76）：
```typescript
// 修复前
const fieldRegex = /^-\s*\*\*(.+?)\*\*[：:]\s*(.*)$/gm;

// 修复后：粗体标记改为可选
const fieldRegex = /^-\s*(?:\*\*)?(.+?)(?:\*\*)?[：:]\s*(.*)$/gm;
```

**`setStatusField()`**（L204-207）：
```typescript
// 修复前
const fieldRegex = new RegExp(
  `^(-\\s*\\*\\*${escapeRegex(key)}\\*\\*[：:]\\s*)(.*)$`,
  'gm',
);

// 修复后：粗体标记改为可选
const fieldRegex = new RegExp(
  `^(-\\s*(?:\\*\\*)?${escapeRegex(key)}(?:\\*\\*)?[：:]\\s*)(.*)$`,
  'gm',
);
```

> ⚠️ 注意：`setStatusField` 的 key 参数 `'状态'` 已被 `escapeRegex()` 处理，正则中不再需要额外转义。

##### Bug #3：`stage create` 子命令

**插入位置**：在 `registerStageCommand()` 中，`stage task` 命令注册之后（L378 之后、函数末尾 `}` 之前）。

**实现**：引入 `createManager`（从 `flow-manager.ts` 导入 `FlowManager`），由于 `stage.ts` 不直接依赖 flow-manager，需要使用动态导入或静态导入 `FlowManager`。优选复用静态导入 `FlowManager` 和 `createManager` 辅助函数。

实际上 `stage.ts` 当前只操作 `status.md` 文本文件。新增 `stage create` 需要创建 flow.json 中的阶段条目 + 创建 plan 目录下的 plan.md + deps.yaml + status.md 骨架。应复用现有 `flow stage add` 逻辑——最简单的方式是在 stage 命令中调用 `FlowManager.addStage()`。

但 `stage.ts` 当前没有导入 `FlowManager`。有两种方案：
1. 静态导入 `FlowManager` → 需要在 stage.ts 中添加 `import { FlowManager } from '../core/flow-manager.js'`
2. 动态导入减少耦合

考虑到 `stage create` 是高频操作且 `FlowManager` 是核心模块，静态导入更直接。同时需要在 `createManager` 函数调用中使用现有的 utility 函数。

**简化实现**：由于 `flow stage add` 已存在且直接操作 `FlowManager`，`stage create` 可以完全复用其逻辑。关键代码：

```typescript
// stage create <stageId>
stage
  .command('create')
  .description(t('stage.create.desc', getCliLang(process.cwd())))
  .argument('<stageId>', '阶段 ID（如 v1.0.0-stage-30）')
  .action((stageId: string) => {
    const projectPath = process.cwd();
    const lang = getCliLang(projectPath);
    const mgr = new FlowManager(projectPath);
    if (!mgr.isLoaded()) {
      console.error(t('common.errorNoInit', lang));
      process.exit(1);
    }
    try {
      mgr.addStage(stageId);
      mgr.save();
      console.log(t('stage.create.addedTmpl', lang, { stage: stageId }));
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(t('common.errorTmpl', lang, { msg }));
      process.exit(1);
    }
  });
```

需要新增 i18n 键：
- `stage.create.desc`（zh: "创建新的工作阶段", en: "Create a new work stage"）
- `stage.create.addedTmpl`（zh: "✓ 已创建阶段: {stage} → plan_pending", en: "✓ Stage created: {stage} → plan_pending"）

> 注意：可复用 `flow.stage.addedTmpl` 键（已在 `flow.ts` 中使用），以避免 i18n 键膨胀。但语义上 `stage.create` 和 `flow stage add` 是不同命令，保持独立的 i18n 键更清晰。

---

## 依赖关系

```yaml
stages:
  stage-30-01:
    depends_on: []
    dependency_type: null
    description: 三项 Bug 修复 — 相互独立，无硬依赖
```

三个操作相互独立：Bug #1 改 `flow-manager.ts`，Bug #2 和 #3 改 `stage.ts` 但修改位置不同（解析函数 vs 命令注册），Bug #3 还需改 i18n 文件。无执行顺序约束，可任意顺序开发。

---

## 测试策略

### 自测清单

- [ ] `npm run build` 成功，无 TypeScript 编译错误
- [ ] 现有测试套件（399/399）无回归

### Bug #1 验证

1. 手动构造含 `"ops": null` 的 stage 的 flow.json → `openfeel flow status` 不再崩溃
2. `openfeel flow repair --dry-run` 检测到缺失 ops 并报告，`openfeel flow repair` 实际修复

### Bug #2 验证

1. 创建包含 `- 状态：plan_pending`（非粗体）的 status.md → `openfeel stage set <stageId> --status exec_running` 正常更新
2. 创建包含 `- **状态**：plan_pending`（粗体）的 status.md → 同样正常工作
3. `openfeel stage status <stageId>` 正常解析两种格式

### Bug #3 验证

1. `openfeel stage create v1.0.0-stage-30` → 成功创建阶段，flow.json 中出现该 stage
2. `openfeel flow status` 可看到新阶段（plan_pending）
3. `openfeel help stage` 显示 `create` 子命令

---

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| `repair()` ops 修复改变 flow.json 结构 | 低 | 已有 stage 被错误修改 | `repair()` 只在 ops 缺失/非对象时重置，已有合法 ops 不受影响 |
| 非粗体正则过于宽泛导致误匹配 | 低 | 匹配非字段行 | 正则锚定行首 `- ` + 键名 + 冒号，精准匹配，不会跨行误匹配 |
| `stage create` 与 `flow stage add` 行为不一致 | 低 | 用户困惑 | 两者最终都调用 `FlowManager.addStage()`，行为一致 |
| `stage.ts` 新增 `FlowManager` 导入增加模块耦合 | 极低 | 循环依赖 | `FlowManager` 不导入 stage.ts，单向依赖安全 |

---

## 下一步

计划经 Reviewer 审查通过后，进入 Schemer 阶段制定细粒度操作方案（op-NNN.md），然后进入 Executor 执行。

> ⚠️ 流水线状态推进由 Feel 执行，Planner 不直接操作 flow.json。
