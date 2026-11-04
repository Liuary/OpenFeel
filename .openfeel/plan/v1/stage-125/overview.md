# v1.5.10-stage-125

## 目标

新增 `openfeel dashboard [--json] [--out <file>] [--open]`：进程内聚合「需求看板（7 状态）/ 阶段流水线进度（phase + opsDone/opsTotal）/ 版本发布门与归档历史 / 阻塞 REV 与流程健康指标」四块数据，默认生成**单文件自包含 HTML 看板**（数据内嵌、零外链、零网络请求、**零可执行脚本**、双击 `file://` 即可打开、不启动任何服务），默认输出 `<项目根>/.openfeel/tmp/dashboard.html`；`--json` 输出同一份数据的单文档（`schemaVersion` 首键），并登记为第 **43** 个成功出口（注册 `--json` 选项 43 → **44**）。关联需求 REQ-018。

## 依赖

无

## 操作方案

1. **op-001 数据聚合层**：新建 `src/core/dashboard/aggregate.ts`（`collectDashboardData(projectPath, {data, statusDoc, healthReport, lang})`——命令层注入**唯一**一份 `data`/`healthReport`，core 不建 `FlowManager`、零二次读盘；内部用 `listRequirements`/`listLinkedStages`/`computeRequirementAggregate`/`releaseCheckRequirements`/`listArchiveVersions`/`readArchiveFile`/`listStageBlockingOpenReviews`(`core/flow-manager.ts:228`)/合并 `archiveHealthItems`+`requirementHealthItems`/`MetricsStore.getInstance(resolve(projectPath,'.openfeel'))`）；core 层**禁止 import `src/commands/**` 与 `src/cli/**`**，由 **T24 单测**（禁串零命中）机械守住。单测 T3~T8、T24。
2. **op-002 HTML 渲染层 + 26 个 `dashboard.html.*` 键**：新建 `src/core/dashboard/render.ts`（服务端渲染单文件 HTML；`<meta charset>` 为 `<head>` 首子元素、CSP `default-src 'none'; script-src 'none'`、内嵌惰性 `<script type="application/json">` 数据块且 `</script>` 经 `\u003c` 转义、文本全量 `escapeHtml`、**零可执行脚本故禁 JS 仍可读**、空态/表头节点带 `data-i18n` 属性、剔除 `generatedAt` 后产物确定）；**26 键必须与本 op 同批落地**（缺键时 `t()` 返回 key 本身，`i18n.ts:120/133`，会让 T16 先假绿后转红）。单测 T13~T18。
3. **op-003 命令层 + 注册 + 全部计数/枚举修复**：新建 `src/commands/dashboard.ts` + `cli/index.ts` 注册 + `flow.ts` 导出 `buildStatusJson`；`--json`/`--out`/`--open` 三选项及互斥校验（`--json` 与另两者互斥）；默认路径 `.openfeel/tmp/dashboard.html`（**`.gitignore:7`** 已忽略，零 gitignore 改动）；退出码 0 / 1（NO_INIT、INVALID_ARGUMENT）/ 3（写盘失败，INTERNAL_ERROR；不新增错误码、不用 2）；`--open` 失败仅 warn 恒 exit 0；i18n 追加**12 键**（4 help + 8 命令，产物语言跟随 `getCliLang`）；`json-output.ts` 的 `VALUE_OPTIONS` 加 `--out`。**同 op 内修三处硬断言**：`knowledge.test.ts`（44 / 43）、`req.test.ts:1158`（19 → 20）、`lint-req.test.ts:63-69`（精确数组插入 `'dashboard'`）；执行顺序固定为「注册 → 立刻全量 `npm test` → 逐条修红」，**判据 = 全量绿**（计划 §0.4.1 机械化穷举规则）。单测 T1、T2、T9~T12、T19~T23、T25。
4. **op-004 文档与生成物同步**：`docs/json-contract.md`（9 处：3 / 6-9 / **101** / 103 / 148 / **152-171 §6 第 19 项 *（该文件无 §18）*** / 182 / **183** / 184）、`docs/commands.md`（4 处：28 / **1157** / 1159 / 1177-1207）、`SKILL.md` 命令速查表**只加 1 行**（15/44/54/**58**/60/88 快照与计数行按裁定 R2 不动）、`dsh/ADAPTER.md:16`（42/43 → 43/44），随后 `npm run build` 重新生成 `update.ts` / `template-loader.ts` 的 AUTO-GENERATED 段（`templates-migration` T4.4 逐字节门禁）；**op 结果与提交说明须写明「SKILL.md 计数有意滞后（R2），发布阶段合并升 v1.5.9+v1.5.10」**。
5. **op-005 全量收口**：`npm run build` + `npm test` + `lint i18n` 全绿，跑一遍 §0.4.1 的扫描命令并留档，按 D-125-06 人工 6 步验证产物（Network 零请求、断网可开、禁 JS 可读、空项目空态、CJK 无乱码）。

详细决策（命令签名与默认路径、进程内 vs 子进程取舍与层次约束、`--json` 键集键序与 health 合并口径、HTML 十条硬约束、退出码语义、**25 项测试打点与 op 归属**、机械化穷举规则）见 [plan.md](plan.md) §0.4.1 与 §1。
