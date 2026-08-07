# op-006：添加 Reviewer "过度设计"审查维度
- **阶段**：v4.6-stage-02
- **前置**：op-003 (hard)
- **负责 Agent**：Executor
- **最多重试**：3

## 目标

在 Reviewer 审查维度表的"规范性"行下新增"过度设计"子维度，中英文 Reviewer 模板同步修改。

## 参考

- 参见 kb/architecture.md #多语言模板数据管线 — Reviewer 模板修改后由 build.js 自动注入 template-loader.ts

## 插入位置

在审查维度表中，"规范性"行之后、"安全性"之前，插入一行：

```
| | 过度设计 | （内容） |
```

中英文对应内容如下：

| 语言 | 原文（插入位置之前） | 新增行 |
|------|------|------|
| zh-CN | `| 规范性 \| — \| 是否符合项目编码规范（AGENTS.md）\|` (行 27) | `\| \| 过度设计 \| 是否存在无复用需求的抽象层、设计模式包装或过度工程化（参见 AGENTS.md 第 2 条）\|` |
| en | `\| Compliance \| — \| Whether it adheres to project coding conventions (AGENTS.md) \|` (行 27) | `\| \| Over-Engineering \| Whether abstraction layers, design pattern wrappers, or excessive engineering exist without reuse requirements (see AGENTS.md Rule 2) \|` |

## 实施步骤

### 批 A：zh-CN/Reviewer 模板

- [ ] Step A1：定位 `src/core/templates-data/agents/zh-CN/reviewer.md` 第 27 行

```
| 规范性 | — | 是否符合项目编码规范（AGENTS.md） |
```

- [ ] Step A2：在第 27 行后插入新行（第 28 行，原"安全性"行顺延为第 29 行）

```
| | 过度设计 | 是否存在无复用需求的抽象层、设计模式包装或过度工程化（参见 AGENTS.md 第 2 条） |
```

> 使用 `edit` 工具精确替换。oldString 取整行 `| 规范性 | — | 是否符合项目编码规范（AGENTS.md） |`，newString 取其 + `\n` + 上述新行。

- [ ] Step A3：目视确认修改后维度表结构：

```
| 正确性 | — | 实现是否符合方案目标，功能逻辑是否正确 |
| 规范性 | — | 是否符合项目编码规范（AGENTS.md） |
| | 过度设计 | 是否存在无复用需求的抽象层、设计模式包装或过度工程化（参见 AGENTS.md 第 2 条） |
| 安全性 | — | 是否存在安全隐患（注入、越权、泄露等） |
```

### 批 B：en/Reviewer 模板

- [ ] Step B1：定位 `src/core/templates-data/agents/en/reviewer.md` 第 27 行

```
| Compliance | — | Whether it adheres to project coding conventions (AGENTS.md) |
```

- [ ] Step B2：在第 27 行后插入新行（同上）

```
| | Over-Engineering | Whether abstraction layers, design pattern wrappers, or excessive engineering exist without reuse requirements (see AGENTS.md Rule 2) |
```

> 使用 `edit` 工具精确替换。oldString 取整行 `| Compliance | — | Whether it adheres to project coding conventions (AGENTS.md) |`，newString 取其 + `\n` + 上述新行。

### 批 C：验证

- [ ] Step C1：运行 `npm run build`，确认构建成功（build.js 将更新 template-loader.ts 中的 reviewer 模板）
- [ ] Step C2：目视确认两语言模板新增行语义对应、AGENTS.md 引用一致

## 产出文件

- `src/core/templates-data/agents/zh-CN/reviewer.md`（修改，+1 行）
- `src/core/templates-data/agents/en/reviewer.md`（修改，+1 行）
- `src/core/template-loader.ts`（构建后自动更新）

## 自测清单

- [ ] zh-CN reviewer.md 第 28 行为"过度设计"子维度行
- [ ] en reviewer.md 第 28 行为"Over-Engineering"子维度行
- [ ] 新行引用 AGENTS.md（zh-CN：第 2 条，en：Rule 2）
- [ ] 表格结构无破坏：对齐符 `|` 和连字符 `---` 数量一致
- [ ] `npm run build` 退出码 0
