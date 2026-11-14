# v1.5.21-stage-8 计划：README / openfeel-dsh 页面通俗化

## 背景
用户确认 README 与 npm 适配器页面按新定稿（痛点 → 两个体系 → 两种模式 → 记录位置）重写，面向非程序员，不放命令和术语堆砌。

## 步骤
1. `README.md`：用定稿替换开头（标题介绍、两个问题、版本与阶段、待办清单、两种使用方式、记录存在哪），保留快速开始 / 适配器 / 命令等后续章节；更新最新版本行。
2. `dsh/README.md`：按同样风格重写开头（它做什么、两种模式、记录在 `.openfeel`、安装二选一），保留原有安装与兼容章节。
3. `dsh/package.json` description 改为通俗描述；`scripts/build-market-index.mjs` 的卡片描述来源同步（自动从 package 读）；重生成 `docs/market/index.json`。
4. 版本 1.5.21：package.json / lock ×2 / dsh package（version+requiresCli）/ ADAPTER.md / CHANGELOG / VERSIONS / skill 快照三副本 + templates 标记。
5. 验证：build / tsc / vitest / lint / dsh verify / guard / market:index:check。
6. 归档 v1.5.21 → push → CI 双包发布 → 验证 npm 页面与 Pages 索引。

## 验收
- [ ] README 前半部分不含命令、术语密度低，结构与定稿一致
- [ ] dsh/README 开头同风格，安装说明仍准确（市场安装与 setup 二选一）
- [ ] `openfeel-dsh@1.5.21` 的 npm 页面展示新 README，元数据正确
- [ ] Pages 索引含 1.5.21
- [ ] 全量验证绿

## 风险
- 只改文档/描述，无行为变化；版本升 patch。
