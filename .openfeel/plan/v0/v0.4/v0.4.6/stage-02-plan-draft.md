# v4.6-stage-02 计划概要（草案）

> 创建于 2026-08-07 | Planner
> 阶段性质：补充需求（CLI 命令缺失 + 规则/审查维度缺失）

## 需求概述

本阶段处理两项独立的补充需求，均为低风险增量变更：

| 编号 | 需求 | 性质 | 优先级 |
|------|------|------|:--:|
| R1 | `openfeel config` 添加 `get`/`set` 子命令，支持 `auto_advance` 读写 | CLI 功能缺失 | P1 |
| R2 | AGENTS.md 补充"禁止过度设计"规则 + Reviewer 审查维度同步 | 规则/审查缺失 | P1 |

## 变更复杂度分析

### R1：auto_advance CLI 命令

**关键发现**：当前存在两层配置分离——

| 配置层 | 文件路径 | 管理模块 | 现有 CLI 命令 |
|--------|----------|----------|---------------|
| 全局配置 | `~/.openfeel/config.json` | `workspace/identity.ts` | `config get-lang`、`config set-lang`、`config list-projects` |
| 项目配置 | `.openfeel/config.yaml` | `config.ts` | 无（仅 `readConfig()`、`writeDefaultConfig()`） |

`auto_advance` 已定义在项目配置的 `defaults` 块中（Zod schema 已硬化，见 `src/core/config.ts:22`），但**无法通过 CLI 读写**——只能手动编辑 YAML 文件。

**技术方案**：在 `config.ts` 添加 `setConfigValue()` / `getConfigValue()` 方法，操作 `.openfeel/config.yaml` 的 `defaults` 块。CLI 子命令通过这两个方法读写。

**涉及文件**（4 个源文件 + 1 个测试文件）：

| 文件 | 操作 | 变更量估算 |
|------|:--:|------|
| `src/core/config.ts` | 修改 | +40 行（新增 2 个方法 + Zod 校验） |
| `src/commands/config.ts` | 修改 | +50 行（新增 2 个子命令） |
| `src/core/i18n-data/zh-CN.ts` | 修改 | +5 条目 |
| `src/core/i18n-data/en.ts` | 修改 | +5 条目 |
| `test/core/config.test.ts` | 修改 | +40 行（新增测试用例） |

### R2：AGENTS.md 过度设计规则 + Reviewer 审查维度

**关键发现**：
- `AGENTS.md` 第 2 条已包含"设计应保持简洁"及部分过度设计阈值（→3 文件、新抽象层、第三方库、未来扩展点），但缺乏**代码层 vs 架构层**的明确区分
- `template-loader.ts` 内含 AGENTS.md 的中英双语模板（行 2103~2167 区域），作为 `openfeel update` 的源，须同步更新
- Reviewer 模板（`templates-data/agents/{zh-CN,en}/reviewer.md`）的审查维度表仅有 5 个顶层维度（正确性/规范性/安全性/完整性/一致性），未显式包含"过度设计"检查项
- 过度设计的审查逻辑上归属于"规范性"维度（因为 AGENTS.md 规范本身就包含了反过度设计规则），但用户要求**显式列为一个独立检查子维度**以确保不被遗漏

**涉及文件**（4 个文件）：

| 文件 | 操作 | 变更量估算 |
|------|:--:|------|
| `AGENTS.md` | 修改 | ~15 行（增强第 2 条规则） |
| `src/core/template-loader.ts` | 修改 | ~30 行（同步中英双语模板） |
| `src/core/templates-data/agents/zh-CN/reviewer.md` | 修改 | ~10 行（新增审查子维度行） |
| `src/core/templates-data/agents/en/reviewer.md` | 修改 | ~10 行（英文版同步） |

## 任务分解

### 批次 A：独立任务（无依赖，可并行）

#### A1：添加 config.yaml 读写方法 → `src/core/config.ts`
- **目标**：提供 `getConfigValue(projectPath, key)` 和 `setConfigValue(projectPath, key, value)` 两个方法
- **getConfigValue**：读取 `.openfeel/config.yaml` → 从 `defaults` 块中获取指定 key
- **setConfigValue**：
  1. 读现有 config.yaml（不存在则用空对象）
  2. 将值写入 `defaults[key]`（需经过 `ConfigDefaultsSchema` 的 `.shape[key]` 局部校验）
  3. 序列化写回 YAML（使用 `yaml` 模块的 `stringify()`）
- **注意**：需处理 config.yaml 不存在时的创建场景；需保留现有 YAML 结构和注释（如果需要保留注释，使用 `yaml` 的 `Document` API）

#### A2：添加 i18n 键 → `zh-CN.ts` + `en.ts`
- **新增 help 键**（各 2 条）：
  - `help.config.get` → "读取项目工作流配置项的值" / "Read a project workflow config value"
  - `help.config.set` → "设置项目工作流配置项的值" / "Set a project workflow config value"
- **新增 output 键**（各 5 条）：
  - `config.get.result` → "{key}：{value}"（含未设置时的 "未设置" 回退）
  - `config.set.ok` → "{key} 已设置为：{value}"
  - `config.set.invalidKey` → 无效的配置键 "{val}"，当前仅支持：{keys}
  - `config.set.invalidValue` → 无效的值 "{val}"。{key} 仅支持：{values}
  - `config.set.noProject` → 未找到项目配置文件，请先运行 openfeel init

#### A3：增强 AGENTS.md "禁止过度设计"规则 → `AGENTS.md`
- **位置**：修改第 2 条（行 18~23），扩展现有规则
- **变更内容**：
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
  （新增最后 3 行，将代码层与架构层明确分开）

### 批次 B：依赖任务（依赖批次 A 完成）

#### B1：添加 config get/set 子命令 → `src/commands/config.ts`
- **依赖**：A1（config.ts 方法）、A2（i18n 键）
- **新增命令**：
  - `openfeel config get <key>` — 读取当前项目 config.yaml 的 defaults 值
  - `openfeel config set <key> <value>` — 写入值
- **验证逻辑**：
  - key 白名单：当前仅允许 `auto_advance`
  - value 白名单：`auto_advance` 仅允许 `enabled` / `disabled`
  - 不在项目目录内时输出错误提示
- **行为细节**：
  - 参考现有 `get-lang` / `set-lang` 的命令模式
  - 使用 `t()` 做 i18n 输出
  - `get` 命令输出的 `auto_advance` 对应中文显示 "自动推进"（用 i18n 键做 key 名翻译）

#### B2：同步 AGENTS 模板到 template-loader.ts
- **依赖**：A3（AGENTS.md 变更内容确定）
- **修改位置**：
  - en 模板：`src/core/template-loader.ts` 行 ~2103-2107（英文 AGENTS.md 模板的核心约束#2）
  - zh-CN 模板：行 ~2163-2167（中文 AGENTS.md 模板的核心约束#2）
- **变更内容**：与 A3 保持完全一致（中英双语各自翻译）

#### B3：添加 Reviewer "过度设计"审查维度
- **依赖**：A3（AGENTS.md 规则最终形态确定）
- **修改文件**：
  - `src/core/templates-data/agents/zh-CN/reviewer.md`
  - `src/core/templates-data/agents/en/reviewer.md`
- **变更内容**：在审查维度表的"规范性"行下新增"过度设计"子维度：
  ```markdown
  | | 过度设计 | 是否存在无复用需求的抽象层、设计模式包装或过度工程化（参见 AGENTS.md 第 2 条） |
  ```
- **位置**：插入在"规范性"行之后，`行 27` 和 `行 28` 之间（即 "是否符合项目编码规范" 之后，"安全性" 之前）

### 批次 C：验证

#### C1：构建 + 测试验证
- **依赖**：B1、B2、B3 全部完成
- **操作**：
  1. 运行 `npm run build` 确保构建成功
  2. 运行 `npm test` 确保现有 298+ 测试无回归
  3. 新增测试通过
  4. 手动验证：`openfeel config get auto_advance` 和 `openfeel config set auto_advance enabled/disabled`

## 依赖关系图

```
批次 A（并行）
  A1 ──→ B1 ──┐
  A2 ──→ B1 ──┤
  A3 ──→ B2 ──┼──→ C1（构建验证）
         B3 ──┘
```

## 并行安全判定

| 批次 | 任务 | 冲突域分析 |
|------|------|------------|
| A | A1 (config.ts), A2 (i18n), A3 (AGENTS.md) | 互不修改同一文件，可并行 |
| B | B1 (commands/config.ts), B2 (template-loader.ts), B3 (reviewer.md ×2) | 互不修改同一文件，可并行 |

## 风险与注意事项

1. **配置两层混杂**：`openfeel config` 一部分操作全局配置（get-lang/set-lang），一部分操作项目配置（新增的 get/set）。需在 help 文本中明确区分，避免用户混淆。

2. **YAML 注释保留**：`config.ts` 当前使用 `yaml.parse()` + `writeFileSync()` 模式，写入时可能丢失 YAML 注释。需评估是否需要保留注释（若需保留，使用 `yaml` 的 `Document` API 做增量修改）。

3. **模板一致性**：AGENTS.md 和 template-loader.ts 中的 AGENTS 模板必须内容一致。建议 A3 和 B2 由同一个 Agent 串行执行以保证同步。

4. **Reviewer 模板同步**：中英双语 Reviewer 模板（zh-CN/reviewer.md + en/reviewer.md）须同步修改，内容对应但语言各自独立。

## 参考知识库条目

| 条目 | 来源 | 与本次计划的关系 |
|------|------|-----------------|
| CLI 原子管理模式 | kb/patterns.md | Agent 通过 CLI 命令操作数据文件，不直接 edit config.yaml |
| i18n 域扩展模式 | kb/patterns.md | 新增 i18n 键遵循 `{domain}.{subdomain}.{name}` 命名规范 |
| 多语言模板数据管线 | kb/architecture.md | Reviewer 模板修改后由 build.js 自动注入，无需手动更新构建脚本 |
| 双语 CLI 交互模式 | kb/patterns.md | 所有命令行输出须双语支持 |

> 知识库中暂无"自动化配置项读写"相关记录，本次为首次在项目配置层添加 CLI 读写能力。

## 预估总变更量

| 分类 | 文件数 | 估计新增行数 |
|------|:--:|:--:|
| 核心逻辑 (src/core/) | 2 | ~50 |
| CLI 命令 (src/commands/) | 1 | ~50 |
| i18n 数据 | 2 | ~20 |
| 模板数据 | 2 | ~40 |
| Agent 约束 (AGENTS.md) | 1 | ~10 |
| 测试 | 1 | ~40 |
| **合计** | **9** | **~210** |

---

> **状态**：草案 — 待 Feel 确认后进入正式计划制定流程
