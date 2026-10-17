# v1.2.4-stage-100 归档摘要 — DSH ACTION-GUIDE A1~A5 收口（补丁版本）

- **阶段**：`v1.2.4-stage-100`（v1.2.4 单阶段 · 收口；工作流模式 **fast**，轻量归档）
- **归档人**：openfeel-archiver ｜ **归档时间**：2026-10-17 ｜ **上游**：`v1.2.3-stage-99`（done / 已归档）
- **关联需求**：无（补丁收口；`requirement: null`）
- **基线**：HEAD `62f09d8` + 当前工作区；CLI 1.2.3 → **1.2.4**；测试 75 文件 / 1911 → **1941**；契约 33/34 → **40 成功出口 / 41 注册选项**
- **归档结论**：审查通过（REV-100-001/002 全闭环，0 blocking）；门禁全绿（G1~G9）；**阶段可置 done（phase 推进由 Feel 经 CLI 执行）**；**v1.2.4 版本级收口成立**。

## 一、阶段目标与达成（A1~A5 + 版本收口）

| 事项 | 来源 | 交付 | 结果 |
|:--:|------|------|:--:|
| A1（P1，数据安全） | ACTION-GUIDE §3 | `archive <stage>` 已有归档拒绝覆盖（`ARCHIVE_EXISTS`/refusal/1，**零写盘**）+ `--force` 显式覆盖；检查先于一切写盘；保护为**归档文件级** | ✅ |
| A2（P1） | §4 | `plan stage list --json`（#34）：`{schemaVersion,stages,count}`；七键；flow.json 注册序；人类仍为计划目录清单 | ✅ |
| A3（P1） | §5 | `model list|get --json`（#35/#36）：provider/model 首个 `/` 切分；source 三层 default > project > global | ✅ |
| A4（P2） | §6 | `flow retry`（#37）/ `lint kb|i18n`（#38/#39）/ `roadmap show`（#40）：retry 六键；lint `ok:false` + exit 1 仍输出成功文档；roadmap 表头驱动兼容 3/4 列 | ✅ |
| A5（P2） | §7 | `config get --all --json`：`{scope:"project",defaults}` 四键；不再 `key-required`；冲突组合拒绝 | ✅ |
| 版本收口 | T6 | 版本 **1.2.4** 全链路 A/B/C/D/E + `CHANGELOG [1.2.4]` + 文档多载体 + supplement 增量；`--version` = 1.2.4 | ✅ |
| 门禁 | T7 | G1~G9 全绿；`dsh/` 零 diff | ✅ |

## 二、变更文件

- **统计**：`git diff 62f09d8 --stat` = **52 文件 +1779/−278**（含规划/roadmap 新增文档；`dsh/` 零 diff）。
- **源码（业务面）**：`src/core/archive/merge.ts`（覆盖检查前置 + `ArchiveExistsError`）、`src/commands/archive.ts`（`--force` + refusal）、`src/core/errors.ts`（`ARCHIVE_EXISTS`，码表 12 → **13 行**）、`src/commands/plan.ts`、`src/commands/model.ts`、`src/commands/flow.ts`、`src/commands/lint.ts`、`src/core/plan/roadmap.ts`、`src/commands/roadmap.ts`、`src/commands/config.ts`、`src/core/i18n-data/{zh-CN,en}.ts`。
- **生成物（B 类）**：`src/core/template-loader.ts`、`src/core/update.ts`（build 重生成；SHA-256 ×2 幂等）。
- **测试**：`test/commands/{archive,plan,model,flow,knowledge,config,roadmap}.test.ts`、`test/core/archive/merge.test.ts`、`test/cli/{json-contract,error-envelope}.test.ts`、`test/core/templates.test.ts`。
- **文档与传播（C 类）**：`CHANGELOG.md`（`## [1.2.4]`）、README×3、`docs/{GETTING_STARTED,commands,json-contract}.md`、`docs/dsh-cli-requirements-supplement-1.2.3.md`（原地增量至 v1.2.4）、`.openfeel/manual/{index,cli/commands,cli/model,core/config,core/json-contract}.md`、`openfeel-cli-usage` skill 快照。
- **版本载体（A 类）**：`package.json`、`package-lock.json`（root 两处）、`.openfeel/config.yaml`（单行）、`src/core/config.ts`、`agents-md/{zh-CN,en}.md`、`claude/constraint/{zh-CN,en}.md` —— 残留 **0**。
- **回填（归档轮）**：`.openfeel/tmp/stage-100/gate.md`、`.openfeel/plan/v1/{stage-100/**,v1.2.4/plan.md}`、`.openfeel/roadmap/v1.2.4.md`、`.openfeel/users/Liuary/code_review/REV-100.md`、`.openfeel/log/**`、`.openfeel/kb/**`。

## 三、门禁（`.openfeel/tmp/stage-100/gate.md`，三要素 CLI 1.2.4 / win32 Git Bash / Node v24.18.1）

| # | 门禁 | 实测 | 结论 |
|:-:|------|------|:--:|
| G1 | `npm test` | **75 文件 / 1941 用例 / 0 failed / 0 skipped**（基线 1911，+30） | PASS |
| G2 | `npx tsc --noEmit` | 0 错误 | PASS |
| G3 | `lint i18n` | **994** 键（zh/en 对称；基线 983，+11） | PASS |
| G4 | `lint kb` | **0 过期 / 643 引用**（门禁时点；基线 631；归档轮新增知识后复测 649 引用 / 0 过期） | PASS |
| G5 | `npm run build` ×2 | 成功且双生成物 SHA-256 前后一致（幂等） | PASS |
| G6 | `--version` | **1.2.4** | PASS |
| G7 | 计数 | **40 成功出口 / 41 注册选项**（源码 41 / 契约 / 冻结测试三处对齐） | PASS |
| G8 | `dsh/` 边界 | `git status --porcelain dsh/` 空 | PASS |
| G9 | 零回归 | 既有 33 出口键集键序不变；退出码 0/1/2 语义不变；人类输出受控对照 | PASS |

## 四、审查与 REV 闭环

| 轮次 | 结论 | 条目与处置 |
|------|:--:|------|
| 计划审查（fast 单轮，必经） | 通过 `plan_review → plan_passed` | REV-100-001（low，非阻塞）：A1 零写盘主判据改内容级四项（mtime 辅助）+ 别名双示例与「归档文件级」登记 → 计划修订 1 落实 **closed**；blocking = 0 |
| 代码审查（fast 单轮） | 通过 `review_pending → review_passed` | 独立复跑全量测试（不采信执行者报告）；A1 写盘顺序 + 测试矩阵（含别名双文件正控/负控）；A2~A5 实跑六面；40/41 三方对齐；版本 1.2.4 全链路 A 类残留 0；`dsh/` 零 diff；REV-100-001 复核 **closed**；新开 REV-100-002（low，空态语义确认） |
| 归档轮复核 | REV-100-002 **closed** | `roadmap show --json`（无参）= `version:null/milestones:[]`（契约已登记「无默认发现」语义）；`roadmap show v1.2.4 --json` 正确返回 M54 里程碑；证据落 `tmp/stage-100/gate.md` §四；不阻塞验收 |
| 正式验收 | fast 快线不含独立测试官轮（审查轮独立复跑代行） | 门禁 G1~G9 全绿；0 Bug；版本级收口成立 |

**REV 处置总表**：100-001 **closed** / 100-002 **closed** → **0 blocking / 0 遗留条目**。

## 五、验收与外部项

- **验收**：门禁全绿 + 零回归清单（既有 33 成功出口字段零删除/零重排/类型零改；退出码 0/1/2 语义不变；人类输出逐字不变；phase 枚举 15 项 / 转移表不变；无新增第三方依赖；存量 `flow.json` 零迁移零注入）。
- **OUT-1（仓库外 · DSH 侧转出）**：DSH 适配器消费 v1.2.4 新出口——7 处 `cli.text()` → `cli.json()`、`--json` 调用点 25 → 32、`feel_archive` 透传 `--force`、`feel_verify action=config_get` 支持无 key 全量、`openfeel.requiresCli` 升级。**由 DSH 侧维护，OpenFeel 不代改 `dsh/`**；不纳入本阶段文件清单与完成判据。
- **未做**：未 commit / 未 push / 未 publish；未直写 `flow.json`；未推进 phase（保持 `archiving`）。

## 六、版本级收口声明

- **v1.2.4 为补丁版本**：范围锁定为 ACTION-GUIDE A1~A5（1 项数据安全修复 + 7 个新 `--json` 命令面 + 2 项既有出口扩展）+ 版本收尾；**无新增命令组 / 配置键 / 第三方依赖 / phase 枚举变更**。
- **兼容承诺成立**：退出码 `0/1/2/3` 语义不变；既有 33 个成功出口键集与键序不变；既有命令人类输出逐字不变；`ARCHIVE_EXISTS` 仅新增错误码（码表 13 行）；存量 `flow.json` 零迁移零注入。
- **v1.2.4 单阶段（stage-100）完成**：A 类残留 0；B 类双生成物 build ×2 幂等；`--version` = 1.2.4；`CHANGELOG [1.2.4]` 落地；文档多载体 / manual / skill 快照同步；契约计数 **40 / 41** 三处对齐。
- **后续动作（Feel）**：将阶段 phase 由 `archiving` 推进至 `done`；`v1.2.4` 版本分片归档（`flow archive v1.2.4`）与 commit/push/publish 由 Feel/用户决定；OUT-1 由 DSH 侧单独执行。
