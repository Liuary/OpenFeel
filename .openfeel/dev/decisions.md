# 决策记录（ADR）

> 长期技术/架构决策（技术选型、架构方向、跨会话有效的设计取舍）以 ADR 轻量格式记录于此。
> 会话临时决策（流程调整、单次取舍）记录在 .openfeel/users/{username}/dev_last.md 的「决策历史」节，不写入本文件。
> 写入时机：Feel 做出长期技术/架构决策时，同步追加一条 ADR 记录。

## ADR 模板

### ADR-{NNN}：{决策标题}
- **日期**：{yyyy-mm-dd}
- **状态**：proposed / accepted / superseded / deprecated
- **决策**：{一句话描述采纳的决策内容}
- **理由**：{为什么这样决策，含备选方案及取舍分析}

## ADR 记录

### ADR-001：技术栈选型 TypeScript (Node.js ≥20)
- **日期**：2026-08-15
- **状态**：accepted
- **决策**：OpenFeel 采用 TypeScript（Node.js ≥20）实现，核心依赖 Commander / Zod / YAML / fast-glob。
- **理由**：CLI 工具需类型安全与丰富生态；Zod 提供运行时校验，YAML 兼顾可读性与工具链成熟度。
