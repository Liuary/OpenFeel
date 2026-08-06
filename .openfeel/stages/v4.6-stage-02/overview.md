# v4.6-stage-02

## 目标

补充 CLI 命令功能缺失和项目规则/审查维度增强：
1. `openfeel config get/set auto_advance` — 项目配置读写 CLI 命令
2. AGENTS.md 过度设计规则增强（代码层/架构层分离）
3. Reviewer 审查维度新增「过度设计」子维度
4. Vision 模板去硬编码模型名

## 依赖

无（与 stage-01 可独立执行）

## 操作方案

### 批次 A（并行）
- **A1 (op-001)**：添加 `getConfigValue()` / `setConfigValue()` 方法 → `src/core/config.ts`（使用 YAML Document API 增量修改）
- **A2 (op-002)**：添加 i18n 键（help + output 共 14 条）→ `zh-CN.ts` + `en.ts`
- **A3 (op-003)**：增强 AGENTS.md 第 2 条过度设计规则 → `AGENTS.md`

### 批次 B（依赖 A 完成，可并行）
- **B1 (op-004)**：添加 `config get/set` 子命令 → `src/commands/config.ts`
- **B2 (op-005)**：同步 AGENTS 模板到 `template-loader.ts` 中英双语模板
- **B3 (op-006)**：添加 Reviewer「过度设计」审查子维度 → reviewer.md ×2

### 批次 C（验证）
- **C1 (op-007)**：构建 + 测试验证（`npm run build` + `npm test`）
- **op-008**：Vision 模板去硬编码模型名（3 个 vision.md 文件）

## 产出清单

| 文件 | 操作 | 说明 |
|------|:--:|------|
| `src/core/config.ts` | 修改 | +100 行（getConfigValue / setConfigValue，YAML Document API） |
| `src/commands/config.ts` | 修改 | +40 行（get/set 子命令） |
| `src/core/i18n-data/zh-CN.ts` | 修改 | +14 条目 |
| `src/core/i18n-data/en.ts` | 修改 | +14 条目 |
| `AGENTS.md` | 修改 | ~6 行（过度设计规则代码层/架构层分离） |
| `src/core/template-loader.ts` | 修改 | ~12 行（中英双语模板同步） |
| `src/core/templates-data/agents/zh-CN/reviewer.md` | 修改 | +1 行（过度设计子维度） |
| `src/core/templates-data/agents/en/reviewer.md` | 修改 | +1 行（英文同步） |
| `src/core/templates-data/agents/zh-CN/vision.md` | 修改 | 1 行（去硬编码） |
| `src/core/templates-data/agents/en/vision.md` | 修改 | 1 行（去硬编码） |
| `.opencode/agents/vision.md` | 修改 | 1 行（去硬编码） |
| `test/core/config.test.ts` | 修改 | +40 行（新增测试） |

## 验证状态

- ✅ `npm run build` 构建成功
- ✅ `npm test` 298/298 测试通过
- ✅ `openfeel config get auto_advance` 命令可用
- ✅ `openfeel config set auto_advance enabled/disabled` 命令可用
