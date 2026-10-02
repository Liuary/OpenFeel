# OpenFeel v1.1.3 — CLI 输出编码 `auto` 语义修正

> **版本**：v1.1.3（补丁版，W 级递增） | **创建日期**：2026-10-02 | **Planner**：openfeel-planner
> **规模判定**：小规模（单阶段；但跨 `src` + `test` + i18n + 文档 + 版本收口，走正式计划）
> **定位**：修正 stage-58 的 `auto` 默认编码对 **UTF-8 管道消费者**的回归。**不引入新架构层**。
> **阶段计划**：`.openfeel/plan/v1/stage-61/plan.md`（唯一执行级计划）。

---

## 一、背景与裁定

stage-58 引入输出编码自适应：`resolveTargetEncoding` 第⑤步按 `chcp` 探测把 win32 非 TTY 的默认输出映射为 **GBK**。实测（本 harness，UTF-8 管道）：pre-stage-58 bin 中文可读，当前 `auto` **乱码**；`--json` / `--encoding utf8` / `OPENFEEL_ENCODING=utf8` 可读。→ 对 UTF-8 管道消费者是**回归**。

**用户裁定方案 A**：第⑤步 `win32 && !isTTY` → **直接返回 `'utf8'`**；GBK 仅显式（`--encoding gbk` / `OPENFEEL_ENCODING=gbk`）。①`--json` 恒 UTF-8、②显式 `--encoding`、③env、④非 win32/TTY → utf8 不变。

## 二、阶段概览

| 阶段 | 名称 | 依赖 | op 数 |
|------|------|------|:--:|
| `v1.1.3-stage-61` | CLI 输出编码 `auto` 语义修正 | hard: `v1.1.2-stage-60` | 2（行为+测试 / 文档+版本收口+门禁） |

## 三、版本收口清单（A/B/C/D/E，供 stage-61 op-002 引用）

> 依据 `kb/patterns.md #版本号全链路收口清单模式`；以内容特征判定，不以行号为准（行号可能漂移）。

- **A 手工载体**：`package.json:3`、`package-lock.json:3`/`:9`（root 两处，禁 `npm install` 重生成）、`.openfeel/config.yaml:7`（单行增量，禁整文件重写）、`src/core/config.ts`（zh/en `CONFIG_TEMPLATE_*` 各一处）、`src/core/templates-data/agents-md/{zh-CN,en}.md`（「当前 v1.1.x」行）。
- **B 生成段**：`src/core/template-loader.ts`（由 build 从 A 类权威源重生成，**禁手改**）。
- **C 传播**：`CHANGELOG.md` 追加 `## [1.1.3]`。
- **D 禁改**：`src/**` 历史批注（`v1.1.2-stage-*` 示例）、依赖自身版本、`manual` 变更历史、`test/**` 注释。
- **E 无载体**：`README*` / `docs/**`（`docs/commands.md:3` 快照标注同步为 `v1.1.3`）。
- **CLI `VERSION` 常量不存在**：`--version` 直读 `package.json`；`release-metadata.test.ts` 已断言 `dist/index.js` 无 `VERSION` 导出。

## 四、边界

- 不改 `--json` 旁路与优先序；不改其它命令行为；不新增依赖；不动 CI workflow；不改 `.opencode/**`；不改 `flow.json`。
- **不 `npm publish`、不 `git push`**（推送/发布由 Feel/用户执行）。

## 五、修订记录

| 时间 | 制定人 | 说明 |
|------|--------|------|
| 2026-10-02 | openfeel-planner | 初稿：单阶段 v1.1.3（编码回归修正，方案 A）；版本收口清单；阶段计划见 `plan/v1/stage-61/plan.md` |
| 2026-10-02 | openfeel-archiver | 归档复核：与 `1.1.3` 收口值一致；stage-61 经 `flow advance --to done` 闭环（phase=`done`）；实施中增补 **op-003**（REV-001 `package-lock.json` 缩进纯空白修正，closed），op 数 2→3，其余不变 |