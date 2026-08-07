---
name: health
description: 加载流水线健康检查结果，供 Agent 判断 flow.json 与工作区状态是否一致。
---

# 流水线健康检查

## 输入

无

## 执行步骤

1. 运行 `openfeel flow health --quick` 检查关键项（phase/current 合法性）
2. 需要全面检查时运行 `openfeel flow health`（含跨文件一致性、僵尸状态、config.yaml）
3. 解析输出中的 ✅ / ⚠️ / ❌ 项

## 输出

健康检查摘要：通过项数、失败项列表及原因，失败时给出修复建议
