# op-rev-001：buildMap 语言字段选取逻辑修正

- **阶段**：v4.4-stage-01（审查修复）
- **REV 引用**：对应 REV-001（`REV-v4.4-stage-01.md`）
- **前置**：无
- **负责 Agent**：Executor
- **最多重试**：3

## 目标

修正 `src/core/i18n.ts` 的 `buildMap()` 函数：将 `entry.zh || entry.en` 的字段选取改为基于 `lang` 参数明确选取对应字段，消除"en 语言优先读 zh 字段"的语义错误。

## 实施步骤

### 步骤 1：修改 `buildMap()` 函数签名与实现

- [ ] [FIX] 修改 `buildMap` 函数签名，新增 `lang: string` 参数：
  ```typescript
  function buildMap(domains: DomainImport[], lang: string): Map<string, string> {
  ```
- [ ] [FIX] 将第 88 行 `map.set(entry.key, entry.zh || entry.en)` 改为：
  ```typescript
  // 按 lang 明确选取对应字段，en 模式下不依赖 zh 为空的副效应
  const field = lang === 'en' ? ('en' as const) : ('zh' as const);
  map.set(entry.key, entry[field]);
  ```
  说明：`en.ts` 中所有条目的 `zh` 字段已保证为 `''`（falsy），而 `zh-CN.ts` 中 `en` 字段也为 `''`。直接用 `lang` 选择字段即可，无需 `||` fallback。

### 步骤 2：更新调用点传入 `lang` 参数

- [ ] [FIX] `getStringMap()` 函数（第 102、104、107 行）已有的三个 `buildMap(...)` 调用点，均传入 `lang` 参数：
  ```typescript
  if (lang === 'zh-CN') {
    stringMaps[lang] = buildMap(zhDomains, lang);
  } else if (lang === 'en') {
    stringMaps[lang] = buildMap(enDomains, lang);
  } else {
    stringMaps[lang] = buildMap(zhDomains, lang);
  }
  ```

### 步骤 3：自测验证

- [ ] 运行 `npm test`，确保 291 个测试全部通过
- [ ] 手动验证：在项目根目录执行 `openfeel project overview`（zh-CN 模式）和 `OPENFEEL_LANG=en openfeel project overview`（若 CLI 支持环境变量覆盖）或切换到 en 项目验证输出正确

## 产出文件

- `src/core/i18n.ts`（修改 `buildMap` 函数签名 + 内部实现 + `getStringMap` 调用点）

## 自测清单

- [ ] `npm test` 全量通过（291/291）
- [ ] `buildMap` 对 `zh-CN` 传入时，Map 值全部匹配 zh-CN.ts 中的 `zh` 字段
- [ ] `buildMap` 对 `en` 传入时，Map 值全部匹配 en.ts 中的 `en` 字段
- [ ] `t('common.error', 'zh-CN')` 返回 `'错误'`
- [ ] `t('common.error', 'en')` 返回 `'Error'`
