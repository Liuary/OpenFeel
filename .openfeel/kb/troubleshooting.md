# 常见问题

> 使用 [+] / [-] 标记管理启用/禁用状态。只能标记禁用不能删除。

## [+] fuzzyCorrectPhase 正则尾部下划线问题 (2026-06-27)

**现象：** 输入 `"plan_pending "`（末尾有空格）时，`replace(/[\s_-]+/g, '_')` 生成 `"plan_pending_"`（尾部下划线），导致枚举匹配失败。

**根因：** 正则替换将末尾空格转为下划线，但 Trim 在替换之后执行，尾部下划线残留。

**修复：** 在正则替换后增加 `.replace(/^_+|_+$/g, '')` 去除首尾下划线。

**见于：** REV-001, Bug #3

## [+] 僵尸检测 filter 失效 (2026-06-27)

**现象：** `checkZombieStates` 中 Bug 检测过滤 `bugFiles.filter(f => f.startsWith(stageId))` 几乎必然返回空数组，僵尸 Bug 检测从不触发。

**根因：** Bug 文件按**模块目录**组织（`{module}/BUG-001_xxx.md`），文件名不以 `stageId` 开头。过滤条件与目录结构不匹配。

**修复：** 代码块替换为注释，说明延迟到 flow.json 增加 bugs 数据结构后完善。

**见于：** REV-003, Bug #18

## [+] repair dry-run 误报"已修复" (2026-06-27)

**现象：**
1. 文件不存在时 dry-run 返回 `fixed: true`（实际未修复）
2. flow.json 正常时返回 `fixed: false` 却被 `exit(1)` 当错误处理

**根因：** 双重缺陷——dry-run 返回值逻辑与命令层对 false 的处理同时出错。

**修复：** 文件不存在时 dry-run 返回 `fixed: false`；命令层对 `fixed: false` 不 `exit(1)`，而是输出"未检测到需要修复的问题"。

**见于：** REV-004, Bug #???

## [+] Schemer 产出路径指向不存在的目录 (2026-06-27)

**现象：** `schemer.md` 产的出路径为 `.openfeel/stages/{stage}/ops/`，但实际计划体系使用 `.openfeel/plan/{stage}/`。

**根因：** 新建 Agent 文件时硬编码了不存在的路径，未与现有 plan 体系对齐。

**修复：** 统一为 `.openfeel/plan/{stage}/ops/op-NNN_{title}.md`

**见于：** REV-008

## [+] architect 审查模板未同步更新 (2026-06-27)

**现象：** `reviewer.md` 新增了 `Tester 标记：→Tester 重点关注` 字段，但 `architect.md` 的审查模板未同步更新。

**影响：** Architect 执行审查时无法通过此字段传递功能边界风险给 Tester，Reviewer↔Tester 闭环在 Architect 审查场景下断裂。

**修复：** `architect.md` 审查模板同步增加 Tester 标记字段。

**见于：** REV-013
