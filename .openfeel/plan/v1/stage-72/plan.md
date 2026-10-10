# v1.1.6-stage-72 计划 — 文档与版本收口

- **阶段**：`v1.1.6-stage-72`
- **依赖**：**hard: `v1.1.6-stage-71` `v1.1.6-stage-73`**（全部代码/内容/编排就绪后方可文档收口与版本号全链路收口）
- **优先级**：P0（本版本收官阶段，**执行顺序为最后**）
- **制定人**：openfeel-planner ｜ **制定时间**：2026-10-10
- **定位**：文档多载体同步（README/GETTING_STARTED/commands/manual/skill 权威源）+ CI 环境守卫加路径 + **版本 1.1.5 → 1.1.6 全链路收口**（A/B/C/D/E）+ roadmap/plan 回填。
- **范围**：`README.md`、`README.{zh-CN,en}.md`、`docs/GETTING_STARTED.md`、`docs/commands.md`、`docs/claude-code-adapter-plan.md`、`.openfeel/manual/**`、`src/core/templates-data/skills/openfeel-cli-usage/SKILL.md`（权威源）、`.github/workflows/ci.yml`、`CHANGELOG.md`、版本载体（A 类）、`.openfeel/roadmap/v1.1.6.md`、`.openfeel/plan/index.md`、`.openfeel/plan/plan_log.md`、`.openfeel/adapters/README.md`。
- **边界**：不改源码逻辑（除版本载体字符串）；不改 CI 判定语义（仅 env guard 增路径）；不 `npm publish`/`git push`；不改 `flow.json`（阶段推进由 Feel 执行）。

## KB 检索（`openfeel-check-kb`）

- 已加载。**高度相关条目**：
  - `kb/patterns.md #版本号全链路收口清单模式：A/B/C/D/E` → 逐类核对（见 §三 T4）。
  - `kb/patterns.md #版本号全链路收口清单`（`package-lock.json` **禁 `npm install` 重生成**，避免依赖树 diff）。
  - `kb/patterns.md #部署语境 vs 本仓语境命令口径二分` → 文档中 `openfeel <cmd>`（部署语境）与 `node bin/openfeel.js`（本仓语境）区分。
  - `kb/patterns.md #CLI 用法 skill 化模式` → skill 快照声明版本号同步 + build 传播。
  - `kb/patterns.md #环境哈希守卫（CI 层）` → 快照三态 + ABSENT→ABSENT 不误报 + 只比 sha256。
  - `kb/troubleshooting.md #多源文案同步陷阱` / `#README 与实现同步检查清单` → 多载体对齐核对。
  - `kb/patterns.md #仓库自身不再保留项目级部署资产` → 文档口径（框架资产全局化）。

---

## 一、背景与实测证据

| 事实 | 位置 | 结论 |
|------|------|------|
| CLI 单一版本权威 = `package.json.version`（`--version` 直读） | `bin/openfeel.js` | A 类手工载体首项 |
| A 类载体：`package.json`、`package-lock.json`（root×2）、`.openfeel/config.yaml`（`meta.version`）、`config.ts` zh/en 模板、`agents-md/{zh-CN,en}.md:134` | 实测（大计划 §二.18） | 逐项改 `1.1.5 → 1.1.6` |
| B 类生成段 = `template-loader.ts` 生成段 | `build.js:1054-1059` | `npm run build` 重生成，**禁手改** |
| CI env guard 4 路径 | `ci.yml:39/82` | 追加 `$HOME/.claude`（**两处循环**） |
| manual 现有模块 | `.openfeel/manual/**` | 新增 `core/claude-settings.md`；更新 `core/global-paths.md`/`core/setup.md`/`core/update.md`/`cli/setup.md`/`cli/commands.md`/`index.md` |
| `openfeel-cli-usage` skill 快照声明 | 该 skill 权威源 | 快照版本同步 `v1.1.6`；补 `--tools` 说明 |
| `.openfeel/adapters/README.md` claude 为预留 | 实测 | 状态更新为「✅ 当前使用（v1.1.6 起）」 |
| `docs/claude-code-adapter-plan.md` 状态「提案」 | 该文档头 | 更新为「已实现（v1.1.6）」 |

---

## 二、目标语义

| 维度 | 改前 | 改后 |
|------|------|------|
| 多 harness 文档 | 仅 opencode | opencode + Claude（`--tools`、`~/.claude/`、升级/重启语义） |
| 版本 | 1.1.5 | **1.1.6**（全链路 A/B/C/D/E） |
| CI guard | 4 路径 | **5 路径**（含 `$HOME/.claude`） |
| 路线图 | 无 v1.1.6 | `roadmap/v1.1.6.md` |

**不变量**：源码逻辑零改动（除版本字符串）；CI 判定语义不变；既有 `--json` 契约不变。

---

## 三、变更点清单（编号 T）

### T1 — README / 文档多载体

| # | 文件 | 改动 |
|:-:|------|------|
| T1.1 | `README.md`、`README.{zh-CN,en}.md` | 新增「Claude Code 适配器」小节：`--tools claude`、`~/.claude/` 资产、`settings.json` 注入（`agent:"feel"`+`permissions.defaultMode:"auto"`）、升级/重启（首次创建目录需重启/`/reload-skills`）；命令表补 `--tools`；架构图/测试数/版本残留同步 |
| T1.2 | `docs/GETTING_STARTED.md` | 补 Claude 适配器部署与验收步骤；`--tools` 用法 |
| T1.3 | `docs/commands.md` | `setup`/`update` 节补 `--tools`；快照标注 `v1.1.6` |
| T1.4 | `docs/claude-code-adapter-plan.md` | 状态由「提案」→「已实现（v1.1.6）」；必要时补「实施偏差」（settings 注入反转、9 agents） |
| T1.5 | `.openfeel/adapters/README.md` | claude 状态更新 + 适配器目录说明（Claude 侧资产清单） |

### T2 — manual 模块文档

| # | 文件 | 改动 |
|:-:|------|------|
| T2.1 | **新增** `.openfeel/manual/core/claude-settings.md` | `claude-settings.ts` 职责、严格 JSON 深合并语义、注入键、幂等/备份/失败口径 |
| T2.2 | `.openfeel/manual/core/global-paths.md` | 补 5 个 claude 路径函数 + `CLAUDE_CONFIG_DIR` 语义 |
| T2.3 | `.openfeel/manual/core/setup.md`、`core/update.md` | 补 `tools` 参数、claude 分支、settings 写回、`--tools` |
| T2.4 | `.openfeel/manual/cli/setup.md`、`cli/commands.md` | 补 `--tools` 与 Claude 部署说明 |
| T2.5 | `.openfeel/manual/core/build.md` | build 主流程 6→8 步、Claude 注入/断言 |
| T2.6 | `.openfeel/manual/index.md` | 模块树补 `core/claude-settings.md` |
| T2.7 | `templates-data/skills/openfeel-cli-usage/SKILL.md`（权威源） | 补 `--tools` + Claude 适配器升级/重启语义；快照 `v1.1.6`；`npm run build` 传播 |

### T3 — CI 环境守卫

- `.github/workflows/ci.yml:39`（before）与 `:82`（after）：快照循环路径追加 `"$HOME/.claude"`。
- 保持快照三态（ABSENT/EXISTS-EMPTY/sha256）、**只比 hash 不比 mtime**、ABSENT→ABSENT 不误报。
- **不改** job 判定语义、不改 publish 逻辑。

### T4 — 版本收口 1.1.5 → 1.1.6（A/B/C/D/E）

> 见大计划 §六。要点：

- **A 手工载体**：`package.json`；`package-lock.json`（root 两处，**禁 `npm install` 重生成**）；`.openfeel/config.yaml`（`meta.version` **单行 edit，禁整文件重写**）；`src/core/config.ts`（`CONFIG_TEMPLATE_ZH`/`_EN`）；`templates-data/agents-md/{zh-CN,en}.md`（「当前 v1.1.x」行）。
- **B 生成段**：`npm run build` 重生成 `template-loader.ts`（**禁手改**）。
- **C 传播**：`CHANGELOG.md` 追加 `## [1.1.6]`；`docs/commands.md` 快照；`docs/claude-code-adapter-plan.md` 状态。
- **D 禁改**：历史批注、依赖自身版本、manual 变更历史、`test/**` 注释。
- **E 无载体**：README / docs。
- 全链路 A 类 `1.1.5` 残留 **0**（历史批注除外）；`--version` == **1.1.6**。

### T5 — roadmap / plan 回填 + 门禁 + 报告

- `.openfeel/roadmap/v1.1.6.md` 进度回填；`.openfeel/plan/index.md` 系列/阶段索引追加 v1.1.6 + stage-68~73；`.openfeel/plan/plan_log.md` 追加变更摘要。
- 全门禁实跑：`npm test`、`tsc`、`lint i18n`（新基线）、`lint kb`、`npm run build` ×2、`--version`；默认路径 `~/.claude` 零变化。
- 阶段报告。

---

## 四、op 划分与执行顺序（**2~3 op**）

| op | 主题 | 覆盖 | 关键产出 | 依赖 |
|:--:|------|------|----------|------|
| **op-001** | README/docs/manual/skill 多载体 | T1+T2 | 全部文档 | hard: 71,73 |
| **op-002** | CI guard + 版本收口 A/B/C/D/E | T3+T4 | `ci.yml`；版本载体；build | hard: op-001 |
| **op-003** | roadmap/plan 回填 + 门禁 + 报告 | T5 | 回填；全门禁；阶段报告 | hard: op-002 |

**顺序：op-001 → op-002 → op-003。**

**边界声明**：不改源码逻辑；不改 CI 判定语义；不 `npm publish`/`git push`；不改 `flow.json`。

---

## 五、验收标准（阶段级）

1. **文档一致**：README×3 / GETTING_STARTED / commands / manual / skill 五类载体关于 `--tools`、`~/.claude/`、settings 注入、升级/重启的表述一致。
2. **CI guard**：五路径（含 `$HOME/.claude`）快照三态；判定语义不变。
3. **版本**：`--version` == `package.json` == **1.1.6**；`CHANGELOG` 含 `[1.1.6]`；A 类载体 `1.1.5` 残留 **0**。
4. **回填**：roadmap v1.1.6 与 plan/index/plan_log 一致。
5. **门禁**：`npm test` 全绿 `0 skipped`；`tsc` = 0；`lint i18n` = 新基线；`lint kb` = 0；`npm run build` ×2 幂等；默认路径零变化。

---

## 六、风险与回滚

| # | 风险 | 影响 | 缓解 / 回滚 |
|:-:|------|------|-------------|
| R-新13 | 版本载体遗漏（package-lock/config.ts/agents-md） | 中 | 依 A/B/C/D/E 清单逐条；`1.1.5` 残留 0 断言 |
| R-新14 | `.openfeel/config.yaml` 被整文件重写损坏 | 中 | **仅单行 edit，禁 `write`** |
| R-新15 | CI guard 误报（ABSENT→ABSENT/touch） | 低 | 快照三态；只比 sha256 |
| R-新16 | 文档多载体表述漂移 | 中 | 单批对齐 + `lint kb` |

**回滚**：`git revert <sha>`；纯文档/版本字符串，无数据迁移。

## 七、边界（不做）

1. 不改源码逻辑（除版本载体字符串）。
2. 不改 CI 判定语义；不 `npm publish`/`git push`；不改 `flow.json`。
3. 不新增依赖。

## 八、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-10 | openfeel-planner | 初稿：T1~T5；2~3 op；验收 5 条；版本 1.1.5→1.1.6 全链路收口；CI guard 5 路径；**执行顺序最后**。 |
