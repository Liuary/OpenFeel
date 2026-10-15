/**
 * 模板口径测试（stage-50 op-006 T53/T54/T55）
 * 断言部署型 skill 双口径、agents-md 图注英文化、cli-usage 枚举/命令表补齐。
 */
import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { getCurrentTemplate } from '../../src/core/templates.js';
import { listAgentIds, listClaudeAgentIds } from '../../src/core/template-loader.js';

const ROOT = process.cwd();
const SKILLS_DIR = join(ROOT, 'src', 'core', 'templates-data', 'skills');
const SKILLS = ['openfeel-cli-usage', 'openfeel-wizard', 'openfeel-health', 'openfeel-model-check', 'openfeel-recover', 'openfeel-req', 'openfeel-delegation', 'openfeel-memory', 'openfeel-logging'];

/** EOL 归一（CRLF/CR → LF；先例 templates-migration.test.ts:24）——stage-84 跨 harness 切片比较防 CRLF 伪失败（REV-84-011） */
const norm = (s: string): string => s.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

describe('模板口径（stage-50 op-006 T53/T54/T55）', () => {
  it('T53：9 skill 模板 node bin 仅出现在加注行（每文件 1 处）且含加注、主口径为 openfeel', () => {
    for (const s of SKILLS) {
      const content = readFileSync(join(SKILLS_DIR, s, 'SKILL.md'), 'utf-8');
      const count = (content.match(/node bin\/openfeel\.js/g) ?? []).length;
      expect(count, `${s} node bin 计数`).toBe(1);
      expect(content, `${s} 缺少本仓自举加注`).toContain('本仓自举');
      expect(content, `${s} 主口径缺失`).toMatch(/`openfeel /);
    }
  });

  it('T54：生命周期图体下沉 openfeel-workspace skill；约束文件零图体（stage-91 结构性替换）', () => {
    const en = readFileSync(join(ROOT, 'src', 'core', 'templates-data', 'agents-md', 'en.md'), 'utf-8');
    const zh = readFileSync(join(ROOT, 'src', 'core', 'templates-data', 'agents-md', 'zh-CN.md'), 'utf-8');
    // 图体（含 pending/open 的代码块）随工作区结构节下沉 skill —— 约束文件零图体
    expect(zh.includes('pending/open'), '约束 zh 残留图体').toBe(false);
    expect(en.includes('pending/open'), '约束 en 残留图体').toBe(false);
    // skill 侧承载图体（正控，防整节误删）
    const skill = readFileSync(join(SKILLS_DIR, 'openfeel-workspace', 'SKILL.md'), 'utf-8');
    expect(skill).toContain('pending/open');
    expect(skill).toContain('验收不通过');
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
 * ① agents/{zh-CN,en} 各 10 个 .md（含 feel + 9 openfeel-*）；
 * ② constraint/{zh-CN,en}.md 存在；
 * ③ claude/skills 不存在（skills 走中立共享源，不复制，防发散）。
 */
describe('Claude 源树（stage-69）', () => {
  const CLAUDE_DIR = join(ROOT, 'src', 'core', 'templates-data', 'claude');

  it('agents/{zh-CN,en} 各 10 个 .md', () => {
    for (const lang of ['zh-CN', 'en']) {
      const dir = join(CLAUDE_DIR, 'agents', lang);
      const files = readdirSync(dir).filter((f) => f.endsWith('.md'));
      expect(files, `${lang} agent 数`).toHaveLength(10);
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
 * 扫描集 = 40 agent + 4 约束层 + 22 skill = 66 份（直读源文件；stage-91 op-004 D-91-15 全量扩面，原 37 份）。
 * 防误伤：仅锁「骨架/文件/相位」组合词，不列泛词「跳过」（既有合法语义）。
 */
describe('stage-76：阴性断言——无「fast 跳过骨架/文件」表述（T4-3）', () => {
  const TD = join(ROOT, 'src', 'core', 'templates-data');
  const CLASSES = ['openfeel-planner', 'openfeel-executor', 'openfeel-reviewer', 'openfeel-archiver', 'openfeel-schemer', 'openfeel-feel-tester'];
  // stage-91 op-004（D-91-15）：扫描集由 37 份扩面至**全量 66 份** = 40 agent + 4 约束 + 22 skill
  const files: string[] = [];
  for (const lang of ['zh-CN', 'en']) {
    for (const h of ['opencode', 'claude']) {
      files.push(join(TD, h, 'agents', lang, 'feel.md'));
      for (const cls of CLASSES) files.push(join(TD, h, 'agents', lang, `${cls}.md`));
      files.push(join(TD, h, 'agents', lang, 'openfeel-explorer.md'));
      files.push(join(TD, h, 'agents', lang, 'openfeel-utility.md'));
      files.push(join(TD, h, 'agents', lang, 'openfeel-vision.md'));
    }
  }
  for (const lang of ['zh-CN', 'en']) {
    files.push(join(TD, 'agents-md', `${lang}.md`));
    files.push(join(TD, 'claude', 'constraint', `${lang}.md`));
  }
  for (const d of readdirSync(join(TD, 'skills'), { withFileTypes: true })) {
    if (d.isDirectory()) files.push(join(TD, 'skills', d.name, 'SKILL.md'));
  }
  const BANNED = ['跳过骨架', '跳过文件', '跳过相位', '删除相位', '相位变少', '相位减少', 'skips skeleton', 'skips file', 'skips phase', 'deletes phase', 'fewer phases'];

  it('66 份模板/skill 均不含禁用表述', () => {
    expect(files).toHaveLength(66);
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
    '模式注记', '不主动读归档文件', 'openfeel flow archive <version>',
    'openfeel flow archive show <version>', 'openfeel flow archive list', 'flow-archive/**'];
  const EN = ['a requirement is the scheduling layer', 'a requirement is not a plan', '7 statuses',
    'stage phase → requirement status', 'openfeel req board', 'openfeel req next',
    'openfeel req claim <REQ-NNN>', 'openfeel req link --stage <stageId> --requirement <REQ-NNN>',
    'openfeel req advance <REQ-NNN> --to <status>', 'openfeel req release <REQ-NNN>',
    'Mode note', 'Never read archive files proactively', 'openfeel flow archive <version>',
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
  const ZH = ['openfeel req show <REQ-NNN>', '关联需求：REQ-NNN', '流转不在本 Agent 职责内', '与「工作流模式感知」的关系'];
  const EN = ['openfeel req show <REQ-NNN>', 'Linked requirement: REQ-NNN', "Flow is not this agent's duty", 'Relation to "Workflow Mode Awareness"'];
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
  it('S4 新 skill 存在、非空且要点齐备（frontmatter 触发词 / 7 状态 / 11 子命令 / 认领协议 / 权威源 / 模式关系 / 快照声明 / 版本解绑 / 并行接取）', () => {
    expect(existsSync(REQ_SKILL), 'openfeel-req/SKILL.md 存在').toBe(true);
    const c = readFileSync(REQ_SKILL, 'utf-8');
    expect(c.length, '防假绿').toBeGreaterThan(0);
    for (const s of ['name: openfeel-req', '需求', 'requirement', 'REQ', 'req 命令',
      '## 需求生命周期（7 状态）', '## 子命令（11 个）', '## 认领协议', '机读权威恒为',
      '与计划（plan.md）的关系', '与 workflow_mode 的关系', 'v1.2.0 起提供', '以 `openfeel req --help`',
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

/**
 * stage-88：调度与 Handoff 节（直接调度语义）
 * S1 节计数/切片正控/裸主语与 explorer 阴性/模型选择节位于其后；S2 跨 harness 切片逐字一致；S3 负向措辞 10 行。
 */
describe('stage-88：调度与 Handoff 节（直接调度语义）对称与阴性（S1/S2/S3）', () => {
  const TD = join(ROOT, 'src', 'core', 'templates-data');
  const IDS = ['openfeel-planner', 'openfeel-schemer', 'openfeel-reviewer', 'openfeel-archiver', 'openfeel-utility', 'openfeel-vision'];
  const H_ZH = '## 调度与 Handoff'; const H_EN = '## Dispatch and Handoff';
  const M_ZH = '## 模型选择'; const M_EN = '## Model Selection';
  const file = (h: string, lang: string, id: string) => join(TD, h, 'agents', lang, `${id}.md`);

  /** 提取节切片：标题行 → 下一个 markdown 标题行（不含；防行号漂移）——stage-84 S1 同款 */
  const extractSection = (text: string, heading: string): string => {
    const lines = text.split('\n');
    const start = lines.findIndex((l) => l.startsWith(heading));
    if (start < 0) { return ''; }
    const rest = lines.slice(start + 1);
    const stop = rest.findIndex((l) => /^#{1,6} /.test(l));
    return [lines[start], ...(stop < 0 ? rest : rest.slice(0, stop))].join('\n');
  };

  it('S1 节标题恰 1 处 + 切片非空 + 正控 + 裸主语零出现 + 模型选择节位于其后', () => {
    const combos = [['opencode', 'zh-CN', H_ZH, M_ZH], ['claude', 'zh-CN', H_ZH, M_ZH],
      ['opencode', 'en', H_EN, M_EN], ['claude', 'en', H_EN, M_EN]] as const;
    for (const id of IDS) {
      for (const [h, lang, H, M] of combos) {
        const c = norm(readFileSync(file(h, lang, id), 'utf-8'));
        expect((c.match(new RegExp(H, 'g')) ?? []).length, `${h}/${lang}/${id} 节计数`).toBe(1);
        const block = extractSection(c, H);
        expect(block.length, `${h}/${lang}/${id} 切片非空`).toBeGreaterThan(0);
        expect(block, `${h}/${lang}/${id} 缺 HANDOFF 标记`).toContain('[HANDOFF: agent_name]');
        expect(block, `${h}/${lang}/${id} 缺通用工作者名`).toContain('openfeel-executor');
        expect(block, `${h}/${lang}/${id} 裸主语 Feel`).not.toContain('Feel');
        expect(block, `${h}/${lang}/${id} 裸主语 主会话`).not.toContain('主会话');
        expect(block, `${h}/${lang}/${id} 裸主语 main session`).not.toContain('main session');
        expect(block, `${h}/${lang}/${id} 缺 explorer 正控`).toContain('openfeel-explorer');
        expect(c, `${h}/${lang}/${id} 缺 ${M}`).toContain(M);
        expect(c.indexOf(M), `${h}/${lang}/${id} 锚点错位`).toBeGreaterThan(c.indexOf(H));
      }
    }
  });

  it('S2 跨 harness 切片逐字一致（zh 6×2 + en 6×2）', () => {
    for (const id of IDS) {
      for (const [lang, H] of [['zh-CN', H_ZH], ['en', H_EN]] as const) {
        const oc = extractSection(norm(readFileSync(file('opencode', lang, id), 'utf-8')), H);
        const cc = extractSection(norm(readFileSync(file('claude', lang, id), 'utf-8')), H);
        expect(oc.length, `${lang}/${id} opencode 切片非空`).toBeGreaterThan(0);
        expect(cc, `${lang}/${id} 跨 harness 逐字一致`).toBe(oc);
      }
    }
  });

  it('S3 负向措辞规整 10 行：新表述在位 + 旧表述零残留（行级精确匹配）', () => {
    const UTIL = [['opencode', 'zh-CN', '4. 除直接调度通用工作者外，不调用其他 Agent', /^4\. 不调用其他 Agent$/m],
      ['opencode', 'en', '4. Do not invoke other Agents except for direct dispatch of general workers.', /^4\. Do not invoke other Agents\.$/m],
      ['claude', 'zh-CN', '4. 除直接调度通用工作者外，不调用其他 Agent', /^4\. 不调用其他 Agent$/m],
      ['claude', 'en', '4. Do not invoke other Agents except for direct dispatch of general workers.', /^4\. Do not invoke other Agents\.$/m]] as const;
    for (const [h, lang, pos, neg] of UTIL) {
      const c = norm(readFileSync(file(h, lang, 'openfeel-utility'), 'utf-8'));
      expect(c, `${h}/${lang} utility 新表述`).toContain(pos);
      expect(c, `${h}/${lang} utility 旧表述残留`).not.toMatch(neg);
    }
    const VIS = [['opencode', 'zh-CN', '- 除直接调度通用工作者外，不调用其他 Agent / subagent', /^- 不调用其他 Agent$/m],
      ['opencode', 'en', '- Does not invoke other Agents / subagents except for direct dispatch of general workers.', /^- Does not invoke other Agents$/m],
      ['claude', 'zh-CN', '- 除直接调度通用工作者外，不调用其他 Agent / subagent', /^- 不调用其他 subagent$/m],
      ['claude', 'en', '- Does not invoke other Agents / subagents except for direct dispatch of general workers.', /^- Does not invoke other subagents$/m]] as const;
    for (const [h, lang, pos, neg] of VIS) {
      const c = norm(readFileSync(file(h, lang, 'openfeel-vision'), 'utf-8'));
      expect(c, `${h}/${lang} vision 新表述`).toContain(pos);
      expect(c, `${h}/${lang} vision 旧表述残留`).not.toMatch(neg);
    }
    expect(norm(readFileSync(file('claude', 'zh-CN', 'openfeel-vision'), 'utf-8')), 'zh 括注残留').not.toContain('（subagent 不互调）');
    expect(norm(readFileSync(file('claude', 'en', 'openfeel-vision'), 'utf-8')), 'en 括注残留').not.toContain('subagents do not invoke each other');
    expect(norm(readFileSync(file('claude', 'zh-CN', 'openfeel-vision'), 'utf-8'))).toContain('除直接调度通用工作者外，不调用其他 Agent / subagent');
    // stage-89：C12 显式翻转（REV-88-009 ①）——旧平台断言 → 新正控 + 新阴性
    const zhEx = norm(readFileSync(file('claude', 'zh-CN', 'openfeel-executor'), 'utf-8'));
    const enEx = norm(readFileSync(file('claude', 'en', 'openfeel-executor'), 'utf-8'));
    expect(zhEx, '⑤ zh 新正控').toContain('openfeel-explorer');
    expect(enEx, '⑤ en 新正控').toContain('openfeel-explorer');
    expect(zhEx, '⑤ zh 旧平台断言残留').not.toContain('不调用 Task');
    expect(enEx, '⑤ en 旧平台断言残留').not.toContain('do not call Task');
  });
});

/**
 * stage-89：探索者注册与路由替代（T3.1/T3.2）
 * ① 注册面（listAgentIds / listClaudeAgentIds 含 openfeel-explorer 且计数 10）；
 * ② 路由正控（4 份路由行指向 openfeel-explorer）；
 * ③ 路由阴性（同行 scoped + 大小写敏感：general / explore Agent / 反引号 Explore 零残留；
 *    REV-89-005 定界——第 1/3 列 exploration 与 :41 explore independently 为存量非命中面，整文件扫描会误伤）。
 */
describe('stage-89：探索者注册与路由替代（T3.1/T3.2）', () => {
  const TD = join(ROOT, 'src', 'core', 'templates-data');
  const ROUTE_FILES = [
    join(TD, 'agents-md', 'zh-CN.md'),
    join(TD, 'agents-md', 'en.md'),
    join(TD, 'claude', 'constraint', 'zh-CN.md'),
    join(TD, 'claude', 'constraint', 'en.md'),
  ];
  const routeLineOf = (p: string): string | undefined =>
    norm(readFileSync(p, 'utf-8')).split('\n').find((l) => l.includes('research（') || l.includes('research ('));

  it('① 注册面：双语 agents 目录均含 openfeel-explorer 且计数 10', () => {
    expect(listAgentIds('zh-CN')).toContain('openfeel-explorer');
    expect(listAgentIds('en')).toContain('openfeel-explorer');
    expect(listClaudeAgentIds('zh-CN')).toContain('openfeel-explorer');
    expect(listAgentIds('zh-CN')).toHaveLength(10);
    expect(listAgentIds('en')).toHaveLength(10);
    expect(listClaudeAgentIds('zh-CN')).toHaveLength(10);
  });

  it('② 路由正控：4 份路由行指向 openfeel-explorer', () => {
    for (const p of ROUTE_FILES) {
      const route = routeLineOf(p);
      expect(route, `${p} 路由行非空（防假绿）`).toBeTruthy();
      expect(route, `${p} 路由行正控`).toContain('openfeel-explorer');
    }
  });

  it('③ 路由阴性（同行 scoped + 大小写敏感）', () => {
    for (const p of ROUTE_FILES) {
      const route = routeLineOf(p);
      expect(route, `${p} 路由行非空（防假绿）`).toBeTruthy();
      expect(route, `${p} 残留 general`).not.toContain('general');
      expect(route, `${p} 残留 explore Agent`).not.toContain('explore Agent');
      expect(route, `${p} 残留 Explore`).not.toContain('`Explore`');
    }
  });

  it('全 templates-data 探索者占位零残留（大小写不敏感）', () => {
    const walk = (dir: string, out: string[] = []): string[] => {
      for (const e of readdirSync(dir, { withFileTypes: true })) {
        const p = join(dir, e.name);
        if (e.isDirectory()) walk(p, out);
        else if (e.name.endsWith('.md')) out.push(p);
      }
      return out;
    };
    const files = walk(join(ROOT, 'src', 'core', 'templates-data'));
    expect(files.length, '扫描集合非空').toBeGreaterThan(60); // op-001 后实测 68 个 .md（opencode 20 + claude 20 + agents-md 2 + constraint 2 + ADAPTER 2 + skills 22）
    for (const p of files) {
      const lower = norm(readFileSync(p, 'utf-8')).toLowerCase();
      expect(lower, `中文占位残留 ${p}`).not.toContain('探索者接入');
      expect(lower, `en 占位残留 ${p}`).not.toContain('explorer onboarding');
    }
  });

  it('feel 引用面：4 份 feel.md 指向 openfeel-explorer + scoped 阴性', () => {
    const FEELS = [
      join(TD, 'opencode', 'agents', 'zh-CN', 'feel.md'),
      join(TD, 'opencode', 'agents', 'en', 'feel.md'),
      join(TD, 'claude', 'agents', 'zh-CN', 'feel.md'),
      join(TD, 'claude', 'agents', 'en', 'feel.md'),
    ];
    for (const p of FEELS) {
      const c = norm(readFileSync(p, 'utf-8'));
      expect(c, `${p} 正控`).toContain('openfeel-explorer');
      expect(c, `${p} 残留 explore Agent`).not.toContain('explore Agent');
      expect(c, `${p} 残留 \`Explore\` subagent`).not.toContain('`Explore` subagent');
    }
  });

  it('executor 面：4 份指向 openfeel-explorer + 无平台断言 + 行尾子句正控', () => {
    const EX = [
      [join(TD, 'opencode', 'agents', 'zh-CN', 'openfeel-executor.md'), '跨文件修改先用 `todowrite` 创建任务列表。'],
      [join(TD, 'opencode', 'agents', 'en', 'openfeel-executor.md'), 'For cross-file modifications, create a task list with `todowrite` first.'],
      [join(TD, 'claude', 'agents', 'zh-CN', 'openfeel-executor.md'), '跨文件修改先用 `TodoWrite` 创建任务列表。'],
      [join(TD, 'claude', 'agents', 'en', 'openfeel-executor.md'), 'For cross-file modifications, create a to-do list with `TodoWrite` first.'],
    ] as const;
    for (const [p, tail] of EX) {
      const c = norm(readFileSync(p, 'utf-8'));
      expect(c, `${p} 正控`).toContain('openfeel-explorer');
      expect(c, `${p} 行尾子句`).toContain(tail);
    }
    for (const p of [join(TD, 'claude', 'agents', 'zh-CN', 'openfeel-executor.md'),
      join(TD, 'claude', 'agents', 'en', 'openfeel-executor.md')]) {
      const c = norm(readFileSync(p, 'utf-8'));
      expect(c, `${p} 旧平台断言`).not.toContain('不调用 Task');
      expect(c, `${p} 旧平台断言 en`).not.toContain('do not call Task');
    }
  });

  it('executor 承接注记正控', () => {
    expect(norm(readFileSync(join(TD, 'opencode', 'agents', 'zh-CN', 'openfeel-executor.md'), 'utf-8'))).toContain('通用承接');
    expect(norm(readFileSync(join(TD, 'claude', 'agents', 'zh-CN', 'openfeel-executor.md'), 'utf-8'))).toContain('通用承接');
    expect(norm(readFileSync(join(TD, 'opencode', 'agents', 'en', 'openfeel-executor.md'), 'utf-8'))).toContain('General acceptance');
    expect(norm(readFileSync(join(TD, 'claude', 'agents', 'en', 'openfeel-executor.md'), 'utf-8'))).toContain('General acceptance');
  });
});

// ═══════════════════════════════════════
// stage-90 op-003：三模式文案（supersede）
// ═══════════════════════════════════════
describe('stage-90：三模式文案（supersede）', () => {
  const TD = join(ROOT, 'src', 'core', 'templates-data');
  const FEEL_FILES: Array<[string, 'zh' | 'en']> = [
    [join(TD, 'opencode', 'agents', 'zh-CN', 'feel.md'), 'zh'],
    [join(TD, 'claude', 'agents', 'zh-CN', 'feel.md'), 'zh'],
    [join(TD, 'opencode', 'agents', 'en', 'feel.md'), 'en'],
    [join(TD, 'claude', 'agents', 'en', 'feel.md'), 'en'],
  ];
  const H_REQ_ZH = '#### 需求流转（requirement lifecycle）';
  const H_REQ_EN = '#### Requirement Lifecycle';

  /** 递归列举 templates-data/**（全文件类型） */
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const e of readdirSync(dir, { withFileTypes: true })) {
      const p = join(dir, e.name);
      if (e.isDirectory()) { walk(p, out); } else { out.push(p); }
    }
    return out;
  };

  /** 提取节切片：标题行 → 下一个 markdown 标题行（不含） */
  const extractSection = (text: string, heading: string): string => {
    const lines = text.split('\n');
    const start = lines.findIndex((l) => l.startsWith(heading));
    if (start < 0) { return ''; }
    const rest = lines.slice(start + 1);
    const stop = rest.findIndex((l) => /^#{1,6} /.test(l));
    return [lines[start], ...(stop < 0 ? rest : rest.slice(0, stop))].join('\n');
  };

  it('S90-1 三模式正控：4 份 feel.md 含「三种模式：」/「Three modes:」+ general 条目要点串', () => {
    for (const [p, lang] of FEEL_FILES) {
      const c = norm(readFileSync(p, 'utf-8'));
      if (lang === 'zh') {
        expect(c, `${p} 缺 三种模式：`).toContain('三种模式：');
        for (const s of ['**general（通用）**', '**无流水线**', '**仅需求级合法**']) {
          expect(c, `${p} 缺 ${s}`).toContain(s);
        }
      } else {
        expect(c, `${p} 缺 Three modes:`).toContain('Three modes:');
        for (const s of ['**general (General)**', '**no pipeline**', '**valid at the requirement level only**']) {
          expect(c, `${p} 缺 ${s}`).toContain(s);
        }
      }
    }
  });

  it('S90-2 旧串零残留门（D-90-14）：templates-data/** × 7 条旧串 = 0 命中', () => {
    const OLD_STRINGS = ['正交注记', 'Orthogonality note', '与「工作流模式感知」正交',
      'Orthogonal to "Workflow Mode Awareness"', '与 workflow_mode 正交', '两种模式：', 'Two modes:'];
    const files = walk(TD);
    // 防假绿前置：文件数 ≥ 60（实测 64）+ 正控（feel.md 在列）
    expect(files.length).toBeGreaterThanOrEqual(60);
    expect(files.some((f) => f.endsWith(join('agents', 'zh-CN', 'feel.md')))).toBe(true);
    for (const f of files) {
      const c = readFileSync(f, 'utf-8');
      for (const s of OLD_STRINGS) {
        expect(c.includes(s), `${f} 残留旧串: ${s}`).toBe(false);
      }
    }
  });

  it('S90-3 跨 harness 逐字一致（改写后需求节切片 zh ×2 / en ×2 ===）', () => {
    for (const [h, idx] of [[H_REQ_ZH, 0], [H_REQ_EN, 2]] as const) {
      const oc = extractSection(norm(readFileSync(FEEL_FILES[idx][0], 'utf-8')), h);
      const cc = extractSection(norm(readFileSync(FEEL_FILES[idx + 1][0], 'utf-8')), h);
      expect(oc.length, `${h} opencode 切片非空`).toBeGreaterThan(0);
      expect(cc, `${h} 跨 harness 逐字一致`).toBe(oc);
    }
  });

  it('S90-4 零裸主语：新注记 / 新 bullet / general 条目所在文件切片不含 Feel / 主会话 / main session', () => {
    // 新注记切片（需求节）+ 新 bullet（旧 bullet 行已改写；general 条目在模式节 → 直取含该串的行）
    for (const [p, lang] of FEEL_FILES) {
      const c = norm(readFileSync(p, 'utf-8'));
      const block = extractSection(c, lang === 'zh' ? H_REQ_ZH : H_REQ_EN);
      expect(block.length).toBeGreaterThan(0);
      for (const s of ['Feel', '主会话', 'main session']) {
        expect(block, `${p}/${h0(block)} 裸主语 ${s}`).not.toContain(s);
      }
      const generalLine = c.split('\n').find((l) => l.startsWith(lang === 'zh' ? '- **general（通用）**' : '- **general (General)**'));
      expect(generalLine, `${p} general 条目缺失`).toBeDefined();
      for (const s of ['Feel', '主会话', 'main session']) {
        expect(generalLine!, `${p} general 条目裸主语 ${s}`).not.toContain(s);
      }
    }
    function h0(b: string): string { return b.split('\n')[0]; }
  });

  it('S90-5 新文案不含 NEG 5 串（「无流水线」不命中；作用域 = 模式节 + 需求节切片）', () => {
    const NEG = ['跳过流水线', '绕过流水线', 'bypass the pipeline', '需求即计划', 'a requirement is a plan'];
    const H_MODE_ZH = '#### 工作流模式（workflow_mode）';
    const H_MODE_EN = '#### Workflow Mode (workflow_mode)';
    for (const [p, lang] of FEEL_FILES) {
      const c = norm(readFileSync(p, 'utf-8'));
      const blocks = [
        extractSection(c, lang === 'zh' ? H_MODE_ZH : H_MODE_EN),
        extractSection(c, lang === 'zh' ? H_REQ_ZH : H_REQ_EN),
      ];
      for (const block of blocks) {
        expect(block.length, `${p} 切片非空`).toBeGreaterThan(0);
        for (const s of NEG) {
          expect(block.includes(s), `${p} 切片含禁用串 ${s}`).toBe(false);
        }
      }
    }
  });
});

/**
 * stage-91 op-002：agent 模板尺寸方向值（40 份）
 *
 * 直读**源文件**（不经 loader，防「改源忘 build」窗口假绿）；分档见 ops/op-002.md D-91-2：
 *   - feel ×4：<= ceil(50% x baseline)；
 *   - Tier A（7 类 × 4 = 28 份）：<= min(ceil(65% x baseline), 8192)；
 *   - Tier S（explorer ×4 + utility ×4 = 8 份）：<= baseline + 512 B（`## 技能索引` 索引节增量预算；
 *     REV-91-005 同源订正——加节必增字节，「不增长」口径不可达）。
 */
export const AGENT_SIZE_TARGETS: Record<string, { file: string; baseline: number; ceiling: number }> = {
  'claude/en/feel': { file: 'src/core/templates-data/claude/agents/en/feel.md', baseline: 36517, ceiling: 18259 },
  'claude/en/openfeel-archiver': { file: 'src/core/templates-data/claude/agents/en/openfeel-archiver.md', baseline: 9276, ceiling: 6030 },
  'claude/en/openfeel-executor': { file: 'src/core/templates-data/claude/agents/en/openfeel-executor.md', baseline: 12794, ceiling: 8192 },
  'claude/en/openfeel-explorer': { file: 'src/core/templates-data/claude/agents/en/openfeel-explorer.md', baseline: 3230, ceiling: 3742 },
  'claude/en/openfeel-feel-tester': { file: 'src/core/templates-data/claude/agents/en/openfeel-feel-tester.md', baseline: 5290, ceiling: 3439 },
  'claude/en/openfeel-planner': { file: 'src/core/templates-data/claude/agents/en/openfeel-planner.md', baseline: 10076, ceiling: 6550 },
  'claude/en/openfeel-reviewer': { file: 'src/core/templates-data/claude/agents/en/openfeel-reviewer.md', baseline: 10355, ceiling: 6731 },
  'claude/en/openfeel-schemer': { file: 'src/core/templates-data/claude/agents/en/openfeel-schemer.md', baseline: 7386, ceiling: 4801 },
  'claude/en/openfeel-utility': { file: 'src/core/templates-data/claude/agents/en/openfeel-utility.md', baseline: 3524, ceiling: 4036 },
  'claude/en/openfeel-vision': { file: 'src/core/templates-data/claude/agents/en/openfeel-vision.md', baseline: 4638, ceiling: 3015 },
  'claude/zh-CN/feel': { file: 'src/core/templates-data/claude/agents/zh-CN/feel.md', baseline: 31147, ceiling: 15574 },
  'claude/zh-CN/openfeel-archiver': { file: 'src/core/templates-data/claude/agents/zh-CN/openfeel-archiver.md', baseline: 8064, ceiling: 5242 },
  'claude/zh-CN/openfeel-executor': { file: 'src/core/templates-data/claude/agents/zh-CN/openfeel-executor.md', baseline: 10749, ceiling: 6987 },
  'claude/zh-CN/openfeel-explorer': { file: 'src/core/templates-data/claude/agents/zh-CN/openfeel-explorer.md', baseline: 2710, ceiling: 3222 },
  'claude/zh-CN/openfeel-feel-tester': { file: 'src/core/templates-data/claude/agents/zh-CN/openfeel-feel-tester.md', baseline: 4414, ceiling: 2870 },
  'claude/zh-CN/openfeel-planner': { file: 'src/core/templates-data/claude/agents/zh-CN/openfeel-planner.md', baseline: 8456, ceiling: 5497 },
  'claude/zh-CN/openfeel-reviewer': { file: 'src/core/templates-data/claude/agents/zh-CN/openfeel-reviewer.md', baseline: 8797, ceiling: 5719 },
  'claude/zh-CN/openfeel-schemer': { file: 'src/core/templates-data/claude/agents/zh-CN/openfeel-schemer.md', baseline: 6092, ceiling: 3960 },
  'claude/zh-CN/openfeel-utility': { file: 'src/core/templates-data/claude/agents/zh-CN/openfeel-utility.md', baseline: 2935, ceiling: 3447 },
  'claude/zh-CN/openfeel-vision': { file: 'src/core/templates-data/claude/agents/zh-CN/openfeel-vision.md', baseline: 3764, ceiling: 2447 },
  'opencode/en/feel': { file: 'src/core/templates-data/opencode/agents/en/feel.md', baseline: 36661, ceiling: 18331 },
  'opencode/en/openfeel-archiver': { file: 'src/core/templates-data/opencode/agents/en/openfeel-archiver.md', baseline: 8999, ceiling: 5850 },
  'opencode/en/openfeel-executor': { file: 'src/core/templates-data/opencode/agents/en/openfeel-executor.md', baseline: 12208, ceiling: 7936 },
  'opencode/en/openfeel-explorer': { file: 'src/core/templates-data/opencode/agents/en/openfeel-explorer.md', baseline: 3258, ceiling: 3770 },
  'opencode/en/openfeel-feel-tester': { file: 'src/core/templates-data/opencode/agents/en/openfeel-feel-tester.md', baseline: 4964, ceiling: 3227 },
  'opencode/en/openfeel-planner': { file: 'src/core/templates-data/opencode/agents/en/openfeel-planner.md', baseline: 9646, ceiling: 6270 },
  'opencode/en/openfeel-reviewer': { file: 'src/core/templates-data/opencode/agents/en/openfeel-reviewer.md', baseline: 6255, ceiling: 6214 },
  'opencode/en/openfeel-schemer': { file: 'src/core/templates-data/opencode/agents/en/openfeel-schemer.md', baseline: 7052, ceiling: 4584 },
  'opencode/en/openfeel-utility': { file: 'src/core/templates-data/opencode/agents/en/openfeel-utility.md', baseline: 3409, ceiling: 3921 },
  'opencode/en/openfeel-vision': { file: 'src/core/templates-data/opencode/agents/en/openfeel-vision.md', baseline: 4573, ceiling: 2973 },
  'opencode/zh-CN/feel': { file: 'src/core/templates-data/opencode/agents/zh-CN/feel.md', baseline: 31638, ceiling: 15819 },
  'opencode/zh-CN/openfeel-archiver': { file: 'src/core/templates-data/opencode/agents/zh-CN/openfeel-archiver.md', baseline: 7883, ceiling: 5124 },
  'opencode/zh-CN/openfeel-executor': { file: 'src/core/templates-data/opencode/agents/zh-CN/openfeel-executor.md', baseline: 10408, ceiling: 6766 },
  'opencode/zh-CN/openfeel-explorer': { file: 'src/core/templates-data/opencode/agents/zh-CN/openfeel-explorer.md', baseline: 2773, ceiling: 3285 },
  'opencode/zh-CN/openfeel-feel-tester': { file: 'src/core/templates-data/opencode/agents/zh-CN/openfeel-feel-tester.md', baseline: 4187, ceiling: 2722 },
  'opencode/zh-CN/openfeel-planner': { file: 'src/core/templates-data/opencode/agents/zh-CN/openfeel-planner.md', baseline: 8237, ceiling: 5355 },
  'opencode/zh-CN/openfeel-reviewer': { file: 'src/core/templates-data/opencode/agents/zh-CN/openfeel-reviewer.md', baseline: 5859, ceiling: 5818 },
  'opencode/zh-CN/openfeel-schemer': { file: 'src/core/templates-data/opencode/agents/zh-CN/openfeel-schemer.md', baseline: 5872, ceiling: 3817 },
  'opencode/zh-CN/openfeel-utility': { file: 'src/core/templates-data/opencode/agents/zh-CN/openfeel-utility.md', baseline: 2872, ceiling: 3384 },
  'opencode/zh-CN/openfeel-vision': { file: 'src/core/templates-data/opencode/agents/zh-CN/openfeel-vision.md', baseline: 3722, ceiling: 2420 },
};

describe('stage-91：agent 模板尺寸方向值（40 份）', () => {
  it('常量表恰 40 条 + 逐份实存命中 + 实测字节 <= 上限', () => {
    const entries = Object.entries(AGENT_SIZE_TARGETS);
    expect(entries, '尺寸常量表条目数').toHaveLength(40);
    for (const [key, { file, baseline, ceiling }] of entries) {
      const p = join(ROOT, file);
      expect(existsSync(p), `${key} 实存`).toBe(true);
      const bytes = readFileSync(p).length;
      expect(baseline, `${key} baseline 非零`).toBeGreaterThan(0);
      expect(bytes, `${key} 实测 ${bytes} B > 上限 ${ceiling} B`).toBeLessThanOrEqual(ceiling);
    }
  });
});

/**
 * stage-91 op-002：索引节形态与分列（40 份）
 * ① `## 技能索引`（zh）/ `## Skill Index`（en）各恰 1 处，切片含表头 `| skill |` 且非空；
 * ② feel ×4：`## 常用命令索引` / `## Command Index` 在位且**不含** `| skill |` 行（skill 与 CLI / agent 入口分列正控）；
 * ③ 混列阴性：索引节切片内零 CLI 命令形态串（`openfeel flow|plan|stage|view|archive|knowledge|roadmap`）。
 */
describe('stage-91：索引节形态与分列（40 份）', () => {
  /** 提取节切片：标题行 -> 下一个 markdown 标题行（不含） */
  const slice = (text: string, heading: string): string => {
    const lines = text.split('\n');
    const start = lines.findIndex((l) => l.startsWith(heading));
    if (start < 0) { return ''; }
    const rest = lines.slice(start + 1);
    const stop = rest.findIndex((l) => /^#{1,6} /.test(l));
    return [lines[start], ...(stop < 0 ? rest : rest.slice(0, stop))].join('\n');
  };
  const CLI_IN_INDEX = /`openfeel (flow|plan|stage|view|archive|knowledge|roadmap|init)\b/;

  it('40 份索引节恰 1 处 + 表头在位 + 切片非空 + 零 CLI 混列', () => {
    for (const [key, { file }] of Object.entries(AGENT_SIZE_TARGETS)) {
      const lang = key.split('/')[1];
      const heading = lang === 'en' ? '## Skill Index' : '## 技能索引';
      const c = norm(readFileSync(join(ROOT, file), 'utf-8'));
      expect((c.match(new RegExp(`^${heading}$`, 'gm')) ?? []).length, `${key} 索引节计数`).toBe(1);
      const block = slice(c, heading);
      expect(block.length, `${key} 索引切片非空（防假绿）`).toBeGreaterThan(0);
      expect(block, `${key} 缺表头`).toContain('| skill |');
      expect(CLI_IN_INDEX.test(block), `${key} 索引节混列 CLI 命令`).toBe(false);
    }
  });

  it('feel ×4 命令索引节在位且不含 skill 表行（分列正控）', () => {
    for (const [key, { file }] of Object.entries(AGENT_SIZE_TARGETS)) {
      if (!key.endsWith('/feel')) { continue; }
      const lang = key.split('/')[1];
      const commandHeading = lang === 'en' ? '## Command Index' : '## 常用命令索引';
      const c = norm(readFileSync(join(ROOT, file), 'utf-8'));
      expect(c, `${key} 缺 ${commandHeading}`).toContain(commandHeading);
      const block = slice(c, commandHeading);
      expect(block.length, `${key} 命令索引切片非空`).toBeGreaterThan(0);
      expect(block, `${key} 命令索引节误含 skill 表行`).not.toContain('| skill |');
    }
  });
});

/**
 * stage-91 op-004 §4.2：三类静态断言全量（直读**源文件**，不经 loader）
 *   ① 尺寸方向值覆盖完整性（agent 面表 == 40；约束面表 == 4 由 claude-adapter.test.ts 承担 ——
 *      [FIX] REV-91-008 双表分置，不落第三份汇总常量；「40 + 4 = 44」仅终局报告层汇总）；
 *   ② skill 索引引用完整性（40 份索引节切片 -> 逐个 skill 名 existsSync，悬空引用零容忍）；
 *   ③ 跨 harness 对称（关键节切片逐字等值 + 切片零裸主语 + 五类语义正控）。
 */
const AGENT_COMBOS: Array<[string, string]> = [['opencode', 'zh-CN'], ['opencode', 'en'], ['claude', 'zh-CN'], ['claude', 'en']];
const AGENT_IDS = ['feel', 'openfeel-planner', 'openfeel-schemer', 'openfeel-explorer', 'openfeel-executor',
  'openfeel-reviewer', 'openfeel-feel-tester', 'openfeel-vision', 'openfeel-archiver', 'openfeel-utility'];
const agentPath = (h: string, lang: string, id: string) =>
  join(ROOT, 'src', 'core', 'templates-data', h, 'agents', lang, `${id}.md`);

const sliceOf = (text: string, heading: string): string => {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith(heading));
  if (start < 0) { return ''; }
  const rest = lines.slice(start + 1);
  const stop = rest.findIndex((l) => /^#{1,6} /.test(l));
  return [lines[start], ...(stop < 0 ? rest : rest.slice(0, stop))].join('\n');
};

describe('stage-91：尺寸方向值覆盖完整性（agent 面）', () => {
  it('常量表 == 40 且覆盖 4 harness-lang × 10 agent 全交叉（防漏登 / 防新增文件逃逸）', () => {
    const keys = Object.keys(AGENT_SIZE_TARGETS).sort();
    expect(keys, 'agent 面尺寸常量表条目数').toHaveLength(40);
    const expected: string[] = [];
    for (const [h, lang] of AGENT_COMBOS) {
      for (const id of AGENT_IDS) expected.push(`${h}/${lang}/${id}`);
    }
    expect(keys).toEqual(expected.sort());
    for (const key of keys) {
      expect(existsSync(join(ROOT, AGENT_SIZE_TARGETS[key].file)), `${key} 源文件实存`).toBe(true);
    }
    // 约束面：常量表归属 claude-adapter.test.ts（4 条），此处仅断「不落第三份汇总常量」
    const thisSrc = readFileSync(join(ROOT, 'test', 'core', 'templates.test.ts'), 'utf-8');
    const thirdTableNeedle = ['export', 'const', 'CONSTRAINT' + '_SIZE_TARGETS'].join(' ');
    expect(thisSrc.includes(thirdTableNeedle), '不得在本文件重复维护约束面常量表').toBe(false);
  });
});

describe('stage-91：skill 索引引用完整性', () => {
  it('40 份索引节切片非空 + 表头在位 + 每个 skill 名实存（悬空引用 0）', () => {
    let checked = 0;
    for (const [h, lang] of AGENT_COMBOS) {
      for (const id of AGENT_IDS) {
        const key = `${h}/${lang}/${id}`;
        const heading = lang === 'en' ? '## Skill Index' : '## 技能索引';
        const c = norm(readFileSync(agentPath(h, lang, id), 'utf-8'));
        expect((c.match(new RegExp(`^${heading}$`, 'gm')) ?? []).length, `${key} 索引节计数`).toBe(1);
        const block = sliceOf(c, heading);
        expect(block.length, `${key} 切片非空（防假绿前置）`).toBeGreaterThan(0);
        expect(block, `${key} 缺表头`).toContain('| skill |');
        const names = [...new Set(block.match(/openfeel-[a-z0-9-]+/g) ?? [])];
        expect(names.length, `${key} 索引节 skill 名非空`).toBeGreaterThan(0);
        for (const n of names) {
          expect(existsSync(join(SKILLS_DIR, n, 'SKILL.md')), `${key} 悬空引用 ${n}`).toBe(true);
          checked += 1;
        }
      }
    }
    expect(checked, '引用完整性检查总数 > 0').toBeGreaterThan(0);
  });
});

describe('stage-91：跨 harness 对称（关键节 + 裸主语 + 语义正控）', () => {
  it('关键节切片同语言跨 harness 逐字等值 + 切片零裸主语', () => {
    for (const lang of ['zh-CN', 'en']) {
      const headings = lang === 'en' ? ['## Skill Index'] : ['## 技能索引'];
      for (const id of AGENT_IDS) {
        for (const h of headings) {
          const oc = sliceOf(norm(readFileSync(agentPath('opencode', lang, id), 'utf-8')), h);
          const cc = sliceOf(norm(readFileSync(agentPath('claude', lang, id), 'utf-8')), h);
          expect(oc.length, `${lang}/${id} 索引切片非空`).toBeGreaterThan(0);
          expect(cc, `${lang}/${id}/${h} 跨 harness 逐字等值`).toBe(oc);
          for (const bare of ['Feel', '主会话', 'main session']) {
            expect(cc, `${lang}/${id} 索引切片裸主语 ${bare}`).not.toContain(bare);
          }
        }
      }
      // feel 的核心职责节同样跨 harness 等值
      const hr = lang === 'en' ? '## Core Responsibilities' : '## 核心职责';
      const oc = sliceOf(norm(readFileSync(agentPath('opencode', lang, 'feel'), 'utf-8')), hr);
      const cc = sliceOf(norm(readFileSync(agentPath('claude', lang, 'feel'), 'utf-8')), hr);
      expect(oc.length, `${lang}/feel 核心职责切片非空`).toBeGreaterThan(0);
      expect(cc, `${lang}/feel 核心职责跨 harness 逐字等值`).toBe(oc);
    }
  });

  it('语义正控：需求接取 / dispatch / 探索者 / 三模式 / fast 快线五类串在 feel ×4 与相应 subagent 面在位', () => {
    for (const [h, lang] of AGENT_COMBOS) {
      const feel = norm(readFileSync(agentPath(h, lang, 'feel'), 'utf-8'));
      const planner = norm(readFileSync(agentPath(h, lang, 'openfeel-planner'), 'utf-8'));
      const executor = norm(readFileSync(agentPath(h, lang, 'openfeel-executor'), 'utf-8'));
      const soft = lang === 'en';
      // 需求接取（feel + planner）
      expect(feel, `${h}/${lang} feel 需求接取`).toContain(soft ? 'openfeel req' : 'openfeel req');
      expect(planner, `${h}/${lang} planner 需求感知`).toContain(soft ? 'openfeel req show <REQ-NNN>' : 'openfeel req show <REQ-NNN>');
      // dispatch 双口径
      expect(feel, `${h}/${lang} feel dispatch`).toContain('openfeel-utility');
      for (const id of ['openfeel-planner', 'openfeel-schemer', 'openfeel-reviewer', 'openfeel-archiver', 'openfeel-utility', 'openfeel-vision']) {
        const c = norm(readFileSync(agentPath(h, lang, id), 'utf-8'));
        expect(c, `${h}/${lang}/${id} 缺 [HANDOFF: agent_name]`).toContain('[HANDOFF: agent_name]');
      }
      // 探索者路由
      expect(feel, `${h}/${lang} feel 探索者`).toContain('openfeel-explorer');
      expect(executor, `${h}/${lang} executor 探索者`).toContain('openfeel-explorer');
      // 三模式
      expect(feel, `${h}/${lang} feel 三模式`).toContain(soft ? 'Three modes:' : '三种模式：');
      // fast 快线
      expect(feel, `${h}/${lang} feel fast 快线`).toContain(soft ? 'Workflow Fast Line' : '工作流快线');
      expect(planner, `${h}/${lang} planner 计划审查单轮`).toContain(soft ? 'plan_review' : 'plan_review');
    }
  });
});
