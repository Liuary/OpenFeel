/**
 * `lint req` 纯函数核心测试（v1.5.6-stage-115 op-001；T1~T20 / 21 条）
 *
 * 树来源纪律：直接 import **生产同源**的 `program as rootProgram`（`src/cli/index.ts` 模块顶层
 * 已注册全部 19 组）——**不得**用 `new Command()` + 只注册 lint 组（那样树是空的/残缺的，
 * `stage deps` 会被误判），也不手写注册序列（易与生产漂移）。
 */
import { describe, it, expect } from 'vitest';
import { program as rootProgram } from '../../src/cli/index.js';
import {
  lintRequirementFiles,
  toCommandTree,
  LINT_REQ_PREFIX,
  LINT_REQ_MAX_PREFIX_TOKENS,
  type CommandLike,
  type CommandNode,
  type LintReqReport,
} from '../../src/core/lint-req.js';

/** 生产同源命令树（19 根命令 + 全部子树） */
const TREE: CommandNode[] = toCommandTree(rootProgram);

/** 单文件便利入口：正文 → 报告（`zh-CN` 文案，便于断言 message 逐字含中文） */
function lint(content: string): LintReqReport {
  return lintRequirementFiles(
    [{ path: '.openfeel/requirements/REQ-999.md', content }],
    TREE,
    'zh-CN',
  );
}

describe('lint req core：命令树构建', () => {
  it('T1：树构建嵌套与带参命令名归一（参数占位剥离、children 保序、argCount 取 registeredArguments）', () => {
    const fakeRoot: CommandLike = {
      name: () => 'openfeel',
      commands: [
        {
          name: () => 'plan',
          commands: [
            { name: () => 'stage', commands: [] },
            { name: () => 'scheme', commands: [] },
          ],
        },
        {
          name: () => 'config',
          commands: [
            // commander `name()` 已剥离 `<lang>` 占位；`registeredArguments` 保留参数声明
            { name: () => 'set-lang', commands: [], registeredArguments: [{}] },
          ],
        },
      ],
    };
    const tree = toCommandTree(fakeRoot);
    expect(tree.map((n) => n.name)).toEqual(['plan', 'config']);
    expect(tree[0].children.map((n) => n.name)).toEqual(['stage', 'scheme']);
    expect(tree[1].children.map((n) => n.name)).toEqual(['set-lang']);
    // ★ REV-020：argCount 是「参数起点」判定的输入
    expect(tree[1].children[0].argCount).toBe(1);
    expect(tree[0].children[0].argCount).toBe(0);
    expect(tree[0].argCount).toBe(0);
  });

  it('T2：守卫 —— 生产树根命令恰 19 项，lint 组含 req，且带参节点元数据真实存在', () => {
    const roots = TREE.map((n) => n.name).sort();
    expect(roots).toEqual([
      'archive', 'chore', 'config', 'dev', 'flow', 'init', 'instructions', 'knowledge',
      'lint', 'migrate', 'model', 'plan', 'project', 'req', 'roadmap', 'setup', 'stage',
      'update', 'view',
    ]);
    const lintNode = TREE.find((n) => n.name === 'lint');
    expect(lintNode).toBeDefined();
    expect(lintNode!.children.map((n) => n.name)).toEqual(['i18n', 'kb', 'req']);
    // REV-020：`archive <stage>` / `knowledge search <query>` 声明了位置参数
    expect(TREE.find((n) => n.name === 'archive')!.argCount).toBeGreaterThan(0);
    const knowledge = TREE.find((n) => n.name === 'knowledge')!;
    expect(knowledge.children.find((n) => n.name === 'search')!.argCount).toBeGreaterThan(0);
  });
});

describe('lint req core：解析通过面（零误报）', () => {
  it('T3：单 token 根命令通过', () => {
    const r = lint('`stage` 与 `flow`');
    expect(r.issues).toEqual([]);
    expect(r.suspects).toEqual([]);
    expect(r.candidates).toBe(2);
  });

  it('T4：单 token 非根命令静默（B 类要求 ≥2 token）', () => {
    const r = lint('`create` / `deps` / `plan_review`');
    expect(r.issues).toEqual([]);
    expect(r.suspects).toEqual([]);
    expect(r.candidates).toBe(3);
  });

  it('T5：停在父命令合法', () => {
    const r = lint('`plan scheme`、`flow review`');
    expect(r.issues).toEqual([]);
    expect(r.suspects).toEqual([]);
  });

  it('T6：前缀串 token 上限 4（5 token 整体跳过且不计数）', () => {
    // 4 token 全词命中 → 通过
    expect(lint('`flow review add`').issues).toEqual([]);
    // 5 token → 超限，整体跳过（不构成候选）
    const over = lint('`flow review add a b`');
    expect(over.candidates).toBe(0);
    expect(over.issues).toEqual([]);
    expect(LINT_REQ_MAX_PREFIX_TOKENS).toBe(4);
  });

  it('T7：前缀串停止条件 / 单 token 静默（不是形态排除）', () => {
    const r = lint('`flow.json` / `--json` / `<stageId>` / `docs/**` / `openfeel.js`');
    expect(r.issues).toEqual([]);
    expect(r.suspects).toEqual([]);
    expect(r.candidates).toBe(0);

    // 单 token 非根名：**入候选但不报**（静默的原因是「单 token 非根名」，不是形态排除）
    const single = lint('`plan_review` / `stage-114` / `op-001`');
    expect(single.candidates).toBe(3);
    expect(single.issues).toEqual([]);
    expect(single.suspects).toEqual([]);
  });

  it('T8：`openfeel` 前缀剥离（仅首 token 严格等于 openfeel 时剥一次）', () => {
    const r = lint('`openfeel config get` / `openfeel lint req`');
    expect(r.issues).toEqual([]);
    expect(r.suspects).toEqual([]);
    expect(r.candidates).toBe(2);
    expect(LINT_REQ_PREFIX).toBe('openfeel');
  });
});

describe('lint req core：A 类（阻塞）', () => {
  it('T9：A 类三名（根级断点）+ `archive create` 因父命令声明位置参数而降级 suspect', () => {
    const r = lint('`stage deps` / `stage reset` / `stage remove` / `archive create`');
    expect(r.issues).toHaveLength(3);
    expect(r.unknownCount).toBe(3);
    expect(r.issues.map((i) => i.span)).toEqual(['stage deps', 'stage reset', 'stage remove']);
    expect(r.issues.map((i) => i.breakAt)).toEqual(['stage', 'stage', 'stage']);
    expect(r.issues[0].kind).toBe('unknown-command');
    expect(r.issues[0].path).toBe('.openfeel/requirements/REQ-999.md');
    expect(r.issues[0].message).toContain('stage deps');
    expect(r.issues[0].message).toContain('无法解析为命令路径');
    // ★ REV-020：`archive <stage>` 声明了位置参数 → `archive create` 不是 A 类硬错
    expect(r.suspects).toHaveLength(1);
    expect(r.suspects[0].span).toBe('archive create');
    expect(r.suspects[0].message).toContain('疑似把参数写成命令名');
  });

  it('T9b：断点报完整内部路径（`flow stage deps` → `flow.stage`）', () => {
    const r = lint('`flow stage deps`');
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].breakAt).toBe('flow.stage');
    expect(r.issues[0].message).toContain('flow.stage');
  });

  it('T18：REV-010 新规则命中（下划线形态与 --json 尾部不再免检）', () => {
    const r = lint(
      '`flow review_add` / `flow config_sync_stage` / `flow stats --json` / `flow stage sett --json`',
    );
    expect(r.issues).toHaveLength(4);
    expect(r.issues.map((i) => i.breakAt)).toEqual(['flow', 'flow', 'flow', 'flow.stage']);
    expect(r.suspects).toEqual([]);
  });
});

describe('lint req core：B 类（advisory）与退化边界', () => {
  it('T10：B 类两名（尾 token 已注册）', () => {
    const r = lint('`op create` / `op publish`');
    expect(r.issues).toEqual([]);
    expect(r.unknownCount).toBe(0);
    expect(r.suspects).toHaveLength(2);
    expect(r.suspectCount).toBe(2);
    expect(r.suspects.map((s) => s.span)).toEqual(['op create', 'op publish']);
    expect(r.suspects.map((s) => s.breakAt)).toEqual(['create', 'publish']);
    expect(r.suspects[0].kind).toBe('suspect-command-group');
    expect(r.suspects[0].message).toContain('op create');
    expect(r.suspects[0].message).toContain('create');
  });

  it('T17：退化边界 —— 首 token 拼错落 B，尾 token 非命令名则完全静默，外部工具命令落 B', () => {
    // 首 token 拼错 + 尾 token 是命令名 → B（advisory，不阻塞）
    const typo = lint('`flwo stage set`');
    expect(typo.issues).toEqual([]);
    expect(typo.suspects).toHaveLength(1);
    expect(typo.suspects[0].breakAt).toBe('set');

    // 首 token 拼错 + 尾 token 不是任何命令名 → 既非 A 也非 B（完全静默）
    const silent = lint('`stagee deps`');
    expect(silent.issues).toEqual([]);
    expect(silent.suspects).toEqual([]);

    // 外部工具命令：尾 token 是已注册名 → B 面固有噪声（不影响 ok / 退出码）
    const external = lint('`npm run lint`');
    expect(external.issues).toEqual([]);
    expect(external.suspects).toHaveLength(1);
    expect(external.suspects[0].breakAt).toBe('lint');

    // ★ 已知边界（刻意取舍，锁住当前行为，**不修**）：父命令同时声明位置参数且有子命令时，
    // 子命令优先；在**值位**拼错的子命令被判为参数值 → 静默通过（A=0 / B=0），
    // 与合法的 `flow archive v1.2.0` 无法区分（位置参数是任意字符串，无形态学依据）。
    // 详见 docs/json-contract.md §16.2「已知边界」。
    const archiveTypo = lint('`flow archive lst`');
    expect(archiveTypo.issues).toEqual([]);
    expect(archiveTypo.suspects).toEqual([]);
    const migrateTypo = lint('`migrate rollbak`');
    expect(migrateTypo.issues).toEqual([]);
    expect(migrateTypo.suspects).toEqual([]);
    // 正控：正确的子命令仍通过（证明上面的静默不是「整棵树不可用」）
    expect(lint('`flow archive list`').issues).toEqual([]);
    expect(lint('`migrate rollback`').issues).toEqual([]);
  });
});

describe('lint req core：抑制机制两档', () => {
  it('T11：行内抑制（该行全部候选跳过，且抑制行数可见）', () => {
    const r = lint('`stage deps` <!-- lint-req:ignore -->');
    expect(r.issues).toEqual([]);
    expect(r.suspects).toEqual([]);
    expect(r.suppressedLines).toBe(1);
  });

  it('T12：区间抑制（区间内 3 行 A 类全跳过，区间外同行仍报；嵌套 start 不覆盖起行、区间内的自闭合不提前闭合）', () => {
    const content = [
      '<!-- lint-req:ignore-start -->',
      '`stage deps`',
      '`archive create`',
      '`stage reset`',
      '<!-- lint-req:ignore-end -->',
      '`stage remove`',
    ].join('\n');
    const r = lint(content);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].span).toBe('stage remove');
    expect(r.issues[0].line).toBe(6);
    // 口径（REV-020 low#2）：起行 + 区间内行 + 止行 = 5
    expect(r.suppressedLines).toBe(5);

    // ★ REV-020 low#1：嵌套 start 不覆盖外层 regionStart；区间内自闭合 start+end 不提前关闭外层
    const nested = lint([
      '<!-- lint-req:ignore-start -->', // L1 外层起
      '`stage deps`', // L2
      '<!-- lint-req:ignore-start -->', // L3 嵌套 start（no-op）
      '`stage reset`', // L4
      '<!-- lint-req:ignore-start --><!-- lint-req:ignore-end -->', // L5 自闭合（不得关闭外层）
      '`stage remove`', // L6 仍应被抑制
      '<!-- lint-req:ignore-end -->', // L7 外层止
      '`stage deps`', // L8 区间外 → 报
    ].join('\n'));
    expect(nested.issues).toHaveLength(1);
    expect(nested.issues[0].line).toBe(8);
    expect(nested.unclosedRegions).toEqual([]);
    expect(nested.suppressedLines).toBe(7);
  });

  it('T13：未闭合区间 → 延续到 EOF 且**不许静默**（REV-011）', () => {
    const content = [
      '<!-- lint-req:ignore-start -->',
      '`stage deps`',
      '`archive create`',
      '无 end 直到文件末尾',
    ].join('\n');
    const r = lint(content);
    expect(r.issues).toEqual([]);
    expect(r.unclosedRegions).toHaveLength(1);
    expect(r.unclosedRegions[0]).toEqual({ path: '.openfeel/requirements/REQ-999.md', line: 1 });
    expect(r.suppressedLines).toBeGreaterThan(0);
  });

  it('T14：孤 `ignore-end` 不报错、不改变后续判定、也不计入抑制行数', () => {
    const content = ['<!-- lint-req:ignore-end -->', '`stage deps`'].join('\n');
    const r = lint(content);
    expect(r.issues).toHaveLength(1);
    expect(r.issues[0].line).toBe(2);
    expect(r.unclosedRegions).toEqual([]);
    // 口径：孤 end 行什么也没抑制 → 不计入（REV-020 low#2）
    expect(r.suppressedLines).toBe(0);
  });

  it('T15：标记区分大小写 + 写在反引号内不生效', () => {
    // 大写标记不生效
    const upper = lint('`stage deps` <!-- LINT-REQ:IGNORE -->');
    expect(upper.issues).toHaveLength(1);
    expect(upper.suppressedLines).toBe(0);

    // 标记写在反引号内 → 剥离行内代码后无标记 → 不抑制（同行真问题照报）
    const quoted = lint('`<!-- lint-req:ignore -->` 与 `stage deps`');
    expect(quoted.issues).toHaveLength(1);
    expect(quoted.issues[0].span).toBe('stage deps');
    expect(quoted.suppressedLines).toBe(0);
  });
});

describe('lint req core：排序与边界', () => {
  it('T16：排序确定性（各自 path 升序 → 同文件 line 升序）', () => {
    const files = [
      { path: '.openfeel/requirements/REQ-010.md', content: '`stage deps`\n`stage remove`' },
      { path: '.openfeel/requirements/REQ-002.md', content: '`stage reset`\n`flow review_add`' },
    ];
    const r = lintRequirementFiles(files, TREE, 'zh-CN');
    expect(r.issues.map((i) => `${i.path}#${i.line}`)).toEqual([
      '.openfeel/requirements/REQ-002.md#1',
      '.openfeel/requirements/REQ-002.md#2',
      '.openfeel/requirements/REQ-010.md#1',
      '.openfeel/requirements/REQ-010.md#2',
    ]);
    expect(r.files).toBe(2);
  });

  it('T19：空文件 / 无候选（不抛错、计零）', () => {
    const empty = lint('');
    expect(empty.files).toBe(1);
    expect(empty.candidates).toBe(0);
    expect(empty.issues).toEqual([]);
    expect(empty.suspects).toEqual([]);
    expect(empty.suppressedLines).toBe(0);
    expect(empty.unclosedRegions).toEqual([]);

    const blank = lint('   \n\n\t\n');
    expect(blank.candidates).toBe(0);
    expect(blank.issues).toEqual([]);
  });

  it('T20：同行多候选（A+A 两条 issues；A+B 两键不串）', () => {
    const twoA = lint('`stage deps` 与 `archive create`');
    // REV-020：`archive create` 走「参数起点歧义」→ suspect，不再是 A
    expect(twoA.issues).toHaveLength(1);
    expect(twoA.suspects).toHaveLength(1);
    expect(twoA.issues.map((i) => i.line)).toEqual([1]);
    expect(twoA.suspects.map((i) => i.line)).toEqual([1]);

    const twoHardA = lint('`stage deps` 与 `archive create` 与 `stage reset`');
    expect(twoHardA.issues).toHaveLength(2);
    expect(twoHardA.issues.map((i) => i.line)).toEqual([1, 1]);

    const mixed = lint('`stage deps` 与 `op create`');
    expect(mixed.issues).toHaveLength(1);
    expect(mixed.suspects).toHaveLength(1);
    expect(mixed.unknownCount).toBe(1);
    expect(mixed.suspectCount).toBe(1);
  });

  it('T21：REV-020 参数起点判定（11 条期望行为表，表驱动）', () => {
    const rows: Array<{ span: string; want: 'pass' | 'A' | 'B'; breakAt?: string }> = [
      { span: 'openfeel stage set stage-01 --workflow-mode full', want: 'pass' },
      { span: 'openfeel config set-lang en', want: 'pass' },
      { span: 'openfeel config get workflow_mode', want: 'pass' },
      { span: 'openfeel model get openfeel-executor', want: 'pass' },
      { span: 'openfeel req add lint-check', want: 'pass' },
      { span: 'openfeel archive create', want: 'B', breakAt: 'create' },
      { span: 'openfeel knowledge search lint', want: 'B', breakAt: 'lint' },
      { span: 'stage deps', want: 'A', breakAt: 'stage' },
      { span: 'flow config_sync_stage', want: 'A', breakAt: 'flow' },
      { span: 'flow review_add', want: 'A', breakAt: 'flow' },
      { span: 'flow stats --json', want: 'A', breakAt: 'flow' },
    ];
    for (const row of rows) {
      const r = lint(`\`${row.span}\``);
      const label = row.span;
      if (row.want === 'pass') {
        expect(r.issues, label).toEqual([]);
        expect(r.suspects, label).toEqual([]);
      } else if (row.want === 'A') {
        expect(r.issues, label).toHaveLength(1);
        expect(r.suspects, label).toEqual([]);
        expect(r.issues[0].span, label).toBe(row.span);
        expect(r.issues[0].breakAt, label).toBe(row.breakAt);
      } else {
        expect(r.issues, label).toEqual([]);
        expect(r.suspects, label).toHaveLength(1);
        expect(r.suspects[0].span, label).toBe(row.span);
        expect(r.suspects[0].breakAt, label).toBe(row.breakAt);
        expect(r.suspects[0].message, label).toContain('疑似把参数写成命令名');
      }
    }
  });
});
