/**
 * 构建脚本 — 三步管线：注入 core.md → 注入 Agent 定义 → 注入 Skill 定义 → TypeScript 编译
 *
 * 三步管线在 `rmSync` 清理 dist/ 之后、`npx tsc` 编译之前执行，
 * 自动将 .opencode/instructions/core.md 编码为 Base64 注入 templates.ts，
 * 以及将 agents 和 skills 目录下的 Markdown 文件注入 update.ts。
 */
import {
  rmSync,
  readFileSync,
  readdirSync,
  writeFileSync,
  existsSync,
} from 'node:fs';
import { execSync } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// ── 常量 ──────────────────────────────────────────────────────────────

const __dirname = fileURLToPath(new URL('.', import.meta.url));
const TEMPLATES_PATH = resolve(__dirname, 'src', 'core', 'templates.ts');
const UPDATE_PATH = resolve(__dirname, 'src', 'core', 'update.ts');

const CORE_MD_PATH = resolve(__dirname, '.opencode', 'instructions', 'core.md');
const AGENTS_DIR = resolve(__dirname, '.opencode', 'agents');
const SKILLS_DIR = resolve(__dirname, '.opencode', 'skills');

// ── 辅助函数 ──────────────────────────────────────────────────────────

/**
 * 转义内容使其可作为模板字符串的值安全使用
 * 转义顺序：反斜杠 → 反引号 → ${ 插值
 */
function escapeForTemplateString(content) {
  return content
    .replace(/\\/g, '\\\\')
    .replace(/`/g, '\\`')
    .replace(/\${/g, '\\${');
}

/**
 * 读取文件内容并用 try-catch 包裹
 * 失败时输出错误信息并 process.exit(1)
 */
function safeReadFile(filePath) {
  try {
    return readFileSync(filePath, 'utf-8');
  } catch (err) {
    console.error(`✗ 无法读取文件 ${filePath}: ${err.message}`);
    process.exit(1);
  }
}

/**
 * 替换文件中两个 AUTO-GENERATED-BEGIN/END 锚点之间的内容
 * @param {string} filePath - 文件路径
 * @param {string} anchorName - 锚点名（如 CORE_INSTRUCTIONS_TEMPLATE_B64）
 * @param {string} newContent - 要写入锚点之间的新内容
 */
function replaceBetweenAnchors(filePath, anchorName, newContent) {
  const content = safeReadFile(filePath);
  const beginMarker = `// AUTO-GENERATED-BEGIN: ${anchorName}`;
  const endMarker = `// AUTO-GENERATED-END: ${anchorName}`;

  const beginIdx = content.indexOf(beginMarker);
  const endIdx = content.indexOf(endMarker);

  if (beginIdx === -1 || endIdx === -1) {
    console.error(
      `✗ 在 ${filePath} 中未找到锚点 ${beginMarker} / ${endMarker}`,
    );
    process.exit(1);
  }

  const before = content.slice(0, beginIdx + beginMarker.length);
  const after = content.slice(endIdx);

  writeFileSync(filePath, `${before}\n${newContent}\n${after}`, 'utf-8');
}

// ── 管线函数 ──────────────────────────────────────────────────────────

/**
 * 步骤 1：读取 core.md → Base64 编码 → 注入 templates.ts
 */
function generateTemplateFromCoreMd() {
  console.log('⟳ 正在注入 core.md → templates.ts...');
  const coreContent = safeReadFile(CORE_MD_PATH);
  const base64 = Buffer.from(coreContent, 'utf-8').toString('base64');
  const exportLine = `export const CORE_INSTRUCTIONS_TEMPLATE_B64 =\n  "${base64}";`;
  replaceBetweenAnchors(
    TEMPLATES_PATH,
    'CORE_INSTRUCTIONS_TEMPLATE_B64',
    exportLine,
  );
  console.log('✓ core.md 已注入 templates.ts');
}

/**
 * 步骤 2：读取 agents 目录下的 .md 文件 → 注入 update.ts 的 AGENT_DEFINITIONS
 */
function generateAgentDefinitions() {
  console.log('⟳ 正在注入 Agent 定义 → update.ts...');
  if (!existsSync(AGENTS_DIR)) {
    console.warn('⚠ agents 目录不存在，跳过 Agent 定义注入');
    return;
  }

  const agentFiles = readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'));
  const entries = [];

  for (const file of agentFiles) {
    const key = file.replace(/\.md$/, '');
    const content = safeReadFile(join(AGENTS_DIR, file));
    const escaped = escapeForTemplateString(content);
    // 含连字符的 key 需要引号
    const formattedKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
      ? key
      : `'${key}'`;
    entries.push(`  ${formattedKey}: \`${escaped}\`,`);
  }

  const objectBody = `const AGENT_DEFINITIONS: Record<string, string> = {\n${entries.join('\n')}\n};`;
  replaceBetweenAnchors(UPDATE_PATH, 'AGENT_DEFINITIONS', objectBody);
  console.log(`✓ ${agentFiles.length} 个 Agent 定义已注入 update.ts`);
}

/**
 * 步骤 3：读取 skills 目录下的 SKILL.md → 注入 update.ts 的 SKILL_DEFINITIONS
 */
function generateSkillDefinitions() {
  console.log('⟳ 正在注入 Skill 定义 → update.ts...');
  if (!existsSync(SKILLS_DIR)) {
    console.warn('⚠ skills 目录不存在，跳过 Skill 定义注入');
    return;
  }

  const skillDirs = readdirSync(SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const entries = [];

  for (const dir of skillDirs) {
    const skillPath = join(SKILLS_DIR, dir, 'SKILL.md');
    if (!existsSync(skillPath)) {
      console.warn(`⚠ ${dir}/SKILL.md 不存在，跳过`);
      continue;
    }
    const content = safeReadFile(skillPath);
    const escaped = escapeForTemplateString(content);
    entries.push(`  '${dir}': \`${escaped}\`,`);
  }

  const objectBody = `const SKILL_DEFINITIONS: Record<string, string> = {\n${entries.join('\n')}\n};`;
  replaceBetweenAnchors(UPDATE_PATH, 'SKILL_DEFINITIONS', objectBody);
  console.log(`✓ ${entries.length} 个 Skill 定义已注入 update.ts`);
}

// ── 校验函数 ──────────────────────────────────────────────────────────

/**
 * 从锚点之间提取文本内容
 */
function extractBetweenAnchors(filePath, anchorName) {
  const content = safeReadFile(filePath);
  const beginMarker = `// AUTO-GENERATED-BEGIN: ${anchorName}`;
  const endMarker = `// AUTO-GENERATED-END: ${anchorName}`;
  const beginIdx = content.indexOf(beginMarker);
  const endIdx = content.indexOf(endMarker);
  if (beginIdx === -1 || endIdx === -1) {
    console.error(`✗ 在 ${filePath} 中未找到锚点 ${beginMarker} / ${endMarker}`);
    process.exit(1);
  }
  return content.slice(beginIdx + beginMarker.length, endIdx);
}

/**
 * 在文本中找到第一个 { 并匹配对应的闭合 }
 * 正确处理字符串字面量和模板字面量内的括号
 */
function matchBraces(str) {
  const start = str.indexOf('{');
  if (start === -1) return null;

  let depth = 1;
  let inStr = false;
  let inTmpl = false;
  let strChar = '';

  for (let i = start + 1; i < str.length; i++) {
    const ch = str[i];

    // 处理转义序列
    if (ch === '\\' && (inStr || inTmpl)) {
      i++; // 跳过下一个字符
      continue;
    }

    // 字符串分隔符
    if ((ch === '"' || ch === "'") && !inTmpl) {
      if (inStr && ch === strChar) {
        inStr = false;
      } else if (!inStr) {
        inStr = true;
        strChar = ch;
      }
      continue;
    }

    // 模板字面量
    if (ch === '`' && !inStr) {
      inTmpl = !inTmpl;
      continue;
    }

    // 括号计数（仅在字符串和模板外部）
    if (!inStr && !inTmpl) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          return str.slice(start, i + 1);
        }
      }
    }
  }

  return null;
}

/**
 * 反转 escapeForTemplateString 的转义
 */
function unescapeTemplateString(str) {
  return str.replace(/\\([\\`$])/g, (_, char) => char);
}

/**
 * 校验 core.md Base64 模板
 */
function validateCoreInstruction() {
  const section = extractBetweenAnchors(TEMPLATES_PATH, 'CORE_INSTRUCTIONS_TEMPLATE_B64');
  const quoteMatch = section.match(/"([^"]+)"/);
  if (!quoteMatch) {
    return { ok: false, errors: ['无法在 templates.ts 中提取 Base64 字符串'] };
  }
  const b64 = quoteMatch[1];
  const decoded = Buffer.from(b64, 'base64').toString('utf-8');
  const source = safeReadFile(CORE_MD_PATH);

  const normD = decoded.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  const normS = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  if (normD !== normS) {
    const dLines = normD.split('\n');
    const sLines = normS.split('\n');
    const errors = [];
    for (let i = 0; i < Math.max(dLines.length, sLines.length) && errors.length < 5; i++) {
      if (dLines[i] !== sLines[i]) {
        const maxLen = 60;
        const tmpl = (dLines[i] || '').length > maxLen
          ? (dLines[i] || '').slice(0, maxLen) + '...'
          : (dLines[i] || '');
        const src = (sLines[i] || '').length > maxLen
          ? (sLines[i] || '').slice(0, maxLen) + '...'
          : (sLines[i] || '');
        errors.push(`  第 ${i + 1} 行: 模板="${tmpl}", 源文件="${src}"`);
      }
    }
    if (dLines.length !== sLines.length) {
      errors.push(`  行数不同: 模板 ${dLines.length} 行, 源文件 ${sLines.length} 行`);
    }
    return { ok: false, errors };
  }
  return { ok: true, errors: [] };
}

/**
 * 从对象文本中提取模板键值对
 * @param {string} objText - TypeScript 对象字面量文本
 * @returns {Object.<string, string>} 键 → 未转义内容的映射
 */
function extractTemplatePairs(objText) {
  const pattern = /^\s+([a-zA-Z_$][\w$]*|'[^']*'):\s*`((?:[^`\\]|\\.)*)`\s*,?\s*$/gm;
  const entries = {};
  let match;
  while ((match = pattern.exec(objText)) !== null) {
    const key = match[1].replace(/^'|'$/g, '');
    entries[key] = unescapeTemplateString(match[2]);
  }
  return entries;
}

/**
 * 校验模板定义与源文件一致性
 * @param {Object.<string, string>} templateEntries - 从模板对象中提取的条目
 * @param {Object.<string, string>} sourceEntries - 从源文件读取的条目
 * @returns {{ count: number, sourceCount: number, errors: string[] }}
 */
function compareTemplatePairs(templateEntries, sourceEntries) {
  const errors = [];

  // 检查源文件存在但模板缺少的条目
  for (const key of Object.keys(sourceEntries)) {
    if (!(key in templateEntries)) {
      errors.push(`模板缺少条目: ${key}`);
    }
  }

  // 检查模板存在但源文件已删除的条目
  for (const key of Object.keys(templateEntries)) {
    if (!(key in sourceEntries)) {
      errors.push(`模板存在多余条目: ${key}（源文件已删除）`);
    }
  }

  // 检查内容一致性
  for (const key of Object.keys(templateEntries)) {
    if (key in sourceEntries) {
      const normT = templateEntries[key].replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const normS = sourceEntries[key].replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      if (normT !== normS) {
        const tLines = normT.split('\n');
        const sLines = normS.split('\n');
        const diffLines = [];
        for (let i = 0; i < Math.max(tLines.length, sLines.length) && diffLines.length < 5; i++) {
          if (tLines[i] !== sLines[i]) {
            const maxLen = 60;
            const tmpl = (tLines[i] || '').length > maxLen
              ? (tLines[i] || '').slice(0, maxLen) + '...'
              : (tLines[i] || '');
            const src = (sLines[i] || '').length > maxLen
              ? (sLines[i] || '').slice(0, maxLen) + '...'
              : (sLines[i] || '');
            diffLines.push(`  第 ${i + 1} 行: 模板="${tmpl}", 源文件="${src}"`);
          }
        }
        if (tLines.length !== sLines.length) {
          diffLines.push(`  行数不同: 模板 ${tLines.length} 行, 源文件 ${sLines.length} 行`);
        }
        errors.push(`${key}: 内容不一致\n${diffLines.join('\n')}`);
      }
    }
  }

  return {
    count: Object.keys(templateEntries).length,
    sourceCount: Object.keys(sourceEntries).length,
    errors,
  };
}

/**
 * 校验 Agent 定义一致性
 */
function validateAgentDefinitions() {
  const section = extractBetweenAnchors(UPDATE_PATH, 'AGENT_DEFINITIONS');
  const objText = matchBraces(section);
  if (!objText) {
    return { ok: false, count: 0, errors: ['无法在 update.ts 中提取 AGENT_DEFINITIONS 对象'] };
  }

  const templateEntries = extractTemplatePairs(objText);

  // 读取源文件
  const sourceEntries = {};
  if (existsSync(AGENTS_DIR)) {
    const files = readdirSync(AGENTS_DIR).filter((f) => f.endsWith('.md'));
    for (const file of files) {
      const key = file.replace(/\.md$/, '');
      sourceEntries[key] = safeReadFile(join(AGENTS_DIR, file));
    }
  }

  const result = compareTemplatePairs(templateEntries, sourceEntries);
  return { ok: result.errors.length === 0, count: result.count, errors: result.errors };
}

/**
 * 校验 Skill 定义一致性
 */
function validateSkillDefinitions() {
  const section = extractBetweenAnchors(UPDATE_PATH, 'SKILL_DEFINITIONS');
  const objText = matchBraces(section);
  if (!objText) {
    return { ok: false, count: 0, errors: ['无法在 update.ts 中提取 SKILL_DEFINITIONS 对象'] };
  }

  const templateEntries = extractTemplatePairs(objText);

  // 读取源文件（skills/*/SKILL.md）
  const sourceEntries = {};
  if (existsSync(SKILLS_DIR)) {
    const dirs = readdirSync(SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const dir of dirs) {
      const skillPath = join(SKILLS_DIR, dir.name, 'SKILL.md');
      if (existsSync(skillPath)) {
        sourceEntries[dir.name] = safeReadFile(skillPath);
      }
    }
  }

  const result = compareTemplatePairs(templateEntries, sourceEntries);
  return { ok: result.errors.length === 0, count: result.count, errors: result.errors };
}

/**
 * 主校验函数：依次校验三类模板，输出摘要或 exit(1)
 */
function validateTemplates() {
  console.log('');
  console.log('⟳ 正在校验模板一致性...');

  // 1. core.md Base64
  const coreResult = validateCoreInstruction();

  // 2. Agent 定义
  const agentResult = validateAgentDefinitions();

  // 3. Skill 定义
  const skillResult = validateSkillDefinitions();

  const results = [
    { name: `core.md (Base64)`, ok: coreResult.ok, errors: coreResult.errors },
    { name: `Agent 定义 (${agentResult.count} 个)`, ok: agentResult.ok, errors: agentResult.errors },
    { name: `Skill 定义 (${skillResult.count} 个)`, ok: skillResult.ok, errors: skillResult.errors },
  ];

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;

  if (passed === total) {
    console.log(`  ✓ 模板一致性校验通过 (${total}/${total})`);
    for (const r of results) {
      console.log(`    ✓ ${r.name} — 一致`);
    }
  } else {
    console.error(`  ✗ 模板一致性校验失败 (${passed}/${total})`);
    for (const r of results) {
      if (r.ok) {
        console.log(`    ✓ ${r.name} — 一致`);
      } else {
        console.error(`    ✗ ${r.name} — 不一致`);
        if (r.errors && r.errors.length > 0) {
          for (const e of r.errors) {
            console.error(`      ${e}`);
          }
        }
      }
    }
    process.exit(1);
  }
}

// ── 主流程 ────────────────────────────────────────────────────────────

try {
  // 清理旧的编译产物
  rmSync('dist', { recursive: true, force: true });
  console.log('✓ dist/ 已清理');

  // 三步管线：注入动态内容到源文件
  generateTemplateFromCoreMd();
  generateAgentDefinitions();
  generateSkillDefinitions();

  // 执行 TypeScript 编译
  execSync('npx tsc', { stdio: 'inherit' });
  console.log('✓ TypeScript 编译完成');

  // 校验模板一致性
  validateTemplates();
} catch (err) {
  console.error(`✗ 构建失败: ${err.message}`);
  process.exit(1);
}
