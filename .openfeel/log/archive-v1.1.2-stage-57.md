# v1.1.2-stage-57 归档 — 发布收尾（CI 修复 + CI 可观测性 + README 更新）

- **归档 Agent**：openfeel-archiver（推理模型）
- **归档时间**：2026-10-02
- **阶段**：`v1.1.2-stage-57`（**3 op**：op-001 C1+C2 / op-002 C3 README / op-003 C4 验证型）；归档时 phase = `archiving`，目标 phase = `done`（由 Feel 执行 CLI）
- **实操 commit**：`3278251`(op-001 CI 修复 + 注解) / `68e787f`(op-001 措辞修正)；`48345a9`(op-002 README)；op-003 验证型（无源码变更）
- **来源**：用户授权推送 `f178600`（stage-56 归档）后 **CI run #51 失败**——两个 `build-and-test` matrix job 均在 `npm test` 步骤失败（`publish` job 被 skip），1.1.2 未发布 → 本阶段 = **发布收尾**
- **前置**：`v1.1.2-stage-56`（hard，已归档）
- **⚠️ 环境约束**：本阶段**未触碰**真实全局目录；**未 push、未 `npm publish`**（由 Feel/用户执行）

---

## 一、阶段交付摘要（C1~C4）

- **C1 T32 平台化**（op-001）：`test/core/config.test.ts` 把「Windows 盘符大小写去重」拆为**跨平台用例**（目标 `resolve(tmpDir,'proj','x')` + 受控 ASCII 尾段大小写/斜杠变体 + **前置断言 `expect(preset).not.toBe(target)` 防假绿** + `toHaveLength(1)`）与 **Windows 专属用例**（`it.skipIf(process.platform !== 'win32')`，Linux skip 不计 failure）。**`src/core/config.ts` 零 diff**（根因在测试侧：POSIX 下 `C:\Proj\X` 非绝对路径）；Windows 单文件 38 passed / Linux 预推 37 passed + 1 skipped。
- **C2 CI 失败注解**（op-001）：`.github/workflows/ci.yml` 测试步骤 `set -o pipefail` + `npm test -- --reporter=verbose --no-color 2>&1 | tee "$RUNNER_TEMP/test.log"`（vitest 3.2.7 非 TTY 仍输出 ANSI、`FORCE_COLOR=0` 实测无效，故必须 `--no-color`）+ `if: failure()` 注解步骤先 `sed 's/\x1b\[[0-9;]*m//g'` 剥色兜底再 `grep -E '^\s*(×|FAIL)|Failed Tests'` → `echo "::error::"`（`head -n 20`、结尾 `exit 0`、零写盘、**不改 job 判定**）。
- **C3 README×3（28 处）+ `docs/commands.md`**（op-002）：测试数 **986 用例 / 59 文件**（Linux 跳过 1）、新增 v1.1.2 能力节、命令表修正、全局部署架构图注 + 分层小节、zh/en 逐处对等（各 178 行）、`1.1.1` 四文件零残留。
- **C4 回归 + 「可推送」结论**（op-003，验证型）：门禁六项实测 + 「可推送」结论（**未代推、未 `npm publish`**）。

---

## 二、验证 / 门禁

`npm test` **59 文件 / 986 用例 0 skipped** ｜ `tsc` 0 ｜ `npm run build` 双跑幂等**且不复活** `.opencode/**`（dist 252→252）｜ `lint i18n` **726 键**（exit 0）｜ `lint kb` 0 过期（260 引用，exit 0）｜ `flow phases --json` 5 键 ｜ 仓库 `.openfeel/config.yaml` 零污染 ｜ 测试官确认 **Linux 预览 = 985 passed / 1 skipped / 0 failed → CI 将转绿、`publish` 不再 skip**。

---

## 三、缺陷

- **本轮无新登记 Bug**：CI 失败根因 + 日志可观测性问题以 **REV** 形式登记（`code_review/v1.1.2-stage-57.md` REV-004 blocking）并经 op-001 修复闭环；REV-005（README 架构图 `backup/` 粒度失真）由**归档官就地修正**后 closed。
- 公域统计维持 **18（open 0 / closed 18）**，与私域及实测 `BUG-*.md` 文件数三者一致。

---

## 四、知识沉淀（3 条新增，均 patterns）

| 分类 | 条目 |
|------|------|
| patterns | 跨平台测试的平台专属用例处理原则：「跨平台断言 + 平台专属断言」二分 + `it.skipIf` 守卫 + 防假绿前置断言 |
| patterns | CI 失败可观测性模式：`--no-color` + `sed` 剥色 + `set -o pipefail` + `if: failure()` 注解（不改判定、零写盘） |
| patterns | README 与实现同步的检查清单：测试数 / 命令表 / 架构图 / 部署口径 / 版本残留五面核对 |

> **去重口径**：`node bin/openfeel.js knowledge dedup` 逐条调用；3 条候选最高相似度 **≈1.9%** ≪ 80%，全判**新增**。

---

## 五、索引与文档收口

- **公共审查**：`.openfeel/code_review/v1.1.2-stage-57.md`（已由 reviewer 建立，归档官补充归档收口；REV-001~005 全 closed）；`code_review/index.md` passed 27 → **28**。
- **REV-005 处置**：`README.zh-CN.md:157` / `README.en.md:157` 架构图 `backup/` → **`backup.ts`**（zh/en 镜像 2 行）。
- **归档补修**：`docs/GETTING_STARTED.md:5` 旧版本号残留「如 1.1.1」→ 去具体旧版号（与 C3-M2/REV-003 口径一致）。
- **manual 复核**：本阶段未触及 `src/**`，`manual/core/build.md`、`manual/cli/commands.md`、`manual/index.md` **无需更新**。
- **索引**：`log/{index,log,2026/10/02/day_index}`（日条目取 **005** 号）、`plan/{index,plan_log}`、`stage-57/status.md` → done、`dev/current.md`（新格式；最旧 stage-53 轮换入 `current_archive/current-2026-10-02-001.md`）、`roadmap/v1.1.2.md`（M13 done + 十七阶段闭环）、`dev_last.md` + 5 主题文件。

---

## 六、偏差登记

1. **`openfeel archive` 未运行**（沿用先例）→ 手工生成归档摘要，`archive_stage` 由 Feel 的 `flow advance` 补记。
2. **`flow.json` 归档官未触碰**（需 Feel 执行 `flow advance --stage v1.1.2-stage-57 --to done`）。
3. **归档官未重复 `npm test`/`build`**，门禁数字采信执行/测试官独立实测（59/986、726、0 过期、build 不复活）。
4. **知识去重**：3 条候选最高 ≈1.9% ≪ 80%，全判新增。
5. **REV-005 就地修正**：op 未改 README 架构图 → 归档官按「文档类归归档官」修正 zh/en 两行并关闭。
6. **额外补修**：`docs/GETTING_STARTED.md:5` 同类旧版本号残留（REV-003 裁定「一并修」的同类遗漏）。
7. **本条目取 `005` 号**（取号前扫描 2026-10-02 已用 **001~004**）。

---

## 七、发布结论

**可推送 / 发布**：v1.1.2 十七阶段（41~57）全部闭环；CI run #51 失败已修（Linux 预览转绿）；门禁全绿。**待用户执行**：① 重启 harness 会话；② `git push origin master`；③ `npm publish`。**后续**：`stage-58`（CLI 输出编码自适应 + 运行日志，规划中）。
