# kb 模块 Bug 归档

> 来源阶段：`v1.1.2-stage-42`（`lint kb` 过期引用未清理的修复验收）
> 登记人：openfeel-feel-tester ｜ 登记时间：2026-09-26 ｜ 私域详细报告：`.openfeel/users/Liuary/bugs/kb/BUG-001_lint-kb过期引用未清理.md`
> 本文件为 **kb 模块首次建立**的公共 Bug 归档（`v1.1.2-stage-56` 补齐，使公域计数与私域/实测文件数一致 = 17）。

---

## BUG-001：`lint kb` 报告 3 个过期引用，未达成「lint kb 零错误」

- **优先级**：medium ｜ **阻塞**：否 ｜ **状态**：**closed**（`v1.1.2-stage-42` 修复并验收通过）

### 核心结论

`node bin/openfeel.js lint kb` 报 **3 个过期引用**，未达成完成标准「`lint kb` 零错误」：

- `.openfeel/kb/architecture.md` L452：`.opencode/agents|skills|instructions`（`|` 列举被 `resolveRef` 当作单一路径 → 误报）
- `.openfeel/kb/patterns.md` L579：`.opencode/instructions/core.md`（已删除文件的残留引用）
- `.openfeel/kb/patterns.md` L879：`.opencode/instructions/core.md`（同上）

### 根因

- 删除 `.opencode/instructions/core.md`（源模板 + 部署产物）后，`.openfeel/kb/patterns.md` / `architecture.md` 中引用 `core.md` / `instructions` 的条目未同步更新。
- `resolveRef` 未排除 `|` 分隔符，将列举串视为单一路径（解析边界 + 历史语境）。

### 修复要点

- 更新/删除 `patterns.md` L579 / L879 指向 `core.md` 的过期引用（改指全局 `~/.config/opencode/AGENTS.md` 对应节，或删除该表项）。
- `architecture.md` L452：将 `|` 列举写法拆分为可解析的独立路径，或改用行内描述避免 `resolveRef` 误报。

### 关闭记录（v1.1.2-stage-42）

复验 `node bin/openfeel.js lint kb` **零过期引用**（exit 0）；`npm run build` 成功（模板一致性 + 单源一致）；`npm test` 全绿；根 `opencode.jsonc` 已清理（无 `core.md` 死引用 / 无旧 skills 映射）。**closed**。
