# v1.1.2-stage-60

## 目标

> 为 CI `publish` job 增加**并发控制**，消除「同一 push 被调度成多个并行 run → 并发发布同一版本 → npm registry `409 Cannot publish over previously staged version`」导致的**假失败**。
> **用户裁定方案 A**：仅加 `concurrency`（不做 409 幂等兜底；「最终能发布成功即可」）。

## 依赖

- v1.1.2-stage-59

## 背景（实测证据）

| 事实 | 实测值 |
|------|--------|
| npm 上 1.1.2 状态 | **已发布**（`dist-tags.latest = 1.1.2`，finalize `2026-10-01T19:29:49Z`） |
| 该 push 的 GitHub 事件 | 仅 **1 个** PushEvent（`25689d4`，`19:20:59Z`） |
| 该 commit 的 workflow run | **却有 2 个**：run **#53 success** 与 run **#54 failure**（同 `head_sha`、同 `created_at`） |
| 两个 publish job 时间线 | #53：`19:22:03→19:22:28` `npm publish` **success**；#54：`19:22:08→19:22:31` `npm publish` **failure(409)**，窗口重叠 |

根因：两 run 的 `publish` job 都通过 `Check if version changed`（暂存期远端 `npm view openfeel version` 仍为 `1.1.1`），**并发 PUT 同一版本 1.1.2** → 先者成功并置 registry *staged* 态，后者 `409`（npm registry 已知竞态，[npm/cli#9889](https://github.com/npm/cli/issues/9889)）。

## 变更摘要

> **1 op**，改动限定 **单文件** `.github/workflows/ci.yml`。

| op | 内容 | 涉及文件 |
|:--:|------|----------|
| **op-001** | `publish` job 增加：<br>`concurrency:`<br>`  group: publish-${{ github.ref }}`<br>`  cancel-in-progress: false` | `.github/workflows/ci.yml` |

## 边界（不可越界）

- **不改 `package.json` 版本**（保持 `1.1.2`——推送时 `publish` job 因版本未变而 skip，不触发发布）。
- 不改 `src/**` / `test/**` / `build.js` / `package.json`。
- 不新增依赖，不做任何 npm 变更。
- **不执行 `npm publish`**；不代 Feel 推送（推送由 Feel/用户执行）。
- 不改其它 job / 步骤；不影响 `build-and-test`。

## 完成标准

- [ ] `.github/workflows/ci.yml` YAML 合法（可解析）。
- [ ] `publish` job 具备 `concurrency` 组（`group: publish-${{ github.ref }}`、`cancel-in-progress: false`）。
- [ ] 经 `git push` 后，新 run 的 `publish` job 因**版本未变**而全程 skip、`build-and-test` 转绿。

> 详细操作方案见 `ops/op-001.md`（由 openfeel-executor 创建）。