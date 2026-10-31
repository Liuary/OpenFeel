# 归档摘要 — v1.5.6-stage-114

- **归档时间**：2026-10-31T11:54:11.724Z
- **阶段名称**：v1.5.6-stage-114
- **阶段状态**：archiving
- **依赖阶段**：无

## 操作产出

| ID | 标题 | 状态 | 尝试次数 |
|----|------|------|----------|
| (无) | - | - | - |

## 审查记录

| ID | 标题 | 状态 | 优先级 |
|----|------|------|--------|
| REV-001 | [Feel 复核] dry-run 免门覆盖不全：8 个带 --dry-run 的命令只列了 5 个 | closed | medium |
| REV-002 | [Feel 复核] 漏接 flow repair：它写 flow.json 且能在损坏状态下工作，无条件加门会死锁 | closed | medium |
| REV-003 | [Feel 复核] 漏接 flow checkpoint restore：直接以快照覆盖 flow.json，handler 无 isLoaded 前置 | closed | medium |
| REV-004 | [Feel 复核+独立审查] 漏接 config set --sync-stages：写 status.md 且写 stages[id].workflow_mode（flow-manager.ts:4051-4058） | closed | medium |
| REV-005 | [Feel 复核] flow migrate / flow health --fix / flow wizard 三个写盘入口未纳入也未显式排除 | closed | medium |
| REV-006 | [独立审查] stage task --add 分支门位不可达：写盘在 stage.ts:601，门位却标 :634 | closed | medium |
| REV-007 | [独立审查] 漏接 view accept：可置 closed 清掉 blocking REV，绕过 done/archive 阻塞门 | closed | medium |
| REV-008 | [独立审查] legacy reject 新增顶层 hint 键，违反三键契约（flow.ts:2086 / req.ts:39） | closed | medium |
| REV-009 | [独立审查] §3.4 门遮蔽策略需改：存在性/值域改为门前只读预检（PipelinePhaseSchema / getReviewItems / listSchemes） | closed | medium |
| REV-014 | [代码审查] repair --dry-run --backup 在 dry-run 下仍写 .bak，且会覆盖好的备份（flow.ts:1863-1872） | closed | medium |
| REV-015 | [代码审查] 文档计数错：可 JSON 化写命令是 4 个（含 flow health），门位 33 而非 31 | closed | medium |
| REV-016 | [代码审查] plan scheme publish/rename 预检漏「模板文件存在」，仍会遮蔽 file-missing/not-found | closed | medium |
| REV-017 | [代码审查] isRemovableOp 的 OR hasOpTemplateOnDisk 扩大遮蔽面，removeScheme 只认注册键 | closed | medium |
| REV-018 | [复检] plan scheme publish 预检判定序与写函数不一致：非 draft + 模板缺失应报 not-draft 而非 not-found | closed | medium |
