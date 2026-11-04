/**
 * dashboard 命令（v1.5.10-stage-125 op-003）
 *
 * `openfeel dashboard [--json] [--out <file>] [--open]`
 * 进程内一次聚合（唯一 `FlowManager`）→ 单文件 HTML 渲染写盘 / 单 JSON 文档。
 *
 * 执行顺序契约（D-125-05，固定，不得调换）：
 * ① 纯参数校验（**先于任何读盘 / 聚合 / 写盘**）→ ② `mgr.isLoaded()` → ③ 聚合 + 渲染 / 写盘。
 *
 * 退出码（0 / 1 / 3，**无 2**）：
 * - 0：成功（含空数据、含 `health.ok=false`、含 `--open` 拉起失败）；
 * - 1：参数拒绝（`INVALID_ARGUMENT`）/ 未初始化（`NO_INIT`）；
 * - 3：建目录或写盘失败（`INTERNAL_ERROR`；本命令零 flow.json 写、不加锁，无并发冲突面）。
 *
 * `--json` 与 `--out` / `--open` 互斥：前者的契约是「stdout 恰好一个 JSON 文档」，
 * 若允许附带写盘 / 拉起进程，同一出口就出现「有副作用 / 无副作用」二元态。
 */
import { Command } from 'commander';
import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, statSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { t, getCliLang } from '../core/i18n.js';
import { FlowManager } from '../core/flow-manager.js';
import { collectDashboardData, type DashboardStatusDoc } from '../core/dashboard/aggregate.js';
import { renderDashboardHtml } from '../core/dashboard/render.js';
// 命令层 → 命令层复用：`flow status --json` 的形状冻结文档（出现第三个消费者再下沉 core）
import { buildStatusJson } from './flow.js';
import { failCli, failInternal } from './shared/errors.js';
import { emitJson } from './shared/json-output.js';

/** `dashboard` 命令选项 */
interface DashboardOptions {
  json?: boolean;
  out?: string;
  open?: boolean;
}

/**
 * 默认产物路径：`<项目根>/.openfeel/tmp/dashboard.html`（`.gitignore` 已整目录忽略，零仓库 churn）。
 * @param projectPath 项目根（顶层 `--project` 已 chdir，等价于当前工作目录）
 */
export function defaultDashboardPath(projectPath: string): string {
  return resolve(projectPath, '.openfeel', 'tmp', 'dashboard.html');
}

/**
 * `--out` 是否指向已存在目录。
 * **必须**先 `existsSync` 再 `statSync`：裸 `statSync` 对不存在的路径抛 `ENOENT`，
 * 会被误判成「写盘失败 exit 3」而不是参数拒绝。
 */
function isExistingDirectory(path: string): boolean {
  try {
    return existsSync(path) && statSync(path).isDirectory();
  } catch {
    return false;
  }
}

/** 参数拒绝统一出口（`INVALID_ARGUMENT` / exit 1；人类侧即时退出由 `failCli` 保证） */
function failInvalidArgument(
  projectPath: string,
  key: string,
  detail: unknown,
  vars?: Record<string, string>,
): void {
  // 语言只在失败分支读取：成功路径的语言解析留到 ③（校验先于任何读盘）
  const message = t(key, getCliLang(projectPath), vars);
  failCli({ code: 'INVALID_ARGUMENT', message, detail, stderrLines: [message] });
}

/**
 * 按平台构造浏览器拉起命令（纯函数，导出供测试断言）。
 *
 * **Windows 不经 cmd**：`cmd /c start "" <裸路径>` 会把 `& | < > ^` 当命令行元字符二次解析
 * （Node/libuv 只在参数含空格/Tab/`"` 时加引号，不足以防注入；`C:\tmp\R&D\dashboard.html`
 * 会被拆成 `start "" C:\tmp\R` + 命令 `D\dashboard.html`）→ 改用 `rundll32`，
 * 路径作为**单个 argv** 原样传递，零 shell 解析面。禁 `shell:true`。
 *
 * @param platform `process.platform`（显式入参，便于测试覆盖三平台）
 * @param artifactPath 产物绝对路径（原样作为参数，不拼接命令行字符串）
 * @returns `{ cmd, args }`：`args` 中路径恒为独立元素
 */
export function browserCommand(platform: NodeJS.Platform, artifactPath: string): { cmd: string; args: string[] } {
  if (platform === 'win32') {
    // url.dll,FileProtocolHandler = ShellExecute 的协议处理器（不经 cmd、不解析元字符）
    return { cmd: 'rundll32', args: ['url.dll,FileProtocolHandler', artifactPath] };
  }
  if (platform === 'darwin') {
    return { cmd: 'open', args: [artifactPath] };
  }
  return { cmd: 'xdg-open', args: [artifactPath] };
}

/**
 * 拉起系统默认浏览器打开产物。
 * 失败（`spawn` 同步抛错 / 子进程 `error` 事件 / `exit` 非零或信号终止）只回调 `onError` 一次，
 * **不改退出码**——无浏览器是常态，不是命令失败（D-125-05）。
 */
function openArtifact(artifactPath: string, onError: () => void): void {
  const { cmd, args } = browserCommand(process.platform, artifactPath);
  let reported = false;
  const fail = (): void => {
    if (reported) {
      return;
    }
    reported = true;
    onError();
  };
  try {
    const child = spawn(cmd, args, { detached: true, stdio: 'ignore' });
    child.on('error', fail);
    // `exit` 非零 / code=null（信号终止）→ 拉起失败（warn 一次，退出码仍 0）
    child.on('exit', (code) => {
      if (code === null || code !== 0) {
        fail();
      }
    });
    child.unref();
  } catch {
    fail();
  }
}

/** 命令主体（顺序契约见文件头注释） */
function runDashboard(options: DashboardOptions): void {
  const projectPath = process.cwd();
  const outProvided = typeof options.out === 'string';
  const outPath = outProvided
    ? resolve(projectPath, options.out as string)
    : defaultDashboardPath(projectPath);

  // ① 纯参数校验（先于任何读盘 / 聚合 / 写盘）
  if (options.json && outProvided) {
    failInvalidArgument(projectPath, 'dashboard.jsonOutConflict', { conflict: 'json-out' });
    return;
  }
  if (options.json && options.open) {
    failInvalidArgument(projectPath, 'dashboard.jsonOpenConflict', { conflict: 'json-open' });
    return;
  }
  if (outProvided && options.out === '') {
    failInvalidArgument(projectPath, 'dashboard.outEmpty', { out: '' });
    return;
  }
  if (outProvided && isExistingDirectory(outPath)) {
    failInvalidArgument(projectPath, 'dashboard.outIsDirectory', { out: outPath }, { path: outPath });
    return;
  }

  // ② 未初始化（唯一 manager；后续全部复用本次加载快照）
  const mgr = new FlowManager(projectPath);
  if (!mgr.isLoaded()) {
    const message = t('common.errorNoInit', getCliLang(projectPath));
    failCli({ code: 'NO_INIT', message, detail: null, stderrLines: [message] });
    return;
  }

  // ③ 聚合：命令层注入 data / statusDoc / healthReport（core 层不建 manager、不二次读 flow.json）
  const lang = getCliLang(projectPath);
  const data = mgr.getData()!;
  const statusDoc = buildStatusJson(mgr) as unknown as DashboardStatusDoc;
  const healthReport = mgr.healthCheck(false);
  const dashboard = collectDashboardData(projectPath, { data, statusDoc, healthReport, lang });

  // `--json`：stdout 恰好一个 JSON 文档；不写任何文件、不 spawn（互斥已在上一步拦下）
  if (options.json) {
    emitJson(dashboard);
    return;
  }

  // HTML 渲染 + 写盘（父目录不存在则递归创建；默认路径同策略）
  const html = renderDashboardHtml(dashboard, { lang });
  try {
    mkdirSync(dirname(outPath), { recursive: true });
    writeFileSync(outPath, html, 'utf-8');
  } catch (err) {
    // 建目录 / 写盘失败 → INTERNAL_ERROR / exit 3（不新增错误码、不复用 ARCHIVE_WRITE_FAILED）
    failInternal(err);
    return;
  }

  // 人类摘要（3 行；恒打印绝对路径）
  console.log(t('dashboard.title', lang));
  console.log(t('dashboard.statsTmpl', lang, {
    requirements: String(dashboard.requirements.total),
    stages: String(dashboard.stages.counts.total),
    blockingReviews: String(dashboard.blockingReviews.length),
  }));
  console.log(t('dashboard.writtenTmpl', lang, { path: outPath }));

  // `--open`：写入之后拉起；失败只 warn，恒 exit 0
  if (options.open) {
    openArtifact(outPath, () => {
      console.warn(t('dashboard.openFailedTmpl', lang, { path: outPath }));
    });
  }
}

/** `dashboard` 命令注册入口（**无位置参数**） */
export function registerDashboardCommand(program: Command): void {
  program
    .command('dashboard')
    .description('生成项目看板（单文件 HTML 快照；零外链零脚本）')
    .option('--json', '以 JSON 输出（纯 JSON 单文档，含 schemaVersion）')
    .option('--out <file>', '输出文件路径（缺省 <项目根>/.openfeel/tmp/dashboard.html）')
    .option('--open', '生成后用系统默认浏览器打开（无 --out 时打开默认产物）')
    .action((options: DashboardOptions) => {
      runDashboard(options);
    });
}
