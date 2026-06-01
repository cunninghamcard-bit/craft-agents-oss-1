import { describe, it, expect } from 'bun:test'
import type { ActivityItem } from '../../components/chat/TurnCard'
import { extractOverlayCards } from '../tool-parsers'
import type { OverlayData } from '../tool-parsers'

function makeActivity(overrides: Partial<ActivityItem>): ActivityItem {
  return {
    id: 'tool-1',
    type: 'tool',
    status: 'completed',
    timestamp: Date.now(),
    toolName: 'Write',
    toolInput: {},
    content: '',
    ...overrides,
  }
}

describe('extractOverlayCards', () => {
  it('returns output-only card when command is empty', () => {
    const activity = makeActivity({
      toolName: 'Bash',
      toolInput: {},
      content: 'Missing command.',
    })

    const cards = extractOverlayCards(activity)
    // No meaningful input → output only
    expect(cards.length).toBeGreaterThanOrEqual(1)
    expect(cards[cards.length - 1]?.label).toBe('Output')
  })

  it('marks Write markdown output as document card data', () => {
    const activity = makeActivity({
      toolName: 'Write',
      toolInput: {
        path: '/tmp/notes.md',
        content: '# Weekly Notes\n\n- item',
      },
      content: '',
    })

    const cards = extractOverlayCards(activity)
    const output = cards.find(card => card.id === 'output')

    expect(output).toBeDefined()
    expect((output?.data as OverlayData).type).toBe('document')
  })

  it('keeps generic markdown-ish output as generic card data', () => {
    const markdownText = '# Heading\n\nSome paragraph text.'
    const activity = makeActivity({
      toolName: 'Bash',
      toolInput: { command: 'printf "# Heading\\n\\nSome paragraph text."' },
      content: markdownText,
    })

    const cards = extractOverlayCards(activity)
    const output = cards.find(card => card.id === 'output')

    expect(output).toBeDefined()
    expect((output?.data as OverlayData).type).toBe('generic')
    if (output?.data.type === 'generic') {
      expect(output.data.content).toBe(markdownText)
    }
  })
})
