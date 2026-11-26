/**
 * Feel 提示词**渲染态**体积预算（v1.6.1-stage-134 / REQ-068 A68.7）
 *
 * 为什么是渲染态而不是 `FEEL_BODY_*` 常量：
 *   - 用户真正看到的是 `renderFeelPrompt()` 的产物（状态行 + Free Mode 节 + 正文 + `<feel_mode>` 包裹）；
 *   - 只量常量会漏掉 Free Mode 附录与包裹行，A10（≤1200 字符 / ≤25 行）就形同虚设。
 *
 * 断言口径（**只断上限，不写死长度**）：加字 / 改措辞不必回来改测试；
 * 一旦撑破预算就是真回归，必须压措辞而不是抬上限（plan §1.3 预算纪律）。
 *
 * 另断言源正文含**版本号分级词**（A68.7）：
 *   - 中文：补丁 / minor / major
 *   - 英文：patch / minor / major
 */
import { describe, expect, it } from 'vitest';

import { FEEL_BODY_EN, FEEL_BODY_ZH, renderFeelPrompt } from '../../dsh/lib/surface/prompt.js';

/** A10 上限：渲染后总字符数 / 总行数。 */
const MAX_CHARS = 1200;
const MAX_LINES = 25;

const GROUPS = [
  ['zh-CN', 'enabled'],
  ['zh-CN', 'disabled'],
  ['en', 'enabled'],
  ['en', 'disabled'],
] as const;

describe('Feel 提示词渲染态预算（A10：≤1200 字符 / ≤25 行）', () => {
  for (const [language, feelValue] of GROUPS) {
    it(`${language} / feelMode=${feelValue} 渲染结果 ≤ ${MAX_CHARS} 字符且 ≤ ${MAX_LINES} 行`, () => {
      const text = renderFeelPrompt({ language, feelMode: { value: feelValue } });
      expect(text.length).toBeLessThanOrEqual(MAX_CHARS);
      expect(text.split('\n').length).toBeLessThanOrEqual(MAX_LINES);
      // 渲染结果必须真的带上正文（防止空模板 / 常量丢了却仍然「通过」体积断言）
      expect(text).toContain(language === 'en' ? 'Three checkpoints' : '三个检查点');
    });
  }

  it('源正文（zh）含版本号分级词：补丁 / minor / major', () => {
    expect(FEEL_BODY_ZH).toContain('补丁');
    expect(FEEL_BODY_ZH).toContain('minor');
    expect(FEEL_BODY_ZH).toContain('major');
  });

  it('源正文（en）含版本号分级词：patch / minor / major', () => {
    expect(FEEL_BODY_EN).toContain('patch');
    expect(FEEL_BODY_EN).toContain('minor');
    expect(FEEL_BODY_EN).toContain('major');
  });

  // v1.6.5 / REQ-074 A74.1：「版本纪律」句的关键词断言（防止纪律句被静默删掉）
  it('源正文（zh）含版本纪律关键词：批次 / backlog / 连发', () => {
    expect(FEEL_BODY_ZH).toContain('批次');
    expect(FEEL_BODY_ZH).toContain('backlog');
    expect(FEEL_BODY_ZH).toMatch(/连发/);
  });

  it('源正文（en）含版本纪律关键词：one batch / backlog / back-to-back', () => {
    expect(FEEL_BODY_EN).toContain('one batch');
    expect(FEEL_BODY_EN).toContain('backlog');
    expect(FEEL_BODY_EN).toMatch(/back-to-back/);
  });
});
