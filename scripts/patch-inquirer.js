/**
 * 补丁：修复 @inquirer/core 在 Node.js 20 下的兼容性问题
 *
 * @inquirer/core@11.1.0+ 使用了 Node.js 22+ 的 `styleText` API（from 'node:util'），
 * 在 Node.js 20 下报错 "styleText is not exported from node:util"。
 *
 * 方案：将 `import { styleText } from 'node:util'` 替换为
 * 局部定义的等效函数，保留所有调用点不变。
 */
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '..');

const files = [
  resolve(rootDir, 'node_modules/@inquirer/core/dist/lib/Separator.js'),
  resolve(rootDir, 'node_modules/@inquirer/core/dist/lib/theme.js'),
];

// ANSI 颜色名称到转义码的映射
const ANSI_CODES = { bold: 1, dim: 2, red: 31, green: 32, yellow: 33, blue: 34, magenta: 35, cyan: 36, white: 37 };

/** 生成 styleText 的替换函数源码 */
function generateStyleTextFn() {
  const codeMap = JSON.stringify(ANSI_CODES);
  return `const styleText = (fmt, txt) => { const c = ${codeMap}[fmt]; return c ? \`\\x1b[\${c}m\${txt}\\x1b[0m\` : txt; };`;
}

function patchFile(filePath) {
  if (!existsSync(filePath)) {
    console.error(`[patch-inquirer] 文件不存在，跳过: ${filePath}`);
    return false;
  }

  let content = readFileSync(filePath, 'utf-8');
  const original = content;

  // 替换: import { styleText } from 'node:util'  →  局部函数定义
  const importRegex = /import\s*\{[^}]*\bstyleText\b[^}]*\}\s*from\s*['"]node:util['"];?\s*/;
  if (!importRegex.test(content)) {
    console.log(`[patch-inquirer] 未找到 styleText 导入，跳过: ${filePath}`);
    return false;
  }

  // 检查是否已经有我们的补丁（幂等保护）
  if (content.includes('// patched by openfeel')) {
    console.log(`[patch-inquirer] 已修补，跳过: ${filePath}`);
    return false;
  }

  content = content.replace(importRegex, generateStyleTextFn() + '\n// patched by openfeel\n');

  if (content === original) {
    console.log(`[patch-inquirer] 无需修改: ${filePath}`);
    return false;
  }

  writeFileSync(filePath, content, 'utf-8');
  console.log(`[patch-inquirer] ✅ 已修补: ${filePath}`);
  return true;
}

// 执行
let count = 0;
for (const f of files) {
  if (patchFile(f)) count++;
}
console.log(`[patch-inquirer] 完成: ${count} 个文件已修补`);
