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
| v4.6-stage-01 | 8 项 op | P1 | — | archiving |
| v4.6-stage-02 | 7 项 op | P1 | — | plan_passed |

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

---

# v4.6-stage-02：CLI 命令补充 + 规则/审查维度增强

> 阶段目标：补充 `openfeel config get/set` 命令（项目配置读写）和 AGENTS.md 过度设计规则强化 + Reviewer 审查维度同步。
> 创建于 2026-08-07 | Planner（草案已由 Feel 确认）

## 需求概述

本阶段处理两项独立的补充需求，均为低风险增量变更：

| 编号 | 需求 | 性质 | 优先级 |
|------|------|------|:--:|
| R1 | `openfeel config` 添加 `get`/`set` 子命令，支持 `auto_advance` 读写 | CLI 功能缺失 | P1 |
| R2 | AGENTS.md 补充"禁止过度设计"规则 + Reviewer 审查维度同步 | 规则/审查缺失 | P1 |

## 依赖关系

```
批次 A（并行）
  A1 ──→ B1 ──┐
  A2 ──→ B1 ──┤
  A3 ──→ B2 ──┼──→ C1（构建验证）
         B3 ──┘
```

- **hard**：A1→B1, A2→B1, A3→B2, A3→B3
- **soft**：B1→C1, B2→C1, B3→C1

### 并行安全判定

| 批次 | 任务 | 冲突域分析 |
|------|------|------------|
| A | A1 (config.ts), A2 (i18n), A3 (AGENTS.md) | 互不修改同一文件，可并行 |
| B | B1 (commands/config.ts), B2 (template-loader.ts), B3 (reviewer.md ×2) | 互不修改同一文件，可并行 |

## 涉及文件全景

| 文件 | 操作 | 变更量估算 | 关联任务 |
|------|:--:|------|------|
| `src/core/config.ts` | 修改 | +40 行 | A1 |
| `src/commands/config.ts` | 修改 | +50 行 | B1 |
| `src/core/i18n-data/zh-CN.ts` | 修改 | +5 条目 | A2 |
| `src/core/i18n-data/en.ts` | 修改 | +5 条目 | A2 |
| `AGENTS.md` | 修改 | ~10 行 | A3 |
| `src/core/template-loader.ts` | 修改 | ~30 行 | B2 |
| `src/core/templates-data/agents/zh-CN/reviewer.md` | 修改 | ~10 行 | B3 |
| `src/core/templates-data/agents/en/reviewer.md` | 修改 | ~10 行 | B3 |
| `src/core/templates-data/agents/zh-CN/vision.md` | 修改 | 1 行 | op-008 |
| `src/core/templates-data/agents/en/vision.md` | 修改 | 1 行 | op-008 |
| `.opencode/agents/vision.md` | 修改 | 1 行 | op-008 |
| `test/core/config.test.ts` | 修改 | +40 行 | C1 |

## 操作列表

### op-001 (A1)：添加 config.yaml 读写方法 → `src/core/config.ts`

- **优先级**：P1
- **依赖**：无
- **涉及文件**：`src/core/config.ts`（修改）

**任务描述**：

提供 `getConfigValue(projectPath, key)` 和 `setConfigValue(projectPath, key, value)` 两个方法：

1. **getConfigValue**：读取 `.openfeel/config.yaml` → 从 `defaults` 块中获取指定 key
2. **setConfigValue**：
   - 读现有 config.yaml（不存在则用空对象）
   - 将值写入 `defaults[key]`（需经过 `ConfigDefaultsSchema` 的 `.shape[key]` 局部校验）
   - 使用 `yaml.stringify()` 序列化写回（不保留原始注释，简洁实现）

> **确认**：YAML 注释不需要保留，使用简单的 stringify 方案即可。

---

### op-002 (A2)：添加 i18n 键 → `zh-CN.ts` + `en.ts`

- **优先级**：P1
- **依赖**：无
- **涉及文件**：`src/core/i18n-data/zh-CN.ts`、`src/core/i18n-data/en.ts`（修改）

**新增 help 键**（各 2 条）：
- `help.config.get` → "读取项目工作流配置项的值" / "Read a project workflow config value"
- `help.config.set` → "设置项目工作流配置项的值" / "Set a project workflow config value"

**新增 output 键**（各 5 条）：
- `config.get.result` → "{key}：{value}"（含未设置时的 "未设置" 回退）
- `config.set.ok` → "{key} 已设置为：{value}"
- `config.set.invalidKey` → 无效的配置键 "{val}"，当前仅支持：{keys}
- `config.set.invalidValue` → 无效的值 "{val}"。{key} 仅支持：{values}
- `config.set.noProject` → 未找到项目配置文件，请先运行 openfeel init

> 参见 kb/patterns.md #i18n 域扩展模式、#双语 CLI 交互模式

---

### op-003 (A3)：增强 AGENTS.md "禁止过度设计"规则 → `AGENTS.md`

- **优先级**：P1
- **依赖**：无
- **涉及文件**：`AGENTS.md`（修改）

修改第 2 条（行 18~23），扩展现有规则，新增代码层与架构层的明确区分：

```markdown
2. 设计应保持简洁，避免过度设计。以下任一情况视为可能过度设计，须与用户确认：
   - 新增或修改文件超过 3 个
   - 引入新抽象层（基类、中间件、设计模式包装）但无明显复用需求
   - 为单一功能引入第三方库或框架
   - 计划中包含过多未来扩展点
   用户明确要求简洁实现时，以上阈值自动降低。
   本规则同时约束代码实现与架构设计：
   - 代码层面：避免无意义的抽象层、过度包装、不必要的设计模式
   - 架构层面：无复用需求时不引入基类、中间件或设计模式包装
```

> **确认**：代码层/架构层分离措辞符合预期。

---

### op-004 (B1)：添加 config get/set 子命令 → `src/commands/config.ts`

- **优先级**：P1
- **依赖**：op-001 (A1)、op-002 (A2)
- **涉及文件**：`src/commands/config.ts`（修改）

新增两个子命令：

- `openfeel config get <key>` — 读取当前项目 config.yaml 的 defaults 值
- `openfeel config set <key> <value>` — 写入值

**验证逻辑**：
- key 白名单：当前仅允许 `auto_advance`
- value 白名单：`auto_advance` 仅允许 `enabled` / `disabled`
- 不在项目目录内时输出错误提示

**行为细节**：
- 参考现有 `get-lang` / `set-lang` 的命令模式（参见 kb/patterns.md #CLI 原子管理模式）
- 使用 `t()` 做 i18n 输出
- help 文本中明确标注"项目配置"以区分全局配置命令（get-lang/set-lang）

> **确认**：配置分层可接受，在 help 中明确区分全局/项目即可。

---

### op-005 (B2)：同步 AGENTS 模板到 template-loader.ts

- **优先级**：P1
- **依赖**：op-003 (A3)
- **涉及文件**：`src/core/template-loader.ts`（修改）

- en 模板：行 ~2103-2107（英文 AGENTS.md 模板的核心约束#2）
- zh-CN 模板：行 ~2163-2167（中文 AGENTS.md 模板的核心约束#2）
- 变更内容与 A3 保持完全一致（中英双语各自翻译）

> 参见 kb/architecture.md #多语言模板数据管线 — 模板修改后由 build.js 自动注入，无需手动更新构建脚本。

---

### op-006 (B3)：添加 Reviewer "过度设计"审查维度

- **优先级**：P1
- **依赖**：op-003 (A3)
- **涉及文件**：
  - `src/core/templates-data/agents/zh-CN/reviewer.md`
  - `src/core/templates-data/agents/en/reviewer.md`

在审查维度表的"规范性"行下新增"过度设计"子维度：

```markdown
| | 过度设计 | 是否存在无复用需求的抽象层、设计模式包装或过度工程化（参见 AGENTS.md 第 2 条） |
```

插入位置：在"规范性"行之后，"安全性"之前（参见 kb/architecture.md #多语言模板数据管线 — Reviewer 模板修改后由 build.js 自动注入）。

---

### op-007 (C1)：构建 + 测试验证

- **优先级**：P1
- **依赖**：op-004, op-005, op-006
- **涉及文件**：无（纯验证）

1. 运行 `npm run build` 确保构建成功
2. 运行 `npm test` 确保现有测试无回归
3. 新增测试通过
4. 手动验证：`openfeel config get auto_advance` 和 `openfeel config set auto_advance enabled/disabled`

### op-008 (R3)：Vision 模板去除硬编码模型名 → 3 个 vision 文件

- **优先级**：P1
- **依赖**：无（独立修正）
- **涉及文件**：
  - `src/core/templates-data/agents/zh-CN/vision.md`
  - `src/core/templates-data/agents/en/vision.md`
  - `.opencode/agents/vision.md`

**问题**：Vision Agent 正文自我介绍中硬编码了具体模型名（"由通义千问多模态模型（qwen-vl-plus）驱动"），但实际模型取决于用户配置，不应写死。

**修复**：
- 中文版第 13 行：`你由通义千问多模态模型（qwen-vl-plus）驱动` → `你由多模态模型驱动`
- 英文版第 13 行：`You are driven by the Qwen-VL-Plus multimodal model` → `You are driven by a multimodal model`
- `.opencode/agents/vision.md` 同步修改

---

## 风险与注意事项

1. **配置两层混杂**：`openfeel config` 一部分操作全局配置（get-lang/set-lang），一部分操作项目配置（新增的 get/set）。在 help 文本中明确标注区分。

2. **模板一致性**：AGENTS.md 和 template-loader.ts 中的 AGENTS 模板必须内容一致。建议 A3 和 B2 由同一个 Agent 串行执行以保证同步。

3. **Reviewer 模板同步**：中英双语 Reviewer 模板（zh-CN/reviewer.md + en/reviewer.md）须同步修改，内容对应但语言各自独立。

## 预估总变更量

| 分类 | 文件数 | 估计新增行数 |
|------|:--:|:--:|
| 核心逻辑 (src/core/) | 2 | ~50 |
| CLI 命令 (src/commands/) | 1 | ~50 |
| i18n 数据 | 2 | ~20 |
| 模板数据 | 2 | ~40 |
| Agent 约束 (AGENTS.md) | 1 | ~10 |
| 测试 | 1 | ~40 |
| **合计** | **12** | **~220** |

## 知识库引用

| 条目 | 来源 | 与本次计划的关系 |
|------|------|-----------------|
| CLI 原子管理模式 | kb/patterns.md | Agent 通过 CLI 命令操作数据文件，不直接 edit config.yaml |
| i18n 域扩展模式 | kb/patterns.md | 新增 i18n 键遵循 `{domain}.{subdomain}.{name}` 命名规范 |
| 多语言模板数据管线 | kb/architecture.md | Reviewer 模板修改后由 build.js 自动注入，无需手动更新构建脚本 |
| 双语 CLI 交互模式 | kb/patterns.md | 所有命令行输出须双语支持 |

> 知识库中暂无"自动化配置项读写"相关记录，本次为首次在项目配置层添加 CLI 读写能力。
