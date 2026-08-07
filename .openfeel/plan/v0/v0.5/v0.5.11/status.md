# v0.5.11-stage-01 状态 — 目录归位 + 版本号重映射 + 四级版本号

- **执行模式**：manual
- **自动推进**：disabled
- **状态**：done
- **当前责任 Agent**：feel
- **上一责任 Agent**：archiver
- **更新时间**：2026-08-07

## Worktree / Session

- **工作模式**：manual
- **合并状态**：not_started
- **前置依赖**：无
- **依赖状态**：satisfied

## 当前任务

### op-001：目录归位 + 版本号重映射 + 版本管理规则升级 ✅

- [x] 创建 plan/v5/v5.11/ops/op-001.md 方案文件
- [x] git mv 将 plan/v5.8、v5.9、v5.10 移入 plan/v5/ 下
- [x] 更新 plan_index.md + plan/v5/index.md 引用
- [x] 重映射所有索引文件版本号为 v0 体系
- [x] 重映射 flow.json 全部 25 个 stages 阶段名
- [x] 更新 plan/ 下各版本 plan.md 内部标题
- [x] 更新 kb/index.md 版本列表
- [x] 更新 dev/current.md 版本引用
- [x] 更新 AGENTS.md + agents-md 模板 + feel.md 为四级版本号
- [x] npm run build 验证通过
- [x] 搜索确认无遗漏

## 产出文件

- `.openfeel/plan/v5/v5.11/ops/op-001.md`
- `.openfeel/plan/v5/v5.8/`、`v5.9/`、`v5.10/`（迁移）
- `.openfeel/plan/plan_index.md`、`index.md`
- `.openfeel/plan/v4/index.md`、`v5/index.md`
- `.openfeel/flow.json`
- `.openfeel/kb/index.md`
- `.openfeel/dev/current.md`
- `AGENTS.md`
- `src/core/templates-data/agents-md/zh-CN.md`、`en.md`
- `.opencode/agents/feel.md` 及中英模板

## 审查记录

- REV-v0.5.11-stage-01：3 条 REV（low，non-blocking），全部 closed
