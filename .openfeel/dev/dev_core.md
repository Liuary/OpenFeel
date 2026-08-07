# 环境描述
win11
PowerShell 7.6.3

# 动态规则
> 使用 [+] / [-] 标记管理启用/禁用状态。只能标记禁用不能删除。

## [+] 归档命名规范 (2026-06-27)

`docs/` 下所有归档文档必须遵循统一命名规范：

```
yyyy-mm-dd-NNN-{category}-{title}.md
```

- **yyyy-mm-dd**：归档日期（创建日期）
- **NNN**：3 位全局递增序号（跨类别统一编号）
- **{category}**：分类标签（deploy / blueprint / review / design）
- **{title}**：简短描述（kebab-case，不超过 5 个词）

### 类别定义

| 类别 | 用途 | 示例 |
|------|------|------|
| `deploy` | 部署测试复盘、对比分析 | `2026-06-27-001-deploy-review.md` |
| `blueprint` | 项目结构蓝图、文件清单归档 | `2026-06-27-002-blueprint-test-project.md` |
| `review` | 阶段审查总结、代码审查报告 | `2026-06-30-003-review-stage-02.md` |
| `design` | 架构设计决策、技术方案文档 | `2026-07-01-004-design-pipeline-v2.md` |

### 关联要求

- 每次新增归档文档后，同步更新 `docs/index.md`（按类别分组索引）
- 序号 NNN 跨类别全局递增，通过 `index.md` 中最大序号 +1 确定
- 归档操作同步记录到 `.openfeel/log/` 和 `.openfeel/plan/plan_log.md`

---

## [-] Agent 工具使用规范 (2026-06-27)

> **已迁移到 `.opencode/instructions/core.md` (v0.5.2)**：完整工具规范（todowrite/question/task/skill + 优先级表）已迁移至 `.opencode/instructions/core.md`「Agent 工具使用规范」节，此处不再维护。历史内容保留备查。

所有 Agent（含 Feel、Planner、Schemer、Executor、Reviewer、Feel Tester、Archiver）在会话中应主动使用平台内置工具，不得仅凭对话文本完成复杂任务。

### 1. todowrite — 任务列表管理

**触发条件**（满足任一即使用）：
- 当前任务包含 3 个以上独立步骤
- 用户同时下达多个任务（编号或逗号分隔）
- 任务涉及跨文件修改，需追踪进度

**使用要求**：
- 开始执行前创建 todo 列表，每个步骤一条
- 同一时间只有一条 `in_progress`
- 完成后立即标记 `completed`（不等批处理）
- 中途发现的新步骤追加到列表末尾

**示例**：
```
用户："修复 flow.json 的三个 Bug，然后跑测试" 
→ 创建 todo: [修复Bug1, 修复Bug2, 修复Bug3, 运行测试]
```

### 2. question — 向用户提问

**触发条件**（满足任一必须提问，禁止自行假设）：
- 需求存在歧义或多种合理解读
- 技术方案有 2 个以上同等合理的选择
- 操作可能产生不可逆后果（删除文件、覆盖配置、force push 等）
- 涉及架构决策或设计方向选择

**使用要求**：
- 选项以 "(Recommended)" 标记推荐方案
- 每个选项附带一句话说明其后果
- 简单确认型问题不超过 3 个选项
- 紧急或高风险操作必须包含"取消"选项

**禁止行为**：
- 需求模糊时自行假设后直接执行
- 多种方案时未经用户选择直接实施
- 以"可能""也许"开头但不提问直接动手

### 3. task — 子 Agent 调度

**触发条件**：
- 需并行探索多个代码区域（启动 2~3 个 explore agent）
- 复杂多步骤任务需委托给 general agent
- 复杂任务需委托给下游 Agent（通过 Feel 总统领调度）

**使用要求**：
- 并行任务用一条消息发出多个 task 调用
- 每个 task 的 prompt 必须包含：具体任务描述 + 期望返回的信息
- 明确告知子 Agent 是只读研究还是可写代码

### 4. skill — 技能加载

**触发条件**：
- 需要了解当前阶段状态 → `get-stage-status`
- 需要查阅项目知识库 → `check-kb`
- 需要获取 Bug 列表 → `get-bugs`

**使用要求**：
- 会话开始时加载 `check-kb` 获取项目背景
- 处理阶段任务前加载 `get-stage-status` 确认流程状态
- 不得跳过技能直接凭记忆操作

### 5. 工具使用优先级

| 场景 | 优先工具 | 禁止做法 |
|------|---------|----------|
| 多步骤任务 | `todowrite` | 凭记忆逐条执行 |
| 需求不明确 | `question` | 自行假设后动手 |
| 探索代码 | `task(explore)` | 手动逐个 grep/read |
| 获取状态 | `skill(get-stage-status)` | 凭记忆推断 |
| 批量文件操作 | `task(general)` | 串行逐个处理 |

---

## [-] 模板文件同步约束 (2026-07-02)

`openfeel update` 部署的文件来自源码中硬编码的模板，而非读取项目文件系统。修改以下源文件后，必须同步更新对应模板：

| 源文件 | 模板位置 | 编码方式 |
|:--|:--|:--|
| `.opencode/agents/*.md` | `src/core/update.ts` → `AGENT_DEFINITIONS` | 模板字符串 |
| `.opencode/skills/*/SKILL.md` | `src/core/update.ts` → `SKILL_DEFINITIONS` | 模板字符串 |
| `.opencode/instructions/core.md` | `src/core/templates.ts` → `CORE_INSTRUCTIONS_TEMPLATE_B64` | Base64 |

**更新流程**：
1. 修改源文件后，将新内容同步写入对应模板
2. core.md 需先 Base64 编码：`[Convert]::ToBase64String([Text.Encoding]::UTF8.GetBytes($content))`
3. 更新后运行 `npm run build` 确认编译通过
4. 用 `openfeel update` 测试部署验证

> 违反此约束将导致 `update` 部署旧版内容，用户项目使用过期规范。

> **已禁用 (v0.4.1-stage-01)**：构建时自动同步已落地。`npm run build` 自动完成三类模板的编码和注入，无需手动同步。参见 op-001。

## [+] 双语开发强制约束 (2026-07-15)

OpenFeel 自身是双语项目（zh-CN / en），开发时必须同时产出两种语言的内容，禁止仅实现单语。

### 适用范围

| 内容类型 | 涉及文件 | 要求 |
|----------|----------|------|
| i18n 字符串 | `src/core/i18n-data/zh-CN.ts` + `en.ts` | **键名一致**，zh 和 en 字段都必须填，禁止留空 |
| Agent 模板 | `templates-data/agents/{zh-CN,en}/*.md` | 中英文版本内容同步，结构一致 |
| CLI 输出 | `src/commands/*.ts` | 全部用户可见字符串走 `t()` 查表，禁止硬编码 |
| 核心引擎输出 | `src/core/flow-manager.ts` 等 | 返回给用户的方法（getStatus/getOverview 等）必须走 i18n |
| 错误消息 | 所有 throw / console.error | 走 `t()` 或 `common.errorTmpl` 统一格式 |

### 开发检查清单

新增或修改功能后，逐项确认：
- [ ] i18n 数据文件中 zh 和 en 值均已填写（`en` 字段非空字符串 `''`）
- [ ] 新增 Agent 模板内容在中英文目录下同步存在
- [ ] `getCliLang(projectPath)` 路径正确（CLI 用 `process.cwd()`，API 用传入路径）
- [ ] `flow-manager.ts` 无硬编码中文字符串（用 `t()` 替代）
- [ ] `npm run build && npm test` 通过

### 反模式

- ❌ `en: ''` — 英文翻译留空，导致回退到中文
- ❌ 只在 `zh-CN.ts` 加 key，`en.ts` 不加 — 英文环境 `t()` 返回空字符串
- ❌ flow-manager.ts 硬编码中文标签 — CLI 拿到的是已拼接好的中文，无法翻译
- ❌ 仅更新 `commands/flow.ts` 而不更新 `flow-manager.ts` — 核心引擎输出未经 i18n 处理

> 违反此约束将导致 CLI 在英文项目下仍输出中文，双语部署形同虚设。

---

## [+] Feel 归档后版本控制收尾 (2026-08-07)

Feel 完成全阶段调度后（归档 done），必须检查 git 状态并处理剩余的版本控制信息：

- 归档阶段产生的文件（`flow.json`、`kb/` 更新、`plan/` 更新、`dev/current.md`、日志等）由 Feel 负责 `git add -A && git commit`
- 禁止让归档产物的提交悬空，导致流水线结束后工作区仍有未提交变更
- 提交信息格式：`chore: v{版本} 归档 — {简述}`

> 此规则是对 Executor "自动 git commit"（仅编码阶段）的补充——归档阶段的提交责任归属 Feel。

---

## [+] npm 发布与版本号管理 (2026-08-08)

### 自动发布

- 使用 **Trusted Publishing**（OIDC），不用 token，不用绕过 2FA
- npm 端配置：包 → Add Trusted Publisher → Owner/Repo/Workflow
- CI 端配置：`permissions: id-token: write` + `npm publish --access public`
- 发布 job 仅对 master 分支触发（`if: github.ref == 'refs/heads/master'`）
- 发布 job 依赖 build-and-test（`needs: build-and-test`），测试不通过不发布

### 版本号管理

- 版本号遵循 `package.json` 的 `version` 字段，与 AGENTS.md 四级版本号（X.Y.Z.W）对应
- 每次发布前 Feel 手动递增版本号（`npm version patch` 或直接修改 `package.json`）
- 版本递增规则：
  - W（修订）：CI 配置修复、文档更新、非功能变更 → `1.0.0` → `1.0.1`
  - Z（功能）：新增功能或显著改进 → `1.1.0`
  - 重大变更需用户决策

### 自动发布触发条件

- CI 每次 push master 都跑 build+test，但**仅在 `package.json` 版本号变更时才触发 npm publish**
- 触发流程：修改 `package.json` 的 `version` → commit → push master → CI 自动 build → test → publish
- 不改变版本号的常规 push 不会触发发布（避免 "version already exists" 错误）

> Feel 职责：只在确认所有变更就绪、测试通过后，才升版本号并 push。

---

## [+] 提交推送纪律 (2026-08-08)

Feel 在会话中应**减少推送频率**。遵守以下规则：

- **一个会话 ≤3 次推送**：计划阶段一次、执行阶段一次、收尾阶段一次
- **合并小提交**：同一阶段的多个小修复（lint、测试、CI 调整）应合并在一次 commit 中
- **仅在必要时推送**：以下情况才 push：
  1. 用户明确要求
  2. 需要触发 CI 验证
  3. 阶段完成归档
- **禁止**：每做一个微小修改就 `commit + push`（如本次会话中多次单独推送模型名修改）
- 多次 commit 可以积累到本地，统一 push 一次

> 反例：本次会话中 Vision 模型名反复修改，每次修改都单独 push，产生 7+ 次无效 CI 触发。正确做法：所有模型配置修改合为一个 commit，验证通过后一次推送。
