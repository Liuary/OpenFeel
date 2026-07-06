# 代码审查索引

> 按阶段分组，统计各状态数量

## 统计

| 状态 | 数量 |
|------|------|
| pending | 36 |
| fixing | 0 |
| resolved | 0 |
| closed | 13 |

## 阶段

### v3-stage-01
- [REV-001](REV-v3-stage-01.md#rev-001-phase-枚举硬化存在多处缺陷) — pending (high) — Phase 枚举硬化 validate() 副作用、fuzzyCorrectPhase 正则缺陷
- [REV-002](REV-v3-stage-01.md#rev-002-addautofixreview-缺少关键前置校验和-checkpoint-更新) — pending (high) — addAutoFixReview 无前置校验 + checkpoint 遗漏
- [REV-003](REV-v3-stage-01.md#rev-003-healthcheck-僵尸-bug-检测完全失效) — pending (high) — checkZombieStates Bug 文件过滤逻辑错误
- [REV-004](REV-v3-stage-01.md#rev-004-repair-dry-run-逻辑完全错误) — pending (high) — repair --dry-run 输出逻辑双缺陷
- [REV-005](REV-v3-stage-01.md#rev-005-新增功能全部缺少测试覆盖) — pending (medium) — 5 个新方法零测试

### v3-stage-02
- [REV-006](REV-v3-stage-02.md#rev-006-writedefaultconfig-未写入-models-节) — closed (medium) — writeDefaultConfig 缺 models 节，修复验收通过 ✅
- [REV-007](REV-v3-stage-02.md#rev-007-模型配置步骤缺少-awareness-注释) — closed (low) — 模型配置读取步骤 Awareness 注释，修复验收通过 ✅

### v3-stage-03
- [REV-008](REV-v3-stage-03.md#rev-008-schemer-产出路径指向不存在的目录) — pending (high) — schemer.md 产出路径 .openfeel/stages/ 不存在
- [REV-009](REV-v3-stage-03.md#rev-009-feel-任务路由表缺少-schemer) — pending (high) — Feel 路由表无 Schemer 条目
- [REV-010](REV-v3-stage-03.md#rev-010-executor-版本校验和网络安全仅覆盖-npm) — pending (medium) — 依赖版本校验仅 npm 命令
- [REV-011](REV-v3-stage-03.md#rev-011-addautofixreview-命令层-opid-未校验) — pending (medium) --auto-fix 命令未校验 opId
- [REV-012](REV-v3-stage-03.md#rev-012-wizard-的-phaselabels-硬编码不完整) — pending (low) — wizard phaseLabels 静态映射

### v3-stage-04
- [REV-013](REV-v3-stage-04.md#rev-013-architect-审查模板缺少-tester-标记字段) — pending (medium) — architect.md 审查模板缺 Tester 标记
- [REV-014](REV-v3-stage-04.md#rev-014-tester-reviewer-标记处理未指明-rev-文件路径) — pending (low) — tester.md 未给 REV 文件路径
- [REV-015](REV-v3-stage-04.md#rev-015-check-kb-强制检索提示在空知识库时冗余) — pending (low) — check-kb 空库时冗余提示

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

### v4-stage-01
- ⚠️ 审查不通过 — 3 个阻塞 REV + 1 个非阻塞 REV
- [REV-001](REV-v4-stage-01.md#rev-001-dev_coremd-仍引用已删除的-code-worker--review-worker) — pending (high) — dev_core.md 仍引用 code-worker / review-worker
- [REV-002](REV-v4-stage-01.md#rev-002-modelstemplateyaml-多处引用已删除的-review-worker--code-worker--ask) — pending (medium) — models.template.yaml 6 处废弃引用
- [REV-003](REV-v4-stage-01.md#rev-003-model-check-skill-角色映射表仍列出已删除的-codemd) — pending (medium) — model-check SKILL 角色映射表列出 code.md
- [REV-004](REV-v4-stage-01.md#rev-004-dev_coremd-agent-列表中-tester-未更新为-feel-tester) — pending (low, non-blocking) — dev_core.md Agent 列表 Tester → Feel Tester

### v4-stage-02
- ⚠️ 审查不通过 — 3 个阻塞 REV (high) + 1 个非阻塞 REV (low)
- [REV-001](REV-v4-stage-02.md#rev-001executormd-步骤-21--flowjson-路径描述不准确) — pending (high) — flow.json 路径写为根目录，实际在 .openfeel/
- [REV-002](REV-v4-stage-02.md#rev-002executormd-步骤-3a--cli-命令-openfeel-flow-validate-不存在) — pending (high) — openfeel flow validate 命令不存在
- [REV-003](REV-v4-stage-02.md#rev-003executormd-步骤-3b--pipelineyaml-路径不一致且文件缺失) — pending (high) — pipeline.yaml 路径错误且文件缺失
- [REV-004](REV-v4-stage-02.md#rev-004search-kb-skillmd-仍声称是-check-kb-回退方案语义陈旧) — pending (low) — 语义陈旧引用（非变更范围）

### stage-09
- ✅ 审查通过 — 1 个 REV 已关闭（high×1）
- [REV-001](REV-stage-09.md#rev-001-github-actions-ci-配置文件缺失) — closed (high) — .github/workflows/ci.yml 已创建，验收通过 ✅

### v4-stage-04
- ✅ 审查通过 — 3 个非阻塞 REV (low×3) + 1 个 FAST-PASS
- [REV-001](REV-v4-stage-04.md#rev-001kb-deduopts-tokenize-标记去除正则无实际效果) — pending (low, non-blocking) — kb-dedup.ts tokenize() 正则死代码
- [REV-002](REV-v4-stage-04.md#rev-002metricsstoregetinstance-datadir-参数忽略提示缺失) — pending (low, non-blocking) — MetricsStore.getInstance dataDir 参数说明缺失
- [REV-003](REV-v4-stage-04.md#rev-003同批次多-agent-prompt-文件-cli-约束声明风格不统一) — pending (low, non-blocking) — Agent prompt CLI 约束声明风格不一致
- [FAST-PASS-001](REV-v4-stage-04.md#fast-pass-001op-001-reviewer--feel-tester-快速通道) — resolved (low) — op-001 快速通道一致性验证通过

### v4.1-stage-01
- ✅ 审查通过 — 1 个非阻塞 REV (low)
- [REV-001](REV-v4.1-stage-01.md#rev-001-buildupdatedjsonc-未确保已有-opencodejsonc-的-instructions-包含-agentsmd) — pending (low, non-blocking) — buildUpdatedJsonc 未补充 AGENTS.md 到已有 instructions