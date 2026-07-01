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

当前测试状态：**225/227 通过**（2 个已知弱项，非阻塞性）
