# op-008：Vision 模板去除硬编码模型名
- **阶段**：v4.6-stage-02
- **前置**：无（独立修正）
- **负责 Agent**：Executor
- **最多重试**：3

## 目标

修复 3 个 Vision Agent 模板文件中硬编码具体模型名的问题——正文中不应写死模型名，因为实际模型取决于用户平台配置。

## 涉及文件

| # | 文件 | 行号 | 原文 | 替换为 |
|---|------|------|------|--------|
| 1 | `src/core/templates-data/agents/zh-CN/vision.md` | 13 | `你由通义千问多模态模型（qwen-vl-plus）驱动` | `你由多模态模型驱动` |
| 2 | `src/core/templates-data/agents/en/vision.md` | 13 | `You are driven by the Qwen-VL-Plus multimodal model` | `You are driven by a multimodal model` |
| 3 | `.opencode/agents/vision.md` | 13 | `你由通义千问多模态模型（qwen-vl-plus）驱动` | `你由多模态模型驱动` |

## 实施步骤

- [ ] Step 1：修改 `src/core/templates-data/agents/zh-CN/vision.md` 第 13 行

  使用 `edit` 工具精确替换：
  - oldString: `你由通义千问多模态模型（qwen-vl-plus）驱动`
  - newString: `你由多模态模型驱动`

- [ ] Step 2：修改 `src/core/templates-data/agents/en/vision.md` 第 13 行

  使用 `edit` 工具精确替换：
  - oldString: `You are driven by the Qwen-VL-Plus multimodal model`
  - newString: `You are driven by a multimodal model`

- [ ] Step 3：修改 `.opencode/agents/vision.md` 第 13 行

  使用 `edit` 工具精确替换：
  - oldString: `你由通义千问多模态模型（qwen-vl-plus）驱动`
  - newString: `你由多模态模型驱动`

  > ⚠️ `.opencode/agents/vision.md` 为 Agent 部署定义文件，修改后不影响构建产物（template-loader.ts 由 build.js 从 templates-data/ 生成），但需保持内容与 zh-CN 源模板一致。

- [ ] Step 4：运行 `npm run build`，确认构建成功，template-loader.ts 中 vision 模板自动更新

## 产出文件

- `src/core/templates-data/agents/zh-CN/vision.md`（修改，1 行）
- `src/core/templates-data/agents/en/vision.md`（修改，1 行）
- `.opencode/agents/vision.md`（修改，1 行）
- `src/core/template-loader.ts`（构建后自动更新，由 build.js 注入）

## 自测清单

- [ ] 中文 Vision 模板第 13 行不再包含 `通义千问` 或 `qwen-vl-plus`
- [ ] 英文 Vision 模板第 13 行不再包含 `Qwen-VL-Plus`
- [ ] `.opencode/agents/vision.md` 第 13 行与 zh-CN 源模板一致
- [ ] `npm run build` 退出码 0
- [ ] 构建后 template-loader.ts 中 vision 模板内容已同步更新
