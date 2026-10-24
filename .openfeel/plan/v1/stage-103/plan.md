# v1.3.2-stage-103 计划：DSH 激活与写入门禁（修订版 2）

> 修订记录见 §7；本版修复 plan review 第 2 轮的 B7–B9，并保留 B1–B6。

## 1. 背景与根因

`GameTest_MBC` 新工作区未运行 OpenFeel：该工作区没有 `.openfeel/`，而 `dsh/lib/index.js` 在 `resolveWorkspace().initialized === false` 时**直接返回空提示**，导致 `renderFeelPrompt` 里已有的“未初始化”分支永远不执行。工具可用但没有义务，`edit`/`write`/`pwsh` 也始终可直接执行。

结论：需要两个补充，而不是只加强提示词：

1. **提示层**：非 OpenFeel 工作区注入短 bootstrap（不是完整 Feel 纪律）；
2. **工具层**：用 DSH 官方 `ctx.tools.guard()` 在写文件前做**同步拒绝**。

DSH 0.2.1-rc.2 已确认提供：
- `ToolGuard = (execution: ToolExecution) => string | undefined`（返回字符串即拒绝）
- `ctx.tools.guard(guard)`（plain context 全局生效，单调不可被其他 guard 放行；返回 disposer，HMR 必须释放）
- `ctx.tools.restrict()` / `tools/pre-execute`（备选，不作为本期主路径）

## 2. 范围

### A. 新增 `dsh/lib/guard.js`

- `createOpenFeelGuard({ enforce, mutatingTools, allowGeneral, language, cwd })`
- `enforce`：
  - `always`（**默认**）：所有工作区都拦截；
  - `project`（opt-out）：仅当会话工作区本身含 `.openfeel/` 时拦截；
  - `off`：**完全不注册 guard**（含 flow.json/status.md 也不拦；B10）。
- `mutatingTools` 默认：`edit`、`write`、`apply_patch`、`str_replace_editor`；不做全量 shell 命令分析。
- 工作区解析：优先 `execution.agent?.session?.header?.cwd`，回退 `config.cwd`；都没有 → 放行（无法判定）。
- 状态读取：`<cwd>/.openfeel/flow.json`（同步、按 mtime 缓存），并读取 `requirements`。
- **规则顺序（B8 修复）**：
  1. 工具名不在 `mutatingTools` → 放行（`feel_*`、`pwsh`、`read`、`todo_write` 等不受影响）。
  2. 路径归一化：对所有 mutatingTools 提取**全部**目标路径，`path.resolve(cwd, p)`，Windows 下 `toLowerCase()`。
     - `edit` / `write` / `str_replace_editor`：`path` / `file_path` / `filePath`。
     - `apply_patch`：按 patch 头提取，不只全文搜 `.openfeel/`：
       - `*** Update File: <path>`、`*** Add File: <path>`、`*** Delete File: <path>`、`*** Move to: <path>`；
       - `--- a/<path>` / `+++ b/<path>`；忽略 `---/+++ /dev/null`；
       - `*** Move to:` 必须有同块 `*** Update File:` 源路径，否则拒绝；
       - 路径去引号（支持含空格路径）；
       - 去重；保留所有目标。
     - 无法提取任何目标（apply_patch 无头 / 未知参数）→ **拒绝**，提示改用 write/edit 或带标准头。
  3. 受保护路径（**guard 启用时**，即 `enforce !== 'off'`；任意阶段）→ 拒绝：
     - `<cwd>/.openfeel/flow.json`；
     - `<cwd>/.openfeel/**/status.md`（仅 `.openfeel` 下，避免误伤普通 status.md）。
  4. **先判定 `.openfeel` 是否存在**（B8）：
     - **不存在**：
       - `always` → 拒绝**所有** mutatingTools，包括 `.openfeel/**`（不能绕过 init 创建项目产物）；
       - `project` / `off` → 放行；
     - **存在**：
       - 若**全部**目标都在 `.openfeel/**` 内 → 放行（任意阶段；B1 的 plan/scheme/review 产物写入）；
       - 若目标混合（既有 `.openfeel/**` 又有外部）→ 按外部规则处理（保守拒绝，除非 exec_running）；
       - 若目标全部在 `.openfeel/` 外 → 走外部规则。
  5. 外部规则（目标在 `.openfeel/` 外）：
     - 读 flow.json 失败 → 拒绝（提示 `feel_verify health`）；
     - 有活跃阶段（phase !== done）：
       - 任一阶段 `phase === 'exec_running'` → 放行；
       - 否则拒绝，消息含 stage/phase + `feel_flow action=advance` 建议；
     - 无活跃阶段：
       - 若 `allowGeneral` 且存在 `requirements[].status === 'in_progress' && workflow_mode === 'general'` → 放行；
       - 否则拒绝（提示先 `feel_req` / `feel_stage`）。
- 拒绝消息中英双语（按 `language`），含 `feel_status` / `feel_flow` 建议。

### B. `dsh/lib/surface/prompt.js`

新增 `renderBootstrapPrompt({ projectRoot, language, enforce })`：短段落，且**与 guard 行为一致**（B7）：
- 本工作区未初始化 OpenFeel；
- **只读任务可直接进行**；
- **任何写文件（代码/文档）**：
  - `enforce=always`（默认）：会被门禁拒绝，直到 `openfeel init`，或用户把 profile 的 `enforce` 改为 `project` / `off`；
  - `enforce=project`：不拦截，但建议先 `openfeel init` 再建需求/阶段；
  - `enforce=off`：不拦截；
- 不承诺“用户拒绝后直接改”；用户拒绝时，请其改 `enforce` 或关闭适配器；
- 不假装 Feel 模式已激活。

`activation: auto | always | off`：
- `auto`（默认）：已初始化 → 完整 Feel 提示；未初始化 → bootstrap；
- `always`：所有工作区 → 完整 Feel 提示（显式传 `detected: resolved.initialized`，未初始化时 `detected:false`，不误报“已初始化”）；
- `off`：不注入提示（guard 仍可独立开启）。

### C. `dsh/lib/index.js`

- `normalizeConfig` 增加：
  - `enforce: 'off' | 'project' | 'always'`（**默认 `always`**）
  - `activation: 'auto' | 'always' | 'off'`（默认 `auto`）
  - `mutatingTools: string[]`（默认四个）
  - `allowGeneral: boolean`（默认 `true`）
- `apply`：
  - **`enforce=off` 直接不注册 guard**（含受保护路径也不拦；B10）；
  - 工具注册后注册 guard；优先 `ctx.effect(() => ctx.tools.guard(...))`；无 `ctx.effect` 时直接调用并 `ctx.on('dispose', dispose)`（若可用），否则保留 disposer；保证 HMR/reload 不累积；
  - 若 `ctx.tools.guard` 不存在（旧 DSH），记警告并跳过，不阻断适配器；
  - 提示段按 `activation` 选择 full / bootstrap / 空；bootstrap 传 `enforce`；
  - 保留 `autoPrompt`：`false` 时不注入任何提示，但 guard 仍生效。
- `guard` 的 `cwd` 回退到 `config.cwd`，与提示段一致。

### D. 配置与文档

- `dsh/cordis.patch.yml`：`enforce: always`、`activation: auto`、`allowGeneral: true`，并注释 `mutatingTools` 默认值；与 `normalizeConfig` 完全一致。
- `dsh/README.md`：配置表 + 新增“写入门禁”节（规则、`.openfeel/**` 产物区、`pwsh` 逃生通道、`enforce=always` 默认、`project`/`off` opt-out）。
- `dsh/ADAPTER.md`：边界补充“guard 只覆盖文件修改工具；`pwsh` 仍是逃生通道；`.openfeel/**` 产物区任意阶段可写，flow.json/status.md 除外；混合/无法判定 patch 拒绝”。
- `dsh/DSH-TODO.md`：记录 1.3.2 门禁已落地。
- `.openfeel/manual/core/dsh-profile.md`：补 guard 配置与边界（如该文件描述 adapter 行为）。

### E. 测试

新增 `dsh/test/guard.js`（纯 Node，临时目录，fake `ToolExecution`）：
1. `off` → 不注册 guard，普通源码与受保护路径（flow.json/status.md）都放行（B10）；
2. `always` + 无 `.openfeel` + 源码路径 → 拒绝，消息含 init（B7 也覆盖**写 docs** → 拒绝）；
3. `always` + 无 `.openfeel` + `.openfeel/plan/x.md` → 拒绝（B8）；
4. `project` + 无 `.openfeel` + 源码/`…/plan` → 放行；
5. `.openfeel` + 无活跃阶段 + 源码路径 → 拒绝；
6. 活跃阶段 `plan_review` + 源码路径 → 拒绝，消息含 phase；
7. 活跃阶段 `exec_running` + 源码路径 → 放行；
8. `.openfeel` 存在 + `plan_review` + `.openfeel/plan/v1/stage-x/plan.md` → 放行（B1）；
9. guard 启用时 `.openfeel/flow.json` / `.openfeel/**/status.md` → 始终拒绝（含反斜杠/大小写；Windows 断言仅在 win32，避免 Linux CI 失败，N2）；
10. `feel_status` / `read` / `todo_write` / `pwsh` → 放行（N4）；
11. general 需求在 `in_progress` 且无阶段 → 放行；`allowGeneral=false` → 拒绝；
12. `flow.json` 损坏 → 拒绝；
13. 多活跃阶段：一个 `exec_running` + 一个 `plan_review` → 源码放行（文档承认宽松）；
14. `ctx.tools.guard` 缺失 → 适配器加载不抛错（降级）；重复 `apply` 不累积（mock `effect` 计数）；
15. bootstrap 提示：未初始化短提示（`always`/`project` 文本不同）、已初始化完整提示、`activation=off` 空、`autoPrompt=false` 空；
16. `apply_patch`：全部目标在 `.openfeel/**` → 放行；混合（`.openfeel` + `src/foo.cs`）→ 拒绝；全部外部 → 外部规则；含 `flow.json` → 拒绝；无标准头 → 拒绝；`/dev/null` 头忽略；`*** Move to:` 缺少同块 `*** Update File:` 源 → 拒绝；引号路径去引号（B9/N8）；
17. `str_replace_editor` 改 `flow.json` → 拒绝；改 `.openfeel/plan/x.md` → 放行；
18. `activation=always` + 未初始化 → 完整提示且 `detected:false`（N3）。

`dsh/test/verify.js` 加一条“guard 已注册”断言（mock 上下文记录 guard 数量）。
`test/core/templates.test.ts` S5 更新：`'本文档为 v1.3.2 快照'`，新增 `'本文档为 v1.3.1 快照'` 阴性；保留 v1.3.0 阴性。

### F. 版本 1.3.2 收口

A 类：`package.json` / `package-lock.json`（2 处）/ `.openfeel/config.yaml` / `src/core/config.ts`（2 模板）/ templates-data agents-md ×2 / claude constraint ×2 / `dsh/package.json`（version + requiresCli `>=1.3.2`，保持 `private: true`）。
B 类：`npm run build` 重生成 `template-loader.ts` / `update.ts`。
C 类：`CHANGELOG.md` `[1.3.2]`。
D 类：README×3 最新版本/DSH 节、`docs/GETTING_STARTED.md` / `docs/commands.md` 快照、`docs/VERSIONS.md` 1.3.2 条目、`dsh/README.md` / `ADAPTER.md`、cli-usage skill 快照（含 v1.3.2 节 + 快照声明）。
E 类：JSON 契约不变（13 错误码 / 40 成功出口 / 41 注册选项）；`openfeel-dsh` 仍不单独发布；测试计数不变（新增 dsh/test 不进入 vitest），但 `templates.test.ts` 快照断言必须更新（B5）。

## 3. 门禁

```powershell
npm run build   # ×2
npx tsc --noEmit
$env:NO_COLOR=''; npm test
node bin/openfeel.js lint i18n
node bin/openfeel.js lint kb
node bin/openfeel.js --version   # 1.3.2
npm pack --dry-run --json        # dsh 文件仍入包
Get-ChildItem dsh/lib -Recurse -Filter *.js | ForEach-Object { node --check $_.FullName }
node dsh/test/guard.js
node dsh/test/contract.js
node dsh/test/verify.js
node dsh/test/integration.js
```

## 4. 发布

- 提交：`feat(dsh): tools.guard 写入门禁 + bootstrap 激活提示（v1.3.2）` + 版本/归档提交。
- push master → CI build-and-test → publish 1.3.2。
- 发布后：`npm i -g openfeel@1.3.2` → `openfeel setup --tools dsh` → 重启 DSH。
- 默认 `enforce=always`：新工作区未初始化时源码/文档写入都会被拒绝（bootstrap 提示 init）；放宽到只在 OpenFeel 项目内拦截改 `project`；完全关闭改 `off`。

## 5. 验收

- [ ] guard 矩阵测试全绿；fake execution 覆盖 §2.E 的 18 条。
- [ ] 非 OpenFeel 工作区在 `auto` 下得到 bootstrap（不再空提示），且 `always` 文案不承诺直接改。
- [ ] `always` 下 `edit`/`write` 在无 `.openfeel`（含 `.openfeel/plan` 目标）/ 无 active stage / 非 exec_running 时被拒绝；`.openfeel/**` 产物在 `.openfeel` 已存在时放行；flow.json/status.md 始终拒绝。
- [ ] `apply_patch` 多目标/混合/无头/改 flow.json 行为符合规则；`str_replace_editor` 同样覆盖。
- [ ] `feel_*`、`openfeel` CLI、`pwsh`、非 mutating 工具不受影响（pwsh 是显式逃生通道）。
- [ ] `ctx.tools.guard` 缺失时适配器降级不崩；重复 apply 不累积 guard。
- [ ] 全量 vitest / tsc / lint / pack / dsh 测试通过；templates S5 断言更新。
- [ ] 1.3.2 发布，阶段/版本归档。

## 6. 风险与边界

- `pwsh`/`bash` 仍可直接写盘（默认不守）；文档明确逃生通道，`guardShell` 留到后续。
- `enforce=always` 会影响所有非 OpenFeel 工作区（默认即如此）；`project`/`off` opt-out 需在 README 首屏写明（N7）。
- guard 同步读 flow.json；按 mtime 缓存。
- general 需求例外依赖 `flow.json.requirements`；缺失时按拒绝处理。
- 多活跃阶段“任一 exec_running 放行”较宽松；文档承认，后续可收紧。
- 子智能体同样受全局 guard 约束；`feel_*` 始终放行，避免 bootstrap 死锁。
- `apply_patch` 无标准头时拒绝；这是有意的保守策略（B9）。
- `project` opt-out 下无 `.openfeel` 仍可写 `.openfeel/plan/...`，可能创建不完整项目；README 明确这是 opt-out 的放宽行为（N4）。

## 7. 修订记录

### 第 1 轮（B1–B6）

- **B1**：`.openfeel/**` 内写入在任意阶段放行（flow.json/status.md 除外）；只有 `.openfeel/` 外的源码/文档要求 `exec_running`。
- **B2**：默认 `enforce` 从 `project` 改为 `always`；`project`/`off` 为 opt-out。
- **B3**：guard 注册用 `ctx.effect(() => ctx.tools.guard(...))`（或 disposer），避免 HMR 累积。
- **B4**：统一路径归一化；status.md 限定 `.openfeel/**`。
- **B5**：`templates.test.ts` S5 快照断言更新为 v1.3.2 + v1.3.1 阴性。
- **B6**：验收命令改为 PowerShell 递归 `node --check` + 逐条运行 dsh 测试。

### 第 2 轮（B7–B9）

- **B7**：bootstrap 文案与 `enforce=always` 对齐：只读可进行；写文件（代码/文档）需 init 或改 `enforce`；不再承诺“拒绝后直接改”；补 always + 写 docs → 拒绝测试。
- **B8**：规则顺序改为**先判定 `.openfeel` 存在性**；不存在时 `always` 拒绝所有 mutatingTools（含 `.openfeel/**`）；存在时才启用 `.openfeel/**` 产物放行；补 always + `.openfeel/plan` → 拒绝测试。
- **B9**：`apply_patch` 解析**全部**目标（`*** Update/Add/Delete File:`、`*** Move to:`、`---/+++` 头）；全部内部才放行，混合走外部规则，无头拒绝；补混合/多文件/flow.json/str_replace_editor 测试。
- N1：无 `ctx.effect` 时 `ctx.on('dispose')` 释放；N2：Windows 路径断言仅 win32；N3：补 activation=always + 未初始化完整提示；N4/N6/N7：README 明确 opt-out、`.openfeel/**` 产物区、`pwsh` 逃生通道；N8：apply_patch 忽略 `---/+++ /dev/null`，`Move to` 要求 Update File 源，路径去引号。

### 第 3 轮（B10）

- **B10**：`enforce=off` 明确为**不注册 guard**（受保护路径也不拦）；规则 3/测试 9 改为“guard 启用时”；补 `off + flow.json/status.md → 放行` 测试；补 apply_patch `/dev/null`、Move 源、引号路径。

### 代码审查（stage-103）

- **B1（macOS 大小写）**：`IS_CASE_INSENSITIVE_FS = win32 || darwin`，`normalizeTarget` / `normalizedCwd` 同步小写；测试覆盖 `.OPENFEEL/FLOW.JSON`（仅大小写不敏感平台）。
- **B2（Move 同块）**：`parsePatchTargets` 改为逐行块跟踪；`*** Move to:` 必须位于当前 `*** Update File:` 块内，`Add`/`Delete`/`End Patch` 后 Move 拒绝；补“无关 Update + 无源 Move”测试。
- **B3（测试缺口）**：guard 36 条 / verify 83 条；补 guard 启用时 `status.md` 始终拒绝、`autoPrompt=false` 不注入但 guard 注册、`activation=always` 非项目完整提示、重复 apply 释放旧 guard、Add/Delete/`---/+++`/Move 同块覆盖。
- **N1**：`ADAPTER.md` 头部 v1.3.2、`requiresCli ≥1.3.2`、DSH `0.2.0-rc.2+`（guard 缺失降级）。
- **N2**：README 四套测试（42/82/35/10）。
- **N3**：完整提示在 `detected:false` 时标题改为“未初始化”，不再误报已启用。
- **N4**：受保护路径作用域限定 `<cwd>`（计划语义），文档说明。
- **N5**：`ctx.tools.guard` 缺失时警告降级，README/ADAPTER 注明硬门禁依赖。
- **N6**：移除 test 中未使用的 `guard()` 与 `pathExists`。
