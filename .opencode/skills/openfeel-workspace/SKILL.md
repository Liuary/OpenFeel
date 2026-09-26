---
name: openfeel-workspace
description: 会话启动时检查并补齐 .openfeel/ 工作区目录结构与空文件的标准化操作步骤（mkdir 哪些目录、创建哪些空文件、读 .info.json 取用户名）。
---

<!-- openfeel:generated — 本文件由 npm run build 生成，请勿手工编辑 -->
# 工作区启动自检

## 输入

无（自动按 .openfeel/.info.json 与 ~/.openfeel/update_infos.md 推断）

## 执行步骤

### 1. 读取用户名
读 `.openfeel/.info.json` 的 `user` 字段；缺失则 `git config user.name`。

### 2. 检查公共域目录（缺失则 mkdir -p）
`.openfeel/dev/note/`、`.openfeel/log/`、`.openfeel/code_review/`、`.openfeel/bugs/`、`.openfeel/plan/`、`.openfeel/kb/`、`.openfeel/tmp/`

### 3. 检查公共域文件（缺失则创建空文件）
`.openfeel/dev/dev_core.md`、`.openfeel/dev/current.md`、`.openfeel/dev/decisions.md`、`.openfeel/kb/index.md`

### 4. 检查私域目录（基于 {username}）
`.openfeel/users/{username}/log/`、`note/`、`code_review/`、`bugs/`、`tmp/`

### 5. 检查私域文件
`.openfeel/users/{username}/dev_last.md`

### 6. 增量更新复核
检查 `~/.openfeel/update_infos.md`，若存在未修复条目（追加/异常），提醒用户重启会话或委托 Feel 处理；本 Agent 不自行修改该文件。

> 目录结构语义、公共/私域分区、用户身份约束、路径自校验规则见全局 AGENTS.md（约束）；本 skill 仅承载操作步骤。
