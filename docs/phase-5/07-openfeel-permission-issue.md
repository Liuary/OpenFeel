# OpenFeel 权限模型问题：agent 级 permission 覆盖导致项目级「全程自动审批」失效

> 提交背景：2026-09-28，Pantheogen 项目。用户要求「开启全程自动审批」，在项目 `opencode.jsonc` 写入 `"permission": "allow"`（schema 合法，等价「全放行」）后，agent 访问**工作区外目录**仍需授权。本文档定位根因、给出证据并提改进建议，供 OpenFeel 维护者参考。
> 关联：`docs/06-openfeel-tooling-feedback.md`（CLI 工具链视角）。

---

## 一、现象

- 项目 `opencode.jsonc` 设置 `"permission": "allow"`。
- 但 agent（Feel 及 8 个 `openfeel-*` 子 agent）访问工作区外目录（如 `C:\Users\Liuary\Dev\Third\godot\...`）时**仍被要求授权**，项目级配置无法实现「全程免审」。

## 二、根因（三层叠加）

### 1. agent 级 `permission` 覆盖顶层 `permission`（opencode 语义，主因）

OpenFeel 由 `openfeel setup` 部署的 **9 个 agent 定义**（`~/.config/opencode/agents/*.md`）**各自内联了一个 `permission:` 白名单**。以 `feel.md` 为例：

```yaml
permission:
  bash: allow
  read: allow
  glob: allow
  grep: allow
  task: allow
  todowrite: allow
  skill: allow
  webfetch: allow
```

opencode 规则是「**per-agent `permission:` 覆盖顶层 `permission:`**」。因此项目里的 `"permission": "allow"` **对这些 agent 不生效**。

### 2. agent 白名单遗漏 `external_directory`

9 个 agent 的 `permission` 块**均未包含 `external_directory` 键**。该键不继承顶层 `allow`，回落到内置默认值 `ask` → 访问工作区外目录即触发授权询问。

### 3. 配置不热重载（次要）

opencode 仅在启动时读取配置，任何改动须**退出并重启**才生效。

## 三、影响

1. **用户无法在项目内实现「全程自动审批」**——必须去改**全局** agent 文件；而全局文件是框架资产，被 `openfeel setup` 管理、可能被覆盖。
2. **与框架定位冲突**：OpenFeel 的 agent 经常需要访问工作区外路径（Godot 引擎安装目录、.NET/Node SDK 路径、临时构建目录等），默认 `ask` 与「自动化流水线」定位相悖。
3. **审批粒度无处表达**：用户想「只放行引擎目录、其余仍询问」时，没有任何项目级入口。

## 四、改进建议（供 OpenFeel 采纳）

| # | 建议 | 说明 |
|---|------|------|
| 1 | **agent 模板补 `external_directory`** | 在 `~/.config/opencode/agents/*.md` 的 `permission:` 中显式声明 `external_directory`（如 `allow`，或留可配置项），随 `openfeel setup` 部署 |
| 2 | **文档化「agent 级覆盖顶层」语义** | 在 AGENTS.md / 部署说明中明确：改审批行为须改 **agent 定义**，顶层 `permission` 对已定义 agent 无效 |
| 3 | **提供项目级外部目录入口** | 例如让 `openfeel setup` 读取项目的 `external_directory` / `references` 并生成 per-agent 覆盖模板 |
| 4 | **`openfeel setup` 保留用户自定义** | 避免用户手改 agent 文件后被后续 setup 覆盖 |
| 5 | （可选）**区分只读/写外部访问** | 默认放行只读外部访问、写入才询问，可兼顾安全与效率 |

## 五、本项目采用的规避方案（项目级）

在项目 `opencode.jsonc` 的 `agent.<name>.permission` 中，为 9 个 agent **镜像全局白名单并追加 `external_directory: allow`**：

```jsonc
"agent": {
  "feel": {
    "permission": {
      "bash": "allow", "read": "allow", "glob": "allow", "grep": "allow",
      "task": "allow", "todowrite": "allow", "skill": "allow", "webfetch": "allow",
      "external_directory": "allow"
    }
  },
  "openfeel-executor": { "permission": { "bash": "allow", "read": "allow", "glob": "allow", "grep": "allow", "task": "allow", "external_directory": "allow" } }
  // …其余 agent 同理
}
```

**为什么镜像全量键**：项目级与全局级配置理论上 deep-merge，但若某实现为「替换」语义，仅写 `external_directory` 会丢失原有 `bash/read/...` 白名单；镜像可对两种语义都安全。

> 注意：此方案仍属**项目级规避**，未改动全局 agent 文件；若 OpenFeel 采纳建议 1，本规避即可移除。

## 六、一句话

OpenFeel 把 `permission` 内联进每个 agent 定义，导致**项目级 `permission` 被 agent 级覆盖**，且模板遗漏 `external_directory`——用户无法在项目内实现「全程自动审批」。建议在 **agent 模板补 `external_directory`** 并**文档化覆盖语义**。

---

*本文档为 Feel 总统领的一手问题定位，供 OpenFeel 项目维护者参考。*

---

## 勘误与实测补充（opencode 1.18.33，2026-09-29）

> 本节为**追加的勘误**，**不改写上文原文**。依据：`.openfeel/plan/v1/stage-44/op-001-findings.md`（隔离 HOME 实测 + 二进制取证 + `opencode run` 行为判别器）、v1.1.2-stage-44 审查官独立复验（R-①/R-②/R-③）、测试官 E2E（RUN 1~8）。
> **适用范围**：以下结论**仅对 `opencode-ai@1.18.33` 成立**，**未覆盖其它版本**——opencode 版本间权限语义的可迁移性未经验证。

### 一、实测结论（五点）

1. **单值与对象形式等价**：`external_directory: "allow"`（单值）与 `{"*": "allow"}`（对象）均被 schema 接受且生成**同一规则**；单值形式经行为级实测生效（框架统一取单值）。
2. **`write` 非授权键、`edit` 才是**：授权键为 `edit`（write/patch 工具映射到 `edit` 权限）；`permission: {write: "deny"}` **不生效**（`tools.write` 仍为 `true`），`{edit: "deny"}` 才拦截 ⇒ OpenFeel `openfeel-utility` 模板的 `write` 已改为 `edit`。
3. **`external_directory` 平台默认 `ask`**：内置默认 `{"*":"ask"}` + opencode 内部 `tool-output` / `%TEMP%\opencode` 目录 allow；**不存在**「对所有 agent 自动追加 `external_directory:{"*":"allow"}`」——自动追加的 allow **仅限 opencode 自身内部目录**，对用户任意外部路径无效。⇒ 框架补键是**行为变更（ask → allow）**，不是单纯「显式化」。
4. **agent `.md` 与配置文件按权限键深合并、同名键 `.md` 优先**：顶层 `permission` 与 `agent.<name>.permission` 对 `.md` **未声明**的键生效；对 `.md` **已声明**的键**无法覆盖** ⇒ **唯一项目级收紧入口 = 项目 `.opencode/agent/<name>.md`**（可整体覆盖全局同名 agent）。
5. **顶层 `permission: "allow"` 会覆盖 `external_directory`**：求值以 `findLast`（最后匹配者胜）+ 规则 `permission` 字段通配匹配（`"*"` 匹配任意权限名），顶层 `*:allow` 位于内置默认**之后**，故对 `external_directory` **生效** ⇒ 实测「项目顶层 `permission: "allow"` + 无 `external_directory` 键的 agent」访问外部目录**免询问**（含真实 9-agent 形态）。

### 二、对原文的推翻与限定（重要）

| 原文 | 实测（1.18.33） | 裁定 |
|------|-----------------|:--:|
| §二.1「agent 级 `permission` 覆盖顶层 `permission`」 | 仅对**同名键**成立（`.md` 后置胜出）；未声明键顶层规则生效 | **过度概括** |
| §二.2「`external_directory` 不继承顶层 `allow`，回落内置默认 `ask`」 | **不成立**：顶层 `permission: "allow"` 对 `external_directory` 生效，外部目录免询问 | **❌ 推翻** |
| §二.3「配置不热重载」 | 未单独实测，作为现象的可能解释保留 | 未验证 |
| §五「镜像全量键」规避方案 | **无效**：合并为按键深合并、`.md` 优先，项目 `opencode.jsonc` 无法覆盖 `.md` 已声明的键 | **方案失效** |

> **成因说明（诚实记录）**：本次实测**未能复现**用户在 Pantheogen 项目报告的现象（写入项目顶层 `permission: "allow"` 后仍需授权）。§二.3（配置未热重载）、项目配置未加载、或用户配置文件差异均为**未验证的候选解释**，本文**不推定成因**。

### 三、框架侧处置（v1.1.2-stage-44）

1. 9 agent × zh-CN/en 共 18 个权威源模板的 `permission:` 块补 `external_directory: "allow"`（单值），`openfeel-utility` 的 `write` → `edit`；
2. 「agent 级与顶层 permission 的关系 + 项目级收紧入口（`.opencode/agent/<name>.md`）+ 受管区边界」已文档化至根 `AGENTS.md` 权限模型节、`agents-md/{zh-CN,en}.md` 与 `.openfeel/manual/core/permission.md`；
3. **维护提示**：上述语义由 opencode 版本决定，升级 opencode 后建议按 `op-001-findings.md` 的场景 A~F 重新复验。
