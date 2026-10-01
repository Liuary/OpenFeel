# v1.1.2-stage-57 计划 — 发布收尾（CI 修复 + CI 可观测性 + README 更新）

- **阶段**：`v1.1.2-stage-57`
- **依赖**：`hard: v1.1.2-stage-56`（已登记；stage-56 已归档）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-02
- **定位**：v1.1.2 **发布收尾**。stage-56 判定「达到可发布状态」后，用户授权推送 `f178600` → **CI run #51 失败**，`publish` job 被 skip，**1.1.2 实际未发布**。本阶段 = 修 CI 失败（T32 平台化）+ 补 CI 失败注解可观测性 + 更新三份滞后 README + 回归/推送验证。**不含实际 `npm publish`**（由用户决定，本阶段仅给「可推送」结论与命令）。
- **范围约束**：不改 `flow.json`；**不代 Feel 推送**；不改实现语义（`normalizeKey` 去重行为不变）；不创建 op 文件（由 openfeel-schemer 产出）。
- **KB 检索**：已加载 `openfeel-check-kb`。相关条目：`kb/patterns.md #测试 cwd 隔离与反向守卫`、`#零行为变更验证方法`、`#部署型资产变更的多载体同步面清单（权威源 skill → build 生成段 → 全局副本 + 手写文档）`、`#CLI 退出码语义`、`#文档根因须实测复核`、`kb/troubleshooting.md #测试隔离的「干净机器」验证法`、`#多源文案同步陷阱`、`#PATH 全局旧版 CLI 环境污染（门禁口径）`、`kb/architecture.md #仓库自身不再保留项目级部署资产（supersede N1）`、`#全局部署架构`、`#上下文预算治理架构`。

---

## 一、背景与实测证据（唯一事实基准）

### 1.1 CI 失败证据（GitHub API，run #51 / commit `f178600`）

| 项 | 实测 |
|----|------|
| `build-and-test`（Node 20.x） | **failure** — 失败步骤 = `npm test -- --reporter=verbose`；其余步骤全绿（`npm ci` / `npm run build` / Env snapshot / Version guard / `lint i18n`） |
| `build-and-test`（Node 22.x） | **failure** — 同一步骤 |
| `publish` | **skipped**（`needs: build-and-test` 失败） |
| 本机 Windows | `npm test` **985 用例全绿 / 0 skipped** |
| 本机单文件复核（本计划撰写时） | `npx vitest run test/core/config.test.ts` → **37 passed**（含 T32） |

### 1.2 根因（高置信，已读代码确认）

`test/core/config.test.ts:514-529` 的 **T32**（stage-50 op-003 / 任务 U3-006「盘符大小写去重」）：

- 预置 `recent_projects: ['c:/proj/x']` → 调用 `ensureProfileDefaults('C:\\Proj\\X')`；
- 实现 `src/core/config.ts:284` 用 `resolve(projectPath)`；在 **POSIX** 下 `C:\Proj\X` **不是绝对路径** → 解析为 `<cwd>/C:\Proj\X`；
- 去重 key（`:307` `normalizeKey`）≠ 预置的 `c:/proj/x` → `expect(recent).toHaveLength(1)` 失败。

→ **该用例本质是 Windows 盘符专属**，POSIX 上必然失败。静态扫描未发现其它「确定会失败」的 Linux 项（时区 / CRLF / `USERPROFILE` / 大小写文件系统 / shell / 权限已取证排除），但**无法完全排除**（本地无 Docker/WSL，不能跑 Linux）→ 本阶段以 **CI 注解可观测性（C2）** 兜底后续诊断。

### 1.3 README 陈旧点（已核实）

| 文件 | 行 | 现状 | 事实 |
|------|:--:|------|------|
| `README.zh-CN.md` / `README.en.md` | 149 | 「790 用例 / 54 个测试文件」 | 实测 **59 个测试文件**；用例数见 §5.1（C1 后为 986 定义 / 985 CI 通过） |
| 三份 README | — | 无 v1.1.2 版本信息与新增能力 | `CHANGELOG.md:5-37` 已列 v1.1.2 |
| `README.zh-CN.md` / `README.en.md` | 53-70 | 命令表陈旧：`flow` 缺 `phases`/`ops`/`health`；`plan` 缺 `scheme remove/rename/publish`；`knowledge` 缺 `add/index/dedup`；`stage` 缺 `task`；**`project` 写 `(list / info)`——实测仅 `overview`**（`cli/BUG-007` 同类，README 未同步） | 逐条 `--help` 实测见 §3.3 |
| 三份 README | 119-142 | 架构图未反映**框架资产全局部署**、**仓库自身不再保留项目级 `.opencode/agents\|skills`**（stage-55）、`dev_last`/`current` 分层、备份机制 | `kb/architecture.md` 全局部署架构 + supersede N1 |

### 1.4 命令实测基线（`node bin/openfeel.js <cmd> --help`，本计划撰写时）

- `flow` 子命令含 `phases` / `ops` / `health` / `repair` / `migrate` / `review` / `checkpoint` / `wizard` 等；`flow phases --json` 顶层 **5 键**（`schemaVersion,phases,transitions,advanceAccepted,transitionsDiff`）。
- `plan scheme` 子命令：`create` / `publish` / `rename` / `list` / `remove`。
- `knowledge` 子命令：`list` / `add` / `search` / `index` / `dedup`。
- `config` 子命令：`get-lang` / `set-lang` / `list-projects` / `get` / `set` / `effective`。
- `stage` 子命令：`status` / `set` / `task` / `create`（已弃用）。
- `project` 子命令：**仅 `overview`**。
- `view` 子命令：`list` / `accept`（`view add` 已于 stage-52 移除，改 `flow review add`）。

---

## 二、工作项（C1~C4 细化）

### C1 — CI 修复：T32 平台化（**阻塞发布**）

**目标**：消除 T32 在 POSIX 下的必然失败，且**不改实现语义**（`src/core/config.ts:284`/`:307` 零改动），仅在测试侧区分平台。

| 编号 | 目标 | 精确改动点（文件:行号 → 现状 → 改后） | 影响文件 | 验收要点 |
|:--:|------|--------------------------------------|----------|----------|
| **C1-1** | 拆分 T32 为两条 | `test/core/config.test.ts:514-529` 单个 `it('T32：recent_projects 去重大小写不敏感（c:\\x 与 C:\\x 视为同一）')` → **替换为两条 `it`**（见 §2.1 代码块） | `test/core/config.test.ts` | 文件内不再有以 `C:\\Proj\\X` 为**唯一**输入的跨平台用例；两条均在同一 `describe('writeDefaultConfig')` 内、各自 `mkdirSync(join(mockHome.dir,'.config','openfeel'))` 并结尾 `mockHome.dir=''` |
| **C1-2** | 跨平台用例（严格） | 新增 `it('T32：recent_projects 去重大小写不敏感（跨平台，绝对路径）')`：目标 = `resolve(tmpDir,'proj','x')`（两平台均绝对）；预置其「大写 + 正斜杠」受控变体；断言 `toHaveLength(1)` 且 `recent[0] === target` | 同上 | Windows 与 Linux 下**都成立**（论证见 §2.1）；不依赖 `process.platform` |
| **C1-3** | Windows 专属用例 | 新增 `it.skipIf(process.platform !== 'win32')('T32win：recent_projects 去重（盘符大小写与分隔符，Windows 专属）')`：**保留原** `'c:/proj/x'` 预置 + `ensureProfileDefaults('C:\\Proj\\X')` + `expect(...).toBe(resolve('C:\\Proj\\X'))` | 同上 | Linux 下 **skip**（不计失败）；Windows 下运行并通（当前本机基线 37 → 38 passed） |
| **C1-4** | 平台正确性验证 | 运行 `npx vitest run test/core/config.test.ts`（Windows → **38 passed**）；运行 §2.1 的 win32/posix 双解析模拟片段（两者均 `true`） | 验证记录 | 片段输出 `win32 true` / `posix true`；Windows 单文件 38 passed |
| **C1-5** | 不改实现 | `src/core/config.ts:284`（`resolve`）、`:307`（`normalizeKey`）**不动**；不放宽断言 `toHaveLength(1)` | `src/core/config.ts` | `git diff -- src/core/config.ts` 为空 |

#### 2.1 T32 拆分代码（推荐实现）

```ts
  // T32：recent_projects 去重大小写/分隔符不敏感 —— 拆分为跨平台 + Windows 专属（stage-57 C1）

  it('T32：recent_projects 去重大小写不敏感（跨平台，绝对路径）', () => {
    mockHome.dir = join(tmpDir, 'home-t32');
    mkdirSync(join(mockHome.dir, '.config', 'openfeel'), { recursive: true });
    // 目标路径在 Windows/Linux 均为绝对路径；预置其「大写 + 正斜杠」变体
    // 仅大写受控 ASCII 尾段（proj/x → PROJ/X），避免 tmp 前缀含非 ASCII 用户名的 toUpperCase/toLowerCase 往返风险
    const target = resolve(tmpDir, 'proj', 'x');
    const preset = target.replace(/proj([\\/])x$/, 'PROJ$1X').replace(/\\/g, '/');
    writeProfile({
      user: { name: 'U', lang: 'zh-CN' },
      preferences: { auto_advance: 'disabled', review_mode: 'full', communication: 'concise', confirm_threshold: 'medium' },
      history: { last_project: '', recent_projects: [preset] },
    });
    ensureProfileDefaults(target);
    const recent = readProfile().history.recent_projects;
    // 归一后视为同一条 → 只保留 1 条
    expect(recent).toHaveLength(1);
    expect(recent[0]).toBe(target);
    mockHome.dir = '';
  });

  // 盘符 + 反斜杠为 Windows 专属语义；POSIX 下 `C:\Proj\X` 非绝对路径，故跳过
  it.skipIf(process.platform !== 'win32')('T32win：recent_projects 去重（盘符大小写与分隔符，Windows 专属）', () => {
    mockHome.dir = join(tmpDir, 'home-t32win');
    mkdirSync(join(mockHome.dir, '.config', 'openfeel'), { recursive: true });
    writeProfile({
      user: { name: 'U', lang: 'zh-CN' },
      preferences: { auto_advance: 'disabled', review_mode: 'full', communication: 'concise', confirm_threshold: 'medium' },
      history: { last_project: '', recent_projects: ['c:/proj/x'] },
    });
    ensureProfileDefaults('C:\\Proj\\X');
    const recent = readProfile().history.recent_projects;
    expect(recent).toHaveLength(1);
    expect(recent[0]).toBe(resolve('C:\\Proj\\X'));
    mockHome.dir = '';
  });
```

**跨平台论证要点（C1-2 为何两平台都成立）**：

1. 目标 `target = resolve(tmpDir,'proj','x')` 用测试内同一个 `node:path.resolve` 计算，**在两平台都是绝对路径**（`C:\...\openfeel-config-write-test-XXXX\proj\x` / `/tmp/.../proj/x`）。
2. 预置 `preset` 仅对**受控 ASCII 尾段** `proj\x`（或 `proj/x`）做大写 + 反斜杠→正斜杠变换；`tmpDir` 前缀（可能含随机大小写/用户名）的**大小写**逐字符不变，前缀中的**路径分隔符**经 `\→/` 归一——因 `normalizeKey`（`config.ts:307`）本身也做 `\→/` 归一，该前缀分隔符归一与 `normalizeKey` 幂等，**不影响相等性**（实测 `equal=true`）。
3. `normalizeKey(p) = p.replace(/\\/g,'/').toLowerCase()`（`config.ts:307`）：
   - `normalizeKey(target)` = `.../proj/x`（全小写、正斜杠）；
   - `normalizeKey(preset)` = 同串（`PROJ/X` → `proj/x`，反斜杠 → 正斜杠）。
   - 故 `normalizeKey(preset) === normalizeKey(target)` **恒成立** → `filter` 命中 → 去重后 `toHaveLength(1)`；写入元素为 `normalizedPath = resolve(target) = target`。
4. 变体推导不依赖 `process.platform`，`tmpDir` 前缀大小写在两平台一致，故无 Windows/Linux 分歧。

**双解析模拟片段（C1-4 执行）**：

```js
const path = require('node:path');
const norm = (p) => p.replace(/\\/g, '/').toLowerCase();
for (const [name, P, tmp] of [
  ['win32', path.win32, 'C:\\Users\\x\\Temp\\t-abc'],
  ['posix', path.posix, '/tmp/t-abc'],
]) {
  const target = P.resolve(tmp, 'proj', 'x');
  const preset = target.replace(/proj([\\/])x$/, 'PROJ$1X').replace(/\\/g, '/');
  console.log(name, norm(preset) === norm(target));
}
// 期望：win32 true / posix true
```

---

### C2 — CI 可观测性（失败注解可经 API 读取）

**为何要做**：Actions 日志需认证，无法直接经 API 读失败用例名；有注解后 `GET /repos/{owner}/{repo}/check-runs/{id}/annotations` 可自助诊断。

| 编号 | 目标 | 精确改动点（文件:行号 → 现状 → 改后） | 影响文件 | 验收要点 |
|:--:|------|--------------------------------------|----------|----------|
| **C2-1** | 测试步骤落盘 + 保退出码 | `.github/workflows/ci.yml:43`：`- run: npm test -- --reporter=verbose` → **命名为 `Test` 的多行步骤**：`set -o pipefail` + `npm test -- --reporter=verbose 2>&1 \| tee "$RUNNER_TEMP/test.log"`（见 §2.2） | `.github/workflows/ci.yml` | `pipefail` 使管道退出码 = `npm test` 退出码（成功 0 / 失败非 0）；`test.log` 落 `$RUNNER_TEMP`（不污染环境守卫四路径） |
| **C2-2** | 失败注解步骤（新增） | **紧随 C2-1 之后新增** `- name: Test failure annotations` + `if: failure()`：读取 `$RUNNER_TEMP/test.log`，用 `grep -E '^\s*(×\|FAIL)\|Failed Tests'` 提取失败用例行，逐行 `echo "::error::<line>"`（上限 20 条），结尾 `exit 0` | 同上 | 失败时注解可在 API 读取；注解步骤**自身不改变 job 结论**（`exit 0`） |
| **C2-3** | 判定语义不变 | 测试成功/失败仍**只**由 `npm test` 退出码决定；注解步骤仅在 `if: failure()` 时运行；**不改** coverage / Env guard / version guard 步骤；不写仓库文件 | 同上 | 成功 run 不产生错误注解；失败 run 的 job 结论仍为 failure |
| **C2-4** | YAML 自检 | `node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/ci.yml','utf8'));console.log('YAML OK')"` | 验证记录 | 输出 `YAML OK`；缩进 / `\|` 块 / `${{ }}` 无解析错误 |
| **C2-5** | 只读不污染 | 注解步骤仅读 `test.log`、仅 `echo` 到 stdout；**不新增任何写盘**（`test.log` 已在 `$RUNNER_TEMP`） | 同上 | Env guard 仍可在测试成功时通过（快照四路径不受影响） |

#### 2.2 CI YAML 改动（对应 `ci.yml:42-45` 区域）

```yaml
      - name: Test
        run: |
          # 保退出码（pipefail）：tee 不得吞掉 npm test 失败码
          set -o pipefail
          npm test -- --reporter=verbose 2>&1 | tee "$RUNNER_TEMP/test.log"

      - name: Test failure annotations
        if: failure()
        run: |
          # 失败时把失败用例名转成可经 GitHub API 读取的注解（只读诊断；不改判定语义）
          LOG="$RUNNER_TEMP/test.log"
          if [ ! -f "$LOG" ]; then
            echo "::warning::未找到测试日志 $LOG，无法生成失败注解"
            exit 0
          fi
          # vitest verbose 失败行以 × 开头；兜底 FAIL 与 Failed Tests 分隔段
          grep -E '^\s*(×|FAIL)|Failed Tests' "$LOG" | head -n 20 | while IFS= read -r line; do
            echo "::error::$line"
          done
          exit 0
```

> 说明：注解步骤未设 `pipefail`，`grep` 无命中（exit 1）时管道退出码取 `while`（0），不会误触发 `set -e`；`head -n 20` 限制注解条数，避免触发注解上限。

---

### C3 — README 更新（zh-CN 与 en 对等）

**目标**：三份 README 与 v1.1.2 实况一致，控制篇幅（README.md 保持落地页定位）。

#### 3.1 测试数（C3-T）

| 编号 | 文件:行 | 现状 | 改后 |
|:--:|---------|------|------|
| **C3-T1** | `README.zh-CN.md:149` | `npm test           # 运行测试（790 用例，54 个测试文件）` | `npm test           # 运行测试（986 用例 / 59 个测试文件；Linux CI 跳过 1 个 Windows 专属用例）` |
| **C3-T2** | `README.en.md:149` | `npm test           # Run tests (790 cases, 54 test files)` | `npm test           # Run tests (986 cases / 59 test files; Linux CI skips 1 Windows-only case)` |

> 口径说明：C1 后**定义** 986 个用例（原单 T32 → 两条 `it`）；本机 Windows 986 passed / 0 skipped，Linux CI 985 passed / 1 skipped。README 采「986 定义 + 平台说明」口径（**待裁定 A-C3-1**，备选：写「985+ 用例」）。

#### 3.2 版本与新增能力（C3-N）

| 编号 | 文件:行 | 改动 |
|:--:|---------|------|
| **C3-N1** | `README.md:9`（理念句后新增一行引用块） | 新增：`> 📦 **最新版本 v1.1.2** — 自描述 \`flow phases\`、配置有效值 \`config effective\`、部署前自动备份；框架资产（agents/skills/AGENTS.md）全局部署。` |
| **C3-N2** | `README.zh-CN.md`（在第 49 行后、`## 命令参考` 前 **新增节**） | 新增 `## v1.1.2 新增能力`，6 条要点：① `flow phases [--json]` 自描述 phase/转移表；② `flow stage remove` / `plan stage add --deps` / stageId 校验与冲突检测；③ `config effective`（有效值 + 来源）；④ `--json` 结构化输出（`status/current/health/metrics/overview`）；⑤ `plan scheme remove/rename/publish`、`flow ops list`、`flow health --fix`、`knowledge dedup`、`lint` 非 0 退出；⑥ 部署前自动备份 `~/.openfeel/backup/{ts}/` + 新 skill `openfeel-cli-usage`（skill 16→17）。 |
| **C3-N3** | `README.en.md`（在第 49 行后、`## Command Reference` 前 **新增节**） | 新增 `## What's New in v1.1.2`，与 C3-N2 **逐条语义对等**（英文）。 |

#### 3.3 命令表修正（C3-C，zh 与 en 镜像）

| 编号 | 文件:行（zh / en） | 现状 | 改后 |
|:--:|:--:|------|------|
| **C3-C1** | `README.zh-CN.md:57` / `README.en.md:57` | `openfeel flow` —「流水线状态管理（status / current / advance / overview）」 | `…（status / phases / overview / current / advance / attempt / ops list / health [--fix] / checkpoint / migrate；status·current·health·metrics·overview 支持 --json）` |
| **C3-C2** | `:59` | `openfeel plan` —「（stage add/list、scheme create/list）」 | `…（stage add/list [--deps/--tasks]、scheme create [--draft] / publish / rename / remove / list）` |
| **C3-C3** | `:62` | `openfeel knowledge` —「（list / search）」 | `…（list / add / search / index / dedup）` |
| **C3-C4** | `:67` | `openfeel stage` —「（status / set / create［已弃用］）」 | `…（status / set / task / create［已弃用］）` |
| **C3-C5** | `:68` | `openfeel project` —「项目管理（list / info）」 | `项目管理（overview）`（**实测仅 `overview`**；对齐 `cli/BUG-007`） |
| **C3-C6** | `:114` | `openfeel view` —「代码审查」 | `审查条目管理（list / accept；新增/修改/删除改用 \`flow review add|update|remove\`）` |

#### 3.4 架构与工作区（C3-A）

| 编号 | 文件:行 | 改动 |
|:--:|---------|------|
| **C3-A1** | `README.zh-CN.md:119-142` / `README.en.md:119-142` | CLI 层补 `setup / migrate / stage / project / model`；Core 层补 `backup/`（写前备份）、`fs/`（原子写 + 建议性文件锁）；新增一行「**框架资产全局部署**」说明。 |
| **C3-A2** | `README.zh-CN.md`（`## 核心概念` 内新增小节）/ `README.en.md` 镜像 | 新增 `### 全局部署与工作区分层`：框架资产（9 agent / 17 skill / 全局 `AGENTS.md` / 全局 `opencode.jsonc`）经 `openfeel setup` 部署到 `~/.config/opencode/`；**仓库自身不保留项目级 `.opencode/agents|skills`**（stage-55 起）；`current.md`（团队文件，≤5 条 + 归档）/ `dev_last.md`（本地索引 + 主题目录）；部署覆盖前自动备份。 |
| **C3-A3** | `README.md:19-22` | 「快速开始」补一行 `openfeel flow phases   # 查看合法 phase 与转移表`；并补一句「框架资产全局部署，项目内不再生成 `.opencode/agents\|skills`」。 |

#### 3.5 README.md 其余（C3-M）

| 编号 | 文件:行 | 现状 | 改后 |
|:--:|:--:|------|------|
| **C3-M1** | `README.md:3` | `[English](README.en.md) \| [更新日志](CHANGELOG.md) \| [npm](...)` | 追加 `\| [入门指南](docs/GETTING_STARTED.md)`（与 zh-CN/en 对齐） |
| **C3-M2** | `README.md:7` / `README.zh-CN.md:5` / `README.en.md:11` | 免责声明示例固定「如 1.1.1」 | 改为「**全局 \`openfeel\` 可能滞后于本仓（如尚未升级到 1.1.2）**」——语义不绑定具体旧版号（**待裁定 A-C3-2**，备选：保留 1.1.1 示例并加「发布 1.1.2 后仍可能滞后」说明）。 |
| **C3-M3** | 三份 README | 无版本徽标/版本行 | 仅在 `README.md` 加 `最新版本 v1.1.2`（C3-N1）；zh-CN/en 通过新增节与 CHANGELOG 链接体现，**不另加版本徽标**（控制篇幅）。 |

> **改动清单计数**：README.md 4 处（M1 / M2 / N1 / A3）；README.zh-CN.md 12 处（M2 / N2 / C1-C6 / A1 / A2 / T1）；README.en.md 12 处（镜像）。**合计 28 处（3 文件）**。

---

### C4 — 回归 + 推送验证（阶段收尾）

| 编号 | 目标 | 命令 / 动作 | 验收要点 |
|:--:|------|-------------|----------|
| **C4-1** | 本地全绿门禁 | `npm run build`（幂等，**且不复活** `.opencode/**`）｜ `npm test`（**按实测记录**：Windows 预期 986 passed / 0 skipped）｜ `npx tsc --noEmit`（0）｜ `node bin/openfeel.js lint i18n`（**726 键**，exit 0）｜ `node bin/openfeel.js lint kb`（**0 过期**）｜ `node bin/openfeel.js flow phases --json`（5 键） | 全部通过；`git status` 无 `.opencode/**` 复活；用例数写入阶段报告（不得沿用 985 快照而不说明） |
| **C4-2** | 可推送结论 | **推送前必须本地全绿**；产出「**可推送**」结论 + 命令 `git push origin master`（**本阶段不代 Feel 推送**） | 结论与命令写入报告；明确「由 Feel/用户执行推送」 |
| **C4-3** | 推送后 API 验证（Feel 执行） | `gh api repos/Liuary/OpenFeel/commits/<sha>/check-runs --jq '.check_runs[] \| {name,conclusion,id}'` 确认两 matrix job `success`；`gh api repos/Liuary/OpenFeel/check-runs/<id>/annotations --jq '.[].message'` 验证失败注解（若有失败）；`gh api repos/Liuary/OpenFeel/actions/runs/<id> --jq '{conclusion,head_sha}'`；`publish` job 状态确认 | 两 `build-and-test` success；`publish` 不再 skip（按版本门禁决定是否发布）；注解端点可读 |
| **C4-4** | 阶段报告 | 私域日志记：改动文件清单、门禁实测值、T32 拆分验证、CI 注解方案、README 改动计数、可推送结论 | 供 openfeel-reviewer / archiver 衔接 |

---

## 三、op 划分与执行顺序（3 op）

| op | 主题 | 覆盖 | 关键产出 | 依赖 |
|:--:|------|------|----------|------|
| **op-001** | **CI 修复 + 可观测性** | C1（C1-1~C1-5）+ C2（C2-1~C2-5） | `test/core/config.test.ts`（T32 拆两条）；`.github/workflows/ci.yml`（`Test` + `Test failure annotations`）；YAML 自检 + 单文件 38 passed | — |
| **op-002** | **README ×3** | C3（C3-T/N/C/A/M） | `README.md`、`README.zh-CN.md`、`README.en.md` | **hard: op-001**（测试数须以拆分后实测为准） |
| **op-003** | **回归 + 推送验证** | C4 | 五门禁实跑 + `flow phases --json` 复核 + 「可推送」结论/命令 + 阶段报告 | **hard: op-001、op-002** |

**顺序：`op-001 → op-002 → op-003`**。

> op-001 与 op-002 文件不相交，理论上可并行；但 README 测试数依赖 C1 拆分后的实测值，故 **op-002 晚于 op-001**。op-003 收口全部门禁。

**边界声明**：全程**不改 `flow.json`**、**不改实现语义**（`src/core/config.ts` 零改动）、**不代 Feel 推送**、**不创建 op 文件**。

---

## 四、风险与回滚

| # | 风险 | 影响 | 缓解 / 回滚 |
|:-:|------|------|-------------|
| R-1 | 跨平台用例在某平台仍失败 | 高（阻塞发布） | 目标路径 = `resolve(tmpDir,…)` 两平台均绝对；变体仅改受控 ASCII 尾段；C1-4 双解析片段证明 `normalizeKey` 恒等；本地 Windows 跑 38 passed。**CI 仍失败 → 由 C2 注解直接读到失败用例名** |
| R-2 | `it.skipIf` 未按预期 skip | 中（Linux 误失败） | 仓库已有 3 处 `it.skipIf` 先例（`repl.test.ts` / `backup.test.ts` / `flow-concurrent.test.ts`）；vitest 3.2.7 支持；Linux 语义为 skipped 不计 failure |
| R-3 | CI YAML 语法/缩进错误致 workflow 不解析 | 高（CI 不跑） | C2-4 `node -e yaml.parse` 自检；可选 `npx --yes actionlint .github/workflows/ci.yml`；改动限于 `ci.yml:42-45` 区域 |
| R-4 | `tee` 吞掉退出码 | 高（CI 误绿） | `set -o pipefail` 必须保留；C2-1 验收明确「管道退出码 = npm test 退出码」 |
| R-5 | 注解步骤误改 job 结论 | 中（掩盖失败/误报） | 注解步骤 `if: failure()` + 结尾 `exit 0`；`grep` 无命中不触发 `set -e`（未设 pipefail） |
| R-6 | 注解条数超上限 | 低（注解截断） | `head -n 20` 限制；API 仍可读前 20 条失败用例 |
| R-7 | README 改动与实况不符 / 膨胀 | 中 | 命令示例逐条对照 §1.4 `--help` 实测；README.md 仅 4 处改动；zh/en 对等 |
| R-8 | README 测试数与 CI 口径分歧 | 低 | 采「986 定义 + Linux 跳过 1 个」显式说明（A-C3-1）；C4 记录实测值 |
| R-9 | `npm run build` 复活 `.opencode/**` | 中 | stage-55 已删自举步骤 8；C4-1 断言 `git status` 无 `.opencode/**` 新增 |
| R-10 | 全局旧版 CLI 污染门禁 | 低 | 一律用 `node bin/openfeel.js`（本仓口径），不用裸 `openfeel` |

**回滚**：本阶段纯测试/CI/文档改动，`git revert <sha>` 即可；不涉数据迁移、不改实现，无运行时副作用。

---

## 五、不做（边界）

1. **不改 `flow.json`**（状态推进由 Feel 执行 `openfeel flow advance`）。
2. **不代 Feel 推送**（仅给「可推送」结论与命令）。
3. **不改实现语义**（`src/core/config.ts:284/307` 不动；`normalizeKey` 去重行为不变）。
4. **不创建 op 文件**（由 openfeel-schemer 产出）。
5. **不执行 `npm publish`**（发布由用户决定）。
6. **不引入 CI 结构性重构**（不拆 job、不换 runner、不改 coverage/guard 步骤语义）。
7. **不新增 README 徽标/长文**（控制篇幅）。

---

## 六、裁定表

| # | 议题 | 建议结论 | 依据 | 状态 |
|:-:|------|----------|------|------|
| **A-C1-1** | T32 拆分实现路径 | 采用 §2.1（受控尾段变体 + `it.skipIf` 守卫）；**不**用 `resolve(tmpDir).toUpperCase()` 全路径大写（避免非 ASCII 前缀往返） | 跨平台论证 §2.1 | planner 建议 + 待确认 |
| **A-C1-2** | 是否顺带补一条 Linux CI 假信号断言 | **不补**（避免过度设计）；由 C2 注解兜底 | 用户「静态扫描无法完全排除」 | planner 建议 + 待确认 |
| **A-C2-1** | 注解步提取范围 | 提取 `×` / `FAIL` / `Failed Tests`，上限 20 条 | API 可读性 + 注解上限 | planner 建议 + 待确认 |
| **A-C2-2** | 是否上传 `test.log` 为 artifact | **不加**（artifact 下载仍需认证，不满足「API 可读」诉求；且增加步骤） | 用户诉求为注解可读 | planner 建议 + 待确认 |
| **A-C3-1** | README 测试数口径 | 「986 用例 / 59 文件；Linux CI 跳过 1 个 Windows 专属用例」；备选「985+ 用例」 | C1 拆分后实测 | planner 建议 + 待确认 |
| **A-C3-2** | 免责声明旧版示例 | 改为「可能滞后于本仓（如尚未升级到 1.1.2）」；备选保留 1.1.1 示例 | 发布后避免示例过期 | planner 建议 + 待确认 |
| **A-C3-3** | 是否加版本徽标 | **不加**（仅 README.md 版本行 + CHANGELOG 链接） | 控制篇幅 | planner 建议 + 待确认 |
| **A-C4-1** | 推送执行者 | **Feel/用户执行**；planner/executor 不代推 | 用户指令 | **已确定** |
| **A-C4-2** | `publish` job 处置 | 不动 `publish` 逻辑；CI 绿后由其版本门禁决定是否发布 | 不改判定语义 | planner 建议 + 待确认 |

---

## 七、验收标准（阶段级）

1. **C1**：T32 已拆为「跨平台」+「Windows 专属（`it.skipIf`）」两条；跨平台用例在 win32/posix 双解析模拟下均成立；`src/core/config.ts` 零 diff；单文件 Windows **38 passed**。
2. **C2**：`ci.yml` 测试步骤 `set -o pipefail` + `tee $RUNNER_TEMP/test.log`；新增 `if: failure()` 注解步骤；YAML 自检 `YAML OK`；成功/失败判定仍由 `npm test` 退出码决定；Env guard 四路径不受影响。
3. **C3**：三份 README 更新（合计 28 处）；命令示例与 `--help` 实测一致；zh-CN 与 en 对等；README.md 保持落地页（≤ ~35 行）。
4. **C4**：`build` 幂等且不复活 `.opencode/**` ｜ `npm test` 按实测全绿（Windows 预期 986 passed / 0 skipped）｜ `tsc` 0 ｜ `lint i18n` 726 键 ｜ `lint kb` 0 过期 ｜ `flow phases --json` 5 键；给出「可推送」结论与命令；**未代 Feel 推送**。
5. **无越界**：未改 `flow.json`；未改实现语义；未创建 op 文件；未执行 `npm publish`。

---

## 八、修订记录

| 时间 | 制定人 | 版本 | 说明 |
|------|--------|------|------|
| 2026-10-02 | openfeel-planner | v1 | 初稿：依据 CI run #51（`f178600`）失败证据 + 单文件实测，细化 C1~C4；T32 拆分方案（受控尾段变体 + `it.skipIf`，含双解析论证）；CI 注解方案（`pipefail` + `tee` + `if: failure()` 提取）；README 逐处清单 28 处；3 op（CI / README / 回归）；裁定 A-C1-1~A-C4-2 |
| 2026-10-02 | openfeel-planner | v1.1 | **REV-001**：修正 §2.1 论证要点 2 措辞（前缀仅**大小写**逐字符不变；前缀**分隔符**经 `\→/` 归一，与 `normalizeKey`（`:307`）幂等，故不影响相等性，实测 `equal=true`）——原「前缀逐字符保持不变」不准确 |
