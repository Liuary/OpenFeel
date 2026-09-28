# Bug 归档索引（公共域）

> 汇总各模块 Bug 归档结论（按模块组织）。私域 Bug 条目关闭后，核心结论归入本目录对应模块文件。
> 详细登记、复现步骤与验收记录见私域 `.openfeel/users/{username}/bugs/{module}/`。

## 统计

| 状态 | 数量 |
|------|:--:|
| open | 1 |
| fixed | 0 |
| closed | 7 |
| **合计** | **8** |

> **v1.1.2-stage-47 集中清理收口（2026-09-29，commit `2fb38fa`）**：6 个 `resolved` Bug 经 openfeel-feel-tester 隔离端到端验收**全部通过并关闭**（每条的根因 / 修法 / **防再犯** 三要素已写入对应模块文件）；`config/BUG-001` 复核维持 closed。验收中新登记 `config/BUG-004`（medium，测试隔离缺口，非阻塞，**归档官裁定归属 `v1.1.2-stage-43`**——发布前清零点，含 455 条历史死映射评估）。
>
> 本批共性防再犯（跨模块）：① **写策略按资产归属二分**（用户配置不覆盖 / 框架资产备份后覆盖，见 `config/BUG-002`）；② **文案变更收尾必做关键句全仓 `rg`**（见 `templates/BUG-002`，与 `templates/BUG-001` 同模式重复发生）；③ **测试禁止直写真实全局目录**（保存/恢复≠隔离，见 `config/BUG-004`）。

## 模块索引

### cli

| 编号 | 标题 | 优先级 | 状态 | 来源阶段 |
|------|------|:--:|:--:|----------|
| [BUG-001](cli.md) | `flow phases` 自描述 phase 与 `advance` 接受集合不一致（自定义 `pipeline.yaml` 下的第二信源） | low | **closed** | v1.1.2-stage-41 |
| [BUG-002](cli.md) | 阶段目录冲突错误未走 i18n 键（en 下为中文）+ `common.stageDirConflictTmpl` 死键 | low | **closed** | v1.1.2-stage-41 |

### config

| 编号 | 标题 | 优先级 | 状态 | 来源阶段 |
|------|------|:--:|:--:|----------|
| [BUG-001](config.md) | `config set lang` 参数解析异常（Commander 参数吞噬） | high | **closed** | v0.4.4（遗留） |
| [BUG-002](config.md) | `openfeel init` 无条件覆盖已存在的 `config.yaml`（数据丢失；stage-46 缓解 → **stage-47 语义修复**） | high | **closed** | v1.1.2-stage-42 |
| [BUG-003](config.md) | `config effective` 无 `profile.yaml` 时 `auto_advance` 来源标为 `profile.yaml` 而非 `builtin` | medium | **closed** | v1.1.2-stage-42 |
| [BUG-004](config.md) | `test/core/workspace/identity.test.ts` 直写真实 `~/.openfeel/config.json`（测试隔离缺口，非阻塞） | medium | open（**归 `v1.1.2-stage-43`**） | v1.1.2-stage-47 |

### archive

| 编号 | 标题 | 优先级 | 状态 | 来源阶段 |
|------|------|:--:|:--:|----------|
| [BUG-001](archive.md) | `openfeel archive` 对缺 `deps` 字段的存量阶段抛 TypeError（预存量缺陷） | low | **closed** | v1.1.2-stage-41 |

### templates

| 编号 | 标题 | 优先级 | 状态 | 来源阶段 |
|------|------|:--:|:--:|----------|
| [BUG-002](templates.md) | 全局约束模板 `agents-md` 权限部署路径行未泛化（双源不同步） | medium | **closed** | v1.1.2-stage-45 |

> 注：templates 模块早期 `BUG-001`（事务官标识列未加前缀）已于 `v1.1.2-stage-41` 关闭、未纳入本目录（详见私域 `.openfeel/users/Liuary/bugs/templates/`）；`kb/BUG-001`（`lint kb` 过期引用）已于 stage-42 关闭，同见私域。
