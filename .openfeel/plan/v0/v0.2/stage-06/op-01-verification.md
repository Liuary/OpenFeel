# op-01：统一 stages/ 路径 — 验证报告

- **验证时间**：2026-06-27
- **验证人**：CodeWorker Agent
- **目标**：确认代码层全部使用 `.openfeel/stages/`，根目录无残留 `stages/` 目录

## 验证项

| # | 检查点 | 文件 | 行号 | 结果 |
|---|--------|------|------|------|
| 1 | 路径使用 `.openfeel/stages/` | `src/core/plan/stage.ts` | L25 | ✅ 通过 |
| 2 | 路径使用 `.openfeel/stages/` | `src/core/plan/scheme.ts` | L6, L163 | ✅ 通过 |
| 3 | WORKSPACE_DIRS 包含 `'stages'` | `src/core/workspace/structure.ts` | L20 | ✅ 通过 |
| 4 | init 调用 `createWorkspace()` 创建 stages/ | `src/core/init.ts` | L53 | ✅ 通过 |
| 5 | 根目录下不存在 `stages/` | glob `stages/**` | N/A | ✅ 通过（No files found） |

## 详细验证

### 1. `src/core/plan/stage.ts`

```
L25: const stagesDir = resolve(projectPath, '.openfeel', 'stages');
L111: const stagesDir = resolve(projectPath, '.openfeel', 'stages');
```

`addStage()` 和 `listStages()` 均使用 `.openfeel/stages/` 路径，无根目录引用。

### 2. `src/core/plan/scheme.ts`

```
L6:  * 负责 .openfeel/stages/{stage}/ops/ 下的操作方案文件 CRUD
L163: const opsDir = resolve(projectPath, '.openfeel', 'stages', stageName, 'ops');
L193: const stagesDir = resolve(projectPath, '.openfeel', 'stages');
```

`createScheme()`、`getScheme()`、`listSchemes()` 均使用 `.openfeel/stages/` 路径。

### 3. `src/core/workspace/structure.ts`

```
L20: 'stages',
```

`WORKSPACE_DIRS` 数组包含 `'stages'`，在 `createWorkspace()` 中会作为 `.openfeel/stages/` 创建。

### 4. `src/core/init.ts`

```
L53: const dirs = createWorkspace(projectPath);
```

`initProject()` 调用 `createWorkspace()` 创建完整的 `.openfeel/` 目录结构，包括 `stages/` 子目录。

### 5. 根目录检查

对项目根目录执行 `glob('stages/**')` —— 无结果。根目录下不存在 `stages/` 目录。

## 结论

✅ **全部 5 项验证通过**。所有代码路径均使用 `.openfeel/stages/`，不存在根目录 `stages/` 残留。路径统一任务在代码层面已彻底完成。
