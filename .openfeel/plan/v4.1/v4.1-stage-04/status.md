# v4.1-stage-04 状态 — Agent 去语言特化

- **执行模式**：manual
- **自动推进**：disabled
- **状态**：done
- **更新时间**：2026-07-07

## 当前任务

- [x] 4.1 feel.md: .ts→源码, npm→依赖管理
- [x] 4.2 feel-tester.md: vitest/npm→通用描述
- [x] 4.3 schemer.md: vitest示例加"例如在Node.js项目中"上下文
- [x] 4.4 executor.md: 确认无语言特化

## 修改摘要

| 文件 | 修改前 | 修改后 |
|:--|:--|:--|
| feel.md | `修改 .ts 源码`、`npm 依赖变更` | `修改源码`、`依赖变更` |
| feel-tester.md | `vitest测试用例`、`npm test`（4处） | `项目测试框架`、`测试命令` |
| schemer.md | `@vitest/coverage-v8 3.0.0` | `测试覆盖率工具 + 例如在Node.js项目中` |

## 原则

> 职责特化 ≠ 语言特化。Agent 只能干"一类事情"但可以干"多种事情"。
