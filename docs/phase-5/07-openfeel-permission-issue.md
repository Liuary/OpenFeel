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
