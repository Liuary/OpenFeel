# Bug 索引（公共域）

> 公共域 Bug 结论归档，按模块组织。私域 Bug 条目关闭后，核心结论与根因分析归入本目录对应模块文件。
> 复现步骤、详细报告与验收记录保留在私域 `.openfeel/users/{username}/bugs/{module}/`。

## 统计

| 状态 | 数量 |
|------|:--:|
| open | 7 |
| fixed | 0 |
| closed | 0 |
| **合计** | **7** |

> 说明：本目录常规收纳**已关闭** Bug 的核心结论。当前 7 条均为测试官显式要求归档沉淀（便于后续排期与追溯）的**未关闭**缺陷：
> - `v1.1.2-stage-41`：cli × 2（low 非阻塞）+ archive × 1（low 非阻塞）；
> - `v1.1.2-stage-42`：config × 2（`BUG-002` high 阻塞，实现层修复归 stage-46 REV-001；`BUG-003` medium 非阻塞）+ config × 1 遗留登记（`BUG-001` high，v0.4.4 时期的 `config set lang` 参数解析缺陷）；
> - `v1.1.2-stage-45`：templates × 1（`BUG-002` medium 非阻塞，模板权威源权限部署路径行未泛化；**处置归属 stage-47 缺陷清理**）。

## 模块索引

### cli

| 编号 | 标题 | 优先级 | 状态 | 来源阶段 |
|------|------|:--:|:--:|----------|
| [BUG-001](cli.md) | `flow phases` 自描述 phase 与 `advance` 接受集合不一致（自定义 `pipeline.yaml` 下的第二信源） | low | open | v1.1.2-stage-41 |
| [BUG-002](cli.md) | 阶段目录冲突错误未走 i18n 键（en 下仍为中文）+ `common.stageDirConflictTmpl` 死键 | low | open | v1.1.2-stage-41 |

### config

| 编号 | 标题 | 优先级 | 状态 | 来源阶段 |
|------|------|:--:|:--:|----------|
| [BUG-001](config.md) | `config set lang` 参数解析异常，功能完全不可用（Commander 路径词被当作参数） | high | open | v0.4.4（遗留登记） |
| [BUG-002](config.md) | `openfeel init` 无条件整体覆盖已存在的 `config.yaml`，静默丢失用户配置（实现层归 stage-46 REV-001） | high | open | v1.1.2-stage-42 |
| [BUG-003](config.md) | `config effective` 在无 `profile.yaml` 时 `auto_advance` 来源标为 `profile.yaml` 而非 `builtin` | medium | open | v1.1.2-stage-42 |

### archive

| 编号 | 标题 | 优先级 | 状态 | 来源阶段 |
|------|------|:--:|:--:|----------|
| [BUG-001](archive.md) | `openfeel archive` 对缺 `deps` 字段的存量阶段抛 TypeError（预存量缺陷） | low | open | v1.1.2-stage-41 |

### templates

| 编号 | 标题 | 优先级 | 状态 | 来源阶段 |
|------|------|:--:|:--:|----------|
| [BUG-002](templates.md) | 全局约束模板 `agents-md` 权限部署路径行未泛化（与仓库根 `AGENTS.md:122` 同类表述处理不一致；双源不同步） | medium | open | v1.1.2-stage-45 |

> 注：templates 模块另有 `BUG-001`（事务官标识列未加前缀）已于 `v1.1.2-stage-41` 关闭，未纳入本目录（仅在私域 `.openfeel/users/Liuary/bugs/templates/` 保留详细报告）。
