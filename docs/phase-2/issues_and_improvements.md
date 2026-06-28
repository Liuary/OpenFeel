# 问题总结与改进意见

> 基于 NumKit v1.0.0 全流水线端到端测试中遇到的 12 个实际问题
> 分类：机制缺陷 | 流程摩擦 | 设计建议 | 安全考虑

---

## 一、机制缺陷（影响正确性）

### 问题 1：flow.json Phase 枚举值缺乏校验

**严重程度**：🔴 高
**发现场景**：Planner 将 `pipeline.phase` 设为 `"planned"`，但该值不在合法的 `PipelinePhase` 枚举中。后续 `openfeel flow advance` 命令因"phase 值不合法"报错，导致流水线卡住。

**影响**：自动推进的核心状态机被污染，CLI 工具无法继续推进。

**改进建议**：
1. Planner Agent 的 system prompt 中应明确列出合法的 phase 枚举值（`plan_pending | plan_review | plan_passed | scheme_pending | ... | done`）
2. `openfeel flow advance` 在遇到非法 phase 时，应自动修复为最近合法值（如 `"planned"` → `"plan_pending"`）并给出警告，而非直接报错退出
3. 在 flow.json schema 层面增加校验，写入非法值时拒绝并提示

### 问题 2：flow.json 写入无事务性保证

**严重程度**：🔴 高
**发现场景**：在手动编辑 flow.json 时，因 `edit` 工具匹配问题导致 JSON 出现重复字段（`"retry": 0` 出现了两次），文件变为非法 JSON。后续 `openfeel flow status` 直接报"流水线未初始化"。

**影响**：一次编辑错误导致整个流水线状态丢失感知。

**改进建议**：
1. flow.json 的读写应通过 CLI 封装，Feel 不直接编辑 JSON 文件
2. CLI 在 `flow status` 读取时应做容错解析（JSON5/宽松模式），非法字段给出 warning 而非直接报不存在
3. 增加 `openfeel flow repair` 命令，自动修复常见格式问题

### 问题 3：`openfeel flow advance` 命令行为不透明

**严重程度**：🟡 中
**发现场景**：在执行 `openfeel flow advance --op stage-01.scheme --to scheme_pending` 时，返回"无法从当前阶段推进（不合法或 op 不存在）"，但未说明具体的合法转换路径、当前阶段的实际值、op 需要满足什么条件。

**影响**：Feel 无法判断是参数错误还是状态错误，调试困难。

**改进建议**：
1. 错误消息应包含：当前 phase、期望的 phase 列表、op 是否存在
2. 增加 `openfeel flow valid-transitions` 命令，显示当前阶段的可达下一阶段
3. 增加 `--force` 标志允许跳过校验（用于修复场景）

### 问题 4：Schemer 的 npm 版本验证缺失

**严重程度**：🟡 中
**发现场景**：Schemer 在 op-001 中声明 TypeScript 版本 `5.8.0`，但该版本在 npm registry 上不存在。Executor 被迫安装了 `5.8.3`，导致 Reviewer 发现 REV-001。

**影响**：方案与实际脱节，需要额外修正闭环。

**改进建议**：
1. Schemer 在声明依赖版本时，应通过 `npm view <package> versions --json` 验证该版本是否存在
2. 若指定版本不存在，Schemer 应自动选择同系列最新补丁版本并在方案中注明
3. 或者在 Executor 执行时，将版本修正作为"可接受的偏差"自动记录到 flow.json，而非需要走完整的 REV 闭环

---

## 二、流程摩擦（影响效率）

### 问题 5：小修正走完整闭环过于重量级

**严重程度**：🟡 中
**发现场景**：REV-001 只是 `op-001.md` 中一处版本号从 `5.8.0` 改为 `5.8.3` 的纯文本修正。但流程走了完整闭环：Reviewer→Schemer(op-006)→Executor→Reviewer（4 次 Agent 调用）。

**影响**：简单操作被复杂流程放大，效率受损。

**改进建议**：
1. 增加"轻量修正"机制：对于非代码的纯文档修正（如 op 文件中的版本号），允许 Reviewer 直接修改或 Feel 直接调度 Executor 修改，无需回退到 Schemer
2. REV 条目增加 `可自动修复` 标记——若 Reviewer 判断修复方案明确且无歧义，可跳过 Schemer
3. 或者允许 Executor 在自测报告中声明"偏差"并附理由，Reviewer 审查偏差而非直接 REV

### 问题 6：Agent 调用串行化，并行能力未充分利用

**严重程度**：🟡 中
**发现场景**：stage-02 的 op-007/008/009（三个独立函数）在方案中声明可并行，但 Executor 被调用一次串行执行。stage-01 和 stage-02 也未尝试并行启动。

**影响**：总耗时增加，未发挥流水线的并行优势。

**改进建议**：
1. Feel 在调度时读取 deps.yaml，对无依赖的 op 并行启动多个 Executor
2. Executor 内部也应在自测通过后告知 Feel "这三者无依赖，可并行"
3. 对于同一文件修改的场景，通过 task_claim.md 的 🔒 锁定机制检测冲突

### 问题 7：方案粒度不一致

**严重程度**：🟢 低
**发现场景**：op-001（项目骨架搭建）粒度极细（精确到每行 JSON），而 op-007~009（三个函数）粒度适中。如果项目更大，Schemer 的粒度把控可能出现"过细"或"过粗"。

**影响**：过细则 ops 数量爆炸，过粗则 Executor 需自主决策——违背"Executor 不做决策"的原则。

**改进建议**：
1. 在 Schemer 的 system prompt 中增加粒度指南：一个 op 的预期步骤数应在 5~15 之间，产出文件 1~3 个
2. 超过 15 步自动拆分，少于 3 步考虑合并
3. 增加 op 粒度的 Review 维度（Reviewer 审查时检查）

---

## 三、设计建议

### 建议 1：增加"流水线健康检查"命令

**描述**：目前流水线状态分散在 flow.json、各 stage 的 status.md、config.yaml 中。没有一个统一的健康检查。

**提议**：
```bash
openfeel flow health    # 检查一致性：flow.json phase ↔ status.md ↔ 实际文件
```
可检查：
- flow.json 中的 stage 状态是否与各 stage/status.md 一致
- 是否有"僵尸"状态（如 review_failed 但 REV 已全部关闭）
- config.yaml 与 status.md 的级联合并结果

### 建议 2：增加 `openfeel flow` 的交互模式

**描述**：当前 CLI 是纯命令式，Feel 需要反复尝试不同的参数组合。

**提议**：
```bash
openfeel flow wizard    # 交互式推进流水线
```
引导 Feel 完成：
1. 当前状态 → 可选下一步 → 选择目标阶段
2. 自动填充 --op 参数
3. 预览变更后确认执行

### 建议 3：Reviewer 和 Tester 的角色互补文档

**描述**：测试中 Reviewer 记录了 IEEE 754 问题为"非阻塞观察"但 Tester 将其作为正式 Bug 提交。两者对同一问题的判定标准不同。

**提议**：
1. 明确 Reviewer 和 Tester 的边界：Reviewer 关注"方案符合性"，Tester 关注"功能正确性"
2. Reviewer 的观察可附带 `→ Tester 重点关注` 标记，传递给 Tester
3. 当 Reviewer 和 Tester 结论冲突时，Feel 应有明确的仲裁规则

### 建议 4：op 命名空间管理

**描述**：当前 op 编号（op-001~011）是全局递增的，但跨 stage 时容易混淆。op-006 属于 stage-01 还是 stage-02？需要看文件路径才知道。

**提议**：
- 方案 1：op 编号前加 stage 前缀，如 `s1-op-001`、`s2-op-001`
- 方案 2：每个 stage 内 op 独立编号，通过文件路径区分
- 推荐方案 2（当前做法），但 flow.json 中的 op 引用应包含 stage 路径

### 建议 5：知识库的自动检索

**描述**：当前知识库是"写入型"——Archiver 提取经验写入 kb/。但 Agent 在执行时不会主动查询知识库。

**提议**：
1. Executor 在编码前，通过 `openfeel knowledge search <关键词>` 查询相关知识
2. Schemer 在制定方案时，查询 kb/troubleshooting.md 中的已知坑位
3. 在 Agent 的 system prompt 中增加"执行前先查 kb/"的指令

---

## 四、安全与鲁棒性

### 问题 8：`npm install` 无超时和重试保护

**严重程度**：🟡 中
**发现场景**：在 stage-01 编码时，`npm install` 依赖网络状态。如果网络不可用，Executor 可能卡死或重试 3 次后放弃。

**改进建议**：
1. Executor 在执行 npm install 前检查网络连通性
2. 设置合理的超时时间（如 60s）
3. 失败时给出明确的网络诊断信息

### 问题 9：文件编辑可能导致 JSON 损坏

**严重程度**：🟡 中
**发现场景**：使用 edit 工具修改 flow.json 时，因匹配字符串不精确导致 JSON 结构损坏。

**改进建议**：
1. 对于 JSON/YAML 等结构化文件，使用专用读写工具而非通用 edit
2. 或者每次修改后自动执行格式校验（如 `python -m json.tool flow.json`）
3. 保持修改前的自动备份（如 flow.json.bak）

### 问题 10：多个 Agent 可能并发修改同一文件

**严重程度**：🟡 中
**发现场景**：文档中虽提到 `task_claim.md` 的 🔒 锁定机制，但在本次测试中未实际使用。stage-02 的 op-010（更新 index.ts）如果与 stage-01 并行执行，可能冲突。

**改进建议**：
1. 在执行前通过 `task_claim.md` 声明文件锁
2. 若冲突检测到，自动串行化
3. 提供一个 `openfeel lock check` 命令查看当前文件锁状态

---

## 五、文档与可用性

### 问题 11：错误消息不够友好

**严重程度**：🟢 低
**发现场景**：多处 CLI 命令返回"无法推进（不合法或 op 不存在）"，没有上下文。

**改进建议**：
- 所有 CLI 错误消息遵循"发生了什么 → 为什么 → 怎么修复"三段式
- 例：`无法推进：当前阶段为 plan_pending，目标 scheme_pending 不存在合法转换路径。可用转换：plan_pending → plan_passed。提示：请先完成计划审查或将 phase 改为 plan_passed。`

### 问题 12：缺少"快速入门"流水线

**严重程度**：🟢 低
**发现场景**：新项目启动时，需要手动创建大量 .openfeel 目录和文件。

**改进建议**：
```bash
openfeel init            # 一键初始化 .openfeel 工作区
openfeel init --demo     # 创建带示例的 NumKit 项目骨架
```

---

## 六、优先级排序

| 优先级 | 问题编号 | 建议 |
|:--:|:--:|------|
| 🔴 P0 | #1, #2 | Phase 枚举校验 + flow.json 事务性读写 |
| 🟡 P1 | #3, #4, #5 | CLI 错误信息 + npm 版本验证 + 轻量修正 |
| 🟡 P1 | #6, #7 | 并行调度 + 方案粒度指南 |
| 🟢 P2 | #8, #9, #10 | 网络保护 + JSON 安全编辑 + 文件锁 |
| 🟢 P2 | #11, #12 | 错误信息优化 + 快速初始化 |
| 💡 建议 | 建议 1~5 | 健康检查、交互模式、角色边界、命名空间、知识检索 |

---

## 七、总结

经过 17 次 Agent 调用的完整端到端测试，OpenFeel 体系的核心设计被验证是**有效且自洽的**：

- ✅ 职责分离 + 交叉验证确实捕获了同模型盲区
- ✅ 方案驱动确保了可复现性和可审查性
- ✅ 知识库的滚雪球效应已初步显现
- ⚠️ 但 flow.json 状态管理的鲁棒性需要加强
- ⚠️ 小修正的流程开销需要优化
- ⚠️ CLI 工具的错误信息和可用性需要改善

整体评价：**OpenFeel 是一套有清晰设计哲学且实际可用的 Agent 协作体系**，当前处于"概念验证成功，需要工程加固"的阶段。
