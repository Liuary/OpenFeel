# op-009：修复 v4.6-stage-02 审查发现的 4 条 REV
- **阶段**：v4.6-stage-02
- **前置**：op-001~008（config get/set 命令 + 过度设计规则落地）已完成编码并通过审查
- **负责 Agent**：Executor
- **最多重试**：3

## 目标

修复 Reviewer 在 v4.6-stage-02 审查中发现的 4 条 REV：
- REV-001（blocking）：setConfigValue 使用 normalized readConfig 导致注释丢失和扁平字段残留
- REV-002（non-blocking）：get/set catch 块错误信息不准确 + catch 风格不一致
- REV-003（non-blocking）：get 命令复用 config.set.noProject 键（语义不符）
- REV-004（non-blocking）：.opencode/agents/reviewer.md 部署定义版本漂移（缺过度设计维度行）

## 实施步骤

- [ ] 步骤 1：修复 REV-001 — `src/core/config.ts` 的 `setConfigValue` 改用 `yaml.Document` 增量修改

  使用 `parseDocument(readFileSync(...))` 读取原始 YAML（绕过 normalizeConfig），`doc.setIn(['defaults', key], value)` 原地修改 defaults 块，`doc.toString()` 序列化写回。保留注释与原始结构，不再产生扁平字段残留。文件不存在时用 `parseDocument('')` 创建空文档。

- [ ] 步骤 2：修复 REV-002 — 统一 `src/commands/config.ts` get/set catch 风格并修正错误信息

  get/set catch 均带 `err` 参数并输出实际错误信息（不再输出误导性的"未找到项目配置文件"）。

- [ ] 步骤 3：修复 REV-003 — 新增 `config.get.noProject` i18n 键

  在 `src/core/i18n-data/zh-CN.ts` / `en.ts` 的 config 域新增 `get.noProject` 键，`src/commands/config.ts` get 命令 catch 引用新键。

- [ ] 步骤 4：修复 REV-004 — 同步 `.opencode/agents/reviewer.md` 过度设计维度行

  在审查维度表的"规范性"行下新增"过度设计"子维度行，与源模板 `src/core/templates-data/agents/zh-CN/reviewer.md` 一致。model 字段保持 glm-5.2 不动（版本漂移由 Feel 决策，不在本 op 范围）。

- [ ] 步骤 5：构建与测试验证

  执行 `npm run build` 确认构建通过，`npm test` 确认无回归。

- [ ] 步骤 6：手动验证 config set 写回完整性

  临时复制项目 `.openfeel/config.yaml` 到临时目录，对副本执行 `openfeel config set auto_advance enabled`，检查写回文件完整保留 meta/models 结构与注释，且无扁平字段残留。

- [ ] 步骤 7：Git 提交

  ```bash
  git add -A
  git commit -m "op-009: 修复 v4.6-stage-02 审查发现的 4 条 REV"
  ```

## 产出文件

- `src/core/config.ts`（REV-001 修复）
- `src/commands/config.ts`（REV-002/003 修复）
- `src/core/i18n-data/zh-CN.ts`（REV-003 修复）
- `src/core/i18n-data/en.ts`（REV-003 修复）
- `.opencode/agents/reviewer.md`（REV-004 修复）
- `.openfeel/tmp/op-stage-02-op-009-test-report.md`（自测报告）

## 自测清单

- [ ] `setConfigValue` 不再调用 `readConfig`，改用 `parseDocument` 增量修改 defaults 块
- [ ] get/set catch 块均带 `err` 参数并输出实际错误信息
- [ ] zh-CN.ts / en.ts 均含 `config.get.noProject` 键，get 命令 catch 引用新键
- [ ] `.opencode/agents/reviewer.md` 审查维度表"规范性"行下含过度设计子维度行
- [ ] `npm run build` 退出码为 0
- [ ] `npm test` 全部通过，无回归
- [ ] 手动验证：config set 写回后保留 meta/models 结构与注释，无扁平字段残留
- [ ] 变更已通过 `git commit` 纳入版本管理

## 方案修正记录

| 声明产出 | 实际产出 | 比对结果 | 说明 |
|---------|---------|:--:|------|
| `src/core/config.ts` | 同 | 一致 | REV-001：setConfigValue 改用 parseDocument 增量修改 |
| `src/commands/config.ts` | 同 | 一致 | REV-002/003：get/set catch 统一带 err 并输出实际错误 |
| `src/core/i18n-data/zh-CN.ts` | 同 | 一致 | REV-003：新增 config.get.noProject / config.set.error，删除 config.set.noProject |
| `src/core/i18n-data/en.ts` | 同 | 一致 | REV-003：同上 |
| `.opencode/agents/reviewer.md` | 同 | 一致 | REV-004：新增过度设计维度行（model 保持 glm-5.2 不动） |
| `.openfeel/tmp/op-stage-02-op-009-test-report.md` | 同 | 一致 | 自测报告 |
| — | `.openfeel/users/Liuary/code_review/REV-v4.6-stage-02.md` | 超范围（预期） | 4 条 REV 状态标记为 resolved + 处理记录 |
| — | `.openfeel/plan/v4.6/ops/stage-02-op-009.md` | 超范围（预期） | 本方案文件本身 |
| — | `.openfeel/flow.json` / `.openfeel/flow.json.bak` | 超范围（预期） | 审查回退流程状态（review_pending → exec_running），随提交纳入 |
