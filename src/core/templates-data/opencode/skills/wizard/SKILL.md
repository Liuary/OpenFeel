---
name: wizard
description: 交互式流水线向导，供 Agent 在终端中逐步推进流水线阶段。
---

# 交互式流水线向导

## 输入

无

## 执行步骤

1. 运行 `openfeel flow wizard` 启动交互式向导
2. 按提示选择要推进的阶段和下一步 phase（基于当前阶段的可达 transitions）
3. 确认后执行推进，循环直至阶段 done 或退出

## 输出

向导推进结果：阶段 phase 变化（from → to），结束/退出提示

> 注：需交互式终端（TTY），非交互环境请改用 `openfeel flow advance --stage <id> --to <phase>`
