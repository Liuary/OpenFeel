# 需求正文（`.openfeel/requirements/REQ-NNN.md`）的生成、写实性与门禁落点

> 研究日期：2026-11-24 ｜ 阶段：`v1.6.0-stage-132` ｜ 对应需求：REQ-055
> 范围：`src/core/req/**`、`src/commands/req.ts`、`src/commands/lint.ts`、`src/core/lint-req.ts`、`dsh/lib/guard.js`（只读）。
> 路径均相对仓库根。本文是长期引用文档：结论可独立阅读，证据行号可直接跳读。

## 背景与问题

需求正文是人读副本，机读权威恒为 `flow.json` 的 `requirements` 条目。问题是这份"人读副本"长期没有信息量：

1. **只有一个写入口，且是"铺骨架"**：正文在 `req add` / `req split` 时被机械生成，此后没有任何命令能改它。
2. **"存在即 no-op"**：骨架写入函数发现目标文件已存在就直接返回，于是"内容为空 / 内容错"的正文**永远不会被修正**。
3. **引擎不认正文**：状态更新的字段白名单里没有正文相关字段，所以补正文不能靠 `req set`。
4. **没有任何"写实性"判定**：状态机眼里，"两节仍是占位文字"与"写足了验收判据"完全等价 —— 需求可以一路 claim、推进、完成、归档。
5. **触发症状**：Agent 想补写正文时无路可走——CLI 没有写命令，而 `.openfeel/requirements/*.md` 被 guard 列为受保护路径，`write` 工具直写会被拒。于是"正文是空壳"这件事既不能修，也不能被查出来。

## 结论

1. 正文当前有且仅有一个写入点：`writeRequirementBodySkeleton`（`req add` / `req split` 调用）。**零更新入口**，这是 48/54 空壳的结构性根因。
2. 骨架是"合法但不写实"的：两处占位内容位置固定，判定必须**按小节取文本 + 整行锚定**，禁止子串匹配（同行内引用会误报，已有事故记载）。
3. 补正文只能走"新增原语 + 新增命令"两条腿，不能走 `req set`（字段白名单挡死）；同时 guard 使得 agent 无法自己直写文件，所以必须开一条 CLI/适配器通道。
4. 门禁最自然的挂载点是**状态流转前置检查**（`applyStatusChange` + `claimRequirement` 内嵌），**不要**塞进 done 门——done 门牵连阶段归档，会把存量债一次性变成不可归档。
5. 存量空壳不能一次性变红：lint 侧只做 advisory 清单（只 A 类驱动退出码），否则 48 份存量会让 `lint req` 恒红。
6. guard 的定位要说清：它是"别让 agent 自己写状态"的护栏，**不是**"正文写实"的保障；正文写实只能靠判据 + 门。

## 证据

- `src/core/req/body-file.ts:79-87` — 铺骨架全流程：幂等 `mkdirSync` → 单点赋值 `body_path` → 已存在则 no-op → 否则 `atomicWriteFileSync`。
- `src/core/req/body-file.ts:84` — `if (existsSync(filePath)) { return filePath; }`：**"存在即不覆盖"**，内容错/空的正文永不被修正（缺陷的结构性根因）。
- `src/core/req/body-file.ts:47` 与 `:51` — `## 摘要`、`## 目标与验收` 两节的占位内容；`:41-65` 共七个固定小节。
- `src/core/req/body-file.ts:83` — `req.body_path = getRequirementBodyRelPath(req.id)`：全仓唯一 `body_path` 写入点（no-op 路径也赋值）。
- `src/commands/req.ts:238` — `req add` 里唯一的铺骨架调用；失败即 return，不留孤儿正文。
- `src/commands/req.ts:1117` — `req split` 逐子需求铺骨架；任一失败不 save（`:1123-1125`）。
- `src/core/req/requirement-ops.ts:545` — `PATCH_WHITELIST = ['status','title','target_version','priority','workflow_mode']`：正文相关字段不在其中，传入即 `invalid_field`。
- `src/core/req/requirement-ops.ts:196-211` — `requirementDoneBlocker`（判据类型联合在 `:184`）：门禁挂载的现成范式在这里已经定型。
- `src/core/flow-manager.ts:5231` — 占位标记常量单一来源（B3/B4/health 共用）。
- `src/core/flow-manager.ts:5239` — **整行锚定**正则；注释 `:5236-5238` 记录了"正文行内引用该字面导致误报"的事故（cli/BUG-005）。
- `src/commands/lint.ts:141-144` — 只有 A 类 issue 驱动 `process.exitCode = 1`；新增 advisory 键不会让 lint 恒红。
- `src/core/lint-req.ts:115` — `REQ_DIR_REL = '.openfeel/requirements'` 路径单点；新检查器直接复用，不派生第二套路径。
- `dsh/lib/guard.js:691` — `{ match: 'md', segments: ['requirements'] }`：`.openfeel/requirements/*.md` 对 agent 工具受保护（单层 `.md` 语义）。
- `dsh/lib/guard.js:664-667` — guard 只拦 agent 的工具调用；CLI/适配器的 `fs` 直写不经过 guard ⇒ 新 CLI 写命令不会被拦。
- `dsh/lib/guard.js:749-752` — 拒绝文案点名 `feel_req action=add|set|claim`；新增 action 后这句必须同批改，否则引导是错的。

## 改造动作

- **T2**（`req body` 原语与命令）：新增"读 → 定位小节 → 替换 → 原子写"的写入原语，`writeRequirementBodySkeleton` 的 no-op 语义**保持不动**；新命令带 `--json`（规划为出口 #46）。判据 **A1**。
- **T3**（空壳检测 + `lint req` 扩展）：新建正文检查器，输出 `fill.emptyBody / emptyPlan / missingBodyFile`，不驱动退出码。判据 **A3**。
- **T4**（正文门）：`targetStatus ∈ {scheduled, in_progress, done}` 前置检查 + `--force` 留痕（`body_waiver` + 审计）；`claimRequirement` 内嵌同一谓词（幂等重认领不拦）。判据 **A2 / A2b / A2c**。
- **T1**（判据单点 `src/core/plan/filled.ts`）：占位字面量、整段语义正则与逐行语义正则分开、`MIN_FILLED_CHARS=40`；禁止在别处新增占位常量。
- **T12**（本阶段自身写实）：stage-132 的 6 个需求先用新通道补齐正文，作为 A1 的首个验收样本。
- **T9**（DSH 通道）：`feel_req action=body` 走 CLI write，让 agent 有合法入口；同批改 guard 拒绝文案。

## 未验证项

- **存量空壳的确切计数**：调研记 48/54，本次按边界禁读 `.openfeel/requirements/**`，未逐份复点。
- **`body_path` 与真实文件不一致的条数**：文件被手工删除/改名时无人对账（`requirementHealthItems` 只查悬空关联与 done 漂移），存量未知。
- **"所有空壳都来自骨架"这一因果**：只验证了骨架是唯一程序写点，未排除外部脚本/人工整份改写。
- **`req body` 只改一节**（A1 要求其余六节逐字不变）：需 T2 落地后用 `git diff` 实测。
- **`claimRequirement` 内嵌判据的插入点**（同 owner 幂等之后、`req.owner = name` 之前）：为设计结论，未在代码上验证。

## 复现/验证方法

- 唯一写点：`git grep -n "body_path" -- src/ dsh/` —— 赋值应只在 `src/core/req/body-file.ts:83`。
- 无更新入口：`git grep -n "PATCH_WHITELIST" -- src/`；`node bin/openfeel.js req --help`（当前无 `body` 子命令）。
- guard 边界：`git grep -n "requirements" -- dsh/lib/guard.js`（命中名单 `:691` 与文案 `:749-752`）。
- 占位判定的行锚定教训：读 `src/core/flow-manager.ts:5231-5260`，确认判据是"独占一行"而非子串。
- T2 落地后：`node bin/openfeel.js req body REQ-055 --section 摘要 --text "<≥40 字>"` → exit 0，且 `git diff` 只含该小节。
- T3 落地后：`node bin/openfeel.js lint req --json` → `fill.emptyBody` 列出空壳清单，退出码仍为 0。
- T4 落地后：对空壳需求 `node bin/openfeel.js req claim REQ-NNN --owner t` → exit 1、`error.code='REQ_BODY_GATE'`、flow.json revision 不变；加 `--force` → exit 0 且审计多一条 `requirement_body_forced`。
