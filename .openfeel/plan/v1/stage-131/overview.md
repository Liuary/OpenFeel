# v1.5.16-stage-131

## 目标

> 修复 1.5.15 复核中确认的两处不一致：`checkpoints.exec.attempts` 从不随 attempt 同步、done op 空模板告警噪声；并把「claim 不改 status」「第 4 类 warn 非阻断 + OPENFEEL_SHELL_ALLOW 用法」写进文档。

## 依赖

无

## 操作方案

- op-001：`recordAttempt` 同步 `checkpoints.exec.attempts`（pass / fail / 耗尽）
- op-002：`flow ops list` 对 done op 不再报空模板 warning（human + `--json`）
- op-003：文档（claim 语义 / shell allowlist / done op 删除）
