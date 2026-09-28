# v1.1.2-stage-43 — CLI 文档 skill 化与版本收口

> **版本**：v1.1.2 | **创建日期**：2026-09-28 | **Planner**：独立 openfeel-planner
> **上级计划**：`.openfeel/plan/v1/v1.1.2/plan.md`
> **定位**：将 CLI 操作文档沉淀为**按需加载 skill**（`openfeel-cli-usage`），根治「工具不自描述、Agent 被迫翻包源码」痛点；同步文档/手册，并统一收口版本 1.1.2。

---

## 一、阶段目标与定位

| 来源 | 目标 | 对应 op |
|------|------|:--:|
| 用户追加需求（U4） | 新增 `openfeel-cli-usage` skill，走既有 skill 部署管线（唯一权威源 → build 双注入 → 自举重生成） | op-001 |
| 反馈 #2/#3 缓解 | skill 内沉淀命令清单、phase 枚举与转移表、stageId 命名/目录映射约定、典型场景 | op-001 |
| 一致性要求 | 文档/手册与 CLI 实际行为同步；skill 与 `openfeel-wizard` 职责边界裁定 | op-002 |
| 硬性约束（U1） | 版本号三处同步（+AGENTS.md）留到本阶段统一收口，中间阶段不发版 | op-003 |

### 关键裁定（沿用上级 P8，并经核实纠正）

1. **skill 名**：`openfeel-cli-usage`（P8）。
2. **职责边界（P8）**：`openfeel-cli-usage` = **查询型参考手册**（只读，不自执行）；`openfeel-wizard` = **执行型交互向导**（跑 `openfeel flow wizard` 推进流水线）。二者正文互相交叉引用。
3. **部署管线核实**（与需求描述的三处纠正一致）：
   - 权威源 = `src/core/templates-data/opencode/skills/openfeel-cli-usage/SKILL.md`，**扁平单文件、中文单语**，**无 `{lang}` 子目录** → **无需 zh-CN/en 双语同步**。
   - `NEW_SKILL_NAMES` **在现有代码中不存在**（全仓 grep 零匹配）→ **无需同步**；真正注入对象为 `SKILL_DEFINITIONS`（`src/core/update.ts:99-100`）与 `OPENCODE_SKILL_DEFINITIONS`（`src/core/template-loader.ts:6253-6254`）。
   - build 双注入 + 断言成立：`build.js:670-691`（校验 `update.ts` 的 `SKILL_DEFINITIONS`）、`:814-837`（校验 `template-loader.ts` 的 `OPENCODE_SKILL_DEFINITIONS`）均对照同一权威源（`SKILLS_DIR = TEMPLATE_OPENCODE_SKILLS_DIR`，`build.js:33,36`）；新增 skill 目录被**自动纳入**，**无需改 `build.js`**。

> ⚠️ 上述纠正项须由 openfeel-reviewer 复核；若复核推翻（如英文 skill 存在于其它路径），op-001 需追加双语同步与对应注入对象同步。

---

## 二、前置依赖与上下游衔接

- **前置依赖**：**hard 依赖 `v1.1.2-stage-41`**（skill 必须文档化其新增命令 `flow phases` / `flow stage remove` / `plan stage add --deps` 与三入口分层结论）；**soft 依赖 `v1.1.2-stage-42`**（文档化 `config effective` 与 `pipeline.phase` 语义）。
- **上下游衔接**：本阶段是版本终点——版本号收口与全量回归在此完成，产出 `npm publish` 就绪态。

---

## 三、op 级任务清单

| op | 主题 | 具体改动点（文件:行号） | 验收要点 |
|----|------|------------------------|----------|
| op-001 | 新增 `openfeel-cli-usage` skill | ① 新建权威源 `src/core/templates-data/opencode/skills/openfeel-cli-usage/SKILL.md`：frontmatter `name: openfeel-cli-usage` + `description`（须含触发词：「CLI 命令用法 / phase 枚举 / stageId 命名 / 参数查询」，供自动发现）；正文含——命令清单（含 `flow phases`、`flow stage remove`、`plan stage add --deps`、`config effective`）、15 个 phase 枚举与转移表、stageId 三格式与 `plan/{series}/stage-NN/` 目录映射（引用 `.openfeel/manual/core/plan-path.md`）、典型场景（落地阶段 / 声明依赖 / 纠错移除 / 查询有效配置）、与 `openfeel-wizard` 边界说明；② `npm run build`——步骤 4（`build.js:177-207`）注入 `src/core/update.ts` 的 `SKILL_DEFINITIONS`（`：99-100` 生成段）、步骤 6（`build.js:259-293`）注入 `src/core/template-loader.ts` 的 `OPENCODE_SKILL_DEFINITIONS`（`:6253-6254` 生成段）、步骤 8（`build.js:1085-1092`）重生成 `.opencode/skills/` 自举；③ 确认 `.opencode/skills/openfeel-cli-usage/SKILL.md` 为**构建产物**（含生成标记，禁止手改）；④ 部署链路复用：`src/core/update.ts:1479-1485`、`src/core/setup.ts:53-56`、`src/core/template-loader.ts:7464,7502` | `listOpencodeSkillNames()`（`template-loader.ts:7502`）含新 skill；`SKILL_DEFINITIONS` 键集含新 skill；build 一致性断言通过；`openfeel setup` 后 `~/.config/opencode/skills/openfeel-cli-usage/SKILL.md` 存在且与权威源一致；`.opencode/skills/` 自举含新 skill |
| op-002 | 文档与交叉引用同步 | ① `docs/commands.md`：flow 节（`:57-129`）补 `flow phases` / `flow stage remove`，plan 节（`:160-232`）补 `plan stage add --deps` 与三入口关系，新增 `config effective` 条目（与 `docs/commands.md:367` 之后的 update 节并列处插入 config 节或就近）；② `.openfeel/manual/cli/commands.md`（`:56-67`）同步命令示例与三入口说明；③ `.openfeel/manual/core/plan-path.md`（`:9-28`）补 stageId 校验/冲突检测/建议名 API；④ `AGENTS.md` 中若列举 CLI 命令/技能清单则同步；⑤ `src/core/templates-data/opencode/skills/openfeel-wizard/SKILL.md` 正文加交叉引用「静态命令参考见 `openfeel-cli-usage`」 | 文档描述与 CLI 实际行为一致（抽查新命令）；三入口关系表在 docs 与 manual 一致；wizard 与 cli-usage 互相引用 |
| op-003 | 版本 1.1.2 收口 + 全量回归 | **版本收口清单（权威，见上级计划 §3.1，依据 REV-41-001/REV-43-001）**：<br>**A 必改 8 处 → `1.1.2`**：A1 `package.json:3`；A2 `.openfeel/config.yaml:7`（**GBK/非 UTF-8 展示，仅增量替换该行，禁止整文件重写**）；A3 `src/core/config.ts:308`（zh）；A4 `src/core/config.ts:365`（en）；A5 `src/core/templates-data/agents-md/zh-CN.md:130`（权威源）；A6 `src/core/templates-data/agents-md/en.md:130`（权威源）；A7 `AGENTS.md:136`（**修正既有漂移 v1.1.0**）；A8 `package-lock.json:3`、`:9`（**既有漂移 1.0.7**，建议 `npm install` 重生成）。<br>**B 生成段**：`npm run build` 重生成 `src/core/template-loader.ts:2798`(en)/`:3240`(zh)（禁手改）。<br>**C 传播**：`openfeel setup`（或 `update`）重传播 `~/.config/opencode/AGENTS.md` 版本行。<br>**D 禁改**：历史沿革说明（`build.js`/`init.ts`/`migrate.ts`/`manual/**`/`test/**` 中的 `v1.1.x` 注释）+ 依赖自身版本（如 `picocolors: 1.1.1`）。<br>**E 无载体**：`README*`、`docs/**`（已 grep 确认）。<br>② `CHANGELOG.md` 追加 `## [1.1.2] - 2026-09-28`（Added/Changed/Fixed）；③ `npm run build && npm test` 全绿；④ `openfeel lint i18n` / `openfeel lint kb` 零错误 | A1~A8 全部为 `1.1.2`（逐条核对）；`template-loader.ts:2798/:3240` 生成段含 `v1.1.2`；权威源 `agents-md/{zh-CN,en}.md:130` 含 `v1.1.2`；D 类文件无意外改动；`npm test` 全绿；`lint i18n`/`lint kb` 零错误；CHANGELOG 含 1.1.2 条目 |

---

## 四、每个 op 的预期影响文件清单

| op | 新增 | 修改 |
|----|------|------|
| op-001 | `src/core/templates-data/opencode/skills/openfeel-cli-usage/SKILL.md`、`.opencode/skills/openfeel-cli-usage/SKILL.md`（构建产物） | `src/core/update.ts`（`SKILL_DEFINITIONS` 生成段）、`src/core/template-loader.ts`（`OPENCODE_SKILL_DEFINITIONS` 生成段） |
| op-002 | — | `docs/commands.md`、`.openfeel/manual/cli/commands.md`、`.openfeel/manual/core/plan-path.md`、`AGENTS.md`、`src/core/templates-data/opencode/skills/openfeel-wizard/SKILL.md`、`.opencode/skills/openfeel-wizard/SKILL.md`（构建产物） |
| op-003 | — | `package.json`、`.openfeel/config.yaml`、`src/core/config.ts`、`src/core/templates-data/agents-md/{zh-CN,en}.md`（权威源）、`src/core/template-loader.ts`（生成段）、`AGENTS.md`、`package-lock.json`、`CHANGELOG.md` |
| 测试 | 新增用例 | `test/core/template-loader.test.ts`、`test/core/update.test.ts`、`test/core/setup.test.ts`、`test/core/opencode-instance.test.ts`、`test/core/i18n.test.ts` |

> 说明：`src/core/update.ts` 与 `src/core/template-loader.ts` 的生成段只能经 `npm run build` 生成，禁止手工编辑（kb「模板单源架构」）。

---

## 五、完成标准

1. 权威源新增 `openfeel-cli-usage/SKILL.md`，经 `npm run build` 后：`SKILL_DEFINITIONS` 与 `OPENCODE_SKILL_DEFINITIONS` 均含新键，`.opencode/skills/openfeel-cli-usage/SKILL.md` 生成（含生成标记）。
2. `openfeel setup` / `openfeel update` 后全局 `~/.config/opencode/skills/openfeel-cli-usage/SKILL.md` 存在且与权威源一致；`update` 幂等。
3. skill 内容准确反映 CLI 现状（含 stage-41/42 新命令与 phase/stageId 约定）；与 `openfeel-wizard` 边界清晰、互相引用。
4. docs/手册与 CLI 实际行为一致；三入口关系在文档中统一。
5. 版本号**全部载体**一致为 `1.1.2`（清单 A1~A8，见上级计划 §3.1），含权威源 `agents-md/{zh-CN,en}.md:130` 与生成段；`npm test` 全绿；`lint i18n` / `lint kb` 零错误；`CHANGELOG.md` 含 1.1.2 条目。

---

## 六、风险与注意事项

| # | 风险 | 缓解 |
|---|------|------|
| 1 | 手工编辑生成段（`update.ts`/`template-loader.ts`） | 只改权威源，一律经 `npm run build`；生成段有 AUTO-GENERATED 锚点 |
| 2 | 手工新增 `.opencode/skills/` 目录被 build 清空 | `.opencode/skills/` 是构建产物（`build.js:1069-1075` 清空重生成），禁止手工维护 |
| 3 | skill `description` 触发词不足，Agent 不加载 | description 显式含「CLI 命令/phase/stageId/参数」等词；必要时在 `openfeel-tool-usage` 或相关 agent 提示中引用 |
| 4 | `.openfeel/config.yaml` 编码/格式导致改写损坏 | **仅增量替换 `meta.version` 值行**，不使用整文件重写；改后 `openfeel config get` 验证可读 |
| 5 | 纠正项（无 `{lang}`、无 `NEW_SKILL_NAMES`）被复核推翻 | 审查复核；若存在英文源，追加英文 SKILL.md 并同步两个注入对象 |
| 6 | 版本常量遗漏（`config.ts` 有两处；另有 agents-md 权威源、AGENTS.md、package-lock） | 按上级计划 §3.1 清单 A1~A8 逐条核对；脚本化断言；禁改清单 D 防误伤 |
| 7 | i18n 键新增未对称 | 依赖 `openfeel lint i18n` 兜底 |

---

## 七、op 执行顺序与依赖

```
op-001（新增 skill + build 重生成）
   │
   └─→ op-002（文档/手册同步 + wizard 交叉引用）
            │
            └─→ op-003（版本 1.1.2 收口 + 全量回归）
```

**建议顺序**：op-001 → op-002 → op-003。

- op-001 先行：skill 内容须先落地，op-002 的交叉引用依赖其存在。
- op-003 最后：版本收口与全量回归必须在所有代码/文档改动完成后执行（U1）。

---

## 八、修订记录

| 时间 | 修订人 | 依据 REV | 修订内容 |
|------|--------|----------|----------|
| 2026-09-28 | openfeel-planner | REV-v1.1.2-stage-43 REV-001（同源 stage-41 REV-001） | op-003 版本收口清单由「四处」扩充为**权威清单 A1~A8 + 生成段 B + 传播 C + 禁改 D + 无载体 E**（补 `agents-md/{zh-CN,en}.md:130` 权威源、`AGENTS.md:136` 漂移、`package-lock.json:3/:9` 漂移、`template-loader.ts:2798/:3240` 生成段）；完成标准与影响文件清单同步扩充 |
| 2026-09-28 | openfeel-planner | REV-v1.1.2-stage-43 REV-002（已 closed） | 无需修复；三处纠正（扁平单文件 / 无 `{lang}` / 无 `NEW_SKILL_NAMES`）经复核确认，维持不变 |

> 三处核心裁定不变：① #5 全局画像仅作最低优先级兜底；② #6 只修 `pipeline.phase` 全量 done 判定、不做 `current` 回退；③ 技能源为扁平单文件（16 个 `{name}/SKILL.md`）、无 `{lang}`、无 `NEW_SKILL_NAMES`。
