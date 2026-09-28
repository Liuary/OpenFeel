# 自测报告 — v1.1.2-stage-44.op-004

- **执行时间**：2026-09-29 03:40（本地）
- **执行 Agent**：openfeel-executor
- **重试次数**：第 1 次
- **⚠️ 偏差标注（报告顶部）**：本 op **按 Feel 裁定（2026-09-29，`question` 应答「按实测修正措辞」）对计划原建议文案做了两处事实性更正**，详见「偏差记录」。**无跳步违规**。

## 执行摘要

按实测结论写入「权限模型」文档节：双语全局 AGENTS.md 模板（`agents-md/zh-CN.md`、`en.md`）、仓库根 `AGENTS.md`、新建详版 `.openfeel/manual/core/permission.md` 并登记 `manual/index.md`；`npm run build` 重生成 `AGENTS_MD_TEMPLATES` 生成段并一致性通过。

## 实施步骤完成情况

- [x] 改动 1：`agents-md/zh-CN.md` 在 `## 动态规则` 前新增 `## 权限模型（Agent permission）`
- [x] 改动 2：`agents-md/en.md` 同位置新增 `## Permission Model (Agent permission)`（同结构同含义）
- [x] 改动 3：仓库根 `AGENTS.md` 在 `## 动态规则` 前追加精简节（9 行）
- [x] 改动 4：新建 `.openfeel/manual/core/permission.md`（职责/键集表/合并语义/实测结论/收紧入口/O4 边界/O5/生效时机/变更历史）+ `manual/index.md` 模块树与维护映射登记
- [x] 改动 5：`npm run build` → `AGENTS_MD_TEMPLATES` 生成段同步（zh/en 两处命中），一致性校验通过

## 自测清单验证

| 检查项 | 结果 | 备注 |
|--------|:--:|------|
| `agents-md/{zh-CN,en}.md` 均新增权限节，位于「动态规则」之前 | ✅ | zh `:110` / en `:110` |
| 仓库根 `AGENTS.md` 追加精简权限节 | ✅ | `:120` |
| REV-001-① 镜像相关告警已写入（**按实测改写**） | ✅ | 明确「镜像全量键亦无效」+ 正确入口 `.opencode/agent/<name>.md` |
| REV-001-② O4 精确化（勿手改全局 frontmatter；指向项目 agent 文件/项目配置） | ✅ | 引用 `src/core/managed-region.ts` 浅合并语义 |
| REV-001-③ 示例值形式与场景 B 一致 + 注明实测版本 | ✅ | 正文注明「实测 opencode 1.18.33」；manual 记录单值/对象等价 |
| O3：无新增 CLI/生成器；仅文档化原生入口 | ✅ | 未新增任何 CLI 或生成器 |
| O5：注明「单一键，无读写分粒度」 | ✅ | 三处文档均命中 |
| `manual/core/permission.md` 新建 + `manual/index.md` 登记 | ✅ | 模块树 + 维护映射两处 |
| `npm run build` 通过（`AGENTS_MD_TEMPLATES` 同步） | ✅ | exit 0，3/3 + 3/3 |
| 未改 stage-43 计划；未改 `writeDefaultConfig`（REV-002 归属已记录） | ✅ | `git status` 无 stage-43 / opencode-config.ts / init.ts |
| 未新增依赖 | ✅ | 无 |

## 产出文件

- `src/core/templates-data/agents-md/zh-CN.md`（修改）
- `src/core/templates-data/agents-md/en.md`（修改）
- `AGENTS.md`（修改）
- `.openfeel/manual/core/permission.md`（新增）
- `.openfeel/manual/index.md`（修改）
- `src/core/template-loader.ts`（自动重生成：`AGENTS_MD_TEMPLATES` 段）

## 前置校验结果

- 方案完整性：通过
- Phase 合法性：通过（`exec_running`）
- 流转合法性：通过（health --quick）
- 附加：op-001 findings 已 read（值形式/覆盖语义以实测为准）

## 偏差记录

1. **【按裁定修正文案】`agents-md` 权限节的「覆盖关系」表述**：计划原建议文案称「项目里写 `"permission": "allow"` 对已内联白名单的 agent **不生效**」。实测（op-001 §五、§七，`opencode run` 判别器 R3/R7）表明该说法**过度概括**——合并为「按权限键深合并、agent `.md` 优先」，**仅对 `.md` 已声明的同名键**成立；对未声明的键（如补键前的 `external_directory`），顶层 `permission` **生效**。已按裁定改为限定表述。
2. **【按裁定修正文案】「收紧入口」与「镜像告警」（REV-001-①）**：计划原建议为「项目 `opencode.jsonc` 的 `agent.<name>.permission` 覆盖；替换语义下建议镜像全量键」。实测（R5/R6）表明 **op-002 补键后该键已成为 `.md` 声明键，项目/顶层配置均无法覆盖，镜像全量键亦无效**；唯一可用入口为**项目级 `.opencode/agent/<name>.md`**（实测可覆盖全局同名 agent）。已按裁定改写，并把「实测版本 1.18.33」写入文档。
3. **REV-002（跨阶段）**：按方案附注**未修改** `stage-43/plan.md`（归属已登记，建议 Feel 调度 stage-43 前同步）。
4. 未跳步；O3/O5 严守（未新增 CLI、未宣称读写分粒度）。
