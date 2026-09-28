# op-001 实测记录 — opencode 权限语义（`external_directory` 键与覆盖/合并语义）

> **对应计划编号**：`op-000`（CLI 编号 `op-001`，映射见 `ops/deps.yaml`）
> **执行 Agent**：openfeel-executor ｜ **执行日期**：2026-09-29
> **实测环境**：Windows 10/11 (win32)、`opencode-ai@1.18.33`（`opencode --version` = 1.18.33）
> **隔离方式**：`$env:USERPROFILE` + `$env:HOME` 双指向临时目录，`opencode debug paths` 断言通过
> **实测目录**：`%TEMP%\opencode\stage44-op001\{home,project}`（已验证：隔离前 = 隔离后 = **真实 `~/.config/opencode/` 未被写入**）
> **状态**：`VERIFIED`（无 DEGRADED / INCONCLUSIVE 项；1 项与需求原文机制描述冲突，见 §八）

---

## 一、隔离与预检

```pwsh
opencode --version                       # 1.18.33
opencode debug --help                    # 含 paths / config / agent <name>
$env:USERPROFILE = "$BASE\home"; $env:HOME = "$BASE\home"
opencode debug paths
```

| 断言 | 结果 |
|------|------|
| `home` = 隔离目录 | ✅ `...\stage44-op001\home` |
| `config` = 隔离目录 | ✅ `...\stage44-op001\home\.config\opencode` |
| 真实 `~/.config/opencode` 未被写入 | ✅ 文件数 3689 / 最新 mtime `2026-09-26 08:25:10` 前后一致 |

**额外发现（观测手段）**：`opencode debug agent <name> --tool <toolId> --params <json>` 可直接执行工具——但**对 `ask` 自动放行、仅强制 `deny`**（探针实测见 §七），故 `ask` 判别改用 `opencode run`（非 TTY 下 **ask → 自动拒绝并打印 `permission requested: ...`**，见 §六）。`--pure` 会禁用插件，实测未使用。

---

## 二、V1 权限求值机制（二进制取证，`opencode-windows-x64/bin/opencode.exe`）

反编译定位到 V1 Permission 模块（字符串偏移 ≈102,128,853）：

```js
// evaluate(permissionName, pattern, ...rulesets)
function c(j,J,...K){
  return K.flat().findLast((z)=> g.match(j,z.permission) && g.match(J,z.pattern))
      ?? {action:"ask", permission:j, pattern:"*"}
}
// fromConfig: string → {permission:key, action:str, pattern:"*"}；对象 → {permission:key, pattern:path, action:v}
// merge = 数组拼接（flat）
// ask(): for 每个 pattern → evaluate → "deny" 抛 DeniedError / "allow" 跳过 / 其余 → 发布 asked 事件等用户回复
// ruleset = merge(agent.permission, session.permission ?? [])
```

**语义**：`findLast`（**最后匹配者胜**）+ `g.match` 通配匹配（规则 `permission: "*"` 匹配**任意**权限名）。故顶层 `permission: "allow"` 生成 `{permission:"*",pattern:"*",action:"allow"}`，只要它在规则序列中位于内置默认**之后**，就对该 agent 未声明的键（含 `external_directory`）生效。已由 §六 R3/R7 实测确证。

---

## 三、场景 A — 基线默认值

| 观测 | 结论 |
|------|------|
| (a1) 默认 `external_directory` | **`ask`**（effective ruleset：`{"permission":"external_directory","pattern":"*","action":"ask"}`；另含 opencode 内部目录 `tool-output`/`%TEMP%\opencode` 的 `allow`） |
| (a2) 未定义 agent 时 `debug agent <name>` | `Agent <name> not found, run 'opencode.exe agent list'`，exit 1 |
| 内置默认权限（前缀段，与 agent 无关） | `*:allow`、`doom_loop:ask`、`external_directory:*→ask`、`question:deny`、`plan_enter/plan_exit:deny`、`read:allow`（`*.env`/`*.env.*` → ask） |

**R1（`opencode run` 判别器）**：无 `external_directory` 键、无顶层 permission 的 agent 读外部文件 →
`! permission requested: external_directory (C:\...\stage44-ext\*); auto-rejecting` → **默认生效值 = ask 确证**。

---

## 四、场景 B — 两种值形式（REV-001-③）

fixture：`agents/probe-sv.md` 用单值 `external_directory: "allow"`；`agents/probe-obj.md` 用对象 `external_directory: {"*": "allow"}`；两者 rest 相同。

| 形式 | schema | effective ruleset | 等价性 |
|------|:--:|------|:--:|
| B1 单值 `"allow"` | ✅ 接受（exit 0，无报错/无忽略） | 追加 `{permission:"external_directory", action:"allow", pattern:"*"}` | — |
| B2 对象 `{"*":"allow"}` | ✅ 接受 | 追加 `{permission:"external_directory", pattern:"*", action:"allow"}` | ✅ 与 B1 **同一规则**（仅键序序列化差异） |

**R2（`opencode run` 判别器）**：`probe-sv`（单值 allow）读外部文件 → **成功（无 ask）** ⇒ 单值形式**实际生效**。

> **裁定（回填 op-002 决策 2）**：**取单值 `external_directory: "allow"`**（与同块其余键风格一致，无需对象形式）。

---

## 五、场景 C/D — 顶层 vs 内联（覆盖 or 合并）与自动追加 allow

### 5.1 (b) 覆盖 vs 合并：**按键深合并，非整体覆盖**

fixture：全局配置顶层 `"permission": "allow"` + agent `probe-ov`（md 仅声明 `read: "deny"`，未声明 bash/glob）。

| 观测对象 | 结果 | 判定 |
|------|------|------|
| effective ruleset 顺序 | `[内置默认 …]` → `[{permission:"*",action:"allow",pattern:"*"}]` → `[{permission:"read",action:"deny",pattern:"*"}]`（md） | 配置规则**在默认之后、md 规则之前** |
| `tools.bash` / `tools.glob` | `true` / `true` | 顶层 `*:allow` 与 md 块**共存**（非整体替换） |
| `tools.read` | `false` | 同名键 **md 后置 → 胜出**（`findLast`） |

**裁定**：「agent 级 permission 覆盖/优先于顶层」在**同名键**上成立（机制上是「追加合并 + 后者优先」，非整体替换）。

### 5.2 (c) 自动追加 allow 是否真生效：**仅追加内部目录，没有全局 `*: allow`**

fixture：`probe-noext`（md 仅声明 `bash: "allow"`，无配置 permission）。

| 观测 | 结果 |
|------|------|
| ruleset 中 `external_directory` 规则 | 4 条：`ask *`（默认）、`allow <tool-output>*`（默认）、`allow %TEMP%\opencode\*`（默认）、`allow <tool-output>*`（**自动追加**，位于序列末尾，与 `plan.md §2.2` 疑点 1 对应） |
| 是否存在追加的 `external_directory: {"*": "allow"}` | **否**（追加规则 pattern 为 opencode 自身 `tool-output` 目录，非 `*`） |
| R1 判别器 | 读任意外部路径 → **ask** |

**裁定**：所谓「对所有 agent 追加 `external_directory:{"*":"allow"}`」在 1.18.33 中**只覆盖 opencode 自己的 tool-output 目录**，对用户任意外部路径无效。⇒ **op-002 补键 = 行为变更（`ask` → `allow`），不是单纯显式化**（已记入 findings 供审查；与 O2 的目标一致）。

---

## 六、场景 E — `write` vs `edit` 键识别

| fixture | effective ruleset 相关规则 | `tools.edit` | `tools.write` | 判定 |
|---------|----------------------|:--:|:--:|------|
| `probe-w`：`permission: {write: "deny"}` | `{permission:"write", action:"deny", pattern:"*"}` **出现但无效**（write/patch 工具映射到 `edit` 权限） | `true` | **`true`**（未被拦截） | **`write` 键未被识别** |
| `probe-e`：`permission: {edit: "deny"}` | `{permission:"edit", action:"deny", pattern:"*"}` | **`false`** | **`false`** | **`edit` 才是授权键** |

> **裁定（回填 op-002 决策 4 / R3）**：**触发改键**——`openfeel-utility.md`（zh/en `:12`）的 `write: "allow"` → `edit: "allow"`。改后与内置默认 `*:allow` 一致，**无实际放宽**（原 `write` 本就无效，等同未声明）。

---

## 七、场景 F — 项目 jsonc `agent.<name>.permission` vs frontmatter（含关键异常）

fixture 说明：项目根 `opencode.jsonc`（`cwd=$PROJ`，已 `git init`；实测项目配置**确实被加载**——`instructions` 标记可回显、`projonly` agent 生效）。

| 观测 | 结果 | 判定 |
|------|------|------|
| (e1) md 已声明键被项目 jsonc 覆盖？ | `probe-e`（md `edit: deny` + 项目 `edit: allow`）→ `tools.edit=false`；`probe-sv`（md `bash: allow` + 项目 `bash: deny`）→ `tools.bash=true` | **不能覆盖**：`.md` frontmatter **胜** |
| (e2) md 未声明键可否由项目 jsonc 提供？ | `probe-noext`（md `bash: allow` + 项目 `external_directory: allow`）→ merged `permission = {external_directory: allow, bash: allow}`，`debug agent` 含 extdir allow | **可以**：按权限键**深合并**，md 未声明键由配置补入 |
| (e3) 项目 jsonc 能否定义 agent？ | `projonly`（仅项目 jsonc 定义）→ `debug config` / `debug agent` 均生效 | **可以** |
| (e4) 项目级 `.opencode/agent/<name>.md` | 覆盖全局同名 agent（`description`/`permission` 全取项目文件） | **可以**（项目 agent 文件后加载，胜） |

**`opencode run` 判别器复核（决定性）**：

| 编号 | fixture | 期望 | 实测 |
|------|---------|------|------|
| R3 | `probe-star`（md **无** extdir 键）+ 项目顶层 `"permission": "allow"` | ? | **成功读取外部文件（无 ask）** |
| R7 | `probe-rep`（**真实 9 agent 形态**：bash/read/glob/grep，无 extdir）+ 顶层 `"permission": "allow"` | ? | **成功读取外部文件（无 ask）** |
| R4 | `probe-star` + 项目 `agent.probe-star.permission.external_directory = "allow"` | allow | **成功（无 ask）** |
| R5 | `probe-sv`（md extdir allow）+ 项目 `agent.probe-sv.permission.external_directory = "deny"` | ? | **成功（md 胜，项目 deny 无效）** |
| R6 | `probe-sv`（md extdir allow）+ 顶层 `permission: {external_directory: "ask"}` | ? | **成功（md 胜，顶层收紧无效）** |

**`--tool` 探针的限制（方法论发现）**：

| 探针 | 结果 | 说明 |
|------|------|------|
| `probe-sv`（extdir allow）`--tool read` 外部文件 | 成功 | — |
| `probe-noperm`（extdir **ask**）`--tool read` 外部文件 | **成功** | ⇒ `--tool` **对 ask 自动放行** |
| `probe-deny`（extdir deny）`--tool read` 外部文件 | `DeniedError`（打印 relevant rules） | ⇒ `--tool` 仅强制 deny |

⇒ `--tool` 只能判别 `deny`，**不能**判别 `ask`/`allow`；`ask` 必须用 `opencode run`（非 TTY 自动拒绝）判定。

---

## 八、⚠️ 与需求原文（`docs/phase-5/07-openfeel-permission-issue.md` §二）的机制冲突【须裁定】

| 需求原文声称 | 本机实测（1.18.33） | 冲突 |
|--------------|---------------------|:--:|
| §二.1「per-agent `permission` 覆盖顶层 `permission`，故项目 `"permission":"allow"` 对这些 agent 不生效」 | **对同名键成立**（md 后置胜出）；但**对 agent 未声明的键，顶层规则生效** | 部分成立 |
| §二.2「`external_directory` 不继承顶层 `allow`，回落内置默认 `ask`」 | **不成立**：`evaluate` 用 `findLast` + `*` 通配，顶层 `permission: "allow"`（`*:allow`）位于内置默认之后 → 对 `external_directory` **生效**；R3/R7（含真实 9-agent 形态）外部目录**免询问** | **❌ 冲突** |
| §二.3 配置不热重载 | 未单独实测（不属本 op 清单）；作为 §二.2 现象的可能解释保留 | 未验证 |

**影响面（已实测、可直接支撑决策）**：

1. **op-002（补键）仍然成立且有效**：现状（无键）默认 `ask`（R1），补 `external_directory: "allow"` 后免询问（R2）——需求目标达成，且**不再依赖项目级配置**。
2. **op-004 计划文案需修正**（原方案 ①「项目里写 `permission: "allow"` 对已内联白名单的 agent 不生效」为**过度概括**）：
   - 准确表述应为「**对被 agent `.md` 声明的同名键**，agent 级优先于顶层/项目配置；对未声明的键，顶层 `permission` 生效」。
   - **REV-001-① 的「镜像全量键」建议实际无效**：合并是**按键深合并、`.md` 优先**（非替换），项目/全局 config 的 `agent.<name>.permission` **无法覆盖 `.md` 已声明的键**（R5/R6 实证）。因此：
     - 补键**之前**：项目 `agent.<name>.permission.external_directory` 可生效（R4，键未被 md 声明）；
     - 补键**之后**：该键已被 md 声明 ⇒ 项目级/顶层均**无法**再收紧 `external_directory`；**唯一项目级收紧入口 = 项目 `.opencode/agent/<name>.md`**（e4 实证）。
   - 附：`opencode run` 中顶层 `permission: "allow"` **能**消除外部目录询问，故「用户痛点」在 1.18.33 上的**准确成因**未被本次实测复现（可能是 §二.3 热重载、项目配置未加载或用户配置文件差异）。**该点按「未复现」记录，不写入框架文档作为事实**。

---

## 九、回填表（op-002 / op-004 落值依据）

| 项 | 结论 | 落点 |
|----|------|------|
| (a) 键合法性 + 默认值 + 单值形式 | `external_directory` 合法；默认 `ask`；**单值 `"allow"` 被接受且生效** | **op-002 值形式 = 单值 `external_directory: "allow"`** |
| (b) 覆盖 vs 合并 | 按权限键**深合并**；同名键 **agent `.md` 优先**；非同名键顶层/项目配置生效 | op-004 措辞：限定为「同名键 agent 优先」 |
| (c) 自动追加 allow | **仅内部 `tool-output` 目录**，无全局 `*: allow` ⇒ 补键 = `ask`→`allow` **行为变更** | findings 供审查；O2 目标一致 |
| (d) `write` 是否识别 | **未被识别**（`tools.write` 仍 true） | **op-002 将 utility `write` → `edit`（触发）** |
| (e) 项目 jsonc vs frontmatter | **不能覆盖** md 已声明键；可补 md 未声明键；项目级 `.opencode/agent/<name>.md` 可整体胜出 | op-004「收紧入口」= 项目级 agent `.md`；镜像告警按实测改写 |
| REV-001-③（单值形式） | 已确证（§四） | op-004 ③ 注明实测版本 1.18.33 |

## 十、自测清单核对

- [x] `opencode --version` 已记录（1.18.33）
- [x] `opencode debug paths` 断言 `home`/`config` 均指向隔离目录（未触发 `config dir mismatch`）
- [x] 场景 A：默认 `external_directory` = `ask`（ruleset + R1 双证）
- [x] 场景 B：单值 / 对象两形式均接受且等价；单值实测生效（REV-001-③）
- [x] 场景 C：顶层 vs 内联 = 按键深合并（同名键 md 优先）
- [x] 场景 D：自动追加 allow 仅限 tool-output 内部目录（无全局 `*: allow`）
- [x] 场景 E：`write` 未识别 / `edit` 识别
- [x] 场景 F：项目 jsonc vs frontmatter（不能覆盖已声明键；可补未声明键；项目 agent `.md` 可胜出）
- [x] findings 文件已写入；真实 `~/.config/opencode/` 未被写入（文件数/mtime 前后一致）
- [x] 环境变量已清理；临时目录（`%TEMP%\opencode\stage44-op001`、`%TEMP%\stage44-ext`）已删除
- [x] `opencode run` 判别器局限与凭证**仅在隔离目录内**使用（真实凭证副本随隔离目录一并删除，未外传）

## 十一、局限与未验证假设

1. 结论**仅对 `opencode-ai@1.18.33`** 成立（版本差异不可迁移）。
2. §二.2 冲突项：仅记录「本机未复现」；**未**推定真实成因，**未**将未验证结论写入框架文档。
3. §二.3 配置热重载未单独实测（不属本 op 清单）。
4. `--tool` 探针的 ask 自动放行行为属本版本实现细节，未在其它版本验证。
5. 子 agent（`task` 委派）路径下的 ruleset 继承未单独实测（R1/R2/R3/R7 均为 primary agent 直接调用）。
