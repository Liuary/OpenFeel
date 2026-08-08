# Plan — stage-29: init 增强 (AGENTS.md 变量替换 + opencode 适配器部署)

> **版本**：v1.0.0-stage-29
> **创建日期**：2026-08-08
> **最后修订**：2026-08-08（修复 REV-001~006 + 新增重启提醒）
> **Planner**：独立 Planner（推理模型 DeepSeek V4 Pro）
> **规模判定**：大规模（≥ 2 阶段、跨模块架构变更、≥ 5 文件变更）

---

## 审查修复记录

| REV | 优先级 | 摘要 | 修复 |
|-----|:--:|------|------|
| REV-001 | high | `.opencode/package.json` 不应部署到用户项目 | 从部署清单移除 package.json，仅在 OpenFeel 自身 `.opencode/` 保留 |
| REV-002 | high | 缺少自动化测试覆盖 | 新增任务 2.6：`test/core/init.test.ts` 测试用例 |
| REV-003 | medium | init/update 可能使用不同数据源 | 明确声明两者共用 `template-loader.ts` 同一数据源；新增验收项 |
| REV-004 | medium | `promptPlatform()` 单平台过度抽象 | 重命名为 `promptOpencodeDeploy()`，交互简化为 Y/n |
| REV-005 | medium | opencode.jsonc skills 列表不完整，model 模板化未说明 | 改为 build.js 从 skills 目录自动生成；补充 `{项目名称}` 替换方案 |
| REV-006 | low | ADAPTER.md 需双语 | 拆分为 `zh-CN.md` / `en.md`，build.js 按语言注入模板加载器 |

---

## 知识库参考

本计划沿袭既有管线模式，参见：
- kb/architecture.md #多语言模板数据管线：templates-data → build.js → template-loader 三步管线
- kb/patterns.md #AGENTS.md 模板同步模式：templates-data agents-md 模板必须与 AGENTS.md 节同步
- kb/patterns.md #新增 Agent 全链路更新清单模式：新增内容时的完整文件更新清单
- kb/patterns.md #双语 CLI 交互模式：init 选择 → .info.json 持久化

---

## 背景与动机

当前 `openfeel init` 仅部署 `.openfeel/` 工作区核心，存在两个缺陷：

| # | 问题 | 根因 | 影响 |
|---|------|------|------|
| 1 | AGENTS.md 中 `{项目名称}` 占位符未替换 | `loadTemplate()` 原样返回，`initProject()` 不做变量替换 | 用户每次 init 后需手动修改两处占位符 |
| 2 | init 不部署 opencode 平台适配器 | init 只管 `.openfeel/` 核心层，opencode 适配器仅在 `openfeel update` 时部署 | 新项目 init 后缺少 9 个 Agent / 14 个 Skill / instructions / opencode.jsonc，需额外执行 `update` |

**改进目标**：init 完成后一步到位，用户立即拥有完整的 Agent 体系和平台配置。

---

## 改进概述

### 改进 1：AGENTS.md 项目名称替换
- 在 `initProject()` 写 AGENTS.md 前，将 `{项目名称}` → `path.basename(projectPath)` 全局替换
- 中英模板各两处占位符（第 1 行标题 + 第 3 行引用），一次 `.replace(/\{项目名称\}/g, projectName)` 即可覆盖

### 改进 2：init 增加 opencode 平台适配器部署
- 将项目自身的 `.opencode/` 完整配置纳入 `templates-data/opencode/` 源化体系
- 遵循既有模板管线：templates-data → build.js 构建时内联 → template-loader.ts 运行时按语言加载
- `init` 时新增 OpenCode 部署确认步骤，用户确认后写入模板文件到目标项目
- 涉及部署内容（**修订后，已移除 package.json**）：
  ```
  目标项目根:
  ├── opencode.jsonc          (平台配置，skills 列表由 build.js 自动生成)
  ├── .opencode/
  │   ├── agents/             (9 个 Agent .md，中英双语)
  │   ├── skills/             (14 个 Skill 子目录，各含 SKILL.md)
  │   ├── instructions/
  │   │   └── core.md         (平台特化操作规范)
  │   ├── ADAPTER.zh-CN.md    (中文适配器说明)
  │   ├── ADAPTER.en.md       (英文适配器说明)
  │   └── .gitignore
  ```
  > **注意**：`package.json` **不在此清单中**。当前 `.opencode/package.json` 含 `@opencode-ai/plugin` 是 OpenFeel 自身开发依赖，不应作为通用模板部署到用户项目。若未来用户项目需要 opencode 平台依赖，由用户自行安装。

### init 流程变更

```
旧：语言选择 → 部署 .openfeel/ → 生成 AGENTS.md（含未替换占位符）
新：语言选择 → OpenCode 部署确认（新增）→ 部署 .openfeel/ → 部署 opencode 适配器 → 输出重启提醒（新增）→ 生成 AGENTS.md（已替换项目名）
```

---

## 工作阶段

### Stage-29-01：OpenCode 模板数据源化与构建管线

> **目标**：将项目自身 `.opencode/` 完整配置纳入 `templates-data/opencode/` 体系，更新构建脚本和模板加载器。
> **前置依赖**：无
> **预计涉及文件数**：3 个核心文件 + `templates-data/opencode/` 目录树（~27+ 个模板文件）
> **关键风险**：构建管线新增锚点需与既有锚点不冲突，模板文件路径、语言键名需与现有约定一致

#### 任务分解

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1.1 | 创建 `templates-data/opencode/agents/` | 复制当前 `.opencode/agents/*.md`（9 个 Agent 定义），按语言分 `zh-CN/` / `en/` 子目录。agent 文件名与现有 template-loader 中的 agent ID 一致：`feel.md`, `planner.md`, `schemer.md`, `executor.md`, `reviewer.md`, `feel-tester.md`, `archiver.md`, `utility.md`, `vision.md` | NEW: `templates-data/opencode/agents/{zh-CN,en}/*.md` (18 文件) |
| 1.2 | 创建 `templates-data/opencode/skills/` | 复制当前 `.opencode/skills/` 下 **14 个** skill 子目录（各含 `SKILL.md`）。Skill 内容不区分语言（已是中文）。目录名列表：`agent-model-check`, `bug-acceptance`, `check-kb`, `get-bugs`, `get-stage-status`, `health`, `model-check`, `model-config`, `recover`, `roadmap`, `search-kb`, `sync-status`, `update-stage-status`, `wizard` | NEW: `templates-data/opencode/skills/{14 子目录}/SKILL.md` |
| 1.3 | 创建 `templates-data/opencode/instructions/` | 按语言创建 `zh-CN.md` / `en.md`（从当前 `.opencode/instructions/core.md` 拆分为双语版本，内容保持一致） | NEW: `templates-data/opencode/instructions/{zh-CN,en}.md` |
| 1.4 | 创建 `templates-data/opencode/` 根级模板文件 | ① `opencode.jsonc`（含 `{项目名称}` 占位符，skills 字段留锚点占位，由 build.js 自动注入完整列表）<br>② `ADAPTER.zh-CN.md` / `ADAPTER.en.md`（从当前单一 `ADAPTER.md` 拆分为中英双语版，见 REV-006）<br>③ `.gitignore`<br>⚠️ **不含 `package.json`**——当前 `.opencode/package.json` 中的 `@opencode-ai/plugin` 是 OpenFeel 开发依赖，不属于通用模板（REV-001） | NEW: `templates-data/opencode/{opencode.jsonc,ADAPTER.zh-CN.md,ADAPTER.en.md,.gitignore}` |
| 1.5 | 更新 `build.js` — 新增 `generateOpencodeTemplates()` | 新增步骤 5：读取 `templates-data/opencode/` 下全部内容，按类别分别注入 `template-loader.ts` 的新增 AUTO-GENERATED 锚点段。<br>**关键细节**：<br>① 读取 `opencode.jsonc` 模板，扫描 `templates-data/opencode/skills/` 目录，将 14 个 skill 名注入 `opencode.jsonc` 的 `skills` 字段（替换占位锚点），然后整体注入 template-loader.ts<br>② 读取 `ADAPTER.{lang}.md` 按语言键注入<br>③ 读取 `.gitignore` 不区分语言<br>④ 新增 `validateOpencodeTemplates()` 校验函数：比对模板注入内容与源文件一致性 | MODIFY: `build.js` |
| 1.6 | 更新 `template-loader.ts` — 新增 AUTO-GENERATED 锚点段 | 新增三类模板常量 + 导出函数：<br>① `OPENCODE_AGENT_TEMPLATES`（同现有 AGENT_TEMPLATES 结构，双层 Record）<br>② `OPENCODE_SKILL_DEFINITIONS`（Record<string, string>，含连字符键需引号）<br>③ `OPENCODE_CONFIG_TEMPLATES`（Record<string, Record<string, string>> 按语言分组，含 instructions / opencode.jsonc / ADAPTER / .gitignore）<br>导出：`loadOpencodeAgentTemplate()`, `loadOpencodeSkillTemplate()`, `loadOpencodeConfigTemplate()`, `listOpencodeAgentIds()` | MODIFY: `src/core/template-loader.ts` |

#### 产出文件清单

| 类型 | 文件 | 说明 |
|------|------|------|
| NEW | `templates-data/opencode/agents/zh-CN/*.md` (x9) | 9 个 Agent 中文定义 |
| NEW | `templates-data/opencode/agents/en/*.md` (x9) | 9 个 Agent 英文定义 |
| NEW | `templates-data/opencode/skills/*/SKILL.md` (x14) | 14 个 Skill 定义 |
| NEW | `templates-data/opencode/instructions/zh-CN.md` | 中文操作规范 |
| NEW | `templates-data/opencode/instructions/en.md` | 英文操作规范 |
| NEW | `templates-data/opencode/opencode.jsonc` | 平台配置模板（skills 列表由 build.js 自动注入） |
| NEW | `templates-data/opencode/ADAPTER.zh-CN.md` | 中文适配器说明（REV-006） |
| NEW | `templates-data/opencode/ADAPTER.en.md` | 英文适配器说明（REV-006） |
| NEW | `templates-data/opencode/.gitignore` | opencode 平台 git 忽略规则 |
| MODIFY | `build.js` | 新增 opencode 模板注入步骤 + 校验函数 |
| MODIFY | `src/core/template-loader.ts` | 新增 3 个 AUTO-GENERATED 段 + 导出函数 |

#### 关键设计决策

1. **为何新建 `OPENCODE_*` 常量而非复用现有 `AGENT_TEMPLATES`**：现有 `AGENT_TEMPLATES` 数据源为 `templates-data/agents/`（用于 `.openfeel/` 内部 Agent 提示词），与 opencode 平台的 Agent 定义是不同概念。分离开避免混淆，且 `update.ts` 中的 SKILL_DEFINITIONS 也可后续迁移到统一管线。

2. **Skill 不区分语言**：当前 `.opencode/skills/` 下的 SKILL.md 均为中文内容，无英文本地化需求。但为保持管线一致性，仍按 `templates-data/opencode/skills/{name}/SKILL.md` 组织，`build.js` 读取后直接作为单语言模板注入。

3. **`opencode.jsonc` 中 `{项目名称}` 占位符**：与 AGENTS.md 使用相同的替换标记，`init.ts` 中统一处理。`opencode.jsonc` 中的 `skills` 字段列表由 `build.js` 在构建时从 `templates-data/opencode/skills/` 目录自动扫描生成，确保始终与 skill 目录同步（REV-005）。

4. **`package.json` 不纳入部署模板**（REV-001）：当前 `.opencode/package.json` 中唯一依赖 `@opencode-ai/plugin` 是 OpenFeel 自身开发所需的 opencode 平台插件。部署到用户项目时，用户项目可能使用不同工具链，不应强制安装此依赖。`init` 和 `update` 的 opencode 部署步骤均不写入 `package.json`。

5. **`ADAPTER.md` 双语拆分**（REV-006）：当前单语言 `ADAPTER.md` 仅含中文说明。拆分为 `ADAPTER.zh-CN.md`（中文）和 `ADAPTER.en.md`（英文），遵循与其他模板文件一致的双语约定。部署时根据用户选择的语言写入对应文件（文件名不带语言后缀，部署后为 `ADAPTER.zh-CN.md` / `ADAPTER.en.md`）。

6. **init/update 共用同一数据源**（REV-003）：`init.ts` 通过 `template-loader.ts` 导出的 `loadOpencode*()` 函数部署 opencode 适配器；`update.ts` 未来也统一使用相同的 `template-loader.ts` 函数。两者数据源均为 `templates-data/opencode/` → `build.js` → `template-loader.ts`，确保内容一致。当前 `update.ts` 中 `SKILL_DEFINITIONS` 为手工内联，后续可迁移到统一管线，但本阶段不做此改造——init 和 update 的输出内容保持一致即可。

---

### Stage-29-02：init 集成 — OpenCode 部署确认 + opencode 部署 + AGENTS.md 修复 + 测试

> **目标**：在 `init` 流程中新增 OpenCode 部署确认步骤并部署 opencode 适配器，修复 AGENTS.md 项目名称占位符，增加重启提醒和自动化测试。
> **前置依赖**：[hard] Stage-29-01 — 模板数据源化和构建管线必须先完成，确保 `template-loader.ts` 导出函数可用
> **预计涉及文件数**：3~4 个核心文件 + 1 个测试文件
> **关键风险**：init 交互流程变更需确保非交互模式（CI/CD）兼容、"已存在不覆盖"原则需逐文件判断

#### 任务分解

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 2.1 | 修复 AGENTS.md `{项目名称}` 占位符替换 | 在 `initProject()` 步骤 8 写 AGENTS.md 前，对 `loadTemplate()` 返回的内容执行 `replace(/\{项目名称\}/g, path.basename(projectPath))` | MODIFY: `src/core/init.ts` |
| 2.2 | 新增 `promptOpencodeDeploy()` 交互函数 | 重命名自原 `promptPlatform()`（REV-004）。当前仅一个平台（opencode），交互极其简单：<br>- **交互模式**：提问 "是否部署 OpenCode 平台适配器？[Y/n]"，默认 Y<br>- **非交互模式**（`!stdout.isTTY`）：返回 `false`，静默跳过<br>- **返回类型**：`Promise<boolean>`（未来多平台时再重构为多选） | MODIFY: `src/core/init.ts` |
| 2.3 | 新增 `deployOpencode()` 函数 | 在 `init.ts` 中实现 opencode 适配器部署逻辑：<br>- 读取 `loadOpencodeAgentTemplate(lang, agentId)` 写入 `.opencode/agents/{agentId}.md`<br>- 读取 `loadOpencodeSkillTemplate(skillName)` 写入 `.opencode/skills/{name}/SKILL.md`<br>- 读取 `loadOpencodeConfigTemplate(lang, 'instructions')` 写入 `.opencode/instructions/core.md`<br>- 读取 opencode.jsonc 模板，替换 `{项目名称}` 后写入项目根<br>- 读取 `ADAPTER.{lang}.md` 模板，按语言写入对应文件<br>- 读取 `.gitignore` 写入 `.opencode/.gitignore`<br>- ⚠️ **不部署 `package.json`**（REV-001）<br>- **所有写入遵循"已存在不覆盖"原则**（使用 `writeTemplateIfMissing`）<br>- 返回 `{ created, skipped }` 计数 | MODIFY: `src/core/init.ts` |
| 2.4 | 更新 `initProject()` 主流程 | 调整步骤顺序为：语言选择 → `promptOpencodeDeploy()` → 部署 .openfeel/ → `deployOpencode()`（如用户确认）→ 生成 AGENTS.md（已替换项目名）<br>在输出结果中增加 opencode 部署统计（created/skipped 计数）<br>**新增重启提醒**（见任务 2.7） | MODIFY: `src/core/init.ts` |
| 2.5 | 新增 i18n 字符串（可选） | 若 OpenCode 部署提示需要新 i18n 键，添加到 `zh-CN.ts` / `en.ts` 的 `init` 域下（如 `init.opencodePrompt`, `init.opencodeDeploying`, `init.opencodeSkipped`, `init.opencodeRestart`） | MAYBE: `src/core/i18n-data/zh-CN.ts`, `en.ts` |
| 2.6 | **新增测试用例**（REV-002） | 在 `test/core/init.test.ts` 中新增以下测试用例：<br>① `{项目名称}` 变量替换正向验证：init 后 AGENTS.md 中不含 `{项目名称}` 字面量，已被替换为目录名<br>② `deployOpencode()` 创建/跳过计数：验证首次部署返回正确的 created 数量（9 agents + 14 skills + instructions + opencode.jsonc + 2 ADAPTER + .gitignore = 28），重复 init 返回 skipped<br>③ 非交互模式跳过 OpenCode 部署确认（`!stdout.isTTY` 时 `.opencode/` 目录不存在）<br>④ opencode.jsonc 中 `{项目名称}` 被正确替换 | MODIFY: `test/core/init.test.ts` |
| 2.7 | **新增重启提醒**（用户需求） | 在 `initProject()` 末尾，若 `deployOpencode()` 返回 `created > 0`，输出重启提醒：<br>- 交互模式：`console.log("opencode 配置已部署，请重启 opencode 以加载新配置。")`<br>- 非交互模式（CI/CD）：静默跳过，不输出提醒 | MODIFY: `src/core/init.ts` |
| 2.8 | **update 命令同步重启提醒**（用户需求） | 在 `updateProject()` 末尾，若本次更新修改了 agent 配置（如 Agent .md 文件实际发生了 updated 而非 skipped），在返回前输出重启提醒：<br>- 交互模式：`console.log("opencode agent 配置已更新，请重启 opencode 以加载新配置。")`<br>- 非交互模式：静默跳过<br>判断标准：`updated` 数组中包含 `.opencode/agents/` 下的条目 | MODIFY: `src/core/update.ts` |

#### 产出文件清单

| 类型 | 文件 | 说明 |
|------|------|------|
| MODIFY | `src/core/init.ts` | 核心变更：AGENTS.md 变量替换 + `promptOpencodeDeploy()` + `deployOpencode()` + 重启提醒 |
| MODIFY | `src/core/update.ts` | 新增 update 后重启提醒逻辑 |
| MODIFY | `test/core/init.test.ts` | 新增 4 个测试用例（REV-002） |
| MAYBE | `src/core/i18n-data/zh-CN.ts` | 新增 OpenCode 部署相关 i18n 键 |
| MAYBE | `src/core/i18n-data/en.ts` | 新增 OpenCode 部署相关 i18n 键（英文） |

#### 关键设计决策

1. **`promptOpencodeDeploy()` 为单平台简化版**（REV-004）：当前仅 opencode 一个平台，不需要抽象为通用 `promptPlatform()`。函数直接返回 `boolean`，交互为简单的 "是否部署 OpenCode 平台适配器？[Y/n]" 默认 Y。未来多平台时再重构为多选。

2. **非交互模式兼容**：CI/CD 等 `!stdout.isTTY` 环境自动跳过 OpenCode 部署确认和重启提醒，仅完成核心初始化。用户可通过 `openfeel update` 事后部署。

3. **i18n 键边界**：若部署提示文本简单（如 "是否部署 OpenCode 平台适配器？[Y/n]"），可直接硬编码中英字符串而不新增 i18n 键，保持轻量。任务 2.5 标记为"可选"。

4. **重启提醒时机**（用户需求）：
   - **init**：首次部署 opencode 适配器后提醒。仅在 `created > 0` 时输出（纯 skipped 不提醒，因为 opencode 已加载过配置）。
   - **update**：agent 配置实际发生变更后提醒。仅在 `updated` 数组含 `.opencode/agents/` 条目时输出。
   - **非交互模式**：CI/CD 环境静默跳过，不输出提醒。

5. **init/update 内容一致性**（REV-003）：`init.ts` 的 `deployOpencode()` 和 `update.ts` 的 `updateProject()` 使用相同的 `template-loader.ts` 导出函数获取模板内容。数据源链路：`templates-data/opencode/` → `build.js` 构建注入 → `template-loader.ts` 运行时提供。init 先执行、update 后执行的场景下，update 仅更新内容有变化的文件（`writeIfChanged`），不会产生冲突。

---

## 依赖关系

```yaml
stages:
  stage-29-01:
    depends_on: []
    dependency_type: null
    description: OpenCode 模板数据源化与构建管线

  stage-29-02:
    depends_on: [stage-29-01]
    dependency_type: hard
    description: init 集成 — 必须在模板注入完成后才能使用导出函数
```

---

## 测试策略

### Stage-29-01 自测清单

- [ ] `npm run build` 成功，无构建错误
- [ ] `build.js` 的 `validateTemplates()` 新增 opencode 模板一致性校验通过
- [ ] `template-loader.ts` 新增导出函数可正确导入（TypeScript 编译检查）
- [ ] `templates-data/opencode/agents/{zh-CN,en}/` 下 18 个文件内容与当前 `.opencode/agents/` 一致
- [ ] `templates-data/opencode/skills/` 下 14 个 SKILL.md 与当前 `.opencode/skills/` 一致
- [ ] `templates-data/opencode/` 下 **不含 `package.json`**（REV-001 验证）
- [ ] `opencode.jsonc` 模板中 skills 列表为 14 个，且 `{项目名称}` 占位符存在

### Stage-29-02 自测清单

- [ ] `npm run build` 成功
- [ ] 现有测试套件（298/298）无回归
- [ ] **新增测试用例全部通过**（REV-002）：
  - [ ] `{项目名称}` 变量替换正向验证
  - [ ] `deployOpencode()` 创建/跳过计数
  - [ ] 非交互模式跳过 OpenCode 部署确认
  - [ ] opencode.jsonc 中 `{项目名称}` 被正确替换
- [ ] 交互模式 `openfeel init /tmp/test-project` → 确认部署 opencode → 验证产出：
  - [ ] `AGENTS.md` 中 `{项目名称}` 已被替换为 `test-project`
  - [ ] `opencode.jsonc` 中 `{项目名称}` 已被替换
  - [ ] `.opencode/agents/` 下有 9 个 Agent .md 文件
  - [ ] `.opencode/skills/` 下有 14 个 Skill 目录
  - [ ] `.opencode/instructions/core.md` 存在
  - [ ] `.opencode/ADAPTER.zh-CN.md`（或 en）存在
  - [ ] `.opencode/.gitignore` 存在
  - [ ] `.opencode/` 下 **无 `package.json`**（REV-001 验证）
  - [ ] **重启提醒已输出**："opencode 配置已部署，请重启 opencode 以加载新配置。"
- [ ] 拒绝 OpenCode 部署：重新 init，选择不部署 → 验证 `.opencode/` 不存在，无重启提醒
- [ ] 非交互模式 `echo "" | openfeel init /tmp/test-ci` → 跳过 OpenCode 部署，仅部署 `.openfeel/`，无重启提醒
- [ ] 重复 init 同一目录 → "已存在不覆盖"，文件不被覆盖，无重启提醒（created = 0）
- [ ] `openfeel update` 在已有项目上仍正常工作（不退化）
- [ ] `openfeel update` 修改 agent 配置后输出重启提醒（REV-003 + 用户需求）
- [ ] **init → update 顺序执行无冲突**（REV-003 验收）：先 init 部署 opencode，再 update 同一项目，update 仅报告 skipped 或 updated，无异常

---

## 风险与缓解

| 风险 | 概率 | 影响 | 缓解措施 |
|------|------|------|----------|
| 构建管线锚点冲突 | 低 | 构建失败 | 新锚点名使用 `OPENCODE_*` 前缀，与现有 `CORE_INSTRUCTIONS_*`、`AGENT_*`、`AGENTS_MD_*` 命名空间隔离 |
| 模板文件与 .opencode/ 源文件不同步 | 中 | 部署内容过时 | 构建时 `validateTemplates()` 新增 opencode 校验，不一致则 exit(1) |
| init 已有 .opencode/ 的项目时覆盖 | 低 | 用户数据丢失 | `writeTemplateIfMissing` 已严格执行"存在即跳过"；`deployOpencode()` 复用同一机制 |
| 交互流程在 CI 中阻塞 | 低 | CI 挂起 | `!stdout.isTTY` 时跳过 OpenCode 部署确认和重启提醒，不等待输入 |
| i18n 新增键遗漏 | 低 | 界面缺少文案 | 任务 2.5 标记为可选，简单文案可直接硬编码 |
| skills 列表与模板不同步 | 低 | 部署的 opencode.jsonc 缺失 skill | build.js 从 `templates-data/opencode/skills/` 自动扫描生成，构建失败即报错（REV-005） |
| update.ts 中的 SKILL_DEFINITIONS 与 init 不完全一致 | 低 | 先后执行结果微差 | 当前两者使用不同源（update.ts 内联 vs template-loader.ts 注入），但内容均从 `.opencode/skills/` 同步，build.js 校验可捕获差异（REV-003） |

---

## 下一步

计划经 Reviewer 审查通过后，进入 Schemer 阶段制定细粒度操作方案（op-NNN.md）。

> ⚠️ 流水线状态推进由 Feel 执行，Planner 不直接操作 flow.json。
