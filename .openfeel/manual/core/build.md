# 构建管线模块（build）

> 模块文档，由归档官在归档时维护。对应源码：项目根 `build.js`。

## 职责

`npm run build` 的构建脚本，负责：

1. 从模板源读取 agent / skill / instructions / AGENTS.md 模板，内联为 TS 字符串常量写入 `src/core/template-loader.ts` 与 `src/core/update.ts` 的 `AUTO-GENERATED-BEGIN/END` 块。**skill 权威源 = 中立共享源 `src/core/templates-data/skills/`**（stage-68 由 `opencode/skills` 迁入，两 harness 共用）；agent / ADAPTER 源自 `src/core/templates-data/opencode/`；**Claude Code 内容源 = `src/core/templates-data/claude/`**（agents **10×2** + constraint×2，stage-69 新建 / v1.2.1-stage-89 增 explorer）；AGENTS.md 模板源自 `src/core/templates-data/agents-md/`。
2. 校验模板有效性（`validateTemplates()` / `validateOpencodeTemplates()` / **`validateClaudeTemplates()`** / `validateSingleSourceConsistency()`）。
3. 调用 `npx tsc` 编译 TypeScript。
4. **（stage-55 已移除）** 原步骤 8 `.opencode/` 自举重生——仓库自身不再保留项目级部署实例（防复活：`build.js` 步骤 8 已删除）。

> 主流程：**6 步 → 8 步**（stage-69 追加 `generateClaudeAgentTemplates` + `generateClaudeConstraintTemplate` 两个生成调用 + `validateClaudeTemplates()` 校验）。

> 说明：本文中 `templates-data/opencode/` 与 `.opencode/` 均为 **opencode 适配器**的目录名（属适配器实现细节，保留）；构建管线的部署目标由适配器层决定，框架面向多 harness 适配。

## 单源一致性断言（stage-36）

`validateSingleSourceConsistency()` 断言三对注入对象**键集 + 归一化内容**一致：

- `AGENT_TEMPLATES ≡ OPENCODE_AGENT_TEMPLATES`
- `SKILL_DEFINITIONS ≡ OPENCODE_SKILL_DEFINITIONS`
- `CORE_INSTRUCTIONS_TEMPLATES ≡ OPENCODE_CONFIG_TEMPLATES[*].instructions`（逐语言解码 B64 比对）

**新增（stage-69）**：`assertKeySetsEqual` **仅比键集**（无内容比较），断言 `CLAUDE_AGENT_TEMPLATES` 键集 == `AGENT_TEMPLATES`（均 9，含 `feel`，**不再 −1**）——Claude 内容按设计**不同于** opencode，故只比键集；含内容比较的 `assertConsistent` **不**用于 Claude（避免假红）。

并断言冗余模板树（`templates-data/agents` / `templates-data/core-instructions` / **`templates-data/opencode/skills`（stage-68 起，防 skill 旧树复活）**）已不存在。任一失败即 `process.exit(1)`。

## 源路径约定（stage-36）

- 权威源分两处：**agent / ADAPTER 源 = `templates-data/opencode/`**；**skill 源 = 中立共享源 `templates-data/skills/`（stage-68 由 `opencode/skills` 迁入，两 harness 共用）**；**Claude 内容源 = `templates-data/claude/`**（stage-69 新增：`agents/{zh-CN,en}/*.md` 各 9 + `constraint/{zh-CN,en}.md`；常量 `TEMPLATE_CLAUDE_DIR`/`TEMPLATE_CLAUDE_AGENTS_DIR`/`TEMPLATE_CLAUDE_CONSTRAINT_DIR`）；`.opencode/` **不再作为受管构建产物**（stage-55 起仓库自身不再保留项目级部署实例，仅保留 opencode 运行时目录），不再作为源。
- `SKILLS_DIR = TEMPLATE_SHARED_SKILLS_DIR`（`templates-data/skills`；**stage-68 删除死常量 `TEMPLATE_OPENCODE_SKILLS_DIR` 后新增改名**）；`generateAgentDefinitions` / `generateTemplateFromCoreMd` 等读 `TEMPLATE_OPENCODE_*` 目录；步骤 6 `generateOpencodeSkillTemplates` 与 `validateOpencodeSkillDefinitions` 改读共享源常量（注入对象 `OPENCODE_SKILL_DEFINITIONS` 名/锚点/结构不变）。
- 改向后成为死常量的 6 个源目录常量（`TEMPLATE_AGENTS_DIR` / `TEMPLATE_CORE_MD_PATH` / `TEMPLATE_AGENTS_MD_PATH` / `TEMPLATE_CORE_INSTRUCTIONS_DIR` / `CORE_MD_PATH` / `AGENTS_DIR`）已删除；`TEMPLATE_AGENTS_MD_DIR`（agents-md，项目级 AGENTS.md 模板）保留。

## 行尾归一 + 生成物标记

- `.gitattributes`：`src/core/templates-data/**` 统一 `text eol=lf`（原 `.opencode/**` 行已于 stage-55 随受管实例移除而删除）。
- 各注入函数读文件后 `content.replace(/\r\n/g, '\n')`，防止 CRLF 泄漏进生成模板串（跨平台不可复现）。
- 生成物标记 `<!-- openfeel:generated — 本文件由 npm run build 生成，请勿手工编辑 -->` 的插入逻辑（`insertGeneratedMark`）随步骤 8 于 stage-55 一并移除；生成段宿主文件（`template-loader.ts` / `update.ts`）仍由 build 重生成，其 CRLF 归一仍有效。

## 步骤 8：`.opencode/` 自举重生成（**已移除（stage-55）**）

原步骤 8 置于 `npx tsc` 之后（`await import('./dist/core/fs/atomic-write.js')` 复用 stage-35 原子写），从权威源重生成 `.opencode/{agents,skills,instructions/core.md,ADAPTER.md}` 并插入生成物标记；采用「清空旧名残留目录 → 全量重写」策略（`rmSync` 而非 `git rm`，因 build 运行时无 git 依赖）。

> **移除原因（v1.1.2-stage-55）**：仓库自身不再保留项目级部署实例——全局资产已由 `openfeel setup` 幂等部署（18 skill / 9 agent / 全局 `AGENTS.md`），删除步骤 8 以消除「项目级与全局」双份资产漂移与 build 复活负担（**防复活**）。相关：`kb/architecture.md` N1 决策已被 supersede（2026-10-01）、`dev/decisions.md` 对应 ADR。

## 发布元数据与死导出清理（v1.1.2-stage-49）

整仓审查（U7）发现两条**发布门禁**缺陷，随本阶段修复：

- **B3 随包 `postinstall` 失效**：`scripts/patch-inquirer.js` 用 `rootDir=resolve(__dirname,'..')` 假设包根同级 `node_modules`，用户端依赖提升后目标多一层 → 实测「文件不存在，跳过」×2、**EXIT=0 静默**；且本包 `engines >=20.0.0` 放行 `@inquirer/core@11.2.1` 不支持的 20.0~20.16。**处置＝删除** `postinstall` 与 `scripts/patch-inquirer.js`、`files` 去 `scripts`、`engines` 收紧 `>=20.17.0`（`util.styleText` 自 Node 20.12 起内置，合法区间内补丁不必要）。包内 `.npmrc` 的 `engine-strict` 对消费者无效，故不加。
- **B4 `src/index.ts` `VERSION` 死导出**：值为 `0.1.0`（与 `package.json` 1.1.2 漂移）、全仓零引用、经 `exports["."]` 对外暴露错误版本 → **删除**（非同步）+ `npm run build` 重生成 `dist`（步骤 3 `npx tsc`），`CHANGELOG` 记 Fixed。`dist/` 为 gitignore 构建产物，不入库；**`npm pack` 产物 259 文件**（无 `scripts/`，含 `dist`/`bin`/`schemas`）。

## 变更历史

| 阶段 | 变更 |
|------|------|
| stage-36 | 源路径改指单源 + 删除 6 死常量 + 行尾归一 + `.gitattributes` + 单源一致性断言 + 步骤 8 自举重生成（生成物标记） |
| stage-49 | 发布元数据清理（B3：删随包 `postinstall` + `scripts/patch-inquirer.js` + `files` 去 `scripts` + `engines >=20.17.0`；B4：删 `src/index.ts` `VERSION` 死导出 + dist 重建） |
| stage-68 | **skill 权威源迁中立共享源**：17 skill `templates-data/opencode/skills/` → `templates-data/skills/`（`git mv` 纯重命名，**零内容变更**）；删死常量 `TEMPLATE_OPENCODE_SKILLS_DIR` → 新增 `TEMPLATE_SHARED_SKILLS_DIR`（`SKILLS_DIR` 重指）；步骤 6 4 处 + `validateOpencodeSkillDefinitions` 3 处改共享源；冗余树断言扩为含 `templates-data/opencode/skills`（防旧树复活） |
| stage-69 | **Claude 内容源注入/校验/单源键集断言**：新增 `TEMPLATE_CLAUDE_{DIR,AGENTS_DIR,CONSTRAINT_DIR}` 常量 + `generateClaudeAgentTemplates`（双层 Record）/`generateClaudeConstraintTemplate`（单层）+ `validateClaudeAgentTemplates`/`validateClaudeConstraintTemplate`/`validateClaudeTemplates` 包装；单源一致性**新增 `assertKeySetsEqual`（仅键集）** 断言 Claude agents 键集 == opencode（9 含 feel，不再 −1）；主流程 **6→8 步**；**本 op 亦在 `template-loader.ts` 新增 2 个 AUTO-GENERATED 锚点桩**（loader 导出函数归 op-005） |
| stage-55 | **移除步骤 8 `.opencode/` 自举重生成**（`regenerateOpencodeInstance` 函数 + 调用 + 分区注释 + 仅其使用的 `insertGeneratedMark` + 因此失效的 `mkdirSync` import）；`.gitattributes` 去 `.opencode/** text eol=lf` 行；仓库自身不再保留项目级部署实例（防复活，详「步骤 8」节） |
