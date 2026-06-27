# REV-v2-stage-05: 交互式 CLI + 工具链补齐

> 审查阶段: v2-stage-05
> 审查时间: 2026-06-27 15:40
> 审查人: review-worker
> 编译: ✅ `npx tsc --noEmit` 0 错误
> 测试: ✅ 214/216 通过 (2 个失败为已有 .gitignore 问题)

---

## REV-v2-stage-05-001: initProject 添加 @vitest/coverage-v8 未检查 vitest 存在性

- **状态**: closed
- **优先级**: high
- **提出人**: review-worker
- **提出时间**: 2026-06-27 15:40

### 问题描述

`src/core/init.ts:117` 注释声明：

```ts
// 8. 检测 package.json，若存在 vitest 则添加 @vitest/coverage-v8
```

但实际代码（第 118-129 行）仅检查 `package.json` 文件是否存在，**未检查 vitest 是否在 `dependencies` 或 `devDependencies` 中**：

```ts
const pkgPath = resolve(projectPath, 'package.json');
if (existsSync(pkgPath)) {
    const pkgContent = readFileSync(pkgPath, 'utf-8');
    const pkg = JSON.parse(pkgContent);
    if (!pkg.devDependencies) {
      pkg.devDependencies = {};
    }
    if (!pkg.devDependencies['@vitest/coverage-v8']) {
      pkg.devDependencies['@vitest/coverage-v8'] = '^3.0.0';  // ← 未检查 vitest 存在性
      // ...
    }
}
```

### 影响范围

- 在未使用 vitest 的项目中执行 `openfeel init` 时，会在 `package.json` 中添加无用的 `@vitest/coverage-v8` 依赖
- `@vitest/coverage-v8` 的 peer dependency 是 vitest，无 vitest 时 npm/pnpm 会报 peer dep 警告

### 期望行为

应在添加 `@vitest/coverage-v8` 之前检查 vitest 是否存在于 `dependencies` 或 `devDependencies` 中：

```ts
const hasVitest = pkg.dependencies?.vitest || pkg.devDependencies?.vitest;
if (hasVitest && !pkg.devDependencies['@vitest/coverage-v8']) {
    // ... 添加 coverage-v8
}
```

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|
| 2026-06-27 14:45 | code-worker | 修复：添加 vitest 存在性检查，仅当 vitest 存在于 dependencies/devDependencies 中且 @vitest/coverage-v8 不存在时才添加；版本号从 vitest 主版本提取匹配 | - |

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-06-27 15:50 | review-worker | ✅ 通过 | vitest 存在性检查正确（dependencies + devDependencies），版本号从 vitest 主版本动态提取，不存在的项目不添加此依赖 |

---

## 审查结论（第二轮）

| 文件 | 结论 |
|------|------|
| `src/cli/repl.ts` | ✅ 通过 — node:readline 用法正确，exitOverride 正确，无循环依赖 |
| `src/cli/index.ts` | ✅ 通过 — 导出 startRepl，无循环依赖 |
| `bin/openfeel.js` | ✅ 通过 — 分发逻辑正确 (无参数→REPL，有参数→CLI) |
| `src/core/init.ts` | ✅ 已修复 — REV-001 已处理，添加了 vitest 存在性检查 |
| `src/core/archive/merge.ts` | ✅ 通过 — knowledge 导入路径正确，同步位置正确 |
| `src/utils/path.ts` | ✅ 通过 — resolveFileUrl/toFileUrl 跨平台正确处理 |
| `src/core/update.ts` | ✅ 通过 — schemer 版本锁定策略完整，archiver PipelinePhase 补全 |

### 整体评估

- **阻塞问题**: 1 个 (REV-001, high)
- **非阻塞提醒**: 0 个
- **建议**: 修复 REV-001 后即可推进到下一阶段

---

## 第二轮审查（修复验收）

> 审查时间: 2026-06-27 15:50

### REV-001 验收结果

- **修复文件**: `src/core/init.ts` (第 122-141 行)
- **vitest 存在性检查**: ✅ 正确检查 `dependencies?.vitest` 和 `devDependencies?.vitest`
- **依赖添加条件**: ✅ 仅当 vitest 存在且 coverage-v8 未添加时处理
- **版本号提取正则**: ✅ `^(?:[\^~]?)(\d+)` 正确提取主版本号，兼容 `^`/`~` 前缀
- **不存在的项目**: ✅ 无 vitest 不会添加 coverage-v8

### 全量复查

| 文件 | 结论 |
|------|------|
| `src/cli/repl.ts` | ✅ 无新增问题 |
| `src/cli/index.ts` | ✅ 无新增问题 |
| `bin/openfeel.js` | ✅ 无新增问题 |
| `src/core/init.ts` | ✅ REV-001 修复正确 |
| `src/core/archive/merge.ts` | ✅ 无新增问题 |
| `src/utils/path.ts` | ✅ 无新增问题 |
| `src/core/update.ts` | ✅ 无新增问题 |

### 第二轮整体评估

- **阻塞问题**: 0 个
- **非阻塞提醒**: 0 个
- **编译**: ✅ `npx tsc --noEmit` 0 错误
- **测试**: ✅ 214/216 通过 (2 个失败为已有 .gitignore 问题)
- **建议**: 审查通过，可推进至 `ready_for_test` 或 `done`
