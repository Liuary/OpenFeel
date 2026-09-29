# review-stage-49-U4 — 模板 / agent / skill 详细取证报告

> 对应 REV 主报告：`.openfeel/users/Liuary/code_review/REV-v1.1.2-stage-49-U4.md`（本文件为取证细节与对照表）
> 审查人：openfeel-reviewer（GLM，全新会话）｜时间：2026-09-29 23:10｜基线：20670b8｜node v24.18.1

## 1. 双注入断言覆盖表（必查 #1）

| 生成段 | 锚点行号 | 比对方式 | 键数 | 逐字比对 |
|--------|----------|----------|------|----------|
| SKILL_DEFINITIONS | update.ts:100-1399 | node eval 模板串还原 ↔ 源文件 CRLF 归一化 | 17 | PASS |
| AGENT_TEMPLATES | template-loader.ts:8-2712 | 同上（双层 flatten） | 9×2 | PASS |
| AGENTS_MD_TEMPLATES | template-loader.ts:2715-3623 | 同上 | 2 | PASS |
| OPENCODE_AGENT_TEMPLATES | template-loader.ts:3665-6369 | JSON.stringify 与 AGENT_TEMPLATES 全等 | 9×2 | PASS |
| OPENCODE_SKILL_DEFINITIONS | template-loader.ts:6371-7670 | 与 SKILL_DEFINITIONS 值全等 | 17 | PASS |

断言覆盖（build.js）：
- `validateAgentDefinitions`（:590+）：生成段 ↔ `templates-data/opencode/agents/{lang}/`（权威源 readdirSync）
- `validateOpencodeSkillDefinitions`：生成段 ↔ `templates-data/opencode/skills/*/SKILL.md`
- `validateSingleSourceConsistency`（N2）：两对注入对象互断言（键集+归一化内容）+ 冗余模板树已删断言
- **结论**：新增 skill/agent 目录 → 注入与断言自动纳入（无手工清单）

## 2. 双语同步对照表（必查 #2）

| 文件对 | frontmatter 键集 | permission 块 | 标题结构 | 中文泄漏(en) |
|--------|------------------|----------------|----------|--------------|
| agents/{zh-CN,en} × 9 | 逐 agent 一致 | 逐行一致 | ## 对称 | 6 处：5 合理（角色名/字段引用）+ 1 漏译（REV-U4-002） |
| agents-md/{zh-CN,en}.md | 无 frontmatter（设计） | — | 19/19、10/10 | 1 处（en.md:438 图注） |

## 3. permission 块矩阵（必查 #3）

| agent | bash/read/glob/grep | task | skill | webfetch | edit | write | external_directory | model |
|-------|--------------------:|------|-------|----------|------|-------|--------------------|-------|
| feel | ✅ | ✅ | ✅ | allow | — | — | "allow" | — |
| planner | ✅ | — | — | — | — | — | "allow" | — |
| schemer | ✅ | — | — | — | — | — | "allow" | — |
| executor | ✅ | ✅ | — | — | — | — | "allow" | ✅ |
| reviewer | ✅ | — | — | — | — | — | "allow" | ✅ |
| feel-tester | ✅ | ✅ | ✅ | **deny** | — | — | "allow" | — |
| utility | ✅ | — | — | — | **✅(非 write)** | — | "allow" | ✅ |
| vision | ✅ | — | — | — | — | — | "allow" | ✅ |
| archiver | ✅ | — | — | — | — | — | "allow" | — |

## 4. 部署口径对照表（必查 #5 / REV-U4-001）

### `node bin/openfeel.js`（34 行，全为部署型 skill，不符口径）

| 文件 | 行号 | 加注 |
|------|------|------|
| openfeel-cli-usage/SKILL.md | 11,14,16,22-33,41,42,43,44,76,77,94,95,96,97,111（26） | :16 有（需随主口径改写） |
| openfeel-wizard/SKILL.md | 14,22,24（3） | :24 有 |
| openfeel-health/SKILL.md | 14,15（2） | **无** |
| openfeel-model-check/SKILL.md | 13,190（2） | **无** |
| openfeel-recover/SKILL.md | 14（1） | **无** |

### 裸 `openfeel <cmd>`（92 行，符合 REV-009② 裁定，不改）

agents-md zh/en 26 行；agents zh/en 60 行；model-config 1 行；roadmap 1 行。

修复清单与同步链见 REV-U4-001。

## 5. 自举实例（必查 #6）

- 26/26（agents 9 + skills 17）剥离生成物标记后与权威源逐字一致；标记齐全；ADAPTER.md 首行标记 + 内容一致。
- 根 AGENTS.md 无管理区标记 = 手写主文档（设计内）。

## 6. cli-usage 内容准确性（必查 #4）

| 项 | 对照实现 | 结果 |
|----|----------|------|
| phase 枚举 15 | pipeline-schema.ts:14 PIPELINE_PHASES | 一致 |
| 转移表 15 行 | .openfeel/pipeline.yaml（运行时权威源） | 逐条一致（含目标顺序） |
| stageId 三函数 | plan/path.ts:102/:126/:179 | 存在 |
| flow 子命令 14 | flow.ts（:39-:1145） | 存在；枚举串缺 phases/stage（REV-U4-003） |
| 命令族 11 | src/commands/ 16 个 | 缺 5（REV-U4-003 注记） |

## 7. 漂移扫描（必查 #7）

- `/opfx:`：0；旧 skill 名：0；core.md 命中均为 dev_core.md；冗余模板树已删 + build 断言守护。
- build.js 注释漂移 2 处（REV-U4-004）。

## 局限

未跑 build 幂等实测（并发禁跑，静态等价替代）；schema 对齐为键集级；部署运行时行为归 U8。
