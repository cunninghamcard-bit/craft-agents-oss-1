# Skill 自主触发 + 全局业务指令 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让部署的飞书/DeepSeek bot 能按用户自然语言意图自主选用 skill,并支持一份全局业务指令文件被所有 workspace 加载。

**Architecture:** 唯一缺口是"skill 清单没注入系统提示"。在 `getSystemPrompt` 里新增 `<available_skills>` 数据块(沿用既有 `<project_context_files>` 模式),让模型复用现成的 `Read` 工具自主读取并执行 SKILL.md;再内嵌 `~/.craft-agent/AGENTS.md` 正文做全局业务指令;最后把各 skill 的 description 重写成触发导向。不新增工具、不碰 backend 装配、不碰 prerequisite-manager。

**Tech Stack:** TypeScript (Bun 运行/测试),`bun:test`。所有改动集中在 `packages/shared/src/prompts/system.ts` 与 `build-skills/*/SKILL.md`。

参考设计:`docs/superpowers/specs/2026-06-08-skill-auto-trigger-and-global-agents-md-design.md`

---

## File Structure

- `packages/shared/src/prompts/system.ts` — 新增两个纯格式化函数 + 两个加载函数,改 `getSystemPrompt` 拼接,改 `## Skills` / `## Project Context` 散文。
- `packages/shared/src/prompts/__tests__/system.test.ts` — 追加纯函数与集成断言。
- `build-skills/*/SKILL.md` — 重写 description(7 个 skill 中 6 个采购系列重写,guizang 已达标不动)。
- `build-skills/SKILL-DESCRIPTION-GUIDE.md` — 新增描述写作规范。

**运行测试**:`cd packages/shared && bun test src/prompts/__tests__/system.test.ts`
**类型检查**:`cd packages/shared && bun run tsc --noEmit`

> 注:`build-skills/` 是仓库内 skill 源。线上 workspace 实际从 `~/.craft-agent/workspaces/{id}/skills/` 读取,源→部署的同步是另一条独立链路,不在本计划范围。

---

## Task 1: `<available_skills>` 纯格式化函数

把"格式化"与"读盘"分离 —— 纯函数可零 IO 确定性测试。

**Files:**
- Modify: `packages/shared/src/prompts/system.ts`(新增 `formatAvailableSkillsBlock`)
- Test: `packages/shared/src/prompts/__tests__/system.test.ts`

- [ ] **Step 1: Write the failing test**

**导入说明**:文件顶部已有 `import { describe, it, expect, mock, beforeEach } from 'bun:test'` 与 `import { getSystemPrompt } from '../system'`。**不要重复导入这些**。只需在现有 `'../system'` 导入里追加新符号,并新增 types 导入。即把顶部 `import { getSystemPrompt } from '../system'` 改为 `import { getSystemPrompt, formatAvailableSkillsBlock } from '../system'`,并加一行 `import type { LoadedSkill } from '../../skills/types.ts'`。然后在文件末尾追加测试体:

```typescript
function fakeSkill(slug: string, name: string, description: string, path: string): LoadedSkill {
  return { slug, metadata: { name, description }, content: '', path, source: 'workspace' }
}

describe('formatAvailableSkillsBlock', () => {
  it('returns empty string when no skills', () => {
    expect(formatAvailableSkillsBlock([])).toBe('')
  })

  it('lists slug, name, description and SKILL.md path', () => {
    const block = formatAvailableSkillsBlock([
      fakeSkill('procurement-platform-search', '采购平台报价线索查找', '在平台查报价', '/ws/skills/procurement-platform-search'),
    ])
    expect(block).toContain('<available_skills>')
    expect(block).toContain('</available_skills>')
    expect(block).toContain('procurement-platform-search')
    expect(block).toContain('采购平台报价线索查找')
    expect(block).toContain('在平台查报价')
    expect(block).toContain('/ws/skills/procurement-platform-search/SKILL.md')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && bun test src/prompts/__tests__/system.test.ts -t formatAvailableSkillsBlock`
Expected: FAIL —  `formatAvailableSkillsBlock` is not exported / not a function.

- [ ] **Step 3: Write minimal implementation**

在 `system.ts` 顶部 import 区追加:

```typescript
import { loadAllSkills } from '../skills/storage.ts';
import type { LoadedSkill } from '../skills/types.ts';
```

在 `getProjectContextFilesPrompt` 函数**之前**新增:

```typescript
/**
 * Format the <available_skills> block from a list of loaded skills.
 * Pure (no IO) so it is deterministically testable.
 * Each line carries the slug, human name, description, and absolute SKILL.md path
 * so the model can Read it directly when a request matches the skill's purpose.
 */
export function formatAvailableSkillsBlock(skills: LoadedSkill[]): string {
  if (skills.length === 0) return '';
  const lines = skills
    .map(
      (s) =>
        `- ${s.slug} — ${s.metadata.name}: ${s.metadata.description}\n  Path: ${join(s.path, 'SKILL.md')}`
    )
    .join('\n');
  return `\n\n<available_skills>\n${lines}\n</available_skills>`;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && bun test src/prompts/__tests__/system.test.ts -t formatAvailableSkillsBlock`
Expected: PASS (2 tests).

- [ ] **Step 5: Commit**

```bash
git add packages/shared/src/prompts/system.ts packages/shared/src/prompts/__tests__/system.test.ts
git commit -m "feat(prompt): add formatAvailableSkillsBlock pure formatter"
```

---

## Task 2: 加载器 `getAvailableSkillsPrompt` + 接入 `getSystemPrompt` + 改写 `## Skills` 散文

**Files:**
- Modify: `packages/shared/src/prompts/system.ts`
- Test: `packages/shared/src/prompts/__tests__/system.test.ts`

- [ ] **Step 1: Write the failing test**

**导入说明**:把 `'../system'` 导入再补上 `getAvailableSkillsPrompt`(变成 `import { getSystemPrompt, formatAvailableSkillsBlock, getAvailableSkillsPrompt } from '../system'`);文件顶部新增 fs/os/path 导入(若已存在则跳过):`import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'`、`import { tmpdir } from 'os'`、`import { join as pathJoin } from 'path'`。然后追加测试体:

```typescript
function makeWorkspaceWithSkill(slug: string, description: string): string {
  const ws = mkdtempSync(pathJoin(tmpdir(), 'craft-ws-'))
  const dir = pathJoin(ws, 'skills', slug)
  mkdirSync(dir, { recursive: true })
  writeFileSync(
    pathJoin(dir, 'SKILL.md'),
    `---\nname: ${slug} 名称\ndescription: ${description}\n---\n\n正文指令。\n`
  )
  return ws
}

describe('getAvailableSkillsPrompt / getSystemPrompt skills injection', () => {
  it('returns empty when no workspace path', () => {
    expect(getAvailableSkillsPrompt(undefined, undefined)).toBe('')
  })

  it('injects workspace skills into the catalog', () => {
    const ws = makeWorkspaceWithSkill('demo-skill', '当用户要演示时使用')
    const block = getAvailableSkillsPrompt(ws, undefined)
    expect(block).toContain('<available_skills>')
    expect(block).toContain('demo-skill')
    expect(block).toContain('当用户要演示时使用')
  })

  it('getSystemPrompt embeds the catalog and the autonomous-use guidance', () => {
    const ws = makeWorkspaceWithSkill('demo-skill', '当用户要演示时使用')
    const prompt = getSystemPrompt(undefined, undefined, ws, ws)
    expect(prompt).toContain('<available_skills>')
    expect(prompt).toContain('demo-skill')
    // 散文层应说明"匹配意图 → Read SKILL.md → 执行"
    expect(prompt).toContain('When a user')
    expect(prompt).toContain('Read')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && bun test src/prompts/__tests__/system.test.ts -t "skills injection"`
Expected: FAIL — `getAvailableSkillsPrompt` not exported.

- [ ] **Step 3: Write minimal implementation**

(a) 在 `formatAvailableSkillsBlock` 之后新增加载器:

```typescript
/**
 * Build the <available_skills> block by loading all skills visible to this
 * workspace (global + workspace + project tiers). Returns '' when there is no
 * workspace path or no skills. Mirrors the getProjectContextFilesPrompt pattern.
 */
export function getAvailableSkillsPrompt(
  workspaceRootPath?: string,
  workingDirectory?: string
): string {
  if (!workspaceRootPath) return '';
  const skills = loadAllSkills(workspaceRootPath, workingDirectory);
  return formatAvailableSkillsBlock(skills);
}
```

(b) 在 `getSystemPrompt` 里(紧接 `const projectContextFiles = getProjectContextFilesPrompt(workingDirectory);` 之后)新增并改拼接:

```typescript
  const availableSkills = getAvailableSkillsPrompt(workspaceRootPath, workingDirectory);
```

把:
```typescript
  const fullPrompt = `${basePrompt}${preferences}${debugContext}${projectContextFiles}`;
```
改为:
```typescript
  const fullPrompt = `${basePrompt}${preferences}${debugContext}${availableSkills}${projectContextFiles}`;
```

(c) 改写 `## Skills` 散文(当前 `system.ts` 内 `## Skills` 到 Project 三层路径那段),替换为:

```
## Skills

Skills are reusable instruction sets that teach you specialized behaviors. The skills available right now are listed in \`<available_skills>\`, each with its purpose and the absolute path to its \`SKILL.md\`.

**When a user's request matches a skill's described purpose:**
1. Read that skill's \`SKILL.md\` at the listed path using the Read tool (or \`cat\` via Bash)
2. Follow its instructions to complete the request

\`[skill:slug]\` is only a shortcut the UI / automations use to pre-attach a skill (when present, its \`SKILL.md\` is force-read before other tools). You do NOT need that syntax — match by purpose and Read the file yourself.

Skills are stored at three levels (checked in order):
- Global: \`~/.agents/skills/{slug}/SKILL.md\`
- Workspace: \`${workspacePath}/skills/{slug}/SKILL.md\`
- Project: \`{projectRoot}/.agents/skills/{slug}/SKILL.md\`
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && bun test src/prompts/__tests__/system.test.ts -t "skills injection"`
Expected: PASS (3 tests). 然后跑全文件确认无回归:
`cd packages/shared && bun test src/prompts/__tests__/system.test.ts`
Expected: 全绿。

- [ ] **Step 5: Type check**

Run: `cd packages/shared && bun run tsc --noEmit`
Expected: 无报错(确认 import 无循环、类型正确)。

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/prompts/system.ts packages/shared/src/prompts/__tests__/system.test.ts
git commit -m "feat(prompt): inject <available_skills> catalog for autonomous skill use"
```

---

## Task 3: 全局 AGENTS.md(`~/.craft-agent/AGENTS.md` 内嵌)

**Files:**
- Modify: `packages/shared/src/prompts/system.ts`(新增 `formatGlobalAgentsBlock` + `getGlobalAgentsPrompt`,接入 `getSystemPrompt`,改 `## Project Context` 散文)
- Test: `packages/shared/src/prompts/__tests__/system.test.ts`

- [ ] **Step 1: Write the failing test**

**导入说明**:把 `'../system'` 导入再补上 `formatGlobalAgentsBlock, getGlobalAgentsPrompt`。`mkdtempSync/writeFileSync/tmpdir/pathJoin` 已在 Task 2 引入,复用即可。追加测试体:

```typescript
describe('global AGENTS.md injection', () => {
  it('formatGlobalAgentsBlock returns empty for null/empty content', () => {
    expect(formatGlobalAgentsBlock(null)).toBe('')
    expect(formatGlobalAgentsBlock('')).toBe('')
  })

  it('formatGlobalAgentsBlock wraps content in a tagged block', () => {
    const block = formatGlobalAgentsBlock('业务规则:先识别型号')
    expect(block).toContain('<global_instructions')
    expect(block).toContain('业务规则:先识别型号')
  })

  it('formatGlobalAgentsBlock truncates oversized content', () => {
    const big = 'x'.repeat(11 * 1024)
    const block = formatGlobalAgentsBlock(big)
    expect(block).toContain('... (truncated)')
    expect(block.length).toBeLessThan(big.length)
  })

  it('getGlobalAgentsPrompt reads AGENTS.md from the given config dir', () => {
    const dir = mkdtempSync(pathJoin(tmpdir(), 'craft-cfg-'))
    writeFileSync(pathJoin(dir, 'AGENTS.md'), '全局采购指令')
    expect(getGlobalAgentsPrompt(dir)).toContain('全局采购指令')
  })

  it('getGlobalAgentsPrompt returns empty when AGENTS.md absent', () => {
    const dir = mkdtempSync(pathJoin(tmpdir(), 'craft-cfg-'))
    expect(getGlobalAgentsPrompt(dir)).toBe('')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd packages/shared && bun test src/prompts/__tests__/system.test.ts -t "global AGENTS"`
Expected: FAIL — functions not exported.

- [ ] **Step 3: Write minimal implementation**

(a) import 区追加:
```typescript
import { CONFIG_DIR } from '../config/paths.ts';
```

(b) 新增(放在 `getAvailableSkillsPrompt` 之后):
```typescript
/**
 * Format an inline <global_instructions> block from raw AGENTS.md content.
 * Pure; truncates to MAX_CONTEXT_FILE_SIZE. Returns '' for null/empty content.
 */
export function formatGlobalAgentsBlock(content: string | null): string {
  if (!content || content.trim().length === 0) return '';
  const body =
    content.length > MAX_CONTEXT_FILE_SIZE
      ? content.slice(0, MAX_CONTEXT_FILE_SIZE) + '\n\n... (truncated)'
      : content;
  return `\n\n<global_instructions source="~/.craft-agent/AGENTS.md">\n${body}\n</global_instructions>`;
}

/**
 * Load the workspace-wide AGENTS.md from the config dir (default CONFIG_DIR,
 * i.e. ~/.craft-agent or $CRAFT_CONFIG_DIR). Embedded inline so it applies to
 * every workspace regardless of working directory. Returns '' when absent.
 * configDir is a parameter so tests can point it at a temp dir.
 */
export function getGlobalAgentsPrompt(configDir: string = CONFIG_DIR): string {
  const path = join(configDir, 'AGENTS.md');
  if (!existsSync(path)) return '';
  try {
    return formatGlobalAgentsBlock(readFileSync(path, 'utf-8'));
  } catch {
    return '';
  }
}
```

(c) 在 `getSystemPrompt` 里新增并接入拼接(排在 skills 之前,作为高优先级业务指令):
```typescript
  const globalAgents = getGlobalAgentsPrompt();
```
拼接改为:
```typescript
  const fullPrompt = `${basePrompt}${preferences}${debugContext}${globalAgents}${availableSkills}${projectContextFiles}`;
```

(d) 在 `## Project Context` 散文里补一句(在解释 `<project_context_files>` 之后):
```
A workspace-wide `<global_instructions>` block (sourced from `~/.craft-agent/AGENTS.md`) may also appear — treat it as always-on business guidance that applies across every workspace.
```

- [ ] **Step 4: Run test to verify it passes**

Run: `cd packages/shared && bun test src/prompts/__tests__/system.test.ts -t "global AGENTS"`
Expected: PASS (5 tests). 全文件回归:
`cd packages/shared && bun test src/prompts/__tests__/system.test.ts` → 全绿。

- [ ] **Step 5: Type check**

Run: `cd packages/shared && bun run tsc --noEmit`
Expected: 无报错。

- [ ] **Step 6: Commit**

```bash
git add packages/shared/src/prompts/system.ts packages/shared/src/prompts/__tests__/system.test.ts
git commit -m "feat(prompt): embed workspace-wide ~/.craft-agent/AGENTS.md as <global_instructions>"
```

---

## Task 4: 重写采购系列 skill 描述 + 写作规范

description 现在是模型唯一的触发依据。改成"做什么 + 何时用(具体触发词) + 与同类区分"。guizang-ppt-skill 已达标,不动。

**Files:**
- Modify: `build-skills/procurement-model-info-search/SKILL.md`
- Modify: `build-skills/procurement-local-inventory-lookup/SKILL.md`
- Modify: `build-skills/procurement-platform-search/SKILL.md`
- Modify: `build-skills/procurement-supplier-shortlist/SKILL.md`
- Modify: `build-skills/procurement-part-mismatch-review/SKILL.md`
- Modify: `build-skills/procurement-feishu-table-fill/SKILL.md`
- Create: `build-skills/SKILL-DESCRIPTION-GUIDE.md`

- [ ] **Step 1: 重写 6 个 description 字段**

只改 frontmatter 的 `description:` 一行(保留 `name`、`short-description`、`lang` 等其它字段不动)。逐个替换为:

`procurement-model-info-search`:
```
description: 采购流程第一步:拿到陌生电子元器件型号(MPN)时,搜公开资料识别它——品牌/厂商、品类、规格、封装、生命周期(在产/停产/EOL)。当用户给出一个或多个不认识的型号,或问"这是什么型号/哪个品牌/什么封装",且后续要查库存/报价/供应商但型号信息还不全时使用。只负责识别;查价格用 procurement-platform-search,查库存用 procurement-local-inventory-lookup。
```

`procurement-local-inventory-lookup`:
```
description: 通过飞书多维表格查本地仓库和供应商库存。当用户问"有没有货/库存还剩多少/这个型号本地有吗/仓库里有没有",或采购流程中需确认某型号当前库存状态时使用。只查内部库存表;查外部平台报价用 procurement-platform-search,查供应商名单用 procurement-supplier-shortlist。
```

`procurement-platform-search`:
```
description: 在采购平台和授权分销商(立创、Digikey、Mouser 等)上查型号的实时报价、可购库存、产品页、datasheet 和可替代料提示。当用户问"多少钱/哪里能买/有没有现货/帮我找报价/找替代料",需要外部市场价格与货源线索时使用。查的是外部平台;内部库存用 procurement-local-inventory-lookup。
```

`procurement-supplier-shortlist`:
```
description: 查飞书 Base 里的供应商档案,按品牌、品类、供应商类型整理出候选名单。当用户问"哪些供应商能供这个/帮我列几家供应商/谁家做这个品类",需要筛选或对比供应商时使用。产出供应商名单,不查具体报价(报价用 procurement-platform-search)。
```

`procurement-part-mismatch-review`:
```
description: 当采购需求型号与供应商报价型号不一致时,基于公开网页资料判断二者能否互相替代、差异是否影响使用,并给出证据。当用户同时给出"需求型号"和"报价型号"且两者不同(后缀/封装/批次差异),问"这俩能不能用/有没有区别/能替代吗"时使用。
```

`procurement-feishu-table-fill`:
```
description: 把采购线索或分析结果写入飞书 Base 的 AI 专用表,含建表、字段校验、dry-run 预览和用户确认。当用户说"把结果填进表/写到飞书表格/录入这些数据",需要把前面查到的型号/报价/库存/供应商结果落库时使用。只负责写入;查询类用对应的 procurement-* 查询 skill。
```

- [ ] **Step 2: 创建写作规范**

写 `build-skills/SKILL-DESCRIPTION-GUIDE.md`:

```markdown
# SKILL.md description 写作规范

`description` 是模型决定"该不该用这个 skill"的**唯一依据**——它会被注入系统提示的 `<available_skills>` 目录。写不好,skill 就不会被触发。

## 四要素(按此顺序写成一段)

1. **做什么**:一句话能力概述。
2. **何时用**:列出具体触发词 / 用户会怎么问("当用户问'…/…'时使用")。越贴近真实说法越好。
3. **与同类区分**:点名容易混淆的兄弟 skill,说明边界("查 X 用 this;查 Y 用 that-skill")。
4. **反向边界(可选)**:明确"不负责…"。

## 反例 → 正例

- ❌ "在采购平台上查找型号线索。当需要平台报价线索时使用。"(太抽象,触发词模糊,不区分兄弟)
- ✅ 见 `procurement-platform-search/SKILL.md` 的 description。

## 约束

- 保持 `name`、`short-description`、`lang` 等其它 frontmatter 字段不变。
- 触发词用用户母语(本项目采购系列用中文)。
- 一段话,别堆段落;够模型判断即可。
```

- [ ] **Step 3: 校验 frontmatter 仍合法**

逐个确认 frontmatter 仍能被 `gray-matter` 解析且 `name`/`description` 非空。最省事:

Run:
```bash
cd /home/cunningham/Projects/craft-agents-oss
for f in build-skills/procurement-*/SKILL.md; do echo "== $f =="; head -6 "$f"; done
```
Expected: 每个文件 `description:` 为新文案,`name:` 与其它字段保留,`---` 分隔完好。

- [ ] **Step 4: Commit**

```bash
git add build-skills/procurement-*/SKILL.md build-skills/SKILL-DESCRIPTION-GUIDE.md
git commit -m "docs(skills): rewrite procurement skill descriptions for trigger clarity + add guide"
```

---

## Self-Review

- **Spec 覆盖**:WS1 → Task 1+2;WS3 → Task 4;WS4 → Task 3。三条工作线全覆盖。设计中"不新增 use_skill 工具 / 不碰 prerequisite / 不碰 backend 装配"在所有 task 中均未触碰这些文件 ✓。
- **Placeholder 扫描**:无 TBD/TODO;每个改代码的 step 都给了完整代码与新文案 ✓。
- **类型一致**:`formatAvailableSkillsBlock(LoadedSkill[])`、`getAvailableSkillsPrompt(string?,string?)`、`formatGlobalAgentsBlock(string|null)`、`getGlobalAgentsPrompt(string=CONFIG_DIR)` 在测试与实现中签名一致;`LoadedSkill` 形状(`slug`/`metadata.name`/`metadata.description`/`path`/`source`)与 `skills/types.ts` 一致 ✓。
- **散文断言对齐**:Task 2 测试断言 `'When a user'` 与 `'Read'`,与 Step 3(c) 改写文案一致 ✓。

## 风险与回滚

- 系统提示变长:`<available_skills>` 随 skill 数线性增长,当前 7 个无忧;若未来 skill 暴增再加上限。
- prompt 缓存:新块与 `projectContextFiles` 同级,会话内稳定,不破坏缓存。
- 回滚:三次 commit 各自独立,可单独 revert。
