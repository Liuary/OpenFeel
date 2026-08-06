# op-001：添加 config.yaml 读写方法
- **阶段**：v4.6-stage-02
- **前置**：无
- **负责 Agent**：Executor
- **最多重试**：3

## 目标

在 `src/core/config.ts` 中新增 `getConfigValue` 和 `setConfigValue` 两个函数，提供对 `.openfeel/config.yaml` 中 `defaults` 块的单键读写能力。

## 实施步骤

- [ ] Step 1：在 `src/core/config.ts` 顶部 import 区，从 `yaml` 包新增导入 `stringify`（当前已有 `parse as parseYaml`）

  ```typescript
  import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
  ```

- [ ] Step 2：在 `writeDefaultConfig` 函数之后（约 263 行后），添加两个新函数

  ### getConfigValue

  ```typescript
  /**
   * 读取项目 config.yaml 中 defaults 块的指定 key
   * @param projectPath 项目根路径
   * @param key 配置键名（如 'auto_advance'）
   * @returns 配置值（string），未设置时返回 null
   */
  export function getConfigValue(projectPath: string, key: string): string | null {
    const config = readConfig(projectPath);
    if (!config.defaults) {
      return null;
    }
    const value = (config.defaults as Record<string, unknown>)[key];
    if (value === undefined || value === null) {
      return null;
    }
    return String(value);
  }
  ```

  ### setConfigValue

  ```typescript
  /**
   * 向项目 config.yaml 的 defaults 块写入指定 key
   * 使用 Zod Schema 局部校验 value，通过 yaml.stringify() 序列化写回
   * @param projectPath 项目根路径
   * @param key 配置键名（当前仅支持 ConfigDefaultsSchema 中定义的键）
   * @param value 配置值
   */
  export function setConfigValue(projectPath: string, key: string, value: string): void {
    const configPath = resolve(projectPath, '.openfeel', 'config.yaml');

    // 1. 读取现有配置（不存在则用空对象）
    const raw = existsSync(configPath) ? readConfig(projectPath) : ({} as Config);

    // 2. 通过 ConfigDefaultsSchema.shape 做局部校验
    const fieldSchema = ConfigDefaultsSchema.shape[key as keyof typeof ConfigDefaultsSchema.shape];
    if (!fieldSchema) {
      throw new Error(`Unknown config key: ${key}`);
    }
    // 对 enum 字段尝试直接解析值（如 'enabled'/'disabled' → Zod enum 通过）
    fieldSchema.parse(value);

    // 3. 写入 defaults[key]
    const defaults = (raw.defaults ?? {}) as Record<string, unknown>;
    defaults[key] = value;
    raw.defaults = defaults as Config['defaults'];

    // 4. 序列化并写回
    const content = stringifyYaml(raw);
    writeFileSync(configPath, content, 'utf-8');
  }
  ```

  > **错误处理说明**：`fieldSchema.parse(value)` 会在 key 不存在于 Schema 或其值类型不匹配时抛出 ZodError。调用方（commands/config.ts）应 catch 此错误并翻译为 i18n 提示。`ConfigDefaultsSchema.shape` 是 Zod object 的 `shape` 属性，包含所有已定义字段的 schema。

- [ ] Step 3：确保 `node:path` 的 `resolve` 已在顶部导入（检查 import 行，当前已通过 `import { resolve } from 'node:path'` 导入）

- [ ] Step 4：运行 `npx tsc --noEmit` 确认无类型错误

## 产出文件

- `src/core/config.ts`（修改，约 +40 行）

## 自测清单

- [ ] `getConfigValue(projectPath, 'auto_advance')` 对已有 config.yaml 正确返回 `'disabled'` 或 `'enabled'`
- [ ] `getConfigValue(projectPath, 'nonexistent_key')` 正确返回 `null`
- [ ] `getConfigValue(projectPath, 'auto_advance')` 对不存在 config.yaml 的路径返回 `null`
- [ ] `setConfigValue(projectPath, 'auto_advance', 'enabled')` 成功写入，再 `getConfigValue` 读出 `'enabled'`
- [ ] `setConfigValue(projectPath, 'invalid_key', 'x')` 抛出错误（key 不在 Schema 中）
- [ ] `setConfigValue(projectPath, 'auto_advance', 'invalid')` 抛出 ZodError（值不在 enum 中）
- [ ] 运行 `npx tsc --noEmit` 零错误

### 版本声明

| 包名 | 版本 | 用途 | 选定依据 |
|------|------|------|----------|
| yaml | 2.7.1（现有） | YAML 序列化/反序列化 | 项目已依赖，新增使用 `stringify` |
| zod | 3.24.4（现有） | Schema 校验 | 项目已依赖，用于局部字段校验 |
