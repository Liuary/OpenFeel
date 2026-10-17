# 归档摘要 — v1.3.0-stage-101

- **归档时间**：2026-10-17T12:21:30.390Z
- **阶段名称**：v1.3.0-stage-101
- **阶段状态**：archiving
- **依赖阶段**：无

## 操作产出

| ID | 标题 | 状态 | 尝试次数 |
|----|------|------|----------|
| op-001 | 单包分发 DSH 适配器 + setup --tools dsh + README 重构 + 1.3.0 发布收口 | pending | 0/3 |

## 审查记录

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-001 | B1 计划：profile 锁内调用 backup/appendUpdateInfo 造成嵌套全局锁，需改为锁外备份、锁内重读合并写 | resolved | medium |
| REV-002 | B2 计划：DSH_* 错误码不在 CliErrorCode 13 码表；改用 INVALID_ARGUMENT/INTERNAL_ERROR + detail.reason，避免改 JSON 契约 §3 | resolved | medium |
| REV-003 | B3 计划：DSH profile 路径进入 updated 会被 setup 写入 global update_state hash，与"不属于受管资产"矛盾；只走 SetupResult.dsh | resolved | medium |
