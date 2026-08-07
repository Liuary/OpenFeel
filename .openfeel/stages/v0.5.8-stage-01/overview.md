# v0.5.8-stage-01

## 目标

修复 v5.8 部署验证发现的三项缺陷，使流水线在无 --force 条件下正常推进全部阶段。

## 依赖

无

## 操作方案

- [op-001](.openfeel/plan/v5/v5.8/ops/op-001.md)：修复 v5.8 部署验证三项缺陷（autoCommitOnDone 失效/AGENTS.md 模板缺版本管理节/init 缺 manual 目录）

## 核心产出

| 缺陷 | 严重度 | 文件 | 修复方式 |
|:--|:--:|------|------|
| autoCommitOnDone 失效 | HIGH | `src/core/flow-manager.ts` | mapPhaseToStageStatus：test_passed→testing, archiving→archiving, 仅 done→done |
| AGENTS.md 模板缺"版本管理"节 | MEDIUM | `src/core/templates-data/agents-md/zh-CN.md` `en.md` | 对比根 AGENTS.md 追加对应节（中英双语） |
| init 不创建 manual/ 目录 | MEDIUM | `src/core/workspace/structure.ts` | WORKSPACE_DIRS 追加 `'manual'` |

## 测试结果

- `npm run build` — 通过，模板一致性校验 4/4
- `npm test` — 304 tests 全部通过，无回归

## 审查

REV-001 非阻塞：建议补充单测覆盖 mapPhaseToStageStatus 修复。（已标记为非阻塞，不阻碍推进）

## 里程碑

首次在 v5 系列中**无 --force 正常推进**全部阶段（plan_pending→exec_running→review_pending→review_passed→test_pending→test_passed→archiving→done），验证了 v5.5 的 autoCommitOnDone 时序修正与 v5.8 的 mapPhaseToStageStatus 映射修正共同解决了 --force 强依赖问题。
