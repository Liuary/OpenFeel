# op-004：添加 config get/set 子命令
- **阶段**：v4.6-stage-02
- **前置**：op-001, op-002 (hard)
- **负责 Agent**：Executor
- **最多重试**：3

## 目标

在 `src/commands/config.ts` 中新增 `openfeel config get <key>` 和 `openfeel config set <key> <value>` 两个子命令，实现项目配置（`.openfeel/config.yaml` 的 `defaults` 块）的读写。

## 参考

- 参见 kb/patterns.md #CLI 原子管理模式 — 命令层不直接 readFile/writeFile，通过核心层工具函数暴露
- 参见 kb/patterns.md #i18n 域扩展与 config 命令组模式 — Commander 子命令组 + 原子操作原则

## 约束

- **key 白名单**：当前仅允许 `auto_advance`
- **value 白名单**：`auto_advance` 仅允许 `enabled` / `disabled`
- **不在项目目录内时**：输出错误提示（即 config.yaml 不存在时，set 命令提示先运行 init）
- **help 文本**：明确标注"项目配置"以区分全局命令（get-lang/set-lang 操作全局 `~/.openfeel/config.json`）

## 实施步骤

- [ ] Step 1：在 `src/commands/config.ts` 顶部新增导入

```typescript
import { getConfigValue, setConfigValue } from '../core/config.js';
```

> 插入位置：在现有 `import { getGlobalConfig, setGlobalConfig } from '../core/workspace/identity.js';` 之后（约第 8 行后）

- [ ] Step 2：在 `registerConfigCommand` 函数末尾（`list-projects` 命令注册之后、函数闭合 `}` 之前），新增两个子命令

```typescript
  // openfeel config get <key> — 读取项目配置项
  configCmd
    .command('get <key>')
    .description(t('help.config.get'))
    .action((key: string) => {
      const lang = getCliLang(process.cwd());
      try {
        const value = getConfigValue(process.cwd(), key);
        if (value === null) {
          console.log(t('config.get.result', lang, { key, value: t('common.noConfig', lang) }));
        } else {
          console.log(t('config.get.result', lang, { key, value }));
        }
      } catch {
        console.error(t('config.set.noProject', lang));
        process.exit(1);
      }
    });

  // openfeel config set <key> <value> — 写入项目配置项
  configCmd
    .command('set <key> <value>')
    .description(t('help.config.set'))
    .action((key: string, value: string) => {
      const lang = getCliLang(process.cwd());

      // key 白名单校验
      const allowedKeys = ['auto_advance'];
      if (!allowedKeys.includes(key)) {
        console.error(t('config.set.invalidKey', lang, { val: key, keys: allowedKeys.join(', ') }));
        process.exit(1);
      }

      // value 白名单校验
      if (key === 'auto_advance' && !['enabled', 'disabled'].includes(value)) {
        console.error(t('config.set.invalidValue', lang, { val: value, key, values: 'enabled, disabled' }));
        process.exit(1);
      }

      try {
        setConfigValue(process.cwd(), key, value);
        console.log(t('config.set.ok', lang, { key, value }));
      } catch (err) {
        // 不存在 config.yaml 时提示 init
        console.error(t('config.set.noProject', lang));
        process.exit(1);
      }
    });
```

> **说明**：`t()` 已从 `../core/i18n.js` 导入，`getCliLang` 同样已导入，无需新增导入。`t()` 的第二个参数是语言，第三个参数是模板变量对象。新增 i18n 键已在 op-002 中定义。

- [ ] Step 3：运行 `npx tsc --noEmit`，确认无类型错误

- [ ] Step 4：运行 `npm run build`，确保构建成功（生成的 CLI 命令可正常 --help）

## 产出文件

- `src/commands/config.ts`（修改，约 +55 行）

## 自测清单

- [ ] `openfeel config --help` 中可见 `get` 和 `set` 子命令，help 文本含"项目配置"
- [ ] `openfeel config get --help` 输出正确 help 文本
- [ ] `openfeel config get auto_advance` 在项目目录下正确返回 `auto_advance：disabled`（或 enabled）
- [ ] `openfeel config set auto_advance enabled` 成功执行，`get auto_advance` 返回 `enabled`
- [ ] `openfeel config set auto_advance disabled` 成功恢复
- [ ] `openfeel config set auto_advance invalid_value` 输出无效值错误提示
- [ ] `openfeel config set unknown_key x` 输出无效键错误提示（仅支持 auto_advance）
- [ ] 在非项目目录（无 `.openfeel/config.yaml`）执行 set 命令，输出 `config.set.noProject` 提示
- [ ] 运行 `npx tsc --noEmit` 零错误
