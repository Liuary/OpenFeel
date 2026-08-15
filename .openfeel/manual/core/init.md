# 项目初始化模块（init）

> 模块文档，由归档官在归档时维护。对应源码：`src/core/init.ts`。

## 职责

项目初始化编排，协调创建 `.openfeel/` 工作区目录、写入配置、初始化 `flow.json`、确保身份文件、生成模板文件（`dev_core.md`、`current.md`、`decisions.md`、`kb/index.md`、`AGENTS.md`），并提供 OpenCode 平台适配器部署、示例项目骨架（`--demo`）和一键 demo 模式。

## 核心 API

| 函数 | 功能 |
|------|------|
| `initProject(projectPath, cliLang?)` | 主初始化流程：创建目录 → 写 config → init flow.json → 语言选择 → OpenCode 部署确认 → 生成模板文件 → AGENTS.md 变量替换 → 重启提醒 |
| `initDemo(projectPath, lang)` | 创建示例项目骨架（TS 项目 + vitest 配置 + 示例测试 + 示例阶段） |
| `deployOpencode(projectPath, lang)` | 部署 OpenCode 平台适配器到目标项目（Agents、Skills、instructions、opencode.jsonc、ADAPTER、.gitignore），遵循"已存在不覆盖"原则 |
| `promptOpencodeDeploy(lang)` | 交互式确认是否部署 OpenCode 适配器（Y/n，默认 Y），非交互模式返回 false |
| `writeTemplateIfMissing(filePath, content)` | 底层工具：仅在目标不存在时写入，返回 `{ created: boolean }` |
| `ensureGlobalConfig()` | 首次使用时的全局配置引导（语言选择），交互模式中英双语提示 |

## 类型定义

```typescript
/** 初始化结果 */
interface InitResult {
  created: string[];                           // 创建的目录/文件列表
  updated: string[];                           // 更新的文件列表
  opencode?: OpencodeDeployResult;             // OpenCode 部署结果（仅部署时有）
}

/** OpenCode 部署结果 */
interface OpencodeDeployResult {
  created: number;                             // 新创建文件数
  skipped: number;                             // 跳过文件数（已存在）
}

/** 示例骨架结果 */
interface DemoResult {
  created: string[];                           // 创建的文件列表
  skipped: string[];                           // 跳过的文件列表
}
```

## 初始化流程（initProject）

```
步骤 0: ensureGlobalConfig() — 首次使用引导
步骤 1: createWorkspace() — 创建 .openfeel/ 目录结构
步骤 1a: promptLanguage() — 语言选择（CLI --lang > 交互式 > 全局默认）
步骤 1b: promptOpencodeDeploy() — OpenCode 部署确认
步骤 2: writeDefaultConfig() — 写入 config.yaml
步骤 3: FlowManager.initFlow() — 初始化 flow.json
步骤 4: ensureInfoJson() — 确保 .info.json 存在
步骤 4b: writeLang() — 写入语言配置到 .info.json
步骤 5: writeTemplateIfMissing(dev_core.md)
步骤 6: writeTemplateIfMissing(current.md)
步骤 6b: writeTemplateIfMissing(decisions.md) — 生成 ADR 决策记录骨架（getDecisionsTemplate）
步骤 7: writeTemplateIfMissing(kb/index.md)
步骤 7b: deployOpencode() — 部署 OpenCode 适配器（如确认）
步骤 8: 生成 AGENTS.md（含 {项目名称} 替换）
步骤 9: 检测 package.json → 添加 @vitest/coverage-v8（如有 vitest）
步骤 10: 重启提醒（如 opencode 首次部署）
```

## OpenCode 部署内容

`deployOpencode()` 部署 6 类文件到目标项目：

| 类别 | 数量 | 目标路径 |
|------|:--:|------|
| Agent 定义 | 9 | `.opencode/agents/{agent}.md` |
| Skill 定义 | 14 | `.opencode/skills/{name}/SKILL.md` |
| 操作规范 | 1 | `.opencode/instructions/core.md` |
| 平台配置 | 1 | `opencode.jsonc`（含 `{项目名称}` 替换） |
| 适配器说明 | 1 | `.opencode/ADAPTER.{zh-CN\|en}.md` |
| 忽略规则 | 1 | `.opencode/.gitignore` |

⚠️ 不部署 `.opencode/package.json`（REV-001 设计决策：避免用户项目引入不必要的 `@opencode-ai/plugin` 依赖）。

## 语言回退

- 所有 `loadOpencode*` 函数在 lang 不存在时回退 `zh-CN`
- `initProject` 语言选择优先级：CLI `--lang` 参数 > 交互式选择 > 全局默认语言
- 非交互模式（CI/CD）默认 `zh-CN`

## 变更历史

| 阶段 | 变更 |
|------|------|
| stage-04 | 新增 `initDemo()` 支持 `--demo` 标志 |
| stage-29 | 新增 `promptOpencodeDeploy()` + `deployOpencode()` + AGENTS.md `{项目名称}` 替换 + 重启提醒；`InitResult` 扩展 `opencode` 字段 |
| stage-33 | 新增 decisions.md 生成步（6b 步，`getDecisionsTemplate`）；templates.ts 新增 `DECISIONS_TEMPLATE_ZH/EN` + `getDecisionsTemplate(lang)` |
