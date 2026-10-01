# v1.1.2-stage-59 计划 — 修复 CI 环境守卫误报（让 CI 转绿并发布）

- **阶段**：`v1.1.2-stage-59`
- **依赖**：`hard: v1.1.2-stage-58`（已归档；本阶段在其后执行，修复 stage-58 引入的运行日志在 CI 守卫窗口内产生的副作用）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-02
- **定位**：修复 CI run #52（commit `cacbefb`）`Env guard (after test — must be unchanged)` **误报**，使 `build-and-test` 两 matrix job 转绿、`publish` job 不再被 skip，从而完成 1.1.2 发布。**改动限定 `.github/workflows/ci.yml`（单一文件）+ 验证/回归**，不改任何实现语义、不改 `flow.json`。
- **范围约束**：不改 `src/**`（零实现语义变更）；不改 `flow.json`；**不代 Feel 推送**；**不执行 `npm publish`**（由 CI 自动）；不创建 op 文件（由 openfeel-schemer 产出）。
- **KB 检索**：已加载 `openfeel-check-kb`。相关条目：
  - `kb/patterns.md #环境哈希守卫（CI 层）`（**直接命中**：其「窗口纪律」段落原文即写「窗口内的其它 step 若写全局则**漏检**（本案 `Version consistency guard` / `lint i18n` 实测只读，故可容忍；后续新增 step 须重新评估窗口）」——stage-58 新增运行日志使该前提失效，本条**须由归档官后续 supersede/更新**）。
  - `kb/troubleshooting.md #默认开启写真实用户目录的副作用防护`（**直接命中**：`OPENFEEL_LOG=0` 的语义与「库侧默认 no-op + 入口 install」隔离范式）。
  - `kb/patterns.md #CI 失败可观测性`、`#测试 cwd 隔离与反向守卫`、`#零行为变更验证方法`、`kb/architecture.md #四类日志边界`。
  - **知识库缺口**：KB 未收「CI 守卫窗口内步骤的副作用盘点纪律」独立条目 → 本阶段完成后由归档官在既有「环境哈希守卫」条目中同步/补记。

---

## 一、背景与实测证据（唯一事实基准）

### 1.1 CI 失败证据（GitHub API，run #52 / commit `cacbefb`）

| 项 | 实测 |
|----|------|
| `build-and-test`（Node 20.x） | **failure** — 失败步骤 = `Env guard (after test — must be unchanged)`；注解 `环境被测试改动：/home/runner/.openfeel`；`npm test` 本步**通过** |
| `build-and-test`（Node 22.x） | **cancelled**（矩阵 fail-fast） |
| `publish` | **skipped**（`needs: build-and-test` 失败）→ **1.1.2 未发布** |
| 本机干净 HOME 决定性实验（Windows，机制跨平台） | 仅跑 `node bin/openfeel.js --version` + `lint i18n` → 生成 `$HOME/.openfeel/`、`cli/logs/openfeel-*.log`、`locks/`；加 `OPENFEEL_LOG=0` → **零写入**；**只跑 `npm test`**（不跑那两条 bin）→ **零写入** |

### 1.2 根因（**非测试污染**，已读代码 + 实验双重确认）

`.github/workflows/ci.yml` 的 `build-and-test` job 步骤顺序（修复前）：

```
Env snapshot (before test)      ci.yml:19-32
Version consistency guard       ci.yml:33-41   ← node bin/openfeel.js --version
node bin/openfeel.js lint i18n  ci.yml:42      ← lint i18n
Test (npm test)                 ci.yml:43-48
Test failure annotations        ci.yml:50-68
Coverage report                 ci.yml:69-70
Env guard                       ci.yml:71-87
```

- **stage-58 新增的「运行日志默认开启」** 使 `bin/openfeel.js` 每次运行：`installRuntimeLog()`（`bin/openfeel.js:11`）→ `runCli()` 首行 `runtimeLog('info','cli start: …')`（`src/cli/index.ts:194`）→ `runtimeLog()` 执行 `mkdirSync(~/.openfeel/cli/logs)` + `withFileLock(~/.openfeel/locks/runtime-log.lock)` + `appendFileSync`（`src/core/runtime-log.ts:109-113`）。
- 干净 runner 上 `~/.openfeel` 快照前 = **ABSENT**、快照后 = **存在（含 `cli/logs/*.log`、`locks/`）** → `Env guard` 判 diff 非空 → **误报**（变化来自守卫窗口内的**非测试步骤** `Version consistency guard` 与 `lint i18n`，而非 `npm test`）。
- `runCli` 的 `runtimeLog('cli start')` 位于 `program.parse()` **之前**（`src/cli/index.ts:194`），故 `--version` 这类 parse 期即退出的命令**同样写日志**。
- 运行日志开关解析：`resolveRuntimeLogConfig`（`src/core/runtime-log.ts:76-88`）——`OPENFEEL_LOG === '0'` **即关闭**，关闭后 `runtimeLog` 首行 early-return（`:100-102`），**不 mkdir、不加锁、不写盘**。

### 1.3 对照：修复前必然非空 / 测试侧确已隔离

- **修复前**（现行顺序 + 无 `OPENFEEL_LOG=0`）：窗口内 `--version` + `lint i18n` 写 `~/.openfeel/**` → `ABSENT → 存在` → diff 非空 → 必然误报。
- **测试侧**：stage-58 的 spawn 测试均带 `HOME` 隔离 + `OPENFEEL_LOG:'0'`（`test/cli/repl.test.ts:25`）；in-process 测试从不调用 `install*`（库侧默认 no-op）→ **只跑 `npm test` 零写真实 HOME**（本机实验已证）。
- 结论：修复方向 = ① 消除守卫窗口内非测试步骤的副作用（注入 `OPENFEEL_LOG=0`）；② 防御性收紧窗口（快照下移到紧贴 `Test` 之前）。

---

## 二、精确改动表（`.github/workflows/ci.yml`，单一文件）

> 行号以修复前实盘为准（已读文件 121 行）。**不新增 job、不拆 job、不改判定语义、不改 coverage/注解步骤**。

### 2.1 注入 `OPENFEEL_LOG: '0'`（消除守卫窗口内副作用）

| # | 位置（修复前） | 现状 | 改后 | 说明 |
|:-:|----------------|------|------|------|
| **M1** | `ci.yml:33-34`（`build-and-test` → `Version consistency guard`） | `- name: Version consistency guard`<br>`  run: |` | `- name: Version consistency guard`<br>`  env:`<br>`    OPENFEEL_LOG: '0'`<br>`  run: |` | 保留步骤名与 body；仅加 `env`。`node bin/openfeel.js --version` 不再写 `~/.openfeel` |
| **M2** | `ci.yml:42`（`build-and-test` → `lint i18n`） | `- run: node bin/openfeel.js lint i18n` | `- env:`<br>`    OPENFEEL_LOG: '0'`<br>`  run: node bin/openfeel.js lint i18n` | 保持匿名 `run` 步骤（不改名、不改语义）；该两条 bin 调用是窗口内唯一的写盘来源 |
| **M3** | `ci.yml:113-115`（`publish` → `Version consistency guard`） | `- name: Version consistency guard`<br>`  if: steps.version.outputs.changed == 'true'`<br>`  run: |` | `- name: Version consistency guard`<br>`  if: steps.version.outputs.changed == 'true'`<br>`  env:`<br>`    OPENFEEL_LOG: '0'`<br>`  run: |` | 该 job **不触发本守卫**，但 `--version` 同样会写真实 HOME（干净 runner）→ 同样注入，保持一致性与无副作用 |

> `OPENFEEL_LOG: '0'` 为字符串（YAML 中避免被解析为数字 0）；`resolveRuntimeLogConfig` 以 `=== '0'` 严格比较，字符串 `'0'` 精确命中（`runtime-log.ts:78`）。

### 2.2 下移 `Env snapshot (before test)`（防御性收紧窗口）

| # | 位置（修复前） | 现状 | 改后 |
|:-:|----------------|------|------|
| **M4** | `ci.yml:19-32` | `Env snapshot (before test)` 步骤位于 `Version consistency guard` / `lint i18n` **之前** | **整步剪切**，原样粘贴到 `lint i18n`（`:42`）**之后**、`Test`（`:43`）**之前**；步骤名不变；`snapshot()` 内注释更新为「守卫窗口起点：紧贴 `Test` 之前」 |

**移后步骤顺序**：

```
npm ci
npm run build
Version consistency guard      (env OPENFEEL_LOG=0)   ← M1
node bin/openfeel.js lint i18n (env OPENFEEL_LOG=0)   ← M2
Env snapshot (before test)                            ← M4（下移到此）
Test (npm test)
Test failure annotations
Coverage report
Env guard (after test — must be unchanged)            ← after 快照仍在 Test + Coverage 之后
```

**不削弱守卫意义（评估结论：不会）**：守卫目标是「**测试不得污染真实环境**」。下移后窗口 = `Test` + `Test failure annotations` + `Coverage report`，**恰为目标范围**；且 `Env guard` 的 after 快照仍在 `Coverage` 之后（`ci.yml:71`），保证窗口覆盖完整测试阶段。原窗口包含非测试步骤本就属「漏检/误报面」，下移是**收紧**而非削弱。同时，M1/M2 已消除窗口内副作用，M4 为**独立第二道防线**——即便未来再插入其它 `bin` 调用，只要置于快照之前即不误判（若插在快照之后，M1 的 env 注入范式仍可复用）。

---

## 三、守卫健壮性补强（可选，**建议纳入**）

### 3.1 现状与问题

`snapshot()`（`ci.yml:22-30`）与 `Env guard` 存在分支（`ci.yml:78-82`）用：

```sh
find "$d" -type f -print0 2>/dev/null | sort -z | xargs -0 sha256sum 2>/dev/null | sort > "$f"
```

当目录**存在但无文件**时，管道输出为空 → `$f` 为**空文件**；与另一路径的显式 `echo "ABSENT"`（内容为 `ABSENT\n`）在语义上易混淆——「空清单」与「ABSENT」无法从文件内容直观区分，调试时归因成本高。

### 3.2 最小加固方案（两态表示 + 空清单固定标记）

统一快照格式为**三态确定表示**（本质仍是「不存在 / 存在」两态，存在态含清单或空标记）：

| 目录状态 | 快照内容 |
|----------|----------|
| 不存在 | `ABSENT`（单行） |
| 存在且无文件 | `EXISTS-EMPTY`（单行固定标记） |
| 存在且有文件 | 逐文件 `sha256sum` 清单（原格式，`sort`） |

`before` 快照与 after 守卫**两处必须同批改为相同逻辑**（读写同批，避免格式分叉）。

**必要性**：① 消除「空输出」歧义，使 diff 报告直接可读（`ABSENT` vs `EXISTS-EMPTY` vs 清单）；② 与 M4 配合，使「目录被创建但无文件」这类边界变化有明确表示；③ 成本极小（各 3~4 行 shell），不引入新依赖、不改判定框架。**不过度设计**：不引入哈希聚合、不改 diff 语义、不增加第四态。

### 3.3 精确改法

| # | 位置（修复前） | 改后 |
|:-:|----------------|------|
| **M5** | `ci.yml:22-30`（`snapshot()` exists 分支） | 见 §3.4 代码块（`snapshot()` 全函数） |
| **M6** | `ci.yml:78-82`（`Env guard` exists 分支） | 见 §3.4 代码块（`env guard` 循环体） |

### 3.4 加固后代码（替换文本）

**`snapshot()`（M5，随 M4 一起移动到 `Test` 之前）**：

```yaml
      - name: Env snapshot (before test)
        run: |
          # 守卫窗口起点：紧贴 Test 之前；此前 Version consistency guard / lint i18n 均已注入 OPENFEEL_LOG=0
          # 快照三态：ABSENT（不存在）/ EXISTS-EMPTY（存在但无文件）/ 逐文件 sha256 清单
          snapshot() {
            for d in "$HOME/.openfeel" "$HOME/.config/opencode" "$HOME/.config/openfeel" "./.openfeel/config.yaml"; do
              key=$(echo "$d" | tr '/.' '__')
              if [ -e "$d" ]; then
                manifest=$(find "$d" -type f -print0 2>/dev/null | sort -z | xargs -0 sha256sum 2>/dev/null | sort)
                if [ -n "$manifest" ]; then printf '%s\n' "$manifest" > "$RUNNER_TEMP/snap_before_$key"; else echo "EXISTS-EMPTY" > "$RUNNER_TEMP/snap_before_$key"; fi
              else
                echo "ABSENT" > "$RUNNER_TEMP/snap_before_$key"
              fi
            done
          }
          snapshot
```

**`Env guard` 存在性分支（M6）**：

```yaml
          for d in "$HOME/.openfeel" "$HOME/.config/opencode" "$HOME/.config/openfeel" "./.openfeel/config.yaml"; do
            key=$(echo "$d" | tr '/.' '__') ; f="$RUNNER_TEMP/snap_after_$key"
            # 三态表示与 before 快照一致：ABSENT / EXISTS-EMPTY / 逐文件 sha256 清单
            if [ -e "$d" ]; then
              manifest=$(find "$d" -type f -print0 2>/dev/null | sort -z | xargs -0 sha256sum 2>/dev/null | sort)
              if [ -n "$manifest" ]; then printf '%s\n' "$manifest" > "$f"; else echo "EXISTS-EMPTY" > "$f"; fi
            else
              echo "ABSENT" > "$f"
            fi
            if ! diff -u "$RUNNER_TEMP/snap_before_$key" "$f" >/dev/null; then
              echo "::error::环境被测试改动：$d"; diff -u "$RUNNER_TEMP/snap_before_$key" "$f" || true; fail=1
            fi
          done
```

---

## 四、CI 失败注解（stage-57 已加）保持不动

- 本阶段**不新增步骤**（仅对既有步骤加 `env`、移动既有 `Env snapshot` 步骤位置）→ **注解覆盖面无变化**，`Test failure annotations`（`ci.yml:50-68`，`if: failure()` + `exit 0`）**保持原样**。
- 移动 `Env snapshot` 后，若其自身因语法/命令错误失败，`if: failure()` 注解仍会运行（job 级 `failure()`），但该步骤无测试日志可读 → 走 `::warning::未找到测试日志` 分支并 `exit 0`（既有兜底，无需改）。
- `Version consistency guard` / `lint i18n` 的失败仍输出各自 `::error::`（`ci.yml:40` / lint 非 0 退出）→ 注解可读性不受影响。

---

## 五、验证方式（关键）：在 WSL / Linux 上本地复现并证明守卫会转绿

> 本机为 Windows（无 Docker 亦可）；已确认存在 **WSL Ubuntu-24.04**。下列步骤在 WSL bash 中执行。若 WSL 未装 Node，先 `nvm`/`apt` 安装 Node ≥20。仓库路径示例 `REPO=/mnt/c/Users/Liuary/Dev/Mine/AI/OpenFeel`。

### 5.1 复现脚本（抽取守卫逻辑，隔离 HOME）

```bash
REPO=/mnt/c/Users/Liuary/Dev/Mine/AI/OpenFeel
cd "$REPO"
export REAL_HOME="$HOME"

# 抽取后的「与 ci.yml 三态判定逻辑等价」的快照函数（为演练便利，输出组织/标记格式较 ci.yml 简化；正式演练以 op-001 §三脚本为准，其命名与标记格式与 ci.yml 逐字一致）
snap() { # $1=out
  local f="$1"; : > "$f"
  for d in "$HOME/.openfeel" "$HOME/.config/opencode" "$HOME/.config/openfeel" "$REPO/.openfeel/config.yaml"; do
    key=$(echo "$d" | tr '/.' '__')
    if [ -e "$d" ]; then
      m=$(find "$d" -type f -print0 2>/dev/null | sort -z | xargs -0 sha256sum 2>/dev/null | sort)
      if [ -n "$m" ]; then printf '%s\n' "$m" >> "$f"; else echo "EXISTS-EMPTY:$key" >> "$f"; fi
    else
      echo "ABSENT:$key" >> "$f"
    fi
  done
}

clean_home() { export HOME="$(mktemp -d)"; export USERPROFILE="$HOME"; export XDG_CONFIG_HOME="$HOME/.config"; }
```

**前置**：`npm ci && npm run build`（在 WSL 内，产物一致）。

### 5.2 修复后流程（期望：diff 为空）

```bash
clean_home
snap "$HOME/before.txt"
OPENFEEL_LOG=0 node bin/openfeel.js --version
OPENFEEL_LOG=0 node bin/openfeel.js lint i18n
npm test
snap "$HOME/after.txt"
diff -u "$HOME/before.txt" "$HOME/after.txt" && echo "GUARD-GREEN: empty diff ✅"
export HOME="$REAL_HOME"
```

### 5.3 决定性对照（证明修复有效）

在**每次全新干净 HOME** 下分别执行三组，对照 `before/after` diff：

| 场景 | 步骤顺序 | `OPENFEEL_LOG=0` | 期望 diff | 含义 |
|:--:|----------|:--:|:--:|------|
| **S1（修复后）** | 快照在 `--version`/`lint` **之后** | 注入 | **空** | ✅ 新配置转绿 |
| **S2（仅移快照）** | 快照在 `--version`/`lint` 之后 | **不注入** | **空** | 证明「下移窗口」本身即可消除误报（第二道防线独立有效） |
| **S3（修复前）** | 快照在 `--version`/`lint` **之前** | 不注入 | **非空**（含 `cli/logs/*.log`、`locks/`） | ❌ **复现 CI run #52 失败**，反证 M1/M4 必要 |

S3 操作示意：

```bash
clean_home
snap "$HOME/before.txt"
node bin/openfeel.js --version          # 无 OPENFEEL_LOG=0
node bin/openfeel.js lint i18n
snap "$HOME/after.txt"
diff -u "$HOME/before.txt" "$HOME/after.txt"   # 必须非空（ABSENT → 清单），复现 CI 失败
```

> 若 `npm test` 全量在 WSL 过慢（/mnt/c IO），可用「**最小窗口复现**」替代：仅比较 `--version` + `lint i18n` 两步的 before/after（这正是误报来源）；`npm test` 的零写盘已有 stage-58 铁证（真实 `~/.openfeel/cli/logs/` 前后 mtime+SHA256 零变化）。**建议两者都做**，全量作为最终确认。

### 5.4 CI 侧最终确认（Feel 执行，推送后）

```bash
gh api repos/Liuary/OpenFeel/commits/<sha>/check-runs --jq '.check_runs[] | {name,conclusion,id}'
# 期望：两个 build-and-test = success；publish 不再 skipped
gh api repos/Liuary/OpenFeel/actions/runs/<id> --jq '{conclusion,head_sha}'
# 若有失败：gh api repos/Liuary/OpenFeel/check-runs/<id>/annotations --jq '.[].message'
```

---

## 六、回归门禁（阶段级）

| 门禁 | 命令 | 基线/期望 |
|------|------|-----------|
| 构建幂等 | `npm run build` | 成功；`git status` **不复活** `.opencode/**` |
| 类型 | `npx tsc --noEmit` | **0** |
| 测试 | `npm test` | **61 文件 / 1018 用例 / 0 skipped**（stage-58 基线；本阶段仅改 `ci.yml`，不新增/删用例） |
| i18n | `node bin/openfeel.js lint i18n` | **730 键**，exit 0 |
| KB | `node bin/openfeel.js lint kb` | **0 过期** |
| YAML 自检 | `node -e "require('yaml').parse(require('fs').readFileSync('.github/workflows/ci.yml','utf8'));console.log('YAML OK')"` | `YAML OK`（缩进 / `|` 块 / `${{ }}` 无解析错误） |
| 守卫本地演练 | §5.2 + §5.3（S1 空 / S2 空 / S3 非空） | S1/S2 diff 空；S3 diff 非空（复现失败） |

> **基线不变说明**：本阶段不触碰 `src/**`、`test/**`、`package.json` → 上述门禁数值**必须与 stage-58 归档基线逐字一致**；任一漂移即视为越界，须回滚。

---

## 七、op 划分与执行顺序（2 op）

| op | 主题 | 覆盖 | 关键产出 | 依赖 |
|:--:|------|------|----------|------|
| **op-001** | **CI 修复（守卫误报）** | M1~M6（`ci.yml`：3 处 `OPENFEEL_LOG=0` 注入 + 快照下移 + 三态加固） | `.github/workflows/ci.yml`；YAML 自检；WSL 守卫脚本演练（S1/S2 空 + S3 非空） | — |
| **op-002** | **回归 + 可推送结论 + 阶段报告** | §五验证（完整 §5.2 + 对照 §5.3）+ §六门禁 + 报告 | 门禁实测值；守卫窗口验证记录；「**可推送**」结论与命令 + CI 侧确认步骤；阶段报告 | **hard: op-001** |

**顺序：`op-001 → op-002`。**

> 单文件改动 + 独立验证，无需更多 op。CI 实际运行 + `npm publish` 由 Feel 推送后由 CI 自动完成（§5.4），**不在本阶段执行**。

**边界声明**：全程**不改 `src/**`/`test/**`**、**不改 `flow.json`**、**不改实现语义**（运行日志默认开启为用户裁定，保留）、**不代 Feel 推送**、**不执行 `npm publish`**、**不创建 op 文件**、**不新增 job/步骤**。

---

## 八、风险与回滚

| # | 风险 | 影响 | 缓解 / 回滚 |
|:-:|------|------|-------------|
| R-1 | 移动 `Env snapshot` 步骤致 YAML 缩进/顺序错误 | 高（CI 不解析或不运行） | `op-001` YAML 自检（`YAML OK`）；改动仅限 `ci.yml` 单文件；`git diff` 逐行复核步骤顺序 |
| R-2 | `OPENFEEL_LOG: '0'` 被 YAML 解析为数字 `0` | 中（守卫失败） | 显式加引号 `'0'`；`resolveRuntimeLogConfig` 严格 `=== '0'`；YAML 自检 + 本地演练 S1 验证 |
| R-3 | 快照下移削弱守卫（漏检窗口内非测试步骤） | 低（语义已评估） | 守卫目标 = 测试不污染真实环境；窗口 = Test + annotations + Coverage（目标范围）；M1 已消除非测试步骤副作用；S2 独立证明 |
| R-4 | 三态加固在两处（before/after）逻辑分叉 | 中（diff 误报） | M5/M6 **同批修改**且逐字一致；`op-001` 用同一 `snap()` 函数本地演练三场景 |
| R-5 | 未来步骤再插入 `bin` 调用致误报复发 | 中 | M1 建立「窗口内 bin 步骤须 `OPENFEEL_LOG=0`」范式；M4 下移快照使「插在快照前」的步骤不误判；归档官在 KB「环境哈希守卫」条目补记纪律 |
| R-6 | 本地 WSL 无 Node / `/mnt/c` IO 慢 | 低（验证受阻） | 可用「最小窗口复现」（仅 `--version` + `lint`）替代全量；或按 §5.4 交由 CI 侧最终确认 |
| R-7 | `publish` job 的 `Version consistency guard` 加 env 后行为改变 | 极低 | 仅关闭日志写盘，版本比对逻辑不变；`if:` 条件与 body 零改动 |

**回滚**：单一文件改动，`git checkout <sha> -- .github/workflows/ci.yml` 或 `git revert <sha>` 即可；不涉数据迁移、不改运行时、无依赖变更。

---

## 九、不做（边界）

1. **不改 `flow.json`**（状态推进由 Feel 执行 `openfeel flow start`/`advance`）。
2. **不改实现语义**（运行日志默认开启是用户裁定，保留；`OPENFEEL_LOG` 开关既有语义不动）。
3. **不改 `src/**` / `test/**` / `package.json` / `package-lock.json`**。
4. **不代 Feel 推送**（仅给「可推送」结论与命令）。
5. **不执行 `npm publish`**（由 CI 自动）。
6. **不创建 op 文件**（由 openfeel-schemer 产出）。
7. **不新增/重排 job、不拆 job、不改 coverage 与注解步骤语义**。
8. **不改 stage-57 失败注解**（保持不动；本阶段不新增步骤，覆盖面无变化）。
9. **不新增第三方依赖 / 不改 CI runner / 不改 Node matrix**。
10. **不修改 KB / manual**（KB「环境哈希守卫」条目更新归 openfeel-archiver；本阶段仅产出建议）。

---

## 十、裁定表

| # | 议题 | 建议结论 | 依据 | 状态 |
|:-:|------|----------|------|------|
| **A-1** | `lint i18n` 步骤是否改名（如 `Lint i18n`）以便观测 | **不改名**，仅加 `env`，保持匿名 `run` 步骤，满足「步骤语义不变」 | 用户要求「保持步骤语义不变」 | planner 建议 + 待确认 |
| **A-2** | 守卫空清单加固是否纳入 | **纳入**（三态：`ABSENT` / `EXISTS-EMPTY` / 清单），最小改动、不引入第四态 | 用户建议纳入；防同类误报/归因困难 | planner 建议 + 待确认 |
| **A-3** | 是否下移 `Env snapshot` | **下移**至 `lint i18n` 后、`Test` 前 | 用户要求 + §2.2 评估「不削弱守卫」 | 用户已裁定 |
| **A-4** | `publish` job 的 `Version consistency guard` 是否注入 env | **注入 `OPENFEEL_LOG=0`** | 同样写真实 HOME；一致性 | 用户已裁定 |
| **A-5** | 是否复用 `test:coverage` 作为窗口一部分 | **保持不动**（after 快照仍在其后） | 用户要求确认 after 在 Test+Coverage 之后 | 用户已裁定 |
| **A-6** | KB「环境哈希守卫」窗口纪律条目 | 本阶段**不改**；归档官 **supersede/更新**（stage-58 使 `--version`/`lint i18n` 不再只读） | kb 同步归归档阶段 | planner 建议 + 待确认 |
| **A-7** | 是否更新 `CHANGELOG` | **不做**（`ci.yml` 不入 npm tarball，不影响发布产物） | 范围最小化 | planner 建议 + 待确认 |
| **A-8** | 验证环境 WSL vs 纯 CI | **WSL 本地 + 推送后 CI 双确认** | 用户要求「本地验证守卫会转绿」 | planner 建议 + 待确认 |

---

## 十一、验收标准（阶段级）

1. **M1~M3**：`build-and-test` 的 `Version consistency guard`/`lint i18n` 与 `publish` 的 `Version consistency guard` 均含 `env: OPENFEEL_LOG: '0'`；步骤语义（名/体/`if`）不变。
2. **M4**：`Env snapshot (before test)` 位于 `lint i18n` 之后、`Test` 之前；`Env guard` 仍在 `Coverage` 之后。
3. **M5/M6**：`snapshot()` 与 `Env guard` 均实现三态（`ABSENT`/`EXISTS-EMPTY`/清单），两处逻辑逐字一致。
4. **注解**：`Test failure annotations` 保持不动；本阶段未新增步骤。
5. **验证**：WSL 本地 §5.2 与 §5.3 复现成立——S1 diff 空、S2 diff 空、S3 diff 非空（复现 run #52）；给出 CI 侧 `<sha>`/`<id>` 确认步骤。
6. **门禁**：`build` 幂等且不复活 `.opencode/**` ｜ `npm test` **61 文件 / 1018 用例 / 0 skipped** ｜ `tsc` 0 ｜ `lint i18n` 730 键 ｜ `lint kb` 0 过期 ｜ YAML 自检 `YAML OK`。
7. **无越界**：未改 `flow.json`、`src/**`、`test/**`、实现语义；未代 Feel 推送；未 `npm publish`；未新增依赖；未创建 op 文件。

---

## 十二、修订记录

| 时间 | 制定人 | 版本 | 说明 |
|------|--------|------|------|
| 2026-10-02 | openfeel-planner | v1 | 初稿：确认 CI run #52 (`cacbefb`) 根因（守卫窗口内 `--version`/`lint i18n` 因 stage-58 运行日志写真实 HOME）；M1~M6 精确改动（3 处 `OPENFEEL_LOG=0` + 快照下移 + 三态加固）；WSL 本地三场景对照验证；2 op（CI 修复 / 回归+结论）；裁定 A-1~A-8 |
