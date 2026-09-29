# v1.1.2-stage-48 归档 — 事件加固 + 遗留问题修复

- **归档 Agent**：openfeel-archiver（deepseek-flash）
- **归档时间**：2026-09-29（本地）
- **阶段**：`v1.1.2-stage-48`（事件加固 + 遗留问题修复）｜进入时 phase = `archiving`｜出口 phase = `done`（由 Feel 执行 CLI）
- **实现 commit**：`afe93dd`(op-002) / `01c612b`(op-003) / `0a891fa`(op-001) / `f8e5b7d`(op-005) / `bbcd242`(op-004) / `1db49c6`(op-006) / `b3b9b58`(op-007)
- **需求**：针对三大过程事件（A 审查官工具幻觉 / B `npm test` 静默覆写真实环境 / C 裸跑命中全局旧版）做**机制加固**，并清理 **13 项已盘点遗留**，为 stage-49 整仓全量审查提供稳定基线；**继续 v1.1.2，不改版本号**
- **前置**：`v1.1.2-stage-43`（已 done；本阶段修改其创建的 skill 权威源与已收口版本号）；**下游**：`v1.1.2-stage-49`（整仓全量审查，已开始 scheme 阶段）

---

## 一、归档产物清单

| # | 产物 | 类型 | 说明 |
|---|------|------|------|
| 1 | `.openfeel/log/archive-v1.1.2-stage-48.md` | 新建 | 本归档摘要（**手工生成**，未运行 `openfeel archive`，理由见第六节偏差 1） |
| 2 | `.openfeel/code_review/v1.1.2-stage-48.md` | 新建 | 公共审查摘要（审查范围 7 op / 独立复现 7 项 / 三段结论要点 / REV-001~009 / Bug closed + 新登记 / 心得建议 6 条 / 关联产物） |
| 3 | `.openfeel/code_review/index.md` | 更新 | `passed 17 → 18`；v1.1.2 系列总结行刷新（9 阶段 / 50 REV）；新增 stage-48 行（**保持全 CRLF**：65/65） |
| 4 | `.openfeel/bugs/cli.md` | 更新 | `cli/BUG-003` 状态 `open → closed`；验收记录补测试官 2026-09-29 行；新增「关闭记录（stage-48，commit `bbcd242`）」+ **防再犯**三要点；如实记录流程偏差（未翻转 `fixing`/`resolved`） |
| 5 | `.openfeel/bugs/templates.md` | 更新 | **新增 `templates/BUG-003`**（low，open，非阻塞）：部署型 skill 模板改 `node bin/openfeel.js` 在用户项目不可执行；含核心结论 / 复现 / 影响范围 / 建议修复方向 / 合并处置建议（与 REV-009 并入 stage-49）/ 验收记录 |
| 6 | `.openfeel/bugs/index.md` | 更新 | 统计 `open 1 / closed 8 / 合计 9` → `open 1 / closed 9 / 合计 10`；cli 表 BUG-003 行 → closed；templates 表新增 BUG-003 行；新增「stage-48 事件加固收口」说明段 |
| 7 | `.openfeel/kb/patterns.md` | 更新（+2 条 / 1 批注） | 新增「测试隔离的『干净机器』验证法」「环境哈希守卫（CI 层）」；`#REV 可信度声明与独立复核` 条目追加「更新于 2026-09-29」批注（上溯为前置规则） |
| 8 | `.openfeel/kb/troubleshooting.md` | 更新（+1 条） | 新增「真实环境一次性数据清理规范：末段匹配 + 计数断言 + 四步保护」 |
| 9 | `.openfeel/kb/index.md` | 更新 | 项目快速概览「最近更新」刷新为 stage-48；分类概览（patterns 96 → **100**、troubleshooting 33 → **34**，用途串追加）；各分类摘要新增 5 行（patterns 4 + troubleshooting 1）；最近更新表首行插入 stage-48 |
| 10 | `.openfeel/manual/index.md` | 更新 | 维护规则 4 行：config 行补「profile 读写语义」；global-paths 行补「死映射清理指引与四步保护」；feel 行补「审查会话健康探测与可疑产出处置」；**新增一行**「代码审查可信度 / REV 独立复核 → `core/code-review.md`」 |
| 11 | `.openfeel/manual/core/config.md` | 更新（2 处） | `readProfile` 行补 `parseError` + 不覆盖语义；新增「子 Schema 未知键保全」段（`.passthrough()` × 3） |
| 12 | `.openfeel/manual/core/global-paths.md` | 更新（1 节 + 历史） | 「死映射安全清理」节改「**已清理完毕**（455→0 + 备份路径）」；清理步骤升级为**四步保护**（末段匹配陷阱 + 删除数断言 + 备份 + 可还原复核）；变更历史补 stage-48 行 |
| 13 | `.openfeel/manual/agents/feel.md` | 更新（+1 节） | 新增「审查会话健康探测与可疑产出处置（v1.1.2-stage-48 事件 A）」：健康探测 / 可疑产出降级 / 审查纪律四条 |
| 14 | `.openfeel/log/2026/09/29/2026-09-29-Liuary-062.md` | 新建 | 公域日志（title + 详情 + 偏差登记）——编号 **062**（取号前扫描当日 001~061） |
| 15 | `.openfeel/log/2026/09/29/day_index.md` | 更新 | 追加 `-062` 行（字面 append，LF 保持） |
| 16 | `.openfeel/log/index.md` | 更新 | 2026-09 节追加 stage-48 归档行（**U+FFFD 计数保持 66**） |
| 17 | `.openfeel/log/log.md` | 更新 | 主表首行插入 `-062` 行（**U+FFFD 计数保持 2**；文末重复空表头未整理，历史遗留） |
| 18 | `.openfeel/plan/index.md` | 更新 | v1.1.2 系列导航行改为「含 stage-48 加固 + stage-49 整仓审查待推进」；阶段对照表新增 stage-48 行 |
| 19 | `.openfeel/plan/plan_log.md` | 更新 | 表首插入 stage-48 归档条目（完整变更描述 + 验证 + REV/Bug/知识沉淀） |
| 20 | `.openfeel/plan/v1/stage-48/status.md` | 更新 | `planned → done`；责任 Agent → `openfeel-archiver` / 上一责任 `openfeel-feel-tester`；当前任务与状态记录补 `review_passed` / `test_passed` / `archiving → done` |
| 21 | `.openfeel/users/Liuary/dev_last.md` | 覆盖 | 会话状态覆盖写入（含决策历史与经验暂存新增项） |
| 22 | `.openfeel/users/Liuary/log/archive-v1.1.2-stage-48-report-2026-09-29.md` | 新建 | 本报告（完整版） |

> **未产出**：`flow.json`（**不直写**，见第五节需 Feel 执行的命令）。

---

## 二、知识提取（重点）

### 去重实测（`kb-dedup` 真实模块 + LF 归一化副本）

`parseKbFile` 的标题正则 `$` 锚点在 CRLF 下失配（既有缺陷，见 `kb/troubleshooting.md #kb-dedup CRLF 去重失效`），故在 `%TEMP%\opencode\s48-kbdump\.openfeel\kb\` 放 **LF 归一化副本**（patterns.md / troubleshooting.md），以该目录为 cwd 用 Node（原生 type-stripping，Node v24.18.1）`import('file:///.../src/utils/kb-dedup.ts')` 计算。

| 候选 | 分类 | 扫描条目数 | 最高相似度（次高） | `shouldUpdate` | 判定 |
|------|------|:--:|:--:|:--:|:--:|
| 审查会话可信度治理（四纪律 + 健康探测 + 可复现三要素） | patterns | 36 | **5.88%**（#REV 可信度声明与独立复核）／3.45% | false | **批注既有条目**（下表说明） |
| 测试隔离的「干净机器」验证法 | patterns | 23 | **4.35%**（测试全局路径隔离模式）／4.23% | false | **新增** |
| 环境哈希守卫（CI 层） | patterns | 72 | **4.52%**（零行为变更验证方法）／3.82% | false | **新增** |
| 真实环境一次性数据清理规范 | troubleshooting | 26 | **3.77%**（agent_manager_tool 静默丢弃）／3.33% | false | **新增** |

**结论**：最高 5.88% ≪ 80% 阈值 → 技术上均判「新增」。但**审查会话可信度治理**与 op-001 执行期已写入的 `#REV 可信度声明与独立复核`（patterns.md）**属同一语义域**（Jaccard 因新文本偏长而稀释）——为避免产生重复条目，归档官**判定为批注更新而非新增**：在该既有条目末尾追加「更新于 2026-09-29」块，说明四条纪律已上溯为 reviewer agent 模板前置规则 + Feel 健康探测 + H12 写入 `manual/core/code-review.md`。另两条 patterns 与既有同族条目**互加交叉引用**（新增条目「参见」既有条目），避免读者误判为重复。（`[+]`/`[-]` 标记不参与相似度计算，与规范一致。）

### 新增条目要点（均含实证依据与可操作结论）

1. **patterns｜测试隔离的「干净机器」验证法**：适用＝隔离缺口在本机未触发（条件写）。两步：① **干净机器模拟**（临时移出真实全局文件使 `isFirstUse()` 为 true → 隔离运行断言未重建 + `try/finally` 复原 + hash/mtime 逐位回归）；② **对照实验**（复制测试、仅移除 `vi.mock('node:os')` 块 → 证明「未 mock 时确会写」）。**依据**：`test-v1.1.2-stage-48-report` §三 B-2/B-3、`initProject → ensureGlobalConfig()` 条件写链路。
2. **patterns｜环境哈希守卫（CI 层）**：受测命令前后快照三目录（存在性 + 清单 + 逐文件 sha256）；**ABSENT→ABSENT 通过**（干净 runner 不误报）、**只比 sha256 不比 mtime**（touch 不误报；与「mtime 是伪隔离铁证」不矛盾——检测污染用 mtime、守卫防误报排除 mtime）、三态可捕获；快照点须紧贴被测命令；本地抽脚本演练 6 场景。**依据**：`test-v1.1.2-stage-48-report` §三 B-4/B-5 + REV-009 覆盖窗口。
3. **troubleshooting｜真实环境一次性数据清理规范**：**末段匹配**（`k.split(/[\\/]/).pop().startsWith(...)`）而非字面前缀（后者 0 命中→假性通过）；**删除数断言恰为预期** + 剩余键数断言；**四步保护**（隔离副本验证 → 时间戳备份 → 执行 → JSON + 剩余键 + 可还原性复核）；解析失败中止不写盘。**依据**：`REV-v1.1.2-stage-48` REV-002、op-006 实测 455→0、备份 `config.json.bak.2026-09-29T14-04-13-412Z`。

### 既有条目批注更新（1 处）

| 文件 | 条目 | 批注要点 |
|------|------|----------|
| patterns | #REV 可信度声明与独立复核 | 由事件 A **上溯为前置规则**：四条纪律入 reviewer agent 模板（随会话自动加载）+ Feel 首轮健康探测（前置拦截优于事后声明）+ H12 可疑产出降级写入 `manual/core/code-review.md` |

> 归档纪律：既有条目的历史结论**不删除**，仅在条目末尾追加「更新于」块（保留演进轨迹与判据来源）。

---

## 三、手动模块文档同步（4 文件更新 + 1 文件复核无改动）

| 文档 | 处置 | 理由 |
|------|------|------|
| `manual/core/config.md` | 更新（API 行 + 新增段） | `readProfile` 返回类型增 `parseError?`（**语义变更**：非法 YAML 不覆盖 + 告警 + 调用方 `exit 1`）；三子 Schema `.passthrough()`（未知键保全） |
| `manual/core/global-paths.md` | 更新（1 节 + 历史） | 死映射**状态由「未清理」改为「已清理 455→0」**；清理指引升级为四步保护（安全语义变更） |
| `manual/agents/feel.md` | 更新（+1 节） | 新增审查会话健康探测与可疑产出处置（**调度规则变更**）+ 审查纪律四条落点 |
| `manual/index.md` | 更新（4 行） | 维护规则补「profile 读写语义」「死映射清理指引」「审查健康探测」，并**新增 code-review 行**（否则后续归档漏检） |
| `manual/cli/commands.md` | **复核确认无需改动** | 执行口径（`⚠️ 本仓执行一律用 node bin/openfeel.js`）与 `flow phases --json` 三键已于 stage-48 op-003 落地（由执行阶段写就），归档官复核一致 |

> 复核**无需改动**：`manual/core/{code-review,permission,init,flow-manager,backup}.md`（本阶段未改其 API/结构；`core/code-review.md` 由 op-001 新建，内容完整；`permission.md` 的「平台默认 `ask`」口径与 op-004 措辞精化一致，无冲突）。

---

## 四、Bug 与 REV 归档

### Bug（10 条在册：9 closed + 1 新登记 open）

- **`cli/BUG-003`（low）`open → closed`**：`flow phases --json` 的 `--help` 文案补 `advanceAccepted`（遗留 #1）。修复＝i18n 真源（`zh-CN.ts:481` / `en.ts:456`）+ `flow.ts:336` fallback **双处**；测试官实测 zh/en 双语 `--help` 均含 `advanceAccepted`、`--json` 顶层键集正确、`lint i18n` 531 键一致。归档官补齐「防再犯」三要点（新增输出字段须同批核对 help 文案 / 枚举式文案是漂移源 / i18n 真源 + fallback 双处成对改）。
- **新登记 `templates/BUG-003`（low，open，非阻塞）**：**部署型** skill 模板（`openfeel-cli-usage` 26 处 / `openfeel-wizard` 3 处，生成段 34/34）被改为 `node bin/openfeel.js`，而 skill 与 agent / agents-md 同属「`setup`/`update` 部署到**用户全局环境**」的产物，用户项目无本仓 `bin/` → 照指引执行报模块不存在，与 REV-009 的 agent / agents-md 保留裸 `openfeel` 裁定**口径相反**。**处置建议：与 `REV-009` 合并移交 `v1.1.2-stage-49`（U4/U6/U7）**。
- 本阶段**非 Bug 单**的遗留落地：`profile.yaml` 健壮性（非法 YAML 不覆盖）、455 条死映射清理（455→0）——属 13 项遗留清单的 op 交付，未开 Bug 单。

### REV（9 条：8 closed + 1 pending 转 stage-49）

| REV | 段 | 优先级 | blocking | 状态 | 要点 |
|-----|----|:--:|:--:|:--:|------|
| REV-001 | 计划 | high | **true** | closed | 「13 项遗留」无完整编号清单 → §一新增编号清单，13/13 有归属 |
| REV-002 | 计划 | high | **true** | closed | op-006 匹配模式与真实键形态不符（字面前缀 0 命中）→ 末段匹配 + 删除数 455 断言 + 四步保护 |
| REV-003 | 计划 | low | false | closed | 测试基线 693 → 694（与 roadmap 及实测一致） |
| REV-004 | 计划 | medium | false | closed | 版本断言未明确覆盖 publish job → 两 job 各一处 |
| REV-005 | 计划 | medium | false | closed | 事件 A 缺「可疑会话产出降级」流程级规则 → 新增 H12 |
| REV-006 | 计划 | low | false | closed | op-003 ① 「等」字清单不闭合 → 全仓扫描兜底 |
| REV-007 | 计划 | low | false | closed | op-005 ② 「记 update_infos 异常」新增依赖边 → 定案 `parseError` + 跳过写回 + `console.warn` |
| REV-008 | 方案 | medium | false | closed | op-004 ③ 提请表 3 处失效 → 缩为 2 有效 + 3 失效留痕 |
| REV-009 | 执行 | low | false | **pending** | CI 守卫覆盖窗口 / 部署模板查询型加注 → **转 stage-49 U7/U4** |

- **代码审查**：通过，零阻塞；唯一非阻塞项即 REV-009（转下游）。
- **未闭环项如实登记**：`REV-v1.1.2-stage-46` REV-011 状态仍为 `resolved`（验收记录为空）——本阶段 op-004 已提请（未改状态），**状态同步属审查官职责（H11）**，移交审查官处置。`REV-v1.1.2-stage-44` REV-003 亦由 op-004 提请（测试官实测已于验收时补验收记录 + 状态同步为 `closed`）。

---

## 五、需 Feel 执行的命令（归档官不直写 flow.json）

```powershell
node bin/openfeel.js flow advance --stage v1.1.2-stage-48 --to done
```

- `VALID_TRANSITIONS` 中不存在 `completed`，**必须**使用 `done`。
- 该命令会：① 将 stage-48 `phase` 置 `done`；② 追加 `advance_stage_phase` 审计条目（补记本阶段未由 `openfeel archive` 写入的 `archive_stage` 条目）；③ `pipeline.phase` 为全量 done 派生值，因 stage-49 未 done，全局仍为 `active`（符合既有裁定）。
- 本阶段**未运行** `openfeel archive`（副作用见第六节偏差 1），如需完整审计链可另行运行，但**不建议**。
- **下游**：`v1.1.2-stage-49`（整仓全量审查，已进入 scheme 阶段）——须承接 `templates/BUG-003`（建议与 `REV-009` 合并，U4/U6/U7）。

---

## 六、偏差与观察

| # | 偏差 / 观察 | 处置 |
|---|-------------|------|
| 1 | **未运行 `openfeel archive`** | 沿用 stage-45/46/47/43 先例（源码核对 `src/core/archive/merge.ts` 三项副作用：覆盖手工摘要 / `appendLog`+`save()` **直写 flow.json** / 对 closed REV 绕过去重追加低质 `patterns` 条目）→ 手工生成摘要；代价 = flow.json 缺 `archive_stage`（由 Feel 的 `flow advance --to done` 补记） |
| 2 | `flow.json` / `flow.json.bak` 在归档前已有未提交工作树改动 + 新增 stage-48/stage-49 checkpoint 文件 | 均为流水线自身状态推进（`exec_running → … → archiving`）+ checkpoint，归档官**未触碰** `flow.json` |
| 3 | **`templates/BUG-003` 未修** | 按测试官建议**合并移交 stage-49**（与 REV-009 同批，U4/U6/U7）；本阶段为「事件加固」定位，不夹带部署模板口径重构 |
| 4 | **`REV-46` REV-011 仍 `resolved`（验收记录空）** | 提请行已登记（op-004 处理记录），**归档官不改状态**；如实登记并移交审查官（H11） |
| 5 | `cli/BUG-003` 修复**未按生命周期翻转** `fixing`/`resolved` | 直接由测试官验收关闭（流程偏差，非结论影响）；已在 `bugs/cli.md` 关闭记录中如实留痕 |
| 6 | op-004 措辞「平台默认**为**」vs 方案正文「平台默认**实为**」不一致 | executor 按**验收命令**对齐为「平台默认为」（语义不变），已在执行报告偏差 1 留痕 |
| 7 | 归档官未重复运行 `npm test` / `npm run build` | 归档官职责为归档沉淀，不重复跑测试；回归数字采信审查官与测试官的**独立实测**（双方一致：**41 文件 / 706 用例**、`tsc` 0、build 幂等、`lint i18n` 531 键、`lint kb` 0 过期/226 引用） |
| 8 | `log/index.md`（66 个 U+FFFD）/ `log.md`（2 个）为历史混合编码 | 仅**首部插入 / 字面追加**，写入后复核 U+FFFD 计数**不变**（66 / 2）且 UTF-8 合法；`log.md` 文末空的重复表头未整理（历史遗留） |
| 9 | 新增日志取 **062** 号 | 取号前扫描当日已用 `001~061`（061 = stage-48.op-007），无撞号 |
| 10 | `kb/patterns.md` 为**混合行尾**文件（CRLF 2591 / LF 55）、`troubleshooting.md`（721 CRLF）、`code_review/index.md`（全 CRLF） | 新增条目按其**占优行尾**（CRLF）以「读为字符串 → CRLF 追加 → UTF-8 无 BOM 写回」处理，**未整文件重写**；处理后校验条目计数与 U+FFFD 计数 |
| 11 | `kb/index.md` 分类计数此前已**滞后 2 条**（记为 96，实测 98 = 含 op-001 执行期新增 2 条） | 本次归档一并修正为 **100**（98 + 本次 2 条），并补登 op-001 两条摘要行（避免继续漏登） |
| 12 | 事件 A/B/C 的**执行阶段即已写入 kb**（op-001/002 直接改 `patterns.md`，非留待归档） | 归档官复核其质量与去重并**不重复新增**（其中「REV 可信度声明」判为同族 → 仅批注）；这是 op 方案允许的「执行期可写 kb」情形（op-001 风险表第 5 条）|

---

## 七、移交

- 归档产物 22 项全部落盘；知识沉淀 4 条（3 新增 + 1 批注）；manual 4 文件更新 + 1 复核无改动；Bug 10 条在册（9 closed + 1 新登记 open）；REV 8 closed + 1 pending 转下游。
- **待 Feel 执行**：`node bin/openfeel.js flow advance --stage v1.1.2-stage-48 --to done`。
- **下游承接**：`v1.1.2-stage-49`（整仓全量审查）须包含：① `templates/BUG-003` + `REV-v1.1.2-stage-48` REV-009 合并处置（U4/U6/U7：部署型模板口径 + CI 守卫覆盖窗口）；② `REV-v1.1.2-stage-46` REV-011 状态同步（验收记录补录）；③ 本阶段建立的加固机制（审查纪律 / 健康探测 / 隔离守卫 / 数据清理四步法）在 stage-49 全量审查中**首次实测检视**。
