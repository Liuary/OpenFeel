# 当前任务列表：op-001 + op-004

## op-001：构建脚本自动同步
- [x] 1. build.js — 添加三步管线函数和注入调用
- [x] 2. templates.ts — 添加 CORE_INSTRUCTIONS_TEMPLATE_B64 注入锚点
- [x] 3. update.ts — 添加 AGENT_DEFINITIONS / SKILL_DEFINITIONS 注入锚点

## op-004：init 完善
- [x] 4. templates.ts — 新增 AGENTS_MD_TEMPLATE 常量
- [x] 5. init.ts — 添加 AGENTS_MD_TEMPLATE 导入 + 第8步 AGENTS.md 创建
- [x] 6. flow-manager.ts — defaultFlowData() pipeline.current 修复

## 连带修复
- [x] 7. update.ts — NEW_SKILL_NAMES 匹配实际 Skill 目录名
- [x] 8. flow-manager.test.ts — 适配 pipeline.current 新默认值
- [x] 9. update.test.ts — 适配 Skill 目录名变更

## 自测
- [x] node build.js — ✅ 通过
- [x] npm run build — ✅ 通过
- [x] npm test — 225/227 ✅（2个预存失败：.gitignore 相关）
