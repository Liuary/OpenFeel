# 六期落地：操作顺序与批次

> 对象：02 文档给出的 v1.5.23 速赢 7 项 + v1.5.24 结构 4 项 + 候补 3 项 + 附带问题 A–D
> 策略：**合并为一个版本 v1.5.23**，按"依赖 → 风险 → 可验证性"排序成 7 个批次，每批一次提交、一次测试
> 阶段：`v1.5.23-stage-11`（fast）｜需求：REQ-041 … REQ-045

## 排序原则

1. **先止血**：仓库卫生（C/#4）先做——它每小时都在产生脏 diff，且改动面最小、可逆。
2. **再堵嘴**：语义/描述类（#6/D）改错话，成本极低且不牵动逻辑；放在结构改动前，避免后批次验收时被旧描述误导。
3. **依赖先行**：`dev clean`（#4）必须先于 `#2`（门禁放行 `git rm --cached`），否则用户只能绕过门禁手敲。
4. **单点复用**：`#1 complete` 依赖 `#8 waive` 的语义与 `#5 trivial` 的标记落点；`#5/#8` 又要先定"需求级附加字段"的承载方式——所以审查/终止批次放在收口批次之前。
5. **每批可独立回滚**：批次间不共享未提交改动；每批 `tsc + vitest` 绿了再进下一批。

## 批次表

| 批 | REQ | 内容 | 主要改动面 | 完成判据 |
|---|---|---|---|---|
| 1 | REQ-041 | 卫生：C `.sync.json` ignore → #4 `init` 不入索引 + `dev clean` + 历史清理 → #2 门禁放行纯索引操作 | `.gitignore`、`src/core/init.ts`、`src/commands/dev.ts`、`dsh/lib/guard.js`、`src/core/flow-manager.ts:2168` | 归档提交不再带 `.sync.json`；`dev clean` 幂等；`--cached` 放行/非 `--cached` 仍拒；索引操作后不自动提交 |
| 2 | REQ-042 | 语义纠偏：#6 删 `result` 死字段 → D 修 done 门描述 → B 写侧补 `canCompleteRequirement` 断言 → A metrics 记失败 | `dsh/lib/tools/index.js`、`dsh/lib/surface/prompt.js`、`templates-data`、`src/core/req/aggregate.ts`、`src/commands/flow.ts` | 传 `result` 报错；描述与 `requirement-ops.ts:186` 一致；A 有 `failedRuns>0` 的用例 |
| 3 | REQ-042 | 视图与上下文：#7 `stage status` 进度 → #9 `feel_next.goal` → #12 `by` 缺省 | `src/commands/stage.ts`、`src/core/req/*`、`dsh/lib/tools/index.js`、`dsh/lib/adapters/*` | JSON 向后兼容新增字段；无 goal 时省略键；`feel_req review` 不传 by 可记 |
| 4 | REQ-043 | 审查与终止：#5 需求级 `trivial` 标记 → #8 `waive` 显式豁免 | `src/core/req/*`、`src/commands/req.ts`、`dsh/lib/tools/index.js` | trivial 需求可跳过审验但审计标注；waive 后阶段 done 门放行且归档可见 |
| 5 | REQ-043 | 需求收口提速：#1 `add --claim --stage` + `req complete` | `src/commands/req.ts`、`src/core/req/requirement-ops.ts`、`dsh/lib/tools/index.js` | 一条命令开单+认领+关联；一条命令审验+收口，且复用既有门 |
| 6 | REQ-044 | 交接与判据：#3 `recovery.handoff` 指向 `dev_last` 受管块 + 删模板空承诺 → #10 criteria 只读引用 | `src/core/dev-status.ts`、`dsh/lib/adapters/recovery.js`、`src/commands/stage.ts` | `feel_status.recovery` 带 handoff 路径；`stage verify --criteria` 落结构化证据 |
| 7 | REQ-044 | 发现性与沉淀：#13 随相位的单条示例 → #11 op 失败原因 + KB 提示 | `dsh/lib/adapters/dispatch.js`、`src/core/flow-manager.ts`、`dsh/lib/tools/index.js` | `feel_next` 附 1 条示例；attempt 记录 `reason`；两次失败给 `feel_kb add` 提示 |
| 8 | REQ-045 | 收尾：版本 1.5.23、CHANGELOG、README/docs 同步、全量测试 | `package.json`、`dsh/package.json`、`CHANGELOG.md`、`docs/*` | 两包 lockstep、全量 `vitest` 绿、`market:index:check` 通过 |

## 明确不做的部分

- **#10 升级 done 门**（判据必须全 pass 才允许 done）：会拒绝所有存量阶段，属破坏性变更，本轮只做"只读引用 + 结构化证据"，升级留到有真实项目用满一版之后。
- **#11 跨阶段同因识别**：`flow.json.log` 只留 200 条，做不到；本轮只做"同一 op 失败 ≥2 次"的局部提示。

## 风险与回退

- 批 1 的门禁改动可能影响既有 guard 测试：以 `dsh/test/guard.js` 为契约，改判定前先读测试。
- 批 4/5 动需求状态机：兜底靠 `canCompleteRequirement` 单点，禁止在命令层另写判据。
- 每批独立提交，任一角色为红即停下修，不带病进下一批。

## 验收方式

- 每批：`npx tsc --noEmit` + 该批相关 `vitest` 文件 + 手工 CLI 冒烟（`--json` 契约优先）。
- 收尾：全量 `npm test`；在本仓跑一次真实 `req complete` / `stage verify --criteria` 冒烟。
