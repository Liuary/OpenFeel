/**
 * template-loader 单元测试
 * 验证中英文模板加载函数的正确性和回退逻辑
 */
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  loadAgentTemplate,
  listAgentIds,
  loadOpencodeAgentTemplate,
  listOpencodeAgentIds,
  listOpencodeSkillNames,
  loadTemplate,
} from '../../src/core/template-loader.js';
import { splitFrontmatter } from '../../src/core/managed-region.js';

describe('loadAgentTemplate', () => {
  it('zh-CN feel 返回非空字符串，含中文内容', () => {
    const result = loadAgentTemplate('zh-CN', 'feel');
    expect(result).toBeTruthy();
    expect(result).toContain('总统领');
  });

  it('en feel 返回非空字符串，含英文内容，含 Orchestrator', () => {
    const result = loadAgentTemplate('en', 'feel');
    expect(result).toBeTruthy();
    expect(result).toContain('Orchestrator');
  });

  it('zh-CN openfeel-archiver 返回中文 openfeel-archiver 模板', () => {
    const result = loadAgentTemplate('zh-CN', 'openfeel-archiver');
    expect(result).toBeTruthy();
    expect(result).toContain('归档官');
    expect(result).toContain('openfeel-archiver');
  });

  it('en openfeel-archiver 返回英文 openfeel-archiver 模板', () => {
    const result = loadAgentTemplate('en', 'openfeel-archiver');
    expect(result).toBeTruthy();
    expect(result).toContain('openfeel-archiver');
    expect(result).toContain('finalizer');
  });

  it('fr feel 回退到 zh-CN，返回中文内容', () => {
    const result = loadAgentTemplate('fr', 'feel');
    expect(result).toBeTruthy();
    expect(result).toContain('总统领');
  });

  it('en nonexistent 抛出 Error，信息含 actual lang=en', () => {
    expect(() => loadAgentTemplate('en', 'nonexistent')).toThrowError(
      /actual lang=en/
    );
  });
});

describe('listAgentIds', () => {
  it('zh-CN 返回 9 个 Agent ID 数组', () => {
    const ids = listAgentIds('zh-CN');
    expect(ids).toHaveLength(9);
    expect(ids).toContain('feel');
    expect(ids).toContain('openfeel-executor');
    expect(ids).toContain('openfeel-planner');
    expect(ids).toContain('openfeel-schemer');
    expect(ids).toContain('openfeel-reviewer');
    expect(ids).toContain('openfeel-feel-tester');
    expect(ids).toContain('openfeel-archiver');
    expect(ids).toContain('openfeel-utility');
    expect(ids).toContain('openfeel-vision');
  });

  it('en 返回 9 个 Agent ID 数组（与 zh-CN 相同）', () => {
    const zhIds = listAgentIds('zh-CN');
    const enIds = listAgentIds('en');
    expect(enIds).toHaveLength(9);
    expect(enIds).toEqual(zhIds);
  });

  it('fr 回退到 zh-CN，仍返回 9 个 ID', () => {
    const ids = listAgentIds('fr');
    expect(ids).toHaveLength(9);
  });
});

describe('命名前缀完整性', () => {
  it('listAgentIds 返回 9 项：feel 不带前缀、其余 8 项带 openfeel-', () => {
    const ids = listAgentIds('zh-CN');
    expect(ids).toHaveLength(9);
    expect(ids).toContain('feel');
    expect(ids.filter((id) => id.startsWith('openfeel-'))).toHaveLength(8);
    expect(ids.every((id) => id === 'feel' || id.startsWith('openfeel-'))).toBe(true);
  });

  it('listOpencodeAgentIds 双语均返回 9 项且 8 项带前缀', () => {
    for (const lang of ['zh-CN', 'en']) {
      const ids = listOpencodeAgentIds(lang);
      expect(ids).toHaveLength(9);
      expect(ids).toContain('feel');
      expect(ids.filter((id) => id.startsWith('openfeel-'))).toHaveLength(8);
    }
  });

  it('listOpencodeSkillNames 返回 17 项全部带 openfeel- 前缀', () => {
    const names = listOpencodeSkillNames();
    expect(names).toHaveLength(17);
    expect(names.every((n) => n.startsWith('openfeel-'))).toBe(true);
    expect(names).toContain('openfeel-workspace');
    expect(names).toContain('openfeel-tool-usage');
    expect(names).toContain('openfeel-cli-usage');
  });
});

describe('loadTemplate', () => {
  it('zh-CN agents-md 返回 UTF-8 明文中文模板', () => {
    const result = loadTemplate('zh-CN', 'agents-md');
    expect(result).toBeTruthy();
    expect(result).toContain('你应当以中文思维思考问题');
  });

  it('en agents-md 返回 UTF-8 明文英文模板', () => {
    const result = loadTemplate('en', 'agents-md');
    expect(result).toBeTruthy();
    expect(result).toContain('You should think in English');
  });

  it('zh-CN agents-md 含工作区结构约束（core.md 内容已并入）', () => {
    const result = loadTemplate('zh-CN', 'agents-md');
    expect(result).toBeTruthy();
    expect(result).toContain('.openfeel');
    expect(result).toContain('项目特有约束（可选化）');
    expect(result).toMatch(/[\u4e00-\u9fff]/);
    expect(result).not.toContain('{项目名称}');
  });

  it('en agents-md 含对应工作区结构约束', () => {
    const result = loadTemplate('en', 'agents-md');
    expect(result).toBeTruthy();
    expect(result).toContain('Public Domain');
    expect(result).toContain('Project-Specific Constraints');
    expect(result).toMatch(/[a-zA-Z]/);
    expect(result).not.toContain('{项目名称}');
  });

  it('agents-md 部署路径表述已泛化（stage-45）', () => {
    // 锁定部署路径行已改为无平台限定表述，防止回退为「opencode 唯一 harness」
    expect(loadTemplate('zh-CN', 'agents-md')).toContain('当前 harness');
    expect(loadTemplate('en', 'agents-md')).toContain('current harness');
  });

  it('fr agents-md 回退到 zh-CN', () => {
    const result = loadTemplate('fr', 'agents-md');
    expect(result).toBeTruthy();
    expect(result).toContain('.openfeel');
  });
});

/**
 * op-003 模板静态断言（REV-907：仅静态断言，不做行为级 E2E）
 * 读取模板源文件（src/core/templates-data/...），断言会话启动修复规则已落地。
 */
describe('update_infos 会话启动修复规则（模板静态断言）', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');

  it('feel.md（zh-CN）含 update_infos 检查修复节 + edit 工具勾选措辞 + 重启提醒', () => {
    const content = read('../../src/core/templates-data/opencode/agents/zh-CN/feel.md');
    expect(content).toContain('update_infos');
    expect(content).toContain('`- [ ]`');
    expect(content).toContain('`- [x]`');
    expect(content).toContain('edit 工具');
    expect(content).toContain('重启会话');
    // REV-1003：Feel 不能 import TS 模块，不得出现 resolveUpdateInfo/clearUpdateInfos 调用
    expect(content).not.toContain('resolveUpdateInfo');
    expect(content).not.toContain('clearUpdateInfos');
  });

  it('feel.md（en）含对应节 + edit 工具勾选措辞 + 重启提醒', () => {
    const content = read('../../src/core/templates-data/opencode/agents/en/feel.md');
    expect(content).toContain('update_infos');
    expect(content).toContain('`- [ ]`');
    expect(content).toContain('`- [x]`');
    expect(content).toContain('edit tool');
    expect(content).toContain('restart');
    expect(content).not.toContain('resolveUpdateInfo');
    expect(content).not.toContain('clearUpdateInfos');
  });

  it('openfeel-workspace skill 含提示性约束且不自行修改（REV-902）', () => {
    const content = read('../../src/core/templates-data/opencode/skills/openfeel-workspace/SKILL.md');
    expect(content).toContain('update_infos.md');
    expect(content).toContain('不自行修改');
    expect(content).not.toContain('resolveUpdateInfo');
    expect(content).not.toContain('clearUpdateInfos');
  });

  it('agents-md（en）为全局约束层且不含 update info 内部函数调用', () => {
    const content = read('../../src/core/templates-data/agents-md/en.md');
    expect(content).toContain('Global Behavioral Constraints');
    expect(content).not.toContain('resolveUpdateInfo');
    expect(content).not.toContain('clearUpdateInfos');
  });

  // stage-46 op-004：三类处理（含备份类 + backup_failed 分派）
  it('feel.md（zh-CN/en）含「备份」类处理关键词（stage-46）', () => {
    const zh = loadAgentTemplate('zh-CN', 'feel');
    expect(zh).toContain('备份条目');
    expect(zh).toContain('backup_failed');
    expect(zh).toContain('三类');

    const en = loadAgentTemplate('en', 'feel');
    expect(en).toContain('Backup entries');
    expect(en).toContain('backup_failed');
    expect(en).toContain('three kinds');
  });
});

/**
 * stage-44 权限模型断言
 * 锁定 9 agent × zh/en 权威源补键（external_directory）、双语键集一致、
 * utility 键与 opencode schema 对齐（write → edit，依据 op-001 实测）、
 * 部署源（OPENCODE_AGENT_TEMPLATES）与权威源双注入一致。
 */
describe('权限模型（stage-44）', () => {
  const LANGS = ['zh-CN', 'en'] as const;

  /** 值形式容错：单值 "allow" 或对象 { "*": "allow" } 均视为 allow 语义 */
  const isAllow = (v: unknown): boolean =>
    v === 'allow' ||
    (typeof v === 'object' && v !== null && (v as Record<string, unknown>)['*'] === 'allow');

  /** 取某 agent 模板 frontmatter 中 permission 的键集（排序后） */
  const permKeys = (lang: string, id: string): string[] => {
    const fm = splitFrontmatter(loadAgentTemplate(lang, id))?.frontmatter ?? {};
    const perm = (fm.permission ?? {}) as Record<string, unknown>;
    return Object.keys(perm).sort();
  };

  const permOf = (content: string): Record<string, unknown> => {
    const fm = splitFrontmatter(content)?.frontmatter ?? {};
    return (fm.permission ?? {}) as Record<string, unknown>;
  };

  it('9 agent × zh/en 权威源 permission 均含 external_directory 且值为 allow', () => {
    for (const lang of LANGS) {
      expect(listAgentIds(lang)).toHaveLength(9);
      for (const id of listAgentIds(lang)) {
        const perm = permOf(loadAgentTemplate(lang, id));
        expect(perm, `${lang}/${id}`).toHaveProperty('external_directory');
        expect(isAllow(perm.external_directory), `${lang}/${id} 值`).toBe(true);
      }
    }
  });

  it('zh/en permission 键集逐 agent 一致', () => {
    for (const id of listAgentIds('zh-CN')) {
      expect(permKeys('zh-CN', id), id).toEqual(permKeys('en', id));
    }
  });

  it('utility 键与 schema 对齐（write 未识别 → 含 edit、不含 write）', () => {
    for (const lang of LANGS) {
      const keys = permKeys(lang, 'openfeel-utility');
      expect(keys, lang).toContain('edit');
      expect(keys, lang).not.toContain('write');
      expect(keys, lang).toContain('external_directory');
    }
  });

  it('feel-tester 保留 webfetch: deny（回归）', () => {
    for (const lang of LANGS) {
      const perm = permOf(loadAgentTemplate(lang, 'openfeel-feel-tester'));
      expect(perm.webfetch, lang).toBe('deny');
      expect(perm, lang).toHaveProperty('external_directory');
    }
  });

  it('部署源 OPENCODE_AGENT_TEMPLATES 与权威源键集一致且含 external_directory', () => {
    for (const lang of LANGS) {
      expect(listOpencodeAgentIds(lang).sort()).toEqual(listAgentIds(lang).sort());
      for (const id of listOpencodeAgentIds(lang)) {
        const srcPerm = permOf(loadAgentTemplate(lang, id));
        const depPerm = permOf(loadOpencodeAgentTemplate(lang, id));
        expect(Object.keys(depPerm).sort(), `${lang}/${id} 部署源`).toEqual(
          Object.keys(srcPerm).sort()
        );
        expect(depPerm, `${lang}/${id} 部署源`).toHaveProperty('external_directory');
        expect(isAllow(depPerm.external_directory), `${lang}/${id} 部署源值`).toBe(true);
      }
    }
  });
});

/**
 * stage-48 事件 A（审查纪律）+ op-004（权限措辞）静态断言
 * 锁定 reviewer / feel 模板新纪律与 agents-md 措辞（防回退）。
 */
describe('事件 A 审查纪律与权限措辞（stage-48）', () => {
  it('reviewer 模板（zh/en）含工具异常四纪律关键词', () => {
    const zh = loadAgentTemplate('zh-CN', 'openfeel-reviewer');
    expect(zh).toContain('工具调用异常');
    expect(zh).toContain('独立取证');
    expect(zh).toContain('第三方可复现');

    const en = loadAgentTemplate('en', 'openfeel-reviewer');
    expect(en).toContain('Tool-Failure');
    expect(en).toContain('Independent-Evidence');
    expect(en).toContain('reproducible');
  });

  it('feel 模板（zh/en）含审查会话健康探测与可疑产出处置', () => {
    const zh = loadAgentTemplate('zh-CN', 'feel');
    expect(zh).toContain('审查会话健康探测');
    expect(zh).toContain('待复核');

    const en = loadAgentTemplate('en', 'feel');
    expect(en).toContain('Reviewer-Session Health Probe');
    expect(en).toContain('pending re-review');
  });

  it('agents-md（zh/en）权限措辞含「opencode 平台默认为 ask」限定（op-004）', () => {
    expect(loadTemplate('zh-CN', 'agents-md')).toContain('平台默认为 `ask`');
    expect(loadTemplate('en', 'agents-md')).toContain('platform default is `ask`');
  });
});

/**
 * stage-51 op-007 N9-4：archiver 模板去重口径改为 CLI 命令（A6）
 */
describe('stage-51 op-007 N9-4：模板去重口径（A6）', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');

  it('openfeel-archiver（zh/en）不含 kb-dedup 源码路径表述，改为 openfeel knowledge dedup', () => {
    for (const lang of ['zh-CN', 'en']) {
      const content = read(`../../src/core/templates-data/opencode/agents/${lang}/openfeel-archiver.md`);
      expect(content, lang).not.toContain('kb-dedup');
      expect(content, lang).toContain('openfeel knowledge dedup');
    }
  });

  it('生成的 agent 模板（loadAgentTemplate）与权威源一致（无 kb-dedup 残留）', () => {
    expect(loadAgentTemplate('zh-CN', 'openfeel-archiver')).not.toContain('kb-dedup');
    expect(loadAgentTemplate('en', 'openfeel-archiver')).not.toContain('kb-dedup');
  });
});

/**
 * stage-53（op-005 D10-2）：两条设计目的 + dev_last 索引化 + A6/A9/A10 静态断言
 */
describe('stage-53：工作区结构节与 dev_last 索引化（静态断言）', () => {
  const read = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');

  it('agents-md（zh/en）含两条设计目的 + 分层原则', () => {
    const zh = read('../../src/core/templates-data/agents-md/zh-CN.md');
    const en = read('../../src/core/templates-data/agents-md/en.md');
    expect(zh).toContain('保存核心信息便于恢复');
    expect(zh).toContain('避免无关信息污染上下文');
    expect(en).toContain('Preserve the core information needed for recovery');
    expect(en).toContain('Avoid polluting the context');
  });

  it('agents-md（zh/en）含 dev_last 索引骨架 + R4/R6 + A9/A10', () => {
    const zh = read('../../src/core/templates-data/agents-md/zh-CN.md');
    const en = read('../../src/core/templates-data/agents-md/en.md');
    for (const s of ['主题索引（最多 5 个）', '已收敛主题', '公共交接区', '优先合并同类主题']) {
      expect(zh, `zh 缺 ${s}`).toContain(s);
    }
    for (const s of ['Topic Index', 'Converged Topics', 'Public Handoff Section', 'merge similar topics first']) {
      expect(en, `en 缺 ${s}`).toContain(s);
    }
    // A9 加锁协议
    for (const s of ['withFileLock', 'dev-last-', '.openfeel/tmp/locks/', 'atomicWriteFileSync']) {
      expect(zh, `zh 缺 ${s}`).toContain(s);
      expect(en, `en 缺 ${s}`).toContain(s);
    }
    // A10：5 个英文主题文件名
    for (const n of ['pending.md', 'decisions.md', 'pipeline-state.md', 'last-operation.md', 'experience.md']) {
      expect(zh, `zh 缺 dev_last/${n}`).toContain(`dev_last/${n}`);
      expect(en, `en 缺 dev_last/${n}`).toContain(`dev_last/${n}`);
    }
  });

  it('feel.md（zh/en）含索引口径 + dev_last 主题文件 + 公共交接区 + 加锁', () => {
    const zh = read('../../src/core/templates-data/opencode/agents/zh-CN/feel.md');
    const en = read('../../src/core/templates-data/opencode/agents/en/feel.md');
    for (const [name, c] of [['zh', zh], ['en', en]] as const) {
      expect(c, `${name} 缺 dev_last/`).toContain('dev_last/');
      expect(c, `${name} 缺 withFileLock`).toContain('withFileLock');
      expect(c, `${name} 缺 dev-last-`).toContain('dev-last-');
    }
    expect(zh).toContain('公共交接区');
    expect(en).toContain('Public Handoff');
    expect(zh).toContain('dev_last/decisions.md');
    expect(en).toContain('dev_last/decisions.md');
  });

  it('sync-status skill 无 @{username} 提取依赖，改读 flow.json（A6）', () => {
    const c = read('../../src/core/templates-data/opencode/skills/openfeel-sync-status/SKILL.md');
    expect(c).not.toContain('@{username}');
    expect(c).toContain('flow.json');
  });

  it('workspace/recover skill 含 dev_last/ 与 current_archive', () => {
    const ws = read('../../src/core/templates-data/opencode/skills/openfeel-workspace/SKILL.md');
    const rc = read('../../src/core/templates-data/opencode/skills/openfeel-recover/SKILL.md');
    expect(ws).toContain('current_archive');
    expect(ws).toContain('dev_last/');
    expect(rc).toContain('dev_last/');
  });
});

/**
 * stage-55 op-003 迁移：生成模板串无 CRLF（跨平台可复现）
 * 迁移自 test/core/opencode-instance.test.ts（原 #5）——断言对象为生成段宿主文件
 * `src/core/template-loader.ts` / `src/core/update.ts`，其对象仍成立（仓库根受管实例移除不影响）。
 */
describe('stage-55 迁移：生成模板串无 CRLF（跨平台可复现）', () => {
  const readRel = (rel: string) => readFileSync(fileURLToPath(new URL(rel, import.meta.url)), 'utf-8');

  it('template-loader.ts 与 update.ts 无 CRLF', () => {
    for (const rel of ['../../src/core/template-loader.ts', '../../src/core/update.ts']) {
      const c = readRel(rel);
      expect(c.includes('\r\n'), rel).toBe(false);
    }
  });
});

/**
 * stage-55 op-005 补齐：reviewer 纪律节模板源断言（REV-003）
 * 背景：原 opencode-instance.test.ts 的 it#7 断言对象（仓库自举实例）已于 stage-55 移除；
 *       F4 条件句「若既有模板源测试未覆盖则新增 1 条」当时未落地 → 本 op 补齐。
 * 对象：权威源 templates-data/opencode/agents/{zh-CN,en}/openfeel-reviewer.md（:91 节）。
 * 目的：防止未来模板编辑误删该纪律节而无测试拦截（覆盖回归修复）。
 */
describe('stage-55 op-005 迁移：reviewer 纪律节（模板源，REV-003）', () => {
  it('zh-CN reviewer 模板含工具调用异常与独立取证纪律节', () => {
    const zh = loadOpencodeAgentTemplate('zh-CN', 'openfeel-reviewer');
    expect(zh).toBeTruthy();
    expect(zh).toContain('工具调用异常与独立取证纪律');
    expect(zh).toContain('命令行取证优先于 read / glob');
  });

  it('en reviewer 模板含 Tool-Failure & Independent-Evidence Discipline 节', () => {
    const en = loadOpencodeAgentTemplate('en', 'openfeel-reviewer');
    expect(en).toBeTruthy();
    expect(en).toContain('Tool-Failure & Independent-Evidence Discipline');
    expect(en).toContain('CLI evidence outranks read / glob');
  });
});
