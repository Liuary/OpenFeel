# op-fix-help-i18n: 修复 --help 输出仍是中文的问题

## 目标

将 `src/cli/index.ts` 中的 `applyHelpI18n` IIFE 改为具名导出函数，并在 `bin/openfeel.js` 的 `program.parse()` 之前调用，确保命令树构建完成后才注入翻译。

- **阶段**: exec_running
- **最多重试**: 3

## 实施步骤

- [ ] 步骤1：将 `src/cli/index.ts` 中 `(function applyHelpI18n(): void { ... })()` IIFE 改为 `export function applyHelpI18n(program: Command): void { ... }`，保留函数体不变
- [ ] 步骤2：修改 `bin/openfeel.js`，导入 `applyHelpI18n`，在 `program.parse()` 之前调用 `applyHelpI18n(program)`
- [ ] 步骤3：验证 `npm run build && npm test` 通过

## 产出文件

- `src/cli/index.ts`
- `bin/openfeel.js`

## 自测清单

- [ ] 编译无报错：`npm run build` 成功
- [ ] 测试通过：`npm test` 全部通过
- [ ] `applyHelpI18n` 被正确导出（在 dist/cli/index.js 中可找到该函数签名）
