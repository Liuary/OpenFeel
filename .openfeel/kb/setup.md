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

## [+] npm pack 发布验证与 files 字段一致性检查 (2026-08-07)

npm 包发布前须执行 `npm pack --dry-run` 验证产物完整性，并与 `package.json` 的 `files` 白名单交叉对照，确保无遗漏或多余文件：

```bash
# 1. 干运行查看打包产物清单
npm pack --dry-run

# 2. 统计打包文件数（验证预期值）
npm pack --dry-run 2>&1 | grep -c "npm notice"

# 3. 实际打包测试
npm pack
tar -tzf openfeel-*.tgz | wc -l
```

**验证维度：**

| 维度 | 检查内容 | 方法 |
|------|------|------|
| 数量一致性 | 打包文件数与预期一致（v1.0.0 为 193 文件） | `npm pack --dry-run` 输出行数 |
| 类型覆盖 | `dist/`（编译产物）、`schemas/`（JSON Schema）、`bin/`（CLI 入口）均包含 | 对照 `files` 字段逐目录检查 |
| 无遗漏 | `files` 白名单声明了所有必要目录 | 逆向检查：源码目录 → files 字段 |
| 无多余 | 未声明 `src/`、`test/`、`templates-data/` 等仅构建时使用的目录 | `npm pack` 产物列表中不应出现这些目录 |

**关键要点：**

- `npm pack --dry-run` 的输出随 npm 版本不同格式有细微差异，验证时先确认本机 npm 版本输出格式
- `files` 字段的 glob 规则与 `.gitignore` 不同——`files` 默认排除 `.gitignore` 中列出的文件，但不会自动排除未列出的目录
- `package.json` 中 `exports` 字段定义了模块入口点，但**不控制打包内容**——仅 `files` 字段控制哪些文件进入 tarball。若 `files` 遗漏但 `exports` 指向的文件，运行时找不到该文件
- 发布前应同时检查：`files` 白名单（打包范围）、`exports`（入口路径）、`bin`（命令行入口）、`main/types`（传统入口）

**反模式：**

- 依赖 `exports` 字段控制打包范围——`exports` 控制的是**导入路径解析**而非文件包含，缺失文件不会被自动排除
- 遗漏 `schemas/` 或 `bin/` 目录——install 后 CLI 无法启动或 Schema 校验失败
- 在 `files` 中使用过宽的 glob（如 `"*"`）——会包含 `src/`、`test/` 等不应发布的源码

**参见：** v1.0.0-stage-02 op-004
