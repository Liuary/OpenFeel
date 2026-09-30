/**
 * 安全文本读取工具（stage-50 op-005 T50）
 * 供 jsonc 等「可能不存在 / 可能被目录占位 / 权限不可读」的配置文件降级读取使用。
 */
import { existsSync, readFileSync, statSync } from 'node:fs';

/**
 * 安全读取 JSONC 文本文件。
 * - 文件不存在 → 返回 `'{}'`（调用方可据此新建默认配置）；
 * - 文件存在但**不可读**（如目录占位、权限错误）→ 返回 `null`（调用方应跳过该步骤，避免二次抛错 EISDIR）；
 * - 正常文件 → 返回文件内容。
 *
 * @param filePath 目标文件绝对路径
 * @returns 内容字符串；不可读时为 null
 */
export function readJsoncFile(filePath: string): string | null {
  try {
    if (!existsSync(filePath)) {
      return '{}\n';
    }
    // 目录等非普通文件 → 视为不可读（返回 null 让调用方跳过）
    if (!statSync(filePath).isFile()) {
      return null;
    }
    return readFileSync(filePath, 'utf-8');
  } catch {
    // 错误路径：stat/读取抛错（权限、EISDIR 等）→ null，由调用方按空配置继续
    return null;
  }
}
