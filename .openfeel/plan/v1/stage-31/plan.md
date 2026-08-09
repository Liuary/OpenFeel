# Plan — stage-31: Pantheogen CLI 体验优化 (4 项)

> **版本**：v1.0.0-stage-31
> **创建日期**：2026-08-09
> **Planner**：独立 Planner（推理模型 DeepSeek V4 Pro）
> **规模判定**：中等规模（单阶段、3 文件、4 个独立操作、i18n 双语言同步要求）
> **来源**：Pantheogen 项目 Bug 报告 #4~#7（#1~#3 已在 stage-30 修复）

---

## 知识库参考

| 条目 | 路径 | 相关性 |
|------|------|--------|
| Flow CLI 严格校验 | kb/architecture.md | 与问题 #6（跳转失败提示增强）和 #7（dry-run 合法性预览）直接相关，当前错误提示过于简略 |
| CLI 国际化封装模式 | kb/patterns.md | 所有 4 个问题的 CLI 输出均通过 `t()` 函数和 `{domain}.{module}.{name}` 键命名体系，新增/修改提示文本需同步更新 zh-CN.ts + en.ts |
| 双语 CLI 交互模式 | kb/patterns.md | 问题 #5 的 wizard 交互式创建阶段涉及 `@inquirer/prompts` 交互，需保证中英双语体验一致 |

---

## 背景与动机

来自外部项目 Pantheogen 的 Bug 报告（第二份），stage-30 已修复 3 个核心 Bug（flow-manager 加载崩溃、正则兼容性、stage create 入口），本阶段修复剩余 4 个 CLI 体验问题：

| # | 问题 | 现象 | 期望 |
|---|------|------|------|
| 4 | `flow advance` 缺少 `--stage` 时提示不友好 | 仅报错 "必须指定阶段 ID"，新用户不知下一步 | 增加引导——提示先创建阶段 |
| 5 | `flow wizard` 无阶段时静默退出 | 输出"无可用阶段"后 return，用户需手动退出向导后创建阶段 | 交互式询问是否创建首个阶段，输入 ID 后自动创建并继续 |
| 6 | 跳转失败不显示当前 phase 和合法目标 | 仅报 "当前 phase 无法跳转到 X"，用户不知当前在哪、能去哪 | 额外输出当前 phase 和所有合法跳转目标 |
| 7 | `flow advance` 无 `--dry-run` 预览 | 无法提前验证推进操作是否合法 | 新增 `--dry-run` 标志，验证合法性后输出预览信息 |

---

## 工作阶段

### Stage-31-01：四项 CLI 体验优化

> **目标**：修复 4 个 CLI 体验问题，提升新用户首次使用和错误排查时的信息密度。
> **前置依赖**：无（4 个操作相互独立，分别修改 flow.ts 不同区域）
> **预计涉及文件数**：3 个（`src/commands/flow.ts`、`src/core/i18n-data/zh-CN.ts`、`src/core/i18n-data/en.ts`）

#### 任务分解

| # | 任务 | 问题 | 描述 | 涉及文件 |
|---|------|:--:|------|----------|
| 1 | `--stage` 缺失提示增强 | #4 | 修改 i18n 键 `flow.advance.errorNoStage`，增加创建阶段的引导文案 | MODIFY: `src/core/i18n-data/zh-CN.ts`, `src/core/i18n-data/en.ts` |
| 2 | Wizard 无阶段时交互式创建 | #5 | 替换静默退出为交互式流程：询问→输入 ID→创建阶段→重新进入主循环 | MODIFY: `src/commands/flow.ts`<br>MODIFY: `src/core/i18n-data/zh-CN.ts`<br>MODIFY: `src/core/i18n-data/en.ts` |
| 3 | 跳转失败增强诊断信息 | #6 | 在 `hasTransition()` 返回 false 时额外输出当前 phase 和合法目标列表 | MODIFY: `src/commands/flow.ts`<br>MODIFY: `src/core/i18n-data/zh-CN.ts`<br>MODIFY: `src/core/i18n-data/en.ts` |
| 4 | advance 新增 `--dry-run` 预览 | #7 | 新增 `--dry-run` 选项，验证合法性后输出预览信息（stage、from phase → to phase），不实际修改 flow.json | MODIFY: `src/commands/flow.ts`<br>MODIFY: `src/core/i18n-data/zh-CN.ts`<br>MODIFY: `src/core/i18n-data/en.ts` |

---

## 详细技术方案

### 问题 #4：`--stage` 缺失提示增强

**当前代码**（i18n 键 `flow.advance.errorNoStage`）：

```
zh: '错误：--stage 参数必须指定阶段 ID（如 stage-03）'
en: 'Error: --stage parameter must specify a stage ID (e.g. stage-03)'
```

**修改为**：

```
zh: '错误：--stage 参数必须指定阶段 ID（如 stage-03）。如果是新项目，请先运行 openfeel stage create <id> 创建阶段。'
en: 'Error: --stage parameter must specify a stage ID (e.g. stage-03). If this is a new project, run openfeel stage create <id> first.'
```

> **说明**：仅修改 i18n 文本，不涉及代码逻辑变更。`flow.ts` L369 的 `t('flow.advance.errorNoStage', lang)` 调用无需修改。

### 问题 #5：Wizard 无阶段时交互式创建

**当前代码**（`flow.ts` L1019-1022）：
```typescript
if (stages.length === 0) {
  console.log(t('flow.wizard.noStages', lang));
  return;
}
```

**修改为交互式创建流程**：

```typescript
if (stages.length === 0) {
  console.log(t('flow.wizard.noStages', lang));

  const { select: sel, input: inp } = await import('@inquirer/prompts');
  const shouldCreate = await sel({
    message: t('flow.wizard.createPrompt', lang),
    choices: [
      { name: t('flow.wizard.createYes', lang), value: 'yes' },
      { name: t('flow.wizard.createNo', lang), value: 'no' },
    ],
  });

  if (shouldCreate === 'yes') {
    const stageId = await inp({
      message: t('flow.wizard.createInput', lang),
      validate: (val: string) => {
        if (!val.trim()) return t('flow.wizard.createEmpty', lang);
        return true;
      },
    });
    mgr.addStage(stageId.trim());
    mgr.save();
    console.log(t('flow.wizard.createdTmpl', lang, { stage: stageId.trim() }));
    continue; // 重新进入主循环，此时 stages 已非空
  } else {
    console.log(t('flow.wizard.createSkipped', lang));
    return;
  }
}
```

**新增 i18n 键**：

| 键 | 中文 | 英文 |
|----|------|------|
| `flow.wizard.createPrompt` | 当前无任何阶段，是否创建首个阶段？ | No stages exist. Create the first stage? |
| `flow.wizard.createYes` | 是，创建新阶段 | Yes, create a stage |
| `flow.wizard.createNo` | 否，退出向导 | No, exit wizard |
| `flow.wizard.createInput` | 请输入阶段 ID（如 stage-01） | Enter stage ID (e.g. stage-01) |
| `flow.wizard.createEmpty` | 阶段 ID 不能为空 | Stage ID cannot be empty |
| `flow.wizard.createdTmpl` | ✓ 已创建阶段: {stage}，正在进入向导... | ✓ Stage created: {stage}, entering wizard... |
| `flow.wizard.createSkipped` | 已跳过阶段创建，退出向导。 | Stage creation skipped, exiting wizard. |

> **技术要点**：
> - 使用 `@inquirer/prompts` 的 `select` 和 `input`（均已在 wizard 中动态导入）
> - `continue` 而非 `return`——创建成功后重新进入主循环，自动选择新阶段继续推进
> - `mgr.addStage()` + `mgr.save()` 创建 flow.json 条目，与 `flow stage add` 行为一致
> - 用户选择"否"时退出向导，保持原有退出行为

### 问题 #6：跳转失败增强诊断信息

**当前代码**（`flow.ts` L416-424）：
```typescript
// 阶段跳跃保护：基于 stage phase 检查当前 phase 到目标 phase 是否存在直接路径
if (!options.force) {
  const phaseResult = PipelinePhaseSchema.safeParse(options.to);
  if (phaseResult.success && !mgr.hasTransition(options.to, options.stage)) {
    console.error(t('flow.advance.errorPhaseJumpTmpl', lang, { stage: options.stage || '', to: options.to }));
    console.error(t('flow.advance.hintUseForce', lang));
    process.exit(1);
  }
}
```

**修改为**：
```typescript
if (!options.force) {
  const phaseResult = PipelinePhaseSchema.safeParse(options.to);
  if (phaseResult.success && !mgr.hasTransition(options.to, options.stage)) {
    // 获取当前 phase 和合法目标列表
    const data = mgr.getData();
    const currentPhase = data?.stages[options.stage || '']?.phase ?? t('common.unknown', lang);
    const availableTargets = mgr.getAvailablePhases(options.stage);

    console.error(t('flow.advance.errorPhaseJumpTmpl', lang, { stage: options.stage || '', to: options.to }));
    console.error(t('flow.advance.currentPhaseTmpl', lang, { phase: currentPhase }));
    if (availableTargets.length > 0) {
      console.error(t('flow.advance.availableTargets', lang) + `: [${availableTargets.join(', ')}]`);
    } else {
      console.error(t('flow.advance.noAvailableTargets', lang));
    }
    console.error(t('flow.advance.hintUseForce', lang));
    process.exit(1);
  }
}
```

**新增/修改 i18n 键**：

| 键 | 中文 | 英文 |
|----|------|------|
| `flow.advance.currentPhaseTmpl` | 当前阶段 phase: {phase} | Current phase: {phase} |
| `flow.advance.availableTargets` | 合法跳转目标 | Available targets |
| `flow.advance.noAvailableTargets` | 当前 phase 无合法跳转目标 | No available targets from current phase |

> **API 使用**：`mgr.getAvailablePhases(stageId)` 已在 wizard 中验证可用（L1057），返回 `PipelinePhase[]`。`mgr.getData()?.stages[stageId]?.phase` 获取当前 phase。

### 问题 #7：advance 新增 `--dry-run` 预览

**修改位置**：`flow.ts` L358-494（flow advance 命令定义）。

**新增选项**：在 `.option('--force', ...)` 后追加：
```typescript
.option('--dry-run', '仅验证不执行修改（预览输出）')
```

**action 中处理**：在 `advanceStagePhase()` + `save()` 之前（即 L461 `mgr.advanceStagePhase(...)` 之前），插入 dry-run 判断：

```typescript
// --dry-run：仅验证合法性，不实际修改 flow.json
if (options.dryRun) {
  const data = mgr.getData();
  const fromPhase = data?.stages[options.stage]?.phase ?? t('common.unknown', lang);
  const toPhase = options.to;

  console.log(t('flow.advance.dryRunTitle', lang));
  console.log(`  ` + t('common.stage', lang) + `: ${options.stage}`);
  console.log(`  ` + t('flow.advance.dryRunFrom', lang) + `: ${fromPhase}`);
  console.log(`  ` + t('flow.advance.dryRunTo', lang) + `: ${toPhase}`);
  console.log('');
  console.log(t('flow.advance.dryRunOk', lang));
  return;
}
```

> **插入位置**：在 L459 `let archived = false;` 之前。dry-run 需要先通过所有校验（格式校验、非法 phase 校验、阶段跳跃保护、REV 阻塞检查），仅在最终执行前截断。

**新增 i18n 键**：

| 键 | 中文 | 英文 |
|----|------|------|
| `flow.advance.dryRunTitle` | ═══ Dry-run 预览 ═══ | ═══ Dry-run Preview ═══ |
| `flow.advance.dryRunFrom` | 当前阶段 | Current phase |
| `flow.advance.dryRunTo` | 目标阶段 | Target phase |
| `flow.advance.dryRunOk` | ✓ 合法性验证通过，未实际修改 flow.json。去掉 --dry-run 后正式执行。 | ✓ Validation passed. No changes were made to flow.json. Remove --dry-run to execute. |

> **注意**：
> - dry-run 仍需通过所有前置校验（格式校验 P0、非法 phase 校验 P1、阶段跳跃保护、REV 阻塞检查），确保预览结果准确反映实际推进的合法性
> - `--force` + `--dry-run` 组合：`--force` 跳过 P1 校验和阶段跳跃保护，但 dry-run 仍不会实际修改。此时输出的是"如果强制执行"的预览

---

## 依赖关系

```yaml
stages:
  stage-31-01:
    depends_on: []
    dependency_type: null
    description: 四项 CLI 体验优化 — 相互独立，修改 flow.ts 不同区域，无执行顺序约束
```

四个操作相互独立：
- op-001（问题 #4）：仅改 i18n 文本，不涉及代码逻辑
- op-002（问题 #5）：改 flow.ts wizard 区域 L1019-1022 + i18n 新增 7 个键
- op-003（问题 #6）：改 flow.ts advance 区域 L416-424 + i18n 新增 3 个键
- op-004（问题 #7）：改 flow.ts advance 区域 L358-494 + i18n 新增 4 个键

op-003 和 op-004 虽然都修改 advance 区域，但位置不同（op-003 在 L416-424，op-004 在 L358 选项声明 + L459 执行前），无冲突风险。

**建议执行顺序**：op-001 → op-002 → op-003 → op-004（按问题编号递增，便于追踪）

---

## 测试策略

### 自测清单

- [ ] `npm run build` 成功，无 TypeScript 编译错误
- [ ] 现有测试套件（399/399）无回归
- [ ] `openfeel lint i18n` 通过，zh-CN.ts 和 en.ts 键对称

### 问题 #4 验证

1. 执行 `openfeel flow advance --to plan_pending`（不带 `--stage`）
2. 确认错误提示包含创建阶段的引导文案："如果是新项目，请先运行 openfeel stage create <id> 创建阶段。"
3. 切换英文语言，确认英文提示同样包含引导文案

### 问题 #5 验证

1. 在 `stages: {}`（无阶段）的项目中执行 `openfeel flow wizard`
2. 确认显示提示"当前无任何阶段，是否创建首个阶段？"
3. 选择"是"，输入 stage ID（如 `test-stage`）
4. 确认创建成功，flow.json 中出现该阶段（plan_pending）
5. 确认向导自动进入该阶段的选择/推进流程
6. 重新进入 wizard，选择"否"，确认退出向导
7. 验证 `flow.json` 中 stages 不为空时 wizard 正常显示阶段列表

### 问题 #6 验证

1. 创建一个阶段，将其 phase 手动设为 `done`（或使用已有 done 阶段）
2. 执行 `openfeel flow advance --stage <done-stage> --to exec_running`（非法跳转）
3. 确认错误输出包含：
   - 当前阶段 phase: `done`
   - 合法跳转目标: `[done]`（或无合法目标：done 是终态）

### 问题 #7 验证

1. 执行 `openfeel flow advance --stage <stage-id> --to plan_review --dry-run`
2. 确认输出预览信息（stage ID、from phase → to phase）
3. 确认 flow.json 未被修改（phase 不变）
4. 执行 `openfeel flow advance --stage <stage-id> --to invalid_phase --dry-run`
5. 确认 dry-run 也检测非法 phase 并报错（校验在 dry-run 之前）
6. 执行 `openfeel flow advance --stage <stage-id> --to plan_review`（不带 --dry-run）
7. 确认正常推进（dry-run 不影响正常流程）

---

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| op-002 wizard 动态导入 `input` 失败 | 极低 | wizard 无阶段时崩溃 | `@inquirer/prompts` 的 `input` 与 `select` 同包，已有 try-catch 兜底 |
| op-002 创建的 stage ID 重复 | 低 | `addStage()` 抛异常，wizard 中断 | `addStage()` 已有重复检测，异常被 wizard 外层 try-catch 捕获 |
| op-003 `getAvailablePhases()` 返回空 | 低 | 显示"无合法跳转目标"——对 done 阶段属正常行为 | 已通过 if/else 区分"有目标"和"无目标"两种情况 |
| op-004 `--dry-run` + `--force` 组合跳过 P1 校验 | 低 | 预览信息可能不反映实际推进时的校验结果 | dry-run 输出中注明 `--force` 生效（若同时指定） |

---

## 下一步

计划经 Reviewer 审查通过后，进入 Schemer 阶段制定细粒度操作方案（op-NNN.md），然后进入 Executor 执行。

> ⚠️ 流水线状态推进由 Feel 执行，Planner 不直接操作 flow.json。
