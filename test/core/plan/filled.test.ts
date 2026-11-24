/**
 * filled 单元测试 — 写实性判据单点模块
 *
 * 覆盖（plan §2 T1 迁移断言 ①–⑤ + §4.2 三类对象）：
 * ① 多行骨架整体判空 / 行内引用不误报（BUG-005 回归）
 * ② CRLF ③ 行首缩进 ④ 单行 `> 待补充` ⑤ 写实正文放行
 * ⑥ 小节缺失 ⑦ 需求正文 / 需求计划 / 阶段计划 / overview 各自必备小节
 * ⑧ `EMPTY_TEMPLATE_LINE_LITERAL_RE` 与旧实现逐字等价（同一组样本双跑比对）
 */
import { describe, it, expect } from 'vitest';
import {
  EMPTY_TEMPLATE_LINE_LITERAL_RE,
  EMPTY_TEMPLATE_MARKER,
  MIN_FILLED_CHARS,
  PLACEHOLDER_LINE_RE,
  PLACEHOLDER_LITERALS,
  REQUIREMENT_BODY_CRITERIA_SECTIONS,
  REQUIREMENT_BODY_SECTIONS,
  REQUIREMENT_PLAN_SECTIONS,
  STAGE_OVERVIEW_SECTIONS,
  STAGE_PLAN_MIN_CHARS,
  extractSection,
  findEmptySections,
  isOverviewFilled,
  isRequirementBodyFilled,
  isRequirementPlanFilled,
  isSectionFilled,
  isStageOverviewFilled,
  isStagePlanFilled,
  parseMarkdownSections,
} from '../../../src/core/plan/filled.js';
import {
  EMPTY_TEMPLATE_MARKER as FLOW_EMPTY_MARKER,
  detectFillState,
  isTemplateEmpty,
} from '../../../src/core/flow-manager.js';

/** 写实摘要（非空白字符数远超 MIN_FILLED_CHARS） */
const SUMMARY_BODY =
  '本阶段把「写实性」判定收敛为单一模块，消除 flow-manager 与命令层的两套标准，并为后续正文门与计划门提供统一谓词。';
/** 写实正文（无判据行形态，用于 no-criteria 反例） */
const PROSE_WITHOUT_CRITERIA =
  '这段说明没有以减号或验收开头的判据行，但正文长度足够，用来验证缺少判据行时返回稳定的原因码。';
/** 写实正文（一般形态） */
const PLAIN_BODY =
  '这是足够长的写实正文，用于覆盖阈值放行路径，并保证非空白字符数明显超过判据常量。';

/** 迁移前的整段字面量实现（仅测试内保留，用于双跑比对；src 内不得有第二份） */
const LEGACY_EMPTY_TEMPLATE_RE = /(?:^|\n)[ \t]*-\s*\[\s*\]\s*待补充[ \t]*(?=\r?\n|$)/;
const legacyIsTemplateEmpty = (content: string): boolean => LEGACY_EMPTY_TEMPLATE_RE.test(content);
const legacyDetectFillState = (content: string): 'empty' | 'partial' | 'filled' => {
  if (legacyIsTemplateEmpty(content)) { return 'empty'; }
  if (/(?:^|\n)[ \t]*-\s*\[\s*\]/.test(content)) { return 'partial'; }
  return 'filled';
};

/** 整段判空的同一组样本（含行内引用、CRLF、缩进、无空格、尾随内容） */
const TEMPLATE_SAMPLES: readonly string[] = [
  '',
  '- [ ] 待补充\n',
  '- [ ] 待补充',
  '- [ ] 待补充\r\n',
  '  - [ ] 待补充  \n',
  'x\n- [ ] 待补充',
  '- [ ] 待补充\n后面',
  '- [ ]待补充\n',
  '-  [ ]  待补充\t\n',
  '前文 - [ ] 待补充 后文',
  '说明：存在 `- [ ] 待补充` 字样（行内引用）',
  '## 目标\n\n- [ ] 待补充\n\n## 任务\n\n- [ ] 待补充\n',
  '- [ ] 已完成\n',
  '  普通正文\n',
];

const filledRequirementBody = [
  '# REQ-001：示例需求',
  '',
  '## 状态',
  '',
  'draft（创建时快照；以 flow.json 为准）',
  '',
  '## 摘要',
  '',
  SUMMARY_BODY,
  '',
  '## 目标与验收',
  '',
  '- A1：`filled.ts` 导出全部判据函数且单测通过。',
  '- A2：`flow-manager.ts` 的行为与 `fill` 字段零变化。',
  '',
  '## 预估版本',
  '',
  'v1.6.0',
  '',
].join('\n');

const filledRequirementPlan = [
  '## 目标',
  '',
  '建立写实性判据的唯一实现，供模板填充度、正文空壳枚举与阶段计划门共同复用，消除第二套标准。',
  '',
  '## 任务拆解',
  '',
  '先迁移 flow-manager 的整段正则，再实现逐行过滤与小节解析，最后补齐单测覆盖五条迁移断言。',
  '',
  '## 验收判据',
  '',
  '单测全绿，且 grep 断言只有一处常量定义，既有 B3/B4 用例零改动通过，构建与类型检查保持 exit 0。',
  '',
].join('\n');

const placeholderStagePlan = [
  '# 计划',
  '',
  '## 目标',
  '',
  '- [ ] 待补充',
  '',
  '## 任务拆解',
  '',
  '- [ ] 待补充',
  '',
  '## 验收判据',
  '',
  '（待补充）',
  '',
  '## 偏差与回写',
  '',
  '- [ ] 待补充',
  '',
].join('\n');

const filledStagePlan = [
  '# v1.6.0-stage-132 计划',
  '',
  '## 一、目标与判据',
  '',
  '本阶段把写实性判定收敛为单一模块，并将正文门、计划门与账本同步接入既有流水线，保证回归零破坏。',
  '',
  '## 二、任务拆解',
  '',
  '- T1 建立 filled.ts 判据单点，并迁移 flow-manager 的整段字面量正则。',
  '- T2 增加 req body 写入原语与命令，覆盖 A1 的正文写入判据。',
  '',
].join('\n');

const filledOverview = [
  '## 目标',
  '',
  SUMMARY_BODY,
  '',
  '## 操作方案',
  '',
  '新增 filled.ts 纯函数模块，并在 flow-manager 中改为 import，实现等价替换与零行为变化。',
  '',
].join('\n');

describe('EMPTY_TEMPLATE_LINE_LITERAL_RE（整段字面量语义，迁移等价）', () => {
  it('与迁移前 flow-manager 的正则逐字相同（source / flags）', () => {
    expect(EMPTY_TEMPLATE_LINE_LITERAL_RE.source).toBe(LEGACY_EMPTY_TEMPLATE_RE.source);
    expect(EMPTY_TEMPLATE_LINE_LITERAL_RE.flags).toBe(LEGACY_EMPTY_TEMPLATE_RE.flags);
  });

  it('同一组样本双跑结果一致', () => {
    for (const sample of TEMPLATE_SAMPLES) {
      expect(EMPTY_TEMPLATE_LINE_LITERAL_RE.test(sample), `sample=${JSON.stringify(sample)}`)
        .toBe(legacyIsTemplateEmpty(sample));
    }
  });

  it('空模板标记常量是单一来源（flow-manager re-export 与 filled 相同）', () => {
    expect(FLOW_EMPTY_MARKER).toBe(EMPTY_TEMPLATE_MARKER);
    expect(EMPTY_TEMPLATE_LINE_LITERAL_RE.test(EMPTY_TEMPLATE_MARKER)).toBe(true);
  });
});

describe('isTemplateEmpty / detectFillState（迁移后行为零变化）', () => {
  it('① 多行骨架整体判空（BUG-005 回归：行内引用不误报）', () => {
    const skeleton = '## 目标\n\n- [ ] 待补充\n\n## 任务拆解\n\n- [ ] 待补充\n';
    expect(isTemplateEmpty(skeleton)).toBe(true);
    expect(isTemplateEmpty('前文 - [ ] 待补充 后文')).toBe(false);
    expect(isTemplateEmpty('说明：存在 `- [ ] 待补充` 字样（行内引用）')).toBe(false);
    expect(detectFillState('前文 - [ ] 待补充 后文')).toBe('filled');
  });

  it('② CRLF 仍检出', () => {
    expect(isTemplateEmpty('- [ ] 待补充\r\n')).toBe(true);
    expect(isTemplateEmpty('x\r\n- [ ] 待补充  \r\n')).toBe(true);
    expect(detectFillState('- [ ] 待补充\r\n')).toBe('empty');
  });

  it('③ 行首缩进 + 尾空格仍检出', () => {
    expect(isTemplateEmpty('  - [ ] 待补充  \n')).toBe(true);
    expect(isTemplateEmpty('x\n- [ ] 待补充')).toBe(true);
  });

  it('④ detectFillState 三态与迁移前逐字相同（双跑比对）', () => {
    const samples = [
      ...TEMPLATE_SAMPLES,
      '说明：存在 `- [ ]` 未勾选项；\n',
      '  - [ ] 某任务\n',
      '## 目标\n\n已经写实的内容\n',
    ];
    for (const sample of samples) {
      expect(detectFillState(sample), `sample=${JSON.stringify(sample)}`)
        .toBe(legacyDetectFillState(sample));
    }
    expect(detectFillState('- [ ] 待补充\n')).toBe('empty');
    expect(detectFillState('  - [ ] 某任务\n')).toBe('partial');
    expect(detectFillState('## 目标\n\n已经写实的内容\n')).toBe('filled');
  });
});

describe('PLACEHOLDER_LINE_RE（逐行语义）', () => {
  it('覆盖 - [ ] 待补充 / > 待补充 / （待补充） / 空小节', () => {
    expect(PLACEHOLDER_LINE_RE.test('- [ ] 待补充')).toBe(true);
    expect(PLACEHOLDER_LINE_RE.test('  - [ ] 待补充  ')).toBe(true);
    expect(PLACEHOLDER_LINE_RE.test('> 待补充')).toBe(true);
    expect(PLACEHOLDER_LINE_RE.test('（待补充）')).toBe(true);
    expect(PLACEHOLDER_LINE_RE.test('(待补充)')).toBe(true);
    expect(PLACEHOLDER_LINE_RE.test('- 待补充')).toBe(true);
    expect(PLACEHOLDER_LINE_RE.test('待补充：')).toBe(true);
    expect(PLACEHOLDER_LINE_RE.test('   ')).toBe(true);
    expect(PLACEHOLDER_LINE_RE.test('')).toBe(true);
  });

  it('不误伤含占位字样的真实内容与未勾选项', () => {
    expect(PLACEHOLDER_LINE_RE.test('本行包含待补充字样')).toBe(false);
    expect(PLACEHOLDER_LINE_RE.test('- [ ] 某任务')).toBe(false);
    expect(PLACEHOLDER_LINE_RE.test('TODO 列表如下')).toBe(false);
    expect(PLACEHOLDER_LINE_RE.test(`- [ ] 待补充：${SUMMARY_BODY}`)).toBe(false);
  });
});

describe('isSectionFilled（单小节判定链）', () => {
  it('⑥ 小节缺失 → missing-section', () => {
    const verdict = isSectionFilled(null);
    expect(verdict.filled).toBe(false);
    expect(verdict.reason).toBe('missing-section');
    expect(verdict.chars).toBe(0);
  });

  it('纯占位（含 HTML 注释）→ empty', () => {
    for (const body of ['（待补充）', '- [ ] 待补充\n> 待补充', '<!-- 待补充 -->', '', '   \n  ']) {
      const verdict = isSectionFilled(body);
      expect(verdict.filled, `body=${JSON.stringify(body)}`).toBe(false);
      expect(verdict.reason).toBe('empty');
      expect(verdict.chars).toBe(0);
    }
  });

  it('低于阈值 → too-short', () => {
    const shortBody = '一'.repeat(MIN_FILLED_CHARS - 1);
    const verdict = isSectionFilled(shortBody);
    expect(verdict.filled).toBe(false);
    expect(verdict.reason).toBe('too-short');
    expect(verdict.chars).toBe(MIN_FILLED_CHARS - 1);
  });

  it('⑤ 写实正文放行（阈值边界）', () => {
    const exact = '好'.repeat(MIN_FILLED_CHARS);
    const verdict = isSectionFilled(exact);
    expect(verdict.filled).toBe(true);
    expect(verdict.chars).toBe(MIN_FILLED_CHARS);
    expect(isSectionFilled(PLAIN_BODY).filled).toBe(true);
  });

  it('requireCriteria：无判据行 → no-criteria，有判据行 → 放行', () => {
    const noCriteria = isSectionFilled(PROSE_WITHOUT_CRITERIA, { requireCriteria: true });
    expect(noCriteria.filled).toBe(false);
    expect(noCriteria.reason).toBe('no-criteria');
    for (const criteriaLine of ['- A1：通过', '* 通过', 'A1：通过', '验收：通过']) {
      const body = `${PLAIN_BODY}\n${criteriaLine}`;
      expect(isSectionFilled(body, { requireCriteria: true }).filled, criteriaLine).toBe(true);
    }
  });
});

describe('parseMarkdownSections / extractSection', () => {
  it('按 ## 切分，### 归入当前小节，一级标题终止小节', () => {
    const md = '# 标题\n\n## 摘要\n\n摘要正文\n\n### 子节\n更深内容\n\n## 目标与验收\n\n- A1：通过\n';
    const sections = parseMarkdownSections(md);
    expect(sections.map((section) => section.name)).toEqual(['摘要', '目标与验收']);
    expect(sections[0].body).toContain('### 子节');
    expect(sections[0].body).toContain('更深内容');
    expect(extractSection(md, '目标与验收')).toBe('- A1：通过');
  });

  it('大小写与空格宽容，缺失返回 null', () => {
    expect(extractSection('##   目 标  \n\n内容在此。\n', '目标')).toBe('内容在此。');
    expect(extractSection('##   目 标  \n\n内容在此。\n', ' 目  标 ')).toBe('内容在此。');
    expect(extractSection('## SUMMARY\n\nbody\n', ' summary ')).toBe('body');
    expect(extractSection('## 摘要\n\n内容\n', '目标与验收')).toBeNull();
  });

  it('CRLF 输入不残留 \\r', () => {
    expect(extractSection('## 摘要\r\n\r\n内容\r\n', '摘要')).toBe('内容');
  });
});

describe('⑧ 三类对象的必备小节', () => {
  it('需求正文：摘要 + 目标与验收（含判据行）→ 写实', () => {
    expect(isRequirementBodyFilled(filledRequirementBody)).toBe(true);
    expect(findEmptySections(filledRequirementBody, REQUIREMENT_BODY_SECTIONS, REQUIREMENT_BODY_CRITERIA_SECTIONS))
      .toEqual([]);
    expect(findEmptySections(filledRequirementBody, REQUIREMENT_BODY_SECTIONS)).toEqual([]);
  });

  it('需求正文：小节缺失 → emptySections 列出', () => {
    const missing = filledRequirementBody.replace(/## 目标与验收[\s\S]*$/, '');
    expect(isRequirementBodyFilled(missing)).toBe(false);
    expect(findEmptySections(missing, REQUIREMENT_BODY_SECTIONS, REQUIREMENT_BODY_CRITERIA_SECTIONS))
      .toEqual(['目标与验收']);
  });

  it('需求正文：摘要仍是占位 → emptySections 列出摘要', () => {
    const placeholder = filledRequirementBody.replace(SUMMARY_BODY, '- [ ] 待补充');
    expect(isRequirementBodyFilled(placeholder)).toBe(false);
    expect(findEmptySections(placeholder, REQUIREMENT_BODY_SECTIONS, REQUIREMENT_BODY_CRITERIA_SECTIONS))
      .toEqual(['摘要']);
    // 非目标与验收的小节不受判据行约束
    expect(findEmptySections(placeholder, REQUIREMENT_BODY_SECTIONS)).toEqual(['摘要']);
  });

  it('需求正文：目标与验收缺判据行 → 未写实', () => {
    const noCriteria = filledRequirementBody.replace(
      '- A1：`filled.ts` 导出全部判据函数且单测通过。\n- A2：`flow-manager.ts` 的行为与 `fill` 字段零变化。',
      PROSE_WITHOUT_CRITERIA,
    );
    expect(isRequirementBodyFilled(noCriteria)).toBe(false);
    const verdict = isSectionFilled(extractSection(noCriteria, '目标与验收'), { requireCriteria: true });
    expect(verdict.reason).toBe('no-criteria');
    expect(findEmptySections(noCriteria, REQUIREMENT_BODY_SECTIONS, REQUIREMENT_BODY_CRITERIA_SECTIONS))
      .toEqual(['目标与验收']);
  });

  it('需求计划：目标/任务拆解/验收判据 三节；偏差与回写非必需', () => {
    expect(isRequirementPlanFilled(filledRequirementPlan)).toBe(true);
    expect(findEmptySections(filledRequirementPlan, REQUIREMENT_PLAN_SECTIONS)).toEqual([]);

    const missing = filledRequirementPlan.replace(/## 验收判据[\s\S]*$/, '');
    expect(isRequirementPlanFilled(missing)).toBe(false);
    expect(findEmptySections(missing, REQUIREMENT_PLAN_SECTIONS)).toEqual(['验收判据']);
  });

  it('阶段计划：不强制标题体裁，只看总量且标题行不计入', () => {
    expect(isStagePlanFilled(filledStagePlan)).toBe(true);
    expect(isStagePlanFilled(placeholderStagePlan)).toBe(false);
    // 只剩标题（哪怕标题很长）也判未写实
    const headingsOnly = '# 计划\n\n## 目标\n\n## 任务拆解\n\n## 验收判据\n\n## 偏差与回写\n';
    expect(isStagePlanFilled(headingsOnly)).toBe(false);
    expect(STAGE_PLAN_MIN_CHARS).toBe(MIN_FILLED_CHARS * 2);
  });

  it('overview：目标 + 操作方案（isStageOverviewFilled）；isOverviewFilled 只看目标', () => {
    expect(isStageOverviewFilled(filledOverview)).toBe(true);
    expect(findEmptySections(filledOverview, STAGE_OVERVIEW_SECTIONS)).toEqual([]);

    const missingOps = filledOverview.replace(/## 操作方案[\s\S]*$/, '');
    expect(isStageOverviewFilled(missingOps)).toBe(false);
    expect(findEmptySections(missingOps, STAGE_OVERVIEW_SECTIONS)).toEqual(['操作方案']);
    // 用户口径的轻量判定：## 目标 非占位
    expect(isOverviewFilled(missingOps)).toBe(true);
    expect(isOverviewFilled('## 目标\n\n（待补充）\n')).toBe(false);
  });
});

describe('PLACEHOLDER_LITERALS（整行相等，禁止子串）', () => {
  it('字面量集合稳定且可枚举', () => {
    expect(PLACEHOLDER_LITERALS).toContain('（待补充）');
    expect(PLACEHOLDER_LITERALS).toContain('待补充');
    expect(PLACEHOLDER_LITERALS).toContain('TBD');
    expect(PLACEHOLDER_LITERALS).toContain('TODO');
    expect(PLACEHOLDER_LITERALS).toContain('FIXME');
  });

  it('latin 字面量大小写宽容', () => {
    expect(isSectionFilled('tbd').reason).toBe('empty');
    expect(isSectionFilled('Todo').reason).toBe('empty');
    expect(isSectionFilled('（未指定）').reason).toBe('empty');
  });
});
