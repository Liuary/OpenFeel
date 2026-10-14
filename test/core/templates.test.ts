/**
 * 模板口径测试（stage-50 op-006 T53/T54/T55）
 * 断言部署型 skill 双口径、agents-md 图注英文化、cli-usage 枚举/命令表补齐。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getCurrentTemplate } from '../../src/core/templates.js';

const ROOT = process.cwd();
const SKILLS_DIR = join(ROOT, 'src', 'core', 'templates-data', 'skills');
const SKILLS = ['openfeel-cli-usage', 'openfeel-wizard', 'openfeel-health', 'openfeel-model-check', 'openfeel-recover', 'openfeel-req'];

/** EOL 归一（CRLF/CR → LF；先例 templates-migration.test.ts:24）——stage-84 跨 harness 切片比较防 CRLF 伪失败（REV-84-011） */
const norm = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

describe('模板口径（stage-50 op-006 T53/T54/T55）', () => {
  it('T53：6 skill 模板 node bin 仅出现在加注行（每文件 1 处）且含加注、主口径为 openfeel', () => {
    for (const s of SKILLS) {
      const content = readFileSync(join(SKILLS_DIR, s, 'SKILL.md'), 'utf-8');
      const count = (content.match(/node bin\/openfeel\.js/g) ?? []).length;
      expect(count, `${s} node bin 计数`).toBe(1);
      expect(content, `${s} 缺少本仓自举加注`).toContain('本仓自举');
      expect(content, `${s} 主口径缺失`).toMatch(/`openfeel /);
    }
  });

  it('T54：agents-md en 图注并列英文；zh/en 图体行数一致', () => {
    const en = readFileSync(join(ROOT, 'src', 'core', 'templates-data', 'agents-md', 'en.md'), 'utf-8');
    const zh = readFileSync(join(ROOT, 'src', 'core', 'templates-data', 'agents-md', 'zh-CN.md'), 'utf-8');
    // en 图注为纯英文（stage-56：旧中英并列「验收不通过 / review failed」→ 纯英文 acceptance rejected）
    expect(en).toContain('acceptance rejected');
    // 抽取含 pending/open 的代码块，zh/en 图体行数一致（图示未错位）
    const block = (text: string): string[] => {
      const lines = text.split('\n');
      const idx = lines.findIndex((l) => l.includes('pending/open'));
      let start = idx;
      while (start >= 0 && !lines[start].startsWith('```')) start--;
      let end = idx;
      while (end < lines.length && !(end > idx && lines[end].startsWith('```'))) end++;
      return lines.slice(start, end + 1);
    };
    expect(block(en).length).toBe(block(zh).length);
  });

  it('T55：cli-usage 枚举含 phases/stage；命令表覆盖 16 命令族', () => {
    const c = readFileSync(join(SKILLS_DIR, 'openfeel-cli-usage', 'SKILL.md'), 'utf-8');
    expect(c).toContain('`phases`');
    expect(c).toContain('`stage`');
    for (const fam of ['archive', 'view', 'project', 'roadmap', 'instructions']) {
      expect(c, `缺少命令族 ${fam}`).toContain(`openfeel ${fam}`);
    }
  });
});

/**
 * stage-53 D2（op-005 D10-2）：current.md 模板迭代
 * 新骨架：用户级整体信息 + 近期提交记录（≤5）+ current_archive 自动归档。
 */
describe('stage-53 D2：current.md 模板迭代', () => {
  it('zh 模板不含旧「团队成员进度」「暂无活跃成员」，含「近期提交记录」与 current_archive', () => {
    const zh = getCurrentTemplate('zh-CN');
    expect(zh).not.toContain('团队成员进度');
    expect(zh).not.toContain('暂无活跃成员');
    expect(zh).toContain('近期提交记录');
    expect(zh).toContain('current_archive');
  });

  it('en 模板不含 Team Member Progress，含 Recent Submissions 与 current_archive', () => {
    const en = getCurrentTemplate('en');
    expect(en).not.toContain('Team Member Progress');
    expect(en).toContain('Recent Submissions');
    expect(en).toContain('current_archive');
  });
});

/**
 * stage-55 op-003：项目级受管资产移除防回归
 * ① 仓库根不再保留项目级部署资产（AGENTS.md / opencode.jsonc / .opencode/{agents,skills,ADAPTER.md}）；
 * ② build.js 源码不含自举重生成函数（防复活静态断言）。
 */
describe('stage-55：项目级受管资产移除（防回归）', () => {
  it('仓库根不存在项目级受管资产（AGENTS.md / opencode.jsonc / .opencode/{agents,skills,ADAPTER.md}）', () => {
    for (const rel of [
      'AGENTS.md',
      'opencode.jsonc',
      '.opencode/agents',
      '.opencode/skills',
      '.opencode/ADAPTER.md',
    ]) {
      expect(existsSync(join(ROOT, rel)), rel).toBe(false);
    }
  });

  it('build.js 源码不含自举重生成函数与生成物标记助手（防复活静态断言）', () => {
    const src = readFileSync(join(ROOT, 'build.js'), 'utf-8');
    expect(src).not.toContain('regenerateOpencodeInstance');
    expect(src).not.toContain('insertGeneratedMark');
  });
});

/**
 * stage-69：Claude 独立内容源树结构 + 防发散（源文件级，直读 templates-data/claude/**）
 * ① agents/{zh-CN,en} 各 9 个 .md（含 feel + 8 openfeel-*）；
 * ② constraint/{zh-CN,en}.md 存在；
 * ③ claude/skills 不存在（skills 走中立共享源，不复制，防发散）。
 */
describe('Claude 源树（stage-69）', () => {
  const CLAUDE_DIR = join(ROOT, 'src', 'core', 'templates-data', 'claude');

  it('agents/{zh-CN,en} 各 9 个 .md', () => {
    for (const lang of ['zh-CN', 'en']) {
      const dir = join(CLAUDE_DIR, 'agents', lang);
      const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
      expect(files, `${lang} agent 数`).toHaveLength(9);
    }
  });

  it('constraint/{zh-CN,en}.md 存在', () => {
    for (const lang of ['zh-CN', 'en']) {
      expect(existsSync(join(CLAUDE_DIR, 'constraint', `${lang}.md`)), `${lang}.md`).toBe(true);
    }
  });

  it('claude/skills 不存在（skills 走共享源，防发散）', () => {
    expect(existsSync(join(CLAUDE_DIR, 'skills'))).toBe(false);
  });
});

/**
 * stage-70：共享 skills 中立化（双平台分节 + opencode 关键串零回归 +
 * `claude/claude.json` 纠错 + 工具名映射键集）。断言直读共享源 `templates-data/skills/**`。
 */
describe('共享 skills 中立化（stage-70）', () => {
  const REWRITE = ['openfeel-agent-model-check', 'openfeel-model-config', 'openfeel-model-check', 'openfeel-cli-usage'];
  const OPENCODE_STRINGS: Record<string, string[]> = {
    'openfeel-agent-model-check': ['~/.local/share/opencode/auth.json', 'opencode.jsonc', '必须重启 opencode'],
    'openfeel-model-config': ['opencode.jsonc', '必须重启 opencode',
      'openfeel model set/get/list --scope default|global|project', '项目 agents frontmatter > 全局 agents frontmatter'],
    'openfeel-model-check': ['opencode.jsonc', '.opencode/agents/', 'OpenCode（当前适配器）'],
    'openfeel-cli-usage': ['重启 harness（opencode）', 'external_directory: "allow"', '.opencode/agent/<name>.md'],
  };

  it('T4.1 4 重写 skill 双平台小节并存', () => {
    for (const s of REWRITE) {
      const c = readFileSync(join(SKILLS_DIR, s, 'SKILL.md'), 'utf-8');
      expect(c, `${s} 缺 opencode 小节`).toContain('### opencode 适配器');
      expect(c, `${s} 缺 Claude 小节`).toContain('### Claude Code 适配器');
    }
  });

  it('T4.2 opencode 关键串零回归', () => {
    for (const s of REWRITE) {
      const c = readFileSync(join(SKILLS_DIR, s, 'SKILL.md'), 'utf-8');
      for (const str of OPENCODE_STRINGS[s]) expect(c, `${s} 丢失 ${str}`).toContain(str);
    }
  });

  it('T4.3 纠错：openfeel-model-check 不再含 claude/claude.json', () => {
    const c = readFileSync(join(SKILLS_DIR, 'openfeel-model-check', 'SKILL.md'), 'utf-8');
    expect(c).not.toContain('claude/claude.json');
    expect(c).toContain('~/.claude/CLAUDE.md');
  });

  it('T4.4 openfeel-tool-usage 工具名映射键集齐备', () => {
    const c = readFileSync(join(SKILLS_DIR, 'openfeel-tool-usage', 'SKILL.md'), 'utf-8');
    const oc = ['bash', 'read', 'write', 'edit', 'glob', 'grep', 'todowrite', 'skill', 'task', 'question'];
    const cc = ['Bash', 'Read', 'Write', 'Edit', 'Glob', 'Grep', 'TodoWrite', 'Skill', 'Task', 'AskUserQuestion'];
    for (const k of [...oc, ...cc]) expect(c, `映射表缺 ${k}`).toContain(k);
  });
});

/**
 * stage-76：模板与 skill 模式感知（fast 快线）——T4 断言面
 * S1 feel.md ×4 模式小节对称 / S2 subagent 24 份对称 + opencode 零回归 /
 * S3 约束层模式注记（agents-md 侧）/ S4 阴性「无 fast 跳过骨架/文件」。
 * 断言直读源文件 `templates-data/**`（源为唯一可改面，防未注入源假绿）。
 */
describe('stage-76：feel.md ×4 模式小节对称（T4-1/T4-2）', () => {
  const TD = join(ROOT, 'src', 'core', 'templates-data');
  const FEEL_ZH = [join(TD, 'opencode', 'agents', 'zh-CN', 'feel.md'), join(TD, 'claude', 'agents', 'zh-CN', 'feel.md')];
  const FEEL_EN = [join(TD, 'opencode', 'agents', 'en', 'feel.md'), join(TD, 'claude', 'agents', 'en', 'feel.md')];
  const ZH = ['工作流快线', '不派发 schemer / tester', '计划审查单轮，必经', '必跑两处', 'plan_pending → plan_review → plan_passed', '合法相位枚举 15 项不变', '单轮', '术语消歧', '仍为合法相位', '仅不可达', '其余骨架规则全量不变'];
  const EN = ['Workflow Fast Line', 'does not dispatch openfeel-schemer / openfeel-feel-tester', 'single mandatory plan review', 'plan_pending → plan_review → plan_passed', 'remains at 15', 'runs twice', 'single round', 'Terminology disambiguation', 'remains a legal phase', 'unreachable (no inbound edge)', 'all other skeleton rules are unchanged'];

  it('zh ×2 模式小节关键串齐备 + 骨架注记', () => {
    for (const p of FEEL_ZH) {
      const c = norm(readFileSync(p, 'utf-8'));
      for (const s of ZH) expect(c, `${p} 缺 ${s}`).toContain(s);
    }
  });

  it('en ×2 模式小节关键串齐备 + 骨架注记', () => {
    for (const p of FEEL_EN) {
      const c = norm(readFileSync(p, 'utf-8'));
      for (const s of EN) expect(c, `${p} 缺 ${s}`).toContain(s);
    }
  });

  it('骨架句零回归（原句前半逐字保留）+ 自动推进决策纪律节存在', () => {
    const zhAnchor = '关键操作（推进到 exec_running / review_pending / test_pending / archiving）时，流水线会自动在私域日志目录创建带日期前缀的骨架文件';
    const enAnchor = 'During critical operations (advancing to exec_running / review_pending / test_pending / archiving), the pipeline automatically creates skeleton files with date prefixes in the private log directory';
    for (const p of FEEL_ZH) {
      const c = norm(readFileSync(p, 'utf-8'));
      expect(c, `${p} 骨架句零回归`).toContain(zhAnchor);
      expect(c, `${p} 缺自动推进决策纪律`).toContain('自动推进决策纪律');
    }
    for (const p of FEEL_EN) {
      const c = norm(readFileSync(p, 'utf-8'));
      expect(c, `${p} 骨架句零回归`).toContain(enAnchor);
      expect(c, `${p} 缺 Auto-Advance Decision Rules`).toContain('Auto-Advance Decision Rules');
    }
  });
});

/**
 * stage-76 S2：subagent 24 份模式感知对称（6 类 × {opencode,claude} × {zh,en}）
 * + opencode 关键串零回归（抽样，原文逐字）。
 */
describe('stage-76：subagent 24 份模式感知对称 + opencode 零回归（T4-6 ①）', () => {
  const TD = join(ROOT, 'src', 'core', 'templates-data');
  const CLASSES = ['openfeel-planner', 'openfeel-executor', 'openfeel-reviewer', 'openfeel-archiver', 'openfeel-schemer', 'openfeel-feel-tester'];
  const ZH: Record<string, string[]> = {
    'openfeel-planner': ['本 Agent 产出后必经 openfeel-reviewer 的计划审查', '不得省略'],
    'openfeel-executor': ['可达 ≠ 合法', 'plan_pending → plan_review → plan_passed → exec_running', 'review_failed → exec_running'],
    'openfeel-reviewer': ['单轮', '质量底线不变', '必经', '术语消歧', '不同机制'],
    'openfeel-archiver': ['轻量归档', '知识暂存判定', '可达 ≠ 合法'],
    'openfeel-schemer': ['不被调度'],
    'openfeel-feel-tester': ['不被调度', '不可达'],
  };
  const EN: Record<string, string[]> = {
    'openfeel-planner': ["must pass openfeel-reviewer's plan review", 'must not be omitted'],
    'openfeel-executor': ['reachable ≠ legal', 'plan_pending → plan_review → plan_passed → exec_running', 'review_failed → exec_running'],
    'openfeel-reviewer': ['single round', 'quality floor is unchanged', 'mandatory', 'Terminology disambiguation', 'different mechanisms'],
    'openfeel-archiver': ['lightweight archiving', 'knowledge-staging decision', 'reachable ≠ legal'],
    'openfeel-schemer': ['not dispatched'],
    'openfeel-feel-tester': ['not dispatched', 'unreachable'],
  };

  it('6 类 × {opencode,claude} × {zh,en} 关键串齐备（harness 内 zh/en 成对）', () => {
    for (const cls of CLASSES) {
      for (const h of ['opencode', 'claude']) {
        const zh = readFileSync(join(TD, h, 'agents', 'zh-CN', `${cls}.md`), 'utf-8');
        for (const s of ZH[cls]) expect(zh, `${h}/zh-CN/${cls} 缺 ${s}`).toContain(s);
        const en = readFileSync(join(TD, h, 'agents', 'en', `${cls}.md`), 'utf-8');
        for (const s of EN[cls]) expect(en, `${h}/en/${cls} 缺 ${s}`).toContain(s);
      }
    }
  });

  it('opencode 关键串零回归（抽样，原文逐字）', () => {
    const REG: Record<string, string[]> = {
      'openfeel-planner': ['产出经 openfeel-reviewer 审查后方可进入 openfeel-schemer 阶段'],
      'openfeel-executor': ['plan_pending | plan_review', 'test_passed | archiving | done'],
      'openfeel-reviewer': ['FAST-PASS-{NNN}'],
      'openfeel-archiver': ['VALID_TRANSITIONS'],
      'openfeel-feel-tester': ['快速验收'],
      'openfeel-schemer': ['op-NNN.md'],
    };
    for (const cls of CLASSES) {
      const c = readFileSync(join(TD, 'opencode', 'agents', 'zh-CN', `${cls}.md`), 'utf-8');
      for (const s of REG[cls]) expect(c, `opencode/zh-CN/${cls} 丢失 ${s}`).toContain(s);
    }
    expect(readFileSync(join(TD, 'opencode', 'agents', 'en', 'openfeel-planner.md'), 'utf-8')).toContain('Outputs must pass openfeel-reviewer review before entering the openfeel-schemer phase');
    expect(readFileSync(join(TD, 'opencode', 'agents', 'en', 'openfeel-feel-tester.md'), 'utf-8')).toContain('Fast-Track Acceptance');
  });
});

/**
 * stage-76 S3：全局约束层模式注记（agents-md 侧；zh/en 各两处 L18/L81）。
 */
describe('stage-76：约束层模式注记（T4-6 ②，agents-md 侧）', () => {
  const TD = join(ROOT, 'src', 'core', 'templates-data');

  it('agents-md zh 含 fast 注记（L18/L81）+ full 零回归', () => {
    const c = readFileSync(join(TD, 'agents-md', 'zh-CN.md'), 'utf-8');
    expect(c).toContain('fast 工作流快线');
    expect(c).toContain('planner → 计划审查（reviewer，单轮必经）→ executor → 代码审查（reviewer）→ archiver');
    expect(c).toContain('fast 工作流快线下为 计划 → 计划审查 → 执行 → 代码审查 → 归档');
    expect(c).toContain('完整流水线（openfeel-planner → openfeel-schemer → openfeel-executor → openfeel-reviewer → openfeel-feel-tester）');
  });

  it('agents-md en 含 fast 注记（L18/L81）+ full 零回归', () => {
    const c = readFileSync(join(TD, 'agents-md', 'en.md'), 'utf-8');
    expect(c).toContain('in fast mode: planner → plan review (reviewer, single mandatory round) → executor → code review (reviewer) → archiver');
    expect(c).toContain('in fast mode: plan → plan review → execute → code review → archive');
    expect(c).toContain('Full pipeline (openfeel-planner → openfeel-schemer → openfeel-executor → openfeel-reviewer → openfeel-feel-tester)');
  });
});

/**
 * stage-76 S4：阴性断言——无「fast 跳过骨架/文件/相位」表述（T4-3）。
 * 扫描集 = 4 feel.md + 24 subagent + 4 约束层 + 5 skill = 37 份（直读源文件）。
 * 防误伤：仅锁「骨架/文件/相位」组合词，不列泛词「跳过」（既有合法语义）。
 */
describe('stage-76：阴性断言——无「fast 跳过骨架/文件」表述（T4-3）', () => {
  const TD = join(ROOT, 'src', 'core', 'templates-data');
  const CLASSES = ['openfeel-planner', 'openfeel-executor', 'openfeel-reviewer', 'openfeel-archiver', 'openfeel-schemer', 'openfeel-feel-tester'];
  const SKILLS5 = ['openfeel-cli-usage', 'openfeel-get-stage-status', 'openfeel-update-stage-status', 'openfeel-wizard', 'openfeel-recover'];
  const files: string[] = [];
  for (const lang of ['zh-CN', 'en']) {
    for (const h of ['opencode', 'claude']) {
      files.push(join(TD, h, 'agents', lang, 'feel.md'));
      for (const cls of CLASSES) files.push(join(TD, h, 'agents', lang, `${cls}.md`));
    }
  }
  for (const lang of ['zh-CN', 'en']) {
    files.push(join(TD, 'agents-md', `${lang}.md`));
    files.push(join(TD, 'claude', 'constraint', `${lang}.md`));
  }
  for (const s of SKILLS5) files.push(join(TD, 'skills', s, 'SKILL.md'));
  const BANNED = ['跳过骨架', '跳过文件', '跳过相位', '删除相位', '相位变少', '相位减少', 'skips skeleton', 'skips file', 'skips phase', 'deletes phase', 'fewer phases'];

  it('37 份模板/skill 均不含禁用表述', () => {
    expect(files).toHaveLength(37);
    for (const p of files) {
      const c = norm(readFileSync(p, 'utf-8'));
      for (const s of BANNED) expect(c, `${p} 含禁用串 ${s}`).not.toContain(s);
    }
  });
});

/**
 * stage-84：Agent/skill 契约（双主题）——T4 断言面
 * S1 8 份模板需求/归档节存在性 + 逐字串；S2 跨 harness 对称（提取式切片 toBe）；
 * S3 opencode 零回归 + 阴性；S4 新 skill openfeel-req 要点；S5 cli-usage 补节与计数订正。
 * 断言直读源文件 templates-data/** 与共享源 skills/**（源为唯一可改面，防未注入源假绿）。
 * 断言串纪律：取词法稳定、不跨越粗体边界的子串；允许整体含 `**` 的原样串（kb #断言串与落文逐字核对纪律）。
 */
describe('stage-84：feel.md ×4 需求与归档纪律（S1/S2/S3）', () => {
  const TD = join(ROOT, 'src', 'core', 'templates-data');
  const FEEL_ZH = [join(TD, 'opencode', 'agents', 'zh-CN', 'feel.md'), join(TD, 'claude', 'agents', 'zh-CN', 'feel.md')];
  const FEEL_EN = [join(TD, 'opencode', 'agents', 'en', 'feel.md'), join(TD, 'claude', 'agents', 'en', 'feel.md')];
  const H_REQ_ZH = '#### 需求流转（requirement lifecycle）';
  const H_ARCH_ZH = '#### 归档与历史读取';
  const H_REQ_EN = '#### Requirement Lifecycle';
  const H_ARCH_EN = '#### Archiving and History Reading';
  const ZH = ['需求 = 排期与调度层', '需求不等于计划', '7 个状态', '阶段 phase → 需求状态',
    'openfeel req board', 'openfeel req next', 'openfeel req claim <REQ-NNN>',
    'openfeel req link --stage <stageId> --requirement <REQ-NNN>',
    'openfeel req advance <REQ-NNN> --to <status>', 'openfeel req release <REQ-NNN>',
    '正交注记', '不主动读归档文件', 'openfeel flow archive <version>',
    'openfeel flow archive show <version>', 'openfeel flow archive list', 'flow-archive/**'];
  const EN = ['a requirement is the scheduling layer', 'a requirement is not a plan', '7 statuses',
    'stage phase → requirement status', 'openfeel req board', 'openfeel req next',
    'openfeel req claim <REQ-NNN>', 'openfeel req link --stage <stageId> --requirement <REQ-NNN>',
    'openfeel req advance <REQ-NNN> --to <status>', 'openfeel req release <REQ-NNN>',
    'Orthogonality note', 'Never read archive files proactively', 'openfeel flow archive <version>',
    'openfeel flow archive show <version>', 'openfeel flow archive list', 'flow-archive/**'];
  const NEG = ['跳过流水线', '绕过流水线', 'bypass the pipeline', '需求即计划', 'a requirement is a plan'];

  /** 提取节切片：标题行 → 下一个 markdown 标题行（不含；防行号漂移） */
  const extractSection = (text: string, heading: string): string => {
    const lines = text.split('\n');
    const start = lines.findIndex((l) => l.startsWith(heading));
    if (start < 0) { return ''; }
    const rest = lines.slice(start + 1);
    const stop = rest.findIndex((l) => /^#{1,6} /.test(l));
    return [lines[start], ...(stop < 0 ? rest : rest.slice(0, stop))].join('\n');
  };

  it('S1 zh ×2：两节标题齐备 + 逐字串全命中', () => {
    for (const p of FEEL_ZH) {
      const c = norm(readFileSync(p, 'utf-8'));
      expect(c, `${p} 缺 ${H_REQ_ZH}`).toContain(H_REQ_ZH);
      expect(c, `${p} 缺 ${H_ARCH_ZH}`).toContain(H_ARCH_ZH);
      for (const s of ZH) expect(c, `${p} 缺 ${s}`).toContain(s);
    }
  });
  it('S1 en ×2：两节标题齐备 + 逐字串全命中', () => {
    for (const p of FEEL_EN) {
      const c = norm(readFileSync(p, 'utf-8'));
      expect(c, `${p} 缺 ${H_REQ_EN}`).toContain(H_REQ_EN);
      expect(c, `${p} 缺 ${H_ARCH_EN}`).toContain(H_ARCH_EN);
      for (const s of EN) expect(c, `${p} 缺 ${s}`).toContain(s);
    }
  });
  it('S1 裸主语零出现（新节切片不含 Feel / 主会话）', () => {
    for (const [p, hs] of [[FEEL_ZH[0], [H_REQ_ZH, H_ARCH_ZH]], [FEEL_EN[0], [H_REQ_EN, H_ARCH_EN]]] as const) {
      const c = norm(readFileSync(p, 'utf-8'));
      for (const h of hs) {
        const block = extractSection(c, h);
        expect(block.length, `${h} 切片非空`).toBeGreaterThan(0);
        expect(block, `${h} 裸主语 Feel`).not.toContain('Feel');
        expect(block, `${h} 裸主语 主会话`).not.toContain('主会话');
      }
    }
  });
  it('S2 跨 harness 切片逐字一致（zh ×2 节 + en ×2 节）', () => {
    const pairs: Array<[string[], string]> = [[FEEL_ZH, H_REQ_ZH], [FEEL_ZH, H_ARCH_ZH], [FEEL_EN, H_REQ_EN], [FEEL_EN, H_ARCH_EN]];
    for (const [files, h] of pairs) {
      const oc = extractSection(norm(readFileSync(files[0], 'utf-8')), h);
      const cc = extractSection(norm(readFileSync(files[1], 'utf-8')), h);
      expect(oc.length, `${h} opencode 切片非空`).toBeGreaterThan(0);
      expect(cc.length, `${h} claude 切片非空`).toBeGreaterThan(0);
      expect(cc, `${h} 跨 harness 逐字一致`).toBe(oc);
    }
  });
  it('S3 opencode 零回归 + 阴性（8 切片）', () => {
    const ocZh = norm(readFileSync(FEEL_ZH[0], 'utf-8'));
    for (const s of ['#### 工作流模式（workflow_mode）', '术语消歧', '工作流快线', '自动推进决策纪律', '## 小改 vs 大规模规划的阈值']) {
      expect(ocZh, `零回归缺 ${s}`).toContain(s);
    }
    const ocEn = norm(readFileSync(FEEL_EN[0], 'utf-8'));
    for (const s of ['#### Workflow Mode (workflow_mode)', 'Terminology disambiguation', 'Auto-Advance Decision Rules', '## Threshold for Small Changes vs. Large-Scale Planning']) {
      expect(ocEn, `零回归缺 ${s}`).toContain(s);
    }
    for (const [files, hs] of [[FEEL_ZH, [H_REQ_ZH, H_ARCH_ZH]], [FEEL_EN, [H_REQ_EN, H_ARCH_EN]]] as const) {
      for (const p of files) {
        const c = norm(readFileSync(p, 'utf-8'));
        for (const h of hs) {
          const block = extractSection(c, h);
          for (const s of NEG) expect(block, `${p}/${h} 含禁用串 ${s}`).not.toContain(s);
        }
      }
    }
  });
});

describe('stage-84：openfeel-planner.md ×4 需求感知（S1/S2/S3）', () => {
  const TD = join(ROOT, 'src', 'core', 'templates-data');
  const PL_ZH = [join(TD, 'opencode', 'agents', 'zh-CN', 'openfeel-planner.md'), join(TD, 'claude', 'agents', 'zh-CN', 'openfeel-planner.md')];
  const PL_EN = [join(TD, 'opencode', 'agents', 'en', 'openfeel-planner.md'), join(TD, 'claude', 'agents', 'en', 'openfeel-planner.md')];
  const H_ZH = '## 需求感知';
  const H_EN = '## Requirement Awareness';
  const ZH = ['openfeel req show <REQ-NNN>', '关联需求：REQ-NNN', '流转不在本 Agent 职责内', '与「工作流模式感知」正交'];
  const EN = ['openfeel req show <REQ-NNN>', 'Linked requirement: REQ-NNN', "Flow is not this agent's duty", 'Orthogonal to "Workflow Mode Awareness"'];
  const NEG = ['跳过流水线', '绕过流水线', 'bypass the pipeline', '需求即计划', 'a requirement is a plan'];

  /** 提取节切片：标题行 → 下一个 markdown 标题行（不含；防行号漂移） */
  const extractSection = (text: string, heading: string): string => {
    const lines = text.split('\n');
    const start = lines.findIndex((l) => l.startsWith(heading));
    if (start < 0) { return ''; }
    const rest = lines.slice(start + 1);
    const stop = rest.findIndex((l) => /^#{1,6} /.test(l));
    return [lines[start], ...(stop < 0 ? rest : rest.slice(0, stop))].join('\n');
  };

  it('S1 zh ×2 / en ×2：节标题齐备 + 逐字串全命中', () => {
    for (const [files, h, needles] of [[PL_ZH, H_ZH, ZH], [PL_EN, H_EN, EN]] as const) {
      for (const p of files) {
        const c = norm(readFileSync(p, 'utf-8'));
        expect(c, `${p} 缺 ${h}`).toContain(h);
        for (const s of needles) expect(c, `${p} 缺 ${s}`).toContain(s);
      }
    }
  });
  it('S2 跨 harness 切片逐字一致（zh / en 各 1 节）', () => {
    for (const [files, h] of [[PL_ZH, H_ZH], [PL_EN, H_EN]] as const) {
      const oc = extractSection(norm(readFileSync(files[0], 'utf-8')), h);
      const cc = extractSection(norm(readFileSync(files[1], 'utf-8')), h);
      expect(oc.length, `${h} 切片非空`).toBeGreaterThan(0);
      expect(cc, `${h} 跨 harness 逐字一致`).toBe(oc);
    }
  });
  it('S3 opencode 零回归 + 阴性', () => {
    const ocZh = norm(readFileSync(PL_ZH[0], 'utf-8'));
    for (const s of ['## 工作流模式感知（fast 快线）', '产出经 openfeel-reviewer 审查后方可进入 openfeel-schemer 阶段']) {
      expect(ocZh, `零回归缺 ${s}`).toContain(s);
    }
    const ocEn = norm(readFileSync(PL_EN[0], 'utf-8'));
    for (const s of ['## Workflow Mode Awareness (fast)', 'Outputs must pass openfeel-reviewer review before entering the openfeel-schemer phase']) {
      expect(ocEn, `零回归缺 ${s}`).toContain(s);
    }
    for (const [files, h] of [[PL_ZH, H_ZH], [PL_EN, H_EN]] as const) {
      for (const p of files) {
        const block = extractSection(norm(readFileSync(p, 'utf-8')), h);
        expect(block.length, `${p} 切片非空`).toBeGreaterThan(0);
        expect(block, `${p} 裸主语 Feel`).not.toContain('Feel');
        expect(block, `${p} 裸主语 主会话`).not.toContain('主会话');
        for (const s of NEG) expect(block, `${p} 含禁用串 ${s}`).not.toContain(s);
      }
    }
  });
});

describe('stage-84：新 skill openfeel-req + cli-usage 补节（S4/S5）', () => {
  const REQ_SKILL = join(SKILLS_DIR, 'openfeel-req', 'SKILL.md');
  const CLI_SKILL = join(SKILLS_DIR, 'openfeel-cli-usage', 'SKILL.md');
  it('S4 新 skill 存在、非空且要点齐备（frontmatter 触发词 / 7 状态 / 11 子命令 / 认领协议 / 权威源 / 正交 / 快照声明 / 版本解绑 / 并行接取）', () => {
    expect(existsSync(REQ_SKILL), 'openfeel-req/SKILL.md 存在').toBe(true);
    const c = readFileSync(REQ_SKILL, 'utf-8');
    expect(c.length, '防假绿').toBeGreaterThan(0);
    for (const s of ['name: openfeel-req', '需求', 'requirement', 'REQ', 'req 命令',
      '## 需求生命周期（7 状态）', '## 子命令（11 个）', '## 认领协议', '机读权威恒为',
      '与计划（plan.md）的关系', '与 workflow_mode 正交', 'v1.2.0 起提供', '以 `openfeel req --help`',
      '## 需求与版本解绑', '## 并行接取', '版本号仅在发布时推进', '不绑版本']) {
      expect(c, `缺 ${s}`).toContain(s);
    }
    for (const sub of ['add', 'list', 'show', 'claim', 'release', 'set', 'link', 'advance', 'board', 'next', 'split']) {
      expect(c, `缺子命令 req ${sub}`).toContain(`req ${sub}`);
    }
  });
  it('S5 cli-usage 补节 + 计数订正 + 快照声明更新', () => {
    const c = readFileSync(CLI_SKILL, 'utf-8');
    for (const s of ['## v1.2.0 新增能力（stage-78~84）', 'openfeel flow archive <version>',
      'openfeel flow archive list', 'openfeel flow archive show <version>', '阶段摘要归档',
      '10 子命令', 'openfeel-req', 'openfeel req', '**18 个**共享源', '本文档为 v1.2.0 快照']) {
      expect(c, `缺 ${s}`).toContain(s);
    }
    expect(c, '陈旧 17 残留').not.toContain('**17 个**共享源');
    expect(c, '旧快照声明残留').not.toContain('本文档为 v1.1.7 快照');
    expect((c.match(/node bin\/openfeel\.js/g) ?? []).length, 'T53 自举加注恒 1').toBe(1);
  });
});
