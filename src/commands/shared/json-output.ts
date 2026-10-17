/**
 * JSON 输出契约助手（v1.2.2-stage-95）
 *
 * 职责：
 *  - 单文档 JSON 契约的构造与输出（`schemaVersion` 恒为首键、值恒为 1）；
 *  - 进程级 JSON 模式单点（由 runCli 预扫描后置位，命令层只读）；
 *  - argv 单点扫描（`--json` / `--version|-v` / `--project`，跳过已知取值选项防误判）。
 *
 * 边界：本模块不承担错误封装（failCli / envelope 归错误层）；不改变任何人类输出。
 */

/** JSON 契约版本号（恒为 1；与单文档首键同值） */
export const SCHEMA_VERSION = 1;

/**
 * 构造以 `schemaVersion` 为运行时首键的单文档。
 * 运行时键序由对象字面量构造序决定，因此必须写成 `{ schemaVersion, ...doc }`；
 * 禁止 `{ ...doc, schemaVersion }`（类型通过但首键违约，REV-95-004 / D-95-01）。
 * @param doc 业务文档内容（字面量序保持）
 * @returns 首键为 schemaVersion、值为 1 的新对象
 */
export function withSchemaVersion<T extends object>(doc: T): { schemaVersion: 1 } & T {
  return { schemaVersion: SCHEMA_VERSION, ...doc };
}

/** 输出单个 JSON 文档（2 空格缩进，stdout） */
export function emitJson(doc: object): void {
  console.log(JSON.stringify(doc, null, 2));
}

// ── 进程级 JSON 模式单点 ──
// runCli 在预扫描后置位；命令层只读。模块级状态保证「单进程单命令」前提下的单点判定。

let jsonMode = false;

/** 设置进程级 JSON 模式（runCli 预扫描后置位） */
export function setJsonMode(value: boolean): void {
  jsonMode = value;
}

/** 读取进程级 JSON 模式（命令层只读） */
export function isJsonMode(): boolean {
  return jsonMode;
}

/** 重置 JSON 模式（仅测试隔离用，非生产路径） */
export function resetJsonModeForTest(): void {
  jsonMode = false;
}

/**
 * 已知「取值选项」名单：argv 扫描时跳过其下一个 token。
 * 目的：避免把取值 token（如 `--title --json` 中的 `--json`）误判为开关。
 * 覆盖实测全部取值选项（含 `--lines` / `-n`）。
 */
export const VALUE_OPTIONS: ReadonlySet<string> = new Set<string>([
  '--encoding',
  '--log-file',
  '--project',
  '--title',
  '--content',
  '--last',
  '--offset',
  '--add',
  '--auto-advance',
  '--auto-fix',
  '--blocking',
  '--category',
  '--change',
  '--deps',
  '--exec-mode',
  '--into',
  '--lang',
  '--limit',
  '--mode',
  '--op',
  '--owner',
  '--priority',
  '--requirement',
  '--result',
  '--review-agent',
  '--review-tier',
  '--schema',
  '--scope',
  '--stage',
  '--status',
  '--target-version',
  '--tasks',
  '--threshold',
  '--to',
  '--tools',
  '--type',
  '--workflow-mode',
  '--lines',
  '-n',
]);

/** argv 单点扫描结果 */
export interface ArgvScanResult {
  /** 是否存在 `--json` 开关（`--json=true` 不支持，Commander 原生拒绝） */
  json: boolean;
  /** 是否存在 `--version` / `-v` 开关 */
  version: boolean;
  /** `--project <v>` / `--project=<v>` 收集到的值（原始 token；路径解析归 project-option） */
  projectValues: string[];
  /** `--project` 缺值（下一 token 以 `-` 开头或已到末尾） */
  projectMissingValue: boolean;
}

/**
 * argv 单点扫描。
 * 规则：遇 `--` 停止扫描；`--json` / `--version` / `-v` 置位；
 * `--project` 收集值（缺值登记）；其余 `VALUE_OPTIONS` 成员跳过下一 token；
 * 未知 `--x=v` 不吞下一 token。
 * @param argv 命令行参数（不含 node 与脚本路径）
 */
export function scanArgv(argv: string[]): ArgvScanResult {
  let json = false;
  let version = false;
  let projectMissingValue = false;
  const projectValues: string[] = [];

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    // `--` 之后为位置参数，不再识别选项
    if (token === '--') {
      break;
    }
    if (token === '--json') {
      json = true;
      continue;
    }
    if (token === '--version' || token === '-v') {
      version = true;
      continue;
    }
    if (token === '--project') {
      const next = argv[i + 1];
      // 缺值（末尾或下一 token 形如选项）→ 登记，且不吞下一 token
      if (next === undefined || next.startsWith('-')) {
        projectMissingValue = true;
        continue;
      }
      projectValues.push(next);
      i += 1;
      continue;
    }
    if (token.startsWith('--project=')) {
      const value = token.slice('--project='.length);
      if (value === '') {
        projectMissingValue = true;
      } else {
        projectValues.push(value);
      }
      continue;
    }
    // 已知取值选项：跳过其下一个 token（防 `--title --json` 误判）
    if (VALUE_OPTIONS.has(token)) {
      if (i + 1 < argv.length) {
        i += 1;
      }
    }
  }

  return { json, version, projectValues, projectMissingValue };
}

/** 解析是否处于 `--json` 模式（argv 单点扫描） */
export function resolveJsonMode(argv: string[]): boolean {
  return scanArgv(argv).json;
}

/** 解析是否存在 `--version` / `-v` 开关（argv 单点扫描） */
export function resolveVersionFlag(argv: string[]): boolean {
  return scanArgv(argv).version;
}
