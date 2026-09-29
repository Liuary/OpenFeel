# v1.1.2-stage-49 U3 审查报告 — 配置与画像（config / global-paths / workspace）

> **审查人**：openfeel-reviewer（GLM 异种推理） | **日期**：2026-09-29 | **方案**：`.openfeel/plan/v1/stage-49/ops/op-003.md`
> **范围（7 文件）**：`src/core/config.ts`、`src/core/global-paths.ts`、`src/core/model-config.ts`、`src/core/opencode-config.ts`、`src/core/workspace/{identity,knowledge,structure}.ts`

## 一、取证方法与环境

| 要素 | 值 |
|------|-----|
| 环境 | Windows 11 / pwsh 7 / Node v24.18.1 / 仓库基线 `20670b8 chore: 阶段归档 v1.1.2-stage-48` |
| dist | `dist/core/config.js` LastWriteTime 22:18:40 晚于 `src/core/config.ts` 22:01:20（新鲜） |
| 隔离手段 | 进程内动态切换 `process.env.USERPROFILE`/`HOME`（`os.homedir()` 每次调用重读环境）；CLI 用 `spawnSync` 传隔离 env |
| 真实环境保护 | 真实 `~/.config/openfeel/profile.yaml` SHA-256 前后一致（`21FABBE…`）；`~/.openfeel/config.json`（`BF7216B…`）；仓库 `.openfeel/config.yaml` 三值 `auto`/`enabled`/`true` 未触碰 |
| 实测脚本 | `%TEMP%\opencode\rev-u3-isolated.mjs`（Case A/B/C/E/F）+ `rev-u3b-status-cli.mjs`（Case D/G）+ 内联污染验证 |

前置三步：① 完整 read op-003 ✓；② `node bin/openfeel.js flow current` → 阶段 v1.1.2-stage-49 合法 ✓；③ 级联落点 `rg "buildCascadeConfig|resolveEffectiveConfig" src/core/flow-manager.ts` → :1575/:1591/:1662/:1663 ✓。

## 二、级联解析矩阵（4 来源 × 12 组合，全部隔离实测）

**结论：优先级口径 `builtin < profile.yaml（显式键）< 项目 config.yaml defaults < 当前阶段 status.md` 实测全部成立；`resolveEffectiveConfig` 与 `buildCascadeConfig` 同源（后者唯一复用点，flow-manager.ts:1663）✓。**

| # | profile.yaml | 项目 config.yaml | status.md | execution_mode | auto_advance | test_enabled | merge_mode | 判定 |
|---|---|---|---|---|---|---|---|---|
| C1 | — | — | — | manual/builtin | disabled/builtin | false/builtin | manual/builtin | ✓ |
| C2 | `preferences.auto_advance: enabled` | — | — | manual/builtin | **enabled/profile.yaml** | false/builtin | manual/builtin | ✓ |
| C3 | 同 C2 | defaults: auto/disabled/true | — | **auto/config.yaml** | **disabled/config.yaml** | **true/config.yaml** | manual/builtin | ✓ config 覆盖 profile |
| C4 | preferences 无 auto_advance 键 | meta only（无 defaults） | — | manual/builtin | disabled/**builtin** | — | — | ✓ **BUG-003 回归通过**（未显式声明不兜底） |
| C5 | 非法 YAML | — | — | 全 builtin | — | — | — | ✓ 解析失败→落 builtin |
| C6 | 合法（enabled） | 非法 YAML | — | manual/builtin | **enabled/profile.yaml** | — | — | ✓ config 非法不阻断 |
| C8 | 合法 | `test_enabled: 1`、`merge_mode: manual` | — | — | enabled/profile.yaml | **"1"/config.yaml** | manual/config.yaml | ⚠ 值未校验（见 U3-03） |
| G1 | enabled | auto/disabled | 执行模式: auto + 自动推进: enabled | **auto/status.md** | **enabled/status.md** | false/builtin | manual/builtin | ✓ status.md 全胜 |
| G2 | enabled | auto_advance: disabled | 仅执行模式: auto | **auto/status.md** | **disabled/config.yaml** | — | — | ✓ 逐键独立判源 |
| G3 | enabled | disabled | `Auto`/`Enabled`（大小写不符） | manual/builtin | disabled/config.yaml | — | — | ✓ 正则不匹配不覆盖 |
| G4 | enabled | disabled | 全角冒号 `：` | **manual/status.md** | **disabled/status.md** | — | — | ✓ `[：:]` 命中 |
| G5 | enabled | disabled | （flow.json 无 current.stage） | manual/builtin | disabled/config.yaml | — | — | ✓ 无 stage 跳过 status 层 |

**CLI 来源标注实测（`config effective`，含 builtin）**：D1 三层组合四键标注与 in-process 完全一致（`[来源: status.md]`/`[来源: config.yaml]`/`[来源: builtin]`）；单键查询 ✓；未知键 exit 1 + 干净报错 ✓；i18n 模板 `config.effective.row` 含 `{source}` 占位（zh-CN.ts:639 / en.ts:604）✓。`effective`（buildCascadeConfig 合并结果）唯一其它消费方 `commands/flow.ts:105`（verbose 展示）语义正确，无误用。

**同源性细分**：`resolveEffectiveConfig` ⟵ `buildCascadeConfig` ✓ 同源；但 `buildCascadeConfig` 的 configDefaults 层**自行 parseYaml + String()，绕过 ConfigDefaultsSchema**（flow-manager.ts:1616-1621），与 `readConfig`（Zod 校验）不同源 → 产生 U3-03。

## 三、逐项结论

### 1. 画像读写 ✓（2 项发现）
- **passthrough 往返保留 ✓（实测 A1/A2）**：`user.customField`、`preferences.myExtra`、`history.extraNote`、顶层 `topExtra` 在 read→modify→write 往返中全部保留；嵌套 Schema `.passthrough()`（stage-48 op-005）生效。
- **非法 YAML 不覆盖 ✓（实测 B1-B3，stage-48 op-005 回归）**：`ensureProfileDefaults` → 字节不变 + `console.warn`（含路径与原因）；`readProfile.parseError` 标记 ✓；`config set --global` exit 1 + 「已拒绝写入以避免覆盖现有文件」✓（commands/config.ts:195-199）。
- **U3-02 浅拷贝污染（medium）**：config.ts:184 `{ ...DEFAULT_PROFILE }` 共享嵌套引用，实测 `MODULE-LEVEL DEFAULT LEAK = true`。
- **U3-07 读路径静默（low）**：profile 非法时 `config get --global` exit 0 输出空值、无警告（实测 B4），与写路径拒绝行为不对称。
- `config set --global` 守卫 ✓：key 白名单 + value 白名单 + parseError 拒写 + ProfileSchema 全量校验后写回（有 U3-04 原型链穿透缺口）。

### 2. 全局路径单点（N4）⚠ 1 项例外
- `rg -n "homedir\(" src --glob "*.ts"` → **仅 `global-paths.ts`（9 处）+ `backup.ts:57`**。
- config.ts:171、identity.ts:129、file-lock.ts:66 均已委托收口 ✓；`artifact-graph/resolver.ts` 无 homedir（manual:28 的 4 处名单已全部收口）。
- **U3-01（medium）**：backup.ts:9 直接 `import { homedir }`，违反 global-paths.ts:5 与 manual/global-paths.md:7「仅此模块」声明；manual:42 记录的历史死映射事故正源于此类隔离缺口。

### 3. 锁与原子写 ✓（1 项注记）
- `withFileLock`（fs/file-lock.ts）：advisory 锁，`openSync('wx')` 独占创建 + 指数退避（±20% 抖动）+ 陈旧锁 rename 原子抢占（TTL 3000ms，注释含 P99 实测依据）+ finally token 归属校验释放。实现完整。
- `atomicWriteFileSync`：同目录唯一 temp（pid+随机）+ fsync + rename，失败清理 temp。✓
- `writeProfile`（config.ts:222）与 `setGlobalConfig`（identity.ts:166）均在 `globalLockPath('global-config')` 锁内原子写 ✓；**锁 key 共用为 manual/core/config.md:37 文档化的有意设计**（非缺陷）。
- **U3-09（注记）**：file-lock 无重入支持——若未来出现同进程跨文件嵌套写（持 config.json 锁时触发 writeProfile），将自锁 5s 后抛错；当前 rg 证实无此调用链。另 read-modify-write 的读侧无锁（config set --global 并发丢更新窗口），单用户 CLI 概率低。

### 4. 文档-实现对齐 ⚠ 2 项
- manual/core/config.md 与实现高度一致 ✓（级联口径 :18、BUG-003 双条件 :21、parseError 行为 :34、global-config 锁 :37 均逐条对上）。
- **U3-08（low，文档）**：manual/global-paths.md:28 陈旧（「4 处默认不收」名单中 config/identity/file-lock 实已收口、resolver.ts 已无 homedir）；API 表缺 `getGlobalLockPath`/`getGlobalOpenfeelConfigPath`/`getGlobalProfilePath`/`getGlobalSchemasDir` 4 函数。
- **U3-10（观察）**：status.md 模板（plan/stage.ts:68-69）仅「执行模式/自动推进」两字段 → EFFECTIVE_CONFIG_KEYS 中 `test_enabled`/`merge_mode` 的 status.md 来源分支**结构性恒空**（设计使然，建议文档注明键集差异）。

### 5. 边界与健壮性（实测）
- profile 缺失→默认值 ✓；空/标量→parseError ✓；字段缺失→默认回填（readProfile 深合并）✓；类型错误（enum 外值）→parseError ✓。
- config.yaml 缺失→readConfig 返回 {} ✓；null 块预处理（:294-304）✓；非法→C6/C7 双路径行为差异（U3-03）。
- **E1（U3-05）**：`projects: "corrupted"` → `recordProjectLang` 抛 `TypeError: Cannot create property on string`（getGlobalConfig 照单全收非对象 projects；生产链路被 update.ts:1604 try/catch 兜底，无功能损伤）。
- **E2/E3 ✓**：455 条大表 set/get 往返 5ms / 11.7KB；清空后 `isFirstUse()` = false（文件存在语义合理）。
- **F（U3-06）**：盘符大小写 `C:\` vs `c:\` 产生两条 recent_projects（resolve 不归一大小写，REV-003 去重在大小写漂移下失效）。

### 6. 过度设计 / 安全
- **过度设计：无发现**。7 文件无无复用需求的抽象层；model-config 结构化正则定位（REV-1502）有对称读→写往返用途，保留合理；opencode-config.ts（opencode.jsonc 域）与 commands/config.ts（config.yaml/profile 域）**不同配置域，无双源**。`setConfigValue` 走 ConfigDefaultsSchema 局部校验 + parseDocument 增量写（保留注释），与 writeProfile 全量写策略差异合理（不同文件形态）。
- **安全**：getUserName 固定命令 `git config user.name`（仅 cwd 插入，无用户输入拼接）→ 无命令注入 ✓；profile/config 路径均由 global-paths 固定拼接（不接受外部输入路径）→ 无路径越界 ✓；atomicWriteFileSync 同目录 temp 唯一名，无 symlink 竞争设计（本机单用户场景可接受）。原型污染面见 U3-04（实测未遂污染，无实际数据影响）。
- knowledge.ts：写入有 projectLockPath 锁 ✓；`title` 含 `|`/换行会污染 index.md 表格行（解析正则 `([^|]+)` 截断）——轻微展示问题，low 观察项（Agent 输入面）。

## 四、发现清单（汇总）

| # | 位置 | 摘要 | 分类 | 优先级 | blocking | 修复归属 |
|---|------|------|------|--------|----------|----------|
| U3-01 | src/core/backup.ts:9,57 | homedir() 绕过 global-paths 单点（N4 例外） | 一致性（N4） | medium | false | 后续补丁（U5 交叉核查 backup 测试隔离） |
| U3-02 | src/core/config.ts:184 | readProfile 浅拷贝 → 模块级 DEFAULT_PROFILE 可被污染（实测复现） | 正确性/一致性 | medium | false | 后续补丁 |
| U3-03 | src/core/flow-manager.ts:1616-1621 | buildCascadeConfig 绕过 Zod：同一非法 config.yaml，`config effective` 显示 bogus（exit 0）vs `config get` 报错（exit 1） | 一致性/正确性（展示面） | medium | false | 后续补丁（U1 交叉核实推进逻辑消费面） |
| U3-04 | src/commands/config.ts:179,32-63 | `key in GLOBAL_ALLOWED_KEYS` 原型链穿透：`__proto__`/`constructor` 过白名单后 TypeError 崩溃（未遂污染，无数据影响） | 安全面 | low | false | 后续补丁 |
| U3-05 | src/core/workspace/identity.ts:149,186-195 | projects 非对象类型照单全收 → TypeError；recordProjectLang 不规范化路径（与 ensureProfileDefaults 不一致） | 健壮性/一致性 | low | false | 后续补丁 |
| U3-06 | src/core/config.ts:239 | 盘符大小写不归一 → recent_projects 重复条目（实测） | 健壮性 | low | false | 后续补丁（可选） |
| U3-07 | src/commands/config.ts:127-146 | profile 非法时 `config get --global` 静默输出空值（exit 0），与写路径拒绝行为不对称 | 一致性（UX） | low | false | 后续补丁 |
| U3-08 | .openfeel/manual/core/global-paths.md:28+API 表 | 「4 处默认不收」名单过时；API 表缺 4 函数 | 文档对齐 | low | false | openfeel-archiver |
| U3-09 | src/core/config.ts:222 / identity.ts:166 / fs/file-lock.ts | global-config 锁双文件共用（已文档化）+ 无重入 + 读侧无锁窗口 | 注记（防回归） | low | false | 无需修复，记录 |
| U3-10 | src/core/plan/stage.ts:68-69 ↔ flow-manager.ts:172 | test_enabled/merge_mode 无 status.md 来源路径（设计使然），建议文档注明 | 文档建议 | low | false | openfeel-archiver |
| U3-11 | src/core/workspace/knowledge.ts:129,148 | 条目标题含 `\|`/换行污染 index.md 表格行 | 健壮性（展示） | low | false | 后续补丁（可选） |

无 blocking=true 项。

## 五、覆盖度与局限

- **覆盖**：7/7 文件全文通读；级联矩阵 12 组合实测（4 来源全覆盖）；画像 4 类边界 + 非法 YAML 双命令实测；锁/原子写实现逐行核对；文档 2 份抽查；N4 全仓 rg；污染路径实测复现；projects 表规模实测。
- **局限**：① `verboseSummary` 的 effective 消费仅静态核对（commands/flow.ts:105），未实测 verbose 输出；② model-config default 层文件写路径未实测（写 src 源码破坏性大，静态审查 + REV-1502 对称性论证）；③ update_state 同步锁细节归 U8（报告互引）；④ U5 交叉点（backup.ts 测试是否触达 homedir 分支）由 U5 全量隔离核查收口。

## 六、环境复核（审查结束时）

- 真实 `~/.config/openfeel/profile.yaml` SHA-256 = `21FABBE…`（与基线一致）✓
- 真实 `~/.openfeel/config.json` SHA-256 = `BF7216B…`（与基线一致）✓
- 仓库 `.openfeel/config.yaml` = `auto`/`enabled`/`true`（未修改）✓
- 源码零修改（git 未入暂存；实测脚本全部位于 `%TEMP%\opencode\`）✓
