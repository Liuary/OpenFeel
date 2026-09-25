# Plan — stage-36: 模板源收敛 + 命名前缀统一

> **版本**：v1.1.0-stage-36
> **创建日期**：2026-09-25
> **Planner**：独立 Planner（推理模型）
> **规模判定**：架构级（跨模块——模板双层源、构建管线、9 agent / 14 skill 命名体系、源码运行时映射、全库引用、测试断言、自举实例）
> **定位**：v1.1 改造第二阶段（v1.1 大计划 P0）。**D2 全量落地 + P3 单源定型**，是 stage-37 全局部署的名称与内容前提。
> **来源**：`.openfeel/plan/v1/v1.1/plan.md`（stage-36 章节 + D2 / P3 / P5）+ 用户已裁定的 D36-1/2/3/5。

---

## 一、知识库参考

| 条目 | 路径 | 相关性 |
|------|------|--------|
| 双层模板源发散：init 与 update 部署内容不一致 | kb/troubleshooting.md #双层模板源发散 | **直接命中**。本阶段首要收敛对象，必须根治 |
| 多语言模板数据管线 | kb/architecture.md #多语言模板数据管线 | **高度相关**。收敛后单一源的构建注入管线依据 |
| 构建脚本多语言循环生成模式 | kb/patterns.md #构建脚本多语言循环生成模式 | 必须遵循。build.js 语言循环注入结构 |
| 新增 Agent 全链路更新清单模式 | kb/patterns.md #新增 Agent 全链路更新清单模式 | **高度相关**。agent 重命名须比照的 9 项全链路清单（反向适用） |
| 跨平台行尾归一化模式 | kb/patterns.md #跨平台行尾归一化模式 | **必须遵循**。双层 skill 源伪分叉（CRLF/LF）与 B64/模板串注入一致性 |
| 部署传播内容哈希比对模式 | kb/patterns.md #部署传播内容哈希比对模式 | 参考。内容比对替代「仅名称/语言判断」 |
| AGENTS.md 模板同步模式 | kb/patterns.md #AGENTS.md 模板同步模式 | 必须遵循。zh-CN / en 双语同步 |
| 版本号重映射边界判定模式 | kb/patterns.md #版本号重映射边界判定模式 | 参考。区分「目录/文件名」（组织单位）与「文本引用」（需替换） |
| update 增量部署哈希追踪 + 冲突标记三态模式 | kb/patterns.md #update 增量部署哈希追踪 + 冲突标记三态模式 | **高度相关**。D36-3 生成物标记须与 stage-38 控制区标记兼容 |
| opencode 全局/项目 agent 与 skill 合并语义 | kb/architecture.md #opencode 全局/项目 agent 与 skill 合并语义 | 参考。skill 同名覆盖非确定 → 名唯一是 stage-37 前提，本阶段重命名奠定 |
| 原子写 / 建议性文件锁模式 | kb/patterns.md #原子写模式 / #建议性文件锁模式 | 参考。本阶段重生成写文件可复用 stage-35 的 `src/core/fs/` 工具 |
| WORKSPACE_DIRS 同步模式 | kb/patterns.md #WORKSPACE_DIRS 同步模式 | 参考。本阶段不新增 `.openfeel/` 子目录 |

> ⚠️ 执行任务前，若知识库中有相关条目，务必参考。重复踩过的坑不可再犯。

---

## 二、背景与动机

v1.0 正式版以来，框架资产（9 agent、14 skill、core 约束、AGENTS.md、opencode.jsonc）以**双层模板源**并存：

1. **agent 双层源**：`templates-data/agents/{lang}/`（供 update 命令）与 `templates-data/opencode/agents/{lang}/`（供 init 命令）。
2. **instruction 双层源**：`templates-data/core-instructions/{lang}.md`（供 update）与 `templates-data/opencode/instructions/{lang}.md`（供 init）。
3. **skill 双层源**：仓库根 `.opencode/skills/`（build.js 步骤 4 的源）与 `templates-data/opencode/skills/`（步骤 6 的源）。
4. **agent/skill 命名无前缀**，与 opencode 生态及用户自定义 agent/skill 存在命名冲突风险；`/opfx:` 是**已脱节的混合命名空间**（15 项混杂 CLI 命令 / agent / skill，且部分无对应实体）。

经实测（本计划调研复核，见附录 A），双层源是**双向漂移**而非单侧落后：

| 对比 | 差异 | 取用 |
|------|------|------|
| `templates-data/agents/{lang}/feel.md` vs `templates-data/opencode/agents/{lang}/feel.md` | `agents/` 版多 21 行「## 冲突检测」节（stage-32 引入） | **取 `agents/` 版** |
| `templates-data/core-instructions/{lang}.md` vs `templates-data/opencode/instructions/{lang}.md` | `opencode/instructions/` 版在两处 Agent 列表含 `Vision` | **取 `opencode/instructions/` 版** |
| 仓库 `.opencode/skills/*` vs `templates-data/opencode/skills/*` | git blob 内容**完全一致**，仅工作树行尾不同（`.opencode/` 为 LF、`templates-data/` 为 CRLF） | **行尾归一为 LF** |

> **行尾复核结论（重要）**：`git config core.autocrlf = input`，git blob 两侧均为 LF 且字节一致（如 `check-kb/SKILL.md` blob 3568 bytes / 0 CRLF）。工作树 `templates-data/` 呈现 CRLF 属检出/编辑器产物，git 视为未修改。**但 build.js 读取工作树**，且 agent/skill 注入步骤**未做 CRLF→LF 归一化**（仅 core-instructions / instructions 步骤做了），故 CRLF 会泄漏进生成的模板字符串，构成跨平台不可复现隐患。本阶段必须补归一化 + `.gitattributes`。

本阶段一次性解决：**模板单源化 + 命名统一化 + `/opfx:` 类型化 + 自举实例标记化**，为 stage-37 全局部署铺平道路。

---

## 三、已确认决策（不可推翻）

### 继承自 v1.1 大计划

- **D2**：`feel` agent 保持原名（唯一例外 / primary / `default_agent`）；其余 8 agent 加 `openfeel-` 前缀（`openfeel-planner` / `-schemer` / `-executor` / `-reviewer` / `-feel-tester` / `-utility` / `-vision` / `-archiver`）；全部 14 skill 加前缀（`openfeel-agent-model-check` / `-bug-acceptance` / `-check-kb` / `-get-bugs` / `-get-stage-status` / `-health` / `-model-check` / `-model-config` / `-recover` / `-roadmap` / `-search-kb` / `-sync-status` / `-update-stage-status` / `-wizard`）。
- **P3**：模板单一源 = `templates-data/`；仓库 `.opencode/` 降级为「构建产物 / 自举实例」，**禁止**再作为源；build.js 所有源路径改指 `templates-data/`。
- **P5**：agent 改名采用「读取兼容 + 写入新名」，不强制改写历史 `flow.json`。

### 用户已裁定（本阶段）

- **D36-1 `/opfx:` 按类型准确引用（废除斜杠命名）**：`/opfx:` 是混合命名空间，15 项按真实类型映射如下；feel.md 的「可调用的 /opfx: 技能」表改写为按类型分类引用；`code` / `test` 改为文字描述。

  | 现 `/opfx:` 条目 | 真实目标 | 类型 | 改写后引用 |
  |---|---|---|---|
  | `flow` | `openfeel flow` | CLI 命令 | `openfeel flow` |
  | `plan` | `openfeel plan` | CLI 命令 | `openfeel plan` |
  | `scheme` | `openfeel plan scheme` | CLI 命令 | `openfeel plan scheme` |
  | `view` | `openfeel view` | CLI 命令 | `openfeel view` |
  | `archive` | `openfeel archive` | CLI 命令 | `openfeel archive` |
  | `kb` | `openfeel knowledge` | CLI 命令 | `openfeel knowledge` |
  | `roadmap` | `openfeel roadmap`（CLI）+ `openfeel-roadmap`（skill） | CLI + skill | 双列（命令 + skill） |
  | `utility` | Utility Agent | agent | `openfeel-utility` |
  | `health` | skill | skill | `openfeel-health` |
  | `recover` | skill | skill | `openfeel-recover` |
  | `wizard` | skill | skill | `openfeel-wizard` |
  | `model-config` | skill | skill | `openfeel-model-config` |
  | `agent-model-check` | skill | skill | `openfeel-agent-model-check` |
  | `code` | 流程阶段（编码），无实体 | 文字 | 「按方案编码实现」 |
  | `test` | 流程阶段（测试），无实体 | 文字 | 「测试验收」 |

  同步清理源码注释中的 `/opfx:`：`src/commands/flow.ts` L14 / L158 / L161、`src/core/i18n-data/{zh-CN,en}.ts` 的 `flow.overview`、`src/core/update.ts` L60 / L1377。

  > ⚠️ **（REV-305 修订，Schemer 待办）**：D36-1 映射表遗漏 `/opfx:status` 条目。`flow.ts` L14/158/161 与 `i18n-data/{zh-CN,en}.ts` L446/L424 中的 `/opfx:status` 改写目标为 `openfeel flow overview`（`status` 是 `flow` 的 overview 子命令视图）；Schemer 须在 op-003 任务 4 按此改写，并在 D36-1 映射表补 `status → openfeel flow overview`（CLI 命令）行。

- **D36-2 双层模板源逐文件取较新合并**：合并后**不得丢失任一侧独有内容**（feel.md 冲突检测节、instructions 的 Vision）；目录结构明确（哪棵树保留、哪棵删除）；行尾统一 LF。
- **D36-3 仓库 `.opencode/` 保留提交 + 标记生成物**：保留为自举实例，在生成文件头部加标记，明确「禁止手工编辑，由 build 生成」，且需与 stage-38 控制区标记方案兼容。（REV-307 修订：生成标记与控制区标记的兼容方式未具体化，见「审查补充待办」REV-307）
- **D36-5 reviewer 模型保持 `zhipuai/glm-5.2`**：实测四处——`.opencode/agents/reviewer.md`、`templates-data/opencode/agents/{zh-CN,en}/reviewer.md`、`templates-data/agents/{zh-CN,en}/reviewer.md`、根与模板 `opencode.jsonc` 的 `agent.reviewer.model`——**已一致为 `glm-5.2`**（此前「用户已改 glm-5.3-flash」的记录有误，用户已回滚并裁定保持 glm-5.2），**无需同步改动**。（REV-301 修订）

---

## 四、Planner 新增判断（超出上述决策，供审查 / Schemer 确认）

| # | 判断 | 理由 | 状态 |
|---|------|------|------|
| **N1** | **单一权威树 = `templates-data/opencode/` 子树**（agents / skills / instructions / opencode.jsonc / ADAPTER / .gitignore）。合并后**删除** `templates-data/agents/` 与 `templates-data/core-instructions/`；`templates-data/agents-md/` 保留（项目级 AGENTS.md 模板，部署目标不同） | 与 REV-005「skills 权威源 = `templates-data/opencode/skills/`」一致；`opencode/` 子树是 stage-37「全局部署 bundle」的镜像，保留它可减少后续搬迁 | **待确认** |
| **N2** | **agent / skill / instructions 三对双源统一为「单一源文件 + 两个独立注入对象」**（沿用 REV-005 模式）：build 步骤 2 与 5 同读 `opencode/agents/`，步骤 4 与 6 同读 `opencode/skills/`，步骤 1 与 7 同读 `opencode/instructions/`；新增 build 断言「三对对象键集与内容一致」 | 消费方不同（update 命令 vs init），不能删注入对象；但源必须唯一，否则重命名后再次漂移 | **待确认** |
| **N3** | **生成物标记形式**：`<!-- openfeel:generated — 本文件由 npm run build 生成，请勿手工编辑 -->`。插入位置：**有 YAML frontmatter 的文件（agent/skill）插入在 frontmatter 闭合 `---` 之后**（插在 `---` 之前会破坏 frontmatter 解析）；无 frontmatter 的 `.md`（ADAPTER）插在首行；`.gitignore` 用 `# openfeel:generated ...` 注释。复用 `openfeel:` 前缀以便 stage-38 的 `<!-- openfeel:begin/end -->` 控制区方案识别与兼容 | 标记必须可被 stage-38 的 managed-region 工具识别，且不得破坏 frontmatter | **待确认（REV-307 修订：与控制区标记兼容方式待 Schemer 具体化）** |
| **N4** | **`.opencode/` 自举实例由 build.js 新增步骤 8 重生成**（从权威源 + 标记写入 `.opencode/{agents,skills,instructions,ADAPTER.md}`），使「由 build 生成」名副其实；build 校验断言「已提交的 `.opencode/` 与权威源一致（忽略标记行）」 | P3 已将 `.opencode/` 定性为构建产物；若不生成则标记失真、且无法防回退 | **待确认（REV-308 修订：步骤 8 须置于 tsc 之后或改独立 `npm run sync:opencode` 脚本——tsc 前无法 import dist 的 `atomicWriteFileSync`）** |
| **N5** | ~~`opencode.jsonc` 的 `agent.reviewer.model` 同步为 `glm-5.3-flash`~~ **已撤销（REV-301 修订）**：实测四处 reviewer 模型（agent 模板 + 两处 `opencode.jsonc`）**均为 `glm-5.2` 且一致**，无第三处不一致可消，保持 `glm-5.2`，**无需动作** | 保持 glm-5.2，无同步动作 | **已撤销** |
| **N6** | **词边界替换纪律**：所有改名走「最长优先 + 负向断言」有序替换（先 `feel-tester`→`openfeel-feel-tester`，再其余 7 名；`feel` 单独保留；禁止把已是 `openfeel-*` 的再前缀化）。skill 名与 CLI 子命令同名词（`health`/`recover`/`roadmap`/`wizard`/`model-check`/`model-config`）须按上下文区分 | `feel` ⊂ `openfeel` ⊂ `openfeel-feel-tester`；`openfeel flow recover` 是 CLI 而非 skill | 既定纪律 |

### 交 Schemer 评估的议题

- **D36-4**：`SKILL_DEFINITIONS`（`update.ts`，供 update）与 `OPENCODE_SKILL_DEFINITIONS`（`template-loader.ts`，供 init）**是否合并为一套**？v1.1 大计划（REV-005）暂定「保留两套同源 + 一致性校验」。**本计划按暂定方案落地（N2），最终由 Schemer 在 op-001 方案中评估**：若合并，需说明两消费方差异如何消解；若不合并，须落地一致性断言。

### 审查补充待办（REV-303~308，Schemer 方案阶段须落地）

> 下列为 Reviewer 补充的**非阻塞**事项，已在各相应位置就地标注；Schemer 展开 op 方案时须逐项落实，不得遗漏。

| # | 待办 | 归属 | 落地要求 |
|---|------|------|----------|
| **REV-303** | P5 读取兼容接入点清单不全 | op-002 任务 6 / 第七章 | 补全 `normalizeAgentName` 接入点：`flow status` / `flow overview` / `flow metrics` 等所有**读取并展示 agent 名**的路径 |
| **REV-304** | `normalizeAgentName` 大小写不一致 | op-002 任务 2 / 第七章 | scheme.ts L122 写 `'Executor'`（大写）、`mapPhaseToAgent` 返回小写 `'executor'`；须内部 `toLowerCase()` 或映射表覆盖两种形式 |
| **REV-305** | D36-1 映射表遗漏 `/opfx:status` | D36-1 决策 / op-003 任务 4 | `flow.ts` L14/158/161、i18n L446/L424 的 `/opfx:status` 改写目标为 `openfeel flow overview`，须在映射表补 `status` 条目 |
| **REV-306** | 测试 fixture 旧名处理策略 | 第八章 / op-004 任务 3 | 区分「构造写入用**新名**」vs「读取兼容验证**保留旧名** + 断言展示新名」两类 fixture，避免混用 |
| **REV-307** | N3 生成标记与控制区标记兼容未具体化 | D36-3 决策 / N3 | 明确 `<!-- openfeel:generated -->` 与 stage-38 `<!-- openfeel:begin/end -->` 兼容方式——「stage-38 落地时统一」或给出精确语法约定 |
| **REV-308** | N4 build 步骤 8 管线位置未明确 | N4 / op-004 任务 2 / 风险 R9 | 步骤 8 须 import `dist` 的 `atomicWriteFileSync`，tsc 前无法引用；建议置于 **tsc 之后**，或改独立 `npm run sync:opencode` 脚本 |

---

## 五、工作阶段（op 级）

### 概览

| op | 主题 | 变更目标 | 文件数 |
|----|------|----------|:--:|
| op-001 | 双层模板源收敛为单源 | 合并 agents/instructions、删冗余树、build.js 改源、行尾归一、reviewer 模型核对（保持 glm-5.2）、三对一致性校验 | ~40 |
| op-002 | agent 重命名（8 个加前缀） | 文件重命名 + frontmatter + 源码运行时映射 + 全库引用 + P5 读取兼容 | ~45 |
| op-003 | skill 重命名 + `/opfx:` 类型化统一 | 14 skill 目录重命名 + `SKILL_DEFINITIONS` 键 + `NEW_SKILL_NAMES` + 部署路径 + D36-1 全量改写 | ~40 |
| op-004 | 部署实例与构建产物重生成 + 测试 | build 重生成、`.opencode/` 自举实例标记化（D36-3）、测试断言同步、全量回归 | ~40 |

### 依赖图

```
op-001（源收敛）
   │ hard
   ▼
op-002（agent 重命名）── hard ──→ op-003（skill 重命名 + /opfx:）
   │                                   │
   └────────────── hard ───────────────┤
                                       ▼
                              op-004（重生成 + 测试）
```

- op-002 hard 依赖 op-001（须在收敛后的单树上重命名）。
- op-003 hard 依赖 op-002：两者均编辑 `feel.md`（agent 名引用 vs skill 表）与 `update.ts`，**文件冲突域重叠**，须串行。
- op-004 hard 依赖 op-001 / op-002 / op-003。

---

### op-001：双层模板源收敛为单源

> **目标**：`templates-data/opencode/` 成为唯一权威源；消除三对双源漂移；build.js 全部源路径改指权威源；行尾归一 LF；三对注入对象一致性校验。
> **前置依赖**：无
> **规模**：~40 文件（含删除）
> **含 D36-2、D36-5（保持 glm-5.2，REV-301 修订）、N1、N2、N3（部分）**

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | agent 树逐文件合并 | 对 `{zh-CN,en}` 全部 9 个 agent 逐文件 diff `templates-data/agents/{lang}` vs `templates-data/opencode/agents/{lang}`；取较新内容合并入 `opencode/agents/`。**已知必处理**：`feel.md` 补入 `agents/` 版的「## 冲突检测」节（21 行）；其余差异逐一核对，确保**不丢任一侧独有内容** | `templates-data/opencode/agents/{zh-CN,en}/*.md`（18） |
| 2 | 删除 agent 冗余树 | 合并校验通过后删除 `templates-data/agents/` 整树 | `templates-data/agents/**`（18 删除） |
| 3 | instruction 合并 | 取 `opencode/instructions/{lang}.md` 版（含 Vision），同步 Vision 至 `core-instructions/{lang}.md`；随后**删除 `templates-data/core-instructions/`**，build 步骤 1 改读 `opencode/instructions/` | `templates-data/opencode/instructions/{zh-CN,en}.md`、删除 `templates-data/core-instructions/**` |
| 4 | build.js 源路径改向 | ① `SKILLS_DIR`（L35）→ `templates-data/opencode/skills`（**步骤 4 必改，否则重命名后仍从旧目录取内容**）；② 步骤 2 `generateAgentDefinitions` 改读 `TEMPLATE_OPENCODE_AGENTS_DIR`；③ 步骤 1 `generateTemplateFromCoreMd` 改读 `TEMPLATE_OPENCODE_INSTRUCTIONS_DIR`；④ 移除/停用指向 `.opencode/` 的常量（`CORE_MD_PATH` / `AGENTS_DIR` / `SKILLS_DIR`） | `build.js` |
| 5 | 行尾归一 | ① 新增 `.gitattributes`（模板/生成目录 `text eol=lf`）；② 在 `generateAgentDefinitions` / `generateOpencodeAgentTemplates` / `generateSkillDefinitions` / `generateOpencodeSkillTemplates`（及步骤 3 agents-md）注入前补 `content.replace(/\r\n/g,'\n')`，与 core-instructions/instructions 步骤一致 | NEW `.gitattributes`、`build.js` |
| 6 | D36-5 reviewer 模型核对（无需改动） | 核对四处 reviewer 模型均为 `zhipuai/glm-5.2`：`.opencode/agents/reviewer.md`、`templates-data/opencode/agents/{zh-CN,en}/reviewer.md`、`templates-data/agents/{zh-CN,en}/reviewer.md`、根与模板 `opencode.jsonc` 的 `agent.reviewer.model`。**保持 glm-5.2，无同步动作**（REV-301 修订） | 上述四处（只读核对，不修改） |
| 7 | 三对一致性校验 | build 新增断言：`AGENT_TEMPLATES ≡ OPENCODE_AGENT_TEMPLATES`、`SKILL_DEFINITIONS ≡ OPENCODE_SKILL_DEFINITIONS`、`CORE_INSTRUCTIONS_TEMPLATES ≡ OPENCODE_CONFIG_TEMPLATES[*].instructions`（键集 + 归一化内容）；新增「无双份发散」校验（断言不存在同名双源文件） | `build.js` |

> **验证**：`npm run build` 三对一致性校验全通过；`grep` 确认 `templates-data/agents/` 与 `core-instructions/` 已不存在；build 不再读取任何 `.opencode/` 路径。
> **注意**：
> - **D36-4 由 Schemer 定夺**：若合并两套 skill 定义，本 op 第 7 项对应断言随之调整。
> - 合并须**逐文件 diff**，不得凭本计划表格的 3 处已知差异就假定其余一致（v1.1 大计划曾记「zh 3 个 agent / en 1 个 agent 不一致」）。
> - 删除整树属破坏性操作，须独立提交以便 `git revert`。

### op-002：agent 重命名（8 个加前缀）

> **目标**：8 agent 全链路加 `openfeel-` 前缀，`feel` 保持原名；运行时映射返回新名并读取兼容旧名。
> **前置依赖**：op-001（hard）
> **规模**：~45 文件
> **含 D2（agent 部分）、P5、N6**

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | 权威源文件重命名 | `templates-data/opencode/agents/{zh-CN,en}/`：`planner→openfeel-planner`、`schemer→openfeel-schemer`、`executor→openfeel-executor`、`reviewer→openfeel-reviewer`、`feel-tester→openfeel-feel-tester`、`utility→openfeel-utility`、`vision→openfeel-vision`、`archiver→openfeel-archiver`；`feel.md` 不变（用 `git mv` 保留历史） | 16 重命名 |
| 2 | 运行时映射 | `flow-manager.ts` `mapPhaseToAgent`（L1504-1524）返回新名（`openfeel-planner` / `-schemer` / `-executor` / `-reviewer` / `-feel-tester` / `-archiver`；`done→none`）；新增 `normalizeAgentName()`（旧名→新名，`feel` 保持）用于读取兼容。⚠️（REV-304 修订，Schemer 待办）：`normalizeAgentName` 须处理大小写不一致——scheme.ts L122 写 `'Executor'`（大写）、`mapPhaseToAgent` 返回小写 `'executor'`，须内部 `toLowerCase()` 或映射表覆盖两种形式 | `src/core/flow-manager.ts` |
| 3 | 写入新名 | `flow-manager.ts` L1556/1575/1593 `agent: 'executor'` → `openfeel-executor`；`archive/merge.ts` L118 `agent: 'archiver'` → `openfeel-archiver`；`view/entry.ts` L52/62/129 `filed_by`/`agent: 'reviewer'` → `openfeel-reviewer`；`plan/scheme.ts` L37（模板文本 `- **负责 Agent**：Executor`）+ L122（`assignee: 'Executor'`）→ `openfeel-executor`（REV-302 修订，原 L34/L138 标注有误）；`init.ts` L462/463 示例 status 的 `executor` → `openfeel-executor` | 上述 5 文件 |
| 4 | 全库引用同步（markdown） | 见「七、全库引用同步清单」。重点：`.opencode/agents/*`、权威源 agents、`agents-md`、`core-instructions`/`instructions`、`.opencode/instructions/core.md`、根 `AGENTS.md`；`subagent_type: utility` → `openfeel-utility`；`Handoff` 标记、委派目标、`task(agent)` 引用 | 见清单 |
| 5 | 配置同步 | 根 `opencode.jsonc` + `templates-data/opencode/opencode.jsonc`：`default_agent` 保持 `feel`；`agent.<name>` 键若指 agent 须带前缀（当前仅 `vision`/`reviewer` → `openfeel-vision`/`openfeel-reviewer`） | 2 文件 |
| 6 | P5 读取兼容 | 所有读取 `assignee` / `responsibleAgent` / `filed_by` 的展示或比较点，经 `normalizeAgentName()` 归一化后再比较/展示；**不迁移 `flow.json` 历史数据**。⚠️（REV-303 修订，Schemer 待办）：接入点清单需补全——`flow status` / `flow overview` / `flow metrics` 等所有读取展示 agent 名的路径 | `flow-manager.ts` + 相关读取点 |

> **验证**：`listAgentIds` / `listOpencodeAgentIds` 返回全部带前缀（`feel` 除外）；全库 grep 无裸旧名（排除伪阳性，见测试策略）；旧 `flow.json`（含 `assignee: 'planner'`）仍可正常 `flow status`。
> **注意**：`type: utility`（任务标签）与 `subagent_type: utility`（agent 名）须区分——前者保留，后者改名；Schemer 需在方案中明确判定规则。

### op-003：skill 重命名 + `/opfx:` 类型化统一

> **目标**：14 skill 加前缀；`/opfx:` 命名空间按类型准确引用并清零；源码注释同步清理。
> **前置依赖**：op-002（hard，feel.md / update.ts 冲突域）
> **规模**：~40 文件
> **含 D2（skill 部分）、D36-1、N6**

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | 权威源 skill 目录重命名 | `templates-data/opencode/skills/`：14 目录加 `openfeel-` 前缀；**同时更新各 `SKILL.md` frontmatter 的 `name:` 字段**（如 `name: check-kb` → `name: openfeel-check-kb`） | 14 重命名 + frontmatter |
| 2 | 构建/部署键同步 | `update.ts`：`SKILL_DEFINITIONS` 键（build 生成）、`NEW_SKILL_NAMES`（L1209-1218）、`buildUpdatedJsonc` skills 路径（L1380）、`getIncomingContent` skill 正则（L1802）随新名；`init.ts` skill 部署路径 | `src/core/update.ts`、`src/core/init.ts` |
| 3 | `/opfx:` 全量改写（feel.md） | 权威源 `feel.md`（zh-CN + en）「可调用技能」表按 D36-1 映射改写为按类型分类引用（CLI 命令 / agent / skill），废除 `/opfx:` 前缀；`code`/`test` 改文字描述；`### 可派事务官（/opfx:utility）` → `openfeel-utility`；`/opfx:flow` 引用 → `openfeel flow` | `templates-data/opencode/agents/{zh-CN,en}/feel.md` |
| 4 | `/opfx:` 源码注释清理 | `src/commands/flow.ts` L14/158/161（`/opfx:status`）；`src/core/i18n-data/zh-CN.ts` L446 与 `en.ts` L424（`flow.overview` 的 `/opfx:status`）；`src/core/update.ts` L60（`/opfx:* 技能`）、L1377（`/opfx:* skill`）。⚠️（REV-305 修订，Schemer 待办）：上述 `/opfx:status` 改写目标为 `openfeel flow overview`，须在 D36-1 映射表补 `status` 条目 | 4 文件 |
| 5 | skill 名引用同步 | 全库 skill 名提及（区分 CLI 子命令同名词）；`opencode.jsonc` skills 块（build 用 `SKILLS_PLACEHOLDER` 生成，权威源改名后自动带前缀）；`.opencode/skills/*` 部署实例随 op-004 重生成 | 见清单 |

> **验证**：`/opfx:` 在源码 + 模板源中清零（`docs/` 历史记录除外，见待确认）；`listOpencodeSkillNames` 返回全部带前缀；`opencode.jsonc` skills 键带前缀。
> **注意**：`openfeel health` / `openfeel flow recover` 等 CLI 子命令**不改**；仅 skill 名提及改。`roadmap` 同时是 CLI 与 skill，须双列引用。

### op-004：部署实例与构建产物重生成 + 测试

> **目标**：重生成 build 产物与 `.opencode/` 自举实例（含 D36-3 标记）；同步全部硬编码测试断言；全量回归。
> **前置依赖**：op-001 / op-002 / op-003（hard）
> **规模**：~40 文件
> **含 D36-3、N3、N4**

| # | 任务 | 描述 | 涉及文件 |
|---|------|------|----------|
| 1 | build 产物重生成 | `npm run build` 重生成 `template-loader.ts`（`AGENT_TEMPLATES` / `OPENCODE_AGENT_TEMPLATES` / `OPENCODE_SKILL_DEFINITIONS` / `OPENCODE_CONFIG_TEMPLATES` / `CORE_INSTRUCTIONS_TEMPLATES` 等锚点段）与 `update.ts`（`SKILL_DEFINITIONS` 段） | `src/core/template-loader.ts`、`src/core/update.ts`（生成段） |
| 2 | `.opencode/` 自举实例重生成 + 标记（D36-3） | 按 N4 由 build 步骤 8（或独立脚本）从权威源重生成 `.opencode/{agents,skills,instructions,ADAPTER.md}`，插入 N3 生成物标记；`feel` 文件名不变、8 agent 与 14 skill 带前缀 | `.opencode/**`（25 文件） |
| 3 | 测试断言同步 | 更新硬编码名称/路径断言（见「八、测试策略」）；**伪阳性不得误改**。⚠️（REV-306 修订，Schemer 待办）：区分「构造写入用**新名**」与「读取兼容验证**保留旧名** + 断言展示新名」两类 fixture，避免混用导致断言自相矛盾 | 见测试策略 |
| 4 | 收尾自举提示 | 阶段收尾输出「重命名已生效，请重启 opencode 会话」提醒 | `status.md` / 阶段交付说明 |
| 5 | 全量回归 | `npm run build && npm test` 全绿；`openfeel lint i18n` / `openfeel lint kb` 零错误 | 全局 |

> **验证**：`npm run build` 一致性校验全通过；`npm test` 全绿；`.opencode/` 25 文件均含生成物标记（frontmatter 文件标记位于 `---` 之后）。
> **注意**：`.opencode/node_modules` 非受管、不重生成、不标记。

---

## 六、全库引用同步清单（供 op-002 / op-003 逐项核对）

### agent 名提及（数量为调研估计，执行时以实际 grep 为准）

| 载体 | 估计提及 | 备注 |
|------|:--:|------|
| `.opencode/agents/*.md` | ~303 | 自举实例，op-004 重生成 |
| `templates-data/agents/{zh-CN,en}/*` | ~606 | **op-001 合并后删除** |
| `templates-data/opencode/agents/{zh-CN,en}/*` | ~606 | 权威源，op-002 修改 |
| `templates-data/agents-md/{zh-CN,en}.md` | ~81 | 双语同步 |
| `templates-data/core-instructions/{lang}.md` | ~65 | op-001 删除 |
| `templates-data/opencode/instructions/{lang}.md` | ~67 | 权威源 |
| `.opencode/instructions/core.md` | ~34 | 自举实例，op-004 重生成 |
| 根 `AGENTS.md` | ~38 | 9 Agent 体系总览表、写入约束等 |

### skill 名提及（注意与 CLI 子命令同名词区分）

- `templates-data/opencode/skills/*/SKILL.md`（frontmatter `name:` + 正文）
- `templates-data/opencode/agents/{zh-CN,en}/feel.md`（技能表）
- `templates-data/agents-md/*`、`instructions/*`、根 `AGENTS.md`
- `src/core/update.ts`（`SKILL_DEFINITIONS` 键、`NEW_SKILL_NAMES`）
- `.opencode/skills/*`（自举实例）

### 源码运行时

| 位置 | 处理 |
|------|------|
| `src/core/flow-manager.ts` `mapPhaseToAgent`（L1504-1524）+ L1556/1575/1593 | 返回/写入新名 + `normalizeAgentName` |
| `src/core/archive/merge.ts` L118 | `archiver` → `openfeel-archiver` |
| `src/core/view/entry.ts` L52/62/129 | `reviewer` → `openfeel-reviewer` |
| `src/core/plan/scheme.ts` L37（模板文本）+ L122（`assignee: 'Executor'`） | `Executor` → `openfeel-executor`（REV-302 修订） |
| `src/core/init.ts` L462/463 | 示例 `executor` → `openfeel-executor` |
| `src/core/update.ts` | `SKILL_DEFINITIONS` 键、`NEW_SKILL_NAMES`（L1209）、`buildUpdatedJsonc`（`default_agent` L1363/1370 保持 `feel`；skills 路径 L1380）、`getIncomingContent` 正则（L1795/1802） |
| 根 `opencode.jsonc` + `templates-data/opencode/opencode.jsonc` | `default_agent`（保持 `feel`）、`agent.<name>`（带前缀）、skills（自动带前缀） |

---

## 七、兼容性策略（P5 读取兼容）

| 场景 | 处理 |
|------|------|
| `mapPhaseToAgent` 返回值 | 一律返回**新名**（`openfeel-planner` 等），供新写入使用 |
| 读取旧 `flow.json` 的 `assignee` / `changes[].agent` / `responsibleAgent` | 经 `normalizeAgentName(name)` 归一化后比较/展示：`planner→openfeel-planner`、`schemer→…`、`executor→…`、`reviewer→…`、`feel-tester→openfeel-feel-tester`、`utility→openfeel-utility`、`vision→openfeel-vision`、`archiver→openfeel-archiver`；`feel` / `none` / `unknown` / 非 agent 值（`flow-manager` 等）**原样保留** |
| 写入 | 新写入一律用新名（`agent: 'openfeel-executor'` 等） |
| 历史数据迁移 | **不做**。不批量改写 `flow.json` / 历史日志 / 旧 `status.md`；旧名保持可读 |
| 幂等性 | `normalizeAgentName` 对已是新名的输入原样返回（避免二次前缀化） |
| 向后兼容范围 | 仅 agent 名；skill 名不写入 `flow.json`，无需读取兼容 |

> stage-39 的存量迁移（`openfeel migrate` 重映射 `flow.json` assignee）建立在本阶段 `normalizeAgentName` 之上，本阶段只保证**读取兼容 + 写入新名**。
>
> ⚠️ **（REV-303/REV-304 修订，Schemer 待办）**：见「四、审查补充待办」——REV-303 要求补全 `normalizeAgentName` 接入点清单（`flow status` / `flow overview` / `flow metrics` 等展示路径）；REV-304 要求 `normalizeAgentName` 内部做大小写归一（`'Executor'` vs `'executor'`），避免 `mapPhaseToAgent` 返回小写、scheme.ts 写入大写导致比较失效。

---

## 八、测试策略

### 需同步修改的现有断言（调研定位，共 11 个测试文件含名称/路径硬编码）

| 测试文件 | 命中数 | 重点 |
|----------|:--:|------|
| `test/core/update.test.ts` | 88 | `.opencode/agents/planner.md`、`.opencode/skills/check-kb/SKILL.md`、`SKILL_DEFINITIONS` 键、`NEW_SKILL_NAMES`、skills 映射 |
| `test/core/flow-manager.test.ts` | 52 | `mapPhaseToAgent` 期望值、`responsibleAgent`、`agent:` 变更日志 |
| `test/core/plan/roadmap.test.ts` | 25 | agent 名映射 |
| `test/core/template-loader.test.ts` | 16 | `feel-tester` / skill 名 / agent id 列表 |
| `test/core/metrics.test.ts` | 13 | agent 名统计维度 |
| `test/core/view/entry.test.ts` | 11 | `filed_by` / `agent: 'reviewer'` |
| `test/core/archive/merge.test.ts` | 9 | `agent: 'archiver'` |
| `test/core/artifact-graph/instruction-loader.test.ts` | 5 | 指令/agent 引用 |
| `test/core/flow-concurrent.test.ts` | 3 | agent 名 |
| `test/core/init.test.ts` | 1 | 部署路径/名称 |
| `test/commands/flow-migrate.test.ts` | 1 | 迁移相关名称 |

### 伪阳性（**不得误改**）

- `<utility>` 等 XML 转义测试中的标签名；
- CLI 子命令名 `openfeel flow recover` / `openfeel health` / `openfeel roadmap` / `openfeel wizard`（非 skill 引用）；
- 任务标签 `type: utility`（非 agent 名）；
- 非 agent 的内部 `agent: 'flow-manager'`（flow.json 变更日志内部标识）；
- `openfeel` 项目名本身（不得被 `feel` 规则误伤）。

### 新增校验

| 验证点 | 方式 |
|--------|------|
| 模板单源 | build 断言：不存在同名双源文件；`templates-data/agents`、`core-instructions` 已移除 |
| 三对注入对象一致 | build 断言：`AGENT_TEMPLATES ≡ OPENCODE_AGENT_TEMPLATES`、`SKILL_DEFINITIONS ≡ OPENCODE_SKILL_DEFINITIONS`、`CORE_INSTRUCTIONS_TEMPLATES ≡ OPENCODE_CONFIG_TEMPLATES[*].instructions` |
| 命名前缀完整 | `listAgentIds` / `listOpencodeAgentIds` / `listOpencodeSkillNames` 断言带前缀；全库 grep 无裸旧名 / `/opfx:` |
| P5 读取兼容 | 构造含旧 `assignee: 'planner'` 的 `flow.json` fixture，断言 `flow status` 正常且展示新名。⚠️（REV-306 修订，Schemer 待办）：fixture 区分「构造写入用新名」vs「读取兼容保留旧名 + 断言展示新名」两类，勿混用 |
| 生成物标记 | 断言 `.opencode/` 受管文件均含标记；frontmatter 文件标记位于闭合 `---` 之后 |
| 行尾 | 断言生成的模板串无 `\r\n`（跨平台可复现） |
| 全量回归 | `npm run build && npm test`；`openfeel lint i18n` / `lint kb` |

---

## 九、风险点与回滚

| # | 风险 | 影响 | 缓解 |
|---|------|:--:|------|
| 1 | **自举风险**：重命名改变本仓库正在使用的 agent/skill 名 | 高 | 阶段收尾提醒**重启 opencode**；改名后本会话仍可继续（旧名读取兼容，P5） |
| 2 | build.js 仍从旧目录取源导致重命名不生效 | 高 | op-001 强制改 `SKILLS_DIR` + 停用 `.opencode/` 源常量 + build 单源断言 |
| 3 | 合并丢失单侧独有内容（feel.md 冲突检测 / Vision） | 中 | 逐文件 diff + 已知差异清单 + 三对一致性校验兜底 |
| 4 | 子串陷阱：`feel` ⊂ `openfeel` / `openfeel-feel-tester` | 高 | N6 词边界有序替换；改名后全库 grep + 幂等性校验 |
| 5 | 测试断言大范围误改（伪阳性） | 中 | 逐文件核对 + 伪阳性清单 + 全量回归 |
| 6 | 行尾 CRLF 泄漏（`core.autocrlf=input`，工作树 CRLF） | 中 | `.gitattributes` + 注入前归一化 + 生成串无 `\r\n` 断言 |
| 7 | 删除模板树不可逆 | 中 | 独立提交 + `git revert`；合并校验通过后再删 |
| 8 | `opencode.jsonc` `agent.<name>` 键改名后旧配置失效 | 中 | op-002 同步两处 jsonc；stage-39 migrate 处理存量项目 |
| 9 | N4 自举重生成范围扩大（超出最小改动） | 低 | 若 Schemer 判定过度设计，降级为「独立脚本 + 手工标记 + build 一致性校验」；另（REV-308 修订）步骤 8 位置须置于 tsc 后或改独立 `npm run sync:opencode` 脚本（tsc 前无法 import dist 的 `atomicWriteFileSync`） |

**回滚方案**：

- 四个 op 各自独立提交，可按 op `git revert`。
- 模板树删除、`.opencode/` 重生成均可用 git 恢复（`.opencode/` 保留提交，历史可回溯）。
- 版本号本阶段不变（仍 1.0.9，stage-39 统一升 1.1.0），回滚无外部发布影响。
- 若自举实例重生成异常，`git checkout -- .opencode/` 即可恢复可用配置。

---

## 十、约束与设计决策

| # | 约束 | 处理 |
|---|------|------|
| 1 | 遵循 AGENTS.md 简洁原则 | 不引入新依赖、不新增抽象层；N4 若判定过度设计则降级 |
| 2 | 中文注释、英文标识符 | 新增 `normalizeAgentName` 等须中文注释 |
| 3 | 双语同步 | zh-CN / en 模板必须同步（AGENTS.md 模板同步模式） |
| 4 | 复用 stage-35 fs 工具 | 重生成写文件用 `atomicWriteFileSync`，不重复造轮子 |
| 5 | 不实施 stage-37~39 | 全局部署、控制区标记、migrate 均不在本阶段 |
| 6 | 不直写 flow.json | Planner 不操作；阶段注册/推进由 Feel 执行 `openfeel flow` |
| 7 | 只改本阶段范围 | 不动 `docs/` 历史记录（见待确认）；不动 `claude/`、`kilo/` stub |

---

## 十一、预期产出

| 产出 | 路径 |
|------|------|
| 计划文档 | `.openfeel/plan/v1/stage-36/plan.md`（本文件） |
| 依赖声明 | `.openfeel/plan/v1/stage-36/deps.yaml`（由 Schemer 细化） |
| 操作方案 | `.openfeel/plan/v1/stage-36/ops/op-{001..004}.md`（由 Schemer 细化） |
| 权威源 | `templates-data/opencode/{agents,skills,instructions}/**`（唯一） |
| 构建 | `build.js`（改源 + 归一化 + 一致性校验 + 自举重生成）、`.gitattributes` |
| 源码 | `flow-manager.ts`、`update.ts`、`init.ts`、`archive/merge.ts`、`view/entry.ts`、`plan/scheme.ts`、`commands/flow.ts`、`i18n-data/{zh-CN,en}.ts` |
| 自举实例 | `.opencode/**`（25 文件，含生成物标记） |
| 配置 | 根 `opencode.jsonc`、`templates-data/opencode/opencode.jsonc` |

---

## 十二、待确认事项

1. **N1 目录结构**：权威树定为 `templates-data/opencode/`、删除 `templates-data/agents/` 与 `core-instructions/` 是否认可？还是保留 `agents/` 为主树？
2. **N3 标记形式与插入位置**：`<!-- openfeel:generated ... -->`、frontmatter 后插入是否满足 stage-38 兼容预期？
3. **N4 自举重生成**：由 build.js 步骤 8 生成 `.opencode/` 是否过度设计？是否改为独立脚本？
4. ~~**N5 reviewer 模型**：是否一并把两处 `opencode.jsonc` 的 `agent.reviewer.model` 改为 `glm-5.3-flash`？~~ **已撤销（REV-301 修订）**：四处 reviewer 模型均 `glm-5.2` 且一致，保持 glm-5.2，无需同步。
5. **`docs/` 与 README 中的 `/opfx:`**：是否清理？本计划默认**不清理** `docs/phase-*` 历史记录（归档性质），README 待用户确认。
6. **D36-4**：`SKILL_DEFINITIONS` 与 `OPENCODE_SKILL_DEFINITIONS` 是否合并 → **交 Schemer 最终评估**（本计划暂按「两套同源 + 一致性校验」落地）。

---

## 附录 A：调研证据

| 项 | 证据 |
|----|------|
| 双层 agent 漂移 | `templates-data/agents/zh-CN/feel.md` 270 行 vs `templates-data/opencode/agents/zh-CN/feel.md` 253 行；前者多「## 冲突检测」节 |
| 双层 instruction 漂移 | `Compare-Object` 显示 `opencode/instructions/zh-CN.md` 两处 Agent 列表含 `Vision`，`core-instructions/zh-CN.md` 缺；两者均 296 行 |
| skill 行尾伪分叉 | `.opencode/skills/check-kb/SKILL.md` 工作树 3568 bytes / 0 CRLF（LF）；`templates-data/opencode/skills/check-kb/SKILL.md` 工作树 3669 bytes / 101 CRLF；`git show` blob 为 3568 bytes / 0 CRLF，两侧 git 内容一致 |
| build 源指向 | `build.js` L33-35：`CORE_MD_PATH`/`AGENTS_DIR`/`SKILLS_DIR` 均指 `.opencode/`；步骤 4 `generateSkillDefinitions` 用 `SKILLS_DIR` |
| 三对注入对象 | `template-loader.ts` 导出 `loadAgentTemplate`/`listAgentIds`（← `AGENT_TEMPLATES` ← `templates-data/agents`）与 `loadOpencodeAgentTemplate`/`listOpencodeAgentIds`（← `OPENCODE_AGENT_TEMPLATES` ← `templates-data/opencode/agents`）；`SKILL_DEFINITIONS`（update.ts，← 现 `.opencode/skills`）与 `OPENCODE_SKILL_DEFINITIONS`（← `templates-data/opencode/skills`） |
| `/opfx:` 分布 | 源码 8 处（`flow.ts` ×3、`i18n-data` ×2、`update.ts` ×2）+ 4 个 feel.md 模板 + `template-loader.ts` 生成段（随重生成消失） |
| reviewer 现状 | 四处 reviewer 模型均 `model: zhipuai/glm-5.2`（`.opencode/agents/reviewer.md`、两处 agent 模板、两处 `opencode.jsonc`）**一致**；无 glm-5.3-flash（REV-301 修订，此前「已改 glm-5.3-flash」记录有误） |
| 自举实例 | `git ls-files .opencode` = 25 文件（9 agents + 14 skills + instructions/core.md + ADAPTER.md）；`.opencode/node_modules` 未纳入版本管理 |
| 测试命中 | 11 个测试文件含名称/路径硬编码（`update.test.ts` 88、`flow-manager.test.ts` 52、`roadmap.test.ts` 25 …） |
