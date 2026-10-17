# v1.2.4-stage-100

## 目标

收口 `dsh/ACTION-GUIDE.md` 的 A1~A5 全部待办，并完成版本 **1.2.4** 全链路收尾（补丁版本，范围锁定、不扩项、不修改 `dsh/`）。

| 事项 | 交付 | 结果 |
|:--:|------|:--:|
| A1（P1，数据安全） | `archive <stage>` 已有归档拒绝覆盖（`ARCHIVE_EXISTS`/refusal/1，**零写盘**）+ `--force` 显式覆盖；检查先于一切写盘；保护为归档文件级（别名互不触发） | ✅ |
| A2（P1） | `plan stage list --json`（#34）：`{schemaVersion,stages,count}`；七键；flow.json 注册序；人类仍为计划目录清单 | ✅ |
| A3（P1） | `model list|get --json`（#35/#36）：首个 `/` 切分；source 三层 default > project > global | ✅ |
| A4（P2） | `flow retry`（#37）/ `lint i18n|kb`（#38/#39）/ `roadmap show`（#40）：retry 六键；lint `ok:false` + exit 1；roadmap 表头驱动兼容 3/4 列 | ✅ |
| A5（P2） | `config get --all --json`：`{scope:"project",defaults}` 四键；不再 `key-required`；冲突组合拒绝 | ✅ |
| 版本收口 | 版本 **1.2.4** 全链路 A/B/C/D/E + `CHANGELOG [1.2.4]` + 文档多载体 + supplement 增量；`--version` = 1.2.4 | ✅ |
| 门禁 | G1~G9：75 文件 / 1941 用例 0 failed、tsc 0、i18n 994、kb 0 过期 / 643 引用、build ×2 幂等、40/41、`dsh/` 零 diff | ✅ |

**外部项**：OUT-1（DSH 适配器消费 v1.2.4 新出口）为 **DSH 侧转出**，OpenFeel 不代改 `dsh/`，不作为本阶段完成判据。

## 依赖

无（上游 `v1.2.3-stage-99` 已 done / 已归档；flow.json `deps=[]`）。

## 操作方案

fast 快线（单阶段、无 op 分片）：计划 → 计划审查（单轮必经）→ 执行（T1→T7）→ 代码审查（单轮）→ 归档。阶段计划见 `plan.md`；门禁实测登记见 `.openfeel/tmp/stage-100/gate.md`。

## 归档结果

- **状态**：审查通过（REV-100-001/002 全 closed，0 blocking）；门禁全绿；**版本级收口成立**。
- **归档摘要**：`.openfeel/log/archive-v1.2.4-stage-100.md`
- **知识沉淀**：patterns +1（归档覆盖保护）/ troubleshooting +1（读命令 JSON 全覆盖计数口径 40/41）。
- **manual**：`index.md` / `cli/commands.md` / `cli/model.md` / `core/config.md` / `core/json-contract.md` 已同步（A1~A5、40/41、`archive --force`）。
- **REV-100-002**：归档轮以 `roadmap show v1.2.4 --json` 复核——无参空态为契约已登记语义，显式版本正确返回 M54；**closed**。
- **phase**：保持 `archiving`，由 Feel 经 CLI 推进至 `done`（归档官不直写 flow.json）。
