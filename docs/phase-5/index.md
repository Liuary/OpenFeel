# 五期：外部实践反馈归档

> 来源：OpenFeel 的**下游使用项目**（Pantheogen，Godot/.NET 项目）在真实使用中提交的反馈文档，原文归档，供框架维护参考。
> 归档日期：2026-09-28

## 文档清单

| 文件 | 视角 | 主题 |
|------|------|------|
| [06-openfeel-tooling-feedback.md](06-openfeel-tooling-feedback.md) | CLI 工具链 | 「计划 → 流水线」落地环节的自描述与纠错能力缺口（9 条，含改进建议汇总表） |
| [07-openfeel-permission-issue.md](07-openfeel-permission-issue.md) | 权限模型 | agent 级 `permission` 覆盖项目顶层配置 + 模板遗漏 `external_directory`，导致项目级「全程免审」失效 |
| [08-openfeel-workflow-feedback.md](08-openfeel-workflow-feedback.md) | 流水线状态维护 | 「创建侧齐备、纠正/清理侧空白」——孤儿 op 无法回收、结构字段无 CLI、阶段注册语义不一致等 11 条 |

## 处置

两份反馈经 Feel 逐条代码核实后纳入 v1.1.2 版本计划处理：工具链 9 条见 stage-41 / stage-42，权限模型见 stage-44，平台无关化见 stage-45（对应 07 文档「改进建议」中的 schema/文档泛化诉求）。

第三份反馈（08）经核实后纳入 v1.1.2 后续阶段处理；与 stage-50（全量审查 non-blocking 清理）存在重叠，重叠项已去重。
