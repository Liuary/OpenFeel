# v1.1.3-stage-61

## 目标

> 修正 stage-58 引入的**回归**：`resolveTargetEncoding` 第⑤步在 `win32 && !isTTY` 时按 `chcp` 探测映射为 **GBK**，导致在 **UTF-8 管道消费者**（本 harness / IDE / CI）下输出乱码。
> **方案 A（用户裁定）**：第⑤步直接返回 `'utf8'`（对齐 Node 默认与管道/CI 消费者）；**GBK 仅经显式 `--encoding gbk` 或 `OPENFEEL_ENCODING=gbk` 生效**。

## 依赖

- v1.1.2-stage-60（hard，已登记于 `flow.json`）

## 背景（实测证据）

| 事实 | 实测 |
|------|------|
| pre-stage-58 bin（无 `installOutputEncoding`） | `flow current` 中文**可读（UTF-8）** |
| 当前 `auto`（无 `--encoding`/env/`--json`） | **乱码（GBK）** |
| `--encoding utf8` / `OPENFEEL_ENCODING=utf8` / `--json` | **可读** |
| `--json` vs `--encoding gbk` | 逐字节相同（旁路成立） |
| `chcp 65001` | **无效**（不改变子进程 `chcp` 探测） |
| 结论 | stage-58 `auto` 对 UTF-8 管道**是回归**，方案 A 修正 |

## 变更摘要

> **2 op**，改动：`src/cli/output-encoding.ts`（行为 + 死代码）+ 单测 + i18n + 文档 + 版本收口 + 构建传播。

| op | 内容 | 涉及文件 |
|:--:|------|----------|
| **op-001** | 第⑤步改 `return 'utf8'`；删除 `detectConsoleCodepage`/`codepageToIconv`/`cachedCodepage`/`spawnSync`/`codepage?` 字段；单测改/删/增（回归断言 `win32+!isTTY+无显式 → utf8`）；i18n 帮助文案 | `src/cli/output-encoding.ts`、`test/cli/output-encoding.test.ts`、`src/core/i18n-data/{zh-CN,en}.ts` |
| **op-002** | 文档（manual/docs/README/CHANGELOG）+ 版本 1.1.2→1.1.3 收口（`package.json`/`package-lock.json`/`config.yaml`/`config.ts` 模板/agents-md 权威源）+ 构建 + 全门禁 + 阶段报告 + 新建 `roadmap/v1.1.3.md`、`plan/v1/v1.1.3/plan.md` | 见 `plan.md` §三/§九 |

## 关键裁定

- **死代码**：**删除**（非公开子路径、全仓零引用、避免死导出/死字段复发）。
- **版本**：`package.json` → **1.1.3**；CLI 无独立 `VERSION` 常量（`--version` 直读 `package.json`）。
- **测试**：删 2 describe、重写第⑤/auto 用例、新增 1 回归断言；**不加 platform-skipped 测试**（保 0 skipped）。
- **版本规划文档**：**新建**轻量 `v1.1.3` roadmap + 大计划（不追加进已发布的 v1.1.2 计划）。

## 边界（不可越界）

- 不改 `--json` 旁路与 5 步优先序；**行为变更仅限第⑤步默认目标编码**。
- 不改其它命令行为、不新增依赖、不动 CI workflow、不改 `bin/openfeel.js` 安装链路。
- 不改 `.opencode/**`；不改 `flow.json`（Feel 推进）。
- **不执行 `npm publish`、不 `git push`**。

## 完成标准

- [ ] `resolveTargetEncoding({platform:'win32', isTTY:false, argv:[], env:{}})` → `'utf8'`；`--encoding gbk` → `'gbk'`。
- [ ] 源码无 `detectConsoleCodepage`/`codepageToIconv`/`cachedCodepage`/`spawnSync`/`codepage`；`tsc` 0。
- [ ] `npm run build` 成功且 `.opencode/**` 不复活；`npm test` 全绿（0 skipped）。
- [ ] `lint i18n` 730 键、`lint kb` 0；`--version` == `package.json.version` == `1.1.3`。
- [ ] manual / `docs/commands.md` / README×2 / CHANGELOG `[1.1.3]` 与实现一致。
- [ ] win32 本地实测：无显式编码时 `node bin/openfeel.js flow current` 为合法 UTF-8 中文可读。

> 详细操作方案见 `plan.md` 与 `ops/`（op 文件由 openfeel-schemer 产出）。