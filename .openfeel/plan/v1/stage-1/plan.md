# v1.5.17-stage-1 计划：feel_mode 开关（默认按门禁走流程，可关闭）

> 需求：REQ-031（修复 ID 分配后分配，见「配套修复」T1）
> 模式：full（plan → scheme → exec → review → test → archive）
> 修订：v2（并入 plan-review 6 处阻塞点 + 3 条建议）

## 一、目标（可验收）

1. 新增配置开关 `feel_mode: enabled | disabled`，**默认 `enabled`**，即当前行为逐字不变。
2. `disabled`（软关闭）时放松**流程强制**：
   - 不再要求/催促创建需求与阶段（`workflowGate` 不再 required，`feel_status` / `feel_next` 不再以「无活跃阶段」催办）；
   - `preflight`（先读后写）从 strict 降级为 warn（仅提示，不拒绝）；
   - `<feel_mode>` 系统提示切换为「自由模式」：是否建需求 / 建阶段由 AI 自行判断。
3. `disabled` 时**保留**数据完整性硬门（不可协商）：
   - 状态机合法性（非法相位跳转仍拒绝）、`done` 门、阶段验证门、版本归档判据、blocking REV 门；
   - 写入门禁（禁止手改 `flow.json` / `status.md` / `pipeline.yaml` / `config.yaml`）与**门禁自身失活告警**（`guard-inactive` / `guard-cwd-unresolved` / `guard-stale`）。
4. 配置层级：**项目级 `.openfeel/config.yaml` 的 `defaults.feel_mode` 覆盖全局 `~/.config/openfeel/profile.yaml` 的 `preferences.feel_mode`**；两者都未配置 → `builtin = enabled`。
5. 即时生效：每次 `feel_status` / `feel_next` / 提示装配都重新读配置，改完当轮生效（无需重启会话）。
6. 命令面可见：`config set feel_mode`（项目）、`config set --global preferences.feel_mode`、`config get`、`config get --all`、`config get --global`、`config effective feel_mode`（含来源）。

## 二、非目标

- 不放宽状态机 / done 门 / 归档判据 / 写入门禁失活告警（用户已选「软关闭」）；
- 不改写 `flow status --json` / `flow next --json` 的既有键集（`feelMode` 由适配器侧与 `config effective` 暴露）；
- 不新增「自动创建需求/阶段」的行为；`disabled` 只是解除强制。

## 三、配套修复（前置，T1）

**缺陷**：`meta.last_req_seq` 只随新建递增，**不感知归档**。本仓 v1.5.8 归档了 REQ-025~030，但计数器停留在 24，导致本次真实建需求时分配出 `REQ-025`（与归档需求 ID 冲突；`body-file.ts:84` 已存在不覆盖 → 正文仍是旧需求内容）。

**修复（写侧根治 + 读侧补存量）**：
- **写侧（根因）**：`flow archive` 把需求移入归档文件时，同批抬升 `meta.last_req_seq = max(当前, 被归档需求最大号)`；
- **读侧（存量）**：`src/core/flow-archive/archive-ops.ts` 新增 `archivedRequirementMaxSeq(projectPath)`（只读，复用 `listArchivedRequirements` + `REQ_ID_PATTERN`）；
- `src/core/req/requirement-ops.ts` 新增纯内存 `raiseRequirementSeqFloor(data, floor)`；
- `src/commands/req.ts` 的 `add` / `split` 在分配前用 `archivedRequirementMaxSeq` 抬升下限；
- 已误建的 `REQ-025` 就地作废为 `cancelled`（已执行；正文文件保留历史内容，不复用该 ID）；真实需求在修复后重新分配（预期 `REQ-031`）。

## 四、实施设计

### T2 配置层（`src/core/config.ts`）

- `ConfigDefaultsSchema` 增加 `feel_mode: z.enum(['enabled','disabled']).optional().default('enabled')`；
- `DEFAULT_CONFIG.feel_mode = 'enabled'`；`Config` / `ResolvedConfigDefaults` 同步；`resolveConfigDefaults` 循环键加入；
- `ProfilePreferencesSchema` 增加 `feel_mode`（仅约束 `config set --global` 的值域）；
- **`DEFAULT_PROFILE` 不得加 `feel_mode`**（否则「未显式设置」会被误判为 profile 层来源）；
- 新增解析单点：

```ts
export interface ResolvedFeelMode { value: 'enabled' | 'disabled'; source: 'config.yaml' | 'profile.yaml' | 'builtin' }
export function resolveFeelMode(projectPath: string): ResolvedFeelMode
```

**同源约束**：与 `buildCascadeConfig`（flow-manager.ts:2808-2821）一致——两处都**直接读原始 YAML**、只认显式声明；不做 `readProfile()` 的 DEFAULT_PROFILE 合并。读侧宽容：文件缺失 / YAML 非法 / 值非法 → 跳到下一层。

### T3 命令面（`src/commands/config.ts` + `src/core/flow-manager.ts`）

- `GLOBAL_ALLOWED_KEYS['preferences.feel_mode'] = ['enabled','disabled']`；`GLOBAL_PROFILE_KEYS` 加入；
- **`config get --global` 人类输出是六行硬编码**（config.ts:185-190，逐键 `console.log`）→ 必须补第七行；`config get --global` 无 key 与 `--json` 两分支同改；
- `config get --all` 输出五键（追加 `feel_mode`，键序固定：`execution_mode / auto_advance / merge_mode / workflow_mode / feel_mode`）；
- `EFFECTIVE_CONFIG_KEYS` 追加 `feel_mode`；`buildCascadeConfig` 从 profile 原始 YAML 读 `preferences.feel_mode` → `profileDefaults.feel_mode`（status.md 无此字段 → 自然跳过，来源永不为 `status.md`）；
- 改写 `buildCascadeConfig` 注释（flow-manager.ts:2796-2802 与 2921 的「profile 只承载 auto_advance / 有意不承载 workflow_mode」），同步说明 feel_mode 的层级；
- 更新 `CONFIG_TEMPLATE_ZH/EN`（模板注释 + 值）；
- **「四键」文案面必须同步**（漏改会让 `lint i18n` 或文档对新用户说谎）：
  - `src/core/i18n-data/zh-CN.ts`（`config.get.all` 文案）与 `en.ts` 对应键（两侧必须同改）；
  - `docs/commands.md`、`docs/json-contract.md`、`docs/GETTING_STARTED.md`；
  - `src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`，以及内嵌副本 `src/core/template-loader.ts`（约 4599 行）与 `src/core/update.ts`（约 585 行）；
  - 测试：`test/commands/config.test.ts`、`test/cli/json-contract.test.ts`；
- `config set feel_mode --sync-stages` 无阶段字段 → 逐阶段 `skipped-no-field`；在 help/文档注明该键**不支持阶段级覆盖**。

### T4 preflight 降级（`src/core/preflight.ts`）

- **降级落点在 `checkPreflight` / `getPreflightMode` 单点**，不在 `preflightGate`——否则 `check.mode` 仍报 `strict` 而实际放行，与 dsh 侧展示矛盾；
- 语义：`OPENFEEL_PREFLIGHT=off` 最高优先；否则 `strict` 且 `resolveFeelMode(projectPath).value === 'disabled'` → 有效模式 `warn`；
- `src/commands/shared/preflight-gate.ts:12` 的「`src/core/preflight.ts` 零改动」注释过期，一并订正（无循环依赖：config.ts → fs/yaml/identity/i18n，不依赖 preflight）；
- dsh 侧展示一致：`dsh/lib/tools/index.js` 装配 preflight 时，若 `feelMode.value === 'disabled'` 且上报 `mode === 'strict'` → 展示为 `warn`（账本读取本身不变）。

### T5 DSH 适配器（`dsh/lib/`）

- 新增 `adapters/feel-mode.js`：`resolveFeelMode(projectRoot)` 的**镜像**（项目 `defaults.feel_mode` > profile `preferences.feel_mode` > `enabled`），同步 IO、每轮读；头注释声明与 CLI 单点的同构契约；
  - 方案取舍：不做「CLI 写 `.feel-mode.json`、适配器读文件」的账本方案——文件会在「改配置但尚未发生 CLI 调用」的窗口里滞后，违背「即时生效」；一个标量的窄解析风险可控，用两侧同矩阵测试兜底。
- `adapters/workflow-gate.js`：**只把 `no-active-stage` 分支（:69-84）替换为 `feel-mode-off`**（`required:false`）；`guard-inactive` / `guard-cwd-unresolved` / `guard-stale` 三条自检**保持最高优先级**（写入门禁失活比没开阶段严重）；
- `surface/prompt.js`：`renderFeelPrompt({ feelMode })`；`disabled` 时输出「自由模式」节（中文/英文）：不强制需求/阶段、先读后写降级、**刻意保留的硬门清单**、归档/发布仍需用户确认；
- `index.js`：`text()`（同步 `() => string`）内解析 `feelMode` 并传入；
- `tools/index.js`：`feel_status` / `feel_next` 输出 `feelMode`（含 source），compact 档同样带；`workflowGate` 消费 `snapshot.feelMode`；
- `adapters/cli.js:272`：**注意 strict 注入在 spawn env 此处**，不在 `adapters/preflight.js`。本方案的降级由 CLI 侧（T4）权威决定，适配器**不**改 env 注入；若后续发现需双保险，再在此处按 feel_mode 切换 `'warn'`（计划不实施，避免两处语义分叉）。
- `renderBootstrapPrompt`（未初始化工作区）本版不感知 feel_mode（无项目配置可读；全局偏好留给后续版本）。

### T6 测试与文档

- `test/core/config.test.ts`：schema / DEFAULT_CONFIG / `resolveFeelMode` 三层优先级 + 显式声明语义 + 非法值回退（不得因 DEFAULT_PROFILE 误判 profile 来源）；
- `test/commands/config.test.ts`：`get --all` 五键、`get --global` 第七行、`set`、`set --global`、`effective` 五键与来源；
- `test/core/preflight*.test.ts` / `test/commands/preflight-gate.test.ts`：strict + disabled → 放行且 `check.mode === 'warn'`；off 仍最高优先；
- `test/commands/req.test.ts`：归档存在时 `req add` 分配 `REQ-(max+1)`；`flow archive` 后 `meta.last_req_seq` 抬升；
- `dsh/test/`：`workflow-gate` 的 `feel-mode-off` **且** guard-* 优先级不变；prompt 中/英 disabled 分支；feel-mode 镜像解析矩阵；
- 文档：`docs/commands.md`、`docs/json-contract.md`、`docs/GETTING_STARTED.md`、`CHANGELOG.md`、`dsh/README.md`、`dsh/docs/compat/*`、skills 模板（含 template-loader / update 内嵌副本）；`lint i18n` 必须通过。

## 五、验收

| # | 验收 | 证据 |
|---|------|------|
| A1 | 默认（无配置）`config effective feel_mode` = enabled / builtin；现有行为零回归 | CLI 输出 + 单测 |
| A2 | 项目 `disabled` 覆盖全局 `enabled`；仅全局显式声明时来源为 profile.yaml | 单测（三层矩阵） |
| A3 | `disabled` 时 preflight strict 放行，且 `check.mode` 报 warn | 单测 |
| A4 | `disabled` 时 `workflowGate.required=false`（reason=feel-mode-off），guard-* 仍优先 | dsh 单测 |
| A5 | `disabled` 时提示词出现自由模式节、且保留硬门清单 | dsh 单测 + 手工 feel_status |
| A6 | `enabled` 时上述全部行为逐字不变 | 既有用例全绿 |
| A7 | 含归档需求的仓上 `req add` 不复用 ID；`flow archive` 抬升计数器 | 单测 + 实际分配 REQ-031 |
| A8 | `lint i18n` 通过、`config get --all` 五键、`get --global` 七行 | CLI + CI 同款命令 |

## 六、风险与对策

1. **双解析器漂移**（CLI `resolveFeelMode` vs dsh 镜像）：同一夹具矩阵两侧测试（无配置 / 项目 / 全局 / 项目覆盖全局 / 非法值）；镜像头注释标注 CLI 单点位置。
2. **config schema 新增键的连锁**：`resolveConfigDefaults`、`config get --all`、`config get --global` 硬编码行、`EFFECTIVE_CONFIG_KEYS`、i18n 帮助文案、`STAGE_FIELD_BY_CONFIG_KEY`（无字段 → skipped-no-field）、skills/docs 内嵌副本，逐处核对（清单见 T3）。
3. **适配器每轮读文件**：仅两个小文件、同步读；解析失败一律回退 `enabled`（保守：宁可严格要求）。
4. **误建 REQ-025**：已 cancelled 留痕；不作物理删除（CLI 无删除原语，保持审计；`body-file.ts:84` 不覆盖旧正文）。
