# 代码审查索引

> 按阶段分组，统计各状态数量

## 统计

| 状态 | 数量 |
|------|------|
| pending | 14 |
| fixing | 0 |
| resolved | 0 |
| closed | 11 |

## 阶段

### stage-01
- [REV-01](REV-stage-01.md#rev-01-eslintconfigjs-依赖缺失--typescript-eslint-未在-devdependencies-中声明) — pending — eslint.config.js 依赖缺失

### stage-02
- [REV-01](REV-stage-02.md#rev-01-collectharddeps-未去重导致-indegree-计数错误与假循环检测) — closed (high) — collectHardDeps 未去重，已修复验收 ✅
- [REV-02](REV-stage-02.md#rev-02-schema-验证未检查-artifact-id-唯一性) — closed (medium) — Schema ID 唯一性校验，已修复验收 ✅

### stage-03
- [REV-001](REV-stage-03.md#rev-001-advancephase-日志的-from-字段错误) — pending (high) — advancePhase 日志 from 字段始终等于 to
- [REV-002](REV-stage-03.md#rev-002-advancephase-切换操作时未重置-pipelineretry) — pending (medium) — advancePhase 未重置 pipeline.retry
- [REV-003](REV-stage-03.md#rev-003-cli-flow-review-子命令未注册) — pending (medium) — CLI flow review 子命令未注册
- [REV-004](REV-stage-03.md#rev-004-cli-flow-retry-子命令未注册) — pending (medium) — CLI flow retry 子命令未注册
- [REV-005](REV-stage-03.md#rev-005-summary-返回类型与计划不一致) — pending (low) — summary() 返回类型与计划不一致
- [REV-006](REV-stage-03.md#rev-006-validationresult-类型未导出) — pending (low) — ValidationResult 类型未导出
- [REV-007](REV-stage-03.md#rev-007-opid-字段与-flowjson-键名冗余) — pending (low) — Op.id 与键名冗余
- [REV-008](REV-stage-03.md#rev-008-getsummary-方法缺少测试覆盖) — pending (low) — getSummary() 缺少测试覆盖

### stage-04
- 审查通过 ✅ — 无阻塞问题，0 个 REV 条目

### stage-05
- 审查通过 ✅ — 2 个非阻塞 REV 条目（medium×1 low×2）
- [REV-001](REV-stage-05.md#rev-001-generateinstructions-中-flowmanager-初始化结果未使用) — pending (medium) — FlowManager 初始化结果未使用
- [REV-002](REV-stage-05.md#rev-002-collectharddepids-与-artifactgraphcollectharddeps-逻辑重复) — pending (low) — collectHardDepIds 逻辑重复

### stage-07
- ✅ 审查通过，2 个 REV 已关闭（high×1 medium×1）  - [REV-001](REV-stage-07.md#rev-001-formatjsonc-丢弃-opencodejsonc-中的非标准字段导致数据丢失) — closed (high) — formatJsonc 双模式修复，验收通过 ✅  - [REV-002](REV-stage-07.md#rev-002-cli-update-命令缺少-try-catch-错误处理) — closed (medium) — try-catch 添加，验收通过 ✅

### stage-08
- 审查通过 ✅ — 3 个非阻塞 REV 条目（medium×1 low×2）
- [REV-001](REV-stage-08.md#rev-001-addknowledgeentry-使用-utc-日期而非本地日期) — pending (medium) — UTC 日期 vs 本地日期
- [REV-002](REV-stage-08.md#rev-002-日期格式注释拼写错误) — pending (low) — 注释 YYY → YYYY
- [REV-003](REV-stage-08.md#rev-003-readstdin-缺少-error-事件处理器) — pending (low) — stdin error 处理
### v2-stage-01
- ✅ 审查通过 — 0 个阻塞 REV 条目，1 个低优提醒 (closed)
- [REV-001-01](REV-v2-stage-01.md#rev-001-01structurets-仍含-stagesroadmap) — closed (low) — structure.ts WORKSPACE_DIRS 仍含 stages/roadmap

### v2-stage-02
- ✅ 审查通过 — 0 个阻塞 REV 条目，2 个低优提醒 (pending)
- [REV-002-01](REV-v2-stage-02.md#rev-002-01schemer-模板拼写错误) — pending (low) — "声名" → 应为 "声明"
- [REV-002-02](REV-v2-stage-02.md#rev-002-02synctoflowjson-与-registerstage-stage-entry-代码重复) — pending (low) — stage entry 创建代码重复

### v2-stage-05
- ✅ 审查通过 — 1 个 REV 已关闭 (high×1)
- [REV-001](REV-v2-stage-05.md#rev-v2-stage-05-001-initproject-添加-vitestcoverage-v8-未检查-vitest-存在性) — closed (high) — initProject 添加 @vitest/coverage-v8 未检查 vitest 存在性，修复验收通过 ✅

### v2-stage-07
- ✅ 审查通过 — 4 个 REV 已关闭（medium×1 low×3）
- [REV-001](REV-v2-stage-07.md#rev-v2-stage-07-001-pipelinephase-类型从固定枚举退化为-string) — closed (medium) — PipelinePhase 类型退化设计权衡
- [REV-002](REV-v2-stage-07.md#rev-v2-stage-07-002-loadpipelineconfig-catch-块静默吞异常) — closed (low) — loadPipelineConfig 静默吞异常
- [REV-003](REV-v2-stage-07.md#rev-v2-stage-07-003-autoregistercommands-依赖-processcwd) — closed (low) — autoRegisterCommands cwd 依赖
- [REV-004](REV-v2-stage-07.md#rev-v2-stage-07-004-instruction-loaderts-模板文件加载失败静默回退) — closed (low) — 模板加载静默回退

### v2-stage-06
- ✅ 审查通过 — 0 个阻塞 REV 条目
- 源码修改正确（config.ts + cli/index.ts），编译测试无回归（217/219），验证文档完整，部署复盘合格

### v2-stage-03
- ✅ 审查通过 — 1 个 REV 已关闭 (medium)
- [REV-001](REV-v2-stage-03.md#rev-v2-stage-03-001-op-004-未完整实施7-个-agent-缺失工具使用规范小节) — closed (medium) — 7 个 Agent 缺失「工具使用规范」小节，第二轮验收通过 ✅

### stage-09
- ✅ 审查通过 — 1 个 REV 已关闭（high×1）
- [REV-001](REV-stage-09.md#rev-001-github-actions-ci-配置文件缺失) — closed (high) — .github/workflows/ci.yml 已创建，验收通过 ✅