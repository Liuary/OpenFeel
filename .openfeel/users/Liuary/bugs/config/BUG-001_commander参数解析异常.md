---
status: open
priority: high
module: config
author: Tester
created: 2026-07-15 00:32
---

# BUG-001: `config set lang` 参数解析异常，功能完全不可用

## 复现步骤

1. 执行 `npm run build` 构建项目
2. 执行 `node .\bin\openfeel.js config set lang en`
3. 观察输出

## 期望行为

输出 `全局语言已设置为：en`，全局配置文件 `lang` 字段更新为 `en`。

## 实际行为

```
无效的语言值"lang"，仅支持 zh-CN 和 en
```

`config set lang zh-CN` 同样失败：
```
无效的语言值"lang"，仅支持 zh-CN 和 en
```

## 根因分析

Commander 14.x 中，`.command('set lang <lang>')` 将无尖括号的 `lang` 也视为参数。帮助输出证实了这一点：

```
Commands:
  get <lang>         全局语言：{lang}
  set <lang> <lang>  修改全局默认语言 (zh-CN 或 en)
  list <projects>    列出所有已记录的项目路径→语言映射
```

当用户输入 `config set lang en` 时：
1. Commander 将 `lang` 匹配为第一个 `<lang>` 参数
2. `en` 匹配为第二个 `<lang>` 参数
3. `.action((lang: string) => {...})` 只接收第一个参数 → `lang` 的值是 `"lang"`（子命令路径词）
4. 校验 `"lang" !== 'zh-CN' && "lang" !== 'en'` → 报错退出

**三个子命令均受影响**：
- `get lang` → 解析为 `config get <lang>`（但因 action 无参数，恰好能工作）
- `set lang <lang>` → 解析为 `config set <lang> <lang>`（功能完全不可用）
- `list projects` → 解析为 `config list <projects>`（因 action 无参数，恰好能工作）

## 修复建议

将子命令路径从空格分隔改为连字符分隔，避免 Commander 将路径词误解析为参数：

```typescript
// 修改前
configCmd.command('get lang')
configCmd.command('set lang <lang>')
configCmd.command('list projects')

// 修改后
configCmd.command('get-lang')
configCmd.command('set-lang <lang>')
configCmd.command('list-projects')
```

或使用 Commander 的 `.command()` 链式嵌套写法。

## 影响范围

- `src/commands/config.ts` — 需修改 3 处 `.command()` 调用
- 方案文档 op-001.md 中自测清单的命令名需同步更新
- `config get lang` / `config set lang en` / `config list projects` 当前均存在路径解析偏差（后两者恰好工作）
