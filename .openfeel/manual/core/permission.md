# 权限模型（Agent permission）

> 模块文档，由归档官在归档时维护。对应交付：`src/core/templates-data/opencode/agents/{zh-CN,en}/*.md`（agent 模板 `permission` 块）；
> 关联源码：`src/core/template-loader.ts`（部署源生成段）、`src/core/managed-region.ts`（frontmatter 浅合并）、`src/core/update.ts`（`writeManagedFile` 受管区写入）、`src/core/opencode-config.ts`（opencode.jsonc 构建/合并）。

## 职责

说明 OpenFeel 9 个 agent 的 opencode `permission` 白名单构成、配置合并/优先级语义、项目级收紧入口，以及 `openfeel setup/update` 对用户自定义的保留边界。

## 9 个 agent 的 permission 键集（v1.1.2-stage-44 补键后）

| agent | 键集（zh-CN 与 en 完全一致） |
|-------|------------------------------|
| `feel` | bash, read, glob, grep, task, todowrite, skill, webfetch, **external_directory** |
| `openfeel-archiver` | bash, read, glob, grep, **external_directory** |
| `openfeel-executor` | bash, read, glob, grep, task, **external_directory** |
| `openfeel-feel-tester` | bash, read, glob, grep, task, skill, `webfetch: "deny"`, **external_directory** |
| `openfeel-planner` | bash, read, glob, grep, **external_directory** |
| `openfeel-reviewer` | bash, read, glob, grep, **external_directory** |
| `openfeel-schemer` | bash, read, glob, grep, **external_directory** |
| `openfeel-utility` | bash, read, glob, grep, **`edit`**, `external_directory` |
| `openfeel-vision` | bash, read, glob, grep, **external_directory** |

> 全部值均为 `"allow"`，唯 `openfeel-feel-tester` 的 `webfetch` 为 `"deny"`（保留最小权限意图）。
> 补键来源：`docs/phase-5/07-openfeel-permission-issue.md` §四建议 1；值形式与 `write→edit` 裁定见下「实测结论」。

## 合并与优先级语义（隔离实测，opencode 1.18.33）

实测记录：`.openfeel/plan/v1/stage-44/op-001-findings.md`（隔离 HOME + `opencode debug agent` / `opencode run` 判别器）。

1. **求值算法**：规则列表 `findLast`（**最后匹配者胜**），规则 `permission` 字段按通配匹配（`"*"` 匹配任意权限名）。
2. **规则顺序**：`[opencode 内置默认]` → `[配置文件的 permission（顶层 permission 与 agent.<name>.permission）]` → `[agent .md frontmatter 的 permission]` → `[自动追加：opencode 自身 tool-output 目录 allow]`。
3. **合并粒度**：agent `.md` frontmatter 与配置文件**按权限键深合并**——**同名键以 agent `.md` 为准**，配置文件无法覆盖；**agent `.md` 未声明的键**才由 `opencode.jsonc`（顶层 `permission` 或 `agent.<name>.permission`）生效。
4. **`external_directory` 默认值**：`ask`（内置默认 `{"*":"ask"}` + 内部目录 allow）；自动追加逻辑**仅覆盖 opencode 自身 `tool-output` 目录**，不存在对全部 agent 追加 `"*":"allow"` 的行为。故补键是**行为变更**（`ask` → `allow`），与 O2「框架默认放行」目标一致。
5. **键名有效性**：授权键为 **`edit`**（write/patch 工具映射到 `edit` 权限）；`write` 键**不被识别**（`write: "deny"` 不生效）——`openfeel-utility` 已由 `write` 改回 `edit`。
6. **值形式**：单值 `external_directory: "allow"` 与对象 `{"*": "allow"}` **均被 schema 接受且等价**（实测版本 1.18.33）；本框架统一采用单值形式。

## 项目级收紧入口（唯一可用路径）

在**项目根**新建 `.opencode/agent/<name>.md`，覆盖全局同名 agent，并**重写完整 `permission` 块**（未重写的键回落该文件自身的声明，不继承全局文件）：

```yaml
---
description: Feel（项目级覆盖）
mode: primary
permission:
  bash: "allow"
  read: "allow"
  glob: "allow"
  grep: "allow"
  task: "allow"
  todowrite: "allow"
  skill: "allow"
  webfetch: "allow"
  external_directory:
    "~/secrets/**": "deny"
    "*": "allow"
---
```

> **为何不用 `opencode.jsonc`**：`agent.<name>.permission` 与 agent `.md` frontmatter **按键深合并、`.md` 优先**，故对 `.md` 已声明的键（含补键后的 `external_directory`）**无法收紧**；「镜像全量键」的写法亦无效（实测 R5/R6：项目 `deny` / 顶层 `ask` 均被 `.md` 的 `allow` 压过）。项目级 agent 文件才是可覆盖全字段的入口。

## O4：`openfeel setup`/`update` 与用户自定义的边界

- agent `.md` 经 `deployGlobalAsset` → `writeManagedFile`（`src/core/update.ts`）写入：
  - **frontmatter** 走 `mergeFrontmatter`（`src/core/managed-region.ts`），即浅合并 `{...existing, ...incoming}`——**同名字段被框架覆盖**，其中嵌套的 `permission` 对象**整体覆盖、非深合并**；
  - **正文**仅替换 `<!-- openfeel:begin/end -->` 受管区，**区外用户内容保留**；无标记且 hash 不符时只追加不改写并记 `update_infos`。
- 结论：**勿手改全局 agent 文件 frontmatter 的 `permission`**（会被 `update` 覆盖）；项目级 permission 自定义请走项目 `.opencode/agent/<name>.md`；正文自定义请写在受管区外。

## O5：不采纳「只读外部放行 / 写入才询问」

`external_directory` 在 opencode 中为**单一键**（无 read/write 子粒度，实测 schema 与示例一致），该诉求在平台上**无法表达**，故不采纳（记录备查）。

## 生效时机

opencode 仅在**启动时**读取配置；修改 agent 文件或 `opencode.jsonc` 后须**退出并重启** opencode 才生效。

## 变更历史

| 阶段 | 变更 |
|------|------|
| v1.1.2-stage-44 | 初始创建；9×2 agent 模板补 `external_directory: "allow"`（单值形式，实测裁定）；`openfeel-utility` 的 `write` → `edit`（实测 `write` 非授权键）；文档化覆盖/合并语义与项目级收紧入口（`.opencode/agent/<name>.md`）；依据 `op-001-findings.md` 更正需求原文关于「顶层 `permission: allow` 不生效」的过度概括 |
