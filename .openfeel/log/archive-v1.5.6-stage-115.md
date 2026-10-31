# 归档摘要 — v1.5.6-stage-115

- **归档时间**：2026-10-31T13:09:12.411Z
- **阶段名称**：v1.5.6-stage-115
- **阶段状态**：archiving
- **依赖阶段**：无

## 操作产出

| ID | 标题 | 状态 | 尝试次数 |
|----|------|------|----------|
| (无) | - | - | - |

## 审查记录

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-010 | [独立审查] 整 span 跳过使最常见引用免检：改为前导 token 串解析并允许下划线 | closed | medium |
| REV-011 | [独立审查] 未闭合 ignore-start 静默到 EOF：须 stderr 警告 + 抑制行数统计，T13 改断言警告 | closed | medium |
| REV-012 | [独立审查] 测试时序倒置：C10/C12 依赖 op-003 正文改正，须移入 op-003 验收 | closed | medium |
| REV-013 | [独立审查] 正文改正漏项：REQ-015:18 的 flow review_* 四名与 :11 的 flow config_sync_stage 未列入 | closed | medium |
| REV-019 | [门禁] dsh verify A1 用「归档 md >100 行」当夹具假设，小归档合法即误报；改为确定性夹具 + 内容等价断言 | closed | medium |
| REV-020 | [代码审查] 带位置参数的合法命令行被判 A（openfeel stage set stage-01 …）：须用 registeredArguments 判定参数起点 | closed | medium |
| REV-021 | [代码审查] REQ-017 正文规则过时：正则未含下划线、错误举例、i18n 1048/+2 口径失效 | closed | medium |
