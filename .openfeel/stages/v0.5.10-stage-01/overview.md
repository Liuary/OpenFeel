# v0.5.10-stage-01

## 目标

profile 自动填充 + 异常安全：修复 `ensureProfileDefaults` 首次使用时字段为空问题，并增强写盘降级、passthrough 保留、路径规范化三项健壮性修复。

## 依赖

无

## 操作方案

| 方案 | 说明 | 状态 |
|------|------|:--:|
| [op-001](../../plan/v5/v5.10/ops/op-001.md) | 新增 `ensureProfileDefaults` + feel.md 同步 | ✅ |
| [op-002](../../plan/v5/v5.10/ops/op-002.md) | 修复 REV-001~003（写盘降级 + passthrough + 路径规范化） | ✅ |

## 审查

| REV | 优先级 | 说明 | 状态 |
|-----|:--:|------|:--:|
| REV-001 | high | `ensureProfileDefaults` 写盘失败未降级 | closed |
| REV-002 | medium | `readProfile` 丢弃 passthrough 扩展字段 | closed |
| REV-003 | medium | `projectPath` 未规范化导致 `recent_projects` 重复 | closed |

## 产出文件

- `src/core/config.ts`（+40 行 ensureProfileDefaults + 3 处修复）
- `.opencode/agents/feel.md`（+3 行步骤 2.5）
- `templates-data/agents/{zh-CN,en}/feel.md`（模板同步）
