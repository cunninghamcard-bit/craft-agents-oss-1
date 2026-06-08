import { describe, it, expect, mock, beforeEach } from 'bun:test'

// Stub the preferences module so we can toggle `getCoAuthorPreference` per test
// without touching disk. `formatPreferencesForPrompt` is stubbed to '' because
// it's unrelated to the behavior under test here.
let mockIncludeCoAuthoredBy = true
mock.module('../../config/preferences.ts', () => ({
  getCoAuthorPreference: () => mockIncludeCoAuthoredBy,
  formatPreferencesForPrompt: () => '',
}))

import { getSystemPrompt, formatAvailableSkillsBlock, getAvailableSkillsPrompt } from '../system'
import type { LoadedSkill } from '../../skills/types.ts'
import { mkdtempSync, mkdirSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join as pathJoin } from 'path'

const GIT_CONVENTIONS_HEADING = '## Git Conventions'
const CO_AUTHOR_TRAILER = 'Co-Authored-By: Craft Agent <agents-noreply@craft.do>'

describe('system prompt guidance', () => {
  it('uses backend-neutral debug log querying guidance (rg/grep via Bash)', () => {
    const prompt = getSystemPrompt(
      undefined,
      { enabled: true, logFilePath: '/tmp/main.log' },
      '/tmp/workspace',
      '/tmp/workspace'
    )

    expect(prompt).toContain('Use Bash with `rg`/`grep` to search logs efficiently:')
    expect(prompt).toContain('rg -n "session" "/tmp/main.log"')
    expect(prompt).not.toContain('Use the Grep tool (if available)')
    expect(prompt).not.toContain('Grep pattern=')
  })

  it('does not mention Grep in call_llm tool-dependency guidance', () => {
    const prompt = getSystemPrompt(undefined, undefined, '/tmp/workspace', '/tmp/workspace')

    expect(prompt).toContain('The subtask needs file/shell tools (for example, Read or Bash)')
    expect(prompt).not.toContain('The subtask needs tools (Read, Bash, Grep)')
  })
})

describe('includeCoAuthoredBy handling', () => {
  beforeEach(() => {
    mockIncludeCoAuthoredBy = true
  })

  it('includes the Git Conventions block when the arg is explicitly true', () => {
    const prompt = getSystemPrompt(
      undefined,
      undefined,
      '/tmp/workspace',
      '/tmp/workspace',
      undefined,
      undefined,
      true
    )

    expect(prompt).toContain(GIT_CONVENTIONS_HEADING)
    expect(prompt).toContain(CO_AUTHOR_TRAILER)
  })

  it('omits the Git Conventions block when the arg is explicitly false', () => {
    const prompt = getSystemPrompt(
      undefined,
      undefined,
      '/tmp/workspace',
      '/tmp/workspace',
      undefined,
      undefined,
      false
    )

    expect(prompt).not.toContain(GIT_CONVENTIONS_HEADING)
    expect(prompt).not.toContain(CO_AUTHOR_TRAILER)
  })

  // Regression test for #576: Pi-backed sessions called getSystemPrompt without
  // the 7th arg, and the function silently defaulted to `true`, ignoring the
  // user's preference. The defensive fallback in getSystemPrompt should now
  // resolve to getCoAuthorPreference() when the arg is omitted.
  it('falls back to getCoAuthorPreference() when the arg is omitted (#576)', () => {
    mockIncludeCoAuthoredBy = false

    const prompt = getSystemPrompt(
      undefined,
      undefined,
      '/tmp/workspace',
      '/tmp/workspace',
      undefined,
      'Craft Agents Backend'
      // 7th arg omitted — must not regress to `true` default
    )

    expect(prompt).not.toContain(GIT_CONVENTIONS_HEADING)
    expect(prompt).not.toContain(CO_AUTHOR_TRAILER)
  })

  it('falls back to getCoAuthorPreference() === true when the arg is omitted and the user has not opted out', () => {
    mockIncludeCoAuthoredBy = true

    const prompt = getSystemPrompt(
      undefined,
      undefined,
      '/tmp/workspace',
      '/tmp/workspace'
    )

    expect(prompt).toContain(GIT_CONVENTIONS_HEADING)
    expect(prompt).toContain(CO_AUTHOR_TRAILER)
  })
})

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
    expect(prompt).toContain('When a user')
    expect(prompt).toContain('Read')
  })
})
