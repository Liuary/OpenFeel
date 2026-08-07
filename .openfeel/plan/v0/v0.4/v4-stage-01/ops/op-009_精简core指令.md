# op-009：精简 core.md — 424→~250 行

- **阶段**：v4-stage-01
- **状态**：done
- **前置**：op-001（必须先删除 9 个废弃 Agent，再清理 core.md 中的引用）
- **负责 Agent**：Executor
- **最多重试**：3

## 目标
将 `core.md`（当前 424 行）精简为约 250 行，清理 9 个废弃 Agent 引用，将自动闭环重写为 Feel 调度 + flow.json 推进模型。

## 实施步骤
- [ ] 1. 读取源文件 `C:\Code\AI\OpenFeel\.opencode\instructions\core.md`（424 行）
- [ ] 2. 保留以下内容（不做结构性修改，仅微调措辞）：
  - **会话启动自检**（L9-36，~28 行）— 完整保留，这是每个 Agent 启动的第 2 步
  - **设计原则**（L37-43，~7 行）— 完整保留公共域/私域分区说明
  - **用户身份**（L45-53，~9 行）— 完整保留 .info.json 读取规则
  - **路径自校验**（L55-63，~9 行）— 完整保留 3 步校验规则
  - **公共域 > 开发目录**（L69-85，~17 行）— 保留 dev_core.md / current.md / dev_note.md 说明
  - **公共域 > 日志目录**（L87-100，~14 行）— 保留日志分层规则
  - **公共域 > 代码审查目录**（L102-108，~7 行）— 保留审查目录结构
  - **公共域 > Bug 追踪目录**（L110-116，~7 行）— 保留 Bug 目录结构
  - **公共域 > 计划目录**（L118-135 前半，~18 行）— 保留自动计划化和计划两层结构
  - **公共域 > 临时目录**（L220-224，~5 行）— 保留
  - **公共域 > 知识库**（L226-287，~62 行）— 完整保留知识库结构和写入规范
  - **私域总体**（L291-424，~134 行）— 完整保留私域全部内容（个人操作状态、笔记、日志、代码审查、Bug 追踪、生命周期、个人临时目录）
- [ ] 3. **重写以下段落**：
  - **原「子计划状态与自动闭环」**（L137-218，~82 行）→ 重写为 Feel 调度 + flow.json 推进（约 20 行）：
    ```markdown
    #### 流水线与阶段状态
    
    OpenFeel 使用 `flow.json` 管理流水线推进。Feel 总统领通过 `/opfx:flow` 技能查询和推进状态。
    
    阶段状态均由 `flow.json` 驱动，Agent 不得手动修改状态文件。所有阶段推进由 Feel 调度下游 Agent 链完成：
    
    ```
    Feel 决策 → task(planner/schemer) → task(executor) → task(reviewer) → task(feel-tester) → task(archiver)
    ```
    
    状态流转遵循 flow.json 中定义的合法转换，非法 phase 将被 Flow CLI 拒绝推进。
    
    任一 Agent 遇到计划外架构变更、超过范围的修改、权限不明确、测试环境缺失、连续两次验收失败时，必须将阶段状态改为 `paused`，由 Feel 提请用户决策。
    ```
  - **删除原「Worktree / Session」**片段（L153-159）— 不再需要 worktree 模式
  - **删除原「级联优先级」**中 worktree 相关字段说明（L182-183 的 merge_mode / 合并状态条目）
  - **删除原「状态含义」**全部 14 个状态枚举（L185-199）— 状态由 flow.json 定义，不再在 core.md 中硬编码
  - **删除原「自动推进规则」**（L201-209）— 替换为 Feel 调度模型
  - **删除原「允许的自动启动链路」**（L211-216）— worktree/session 不再需要
  - **删除原「自动流程中的 status.md 更新」**（L218）— 替换为 flow.json 驱动
- [ ] 4. **清理废弃 Agent 引用**：
  - 全文搜索 `architect` / `Architect` → 替换为 `reviewer` / `Reviewer`（在职责说明中）
  - 全文搜索 `AutoRunner` → 替换为 `Feel`（调度职责）
  - 全文搜索 `code-worker` / `review-worker` / `test-writer` / `auto-runner` / `debug` → 删除相关引用
  - 全文搜索 `Code Agent` / `代码 Agent` → 替换为 `Executor`（在职责说明中）
  - 全文搜索 `Architect Agent` / `测试 Agent` → 分别替换为 `Reviewer` / `Feel Tester`
  - 特别关注：L63 的「此规则适用于所有 Agent（Architect / Code / Debug / Tester / Ask）」→ 更新为「此规则适用于所有 Agent（Feel / Planner / Schemer / Executor / Reviewer / Feel Tester / Archiver）」
  - 审查/追踪 生命周期表（L413-418）中「操作者」列的「Architect」→ `Reviewer`，「代码 Agent」→ `Executor`，「测试 Agent」→ `Feel Tester`
- [ ] 5. 写完后校对，确保各节编号连续、无断裂引用

## 产出文件
- `.opencode/instructions/core.md`（精简）

## 自测清单
- [ ] 会话启动自检完整保留（公共域目录 + 文件 + 私域目录 + 文件清单）
- [ ] 设计原则（公共域/私域分区）完整保留
- [ ] 路径自校验规则（3 步）完整保留
- [ ] 知识库结构（含写入规范和自动写入机制）完整保留
- [ ] 私域全部内容（个人操作状态、笔记、日志、代码审查、Bug 追踪、生命周期、个人临时目录）完整保留
- [ ] 原「子计划状态与自动闭环」已重写为 Feel 调度 + flow.json 推进
- [ ] 无 `architect` / `architect Agent` 残留（在 core.md 的职责描述中）
- [ ] 无 `code-worker` / `review-worker` / `test-writer` / `auto-runner` / `auto-runner` / `debug` / `ask` 残留
- [ ] 无 `AutoRunner` 残留
- [ ] 无 `worktree` / `Worktree` / `worktree` 相关段落残留
- [ ] 无 `自动闭环` 概念（已替换为 Feel 调度）
- [ ] 无 14 个状态枚举表格
- [ ] 总行数 240~260 行

## 修正记录
| 次数 | 时间 | 问题 | 修正内容 |
|------|------|------|----------|
