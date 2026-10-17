# OpenFeel Compatibility Spec — Knowledge Base, Artifact Templates, and Agent/Skill Deployment

Status: behavioral specification extracted read-only from `C:\Users\Liuary\Dev\Mine\AI\OpenFeel` (v1.2.1, HEAD-era sources).
Scope: (1) the `.openfeel/kb/` knowledge base, (2) the `knowledge` CLI surface, (3) KB dedup, (4) skill + agent template inventory and frontmatter contracts, (5) the agent role/delegation model, (6) the managed-region three-state mechanism, (7) the global deployment model.
Purpose: an exact contract a DSH-native reimplementation must match (or deliberately diverge from, with the divergence recorded).

## Source map

| Concern | Source file | Notes |
|---|---|---|
| KB core (layout / parse / index / search) | `src/core/workspace/knowledge.ts` (429 lines) | single authority for the on-disk format |
| `knowledge` CLI | `src/commands/knowledge.ts` (281 lines) | thin command layer, zero business logic beyond validation |
| KB dedup | `src/utils/kb-dedup.ts` (228 lines) | Jaccard bag-of-words |
| Instruction/artifact composition | `src/core/artifact-graph/instruction-loader.ts` (401 lines) | XML/JSON instruction payloads |
| Template dispatchers | `src/core/template-loader.ts` (8576 lines) | only the dispatcher API matters; the rest is inlined data |
| Init templates (dev_core/current/decisions) | `src/core/templates.ts` (102 lines) | zh-CN/en |
| Template asset sources | `src/core/templates-data/{skills,agents-md,claude,opencode}/` | authoritative `.md` sources |
| Managed region | `src/core/managed-region.ts` (221 lines) | markers, frontmatter merge, user-sovereign keys |
| Deployment write path | `src/core/update.ts` (`writeManagedFile`, `deployGlobalAsset`, `SKILL_DEFINITIONS`) | three-state logic lives here |
| Global paths | `src/core/global-paths.ts` (117 lines) | single `os.homedir()` import point |
| Claude settings injection | `src/core/claude-settings.ts` (129 lines) | strict-JSON deep merge |
| setup orchestration | `src/core/setup.ts` (144 lines) | pure global deploy |
| Deployment drift check | `src/core/deployment-check.ts` (113 lines) | read-only 4-state check |
| Backup primitives | `src/core/backup.ts`, `src/core/update-infos.ts` | `~/.openfeel/backup/**`, `~/.openfeel/update_infos.md` |
| Phase enum / tiers | `src/core/pipeline-schema.ts` (112 lines) | 15 phases, 3 review tiers |
| Phase→agent attribution | `src/core/metrics.ts:25` `PHASE_AGENT_MAP` | 10 keys |
| Build pipeline (asset → constants) | `build.js` | 8 inject steps + consistency validators |

---

# 1. The knowledge base

## 1.1 Directory layout

```
<project>/.openfeel/kb/
├── index.md              # master index (overview tables + per-category digest)
├── architecture.md       # 架构决策 / Architecture decisions
├── patterns.md           # 代码模式 / Code patterns
├── troubleshooting.md    # 常见问题 / Troubleshooting
└── setup.md              # 环境搭建 / Environment setup
```

The four category names are a **closed set** — this is the single most important KB invariant:

```ts
const CATEGORIES = ['architecture', 'patterns', 'troubleshooting', 'setup'] as const;
const CATEGORY_TITLES = {
  architecture: '架构决策',
  patterns: '代码模式',
  troubleshooting: '常见问题',
  setup: '环境搭建',
};
```

- Category → file name is mechanical: `{category}.md`. There is no arbitrary-category escape hatch; `addKnowledgeEntry` **throws** on any other value (`无效分类 "x"，有效值：architecture, patterns, troubleshooting, setup`), and `knowledge add` validates first at the command layer and exits 1.
- There is **no per-entry file** and **no nested directory**. One file per category, entries separated by level-2 headings.
- Category ordering is fixed everywhere (list / search / digest): `architecture → patterns → troubleshooting → setup`.

## 1.2 Initialization (`initKnowledgeBase`)

Idempotent, never overwrites; returns the list of paths it actually created (`.openfeel/kb/`, `.openfeel/kb/index.md`, `.openfeel/kb/{category}.md`).

`index.md` template — exactly this text:

```markdown
# 知识库索引
> 项目知识库总索引

## 分类概览

| 分类 | 描述 |
|------|------|
| architecture | 架构决策、设计理由、技术选型 |
| patterns | 代码模式、项目约定、最佳实践 |
| troubleshooting | 常见问题、调试流程、已知坑位 |
| setup | 环境搭建、构建流程、依赖管理 |

## 最近更新

| 日期 | 分类 | 标题 |
|------|------|------|
```

Category file template — one line only: `# {CATEGORY_TITLES[cat]} ({cat})\n`, e.g. `# 架构决策 (architecture)`.

> Real-world drift to tolerate: the OpenFeel repo's own `kb/*.md` start with a hand-written H1 plus a `> 使用 [+] / [-] 标记管理启用/禁用状态。只能标记禁用不能删除。` blockquote, and its `index.md` has grown five sections (`## 项目快速概览`, `## 分类概览`, `## 各分类摘要`, `## 最近更新` plus a hand-maintained 5-column 分类概览 table). Parsers must accept both shapes — see §1.5.

## 1.3 Entry file format

**There is no YAML frontmatter in KB entries.** The "frontmatter" role is played by a heading line; the body is the free-form Markdown after it.

```markdown
# {category title} ({category})

## [+] {title} ({YYYY-MM-DD})

{body}

## [-] {old title} ({YYYY-MM-DD})

{body}
```

Contract, item by item:

| Element | Rule |
|---|---|
| Header line | `## [+] {title} ({YYYY-MM-DD})` or `## [-] …`. `[+]` = enabled, `[-]` = disabled (= "soft deleted", never removed) |
| Date | `YYYY-MM-DD`, generated as `new Date().toISOString().slice(0, 10)` (UTC date) at add time |
| Title | free text, **but** `|` is escaped to `\|` and any `\r\n`/`\n` run is collapsed to a single space, then trimmed (protects the `index.md` table and the header regex) |
| Body | everything from the line after the header up to the next line starting with `## ` or EOF, then `.trim()` |
| Separator | a blank line precedes every header, i.e. the appended chunk is `\n## [+] {title} ({date})\n\n{content}\n` |
| Deletion | never. Disable with `[-]`. Retrieval skills skip `[-]` entries; `knowledge list` still shows them as `禁用` |
| Ordering | append-only, chronological within a category file. No sorting, no compaction |

Two header regexes exist and they are **not** identical — reproduce both:

```ts
// knowledge.ts (list/search path) — exactly one space after `##`
/^## (\[[+-]\]) (.+?) \((\d{4}-\d{2}-\d{2})\)$/gm

// kb-dedup.ts (dedup path) — tolerant of extra whitespace
/^##\s+\[([+-])\]\s+(.+?)\s+\((\d{4}-\d{2}-\d{2})\)$/
```

Consequence to preserve (or intentionally fix): an entry written by hand as `##  [+]  Title (2026-01-01)` is invisible to `list`/`search` but visible to `dedup`.

Line-ending handling also differs by path:

- `knowledge.ts` reads raw; `\r` stays in the file content, so a CRLF file makes the `$`-anchored header regex fail (known defect `L8`, documented in `kb/troubleshooting.md`).
- `kb-dedup.ts` normalizes `readFileSync(...).replace(/\r\n?/g, '\n')` before splitting (the fix that took `patterns.md` from 2 → 105 visible entries).

## 1.4 Write path (`addKnowledgeEntry`)

1. Validate category (throw otherwise).
2. If `.openfeel/kb/` is missing → `initKnowledgeBase(projectPath)` (auto-bootstrap). If the dir exists but `index.md` does not, the category file is still written and the index step is silently skipped.
3. Sanitize title (§1.3), compute `today`.
4. Build `entryText = "\n## [+] {title} ({today})\n\n{content}\n"`.
5. Inside `withFileLock(projectLockPath(project, 'kb'))` — i.e. lock file `.openfeel/tmp/locks/kb.lock`:
   - category file: read → `content + entryText` → `atomicWriteFileSync` (read-concat-atomic-write, **not** `appendFileSync`, to avoid torn writes);
   - `index.md`: insert one row into `## 最近更新` (see §1.5). Failure to locate the section is a silent no-op.

`atomicWriteFileSync` = write temp + rename. Never mutate KB files outside this function.

## 1.5 `index.md` maintenance and tolerant parsing

`addKnowledgeEntry` inserts into the `最近更新` / `Recent Updates` section:

1. Locate the section header with `/^##\s*(?:最近更新|Recent Updates)\s*$/im`. Not found → **no index update at all** (degraded, no error).
2. Parse the first `|`-line of the section body as headers; `cols = headers.length || 3`.
3. Build the data row `| {today} | {category} | {title} |` (padded/truncated to `cols` cells).
4. If a separator line (`/^\|[\s:|-]+\|\s*$/m`) exists in the body → insert the new row immediately after it (newest-first).
5. Else synthesize `|` + `------|`×cols after the header line, then the row.

Reading (`getKnowledgeIndex`) is deliberately lenient:

- Section header aliases: `分类概览` | `Categories` | `Category Overview` for categories; `最近更新` | `Recent Updates` for updates. Matched as `/^##\s*(?:alias1|alias2)\s*$/im`, body = up to the next `^## ` or EOF.
- Table columns are resolved by alias with **exact match first, then substring**: name column ← `分类|名称|category|name`, description ← `描述|说明|description`; date ← `日期|date`, category ← `分类|category`, title ← `标题|title`. Separator rows (`---`, `:---:`) are skipped.
- Missing section, missing header, or unresolvable name column → return `[]` for that part; **never throws**.
- `index.md` missing entirely → categories fall back to the four `CATEGORIES` with their Chinese titles, `recentUpdates: []`.

Known real-repo mismatch worth honoring: the repo's own `最近更新` table is `| 日期 | 操作 | 描述 |`, so `category` and `title` come back as empty strings and only `date` is populated. Do not "fix" this by tightening the parser; fix the file if desired.

## 1.6 Lookup and search semantics

`listKnowledge(project, category?)` — pure scan, no index:

- `category` given → only that file; otherwise all four in fixed order.
- Missing dir → `[]`; missing category file → skip.
- Returns `KnowledgeEntry { title, category, date, content, enabled }`, file order preserved.

`searchKnowledge(project, query, limit = 10, offset = 0)`:

1. `entries = listKnowledge(project)` (all categories).
2. `q = query.toLowerCase()`; keep entries where `title.toLowerCase().includes(q) || content.toLowerCase().includes(q)`. **Substring match only** — no tokenization, no ranking, no fuzzy matching, no vector search.
3. Highlight: for each surviving entry, wrap every case-insensitive occurrence in `title` **and** `content` with `**…**` (query regex-escaped). The highlight is applied *before* pagination, so page-2 results are highlighted identically.
4. `slice(offset, offset + limit)`.

There is therefore no relevance ordering: results come out category-major, then file order. The `knowledge dedup` command is the only similarity-ranked surface (§1.8).

## 1.7 `knowledge` subcommands and exact output shapes

All output goes to `stdout` (`console.log`); validation failures go to `stderr` + `process.exit(1)`. Every string is i18n-routed (`zh-CN` / `en`, selected by `getCliLang(process.cwd())`).

### `openfeel knowledge list [--type <category>]`

Fixed-width ASCII table (columns padded with `padEnd`, joined ` | `; separator = per-column `-`×width joined `-+-`):

```
分类       | 标题                          | 日期       | 状态
-----------+-------------------------------+------------+-----
patterns   | 控制区标记模式                 | 2026-09-25 | 启用
```

Columns: `分类` / `标题` / `日期` / `状态` (`启用` | `禁用`). Empty result → single line `暂无知识条目` (en: `No knowledge entries`), exit 0.

### `openfeel knowledge add <category> <title> [--content <text>]`

- Content source: `--content`, else stdin when `!process.stdin.isTTY` (piped), else error `错误：请使用 --content 提供内容，或通过管道提供内容。` exit 1.
- Whitespace-only content → `错误：内容不能为空。` exit 1.
- Invalid category → `错误：无效分类 "{category}"，有效值：architecture, patterns, troubleshooting, setup` exit 1.
- Success → `✓ 已添加知识条目: [{category}] {title}` (en: `✓ Knowledge entry added: [{category}] {title}`), exit 0. Content is `.trim()`ed before write.

### `openfeel knowledge search <query> [--limit <n>] [--offset <n>]`

- `limit = Math.max(1, parseInt(limit) || 10)`, `offset = Math.max(0, parseInt(offset) || 0)`.
- Header: `找到 {n} 条匹配` (en `Found {n} match(es)`).
- Per entry, three lines (third is empty):

```
[{category}] {title} ({date}) [{启用|禁用}]
  {first 100 chars of content, with **…** highlights}{… if truncated}

```

- No matches → `未找到与 "{query}" 相关的知识条目。`; additionally, when `offset > 0`, `（偏移量 {offset}，已越界）`. Exit 0 in all cases.

### `openfeel knowledge index`

```
=== 分类概览 ===
  architecture         架构决策
  patterns             代码模式
  troubleshooting      常见问题
  setup                环境搭建

=== 最近更新 ===

{表格：日期 | 分类 | 标题}
```

Category line format: two leading spaces + `name.padEnd(20)` + space + `description`. Empty categories → `（无分类）`; empty updates → `暂无更新记录。`.

### `openfeel knowledge dedup [content] [--project <path>] [--category <name>] [--threshold <n>]`

Read-only advisory (never writes). Content from positional arg or stdin; neither → `未提供内容：请传入内容参数或通过标准输入` exit 1. `--threshold` must parse to `[0,1]` else `阈值非法：{value}（应为 0~1 之间的数字）` exit 1. `--category` must be one of the four else `分类非法：{value}（允许：architecture | patterns | troubleshooting | setup）` exit 1.

`basePath = resolve(projectPath ?? cwd, '.openfeel', 'kb')` — the command layer computes the path, the core never resolves cwd itself.

Output:

```
相似条目建议：
  [{category}] {title}（相似度 {pct}%）{flag}
...
未发现相似条目（阈值 {threshold}）        # only when nothing with similarity > 0
本命令仅输出建议，不会修改 kb 文件
```

- `pct = (similarity * 100).toFixed(1)`.
- `flag` = ` ← 建议合并/更新` only when `similarity > threshold`; entries with `0 < similarity <= threshold` are still printed (without flag).
- Entries with `similarity <= 0` are filtered out client-side.
- The final read-only note line is always printed.

## 1.8 Dedup rules (`src/utils/kb-dedup.ts`)

Purpose: before an archiver adds a KB entry, check whether a near-duplicate already exists; above the threshold the protocol is **update, not append**.

```ts
const SIMILARITY_THRESHOLD = 0.8;         // strictly greater-than
export function shouldUpdate(sim) { return sim > 0.8 }
```

Algorithm:

1. Read the category file, normalize CRLF→LF, split lines, walk with the tolerant header regex; each entry = `{ title, date, status, content (trimmed body), rawLine }`. Body = lines until the next line starting with `## `.
2. Tokenize both the new text and every existing entry's `content`:

```ts
function tokenize(text: string): Set<string> {
  const cleaned = text.replace(/^\[[+-]\](?!\s*\()/gm, '');  // strip state markers
  return new Set(
    cleaned.toLowerCase()
      .split(/[\s,，。.、；;：:！!？?（）()【】\[\]{}""''""\/\\|@#$%^&*+=~`<>]+/)
      .filter(t => t.length > 0 && /[\w\u4e00-\u9fff]/.test(t))
  );
}
```

Note: CJK text is **not** word-segmented — a whole Chinese sentence without punctuation becomes one token. Practical effect: similarity is high for near-verbatim entries and low otherwise. Reproduce as-is unless you deliberately upgrade to a real similarity metric (then record the divergence: the 0.8 threshold and `> 0.8` semantics must stay compatible with archiver prompts).

3. `jaccardSimilarity = |A∩B| / |A∪B|`; both-empty (`union == 0` with both sizes 0) ⇒ `1.0`; `union == 0` otherwise ⇒ `0.0`.
4. Return all entries with `similarity > 0`, sorted descending. Unknown category ⇒ `[]`.

Merge primitive (`mergeEntry`) — the "update instead of append" shape:

- If trimmed new content equals existing content ⇒ no change (returns a copy).
- Else append `"\n\n> **更新于 {YYYY-MM-DD}**：{newContent}"` to the existing body; **keep the original `[+]/[-]` status, original date, and original header line**. The date in the header is the creation date; the update date lives only inside the `> **更新于 …**` block. This exact convention is visible in the real `kb/troubleshooting.md`.

Agent-side protocol (from `openfeel-archiver` / `openfeel-check-kb`): run `openfeel knowledge dedup "<new entry text>"` before writing; `> 0.8` ⇒ rewrite the existing entry with an 更新于 block; otherwise `openfeel knowledge add`.

## 1.9 Retrieval protocol (agent side, not CLI)

`openfeel-check-kb` skill defines the progressive lookup that agents must follow:

1. Read `.openfeel/kb/index.md` for the digest.
2. Map the task to categories: new feature/architecture → `architecture.md`; coding/refactor → `patterns.md`; build/runtime errors → `troubleshooting.md`; env/deps → `setup.md`; unfamiliar → all index digests.
3. Read matching category files; **do not load `[-]` entries**.
4. Emit `📁 知识库查阅结果（{分类}）` + relevant entries; empty ⇒ `知识库中暂无与当前任务相关的记录。`
5. Semantic fallback when nothing matches: requires `.openfeel/tmp/vectors/index.json` and `python scripts/search_kb.py` / `scripts/build_kb_index.py`; if the index is missing, print the install hint and stop. **Gap to note:** neither Python script nor the vectors directory exists in the OpenFeel repo — the fallback is aspirational. A DSH reimplementation should either ship a real semantic search or delete step 5.
6. If ≥1 relevant entry was found, append the mandatory reminder: `⚠️ 执行任务前，若知识库中有相关条目，务必参考。重复踩过的坑不可再犯。`

`openfeel-search-kb` is a standalone version of the same fallback (vector/graph traversal, `--top-k`, low-score warning `< 0.3`); it is documented as already folded into `openfeel-check-kb`, so callers should not load both.

---

# 2. Instruction / artifact template composition

`src/core/artifact-graph/instruction-loader.ts` turns a `Schema` artifact into a structured prompt. It is independent of the skill/agent templates and is the "artifact template" surface.

Inputs: `Schema` (artifacts with `id`, `description`, `generates`, `instruction`, `template`, `depends_on`), `changeName`, `artifactId`, `projectPath`, optional `completed: Set<string>`.

Pipeline:

1. Resolve the artifact (throw `Schema "{name}" 中找不到 artifact "{id}"` if absent).
2. `completed ?? await detectCompletedArtifacts(schema, projectPath)` — filesystem scan.
3. `readConfig(projectPath)` for project context.
4. `new ArtifactGraph(schema)` for unlock computation; `collectHardDeps(artifact)` (single implementation, reused) for dependencies.
5. `artifact.template` resolution (`isFilePath` heuristic): starts with `(` → literal text; starts with `.` or `/` → path; ends with `.md|.yaml|.yml|.json|.xml` → path. Paths are resolved **relative to the project root** and read from disk; unreadable/missing → fall back to the literal string. No template at all → `(无模板)`.
6. `artifact.instruction` empty → generated 5-step fallback (understand → check deps → write → output to `generates` → verify).
7. All interpolated text is XML-escaped (`& < > " '` → entities).

XML output (exact tag order, `xmlEscape`d values):

```xml
<?xml version="1.0" encoding="UTF-8"?>
<artifact id="{id}" change="{change}" schema="{schema}">
  <task>{instruction ?? description ?? '请完成此 artifact'}</task>
  <project_context>
    <tech_stack>{config.meta.tech_stack ?? 'TypeScript'}</tech_stack>
    <workspace>.openfeel/ 工作区已初始化</workspace>
    <project>{config.meta.project ?? 'OpenFeel'}</project>
    <config>{执行模式: …; 自动推进: …; 合并模式: … | 无特殊配置}</config>
  </project_context>
  <rules>
    <rule>遵循 TypeScript 编码规范</rule>
    <rule>产物生成到 generates 字段指定的路径</rule>
    <rule>完成所有 hard 依赖后再开始当前 artifact</rule>
    <!-- + schema.rules[] strings -->
  </rules>
  <dependencies>
    <dependency id="{depId}" status="done|pending">
      <path>{dep.generates}</path>
      <description>{dep.description ?? '(无描述)'}</description>
    </dependency>
  </dependencies>
  <output>{generates}</output>
  <instruction>{instruction}</instruction>
  <template>{template}</template>
  <unlocks>Completing this artifact enables: {id（desc）, …}</unlocks>
</artifact>
```

`<dependencies></dependencies>` when no hard deps; `<unlocks>` fallback text = `完成此 artifact 后暂无直接解锁的下游 artifact`. Trailing newline after the closing tag.

`generateInstructionsJson` returns the structurally identical object: `{ artifact:{id,change,schema}, task, project_context:{tech_stack,workspace,project,config:{execution_mode,auto_advance,merge_mode}}, rules[], dependencies[], output, instruction, template, unlocks[] }` (raw text, not XML-escaped; `template` may be `null`).

Note: this is the only place where "artifact markdown templates" are loaded from **project** files at runtime. The shipped 22 skills and 10 agents are **not** loaded from disk by the CLI — they are inlined into TS constants at build time (§3.1).

---

# 3. Skills and agents — inventory and contracts

## 3.1 Where the templates live and how they become code

Authoritative sources:

```
src/core/templates-data/
├── skills/{skill-name}/SKILL.md        # 22 shared skills, neutral (both harnesses)
├── agents-md/{zh-CN,en}.md             # global AGENTS.md constraint layer
├── opencode/
│   ├── agents/{zh-CN,en}/{agent}.md    # 10 opencode-format agents per language
│   └── ADAPTER.{zh-CN,en}.md           # adapter doc (Base64-inlined)
└── claude/
    ├── agents/{zh-CN,en}/{agent}.md    # 10 Claude-format agents per language
    └── constraint/{zh-CN,en}.md        # CLAUDE.md constraint layer
```

`build.js` runs 8 generate steps that rewrite regions delimited by `// AUTO-GENERATED-BEGIN: {NAME}` / `// AUTO-GENERATED-END: {NAME}` (manual edits inside those regions are forbidden; a hand-written comment section outside the anchors is the documented trap):

| Step | Target constant | Anchor / file |
|---|---|---|
| 1 | `AGENT_TEMPLATES` | `template-loader.ts` (opencode agents) |
| 2 | `AGENTS_MD_TEMPLATES` | `template-loader.ts` |
| 3 | `SKILL_DEFINITIONS` | **`update.ts`** (this is the one people miss) |
| 4 | `OPENCODE_AGENT_TEMPLATES` | `template-loader.ts` |
| 5 | `OPENCODE_SKILL_DEFINITIONS` | `template-loader.ts` |
| 6 | `OPENCODE_CONFIG_TEMPLATES` (adapter, Base64) | `template-loader.ts` |
| 7 | `CLAUDE_AGENT_TEMPLATES` | `template-loader.ts` |
| 8 | `CLAUDE_CONSTRAINT_TEMPLATES` | `template-loader.ts` |

Validators enforce: source↔constant content parity, key-set parity between opencode and Claude agent records, no resurrected redundant template tree, and negative assertions (Claude templates must not contain opencode-only tokens such as `permission:`, `reasoning_effort:`, `mode:`).

Runtime dispatchers (all fall back to `zh-CN` when a language key is missing; a missing agent/skill id throws):

```ts
loadAgentTemplate(lang, agentId): string
listAgentIds(lang): string[]
loadTemplate(lang, 'agents-md'): string
loadOpencodeAgentTemplate(lang, agentId): string
loadOpencodeSkillTemplate(skillName): string
loadOpencodeConfigTemplate(lang, 'adapter'): string   // Base64-decoded
listOpencodeAgentIds(lang): string[]
listOpencodeSkillNames(): string[]
loadClaudeConstraintTemplate(lang): string
loadClaudeAgentTemplate(lang, agentId): string
listClaudeAgentIds(lang): string[]
```

Counts are **10 agents** (`feel` + 9 `openfeel-*`) × 2 harnesses × 2 languages = 40 agent files, **22 skills** (one shared copy, deployed to both harnesses), plus 4 constraint files and 2 adapter docs. Any literal `9 agent` / `18 skill` text still present in comments is stale.

## 3.2 Skill inventory (22)

All under `src/core/templates-data/skills/{name}/SKILL.md`; `name` == directory name == frontmatter `name`.

| # | Skill | One-line purpose |
|---|---|---|
| 1 | `openfeel-agent-model-check` | Diagnose/repair "Model not found": auth.json, provider-key matching, model capability, vision-specific guide, Claude `/model` & gateways |
| 2 | `openfeel-bug-acceptance` | Standardized Bug acceptance checklist for testers/coders |
| 3 | `openfeel-check-kb` | Progressive KB lookup by task type + semantic fallback + mandatory "consult KB" reminder |
| 4 | `openfeel-cli-usage` | Authoritative CLI snapshot: commands, args, 15 phases + transitions, stageId→directory mapping, per-version capability notes |
| 5 | `openfeel-context-hygiene` | Context hygiene: load-on-demand, tool-result governance, concise sub-session returns, long-task segmentation, controllable/uncontrollable split |
| 6 | `openfeel-delegation` | Delegation + pipeline discipline: dual dispatch channels, boundaries, no-skipped-stage, Handoff, multimodal delegation, degradation |
| 7 | `openfeel-get-bugs` | List `open`/`fixing` bugs for the current module |
| 8 | `openfeel-get-stage-status` | Read `status.md`: status, responsible agent, dependency readiness, auto-advance eligibility, next-step mapping |
| 9 | `openfeel-health` | Load pipeline health-check results (flow.json ↔ workspace consistency) |
| 10 | `openfeel-logging` | Logging discipline: public/private log layout, mandatory events, entry format, skeleton files, prohibitions, mechanical archival checklist |
| 11 | `openfeel-memory` | Memory & write-back: load priority, preference merge, conflict arbitration, `update_infos` review, decision append, session-end write-back |
| 12 | `openfeel-model-check` | Session-start model self-check across all agents; expected vs actual; guide user configuration |
| 13 | `openfeel-model-config` | Model configuration locations/priority chain, how to find model names, multimodal (vision) caveats |
| 14 | `openfeel-recover` | Cross-session context recovery at session start |
| 15 | `openfeel-req` | Requirement layer reference: 4-layer model, 7 statuses, `req` subcommands, claim protocol, REQ-NNN body vs flow.json authority, relation to plan/`workflow_mode` |
| 16 | `openfeel-roadmap` | Load the project roadmap (version plan, milestones) |
| 17 | `openfeel-search-kb` | Standalone semantic/vector KB search with graph traversal (superseded by `check-kb` step 5) |
| 18 | `openfeel-sync-status` | Aggregate all members' progress views (`dev_last` indices + flow.json) |
| 19 | `openfeel-tool-usage` | The four core tools (`todowrite`/`question`/`task`/`skill`): triggers, requirements, prohibitions, priority table, scale thresholds, cross-harness tool-name map |
| 20 | `openfeel-update-stage-status` | Standardized `status.md` updates (status / responsible agent / state record) |
| 21 | `openfeel-wizard` | Interactive terminal pipeline wizard |
| 22 | `openfeel-workspace` | Workspace self-check + directory semantics (public/private) + skeleton templates (current.md, dev_last index/topics, REV entries, bug tree) |

`feel`'s Skill Index lists 16 of these (the operational subset); the other six (`agent-model-check`, `bug-acceptance`, `model-check`, `search-kb`, `sync-status`, `update-stage-status`) are invoked from subagents or side flows.

## 3.3 `SKILL.md` frontmatter contract

Exactly two fields, both required, no optional keys, no nested objects:

```yaml
---
name: openfeel-req            # MUST equal the containing directory name
description: <one paragraph>  # single line; states scope + concrete triggers ("当需要…时加载")
---
```

- No `allowed-tools`, `license`, `version`, `model`, `metadata`. The harness derives everything else from the directory (`{skills-dir}/{name}/SKILL.md`).
- `description` is the retrieval key: it is written as `{what it covers}。{when to load it}。` — the trailing trigger sentence is what the orchestrator matches against.
- Frontmatter is **byte-identical across harnesses and languages** (skills are neutral, Chinese-authored, never translated — only agents/constraints are bilingual).

Body conventions (observed in all sampled skills):

```markdown
# {Title}

> ⚠️ **本仓自举**：本仓（openfeel 源码仓库）开发/执行时请用 `node bin/openfeel.js <cmd>`；安装后使用 `openfeel <cmd>`。   ← optional, self-hosting note

## 输入
- {what the caller must supply}

## 执行步骤
### 1. {step}
### 2. {step}
...

## 输出
- {what to return}
```

Additional structural conventions:

- Numbered `###` steps; heavy use of Markdown tables for layouts, mappings, checklists.
- Explicit **边界声明** paragraphs stating what the skill does *not* cover and which other skill does (single-ownership rule; e.g. logging ≠ workspace skeleton shapes).
- Cross-skill pointers use backticked skill names, never duplicated prose.
- Harness-specific content is isolated into `### opencode 适配器` / `### Claude Code 适配器` subsections; the rest is platform-neutral (tool names expressed as capabilities, e.g. "以 `Skill` 工具加载" in the Claude subsection).
- `openfeel-tool-usage` carries the canonical 10-row tool-name map: `bash/Bash, read/Read, write/Write, edit/Edit, glob/Glob, grep/Grep, todowrite/TodoWrite, skill/Skill, task/Task, question/AskUserQuestion`.

## 3.4 Agent inventory (10), both harnesses

### 3.4.1 Frontmatter contracts

**Claude format** (`~/.claude/agents/{name}.md`) — fields:

```yaml
---
name: openfeel-planner                     # required, equals file name
description: "…: role summary; read-only, does not edit source."   # quoted, imperative
tools: Bash, Read, Glob, Grep, Skill       # comma-separated allowlist; OMITTED for feel (inherits all)
effort: max                                # low | medium | max
color: blue                                # purple | green | blue | pink | cyan | yellow
model: inherit                             # always `inherit` on the Claude side (never a vendor id)
---
```

**opencode format** (`~/.config/opencode/agents/{name}.md`) — fields:

```yaml
---
description: <role summary, one line, no quotes needed>
mode: primary            # `primary` for feel, `subagent` for the other 9
model: deepseek/deepseek-flash   # optional; omitted = inherit the primary model
reasoning_effort: medium # low | medium | max
color: "#8B5CF6"         # quoted hex
permission:              # map of tool → "allow" | "deny"; only listed tools are declared
  bash: "allow"
  read: "allow"
  glob: "allow"
  grep: "allow"
  task: "allow"
  external_directory: "allow"
---
```

Field mapping applied when generating the Claude variant from the opencode source (documented and asserted by build):

| opencode | Claude | Rule |
|---|---|---|
| `description` | `description` | rewritten/quoted |
| `mode` | — | dropped (`primary` → omitted `tools`, i.e. inherit; `subagent` → explicit allowlist) |
| `permission:` | `tools:` | allowlist projection, capitalized names |
| `reasoning_effort` | `effort` | renamed, same value domain |
| `color: "#RRGGBB"` | `color: <name>` | hex → nearest named color |
| `model` | `model: inherit` | vendor ids never leak into Claude templates |
| — | `name` | added |

Two deliberate asymmetries: (a) `feel` has **no** `tools` key on the Claude side (inherits the full toolset, R-13); (b) `external_directory` has no Claude equivalent and is explicitly **not simulated** — cross-directory access is governed by session permissions + the tools allowlist.

### 3.4.2 Roster with roles and read-only constraints

| Agent | Role | read-only? | Claude `tools` | opencode `permission` keys | model / effort |
|---|---|---|---|---|---|
| `feel` | Orchestrator / dispatcher (main session). Owns intent classification, dispatch, pipeline management, stuck-state arbitration | writes only via whitelist (git add/rm, cp/mv, mkdir, rm non-source, cat, base64, diff, simple sed on non-`.ts`, `npm run build/test`); **never** edits source or flow.json | *omitted* (inherits all) | bash, read, glob, grep, task, todowrite, skill, webfetch, external_directory | inherit / medium |
| `openfeel-planner` | Planning officer: roadmap → work stages, `plan.md`, `deps.yaml`, dependency types | **yes** (no Edit/Write) | Bash, Read, Glob, Grep, Skill | bash, read, glob, grep, task, external_directory | inherit / max |
| `openfeel-schemer` | Scheme officer: stage → `op-NNN` operation schemes with self-test checklists | **yes** | Bash, Read, Glob, Grep, Skill | bash, read, glob, grep, task, external_directory | inherit / max |
| `openfeel-executor` | Implements strictly per op scheme + self-tests, no scope expansion | no | Bash, Read, Glob, Grep, Edit, Write, TodoWrite | bash, read, glob, grep, task, external_directory | explicit flash / medium |
| `openfeel-reviewer` | Cross-review plan/scheme/code, file `REV-*` entries; reviews only | **yes** | Bash, Read, Glob, Grep | bash, read, glob, grep, task, external_directory | explicit flash / medium |
| `openfeel-feel-tester` | Formal test acceptance, files `BUG-*` entries | no (writes BUG records) | Bash, Read, Glob, Grep, Edit, Write, Skill | bash, read, glob, grep, task, skill, **webfetch: deny**, external_directory | inherit / medium |
| `openfeel-archiver` | Archive op records, extract knowledge into `kb/`, maintain `manual/` | no (writes docs/kb, never source) | Bash, Read, Glob, Grep, Edit, Write | bash, read, glob, grep, task, external_directory | inherit / low |
| `openfeel-explorer` | Read-only exploration / issue locating; structured conclusions, no side effects | **yes — hard** | Bash, Read, Glob, Grep | **exactly** bash, read, glob, grep, external_directory (no `task`, no write) | explicit flash / medium |
| `openfeel-utility` | Mechanical file ops, format conversion, build/test helper; escalates to executor | no | Bash, Read, Glob, Grep, Edit, Write | bash, read, glob, grep, task, **edit: allow**, external_directory | explicit flash / low |
| `openfeel-vision` | Multimodal: images / UI screenshots / diagrams / error stacks → structured analysis | effectively read-only | Bash, Read, Glob, Grep | bash, read, glob, grep, task, external_directory | explicit flash / medium |

Read-only enforcement is **by tool-set subtraction**, not by prompt text: planners/schemers/reviewers/explorer have no write/edit tool, so the constraint is structural. `openfeel-explorer` is additionally the "read-only general worker" used instead of the harness's built-in `Explore`/`general` subagents; its permission set is asserted to be exactly 5 keys and its Claude `tools` exactly 4 items.

Colour constants: feel `#8B5CF6`/purple, planner `#6A8DFF`/blue, schemer `#4A90D9`/blue, executor `#4CAF50`/green, reviewer `#EC4899`/pink, utility `#8B9DC3`/blue, vision `#06B6D4`/cyan, feel-tester `#22D3EE`/cyan, archiver `#50C878`/green, explorer `#FFB020`/yellow.

### 3.4.3 Standard agent body sections

Every agent body follows the same skeleton (post stage-91 "prompt slimming": a **skill index shell + minimal constraints**, not full procedures):

```
<one-line identity: "You are {agent}, the {role} in the OpenFeel pipeline…">
## Core Responsibilities            (numbered, 4-7 items)
## Skill Index                      (markdown table: skill | one line) ← only 1-3 rows per subagent
## Workflow Mode Awareness (fast)   (full vs fast expectations; fast = lightweight but never omit task table/deps/acceptance)
## Requirement Awareness           (planner only; REQ-NNN reading + plan header annotation)
## Dispatch and Handoff            (who this agent may dispatch + [HANDOFF: …] sentence)
## Model Selection                  (why inherit vs explicit)
## Notes / Output Contract          (invariants + return format)
```

`feel` additionally carries: Direct Operation Whitelist, Auto-Advance Decision Rules, Workflow Mode (full/fast/general + fast discipline + terminology disambiguation), Requirement Lifecycle, Archiving and History Reading, Command Index, Memory & Write-Back, Version Control Suggestion, New Version Start Rule, Output Contract.

---

# 4. Agent role model, phase ownership, delegation protocol

## 4.1 The 15-phase pipeline

```ts
PIPELINE_PHASES = ['plan_pending','plan_review','plan_passed',
                   'scheme_pending','scheme_review','scheme_passed',
                   'exec_running','review_pending','review_failed',
                   'review_passed','test_pending','test_failed',
                   'test_passed','archiving','done']
META_PHASES = ['active','paused','done']    // global pipeline.phase: macro state only
```

`flow.json` is a **multi-stage independent state machine**: each `stages.{id}.phase` carries its own phase; the global `pipeline.phase` is metadata. Dispatch always traverses `stages` and picks an active stage (`phase != 'done'`).

Transition keys may combine sources with `|` (`'test_passed|review_passed': ['archiving']`), parsed by a single control point (`parseTransitionKey` / `transitionKeyMatches`).

## 4.2 Phase → agent ownership (single table)

From `src/core/metrics.ts:25` `PHASE_AGENT_MAP` (used by `recordRun` for `flow metrics`):

| Phase | Owning agent |
|---|---|
| `plan_pending`, `plan_review` | `openfeel-planner` |
| `scheme_pending`, `scheme_review` | `openfeel-schemer` |
| `exec_running` | `openfeel-executor` |
| `review_pending`, `review_failed` | `openfeel-reviewer` |
| `test_pending`, `test_failed` | `openfeel-feel-tester` |
| `archiving` | `openfeel-archiver` |

Unmapped (`*_passed`, `done`, meta phases) = no run recorded. `feel` owns no phase; it owns **orchestration** (dispatch + `openfeel flow advance`).

## 4.3 Three workflow modes

| Mode | Chain | Notes |
|---|---|---|
| `full` | planner → plan_review (reviewer) → schemer → executor → reviewer → tester → archiver | 15 phases reachable |
| `fast` | planner (lightweight) → plan_review (**single mandatory plan review**) → executor → reviewer (single round) → archiver (lightweight) | `openfeel-schemer` and `openfeel-feel-tester` are **not dispatched**; 6 phases unreachable (`scheme_*`, `test_*`); legal phase enumeration still 15 ("reachable ≠ legal"); reviewer still runs **twice** (plan review + code review); planner/archiver must not omit task table / dependencies / acceptance points / state record / KB staging decision |
| `general` | none (empty transition table) | dispatch general workers (executor/explorer) on demand; valid only at the **requirement level**, not stage/deployment level; may be explicitly upgraded to fast/full, never auto-downgraded |

Mode resolution is single-point (`resolveStageWorkflowMode`), precedence `status.md > requirement-level > config.yaml > profile > builtin`. Terminology rule: "Workflow Fast Line" (`workflow_mode=fast`) ≠ "Fast Track / FAST-PASS" (review-depth downgrade) — never cross-reference.

Review tiers (orthogonal third axis, `flow advance --review-tier full|lean|skip`): prune only transitions — `lean` prunes `scheme_review`, `skip` prunes `plan_review` + `scheme_review`; `review_pending`, test and archive gates are never pruned; the 15-value phase enum is never reduced.

## 4.4 Delegation / handoff protocol

Two independent channels — mixing them is a discipline violation:

**Channel ① — direct dispatch to general workers.** Any agent (including subagents) may send a dispatch request straight to a general worker, no multi-level referral:

- `openfeel-explorer` — read-only exploration, issue locating.
- `openfeel-executor` — implementation, modification, self-test.
- `openfeel-feel-tester` is also directly dispatchable (same semantics) though not classified as a "general worker".

Platform mapping:

- opencode: nested `task` tool. **Measured no-go at default config** — platform `subagent_depth = 1` blocks the nested call; raising `subagent_depth: 3` proved the permission extension works and the only blocker is the platform threshold.
- Claude Code: `Task` tool. **Measured yes** on 2.1.300 — a subagent whose allowlist includes `Task` can spawn one level down (`spawnDepth: 2`; runtime tool name `Agent`).

The skills deliberately **do not name a tool**: they say "dispatch through the platform's dispatch capability", so both outcomes stay valid.

**Channel ② — `[HANDOFF: agent_name]` marker.** A returned result may carry this marker (target + context); the **caller** parses it and dispatches the target agent with the original context, then relays the result back and records the dispatch event. Every subagent body carries the canonical sentence:

> For subtasks beyond this Agent's responsibility that require referral to another Agent: include a `[HANDOFF: agent_name]` marker in the returned result (target + context), which the Handoff delegation mechanism will parse and dispatch.

**Delegation prompt contract** — three required parts, any missing part means the prompt is invalid: (a) task description (what + acceptance criteria), (b) expected return (format and granularity; standard: ≤10-line summary + full report written to disk), (c) boundary (read-only vs writable, with a path allowlist).

**Degradation**: if direct dispatch is unavailable (no such capability / permission denied), fall back to asking an upstream agent to relay ("this session has no direct dispatch capability, please relay"), log the degraded path, and return to channel ① when capability is restored.

**Mandatory-delegation table** (any hit ⇒ must delegate, never self-perform): plan/stages → planner; operation scheme → schemer; source coding / cross-file refactor / dependency change → executor; code review → reviewer; formal test acceptance → feel-tester; bulk search/exploration → explorer; mechanical file ops → utility; archival/knowledge extraction → archiver; visual/multimodal → vision.

**Direct-operation whitelist** (the only self-performable actions): `git add`/`git rm`, `cp`/`mv`, `mkdir`, `rm` (non-source), `cat`, base64 encode/decode, `diff`, simple `sed` on non-`.ts` files, `npm run build`, `npm test` (verification only). Explicitly forbidden: editing source content, cross-file refactoring, `install`/`uninstall`. Each whitelisted action must be a single self-contained command with no dependency chain.

**No-skipped-stage discipline** (hard rules, each stage must produce an artifact even if the artifact is "pass, no changes"): no self-written `plan.md`; no executor work without a scheme; no self-review; no `npm test` as a substitute for tester acceptance; no self-serve `kb/` updates at archive time. Review failures must be fixed through "schemer → executor → reviewer re-acceptance", even for whitespace-level REVs. When delegating without a scheme, the delegation prompt must require the executor to first create a minimal op file (`# op-NNN`, change target, file list) — the op file is the audit-chain evidence.

**Reviewer-session health probe**: on the reviewer's first round, require a minimal tool self-check (version query + read a known file and report its content). Failure/mismatch ⇒ the session is unusable: abort, restart it, and demote its already-written REV/acceptance records to **pending re-review** with a confidence statement.

**Parallelism**: only for independent subtasks (no dependency chain, no write-set overlap, not sharing an API/data structure/agent template file). Split via `openfeel req split` → claim by requirement (`req claim`); each branch is independently reviewed and archived.

---

# 5. The managed-region mechanism

Purpose: inject framework content into **user-owned** files (`AGENTS.md`, `CLAUDE.md`, `.gitignore`) without clobbering user content, and make re-deployment idempotent.

## 5.1 Marker syntax (exact)

| File type | begin marker | end marker |
|---|---|---|
| Markdown (`.md`) | `<!-- openfeel:begin -->` | `<!-- openfeel:end -->` |
| `.gitignore` (exactly that basename) | `# openfeel:begin` | `# openfeel:end` |
| `.jsonc` | none — deep merge (handled by `opencode-config.ts`, not by the region code) | — |
| anything else | unsupported → `writeManagedFile` throws | — |

Rules:

- Markers are matched as **whole lines after `trim()`**, so leading/trailing indentation is tolerated; CRLF/CR is normalized to LF before parsing.
- Wrapped region serialization: `wrapRegion(content)` → `` `${begin}\n${content.trim()}\n${end}\n` ``.
- `replaceRegion(existing, incoming)` requires `parseRegion(existing).status === 'ok'` (throws otherwise — a deliberate guard against deleting user content). It preserves the prefix (all lines before begin) and the suffix (all lines after end) **byte-for-byte**, including the original trailing newline: the result satisfies `replaceRegion(x, extractRegion(x)) === normalize(x)`.
- Distinct from the unrelated single-line build marker `openfeel:generated` (whole-file artifact declaration). Different token, different form; the two are deliberately not unified.

## 5.2 The three states

`parseRegion(existing, type)` counts marker lines and returns one of:

| State | `status` | Condition | Deployment behavior |
|---|---|---|---|
| **ABSENT** | `'none'` | neither marker appears | Two sub-cases, hash-gated: ① recorded hash in `update_state.files[stateKey]` **equals** `hashContent(existing)` ⇒ the file is a pristine copy of a previously deployed framework file → rewrite the whole file as frontmatter + wrapped region, action `updated` (a.k.a. "adopt"); ② no record or hash differs ⇒ the file is user-authored → **append** `wrapRegion(incomingBody)` at EOF (one `\n` separator if the file lacks a trailing newline), action `appended`, and record an `appended` entry in `~/.openfeel/update_infos.md` for session-start review |
| **PRESENT-AND-OWNED** | `'ok'` | exactly one begin, one end, `beginIndex < endIndex` | `status.md`-style in-place update: merge frontmatter (§5.3), `replaceRegion` the body, compare the **whole assembled content** to `normalize(existing)`; identical ⇒ `skipped` (byte-idempotent, no backup, no write); otherwise back up the target, write atomically, action `updated` |
| **PRESENT-BUT-DRIFTED** | `'ok'` + differing content | the same `ok` geometry, but region content (or frontmatter) differs from the incoming template | Same as above: backup → region replace → `updated`. Drift is *normal* and self-healing; only the region is touched, so user edits outside the region survive |
| **MALFORMED** | `'malformed'` | begin/end counts unequal, or >1 pair, or end before begin | **No write, no append.** Record an `anomaly` entry in `update_infos.md`, action `skipped`. This is the anti-infinite-append guard: appending on a malformed file would duplicate the region on every run. After the human fixes the markers, the next run takes the `ok` or `none` path normally |

Frontmatter is split off before region parsing, so markers inside Frontmatter-delimited files behave the same as in plain Markdown:

- `---\n…\n---\n` at the very start with a closing `\n---\n` ⇒ parsed (YAML); empty frontmatter (`---\n---\n`) ⇒ `{}`; YAML syntax error ⇒ treated as "no frontmatter" (degraded, never throws).
- Serialization always ends with `---\n` (guards against `yaml.stringify` omitting the final newline and gluing onto the closing fence).

## 5.3 Frontmatter merge and the user-sovereign-key rule

```ts
export const USER_SOVEREIGN_KEYS: readonly string[] = ['model'];

mergeFrontmatter(existing, incoming, preserveKeys = []) {
  merged = { ...existing, ...incoming };              // framework keys win
  for (key of preserveKeys)
    if (hasOwn(existing, key)) merged[key] = existing[key];  // user value wins, even if null/empty
  return merged;
}
```

- Semantics: **key-level "create if absent, never overwrite if present"**. Only `model` is user-sovereign today. All other framework keys (`name`, `description`, `tools`, `permission`, `effort`, `color`, `mode`, `reasoning_effort`, …) are overwritten by the template on every deployment.
- Existing-only keys (user additions) pass through untouched: `mergeFrontmatter` is a shallow merge with passthrough, no key filtering, no reordering guarantees beyond JS insertion order for the serialized YAML.
- Scope: **deployment paths only** (`writeManagedFile`'s `ok` branch). `openfeel model set --scope default` deliberately does **not** pass the whitelist, so its overwrite semantics stay literal.
- If the incoming template has no frontmatter, the existing frontmatter is kept as-is (prevents silent loss on `AGENTS.md`/`core.md`).

## 5.4 Non-destructive guarantees (write path checklist)

1. Target missing ⇒ create (`created`); no backup needed.
2. Target exists and content will actually change ⇒ `backupFileBeforeWrite` runs **before** the write and **outside** the target-content lock (avoids lock nesting); result recorded as a `backed` entry plus a TTY notice.
3. Backup failure (`BackupError`) ⇒ **the write is skipped** (`skipped`), an `anomaly` entry with `note: backup_failed` is recorded, the command continues with the remaining assets and the exit code stays successful. This is a hard "never overwrite without a backup" invariant.
4. Atomic writes everywhere (`temp + rename`), advisory file locks around read-modify-write (`~/.openfeel/locks/{name}.lock` for global, `.openfeel/tmp/locks/{name}.lock` for project).
5. Malformed markers ⇒ never append, never write; only an anomaly entry.

Backup layout (`~/.openfeel/backup/{yyyyMMddTHHmmssSSS}/`):

```
<ts>/manifest.json
<ts>/project/{basename}-{sha8(projectPath)}/{project-relative path}
<ts>/global/{HOME-relative path}
<ts>/global-external/{sha8(absPath)}/{segment…}      # HOME-external paths, reserved chars sanitized
```

`manifest.json` entries: `{ backupRel, hash, command, time }`.

`~/.openfeel/update_infos.md` — three sections, three entry kinds:

```markdown
## 追加（无标记 → 末尾追加受管区） / ## 异常（…需人工修复标记） / ## 备份（…已备份，待检查）
- [ ] `{absolutePath or relativePath (项目: root)}`（{timestamp}）
- [x] `…`（{timestamp}）（备份: `{backupRel}`，来源: {command}）
- [ ] `…`（{timestamp}）（原因: backup_failed）
```

`anomaly` entries are de-duplicated per path while unresolved (prevents unbounded growth); resolution is a manual `- [ ]` → `- [x]` tick, mirrored by `resolveUpdateInfo`.

---

# 6. Deployment model

## 6.1 Global path table

| Constant | Path | Purpose |
|---|---|---|
| `getOpencodeGlobalDir()` | `~/.config/opencode` | opencode adapter root |
| `getGlobalAgentsDir()` | `~/.config/opencode/agents` | 10 opencode agents |
| `getGlobalSkillsDir()` | `~/.config/opencode/skills` | 22 skills (`{name}/SKILL.md`) |
| `getGlobalAgentsMdPath()` | `~/.config/opencode/AGENTS.md` | **sole authority** for the framework constraint layer (opencode) |
| `getGlobalOpencodeJsoncPath()` | `~/.config/opencode/opencode.jsonc` | platform config (deep-merged) |
| `getGlobalCoreMdPath()` | `~/.config/opencode/openfeel/core.md` | deprecated since v1.1.1 — detect/clean only |
| `getClaudeConfigDir()` | `$CLAUDE_CONFIG_DIR` (non-blank, read inside the function) else `~/.claude` | Claude adapter root |
| `getClaudeAgentsDir()` | `<claude>/agents` | 10 Claude agents |
| `getClaudeSkillsDir()` | `<claude>/skills` | same 22 skills |
| `getClaudeMdPath()` | `<claude>/CLAUDE.md` | constraint layer (Claude) |
| `getClaudeSettingsPath()` | `<claude>/settings.json` | strict-JSON deep merge |
| `getGlobalUpdateStatePath()` | `~/.openfeel/update_state.json` | deployed-asset hashes + `openfeel_version` + `last_update` |
| `getGlobalUpdateInfosPath()` | `~/.openfeel/update_infos.md` | append / anomaly / backup ledger |
| `getGlobalBackupRootPath()` | `~/.openfeel/backup` | pre-write backups |
| `getGlobalProfilePath()` | `~/.config/openfeel/profile.yaml` | cross-project user profile |
| `getGlobalSchemasDir()` | `~/.openfeel/schemas` | schema home-directory layer |
| `getGlobalLockPath(name)` | `~/.openfeel/locks/{name}.lock` | global write locks |
| `getCliLogsDir()` | `~/.openfeel/cli/logs` | CLI runtime logs |
| `getAuthJsonPath()` | `~/.local/share/opencode/auth.json` | model provider validation |

`os.homedir()` is imported in exactly one module (`global-paths.ts`) so tests can mock a single point.

## 6.2 What `setup` deploys

`setupGlobalFramework(lang = 'zh-CN', tools = ['opencode'])` — **pure global**, creates no project `.openfeel/`. Every file goes through `deployGlobalAsset` (managed-region three-state, idempotent, re-runnable) and returns `{ created, updated, skipped, appended }`.

opencode branch:

1. `~/.config/opencode/AGENTS.md` ← `loadTemplate(lang,'agents-md')` (constraint layer: code of conduct, task-type routing, 7 core constraints, knowledge constraint "consult the KB first", operational conventions, coding/comment style, cross-agent boundary table, `.openfeel` workspace constraints, pointer block to skills).
2. `~/.config/opencode/agents/{id}.md` × 10.
3. `~/.config/opencode/skills/{name}/SKILL.md` × 22.
4. `~/.config/opencode/opencode.jsonc` — deep merge, under the global lock, with a pre-write backup: framework object is `{ $schema, default_agent: 'feel', agent: { 'openfeel-vision': {model: 'deepseek/deepseek-flash'}, 'openfeel-reviewer': {model: 'deepseek/deepseek-flash'} } }`. Merge semantics: `instructions` arrays are unioned, `agent` keys are filled **only when the user has not defined the agent key at all** (never rewriting existing agent fields), `skills` is never written, and stale `core.md` references are pruned. Parse failure ⇒ keep the original file, warn, continue.

Claude branch (only when `tools` includes `claude`):

1. `<claude>/CLAUDE.md` ← `loadClaudeConstraintTemplate(lang)`.
2. `<claude>/agents/{id}.md` × 10.
3. `<claude>/skills/{name}/SKILL.md` × 22 (same shared skill text).
4. `<claude>/settings.json` — strict-JSON deep merge injecting exactly `{ agent: 'feel', permissions: { defaultMode: 'auto' } }`; all other user keys (`env`, `model`, `modelPicker`, `theme`, `apiKeyHelper`, …) preserved verbatim; output `JSON.stringify(obj, null, 2) + '\n'` (insertion-order–dependent byte idempotence); empty file ⇒ `{}`; parse failure / read failure / backup failure ⇒ **no write**, `anomaly` entry, action `skipped`.

Finally `setup` records hashes for every created/updated/appended path and refreshes `openfeel_version = getOpenfeelVersion()` (the deployed-version fact source).

`update` runs the same two branches with `deployGlobalAsset` (plus legacy/deprecated-key remapping, project-level files, and `conflicts` reporting) — the deployment primitives are shared, so the three-state semantics are identical between `setup` and `update`.

## 6.3 Non-destructive guarantees and drift detection

- User-authored files are never replaced wholesale: content goes inside markers, or the file is only appended to, or it is skipped.
- Every overwrite is preceded by a backup; a backup failure aborts that single write (never the whole command).
- User `settings.json` / `opencode.jsonc` keys are preserved; only framework-owned keys are written.
- `model` is user-sovereign on the deployment path (agent frontmatter), so a locally configured model (e.g. a gateway alias, or a heterogeneous reviewer model) survives `update`.
- `shouldRunDeployCheck({argv, isTTY, env, alreadyWarned})` gates a passive drift warning. `checkGlobalDeployment()` returns four states: `ok` (versions equal), `mismatch` (unequal, including downgrade), `missing` (`update_state.json` absent), `unknown` (`schema invalid`/read error — silent). The warning is emitted on **stderr**, at most once per process, and never changes the exit code. It is suppressed when: non-TTY, already warned, `--json`, `--quiet`, `--version`/`-v`, `--help`/`-h`, first non-option token ∈ `{setup, update, init, migrate}`, or `CI` / `OPENFEEL_NO_UPDATE_CHECK` is truthy (`'1'`/`'true'`, case-insensitive, trimmed). `openfeel setup --check [--json]` is the explicit active diagnostic (ok ⇒ exit 0, other states ⇒ exit 1).
- Assets are deployed per file; a `skipped` result is a normal, expected, non-error outcome.

---

# 7. What a DSH-native reimplementation should reuse vs replace

## 7.1 Reuse nearly verbatim (portable content/semantics)

| Item | Why | Porting note |
|---|---|---|
| The 22 `SKILL.md` bodies | Deep, hard-won operational rules (pipeline discipline, logging, memory, requirements, context hygiene). Nothing in them is opencode/Claude-specific except tool names and the `### … 适配器` subsections. | Copy `templates-data/skills/**` as-is; rewrite only the harness subsections and the tool-name map. Keep frontmatter as exactly `name` + `description` (DSH's skill loader can consume the same contract). |
| KB directory layout, entry format, `[+]`/`[-]` convention, append-only discipline | The archiver prompts, `openfeel-check-kb` and the on-disk reality of any migrated project all assume it. | Reimplement `knowledge.ts` parsing/writing 1:1 (including the two header regexes, the title sanitization, the atomic read-concat-write under `kb.lock`). |
| `index.md` tolerant parser (section aliases, alias-column matching, degrade-to-empty) | Real index files in the wild are all different shapes. | Port `extractSection` / `parseMarkdownTable` / `colIndex` / `parseRecentUpdatesTable` directly. |
| Dedup math + merge convention (`Jaccard`, `> 0.8`, `> **更新于 date**：`) | Encoded in agent prompts and in existing KB files; changing it silently changes archival behavior. | Port `tokenize`/`jaccardSimilarity`/`shouldUpdate`/`mergeEntry` literally; if you upgrade to embeddings, keep the threshold semantics and add an explicit compatibility note. |
| `managed-region.ts` primitives + the three-state decision table + `USER_SOVEREIGN_KEYS=['model']` | This is the entire "don't destroy the user's file" contract; it is harness-independent. | Port as a library; keep marker tokens identical so existing files stay recognized (`<!-- openfeel:begin -->` / `# openfeel:begin`). |
| Frontmatter split/serialize + shallow merge + key-level sovereign rule | Applies to any agent-definition format, including DSH's. | Keep `model` (and any future DSH-specific user-owned key) in the whitelist; document the whitelist as an explicit constant. |
| Backup + `update_infos.md` ledger | Provides auditability and the "backup failed ⇒ don't write" invariant. | Port path scheme and the three entry kinds; keep the `- [ ]` / `- [x]` checklist convention. |
| Phase enum, transition `|`-combining, review tiers | The role model is the actual product value; phases/agents are harness-agnostic concepts. | Port phase/tier **semantics** as constants; keep 15 phases + "reachable ≠ legal" wording. **Do not port `PHASE_AGENT_MAP` into an adapter** — consume `flow next --json.responsibleAgent` as the single authority (v1.2.2+). |
| Agent body prose (roles, whitelists, no-skipped-stage rules, delegation prompt contract, health probe) | These are the behavioral spec; only the delegation *transport* is harness-specific. | Copy bodies, swap the dispatch sentence for DSH's mechanism (§7.2). |
| `artifact-graph/instruction-loader` XML shape | Consumed by downstream tooling/tests; cheap to keep. | Port tag names and escaping rules exactly if any existing artifact schema is reused. |

## 7.2 Replace (harness-specific — do not port)

| Item | Why it must be replaced |
|---|---|
| `~/.config/opencode/{agents,skills,AGENTS.md,opencode.jsonc}` deployment | opencode-only paths, `permission:` map semantics, `mode: primary/subagent`, `external_directory`, `default_agent`. DSH has none of these. |
| `~/.claude/{agents,skills,CLAUDE.md,settings.json}` deployment + `agent: 'feel'` / `permissions.defaultMode: 'auto'` injection | Claude Code-only. The `tools:` allowlist + `effort`/`color` frontmatter are Claude conventions. |
| opencode `permission:` blocks as the read-only enforcement mechanism | Replace with DSH's tool allowlisting (per-agent tool set / policy). Keep the *intent table* (§3.4.2) as the source of truth and map it to DSH tools. |
| Nested `task` dispatch / Claude `Task`+`spawnDepth` | Replace with DSH `subagent` / `subagent_fork` (or `workflow` for fan-out). Keep the `[HANDOFF: agent_name]` marker contract, since it is transport-neutral and is parsed by the *caller*. |
| `skill("openfeel-x")` / `Skill` tool loading | DSH loads skills through its own `skill` tool + catalog; the `{skills}/{name}/SKILL.md` layout can still be mirrored if the DSH loader supports it, otherwise map 1:1 to DSH skill entries. |
| Adapter docs (`ADAPTER.{lang}.md`), Base64 template inlining, `build.js` dual-generation into `template-loader.ts` **and** `update.ts` | Build-time inlining exists only because the published npm package must ship templates inside TS constants. A DSH plugin can read `.md` assets at runtime — drop the generator, but keep a key-set/content validator if you keep multiple harness copies. |
| Global path module, `deployment-check.ts` 4-state drift check, `claude-settings.ts` | Replace with DSH equivalents (plugin install/update, profile-level assets). Keep the *semantics*: 4-state read-only check, non-blocking warning, user-key preservation. |
| `openfeel-check-kb` §5 semantic fallback + `openfeel-search-kb` | Reference non-existent `scripts/build_kb_index.py` / `scripts/search_kb.py` and `.openfeel/tmp/vectors/index.json`. Replace with a real DSH capability (embedding index or tool-based search) or delete the step. |
| `openfeel-model-config` / `model-check` / `agent-model-check` provider specifics (`auth.json`, `opencode.jsonc` model resolution, Claude `/model`, gateway aliases) | Provider plumbing is harness-owned. Keep the *generic* guidance (frontmatter beats config; multimodal agents need a vision model) and rewrite the concrete commands. |

## 7.3 Divergences a DSH port should fix (and record)

1. **Two header regexes** (strict in list/search, tolerant in dedup) — unify on the tolerant one, and normalize CRLF in *all* KB read paths (the `L8` defect).
2. **`index.md` `最近更新` columns** — the shipped template is `| 日期 | 分类 | 标题 |` but the real repo file is `| 日期 | 操作 | 描述 |`, so `knowledge index` prints empty category/title. Pick one canonical schema and validate it in `add`.
3. **No relevance ranking in `knowledge search`** — substring + file order only. Consider ranking, but keep `--limit/--offset` semantics and the `**highlight**` output marker if scripts depend on them.
4. **CJK tokenization in dedup** — sentence-level tokens make `> 0.8` almost all-or-nothing for Chinese entries.
5. **Stale counts in comments/docs** (`9 agent`, `18 skill`) — the real numbers are 10 and 22; assert counts from the data, never from literals.
6. **Duplicated dispatch constants** — `AGENT_TEMPLATES` and `OPENCODE_AGENT_TEMPLATES` currently hold the same 10 agents in the same format; a port should have exactly one registry per harness.
7. **`external_directory` has no Claude equivalent** and is deliberately unsimulated — carry that note forward rather than inventing a fake permission.

---

## Appendix A — Quick-reference constants

```ts
CATEGORIES = ['architecture','patterns','troubleshooting','setup']
CATEGORY_TITLES = { architecture:'架构决策', patterns:'代码模式',
                    troubleshooting:'常见问题', setup:'环境搭建' }
KB entry header   = /^## (\[[+-]\]) (.+?) \((\d{4}-\d{2}-\d{2})\)$/gm   // strict
                    /^##\s+\[([+-])\]\s+(.+?)\s+\((\d{4}-\d{2}-\d{2})\)$/ // dedup
KB add chunk      = "\n## [+] {title} ({YYYY-MM-DD})\n\n{content}\n"
KB title sanitize = title.replace(/\|/g,'\\|').replace(/\s*[\r\n]+\s*/g,' ').trim()
KB index row      = "| {date} | {category} | {title} |"
SIMILARITY_THRESHOLD = 0.8                       // > (strict)
entry merge block = "\n\n> **更新于 {YYYY-MM-DD}**：{newContent}"
markers.markdown  = { begin:'<!-- openfeel:begin -->', end:'<!-- openfeel:end -->' }
markers.gitignore = { begin:'# openfeel:begin',        end:'# openfeel:end' }
wrapRegion(x)     = "{begin}\n{x.trim()}\n{end}\n"
USER_SOVEREIGN_KEYS = ['model']
projectLockPath(p,n) = {p}/.openfeel/tmp/locks/{n}.lock
globalLockPath(n)    = ~/.openfeel/locks/{n}.lock
```

## Appendix B — Counts

| Thing | Count |
|---|---|
| KB categories | 4 (fixed) |
| KB files per project | 5 (`index.md` + 4 categories) |
| `knowledge` subcommands | 5 (`list`, `add`, `search`, `index`, `dedup`) |
| Skills | 22 (one shared text, deployed to both harnesses) |
| Agents | 10 (`feel` + `openfeel-{planner,schemer,executor,reviewer,feel-tester,archiver,explorer,utility,vision}`) |
| Agent source files | 40 (10 × 2 harnesses × 2 languages) |
| Constraint files | 4 (`agents-md` ×2, `claude/constraint` ×2) + 2 adapter docs |
| Pipeline phases | 15 (+ 3 meta phases) |
| Workflow modes | 3 (`full`, `fast`, `general`) |
| Review tiers | 3 (`full`, `lean`, `skip`) |
| Update-info kinds | 3 (`appended`, `anomaly`, `backed`) |
| Managed-region states | 3 (`ok`, `none`, `malformed`) |
| Deploy-check states | 4 (`ok`, `mismatch`, `missing`, `unknown`) |
