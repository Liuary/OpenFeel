# v1.1.6-stage-68 计划 — 模板管线多源化（零内容变更）

- **阶段**：`v1.1.6-stage-68`
- **依赖**：无（本版本基础阶段）
- **优先级**：P0（后续 69/70/71 的公共前提）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-10
- **定位**：把 17 个 skills 的**权威源**从 `templates-data/opencode/skills/` 迁到**中立共享源** `templates-data/skills/`，使 opencode 与 Claude 两 harness 共用同一份 skill 源；同步 `build.js` 路径、校验、冗余树断言与测试路径。**零内容变更**（skill 正文一字不改，内容 diff 必须为零），为 stage-70 的「中立化改写」与 stage-69 的「Claude 侧消费」铺路。
- **范围**：`src/core/templates-data/skills/`（**新增**，17 skill 目录整体迁移）、`templates-data/opencode/skills/`（**删除**）、`build.js`（`SKILLS_DIR` 重指 + 读点 + 校验 + 冗余树断言）、`test/core/templates.test.ts`（`:11` SKILLS_DIR）、相关 `test/core/*`。
- **边界**：不改任何 skill 正文；不改 `template-loader.ts` 的生成段（build 重生成）；不新增依赖；不接 CLI；不 `npm publish`/`git push`；不改 `flow.json`。

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/architecture.md #模板单源架构：templates-data/opencode 唯一权威源 + 双注入对象 + 单源一致性断言` → 「迁移权威源」须保证**双注入对象（`SKILL_DEFINITIONS` / `OPENCODE_SKILL_DEFINITIONS`）不合并**、仅同步路径与断言；**冗余树断言**须防旧树复活。
  - `kb/patterns.md #CLI 用法 skill 化模式：权威源单文件 + build 双注入` → 新增/迁移 skill 目录须经 build 步骤 4/6 双注入；迁移后「新增 skill 目录自动纳入」性质不变。
  - `kb/troubleshooting.md #双层模板源发散：init 与 update 部署内容不一致` → 迁移必须与 build 注入/校验**同步**，否则源发散。
  - `kb/patterns.md #零行为变更改造的验证方法：diff 归因 + build 幂等 + 命令输出对比` → 本阶段「零内容变更」的验证三证法。

---

## 一、背景与实测证据（唯一事实基准）

| 事实 | 源码位置 | 结论 |
|------|----------|------|
| `SKILLS_DIR = TEMPLATE_OPENCODE_SKILLS_DIR`（`templates-data/opencode/skills`） | `build.js:32-35` | 迁移须重指 `SKILLS_DIR` 为 `templates-data/skills` |
| 步骤 4 注入 `SKILL_DEFINITIONS` 读 `SKILLS_DIR` | `build.js:180-207` | 路径随 `SKILLS_DIR` 变量自动生效（`build.js:180` 起） |
| 步骤 6 注入 `OPENCODE_SKILL_DEFINITIONS` 读 `TEMPLATE_OPENCODE_SKILLS_DIR` | `build.js:258-275` | 须**显式改读**共享源（否则仍读旧树） |
| 校验函数读 `SKILLS_DIR` 与 `TEMPLATE_OPENCODE_SKILLS_DIR` | `build.js:679-682`（注入前校验）、`:825-828`（opencode 段校验） | 两处读点须同步改共享源 |
| 冗余树断言仅查 `templates-data/agents` 与 `core-instructions` | `build.js:1027-1030` | **扩展**为含 `templates-data/opencode/skills`（防旧树复活） |
| `templates-data/opencode/skills/` 实测 17 个目录 | 目录实测 17 | 迁移须 17/17 齐全，缺一即门禁失败 |
| `test/core/templates.test.ts:11` 直指 `templates-data/opencode/skills` | 测试 | 路径同步改共享源 |
| `template-loader.ts` 生成段由 build 注入 | `build.js:1054-1059`（6 步） | 本阶段**不改步数**（仅重指路径） |

> **迁移语义**：`git mv templates-data/opencode/skills → templates-data/skills`（保留历史），随后改 `build.js` 各读点。**不改任何 `SKILL.md` 内容**。

---

## 二、目标语义

| 维度 | 改前 | 改后 |
|------|------|------|
| skill 权威源 | `templates-data/opencode/skills/`（opencode 专属目录） | `templates-data/skills/`（**中立共享源**） |
| opencode 消费 | 同上（隐式共用） | 改读共享源（行为零变化） |
| Claude 消费 | — | 本阶段不接（stage-69 建立注入锚点；stage-71 部署消费） |
| 内容 | 17 skill | **17 skill，逐字节不变** |

**不变量**：`SKILL_DEFINITIONS` 与 `OPENCODE_SKILL_DEFINITIONS` 两注入对象**键集与内容逐字不变**；`template-loader.ts` 生成段零 diff（除路径常量无关）；`npm run build` 幂等。

---

## 三、变更点清单（编号 T）

### T1 — skill 源迁移（零内容变更）

- `git mv src/core/templates-data/opencode/skills src/core/templates-data/skills`（17 目录整体迁移）。
- 确认 `templates-data/opencode/` 下**只剩** `ADAPTER.*.md` 与 `agents/`（`skills/` 不再存在）。

### T2 — `build.js` 读点与校验重指

- `:32-35`：`SKILLS_DIR` 重指 `resolve(TEMPLATES_DATA_DIR, 'skills')`（或新增 `TEMPLATE_SHARED_SKILLS_DIR` 常量并令 `SKILLS_DIR = TEMPLATE_SHARED_SKILLS_DIR`）。
- 步骤 6（`:258-275`）：`TEMPLATE_OPENCODE_SKILLS_DIR` 读点改共享源（保留 `OPENCODE_SKILL_DEFINITIONS` 注入对象的**键名不变**，仅数据源改共享）。
- 注入前校验（`:679-682`）与 opencode 段校验（`:825-828`）：改读共享源。
- **不改**：注入对象名、锚点名、生成段结构。

### T3 — 冗余树断言扩展（防旧树复活）

- `build.js:1027-1030`：把断言扩为「`templates-data/agents`、`core-instructions` **或 `templates-data/opencode/skills`** 任一存在即失败」。
- 断言文案显式提示「skill 已迁共享源 `templates-data/skills`」。

### T4 — 测试路径同步 + 迁移不变量断言

| # | 用例 | 断言 |
|:-:|------|------|
| T4.1 | `test/core/templates.test.ts` SKILLS_DIR | 改指共享源；17 skill 全可读 |
| T4.2 | 双注入对象一致性 | `SKILL_DEFINITIONS` 键集 == `OPENCODE_SKILL_DEFINITIONS` 键集 == 17 |
| T4.3 | 冗余树阴性断言 | `templates-data/opencode/skills` **不存在**（防复活） |
| T4.4 | 内容零 diff | 迁移前后 skill 内容逐字节一致（可用 git 迁移 + build 幂等间接证明） |

### T5 — 门禁与阶段报告

- `npm test` 全绿 `0 skipped / 0 failed`；`npx tsc --noEmit` = 0；`lint i18n` = **761**（本阶段**不新增键**）；`lint kb` = 0；`npm run build` ×2 幂等；`.opencode/**` 与冗余树不复活。
- 输出阶段报告。

---

## 四、op 划分与执行顺序（**2 op**）

| op | 主题 | 覆盖 | 关键产出 | 依赖 |
|:--:|------|------|----------|------|
| **op-001** | skill 源迁移 + build 读点/校验/断言重指 | T1+T2+T3 | 迁移目录；`build.js` 改动；测试路径同步 | 无 |
| **op-002** | 迁移不变量测试 + 门禁 + 报告 | T4+T5 | 测试；全门禁；阶段报告 | hard: op-001 |

**顺序：op-001 → op-002。**

**边界声明**：零内容变更；不改 `template-loader.ts` 生成段结构；不改步数；不新增依赖；不改 `flow.json`。

---

## 五、验收标准（阶段级）

1. **迁移完整**：`templates-data/skills/` 含 **17** 目录；`templates-data/opencode/skills/` **不存在**。
2. **零内容变更**：17 skill 正文逐字节不变（git mv + build 幂等证明）。
3. **双注入对象**：`SKILL_DEFINITIONS` / `OPENCODE_SKILL_DEFINITIONS` 键集均为 17 且内容一致。
4. **防复活**：冗余树断言覆盖 `templates-data/opencode/skills`。
5. **门禁**：`npm test` 全绿 `0 skipped`；`tsc` = 0；`lint i18n` = 761；`lint kb` = 0；`npm run build` ×2 幂等。

---

## 六、风险与回滚

| # | 风险 | 影响 | 缓解 / 回滚 |
|:-:|------|------|-------------|
| R-1 | 迁移漏改 `build.js` 某读点致源发散 | 高 | 全仓 `rg "opencode/skills\|TEMPLATE_OPENCODE_SKILLS_DIR\|SKILLS_DIR"` 穷举读点后再改；T4.2 断言 |
| R-2 | 旧树残留（半迁移）| 中 | 冗余树断言（T3）+ T4.3 |
| R-3 | 误改 skill 正文 | 中 | `git mv`（非复制改写）；T4.4 零 diff |
| R-4 | 测试路径未同步致假失败 | 低 | T4.1 |

**回滚**：`git revert <sha>`；纯目录迁移 + 读点重指，无数据迁移。

## 七、边界（不做）

1. **不改任何 skill 正文**（中立化改写归 stage-70）。
2. 不建立 Claude 模板锚点（归 stage-69）。
3. 不改 `template-loader.ts` 生成段结构（build 重生成，禁手改）。
4. 不新增依赖；不改 CI；不 `npm publish`/`git push`；不改 `flow.json`。

## 八、交付给 stage-69/70 的集成契约

- **单一权威源**：`src/core/templates-data/skills/<name>/SKILL.md`（17 个）。stage-70 在此源上做中立化改写；stage-69/71 的 Claude 部署从此源消费。
- **注入对象名不变**：`SKILL_DEFINITIONS`（`update.ts`）、`OPENCODE_SKILL_DEFINITIONS`（`template-loader.ts`）。
- **防复活断言**：`templates-data/opencode/skills` 必须不存在。

## 九、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-10 | openfeel-planner | 初稿：T1~T5；2 op；验收 5 条；锁定「零内容变更 + 双注入对象不合并 + 冗余树断言扩展」。 |
