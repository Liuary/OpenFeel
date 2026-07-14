/**
 * init 命令用模板文件
 * 提供 dev_core.md、current.md、instructions/core.md 的默认模板内容。
 */

/** .openfeel/dev/dev_core.md 模板 */
export const DEV_CORE_TEMPLATE = `# 动态规则
> 使用 [+] / [-] 标记管理启用/禁用状态。只能标记禁用不能删除。
`;

/** .openfeel/dev/current.md 模板 */
export const CURRENT_TEMPLATE = `# 当前工作进度

> 总进度：初始化完成，等待计划创建。

## 团队成员进度

暂无活跃成员。
`;

// 以下常量已由 template-loader.ts 统一管理，此处保留 re-export 以兼容现有消费方
export { CORE_INSTRUCTIONS_TEMPLATE_B64, AGENTS_MD_TEMPLATE } from './template-loader.js';
