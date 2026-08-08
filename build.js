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
const TEMPLATE_LOADER_PATH = resolve(__dirname, 'src', 'core', 'template-loader.ts');

const TEMPLATES_DATA_DIR = resolve(__dirname, 'src', 'core', 'templates-data');
const TEMPLATE_AGENTS_DIR = resolve(TEMPLATES_DATA_DIR, 'agents');
const TEMPLATE_CORE_MD_PATH = resolve(TEMPLATES_DATA_DIR, 'core-instructions', 'zh-CN.md');
const TEMPLATE_AGENTS_MD_PATH = resolve(TEMPLATES_DATA_DIR, 'agents-md', 'zh-CN.md');
const TEMPLATE_CORE_INSTRUCTIONS_DIR = resolve(TEMPLATES_DATA_DIR, 'core-instructions');
const TEMPLATE_AGENTS_MD_DIR = resolve(TEMPLATES_DATA_DIR, 'agents-md');

const CORE_MD_PATH = resolve(__dirname, '.opencode', 'instructions', 'core.md');
const AGENTS_DIR = resolve(__dirname, '.opencode', 'agents');
const SKILLS_DIR = resolve(__dirname, '.opencode', 'skills');

// opencode 模板数据源目录（templates-data/opencode/）
const TEMPLATE_OPENCODE_DIR = resolve(TEMPLATES_DATA_DIR, 'opencode');
const TEMPLATE_OPENCODE_AGENTS_DIR = resolve(TEMPLATE_OPENCODE_DIR, 'agents');
const TEMPLATE_OPENCODE_SKILLS_DIR = resolve(TEMPLATE_OPENCODE_DIR, 'skills');
const TEMPLATE_OPENCODE_INSTRUCTIONS_DIR = resolve(TEMPLATE_OPENCODE_DIR, 'instructions');

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
 * 步骤 1：读取 templates-data/core-instructions/ 下所有 .md 文件 → CRLF→LF 归一化 → Base64 编码 → 注入 template-loader.ts
 * 每个文件名（不含扩展名）作为语言键
 * [FIX] REV-003：读取后先归一化行尾（CRLF→LF），再 Base64 编码，确保跨平台可复现
 */
function generateTemplateFromCoreMd() {
  console.log('⟳ 正在注入 core-instructions 模板 → template-loader.ts...');
  if (!existsSync(TEMPLATE_CORE_INSTRUCTIONS_DIR)) {
    console.warn('⚠ templates-data/core-instructions/ 目录不存在，跳过 core-instructions 注入');
    return;
  }

  const mdFiles = readdirSync(TEMPLATE_CORE_INSTRUCTIONS_DIR).filter((f) => f.endsWith('.md'));
  const entries = [];

  for (const file of mdFiles) {
    const lang = file.replace(/\.md$/, '');
    let content = safeReadFile(join(TEMPLATE_CORE_INSTRUCTIONS_DIR, file));
    // [FIX] REV-003：CRLF→LF 归一化，确保跨平台 B64 编码一致
    content = content.replace(/\r\n/g, '\n');
    const base64 = Buffer.from(content, 'utf-8').toString('base64');
    // 含连字符的 lang 键需要引号
    const formattedLang = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(lang) ? lang : `'${lang}'`;
    entries.push(`  ${formattedLang}: '${base64}'`);
  }

  const objectBody = `const CORE_INSTRUCTIONS_TEMPLATES: Record<string, string> = {\n${entries.join(',\n')}\n};`;
  replaceBetweenAnchors(
    TEMPLATE_LOADER_PATH,
    'CORE_INSTRUCTIONS_TEMPLATES',
    objectBody,
  );
  console.log(`✓ ${mdFiles.length} 个语言的 core-instructions 模板已注入 template-loader.ts`);
}

/**
 * 步骤 2：读取 templates-data/agents/ 下各语言子目录的 .md 文件 → 注入 template-loader.ts 的 AGENT_TEMPLATES
 * 数据结构为双层 Record: Record<string, Record<string, string>>
 * 每个语言子目录（如 zh-CN/、en/）作为一个顶层语言键
 */
function generateAgentDefinitions() {
  console.log('⟳ 正在注入 Agent 模板 → template-loader.ts...');
  if (!existsSync(TEMPLATE_AGENTS_DIR)) {
    console.warn('⚠ templates-data/agents/ 目录不存在，跳过 Agent 模板注入');
    return;
  }

  const langDirs = readdirSync(TEMPLATE_AGENTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const langEntries = [];
  let totalAgentCount = 0;

  for (const lang of langDirs) {
    const langPath = join(TEMPLATE_AGENTS_DIR, lang);
    const agentFiles = readdirSync(langPath).filter((f) => f.endsWith('.md'));
    const entries = [];

    for (const file of agentFiles) {
      const key = file.replace(/\.md$/, '');
      const content = safeReadFile(join(langPath, file));
      const escaped = escapeForTemplateString(content);
      // 含连字符的 key 需要引号
      const formattedKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
        ? key
        : `'${key}'`;
      entries.push(`    ${formattedKey}: \`${escaped}\`,`);
    }

    // 含连字符的语言键需要引号
    const formattedLang = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(lang)
      ? lang
      : `'${lang}'`;
    langEntries.push(`  ${formattedLang}: {\n${entries.join('\n')}\n  }`);
    totalAgentCount += agentFiles.length;
  }

  const objectBody = `const AGENT_TEMPLATES: Record<string, Record<string, string>> = {\n${langEntries.join(',\n')}\n};`;
  replaceBetweenAnchors(TEMPLATE_LOADER_PATH, 'AGENT_TEMPLATES', objectBody);
  console.log(`✓ ${langDirs.length} 个语言, ${totalAgentCount} 个 Agent 模板已注入 template-loader.ts`);
}

/**
 * 步骤 3：读取 templates-data/agents-md/ 下所有 .md 文件 → 转义 → 注入 template-loader.ts 的 AGENTS_MD_TEMPLATES
 * 每个文件名（不含扩展名）作为语言键
 */
function generateAgentsMdTemplate() {
  console.log('⟳ 正在注入 agents-md 模板 → template-loader.ts...');
  if (!existsSync(TEMPLATE_AGENTS_MD_DIR)) {
    console.warn('⚠ templates-data/agents-md/ 目录不存在，跳过 agents-md 注入');
    return;
  }

  const mdFiles = readdirSync(TEMPLATE_AGENTS_MD_DIR).filter((f) => f.endsWith('.md'));
  const entries = [];

  for (const file of mdFiles) {
    const lang = file.replace(/\.md$/, '');
    const content = safeReadFile(join(TEMPLATE_AGENTS_MD_DIR, file));
    const escaped = escapeForTemplateString(content);
    // 含连字符的 lang 键需要引号
    const formattedLang = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(lang) ? lang : `'${lang}'`;
    entries.push(`  ${formattedLang}: \`${escaped}\``);
  }

  const objectBody = `const AGENTS_MD_TEMPLATES: Record<string, string> = {\n${entries.join(',\n')}\n};`;
  replaceBetweenAnchors(
    TEMPLATE_LOADER_PATH,
    'AGENTS_MD_TEMPLATES',
    objectBody,
  );
  console.log(`✓ ${mdFiles.length} 个语言的 agents-md 模板已注入 template-loader.ts`);
}

/**
 * 步骤 4：读取 skills 目录下的 SKILL.md → 注入 update.ts 的 SKILL_DEFINITIONS
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

/**
 * 步骤 5：遍历 templates-data/opencode/agents/{zh-CN,en}/ 下的 .md 文件
 * → 转义 → 注入 template-loader.ts 的 OPENCODE_AGENT_TEMPLATES
 * 数据结构为双层 Record: Record<string, Record<string, string>>（与 AGENT_TEMPLATES 同构）
 */
function generateOpencodeAgentTemplates() {
  console.log('⟳ 正在注入 opencode Agent 模板 → template-loader.ts...');
  if (!existsSync(TEMPLATE_OPENCODE_AGENTS_DIR)) {
    console.warn('⚠ templates-data/opencode/agents/ 目录不存在，跳过 opencode Agent 模板注入');
    return;
  }

  const langDirs = readdirSync(TEMPLATE_OPENCODE_AGENTS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const langEntries = [];
  let totalAgentCount = 0;

  for (const lang of langDirs) {
    const langPath = join(TEMPLATE_OPENCODE_AGENTS_DIR, lang);
    const agentFiles = readdirSync(langPath).filter((f) => f.endsWith('.md'));
    const entries = [];

    for (const file of agentFiles) {
      const key = file.replace(/\.md$/, '');
      const content = safeReadFile(join(langPath, file));
      const escaped = escapeForTemplateString(content);
      // 含连字符的 key（如 feel-tester）需要引号
      const formattedKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(key)
        ? key
        : `'${key}'`;
      entries.push(`    ${formattedKey}: \`${escaped}\`,`);
    }

    // 含连字符的语言键需要引号
    const formattedLang = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(lang)
      ? lang
      : `'${lang}'`;
    langEntries.push(`  ${formattedLang}: {\n${entries.join('\n')}\n  }`);
    totalAgentCount += agentFiles.length;
  }

  const objectBody = `const OPENCODE_AGENT_TEMPLATES: Record<string, Record<string, string>> = {\n${langEntries.join(',\n')}\n};`;
  replaceBetweenAnchors(TEMPLATE_LOADER_PATH, 'OPENCODE_AGENT_TEMPLATES', objectBody);
  console.log(`✓ ${langDirs.length} 个语言, ${totalAgentCount} 个 opencode Agent 模板已注入 template-loader.ts`);
}

/**
 * 步骤 6：遍历 templates-data/opencode/skills/ 子目录，读取各 SKILL.md
 * → 转义 → 注入 template-loader.ts 的 OPENCODE_SKILL_DEFINITIONS
 * 数据结构为 Record<string, string>（skill 名 → 内容）
 */
function generateOpencodeSkillTemplates() {
  console.log('⟳ 正在注入 opencode Skill 定义 → template-loader.ts...');
  if (!existsSync(TEMPLATE_OPENCODE_SKILLS_DIR)) {
    console.warn('⚠ templates-data/opencode/skills/ 目录不存在，跳过 opencode Skill 定义注入');
    return;
  }

  const skillDirs = readdirSync(TEMPLATE_OPENCODE_SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const entries = [];

  for (const dir of skillDirs) {
    const skillPath = join(TEMPLATE_OPENCODE_SKILLS_DIR, dir, 'SKILL.md');
    if (!existsSync(skillPath)) {
      console.warn(`⚠ ${dir}/SKILL.md 不存在，跳过`);
      continue;
    }
    const content = safeReadFile(skillPath);
    const escaped = escapeForTemplateString(content);
    // 含连字符的 skill 名（如 agent-model-check）需要引号
    const formattedKey = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(dir)
      ? dir
      : `'${dir}'`;
    entries.push(`  ${formattedKey}: \`${escaped}\`,`);
  }

  const objectBody = `const OPENCODE_SKILL_DEFINITIONS: Record<string, string> = {\n${entries.join('\n')}\n};`;
  replaceBetweenAnchors(TEMPLATE_LOADER_PATH, 'OPENCODE_SKILL_DEFINITIONS', objectBody);
  console.log(`✓ ${entries.length} 个 opencode Skill 定义已注入 template-loader.ts`);
}

/**
 * 步骤 7：读取 opencode 配置类模板 → 注入 template-loader.ts 的 OPENCODE_CONFIG_TEMPLATES
 * 结构：Record<lang, Record<configName, string>>
 * - [lang].instructions ← templates-data/opencode/instructions/{lang}.md
 * - [lang].opencode_jsonc ← templates-data/opencode/opencode.jsonc（SKILLS_PLACEHOLDER → 实际 skills 列表）
 * - [lang].adapter ← templates-data/opencode/ADAPTER.{lang}.md
 * - [lang].gitignore ← templates-data/opencode/.gitignore（不区分语言，两语言重复注入）
 */
function generateOpencodeConfigTemplates() {
  console.log('⟳ 正在注入 opencode 配置模板 → template-loader.ts...');
  if (!existsSync(TEMPLATE_OPENCODE_DIR)) {
    console.warn('⚠ templates-data/opencode/ 目录不存在，跳过 opencode 配置模板注入');
    return;
  }

  // 读取 opencode.jsonc 模板并替换 skills 占位锚点为实际 skills 列表
  const jsoncTemplatePath = join(TEMPLATE_OPENCODE_DIR, 'opencode.jsonc');
  let jsoncContent = safeReadFile(jsoncTemplatePath);
  const skillsList = readdirSync(TEMPLATE_OPENCODE_SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  // 生成 "skill-name": ".opencode/skills/skill-name" 格式的 JSON 对象
  const skillsObject = `{\n${skillsList.map((s) => `    "${s}": ".opencode/skills/${s}"`).join(',\n')}\n  }`;
  jsoncContent = jsoncContent.replace(/"SKILLS_PLACEHOLDER"/, skillsObject);

  const gitignoreContent = safeReadFile(join(TEMPLATE_OPENCODE_DIR, '.gitignore'));
  const langEntries = [];
  const langs = ['zh-CN', 'en'];

  for (const lang of langs) {
    const instructionsPath = join(TEMPLATE_OPENCODE_INSTRUCTIONS_DIR, `${lang}.md`);
    const adapterPath = join(TEMPLATE_OPENCODE_DIR, `ADAPTER.${lang}.md`);
    const entries = [];

    // instructions 模板（Base64 编码，与 core-instructions 一致的处理）
    if (existsSync(instructionsPath)) {
      let content = safeReadFile(instructionsPath);
      content = content.replace(/\r\n/g, '\n');
      const base64 = Buffer.from(content, 'utf-8').toString('base64');
      entries.push(`    instructions: '${base64}',`);
    } else {
      console.warn(`⚠ ${instructionsPath} 不存在，跳过 instructions 注入`);
    }

    // opencode.jsonc 模板（转义后注入）
    entries.push(`    opencode_jsonc: \`${escapeForTemplateString(jsoncContent)}\`,`);

    // adapter 模板（Base64 编码）
    if (existsSync(adapterPath)) {
      let content = safeReadFile(adapterPath);
      content = content.replace(/\r\n/g, '\n');
      const base64 = Buffer.from(content, 'utf-8').toString('base64');
      entries.push(`    adapter: '${base64}',`);
    } else {
      console.warn(`⚠ ${adapterPath} 不存在，跳过 adapter 注入`);
    }

    // .gitignore（不区分语言，两语言重复注入）
    entries.push(`    gitignore: \`${escapeForTemplateString(gitignoreContent)}\`,`);

    const formattedLang = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(lang)
      ? lang
      : `'${lang}'`;
    langEntries.push(`  ${formattedLang}: {\n${entries.join('\n')}\n  }`);
  }

  const objectBody = `const OPENCODE_CONFIG_TEMPLATES: Record<string, Record<string, string>> = {\n${langEntries.join(',\n')}\n};`;
  replaceBetweenAnchors(TEMPLATE_LOADER_PATH, 'OPENCODE_CONFIG_TEMPLATES', objectBody);
  console.log(`✓ ${langs.length} 个语言的 opencode 配置模板已注入 template-loader.ts`);
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
 * 校验 core-instructions Base64 模板（从 template-loader.ts 提取）
 * 多语言支持：遍历所有语言键，逐语言与源文件比对
 */
function validateCoreInstruction() {
  const section = extractBetweenAnchors(TEMPLATE_LOADER_PATH, 'CORE_INSTRUCTIONS_TEMPLATES');
  const errors = [];
  let totalCount = 0;

  // 匹配所有语言条目: 'zh-CN': 'base64string' 或 en: 'base64string'
  const langRegex = /(?:[\s,])(?:(['"])([a-zA-Z_][\w-]*)\1|([a-zA-Z_$][a-zA-Z0-9_$]*))\s*:\s*'([^']+)'/g;
  let match;
  while ((match = langRegex.exec(section)) !== null) {
    const langKey = match[2] || match[3];
    const b64 = match[4];
    const decoded = Buffer.from(b64, 'base64').toString('utf-8');

    const sourcePath = join(TEMPLATE_CORE_INSTRUCTIONS_DIR, `${langKey}.md`);
    if (!existsSync(sourcePath)) {
      errors.push(`[${langKey}] 源文件不存在: ${sourcePath}`);
      continue;
    }
    const source = safeReadFile(sourcePath);

    const normD = decoded.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const normS = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    if (normD !== normS) {
      const dLines = normD.split('\n');
      const sLines = normS.split('\n');
      for (let i = 0; i < Math.max(dLines.length, sLines.length) && errors.length < 5; i++) {
        if (dLines[i] !== sLines[i]) {
          const maxLen = 60;
          const tmpl = (dLines[i] || '').length > maxLen
            ? (dLines[i] || '').slice(0, maxLen) + '...'
            : (dLines[i] || '');
          const src = (sLines[i] || '').length > maxLen
            ? (sLines[i] || '').slice(0, maxLen) + '...'
            : (sLines[i] || '');
          errors.push(`[${langKey}] 第 ${i + 1} 行: 模板="${tmpl}", 源文件="${src}"`);
        }
      }
      if (dLines.length !== sLines.length) {
        errors.push(`[${langKey}] 行数不同: 模板 ${dLines.length} 行, 源文件 ${sLines.length} 行`);
      }
    }
    totalCount++;
  }

  if (totalCount === 0) {
    return { ok: false, errors: ['无法在 template-loader.ts 中提取任何 core-instructions 语言条目'] };
  }
  return { ok: errors.length === 0, errors };
}

/**
 * 校验 agents-md 模板（从 template-loader.ts 提取）
 * 多语言支持：遍历所有语言键，逐语言与源文件比对
 */
function validateAgentsMdTemplate() {
  const section = extractBetweenAnchors(TEMPLATE_LOADER_PATH, 'AGENTS_MD_TEMPLATES');
  const errors = [];
  let totalCount = 0;

  // 匹配所有语言条目: 'zh-CN': `...` 或 en: `...`
  const langRegex = /(?:[\s,])(?:(['"])([a-zA-Z_][\w-]*)\1|([a-zA-Z_$][a-zA-Z0-9_$]*))\s*:\s*`((?:[^`\\]|\\.)*)`/g;
  let match;
  while ((match = langRegex.exec(section)) !== null) {
    const langKey = match[2] || match[3];
    const decoded = unescapeTemplateString(match[4]);

    const sourcePath = join(TEMPLATE_AGENTS_MD_DIR, `${langKey}.md`);
    if (!existsSync(sourcePath)) {
      errors.push(`[${langKey}] 源文件不存在: ${sourcePath}`);
      continue;
    }
    const source = safeReadFile(sourcePath);

    const normD = decoded.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    const normS = source.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

    if (normD !== normS) {
      const dLines = normD.split('\n');
      const sLines = normS.split('\n');
      for (let i = 0; i < Math.max(dLines.length, sLines.length) && errors.length < 5; i++) {
        if (dLines[i] !== sLines[i]) {
          const maxLen = 60;
          const tmpl = (dLines[i] || '').length > maxLen
            ? (dLines[i] || '').slice(0, maxLen) + '...'
            : (dLines[i] || '');
          const src = (sLines[i] || '').length > maxLen
            ? (sLines[i] || '').slice(0, maxLen) + '...'
            : (sLines[i] || '');
          errors.push(`[${langKey}] 第 ${i + 1} 行: 模板="${tmpl}", 源文件="${src}"`);
        }
      }
      if (dLines.length !== sLines.length) {
        errors.push(`[${langKey}] 行数不同: 模板 ${dLines.length} 行, 源文件 ${sLines.length} 行`);
      }
    }
    totalCount++;
  }

  if (totalCount === 0) {
    return { ok: false, errors: ['无法在 template-loader.ts 中提取任何 agents-md 语言条目'] };
  }
  return { ok: errors.length === 0, errors };
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
 * 在字符串中从指定位置开始找到匹配的闭合括号
 * @param {string} str - 源字符串
 * @param {number} startIdx - 起始 { 的位置
 * @returns {number} 匹配的 } 的位置，未找到返回 -1
 */
function matchBraceAt(str, startIdx) {
  if (str[startIdx] !== '{') return -1;
  let depth = 1;
  let inStr = false;
  let inTmpl = false;
  let strChar = '';

  for (let i = startIdx + 1; i < str.length; i++) {
    const ch = str[i];

    if (ch === '\\' && (inStr || inTmpl)) {
      i++;
      continue;
    }

    if ((ch === '"' || ch === "'") && !inTmpl) {
      if (inStr && ch === strChar) inStr = false;
      else if (!inStr) { inStr = true; strChar = ch; }
      continue;
    }

    if (ch === '`' && !inStr) {
      inTmpl = !inTmpl;
      continue;
    }

    if (!inStr && !inTmpl) {
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }
  }
  return -1;
}

/**
 * 校验 Agent 定义一致性（从 template-loader.ts AGENT_TEMPLATES 提取）
 * 多语言支持：遍历所有顶层语言键，逐语言与源目录文件比对
 */
function validateAgentDefinitions() {
  const section = extractBetweenAnchors(TEMPLATE_LOADER_PATH, 'AGENT_TEMPLATES');
  const objText = matchBraces(section);
  if (!objText) {
    return { ok: false, count: 0, errors: ['无法在 template-loader.ts 中提取 AGENT_TEMPLATES 对象'] };
  }

  const errors = [];
  let totalCount = 0;
  const foundLangs = new Set();

  // 遍历顶层语言键: 匹配 'langKey': { ... } 或 langKey: { ... }
  // 正则：带引号的键 (group 2) 或不带引号的键 (group 3)
  const langRegex = /(?:[\s,])(?:(['"])([a-zA-Z_][\w-]*)\1|([a-zA-Z_$][a-zA-Z0-9_$]*))\s*:\s*\{/g;
  let langMatch;

  while ((langMatch = langRegex.exec(objText)) !== null) {
    const langKey = langMatch[2] || langMatch[3];
    foundLangs.add(langKey);

    // 找到该语言对象内部的闭合括号
    const innerStart = objText.indexOf('{', langMatch.index);
    if (innerStart === -1) {
      errors.push(`[${langKey}] 无法找到语言对象的起始括号`);
      continue;
    }
    const innerEnd = matchBraceAt(objText, innerStart);
    if (innerEnd === -1) {
      errors.push(`[${langKey}] 无法找到匹配的闭合括号`);
      continue;
    }

    const innerObj = objText.slice(innerStart, innerEnd + 1);
    const templateEntries = extractTemplatePairs(innerObj);
    totalCount += Object.keys(templateEntries).length;

    // 读取对应语言目录的源文件
    const langDir = join(TEMPLATE_AGENTS_DIR, langKey);
    const sourceEntries = {};
    if (existsSync(langDir)) {
      const files = readdirSync(langDir).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        const key = file.replace(/\.md$/, '');
        sourceEntries[key] = safeReadFile(join(langDir, file));
      }
    } else {
      errors.push(`[${langKey}] 源目录不存在: ${langDir}（模板中有语言键但无对应目录）`);
    }

    const result = compareTemplatePairs(templateEntries, sourceEntries);
    if (result.errors.length > 0) {
      errors.push(...result.errors.map(e => `[${langKey}] ${e}`));
    }

    // 更新 lastIndex 到对象末尾之后，继续扫描下一个语言键
    langRegex.lastIndex = innerEnd + 1;
  }

  // 检查有源目录但模板中无对应语言键的情况
  if (existsSync(TEMPLATE_AGENTS_DIR)) {
    const dirs = readdirSync(TEMPLATE_AGENTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const dir of dirs) {
      if (!foundLangs.has(dir)) {
        errors.push(`源目录 '${dir}' 存在但模板中缺少对应的语言键`);
      }
    }
  }

  return { ok: errors.length === 0, count: totalCount, errors };
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

  // 1. core-instructions Base64（从 template-loader.ts 校验）
  const coreResult = validateCoreInstruction();

  // 2. Agent 定义（从 template-loader.ts 校验，源为 templates-data）
  const agentResult = validateAgentDefinitions();

  // 3. agents-md 模板（从 template-loader.ts 校验，多语言）
  const agentsMdResult = validateAgentsMdTemplate();

  // 4. Skill 定义（仍从 update.ts 校验）
  const skillResult = validateSkillDefinitions();

  const results = [
    { name: `core-instructions (Base64, template-loader.ts)`, ok: coreResult.ok, errors: coreResult.errors },
    { name: `Agent 定义 (${agentResult.count} 个, template-loader.ts)`, ok: agentResult.ok, errors: agentResult.errors },
    { name: `agents-md (template-loader.ts)`, ok: agentsMdResult.ok, errors: agentsMdResult.errors },
    { name: `Skill 定义 (${skillResult.count} 个, update.ts)`, ok: skillResult.ok, errors: skillResult.errors },
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

/**
 * 校验 opencode Agent 模板一致性（从 template-loader.ts OPENCODE_AGENT_TEMPLATES 提取）
 * 多语言支持：遍历所有顶层语言键，逐语言与源目录文件比对
 */
function validateOpencodeAgentTemplates() {
  const section = extractBetweenAnchors(TEMPLATE_LOADER_PATH, 'OPENCODE_AGENT_TEMPLATES');
  const objText = matchBraces(section);
  if (!objText) {
    return { ok: false, count: 0, errors: ['无法在 template-loader.ts 中提取 OPENCODE_AGENT_TEMPLATES 对象'] };
  }

  const errors = [];
  let totalCount = 0;
  const foundLangs = new Set();

  const langRegex = /(?:[\s,])(?:(['"])([a-zA-Z_][\w-]*)\1|([a-zA-Z_$][a-zA-Z0-9_$]*))\s*:\s*\{/g;
  let langMatch;

  while ((langMatch = langRegex.exec(objText)) !== null) {
    const langKey = langMatch[2] || langMatch[3];
    foundLangs.add(langKey);

    const innerStart = objText.indexOf('{', langMatch.index);
    if (innerStart === -1) {
      errors.push(`[${langKey}] 无法找到语言对象的起始括号`);
      continue;
    }
    const innerEnd = matchBraceAt(objText, innerStart);
    if (innerEnd === -1) {
      errors.push(`[${langKey}] 无法找到匹配的闭合括号`);
      continue;
    }

    const innerObj = objText.slice(innerStart, innerEnd + 1);
    const templateEntries = extractTemplatePairs(innerObj);
    totalCount += Object.keys(templateEntries).length;

    const langDir = join(TEMPLATE_OPENCODE_AGENTS_DIR, langKey);
    const sourceEntries = {};
    if (existsSync(langDir)) {
      const files = readdirSync(langDir).filter((f) => f.endsWith('.md'));
      for (const file of files) {
        const key = file.replace(/\.md$/, '');
        sourceEntries[key] = safeReadFile(join(langDir, file));
      }
    } else {
      errors.push(`[${langKey}] 源目录不存在: ${langDir}`);
    }

    const result = compareTemplatePairs(templateEntries, sourceEntries);
    if (result.errors.length > 0) {
      errors.push(...result.errors.map(e => `[${langKey}] ${e}`));
    }

    langRegex.lastIndex = innerEnd + 1;
  }

  if (existsSync(TEMPLATE_OPENCODE_AGENTS_DIR)) {
    const dirs = readdirSync(TEMPLATE_OPENCODE_AGENTS_DIR, { withFileTypes: true })
      .filter((d) => d.isDirectory())
      .map((d) => d.name);
    for (const dir of dirs) {
      if (!foundLangs.has(dir)) {
        errors.push(`源目录 '${dir}' 存在但模板中缺少对应的语言键`);
      }
    }
  }

  return { ok: errors.length === 0, count: totalCount, errors };
}

/**
 * 校验 opencode Skill 定义一致性（从 template-loader.ts OPENCODE_SKILL_DEFINITIONS 提取）
 */
function validateOpencodeSkillDefinitions() {
  const section = extractBetweenAnchors(TEMPLATE_LOADER_PATH, 'OPENCODE_SKILL_DEFINITIONS');
  const objText = matchBraces(section);
  if (!objText) {
    return { ok: false, count: 0, errors: ['无法在 template-loader.ts 中提取 OPENCODE_SKILL_DEFINITIONS 对象'] };
  }

  const templateEntries = extractTemplatePairs(objText);

  const sourceEntries = {};
  if (existsSync(TEMPLATE_OPENCODE_SKILLS_DIR)) {
    const dirs = readdirSync(TEMPLATE_OPENCODE_SKILLS_DIR, { withFileTypes: true }).filter((d) => d.isDirectory());
    for (const dir of dirs) {
      const skillPath = join(TEMPLATE_OPENCODE_SKILLS_DIR, dir.name, 'SKILL.md');
      if (existsSync(skillPath)) {
        sourceEntries[dir.name] = safeReadFile(skillPath);
      }
    }
  }

  const result = compareTemplatePairs(templateEntries, sourceEntries);
  return { ok: result.errors.length === 0, count: result.count, errors: result.errors };
}

/**
 * 从 template-loader.ts 中提取 OPENCODE_CONFIG_TEMPLATES 内指定语言对象的全部键值
 * 支持两种值格式：Base64 单引号字符串（instructions/adapter）与模板字符串（opencode_jsonc/gitignore）
 * @param {string} objText - 对象字面量文本
 * @param {string} lang - 语言键
 * @returns {Object.<string, string>} 配置名 → 未转义内容
 */
function extractOpencodeConfigLangEntries(objText, lang) {
  // 定位语言对象: 'zh-CN': { ... } 或 en: { ... }
  const langRegex = new RegExp(`(?:[\\s,])(?:(['"])(${lang})\\1|([a-zA-Z_$][a-zA-Z0-9_$]*))\\s*:\\s*\\{`);
  const langMatch = langRegex.exec(objText);
  if (!langMatch) {
    return null;
  }
  const innerStart = objText.indexOf('{', langMatch.index);
  if (innerStart === -1) {
    return null;
  }
  const innerEnd = matchBraceAt(objText, innerStart);
  if (innerEnd === -1) {
    return null;
  }
  const innerObj = objText.slice(innerStart, innerEnd + 1);
  const entries = {};

  // 单引号字符串条目（Base64）：instructions / adapter
  const quotePattern = /^\s+([a-zA-Z_$][\w$]*):\s*'([^']*)'\s*,?\s*$/gm;
  let qMatch;
  while ((qMatch = quotePattern.exec(innerObj)) !== null) {
    entries[qMatch[1]] = qMatch[2];
  }

  // 模板字符串条目：opencode_jsonc / gitignore
  const tmplPattern = /^\s+([a-zA-Z_$][\w$]*):\s*`((?:[^`\\]|\\.)*)`\s*,?\s*$/gm;
  let tMatch;
  while ((tMatch = tmplPattern.exec(innerObj)) !== null) {
    entries[tMatch[1]] = unescapeTemplateString(tMatch[2]);
  }

  return entries;
}

/**
 * 校验 opencode 配置模板一致性（从 template-loader.ts OPENCODE_CONFIG_TEMPLATES 提取）
 * 对 instructions/adapter（Base64）和 opencode_jsonc/gitignore（模板字符串）分别解码后与源文件比对
 */
function validateOpencodeConfigTemplates() {
  const section = extractBetweenAnchors(TEMPLATE_LOADER_PATH, 'OPENCODE_CONFIG_TEMPLATES');
  const objText = matchBraces(section);
  if (!objText) {
    return { ok: false, count: 0, errors: ['无法在 template-loader.ts 中提取 OPENCODE_CONFIG_TEMPLATES 对象'] };
  }

  const errors = [];
  let totalCount = 0;

  // 读取源文件
  const jsoncSource = safeReadFile(join(TEMPLATE_OPENCODE_DIR, 'opencode.jsonc'));
  const gitignoreSource = safeReadFile(join(TEMPLATE_OPENCODE_DIR, '.gitignore'));

  // 预期 opencode.jsonc（SKILLS_PLACEHOLDER 替换后的完整内容）
  const skillsList = readdirSync(TEMPLATE_OPENCODE_SKILLS_DIR, { withFileTypes: true })
    .filter((d) => d.isDirectory())
    .map((d) => d.name);
  const expectedJsonc = jsoncSource.replace(
    /"SKILLS_PLACEHOLDER"/,
    `{\n${skillsList.map((s) => `    "${s}": ".opencode/skills/${s}"`).join(',\n')}\n  }`,
  );

  const langs = ['zh-CN', 'en'];
  for (const lang of langs) {
    const entries = extractOpencodeConfigLangEntries(objText, lang);
    if (!entries) {
      errors.push(`[${lang}] 无法提取 opencode 配置语言对象`);
      continue;
    }

    // instructions（Base64 编码）
    if (entries.instructions !== undefined) {
      totalCount++;
      const decoded = Buffer.from(entries.instructions, 'base64').toString('utf-8');
      const sourcePath = join(TEMPLATE_OPENCODE_INSTRUCTIONS_DIR, `${lang}.md`);
      if (!existsSync(sourcePath)) {
        errors.push(`[${lang}] instructions 源文件不存在: ${sourcePath}`);
      } else {
        const normD = decoded.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const normS = safeReadFile(sourcePath).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (normD !== normS) {
          errors.push(`[${lang}] instructions 内容不一致`);
        }
      }
    } else {
      errors.push(`[${lang}] 模板缺少 instructions 键`);
    }

    // opencode_jsonc（模板字符串，已替换 SKILLS_PLACEHOLDER）
    if (entries.opencode_jsonc !== undefined) {
      totalCount++;
      const normD = entries.opencode_jsonc.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const normS = expectedJsonc.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      if (normD !== normS) {
        errors.push(`[${lang}] opencode_jsonc 内容不一致`);
      }
    } else {
      errors.push(`[${lang}] 模板缺少 opencode_jsonc 键`);
    }

    // adapter（Base64 编码）
    if (entries.adapter !== undefined) {
      totalCount++;
      const decoded = Buffer.from(entries.adapter, 'base64').toString('utf-8');
      const sourcePath = join(TEMPLATE_OPENCODE_DIR, `ADAPTER.${lang}.md`);
      if (!existsSync(sourcePath)) {
        errors.push(`[${lang}] adapter 源文件不存在: ${sourcePath}`);
      } else {
        const normD = decoded.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        const normS = safeReadFile(sourcePath).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
        if (normD !== normS) {
          errors.push(`[${lang}] adapter 内容不一致`);
        }
      }
    } else {
      errors.push(`[${lang}] 模板缺少 adapter 键`);
    }

    // gitignore（模板字符串，不区分语言）
    if (entries.gitignore !== undefined) {
      totalCount++;
      const normD = entries.gitignore.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      const normS = gitignoreSource.replace(/\r\n/g, '\n').replace(/\r/g, '\n');
      if (normD !== normS) {
        errors.push(`[${lang}] gitignore 内容不一致`);
      }
    } else {
      errors.push(`[${lang}] 模板缺少 gitignore 键`);
    }
  }

  return { ok: errors.length === 0, count: totalCount, errors };
}

/**
 * 校验 opencode 模板一致性（Agent + Skill + Config 三类）
 */
function validateOpencodeTemplates() {
  console.log('');
  console.log('⟳ 正在校验 opencode 模板一致性...');

  const agentResult = validateOpencodeAgentTemplates();
  const skillResult = validateOpencodeSkillDefinitions();
  const configResult = validateOpencodeConfigTemplates();

  const results = [
    { name: `opencode Agent 定义 (${agentResult.count} 个, template-loader.ts)`, ok: agentResult.ok, errors: agentResult.errors },
    { name: `opencode Skill 定义 (${skillResult.count} 个, template-loader.ts)`, ok: skillResult.ok, errors: skillResult.errors },
    { name: `opencode 配置模板 (${configResult.count} 个, template-loader.ts)`, ok: configResult.ok, errors: configResult.errors },
  ];

  const passed = results.filter((r) => r.ok).length;
  const total = results.length;

  if (passed === total) {
    console.log(`  ✓ opencode 模板一致性校验通过 (${total}/${total})`);
    for (const r of results) {
      console.log(`    ✓ ${r.name} — 一致`);
    }
  } else {
    console.error(`  ✗ opencode 模板一致性校验失败 (${passed}/${total})`);
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

  // 七步管线：注入动态内容到 template-loader.ts（不再注入 templates.ts 和 update.ts 的模板段）
  generateTemplateFromCoreMd();
  generateAgentDefinitions();
  generateAgentsMdTemplate();
  generateSkillDefinitions();
  generateOpencodeAgentTemplates();
  generateOpencodeSkillTemplates();
  generateOpencodeConfigTemplates();

  // 执行 TypeScript 编译
  execSync('npx tsc', { stdio: 'inherit' });
  console.log('✓ TypeScript 编译完成');

  // 校验模板一致性
  validateTemplates();
  validateOpencodeTemplates();
} catch (err) {
  console.error(`✗ 构建失败: ${err.message}`);
  process.exit(1);
}
