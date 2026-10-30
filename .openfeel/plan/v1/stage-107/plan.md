# v1.4.0-stage-107 计划 — 写入门禁分层（静态展示资源 + chore 微变更通道）

- **阶段**：`v1.4.0-stage-107`（fast；新特性 → 次版本 1.4.0）
- **关联需求**：REQ-008
- **输入**：`OpenFeelHarness/docs/feedback/openfeel-write-gate-friction-2026-10-30.md`（UI 微调被拦 3 次；7 步编排 vs 1 行 CSS）
- **基线**：v1.3.5（HEAD `453d48d`，已发布）；测试 79/2010；dsh 42+87+46+10=185
- **目标**：把「静态展示资源」与 doc 归为同一豁免层；提供 1 步 `chore` 微变更通道；源码/受保护路径/混合目标三条底线不变。

## 一、分类维度修正（必做）

**`dsh/lib/guard.js`**：

1. 新增 `isPresentationalAssetPath(absolute)`：
   - 扩展名：`.css` / `.scss` / `.html` / `.svg` / `.png` / `.jpg` / `.jpeg` / `.webp`；
   - 目录：路径任一段为 `assets` 或 `public`（支持 `crates/cli/assets/index.html` 这类嵌套资产目录）。
2. 新增 `isExemptPath = isDocPath || isPresentationalAssetPath`：
   - **无活跃阶段**（全部 done）与**非 `exec_running` 相位**：`allExempt` → 放行；
   - **混合目标**：`targets.every(isExempt)` 才放行——同时含源码与静态资源 → 走源码规则（从严）；
   - 源码扩展名（`.rs/.ts/.js/.py` 等）**不进入**豁免集；受保护路径（`.openfeel/flow.json`、`**/status.md`）在豁免判定之前拒绝。
3. **审计事件（新增）**：豁免放行（doc/asset）与 chore 放行时，追加 JSONL 到
   `.openfeel/log/guard-audit.jsonl`：
   `{ time, event:"guard_allow", tool, reason:"doc-asset"|"chore", phase, paths[] }`；
   best-effort（写失败不阻塞放行），测试可断言内容。

## 二、chore 微变更通道（建议 B）

- **存储**：`.openfeel/chore.json`（**不写 flow.json 的 stages**，阶段数不变）：
  `{ id:"CHORE-<ts>", note, started_at, expires_at, stage_count_at_start }`，默认 TTL 60 分钟。
- **CLI**（`src/commands/chore.ts`）：
  - `openfeel chore "<说明>" [--ttl-min N]`：要求已初始化；**存在任一 `phase != done` 的阶段 → 拒绝**（避免绕过在途阶段门禁）；写 chore.json + flow log `chore_start`；输出可写提示与收口方式。
  - `openfeel chore --end`：写 `chore_end` 日志、删除 chore.json（幂等：无 chore → 提示并 exit 0）。
  - `openfeel chore --status [--json]`：只读显示 active / expired / none。
- **guard 判定**：chore 有效（未过期）且**无活跃阶段** → 放行任意目标（受保护路径仍拒），审计 reason=`chore`；存在活跃阶段 → 忽略 chore（按相位规则）。
- **自动收口**：到期即失效（无需清理文件）；`--end` 显式收口。与 `fast` 不冲突：fast 少几关，chore 是「本不需要关」。

## 三、涉及文件

- `dsh/lib/guard.js`（分类 + 审计 + chore 判定）
- `dsh/test/guard.js`（分类矩阵 + 审计 + chore）
- `src/commands/chore.ts`（新）、`src/cli/index.ts`（注册）
- `src/core/i18n-data/{zh-CN,en}.ts`（chore / guard 文案）
- `test/commands/chore.test.ts`（start/end/status/活跃阶段拒绝/阶段数不变/日志）
- 文档：`dsh/README.md`、`dsh/ADAPTER.md`、`docs/commands.md`、`docs/VERSIONS.md`、`CHANGELOG`、README、GETTING_STARTED、cli-usage skill
- 收口：版本载体 1.4.0 + build + 门禁 + 归档 + push + CI 发布

## 四、验收（真实输出，须贴回）

a) 全阶段 done：写 `web/index.html` / `*.css` → 成功 + `.openfeel/log/guard-audit.jsonl` 有记录
b) 同状态写 `src/main.rs` → 仍拒，错误文案不变
c) 写 `.openfeel/flow.json` → 仍拒
d) `openfeel chore "x"` → 立即写源码成功；`--end` 后 flow.json `stages` 数不变，日志含 chore_start/chore_end

## 五、边界

- 不放宽 `.rs/.ts/.js/.py` 等源码；混合目标从严。
- 不放宽 `.openfeel/flow.json` / `**/status.md`。
- chore 仅在无活跃阶段时有效；不修改相位机 / 阶段列表 / 审查归档语义。
- 适配器属 host module：发版后**必须完全重启宿主**（重载后端无效）。
