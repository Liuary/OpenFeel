# v1.1.2-stage-58

## 目标

> CLI 输出编码自适应 + 运行日志。
> ① **输出编码自适应（A+C）**：在 `bin/openfeel.js` 单一咽喉包装 `process.stdout/stderr.write`，Windows 传统 CJK 代码页（非 TTY）下按 `chcp` 把人类可读文本转码为对应编码；`--json` 恒 UTF-8 机器合同；显式 `--encoding <utf8|gbk|auto>` / `OPENFEEL_ENCODING` 优先；Buffer 直通。**隔离 = bin 单一 install + 库侧默认 no-op（不设 `VITEST` 守卫）**；E2E 含正控防恒绿。
> ② **运行日志（B）**：新增 `~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log`，**恒 UTF-8**，默认开启，记录 info/warn/error（debug 默认关）；`--log-file`/`--no-log`/`--debug` 控制；并发经 `withFileLock`；与工作区审计 / flow.json 状态审计 / 部署记录三者边界清晰。**解析期错误（未知命令/选项/缺参）不入日志**（仅文档化）。
> ③ **依赖（D）**：`iconv-lite@^0.7.2` 提升为直接依赖（包已在依赖树、MIT）。

## 依赖

- hard: `v1.1.2-stage-57`（发布收尾；本阶段在其后执行，完成后统一由 Feel 推送 + 发布）

## 操作方案

> 3 op，顺序 `op-001 → op-002 → op-003`。

| op | 主题 | 覆盖 |
|:--:|------|------|
| **op-001** | 输出编码自适应 + `--json` 恒 UTF-8 + 依赖 | A（A-1~A-7）+ C（C-1~C-3）+ D（D-1~D-4） |
| **op-002** | 运行日志 + 测试收尾 | B（B-1~B-8）+ E（E-1~E-5） |
| **op-003** | 文档 + 回归门禁 + 阶段报告 | F（F-1~F-5）+ 全部门禁 + 报告 |

## 边界

- 不改 `flow.json`；不代 Feel 推送；不执行 `npm publish`；不创建 op 文件（由 openfeel-schemer 产出）。
- 不引入除 `iconv-lite` 外的新依赖；不改 `.openfeel/log/**`（工作区审计）/ `flow.json.log[]`（状态审计）/ `update_infos.md`（部署记录）语义。
- 不做日志自动清理；不记录每条命令的 stdout 内容；不改 `--verbose` 语义；不实现着色。

## REV 修订要点（2026-10-02）

- **REV-001（blocking，已裁定方案 b）**：实测 vitest 设 `process.env.VITEST="true"` 且 spawn 子进程继承 → 原 A-1 守卫会短路经 `bin` 的 E2E（恒绿假阳性）。**裁定删除 `VITEST` 守卫**：install 仅由 `bin` 调用，in-process 测试从不 install，「未安装即 no-op」已足够；E2E 加**正控**（非 json CJK 命令 + GBK 断言为 GBK 字节）确保真正覆盖。受影响测试（实测）：**仅 `test/cli/repl.test.ts`**（win32 非 TTY 下确会被破坏，E-4 修复必要；POSIX 不受影响）。
- **REV-002~005**：commander 解析期错误不入日志（仅 B-6 注释 + B-8 manual 文档化）；A-3 string chunk 忽略显式 `encoding`（仅注释/manual 明示）；两 install 隔离策略统一（均无 env 守卫）；`instructions.ts` 行号 `:19`→**`:39`**；`npm test` 基线由 986 预估改为**开工时实盘校准**。

> 详细计划见 [plan.md](plan.md)。
