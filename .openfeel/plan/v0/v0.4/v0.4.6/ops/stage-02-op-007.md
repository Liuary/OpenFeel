# op-007：构建 + 测试验证
- **阶段**：v4.6-stage-02
- **前置**：op-004, op-005, op-006 (hard)
- **负责 Agent**：Executor
- **最多重试**：3

## 目标

对整个 v4.6-stage-02 的变更进行全面构建和测试验证，确保无回归、所有功能正常。

## 实施步骤

- [ ] Step 1：运行 `npm run build` 构建项目

  ```bash
  npm run build
  ```

  - 确认构建退出码 0
  - 检查 stdout 无 error 级别日志
  - 检查 template-loader.ts 中 reviewer/vision 模板已由 build.js 自动更新

- [ ] Step 2：运行 `npm test` 全量测试

  ```bash
  npm test
  ```

  - 确认所有测试通过
  - 确认无回归（对比 stage-01 完成后的测试通过数）

- [ ] Step 3：手动验证 CLI 命令（在项目目录下执行）

  ```bash
  # 3a. 验证 get 命令
  openfeel config get auto_advance
  # 期望输出：auto_advance：disabled（或 enabled）

  # 3b. 验证 set 命令 — 设为 enabled
  openfeel config set auto_advance enabled
  # 期望输出：auto_advance 已设置为：enabled

  # 3c. 验证 get 确认写入
  openfeel config get auto_advance
  # 期望输出：auto_advance：enabled

  # 3d. 验证 set 恢复为 disabled
  openfeel config set auto_advance disabled
  # 期望输出：auto_advance 已设置为：disabled

  # 3e. 验证无效 value 报错
  openfeel config set auto_advance invalid_value
  # 期望输出：无效的值 "invalid_value"。auto_advance 仅支持：enabled, disabled

  # 3f. 验证无效 key 报错
  openfeel config set unknown_key x
  # 期望输出：无效的配置键 "unknown_key"，当前仅支持：auto_advance

  # 3g. 验证 get 对不存在的 key 返回未设置
  openfeel config get nonexistent_key
  # 期望输出：nonexistent_key：（无配置）或无输出但正常退出

  # 3h. 验证 config --help 可见 get/set 子命令
  openfeel config --help
  # 期望：输出中包含 get 和 set 子命令，help 文本标注"项目配置"
  ```

- [ ] Step 4：验证 AGENTS.md 与模板一致性

  ```bash
  # 4a. 对比 AGENTS.md 约束#2 段落与 template-loader.ts zh-CN 模板对应段
  # 手动确认代码层/架构层分离措辞一致

  # 4b. 确认 reviewer 模板新增维度
  # 检查 src/core/templates-data/agents/{zh-CN,en}/reviewer.md 含"过度设计"行
  ```

- [ ] Step 5：运行 `npx tsc --noEmit` 类型检查

  ```bash
  npx tsc --noEmit
  ```
  - 确认零错误

## 产出文件

- 无新增文件（纯验证）

## 自测清单

| 检查项 | 验证方法 | 期望结果 |
|--------|----------|----------|
| 构建成功 | `npm run build` | 退出码 0 |
| 测试无回归 | `npm test` | 全量通过 |
| config get 读 | CLI 命令 | 正确显示 auto_advance 值 |
| config set 写 | CLI 命令 | 写入成功，get 可确认 |
| 无效 value 报错 | CLI 命令 | 输出 `config.set.invalidValue` 提示 |
| 无效 key 报错 | CLI 命令 | 输出 `config.set.invalidKey` 提示 |
| config --help | CLI 命令 | 可见 get/set 子命令 + "项目配置"标注 |
| AGENTS.md 同步 | 文件对比 | 与 template-loader.ts zh-CN 模板一致 |
| reviewer 维度新增 | 文件检查 | zh-CN + en 各有"过度设计"子维度 |
| Vision 模板去硬编码 | 文件检查 | 3 文件均不含具体模型名 |
| 类型检查 | `npx tsc --noEmit` | 零错误 |
