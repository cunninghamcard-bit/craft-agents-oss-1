# Design: Skill 自主触发 + 全局业务指令(AGENTS.md)

- 日期: 2026-06-08
- 状态: 设计待评审
- 关联: `2026-06-05-search-answer-quality-optimizations.md` 中刻意留空的 **C1(skill 自动触发)**

## 1. 问题

部署的飞书 / Lark bot 里,终端用户发自然语言消息,**skill 永远不会被触发**。逐行核对的链路真相:

- 飞书入站消息 `lark/index.ts:626` 只剥 `@` 前缀 → `router.ts:96` 用 `undefined` options 调 `sendMessage` → 纯文本透传。
- Skill 只能两种方式挂上:webui 用户手打 `[skill:slug]`(变 badge),或 automation 配置 `@skillSlug`(走 `options.skillSlugs`)。飞书路径两者都没有。
- **模型从头到尾看不到任何 skill 清单 / 描述**(`metadata.description` 仅用于 UI 列表和校验)。
- 原生 Claude SDK `Skill` 工具被显式禁用(`claude-agent.ts:869`),且线上跑 DeepSeek(pi-agent),原生 Skill 工具本就不存在。

**关键判断**:模型其实**能**读 skill——它有 `Read` 工具,现有 `[skill:slug]` 流程(`system.ts:501`)就是让模型"Read 解析出的 SKILL.md 路径"。Claude 和 DeepSeek 都有 Read。**唯一缺的是把 skill 清单注入到模型能看到的地方**。

因此不需要新工具,不需要分类器,不需要改两个 backend 的工具装配。只需把目录注入系统提示,复用既有 Read。

## 2. 核心判断

✅ **值得做**:这是 C1,补齐唯一缺口(目录注入),让飞书 bot 能按用户意图自主用 skill。

**消除的特殊情况**:现在"飞书无 skill / webui 靠手打 / automation 靠配置"三条分叉,收敛为"模型看目录 → Read SKILL.md → 执行"一条主路径;旧的两条快捷路径原样保留为 UX 入口。

**最大破坏风险**:几乎为零——不新增工具、不碰 `prerequisite-manager`、不碰 backend 工具装配,只在系统提示里加一个块、改一段说明文字。

## 3. 数据模型(不变)

复用 `loadAllSkills(workspaceRoot, projectRoot?)`,返回 `LoadedSkill { slug, metadata: {name, description, icon}, content, path }`,三层(global / workspace / project)。`path` 是 skill 目录,SKILL.md = `join(path, 'SKILL.md')`。不新增任何数据结构。

## 4. 实现工作线

### WS1 — 技能目录注入(唯一的核心代码改动)

**沿用现有 `<project_context_files>` 范本**:`## Project Context` 散文(`system.ts:509-513`)只**解释**块的存在与用法,真正的数据块由 `getSystemPrompt` 调 `getProjectContextFilesPrompt(workingDirectory)` 生成并拼到 `fullPrompt` 末尾(`system.ts:365`、`375`)。`<available_skills>` 照抄此模式。

**为何不放进 `getCraftAssistantPrompt`**:该函数只有 `workspaceRootPath`,拿不到 `workingDirectory`,会漏掉 **project 层** skill。`getSystemPrompt` 两者都有,且 `loadAllSkills(workspaceRoot, projectRoot?)` 三层全覆盖。

**三处改动(均在 `packages/shared/src/prompts/system.ts`)**:

① 新增 builder(紧邻 `getProjectContextFilesPrompt`):

```ts
function getAvailableSkillsPrompt(workspaceRootPath?: string, workingDirectory?: string): string {
  if (!workspaceRootPath) return '';
  const skills = loadAllSkills(workspaceRootPath, workingDirectory);
  if (skills.length === 0) return '';
  const lines = skills.map(s =>
    `- ${s.slug} — ${s.metadata.name}: ${s.metadata.description}\n  路径: ${join(s.path, 'SKILL.md')}`
  );
  return `\n\n<available_skills>\n${lines.join('\n')}\n</available_skills>`;
}
```

② `getSystemPrompt` 拼接(`system.ts:365`/`375` 旁):

```ts
const availableSkills = getAvailableSkillsPrompt(workspaceRootPath, workingDirectory);
const fullPrompt = `${basePrompt}${preferences}${debugContext}${availableSkills}${projectContextFiles}`;
```

③ 改写 `## Skills` 散文(`system.ts:495-507`):

> `<available_skills>` 列出当前可用 skill 及其用途和 SKILL.md 路径。**当用户意图匹配某个 skill 时,用 Read 读它的 SKILL.md 路径,再照其中指令执行**。`[skill:slug]` 仅为 UI / automation 预挂的快捷写法。

- 数据源 `loadAllSkills`,空目录整块省略;description 不截断(skill 数量有限,未来过多再加上限)。
- skills 会话内稳定 + `loadAllSkills` 已有 5min 缓存;与 `projectContextFiles` 一样拼进系统提示,会话内不破坏 prompt 缓存。

**不改动**:`use_skill` 工具(不新增)、`prerequisite-manager`、`base-agent.ts` 的 mention 解析、两个 backend 的工具装配。

### WS3 — 技能描述重写 + 写作规范

目录注入后,`description` 成为模型唯一的触发依据。

- 重写 `build-skills/*/SKILL.md` 全部 description(procurement-* 全套 + guizang-ppt),改成**触发导向**结构:
  1. 一句话"干什么";
  2. 明确"何时用"——具体触发词 / 场景;
  3. 与同类 skill 的**区分**(避免 procurement-* 互相混淆);
  4. 必要时"不适用于…"反向边界。
- 新增 `build-skills/SKILL-DESCRIPTION-GUIDE.md`:沉淀上述写作规范,以后新 skill 照此写。
- 参照风格:Claude Code 内置 skill 的 description("Use when …, covers …, not for …")。

### WS4 — 全局业务 AGENTS.md

**位置**:`packages/shared/src/prompts/system.ts`,`getSystemPrompt(...)`。

- 内嵌固定路径 `<CONFIG_DIR>/AGENTS.md`(经现有 `CONFIG_DIR` 解析,即 `~/.craft-agent/AGENTS.md`)的**正文**,存在才注入,受 `MAX_CONTEXT_FILE_SIZE` 截断,块标 `scope="global"` 排在最前。
- 复用现有 `readProjectContextFile` 同款读取/截断逻辑(直接读文件,而非 working-dir glob 列路径——因为全局文件在 working dir 之外,列路径模型读不到)。
- 与现有 working-dir 的 `<project_context_files>` 机制并存,不冲突。运营改业务指令只动这一个文件,免改代码、免重部署。

## 5. 数据流

```
飞书消息(纯文本)
  → SessionManager.sendMessage
  → getSystemPrompt(workspaceRootPath, ...)
      ├─ <available_skills> 目录(WS1,来自 loadAllSkills)
      └─ <project_context_files scope="global"> = ~/.craft-agent/AGENTS.md 正文(WS4)
  → 模型读系统提示,判断意图匹配某 skill
  → 模型用 Read 读该 skill 的 SKILL.md 绝对路径(既有工具)
  → 模型照 SKILL.md 指令执行
```

## 6. 错误处理 / 边界

- `loadAllSkills` 抛错或为空:`<available_skills>` 块省略,系统提示其余照常。
- `~/.craft-agent/AGENTS.md` 不存在:WS4 块省略。
- 模型读了错误路径:Read 自然报错,模型可重试——与现有 `[skill:slug]` 流程行为一致。
- 旧的 `[skill:slug]` + prerequisite 强制 Read 路径:**完全不动**,webui / automation 行为零变化。

## 7. 测试

- `system.ts` 单测:有 skill 时 `<available_skills>` 含 slug/name/description/path;无 skill 时整块缺席;`~/.craft-agent/AGENTS.md` 存在/不存在两种情形下 WS4 块的有无与截断。
- 复用现有 `print-system-prompt.ts` 做快照核对。
- 描述重写:`skill_validate` 对每个改动的 SKILL.md 仍通过(name/description 非空、frontmatter 合法)。
- 手动验证:飞书发一条匹配某 skill 意图的自然语言消息,确认模型自主 Read 了对应 SKILL.md 并执行。

## 8. 非目标(本次不做)

- 不做路由层分类器、不做模型输出 `[skill:slug]` 解析、不新增 `use_skill` 工具。
- 不改 webui / automation 既有 skill 挂载路径。
- 不做 skill 使用统计 / 排序 / 召回评测(可另起)。
