# op-rev-001：修复 v1.0.0-stage-02 审查 REV

- **阶段**：v1.0.0-stage-02（发布工程）
- **最多重试**：3

## 目标

修复 v1.0.0-stage-02 审查发现的 3 条 REV，修复后重新提交审查：

- REV-001（high，blocking）：`package.json` 中 `postinstall` 引用 `scripts/patch-inquirer.js`，但 `files` 数组不含 `scripts/`，用户 `npm install` 时报 `ENOENT`。
- REV-002（medium）：flow.json 中 `v1.0.0-stage-04` 缺少 `name` 字段（历史遗留），需与其它 stage 格式对齐。
- REV-003（low）：`.github/workflows/ci.yml` 缺少 `cache: 'npm'` 和文件头注释。

## 实施步骤

- [x] 1. 修复 REV-001：`package.json` 的 `files` 数组追加 `"scripts"`，变为 `["dist", "bin", "schemas", "scripts"]`
- [x] 2. 修复 REV-002：`flow.json` 中 `v1.0.0-stage-04` 对象添加 `"name": "v1.0.0-stage-04"` 字段（置于 phase 字段之前，与其他 stage 格式一致）
- [x] 3. 修复 REV-003：`ci.yml` 的 setup-node 步骤中添加 `cache: 'npm'`，文件顶部添加注释 `# OpenFeel v1.0 CI — 自动构建与测试`
- [x] 4. 验证 REV-001：运行 `npm pack --dry-run` 确认 `scripts/` 出现在产物中（scripts/patch-inquirer.js 2.5kB，总文件 193）
- [x] 5. 验证 REV-002：运行 `openfeel flow health` 零错误
- [x] 6. 回归验证：运行 `npm run build` + `npm test` 全部通过（build ✓，395 测试全通过）

## 产出文件

- `package.json`（更新）
- `.openfeel/flow.json`（更新）
- `.github/workflows/ci.yml`（更新）

## 自测清单

- [x] `npm pack --dry-run` 产物包含 `scripts/`（含 patch-inquirer.js）
- [x] `package.json` `files` 数组为 `["dist", "bin", "schemas", "scripts"]`
- [x] `flow.json` 中 `v1.0.0-stage-04` 含 `"name": "v1.0.0-stage-04"` 字段
- [x] `openfeel flow health` 零错误
- [x] `ci.yml` setup-node 步骤含 `cache: 'npm'`，文件顶部含注释
- [x] `npm run build` + `npm test` 全部通过

## 偏差记录

- 无偏差。`openfeel flow health` 输出含 3 条跨文件一致性 warnings（v1.0.0-stage-01/02/03 的 flow.json 与 status.md 状态不一致），属历史遗留，与本次 REV 修复无关，未处理（不扩大范围）。
