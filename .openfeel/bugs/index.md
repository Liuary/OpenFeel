# Bug 索引（公共域）

> 公共域 Bug 结论归档，按模块组织。私域 Bug 条目关闭后，核心结论与根因分析归入本目录对应模块文件。
> 复现步骤、详细报告与验收记录保留在私域 `.openfeel/users/{username}/bugs/{module}/`。

## 统计

| 状态 | 数量 |
|------|:--:|
| open | 3 |
| fixed | 0 |
| closed | 0 |
| **合计** | **3** |

> 说明：本目录常规收纳**已关闭** Bug 的核心结论。当前 3 条为 `v1.1.2-stage-41` 正式测试登记的 low 非阻塞缺陷，测试官显式要求归档沉淀（便于后续排期与追溯），故先行归档，状态仍为 `open`。

## 模块索引

### cli

| 编号 | 标题 | 优先级 | 状态 | 来源阶段 |
|------|------|:--:|:--:|----------|
| [BUG-001](cli.md) | `flow phases` 自描述 phase 与 `advance` 接受集合不一致（自定义 `pipeline.yaml` 下的第二信源） | low | open | v1.1.2-stage-41 |
| [BUG-002](cli.md) | 阶段目录冲突错误未走 i18n 键（en 下仍为中文）+ `common.stageDirConflictTmpl` 死键 | low | open | v1.1.2-stage-41 |

### archive

| 编号 | 标题 | 优先级 | 状态 | 来源阶段 |
|------|------|:--:|:--:|----------|
| [BUG-001](archive.md) | `openfeel archive` 对缺 `deps` 字段的存量阶段抛 TypeError（预存量缺陷） | low | open | v1.1.2-stage-41 |
