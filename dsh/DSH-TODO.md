# DSH 侧待办（OpenFeel v1.2.4 交接）

> **状态**：OpenFeel 侧 A1~A5 已全部交付并验收（v1.2.4）。**v1.3.0 起已被「单包分发 + `openfeel setup --tools dsh`」取代**——本文件保留为历史交接记录；安装/升级以根 README 的 DSH 节与 `setup --tools dsh` 为准。
> **基线**：OpenFeel `1.2.4` ｜ DSH `0.2.0-rc.2`
> **权威契约**：OpenFeel `docs/json-contract.md`
> **补充材料**：OpenFeel `docs/dsh-cli-requirements-supplement-1.2.3.md`（内容已增量至 v1.2.4）
> **边界**：`dsh/` 代码归属 DSH 侧；OpenFeel 不再直接修改 `dsh/`，本文仅作交接清单。

---

## 0. 结论

- OpenFeel 已提供 **40 个成功 `--json` 出口 / 41 个注册 `--json` 选项**。
- A1（归档覆盖保护）、A2（`plan stage list`）、A3（`model list|get`）、A4（`flow retry` / `lint` / `roadmap show`）、A5（`config get --all`）全部落地。
- DSH 侧剩余工作共 **4 组**：7 处文本回显改 JSON、A1 语义适配、A5 调用面、`requiresCli` 与测试/文档同步。

---

## 1. 7 处文本回显改为 `cli.json()`

| # | 位置 | 适配器调用 | 新 CLI 命令 | 期望结构 |
|:-:|---|---|---|---|
| 1 | `dsh/lib/tools/index.js:370` | `feel_stage action=list` | `plan stage list --json` | `{ schemaVersion, stages:[{id,phase,status,deps,workflowMode,opsTotal,opsDone}], count }` |
| 2 | `dsh/lib/tools/index.js:1066` | `feel_plan action=stage_list` | `plan stage list --json` | 同上 |
| 3 | `dsh/lib/tools/index.js:1142` | `feel_model action=list` | `model list --json` | `{ schemaVersion, scope, agents:[{agent,provider,model,source}] }` |
| 4 | `dsh/lib/tools/index.js:1151` | `feel_model action=get` | `model get <agent> --json` | `{ schemaVersion, scope, agent, provider, model, source }` |
| 5 | `dsh/lib/tools/index.js:543` | `feel_op action=retry` | `flow retry --op <id> --json` | `{ schemaVersion, op, attempts, maxAttempts, exhausted, state }` |
| 6 | `dsh/lib/tools/index.js:952` | `feel_verify action=lint` | `lint <kb\|i18n> --json` | `{ schemaVersion, target, ok, issues:[{path,message}] }` |
| 7 | `dsh/lib/tools/index.js:1090` | `feel_plan action=roadmap_show` | `roadmap show [version] --json` | `{ schemaVersion, version, milestones:[{title,theme,stage,deliverable}] }` |

**目标**：

- 文本回显 **8 → 1**（仅保留 `instructions` 的 XML 默认形态，`index.js:1106`）
- `--json` 调用点 **25 → 32**

> 注意：`roadmap show --json` 不传版本时返回空态 `{ version: null, milestones: [] }`（不自动发现版本）；需要当前版本时请显式传版本号。

---

## 2. A1：`archive <stage>` 覆盖保护适配

### CLI 新行为

- 目标归档文件已存在且未传 `--force`：
  - `exit 1`
  - `code = "ARCHIVE_EXISTS"`
  - `kind = "refusal"`
  - **零写盘**（归档内容 / `flow.json` revision / `log[]` / KB 均不变）
- 传 `--force`：显式覆盖，成功返回 outlet #33 六键文档：
  `{ schemaVersion, stage, archivePath, opsCount, reviewsCount, knowledgeExtracts }`
- 保护是**归档文件级**：`archive v1.2.0-stage-78` 与 `archive stage-78` 派生不同目标文件，互不触发。

### DSH 侧动作

- `feel_archive` 的 `stage_summary` 路径：
  - 识别 `ARCHIVE_EXISTS` 时不要盲目重试；把「已存在，需 `--force`」作为明确结果返回给模型/用户。
  - 增加/透传 `--force` 参数（若工具面需要该能力）。
  - 更新 `stage_summary` 的返回语义（成功/拒绝/覆盖三种）。
- 测试：拒绝、零写盘、`--force` 成功、别名边界。

---

## 3. A5：`config get --all --json` 调用面

- CLI：`config get --all --json` → `{ schemaVersion, scope: "project", defaults }`，不再因缺 key 报 `key-required`。
- DSH：`feel_verify action=config_get` 支持无 key 全量读取；有 key 时保持原行为。

---

## 4. `requiresCli` 升级

`dsh/package.json`：

```json
{
  "openfeel": {
    "adapter": "dsh",
    "requiresCli": ">=1.2.4"
  }
}
```

---

## 5. 测试与验收

### 必跑

```bash
cd dsh
node test/contract.js      # schema 契约
node test/verify.js        # 行为（真实 CLI + 真实 .openfeel 副本）
node test/integration.js   # 真实 cordis + 真实 ToolRuntime 挂载
```

### 验收判据

- contract / verify / integration 全绿
- 文本回显 **8 → 1**（仅 `instructions` XML）
- `--json` 调用点 **25 → 32**
- `verify.js` 对原项目 `flow.json` revision 与归档摘要零改动
- 新增 A1~A5 出口断言（至少覆盖：`plan stage list` / `model list|get` / `flow retry` / `lint` / `roadmap show` / `config get --all`）

### 判据陷阱

v1.2.2+ 起失败也输出 JSON envelope。判断「支持 `--json`」必须同时满足：

- `exit == 0`
- 文档中**没有** `error` 键
- `schemaVersion` 首键

不能只看首行是否为 `{`。

---

## 6. 文档同步

- DSH `docs/CLI-REQUIREMENTS.md`：更新交付状态与 A1~A5 实现说明。
- DSH `plugin/README.md` / `README.md`：更新读命令 JSON 覆盖、A1 语义、`requiresCli`。
- 保留对 OpenFeel 补充材料和 `docs/json-contract.md` 的引用。

---

## 7. 边界（不变）

1. **不要镜像 `PHASE_AGENT_MAP`**：`flow next --json.responsibleAgent` 是唯一权威。
2. **不要解析中文文本**：失败读 `error.kind` / `error.code`。
3. **不要用「有无堆栈」分类失败**：`kind` 为分类权威，退出码为冗余信号。
4. **`flow advance --json` 不是成功出口**：成功仍为人类输出；推进后重新读取 `flow next` / `flow status --json`。
5. **`legalNextPhases` ⊆ advance 接受集合**：多步目标不会出现在直接可达集合中。
6. **`dsh/` 代码归 DSH 侧**：OpenFeel 不直接修改；发现问题以文档/issue 反馈。

---

## 8. 完成清单

- [x] 7 处 `cli.text()` → `cli.json()`（§1）
- [x] `feel_archive` 处理 `ARCHIVE_EXISTS` / 透传 `--force`（§2）
- [x] `feel_verify action=config_get` 支持无 key 全量（§3）
- [x] `requiresCli >= 1.2.4`（§4）
- [x] contract / verify / integration 全绿（§5）
- [x] 新增 A1~A5 出口断言（§5）
- [x] 文本回显 8 → 1、JSON 调用 25 → 32（§5）
- [x] DSH 文档同步（§6）
- [x] 未修改 OpenFeel 源码；`dsh/` 边界保持（§7）

---

## 9. 完成记录（DSH 侧，2026-10-17）

| 项 | 结果 |
|---|---|
| OpenFeel 版本 | 实测 `1.2.4`（`--version --json`） |
| `--json` 调用点 | **25 → 32** |
| 文本回显 | **8 → 1**（仅 `instructions` 的 XML 默认形态，`lib/tools/index.js` 唯一 `cli.text`） |
| `requiresCli` | `>=1.2.4` |
| 验证 | contract **42/42**、verify **66/66**、integration **10/10** = **118 断言** |

### A1 实测取证（临时副本，未触碰真实仓库）

```
基线:  revision=1297  log=361  md=115 行  hash=112DE29A…
无 --force → { error: { code: "ARCHIVE_EXISTS", kind: "refusal" } }  exit 1
  零写盘校验: md 哈希相等=True  revision 不变=True  log 不变=True  md 仍 115 行
加 --force → exit 0，六键文档；md 重写为 20 行，revision=1298
```

适配器把 `ARCHIVE_EXISTS` 翻译为可操作提示（指引 `force=true`），不盲目重试；
`force=true` 成功时 summary 明确标注「已**覆盖重写**」。

### A1~A5 新增断言覆盖

`plan stage list`（2 处调用）、`model list`、`model get`（含未配置 agent 的 `model: null`）、
`flow retry`、`lint`、`roadmap show`（空态 `version: null` 语义）、`config get --all`（含带 key 回归）、
`archive` 三态（拒绝 / 零写盘 / force 成功）。

### 遗留：线上宿主需重启

Loader 按 URL 缓存 ESM 模块，`set_bundle enable=false→true` **不会**重新导入。
实测确认：重启前本会话仍返回旧形态（`feel_model action=list` 返回 `output` 文本），
重启后才会加载 v1.2.4 适配器。<br>
（注：上轮「路径迁移」曾因真实路径变化意外绕过缓存，本轮回路径稳定，故需重启。）

