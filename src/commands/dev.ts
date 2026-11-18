/**
 * dev 命令（v1.5.0）— 状态记录瘦身
 *
 * - `openfeel dev sync`：立即写一次简要状态块（CLI 维护 AUTO 块 + `.sync.json`）
 * - `openfeel dev status`：只读显示是否到期（默认 30 分钟）
 * - `openfeel dev clean`：运行态文件不入库（v1.5.23 / REQ-041；幂等，不删工作区文件）
 *
 * 无 `--json`（零 JSON 契约变更）；读写均不触碰 dev_last 的手写内容。
 * 例外：`dev clean --json` 提供机器可读结果（新增子命令，不影响既有契约）。
 */
import { Command } from 'commander';
import { getDevStatus, syncDevStatus } from '../core/dev-status.js';
import { ensureRuntimeIgnoreEntries, isGitRepository, removeLegacyDevFiles, untrackRuntimeFiles } from '../core/repo-hygiene.js';
import { FlowManager } from '../core/flow-manager.js';
import { t, getCliLang } from '../core/i18n.js';
import { emitJson, withSchemaVersion } from './shared/json-output.js';

export function registerDevCommand(program: Command): void {
  const dev = program
    .command('dev')
    .description('开发状态记录（v1.5.0：仅 Feel 维护；CLI 负责简要状态块）');

  dev
    .command('sync')
    .description('立即写入简要状态块（dev_last AUTO 块 + .sync.json）')
    .action(() => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      if (!new FlowManager(projectPath).isLoaded()) {
        console.error(t('common.errorNoInit', lang));
        process.exit(1);
        return;
      }
      const result = syncDevStatus(projectPath, {});
      console.log(t('flow.dev.syncedTmpl', lang, {
        file: result.file,
        syncAt: result.syncedAt,
        interval: String(result.status.intervalMinutes),
      }));
    });

  dev
    .command('status')
    .description('查看状态同步状态（只读）')
    .action(() => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      if (!new FlowManager(projectPath).isLoaded()) {
        console.error(t('common.errorNoInit', lang));
        process.exit(1);
        return;
      }
      const status = getDevStatus(projectPath);
      const stage = status.stage === null ? t('common.none', lang) : `${status.stage} / ${status.phase ?? '?'}`;
      console.log(t('flow.dev.statusStageTmpl', lang, { stage }));
      console.log(t('flow.dev.statusLastSyncTmpl', lang, {
        lastSync: status.lastSync ?? t('common.none', lang),
        interval: String(status.intervalMinutes),
      }));
      console.log(t(status.due ? 'flow.dev.statusDueTmpl' : 'flow.dev.statusOkTmpl', lang, { interval: String(status.intervalMinutes) }));
    });

  dev
    .command('clean')
    .description('运行态文件不入库：补 .gitignore + 从 git 索引移除已跟踪的运行态文件（不删工作区文件）')
    .option('--dry-run', '只显示将要处理的项（零写盘、零索引改动）')
    .option('--legacy', '同时清理历史遗留文件（task_claim.md / todo-current.md；v1.5.24）')
    .option('--include-archive', '与 --legacy 同用：再清理 current_archive/*.md 旧轮换归档')
    .option('--json', '以 JSON 输出 { schemaVersion, gitRepository, gitignore, removed, dryRun, legacy }')
    .action((options: { dryRun?: boolean; legacy?: boolean; includeArchive?: boolean; json?: boolean }) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      if (!new FlowManager(projectPath).isLoaded()) {
        console.error(t('common.errorNoInit', lang));
        process.exit(1);
        return;
      }
      const dryRun = options.dryRun === true;
      const gitRepo = isGitRepository(projectPath);
      const ignore = ensureRuntimeIgnoreEntries(projectPath, { dryRun });
      const untracked = gitRepo
        ? untrackRuntimeFiles(projectPath, { dryRun })
        : { files: [] as string[], dryRun, applied: false };
      const legacy = options.legacy === true || options.includeArchive === true
        ? removeLegacyDevFiles(projectPath, { dryRun, includeArchive: options.includeArchive === true })
        : null;

      if (options.json === true) {
        emitJson(withSchemaVersion({
          gitRepository: gitRepo,
          gitignore: { file: ignore.file, added: ignore.added },
          removed: untracked.files,
          dryRun,
          legacy: legacy === null ? null : { removed: legacy.files },
        }));
        return;
      }

      console.log(t('flow.dev.cleanOkTmpl', lang));
      console.log(t('flow.dev.cleanGitignoreTmpl', lang, {
        file: ignore.file,
        entries: ignore.added.length > 0 ? ignore.added.join(', ') : t('flow.dev.cleanNone', lang),
      }));
      if (!gitRepo) {
        console.log(t('flow.dev.cleanNotGitWarnTmpl', lang));
      } else {
        console.log(t('flow.dev.cleanUntrackedTmpl', lang, {
          files: untracked.files.length > 0 ? untracked.files.join(', ') : t('flow.dev.cleanNone', lang),
        }));
      }
      if (dryRun) {
        console.log(t('flow.dev.cleanDryRunTmpl', lang));
      }
      if (legacy !== null) {
        console.log(t('flow.dev.cleanLegacyTmpl', lang, {
          files: legacy.files.length > 0 ? legacy.files.join(', ') : t('flow.dev.cleanNone', lang),
        }));
      }
    });
}
