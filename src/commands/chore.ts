/**
 * chore 命令（v1.4.0）— 微变更通道
 *
 * 承认一类变更：单文件、无接口变化、可肉眼验证（UI 微调 / 文案 / 静态资源）。
 * 1 步开启写窗口，不写入 flow.json 的 stages，只留 log；到期或 `--end` 自动收口。
 *
 * 存储：`.openfeel/chore.json`（ephemeral；不是阶段实体）
 * 约束：存在任一 `phase != done` 的阶段时拒绝开启（不绕过在途阶段门禁）。
 *
 * v1.5.11 / D-126-03 收窄：
 * - 窗口上限硬定 30 分钟（默认 30）；`--ttl-min` 只允许把窗口改短（1..30 整数），
 *   越界 / 非整数 / ≤0 一律 exit 1 且**零写盘**，不允许 env/config 绕过。
 * - 默认窗口**不放行源码**（doc/asset 本就不需要 chore）；改源码必须显式
 *   `--source`。guard 侧读 `source_allowed`（缺省按 false），并要求人类在外部
 *   终端开启 —— 配合 guard 的 shell 门禁，chore 是**纯人类通道**。
 */
import { Command } from 'commander';
import { existsSync, readFileSync, unlinkSync } from 'node:fs';
import { resolve } from 'node:path';
import { FlowManager } from '../core/flow-manager.js';
import { atomicWriteFileSync } from '../core/fs/atomic-write.js';
import { t, getCliLang } from '../core/i18n.js';

/** chore.json 结构（v1.5.11：`source_allowed` 仅在有 `--source` 时写盘；旧记录缺省即 false） */
interface ChoreRecord {
  id: string;
  note: string;
  started_at: string;
  expires_at: string;
  stage_count_at_start: number;
  source_allowed?: boolean;
}

/** 窗口默认 / 上限（分钟）。上限硬定 30，任何途径都不得改回更长。 */
const DEFAULT_TTL_MIN = 30;
const MAX_TTL_MIN = 30;

/** chore 文件路径 */
function choreFilePath(projectPath: string): string {
  return resolve(projectPath, '.openfeel', 'chore.json');
}

/** 读取 chore（缺失/损坏 → null） */
function readChore(projectPath: string): ChoreRecord | null {
  const file = choreFilePath(projectPath);
  if (!existsSync(file)) return null;
  try {
    const parsed = JSON.parse(readFileSync(file, 'utf-8')) as Partial<ChoreRecord>;
    if (typeof parsed.id !== 'string' || typeof parsed.expires_at !== 'string') return null;
    return {
      id: parsed.id,
      note: typeof parsed.note === 'string' ? parsed.note : '',
      started_at: typeof parsed.started_at === 'string' ? parsed.started_at : '',
      expires_at: parsed.expires_at,
      stage_count_at_start: typeof parsed.stage_count_at_start === 'number' ? parsed.stage_count_at_start : 0,
      source_allowed: parsed.source_allowed === true ? true : undefined,
    };
  } catch {
    return null;
  }
}

function isExpired(chore: ChoreRecord): boolean {
  const ts = Date.parse(chore.expires_at);
  return !Number.isFinite(ts) || ts <= Date.now();
}

export function registerChoreCommand(program: Command): void {
  program
    .command('chore')
    .description('微变更通道：开启/收口一个 ephemeral 写窗口（不创建阶段；适配器写入门禁的 chore 例外）')
    .argument('[note]', '微变更说明（开启时必填，如 "调整 UI 圆角"）')
    .option('--end', '结束当前 chore（自动收口）')
    .option('--status', '查看当前 chore 状态（只读）')
    .option('--source', '显式声明本窗口允许写源码（默认只放行 doc/asset；人类在外部终端使用）')
    .option('--ttl-min <n>', `窗口时长（分钟）：1..${MAX_TTL_MIN} 的整数，默认 ${DEFAULT_TTL_MIN}；只能改短`)
    .action((note: string | undefined, options: { end?: boolean; status?: boolean; source?: boolean; ttlMin?: string }) => {
      const projectPath = process.cwd();
      const lang = getCliLang(projectPath);
      const mgr = new FlowManager(projectPath);
      if (!mgr.isLoaded()) {
        console.error(t('common.errorNoInit', lang));
        process.exit(1);
        return;
      }
      const data = mgr.getData()!;
      const stageCount = Object.keys(data.stages).length;
      const activeStages = Object.entries(data.stages)
        .filter(([, stage]) => stage.phase !== 'done')
        .map(([id, stage]) => `${id}=${stage.phase ?? '?'}`);

      // ── --status（只读）──
      if (options.status === true) {
        const chore = readChore(projectPath);
        const status = chore === null ? 'none' : (isExpired(chore) ? 'expired' : 'active');
        if (status === 'none') {
          console.log(t('flow.chore.statusNoneTmpl', lang));
        } else if (status === 'expired') {
          console.log(t('flow.chore.statusExpiredTmpl', lang, { id: chore!.id }));
        } else {
          console.log(t('flow.chore.statusActiveTmpl', lang, { id: chore!.id, note: chore!.note, expires: chore!.expires_at }));
          const remaining = Math.max(0, Math.ceil((Date.parse(chore!.expires_at) - Date.now()) / 60_000));
          console.log(t(
            chore!.source_allowed === true ? 'flow.chore.statusSourceAllowedTmpl' : 'flow.chore.statusSourceDeniedTmpl',
            lang,
            { remaining: String(remaining) },
          ));
        }
        return;
      }

      // ── --end（收口）──
      if (options.end === true) {
        const chore = readChore(projectPath);
        if (chore === null) {
          console.log(t('flow.chore.noActiveTmpl', lang));
          return;
        }
        mgr.appendLog({
          time: '',
          agent: 'cli',
          action: 'chore_end',
          detail: { id: chore.id, note: chore.note, stage_count: stageCount },
        });
        mgr.save();
        try {
          unlinkSync(choreFilePath(projectPath));
        } catch {
          /* 已被清理 → 幂等 */
        }
        console.log(t('flow.chore.endTmpl', lang, { id: chore.id }));
        return;
      }

      // ── 开启 ──
      // `--ttl-min` 校验先于任何写盘：越界 / 非整数 / ≤0 → exit 1 且不产生 chore.json。
      // 上限 30 是收窄口径（D-126-03 / P1-3），不接受 env/config 覆盖。
      let ttl = DEFAULT_TTL_MIN;
      if (options.ttlMin !== undefined) {
        const raw = String(options.ttlMin).trim();
        if (!/^\d+$/.test(raw)) {
          console.error(t('flow.chore.ttlInvalid', lang, { max: String(MAX_TTL_MIN) }));
          process.exit(1);
          return;
        }
        const parsed = Number(raw);
        if (parsed < 1) {
          console.error(t('flow.chore.ttlInvalid', lang, { max: String(MAX_TTL_MIN) }));
          process.exit(1);
          return;
        }
        if (parsed > MAX_TTL_MIN) {
          console.error(t('flow.chore.ttlTooLong', lang, { max: String(MAX_TTL_MIN) }));
          process.exit(1);
          return;
        }
        ttl = parsed;
      }

      if (note === undefined || note.trim() === '') {
        console.error(t('flow.chore.needNote', lang));
        process.exit(1);
        return;
      }
      if (activeStages.length > 0) {
        console.error(t('flow.chore.busyTmpl', lang, { stages: activeStages.join(', ') }));
        process.exit(1);
        return;
      }
      const sourceAllowed = options.source === true;

      const now = new Date();
      const id = `CHORE-${now.toISOString().replace(/[-:]/g, '').replace(/\..+$/, '')}`;
      const record: ChoreRecord = {
        id,
        note: note.trim(),
        started_at: now.toISOString(),
        expires_at: new Date(now.getTime() + ttl * 60_000).toISOString(),
        stage_count_at_start: stageCount,
      };
      // 只写 true（省略即 false）：旧记录无该字段 → guard 视为未授权源码。
      if (sourceAllowed) record.source_allowed = true;
      atomicWriteFileSync(choreFilePath(projectPath), `${JSON.stringify(record, null, 2)}\n`);
      mgr.appendLog({
        time: '',
        agent: 'cli',
        action: 'chore_start',
        detail: {
          id,
          note: record.note,
          expires_at: record.expires_at,
          stage_count: stageCount,
          source_allowed: sourceAllowed,
        },
      });
      mgr.save();
      console.log(t(
        sourceAllowed ? 'flow.chore.sourceStartedTmpl' : 'flow.chore.startedTmpl',
        lang,
        { id, note: record.note, ttl: String(ttl), expires: record.expires_at },
      ));
    });
}
