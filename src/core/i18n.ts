/**
 * i18n 运行时引擎
 *
 * 提供运行时字符串查表函数 `t(key, lang?, vars?)` 和项目级语言解析函数 `getCliLang(projectPath)`。
 * 与 template-loader.ts 的「运行时按键查表」模式对齐，但更轻量：TS 常量直接导入，零构建脚本。
 *
 * ## 使用示例
 *
 * ```typescript
 * import { t, getCliLang } from './i18n.js';
 *
 * // 获取 CLI 语言
 * const lang = getCliLang(projectPath);
 *
 * // 查表
 * console.log(t('flow.status.currentStage', lang));
 * console.log(t('flow.advance.okTmpl', lang, { stage: 'stage-01', to: 'done' }));
 * ```
 */

import { getLang } from './workspace/identity.js';

// 动态导入 getGlobalConfig（op-003 实现，运行时通过 require 获取）
// 使用延迟动态导入以避免循环依赖
let _getGlobalConfig: (() => { lang: string; projects: Record<string, string> }) | null = null;

/** 获取 getGlobalConfig 函数的延迟引用 */
function lazyGetGlobalConfig(): { lang: string; projects: Record<string, string> } {
  if (!_getGlobalConfig) {
    try {
      // 动态导入 op-003 的 identity.ts 扩展
      const identity = require('./workspace/identity.js') as typeof import('./workspace/identity.js') & {
        getGlobalConfig?: () => { lang: string; projects: Record<string, string> };
      };
      _getGlobalConfig = identity.getGlobalConfig ?? (() => ({ lang: 'zh-CN', projects: {} }));
    } catch {
      // fallback：如果 getGlobalConfig 尚未实现，返回默认值
      _getGlobalConfig = () => ({ lang: 'zh-CN', projects: {} });
    }
  }
  return _getGlobalConfig!();
}

// 导入所有 i18n 域
import { common as zhCommon, flow as zhFlow, init as zhInit, update as zhUpdate,
         project as zhProject, stage as zhStage, plan as zhPlan, knowledge as zhKnowledge,
         archive as zhArchive, roadmap as zhRoadmap, view as zhView, instructions as zhInstructions }
  from './i18n-data/zh-CN.js';
import { common as enCommon, flow as enFlow, init as enInit, update as enUpdate,
         project as enProject, stage as enStage, plan as enPlan, knowledge as enKnowledge,
         archive as enArchive, roadmap as enRoadmap, view as enView, instructions as enInstructions }
  from './i18n-data/en.js';

/** 合法的语言值列表 */
export const VALID_LANGS = ['zh-CN', 'en'] as const;

/** 支持的语言类型 */
export type SupportedLang = typeof VALID_LANGS[number];

/** 域导入数组类型 */
type DomainImport = Record<string, { key: string; zh: string; en: string }>;

/** 所有域的列表（zh-CN） */
const zhDomains: DomainImport[] = [
  zhCommon, zhFlow, zhInit, zhUpdate, zhProject,
  zhStage, zhPlan, zhKnowledge, zhArchive, zhRoadmap, zhView, zhInstructions,
];

/** 所有域的列表（en） */
const enDomains: DomainImport[] = [
  enCommon, enFlow, enInit, enUpdate, enProject,
  enStage, enPlan, enKnowledge, enArchive, enRoadmap, enView, enInstructions,
];

/** 语言→字符串映射表（模块级缓存，惰性初始化） */
const stringMaps: Record<string, Map<string, string>> = {};

/**
 * 构建指定语言的字符串映射表。
 * @param domains 域列表
 * @param lang 语言标识（用于明确选取对应字段）
 * @returns Map<string, string> 键→本地化字符串
 */
function buildMap(domains: DomainImport[], lang: string): Map<string, string> {
  const map = new Map<string, string>();
  // 按 lang 明确选取对应字段，en 模式下不依赖 zh 为空的副效应
  const field = lang === 'en' ? ('en' as const) : ('zh' as const);
  for (const domain of domains) {
    for (const entry of Object.values(domain)) {
      map.set(entry.key, entry[field]);
    }
  }
  return map;
}

/**
 * 获取指定语言的字符串映射表（惰性构建）。
 * @param lang 语言标识
 * @returns Map<string, string>
 */
function getStringMap(lang: string): Map<string, string> {
  if (!stringMaps[lang]) {
    if (lang === 'zh-CN') {
      stringMaps[lang] = buildMap(zhDomains, lang);
    } else if (lang === 'en') {
      stringMaps[lang] = buildMap(enDomains, lang);
    } else {
      // 未知语言回退到 zh-CN
      stringMaps[lang] = buildMap(zhDomains, lang);
    }
  }
  return stringMaps[lang];
}

/**
 * 按语言和键名查表返回本地化字符串。
 * 支持变量插值：值中的 `{varName}` 会被 vars 中的对应值替换。
 *
 * @param key   i18n 键名，如 "flow.status.currentStage"
 * @param lang  语言标识（'zh-CN' | 'en'），默认 'zh-CN'
 * @param vars  变量替换映射表（可选）
 * @returns     本地化后的字符串。缺失时返回 `key` 本身并输出警告。
 */
export function t(key: string, lang: string = 'zh-CN', vars?: Record<string, string>): string {
  // 1. 获取 lang 对应的字符串映射表
  const map = getStringMap(lang);

  // 2. 查表
  if (map.has(key)) {
    let value = map.get(key)!;
    // 3. 变量插值
    if (vars) {
      value = value.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? `{${name}}`);
    }
    return value;
  }

  // 4. 缺失 key：回退到 zh-CN 再查一次
  console.warn(`[i18n] Missing key: "${key}" for lang="${lang}"`);
  if (lang !== 'zh-CN') {
    const fallbackMap = getStringMap('zh-CN');
    if (fallbackMap.has(key)) {
      let value = fallbackMap.get(key)!;
      if (vars) {
        value = value.replace(/\{(\w+)\}/g, (_, name: string) => vars[name] ?? `{${name}}`);
      }
      return value;
    }
  }

  // 5. 仍缺失 → 返回原始 key
  return key;
}

/**
 * 获取 CLI 输出应使用的语言。
 * 优先级：项目 .info.json lang > 全局 ~/.openfeel/config.json lang > 默认 'zh-CN'
 *
 * @param projectPath 项目根路径
 * @returns 'zh-CN' | 'en'
 */
export function getCliLang(projectPath: string): 'zh-CN' | 'en' {
  // 1. 读取项目配置
  const projectLang = getLang(projectPath);

  // 2. 读取全局配置
  const globalConfig = lazyGetGlobalConfig();
  const globalLang = globalConfig.lang;

  // 3. 优先级合并：项目 lang > 全局 lang > 默认 'zh-CN'
  if (projectLang && VALID_LANGS.includes(projectLang as SupportedLang)) {
    return projectLang as 'zh-CN' | 'en';
  }

  if (globalLang && VALID_LANGS.includes(globalLang as SupportedLang)) {
    return globalLang as 'zh-CN' | 'en';
  }

  // 4. 兜底回退
  return 'zh-CN';
}
