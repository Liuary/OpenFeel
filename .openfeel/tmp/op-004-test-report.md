# op-004 自测报告（v1.2.2-stage-95 阶段末 op）

## 执行摘要

按 op-004 修订 1 完成测试反守卫基线化（5+1 断言点）、i18n 收口、18 出口/错误矩阵/`--project` 复核、C1~C6 同步结论与全量门禁。修复后全量 **74 文件 / 1779 用例 / 0 failed / 0 skipped**；`npx tsc --noEmit` = 0；`lint i18n` = 950；`lint kb` = 0 过期 / 624 引用；`npm run build` ×2 幂等；`--version` = 1.2.1。产品源码零改动；未推进 phase、未直写 flow.json/status.md。

## 前置校验结果

| 项 | 结果 |
|----|------|
| 方案完整性 | 通过：含 `## 目标` / `## 实施步骤` / `## 产出文件`（等价节「涉及文件/产出」）/ `## 自测清单` / `- **阶段**：` / `- **最多重试**：` |
| Phase 合法性 | 通过：`v1.2.2-stage-95.phase=exec_running`；`current=v1.2.2-stage-95.op-004`；op-id 匹配；phase 属合法枚举 |
| 流转合法性 | 通过：`openfeel flow health --quick` exit 0，全部 ✅（无 warnings/errors） |
| 执行方式 | 方案 + deps.yaml 完整读取；按修订 1 §0 优先执行 |

## 实施步骤完成情况

| 步骤 | 状态 | 结果 |
|------|:--:|------|
| §0.1 req.test.ts 5 处反守卫 → 基线快照 | ✅ | 模块顶层 `snapshotReqDir` + `REAL_REQ_SNAPSHOT`；5 处全替换；`existsSync(REAL_REQ_DIR)` 残留 0 |
| §0.2 flow.test.ts 去除需求层耦合 | ✅ | 删除 1 处 `not.toContain`；保留字节不变断言；标题订正 |
| §0.3 边界复核 | ✅ | 仅两测试文件；`src/**` 零改动；其他零触碰断言保留 |
| §0.4 失败集对照 | ✅ | before 49（flow 1 + req 48）→ after 0；定向 205/205 |
| §1 i18n 与文案复核 | ✅ | 恰 5 键 zh/en 成对、零死键；lint 950 |
| §2 人类输出零回归 | ✅ | err/code 空 diff；stdout 20/25 一致，5 条可归因 |
| §3 JSON 契约与 18 出口 | ✅ | 契约测试全绿；18 出口实跑 18/18 首键正确、键序与 §5 一致 |
| §4 错误矩阵 | ✅ | 10 行 × zh/en = 20/20；12 行映射逐行断言通过 |
| §5 `--project` / version | ✅ | 六场景 + 语言/日志/误判对 + version 三键全部通过 |
| §6 C1~C6 | ✅ | 逐项结论写入 `docs/json-contract.md` §9（含 C1b） |
| §7 全量门禁与报告 | ✅ | 见门禁表；报告已落盘 |

## 自测清单验证

| 检查项 | 期望 | 实测 | 结论 |
|--------|------|------|:--:|
| 定向测试修复前 | 49 failed | 49 failed（13 套件 / 205 用例） | ✅ |
| 定向测试修复后 | 0 failed | 205/205 passed | ✅ |
| `grep -n "existsSync(REAL_REQ_DIR)"` | 0 行 | 0 行 | ✅ |
| `npm test` | 0 failed / 0 skipped | 74 文件 / 1779 用例 / 0 failed / 0 skipped | ✅ |
| `npx tsc --noEmit` | 0 | 0 | ✅ |
| `npm run build` ×2 | 幂等 | dist 汇总哈希两次相同；生成物 `git status` 空 | ✅ |
| `lint i18n` | 950 | 950 | ✅ |
| `lint kb` | 0 过期 | 0 过期 / 624 引用 | ✅ |
| 人类输出 diff | 空（允许 2 处增量） | err/code 空；stdout 差异均为数据漂移或已登记增量 | ✅ |
| 错误矩阵 10×2 | 全通过 | 20/20 | ✅ |
| `--project` 六场景 | 全通过 | 全通过（含语言/日志/误判对） | ✅ |
| `--version` / JSON | 1.2.1 / 三键 | 1.2.1 / `{schemaVersion,version,node}` | ✅ |
| C1~C6 | 零空项 | 表内 7 行（含 C1b）全部有结论 | ✅ |

## 产出文件

- `test/commands/req.test.ts`（修改：快照函数 + 5 处断言）
- `test/commands/flow.test.ts`（修改：删除 1 处断言 + 标题）
- `docs/json-contract.md`（修改：§9 收口结论 + C1b + REV-95-005 备注）
- `.openfeel/tmp/stage-95/final-report.md`
- `.openfeel/tmp/stage-95/human-output-diff.md`
- `.openfeel/tmp/stage-95/failure-set-before.txt` / `failure-set-after.txt`
- 证据目录：`baseline/`、`after/`、`outlets/`、`error-matrix/`、`project-option/`、`npm-test.log`、`build-hash-1/2.txt`、`lint-*.txt`

## 方案一致性回写

| 声明产出 | 实际 | 判定 |
|----------|------|------|
| `test/commands/req.test.ts` | 已修改（仅隔离断言） | 一致 |
| `test/commands/flow.test.ts` | 已修改（仅隔离断言 + 标题） | 一致 |
| `docs/json-contract.md` | 已修改（§9；§5 冻结表实测一致，未改实现） | 一致 |
| `.openfeel/tmp/stage-95/final-report.md` | 已产出 | 一致 |
| `.openfeel/tmp/stage-95/human-output-diff.md` | 已产出 | 一致 |
| `.openfeel/tmp/stage-95/failure-set-before.txt` / `after.txt` | 已产出 | 一致 |
| `src/**` | **零改动**（op-004） | 一致 |
| 方案范围外 | 仅新增证据脚本/日志于 `.openfeel/tmp/stage-95/` | 允许（证据文件） |

## 偏差记录

1. **方案数据口径**：方案称「修复前 72 文件 / 1745 用例」为旧值（op-003 测试落地前）；op-004 未增测试，修复前后同为 74 / 1779。已按实测登记，不视为缺陷。
2. **并发冲突实跑**：`FlowConcurrentModificationError` 无法在单进程 CLI 稳定复现，改用生产 handler 直调（与 error-envelope ⑤ 同源）。附带观测：文件锁等待超时映射 `INTERNAL_ERROR`/internal/3，已登记供审查判定，未改代码（D-95-18）。
3. **内部异常**：为「模拟」场景，实跑侧无稳定注入点，以 error-envelope ⑥（JSON/non-JSON 双模式 exit 3）+ 锁超时观测承载。
4. **REV-95-005 残留**：`.openfeel/roadmap/v1.2.2.md:31` 仍有「收敛为全局选项」旧口径；不在本 op 可写范围，登记 stage-98。
5. **跳步违规**：无。
6. **方案修正记录表**：op-004 无该节，以上偏差登记于本报告。

## 审查移交

自测通过。**请安排 openfeel-reviewer 审查**（重点复核：两测试文件 diff 无断言弱化、49→0 失败集、C1~C6 表与契约 §9、并发/内部两类模拟证据）。
