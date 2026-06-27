# REV-stage-01：项目骨架与构建体系审查

> 审查时间：2026-06-25
> 审查人：ReviewWorker
> 阶段：stage-01

---

## REV-01: eslint.config.js 依赖缺失 — `typescript-eslint` 未在 devDependencies 中声明

- **状态**：closed
- **优先级**：high
- **提出人**：ReviewWorker
- **提出时间**：2026-06-25 21:45

### 问题描述

`eslint.config.js` 第 2 行：

```js
import tseslint from "typescript-eslint";
```

但 `package.json` 的 `devDependencies` 中未声明 `typescript-eslint` 包。当前 `devDependencies` 仅有：

- `typescript`
- `vitest`
- `@types/node`
- `eslint`

运行 `npx eslint .` 或任何依赖 ESLint 的命令将因模块解析失败而报错。

### 影响范围

- ESLint 无法正常工作（CI 虽未运行 lint，但本地开发中 ESLint 校验会失败）
- `npm ls typescript-eslint` 会显示缺失

### 修复建议

在 `devDependencies` 中添加 `typescript-eslint`（版本与 `eslint ^9.0.0` 兼容，推荐 `^8.0.0`）：

```json
"devDependencies": {
  "typescript": "^5.7.0",
  "vitest": "^3.0.0",
  "@types/node": "^22.0.0",
  "eslint": "^9.0.0",
  "typescript-eslint": "^8.0.0"
}
```

添加后执行 `npm install` 确保依赖正确解析。

### 处理记录

| 时间 | 操作者 | 说明 | Commit |
|------|--------|------|--------|
| 2026-06-25 22:00 | code-worker | 修复：在 package.json devDependencies 中添加 "typescript-eslint": "^8.0.0"，执行 npm install，ESLint 运行通过 | - |

### 验收记录

| 时间 | 验收人 | 结论 | 备注 |
|------|--------|------|------|
| 2026-06-25 22:10 | ReviewWorker | 通过 | typescript-eslint 已在 devDependencies 中声明，npx eslint src/cli/index.ts 运行无报错 |