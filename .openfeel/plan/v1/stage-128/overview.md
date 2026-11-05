# v1.5.13-stage-128

## 目标

v1.5.12 发布后的两个**易用性补丁**（REQ-021，fast 模式，不扩范围）：

1. **A（P2）`git commit` 允许相位扩展**：由 `exec_running|archiving` 扩到 `exec_running|review_passed|test_passed|archiving`，解决「审完/测完想提交却被拦、日常开发工作树长期脏着」；`plan_*` / `scheme_*` / `review_pending` / `test_pending` / `done` 仍拒（`done` 收口后走归档提交）。拒绝文案由「先推进到 exec_running」改为列出四个允许相位。
2. **B（P2）`SKILL.md` frontmatter `description` 的 `#` 截断**：`openfeel-cli-usage` 的 description 是未加引号 YAML 标量，`出口 #43` 的 `#` 起注释作用，导致 v1.5.10 / v1.5.11 / v1.5.12 能力串与触发句**不进入解析值**（实测解析值 2455 字符，止于「出口」）。改为 `出口 No.43` 后解析值 2766 字符，能力串完整回归。

验收口径（真机可复验）：四相位 commit 放行、五类相位拒绝且文案列出四相位、非 commit 整树写文案不变；`npm run build` 后源与注入副本一致且无裸 `#`；`node dsh/test/guard.js` 与 `npm test` 全绿（`templates.test.ts:521` 快照正控不回归）。详见 `plan.md` §五。

## 依赖

无

## 操作方案

2 个 op，**串行**执行（op-001 改门禁与 dsh 测试、op-002 改模板源 + build + vitest，文件集不重叠，但 build 必须最后跑以免覆盖判据）：

- **op-001 — A（commit 相位扩展）**
  文件：`dsh/lib/guard.js`、`dsh/test/guard.js`、`dsh/ADAPTER.md`。
  要点：`case 'commit'` 的 `phases` 改为 `['exec_running','review_passed','test_passed','archiving']`；拒绝文案按 `gitSubcommand === 'commit'` 分叉、相位串从 `classification.phases` 派生（单一真值），并保留 `git 工作区写` 字样与非 commit 通用文案（`stash` / `reset --hard` 用例靠它）；同步 4 处注释与 ADAPTER 两处表述；新增 4 正 / 5 负 check，负例必须用「真实仓库 + `src/**` 待提交」或非 git 夹具（否则 `done` 会被 op-002 书账窄口放行而假绿），并显式锁住「`done` + 纯 `.openfeel/**` 仍走 `git-commit-bookkeeping`」以防误关窄口。

- **op-002 — B（frontmatter 截断修复）**
  文件：`src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`、`src/core/{update,template-loader}.ts`（`npm run build` 生成）、`test/core/templates.test.ts`。
  要点：`:3` 整行唯一替换 `出口 #43` → `出口 No.43`（终值逐字见 `plan.md` §3.1，行 2779 / 解析值 2766，不得重排或截短）；改后 `npm run build` 重注入两份副本；在 `S4/S5` describe 内追加 `S6`，用生产解析器 `splitFrontmatter` 断言解析长度、v1.5.10/11/12 关键字、末句、无 `\s#`，并断言注入副本含 `出口 No.43` 且不含 `出口 #43`。

回滚：两 op 文件集不相交，任一可单独 revert；`src/core/{update,template-loader}.ts` 为生成物，回滚 `SKILL.md` 后重跑 `npm run build` 即复原。
