# 构建管线模块（build）

> 模块文档，由归档官在归档时维护。对应源码：项目根 `build.js`。

## 职责

`npm run build` 的构建脚本，负责：

1. 从唯一权威源 `src/core/templates-data/opencode/` 读取 agent / skill / instructions / AGENTS.md 模板，内联为 TS 字符串常量写入 `src/core/template-loader.ts` 与 `src/core/update.ts` 的 `AUTO-GENERATED-BEGIN/END` 块。
2. 校验模板有效性（`validateTemplates()` / `validateOpencodeTemplates()` / `validateSingleSourceConsistency()`）。
3. 调用 `npx tsc` 编译 TypeScript。
4. 重生成 `.opencode/` 自举实例（步骤 8，含生成物标记）。

## 单源一致性断言（stage-36）

`validateSingleSourceConsistency()` 断言三对注入对象**键集 + 归一化内容**一致：

- `AGENT_TEMPLATES ≡ OPENCODE_AGENT_TEMPLATES`
- `SKILL_DEFINITIONS ≡ OPENCODE_SKILL_DEFINITIONS`
- `CORE_INSTRUCTIONS_TEMPLATES ≡ OPENCODE_CONFIG_TEMPLATES[*].instructions`（逐语言解码 B64 比对）

并断言冗余模板树（`templates-data/agents` / `templates-data/core-instructions`）已不存在。任一失败即 `process.exit(1)`。

## 源路径约定（stage-36）

- 唯一权威源 = `templates-data/opencode/`；`.opencode/` 降级为构建产物（自举实例），不再作为源。
- `SKILLS_DIR` 重指 `templates-data/opencode/skills`；`generateAgentDefinitions` / `generateTemplateFromCoreMd` 等改读 `TEMPLATE_OPENCODE_*` 目录。
- 改向后成为死常量的 6 个源目录常量（`TEMPLATE_AGENTS_DIR` / `TEMPLATE_CORE_MD_PATH` / `TEMPLATE_AGENTS_MD_PATH` / `TEMPLATE_CORE_INSTRUCTIONS_DIR` / `CORE_MD_PATH` / `AGENTS_DIR`）已删除；`TEMPLATE_AGENTS_MD_DIR`（agents-md，项目级 AGENTS.md 模板）保留。

## 行尾归一 + 生成物标记

- `.gitattributes`：`src/core/templates-data/**` 与 `.opencode/**` 统一 `text eol=lf`。
- 各注入函数读文件后 `content.replace(/\r\n/g, '\n')`，防止 CRLF 泄漏进生成模板串（跨平台不可复现）。
- 生成物标记 `<!-- openfeel:generated — 本文件由 npm run build 生成，请勿手工编辑 -->`：有 YAML frontmatter 的文件插在闭合 `---` 之后（插之前破坏 frontmatter 解析），无 frontmatter 的插首行。

## 步骤 8：`.opencode/` 自举重生成

置于 `npx tsc` 之后（`await import('./dist/core/fs/atomic-write.js')` 复用 stage-35 原子写），从权威源重生成 `.opencode/{agents,skills,instructions/core.md,ADAPTER.md}` 并插入生成物标记；采用「清空旧名残留目录 → 全量重写」策略（`rmSync` 而非 `git rm`，因 build 运行时无 git 依赖）。

## 变更历史

| 阶段 | 变更 |
|------|------|
| stage-36 | 源路径改指单源 + 删除 6 死常量 + 行尾归一 + `.gitattributes` + 单源一致性断言 + 步骤 8 自举重生成（生成物标记） |
