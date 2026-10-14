# req 命令组（需求流转命令面）

> 模块文档，由归档官在归档时维护。对应源码：`src/commands/req.ts`（命令薄层）。**v1.2.0-stage-85 新建**；**v1.2.1-stage-87 补**：`split` 子命令（10 → 11）、首个带 `--json` 的写命令、`next --limit`、`board` owner 后缀、`show` 父子展示（**需求与版本解绑**：`target_version` 为纯展示/过滤/排序维度，全生命周期非门）。
>
> 快照声明：本文档为命令面深入参考；命令/参数细节以 `node bin/openfeel.js req --help`（本仓）实时输出为准。

## 定位与分工

- **引擎单点**：校验 / 状态流转 / 认领占用 / 关联唯一性 / done 门**全部单点在** `src/core/req/`（`types.ts` + `requirement-ops.ts` + `body-file.ts` + `aggregate.ts`）——见 [core/req.md](../core/req.md)（**引擎面**，不在本文重复）。
- **本文件**：`src/commands/req.ts` 命令薄层（参数解析 → 调用引擎原语 → 错误码→文案映射 → 退出码）的**命令面深入参考**：子命令 / 选项 / `--json` 契约 / 退出码 / help 键双规。
- **命令层零业务逻辑**：字段白名单 / 值域 / 流转合法性 / 占用 / 关联唯一性 / done 门一律由引擎单点判定。
- **概览入口**见 [cli/commands.md](commands.md)「需求命令组 `req`」节（**概览级**，不重复展开）。

## 子命令（11）

> 以下用法以 `node bin/openfeel.js req <sub> --help` 实测为准。**v1.2.1-stage-87 增 `split`（10 → 11）**。

| 子命令 | 用法 | 关键选项 | 行为要点 | 退出码 |
|--------|------|----------|----------|:--:|
| `add` | `req add <title>` | `--target-version <version>`、`--priority <P0\|P1\|P2>` | 创建需求（ID 自动分配 `REQ-NNN`；正文骨架铺到 `.openfeel/requirements/`）；**唯一抛错原语**（构造期入参校验）；骨架失败不 `save()` | 0 / 1 |
| `split` | `req split <id> --into <title>` | `--into <title>`（**可重复**，至少一项）、`--json` | **拆分一等动作**（v1.2.1-stage-87）：把需求拆为若干子需求（顺序 ID + `parent_id` + 初值 `scheduled`，**拆分即发布**）；**本仓首个 repeatable option** + **首个带 `--json` 的写命令**；失败零写盘（父不存在/父终态/空标题/无 `--into`） | 0 / 1 / 2 |
| `list` | `req list` | `--status <status>`、`--target-version <version>`、`--owner <owner>`、`--json` | 列出需求（多条件 AND）；`--status` 值域取 `REQ_STATUSES`，非法 → exit 1 | 0 / 1 |
| `show` | `req show <id>` | `--json` | 需求详情；关联阶段为**原始只读 id 枚举**（零 done/进度聚合）；v1.2.1-stage-87：human +2 行（`父需求:` / `子需求:`）、`--json` 追加 `parent`/`children`（**只增不改**；悬空 `parent_id` 原样回显不报错） | 0 / 1 |
| `claim` | `req claim <id>` | `--owner <owner>` | 认领（占用校验；已被他人认领则拒绝）；`--owner` 缺省走三级链；同 owner 幂等 | 0 / 1 / 2 |
| `release` | `req release <id>` | — | 释放认领（未占用为 **no-op 成功** exit 0） | 0 / 1 / 2 |
| `set` | `req set <id>` | `--status` / `--title` / `--target-version` / `--priority` | 更新需求字段（白名单）；命令层零校验，值域/流转合法性由引擎判定 | 0 / 1 / 2 |
| `link` | `req link` | `--stage <stageId>`、`--requirement <id>`、`--unlink` | 关联需求到阶段 / 解绑（`--requirement` 与 `--unlink` **二选一**）；`already_linked` 硬拒 | 0 / 1 / 2 |
| `advance` | `req advance <id>` | `--to <status>` | 显式推进状态（合法目标由引擎流转表判定；done 须全部关联阶段 done）；**不设 `--force`** | 0 / 1 / 2 |
| `board` | `req board` | `--target-version <version>`、`--json` | 需求看板（按状态分组，**7 组固定顺序** = `REQ_STATUSES`，恒含空组）；v1.2.1-stage-87：条目行 owner 非空时追加后缀（**仅 human**） | 0 / 1 |
| `next` | `req next` | `--owner <owner>`、`--limit <n>`、`--json` | 推荐下一个可接取需求（`scheduled` ∧ 未认领；按预估版本升序）；v1.2.1-stage-87：`--limit <n>`（≥1 整数；**判定基准 = 解析后数值**——显式 `--limit 1` 与缺省同形态；`> 1` 时 human 多行 + `--json` 追加 `candidates`；非法值 exit 1 零写盘） | 0 / 1 |

**读 / 写二分**：读命令 = `list` / `show` / `board` / `next`（支持 `--json`）；写命令 = `add` / `split` / `claim` / `release` / `set` / `link` / `advance`——其中 **`split` 为唯一带 `--json` 的写命令**（v1.2.1-stage-87），其余写命令**无 `--json`**（既有边界，后续增补属纯增量）。

## `--json` 契约

**5 个命令**（`list` / `show` / `split` / `board` / `next`）**成功 / 失败同契约**：

- **成功**：stdout **纯 JSON 单文档**（无 ANSI / 无标题） + `schemaVersion: 1` + 领域对象（`list` → `requirements`；`show` → `requirement` + `stages` + `parent` + `children`；`split` → `parent` + `children`；`board` → `groups`；`next` → `requirement`〔`--limit > 1` 时另加 `candidates`〕）；exit 0。
- **失败**：stdout **纯 JSON 单文档** + `schemaVersion: 1` + `error` 码（+ 上下文 ctx）；exit 1。
- **stderr 零输出**（成功 / 失败均然）。
- **例外**：exit 2（并发写冲突）走全仓统一 `handleConcurrentConflict`（stderr 文案 + `process.exit(2)`），**非 JSON 单文档**——显式登记的有意差异（不为单命令特化统一出口）。

## 退出码与错误码

| 退出码 | 含义 |
|:--:|------|
| `0` | 成功 |
| `1` | 校验 / 占用 / 存在性失败（恒经 `process.exitCode = 1`，**禁 `process.exit(1)`**）；失败路径 `flow.json` **逐字节零写盘** |
| `2` | 并发写冲突（`handleConcurrentConflict` 单点，`EXIT_CONCURRENT`） |

**错误码分流**（`RequirementErrorCode`，命令层 → 文案映射）：

| 错误码 | 触发 |
|--------|------|
| `not_found` | 需求 ID 不存在 |
| `stage_not_found` | 阶段不存在（`link` 专用） |
| `already_claimed` | 已被他人占用（`claim`） |
| `already_linked` | 跨需求重绑（`link`，须先解绑） |
| `invalid_field` | 字段门拒绝（白名单外键 / 非法值 / owner 空串 / title 空串） |
| `invalid_status` | 状态门拒绝（claim 终态 / 非法流转 / `set --status` 非法值 / link 终态需求 / **`split` 父终态**） |
| `invalid-argument` | **命令层参数形态校验**（`split` 缺 `--into` / `next --limit` 非 ≥1 整数）——与引擎业务错误码**分列**；v1.2.1-stage-87 |

**`--owner` 三级链**（`claim` 缺省）：`--owner` 参数 → `.openfeel/.info.json` 的 `user` → `git config user.name` → 哨兵 `'unknown'` 显式拒绝（**禁硬编码用户名**）。

## help 键双规

`applyHelpI18n` 递归遍历命令树替换 help 文本，键规：

- **位置参数**：键 = `arg` + 参数名**逐字**（非 camelCase）。
- **选项**：键 = 长名 **camelCase**。

**42 键双向逐键断言**（`test/cli/help-arguments.test.ts` 族）防死键——新增子命令/选项须同步补键，en 下 `Arguments:` 段 CJK 零命中（v1.2.0-stage-82 = 37 → v1.2.1-stage-87 = **42**）。

## 与 cli/commands.md 的分工

| 维度 | `cli/req.md`（本文件） | `cli/commands.md` |
|------|------------------------|-------------------|
| 粒度 | **命令面深入参考**（逐子命令选项 / `--json` 契约 / 退出码 / help 键双规） | **命令组概览**（`### 需求命令组 req` 节，一行一命令） |
| 定位 | 深入 | 总览 |
| 引擎语义 | **引用** [core/req.md](../core/req.md)，不复制 | 不展开 |

> 三者边界：引擎面语义 → `core/req.md`；命令面深入 → 本文件；命令组概览 → `cli/commands.md`。skill 用法参考见 `openfeel-req`（权威源 `src/core/templates-data/skills/openfeel-req/SKILL.md`）。
