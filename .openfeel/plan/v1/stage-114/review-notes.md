# v1.5.6-stage-114 计划审查报告（openfeel-reviewer 独立审查）

> 审查对象：`.openfeel/plan/v1/stage-114/plan.md`（565 行基线）
> 审查时间：2026-10-31
> 结论：**需修订**（high 5 / medium 8 / low 6 / blocking 5）
> 处置：5 条 high+blocking 已转为 flow.json 的 REV 条目；medium/low 13 条作为执行期必改项随计划修订一并落实。

## 一、high + blocking（5 条）

1. **[high][blocking] `stage task --add` 门位不可达** —— 计划 §2.2 #13 / §4.1（`src/commands/stage.ts:594-613`，`appendStatusTask` 在 :601，门位却标 :634）。
   `--add` 分支在门之前就写 status.md 并在 :612 返回，门位 :634 永远到不了该分支，strict 下可无门写盘；且 §4.1 表格把「首个写盘点 :601」与「门位 :634」并列，自相矛盾。
   **修法**：改为两处门（`--add` 分支 :601 前 + 主路径 :635 前），门位数 28→29，并单独补 `stage task --add` 的 strict 用例。

2. **[high][blocking] 漏接 `view accept`** —— 计划 §0.5/§2 全量盘点未出现（`src/commands/view.ts:72` → `src/core/view/entry.ts:239-271`，:271 `save()`）。
   该命令把 REV 置 closed 并写 flow.json，可清掉 blocking open REV，从而绕过 `flow advance --to done` / `flow archive` 的阻塞门；strict 下完全不受门。
   **修法**：在 `acceptReview` 调用前加门并补 strict 用例，或给出 REQ 层面的排除理由。

3. **[high][blocking] `config set --sync-stages` 被整体排除，但 REQ-015 权威节明确要求** —— 计划 §0.5 / §10 / §7（`src/commands/config.ts:264/400-420`、`src/core/flow-manager.ts:3957-4058`、`REQ-015.md:67`）。
   §10「config set 写 config.yaml＋可选 status.md」还漏了 `stages[id].workflow_mode` 的 **flow.json 写盘**（`flow-manager.ts:4051-4058`）；§7 差异表缺 `flow config_sync_stage` 行。
   **修法**：在 `config.ts:400` 之后、`setConfigValue`（:403）之前加 `if (opts.syncStages && !enforce...) return;`，补 §7 行与 strict/warn 用例（i18n 复用既有 `flow.preflightRequiredTmpl` 成立）。

4. **[high][blocking] legacy reject 载荷新增顶层 `hint` 键，违反三键契约** —— 计划 §1.5（:137-145）与 §5.3（:355、:358）（`src/commands/flow.ts:2086-2093`、`src/commands/req.ts:39-42`、`docs/commands.md:63`）。
   写成 `{error:'preflight-required', hint:...}` 会新增顶层 `hint`，与同段注释「键集不变」、§5.3 断言的三键 `['schemaVersion','error','errorKind']`、legacy「仅末尾追加 errorKind」契约直接冲突。
   **修法**：去掉 `hint`（提示并入 `error` 字符串或改走 envelope），保持三键并在 docs 登记 `preflight-required` 值。

5. **[high][blocking] §3.4 一律接受「门遮蔽」与 §3.2 自相矛盾** —— 计划 §3.4（:240-255）vs §3.2（:226）。
   会让 `flow review update/resolve REV-999`、`plan scheme publish/rename/remove/register op-999`、`flow stage reset --to bogus` 在 strict 下先报 preflight 而非 not-found/非法值（用户被误导去跑 `flow next`）；而 `flow review remove` 与 `stage set` 已按 §3.2 前置存在性，同族不一致。
   **修法**：`--to` 用已导出的 `PipelinePhaseSchema`、REV/op 用 `getReviewItems`/`listSchemes` 做**只读预检**（不构成第二套真值）；遮蔽只保留真正只存在于写函数内的状态/值域校验（not-draft、empty-template 等），并在 §3.4 精确列出仍接受的项。

## 二、medium（8 条，非阻塞，执行期必改）

6. `flow advance --dry-run` 零写盘（`flow.ts:1196` 前无 save），却仍被 §2.1 #5 的无条件门拦；「dry-run 永不被拒」对 advance 不成立，5 条 dry-run 用例少 1 条。
7. §2.3（:197）称 23 个新接入命令在 `--json` 下都变 envelope，但多数命令未注册 `--json`（实际只有 `flow.ts:944`、`flow.ts:2079`、`req.ts:587`），传 `--json` 会被 Commander 判 unknown option，envelope 分支不可达；应按人类 stderr 描述。
8. §3.3（:233-238）要求 4 条顺序断言（claim / stage set / review remove / archive bogus），§5.3 只落 3 条且多出 rename；`flow review remove REV-999` 与 `flow archive bogus` 无用例，`stage task` 只测勾选路径。
9. §5.3 公共断言「stderr 含 preflight 文案」但 `flow archive`/`req split` 的 legacy reject 在 `--json` 下输出到 stdout（`flow.ts:2086`、`req.ts:39`），不能同时满足；且 `flow archive` 门在判据门（:2117-2155）之后，fixture 必须本身 eligible。
10. §11（:554-559）op 拆分重复归属：op-001 已含 4 个收敛点，op-002/004/005 又重复列 `advance`/`plan stage add`/`add+claim`；op-004 写「共 8 点」实列 10 个门位。
11. §8.1/§8.2（:423-449）与 `stage-115/status.md:21-26`：未给与 stage-115 的落地顺序；两阶段都改 `docs/commands.md` 并跑 build 重生成 `template-loader.ts`。
12. §9.7（:515-517）要求把 `grep .command(` 行号与 §2 逐条比对，但插门后行号必然位移（§11 :563 也承认），该验收会稳定 FAIL；应改为按命令名/层级比对。
13. §1.3（:120）「errors.ts 注释已标 Windows 管道截断风险」是对注释的反读：注释说的是 failCli「输出在退出之前完成以避免截断」；真实理由只是调用点无法 return 收敛。

## 三、low（6 条）

14. §5.4/§5.5（:366-382；`test/cli/lock-timeout.test.ts:20-45`）：spawn 用例若沿用 `{...process.env}` 会继承 `OPENFEEL_PREFLIGHT=off`，strict/warn 子进程可能恒绿/恒红；须显式传 `env: { ...baseEnv, OPENFEEL_PREFLIGHT: <mode> }`。
15. §0.5（:55、:57）与 §10（:541）（`src/core/archive/merge.ts:150/164`）：「全部状态写命令」措辞与排除清单矛盾；顶层 `archive <stage>` 实际 `appendLog+save()` 写 flow.json，被归为「一次性引导面」；理由应写成 REQ 排除而非「不写状态」。
16. §1.2/§1.3（:75、:106、:116）：骨架 import 了未使用的 `getCliLang`（ESLint `no-unused-vars` 会让 §8.2 的 `npx eslint src test` 失败）；`process.exitCode = 1` 硬编码而非 `getCliErrorSpec(...).exitCode`。
17. §2.3（:201）「off：完全不读账本」不成立：`preflightGate` 先 `checkPreflight` 读 `.preflight.json` 再判 off。
18. §1.1（:68）与 §5.1（:324、:361）：§1.1 说「6 条既有单测不动」，§5.1 又说「深化」且所列 6 条与现有不同；§5.3 说 dry-run 用例「跨 4 个测试文件」，实际只落 2 个。
19. §1.5（:139）：示例用 `asJson`，但 `flow archive` handler 内只有 `options.json`（`flow.ts:2080`），`asJson` 仅存在于 req.ts（`req.ts:590`），照抄会 TS 报错。

## 四、Feel 的补充裁定（与独立审查的差异）

- **REV-002 / REV-003（`flow repair` / `flow checkpoint restore`）**：独立审查把二者归为「逃生通道，排除理由成立」，Feel **不接受排除**，改为「受门 + state 不可读时条件豁免」。理由：`repair()`（`flow-manager.ts:3244` 起）与 `restoreCheckpoint()`（:870 起）在 flow.json 不可解析时仍能工作，而账本只在 `mgr.isLoaded()` 时写（`flow.ts:61`）——损坏状态下必须能放行；但状态可读时它们仍是绕过 strict 的写盘后门，不应静默放行。
- **REV-001（dry-run 免门）**：独立审查只指出 `flow advance`，Feel 全量核对后为 **8 个命令**：`flow stage remove` :742、`flow stage reset` :889、`flow advance` :941、`flow repair` :1831、`flow migrate` :1917、`flow checkpoint restore` :2020、`flow archive` :2078、`flow health` :2345。
