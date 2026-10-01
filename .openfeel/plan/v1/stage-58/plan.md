# v1.1.2-stage-58 计划 — CLI 输出编码自适应 + 运行日志

- **阶段**：`v1.1.2-stage-58`
- **依赖**：`hard: v1.1.2-stage-57`（已登记；stage-57 完成后本阶段方可执行）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-02
- **定位**：CLI 输出层两项能力补齐——① **输出编码自适应**（Windows 传统 CJK 代码页下把人类可读文本转码为对应编码；`--json` 恒 UTF-8 机器合同）；② **运行日志**（`~/.openfeel/cli/logs/`，恒 UTF-8，默认开启，info/warn/error；debug 默认关）。
- **范围约束**：不改 `flow.json`；**不代 Feel 推送**；**不执行 `npm publish`**；不创建 op 文件（由 openfeel-schemer 产出）；不改 `.openfeel/log/**`（工作区审计）与 `flow.json.log[]`（状态审计）语义。
- **KB 检索**：已加载 `openfeel-check-kb`。**精确匹配无直接相关条目**（编码/运行日志为新增领域）。相关旁证：`kb/patterns.md #CLI --json 结构化输出约定`（`--json` 顶层对象 + `schemaVersion` + 无 ANSI/提示行、与人类输出互斥）、`#CLI 退出码语义`、`#全量审查的结论复核纪律`（命令+版本+环境三要素）、`#测试全局路径隔离模式（禁用保存/恢复伪隔离）`、`kb/architecture.md #跨进程并发保护架构：原子写 + 建议性文件锁`、`#全局路径单点 mock 隔离`（N4 收敛约定）、`kb/troubleshooting.md #B9 GBK 实测`（PowerShell 管道捕获 gb2312 失真属消费端）。**知识库暂未收录「CLI 输出编码适配」「进程运行日志」条目 → 本阶段完成后由归档官补沉淀。**

> **REV 修订复核（2026-10-02）**：隔离策略裁定（REV-001/004）依据 `kb/patterns.md #测试全局路径隔离模式（禁用保存/恢复伪隔离）`（必须靠测试自身 HOME/cwd 隔离，不得用「保存/恢复」或环境守卫代替）与 `#测试 cwd 隔离模式`。**新增知识库缺口**：KB 未收录「vitest 主进程设置 `process.env.VITEST="true"` 且 spawn 子进程继承」这一事实 → 归档官补沉淀（避免后续再以 VITEST 作隔离守卫）。

---

## 一、背景与实测基线（唯一事实基准）

### 1.1 输出层盘点

| 项 | 实测 |
|----|------|
| 统一输出封装 | **无**。全走 `console.*`（`log` 493 / `error` 156 / `warn` 41 处） |
| `process.stdout.write` 直调 | **零**（`src/` + `bin/` 零命中）→ 单一咽喉可行 |
| ANSI 转义 | **零命中**（当前 `shouldUseColor` 无着色实现，`NO_COLOR` 零可见效果） |
| `--json` 现状 | `console.log(JSON.stringify(...))`，位于 `src/commands/flow.ts:51,180,189,327,343,376,405,920,961,1471` + `instructions.ts:39`（REV-005.1：实测 `:39`；原写 `:19` 系 `--json` 选项注册行，非输出行） |
| `bin/openfeel.js` | **未设编码**；13 行；`:4` 导入 dist，`:8` `applyHelpI18n`，`:9-13` 分支 `startRepl`/`runCli` |
| `--no-color`/`shouldUseColor` | `src/cli/index.ts:23-47`（契约与未来保护，无着色实现） |
| 现有全局选项 | 仅 `-v/--version`、`--no-color`、`-h/--help`（`node bin/openfeel.js --help` 实测） |

### 1.2 运行日志盘点

| 项 | 实测 |
|----|------|
| CLI 运行日志 | **无**（无 `appendFileSync` / `createWriteStream` / `--log-file` / `~/.openfeel/cli/logs`） |
| `.openfeel/log/**`（`src/core/public-logger.ts`） | **工作区审计日志**——语义不同，不得混用 |
| `flow.json.log[]` | **状态审计**——语义不同，不得混用 |
| `update_infos.md` | **部署更新记录**——语义不同，不得混用 |
| 可复用基础设施 | `src/core/fs/atomic-write.ts:60` `atomicWriteFileSync`（默认 utf-8）；`src/core/fs/file-lock.ts:59/64/122` `projectLockPath`/`globalLockPath`/`withFileLock`；`src/core/global-paths.ts:14` `getHomedir`、`:49/64/69` 路径范式 |

### 1.3 编码技术实测（本机，Node ≥20）

| 实验 | 结果 |
|------|------|
| `new TextEncoder('gbk')` | **静默忽略**（仍 UTF-8），不可用 |
| `Buffer.transcode(...,'gbk')` | **抛错**，不可用 → **必须 iconv-lite** |
| `TextDecoder('gbk'/'gb18030')` | 可解码（仅解码，非本需求重点） |
| `iconv-lite` GBK 编码 | `中文⚠` → `d6d0 cec4 3f`（⚠ 降级为 `?`）；`中文` → `d6d0 cec4` ✅ |
| `chcp` 探测 | `spawnSync('chcp', [], {stdio:['ignore','pipe','ignore']})` 返回 Buffer `活动代码页: 936`；从 **latin1** 串提取数字 `936`（**勿按 UTF-8 解码整串**）✅ |
| `iconv-lite@0.7.2` | 已在依赖树（`@inquirer/prompts → @inquirer/editor → @inquirer/external-editor → iconv-lite@0.7.2`，**非 dev**）；`package-lock.json:2607` 已有条目，MIT，**ship 自带 `lib/index.d.ts`**（无需 @types） |

### 1.4 测试影响盘点

| 项 | 实测 |
|----|------|
| 测试规模基线 | **以 stage-58 开工时实盘校准**：stage-57 归档后运行 `npm test`，将实测「文件数 / 用例数」写入本表与 §六门禁，**不得沿用 985/986 预估值**（985 = stage-56 归档量；986 = stage-57 预估，stage-57 尚在规划中；当前 git 基线 `f178600` = stage-56 归档） |
| vitest 环境继承（REV-001 实测） | vitest 主进程设 `process.env.VITEST="true"`（`node_modules/vitest/dist/chunks/cli-api.DVe0nWUx.js:10546`），`spawnSync/spawn` 子进程以 `{...process.env}` **继承**该变量（repl.test.ts:25 即 `{...process.env, …}`） |
| 隔离策略（REV-001/004 裁定） | **不设 `VITEST` 守卫**。两个 install 仅由 `bin/openfeel.js` 调用；in-process 测试从不调用 install → 库侧默认 no-op（编码 target=utf8 不包装 / 日志 disabled）天然零污染。隔离由测试自身 cwd/HOME 隔离承担（`kb/patterns.md #测试全局路径隔离模式`、`#测试 cwd 隔离模式`）。若设守卫，spawn 子进程继承 `VITEST` → bin 层 install 短路 → E2E 恒绿零覆盖 |
| 唯一 spawn `bin/openfeel.js` 的用例 | `test/cli/repl.test.ts:13,21-26`（`join(REPO_ROOT,'bin','openfeel.js')` + `spawnSync` + `encoding:'utf-8'` + 断言 `再见`）→ **在 win32 且 stdout 被 pipe（非 TTY）时会被破坏**（auto→GBK，`再见` 按 utf-8 解码失败）；**POSIX/CI 不受影响**（`platform!=='win32'` → utf8）。E-4 传 `OPENFEEL_ENCODING:'utf8'`（+ `OPENFEEL_LOG:'0'`）使两端确定，是**必要修复**（非双保险） |
| 其它 spawn（4 文件，不经过 bin） | `test/core/backup.test.ts:187`、`test/core/flow-concurrent.test.ts:62`、`test/core/fs/file-lock.test.ts:109`、`test/core/fs/sequence.test.ts:97` 均 spawn worker/fixture 脚本，**不经过 bin**，不受影响 |
| `console.*` spy | 30 文件 / 69 处 spy / 67 断言——**均在进程内 spy console，从不调用 install，不受 bin 层打补丁影响** |
| 模板文本断言 | `test/core/templates.test.ts:18-19` 仅文本匹配 `node bin/openfeel.js`，**不 spawn**，不受影响 |
| `--verbose` | `flow.ts:43-46` 的 **stdout 增强**（不写文件），语义**保持不变**，与 debug 解耦 |

---

## 二、设计总览

### 2.1 单一咽喉（关键架构决策）

输出编码只在 **`bin/openfeel.js`**（进程入口）安装，**不放进 `src/cli/index.ts` 顶层**——因为 30 个测试文件 import `src/cli/index.ts`，顶层副作用会污染测试。`bin/` 是真正的一次性进程入口，天然隔离。

```
bin/openfeel.js
  ├─ installOutputEncoding()   ← op-001（包装 process.stdout/stderr.write，仅字符流转码）
  ├─ installRuntimeLog()       ← op-002（启用运行日志；默认 on，恒 UTF-8）
  ├─ applyHelpI18n(program)
  └─ startRepl(program) | runCli()
```

- **库/测试侧默认 no-op**：两个 install 未调用时，模块内部状态为「未安装」，`runCli`/`handleCliError` 内的 `runtimeLog()` 调用自动跳过。→ 30 个 import 测试零写盘。
- **生产默认开启**：`bin` 调用 install 后默认 on（满足用户裁定 2）。
- **隔离策略统一（REV-001/004 裁定：方案 b — 删除 `VITEST` 守卫）**：`installOutputEncoding` 与 `installRuntimeLog` **均不设 `process.env.VITEST` 守卫**。理由：① install 仅由 `bin/openfeel.js` 调用，in-process 测试**永不 install** → 「未安装即 no-op」已保证零污染，守卫对 in-process 无保护价值；② `VITEST` 会被 spawn 子进程继承（实测），守卫会把经 `bin` 的真实 CLI 子进程误判为测试进程 → E2E 恒绿零覆盖；③ 统一两个 install 的隔离范式（避免「编码不装、日志照装」的不对称）；④ 隔离由测试自身 cwd/HOME 隔离承担，符合 kb「禁用保存/恢复伪隔离」。**注意**：`installOutputEncoding` 因此**不再需要 `force` 选项**（无守卫可绕），`opts` 仅保留 `stdout?/stderr?` 注入（供单测）。

### 2.2 `auto` 规则（输出编码）

```
resolveTargetEncoding({ argv, env, platform, isTTY }):
  1. argv 含 `--json`                              → 'utf8'   // 机器合同，最高优先级
  2. argv 显式 `--encoding <v>`（或 `--encoding=v`）→ 归一化 v
  3. env `OPENFEEL_ENCODING`                       → 归一化
  4. platform !== 'win32' || isTTY                 → 'utf8'   // 现代终端/TTY 由控制台 API 直通
  5. win32 && !isTTY                               → chcp 探测 → codepage→iconv 映射；未知 → 'utf8'
```

- **为何 `isTTY` 直通 UTF-8**：Windows 控制台 TTY 下 Node 走宽字符（WriteConsoleW）路径，CJK 显示与 chcp 无关；**仅当 stdout 被重定向/管道（非 TTY）**时原始字节才由下游按 ANSI 代码页消费 → 此时才需转码。
- **codepage→iconv 映射**：`936→gbk`、`54936→gb18030`、`950→big5`、`932→cp932`、`949→cp949`、`65001→utf8`，其余 → `utf8`。
- **显式值域**：CLI `--encoding <utf8|gbk|auto>`（默认 `auto`）；env 接受 `utf8|utf-8|gbk|gb2312|gb18030|big5|shift_jis|cp932|euc-kr|cp949` 等别名，未知 → 回退 `auto`。
- **逐流判定**：stdout / stderr 各自按本流 `isTTY` 判定（chcp 结果进程内缓存一次）。
- **转码仅作用于字符流**：`typeof chunk === 'string'` → iconv 编码为 Buffer 后写回；Buffer/二进制**直通**；保留 `callback` 与返回值。
- **仅支持 UTF-8 字符串语义（REV-003）**：`typeof chunk === 'string'` 分支**丢弃调用方传入的 `encoding`**（如 `write(str, 'latin1', cb)` 会按 UTF-8 语义先转 GBK，结果失真）。实测全仓 `process.stdout/stderr.write` 直调 = 0、`console.*` 均不传 encoding → 现实风险 ≈0。**不新增处理逻辑**（避免过度设计），仅在 A-3 实现处加注释 + `manual/cli/output-encoding.md`（F-1）明示「仅支持默认（UTF-8）字符串语义写入；非默认 encoding 的直接 write 不受支持」。
- **不可编码字符**：iconv-lite 默认降级为 `?`（实测 ⚠→0x3f）；**不额外告警**（避免日志噪声 + 编码递归），在 manual 中写明。
- **与 `NO_COLOR`/`--no-color` 解耦**：二者互不影响（当前无着色实现）。

### 2.3 `--json` 恒 UTF-8 旁路（C）

在 `resolveTargetEncoding` 的第 1 步：`argv.includes('--json')` → 直接返回 `'utf8'`，**先于显式 `--encoding` 与 `OPENFEEL_ENCODING`**。理由：`--json` 是机器可读单文档合同（`kb/patterns.md #CLI --json 结构化输出约定`），消费端按 UTF-8 `JSON.parse`；若被转成 GBK 则中文/emoji 失真。`--json` 走 stdout，不写文件。

### 2.4 运行日志设计（B）

| 维度 | 结论 |
|------|------|
| 路径 | `~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log`（按日一文件） |
| 编码 | **恒 UTF-8**（`appendFileSync(..., {encoding:'utf-8'})`，与 console 编码**完全解耦**） |
| 行格式 | `[ISO时间][LEVEL][pid] message`（例 `[2026-10-02T01:23:45.678Z][INFO][12345] cli start: flow status`） |
| 级别 | `info`/`warn`/`error` **默认记录**；`debug` **默认关**（`--debug` 或 `OPENFEEL_DEBUG=1` 开启） |
| 开关 | 默认 **on**；`--no-log` 或 `OPENFEEL_LOG=0`/`OPENFEEL_NO_LOG=1` 关闭 |
| 路径覆盖 | `--log-file <path>` 或 `OPENFEEL_LOG_FILE` |
| 并发 | `withFileLock(globalLockPath('runtime-log'), () => appendFileSync(...))`（跨进程安全；锁路径 `~/.openfeel/locks/runtime-log.lock`） |
| 失败语义 | **best-effort**：写日志任何异常均吞掉，**绝不中断 CLI** |
| 接入点 | `runCli` 记「命令（argv）+ 结果（exitCode）」；`handleCliError` 记「错误」 |
| stdout 摘要 | **不记录**（隐私/体积裁定）；仅 argv + 状态 + 错误消息 |
| 轮转/清理 | **最小可行**：按日一文件，**不自动清理**（不做大小轮转、不做保留天数） |

**三者边界（须写入 manual）**：
- `~/.openfeel/cli/logs/*.log` = **CLI 进程运行日志**（跨项目、诊断用，本阶段新增）。
- `.openfeel/log/**` = **项目工作区审计日志**（public-logger，团队级重要事件）。
- `flow.json.log[]` = **流水线状态审计**（阶段推进/注册等结构化事件）。
- `update_infos.md` = **部署更新记录**。

---

## 三、工作项（A~F 编号化）

### A — 输出编码自适应

| 编号 | 目标 | 精确改动点（文件:行号 → 现状 → 改后） | 影响文件 | 验收要点 |
|:--:|------|------------------------------------|----------|----------|
| **A-1** | 新增编码模块（纯逻辑可测） | **新建** `src/cli/output-encoding.ts`：导出 `OutputEncoding`、`resolveTargetEncoding(ctx)`（纯函数，注入 `argv/env/platform/isTTY`）、`detectConsoleCodepage()`、`codepageToIconv(cp)`、`installOutputEncoding(opts?)`；**无 `VITEST` 守卫**（REV-001 裁定方案 b）：安装幂等（内部 `installed` 标志），`opts` 仅含 `stdout?/stderr?` 注入；target=`utf8` 时**不包装** | 新增文件 | 模块可被 `test/cli/output-encoding.test.ts` 直接 import；无顶层副作用；**不含 `process.env.VITEST` 分支**（E-1 静态断言） |
| **A-2** | `auto` 规则 + chcp 探测 | 同文件内：按 §2.2 顺序实现；`detectConsoleCodepage` 用 `spawnSync('chcp', [], {stdio:['ignore','pipe','ignore'], windowsHide:true})`，从 `stdout.toString('latin1')` 提取 `/`(\d+)/`；失败/无匹配 → `utf8`；结果进程内缓存 | 同上 | 分支单测覆盖：非 win32、win32+TTY、win32+非TTY+cp936→gbk、cp950→big5、cp65001→utf8、未知→utf8 |
| **A-3** | 包装 stdout/stderr | `installOutputEncoding(opts?: {stdout?, stderr?})`（**无 `force`**，REV-001）：保存 `orig = stream.write`；替换为 `function(chunk, encoding, cb){ if (typeof chunk === 'string') { const buf = iconv.encode(chunk, target); const callback = typeof encoding === 'function' ? encoding : cb; return orig.call(this, buf, callback); } return orig.call(this, chunk, encoding, cb); }`；逐流按 `stream.isTTY` 独立解析 target | 同上 | 字符串→目标编码字节；Buffer→**逐字节直通**；`write(str, cb)` 回调保留；`write(str, enc, cb)` 回调保留。**注释须写明（REV-003）**：仅支持 UTF-8 字符串语义，string 分支丢弃非默认 `encoding`，非默认 encoding 的直接 write 不受支持 |
| **A-4** | `bin` 安装 | `bin/openfeel.js:4` 之后新增 `import { installOutputEncoding } from '../dist/cli/output-encoding.js';`；`:8` `applyHelpI18n` **之前**调用 `installOutputEncoding();` | `bin/openfeel.js` | 子进程 `node bin/openfeel.js` 生效；dist 构建后可导入 |
| **A-5** | 全局选项 `--encoding` | `src/cli/index.ts:19-24` 在 `.option('--no-color', …)` 后追加 `.option('--encoding <encoding>', t('help.global.encoding', getCliLang(process.cwd())), 'auto')`（与 noColor 同风格）；安装逻辑**从 argv/env 读取**（pre-parse），选项本身供 `--help` + 防 commander 未知选项报错 | `src/cli/index.ts`、`i18n-data/{zh-CN,en}.ts` | `--help` 显示该选项；`--encoding gbk`/`=gbk`/env 均生效；未知值不崩溃 |
| **A-6** | i18n 键 | `src/core/i18n-data/zh-CN.ts`（help 域 `~:565` `global.noColor` 附近）与 `en.ts`（`~:539`）各加 `'global.encoding': { key:'help.global.encoding', zh:'…', en:'' }` / `{…, zh:'', en:'…'}` | i18n 两文件 | `lint i18n` 键数 726 → +N，双语对称非空 |
| **A-7** | 降级策略 | iconv-lite 默认 `?` 替换；不告警 | 同上 | 单测断言 `中文⚠` → `d6d0 cec4 3f` |

### C — `--json` 恒 UTF-8

| 编号 | 目标 | 精确改动点 | 影响文件 | 验收要点 |
|:--:|------|-----------|----------|----------|
| **C-1** | 旁路实现 | `resolveTargetEncoding` 第 1 步：`if (argv.includes('--json')) return 'utf8';`（优先于 `--encoding`/env） | `src/cli/output-encoding.ts` | 单测：`['--json']` + `--encoding gbk` + `OPENFEEL_ENCODING=gbk` → 仍 `utf8` |
| **C-2** | 端到端验收 | spawn `node bin/openfeel.js flow phases --json`，cwd=临时目录、HOME 隔离、`OPENFEEL_ENCODING=gbk`；以 **Buffer** 捕获 stdout | `test/cli/output-encoding.test.ts` | 输出字节为**合法 UTF-8**；`JSON.parse` 成功；`schemaVersion===1`。**注意（诚实标注）**：`flow phases --json` 输出全为 ASCII（phase 名/键名），GBK 转码对其字节无影响 → 本条**不能单独证明 `--json` 旁路**；`--json` 旁路的权威证明在 **C-1 单元**（纯函数含 `--encoding gbk`+env gbk 仍返回 utf8）。**E-2 另加正控**（非 json CJK 命令 + GBK → 断言确为 GBK 字节）以证明 install 真实运行、消除 REV-001 的恒绿风险 |
| **C-3** | 不写文件 | `--json` 仅走 stdout，不经运行日志落盘 | — | `--json` 运行后 `~/.openfeel/cli/logs/` **无输出内容副本**（仅常规运行日志条目） |

### B — 运行日志

| 编号 | 目标 | 精确改动点（文件:行号 → 现状 → 改后） | 影响文件 | 验收要点 |
|:--:|------|------------------------------------|----------|----------|
| **B-1** | 新增日志目录路径 | `src/core/global-paths.ts:83-86`（`getGlobalBackupRootPath` 之后）新增 `getCliLogsDir(): string { return join(homedir(), '.openfeel', 'cli', 'logs'); }` | `src/core/global-paths.ts` | 返回 `~/.openfeel/cli/logs`；`vi.mock('node:os')` 可达 |
| **B-2** | 新增运行日志模块 | **新建** `src/core/runtime-log.ts`：`RuntimeLogLevel`、`resolveRuntimeLogConfig(env, argv)`（纯）、`installRuntimeLog(opts?)`（幂等，**无 `VITEST` 守卫**，与 A-1 统一，REV-004）、`runtimeLog(level, msg)`、`getRuntimeLogPath()`；模块内部默认 **disabled**，`installRuntimeLog` 默认 `enabled=true`；`runtimeLog` 在 disabled / 级别不足时 no-op | 新增文件 | 单测可注入 env/argv；未安装时零副作用；不含 `VITEST` 分支 |
| **B-3** | 落盘实现 | 同文件：`mkdirSync(dirname(file),{recursive:true})` → `withFileLock(globalLockPath('runtime-log'), () => appendFileSync(file, line, {encoding:'utf-8'}))`；行 `[ISO][LEVEL][pid] msg\n`；路径 `join(getCliLogsDir(), 'openfeel-'+yyyy-mm-dd+'.log')`；**try/catch 吞异常** | 同上 | UTF-8 字节断言（中文不回读乱码）；行格式正则；级别过滤（debug 默认不出） |
| **B-4** | 全局选项 | `src/cli/index.ts:19-24` 追加 `.option('--log-file <path>', t('help.global.logFile', …))`、`.option('--no-log', t('help.global.noLog', …))`、`.option('--debug', t('help.global.debug', …))` | `src/cli/index.ts`、i18n 两文件 | `--help` 显示三选项；`--no-log` 关闭；`--log-file` 覆盖；`--debug` 开 debug |
| **B-5** | `bin` 启用 | `bin/openfeel.js` 新增 `import { installRuntimeLog } from '../dist/core/runtime-log.js';`；`installOutputEncoding()` 之后调用 `installRuntimeLog();` | `bin/openfeel.js` | 子进程默认产生日志文件；`OPENFEEL_LOG=0` 时不产生 |
| **B-6** | 接入 `runCli`/`handleCliError` | `src/cli/index.ts:173-178` `handleCliError`：`runtimeLog('error', …)` 后抛错/处理；`:181-187` `runCli`：`program.parse()` 前 `runtimeLog('info','cli start: '+process.argv.slice(2).join(' '))`，正常返回后 `runtimeLog('info','cli done exit='+(process.exitCode ?? 0))`。**不记录 stdout 内容**。**error 边界（REV-002，实测 `:181-187`）**：commander 解析期错误（未知命令/未知选项/缺参）走 `program.error()` → stderr + `process.exit(1)`，**不抛异常、不经 `runCli` try/catch → 不记 error 日志**；`--help`/`--version` 输出后直接 exit，故「cli done」亦不记。**裁定：仅文档化，不引入 `program.exitOverride()`**（过度设计；用户裁定 2 仅要求记录 info/warn/error，未要求覆盖解析期错误）。error 级语义 = 「命令处理中抛出的异常」 | `src/cli/index.ts` | 未安装时测试零写盘；已安装时命令/结果/错误入日志；B-6 注释 + B-8 manual 均写明上述边界 |
| **B-7** | 级别/开关语义 | `--debug`/`OPENFEEL_DEBUG=1` → minLevel=debug；`--no-log`/`OPENFEEL_LOG=0`/`OPENFEEL_NO_LOG=1` → disabled；`--log-file`/`OPENFEEL_LOG_FILE` → 覆盖路径；默认 minLevel=info | 同上 | 单测覆盖各分支 |
| **B-8** | 边界文档 | 新建 `.openfeel/manual/core/runtime-log.md`，写明四类日志边界（§2.4）、格式、级别、开关、不自动清理，并**注明 error 边界（REV-002）**：解析期错误（未知命令/选项/缺参）经 `program.error()` 直接 exit，不入日志；error = 命令处理中抛出的异常 | manual | 边界清晰，无混用表述 |

### D — 依赖变更

| 编号 | 目标 | 精确改动点 | 影响文件 | 验收要点 |
|:--:|------|-----------|----------|----------|
| **D-1** | 提升为直接依赖 | `package.json:19-25` `dependencies` 增加 `"iconv-lite": "^0.7.2"`（其余不动，**不引入其它依赖**） | `package.json` | `npm ls iconv-lite` 显示直接依赖 |
| **D-2** | 锁文件最小改动 | `package-lock.json:12-18` 根 `packages[""].dependencies` 增加 `"iconv-lite": "^0.7.2"`；`node_modules/iconv-lite`（`:2607`）已是**非 dev** prod 条目 → **不改依赖树**。**优先手工改两行**；若用 `npm install --package-lock-only` 须 `git diff --stat package-lock.json` 复核仅新增 1 行（KB：禁无意重生成） | `package-lock.json` | lock diff = **+1 行**；无其它依赖树变动 |
| **D-3** | 许可证/发布 | iconv-lite = **MIT**；作为运行时依赖由 npm 解析安装，**不打入 tarball**（`files` 仍 `dist/bin/schemas`）→ **无需**在 README 声明；在 `CHANGELOG` Added 记一句 | `CHANGELOG.md` | `npm pack --dry-run` 文件数不变；许可证合规 |
| **D-4** | 类型 | iconv-lite 自带 `lib/index.d.ts`（实测）→ **无需 @types** | — | `tsc --noEmit` 0 |

### E — 测试

| 编号 | 目标 | 精确改动点 | 影响文件 | 验收要点 |
|:--:|------|-----------|----------|----------|
| **E-1** | 编码单测（新） | **新建** `test/cli/output-encoding.test.ts`：`resolveTargetEncoding` 全分支；`installOutputEncoding({stdout: fakeStream, stderr: fakeErrStream})` 字节断言（`中文`→`d6d0 cec4`、`⚠`→`3f`、Buffer 直通、回调保留、utf8 不包装）；`codepageToIconv` 映射；**静态断言** `src/cli/output-encoding.ts` 不含 `process.env.VITEST`（REV-001 防回归） | 新增测试 | 用例通过；**两流均注入 fake**（stdout/stderr 均不触碰真实流） |
| **E-2** | 旁路单测 + spawn E2E（新，防恒绿） | 同文件：① **纯函数**（C-1 权威）`resolveTargetEncoding({argv:['--json','--encoding','gbk'], env:{OPENFEEL_ENCODING:'gbk'}, …})` → `utf8`；② **spawn 正控（决定性）**：spawn `node bin/openfeel.js flow phases`（非 json，人类输出含 CJK「流水线」），cwd=临时目录、HOME 隔离、`OPENFEEL_ENCODING=gbk`，Buffer 捕获 → 断言按 **GBK** 解码含「流水线」且**非合法 UTF-8**（`new TextDecoder('utf-8',{fatal:true})` 抛错）——若 install 被短路（如 `VITEST` 守卫复活）该断言必失败 → **不可恒绿**；③ **spawn 旁路回归（C-2）**：`flow phases --json` + `OPENFEEL_ENCODING=gbk` → 合法 UTF-8 + `JSON.parse` + `schemaVersion===1`；④ **基线对照**：同人类命令 `OPENFEEL_ENCODING=utf8` → 合法 UTF-8 | 新增测试 | 正控证明转码链真实运行；旁路 JSON 可解析；`--json` 旁路由 ① 权威证明 |
| **E-3** | 日志单测（新） | **新建** `test/core/runtime-log.test.ts`（`vi.mock('node:os')` 隔离 HOME）：路径/文件名（按日）；行格式正则；UTF-8 中文字节；级别过滤（debug 默认关 / `--debug` 开）；`--no-log` 关闭；`--log-file` 覆盖；未安装 no-op | 新增测试 | 用例通过；不触碰真实 HOME |
| **E-4** | 修复 REPL 测试（必要修复） | `test/cli/repl.test.ts:25` env 增加 `OPENFEEL_ENCODING: 'utf8'`、`OPENFEEL_LOG: '0'`（**因 A-1 不设 `VITEST` 守卫，win32 非 TTY 下 auto→GBK 会破坏 `encoding:'utf-8'` 断言 → 此修复变为必要**；`OPENFEEL_LOG:'0'` 避免在隔离 HOME 产生日志噪声） | `test/cli/repl.test.ts` | 该用例通过；不再依赖宿主 chcp |
| **E-5** | 受影响断言核查（REV-001c 准确清单） | 全仓复扫（`rg -n "spawn(Sync)?" test/ -l` + `"openfeel.js"`）：**仅 `test/cli/repl.test.ts:13,21-26` 经 bin**（win32 非 TTY 下受影响）；其余 4 个 spawn 文件（`backup.test.ts:187`/`flow-concurrent.test.ts:62`/`fs/file-lock.test.ts:109`/`fs/sequence.test.ts:97`）spawn worker/fixture、不经 bin；`templates.test.ts:18-19` 仅文本匹配；30 个 in-process `console` spy 从不 install；`test/core/global-paths.test.ts` 为**逐函数断言**（非导出计数）→ 新增 `getCliLogsDir` 安全 | 核查记录 | 无其它翻转；新增断言建议 ≥ 12 组 |

### F — 文档

| 编号 | 目标 | 精确改动点 | 影响文件 | 验收要点 |
|:--:|------|-----------|----------|----------|
| **F-1** | 新增 manual | 新建 `.openfeel/manual/core/runtime-log.md`（职责/API/格式/级别/开关/边界 + REV-002 error 边界/不改项）+ `.openfeel/manual/cli/output-encoding.md`（auto 规则表/优先级/`--json` 旁路/降级策略/与 NO_COLOR 解耦/**REV-003：仅支持 UTF-8 字符串语义，非默认 encoding 的直接 write 不受支持**） | manual 2 新文件 | 模块树可导航 |
| **F-2** | 更新 manual | `.openfeel/manual/index.md`（模块树 + 维护规则加两行）；`core/global-paths.md`（API 表加 `getCliLogsDir()`）；`cli/commands.md`（全局选项表加 4 项 + 编码/日志说明） | manual 3 文件 | 与实现一致 |
| **F-3** | README | `README.zh-CN.md` / `README.en.md`（+ `README.md` 落地页如需）：新增「Windows 编码」小段——非 TTY 输出按 `chcp` 自适应、`--json` 恒 UTF-8、`--encoding`/`OPENFEEL_ENCODING` 覆盖；运行日志路径与开关 | README ×3 | zh/en 对等，控制篇幅 |
| **F-4** | CHANGELOG | `CHANGELOG.md` `## [1.1.2]` 的 `### Added` 追加：输出编码自适应（`--encoding`/`OPENFEEL_ENCODING`、`--json` 恒 UTF-8）、运行日志（`~/.openfeel/cli/logs/`、`--log-file`/`--no-log`/`--debug`）、直接依赖 iconv-lite（MIT） | `CHANGELOG.md` | 条目准确 |
| **F-5** | docs | `docs/commands.md` 全局选项表补 4 项 + 编码/日志说明 | `docs/commands.md` | 与 `--help` 一致 |

---

## 四、op 划分与执行顺序（3 op）

| op | 主题 | 覆盖 | 关键产出 | 依赖 |
|:--:|------|------|----------|------|
| **op-001** | **输出编码自适应 + `--json` 恒 UTF-8 + 依赖** | A（A-1~A-7）+ C（C-1~C-3）+ D（D-1~D-4） | 新增 `src/cli/output-encoding.ts`；`bin/openfeel.js` 安装；`src/cli/index.ts` 注册 `--encoding`；i18n 键；`package.json`/`package-lock.json`；新增 `test/cli/output-encoding.test.ts` | — |
| **op-002** | **运行日志 + 测试收尾** | B（B-1~B-8）+ E（E-1~E-5） | 新增 `src/core/runtime-log.ts`；`global-paths.ts` `getCliLogsDir`；`src/cli/index.ts` 选项 + `runCli`/`handleCliError` 接入；`bin/openfeel.js` 启用；i18n 键；新增 `test/core/runtime-log.test.ts`；修复 `test/cli/repl.test.ts` | **hard: op-001**（同改 `src/cli/index.ts` / `bin/openfeel.js`，串行避免冲突） |
| **op-003** | **文档 + 回归门禁 + 阶段报告** | F（F-1~F-5）+ §六 全部门禁 + 报告 | manual ×5、README ×3、CHANGELOG、docs；五门禁实跑；阶段报告（改动清单/实测值/结论） | **hard: op-001、op-002** |

**顺序：`op-001 → op-002 → op-003`。**

> op-001/op-002 同改 `src/cli/index.ts` 与 `bin/openfeel.js`，**强制串行**；op-003 收口文档与全部门禁。

**边界声明**：全程**不改 `flow.json`**、**不代 Feel 推送**、**不执行 `npm publish`**、**不创建 op 文件**、**不引入除 iconv-lite 外的新依赖**、**不改 `.openfeel/log/**` 与 `flow.json.log[]` 语义**。

---

## 五、风险与回滚

| # | 风险 | 影响 | 缓解 / 回滚 |
|:-:|------|------|-------------|
| R-1 | `bin` 层包装 `process.stdout.write` 破坏回调/返回值语义 | 中（进程输出异常） | A-3 保留三种签名（`(chunk)`/`(chunk,cb)`/`(chunk,enc,cb)`）；仅字符串转码，Buffer 直通；E-1 断言回调 |
| R-2 | 测试因 bin 编码包装被破坏 | 中（门禁红） | **仅** `test/cli/repl.test.ts`（唯一经 bin）在 **win32 非 TTY** 下会被破坏（auto→GBK）→ E-4 传 `OPENFEEL_ENCODING:'utf8'`（**必要修复**）；POSIX/CI 不受影响；in-process 从不 install，不受影响 |
| R-3 | spawn bin 的测试写真实 `~/.openfeel/cli/logs/` | 中（污染真实环境） | **不设 `VITEST` 守卫**（REV-001/004）；库侧默认 disabled（未 install 即 no-op）→ in-process 零写盘；唯一经 bin 的 `repl.test.ts` 自身隔离 HOME（USERPROFILE/HOME/XDG_CONFIG_HOME）+ E-4 `OPENFEEL_LOG:'0'`；日志单测 `vi.mock('node:os')` 隔离 |
| R-4 | `chcp` 探测在特定环境失败/输出非预期 | 低 | 失败/无匹配 → `utf8`（安全默认）；latin1 提取数字；`windowsHide:true` |
| R-5 | `iconv-lite` 直接依赖引入 lock 变动 | 低 | 该包**已在 prod 树**（非 dev），lock 仅根 `dependencies` +1 行；`--package-lock-only` 后 `git diff --stat` 复核 |
| R-6 | GBK 下 emoji/⚠ 静默变 `?` | 低（信息损失） | 明示降级策略（manual + CHANGELOG）；`--json` 恒 UTF-8 不受影响 |
| R-7 | 运行日志写失败阻塞 CLI | 中 | `runtimeLog` 全程 try/catch 吞异常（best-effort） |
| R-8 | 日志与三类审计日志语义混淆 | 低（治理混乱） | B-8 manual 写明四者边界；不改既有三处语义 |
| R-9 | `--json` 检测误伤（如 `--json-file` 参数） | 低 | 精确匹配 `argv.includes('--json')`；当前无 `--json-*` 参数 |
| R-10 | 全局旧版 CLI 污染门禁 | 低 | 门禁一律用 `node bin/openfeel.js`（本仓口径） |
| R-11 | spawn E2E 因 `VITEST` 继承而恒绿零覆盖（假阳性） | 高（掩盖真实缺陷） | A-1/B-2 **均无 `VITEST` 守卫**；E-2 加**正控**（非 json CJK 命令 + GBK 断言为 GBK 字节，被短路必失败）；E-1 静态断言源码无 `process.env.VITEST`；§六「编码 E2E / 日志 E2E」为真实子进程 |

**回滚**：本阶段改动集中在新增模块 + bin 入口 + 选项注册 + 文档；`git revert <sha>` 即可。唯一依赖变更为新增一行直接依赖（包已存在），回滚删两行即可；不涉数据迁移、不改持久化语义。

---

## 六、门禁（阶段级）

| 门禁 | 命令 | 基线/期望 |
|------|------|-----------|
| 构建幂等 | `npm run build` | 成功；`git status` **不复活** `.opencode/**` |
| 类型 | `npx tsc --noEmit` | **0** |
| 测试 | `npm test` | **基线以 stage-58 开工时实盘校准**（stage-57 归档后运行 `npm test` 实测文件数/用例数，**不得沿用 986 预估**）→ 本阶段新增 E-1/E-2/E-3，全绿；`repl.test.ts` 修复后通过 |
| i18n | `node bin/openfeel.js lint i18n` | **726 键 + 本阶段新增键**，双语句对非空，exit 0 |
| KB | `node bin/openfeel.js lint kb` | **0 过期** |
| 自描述 | `node bin/openfeel.js flow phases --json` | 5 键不变 |
| 编码 E2E（含正控） | ① spawn `flow phases`（非 json，GBK env）→ 断言 GBK 字节；② spawn `flow phases --json`（GBK env） | ① 正控：按 GBK 解码含 CJK 且非合法 UTF-8（证明 install 真实运行，**不可恒绿**）；② 合法 UTF-8 + `JSON.parse` 成功 |
| 日志 E2E | spawn `flow status`（隔离 HOME） | 生成 `~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log`，UTF-8 可读，含 `[INFO]` 行（**真实子进程，install 未被短路**） |
| 发布 | `npm pack --dry-run` | 文件数不因本阶段变化；**不含 `npm publish`** |

---

## 七、不做（边界）

1. **不改 `flow.json`**（状态推进由 Feel 执行 `openfeel flow start`/`advance`）。
2. **不代 Feel 推送**（阶段-57→58 完成后统一由 Feel/用户 push + 发布）。
3. **不执行 `npm publish`**。
4. **不创建 op 文件**（由 openfeel-schemer 产出）。
5. **不引入除 `iconv-lite` 外的新依赖**。
6. **不改 `.openfeel/log/**`（工作区审计）、`flow.json.log[]`（状态审计）、`update_infos.md`（部署记录）** 三处语义。
7. **不做日志自动清理/大小轮转**（最小可行：按日一文件）。
8. **不记录每条命令的 stdout 内容**（仅 argv + 状态 + 错误）。
9. **不改 `--verbose` 语义**（仍为 `flow.ts:43-46` stdout 增强，不写文件）。
10. **不实现着色**（`NO_COLOR`/`--no-color` 与编码解耦，保持零可见效果）。
11. **不做管道内容态探测**（仅 `chcp` 代码页探测）。

---

## 八、裁定表

| # | 议题 | 建议结论 | 依据 | 状态 |
|:-:|------|----------|------|------|
| **A-enc-1** | `--json` 与显式 `--encoding` 冲突时谁优先 | **`--json` 优先**（机器合同不可协商） | 用户裁定 4 + `kb/patterns.md #--json 约定` | 用户已裁定 `--json` 恒 UTF-8；冲突序由 planner 建议，**待确认** |
| **A-enc-2** | `--encoding` 值域 | CLI `utf8\|gbk\|auto`；env 接受 CJK 别名；未知 → 回退 auto | 用户需求原文 | planner 建议 + 待确认 |
| **A-enc-3** | 不可编码字符降级 | iconv-lite 默认 `?`，**不告警** | 避免噪声/递归；实测 ⚠→`3f` | planner 建议 + 待确认 |
| **A-enc-4** | 逐流（stdout/stderr）判定 vs 单 target | **逐流**按 `isTTY` 判定，chcp 缓存 | 更贴合「各流实际消费者」 | planner 建议 + 待确认 |
| **A-log-1** | 是否记录每条命令的 stdout 摘要 | **不记录**（隐私/体积） | 用户提示「由你裁定」 | **planner 裁定：不记录**；待 Feel 确认可翻转 |
| **A-log-2** | 轮转/清理策略 | 按日一文件，**不自动清理** | 最小可行，避免过度设计 | planner 建议 + 待确认 |
| **A-log-3** | 库侧默认 disabled（生产 bin 安装后 on） | 是（保证测试零写盘，同时满足生产默认 on） | R-3 + 用户裁定 2 | planner 建议 + 待确认 |
| **A-iso-1** | 两个 install 的隔离策略（REV-001/004） | **方案 b：删除 `VITEST` 守卫**，两个 install 均不设 env 守卫；隔离 = bin 单一 install + 库侧默认 no-op + 测试自身 cwd/HOME 隔离 | 实测 vitest 设并继承 `VITEST`；守卫使 spawn E2E 恒绿；in-process 仅靠「未 install 即 no-op」已足够；`kb/patterns.md #测试全局路径隔离模式` | **planner 裁定（REV-001 blocking 处置）** |
| **A-iso-2** | E2E 防恒绿措施 | 编码 E2E 加**正控**（非 json CJK + GBK → 断言 GBK 字节）；`--json` 旁路由 C-1 单元权威；E-1 静态断言无 `process.env.VITEST` | REV-001(b) 要求「E2E 不得恒绿」 | **planner 裁定** |
| **A-doc-1** | commander 解析期错误是否纳入日志（REV-002） | **不纳入，仅文档化**（B-6 注释 + B-8 manual）；不引入 `program.exitOverride()` | 用户裁定 2 未要求覆盖解析期错误；避免过度设计 | **planner 裁定** |
| **A-enc-5** | string chunk 显式 encoding（REV-003） | **不支持，仅注释 + manual 明示**（全仓直调为 0，现实风险≈0） | REV-003；避免过度设计 | **planner 裁定** |
| **D-1** | iconv-lite 提升为直接依赖 | 是，`^0.7.2`；lock 根 `dependencies` +1 行 | 用户裁定 1；包已在树中 | **用户已裁定** |
| **D-2** | 是否需 README 许可证声明 | **不需要**（不打入 tarball）；CHANGELOG 记一句 | MIT 依赖由 npm 解析 | planner 建议 + 待确认 |
| **D-3** | 日志路径 | `~/.openfeel/cli/logs/`，默认 on，UTF-8 | 用户裁定 2 | **用户已裁定** |
| **D-4** | `--json` 编码 | 恒 UTF-8，走 stdout 不写文件 | 用户裁定 4 | **用户已裁定** |
| **E-1** | `repl.test.ts` 修复方式 | spawn env 传 `OPENFEEL_ENCODING:'utf8'`（+ `OPENFEEL_LOG:'0'`） | **A-1 无 `VITEST` 守卫 → 该用例在 win32 非 TTY 下确会被破坏**（REV-001 裁定后为必要修复；POSIX 不受影响） | planner 建议 + 待确认 |

---

## 九、验收标准（阶段级）

1. **A**：`bin/openfeel.js` 安装输出编码；`auto` 在「非 win32 / TTY」直通 UTF-8、在「win32 非 TTY」按 `chcp` 映射转码；`--encoding`/`OPENFEEL_ENCODING` 显式优先；Buffer 直通、回调保留；不可编码字符降级 `?` 且不告警。
2. **B**：`~/.openfeel/cli/logs/openfeel-YYYY-MM-DD.log` 按日生成，**恒 UTF-8**；行格式 `[ISO][LEVEL][pid] msg`；info/warn/error 默认记录，debug 默认关（`--debug`/`OPENFEEL_DEBUG=1` 开）；`--log-file`/`--no-log`/`OPENFEEL_LOG_FILE` 生效；默认开启；并发经 `withFileLock(globalLockPath('runtime-log'))`；写失败不阻塞；与三类既有日志边界写入手册。
3. **C**：`--json` 在 GBK 环境下仍为合法 UTF-8 字节，`JSON.parse` 成功；`--json` 旁路由 C-1 单元权威证明；E-2 **正控**证明 bin 转码链真实运行（非 json CJK 命令 + GBK → GBK 字节，**不可恒绿**）。
4. **D**：`iconv-lite@^0.7.2` 为直接依赖；lock 仅 +1 行；无其它新依赖；`npm pack --dry-run` 文件数不变；MIT。
5. **E**：新增 `output-encoding.test.ts` / `runtime-log.test.ts`；`repl.test.ts` 修复（必要）；无其它翻转；`npm test` 全绿（**基线以 stage-58 开工时实盘校准** + 新增）。
6. **F**：manual（2 新 + 3 更新）、README ×3、CHANGELOG、docs 同步；新增 i18n 键双语。
7. **门禁**：`build` 幂等不复活、`tsc` 0、`lint i18n` 双语句对、`lint kb` 0 过期、`flow phases --json` 5 键。
8. **无越界**：未改 `flow.json`；未代 Feel 推送；未 `npm publish`；未创建 op 文件；未引入额外依赖；未改三类既有审计日志语义。

---

## 十、修订记录

| 时间 | 制定人 | 版本 | 说明 |
|------|--------|------|------|
| 2026-10-02 | openfeel-planner | v1 | 初稿：单一咽喉（bin）+ 新增 `output-encoding.ts`/`runtime-log.ts` 两模块；A~F 编号化工作项；`auto` 规则与 `--json` 旁路；3 op（编码+依赖 / 日志+测试 / 文档+门禁）；裁定 A-enc-1~E-1 |
| 2026-10-02 | openfeel-planner | v2 | 按 REV-v1.1.2-stage-58 修订（REV-001 blocking + REV-002~005）：**REV-001 裁定方案 b** —— 删除 A-1/B-2 的 `VITEST` 守卫（install 仅 bin 调用 + 库侧默认 no-op 已足够；守卫使 spawn E2E 因 `VITEST` 继承恒绿）；统一两 install 隔离策略（REV-004）；E-2 加**正控**防恒绿 + E-1 静态断言无 `VITEST`；C-2 诚实标注 JSON 全 ASCII、旁路由 C-1 权威；§1.4 校正受影响清单（仅 `repl.test.ts` 在 win32 非 TTY 受影响，E-4 为必要修复）；REV-002 注明解析期错误不入日志（仅文档化）；REV-003 注明 string chunk 忽略 encoding（仅注释/manual）；REV-005 修正 `instructions.ts:39` + 基线改「实盘校准」；R-2/R-3 更新并新增 R-11；裁定表新增 A-iso-1/A-iso-2/A-doc-1/A-enc-5。**用户 5 条锁定裁定不变** |
