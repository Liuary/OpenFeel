# OpenFeel — AI Agent 开发流程治理 CLI

[English](README.en.md) | [更新日志](CHANGELOG.md) | [npm](https://www.npmjs.com/package/openfeel)

> ⚡ **支持平台**：opencode ｜ **默认模型**：DeepSeek（主力推理）+ GLM（交叉审查）+ Alibaba-CN（多模态）

OpenFeel 是一个 TypeScript CLI 工具，为 AI Agent 开发提供端到端的流程治理。核心理念：**「提示词瘦身，流程入工具」** —— Agent 不靠读长文本理解流程，而是通过 `flow.json` 获取当前状态和下一步指令。

> 📌 本项目基于 [AI_Prompt](https://github.com/Liuary/AI_Prompt) 开发，参考了 [OpenSpec](https://github.com/Fission-AI/OpenSpec) 等工具的设计思路。

---

## 快速开始

```bash
npm install -g openfeel        # 安装（Node ≥ 20）
openfeel init ./my-project     # 初始化新项目
openfeel update                # 已有项目？一键部署平台适配器
openfeel flow status           # 查看流水线

npm install -g openfeel@latest # 更新到最新版本
```

> 💡 `init` 用于新项目首次部署，`update` 为已有项目增量更新（适用于 `init` 之后再引入 OpenFeel 的项目）。

完整中文文档：[README.zh-CN.md](README.zh-CN.md)
