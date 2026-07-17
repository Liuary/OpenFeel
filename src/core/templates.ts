/**
 * init 命令用模板文件
 * 提供 dev_core.md、current.md、instructions/core.md 的默认模板内容。
 */

/** 中文版 dev_core.md 模板 */
const DEV_CORE_TEMPLATE_ZH = `# 动态规则
> 使用 [+] / [-] 标记管理启用/禁用状态。只能标记禁用不能删除。
`;

/** 英文版 dev_core.md 模板 */
const DEV_CORE_TEMPLATE_EN = `# Dynamic Rules
> Use [+] / [-] markers to manage enabled/disabled status. Only disable, do not delete.
`;

/** 中文版 current.md 模板 */
const CURRENT_TEMPLATE_ZH = `# 当前工作进度

> 总进度：初始化完成，等待计划创建。

## 团队成员进度

暂无活跃成员。
`;

/** 英文版 current.md 模板 */
const CURRENT_TEMPLATE_EN = `# Current Progress

> Overall progress: Initialization complete, waiting for plan creation.

## Team Member Progress

No active members yet.
`;

/**
 * 根据语言返回 dev_core.md 模板
 * @param lang 语言，'zh-CN' 或 'en'
 */
export function getDevCoreTemplate(lang: 'zh-CN' | 'en'): string {
  return lang === 'en' ? DEV_CORE_TEMPLATE_EN : DEV_CORE_TEMPLATE_ZH;
}

/**
 * 根据语言返回 current.md 模板
 * @param lang 语言，'zh-CN' 或 'en'
 */
export function getCurrentTemplate(lang: 'zh-CN' | 'en'): string {
  return lang === 'en' ? CURRENT_TEMPLATE_EN : CURRENT_TEMPLATE_ZH;
}

// 向后兼容导出（默认中文）
export const DEV_CORE_TEMPLATE = DEV_CORE_TEMPLATE_ZH;
export const CURRENT_TEMPLATE = CURRENT_TEMPLATE_ZH;

// 以下常量已由 template-loader.ts 统一管理，此处保留 re-export 以兼容现有消费方
export { CORE_INSTRUCTIONS_TEMPLATE_B64, AGENTS_MD_TEMPLATE } from './template-loader.js';
