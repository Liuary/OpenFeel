# v1.6.3-stage-136

## 目标

彻底不预设模型（续 REQ-069）：删除 opencode 适配器 10 份 agent 模板 frontmatter 的 `model: deepseek/deepseek-flash`、删除 `opencode-config.ts` 向用户配置注入的 vision / reviewer 默认模型，并把 `openfeel model` 的 `default` 层改为「已移除」——`get --scope default` 返回 unset，`set --scope default` 明确拒绝并提示改用 global / project，解析优先级改为 **project > global > 平台默认**；4 个 model 相关 skill 的「deepseek 是默认/主力/异种」表述改为「不预设，按需配置 / 平台选择」。依据：REQ-070（A70.1—A70.6），详见 `plan.md`。

## 关联需求

| 需求 | 标题 | 判据 |
|---|---|---|
| REQ-070 | 彻底不预设模型：移除 opencode agent 默认 model 与框架注入 | A70.1—A70.6 |

## 节奏

fast 模式，单需求拉通，**严格串行**（不并行）；改完 `templates-data` 必须 `npm run build` 再跑测试：

| 步 | 任务 | 产出 |
|---|---|---|
| S1 | T1 模板去 `model:` | `templates-data/opencode/agents/{zh-CN,en}/*.md`（10 份） |
| S2 | T2 opencode-config 去注入 | `src/core/opencode-config.ts` |
| S3 | T3 default 层语义 | `src/core/model-config.ts`、`src/commands/model.ts`、`i18n-data×2` |
| S4 | T4 skills 文案 | 4 个 `templates-data/skills/*/SKILL.md` |
| S5 | T5 测试重定基线 | 6 个测试文件 + 新增「模板零 `model:`」锁定断言 |
| S6 | T6 文档与版本 | README×2、`docs/commands.md`、`docs/VERSIONS.md`、`CHANGELOG`、两个 `package.json`、`package-lock.json` |
| S7 | 全量门禁 | 六条判据取证清单（reviewer 独立复跑） |

## 验收

- A70.1 10 份模板 `^model:` 零命中、注入副本同步零；A70.2 `opencode-config.ts` 无 `openfeel-vision|openfeel-reviewer|model:`，`buildGlobalOpencodeFrameworkObj()` 只剩 `$schema` / `default_agent`。
- A70.3 `model get --scope default --json` → `model:null,source:null`；`model set … --scope default` → exit 1 且提示 global/project；project / global 的 get/set 与 `project > global` 优先级不变。
- A70.4 skills 负向零命中（`deepseek-v4-pro|当前默认使用|显式默认收敛为|主力推理模型|异种推理`）、正向含「不预设/按平台/会话所选」，且 `openfeel-cli-usage` frontmatter 定长 2766 不变。
- A70.5 版本 1.6.3 lockstep（root / dsh / `requiresCli >=1.6.3` / `package-lock.json:3`、`:9`）+ `## [1.6.3]` + `## v1.6.3`，文档不再称「三层级」或「框架默认模型」。
- A70.6 `tsc --noEmit` / `npm test` / `npm run build`（两遍幂等）/ dsh 四测 / `lint i18n` / `release --dry-run --skip-build` 全绿（push master 后 CI 自动发布，人类执行）。

## 风险

- **default 层移除打穿既有用例**：`model-config.test.ts`、`model.test.ts`、`json-contract.test.ts`、`update.test.ts`(stage-94×3) 均断言 default 来源为 `deepseek/deepseek-flash` → 逐条重定基线而非删用例；`byScope.default` 键与 `inconsistent` 字段保留，JSON 键序不变。
- **opencode 用户配置兼容**：老用户 `opencode.jsonc` 已有的 `agent.*.model` 必须原样透传 → 只删框架 overlay，不动 `deepMergeJsonc` / `mergeAgentDefaults`，不写清理逻辑。
- **注入副本漂移**：`template-loader.ts` / `update.ts` 的 AUTO-GENERATED 段禁止手改，一律 `npm run build` 生成（`templates-migration.test.ts:50` 逐字节锁源）。
- **skill frontmatter 字符数**：`openfeel-cli-usage` description 定长 2766 → 只改正文。
- **残留预设面（A70 未覆盖）**：`agents-md/{zh-CN,en}.md:103`、`claude/constraint/{zh-CN,en}.md:105`、agent 正文「（如 DeepSeek V4 Pro）」→ 本阶段不动，交人类裁决。

## 依赖

REQ-069（v1.6.2 已完成：config 模板不预设模型）为前置语义；无其它阶段依赖。不动提示词与发布链路。

## 操作方案

按 `plan.md` §二 的 T1—T6 单写者矩阵执行；每步中间态命令见 §三；执行中偏差按 §四 格式回写。`git push` / tag / `npm publish` 归人类（A70.6 的 CI 自动发布在 T6 全绿后由人类执行）。
