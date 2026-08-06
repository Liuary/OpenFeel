# OpenFeel v4.6 — 新增多模态 Agent (Vision)

> 创建于 2026-08-07 | Feel 总统领
> 最后更新 2026-08-07 | Planner 制定详细方案

## 需求

新增第 9 个 Agent：**vision（视觉官）**，基于 qwen 3.7 plus 模型（alibaba 多模态），用于处理图片等视觉输入，输出结构化分析结果。被 Feel 和其他 Agent 按需调用。

## 目标

- 新增独立 Agent：**vision（视觉官）**，职责为通用视觉分析（接收图片输入，输出结构化分析结果）
- 模型：qwen-vl-plus（通义千问多模态模型，provider: alibaba）
- 被 Feel 和其他 Agent 按需调用

## 判定

| 维度 | 判定 |
|------|------|
| 阶段数 | 1 个阶段 |
| 文件变更数 | ≥ 5 个文件（新建 3 + 修改 5） |
| 架构影响 | 无跨模块架构变更（纯新增 Agent，不修改现有管线） |
| 规模等级 | **中等规模** — Feel 可选择唤起 Planner |

## 涉及文件全景

| 层级 | 文件 | 操作 | 说明 |
|------|------|:--:|------|
| 模板管线 | `src/core/templates-data/agents/zh-CN/vision.md` | **新建** | 中文 Agent prompt 模板 |
| 模板管线 | `src/core/templates-data/agents/en/vision.md` | **新建** | 英文 Agent prompt 模板 |
| Agent 定义 | `.opencode/agents/vision.md` | **新建** | 部署用 Agent frontmatter 定义 |
| 核心约束 | `AGENTS.md` | **修改** | 8→9 Agent 总览表 |
| 平台指令 | `.opencode/instructions/core.md` | **修改** | 职责边界列表 + 下游调度列表 |
| 模型检查 | `.opencode/skills/model-check/SKILL.md` | **修改** | 角色映射回退表 |
| 知识库 | `.openfeel/kb/architecture.md` | **修改** | 新增架构决策记录 |
| 知识库 | `.openfeel/kb/index.md` | **修改** | Agent 数和条目更新 |

> **不需要修改**：`build.js` — 构建脚本已实现自动遍历 `templates-data/agents/{lang}/` 下所有 .md 文件（见 kb/architecture.md #多语言模板数据管线），新增 Agent 无需修改构建脚本。

## 阶段

| 阶段 | 任务数 | 优先级 | 依赖 | 状态 |
|------|:--:|:--:|------|:--:|
| v4.6-stage-01 | 8 项 op | P1 | — | plan_pending |

---

# v4.6-stage-01：vision Agent 全链路落地

> 阶段目标：创建 vision Agent 的中英双语模板和部署定义，更新所有关联文档和技能，构建验证通过。

## 依赖关系

```
op-001 ──┐
          ├── op-004 ──┐
op-002 ──┘             ├── op-007 ── op-008
          ┌── op-005 ──┤
op-003 ──┤             │
          └── op-006 ──┘
```

- **op-001**（中文模板）和 **op-002**（英文模板）：无依赖，可并行
- **op-003**（Agent 定义）：无依赖，可独立执行
- **op-004**（AGENTS.md）、**op-005**（core.md）、**op-006**（model-check）：依赖 op-001~op-003 确定 vision 的最终名称和角色定义，可并行执行
- **op-007**（architecture.md + kb/index.md）：依赖全部业务变更完成后记录架构决策
- **op-008**（构建验证）：依赖 op-001~op-007 全部完成

### 并行安全判定

| 并行组 | 阶段 | 冲突域分析 |
|--------|------|------------|
| 批次 A | op-001, op-002, op-003 | 互不修改同一文件，可并行 |
| 批次 B | op-004, op-005, op-006 | 修改不同文件（AGENTS.md / core.md / model-check.md），可并行 |

---

## 操作列表

### op-001：创建中文 Agent 模板 `src/core/templates-data/agents/zh-CN/vision.md`

- **优先级**：P1
- **依赖**：无
- **涉及文件**：`src/core/templates-data/agents/zh-CN/vision.md`（新建）

**任务描述**：

创建 vision Agent 的中文 prompt 模板。遵循现有 Agent 模板的结构和风格（参见 `executor.md`、`utility.md` 等）：

1. **Frontmatter**：
   ```yaml
   ---
   description: Vision 视觉官 Agent，多模态模型，负责通用视觉分析，接收图片输入并输出结构化分析结果。
   mode: subagent
   model: alibaba/qwen-vl-plus
   color: "#06B6D4"
   permission:
     read: "allow"
     glob: "allow"
     grep: "allow"
     bash: "allow"
   ---
   ```

2. **正文结构**（参考 executor.md 的模式）：
   - **核心定位**：说明自己是视觉分析专家，接收图片输入，输出结构化分析
   - **核心职责**：列举 3-4 项职责（图像理解与描述、UI 截图分析、图表/流程图解析、错误堆栈截图分析等）
   - **调起方式**：说明被 Feel 或其他 Agent 通过 `task` 调用，接收图片路径或直接图片内容
   - **输出规范**：按照指定格式输出结构化分析结果（中文输出）
   - **能力边界**：明确能做和不能做的（如：不执行代码修改、不参与方案设计）
   - **模型选择**：说明由 qwen-vl-plus 多模态模型驱动

3. **关键风格约束**：
   - 使用中文撰写，与现有 8 个中文模板风格一致
   - 注释和说明风格参考 Executor/Utility 模板

---

### op-002：创建英文 Agent 模板 `src/core/templates-data/agents/en/vision.md`

- **优先级**：P1
- **依赖**：无
- **涉及文件**：`src/core/templates-data/agents/en/vision.md`（新建）

**任务描述**：

创建 vision Agent 的英文 prompt 模板。与中文模板内容对称，结构一致：

1. **Frontmatter**：与中文模板相同（description 使用英文）
2. **正文**：英文版本，与中文版内容对应
3. **关键风格约束**：
   - 使用英文撰写，与现有 8 个英文模板风格一致
   - 参考 `en/executor.md` 样式

---

### op-003：创建 Agent 部署定义 `.opencode/agents/vision.md`

- **优先级**：P1
- **依赖**：无
- **涉及文件**：`.opencode/agents/vision.md`（新建）

**任务描述**：

创建 OpenCode 平台的 vision Agent 部署定义文件。内容与模板源文件一致（两者保持同步，见 kb/architecture.md #多语言模板数据管线）。

> **注意**：`.opencode/agents/vision.md` 是部署定义文件，与模板文件 `templates-data/agents/{lang}/vision.md` 内容相同但用途不同——前者用于当前项目 Agent 注册，后者作为 `openfeel update` 时注入其他项目的模板源。

---

### op-004：更新 AGENTS.md — Agent 总览表

- **优先级**：P1
- **依赖**：op-001, op-002, op-003（确定 vision 的最终名称和角色）
- **涉及文件**：`AGENTS.md`（修改）

**任务描述**：

更新两处：

1. **标题**（行 87）：`### 8 Agent 体系总览` → `### 9 Agent 体系总览`

2. **表格**（行 89-98）：在 Archiver 之后新增一行：
   ```
   | Vision | 视觉官 | 多模态模型 (qwen-vl-plus) | subagent |
   ```

   排序原则：保持 Feel 打头，其他 subagent 按字母顺序排列。vision 排在 utility 之后、archiver 之前？不——现有表格顺序是：Feel / Planner / Schemer / Executor / Reviewer / Feel Tester / 事务官 / Archiver。Vision 应插入在 Archiver 之前（事务官之后），保持字母序。

   最终表：
   ```
   | Agent | 角色 | 驱动模型 | 调起方式 |
   |-------|------|----------|----------|
   | Feel | 总统领 | 主力推理模型 | primary |
   | Planner | 计划官 | 推理模型 | subagent |
   | Schemer | 方案官 | 主力推理模型 | subagent |
   | Executor | 执行官 | 快速模型 (Flash) | subagent |
   | Reviewer | 审查官 | 异种推理模型 (GLM) | subagent |
   | Feel Tester | 测试官 | 推理模型 | subagent |
   | 事务官 | 事务官 | 快速模型 (Flash) | subagent |
   | Vision | 视觉官 | 多模态模型 (qwen-vl-plus) | subagent |
   | Archiver | 归档官 | 推理模型 | subagent |
   ```

---

### op-005：更新 core.md — 职责边界列表

- **优先级**：P1
- **依赖**：op-001, op-002, op-003（确定 vision 的最终名称）
- **涉及文件**：`.opencode/instructions/core.md`（修改）

**任务描述**：

更新两处 Agent 列表，添加 Vision：

1. **行 63**（路径自校验规则适用范围）：
   > 此规则适用于所有 Agent（Feel / Planner / Schemer / Executor / Reviewer / Feel Tester / **Vision** / Archiver）。

   Vision 插入在 Feel Tester 与 Archiver 之间，与 AGENTS.md 表序一致。

2. **行 148**（Feel 调度下游 Agent 列表）：
   > Feel 根据 flow.json 状态调度下游 Agent（Planner / Schemer / Executor / Reviewer / Feel Tester / **Vision** / Archiver），不依赖旧式自动化调度。

---

### op-006：更新 model-check 技能 — 角色映射回退表（补充 utility + 新增 vision）

- **优先级**：P1
- **依赖**：op-003（确定 vision 的 model 字段值）
- **涉及文件**：`.opencode/skills/model-check/SKILL.md`（修改）

**任务描述**：

角色映射回退表（行 42-52，即 body 中的 43-52 行）当前只列出 7 个 Agent，**缺少 `utility.md` 条目**（既有遗漏，8 个 Agent 只列了 7 个）。vision 模型为 `alibaba/qwen-vl-plus`，在 frontmatter 中已显式声明，按优先级 1 可自动识别，回退表作为兜底。

需要做两项修改：

1. **补充缺失的 `utility.md` 条目**（既有问题修复）：
   ```markdown
   | `utility.md` | `fast`（快速） |
   ```
   插入位置：在 `schemer.md` 之后、`feel-tester.md` 之前（字母序：s < u < f...不对，utility 应该排在 feel-tester 之后但按字母序 u > f > a...实际看现有表顺序是 feel / planner / executor / reviewer / archiver / schemer / feel-tester，不是严格字母序。utility 的角色与 executor 相同（fast/快速模型），应插入在 executor 之后或 feel-tester 之后。

   最终插入位置分析：现有表序不是严格字母序（planner→executor→reviewer→archiver→schemer→feel-tester），而是大致按"流水线顺序 + 角色权重"排列。utility 作为辅助 Agent 应排在 feel-tester 之后（与流水线末端的辅助角色一致）：
   ```markdown
   | `utility.md` | `fast`（快速） |
   ```

2. **新增 `vision.md` 条目**：
   ```markdown
   | `vision.md` | `multimodal`（多模态） |
   ```
   插入位置：在 `utility.md` 之后、`archiver.md` 之前。

最终回退表（9 个 Agent）：
```markdown
| Agent 文件 | 默认模型角色 |
|------------|-------------|
| `feel.md` | `primary_reasoning`（主力推理） |
| `planner.md` | `reasoning`（推理） |
| `executor.md` | `fast`（快速） |
| `reviewer.md` | `cross_model`（异种推理） |
| `archiver.md` | `reasoning`（推理） |
| `schemer.md` | `reasoning`（推理） |
| `feel-tester.md` | `reasoning`（推理） |
| `utility.md` | `fast`（快速） |
| `vision.md` | `multimodal`（多模态） |
```

---

### op-007：更新知识库 — 架构决策 + 索引

- **优先级**：P1
- **依赖**：op-001, op-002, op-003, op-004, op-005, op-006
- **涉及文件**：`.openfeel/kb/architecture.md`（修改）、`.openfeel/kb/index.md`（修改）

**任务描述**：

1. **architecture.md**：在文件末尾新增条目：
   ```markdown
   ## [+] 8→9 Agent 体系扩展：Vision 视觉官 (2026-08-07)

   v4.6 新增第 9 个 Agent：**Vision（视觉官）**，基于 qwen-vl-plus 多模态模型：

   - **职责**：通用视觉分析（图像理解、UI 截图分析、图表/流程图解析、错误堆栈截图分析）
   - **模型**：alibaba/qwen-vl-plus（通义千问多模态）
   - **调起方式**：Feel 或其他 Agent 通过 `task` 按需调用，接收图片输入，输出结构化分析结果
   - **模式**：subagent（不参与流水线调度，仅作为分析能力提供者）
   - **权限**：read、glob、grep、bash（不需要 write/task 权限——产出通过返回值传递）

   **设计决策：**
   - Vision 不参与流水线阶段推进，不是流水线中的固定环节，而是被其他 Agent 按需调用的"能力代理"
   - 与现有 8 Agent 的流水线调度模型（Feel → Planner → Schemer → Executor → Reviewer → Tester → Archiver）不同，Vision 是横向能力扩展
   - 模板文件按现有多语言管线创建（zh-CN + en），由 build.js 自动注入 template-loader.ts，无需修改构建脚本
   - Agent 颜色选 `#06B6D4`（青色），与现有 8 色无冲突，且符合"视觉/光学"的语义联想
   ```

2. **kb/index.md**：更新两处：
   - 项目快速概览表：`Agent 数` 字段从 `8 个` 改为 `9 个`；Agent 列表追加 `vision`
   - 分类概览表：`architecture.md` 条目数从 `10` 更新为 `11`

---

### op-008：构建验证

- **优先级**：P1
- **依赖**：op-001, op-002, op-003, op-004, op-005, op-006, op-007
- **涉及文件**：无（纯验证）

**任务描述**：

1. 运行 `npm run build`，确保构建成功
2. 验证 `src/core/template-loader.ts` 中 `AGENT_TEMPLATES` 包含 `zh-CN.vision` 和 `en.vision` 条目
3. 运行模板一致性校验（build.js 的 `validateTemplates()`），确保 Agent 定义校验通过（期望：9 个 Agent 全部一致）
4. 确认 `.opencode/agents/vision.md` 可被 OpenCode 平台正确识别

**自测清单**：
- [ ] `npm run build` 无报错
- [ ] `template-loader.ts` 包含 `vision` 的 zh-CN 和 en 模板
- [ ] 模板一致性校验通过
- [ ] 项目现有 298 个测试无回归

---

## 颜色汇总

| Agent | 颜色 | 色值 |
|-------|------|------|
| Feel | 紫色 | `#8B5CF6` |
| Planner | 蓝色 | `#6A8DFF` |
| Schemer | 蓝色 | `#4A90D9` |
| Executor | 红色 | `#D94A4A` |
| Reviewer | 金色 | `#D4A017` |
| Feel Tester | 橙色 | `#E8A838` |
| Archiver | 绿色 | `#50C878` |
| 事务官 | 蓝灰 | `#8B9DC3` |
| **Vision** | **青色** | **`#06B6D4`** |

Vision 选用 `#06B6D4`（cyan）——青色/蓝绿色系未被使用，且语义上与"视觉/光学/镜头"的自然联想一致。

## 模型配置影响

| 维度 | 说明 |
|------|------|
| model-check 技能 | 需在角色映射回退表中新增 `vision.md → multimodal` |
| config.yaml | 如需为 vision 单独配置模型，可在 `models.agents.vision` 下指定 provider/alibaba + model/qwen-vl-plus |
| 与现有管线的关系 | vision 不参与流水线阶段推进，仅在按需调用时生效；config.yaml 中的 test_enabled 状态不影响 vision |
