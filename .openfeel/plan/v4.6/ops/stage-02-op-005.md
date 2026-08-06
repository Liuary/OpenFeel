# op-005：同步 AGENTS 模板到 template-loader.ts
- **阶段**：v4.6-stage-02
- **前置**：op-003 (hard)
- **负责 Agent**：Executor
- **最多重试**：3

## 目标

将 op-003 中对 `AGENTS.md` 的修改同步到 `template-loader.ts` 中 `AGENTS_MD_TEMPLATES` 的 en 和 zh-CN 两个语言模板，确保 `openfeel init` 生成的 AGENTS.md 与项目自身 AGENTS.md 内容一致。

## 参考

- 参见 kb/architecture.md #多语言模板数据管线 — 模板修改后由 build.js 自动注入，但本文件中的 `AGENTS_MD_TEMPLATES` 位于 AUTO-GENERATED 块**之外**，可直接手动编辑
- 注意：此处修改的是 GENERATED 块中手工维护的模板常量，修改后仍需运行 `npm run build` 验证完整性

> ⚠️ 重要说明：虽然 `AGENTS_MD_TEMPLATES` 区域以 `AUTO-GENERATED-BEGIN/END` 标记包围，但与 `AGENT_TEMPLATES` 不同，此处的模板内容实际由 build.js 从 `templates-data/agents-md/` 读取。然而，当前 build.js 尚未涵盖 AGENTS_MD_TEMPLATES 的自动化生成，因此需要手动同步。修改后运行 `npm run build` 确认构建脚本不会覆盖手动修改。

## 涉及行号

| 语言 | 行号 | 修改内容 |
|------|------|----------|
| en | ~2235-2239 | 英文约束#2 的 4 条判定项之后追加代码层/架构层说明（英文翻译） |
| zh-CN | ~2295-2299 | 中文约束#2 的 4 条判定项之后追加代码层/架构层说明（与 AGENTS.md 一致） |

## 实施步骤

### 批 A：修改 en 模板

- [ ] Step A1：定位 `template-loader.ts` 第 2239 行（en 模板中 `When the user explicitly requests a simple implementation, the above thresholds are automatically lowered.` 之后）

- [ ] Step A2：在该行后插入以下 3 行英文翻译：

```
    This rule constrains both code implementation and architectural design:
    - Code level: Avoid meaningless abstraction layers, excessive wrapping, and unnecessary design patterns
    - Architecture level: Do not introduce base classes, middleware, or design pattern wrappers without reuse requirements
```

> 使用 `edit` 工具精确替换。oldString 取 `When the user explicitly requests a simple implementation, the above thresholds are automatically lowered.`（原 2239 行），newString 取其 + 上述 3 行。

### 批 B：修改 zh-CN 模板

- [ ] Step B1：定位 `template-loader.ts` 第 2299 行（zh-CN 模板中 `用户明确要求简洁实现时，以上阈值自动降低。` 之后）

- [ ] Step B2：在该行后插入与 op-003（AGENTS.md）完全一致的 3 行：

```
    本规则同时约束代码实现与架构设计：
    - 代码层面：避免无意义的抽象层、过度包装、不必要的设计模式
    - 架构层面：无复用需求时不引入基类、中间件或设计模式包装
```

> 使用 `edit` 工具精确替换。oldString 取 `用户明确要求简洁实现时，以上阈值自动降低。`（原 2299 行），newString 取其 + 上述 3 行。

### 批 C：验证

- [ ] Step C1：运行 `npm run build`，确认构建成功、构建脚本未覆盖手动修改
- [ ] Step C2：对比确认 en 和 zh-CN 模板的新增内容语义对应（代码层/架构层分离措辞一致）

## 产出文件

- `src/core/template-loader.ts`（修改，约 +6 行）

## 自测清单

- [ ] en 模板约束#2 新增 3 行英文代码层/架构层说明
- [ ] zh-CN 模板约束#2 新增 3 行中文代码层/架构层说明（与 AGENTS.md 完全一致）
- [ ] `npm run build` 退出码 0
- [ ] 两个模板的新增内容语义对应、无遗漏
- [ ] 对比 AGENTS.md 第 24-26 行与 zh-CN 模板的对应行，内容一致
