# v1.1.2-stage-45 — 平台强限定内容「描述泛化」

> **版本**：v1.1.2 | **创建日期**：2026-09-28 | **Planner**：独立 openfeel-planner
> **上级计划**：`.openfeel/plan/v1/v1.1.2/plan.md`
> **需求来源**：用户指令原文——「AGENTS.md 中『所有 Agent 必须遵循全局 `~/.config/opencode/AGENTS.md` 中「Agent 工具使用规范」』这类表述把绝对路径写死到 opencode；OpenFeel 未来会适配更多 harness，因此不应使用这种限定路径。检查所有强限定平台的内容，并更新为无平台限制的描述」。
> **定位**：**仅描述泛化**——把「opencode 是唯一 harness」的描述性内容改为无平台表述；opencode 具体路径仅在「opencode 适配器实现细节」语境保留并显式标注。

---

## 一、阶段目标与定位

| 目标 | 说明 |
|------|------|
| 描述泛化 | 模板 / 规则 / 注释 / 帮助文案 / 文档 / 手册中「以 opencode 为唯一 harness」的表述，改为「当前 harness」「平台适配器」等无平台限定表述 |
| 保留适配器细节 | opencode 具体路径/命令/字段仅在适配器实现语境保留，并显式标注为「opencode 适配器」 |
| 零行为变更 | **不改变任何运行时路径解析结果**；不改 `global-paths.ts` 逻辑、不引入适配器抽象层、不改 `templates-data/opencode/` 目录树、不改 `$schema`、不回改历史归档 |

### 用户裁定边界（不可推翻）

- ✅ 泛化：描述性内容（模板/规则/注释/帮助/文档/手册）
- ✅ 保留但**标注**：opencode 具体路径在「opencode 适配器实现细节」语境
- ❌ 不做：`global-paths.ts` 路径参数化、harness 适配器抽象层、`templates-data/opencode/` 目录树改名、`$schema` 改动、历史归档回改（`CHANGELOG.md`、`docs/phase-*`、`.openfeel/kb/**` 历史条目、测试 fixture）

---

## 二、前置依赖与盘点核对

### 2.1 依赖

- **hard 依赖 `v1.1.2-stage-44`**：两者均修改 `src/core/templates-data/opencode/agents/**`，**必须串行**（44 改 permission 块，45 改描述文案，避免同文件并发改动）。
- **下游**：`v1.1.2-stage-43` soft 依赖本阶段——文档/手册/README 的通用化应在版本收口前完成，避免 stage-43 写完文档后本阶段再回改。

### 2.2 盘点核对结论（A 类须泛化 / B 类保留）

**A 类（须泛化）— 已抽查核对：**

| 区域 | 文件:行（已核实行号） | 内容性质 |
|------|----------------------|----------|
| 核心源码注释 | `src/core/global-paths.ts:10,12,15,20,25,30,35,50,52` | 注释/文档字符串中的 `~/.config/opencode`、`auth.json` 表述 |
| | `src/core/opencode-config.ts:2,3,13,27,107` | 模块注释（适配器实现文件，保留 opencode 引用但**标注适配器**） |
| | `src/core/model-config.ts:8,9,12,13,17,18,20,23,75,91,99,107-109,135,151,153,178,184,221,224,229,241,251,296,308,317,318,333,352,359,367,380,393` | 注释/错误文案（多为适配器实现，按语境保留或标注） |
| | `src/core/init.ts:7,11`（另 `:24,160,239,261,266,301`） | 注释中的全局 opencode 路径 |
| | `src/core/setup.ts:3,11,59,61,68` | 注释/日志文案 |
| | `src/core/migrate.ts:74`（另 `:20,28-33,66,96-99,169,178,188`） | 注释/字段名（`.opencode/...` 为 legacy 检测，**保留**） |
| 命令层 | `src/commands/init.ts:20`、`src/commands/setup.ts:3,12,22`、`src/commands/migrate.ts:20`、`src/commands/project.ts:52,56,67,98,99,101,106` | 帮助文案/显示文案（`.opencode/` 路径为探测逻辑，**保留路径、仅泛化标签**） |
| i18n | zh `:438,442,573,634,636,653,654`；en `:418,421,540,601,603,620,621` | `opencode.jsonc` / `opencode 默认` / `~/.config/opencode/...` 文案 |
| 模板权威源 | `src/core/templates-data/agents-md/zh-CN.md:3`、`en.md:3` | 「部署到 `~/.config/opencode/AGENTS.md`」 |
| | `opencode/agents/zh-CN/feel.md:155,163,165`、`openfeel-archiver.md:20,45`、`openfeel-utility.md:~39`（**待核对**） | 全局 AGENTS.md / auth.json / `.opencode/agents` 表述 |
| | `opencode/skills/{openfeel-agent-model-check,openfeel-model-config,openfeel-model-check}/SKILL.md`（多处 auth.json / opencode.jsonc / 重启 opencode） | 已核实：agent-model-check `:3,27,31,34,59,65,73,79,89,90,92,93,112,113`；model-config `:3,19,31,44,47,51,52,60,61`；model-check `:19,23,31` |
| 工作区规则 | `AGENTS.md:82`（**用户直接点名**）、`.openfeel/dev/dev_core.md:40,124-126`（陈旧项）、`.openfeel/adapters/README.md:9,32` | 规则/规范描述 |
| 文档 | `README.md:5,25`、`README.zh-CN.md:7,53`、`README.en.md:7,53`、`docs/commands.md:369` | 平台支持说明/命令说明 |
| 手册 | `.openfeel/manual/core/{global-paths,setup,update,model-config,opencode-config,init,template-loader,migrate,build,update-infos}.md`、`manual/index.md`、`manual/agents/feel.md`（**具体行号须复核**） | 模块文档 |

**B 类（保留，不得泛化）：** `opencode.jsonc` 文件名与 `$schema`；opencode 配置字段（`instructions`/`skills`/`agent.*.model`/`permission`/`default_agent`）；适配器目录本体 `.opencode/`/`kilo/`/`claude/`；opencode CLI 调试命令（KB 历史）；构建产物文件本体；`supportedTools` 注册表（`src/core/update.ts:56-66`，作为预留扩展点保留）；历史归档与 fixture；模型 ID/provider key。

> ⚠️ **行号漂移/归类修正须以实施时复核为准**，差异在 op 内记录（用户已授权）。本计划已抽查核对上表大部分行号；`openfeel-utility.md:~39` 与 `manual/**` 行号标注「待核对」。

---

## 三、op 级任务清单

| op | 主题 | 具体改动点（文件:行号 → 改动） / 验收要点 |
|----|------|------------------------------------------|
| op-001 | 核心源码 / 命令层 / i18n **描述泛化**（零行为变更） | 仅改**注释、帮助文案、日志文案、错误文案**中的平台限定表述，**不改任何路径解析逻辑/常量值**：① `src/core/global-paths.ts:10,12,15,20,25,30,35,50,52` — 注释改为「当前 harness 全局配置目录 / 平台适配器全局路径」类表述，并标注「（opencode 适配器实现）」；② `src/core/{opencode-config,model-config,init,setup,migrate}.ts` — 注释/文案泛化，适配器实现文件保留 opencode 引用处**显式加「opencode 适配器」标注**；③ `src/commands/{init,setup,migrate,project}.ts` — 帮助/显示文案泛化（`项目.ts` 的 `.opencode/` 探测**路径保留**，仅标签泛化，如「agents/（平台适配器）」）；④ `src/core/i18n-data/{zh-CN,en}.ts` — zh `:438,442,573,634,636,653,654` / en `:418,421,540,601,603,620,621` 文案泛化（`opencode 默认`→「平台默认」等）。**验收：Grep 无「唯一 harness」式表述残留；`npm test` 全绿（路径断言不变，见 op-004）；zh/en i18n 键对称** |
| op-002 | 模板权威源泛化 + build 重生成（双语） | ① `src/core/templates-data/agents-md/{zh-CN,en}.md:3` — 「部署到 `~/.config/opencode/AGENTS.md`」改为「由平台适配器部署到全局配置目录（当前：opencode 适配器 → `~/.config/opencode/AGENTS.md`）」；② `opencode/agents/{zh-CN,en}/feel.md:155,163,165`、`openfeel-archiver.md:20,45`、`openfeel-utility.md`（待核对行）— 平台路径表述泛化/标注；③ `opencode/skills/{openfeel-agent-model-check,openfeel-model-config,openfeel-model-check}/SKILL.md` — 涉及「读取 auth.json / 改 opencode.jsonc / 重启 opencode」的操作**属 opencode 适配器语义，保留**，但首段/描述补「当前 harness（opencode 适配器）」标注；④ `npm run build` 重生成 `template-loader.ts` 生成段与 `.opencode/` 自举实例。**验收：build 通过；单一源一致；zh/en 同步；`.opencode/` 自举含新文案** |
| op-003 | 工作区规则 / 文档 / 手册泛化 | ① `AGENTS.md:82`（用户点名）— 「全局 `~/.config/opencode/AGENTS.md`」改为「当前 harness 的全局规则文件（由平台适配器部署；opencode 适配器为 `~/.config/opencode/AGENTS.md`）」；② `.openfeel/dev/dev_core.md:40,124-126` — 修正陈旧项（`core.md`/`AGENT_DEFINITIONS`/`CORE_INSTRUCTIONS_TEMPLATE_B64` 已退役）并泛化平台表述；③ `.openfeel/adapters/README.md:9,32` — 修正「目前仅 opencode」与已废弃 `.opencode/instructions/core.md` 的陈旧描述，改为「多 harness 预留」；④ `README.md:5,25`、`README.zh-CN.md:7,53`、`README.en.md:7,53` — 平台支持说明泛化；⑤ `docs/commands.md:369` — 「更新 OpenCode 适配文件」→「更新平台适配文件（当前：opencode）」；⑥ `.openfeel/manual/**` 相关模块文档按盘点泛化（行号复核后）。**验收：文档无「唯一 harness」表述；`openfeel lint kb` 零错误；zh/en 文档一致（README 三份）** |
| op-004 | 测试断言核对 + 全量回归 | ① `test/core/global-paths.test.ts:31-64` **不改**（本阶段未改路径逻辑 → 硬断言 opencode 路径仍成立，理由记录）；② `test/core/{setup,model-config,update-infos,migrate,managed-region,template-loader}.test.ts`、`test/commands/{model,migrate,init}.test.ts` — 若因文案/生成段变化而失败则同步断言，否则不动；③ `npm run build && npm test` 全绿；`openfeel lint i18n` / `lint kb` 零错误。**验收：全绿；每个未改测试文件说明「为何无需改」** |

---

## 四、影响文件清单

| op | 新增 | 修改 |
|----|------|------|
| op-001 | — | `src/core/{global-paths,opencode-config,model-config,init,setup,migrate}.ts`、`src/commands/{init,setup,migrate,project}.ts`、`src/core/i18n-data/{zh-CN,en}.ts` |
| op-002 | `.opencode/agents/*.md`、`.opencode/skills/**`（重生成） | `src/core/templates-data/agents-md/{zh-CN,en}.md`、`.../opencode/agents/{zh-CN,en}/{feel,openfeel-archiver,openfeel-utility}.md`、`.../opencode/skills/{openfeel-agent-model-check,openfeel-model-config,openfeel-model-check}/SKILL.md`、`src/core/template-loader.ts`（生成段） |
| op-003 | — | `AGENTS.md`、`.openfeel/dev/dev_core.md`、`.openfeel/adapters/README.md`、`README.md`、`README.zh-CN.md`、`README.en.md`、`docs/commands.md`、`.openfeel/manual/**` |
| op-004 | 新增/调整测试用例 | `test/core/*.test.ts`、`test/commands/*.test.ts`（按需；多数应无需改） |

---

## 五、完成标准

1. A 类盘点范围内**描述性内容**均无「opencode 为唯一 harness」式表述；保留的 opencode 具体路径/字段均标注为「opencode 适配器」。
2. **零行为变更**：`global-paths.ts` 等路径解析结果不变；`opencode.jsonc`/`$schema`/目录树/`supportedTools` 未动。
3. 模板权威源改动经 `npm run build` 生成，生成段与 `.opencode/` 自举一致（单一源校验通过）；zh/en 双语同步。
4. `AGENTS.md:82` 用户点名处已泛化。
5. `npm test` 全绿；`openfeel lint i18n` / `lint kb` 零错误；未改测试文件有「无需改」说明。
6. B 类内容与历史归档未被改动。

---

## 六、风险与注意事项

| # | 风险 | 缓解 |
|---|------|------|
| R1 | 泛化误改路径逻辑/常量，改变运行时行为 | 严格限定「注释/文案/文档」；op-004 断言路径不变；code review 逐行确认无逻辑改动 |
| R2 | 把适配器实现细节过度泛化，导致可执行指令失真（如 skill 里的真实命令） | 适配器语境保留并标注；仅泛化「唯一 harness」式断言 |
| R3 | 行号漂移/归类错误 | 以实施时复核为准；已在计划标注「待核对」项 |
| R4 | 与 stage-43 文档改动重叠 | 顺序上 45 先于 43；43 收口时以 45 结果为准 |
| R5 | 与 stage-44 同改 agent 模板冲突 | **硬性串行**：44 → 45 |
| R6 | 误回改历史归档（kb/CHANGELOG/docs/phase-*） | 明确列入禁改；仅允许新增归档条目（由 archiver） |
| R7 | README 三份不一致 | op-003 要求三份同步，人工核对 |

---

## 七、op 执行顺序与依赖

```
op-001（源码/命令/i18n 文案）
   │
   ├─→ op-002（模板权威源 + build 重生成）
   ├─→ op-003（规则/文档/手册）
   └─→ op-004（测试核对 + 全量回归）
```

**建议顺序**：op-001 → op-002 → op-003 → op-004。

- op-001 先行：源码/i18n 文案先定型，避免模板与源码措辞不一致。
- op-002 依赖 op-001 的最终措辞；op-003 文档独立。
- op-004 最后回归。

---

## 八、修订记录

| 时间 | 修订人 | 依据 | 修订内容 |
|------|--------|------|----------|
| 2026-09-28 | openfeel-planner | 用户新增需求二（平台强限定内容泛化） | 新建本阶段：描述泛化（op-001~op-004），含盘点核对结论与「待核对」标注 |

> 三处既有裁定不变（#5 画像仅兜底 / #6 只修全量 done、不做 current 回退 / 技能源扁平单文件无 `{lang}`）。
