# v1.5.19-stage-4 计划：术语定名 + README 重订 + DSH 市场索引

> 用户定名：`feel_mode=enabled` = **Feel Mode（流程模式）**；`feel_mode=disabled` = **Free Mode（自由模式）**。
> 同步重订 README，并研究/落地 DSH 插件市场（官方「发现」页与 dsh.market）的发布路径。

## 目标

1. 统一两种模式的**用户称呼**（配置值不变，仍为 `enabled|disabled`），落实在 README 与当前行为文档。
2. README 重订：加入「两种模式」对照（含默认、切换命令、边界），并说明 `feel_mode` 与 `workflow_mode` 是两个正交开关。
3. 生成并提交 DSH 官方 format 1 市场索引 `docs/market/index.json`（git 源 + `path: /dsh` + 固定 commit），补齐发布步骤。
4. 产出「如何发布到 DSH 市场」的可执行结论（官方发现页 vs dsh.market / 社区市场），写入 `docs/research/dsh-plugin-market-landscape.md` 增补节。

## 步骤

- [ ] 术语：README / `docs/commands.md` / `docs/VERSIONS.md` / `dsh/README.md` 中 `feel_mode` 两态统一为 **Feel Mode（流程模式）** 与 **Free Mode（自由模式）**；保留「严格/宽松」仅作解释性括注。
- [ ] README：新增「两种模式」节（对照表 + 默认 Free Mode + 项目/全局覆盖 + 与 workflow_mode 的区别）；更新最新版本行措辞。
- [ ] 市场索引：提交文档后，用 `npm run market:index` 从 HEAD 生成 `docs/market/index.json`；`npm run market:index:check` 校验；单独提交生成物。
- [ ] 研究增补：`docs/research/dsh-plugin-market-landscape.md` 增加「2026-11-14 落地状态」——官方发现页所需步骤（Pages 部署、索引 URL）、dsh.market 收录方式（topic/issue、README 解析）、以及「社区一键安装必须先发独立 npm 包（`dsh/` 去 private）」的判定。
- [ ] 验证：README 链接有效、术语一致性 grep、`market:index:check`、`npx tsc`、`vitest`、`lint i18n`、`build`。

## 验收

- [ ] README 首次出现「Feel Mode（流程模式）/ Free Mode（自由模式）」对照，且默认值说明与 `config.yaml` 一致（默认 Free Mode）
- [ ] `docs/market/index.json` 存在且校验通过（条目 `openfeel-dsh@1.5.18`，source git + commit + `path:/dsh`）
- [ ] 研究文档给出两条发布路径与明确前置条件（Pages 开关 / npm 包身份）
- [ ] 全量验证绿

## 风险

- 名称变更只改称呼，**不改配置值**：`config set feel_mode enabled|disabled` 不变，避免破坏既有项目。
- 市场索引要求「索引里的版本必须真实存在于指向的 commit」：必须先提交再生成，且有 `dsh/` 未提交改动时生成器会拒绝。
- GitHub Pages 需用户在仓库 Settings 打开（Agent 无法代为开启），本阶段只做到「生成 + 提交 + 给出 URL 与步骤」。
