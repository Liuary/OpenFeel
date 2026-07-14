/**
 * i18n 引擎快速验证（用于 op-002 自测）
 * op-006 会创建正式测试文件替代本文件
 */
import { describe, it, expect, vi } from 'vitest';
import { t, getCliLang, VALID_LANGS } from '../../src/core/i18n.js';

describe('t() - 基础查表', () => {
  it('zh-CN 应返回中文字符串', () => {
    expect(t('common.error', 'zh-CN')).toBe('错误');
  });

  it('en 应返回英文字符串', () => {
    expect(t('common.error', 'en')).toBe('Error');
  });

  it('默认语言为 zh-CN', () => {
    expect(t('common.error')).toBe('错误');
  });

  it('flow.status.currentStage zh-CN', () => {
    expect(t('flow.status.currentStage', 'zh-CN')).toBe('当前活跃阶段');
  });

  it('flow.status.currentStage en', () => {
    expect(t('flow.status.currentStage', 'en')).toBe('Current Active Stage');
  });

  it('缺失 key 应回退到 key 本身并 warn', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const result = t('nonexistent.key.xyz');
    expect(result).toBe('nonexistent.key.xyz');
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('t() - 变量插值', () => {
  it('应替换模板中的 {var} 占位符 (zh-CN)', () => {
    const result = t('flow.advance.okTmpl', 'zh-CN', { stage: 'stage-01', to: 'exec_running' });
    expect(result).toContain('stage-01');
    expect(result).toContain('exec_running');
    expect(result).toBe('✓ 已推进: stage-01 → exec_running');
  });

  it('应替换模板中的 {var} 占位符 (en)', () => {
    const result = t('flow.advance.okTmpl', 'en', { stage: 'stage-01', to: 'done' });
    expect(result).toContain('stage-01');
    expect(result).toContain('done');
    expect(result).toBe('✓ Advanced: stage-01 → done');
  });

  it('未提供的变量应保留占位符', () => {
    const result = t('flow.advance.okTmpl', 'zh-CN', { stage: 'stage-01' });
    expect(result).toContain('{to}');
  });
});

describe('getCliLang()', () => {
  it('无配置时返回 zh-CN', () => {
    expect(getCliLang('.')).toBe('zh-CN');
  });
});

describe('VALID_LANGS', () => {
  it('应包含 zh-CN 和 en', () => {
    expect(VALID_LANGS).toEqual(['zh-CN', 'en']);
  });
});
