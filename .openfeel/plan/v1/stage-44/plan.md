# v1.1.2-stage-44 — 权限模型修正

> **版本**：v1.1.2 | **创建日期**：2026-09-28 | **Planner**：独立 openfeel-planner
> **上级计划**：`.openfeel/plan/v1/v1.1.2/plan.md`
> **需求来源**：`docs/phase-5/07-openfeel-permission-issue.md`（OpenFeel 权限模型问题）
> **定位**：修正 agent 模板的 `permission` 声明，使「项目级全程免审」可用，并补齐 `external_directory` 键、文档化覆盖语义。**范围仅限权限模型**（agent 模板 permission 块 + 相关文档/手册 + 必要的 opencode.jsonc 模板字段 + 测试），**不做平台抽象层**。

---

## 一、阶段目标与定位

| 反馈建议 | 目标 | 对应 op |
|:--:|------|:--:|
| 建议 1 | agent 模板 `permission:` 补 `external_directory`（9 agent × 双语） | op-001 |
| 建议 2 | 文档化「agent 级 permission 覆盖/优先于顶层」语义 | op-003 |
| 建议 3 | 项目级外部目录/权限入口（裁定：opencode 原生 `agent.<name>.permission`，仅文档化） | op-003（O3） |
| 建议 4 | `openfeel setup`/`update` 保留用户自定义（核实：控制区标记已覆盖，无需额外工作） | op-003（O4 说明） |
| 建议 5 | 只读外部放行、写入才询问（裁定：不采纳，opencode 无该粒度） | 记录（O5） |
| — | 平台语义实测（前置） | op-000 |

---

## 二、既有事实核实（文件:行号）

### 2.1 9 个 agent 的 `permission:` 块（权威源，zh-CN 与 en 结构完全一致）

| agent | 权威源（zh-CN）:行 | 实有键 | 缺 `external_directory` |
|-------|--------------------|--------|:--:|
| `feel` | `src/core/templates-data/opencode/agents/zh-CN/feel.md:6-14`（en `:6-14`） | bash, read, glob, grep, task, todowrite, skill, webfetch | 缺 |
| `openfeel-archiver` | `openfeel-archiver.md:6-10` | bash, read, glob, grep | 缺 |
| `openfeel-executor` | `openfeel-executor.md:7-12` | bash, read, glob, grep, task | 缺 |
| `openfeel-feel-tester` | `openfeel-feel-tester.md:6-13` | bash, read, glob, grep, task, skill, webfetch:deny | 缺 |
| `openfeel-planner` | `openfeel-planner.md:6-10` | bash, read, glob, grep | 缺 |
| `openfeel-reviewer` | `openfeel-reviewer.md:7-11` | bash, read, glob, grep | 缺 |
| `openfeel-schemer` | `openfeel-schemer.md:6-10` | bash, read, glob, grep | 缺 |
| `openfeel-utility` | `openfeel-utility.md:7-12` | bash, read, glob, grep, **write** | 缺 |
| `openfeel-vision` | `openfeel-vision.md:7-11` | bash, read, glob, grep | 缺 |

> **关键确认**：9 个 agent **均未声明 `external_directory`**（问题报告 §2.2 成立）。

### 2.2 opencode 的 permission schema（**尽力实测**，本机 `opencode-ai@1.18.33` 二进制）

- **`external_directory` 是合法 permission 键**。实测二进制内 schema 定义：
  `Struct({read, edit, glob, grep, list, bash, task, external_directory, todowrite, question, webfetch, websearch, lsp, doom_loop, skill}, Record(String, ...))`（`opencode-windows-x64/bin/opencode.exe` 字符串）。`external_directory` 出现 153 次，含 UI 文案「Permission external_directory protects files outside project」与示例 `"external_directory": { "~/secrets/**": "deny", "*": "allow" }`。
- **默认值 = `ask`**：内置默认权限含 `external_directory:{"*":"ask", <内部目录>:"allow"}`（二进制字符串）。
- **顶层 `permission` 存在**：配置对象含 `permission`，运行时以 `merge(agent.permission, config.permission)` 组规则（二进制字符串）。**但**：agent 级、内置默认、顶层三者叠加的确切「覆盖 vs 合并」优先级**无法仅凭二进制字符串确证** → **标注「待实测」**（op-000）。
- **发现（须核实）**：二进制中存在一段对**所有** agent 追加 `external_directory:{"*":"allow"}` 的逻辑（除非已有 deny）——与「默认 ask」表征矛盾，属实测要点（op-000 必须确证真实生效值）。
- **发现（潜在缺陷）**：`openfeel-utility.md` 使用 `write` 键，但 schema 的授权键为 `edit`（opencode 将 `write`/`edit`/`patch` 工具映射到 `edit` 权限）；`write` 仅因 `StructWithRest` 兜底不报错，语义存疑。**待 op-000 实测**，若确认无效则改为 `edit`（op-001）。

### 2.3 opencode.jsonc 模板

- 项目模板 `buildProjectOpencodeJsoncObj`（`src/core/opencode-config.ts:28-30`）：**仅** `{ $schema }`，**不写** `permission`。
- 全局模板 `buildGlobalOpencodeFrameworkObj`（`src/core/opencode-config.ts:14-25`）：写 `$schema`、`default_agent: 'feel'`、`agent.{openfeel-vision,openfeel-reviewer}.model`；**不写** `permission`。
- 框架 agent 覆盖合并 `mergeAgentDefaults`（`:66-76`）：仅在用户**完全未定义**该 agent key 时补整条 `{model}`；用户定义该 agent key 即视为完整自定义，框架不补内部字段。

### 2.4 构建产物与生成段

- 权威源 agent → build 步骤 2/5 注入 `template-loader.ts` 的 `AGENT_TEMPLATES` / `OPENCODE_AGENT_TEMPLATES`；build 步骤 8（`build.js:1077-1083`）重生成 `.opencode/agents/*.md` 自举实例（含生成标记）。
- `.opencode/agents/feel.md:6-14` 实测与权威源一致 → **禁止手改，须改权威源后 `npm run build`**。
- **陈旧规则**：`.openfeel/dev/dev_core.md:124` 仍称 agent 同步到 `src/core/update.ts` 的 `AGENT_DEFINITIONS`（已不存在）→ 归 stage-45 修正（不属本阶段）。

---

## 三、关键裁定 O1~O5

### O1：agent 模板是否移除内联 `permission`？

**裁定：保留 `permission` 块 + 补 `external_directory`（不清除）。**

- 依据：① opencode 内置默认权限为 `{"*":"allow", ...}`，故多数 agent 的内联块**本就与默认等价**，移除收益极小；② `openfeel-feel-tester` 的 `webfetch: "deny"` **依赖内联块**，移除会造成安全回退；③ planner/schemer/reviewer 等「无 write/edit」体现**框架最小权限意图**，移除后依赖默认 `*:allow` 反而放宽；④ 补键方案在「覆盖」与「合并」两种语义下**都有效**（对报告 §五的「镜像全量键」思路一致）。
- 影响面：9 agent × 2 语言 × 1 行；无运行时逻辑变更。

### O2：`external_directory` 默认值取 `allow` 还是 `ask`？

**裁定：框架默认取 `allow`。**

- 依据：① 9 个 agent 均已 `bash: "allow"`，shell 本就可访问任意外部路径（`cat`/`ls` 等），`ask` **不构成真实安全边界**，只制造摩擦；② 与 OpenFeel「自动化流水线常需访问工作区外路径（引擎/SDK/临时构建目录）」定位一致（报告 §三.2）；③ 用户如需收紧，可在项目 `opencode.jsonc` 的 `agent.<name>.permission.external_directory` 覆盖（O3 文档化）。
- 备选（若审查倾向保守）：值取 `{ "*": "allow" }` 语义等价；或取 `ask` 并仅文档化「如何放行」——见风险 R2。
- 影响面：9 agent × 2 语言 × 1 行；行为上「外部目录不再默认询问」。

### O3：是否提供项目级权限入口？

**裁定：不新增 CLI/生成器，仅文档化 opencode 原生入口。**

- 依据：opencode 已原生支持项目 `opencode.jsonc` 的 `agent.<name>.permission`（报告 §五即用此法）；再叠加一层 OpenFeel CLI 生成器属**重复造轮子 + 过度设计**（AGENTS.md 约束 2）。O1+O2 落地后，agent 已默认 `external_directory: allow`，「放行」无需入口；仅「收紧/精细化」需要，直接写项目 jsonc 即可。
- 交付：在 agent 模板文档段与 manual 中说明「改审批行为 → 项目 `opencode.jsonc` 的 `agent.<name>.permission`；顶层 `permission` 对已声明 agent 可能被其块内规则覆盖」。
- 待实测：项目 jsonc 的 `agent.<name>.permission` 与 agent frontmatter `permission` 的合并/覆盖顺序（op-000 覆盖）。

### O4：`openfeel setup`/`update` 是否保留用户自定义？

**裁定：已覆盖，无需额外工作。**

- 依据：agent `.md` 经 `deployGlobalAsset` → `writeManagedFile`（`src/core/update.ts:1299-1363`，markdown 策略）：frontmatter 走 `mergeFrontmatter`（`managed-region.ts:185-190`，`{...existing, ...incoming}`：框架字段覆盖、用户新增字段 passthrough）；正文走 `<!-- openfeel:begin/end -->` 受管区替换，**区外用户内容保留**；无标记且 hash 不符时**只追加不改写**并记 `update_infos`（`:1343-1357`）。
- 交付：仅在文档中说明「用户自定义须写入受管区外；受管区内会被框架更新覆盖」。

### O5：是否采纳「只读外部放行、写入才询问」？

**裁定：不采纳。**

- 依据：opencode 的 `external_directory` 是**单一键**（无 read/write 子粒度，实测 schema 与示例均如此）；其审批发生在「路径越界」时，与工具是读还是写无关。故该粒度**在 opencode 上无法表达**，采纳会引入无法兑现的承诺。记录为「不采纳（平台能力不支持）」。

---

## 四、op 级任务清单

| op | 主题 | 具体改动点（文件:行号 → 改动） / 验收要点 |
|----|------|------------------------------------------|
| op-000 | **权限语义实测（前置，硬性）** | 比照 v1.1 stage-37 op-000：隔离 HOME + 临时项目，(a) 以 `opencode debug config` 导出解析后各 agent 的 effective permission；(b) 实测「顶层 `permission:"allow"` + agent 内联 permission」下外部目录是否询问，判定**覆盖 vs 合并**；(c) 确证 `external_directory` 默认值（含 §2.2 发现的自动追加 allow 逻辑是否真生效）；(d) 确证 `write` 键是否被识别（对比 `edit`）；(e) 确证项目 jsonc `agent.<name>.permission` 与 frontmatter 的优先级。**产出实测记录**，回填 O1~O5 与 op-001 取值。若无法在本机构造外部目录访问，至少以 `debug config` 的 effective ruleset 为准并在计划标注局限。**验收：实测记录含 5 项结论（或明确「无法确证 + 原因」）** |
| op-001 | agent 模板 permission 补键 | `src/core/templates-data/opencode/agents/{zh-CN,en}/*.md`（9×2=18 文件）：在各自 `permission:` 块末尾新增 `external_directory: "allow"`（值依 O2）；**若 op-000 确认 `write` 未被识别**，将 `openfeel-utility.md`（zh `:12`、en `:12`）的 `write: "allow"` 改为 `edit: "allow"`。**验收：18 文件均含 `external_directory`；zh/en 同步；utility 键与 schema 对齐** |
| op-002 | build 重生成 + 一致性 | 改权威源后 `npm run build`：重生成 `src/core/template-loader.ts` 的 `AGENT_TEMPLATES`/`OPENCODE_AGENT_TEMPLATES` 生成段与 `.opencode/agents/*.md` 自举实例（`build.js:1077-1083`）；确认「单一源一致性」校验通过。**验收：build 无错；生成段与权威源一致；`.opencode/agents/*.md` 含 `external_directory`** |
| op-003 | 文档化覆盖语义与配置入口 | ① `src/core/templates-data/agents-md/{zh-CN,en}.md`：新增/补「权限模型」说明段（agent 级 permission 与顶层 permission 的关系、`external_directory` 默认、收紧方式）——该模板部署为全局 AGENTS.md；② 仓库根 `AGENTS.md`：同步说明（若适用）；③ `.openfeel/manual/`：在相关模块文档（`cli/setup.md` 或新建 `core/permission.md`）记录判定与配置方法；④ 说明 O4「用户自定义写受管区外」。**验收：文档含覆盖语义 + 收紧入口 + 受管区说明；zh/en 双语同步** |
| op-004 | 测试 | 新增断言：① 每个 agent 权威源 frontmatter 含 `external_directory`（9×2）；② zh/en permission 键集一致；③ `utility` 键与 schema 对齐（若 op-000 确认）；④ `template-loader` 生成段与权威源一致。**验收：`npm test` 全绿，新增断言通过** |

---

## 五、影响文件清单

| op | 新增 | 修改 |
|----|------|------|
| op-000 | 实测记录（私域 tmp/或文档） | — |
| op-001 | — | `src/core/templates-data/opencode/agents/zh-CN/*.md`（9）、`.../en/*.md`（9） |
| op-002 | 构建产物 `.opencode/agents/*.md`（重生成） | `src/core/template-loader.ts`（生成段） |
| op-003 | `.openfeel/manual/core/permission.md`（可选） | `src/core/templates-data/agents-md/{zh-CN,en}.md`、`AGENTS.md`、`.openfeel/manual/**` |
| op-004 | 新增测试用例 | `test/core/template-loader.test.ts`、`test/core/opencode-instance.test.ts`、`test/core/update.test.ts`（按需） |

---

## 六、完成标准

1. 9 个 agent × zh-CN/en 的 `permission:` 块均显式含 `external_directory`（值依 O2）；`openfeel-utility` 键与 schema 对齐（op-000 确认后）。
2. `npm run build` 通过；生成段与 `.opencode/agents/*.md` 与权威源一致（单一源校验）。
3. 文档说明覆盖语义 + 项目级收紧入口 + 受管区/自定义边界（双语）。
4. `npm test` 全绿，含新增权限断言。
5. op-000 实测记录留存，O1~O5 结论与实测一致（或标注无法确证项及原因）。

---

## 七、风险与注意事项

| # | 风险 | 缓解 |
|---|------|------|
| R1 | opencode 权限覆盖/合并语义未确证，改动可能不生效 | op-000 硬性前置；补键方案对两种语义均有效 |
| R2 | `external_directory: allow` 被审查认为过于宽松 | 备选：改为 `ask` + 文档化放行方式；或值用 `{ "*": "allow" }`；O2 已列备选 |
| R3 | `write`→`edit` 误改导致 utility 权限变化 | 仅当 op-000 确认 `write` 无效才改；`edit` 与默认 `*:allow` 一致，无实际放宽 |
| R4 | 手改生成段/自举实例 | 只改权威源 + `npm run build`；生成段有 AUTO-GENERATED 锚点 |
| R5 | 双语不同步 | op-001/op-003 均要求 zh/en 同步；测试断言键集一致 |
| R6 | 与 stage-45 冲突（同改 agents 模板） | **强制串行**：stage-44 → stage-45 |

---

## 八、op 执行顺序与依赖

```
op-000（实测前置）
   │
   └─→ op-001（模板补键）
            │
            ├─→ op-002（build 重生成 + 一致性）
            ├─→ op-003（文档化）
            └─→ op-004（测试）
```

**建议顺序**：op-000 → op-001 → op-002 → op-003 → op-004。

- op-000 硬性前置：决定 O1~O5 与 `write`/`edit` 取值。
- op-002 须紧随 op-001（生成段/自举同步）。
- op-004 最后回归。

---

## 九、修订记录

| 时间 | 修订人 | 依据 | 修订内容 |
|------|--------|------|----------|
| 2026-09-28 | openfeel-planner | 用户新增需求一（`docs/phase-5/07-openfeel-permission-issue.md`） | 新建本阶段：权限模型修正（O1~O5 裁定 + op-000~op-004） |

> 三处既有裁定不变（#5 画像仅兜底 / #6 只修全量 done、不做 current 回退 / 技能源扁平单文件无 `{lang}`）。
