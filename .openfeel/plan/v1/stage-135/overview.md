# v1.6.2-stage-135

## 目标

默认配置不再预设模型：删除 `writeDefaultConfig` 的 ZH/EN 模板中的 `models:` 段（现硬编码 deepseek-v4-pro / deepseek-flash / glm-5.1），改为注释「不预设模型——Agent 使用平台/会话所选模型（DSH/Claude 等）；如需 Awareness 记录可自行添加 models 段（不生效）」；`ModelsSchema` 与 `readConfig` 保持可选解析以兼容旧项目；规则同步到 `dev_core.md` 与新项目模板；文档与版本升到 **1.6.2**。依据：REQ-069（A69.1—A69.7），详见 `plan.md`。

## 关联需求

| 需求 | 标题 | 判据 |
|---|---|---|
| REQ-069 | 默认配置不预设模型：删除模板 models 段，改为平台/会话选择 | A69.1—A69.7 |

## 节奏

fast 模式，单需求拉通，**严格串行**（不并行）：

| 步 | 任务 | 产出 |
|---|---|---|
| S1 | T1 模板去 models | `src/core/config.ts` 两段模板 |
| S2 | T2 测试 | `test/core/config.test.ts`、`test/core/init.test.ts` 新增断言 |
| S3 | T3 规则登记 | `.openfeel/dev/dev_core.md`、`src/core/templates.ts` |
| S4 | T4 文档与版本 | README×2、`docs/commands.md`、`docs/GETTING_STARTED.md`、`CHANGELOG.md`、`package.json`、`dsh/package.json` |
| S5 | T5 全量验证 | 七条判据取证清单（reviewer 独立复跑） |

## 验收

- A69.1 模板段 0 行模型痕迹 + 新注释就位；A69.2 init 生成的 config.yaml 无 `model_name:`/`provider:`；A69.3 含 models 的旧配置仍可解析（可选、无默认值）。
- A69.4 无旧模型名断言残留、新增「默认模板无 models」断言、`npm test` 0 failed；A69.5 `dev_core.md` + `DEV_CORE_TEMPLATE_ZH/EN` 命中同义规则（英文条必须含小写 `presets no model`，中文对应「不预设模型」）。
- A69.6 版本 1.6.2（root + dsh + `requiresCli` + `package-lock.json:3`/`:9`）+ `CHANGELOG` 顶部 `## [1.6.2]` + README/docs 改「不预设模型」（README.en 含 `presets no model`），且负向取证 `grep -nE 'DeepSeek V4|Default Model Config|自动检测.*模型|auto-detects registered models'` 在三文件 0 行（本机 pwsh 无 `grep`，用 `plan.md` §1.2 的 `Select-String` 等价行，实测改前 4 行命中）；A69.7 `npm test` / `npm run build` / dsh 四测 / `lint i18n` / `release --dry-run` 全绿（push master 后 CI 自动发布，人类执行）。

## 风险

- **旧项目兼容**：只删模板字符串，`ModelsSchema`/`ConfigSchema.models`/`readConfig` 的 `models: null` 预处理零改动（误删会让存量 project 解析失败）。
- **测试断言分散**：实测不存在「默认模板含 deepseek-v4-pro」用例，改为**新增**断言、不删任何既有用例（含 `models: null` 兼容用例）。
- **版本 lockstep**：`package.json` / `dsh/package.json` / `requiresCli` / `CHANGELOG` 同批改；`package-lock.json:3`、`:9` 实测已是 `1.6.1`（**无 1.5.22 漂移**），同批同步为 `1.6.2` 两行，不跑 `npm install`、不改 lock 其余内容。
- **EN 提示词无余量**（en-disabled 1194/1200，余 6 字符）：本阶段**不改提示词**，规则只落 dev_core/模板/文档。

## 依赖

无（REQ-069 独立；不动提示词与发布链路）。

## 操作方案

按 `plan.md` §二 的 T1—T5 单写者矩阵执行；每步中间态命令见 §三；执行中偏差按 `plan.md` §四 格式回写。
