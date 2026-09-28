/**
 * migrate 命令注册
 * openfeel migrate [path]               — 执行 legacy 布局迁移
 * openfeel migrate [path] --dry-run     — 预览迁移计划
 * openfeel migrate [path] --remap-assignee — 可选改写 flow.json 旧 assignee
 * openfeel migrate rollback [--dry-run] — 回滚最近一次迁移
 */
import { Command } from 'commander';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { migrateProject, rollbackMigration, previewRollback, type MigrateResult } from '../core/migrate.js';
import { t, getCliLang } from '../core/i18n.js';

export function registerMigrateCommand(program: Command): void {
  const migrate = program
    .command('migrate [path]')
    .description('Legacy 布局迁移（检测/备份/迁移/回滚存量项目旧布局，与 flow migrate 不同域）')
    .option('--dry-run', '仅检测预览，不写盘')
    .option('--remap-assignee', '改写 flow.json 旧 assignee 为新名（默认仅报告不改写）')
    .option('--clean-global-core-md', '删除已废弃的全局 core.md（opencode 适配器：~/.config/opencode/openfeel/core.md）')
    .action((path?: string, options?: { dryRun?: boolean; remapAssignee?: boolean; cleanGlobalCoreMd?: boolean }) => {
      const targetPath = resolve(path ?? process.cwd());
      const lang = getCliLang(targetPath);
      if (!existsSync(targetPath)) { console.error(t('migrate.error.pathNotExist', lang, { path: targetPath })); process.exit(1); }
      // REV-1404：任一步迁移失败时输出「可 rollback 回滚」提示，避免未捕获堆栈直接外泄。
      try {
        const result = migrateProject(targetPath, { dryRun: options?.dryRun, remapAssignee: options?.remapAssignee, lang, cleanGlobalCoreMd: options?.cleanGlobalCoreMd });
        printMigrateReport(result, options?.dryRun ?? false, lang);
      } catch (err) {
        console.error(t('migrate.error.aborted', lang, { message: (err as Error).message }));
        process.exit(1);
      }
    });

  migrate
    .command('rollback')
    .description('回滚最近一次迁移')
    .option('--dry-run', '仅预览回滚计划')
    .action((options: { dryRun?: boolean }, command: Command) => {
      const targetPath = resolve(process.cwd());
      const lang = getCliLang(targetPath);
      // commander 在「可选位置参数 + 子命令」下会把 --dry-run 挂到父 migrate 命令，
      // 故回退读取父命令 opts（否则 dry-run 失效）
      const dryRun = options?.dryRun ?? (command?.parent?.opts()?.dryRun as boolean | undefined) ?? false;
      if (dryRun) {
        // REV-1309：dry-run 读取最新 manifest 输出 entries 预览（source + op 类型），不写盘
        console.log(t('migrate.rollback.dryRunTitle', lang));
        try {
          const entries = previewRollback(targetPath);
          for (const e of entries) console.log(`  [${e.op}] ${e.source}`);
        } catch (err) {
          console.error(t('migrate.rollback.failed', lang, { message: (err as Error).message }));
          process.exit(1);
        }
        return;
      }
      try {
        const r = rollbackMigration(targetPath);
        console.log(t('migrate.rollback.done', lang));
        for (const p of r.restored) console.log(`  ↺ ${p}`);
      } catch (err) {
        console.error(t('migrate.rollback.failed', lang, { message: (err as Error).message }));
        process.exit(1);
      }
    });
}

function printMigrateReport(result: MigrateResult, dryRun: boolean, lang: 'zh-CN' | 'en'): void {
  // 兼容过渡提示（v1.1.1）：无论是否 legacy 均输出（全局旧 core.md / 存量项目 AGENTS.md）
  if (result.deprecated.globalCoreMdExists) {
    console.log(t('migrate.deprecated.globalCoreMd', lang));
    console.log(t('migrate.deprecated.globalCoreMdHint', lang));
  }
  if (result.deprecated.projectAgentsMdExists) {
    console.log(t('migrate.deprecated.projectAgentsMd', lang));
  }
  // 已最新
  if (!result.legacy.isLegacy) { console.log(t('migrate.legacy.alreadyLatest', lang)); return; }
  if (dryRun) console.log(t('migrate.detect.dryRunTitle', lang));
  // 检测报告
  const l = result.legacy;
  console.log(t('migrate.detect.title', lang));
  console.log(`  ① agents: ${l.projectOpendirAgents}  ② skills: ${l.projectOpendirSkills}  ③ instructions: ${l.projectOpendirInstructions}`);
  console.log(`  ④ jsonc skills/instructions: ${l.legacyJsoncSkillsMapping}/${l.legacyJsoncInstructions}  ⑤ mixed state: ${l.mixedUpdateState}`);
  // 清理 / 保留
  for (const p of result.cleaned) console.log(`  ✗ ${p}`);
  for (const p of result.keptCustom) console.log(`  ↺ ${p} ${t('migrate.clean.keptCustom', lang)}`);
  // assignee 报告
  if (result.assigneeReport.length > 0) {
    console.log(t('migrate.assignee.title', lang));
    for (const a of result.assigneeReport) console.log(`  ${a.oldName} → ${a.newName} (${a.count})`);
    if (!result.remapped) console.log(t('migrate.assignee.hint', lang));
  }
  if (dryRun) console.log(t('migrate.detect.dryRunNote', lang));
  else { console.log(t('migrate.legacy.done', lang)); console.log(t('migrate.backup.dirTmpl', lang, { dir: result.backupDir ?? '' })); }
}
