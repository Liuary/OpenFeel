# v1.1.2-stage-58 归档 — CLI 输出编码自适应 + 运行日志

- **归档 Agent**：openfeel-archiver（推理模型）
- **归档时间**：2026-10-02
- **阶段**：`v1.1.2-stage-58`（**3 op**：op-001 A+C+D / op-002 B+E / op-003 F+门禁）；归档时 phase = `archiving`，目标 phase = `done`（由 Feel 执行 CLI）
- **实操 commit**：`ae79c4e`(op-001) / `e9036e1`(op-002) / `91da64c`(op-003)
- **来源**：用户需求「CLI 输出编码自适应 + 运行日志」——解决 Windows 传统 CJK 代码页（非 TTY）下的中文乱码，并新增跨项目运行的 CLI 进程诊断日志
- **前置**：`v1.1.2-stage-57`（hard，已归档）
- **⚠️ 环境约束**：本阶段**未触碰**真实全局目录；**未 push、未 `npm publish`**（由 Feel 统一推送 stage-57+58 → CI → 自动 `npm publish`）

---

## 一、阶段交付摘要（A~F）

- **A 输出编码自适应**（op-001）：新建 `src/cli/output-encoding.ts`（`installOutputEncoding()` + `resolveTargetEncoding()`）；`bin/openfeel.js` **单一咽喉**安装（包装 `process.stdout/stderr.write`，仅字符流转码、Buffer 直通、保留回调，**不设 `VITEST` 守卫**）；`--encoding <utf8|gbk|auto>`（默认 auto）+ `OPENFEEL_ENCODING`；auto **5 步优先序**（①`--json` ②`--encoding`（`=`/空格）③env ④非 win32 或 TTY → utf8 ⑤win32 非 TTY → `chcp` 映射 + 缓存 + 失败降级）；不可编码字符降 `?` 不告警；`target==='utf8'` 不包装。
- **C `--json` 恒 UTF-8 最高优先**（op-001）：`resolveTargetEncoding` 第 1 步 `argv.includes('--json')` 旁路，覆盖 `--encoding`/env/auto。
- **B 运行日志**（op-002）：新建 `src/core/runtime-log.ts` + `global-paths.getCliLogsDir()` → `~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log`；**默认开启、恒 UTF-8**、`[ISO][LEVEL][pid] msg`、info/warn/error 默认、debug 默认关；`--log-file`/`--no-log`/`--debug` + env；`withFileLock('runtime-log')` + best-effort；不记 stdout；**库侧默认 no-op、仅 CLI 入口 install**。
- **D 依赖**（op-001）：`iconv-lite@^0.7.2` 提为直接依赖（唯一新增，MIT；lock 仅根 `dependencies` +1 行，不改依赖树）。
- **E 测试**（op-001/op-002）：新增 **32 用例**（编码 24 含**正控** + 日志 8）；`repl.test.ts` 加 `OPENFEEL_ENCODING:'utf8'` + `OPENFEEL_LOG:'0'`。
- **F 文档**（op-003）：manual ×2 新建（`core/runtime-log.md`、`cli/output-encoding.md`）+ ×3 更新（`index.md`、`core/global-paths.md`、`cli/commands.md`）；README ×2、`CHANGELOG.md`、`docs/commands.md`（三类日志边界 / UTF-8 字符串语义 / 解析期错误不入日志）。

---

## 二、验证 / 门禁

`npm test` **61 文件 / 1018 用例 / 0 skipped** ｜ `tsc` 0 ｜ `npm run build` 幂等**不复活** `.opencode/**` ｜ `lint i18n` **730 键**（exit 0）｜ `lint kb` 0 过期 ｜ `npm pack` 271 文件 ｜ 测试官确认**真实 `~/.openfeel/cli/logs/` 在 `npm test` 前后零变化**（测试不写真实日志）｜ 编码 E2E **正控**（`flow phases` + GBK → GBK 字节且非合法 UTF-8）与 `--json` 旁路（合法 UTF-8 + `JSON.parse`）均通过。

---

## 三、缺陷

- **新登记 `cli/BUG-008`（low, open）**：`--debug`/`OPENFEEL_DEBUG=1` 的级别过滤与开关机制正确，但全仓 `runtimeLog()` 仅 info/error 3 处调用、**无 debug/warn 生产者** → 真实 CLI 无可观测 `[DEBUG]`（不违反「debug 默认关」裁定，非阻塞）。归档官**不改源码**，维持 open。
- 公域统计 **19（open 1 / closed 18）**，与私域 `index.md` 及实测 `BUG-*.md` 文件数三者一致。

---

## 四、知识沉淀（5 条新增）

| 分类 | 条目 |
|------|------|
| architecture | 四类日志边界：CLI 进程运行日志 / 工作区审计 / 流水线状态审计 / 部署更新记录 |
| patterns | CLI 输出编码自适应的「单一咽喉」模式：进程入口包装 stdout/stderr.write + `--json` 恒 UTF-8 旁路 |
| patterns | 库侧默认 no-op + 进程入口 install 的副作用隔离模式：不设 `VITEST` 守卫 |
| troubleshooting | Node 无内建 GBK 编码能力：`TextEncoder` 静默忽略、`Buffer.transcode` 抛错 → 必须第三方编码器 |
| troubleshooting | 默认开启写真实用户目录的副作用防护：`VITEST` 会被 spawn 子进程继承、不能作隔离守卫 |

> **去重口径**：`node bin/openfeel.js knowledge dedup` 逐条调用；5 条候选最高相似度 **8.3%** ≪ 80%，全判**新增**。

---

## 五、索引与文档收口

- **公共审查**：`.openfeel/code_review/v1.1.2-stage-58.md`（REV-001~008 全 closed）；`code_review/index.md` passed 28 → **29**。
- **Bug 沉淀**：`bugs/cli.md` 新增 BUG-008；`bugs/index.md` 统计 **18 → 19**（open 1 / closed 18）。
- **manual/docs**：op-003 已新建 2 篇 manual 并登记入 `manual/index.md`（模块树 + 维护规则 ×2）、更新 `cli/commands.md`、`core/global-paths.md`；README×2 + `docs/commands.md` + `CHANGELOG.md` 已同步；归档官复核**一致**。
- **知识库**：`kb/{architecture,patterns,troubleshooting}.md` 各追加条目 + `kb/index.md`（概览源文件 63→65、分类计数、摘要表、最近更新）；`lint kb` 0 过期（295 引用）。
- **索引**：`log/{index,log,2026/10/02/day_index}`（日条目取 **010** 号）、`plan/{index,plan_log}`、`stage-58/status.md` → done、`dev/current.md`（新格式；最旧 stage-52 轮换入 `current_archive/current-2026-10-02-002.md`）、`roadmap/v1.1.2.md`（M14 done + 十八阶段闭环 + 发布就绪）、`dev_last.md` + 5 主题文件。

---

## 六、偏差登记

1. **`openfeel archive` 未运行**（沿用先例）→ 手工生成归档摘要，`archive_stage` 由 Feel 的 `flow advance` 补记。
2. **`flow.json` 归档官未触碰**（需 Feel 执行 `flow advance --stage v1.1.2-stage-58 --to done`）。
3. **归档官未重复 `npm test`/`build`**，门禁数字采信执行/测试官独立实测（61/1018、730、0 过期、build 不复活）。
4. **知识去重**：5 条候选最高 8.3% ≪ 80%，全判新增。
5. **`cli/BUG-008` 维持 open**：归档官边界「不改源码」，登记沉淀但不修复。
6. **本条目取 `010` 号**（取号前扫描 2026-10-02 已用 **001~009**；008/009 为 op 执行日志）。

---

## 七、发布结论

**发布就绪**：v1.1.2 **十八阶段（41~58）全部闭环**；门禁全绿。**待 Feel/用户执行**：① 统一 `git push`（stage-57 + stage-58 一起推）→ CI（含 stage-57 的 CI 修复）→ 自动 `npm publish`；② 重启 harness 会话。**遗留**：`cli/BUG-008`（low）；历史层 REV（仅登记）；登记不修项；文件孤儿 62（仅报告）。
