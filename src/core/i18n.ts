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

import { getLang, getGlobalConfig } from './workspace/identity.js';

// 导入所有 i18n 域
import { common as zhCommon, flow as zhFlow, init as zhInit, update as zhUpdate,
         project as zhProject, stage as zhStage, plan as zhPlan, knowledge as zhKnowledge,
         archive as zhArchive, roadmap as zhRoadmap, view as zhView, instructions as zhInstructions,
         config as zhConfig }
  from './i18n-data/zh-CN.js';
import { common as enCommon, flow as enFlow, init as enInit, update as enUpdate,
         project as enProject, stage as enStage, plan as enPlan, knowledge as enKnowledge,
         archive as enArchive, roadmap as enRoadmap, view as enView, instructions as enInstructions,
         config as enConfig }
  from './i18n-data/en.js';

import { VALID_LANGS, type SupportedLang } from './i18n-data/types.js';
// 向后兼容：i18n.ts 仍可导入 VALID_LANGS / SupportedLang
export { VALID_LANGS, type SupportedLang };

/** 域导入数组类型 */
type DomainImport = Record<string, { key: string; zh: string; en: string }>;

/** 所有域的列表（zh-CN） */
const zhDomains: DomainImport[] = [
  zhCommon, zhFlow, zhInit, zhUpdate, zhProject,
  zhStage, zhPlan, zhKnowledge, zhArchive, zhRoadmap, zhView, zhInstructions, zhConfig,
];

/** 所有域的列表（en） */
const enDomains: DomainImport[] = [
  enCommon, enFlow, enInit, enUpdate, enProject,
  enStage, enPlan, enKnowledge, enArchive, enRoadmap, enView, enInstructions, enConfig,
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
  const globalConfig = getGlobalConfig();
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
