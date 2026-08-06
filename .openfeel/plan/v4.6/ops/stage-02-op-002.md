# op-002：添加 i18n 键（7 对中英双语）
- **阶段**：v4.6-stage-02
- **前置**：无
- **负责 Agent**：Executor
- **最多重试**：3

## 目标

在 `zh-CN.ts` 和 `en.ts` 的 `config` 域和 `help` 域中新增 7 对中英双语键，用于支持 `openfeel config get/set` 命令的 help 文本和运行时输出。

## 参考

- 参见 kb/patterns.md #i18n 域扩展与 config 命令组模式 — 遵循 `{domain}.{module}.{name}` 命名规范
- 参见 kb/patterns.md #双语 CLI 交互模式 — 中英文键结构完全对称

## 实施步骤

### 批 A：`src/core/i18n-data/zh-CN.ts`（2 处修改）

- [ ] Step A1：在 `help` 域末尾（`help.config.list-projects` 之后，约第 438 行）追加 2 条 help 键

```typescript
  'config.get':            { key: 'help.config.get',            zh: '读取项目工作流配置项的值（项目配置）', en: '' },
  'config.set':            { key: 'help.config.set',            zh: '设置项目工作流配置项的值（项目配置）', en: '' },
```

> 注意：help 文本中标注"项目配置"以区分 `get-lang`/`set-lang`（全局配置）。

- [ ] Step A2：在 `config` 域末尾（`config.list.item` 之后，约第 475 行）追加 5 条 output 键

```typescript
  'get.result':             { key: 'config.get.result',             zh: '{key}：{value}',                                    en: '' },
  'set.ok':                 { key: 'config.set.ok',                 zh: '{key} 已设置为：{value}',                           en: '' },
  'set.invalidKey':         { key: 'config.set.invalidKey',         zh: '无效的配置键 "{val}"，当前仅支持：{keys}',            en: '' },
  'set.invalidValue':       { key: 'config.set.invalidValue',       zh: '无效的值 "{val}"。{key} 仅支持：{values}',          en: '' },
  'set.noProject':          { key: 'config.set.noProject',          zh: '未找到项目配置文件，请先运行 openfeel init',         en: '' },
```

> 插入位置：在现有 `config` 域的最后行之后（即 `'list.item': ...` 之后）。也可以在 `list.item` 之前插入，只要与 en.ts 顺序一致即可。

### 批 B：`src/core/i18n-data/en.ts`（2 处修改，与 zh-CN 严格对称）

- [ ] Step B1：在 `help` 域末尾追加 2 条 help 键

```typescript
  'config.get':            { key: 'help.config.get',            zh: '', en: 'Read a project workflow config value (project config)' },
  'config.set':            { key: 'help.config.set',            zh: '', en: 'Set a project workflow config value (project config)' },
```

- [ ] Step B2：在 `config` 域末尾追加 5 条 output 键

```typescript
  'get.result':             { key: 'config.get.result',             zh: '', en: '{key}: {value}' },
  'set.ok':                 { key: 'config.set.ok',                 zh: '', en: '{key} set to: {value}' },
  'set.invalidKey':         { key: 'config.set.invalidKey',         zh: '', en: 'Invalid config key "{val}". Currently supported: {keys}' },
  'set.invalidValue':       { key: 'config.set.invalidValue',       zh: '', en: 'Invalid value "{val}". {key} only supports: {values}' },
  'set.noProject':          { key: 'config.set.noProject',          zh: '', en: 'No project config file found, please run openfeel init first' },
```

### 批 C：验证

- [ ] Step C1：运行 `npx tsc --noEmit`，确认无类型错误（新增键的 key 与 I18nEntry 类型兼容）
- [ ] Step C2：目视确认两文件的新增键数量一致（zh-CN 和 en 各新增 7 条）

## 产出文件

- `src/core/i18n-data/zh-CN.ts`（修改，+7 条目）
- `src/core/i18n-data/en.ts`（修改，+7 条目）

## 自测清单

- [ ] `zh-CN.ts` help 域新增 2 条键：`help.config.get`、`help.config.set`
- [ ] `zh-CN.ts` config 域新增 5 条键：`config.get.result`、`config.set.ok`、`config.set.invalidKey`、`config.set.invalidValue`、`config.set.noProject`
- [ ] `en.ts` 中上述 7 条键的 en 字段非空、zh 字段为空（对称结构）
- [ ] 两文件新增键的 `key` 字段完全一致
- [ ] 运行 `npx tsc --noEmit` 零错误
