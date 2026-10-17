# op-002 自测报告（v1.2.2-stage-97 T2：knowledge/config/view/plan 读命令 --json）

- **执行 Agent**：openfeel-executor
- **日期**：2026-10-17
- **结论**：自测通过（8 命令面 JSON 契约落地；人类输出 before/after 逐字 diff 为空）

## 执行摘要

按 `ops/op-002.md` 为目标 8 个只读命令面新增 `--json` 成功出口：`knowledge search|list|index|dedup`、`config get|effective`、`view list`、`plan scheme list`。人类输出逐字不变；业务拒绝接入 `failRefusal`，`view list` 内部异常 JSON 走 `failInternal`（exit 3）。i18n 新增 8 个 help 键（974 → 982）；注册 `--json` 选项 25 → 33；成功出口 24 → 32。

## 前置校验结果

| 项 | 结果 |
|----|------|
| 校验方式 | `openfeel flow health --quick`（退出 0，0 errors / 0 warnings） |
| 方案完整性 | 通过（目标 / 实施步骤 / 产出文件 / 自测清单 / 阶段 / 最多重试 齐备） |
| Phase 合法性 | 通过（`v1.2.2-stage-97.phase=exec_running`；current=`v1.2.2-stage-97.op-002` 匹配） |
| 流转合法性 | 通过（health 关键项全绿） |

## 实施步骤完成情况

- [x] 0 公共 import：`withSchemaVersion/emitJson`（4 文件）；`failRefusal`（knowledge/config）；`failInternal`（view）；`detectFillState`（plan）
- [x] 0.1 基线快照：隔离夹具捕获 26 条人类路径 before/after，`diff` 为空（见下）
- [x] 1 `knowledge search --json`：`query,limit,offset,results`；元素 `title,category,date,enabled,content,summary`；抽 `summarizeContent` 同源
- [x] 2 `knowledge list --json`：`entries,count`；元素不含 content
- [x] 3 `knowledge index --json`：`getKnowledgeIndex` 直出 `categories,recentUpdates`
- [x] 4 `knowledge dedup --json`：先构造统一 `matches` 再分轨；`threshold,categories,found,readOnly,matches`；三类拒绝 INVALID_ARGUMENT；本地 `--project` 声明保留
- [x] 5 `config get --json`：项目 `scope,key,value`；全局无 key `scope,values`（6 键固定序、缺省 null）；全局有 key `scope,key,value`；parseError 仍写 stderr
- [x] 6 `config effective --json`：无 key `effective`；有 key `key,value,source`；未知 key INVALID_ARGUMENT
- [x] 7 `view list --json`：`count,reviews`；`blocking !== false`、`canAutoFix === true`、`autoFixDetail ?? null`；内部异常 INTERNAL_ERROR/3
- [x] 8 `plan scheme list --json`：`stage,count,schemes`；`draft` 复用既有 `draftIds`；`fill` 复用 `detectFillState`
- [x] 9 i18n 8 键 zh/en 成对同序，`lint i18n` 982
- [x] 10 四测试文件新增 JSON 契约/空态/错误/人类基线用例

## 自测清单验证

| 项 | 结果 |
|----|------|
| 8 命令单文档 / schemaVersion 首键=1 / stdout 无人类文本 | 通过（测试断言 + CLI 实跑） |
| 字段键序与空态（[] / null / {}） | 通过（逐键 `Object.keys` 断言） |
| 退出码：成功 0；拒绝 1（JSON envelope）；view 异常 JSON 3 / 人类 1 | 通过 |
| 人类输出 before/after 逐字 diff 空 | 通过（`human.diff` 0 行，26 场景含空态与错误分支） |
| flow.json / kb / profile 零变更 | 通过（命令只读；dedup 测试含 kbHash 断言） |
| 既有 19 出口契约测试 | 通过（`test/cli/json-contract.test.ts` 27 passed） |
| 四命令测试 | 通过（133 passed） |
| `npx tsc --noEmit` | 0 errors |
| `node bin/openfeel.js lint i18n` | 982（+8） |
| 未改 docs/json-contract.md / test/cli/json-contract.test.ts / flow.json / .openfeel/plan/** | 通过（`git diff` 无输出） |

## 门禁实测值

- 定向测试：`4 files / 133 tests passed`
- 契约测试：`1 file / 27 tests passed`
- 全量：`74 files / 1864 tests passed / 0 failed`（50.73s）
- `npx tsc --noEmit`：0
- `lint i18n`：982
- `npm run build` ×2：均 exit 0；dist 全量 sha256 一致（`4b08d82d…bf40d`）→ 幂等
- 注册 `--json` 选项：33（源码 grep 计数 + 命令树遍历断言）
- 成功出口：32（33 − `flow advance` 错误模式开关）

## 8 命令 JSON 实跑证据（隔离夹具）

- `knowledge search`：`schemaVersion,query,limit,offset,results`，content 全文 + summary
- `knowledge list`：`schemaVersion,entries,count`，元素 4 键（无 content）
- `knowledge index`：`schemaVersion,categories,recentUpdates`
- `knowledge dedup`：`schemaVersion,threshold,categories,found,readOnly,matches`，matches 6 键
- `config get`：项目 `scope,key,value`；全局 6 键 values
- `config effective`：`effective` / `key,value,source`
- `view list`：`count,reviews`，`blocking` 布尔（true/false 均实测）
- `plan scheme list`：`stage,count,schemes`，`draft`/`fill`(empty/partial/filled) 实测
- 失败 envelope 实跑：`config get` 无 key、dedup 非法阈值、effective 未知 key → INVALID_ARGUMENT + exit 1

## 人类输出 before/after 证据

- 基线构建：`git show HEAD:src/commands/{knowledge,config,view,plan}.ts` → `baseline-dist`
- 夹具：`.openfeel/tmp/stage-97/op-002/fixture`（固定日期 kb、config.yaml、flow.json、plan ops、隔离 HOME）
- 运行：`run-human.mjs current|baseline` → `after-human.txt` / `before-human.txt`
- `diff -u before-human.txt after-human.txt` → **0 行**（26 场景：有值/空态/过滤/三类错误）

## 产出文件

声明 11 项全部存在且为本次修改：

- `src/commands/knowledge.ts`、`src/commands/config.ts`、`src/commands/view.ts`、`src/commands/plan.ts`
- `src/core/i18n-data/zh-CN.ts`、`src/core/i18n-data/en.ts`
- `test/commands/knowledge.test.ts`、`test/commands/config.test.ts`、`test/commands/view.test.ts`、`test/commands/plan.test.ts`
- `.openfeel/tmp/stage-97/op-002/`（基线夹具、harness、before/after/diff）

## 方案一致性回写

| 类别 | 结果 |
|------|------|
| 遗漏 | 无 |
| 超范围 | 无（`op-002.md` 为只读，未改动；临时基线文件限定在声明的 tmp 目录） |
| 一致 | 11/11 |

## 偏差记录

1. **D1（实现细节修正）**：op-002 步骤 4 片段写 `enabled: r.entry.enabled`，但 `src/utils/kb-dedup.ts` 的 `KbEntry` 仅有 `status: '+' | '-'`。按等价语义实现 `enabled: r.entry.status === '+'`，未改 `kb-dedup.ts`（只读）。
2. **D2（测试放置）**：计数断言（33/32）放在 `test/commands/knowledge.test.ts`（遍历完整命令树），未触碰 op-004 所属的 `test/cli/json-contract.test.ts`；op-004 仍按计划扩展至 33 出口冻结。
3. **D3（基线手段）**：除内联快照外，额外用 HEAD 源码构建 baseline-dist 做 26 场景运行时 diff（更强证据），基线产物仅在声明 tmp 目录。

无跳步违规。

## 交接 op-003 事项

- 计数当前为 33 注册 / 32 成功出口；op-003 新增 `archive <stage> --json` 后应为 34/33。
- `config get --global` 缺省值：人类空串 / JSON `null` 的差异需在 op-004 契约 §13.6 标注。
- `plan scheme list` 的 `draft` 按 opId 全局匹配（既有口径），跨阶段同名 opId 风险交 op-004 契约说明。
- `view list` 异常退出码 JSON=3 / 人类=1 需在契约登记。
