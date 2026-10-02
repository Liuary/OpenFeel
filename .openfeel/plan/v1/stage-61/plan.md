# v1.1.3-stage-61 计划 — CLI 输出编码 `auto` 语义修正（方案 A）

- **阶段**：`v1.1.3-stage-61`
- **依赖**：`hard: v1.1.2-stage-60`（已登记于 `flow.json`；stage-60 已归档）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-02
- **定位**：修正 stage-58 引入的**回归**——`resolveTargetEncoding` 第⑤步在 `win32 && !isTTY` 时按 `chcp` 探测映射为 **GBK**，导致在**UTF-8 管道消费者**（本 harness / IDE / CI）下输出乱码。**方案 A（用户裁定）**：第⑤步直接返回 `'utf8'`，对齐 Node 默认与管道/CI 消费者；GBK 仅经**显式** `--encoding gbk` 或 `OPENFEEL_ENCODING=gbk` 生效。
- **范围**：`src/cli/output-encoding.ts`（行为 + 死代码）+ 单测 + i18n 帮助文案 + manual/docs/README/CHANGELOG + 版本号收口 + 构建传播。
- **边界**：不改 `--json` 旁路与优先序；不改其它命令行为；不新增依赖；不动 CI workflow；不 `npm publish`；不 `git push`；不改 `flow.json`（由 Feel 推进）；不改 `.opencode/**`；**行为变更仅限第⑤步的默认目标编码**。

## KB 检索（`openfeel-check-kb`）

- 已加载 `openfeel-check-kb`。**高度相关条目**：
  - `kb/patterns.md #死导出/漂移 API 的清理判据`（三判据：全仓零引用 + 值/状态漂移 + 经 exports 对外暴露；处置删除而非同步）→ 直接支撑**死代码删除**裁定。
  - `kb/patterns.md #输出版码单一咽喉模式（bin 包装 stdout/stderr.write + --json 恒 UTF-8 旁路）`、`#库侧默认 no-op + 进程入口 install 隔离（不设 VITEST 守卫）` → 本次**不改**安装/隔离链路。
  - `kb/patterns.md #版本号全链路收口清单模式（A/B/C/D/E 五类）` → 版本收口逐类核对。
  - `kb/troubleshooting.md #Node 无内建 GBK 编码（必须 iconv-lite）`、`#默认开启写真实用户目录的副作用防护` → 测试隔离仍须 `OPENFEEL_LOG=0` + HOME 隔离。
- **无「chcp 依赖为回归」专门条目** → 本阶段归档时由归档官补沉一条 troubleshooting（auto 对 UTF-8 管道是回归）。

---

## 一、背景与实测证据（唯一事实基准）

| 事实 | 实测 |
|------|------|
| 现状第⑤步 | `src/cli/output-encoding.ts:154-156`——`win32 && !isTTY` 时 `detectConsoleCodepage()`（`chcp`）→ `codepageToIconv(cp)`；本机 cp936 → **gbk** |
| pre-stage-58 bin（`git show ae79c4e^:bin/openfeel.js`，无 `installOutputEncoding`） | `flow current` **中文可读（UTF-8）** |
| 当前 `auto`（无 `--encoding`/env/`--json`） | **乱码（GBK 字节被按 UTF-8 解码）** |
| `--encoding utf8` / `OPENFEEL_ENCODING=utf8` / `--json` | **可读** |
| `--json` vs `--encoding gbk` | 逐字节相同（旁路成立） |
| `chcp 65001` | **无效**（不改变子进程 `chcp` 探测结果） |
| 结论 | stage-58 的 `auto` 对 **UTF-8 管道消费者是回归**；方案 A 修正之 |

**唯一瓶颈**：第⑤步的默认兜底目标编码。①`--json`、②显式 `--encoding`、③`OPENFEEL_ENCODING`、④非 win32/TTY → utf8、`utf8` 目标不包装、库侧 no-op、幂等安装 **全部保持不变**。

---

## 二、目标语义（改后 5 步优先序）

| # | 条件 | 结果 | 变化 |
|:-:|------|------|:--:|
| ① | `argv` 含 `--json` | `'utf8'`（最高优先，机器合同） | 不变 |
| ② | 显式 `--encoding <v>` | 归一化 v（`gbk` 在此显式生效） | 不变 |
| ③ | `OPENFEEL_ENCODING` | 归一化 v（`gbk` 在此显式生效） | 不变 |
| ④ | `platform !== 'win32'` **或** `isTTY` | `'utf8'` | 不变 |
| ⑤ | `win32 && !isTTY` | **`'utf8'`**（对齐 Node 默认与管道/CI 消费者） | **改（原：chcp→gbk）** |

- **保留 5 步结构**（不合并 ④/⑤）：行为变更局部化于第⑤步，优先序梯队语义与既有文档一致，最小 diff。
- **GBK 仅显式生效**：`--encoding gbk`（②）或 `OPENFEEL_ENCODING=gbk`（③）；不再有隐式代码页推断。

---

## 三、变更点清单（编号 T）

### T1 — 源码行为变更 + 死代码删除（`src/cli/output-encoding.ts`）

| # | 位置 | 现状 → 改后 |
|:-:|------|-------------|
| T1.1 | `:16` | `import { spawnSync } from 'node:child_process';` → **删除**（失去使用点） |
| T1.2 | `:45-46` | `let cachedCodepage: number \| null \| undefined;` → **删除** |
| T1.3 | `:32-33` | `ResolveTargetEncodingContext.codepage?: number \| null` 字段（含注释）→ **删除**（注入点随第⑤步消失，保留即死字段） |
| T1.4 | `:86-104` | `export function codepageToIconv(cp)` → **删除**（含 `export`） |
| T1.5 | `:106-127` | `export function detectConsoleCodepage()` → **删除**（含 `export`） |
| T1.6 | `:154-156` | 第⑤步体 → `return 'utf8';` + 一行中文注释（对齐 Node 默认 / 管道 CI 消费者；GBK 仅显式） |
| T1.7 | `:1-15` | 模块头部注释：删「解决 Windows 传统 CJK 代码页（非 TTY/管道）下的乱码」表述，改为「win32 非 TTY 默认 UTF-8；GBK 仅显式」 |
| T1.8 | `:129-133` | `resolveTargetEncoding` JSDoc 优先序更新第⑤步描述 |

**保留不动**：`OutputEncoding`、`normalizeEncoding`、`ENCODING_ALIASES`、`readEncodingArg`、`wrapStream`、`installOutputEncoding`、`installed` 幂等标志。

### T2 — 测试面（`test/cli/output-encoding.test.ts`）

> 全仓 `rg` 复核：`detectConsoleCodepage` / `codepageToIconv` / `cachedCodepage` 仅出现在本测试文件与源码本身；无其它测试引用 chcp/codepage。

| # | 用例 | 处置 |
|:-:|------|------|
| T2.1 | `:13-17` import | 移除 `codepageToIconv` |
| T2.2 | `:62-71` ① `--json`（含 `codepage: 936`） | 删 `codepage` 属性；断言 `utf8` 不变 |
| T2.3 | `:93-97` ④ `win32 + TTY`（含 `codepage`） | 删 `codepage` 属性；断言 `utf8` 不变 |
| T2.4 | `:99-110` ⑤「codepage 映射」 | **重写**为回归断言：`{platform:'win32', isTTY:false, argv:[], env:{}}` → **`'utf8'`**（无 `--json`/`--encoding`/env）。不再注入 codepage |
| T2.5 | `:112-123` `--encoding auto` 回退到 codepage | **重写**：`auto`/未知 → 回退至第④/⑤步；`win32 非 TTY` → `utf8`；非 win32 → `utf8` |
| T2.6 | `:84-87` ③ env 别名 | 不变（`gb2312→gbk`） |
| T2.7 | `:149-159` `describe('codepageToIconv')` | **整块删除**（函数已删） |
| T2.8 | `:161-167` `describe('detectConsoleCodepage')` | **整块删除**（函数已删） |
| T2.9 | `:258-269` C-1 冲突（含 `codepage: 936`） | 删 `codepage` 属性；断言 `utf8` 不变 |
| T2.10 | `installOutputEncoding` 用例组（`:169-249`） | 不变（走 `OPENFEEL_ENCODING` 显式） |
| T2.11 | E-2 spawn E2E（`:272-352`） | **不变**：E-2① 正控用显式 `OPENFEEL_ENCODING=gbk`；E-2② `--json`+gbk env；E-2③ utf8 env —— 均与第⑤步无关，仍证明 install 转码链真实运行 |
| T2.12 | `test/cli/repl.test.ts:25` | **保持不变**（已显式 `OPENFEEL_ENCODING:'utf8'`；修复后虽非必要，保留以求确定性、不依赖实现细节） |

**新增回归断言（T2.4）语义锁定**：`platform=win32, isTTY=false, argv=[], env={}`（对应 cp936 机器实况）→ `'utf8'`；并保留 `--encoding gbk` 显式 → `'gbk'`（T2.2/②组）。

**不新增 platform-skipped 测试**：win32-only 的 spawn 用例在 Linux CI 会 skip，破坏「0 skipped」门禁；改以**纯函数回归**（跨平台决定性）+ **win32 本地实测**（§五验收 10）双重覆盖，避免恒绿又保 0 skipped。

### T3 — 文档面

| # | 文件 | 改动 |
|:-:|------|------|
| T3.1 | `.openfeel/manual/cli/output-encoding.md` | ① 职责段删「按 chcp 转码」；② API 表删 `codepageToIconv`/`detectConsoleCodepage` 两行、`ResolveTargetEncodingContext` 删 `codepage?`；③ `auto` 5 步表第⑤步改 `'utf8'`；④ **删「代码页 → iconv 映射」表 + `chcp` 探测段**；⑤ 补「GBK 仅显式」说明；⑥ 变更历史加 `v1.1.3-stage-61` 行 |
| T3.2 | `docs/commands.md` | `:3` 快照版本 `v1.1.2` → `v1.1.3`（更新日期）；`:16` `--encoding` 说明；`:21` 「输出编码自适应」段落改为：`auto` 在 Windows 非 TTY 直通 UTF-8（管道/CI 友好），GBK 需显式；`--json` 恒 UTF-8 |
| T3.3 | `README.zh-CN.md:59` | 「Windows 非 TTY 下按 chcp 自动转码」→「Windows 非 TTY 直通 UTF-8；GBK 需 `--encoding gbk`/`OPENFEEL_ENCODING` 显式」 |
| T3.4 | `README.en.md:59` | 同步英文表述 |
| T3.5 | `CHANGELOG.md` | 新增 `## [1.1.3] - 2026-10-02` 的 `### Fixed`：`auto` 对 UTF-8 管道消费者是回归——win32 非 TTY 改为直通 UTF-8，GBK 仅显式生效；删除 `chcp` 探测与代码页映射死代码 |

### T4 — i18n 帮助文案（`--help` 内联）

| # | 文件 | 改动 |
|:-:|------|------|
| T4.1 | `src/core/i18n-data/zh-CN.ts:566` | `global.encoding` zh 文案删「Windows 非 TTY 下按 chcp 自适应」→「Windows 非 TTY 直通 UTF-8；GBK 需显式；--json 恒 UTF-8」 |
| T4.2 | `src/core/i18n-data/en.ts:540` | en 文案同步（en 非空、zh 为空，保持对称键） |

> 键数不变（730），仅改文案 → `lint i18n` 须仍 730 / 双语句对非空。

### T5 — 版本面（`package.json` 1.1.2 → **1.1.3**）

> 依据 `kb/patterns.md #版本号全链路收口清单模式`（A 手工载体 / B 生成段 / C 传播 / D 禁改 / E 无载体）。

| 类 | 文件:行 | 现值 → 期望 | 备注 |
|:--:|---------|-------------|------|
| **A** | `package.json:3` | `1.1.2` → `1.1.3` | 版本权威源 |
| **A** | `package-lock.json:3`、`:9` | `1.1.2` → `1.1.3` | root 两处**手工同步**；**禁 `npm install` 重生成**（零依赖树变动） |
| **A** | `.openfeel/config.yaml:7` | `1.1.2` → `1.1.3` | **非 UTF-8 展示**，仅单行增量替换，禁止整文件重写 |
| **A** | `src/core/config.ts:365`（zh 模板）/ `:422`（en 模板） | `1.1.2` → `1.1.3` | `CONFIG_TEMPLATE_ZH` / `_EN`（按内容判定，非行号） |
| **A** | `src/core/templates-data/agents-md/zh-CN.md:134`、`en.md:134` | 「当前 v1.1.2」→「当前 v1.1.3」 | 权威源；build 传播至生成段 |
| **B** | `src/core/template-loader.ts` 生成段（`:2862`/`:3371` 等） | **禁手改**，由 `npm run build` 从 A 类权威源重生成 | |
| **C** | `CHANGELOG.md` | 追加 `## [1.1.3]` | 见 T3.5 |
| **D** | `src/**` 历史批注（`v1.1.2-stage-*` 示例）、依赖自身版本、`manual` 变更历史、`test/**` 注释 | **禁改**（历史沿革，非当前版本载体） | |
| **E** | `README*` / `docs/**` | 无版本号载体（仅 `docs/commands.md:3` 快照标注，见 T3.2） | |

- **CLI `VERSION` 常量：不存在**——`src/cli/index.ts:15` 直接 `require('../../package.json').version`；`test/core/release-metadata.test.ts` 已断言 `dist/index.js` 无 `VERSION` 导出。**无需同步**。
- **CI 门禁**：`CI_VERSION=$(node bin/openfeel.js --version)` **必须 == `package.json.version`**（`.github/workflows/ci.yml:23-29`）；因 CLI 读 `package.json`，只需改 `package.json` 即自洽。
- **`openfeel-cli-usage` skill 快照（「v1.1.2 快照」）：不改**——1.1.3 无命令面新增/变更，快照标注的是「能力集定型版本」而非「当前框架版本」；编码非该 skill 覆盖内容。**显式登记为「不涉及」**。

### T6 — 构建传播

| # | 动作 | 期望 |
|:-:|------|------|
| T6.1 | `npm run build` | 成功；`dist/` 更新（`dist/cli/output-encoding.js` 无死代码） |
| T6.2 | `git status` | **不复活 `.opencode/{agents,skills,ADAPTER.md}`**（stage-55 已删自举步骤 8；仅运行时 `node_modules`/`package*.json` 保留） |
| T6.3 | 生成段 | `template-loader.ts` 随 agents-md 权威源重生成；`update.ts`/template-loader 内嵌 skill 不变 |

---

## 四、op 划分与执行顺序（**2 op**）

| op | 主题 | 覆盖 | 关键产出 | 依赖 |
|:--:|------|------|----------|------|
| **op-001** | **行为修正 + 死代码清理 + 测试 + i18n** | T1 + T2 + T4 | `output-encoding.ts` 第⑤步改 utf8 + 删死代码；`output-encoding.test.ts` 改/删/增；i18n 帮助文案；`npm run build` + `tsc` + `npm test` | — |
| **op-002** | **文档 + 版本收口 + 门禁 + 阶段报告** | T3 + T5 + T6 | manual/docs/README/CHANGELOG；`package.json`/`package-lock.json`/`config.yaml`/`config.ts`/agents-md 版本收口；`.openfeel/roadmap/v1.1.3.md` + `.openfeel/plan/v1/v1.1.3/plan.md`（轻量，§九）；全门禁实跑；阶段报告 | **hard: op-001** |

**顺序：`op-001 → op-002`。** op-002 依赖 op-001 的构建产物与实测结果做收口。

**边界声明**：全程不 `npm publish`、不 `git push`、不改 `flow.json`、不动 CI workflow、不新增依赖、不改 `.opencode/**`、不创建其它命令行为变更、不改 `--json` 旁路与优先序。

---

## 五、验收标准（阶段级）

1. **行为**：`resolveTargetEncoding({platform:'win32', isTTY:false, argv:[], env:{}})` → **`'utf8'`**（回归断言，对应 cp936 机器实况）。
2. **显式 GBK 仍生效**：同上下文 `--encoding gbk` → `'gbk'`；`OPENFEEL_ENCODING=gbk` → `'gbk'`。
3. **旁路不变**：`--json` 覆盖一切 → `utf8`；非 win32 / TTY → `utf8`。
4. **死代码清零**：源码无 `detectConsoleCodepage` / `codepageToIconv` / `cachedCodepage` / `spawnSync` / `codepage` 字段（`rg` 全仓 0 命中 + `tsc` 通过）。
5. **构建**：`npm run build` 成功；`git status` 对 `.opencode/{agents,skills}` 零复活。
6. **类型**：`npx tsc --noEmit` = **0**。
7. **测试**：`npm test` 全绿；基线 **61 文件 / 1018 用例 / 0 skipped** → 删 2 it（T2.7/T2.8）+ 增回归用例，**预期 ~1017**（以实盘为准）；Linux CI 0 skipped。
8. **i18n**：`node bin/openfeel.js lint i18n` 键数 **730** 不变，双语句对非空，exit 0。
9. **KB**：`node bin/openfeel.js lint kb` = **0 过期**。
10. **win32 本地实测（决定性）**：无 `OPENFEEL_ENCODING`、无 `--json`/`--encoding` 下 `node bin/openfeel.js flow current`（管道捕获）→ stdout 为**合法 UTF-8** 且中文可读；`--encoding gbk` → GBK 字节（旧显式行为不变）。
11. **版本**：`node bin/openfeel.js --version` == `package.json.version` == **1.1.3**；`config.yaml` / `config.ts` 模板 / agents-md 权威源同步。
12. **文档**：manual / `docs/commands.md` / README×2 / CHANGELOG 与实现一致；`CHANGELOG` 含 `[1.1.3]`。

---

## 六、风险与回滚

| # | 风险 | 影响 | 缓解 / 回滚 |
|:-:|------|------|-------------|
| R-1 | 删 `codepage` 字段/函数后残留引用致 `tsc` 失败 | 中 | 删除前 `rg` 全仓复核（已知仅源码 + 本测试文件）；`tsc` 门禁兜底 |
| R-2 | **行为变更**：真正 GBK 控制台管道消费者默认由 GBK 变 UTF-8 | 中 | 属有意修正（对齐 Node/CI）；CHANGELOG `Fixed` + README/manual 明示「GBK 需显式」；保留 ②/③ 显式逃生阀 |
| R-3 | 版本收口遗漏载体（`config.ts`/agents-md/`package-lock`） | 低 | 依 KB 五类清单逐条收口；CI `--version` 门禁覆盖核心；op-002 独立复核 |
| R-4 | `docs/commands.md:3` 快照版本与 skill 快照不一致 | 低 | 明确 skill 快照为「能力集版本」不改（T5 备注）；docs 快照更新为 1.1.3 |
| R-5 | 测试面遗漏 chcp 注入点 | 低 | 已 `rg` 确认仅 `output-encoding.test.ts`；全仓无其它 chcp 引用 |
| R-6 | `.openfeel/config.yaml` 非 UTF-8 展示被整文件重写损坏 | 中 | **仅单行增量 `edit`**，禁 `write` 整文件 |
| R-7 | 新增 win32-only E2E 引入 skip（破坏 0 skipped） | 低 | 不加 platform-skipped 测试；纯函数回归 + 本地实测双覆盖（T2 说明） |
| R-8 | build 因文案改动触发校验失败 | 低 | i18n 键数不变、双语非空；build 前先 `lint i18n` |

**回滚**：改动集中于单模块 + 测试 + 文档 + 版本行；`git revert <sha>` 即可；无数据迁移、无依赖树变动、无全局写操作。

---

## 七、边界（不做）

1. 不改 `--json` 旁路与 5 步优先序（除第⑤步默认值）。
2. 不改其它命令行为、不改 `bin/openfeel.js` 安装链路、不改库侧 no-op / 幂等语义。
3. 不新增依赖、不动 `build.js`、不动 `.github/workflows/ci.yml`。
4. 不 `npm publish`、不 `git push`、不改 `flow.json`（Feel 推进）。
5. 不改 `.opencode/**`（构建产物）；不改历史批注/依赖自身版本（D 类）。
6. 不改 `openfeel-cli-usage` skill 快照版本（无命令面变更）。
7. 不创建除本阶段外的 op 文件（由 openfeel-schemer 产出）。

---

## 八、裁定项（本阶段需明确结论）

| # | 议题 | **结论** | 依据 |
|:-:|------|----------|------|
| **D1** | 死代码处置 | **删除** `detectConsoleCodepage`、`codepageToIconv`、`cachedCodepage`、`spawnSync` 导入、`codepage?` 字段（含 `export`） | 改后全仓零引用；`dist/cli/output-encoding.js` **非公开子路径**（`exports` 仅 `"."→dist/index.js`）→ 无外部契约；KB「死导出/漂移 API 清理判据」倾向删除而非同步；保留即「死导出/死键/死字段」复发源。测试删改面可控（-2 describe） |
| **D2** | 测试面 | 见 T2：删 2 个 describe；重写第⑤/auto 用例；新增「win32 非 TTY 无显式 → utf8」回归；**不新增 platform-skipped 测试** | 跨平台 0 skipped 门禁 + 防恒绿；纯函数回归跨平台决定性 |
| **D3** | 文档面 | manual + docs/commands + README×2 + CHANGELOG（T3）；i18n 帮助文案（T4） | 保持文档-实现一致 |
| **D4** | 版本 | `package.json` → **1.1.3**；载体见 T5；CLI `VERSION` 常量**不存在**无需同步 | KB 版本收口清单；CI `--version==package.json` 自洽 |
| **D5** | 构建传播 | `npm run build` 后 dist 更新；确认 `.opencode/**` 不复活 | stage-55 已删自举步骤 8 |
| **D6** | 版本规划文档 | **新建**轻量 `.openfeel/roadmap/v1.1.3.md` + `.openfeel/plan/v1/v1.1.3/plan.md`（大计划），**不**追加进已归档/已发布的 v1.1.2 计划 | stageId 已是 `v1.1.3-*`，版本语义独立；分层计划体系要求 roadmap + 大计划；单一补丁阶段保持轻量 |

---

## 九、版本规划文档（`v1.1.3`）落点

- **已由本计划（openfeel-planner）先行产出**（roadmap + 大计划属 planner 职责）：
  - `.openfeel/roadmap/v1.1.3.md`：目标（修正 auto 编码回归）+ 阶段划分（仅 `v1.1.3-stage-61`）+ 里程碑（M17）+ 依赖（hard: stage-60）+ 待 push/发布说明。**轻量**（单阶段）。
  - `.openfeel/plan/v1/v1.1.3/plan.md`：大计划（目标 / 背景 / 版本收口清单 / 阶段概览 / 边界）。
- **不追加进** `.openfeel/plan/v1/v1.1.2/plan.md`（该版本已发布收官，追加会混淆版本语义）。
- **op-002 仅复核**两文件与版本收口（`1.1.3`）一致；如收口值有变则同步。

---

## 十、修订记录

| 时间 | 制定人 | 版本 | 说明 |
|------|--------|------|------|
| 2026-10-02 | openfeel-planner | v1 | 初稿：方案 A（第⑤步 win32 非 TTY → utf8）；死代码删除裁定；T1~T6 变更清单；2 op（行为+测试 / 文档+版本收口）；验收 12 条；风险 8 条；裁定 D1~D6 |