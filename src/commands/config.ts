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
import { getConfigValue, setConfigValue, readProfile, writeProfile, ProfileSchema, ConfigDefaultsSchema, getConfigFieldLegalValues, normalizeConfigKey, resolveConfigDefaults, STAGE_FIELD_BY_CONFIG_KEY } from '../core/config.js';
import { FlowManager } from '../core/flow-manager.js';
import { normalizeStageId, suggestStageId, isArchivedVersionOf } from '../core/plan/path.js';
import { t, getCliLang } from '../core/i18n.js';
import type { Profile } from '../core/config.js';
import { withSchemaVersion, emitJson } from './shared/json-output.js';
import { failRefusal } from './shared/errors.js';

/** 全局 profile 固定键序（人类输出顺序；JSON `values` 同序） */
const GLOBAL_PROFILE_KEYS = [
  'user.name',
  'user.lang',
  'preferences.auto_advance',
  'preferences.review_mode',
  'preferences.communication',
  'preferences.confirm_threshold',
] as const;

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
    // 原型链防护（T30）：命中危险键直接返回 undefined，避免穿透 __proto__/constructor
    if (key === '__proto__' || key === 'constructor' || key === 'prototype') {
      return undefined;
    }
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
  const configCmd = program.command('config')
    .description(t('config.desc', getCliLang(process.cwd())));

  // openfeel config get-lang — 显示全局默认语言
  configCmd
    .command('get-lang')
    .description(t('config.getLang.desc', getCliLang(process.cwd())))
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
    .option('--all', t('help.config.get.all', getCliLang(process.cwd())))
    .option('--json', t('help.config.get.json', getCliLang(process.cwd())))
    .action(function (key: string | undefined) {
      const opts = this.opts() as { global?: boolean; json?: boolean; all?: boolean };
      const asJson = opts.json === true;
      const lang = getCliLang(process.cwd());

      // --all 仅项目模式可用：冲突组合一律预期拒绝（零副作用）
      if (opts.all && opts.global) {
        failRefusal({
          code: 'INVALID_ARGUMENT',
          message: t('config.get.noProject', lang, { err: '--all 不能与 --global 组合（--all 仅项目模式）' }),
          detail: { reason: 'all-global-conflict' },
        });
        return;
      }
      if (opts.all && key !== undefined) {
        failRefusal({
          code: 'INVALID_ARGUMENT',
          message: t('config.get.noProject', lang, { err: '--all 不能与位置 key 组合' }),
          detail: { reason: 'all-with-key', key },
        });
        return;
      }

      // 全局模式：操作 ~/.config/openfeel/profile.yaml
      if (opts.global) {
        const profile = readProfile() as unknown as Record<string, unknown>;
        // 读路径解析失败：向 stderr 输出警告，仍按空值继续（T33，不改变退出码）
        const parseError = (profile as { parseError?: string }).parseError;
        if (parseError) {
          console.error(t('config.get.parseErrorWarn', lang, { path: parseError }));
        }
        // 无 key：输出完整 Profile
        if (!key) {
          if (asJson) {
            const values: Record<string, string | null> = {};
            for (const k of GLOBAL_PROFILE_KEYS) {
              const v = getNestedValue(profile, k);
              // 缺省值 JSON 用 null（人类显示空串；契约标注差异）
              values[k] = v === undefined ? null : String(v);
            }
            emitJson(withSchemaVersion({ scope: 'global', values }));
            return;
          }
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
        if (asJson) {
          emitJson(withSchemaVersion({
            scope: 'global',
            key,
            value: value === undefined ? null : String(value),
          }));
          return;
        }
        if (value === undefined) {
          console.log(t('config.get.globalKeyNotFound', lang, { key }));
        } else {
          console.log(t('config.get.globalResult', lang, { key, value: String(value) }));
        }
        return;
      }

      // 项目模式（原行为）：key 必填（--all 为全量读取的显式例外）
      if (!key) {
        if (opts.all) {
          // 一次取全量：键序固定，缺失/非法逐键回退 DEFAULT_CONFIG
          const resolved = resolveConfigDefaults(process.cwd());
          const defaults = {
            execution_mode: resolved.execution_mode,
            auto_advance: resolved.auto_advance,
            merge_mode: resolved.merge_mode,
            workflow_mode: resolved.workflow_mode,
          };
          if (asJson) {
            emitJson(withSchemaVersion({ scope: 'project', defaults }));
            return;
          }
          for (const k of ['execution_mode', 'auto_advance', 'merge_mode', 'workflow_mode'] as const) {
            console.log(t('config.get.result', lang, { key: k, value: defaults[k] }));
          }
          return;
        }
        // JSON 模式走 envelope（isJsonMode 单点判定）；人类模式逐字保持 exit 1
        failRefusal({
          code: 'INVALID_ARGUMENT',
          message: t('config.get.noProject', lang, { err: 'key 未指定（项目模式下必须提供 key）' }),
          detail: { reason: 'key-required' },
        });
        return;
      }
      try {
        // 键名归一：`defaults.X` 与 `X` 等价（输出回显用户输入原键以保留可识别性）
        const normalized = normalizeConfigKey(key);
        const value = getConfigValue(process.cwd(), normalized);
        if (asJson) {
          emitJson(withSchemaVersion({ scope: 'project', key, value }));
          return;
        }
        if (value === null) {
          console.log(t('config.get.result', lang, { key, value: t('common.noConfig', lang) }));
        } else {
          console.log(t('config.get.result', lang, { key, value }));
        }
      } catch (err) {
        // 读取 config.yaml 失败（YAML 语法错误、权限问题等），输出实际错误原因
        failRefusal({
          code: 'INVALID_ARGUMENT',
          message: t('config.get.noProject', lang, { err: (err as Error).message }),
          detail: { reason: 'config-unreadable' },
        });
        return;
      }
    });

  // openfeel config set <key> <value> — 写入项目配置项；--global 时操作全局 profile
  configCmd
    .command('set <key> <value>')
    .description(t('help.config.set'))
    .option('-g, --global', '操作全局 profile（~/.config/openfeel/profile.yaml）')
    .option('--sync-stages', '将配置值同步写入所有已注册阶段的 status.md 对应字段（仅项目模式）')
    .option('--stage <ids...>', '限定同步的阶段 ID 列表（仅与 --sync-stages 组合；空格或逗号分隔）')
    .action(function (key: string, value: string) {
      const opts = this.opts() as { global?: boolean; syncStages?: boolean; stage?: string[] };
      const lang = getCliLang(process.cwd());

      // --stage 仅可与 --sync-stages 组合（单独使用 → exit 1，防静默无效参数）
      if (opts.stage !== undefined && !opts.syncStages) {
        console.error(t('common.errorTmpl', lang, { msg: '--stage 仅可与 --sync-stages 组合使用' }));
        process.exit(1);
        return;
      }
      // --stage 仅项目模式可用（与 --global 组合 → exit 1）
      if (opts.global && opts.stage !== undefined) {
        console.error(t('common.errorTmpl', lang, { msg: '--stage 仅项目模式可用（不能与 --global 组合）' }));
        process.exit(1);
        return;
      }
      // --sync-stages 仅项目模式可用（与 --global 组合 → exit 1）
      if (opts.global && opts.syncStages) {
        console.error(t('common.errorTmpl', lang, { msg: '--sync-stages 仅项目模式可用（不能与 --global 组合）' }));
        process.exit(1);
        return;
      }

      // 全局模式：操作 ~/.config/openfeel/profile.yaml
      if (opts.global) {
        // key 白名单校验（Object.hasOwn 防原型链穿透，T30）
        if (!Object.hasOwn(GLOBAL_ALLOWED_KEYS, key)) {
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
          // 错误路径：profile.yaml 非法 → 拒绝覆盖（遗留 #8），提示用户先修复
          if (profile.parseError) {
            console.error(`[profile] ${profile.parseError}；已拒绝写入以避免覆盖现有文件，请先修复 profile.yaml`);
            process.exit(1);
            return; // 防御：process.exit 被 mock 时不再继续写回
          }
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
      // 键名归一：`defaults.X` 与 `X` 等价（单一来源 normalizeConfigKey）
      const normalizedKey = normalizeConfigKey(key);
      // 白名单 = ConfigDefaultsSchema 全量键（schema 驱动，schema 新增键自动纳入，T36/R3）
      const allowedKeys = Object.keys(ConfigDefaultsSchema.shape);
      if (!allowedKeys.includes(normalizedKey)) {
        // 错误文案回显支持键清单与 `defaults.` 等价说明（不新增 i18n 键）
        const keysHint = allowedKeys.map((k) => `${k}（或 defaults.${k}）`).join(', ');
        console.error(t('config.set.invalidKey', lang, { val: key, keys: keysHint }));
        process.exit(1);
        return;
      }

      // 取值校验 schema 驱动（枚举非法须报错且不写盘，T36/R3）
      const legalValues = getConfigFieldLegalValues(normalizedKey);
      if (legalValues && !legalValues.includes(value)) {
        console.error(t('config.set.invalidValue', lang, { val: value, key: normalizedKey, values: legalValues.join(', ') }));
        process.exit(1);
        return;
      }

      // 载体制约束：general 仅需求级合法（部署级写入面拒绝；位于全部写盘点之前 → 零写盘）
      if (normalizedKey === 'workflow_mode' && value === 'general') {
        console.error(t('common.generalOnlyRequirement', lang));
        process.exit(1);
        return;
      }

      // --stage 前置全量校验（D1：解析 → 归一 → 注册校验；任一失败 → exit 1 且 config.yaml/status.md 零写盘）
      let onlyStages: string[] | undefined;
      const downgraded: string[] = [];
      if (opts.syncStages && opts.stage !== undefined) {
        const projectPath = process.cwd();
        // 变长参数：空格 / 逗号两种写法（与 --deps 同款）
        const parsedIds = opts.stage
          .flatMap((s) => s.split(','))
          .map((s) => s.trim())
          .filter(Boolean);
        if (parsedIds.length === 0) {
          console.error(t('common.errorTmpl', lang, { msg: '--stage 需要至少一个阶段 ID' }));
          process.exit(1);
          return;
        }
        const normalizedIds = parsedIds.map((id) => normalizeStageId(id) ?? id);
        const fmCheck = new FlowManager(projectPath);
        const fmData = fmCheck.isLoaded() ? fmCheck.getData() : undefined;
        const knownSet = new Set(Object.keys(fmData?.stages ?? {}).map((k) => normalizeStageId(k) ?? k));
        // REV-80-003 裁定①：显式全名 ∧ 已归档 → 降级（仅 status.md、跳过 flow.json 冗余）；
        // 短名 / 未注册未归档 → 原路径 exit 1（逐字不变）
        const invalid = normalizedIds.filter((id, i) => {
          if (knownSet.has(id)) {
            return false; // 已注册优先（既有正例零回归）
          }
          if (isArchivedVersionOf(parsedIds[i], fmData?.meta?.archived_versions)) {
            // 恒传原值（防归一化产物误判，REV-80-001）
            downgraded.push(id);
            return false;
          }
          return true;
        });
        // 未注册且未归档（含 flow.json 未加载 → knownSet 为空 → 全部 invalid）→ 逐 id 报错 + 建议名
        if (invalid.length > 0) {
          for (const id of invalid) {
            console.error(t('common.stageIdInvalidTmpl', lang, { input: id }));
            console.error(t('common.stageIdSuggestTmpl', lang, { suggest: suggestStageId(projectPath, id) }));
          }
          process.exit(1);
          return;
        }
        // 归一化全名进入 onlyStages（含 off-set；经 syncConfigFieldToStages 循环可达）
        onlyStages = [...new Set(normalizedIds)];
      }

      try {
        setConfigValue(process.cwd(), normalizedKey, value);
        console.log(t('config.set.valueOk', lang, { key: normalizedKey, value }));
      } catch (err) {
        // 写入 config.yaml 失败（YAML 语法错误、权限问题等），输出实际错误原因
        console.error(t('config.set.error', lang, { err: (err as Error).message }));
        process.exit(1);
      }

      // 已归档目标降级 info（REV-80-003 裁定①）：setConfigValue 成功之后、--sync-stages 块之前
      if (downgraded.length > 0) {
        console.log(t('config.set.syncArchivedStageTmpl', lang, { stages: downgraded.join(', ') }));
      }

      // --sync-stages：将目标键批量同步到已注册阶段 status.md 对应字段（仅项目模式；--stage 可限定范围）
      if (opts.syncStages) {
        const field = STAGE_FIELD_BY_CONFIG_KEY[normalizedKey];
        const mgr = new FlowManager(process.cwd());
        const results = mgr.isLoaded() ? mgr.syncConfigFieldToStages(normalizedKey, value, { onlyStages }) : [];
        let updated = 0;
        let inserted = 0;
        let skipped = 0;
        for (const r of results) {
          switch (r.result) {
            case 'updated':
              updated++;
              console.log(t('stage.set.updatedTmpl', lang, { stageId: r.stage, field: field ?? normalizedKey, value }));
              break;
            case 'inserted':
              // 字段缺失 → 插入语义（与 stage set --workflow-mode 同口径；禁落 default 当错误输出）
              inserted++;
              console.log(t('stage.set.insertedTmpl', lang, { stageId: r.stage, field: field ?? normalizedKey, value }));
              break;
            case 'skipped-no-anchor':
              // 锚点缺失 → 跳过类（不写盘；复用 op-001 新键保持口径一致），退出码恒 0
              skipped++;
              console.error(t('stage.set.noAnchorTmpl', lang, { stageId: r.stage, field: field ?? normalizedKey }));
              break;
            case 'noop':
              skipped++;
              console.log(t('stage.set.noopTmpl', lang, { field: field ?? normalizedKey }));
              break;
            case 'skipped-no-status':
              skipped++;
              console.error(t('stage.errorStageNotFoundTmpl', lang, { stageId: r.stage }));
              break;
            default: // skipped-no-field
              skipped++;
              console.error(t('stage.set.errorFieldNotFoundTmpl', lang, { stageId: r.stage, field: field ?? normalizedKey }));
              break;
          }
        }
        // 汇总：同步 N / 插入 M / 跳过 K（跳过含 noop / 无字段 / 无 status / 无锚点；退出码保持 0）
        console.log(t('config.set.syncSummaryTmpl', lang, {
          updated: String(updated),
          inserted: String(inserted),
          skipped: String(skipped),
        }));
      }
    });

  // openfeel config effective [key] — 输出有效值 + 生效来源（P9）
  // 与 `config get`（原始值读取）语义不同：此处为级联解析结果（值 + 来源）。
  configCmd
    .command('effective [key]')
    .description(t('help.config.effective'))
    .option('--json', t('help.config.effective.json', getCliLang(process.cwd())))
    .action((key: string | undefined, options: { json?: boolean }) => {
      const lang = getCliLang(process.cwd());
      const mgr = new FlowManager(process.cwd());
      const resolved = mgr.resolveEffectiveConfig();
      const keys = Object.keys(resolved);

      if (key) {
        // 未知受管键：报错并退出（不静默）
        if (!resolved[key]) {
          failRefusal({
            code: 'INVALID_ARGUMENT',
            message: t('config.effective.unknownKey', lang, { key, keys: keys.join(', ') }),
            detail: { key, keys },
          });
          return;
        }
        const r = resolved[key];
        if (options.json) {
          emitJson(withSchemaVersion({ key, value: r.value, source: r.source }));
          return;
        }
        console.log(t('config.effective.row', lang, { key, value: r.value, source: r.source }));
        return;
      }

      // JSON 分支须为首行纯 JSON 单文档（键序 = EFFECTIVE_CONFIG_KEYS）
      if (options.json) {
        emitJson(withSchemaVersion({ effective: resolved }));
        return;
      }

      console.log(t('config.effective.title', lang));
      for (const k of keys) {
        const r = resolved[k];
        console.log(t('config.effective.row', lang, { key: k, value: r.value, source: r.source }));
      }
    });
}
