---
name: openfeel-wizard
description: 交互式流水线向导，供 Agent 在终端中逐步推进流水线阶段。
---

<!-- openfeel:generated — 本文件由 npm run build 生成，请勿手工编辑 -->
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
>
> ⚠️ **本仓自举**：本仓（openfeel 源码仓库）开发/执行时请用 `node bin/openfeel.js <cmd>`；安装后使用 `openfeel <cmd>`。
>
> 静态命令/参数/phase/stageId 参考见 `openfeel-cli-usage` skill（本 skill 负责交互式执行推进）。
