/**
 * i18n 类型定义
 *
 * 提供 I18nEntry 和 I18nDomain 类型，供 zh-CN.ts / en.ts 使用。
 */

/** 单条 i18n 字符串条目 */
export interface I18nEntry {
  key: string;  // 语义化 key，如 "flow.status.globalStatus"
  zh: string;   // 中文值
  en: string;   // 英文值
}

/** 按功能域组织的 i18n 数据 */
export type I18nDomain = Record<string, I18nEntry>;

/** 合法的语言值列表 */
export const VALID_LANGS = ['zh-CN', 'en'] as const;

/** 支持的语言类型 */
export type SupportedLang = typeof VALID_LANGS[number];
