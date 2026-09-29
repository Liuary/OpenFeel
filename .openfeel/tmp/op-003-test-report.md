# 自测报告 — op-003

- **执行时间**：2026-09-29 22:20
- **执行 Agent**：openfeel-executor
- **重试次数**：第 1 次

## 执行摘要

事件 C 加固完成：执行型指引统一为 `node bin/openfeel.js`（5 个 skill + AGENTS.md + manual/cli）、CI 增版本一致性门禁（两 job 各一处）+ `lint i18n` step、查询型用户文档加注旧版风险；全仓扫描 421 → 362 并逐类处置；build 幂等、YAML 自检通过；H9（不做全局旧版告警）在案。

## 实施步骤完成情况

- [x] 步骤1：执行型指引统一 — `openfeel-cli-usage/SKILL.md`、`openfeel-wizard/SKILL.md`、`AGENTS.md:154-166` 速查段、`.openfeel/manual/cli/*.md`（commands/setup/model）；加注旧版风险
- [x] 步骤2：全仓扫描兜底（见下「扫描处置台账」）；**扫描额外捕获 3 个执行型 skill**（`openfeel-health` / `openfeel-model-check` / `openfeel-recover`）→ 一并改 `node bin/openfeel.js`
- [x] 步骤3：`npm run build` 重生成 skill 生成段与 `.opencode/skills/` 自举；build 幂等
- [x] 步骤4：`ci.yml` 两 job 各加版本一致性断言（`build-and-test` + `publish`，publish 保留原 `if:` 条件）；`build-and-test` 增 `node bin/openfeel.js lint i18n`
- [x] 步骤5：H9 结论（不做 bin 全局旧版告警）记录在案（plan §六 R5）

## 自测清单验证

| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| cli-usage / wizard SKILL.md 执行型命令改 `node bin/openfeel.js` | ✅ | 权威源 + 自举均命中 |
| `AGENTS.md` 速查段统一口径 | ✅ | 12 条全部改为 `node bin/openfeel.js` |
| `.openfeel/manual/cli/*.md` 统一 + 查询型加注 | ✅ | commands/setup/model 三文件 |
| 全仓扫描输出逐条处置 | ✅ | 见下表 |
| `npm run build` 通过且幂等；自举含新口径 | ✅ | 模板一致性校验 3/3 + 6/6 通过；diff 哈希前后一致 |
| `ci.yml` 两 job 各含版本断言 + `build-and-test` 含 `lint i18n`；YAML 自检 | ✅ | guard@19 / guard@87；lint i18n@28；`ci.yml YAML OK` |
| H9 结论（不做）记录在案 | ✅ | plan §六 R5 |
| 未新增依赖；未改版本号 | ✅ | 版本仍 1.1.2 |

### 本地断言演练 / 门禁命令

| 命令 | 结果 |
|------|------|
| `node -e "...execSync('node bin/openfeel.js --version')... === package.json.version"` | `VERSION OK` |
| `node -e "yaml.parse(ci.yml)"` | `ci.yml YAML OK` |
| `npm run build` ×2 + diff 哈希比对 | `BUILD IDEMPOTENT OK` |

## 全仓扫描处置台账

扫描命令（scheme §2）：
`rg -n "\bopenfeel (flow|stage|plan|config|knowledge|lint|init|setup|update|migrate)\b" --glob "!node_modules" --glob "!dist" --glob "!.git" .`
（`node bin/openfeel.js <cmd>` 不含 `openfeel `（点号在 openfeel 后）故不命中——正是本口径的判据）

**总数：421 → 362**（59 处执行型已改）。

### A. 执行型 → 已改（`node bin/openfeel.js`）

| 文件 | 处置 |
|------|------|
| `.../skills/openfeel-cli-usage/SKILL.md` | 全部命令示例改 `node bin/openfeel.js`；`说明` 追加「旧版风险」注记（保留查询型 `openfeel <cmd>` 写法） |
| `.../skills/openfeel-wizard/SKILL.md` | `flow wizard` / `flow advance` 改 `node bin/openfeel.js`；追加旧版风险注记 |
| `.../skills/openfeel-health/SKILL.md` | `flow health --quick` / `flow health` 改（扫描兜底捕获） |
| `.../skills/openfeel-model-check/SKILL.md` | `openfeel init` ×2 改（扫描兜底捕获） |
| `.../skills/openfeel-recover/SKILL.md` | `flow recover` 改（扫描兜底捕获） |
| `AGENTS.md`（本仓） | 速查段 + 模块手册段 `openfeel <cmd>` 全改 |
| `.openfeel/manual/cli/commands.md`、`setup.md`、`model.md` | 示例改 `node bin/openfeel.js`；加注旧版风险 |

### B. 查询型 / 面向使用者 → 保留 + 加注旧版风险

| 文件 | 处置 |
|------|------|
| `README.md` / `README.en.md` / `README.zh-CN.md` | 顶部加注「示例为安装后用法；本仓开发用 `node bin/openfeel.js`」 |
| `docs/GETTING_STARTED.md`、`docs/commands.md` | 顶部加注同上 |
| `.openfeel/manual/cli/setup.md:37`（变更历史行）、`model.md:7`（命令组名描述） | 历史/描述性措辞，保留 |

### C. 豁免（非指引 / 生成物 / 历史）

| 类别 | 文件（计数） | 理由 |
|------|------|------|
| 生成物 | `src/core/template-loader.ts`(142)、`src/core/update.ts`(2，`SKILL_DEFINITIONS` 生成段) | build 重生成，禁手改；源头已改 |
| i18n 运行时文案 | `src/core/i18n-data/{zh-CN,en}.ts`(45) | 面向使用者的 help/错误串，`openfeel <cmd>` 为正确用法 |
| 实现代码 | `src/commands/*.ts`、`src/core/*.ts`、`src/core/plan/scheme.ts`、`src/core/view/entry.ts`、`src/core/workspace/identity.ts`、`src/core/update-infos.ts`、`src/core/update-state.ts`、`src/core/flow-manager.ts`、`src/core/managed-region.ts`、`src/core/migrate.ts`、`src/core/init.ts`（合计 ~48） | 代码注释 / 运行时提示串（非指引文档） |
| 历史 | `CHANGELOG.md`(11)、`docs/phase-*/`(28) | 历史归档，scheme 明确豁免 |
| 测试 fixture | `test/**`(5) | 非指引，scheme 明确豁免 |
| 部署模板（面向使用者） | `templates-data/opencode/agents/**`(56)、`templates-data/agents-md/**`(26) | 随 `setup` 部署到用户环境；用户侧正确调用即全局 `openfeel` |
| 分析性文档 | `docs/design-philosophy.md`(3)、`docs/harnessed-coding.md`(1)、`docs/v4-summary.md`(2) | 设计随笔/总结，非操作指引（**待审查官复核归类**） |

> **提请审查官注意（范围内判断，非偏差）**：类别 C 中「部署模板（agents/agents-md）」的归类是本 op 的最大判断点——scheme 文件清单未列 agent 模板（仅列 skills/AGENTS/manual），且这些模板随 `setup` 部署到用户项目（用户侧 `openfeel` 才是正确调用），故定为**查询型/面向使用者、不加注**。若审查官认为应一并改 `node bin/openfeel.js`，本 op 可即时扩改（改动为纯文本 replaceAll + build）。

## 产出文件

- `src/core/templates-data/opencode/skills/openfeel-{cli-usage,wizard,health,model-check,recover}/SKILL.md`
- `AGENTS.md`
- `.openfeel/manual/cli/{commands,setup,model}.md`
- `README.md`、`README.en.md`、`README.zh-CN.md`、`docs/GETTING_STARTED.md`、`docs/commands.md`
- `src/core/update.ts`、`src/core/template-loader.ts`（生成段）
- `.opencode/skills/*`（自举）
- `.github/workflows/ci.yml`

## 前置校验结果

- 方案完整性：通过
- Phase 合法性：通过（`exec_running`）
- 流转合法性：通过（`flow health --quick` exit 0）

## 偏差记录

- 无超范围/遗漏产出。
- **未在本地验证项**：GitHub Actions runner 真实执行（版本门禁 / lint i18n / 环境守卫）——YAML 语法 + 断言脚本本地演练已过，runner 行为待 PR 实测。
- 判断点（非偏差）：类别 C 部署模板归类（详见上方提请）。
