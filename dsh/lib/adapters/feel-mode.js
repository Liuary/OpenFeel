/**
 * feel_mode 解析（v1.5.17）— 适配器侧的**只读镜像**
 *
 * CLI 单点：`src/core/config.ts:resolveFeelMode`。本模块与之同构（层级 / 显式声明语义 /
 * 读侧宽容必须一致），因为系统提示段落 `text()` 的签名是同步 `() => string`，
 * 无法等待 CLI 异步返回；为「即时生效」又必须每轮重新读取（不缓存）。
 *
 * 层级（项目覆盖全局，与 CLI 一致）：
 *   1. `<projectRoot>/.openfeel/config.yaml` 的 `defaults.feel_mode:`
 *   2. `~/.config/openfeel/profile.yaml` 的 `preferences.feel_mode:`
 *   3. 内置默认 `enabled`
 *
 * 只认**显式声明**：非法值 / 文件缺失 / YAML 读失败 / 键缺失 → 跳到下一层，
 * 不做 DEFAULT_PROFILE 合并（否则「未设置」会被误判为 profile 来源）。
 *
 * 为什么不做「CLI 写 `.feel-mode.json` 账本、适配器读文件」：账本在「刚改配置、尚未发生
 * 任何 CLI 调用」的窗口里会滞后，违背「切换即时生效」。这里解析的是一个标量，
 * 采用窄解析（不引入 YAML 依赖），矩阵用例（dsh/test/verify.js）与 CLI 单测同夹具。
 *
 * 已知的窄解析限制（正常写法不会触发；与 CLI `yaml.parse` 的残余分叉）：
 *   ① 同一块内重复声明 `feel_mode`：CLI 侧 yaml 唯一键校验抛错 → 视为未声明并回落下层；
 *      本镜像取**首个**出现值。
 *   ② 跨行 flow map（`defaults: {\n  feel_mode: disabled\n}`）：镜像只认单行内联，识别不了 → 回落下层。
 * 两处都只会让镜像**更保守**（多回落，不会误判为 disabled 以外的值）；真需要绝对同构时应
 * 改走 CLI 单点（或后续引入账本方案）。
 */
import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

/** 合法值（与 CLI 的 FEEL_MODES 一致） */
export const FEEL_MODES = Object.freeze(['enabled', 'disabled']);

/** 全局画像路径（与 CLI `global-paths.ts:getGlobalProfilePath` 同形） */
export function getGlobalProfilePath(homeDir = homedir()) {
  return join(homeDir, '.config', 'openfeel', 'profile.yaml');
}

/** 行首缩进宽度（空格计；Tab 按 1 计——YAML 规范禁止 Tab 缩进，容错即可） */
function indentWidth(line) {
  let n = 0;
  while (n < line.length && (line[n] === ' ' || line[n] === '\t')) n += 1;
  return n;
}

/** 去掉行内注释与包裹引号（只处理窄场景：`disabled` / `"disabled"` / `disabled # x`） */
function normalizeScalar(raw) {
  const withoutComment = raw.replace(/\s+#.*$/, '').trim();
  if (withoutComment.length >= 2) {
    const first = withoutComment[0];
    const last = withoutComment[withoutComment.length - 1];
    if ((first === '"' || first === "'") && first === last) {
      return withoutComment.slice(1, -1).trim();
    }
  }
  return withoutComment;
}

/**
 * 在 YAML 文本的指定顶层块中读取 `key` 的标量值（窄解析）。
 *
 * 只认**直接子键**（与 `yaml.parse` 后取 `defaults.feel_mode` 同义）：
 * 更深嵌套的 `defaults:\n  nested:\n    feel_mode: x` **不算**（CLI 读到的是 undefined）。
 * 同时支持 flow 内联写法 `defaults: { feel_mode: disabled }`（CLI 能读到；镜像不得分叉）。
 * @param {string} text YAML 原文
 * @param {string} holder 块名（`defaults` / `preferences`）
 * @param {string} key 块内键名（`feel_mode`）
 * @returns {string|undefined} 标量原文；块/键缺失或块为空 → undefined
 */
function readBlockScalar(text, holder, key) {
  const lines = text.split(/\r?\n/);
  const holderPattern = new RegExp(`^${holder}:\\s*(?:#.*)?$`);
  const inlinePattern = new RegExp(`^${holder}:\\s*\\{(.*)\\}\\s*(?:#.*)?$`);
  const keyPattern = new RegExp(`^${key}:\\s*(.*)$`);
  let holderIndent = null;
  let childIndent = null;
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed === '' || trimmed.startsWith('#')) continue;
    if (holderIndent === null) {
      const inline = inlinePattern.exec(trimmed);
      if (inline) {
        // flow map：按顶层逗号切分（窄场景足够；嵌套 flow map 不在支持范围）
        for (const item of inline[1].split(',')) {
          const match = keyPattern.exec(item.trim());
          if (match) return normalizeScalar(match[1]);
        }
        return undefined;
      }
      if (holderPattern.test(trimmed)) holderIndent = indentWidth(line);
      continue;
    }
    const indent = indentWidth(line);
    if (indent <= holderIndent) return undefined; // 块结束（下一个同层键）
    // 块内首个键的缩进 = 直接子键缩进；更深层级一律不算（与 yaml 取值语义一致）
    if (childIndent === null) childIndent = indent;
    if (indent !== childIndent) continue;
    const match = keyPattern.exec(trimmed);
    if (match) return normalizeScalar(match[1]);
  }
  return undefined;
}

/**
 * 读取某个 YAML 文件的**显式** feel_mode（缺失 / 非法 / 读取失败 → undefined）。
 * @param {string} filePath
 * @param {'defaults'|'preferences'} holder
 * @returns {'enabled'|'disabled'|undefined}
 */
function readExplicitFeelMode(filePath, holder) {
  if (!existsSync(filePath)) return undefined;
  try {
    const text = readFileSync(filePath, 'utf-8');
    const value = readBlockScalar(text, holder, 'feel_mode');
    return value === 'enabled' || value === 'disabled' ? value : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 解析 feel_mode 有效值与来源（与 CLI `resolveFeelMode` 同构）。
 * @param {string} projectRoot 项目根（`.openfeel/` 所在目录）
 * @param {{ homeDir?: string }} [options] 测试注入（缺省 os.homedir()）
 * @returns {{ value: 'enabled'|'disabled', source: 'config.yaml'|'profile.yaml'|'builtin' }}
 */
export function resolveFeelMode(projectRoot, options = {}) {
  const project = readExplicitFeelMode(join(projectRoot, '.openfeel', 'config.yaml'), 'defaults');
  if (project !== undefined) return { value: project, source: 'config.yaml' };

  const global = readExplicitFeelMode(getGlobalProfilePath(options.homeDir), 'preferences');
  if (global !== undefined) return { value: global, source: 'profile.yaml' };

  return { value: 'enabled', source: 'builtin' };
}
