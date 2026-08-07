# op-rev-004：flow.ts repair/migrate 中文硬编码字符串比较修正

- **阶段**：v4.4-stage-01（审查修复）
- **REV 引用**：对应 REV-004（`REV-v4.4-stage-01.md`）
- **前置**：无
- **负责 Agent**：Executor
- **最多重试**：3

## 目标

消除 `src/commands/flow.ts` 中 `repair` 和 `migrate` 子命令使用中文硬编码字符串做程序逻辑判断的脆弱模式。遵循审查建议的**路径 A**：核心层返回结构化数据（布尔标志），CLI 层基于标志判断而非字符串匹配。

## 实施步骤

### 步骤 1：修改 FlowManager.repair()——移除中文字符串，"无问题"由 CLI 层判断

`src/core/flow-manager.ts` 第 1916-1918 行：

- [ ] [FIX] **删除** `repair()` 方法末尾的兜底推送：
  ```typescript
  // 改前（第 1916-1918 行）：
  if (!modified && changes.length === 0) {
    changes.push('未检测到需要修复的问题');
  }
  // 改后：直接删除该 3 行。
  // changes 在无问题时保持空数组，CLI 层通过 changes.length === 0 判断"没问题"。
  ```

- [ ] [FIX] 确认 `repair()` 返回的 `RepairResult` 接口现有字段已满足需求：
  - `fixed: boolean` — 是否实际修复/恢复
  - `recovered: boolean` — 是否从 .bak 恢复
  - `changes: string[]` — 变更日志（不含"未检测到需要修复的问题"）
  - **不新增字段**，利用现有三个布尔/数组字段即可覆盖所有判断路径

### 步骤 2：修改 FlowManager.migrate()——增加 `failed` 字段区分"无变更"与"失败"

`src/core/flow-manager.ts` migrate 方法（约第 1953 行）：

- [ ] [FIX] 修改 `migrate()` 返回类型，增加 `failed: boolean`：
  ```typescript
  // 改前：
  migrate(dryRun: boolean = false, noBackup: boolean = false): { migrated: boolean; changes: string[] } {
  // 改后：
  migrate(dryRun: boolean = false, noBackup: boolean = false): { migrated: boolean; changes: string[]; failed: boolean } {
  ```

- [ ] [FIX] 所有返回路径补充 `failed` 字段：
  - 第 1958 行（flow.json 未加载）：`return { migrated: false, changes, failed: true };`
  - 第 1963 行（已是新版格式）：`return { migrated: false, changes, failed: false };`
  - 第 1981 行（备份失败）：`return { migrated: false, changes, failed: true };`
  - 第 2037 行（迁移成功）：`return { migrated: true, changes, failed: false };`

### 步骤 3：修改 flow.ts repair 命令——基于布尔/数组判断替代字符串比较

`src/commands/flow.ts` repair action 处理器（第 716-752 行）：

- [ ] [FIX] **第 739 行**：替换字符串比较为布尔+数组判断：
  ```typescript
  // 改前：
  } else if (result.changes.length === 1 && result.changes[0] === '未检测到需要修复的问题') {
    console.log('\n' + t('flow.repair.noFix', lang));
  }
  // 改后：
  } else if (!result.recovered && result.changes.length === 0) {
    console.log('\n' + t('flow.repair.noFix', lang));
  }
  ```
  逻辑说明：`!result.fixed` 已由外层 `else` 保证。此分支仅在 `!fixed && !recovered && changes.length === 0` 时进入（即"无任何问题"），不再依赖中文字符串匹配。

- [ ] [FIX] 确认干运行路径（第 729-733 行）不受影响：`result.changes.length > 0` 条件不依赖字符串内容。

### 步骤 4：修改 flow.ts migrate 命令——基于 `failed` 标志替代字符串匹配

`src/commands/flow.ts` migrate action 处理器（第 792-817 行）：

- [ ] [FIX] **第 797-806 行**：用 `result.failed` 替代 `change.includes('失败')` 和 `result.changes.some(...)`：
  ```typescript
  // 改前：
  for (const change of result.changes) {
    if (change.includes('失败')) {
      console.error(`  ${change}`);
    } else {
      console.log(`  ${change}`);
    }
  }
  if (result.changes.some((c) => c.includes('失败'))) {
    console.error('\n' + t('flow.migrate.failed', lang));
    process.exit(1);
  }
  
  // 改后：
  for (const change of result.changes) {
    console.log(`  ${change}`);  // 全部统一输出到 stdout
  }
  if (result.failed) {
    console.error('\n' + t('flow.migrate.failed', lang));
    process.exit(1);
  }
  ```
  逻辑说明：`result.failed === true` 时统一判定失败；`failed === false && !migrated` 时仅输出信息性变更（如"已是新版格式"）后静默返回。

### 步骤 5：自测验证

- [ ] 运行 `npm test`，确保 291 个测试全部通过
- [ ] 在正常 flow.json 上执行 `openfeel flow repair`，验证输出 `flow.repair.noFix`（中文/英文均正确）
- [ ] 构造损坏的 flow.json 执行 `openfeel flow repair`，验证修复成功输出 `flow.repair.fixDone`
- [ ] 在旧版格式 flow.json 上执行 `openfeel flow migrate`，验证迁移成功
- [ ] 在新版格式 flow.json 上执行 `openfeel flow migrate`，验证输出"已是新版格式"（无 exit(1)）
- [ ] 在 en 模式下验证上述命令输出均为英文（无中文字符串穿透）

## 产出文件

- `src/core/flow-manager.ts`
  - `repair()` 方法：删除第 1916-1918 行
  - `migrate()` 方法：返回类型新增 `failed`，4 个 return 路径补充 `failed` 字段
- `src/commands/flow.ts`
  - 第 739 行：替换为 `!result.recovered && result.changes.length === 0`
  - 第 797-806 行：替换为 `result.failed` 统一判断

## 自测清单

- [ ] `npm test` 全量通过（291/291）
- [ ] `flow repair` 正常 flow.json → 输出"未检测到需要修复的问题"（zh-CN）/ "No issues detected"（en）
- [ ] `flow repair` 损坏 flow.json → 输出修复成功通知
- [ ] `flow repair --dry-run` 有可修复问题 → 输出 dry-run 提示
- [ ] `flow migrate` 新版 flow.json → 输出"已是新版格式"，`exitCode === 0`
- [ ] `flow migrate` 旧版 flow.json → 输出迁移完成通知，`exitCode === 0`
- [ ] `flow migrate` 备份失败场景 → 输出 `flow.migrate.failed`，`exitCode === 1`
- [ ] en 模式下所有命令输出英文，无中文字符
- [ ] FlowManager.ts 中 `getPhaseLabels()` 仍使用中文硬编码 → **不在本次修复范围**（属非阻塞 REV-005）
