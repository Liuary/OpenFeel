# 输出编码自适应（output-encoding）

> 模块文档，由归档官在归档时维护。对应源码：`src/cli/output-encoding.ts`（v1.1.2-stage-58 op-001）。

## 职责

在 CLI 进程入口（`bin/openfeel.js`）单一咽喉安装 `process.stdout` / `process.stderr` 的写包装，把**人类可读文本**按目标编码转码，解决 Windows 传统 CJK 代码页（**非 TTY / 管道**）下的乱码；`--json` 机器合同**恒 UTF-8**，不受转码影响。

## 核心 API

| 导出 | 签名 | 用途 |
|------|------|------|
| `OutputEncoding` | `type` | 目标编码联合：`utf8 \| gbk \| gb18030 \| big5 \| cp932 \| cp949` |
| `ResolveTargetEncodingContext` | `interface` | resolve 输入（`argv/env/platform/isTTY` + 测试注入 `codepage?`） |
| `InstallOutputEncodingOptions` | `interface` | install 输出流注入（`stdout?/stderr?`，**无 `force`**） |
| `normalizeEncoding` | `(value) => OutputEncoding \| null` | 编码别名归一 |
| `codepageToIconv` | `(cp: number) => OutputEncoding` | 代码页映射 |
| `detectConsoleCodepage` | `() => number \| null` | `chcp` 探测（进程内缓存） |
| `resolveTargetEncoding` | `(ctx) => OutputEncoding` | 优先级解析（**纯函数**） |
| `installOutputEncoding` | `(opts?) => void` | 幂等安装（**仅 `bin` 调用**） |

## `auto` 规则（5 步优先序）

`resolveTargetEncoding({ argv, env, platform, isTTY })`：

| # | 条件 | 结果 |
|:-:|------|------|
| ① | `argv` 含 `--json` | `'utf8'`（**最高优先，机器合同**） |
| ② | 显式 `--encoding <v>`（空格或 `=`） | 归一化 v |
| ③ | 环境变量 `OPENFEEL_ENCODING` | 归一化 v |
| ④ | `platform !== 'win32'` **或** `isTTY` | `'utf8'`（现代终端由 Node 控制台 API 直通） |
| ⑤ | `win32 && !isTTY` | `chcp` 探测 → 代码页映射；未知 → `'utf8'` |

- **逐流判定**：stdout / stderr 各按**本流** `isTTY` 独立解析；`chcp` 结果进程内缓存一次。
- **`--json` 恒 UTF-8（C-1）**：第 1 步旁路，**优先于**显式 `--encoding`、`OPENFEEL_ENCODING` 与 auto。权威证明在纯函数单测（`--json` + `--encoding gbk` + env gbk + cp936 → `utf8`）。
- **`--encoding` 值域**：CLI 文档值 `utf8 | gbk | auto`（默认 `auto`）；env 额外接受别名 `utf-8` / `gb2312`（→`gbk`）/ `gb18030` / `big5` / `shift_jis` / `sjis` / `cp932` / `euc-kr` / `cp949`；`auto` / 空 / 未知 → 继续回退。

### 代码页 → iconv 映射

| 代码页 | 编码 |
|:--:|:--:|
| 936 | `gbk` |
| 54936 | `gb18030` |
| 950 | `big5` |
| 932 | `cp932` |
| 949 | `cp949` |
| 65001 | `utf8` |
| 其它 / 探测失败 | `utf8`（安全默认） |

> `chcp` 探测：`spawnSync('chcp', [], { stdio: ['ignore','pipe','ignore'], windowsHide: true })`，从 **latin1** 串提取首个数字（**勿按 UTF-8 解码整串**）；失败/无匹配 → `null` → `utf8`。

## 转码语义与边界

- **仅作用于字符流**：`typeof chunk === 'string'` → `iconv.encode(chunk, target)` 转 Buffer 后写回；`Buffer` / 二进制**逐字节直通**；保留 `callback` 与返回值。
- **仅支持 UTF-8 字符串语义（REV-003）**：string 分支**丢弃调用方 `encoding`**（如 `write(str, 'latin1', cb)` 会按 UTF-8 语义先转 GBK，结果失真）。实测全仓 `process.stdout/stderr.write` 直调为 **0**、`console.*` 均不传 encoding → 现实风险 ≈ 0。**不新增处理逻辑**，仅此文档 + 源码注释明示：**非默认（UTF-8）encoding 的直接 write 不受支持**。
- **不可编码字符降级**：iconv-lite 默认降为 `?`（实测 `中文⚠` → `d6d0 cec4 3f`），**不额外告警**（避免日志噪声与编码递归）。
- **`utf8` 目标不包装**：`resolveTargetEncoding` 返回 `utf8` 时直接返回，`stream.write` 保持恒等（零行为变更）。
- **与 `NO_COLOR` / `--no-color` 解耦**：二者互不影响（当前无着色实现）。

## 安装与隔离

- **库侧默认 no-op**：未调用 `installOutputEncoding` 时不包装任何流（30 个 in-process `console` spy 测试 import 该模块零副作用）。
- **单一咽喉安装**：仅 `bin/openfeel.js` 在 `applyHelpI18n` **之前**调用 `installOutputEncoding()`。
- **无 `VITEST` / env 守卫（REV-001/004 方案 b）**：install 仅由 `bin` 调用，in-process 测试从不安装；若设守卫会被 spawn 子进程继承（vitest 主进程设置 `VITEST` 环境变量为真）→ E2E 恒绿零覆盖。隔离由测试自身 HOME/cwd 隔离承担。
- **幂等**：内部 `installed` 标志，二次调用直接返回。

## 变更历史

| 阶段 | 变更 |
|------|------|
| v1.1.2-stage-58 | 初始创建：新增 `installOutputEncoding`（单一咽喉）+ `--json` 恒 UTF-8 旁路 + `--encoding` 全局选项 + `iconv-lite` 直接依赖 |
