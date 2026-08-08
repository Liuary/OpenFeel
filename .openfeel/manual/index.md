# 项目模块手册

> 分级模块文档系统，由归档官在归档时维护更新。每次归档阶段，若涉及以下模块的变更，须同步更新对应文档。

## 模块树

- 核心引擎
  - [流水线管理](core/flow-manager.md)
  - [配置管理](core/config.md)
  - [项目初始化](core/init.md)
- CLI 层
  - [命令体系](cli/commands.md)
- Agent 体系
  - [Agent 设计](agents/feel.md)

## 维护规则

| 模块 | 对应文档 | 归档时检查点 |
|------|----------|--------------|
| flow.json / 流水线推进 | `core/flow-manager.md` | 核心 API 或状态机变更 |
| config.yaml / profile.yaml | `core/config.md` | 配置层级或读写方法变更 |
| init.ts / 项目初始化 | `core/init.md` | 初始化流程、API 或部署逻辑变更 |
| 命令注册 / i18n | `cli/commands.md` | 新增命令组或翻译机制变更 |
| Agent 体系 / 调度模型 | `agents/feel.md` | Agent 数量、模型或调度规则变更 |

> 新增模块时在「模块树」中追加条目，并创建对应文档。
