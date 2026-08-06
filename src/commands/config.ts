/**
 * config 命令注册
 * openfeel config get-lang        — 显示全局默认语言
 * openfeel config set-lang <v>    — 修改全局默认语言
 * openfeel config list-projects   — 列出项目路径→语言映射
 * openfeel config get [key] [--global] — 读取项目/全局配置项
 * openfeel config set <key> <value> [--global] — 写入项目/全局配置项
 */
import { Command } from 'commander';
import { getGlobalConfig, setGlobalConfig } from '../core/workspace/identity.js';
import { getConfigValue, setConfigValue, readProfile, writeProfile, ProfileSchema } from '../core/config.js';
import { t, getCliLang } from '../core/i18n.js';
import type { Profile } from '../core/config.js';

/** 全局配置 key 白名单：key → 合法值列表（null 表示任意 string） */
const GLOBAL_ALLOWED_KEYS: Record<string, string[] | null> = {
  'user.name': null,
  'user.lang': ['zh-CN', 'en'],
  'preferences.auto_advance': ['enabled', 'disabled'],
  'preferences.review_mode': ['full', 'skip_small_changes'],
  'preferences.communication': ['concise', 'detailed'],
  'preferences.confirm_threshold': ['low', 'medium', 'high'],
};

/**
 * 从对象中按点分隔路径深层取值
 * @param obj 目标对象
 * @param path 点分隔路径，如 'user.name'
 * @returns 路径对应的值；路径不存在时返回 undefined
 */
function getNestedValue(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * 向对象按点分隔路径写入值，中间层级不存在时自动创建
 * @param obj 目标对象（原地修改）
 * @param path 点分隔路径，如 'user.lang'
 * @param value 要写入的值
 */
function setNestedValue(obj: Record<string, unknown>, path: string, value: string): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    // 中间层级缺失或类型错误时创建空对象
    if (typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  // 设置末层值
  current[keys[keys.length - 1]] = value;
}

/**
 * 注册 config 命令组到主程序
 * @param program Commander 主程序实例
 */
export function registerConfigCommand(program: Command): void {
  const configCmd = program.command('config');

  // openfeel config get-lang — 显示全局默认语言
  configCmd
    .command('get-lang')
    .description(t('config.get.lang'))
    .action(() => {
      const lang = getCliLang(process.cwd());
      const config = getGlobalConfig();
      console.log(t('config.get.lang', lang, { lang: config.lang }));
    });

  // openfeel config set-lang <lang> — 修改全局默认语言
  configCmd
    .command('set-lang <lang>')
    .description('修改全局默认语言 (zh-CN 或 en)')
    .action((lang: string) => {
      const cliLang = getCliLang(process.cwd());
      if (lang !== 'zh-CN' && lang !== 'en') {
        console.error(t('config.set.invalidLang', cliLang, { val: lang }));
        process.exit(1);
      }
      const config = getGlobalConfig();
      config.lang = lang;
      setGlobalConfig(config);
      console.log(t('config.set.ok', cliLang, { lang }));
    });

  // openfeel config list-projects — 列出项目路径→语言映射
  configCmd
    .command('list-projects')
    .description('列出所有已记录的项目路径→语言映射')
    .action(() => {
      const lang = getCliLang(process.cwd());
      const config = getGlobalConfig();
      const entries = Object.entries(config.projects);
      console.log(t('config.list.title', lang));
      if (entries.length === 0) {
        console.log(t('config.list.empty', lang));
        return;
      }
      for (const [path, projLang] of entries) {
        console.log(t('config.list.item', lang, { path, lang: projLang }));
      }
    });

  // openfeel config get <key> — 读取项目配置项；--global 时操作全局 profile
  configCmd
    .command('get [key]')
    .description(t('help.config.get'))
    .option('-g, --global', '操作全局 profile（~/.config/openfeel/profile.yaml）')
    .action(function (key: string | undefined) {
      const opts = this.opts() as { global?: boolean };
      const lang = getCliLang(process.cwd());

      // 全局模式：操作 ~/.config/openfeel/profile.yaml
      if (opts.global) {
        const profile = readProfile() as unknown as Record<string, unknown>;
        // 无 key：输出完整 Profile
        if (!key) {
          console.log(t('config.get.globalResult', lang, { key: 'user.name', value: String(getNestedValue(profile, 'user.name') ?? '') }));
          console.log(t('config.get.globalResult', lang, { key: 'user.lang', value: String(getNestedValue(profile, 'user.lang') ?? '') }));
          console.log(t('config.get.globalResult', lang, { key: 'preferences.auto_advance', value: String(getNestedValue(profile, 'preferences.auto_advance') ?? '') }));
          console.log(t('config.get.globalResult', lang, { key: 'preferences.review_mode', value: String(getNestedValue(profile, 'preferences.review_mode') ?? '') }));
          console.log(t('config.get.globalResult', lang, { key: 'preferences.communication', value: String(getNestedValue(profile, 'preferences.communication') ?? '') }));
          console.log(t('config.get.globalResult', lang, { key: 'preferences.confirm_threshold', value: String(getNestedValue(profile, 'preferences.confirm_threshold') ?? '') }));
          return;
        }
        // 有 key：深层取值
        const value = getNestedValue(profile, key);
        if (value === undefined) {
          console.log(t('config.get.globalKeyNotFound', lang, { key }));
        } else {
          console.log(t('config.get.globalResult', lang, { key, value: String(value) }));
        }
        return;
      }

      // 项目模式（原行为）：key 必填
      if (!key) {
        console.error(t('config.get.noProject', lang, { err: 'key 未指定（项目模式下必须提供 key）' }));
        process.exit(1);
      }
      try {
        const value = getConfigValue(process.cwd(), key);
        if (value === null) {
          console.log(t('config.get.result', lang, { key, value: t('common.noConfig', lang) }));
        } else {
          console.log(t('config.get.result', lang, { key, value }));
        }
      } catch (err) {
        // 读取 config.yaml 失败（YAML 语法错误、权限问题等），输出实际错误原因
        console.error(t('config.get.noProject', lang, { err: (err as Error).message }));
        process.exit(1);
      }
    });

  // openfeel config set <key> <value> — 写入项目配置项；--global 时操作全局 profile
  configCmd
    .command('set <key> <value>')
    .description(t('help.config.set'))
    .option('-g, --global', '操作全局 profile（~/.config/openfeel/profile.yaml）')
    .action(function (key: string, value: string) {
      const opts = this.opts() as { global?: boolean };
      const lang = getCliLang(process.cwd());

      // 全局模式：操作 ~/.config/openfeel/profile.yaml
      if (opts.global) {
        // key 白名单校验
        if (!(key in GLOBAL_ALLOWED_KEYS)) {
          console.error(t('config.set.globalInvalidKey', lang, { val: key }));
          console.error(t('config.set.globalAllowedKeys', lang, { keys: Object.keys(GLOBAL_ALLOWED_KEYS).join(', ') }));
          process.exit(1);
        }
        // value 合法性校验
        const allowedValues = GLOBAL_ALLOWED_KEYS[key];
        if (allowedValues && !allowedValues.includes(value)) {
          console.error(t('config.set.globalInvalidValue', lang, { val: value, key, values: allowedValues.join(', ') }));
          process.exit(1);
        }

        try {
          // 读取 → 修改 → Zod 全量校验 → 写回
          const profile = readProfile();
          const profileObj = profile as unknown as Record<string, unknown>;
          setNestedValue(profileObj, key, value);
          const validated = ProfileSchema.parse(profileObj) as Profile;
          writeProfile(validated);
          console.log(t('config.set.globalValueOk', lang, { key, value }));
        } catch (err) {
          // 写入 profile.yaml 失败（YAML 语法错误、权限问题等），输出实际错误原因
          console.error(t('config.set.error', lang, { err: (err as Error).message }));
          process.exit(1);
        }
        return;
      }

      // 项目模式（原行为）
      const allowedKeys = ['auto_advance'];
      if (!allowedKeys.includes(key)) {
        console.error(t('config.set.invalidKey', lang, { val: key, keys: allowedKeys.join(', ') }));
        process.exit(1);
      }

      // value 白名单校验
      if (key === 'auto_advance' && !['enabled', 'disabled'].includes(value)) {
        console.error(t('config.set.invalidValue', lang, { val: value, key, values: 'enabled, disabled' }));
        process.exit(1);
      }

      try {
        setConfigValue(process.cwd(), key, value);
        console.log(t('config.set.valueOk', lang, { key, value }));
      } catch (err) {
        // 写入 config.yaml 失败（YAML 语法错误、权限问题等），输出实际错误原因
        console.error(t('config.set.error', lang, { err: (err as Error).message }));
        process.exit(1);
      }
    });
}
