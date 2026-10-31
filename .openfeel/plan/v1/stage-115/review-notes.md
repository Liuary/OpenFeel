# v1.5.6-stage-115 计划审查报告（openfeel-reviewer 独立审查）

> 审查对象：`.openfeel/plan/v1/stage-115/plan.md`（731 行）
> 结论：**需修订**（high 4 / medium 7 / low 8 / blocking 4）
> 处置：4 条 high+blocking 转 REV-010~013；medium/low 15 条作为执行期必改项。

## 一、high + blocking（4 条）

1. **[high][blocking] 「任一 token 不合形态 → 整 span 跳过」把最常见引用整体免检**
   §2.1（:289-291）/§1.2（:193-194）/§0.3。实测 17 份正文中 **25 个 span 首 token 是真根命令却被跳过**（`openfeel flow next --json`、`stage status --json`、`flow log --json` 等）。写错 `flow stats --json` / `flow stage sett --json` 永远不报。
   现存真缺陷 `REQ-015:18` 的 `flow review_add/resolve/update/remove`、`:11` 的 `flow config_sync_stage` 正因下划线被静默放过，而计划宣称「A 类唯一名恰 4 个」。
   **Feel 裁定**：不采纳「整 span 跳过」，升级为**前导 token 串解析**：取 span 开头连续满足 `^[a-z][a-z0-9_-]*$`（**允许下划线**）的 token 串，遇到 `-` 开头 / `<` 开头 / 其他字符即停；对这条前缀做 A/B 判定。这样 `flow review_add`、`flow config_sync_stage`、`flow stats --json` 都会被抓到，而 `flow.json`、`plan_review`、`stage-114`、`--json`、`<stageId>` 仍不误报。

2. **[high][blocking] 未闭合 `ignore-start` 静默延续到 EOF**
   §4.2-8（:395-396）+ T13（:461）/C8（:479）。一个 `ignore-started` 拼错或漏写 end，就让文件后半段（含今后追加内容）永久免检，正是「抑制标记静默掩盖整段」。
   **Feel 裁定**：采纳。文件结束时 `inRegion` 仍为 true → **stderr 一行警告**（不改退出码）+ 人类输出统计「抑制行数」；T13 改为断言警告存在。

3. **[high][blocking] 测试时序倒置，C10/C12 无人认领**
   §10 op-002（:707）+ §5.2 C10（:481）/C12（:483）。C10「全部真实正文 exit 0」与 C12「原文件 0/0」都依赖 op-003 的正文改正；但 C10 被列在 op-002 交付面（op 落地即跑测试 → 必红），C12 不在任何 op 的交付面。
   **裁定**：op-002 只交付 fixture 级 C1~C9/C11；**C10/C12 移入 op-003 验收**，并同步修正测试条数归属。

4. **[high][blocking] 正文改正漏项（与 Feel 裁定「规范清单改正为真实命令名」不符）**
   §4.3.1（:408、:413-414）/§10 op-003（:708）。`REQ-015:18` 的 `flow review_add` / `review_resolve` / `review_update` / `review_remove` 四名**都不存在**（真为 `flow review add|resolve|update|remove`），计划未列入改正；`:11` 的 after 文本仍保留不存在的 `flow config_sync_stage`（差异表 `:67` 自己写明「无此命名」）。
   **裁定**：op-003 增补 `:18` 四名与 `:11` 的 `flow config_sync_stage`；验收加 `grep -n "flow review_\|flow config_sync_stage" .openfeel/requirements` **零命中**。

## 二、medium（7 条，执行期必改）

5. §3.1 / §0.3 / C10：A/B 边界有真实退化——`flwo stage set` 只到 B（ok:true）、`stagee deps` 完全静默；B 的尾名命中全树过宽（`npm run lint`、`git status`、`pnpm add` 都会成 suspect）。须在 §3.1/§9 写清退化边界，补 T17/C13，并声明「零误报」只对当前正文成立。
6. §5.1 T6 用例事实错误：`flow review add x` 是 4 token，不会被上限跳过，会在 `x` 断点产生 A 类 issue；应改 `flow review add a b`（5 token）。
7. §5.2 前置 / §1.4 / T2：声称「19 个 `register*Command`（照抄 `test/cli/json-contract.test.ts:86-101`）」，但 86-101 实际只注册 14 个（缺 init/update/migrate/chore/dev）。应直接 import `program as rootProgram`（生产同源）。
8. §4.3.1 / op-003：`:11` 的 `stage set/task`、`flow stage set/reset/remove`、`plan scheme create/publish` 都是**单 span 内含 `/`**，按整 span 跳过，改写后仍不被校验。须拆成独立反引号 span，或删掉「可校验」论断并在 §9 记边界。
9. §1.3 / §3.4 / C4：「仅 B 类」的成功输出未定义——`ok:true + suspects:2` 时用户只看到「✅ 未发现不存在的命令名」。须定义成功态 suspects 展示 + 用例。
10. §1.2 / §3.1 / T9：`breakAt` 在 3+ token 时返回内部点路径（`flow.stage`），与接口注释「父命令名」不符；补 T9b（`flow stage deps` → `flow stage`）。
11. §7.6（:569）：与 Feel 裁定及 §4.3/§10 冲突（写「115 的 op-003 只加行尾抑制注释」），且 115 的 exit-0 验收隐式依赖 114 在 REQ-015 加好的 `ignore-start` 区间。须改写为「115 改正正文、零标记；114 只补差异表与 `:82` 记录；串行且 115 以 114 落地后为基线」；同节 564/565 重复编号。

## 三、low（8 条）

12. §2.1（:291）：`stage-114` / `op-001` 排除理由事实错误（单 token，只因「非根名」静默）。
13. §6.2（:526）：`docs/json-contract.md:168` 分项合计本来差 1（flow 15 未含 `flow retry`），须同批改 `flow 15 → 16` 并补 `:169`。
14. §6.3：`docs/commands.md:982` 标题「无 JSON 出口变更」在新增 #41 后失真，计划未列。
15. §8.2（:592）/§0.3：标签写 "6 keys" 实为 7 键；§0.3「零误报样本」两行重复。
16. §8.9（:663）：期望 `git status --porcelain` 恰 6 行，但 REQ-015 已有 114 的未提交差异，实际必多。
17. §2.4（:306）：「不跟随符号链接」无实现约束（`readdirSync + readFileSync` 会跟随）。
18. §0.3（:64）/C10：`candidates` 口径（135 / 去重 74）与 REQ-017:50 的「34」不同口径，须写明且不得硬编码 34。
19. §5.1/§5.2：缺空文件、无候选、同一行两候选（A+A / 同行 A+B）的边界用例。

## 四、已核实无问题（reviewer 结论，供参考）

commander 14 的 `cmd.name()` 会剥离参数；`registerLintCommand(program)` 闭包捕获根 program 可行且 `core/lint-req.ts` 不传递引入 commander；真实树根命令 19、`--json` 注册 41 / 成功出口 40；`ok === (issues.length===0)` 与 #38/#39 一致；i18n 两表各 1048 且无硬断言；REQ-015 计划 after 的命令名全部真实注册；按计划 after 文本实测 17 文件 0A/0B。
