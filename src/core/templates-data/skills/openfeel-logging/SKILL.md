---
name: openfeel-logging
description: 日志纪律（v1.5.0 降级）——默认不写日志、不写流水账；仅跨会话/公共事件写 ≤3 行摘要；flow.json.log 由 CLI 维护（最近 200 条）。用于「日志 / 记录 / 归档核对」相关判断。
---

# 日志纪律（v1.5.0 降级为简要记录）

> ⚠️ **本仓自举**：本仓（openfeel 源码仓库）开发/执行时请用 `node bin/openfeel.js <cmd>`；安装后使用 `openfeel <cmd>`。

## 默认：不写日志

- **日志不是流程产物**：阶段推进、派发、审查等事件由 `flow.json.log` 自动记录（CLI 维护，仅最近 **200** 条），无需手工补日志。
- **不写逐操作流水账**；不再强制「必录事件清单」「逐阶段实时写入」。
- 需要跨会话的信息 → 写**一条** ≤3 行摘要到 `dev_last.md`「公共交接区」或对应交接文档。

## 唯一例外：跨会话 / 公共事件

- 公共域 `.openfeel/log/` 仅用于**真正需要长期留存**的团队事件（如发布说明、重大决策）；与 `dev/decisions.md` 或 CHANGELOG 重复时不另写。
- 子 agent **不写日志**；产出用返回摘要 + 文件交接，由 Feel 决定是否落一条。

## 归档机械核对清单（命令化 / 幂等 / 无推理）

归档时只需跑下表命令并如实记录；**不做语义判定**、不写过程日志：

| # | 核对项 | 命令 | 判读 |
|---|--------|------|------|
| ① | 快速概览三项取值 | 源文件数 `rg --files src -g '*.ts' \| wc -l` ｜ Agent 数（部署目录列举）｜ 最近更新 `date +%Y-%m-%d` | 填入 `.openfeel/kb/index.md`「项目快速概览」 |
| ② | `manual/index.md` 模块树存在性 | `ls .openfeel/manual/index.md .openfeel/manual/*/*.md` | 存在性核对（缺项 = 悬空引用） |
| ③ | `ops/**` 清点与对照 | `openfeel flow ops list --stage <stageId>` ｜ `ls .openfeel/plan/{series}/{stage}/ops/*.md \| wc -l` | 清单与实际文件逐条对照 |
| ④ | 工作区与计数核对 | `git status --porcelain` ｜ 阶段目录计数 `ls .openfeel/plan/{series}/{stage}/ \| wc -l` | 归档前状态留痕 |

> 知识语义判定（新旧取舍 / 去重 / 手册职责变更）不在此清单；权威 = `openfeel-check-kb` 与归档官推理面。

## 输出

- 默认：无（不需要报告）。
- 写入时：仅报告「文件路径 + 一行摘要」。
