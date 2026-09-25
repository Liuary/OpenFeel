# Plan — stage-40: 模型配置接口

> **版本**：v1.1.0-stage-40
> **创建日期**：2026-09-25
> **Planner**：独立 Planner（推理模型）
> **规模判定**：单阶段中等规模（新增 1 核心模块 + 1 CLI 命令组 + 测试，约 7~8 文件，无跨模块架构变更，无 ≥2 阶段拆分）
> **定位**：v1.1.0 六阶段收官（stage-35~39 已 done）。提供 `openfeel model` CLI 命令 + 内部 API，快速修改「工具默认 / 全局 / 当前项目」三层级的指定 agent 模型，解决「改 agent 模型要手动改多处文件 + 重启」的痛点。
> **来源**：`.openfeel/plan/v1/v1.1/plan.md`（stage-40 章节 + 关键裁定）+ 本计划调研复核。

---

## 一、知识库参考

| 条目 | 路径 | 相关性 |
|------|------|--------|
| OpenCode Agent 模型配置（`provider/model-name` 格式） | kb/setup.md #OpenCode Agent 模型配置 | **直接命中**。模型名格式 `{auth.json key}/{model ID}` 的依据 |
| 模型名错误导致 Agent 无法启动 | kb/troubleshooting.md #模型名错误导致 Agent 无法启动 | **直接命中**。全链路改模型（agent 文件 + 模板源 + 生成段）的坑位 |
| opencode 全局/项目 agent 合并语义（源码验证） | kb/architecture.md #opencode 全局/项目 agent 与 skill 合并语义 | **直接命中**。项目覆盖全局、agent 按名 mergeDeep——三层级优先级依据 |
| JSONC 深度合并模式 | kb/patterns.md #JSONC 深度合并模式 | 复用。全局/项目 opencode.jsonc 读写用 parseJsonc/deepMergeJsonc |
| 控制区标记模式 | kb/patterns.md #控制区标记模式 | 复用。agent frontmatter 读写用 splitFrontmatter/mergeFrontmatter/serializeFrontmatter |
| 全局/项目双 state 路由模式 + 原子写/文件锁 | kb/patterns.md #全局/项目双 state 路由模式 / #原子写模式 | 复用。全局 `~/.config/opencode/opencode.jsonc` 写盘须加锁 + 原子写 |
| 模型配置三级体系（default/agents/roles） | kb/architecture.md #模型配置三级体系 | **注意区分域**。那是 `.openfeel/config.yaml` 的 Awareness 配置，与本阶段 opencode 侧 `agent.model` 不同域 |
| 跨平台行尾归一化模式 | kb/patterns.md #跨平台行尾归一化模式 | 必须遵循。frontmatter 读写归一化 CRLF |

> ⚠️ 执行任务前，若知识库中有相关条目，务必参考。重复踩过的坑不可再犯。

---

## 二、背景与动机

v1.1.0 前五阶段完成后，框架资产已全局化（`~/.config/opencode/`）、模板单源化（`templates-data/`）。但 agent 模型配置仍分散在**三处**且**无统一入口**：用户想给某 agent 换模型，须手工定位并改动对应文件，改完还须重启 opencode。本阶段提供 `openfeel model` CLI + 内部 API 一键完成三层级读写。

### 调研确认事实（本计划复核）

| 项 | 结论 | 证据 |
|----|------|------|
| **agent 显式 model 分布** | 4 个 agent 有显式 model（frontmatter）：`openfeel-executor`/`openfeel-utility`=`deepseek/deepseek-flash`、`openfeel-reviewer`=`zhipuai/glm-5.2`、`openfeel-vision`=`alibaba-cn/qwen3-vl-plus`；其余 5 个（feel/planner/schemer/feel-tester/archiver）无显式 model（靠 opencode 默认） | `templates-data/opencode/agents/{zh-CN,en}/*.md` frontmatter |
| **全局 opencode.jsonc 框架默认** | 由代码构造（非模板文件）：`opencode-config.ts` `buildGlobalOpencodeFrameworkObj()` 内含 `agent.openfeel-vision.model`、`agent.openfeel-reviewer.model` 两处 | `opencode-config.ts` L14-25 |
| **「工具默认」落点修正** | 大计划 stage-40 裁定写「`templates-data/opencode/opencode.jsonc`」，但该文件 **stage-37 已退役**（全局 opencode.jsonc 改为代码构造，见 build.js L338「opencode_jsonc / gitignore 已随全局部署退役」）。故「工具默认」的 opencode.jsonc 侧落点 = **`opencode-config.ts` 的 `buildGlobalOpencodeFrameworkObj()`**，非模板文件 | build.js L333-338 + opencode-config.ts |
| **解析优先级**（REV-1501 修订） | 真实优先级链：**项目 `opencode.jsonc` `agent.<name>.model` > 全局 `~/.config/opencode/opencode.jsonc` `agent.<name>.model` > agent 文件 frontmatter `model:` > opencode 默认**。frontmatter `model:` **是生效的**（stage-36 实测：executor/utility 改 frontmatter 后即用新模型），并非 skill L43「声明性、不直接控制平台模型分配」的过时说法；opencode.jsonc 的 `agent.model` 会覆盖 frontmatter | kb/architecture + stage-36 实测（skill L43 已过时；setup.md L55 接近正确但未提 opencode.jsonc 覆盖） |
| **auth.json provider** | 当前 key：`deepseek` / `zhipuai` / `alibaba-cn`（模型名校验依据） | 任务裁定 + `openfeel-agent-model-check` skill |
| **CLI 现状** | 无任何 model 相关命令；`openfeel config` 只管画像/语言（`~/.config/openfeel/profile.yaml` 与项目 `.openfeel/config.yaml`）。`openfeel-model-config`/`openfeel-model-check`/`openfeel-agent-model-check` 三 skill 为**文档性质**，非 CLI | `commands/config.ts` + 3 个 skill |
| **可复用能力** | `opencode-config.ts`（parseJsonc/deepMergeJsonc/mergeAgentDefaults）、`global-paths.ts`（getGlobalOpencodeJsoncPath）、`managed-region.ts`（splitFrontmatter/mergeFrontmatter/serializeFrontmatter）、`fs/{atomic-write,file-lock}.ts` | stage-35/37/38 产出 |

---

## 三、已确认决策（用户裁定，不可推翻）

### D1：接口形式

- CLI 命令：`openfeel model set/get/list` + `--scope default|global|project`
- 内部 API：供 Agent/skill 在「Model not found」报错时自动调用（见 §四 内部 API 设计）

### D2：三层级落点

| scope | 落点 | 影响范围 |
|-------|------|----------|
| `default`（工具默认） | （REV-1501 修订，按 9 agent 分类）框架默认模型源：**有显式 model 的 4 个**（executor/utility/reviewer/vision）→ `templates-data/opencode/agents/{zh-CN,en}/*.md` 的 frontmatter `model:`（双语）；其中 **vision/reviewer 额外** 改 `opencode-config.ts` `buildGlobalOpencodeFrameworkObj()` 的 `agent.<name>.model`（需在全局 opencode.jsonc 显式指定异种/多模态模型）。**无显式 model 的 5 个**（feel/planner/schemer/feel-tester/archiver）→ default scope **报错/提示**「该 agent 无框架默认 model，请用 `--scope global/project`」，**不新增框架默认条目**（避免过度设计） | 以后 init/update 部署的默认值（不直接改本机已部署实例） |
| `global`（全局） | `~/.config/opencode/opencode.jsonc` 的 `agent.<name>.model` | 本机所有项目 |
| `project`（当前项目） | 项目根 `opencode.jsonc` 的 `agent.<name>.model` | 仅当前项目 |

---

## 四、Planner 新增判断与设计（超出 D1/D2，供审查 / Schemer 确认）

### 4.1 三层级语义精确定义

改动粒度均为 **agent 级**（写/删 `agent.<name>.model` 或 frontmatter `model:`，不触碰同 agent 其他字段、不触碰其他 agent）：

| scope | 改哪些文件 | 读写方式 |
|-------|-----------|----------|
| `default` | ①（REV-1501 修订）**有显式 model 的 4 agent**（executor/utility/reviewer/vision）：`templates-data/opencode/agents/{zh-CN,en}/*.md`（8 处）的 frontmatter `model:`；②（REV-1501 修订）其中 **vision/reviewer 额外**：`opencode-config.ts` `buildGlobalOpencodeFrameworkObj()` 的 `agent` 对象（2 处）。**无显式 model 的 5 agent**（feel/planner/schemer/feel-tester/archiver）在 default scope 下**报错/提示**改用 `--scope global/project`，不新增框架默认 | ① 用 `managed-region` 的 `splitFrontmatter` → 改/删 `model` 键 → `serializeFrontmatter` 写回（保留其他 frontmatter 字段与正文）；②（REV-1502 修订）`buildGlobalOpencodeFrameworkObj()` 是 TS 源码，运行时改需**结构化定位对象字面量**（按 `agent.<name>` 键定位 `{ model: '...' }` 行精确替换），避免裸正则脆弱 |
| `global` | `~/.config/opencode/opencode.jsonc` 的 `agent.<name>.model` | `parseJsonc` → 改/删 `agent[name].model` → 序列化写回（**加锁 + 原子写**，因全局跨项目共享）。（REV-1507 修订）**只改 `model` 键**，不触碰同 agent 其他字段（引用 `mergeAgentDefaults` 约束） |
| `project` | 项目根 `opencode.jsonc` 的 `agent.<name>.model` | 同上，但项目内文件**仅原子写、不加锁**（遵循双 state 路由模式中「项目 state 仅原子写」约定） |

**「工具默认」双语同步**：`default` scope 的 agent frontmatter 改动须 zh-CN 与 en 两语言**同步**（agent 名与 model 值双语一致，与现有 8 处一致）；`opencode-config.ts` 的 `agent` 对象无语言维度，仅一处。

**无显式 model agent 的 default 策略（REV-1502 修订）**：feel/planner/schemer/feel-tester/archiver 这 5 个 agent 在 frontmatter 与 `buildGlobalOpencodeFrameworkObj()` 均无显式 model（靠 opencode 默认）。对其执行 `--scope default` 时**报错并提示**「该 agent 无框架默认 model，请改用 `--scope global`（本机全局）或 `--scope project`（当前项目）」，**不为其新增框架默认条目**（避免过度设计、避免与 opencode 默认语义冲突）。

### 4.2 模型名校验

- **格式**：`{provider}/{model-id}`，两者均非空、不含空白与 `/`（provider 内）。provider 必须精确匹配 auth.json key。
- **provider 校验（硬）**：读取 `~/.local/share/opencode/auth.json` 顶层 key 集合（当前 `deepseek`/`zhipuai`/`alibaba-cn`）；provider 不在集合 → 报错并列出合法 provider，拒绝写入。（REV-1505 修订）auth.json 路径解析走 `global-paths.ts` 新增 `getAuthJsonPath()`（遵守 N4 路径集中约束），测试 mock 一处即隔离。
- **model-id 校验（软）**：无法完全离线校验可用模型列表；仅做格式校验（非空、无空白），通过后**提示**「以 `Model not found` 报错中的 `Did you mean` 建议为准」，不硬 block。
- **auth.json 缺失**：降级为「仅格式校验 + 提示无法核对 provider」，不阻断（避免 CI/未登录环境卡死）。
- **错误提示**：含三段——原因 + 当前可用 provider 列表 + 合法示例（`openfeel model set openfeel-vision alibaba-cn/qwen3-vl-plus --scope global`）。

### 4.3 「工具默认」scope 的特殊性（rebuild）

- `default` scope 写入的是**框架源码/模板源**，须 `npm run build` 重生成 `template-loader.ts` 注入段 + `.opencode/` 自举实例才生效。
- **默认不自动触发 build**（build 为重操作：rmSync dist + tsc 全量编译 + 自举实例重生成 + 一致性校验）。CLI 完成 `default` 写入后**提示**：`请运行 npm run build 重生成部署产物`；提供 `--build` flag 显式触发（命令内 `execSync('npm run build')`）。
- **幂等性**：`default` 写入后如未 build，`template-loader.ts` 与 `templates-data` 源会短暂不一致；build 的一致性校验（`validateOpencodeAgentTemplates`）会兜底检出。CLI 写入 frontmatter 后立即 build 可消除该窗口。

### 4.4 内部 API 设计（供 Agent/skill 自动调用）

NEW `src/core/model-config.ts`，导出纯函数（不直接 console 输出，返回结构化结果）：

```ts
export type ModelScope = 'default' | 'global' | 'project';

export interface SetModelResult {
  ok: boolean;
  scope: ModelScope;
  agentId: string;
  model: string;
  changedFiles: string[];      // 实际写盘的文件绝对路径
  needsBuild?: boolean;         // default scope 时为 true
  warning?: string;             // 软校验提示（如 model-id 无法核对）
}

export interface GetModelResult {
  agentId: string;
  effective?: string;           // 生效值（project > global > default 解析）
  byScope: Partial<Record<ModelScope, string | null>>; // 各 scope 显式值（null=未显式）
  inconsistent?: boolean;       // （REV-1503 修订）default 层多源（frontmatter + opencode-config.ts）不一致时为 true
}

/** 定位目标文件 + 读写 agent.model（复用 opencode-config / managed-region / global-paths / fs） */
export function setAgentModel(scope: ModelScope, agentId: string, model: string, opts?: { build?: boolean }): SetModelResult;

/** 读取指定 scope 的显式 model；scope=undefined 时返回三层级合并后的生效值 */
export function getAgentModel(agentId: string, scope?: ModelScope): GetModelResult;

/** 列出所有 9 个 agent 的模型（可指定 scope 或展示生效值） */
export function listAgentModels(scope?: ModelScope): GetModelResult[];

/** 校验模型名格式 + provider（对照 auth.json）；返回 { ok, error? } */
export function validateModel(model: string): { ok: boolean; error?: string };

/** 读取 auth.json 顶层 provider key 集合（缺文件返回 null） */
export function readAuthProviders(): string[] | null;
```

- （REV-1503 修订）**get 的 default scope 读取语义**：`default` 层为**多源**（agent frontmatter `model:` + `opencode-config.ts` `agent.<name>.model`）。两源不一致时以「**真正生效源**」为准——即 `opencode.jsonc agent.model > frontmatter model:`（opencode 语义下 opencode.jsonc 覆盖 frontmatter）；此时 `GetModelResult.inconsistent` 置 `true` 供调用方提示。
- （REV-1503 修订）**effective 解析链取值规则**：逐层 `project → global → default`，取**首个非空显式值**为该层值；若三层均无显式值，`effective` 为 `undefined`（表示「走 opencode 默认」）。`default` 层取值按上一条多源规则解析。
- （REV-1507 修订）**listAgentModels 语义**：始终返回**完整 `byScope`**（各 scope 显式值），`scope` 参数**仅控制展示层**（默认展示 effective），不改变返回数据完整度。

- `setAgentModel` 在「Model not found」报错时被 Agent/skill 调用：读取报错中的 `provider/model` → 调用 `validateModel` → 调用 `setAgentModel(scope, agentId, model)` → 据 `needsBuild` 提示重启/build。
- agent 名输入归一化：复用 `normalizeAgentName`（flow-manager，旧名 → `openfeel-` 新名），保证 `openfeel-executor` 与 `executor` 均命中。

### 4.5 CLI 命令面

```
openfeel model set <agent> <model> [--scope default|global|project] [--build] [--force]
openfeel model get <agent> [--scope default|global|project]   # 无 --scope 展示生效值
openfeel model list [--scope default|global|project]          # 无 --scope 展示生效值
```

- 默认 `--scope`：`project`（改动最小、最安全，符合「谨慎改全局/默认」直觉）。
- （REV-1504 修订）`--scope default` 需确认（改框架源码，影响未来部署）：**非 TTY 下必须显式 `--force`（或 `--build`）双重确认，否则拒绝并报错**；TTY 下可交互提示确认（不强制 flag）。防止脚本/CI 无人工审查误改框架默认。

---

## 五、工作阶段（op 级）

### 概览

| op | 主题 | 变更目标 | 文件数 |
|----|------|----------|:--:|
| op-001 | 模型配置核心 API | NEW `src/core/model-config.ts`（定位目标文件 + 读写 agent.model + 校验） | ~1 |
| op-002 | CLI 命令 | NEW `src/commands/model.ts` + 注册 `cli/index.ts` + i18n 键（zh-CN/en） | ~4 |
| op-003 | 测试 | NEW `test/core/model-config.test.ts` + NEW `test/commands/model.test.ts` | ~2 |

### 依赖图

```
op-001（model-config.ts 核心 API：读写 + 校验 + auth.json provider 读取）
   │ hard
   ▼
op-002（commands/model.ts 命令面 + 注册 + i18n）
   │ hard
   ▼
op-003（三层级读写 + 校验 + 幂等测试，隔离 HOME + mock auth.json）
```

### op-001 详细

- **任务**：实现 `model-config.ts`，按 scope 定位目标文件并读写 `agent.<name>.model` / frontmatter `model:`。
- （REV-1501 修订）**前置实测**：先用 `opencode debug config` 验证 frontmatter `model:` 与 opencode.jsonc `agent.model` 的优先级链（确认「opencode.jsonc > frontmatter」及 frontmatter 生效），作为实现 get/effective 解析的依据，避免再采信 skill 过时说法。
- **涉及文件**：NEW `src/core/model-config.ts`；复用 `opencode-config.ts`、`global-paths.ts`、`managed-region.ts`、`fs/{atomic-write,file-lock}.ts`、`flow-manager.ts`（normalizeAgentName）。
- **完成标准**：
  - `setAgentModel`/`getAgentModel`/`listAgentModels`/`validateModel`/`readAuthProviders` 五函数可单元测试。
  - 三 scope 写盘路径正确（REV-1501 修订）：`default`→ 有显式 model 的 4 agent 改 templates-data frontmatter（executor/utility/reviewer/vision）+ vision/reviewer 额外改 opencode-config.ts；无显式 model 的 5 agent 报错提示改用 global/project；`global`→`~/.config/opencode/opencode.jsonc`（加锁+原子写，只改 model 键）；`project`→项目 `opencode.jsonc`（原子写）。
  - frontmatter 改写保留其他字段与正文（用 managed-region）。
  - （REV-1503 修订）`getAgentModel` 支持 default 层多源读取（frontmatter + opencode-config.ts），不一致时按「真正生效源」取值并置 `inconsistent`。

### op-002 详细

- **任务**：注册 `openfeel model` 命令组（set/get/list + --scope + --build + --force），接入 i18n。
- **涉及文件**：NEW `src/commands/model.ts`、`src/cli/index.ts`（import + register）、`src/core/i18n-data/{zh-CN,en}.ts`（help 域新增键）。
- **完成标准**：`openfeel model set/get/list` 三层级可用；`--scope default` 后提示/执行 build；（REV-1504 修订）非 TTY 下 `--scope default` 缺 `--force`/`--build` 时报错拒绝；模型名校验错误信息含 provider 列表；help 双语。

### op-003 详细

- **任务**：三层级读写、校验、幂等测试。
- **涉及文件**：NEW `test/core/model-config.test.ts`、NEW `test/commands/model.test.ts`。
- **完成标准**：`npm run build && npm test` 全绿（现有 569 + 新增）。

---

## 六、测试策略

| 验证点 | 方式 |
|--------|------|
| 三 scope 读写 | 隔离 HOME（`HOME`/`USERPROFILE`→tmp）；`default` 断言 templates-data frontmatter + opencode-config.ts 变更；`global` 断言 `~/.config/opencode/opencode.jsonc` 变更；`project` 断言项目 opencode.jsonc 变更。（REV-1506 修订）`default` scope 测试须**隔离仓库源**——将 `templates-data/opencode/agents/` 与 `opencode-config.ts` 拷贝到临时目录操作，或 `git stash`/`git checkout` 还原，避免污染仓库 |
| 模型名校验 | mock auth.json（临时 `~/.local/share/opencode/auth.json` 含 `deepseek/zhipuai/alibaba-cn`）；断言 provider 不匹配拒绝、model-id 格式非法拒绝、缺 auth.json 降级 |
| 幂等 | 重复 `set` 同一值不漂移（frontmatter 不产生多余行、jsonc 不破坏结构）；`get` 后值与写入一致 |
| frontmatter 合并 | `set` 一个 agent 的 model，断言同文件其他 frontmatter 字段（description/mode/permission）与正文保留 |
| 生效值解析 | `get`（无 scope）断言 `project > global > default` 覆盖顺序 |

---

## 七、风险点与缓解

| # | 风险 | 影响 | 缓解 |
|---|------|------|------|
| 1 | 误改框架模板源（`default` scope） | 高（污染未来所有项目默认值） | `default` 仅改 `model` 键不触其他；`--build` 后 build 一致性校验兜底；写前 `--dry-run`（如实现）预览 |
| 2 | 模型名校验不严（provider 拼错） | 中（写入后 Agent 无法启动） | provider 硬校验对照 auth.json；model-id 软校验 + `Did you mean` 提示 |
| 3 | scope 语义混淆（default vs global vs project） | 中（改错层级，影响范围误判） | 默认 `--scope project`；`default`/`global` 写前明确提示落点与影响范围 |
| 4 | `default` 写入后未 build 导致源/产物短暂不一致 | 低 | CLI 完成即提示 build；build 一致性校验兜底检出 |
| 5 | 全局 opencode.jsonc 并发写损坏 | 中 | 复用 stage-35 文件锁 + 原子写 |
| 6 | frontmatter 改写破坏 YAML 结构 | 中 | 复用 managed-region 的 splitFrontmatter/serializeFrontmatter（stage-38 已测） |

---

## 八、完成标准（本阶段）

- `openfeel model set/get/list` 可对三层级指定 agent 完成模型读写，`--scope default|global|project` 语义正确。
- 内部 API `setAgentModel/getAgentModel/listAgentModels/validateModel/readAuthProviders` 可在「Model not found」报错时被 Agent/skill 调用。
- 模型名校验对照 auth.json provider key 生效（provider 硬校验、model-id 格式软校验）。
- `npm run build && npm test` 全绿（569 + 新增）；i18n / kb lint 零错误。

---

## 九、待确认议题（交 Feel / 用户拍板）

| # | 议题 | 本计划默认（Recommended） | 备注 |
|---|------|--------------------------|------|
| Q1 | 「工具默认」的 opencode.jsonc 落点：改 `opencode-config.ts` 代码构造 vs 恢复 `templates-data/opencode/opencode.jsonc` 模板文件 | **改代码**（保持 stage-37 已定型的「代码构造」现状，不恢复已退役模板文件） | 大计划裁定原文写的是模板文件路径，实际已退役，需用户确认此修正 |
| Q2 | `--scope default` 后是否自动 `npm run build` | **不自动，提示 + `--build` flag 显式触发** | build 为重操作，自动触发有副作用（重写生成段 + 自举实例） |
| Q3 | 模型名校验严格度 | **provider 硬校验 + model-id 格式软校验**（不硬 block model-id） | model-id 无法离线核对全量可用列表 |
| Q4 | CLI 默认 `--scope` | **`project`**（改动最小、最安全） | 用户裁定未指定默认值 |
| Q5 | 是否需要 `openfeel model reset <agent> --scope`（清除显式 model 回退默认） | **本阶段不做**（避免过度设计，可用 `set` 覆盖或手工删） | 如需要可后续追加 |
| Q6 | （REV-1501 修订）frontmatter `model:` 真实语义：采纳 stage-36 实测结论（生效，被 opencode.jsonc `agent.model` 覆盖），推翻 skill「声明性不直接控制」的过时说法 | **采纳实测结论** | kb 存在矛盾（setup.md L55 vs skill L43），需后续修正 kb/skill 文档，本阶段计划已按实测更正 |

---

## 十、变更汇总

| 类别 | 数量 | 说明 |
|------|:--:|------|
| 新增源码 | 2 | `src/core/model-config.ts`、`src/commands/model.ts` |
| 修改源码 | 2 | `src/cli/index.ts`（命令注册）、`src/core/global-paths.ts`（新增 `getAuthJsonPath()`，REV-1505） |
| 修改 i18n | 2 | `src/core/i18n-data/{zh-CN,en}.ts`（help 域键） |
| 新增测试 | 2 | `test/core/model-config.test.ts`、`test/commands/model.test.ts` |

> 本计划引用知识库多条既有条目；阶段完成后由 Archiver 将「三层级模型配置接口」沉淀至 kb/architecture.md（架构决策）与 kb/patterns.md（CLI 模型配置模式）。
