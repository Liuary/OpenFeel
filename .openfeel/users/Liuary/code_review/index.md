# 代码审查索引

> 按计划阶段分组索引，顶部统计各状态数量。

## 统计

| 状态 | 数量 |
|------|:--:|
| pending | 3 |
| fixing | 0 |
| resolved | 0 |
| closed | 0 |

## 各阶段审查

### v4.6-stage-01 — Vision Agent 全链路落地

- **审查文件**：[REV-v4.6-stage-01.md](REV-v4.6-stage-01.md)
- **审查时间**：2026-08-07 00:25
- **审查人**：Reviewer (GLM)
- **REV 条目**：3 条（1 阻塞 + 2 非阻塞）

| 编号 | 标题 | 优先级 | blocking | 状态 |
|------|------|:--:|:--:|:--:|
| REV-001 | kb/index.md architecture.md 摘要表遗漏 Vision 条目 | high | true | pending |
| REV-002 | vision.md 权限声明顺序与其他 Agent 不一致 | medium | false | pending |
| REV-003 | Vision bash 权限与"不执行文件写入"声明的潜在矛盾 | medium | false | pending |
