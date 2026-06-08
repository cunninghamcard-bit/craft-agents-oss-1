# SKILL.md description 写作规范

`description` 是模型决定“该不该用这个 skill”的**唯一依据**——craft-agents 会把它注入系统提示的 `<available_skills>` 目录（见 craft-agents-oss `packages/shared/src/prompts/system.ts` 的 `formatAvailableSkillsBlock`）。写不好，skill 就不会被触发。

## 四要素（按此顺序写成一段）

1. **做什么**：一句话能力概述。
2. **何时用**：列出具体触发词 / 用户会怎么问（“当用户问‘…/…’时使用”）。越贴近真实说法越好。
3. **与同类区分**：点名容易混淆的兄弟 skill，说明边界（“查 X 用 this；查 Y 用 that-skill”）。
4. **反向边界（可选）**：明确“不负责…”。

## 反例 → 正例

- ❌ “在采购平台上查找型号线索。当需要平台报价线索时使用。”（太抽象，触发词模糊，不区分兄弟）
- ✅ 见 `procurement-platform-search/SKILL.md` 的 description。

## 约束

- 保持 `name`、`metadata.short-description`、`metadata.lang` 等其它 frontmatter 字段不变。
- 触发词用用户母语（采购系列用中文）。
- 一段话，别堆段落；够模型判断即可。

> 注：此目录是采购 skill 的**源头**，部署时由 craft-agents `scripts/build-and-deploy.sh` rsync 进镜像。不要改 craft-agents-oss 仓库里的 `build-skills/`（那是 gitignored 的临时暂存，每次部署被推倒重建）。
