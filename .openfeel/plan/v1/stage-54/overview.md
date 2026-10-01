# v1.1.2-stage-54

> 收尾：遗留缺陷清理（发布前清账）

## 目标

清掉**已登记的遗留缺陷**，为 stage-55（清掉项目级约束与 Agent）与 `npm publish` 做准备。方法：逐条读取原始登记记录，再在**当前代码/数据**上实测验证（重复项仅标记+验证）。

## 依赖

- `hard: v1.1.2-stage-53`（**建议 Feel 落点**：`flow stage set v1.1.2-stage-54 --deps v1.1.2-stage-53`；当前 `deps` 为空）
- **后继**：`v1.1.2-stage-55` 依赖本阶段

## 实测验证结论（E 编号）

| E | 主题 | 优先级 | 结论 |
|---|------|:--:|:--:|
| E1 | `cli/BUG-005` 空模板检测纯子串误报 | medium | **仍存在** |
| E2 | `cli/BUG-006` en 模式 blocking REV 拒绝文案硬编码中文 | low | **仍存在** |
| E3 | `cli/BUG-003` `flow phases --json` help 文案缺 `transitionsDiff` | low | **部分存在（复发）** |
| E4 | `templates/BUG-003` 部署型 skill `node bin` 口径 | low | **已解决** |
| E5 | `templates/BUG-004` `current.md` 统计陈旧 | low | **已解决**（另发现 `bugs/index.md` 统计陈旧） |
| E6 | 全仓 `REV-*` pending 扫描 | — | **分层统计**：总 267 / pending 132 / closed 112 / resolved 23；**清账层（v1.1.2 内）42** / 历史层 88 |
| E7 | stage-52 observations 三项 | — | (a) 复发→E3；(b)(c) **已解决** |
| E8 | 已知登记**不修**项 8 条 | — | 登记确认（不修） |
| E9 | `kb-dedup` 及其它解析路径 CRLF 复核 | — | **已解决**（4 处路径安全） |
| E10 | 「状态写盘合并」`setStatusField` 下沉合并 | — | 已登记不修（并入 E8#5） |
| E11 | stage-49 op-001~009 状态陈旧 | — | **仍存在**（工作区数据，非代码） |
| E12 | 门禁基线：`lint i18n` 724 → **726** | — | 由 E2 新增 2 键触发 |

**汇总**：仍存在 **2** ｜ 部分存在 **1** ｜ 已解决 **5** ｜ 登记类 **4** ｜ 门禁类 **1** → **需修 3 条（E1/E2/E3）**。

## 关键实测证据

- **E1**：`flow health` → `⚠️ 空模板: 1 个操作方案模板未填充：v1.1.2-stage-52.op-005`；`flow ops list` → `op-005 [done] (empty)` + warning（误报）；根因 `flow-manager.ts:3751/3754-3756`（`content.includes`）+ `scheme.ts:455`（重复子串判断）；整行正则对 op-005 实测 = **false**（修复有效），对模板独占行 = **true**。
- **E2**：`flow.ts:742-743` 实测 CJK 命中；同行 `:740` 已是 i18n。
- **E3**：实际 JSON **5 键**（含 `transitionsDiff`）vs i18n help 文案 **4 键**（`zh-CN.ts:595` / `en.ts:565`）；docs/manual/kb 均已含该键 → 仅 i18n 未同步。
- **E6（REV-001 修正）**：总数 **267**（closed 112 / pending 132 / resolved 23）；**清账层 = v1.1.2 内 pending 42**（stage-48×1、49-U2×12、**49-U3×9**、**49-U4×4**、**49-U8×12**、52×4）；**历史层 88** 仅登记。原「196/80/17」偏差根因 = 正则 `^## (REV-\d+):` **漏计混合编号**（`REV-U2-001`/`REV-U3-009（注记）` 等）→ 已固化可复现脚本 + 分层口径；**执行时须重跑取实时值**。**事实更正**：stage-52 REV-005~008 状态行实测仍 `pending`（修复已落地、状态未收口）。
- **E9**：`kb-dedup.ts:55` 已归一化；`knowledge.ts:286`（`gm`）CRLF 实测命中 2/2；`lint.ts:130` 在本仓 CRLF 语料上 `lint kb` 0 过期通过。

## op 划分（3 op）

| op | 主题 | 覆盖 |
|----|------|------|
| op-001 | 空模板检测收紧 | E1 |
| op-002 | en 泄漏收敛与文案一致（含 +2 i18n 键 → 726） | E2 / E3 / E12 |
| op-003 | 登记收口 + 工作区数据一致性 + 全量门禁 | E4~E11 |

**顺序**：`op-001 → op-002 → op-003`（同仓串行）

## 门禁

`npm run build`（幂等）→ `npm test`（基线 **59 文件 / 979 用例**，全绿）→ `npx tsc --noEmit`（0）→ `node bin/openfeel.js lint i18n`（**726 键**，R1 后失败非 0 退出）→ `node bin/openfeel.js lint kb`（0 过期 / 265 引用）→ `flow health`（**空模板告警归零**）

## 测试翻转清单

- **强制翻转 0 项**（既有 fixture 均为「独占行」形态：`flow.test.ts:1209,1210`、`flow-manager.test.ts:2049,2058`、`plan.test.ts:427-458`）
- **建议新增断言 6 组**：行内引用 → `filled` / 独占行 → `empty`（含 CRLF）｜`publishScheme` 双向｜`healthCheck` 无空模板 warn｜en 拒绝路径 CJK 零命中｜help 文案含 `transitionsDiff`｜`bugs/index.md` 统计一致
- **隔离硬要求**：`vi.mock('node:os')` + `mkdtempSync`（范式 `test/commands/flow.test.ts:9-20,42-45`）；严禁触碰真实 `~/.openfeel/`、`~/.config/opencode/`、`~/.config/openfeel/`、仓库 `.openfeel/config.yaml`

## 风险

R-1 E1 收紧致漏检 ｜ R-2 修复后 health 仍有其它误报（须复跑归零）｜ R-3 误改 JSON 契约 ｜ R-4 门禁数字未同步 ｜ R-5 误关闭 pending REV ｜ R-6 `bugs/index.md` 非最小 diff ｜ R-7 越界改 `flow.json` ｜ R-8 测试污染真实环境

## 裁定

| # | 议题 | 状态 |
|---|------|------|
| A1 | E1 用「整行锚定」（代码围栏内独占行记为已知边界） | planner 建议 + 待确认 |
| A2 | E3 改 i18n help 文案（不动 JSON） | planner 建议 + 待确认 |
| A3 | E2 键名 `flow.advance.blockingRevRefused` / `blockingRevHint` | planner 建议 + 待确认 |
| A4 | 其它 `console.log` 中文本阶段不改 | planner 建议 + 待确认 |
| A5 | 历史 63 条 pending REV 仅登记不清理 | planner 建议 + 待确认 |
| A6 | E11 stage-49 op 状态陈旧是否修正（不改 `flow.json`） | **待 Feel/用户裁定** |
| A7 | E5 索引统计修正范围（最小 diff） | planner 建议 + 待确认 |
| A8 | 本阶段**不含** `npm publish`（顺序：收尾 → stage-55 → 发布） | **已由用户指令确定** |
