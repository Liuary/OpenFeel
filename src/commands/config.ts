/**
 * config 命令注册
 * openfeel config get-lang        — 显示全局默认语言
 * openfeel config set-lang <v>    — 修改全局默认语言
 * openfeel config list-projects   — 列出项目路径→语言映射
 */
import { Command } from 'commander';
import { getGlobalConfig, setGlobalConfig } from '../core/workspace/identity.js';
import { getConfigValue, setConfigValue } from '../core/config.js';
import { t, getCliLang } from '../core/i18n.js';

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

  // openfeel config get <key> — 读取项目配置项
  configCmd
    .command('get <key>')
    .description(t('help.config.get'))
    .action((key: string) => {
      const lang = getCliLang(process.cwd());
      try {
        const value = getConfigValue(process.cwd(), key);
        if (value === null) {
          console.log(t('config.get.result', lang, { key, value: t('common.noConfig', lang) }));
        } else {
          console.log(t('config.get.result', lang, { key, value }));
        }
      } catch {
        console.error(t('config.set.noProject', lang));
        process.exit(1);
      }
    });

  // openfeel config set <key> <value> — 写入项目配置项
  configCmd
    .command('set <key> <value>')
    .description(t('help.config.set'))
    .action((key: string, value: string) => {
      const lang = getCliLang(process.cwd());

      // key 白名单校验
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
        // 不存在 config.yaml 时提示 init
        console.error(t('config.set.noProject', lang));
        process.exit(1);
      }
    });
}
