# req 命令组（需求流转命令面）

> 模块文档，由归档官在归档时维护。对应源码：`src/commands/req.ts`（命令薄层）。**v1.2.0-stage-85 新建**；**v1.2.1-stage-87 补**：`split` 子命令（10 → 11）、首个带 `--json` 的写命令、`next --limit`、`board` owner 后缀、`show` 父子展示（**需求与版本解绑**：`target_version` 为纯展示/过滤/排序维度，全生命周期非门）；**v1.2.1-stage-90 补**：`add` / `set` 增 `--workflow-mode <mode>`（`full|fast|general`）+ `link` / `set` 经单点**下发**关联阶段（help 键 42 → **44**）。**v1.5.7 补**：done 门重定义（需求完成与阶段关闭解耦）；**v1.5.8 补**：**15 子命令**（+`review` / `verify` / `release-check` / `rollover`）+ 完成必审验 + 多值关联 `requirements[]` + 需求随版本归档与发布门 + `--include-archived`。
>
> 快照声明：本文档为命令面深入参考；命令/参数细节以 `node bin/openfeel.js req --help`（本仓）实时输出为准。

## 定位与分工

- **引擎单点**：校验 / 状态流转 / 认领占用 / 关联唯一性 / done 门**全部单点在** `src/core/req/`（`types.ts` + `requirement-ops.ts` + `body-file.ts` + `aggregate.ts`）——见 [core/req.md](../core/req.md)（**引擎面**，不在本文重复）。
- **本文件**：`src/commands/req.ts` 命令薄层（参数解析 → 调用引擎原语 → 错误码→文案映射 → 退出码）的**命令面深入参考**：子命令 / 选项 / `--json` 契约 / 退出码 / help 键双规。
- **命令层零业务逻辑**：字段白名单 / 值域 / 流转合法性 / 占用 / 关联唯一性 / done 门一律由引擎单点判定。
- **概览入口**见 [cli/commands.md](commands.md)「需求命令组 `req`」节（**概览级**，不重复展开）。

## 子命令（15）

> 以下用法以 `node bin/openfeel.js req <sub> --help` 实测为准。**v1.2.1-stage-87 增 `split`（10 → 11）**；**v1.5.8 增 `review` / `verify` / `release-check` / `rollover`（11 → 15）**。

| 子命令 | 用法 | 关键选项 | 行为要点 | 退出码 |
|--------|------|----------|----------|:--:|
| `add` | `req add <title>` | `--target-version <version>`、`--priority <P0\|P1\|P2>`、**`--workflow-mode <mode>`** | 创建需求（ID 自动分配 `REQ-NNN`；正文骨架铺到 `.openfeel/requirements/`）；**唯一抛错原语**（构造期入参校验）；骨架失败不 `save()`；**v1.2.1-stage-90**：`--workflow-mode`（值域 `full`/`fast`/`general`，非法值构造期抛错 → exit 1） | 0 / 1 |
| `split` | `req split <id> --into <title>` | `--into <title>`（**可重复**，至少一项）、`--json` | **拆分一等动作**（v1.2.1-stage-87）：把需求拆为若干子需求（顺序 ID + `parent_id` + 初值 `scheduled`，**拆分即发布**）；**本仓首个 repeatable option** + **首个带 `--json` 的写命令**；失败零写盘（父不存在/父终态/空标题/无 `--into`） | 0 / 1 / 2 |
| `list` | `req list` | `--status <status>`、`--target-version <version>`、`--owner <owner>`、**`--include-archived`**、`--json` | 列出需求（多条件 AND）；`--status` 值域取 `REQ_STATUSES`，非法 → exit 1；**v1.5.8**：`--include-archived` 合并已随版本归档的需求（只读） | 0 / 1 |
| `show` | `req show <id>` | `--json` | 需求详情；关联阶段为**原始只读 id 枚举**（零 done/进度聚合）；v1.2.1-stage-87：human +2 行（`父需求:` / `子需求:`）、`--json` 追加 `parent`/`children`（**只增不改**；悬空 `parent_id` 原样回显不报错） | 0 / 1 |
| `claim` | `req claim <id>` | `--owner <owner>` | 认领（占用校验；已被他人认领则拒绝）；`--owner` 缺省走三级链；同 owner 幂等 | 0 / 1 / 2 |
| `release` | `req release <id>` | — | 释放认领（未占用为 **no-op 成功** exit 0） | 0 / 1 / 2 |
| `set` | `req set <id>` | `--status` / `--title` / `--target-version` / `--priority` / **`--workflow-mode <mode>`** | 更新需求字段（白名单）；命令层零校验，值域/流转合法性由引擎判定；**v1.2.1-stage-90**：`--workflow-mode` 更新成功后经 `syncConfigFieldToStages` **下发所有已链接阶段**；`general` 且已有链接阶段 → `general_mode_conflict` 拒绝 | 0 / 1 / 2 |
| `link` | `req link` | `--stage <stageId>`、`--requirement <id>`、`--unlink` | 关联需求到阶段 / 解绑（`--requirement` 与 `--unlink` **二选一**）；`already_linked` 硬拒；**v1.2.1-stage-90**：目标需求带模式 → 经 `syncConfigFieldToStages` **下发到该阶段**（status.md 字段 + flow.json 冗余同批）；目标需求为 `general` → `general_mode_conflict` 拒绝；**v1.5.8 多值**：写 `stages[*].requirements[]`（权威面，元素 `{id,role?,order?}`），重复链接幂等 no-op，`--unlink` 单条解绑、带 `--unlink` 缺 `--requirement` 为全清；旧单值 `requirement_id` 仅读兼容 | 0 / 1 / 2 |
| `advance` | `req advance <id>` | `--to <status>` | 显式推进状态（合法目标由引擎流转表判定）；**done 门（v1.5.7 / REQ-023 重定义）**：零关联需求可显式完成，或**全部**关联阶段已进入 `exec_running` 及之后相位（仍在 `plan_*` / `scheme_*` 拒绝）；**v1.5.8 追加**：`review.result=pass` + `verification.result=pass` 硬门（缺项 `invalid_status`，无 force）；**不设 `--force`** | 0 / 1 / 2 |
| `board` | `req board` | `--target-version <version>`、`--json` | 需求看板（按状态分组，**7 组固定顺序** = `REQ_STATUSES`，恒含空组）；v1.2.1-stage-87：条目行 owner 非空时追加后缀（**仅 human**） | 0 / 1 |
| `next` | `req next` | `--owner <owner>`、`--limit <n>`、`--json` | 推荐下一个可接取需求（`scheduled` ∧ 未认领；按预估版本升序）；v1.2.1-stage-87：`--limit <n>`（≥1 整数；**判定基准 = 解析后数值**——显式 `--limit 1` 与缺省同形态；`> 1` 时 human 多行 + `--json` 追加 `candidates`；非法值 exit 1 零写盘） | 0 / 1 |
| `review` | `req review <id>` | `--result <pass\|fail>`、`--by <who>`、`--note <text>`、`--independent` / `--self` | **v1.5.8 完成必审**：写需求审查记录（`review{result,by,note,independent,at}`）；`--self` = 非独立，归档摘要标注 `self-review`；受 preflight 门 | 0 / 1 / 2 |
| `verify` | `req verify <id>` | `--result <pass\|fail>`、`--kind <test\|manual\|build>`、`--by <who>`、`--note <text>`、`--evidence <path>` | **v1.5.8 完成必验**：写验证记录（`verification{result,kind,by,note,evidence?,at}`）；`result=pass` 才满足 done 门；受 preflight 门 | 0 / 1 / 2 |
| `release-check` | `req release-check <version>` | `--json` | **v1.5.8 发布门（软，只读）**：三桶 = `done` / 未完成（非终态）/ 其它（cancelled+rejected）；版本比较去单个前导 `v`；恒 exit 0；`--json` = `{schemaVersion,version,done,unfinished,counts{done,unfinished,other,total}}` | 0 |
| `rollover` | `req rollover` | `--from <version>`、`--to <version>`、`--id <REQ>` \| `--all` | **v1.5.8 顺延**：`target_version = to` + `carried_from` 去重保序追加 + 刷新 `updated_at`（`--id` / `--all` 互斥且必选其一）；来源与目标归一后须不同；受 preflight 门 | 0 / 1 / 2 |

**读 / 写二分**：读命令 = `list` / `show` / `board` / `next` / `release-check`（支持 `--json`）；写命令 = `add` / `split` / `claim` / `release` / `set` / `link` / `advance` / `review` / `verify` / `rollover`——其中 **`split` 为唯一带 `--json` 的写命令**（v1.2.1-stage-87），其余写命令**无 `--json`**（既有边界，后续增补属纯增量；`release-check` 为只读命令，v1.5.8）。

## `--json` 契约

**6 个命令**（`list` / `show` / `split` / `board` / `next` / `release-check`）**成功 / 失败同契约**：

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
| `general_mode_conflict` | **载体制约束门**（v1.2.1-stage-90）：需求为 `general` 却有已链接阶段（`set --workflow-mode general`）/ 链到 `general` 需求（`link`）——**单码两文案** |
| `invalid-argument` | **命令层参数形态校验**（`split` 缺 `--into` / `next --limit` 非 ≥1 整数）——与引擎业务错误码**分列**；v1.2.1-stage-87 |

**`--owner` 三级链**（`claim` 缺省）：`--owner` 参数 → `.openfeel/.info.json` 的 `user` → `git config user.name` → 哨兵 `'unknown'` 显式拒绝（**禁硬编码用户名**）。

## help 键双规

`applyHelpI18n` 递归遍历命令树替换 help 文本，键规：

- **位置参数**：键 = `arg` + 参数名**逐字**（非 camelCase）。
- **选项**：键 = 长名 **camelCase**。

**44 键双向逐键断言**（`test/cli/help-arguments.test.ts` 族）防死键——新增子命令/选项须同步补键，en 下 `Arguments:` 段 CJK 零命中（v1.2.0-stage-82 = 37 → v1.2.1-stage-87 = 42 → **v1.2.1-stage-90 = 44**〔`add`/`set` 各增 `--workflow-mode` 选项键〕；**v1.5.8 新增 4 子命令另增 arg/option 键**：`review` 5 选项、`verify` 5 选项、`release-check` arg+1 选项、`rollover` 4 选项）。

## 完成必审验（v1.5.8 / REQ-027）

- **需求 done 门** = 相位判据（v1.5.7 重定义）+ `review.result === 'pass'` + `verification.result === 'pass'`；缺任一即 `invalid_status`，**无 force / 无逃生口**。
- **命令层按判据分流文案**：未审 → `req.err.reviewRequiredTmpl`；未验（或验证非 pass）→ `req.err.verificationRequiredTmpl`。
- **`req review`**：`--independent` 推荐；`--self` 显式标自我审查（归档摘要记 `self-review`）。**`req verify`**：`--kind test|manual|build`、`--evidence` 记录证据路径。
- **阶段侧**：`stage verify <id> --result pass --kind … --by … --note … [--evidence]` 仅 `archiving` 相位可记录；`archiving → done` 要求该记录 `pass` 且关联需求全部 done（cancelled / rejected 亦视为未完成）。
- **preflight**：`review` / `verify` / `rollover` 均受写命令 preflight 门（ID / 版本形态校验先于门）。

## 需求归档与发布门（v1.5.8 / REQ-030）

- **随版本归档**：`flow archive <version>` 把 `target_version === version` 且终态（done/cancelled/rejected）的需求移入归档文件 `requirements[]` 并从 `flow.json` 删除；活跃 / 无版本 / 非终态需求保留。归档 `counts` 追加可选 `requirements`（老文件读侧视同 0）。
- **发布软门**：归档时该版本仍有未完成需求 → 缺省拒绝且**零写盘**；先 `req rollover` 顺延，或显式 `--allow-unfinished`（人类模式 stderr 警告，JSON 模式 stderr 零输出）。
- **`req release-check`**：只读三桶（done / 未完成 / 其它），恒 exit 0；**`req rollover`**：`--id` 与 `--all` 互斥且必选其一，来源版本须与目标不同。
- **ID 单调性**：`flow.json.meta.last_req_seq` 单调计数器，归档移走条目后不复用 ID；`req list --include-archived` 合并已归档需求（只读）。

## 多值关联（v1.5.8 / REQ-028）

- **权威面**：`stages[*].requirements[]`（元素 `{id, role?, order?}`）——一个阶段可挂多个需求，一个需求也可被多个阶段引用；同一需求重复链接为**幂等 no-op**。
- **写路径不再写**旧单值 `stage.requirement_id`；旧数据读取兼容（`requirements` 缺省时回退单值）。
- **聚合与归档**由该数组单点派生（`listLinkedStages` / done 判定 / 归档需求汇总）。

## 与 cli/commands.md 的分工

| 维度 | `cli/req.md`（本文件） | `cli/commands.md` |
|------|------------------------|-------------------|
| 粒度 | **命令面深入参考**（逐子命令选项 / `--json` 契约 / 退出码 / help 键双规） | **命令组概览**（`### 需求命令组 req` 节，一行一命令） |
| 定位 | 深入 | 总览 |
| 引擎语义 | **引用** [core/req.md](../core/req.md)，不复制 | 不展开 |

> 三者边界：引擎面语义 → `core/req.md`；命令面深入 → 本文件；命令组概览 → `cli/commands.md`。skill 用法参考见 `openfeel-req`（权威源 `src/core/templates-data/skills/openfeel-req/SKILL.md`）。
