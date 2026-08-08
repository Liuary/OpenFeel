---
name: roadmap
description: 加载项目路线图，供 Agent 查看版本规划和里程碑。
---

# 路线图加载

## 输入

无（可传入版本号过滤，如 `v5`）

## 执行步骤

1. 运行 `openfeel roadmap show` 列出 `.openfeel/roadmap/` 下所有版本大纲，或读取指定 `v{version}.md`
2. 提取各版本「目标」「阶段划分」「里程碑」节
3. 对照 `.openfeel/flow.json` 中各阶段 phase 判断进度状态

## 输出

格式化路线图摘要：版本清单 + 各版本阶段进度
