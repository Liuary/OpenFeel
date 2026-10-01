# v1.1.2-stage-52

## 目标

反馈 09（可编排性/可观测性）+ v1.1.2 遗留清账 + **约束体系精简与硬编码阈值定性化**（**逐条先在当前代码实测验证**，重复项仅登记不修）：**F1~F8** 中 F3 主体/F7/F8 已解决（仅登记），F1 部分存在，F2/F4/F5/F6 仍存在；工作项 **B1** 结构化输出（`flow status/current/health/metrics/overview --json`）+ **B8** `flow current` 无 op 显示改进、**B2** 状态对账/自愈（`flow health --fix`，仅回写「状态」字段）、**B3** `flow ops list`（填充度+空模板 warning）、**B4** `scheme create --draft` + `publish`（窄兼容）、**B5** `advance --to` 自动逐步 + 路径预览、**B6** `plan scheme rename`、**B7** 编码保障（UTF-8/`NO_COLOR`）+ **B9** GBK 实测；遗留 **L1**（用户裁定 A4：**本阶段直接移除 `view add`**，保留 `view list`/`accept`）、**L2**（由 7 族缩至 **3 族**：archive/instructions/project）、**L5** warn 文案 i18n、**L7** 文件孤儿 62 条报告完善、**L8** `kb-dedup` CRLF 修复（patterns 2→105、troubleshooting 0→31，高价值）；**op-011（用户裁定 C1~C4）**：简洁约束按精简草案改写（去硬编码/去重复/定性）、B 组阈值定性化（**保留 D 组工程阈值**）、根 `AGENTS.md` 对齐模板源、**「14 个 Skill」→ 17** 计数漂移修正。**继续 v1.1.2，不改版本号**。

## 依赖

- **hard**：`v1.1.2-stage-51`（已 `done`；`flow-manager.ts`/`commands/flow.ts`/`commands/plan.ts`/`core/plan/scheme.ts` 为其热区，必须串行；B3/B4 建立在 N8 op 命名与 N1 op 对账之上）
- **soft**：`v1.1.2-stage-50`（已 `done`；`lint` 退出码 R1 已落地 → 本阶段门禁 `lint i18n` 失败非 0）
- **下游**：无固定后继（v1.1.2 收尾）；**L1（`view add` 移除）按用户裁定 A4 在本阶段执行**（破坏性变更 + CHANGELOG `Removed`）
- **用户已裁定（2026-10-01）**：**A1** 引入 `draft`（窄兼容）／**A2** `--fix` 仅回写「状态」字段／**A3** `--to` 自动逐步／**A4** 本阶段移除 `view add`（**与 Planner 建议相反**）；**A5/A6 按建议执行、A7 待 B9 实测**；**C1~C4** 「简洁约束」按精简草案改写 + B 组阈值定性化（保留 D 组）+ 根 `AGENTS.md` 对齐模板源 + 「14 个 Skill」→ 17（**op-011**；C1 文案为单行、en 语义对等）
- **既定裁定登记**：L3（`lint --warn-only` 不加）、L4（coverage 阈值不设）、L6（历史日志不迁移）
- **REV-v1.1.2-stage-52 修订（2026-10-01）**：**REV-001**（B5 REV 复检）→ §5.3a「论证等价为主 + 进入 done 前复检加固」（`addAutoFixReview` 恒置 `status='resolved'`，`flow.ts:664-666` 过滤 `status==='open'`）；**REV-002**（draft 的 `attempt`）→ §5.2 第 5 条「`attempt` 对 draft op exit 1 + 提示先 `publish`」；**REV-003** → 删除 §5.6 后残留 A7 表行。

## 操作方案

详见 `.openfeel/plan/v1/stage-52/plan.md`（op-001 ~ op-011）。
