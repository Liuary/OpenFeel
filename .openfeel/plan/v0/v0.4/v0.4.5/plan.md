# OpenFeel v0.4.5 — 自动 init 修复

> 创建于 2026-07-18 | Feel 直接处理

## 需求

`openfeel update` 在未 `init` 的项目上执行时，自动调用 `initProject()` 完成初始化，再继续部署。

## 根因

v4.4 部署测试中发现：用户清理项目后只跑 `update`，因为 `.openfeel/` 目录不存在导致 `.info.json` 缺失，`getCliLang()` 回退 `zh-CN`，Agent 和 AGENTS.md 语言错误。

## 改动

| 文件 | 改动 |
|------|------|
| `src/commands/update.ts` | 新增 `initProject` 导入；在 `existsSync(targetPath)` 之后检查 `.openfeel/` 目录，不存在则自动调用 `initProject(targetPath, options?.lang)` |
| `src/core/i18n-data/zh-CN.ts` | 新增 `update.autoInitTmpl`、`update.autoInitCreated` 两个 key |
| `src/core/i18n-data/en.ts` | 新增对应英文翻译 |

## 行为

```
openfeel update /path/to/project
  → .openfeel/ 不存在？
    → 是：自动 init（使用 --lang 参数或回退默认语言）
    → 继续正常 update 流程
```

## 验证

- 298/298 测试通过
- 无 init 的项目直接 `update` 可正常工作
