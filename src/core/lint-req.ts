/**
 * 需求正文命令名校验核心（`openfeel lint req`，v1.5.6-stage-115）
 *
 * 职责：把 `.openfeel/requirements/*.md` 里的**行内反引号命令候选**沿**真实命令树**
 * 逐 token 贪心下降，产出 A / B 两级结果。
 *
 * 分层约束（红线）：
 *  - 本模块是纯函数 + 常量：**零 commander 依赖**、**零 `../cli/index.js` import**
 *    （命令树由调用方以纯数据注入 —— 避免 `cli → commands → cli` 循环依赖）；
 *  - 不读写 `flow.json` / `status.md`；唯一 I/O 是 `lintRequirements` 读需求正文。
 *
 * A / B 分级（REV-010；REV-020 补「参数起点」判定）：
 *  - **A 类** `unknown-command`：首 token 是根命令，但逐词下降在某处断掉，且**断点父命令
 *    未声明位置参数** → **阻塞**（进 `issues`，驱动 `ok:false` 与 exit 1）；
 *  - **B 类** `suspect-command-group`（两种来源）→ **advisory**（进 `suspects`，不影响 `ok` 与退出码）：
 *    1. 首 token **非**根命令、串长 ≥ 2，且**尾 token** 命中全树命令名（`op create` / `npm run lint`）；
 *    2. **参数起点歧义**：在声明了位置参数的节点上，下一个 token 既不匹配子命令、又命中全树命令名
 *       （`archive create` / `knowledge search lint`）→ 无法区分「参数值」与「写错的命令」。
 *  - 通过：全部命中；或到达声明位置参数的节点后剩余 token 均非命令名（`stage set stage-01`）。
 */
import { readdirSync, readFileSync, type Dirent } from 'node:fs';
import { join, resolve } from 'node:path';
import { t } from './i18n.js';

/** 命令树节点（纯数据，便于断言与序列化；`children` 保持注册声明序） */
export interface CommandNode {
  /** 已注册名（commander `name()` 已剥离参数占位，如 `'set-lang <lang>'` → `'set-lang'`） */
  name: string;
  /**
   * 已声明的位置参数个数（commander `registeredArguments.length`；0 = 纯子命令组）。
   * ★ REV-020：`argCount > 0` 的节点之后出现**非子命令** token 时，后续 token 视为位置参数
   * （`stage set <id>` / `archive <stage>` / `knowledge search <query>`），不再按命令路径强行下降。
   */
  argCount: number;
  children: CommandNode[];
}

/** Commander Command 的结构子集（结构类型，避免 core → commander 依赖） */
export interface CommandLike {
  name(): string;
  commands: readonly CommandLike[];
  /** 位置参数声明（commander 14 公共属性 `registeredArguments`；`_args` 为其废弃别名） */
  registeredArguments?: readonly unknown[];
}

/** 待校验的需求正文文件（`path` 为项目根相对路径，恒正斜杠） */
export interface LintReqFile {
  path: string;
  content: string;
}

/** 问题类别：A 类（阻塞）/ B 类（advisory） */
export type LintReqIssueKind = 'unknown-command' | 'suspect-command-group';

/** 单条问题（`message` 已本地化，与 JSON `issues[].message` / 人类输出逐字同源） */
export interface LintReqIssue {
  /** 项目根相对路径（`.openfeel/requirements/REQ-017.md`） */
  path: string;
  /** 1-based 行号 */
  line: number;
  /** 原始 span（不含反引号） */
  span: string;
  kind: LintReqIssueKind;
  /**
   * A 类 = 断点处父命令的**完整内部路径**（`'flow'` / `'flow.stage'`）；
   * B 类 = 尾 token（`op create`）或参数起点处命中命令名的 token（`archive create`）；
   * 通过/静默项无此字段来源
   */
  breakAt: string | null;
  /** 本地化文案（不含任何近似纠错建议） */
  message: string;
}

/** 校验报告（结构化 issues / suspects + 人类输出所需计数同源） */
export interface LintReqReport {
  /** 扫描的需求文件数 */
  files: number;
  /** 通过前缀 token 串过滤的候选 span 数（含解析成功者与单 token 非根名） */
  candidates: number;
  /** A 类（阻塞，驱动 ok 与退出码）；已排序 */
  issues: LintReqIssue[];
  /** B 类（advisory，不影响 ok 与退出码）；与 issues 同一排序规则 */
  suspects: LintReqIssue[];
  /** = issues.length */
  unknownCount: number;
  /** = suspects.length */
  suspectCount: number;
  /** 被抑制标记跳过的行数（人类输出用；**不进 JSON**，REV-011） */
  suppressedLines: number;
  /** 未闭合的 ignore-start 区间（stderr 警告源；**不进 JSON**，REV-011） */
  unclosedRegions: Array<{ path: string; line: number }>;
}

/** 可选命令前缀（首 token 严格等于此值时才剥一次） */
export const LINT_REQ_PREFIX = 'openfeel';
/** 前缀 token 串长度上限（保持 REQ-017 的「1–4 token」候选定义；超限整体跳过） */
export const LINT_REQ_MAX_PREFIX_TOKENS = 4;
/**
 * 前缀 token 形态：小写字母开头，仅 `a-z 0-9 _ -`。
 * ★ **允许下划线**（REV-010）：否则 `flow review_add` / `flow config_sync_stage`
 * 这类真实缺陷形态永远免检；`--json`（`-` 开头）、`<stageId>`、`REV-001`（大写）、
 * `flow.json` / `docs/**` 等含其他字符的 token 自然在此停止扩展。
 */
export const LINT_REQ_PREFIX_TOKEN_RE = /^[a-z][a-z0-9_-]*$/;
/** 行内反引号候选（不跨行） */
export const REQ_CANDIDATE_RE = /`([^`\n]+)`/g;
/** 行内抑制标记（后接 `\s*-->`，天然不吞 `-start` / `-end`） */
export const MARK_IGNORE = /<!--\s*lint-req:ignore\s*-->/;
/** 区间起标记 */
export const MARK_START = /<!--\s*lint-req:ignore-start\s*-->/;
/** 区间止标记 */
export const MARK_END = /<!--\s*lint-req:ignore-end\s*-->/;

/** 需求正文目录（项目根相对，恒正斜杠 —— 与 `lint kb` 的 `.openfeel/kb/<file>` 同风格） */
const REQ_DIR_REL = '.openfeel/requirements';

/** 根 program → 命令树（递归，保序；供命令层在 action 运行期调用） */
export function toCommandTree(root: CommandLike): CommandNode[] {
  return root.commands.map((child) => ({
    name: child.name(),
    argCount: (child.registeredArguments ?? []).length,
    children: toCommandTree(child),
  }));
}

/**
 * 纯函数主入口：给定正文与命令树，返回报告（不读写盘、不查环境）。
 * @param files 待校验正文（调用方保证已按文件名字典序传入；本函数不重排）
 * @param tree 真实命令树（`toCommandTree(program)`）
 * @param lang 文案语言
 */
export function lintRequirementFiles(
  files: readonly LintReqFile[],
  tree: readonly CommandNode[],
  lang: string,
): LintReqReport {
  const rootNames = new Set(tree.map((node) => node.name));
  const allNames = collectAllNames(tree);
  const issues: LintReqIssue[] = [];
  const suspects: LintReqIssue[] = [];
  const unclosedRegions: Array<{ path: string; line: number }> = [];
  let candidates = 0;
  let suppressedLines = 0;

  for (const file of files) {
    // 区间状态**按文件独立**（每个文件从 false 起）
    let inRegion = false;
    let regionStart = 0;
    const lines = file.content.split('\n');

    for (let idx = 0; idx < lines.length; idx += 1) {
      const lineText = lines[idx];
      const lineNo = idx + 1;
      // 标记匹配对象 = 剥离行内代码后的文本：写在反引号里的标记写法不生效（有意设定）
      const plain = stripInlineCode(lineText);
      const isStart = MARK_START.test(plain);
      const isEnd = MARK_END.test(plain);
      const isInline = MARK_IGNORE.test(plain);

      // 抑制口径（REV-020 low#2，与 docs/json-contract.md §16.5 一致）：
      //   「标记行（起/止/行内）+ 区间内行」计入 suppressedLines；**孤 `ignore-end` 行不计**
      //   （它什么也没抑制），按普通行扫描候选。
      const suppressed = inRegion || isStart || isInline;
      // 区间状态机（REV-020 low#1）：
      //  - 自闭合（同行 start+end）不开启区间，也**不会提前关闭**已开启的外层区间；
      //  - 嵌套 start 不累加深度、且**不覆盖**外层 regionStart（起行仍是外层那行）。
      if (isStart && !isEnd && !inRegion) {
        inRegion = true;
        regionStart = lineNo;
      }
      if (isEnd && !isStart) {
        inRegion = false;
      }
      if (suppressed) {
        suppressedLines += 1;
        continue;
      }

      for (const match of lineText.matchAll(REQ_CANDIDATE_RE)) {
        const raw = match[1].trim();
        // ★ REV-010：取**前导 token 串**后判定，不做「整 span 含不合形态 token 就跳过」
        const run = takePrefixRun(raw.split(/\s+/));
        if (run.length === 0) continue; // `--json` / `<stageId>` / `REV-001` / `flow.json` 等
        if (run.length > LINT_REQ_MAX_PREFIX_TOKENS) continue; // 5+ token 整体跳过
        candidates += 1;
        const tokens = run[0] === LINT_REQ_PREFIX ? run.slice(1) : run;
        if (tokens.length === 0) continue; // span 就是 `openfeel`

        const verdict = resolveTokens(tokens, tree, rootNames, allNames);
        if (verdict.kind === 'break') {
          issues.push({
            path: file.path,
            line: lineNo,
            span: raw,
            kind: 'unknown-command',
            breakAt: verdict.at,
            message: t('lint.req.issueTmpl', lang, {
              line: String(lineNo),
              span: raw,
              break: verdict.at,
            }),
          });
        } else if (verdict.kind === 'arg-as-command') {
          // ★ REV-020：命令存在、只是带参数 → 不是「命令不存在」，降级为 advisory
          suspects.push({
            path: file.path,
            line: lineNo,
            span: raw,
            kind: 'suspect-command-group',
            breakAt: verdict.token,
            message: t('lint.req.argAsCommandTmpl', lang, {
              line: String(lineNo),
              span: raw,
              token: verdict.token,
            }),
          });
        } else if (verdict.kind === 'notroot' && tokens.length >= 2) {
          const tail = tokens[tokens.length - 1];
          if (allNames.has(tail)) {
            suspects.push({
              path: file.path,
              line: lineNo,
              span: raw,
              kind: 'suspect-command-group',
              breakAt: tail,
              message: t('lint.req.suspectTmpl', lang, {
                line: String(lineNo),
                span: raw,
                tail,
              }),
            });
          }
        }
      }
    }

    // ★ REV-011：未闭合区间延续到 EOF，但**不许静默** —— 记录起行，由命令层打 stderr 警告
    if (inRegion) {
      unclosedRegions.push({ path: file.path, line: regionStart });
    }
  }

  // 排序：两类各自独立，先 path 升序、同文件 line 升序；同 line 保持行内出现序
  // （同一 path/line 内为稳定排序 —— 遍历序即出现序，Node 的 Array#sort 稳定）。
  // 用字符串字节序比较（`<`）而非 localeCompare：排序结果不随宿主 locale 变化。
  issues.sort(compareByPathThenLine);
  suspects.sort(compareByPathThenLine);

  return {
    files: files.length,
    candidates,
    issues,
    suspects,
    unknownCount: issues.length,
    suspectCount: suspects.length,
    suppressedLines,
    unclosedRegions,
  };
}

/**
 * 便利入口：读 `<projectPath>/.openfeel/requirements/*.md`（按文件名升序）后调纯函数。
 * 目录不存在 / 无 `*.md` → `files:0, candidates:0, issues:[], suspects:[]`（镜像 `lint kb` 的「无目录即通过」）。
 */
export function lintRequirements(
  projectPath: string,
  tree: readonly CommandNode[],
  lang: string,
): LintReqReport {
  return lintRequirementFiles(readRequirementFiles(resolve(projectPath)), tree, lang);
}

/**
 * 读取需求正文（一层，不递归，文件名字典序）。
 * 符号链接：只取 `Dirent.isFile()` 为真的项 —— 符号链接的 Dirent 报告链接自身类型，
 * `isFile()` 为 false ⇒ **天然不跟随、不读取**（REV low #17），无需额外判定。
 */
function readRequirementFiles(projectRoot: string): LintReqFile[] {
  const dir = join(projectRoot, REQ_DIR_REL);
  let entries: Dirent[];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    // 目录不存在 / 不可读 → 视为无需求文件（不报错、不追加文案）
    return [];
  }
  const names = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith('.md'))
    .map((entry) => entry.name)
    .sort();
  return names.map((name) => ({
    path: `${REQ_DIR_REL}/${name}`,
    content: readFileSync(join(dir, name), 'utf-8'),
  }));
}

/** 递归收集全树命令名（B 类「尾 token 是否已注册」判定用） */
function collectAllNames(tree: readonly CommandNode[]): Set<string> {
  const names = new Set<string>();
  const walk = (nodes: readonly CommandNode[]): void => {
    for (const node of nodes) {
      names.add(node.name);
      walk(node.children);
    }
  };
  walk(tree);
  return names;
}

/** 剥离行内代码（标记匹配用；`` `<!-- lint-req:ignore -->` `` 写在反引号里不生效） */
function stripInlineCode(line: string): string {
  return line.replace(/`[^`]*`/g, '');
}

/**
 * 取**前导 token 串**：从第一个 token 起连续收集匹配 {@link LINT_REQ_PREFIX_TOKEN_RE} 的 token，
 * **首个不匹配即停**（保留已收集前缀）。不做「整 span 跳过」（REV-010）。
 */
function takePrefixRun(tokens: readonly string[]): string[] {
  const run: string[] = [];
  for (const token of tokens) {
    if (!LINT_REQ_PREFIX_TOKEN_RE.test(token)) break;
    run.push(token);
  }
  return run;
}

/** 单 span 的解析判定 */
type ResolveVerdict =
  | { kind: 'ok' }
  | { kind: 'break'; at: string }
  | { kind: 'arg-as-command'; at: string; token: string }
  | { kind: 'notroot' };

/**
 * 沿真实命令树逐 token 贪心下降（最多 {@link LINT_REQ_MAX_PREFIX_TOKENS} 步）。
 *
 * 判定顺序（REV-020，**子命令优先**）：
 * 1. 当前节点的子命令里有该 token → 下降；
 * 2. 否则若当前节点**声明了位置参数**（`argCount > 0`）→ 从这里起后续 token 是位置参数：
 *    - token 命中全树命令名 → `arg-as-command`（无法区分「参数值」与「写错的命令」→ 降级 B 类）；
 *    - 否则 → `ok`（`stage set stage-01` / `config get workflow_mode` / `archive v1.2.0`）；
 * 3. 否则 → `break`（`at` = 断点处父命令的**完整内部路径**，如 `'flow'` / `'flow.stage'`）。
 *
 * 首 token 非根命令 → `notroot`（B 类另一来源）；全部命中 → `ok`（停在父命令也合法）。
 */
function resolveTokens(
  tokens: readonly string[],
  tree: readonly CommandNode[],
  rootNames: ReadonlySet<string>,
  allNames: ReadonlySet<string>,
): ResolveVerdict {
  const head = tokens[0];
  if (!rootNames.has(head)) return { kind: 'notroot' };

  const path: string[] = [head];
  let current = tree.find((node) => node.name === head)!;
  for (let i = 1; i < tokens.length; i += 1) {
    const token = tokens[i];
    const child = current.children.find((node) => node.name === token);
    if (child) {
      current = child;
      path.push(child.name);
      continue;
    }
    if (current.argCount > 0) {
      if (allNames.has(token)) {
        return { kind: 'arg-as-command', at: path.join('.'), token };
      }
      return { kind: 'ok' };
    }
    return { kind: 'break', at: path.join('.') };
  }
  return { kind: 'ok' };
}

/** 排序比较器：path 升序 → line 升序（字节序，locale 无关） */
function compareByPathThenLine(a: LintReqIssue, b: LintReqIssue): number {
  if (a.path !== b.path) return a.path < b.path ? -1 : 1;
  return a.line - b.line;
}
