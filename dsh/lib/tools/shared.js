/**
 * OpenFeel × DSH 适配器 — 工具定义原语
 *
 * DSH 的工具注册表只要求 `{ name, description, parameters, output, execute }`，
 * 其中 `parameters` 是**受限 JSON Schema 子集**（type/properties/required/
 * additionalProperties/items/enum/const + 注释键）。这里用纯函数生成这些描述，
 * 使插件保持零依赖，同时保证参数在模型侧是强类型枚举。
 */

/**
 * 组装一个字符串枚举参数。
 * @param {readonly string[]} values
 * @param {string} description
 * @param {object} [options]
 * @param {boolean} [options.required]
 * @returns {Record<string, unknown>}
 */
export function stringEnum(values, description, options = {}) {
  return {
    type: 'string',
    enum: [...values],
    description,
    ...(options.required === true ? { required: true } : {}),
  };
}

/**
 * 组装一个固定值为常量的字符串参数（用于单动作工具的显式契约）。
 * @param {string} value 唯一合法值。
 * @param {string} description
 * @returns {Record<string, unknown>}
 */
export function stringConst(value, description) {
  return { type: 'string', const: value, description, required: true };
}

/**
 * 组装一个字符串参数。
 * @param {string} description
 * @param {object} [options]
 * @param {boolean} [options.required]
 * @returns {Record<string, unknown>}
 */
export function string(description, options = {}) {
  return { type: 'string', description, ...(options.required === true ? { required: true } : {}) };
}

/**
 * 组装一个字符串数组参数。
 * @param {string} description
 * @param {object} [options]
 * @param {boolean} [options.required]
 * @returns {Record<string, unknown>}
 */
export function stringArray(description, options = {}) {
  return {
    type: 'array',
    items: { type: 'string' },
    description,
    ...(options.required === true ? { required: true } : {}),
  };
}

/**
 * 组装一个布尔参数。
 * @param {string} description
 * @returns {Record<string, unknown>}
 */
export function boolean(description) {
  return { type: 'boolean', description };
}

/**
 * 组装一个整数参数。
 * @param {string} description
 * @param {object} [options]
 * @param {number} [options.minimum] 仅用于文档；DSH 子集不强制 minimum。
 * @returns {Record<string, unknown>}
 */
export function integer(description, options = {}) {
  const text = options.minimum === undefined ? description : `${description}（≥ ${options.minimum}）`;
  return { type: 'integer', description: text };
}

/**
 * 把一个「属性表」编译成 DSH 接受的**裸 JSON Schema** 参数对象。
 *
 * 为什么需要它：本插件直接调用 `ctx.tools.register()`（不经 `defineTool`），
 * 注册表对 `parameters` **不做编译也不做校验**，会把定义原样投影给模型 provider。
 * 因此工具作者侧沿用的 author DSL 写法（属性级 `required: true`、无根 `type`）
 * 必须在交给注册表**之前**转换成本子集接受的形态：
 * - 根节点 `type: 'object'`；
 * - 属性级 `required: true` 收敛为对象级 `required: [...]` 数组；
 * - 其余键（type/enum/const/items/description）原样保留。
 *
 * @param {Record<string, any>} properties 作者侧属性表。
 * @returns {{ type: 'object', properties: Record<string, any>, required?: string[] }}
 */
export function compileParameters(properties) {
  /** @type {Record<string, any>} */
  const compiled = {};
  /** @type {string[]} */
  const required = [];
  for (const [key, spec] of Object.entries(properties)) {
    if (typeof spec !== 'object' || spec === null) {
      throw new Error(`feel: 参数 "${key}" 必须是 schema 对象`);
    }
    const { required: isRequired, ...rest } = spec;
    compiled[key] = rest;
    if (isRequired === true) required.push(key);
  }
  return {
    type: 'object',
    properties: compiled,
    ...(required.length === 0 ? {} : { required }),
  };
}

/**
 * 统一的工具输出 schema。
 *
 * 三条硬约束，全部由 DSH 的真实校验（线上启动报错）推导而来：
 *
 * 1. **本插件直接调用 `ctx.tools.register()`，不经 `defineTool`**，因此
 *    `output.schema` 被当作**裸 JSON Schema** 校验（`assertSupportedJsonSchema`），
 *    而不是 author DSL——属性级 `required: true` 在这里是非法关键字。
 * 2. 该强制子集不接受 `required`（对象级或属性级）；本适配器的输出恒由
 *    适配器自己构造，契约靠类型与描述表达，不声明 required。
 * 3. **不放无类型节点**：`type: 'json'` 或纯注释节点会被 provider 桥接层
 *    转成 `type: null`，API 随即以
 *    `schema must be a JSON Schema of 'type: "object"', got 'type: null'` 拒绝。
 *
 * 因此结构化载荷统一走 `details`（JSON **字符串**）：类型具体、跨 provider 稳定。
 *
 * @returns {Record<string, unknown>}
 */
export function envelopeSchema() {
  return {
    type: 'object',
    additionalProperties: false,
    properties: {
      ok: { type: 'boolean', description: '命令是否成功。' },
      action: { type: 'string', description: '实际执行的动作。' },
      summary: { type: 'string', description: '一句话结果摘要（人类可读）。' },
      details: {
        type: 'string',
        description: 'OpenFeel CLI 返回的结构化数据的 JSON 文本（无数据时省略）。需要精确字段时解析它。',
      },
      next: {
        type: 'object',
        additionalProperties: false,
        description: '建议的下一步工具调用（若适用）。',
        properties: {
          tool: { type: 'string', description: '工具名。' },
          arguments: { type: 'string', description: '建议参数的 JSON 文本。' },
          why: { type: 'string', description: '为什么建议这样做。' },
        },
      },
    },
  };
}

/**
 * 把实现侧载荷转成 wire 输出。
 *
 * 实现侧继续用 `{ ok, action, summary, data, next }`（`data` 任意值，便于内部
 * 断言与组合）；这里把 `data` 序列化为 `details` 字符串、把 `next.arguments`
 * 序列化为字符串，使 wire 输出只含**具体类型**。
 *
 * @param {string} action
 * @param {{ summary: string, data?: unknown, next?: { tool: string, arguments: unknown, why: string } | null }} payload
 * @returns {{ ok: true, action: string, summary: string, details?: string, next?: { tool: string, arguments: string, why: string } }}
 */
export function toWireEnvelope(action, payload) {
  /** @type {{ ok: true, action: string, summary: string, details?: string, next?: { tool: string, arguments: string, why: string } }} */
  const wire = { ok: true, action, summary: payload.summary };
  if (payload.data !== undefined && payload.data !== null) {
    wire.details = stringifySafe(payload.data);
  }
  if (payload.next !== undefined && payload.next !== null) {
    wire.next = {
      tool: payload.next.tool,
      arguments: stringifySafe(payload.next.arguments ?? {}),
      why: payload.next.why,
    };
  }
  return wire;
}

/**
 * 安全序列化：处理循环引用与不可序列化值，永不抛错。
 * @param {unknown} value
 * @returns {string}
 */
export function stringifySafe(value) {
  try {
    /** @type {WeakSet<object>} */
    const seen = new WeakSet();
    return JSON.stringify(
      value,
      (_key, item) => {
        if (typeof item === 'object' && item !== null) {
          if (seen.has(item)) return '[循环引用]';
          seen.add(item);
        }
        if (typeof item === 'bigint') return item.toString();
        return item;
      },
      2,
    );
  } catch {
    return String(value);
  }
}

/**
 * 把工具结果渲染成模型可读文本。
 *
 * 模型看到的是 `summary` + `details` 里的结构化 JSON；
 * 结构化部分保留原始字段，不做二次裁剪，以免丢失 agent 需要的细节。
 * @param {unknown} args
 * @param {{ ok?: boolean, action?: string, summary?: string, details?: string, next?: { tool?: string, arguments?: string, why?: string } }} value
 * @returns {Array<{ type: 'text', text: string }>}
 */
export function renderEnvelope(_args, value) {
  const parts = [`[${value.ok === false ? 'FAIL' : 'OK'}] ${value.action ?? ''}: ${value.summary ?? ''}`.trim()];
  if (value.next !== undefined && value.next !== null) {
    parts.push(`下一步建议：调用 ${value.next.tool ?? '?'}(${value.next.arguments ?? '{}'}) — ${value.next.why ?? ''}`);
  }
  if (typeof value.details === 'string' && value.details !== '') {
    const text = value.details;
    parts.push(text.length > 12_000 ? `${text.slice(0, 12_000)}\n…（已截断 ${text.length - 12_000} 字符）` : text);
  }
  return [{ type: 'text', text: parts.join('\n\n') }];
}

/**
 * 生成工具的 presentCall（对话流卡片）。
 * @param {string} title
 * @param {string} action
 * @param {unknown} [rawInput]
 */
export function presentCall(title, action, rawInput) {
  return {
    card: 'generic',
    title,
    kind: action === 'get' || action === 'list' || action === 'show' ? 'read' : 'other',
    ...(rawInput === undefined ? {} : { rawInput }),
  };
}

/**
 * 按字典序稳定排序对象键（用于确定性输出）。
 * @param {Record<string, unknown>} record
 * @returns {Record<string, unknown>}
 */
export function sortedKeys(record) {
  /** @type {Record<string, unknown>} */
  const out = {};
  for (const key of Object.keys(record).sort()) out[key] = record[key];
  return out;
}

/**
 * 断言某个必填参数存在。
 * @param {Record<string, unknown>} args
 * @param {string} name
 * @param {string} action
 * @returns {string}
 */
export function requireArg(args, name, action) {
  const value = args[name];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`feel: action "${action}" 需要参数 "${name}"（非空字符串）`);
  }
  return value.trim();
}

/**
 * 追加一个可选参数到 argv（存在时才追加）。
 * @param {string[]} argv
 * @param {string} flag
 * @param {unknown} value
 * @param {(value: unknown) => string} [format]
 * @returns {string[]}
 */
export function pushOption(argv, flag, value, format) {
  if (value === undefined || value === null || value === '') return argv;
  argv.push(flag);
  argv.push(format === undefined ? String(value) : format(value));
  return argv;
}

/**
 * 追加一个位置参数（不是 flag；空值跳过）。
 *
 * 与 `pushOption(argv, '', value)` 的区别：后者会把空字符串当作 flag 推入 argv，
 * 使 Commander 多收到一个空位置参数（实测 `feel_op create` 报
 * `too many arguments ... Expected 2 arguments but got 3`）。
 * @param {string[]} argv
 * @param {unknown} value
 * @returns {string[]}
 */
export function pushPositional(argv, value) {
  if (value === undefined || value === null || value === '') return argv;
  argv.push(String(value));
  return argv;
}

/**
 * 追加一个布尔开关参数。
 * @param {string[]} argv
 * @param {string} flag
 * @param {unknown} value
 * @returns {string[]}
 */
export function pushFlag(argv, flag, value) {
  if (value === true) argv.push(flag);
  return argv;
}
