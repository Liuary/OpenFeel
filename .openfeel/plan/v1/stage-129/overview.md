# v1.5.14-stage-129

## 目标

> 修复外部项目两天长会话反馈中 **OpenFeel 仓库内**可复现的问题（OF-02 ~ OF-08）：op 结果真正落盘、preflight 长任务可自愈、归档收尾可提交、门禁告警语义与白名单、建议命令一致、悬挂阶段提醒、诊断信息截断。
> OF-01（auto-review 服务 fail-open）属于 DSH 宿主，不在本仓实现范围。

## 依赖

无

## 操作方案

- op-001：OF-02 op 短 ID 解析 + 未命中报错 + 归档前未完成 op 提示
- op-002：OF-03 preflight 窗口可配 + 适配器写前自愈
- op-003：OF-04 归档收尾提交（idle commit）通道 + archive 脏区提示
- op-004：OF-05 undecidable 白名单与放行文案
- op-005：OF-06 建议命令通过路径优先 + archiving verify 前置
- op-006：OF-07 悬挂阶段提醒
- op-007：OF-08.1 lastDecision.command 截断放宽
- op-008：版本 1.5.14 收口（测试 / 文档 / CHANGELOG / build）
