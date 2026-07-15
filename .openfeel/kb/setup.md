# 环境配置

> 使用 [+] / [-] 标记管理启用/禁用状态。只能标记禁用不能删除。

## [+] 部署模板复用机制 (2026-06-27)

首次 `openfeel init --demo` 后自动生成 `models.template.yaml`，新项目可通过复制模板快速配置模型后端。

模板结构：
```yaml
models:
  default:
    provider: deepseek
    model_name: deepseek-v4-pro
  agents: {}
  roles: {}
```

## [+] npm 超时与网络预检 (2026-06-27)

Executor 在运行 `npm install` 前执行网络连通性预检（`npm ping` 或等价的 HTTP 请求），安装命令设置 60s 超时保护。

支持 5 种包管理器：npm / yarn / pnpm / bun，版本校验命令对应各自的包管理器（`npm view` / `yarn info` / `pnpm view` / `bun pm ls`）。

## [+] 构建与测试 (2026-06-28)

**项目依赖安装：**
```bash
npm install
```

**运行测试：**
```bash
npm test
```

当前测试状态：**298/298 通过**（20 个测试文件，全部通过）

## [+] OpenCode Agent 模型配置 (2026-07-06)

Agent frontmatter 的 `model` 字段格式为 `provider/model-name`，非简短角色名或裸模型名：

```yaml
# ✅ 正确格式
model: deepseek/deepseek-v4-pro   # 默认推理
model: deepseek/deepseek-v4-flash # 快速执行
model: zhipuai/glm-5.1            # 异种审查
```

**踩过的坑**：
- ❌ `model: fast` → 平台当字面模型名查找
- ❌ `model: deepseek-v4-flash` → 缺 provider 前缀
- ❌ `model: DeepSeek/` → provider 大小写敏感，dee 小写

**缓存注意**：修改 frontmatter 后需重启 OpenCode/VSCode。config.yaml roles 不参与模型解析——模型完全由 frontmatter 直接指定。
