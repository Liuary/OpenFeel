# v1.5.16-stage-131 计划（REQ-024 / fast 模式）

> 来源：CultivationOpenRealm 2026-11-08 复核（OpenFeel 1.5.15）中的新观察。范围锁死：只处理**可确认的代码不一致**与**文档缺口**；OF-01/OF-04/OF-06 不属本轮（宿主侧/未复现），claim 状态语义不改行为。

## 一、事实与判定

| 反馈 | 判定 | 依据 |
|---|---|---|
| `checkpoints.exec.attempts` 恒 0，与顶层 `attempts=1` 不一致 | **真缺陷**（OF-02 原始期望未完全落地） | 全仓只有初始化写 0 与 `exec.self='running'`；`recordAttempt` 只加 `op.attempts`（`src/core/flow-manager.ts:3086` 起），`checkpoints.exec.attempts` 无任何写点 |
| `flow ops list` 对 **done** op 仍报 `fill:"empty"` + 空模板 warning | **噪声**（done 后已无可执行动作） | `src/commands/flow.ts` ops list 的 warning 只看 `fill==='empty'`，不看 `state` |
| `claim` 不再把 `draft` 推进到 `in_progress` | **非回归，设计如此** | 引擎 `claimRequirement` 只写 `owner/claimed_at`（`.openfeel/manual/core/req.md:59`）；状态流转是显式 `req advance`。旧 REQ-010 的 `in_progress` 应为显式推进结果 → 本轮**只补文档**，不改行为 |
| `feel_op remove` 对 done op 需 `--force`；临时 op 无法清理 | 设计保护 | 删 done op 会破坏审计链；本轮只补文档说明「临时 op 请用 draft/删除文件」，不改门 |
| OF-05 复杂 pwsh 仍 `warn`/`shell-undecidable` | **设计：第 4 类默认告警放行（非阻断）**；白名单已存在但未文档化到 README | `OPENFEEL_SHELL_ALLOW`（v1.5.14）在 `dsh/ADAPTER.md` 有，但 README/prompt 未提；本轮补文档与用法示例 |

## 二、改法

1. **`recordAttempt` 同步 checkpoint**（`src/core/flow-manager.ts`）：
   - `op.attempts += 1` 之后同步 `op.checkpoints.exec.attempts = op.attempts`（pass / fail-retry / fail-exhausted 三条路径共用一次赋值，位置在分支前）；
   - 防御：`op.checkpoints?.exec` 缺失时**不新建**对象（避免造假结构），仅跳过；`exec.self` 语义不变（仍由 `advancePhase` 维护）。
2. **ops list 告警降噪**（`src/commands/flow.ts`）：
   - human 与 `--json` 的 `warning` 都改为 `fill==='empty' && state !== 'done'` 才出文案；`fill` 字段本身保持真实模板填充度（不伪装已填充）；
   - 同步文档 `docs/json-contract.md` 两处（`warning` 语义）与 `docs/commands.md`（若提及）。
3. **文档**：
   - `docs/commands.md` req 节：`req claim` 只写 `owner/claimed_at`，**不改 status**；推进状态用 `req advance`（旧行为说明）。
   - README「快速排障/门禁」处补 `OPENFEEL_SHELL_ALLOW`（`||` 分隔、折叠空白后整条全等、strict 亦生效）与「第 4 类 warn 为非阻断」；`dsh/lib/surface/prompt.js` 门禁段补一行。
   - `plan scheme remove` 文档补「done op 删除需 --force」一句（与实现一致）。
4. 不改：`claim` 行为、`remove` 门禁、OF-01/04/06。

## 三、测试

- `flow-manager` / 命令层：attempt pass → `checkpoints.exec.attempts===1`；fail（未耗尽）→ 同步递增；耗尽 failed → 同步；缺失 `checkpoints.exec` 的脏夹具不抛错。
- `flow ops list`：done + empty → **无** warning（human 与 `--json.warning===null`）；pending + empty → 仍有 warning（防过度裁剪）；`fill` 仍为 `empty`。
- 文档类无测试；`docs/json-contract.md` 仅文字。

## 四、验收

1. `npx vitest run test/commands/flow.test.ts test/cli/json-contract.test.ts` 全绿（含新增用例）。
2. `npm test` 全绿（基线 2377 + 新增）。
3. `tsc --noEmit` / `lint i18n` / `build` 通过；版本收口 1.5.16（待用户确认发布）。

## 五、风险

- 改 `warning` 语义属**行为可见变更**（done op 的 `warning` 从 string → null）：契约文档同步更新；`fill` 不变，不会把未填充伪装成已填充。
- checkpoint 同步可能与未来 `advancePhase` 的 exec 计数语义冲突：当前无第二写点，注释标明「`exec.attempts` 单点 = recordAttempt」。

> 计划审查：self-review（两条代码改动均单点、可测；代码审查将派独立 reviewer）。
