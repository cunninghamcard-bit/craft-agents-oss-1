import { describe, it, expect } from 'bun:test'
import { RPC_CHANNELS, type BroadcastEventMap } from '../types'

function flattenValues(obj: Record<string, unknown>): string[] {
  return Object.values(obj).flatMap(v =>
    typeof v === 'string' ? [v]
      : typeof v === 'object' && v !== null ? flattenValues(v as Record<string, unknown>)
      : []
  )
}

describe('RPC_CHANNELS web/headless contract', () => {
  it('contains unique wire-format strings', () => {
    const actual = flattenValues(RPC_CHANNELS)
    expect(new Set(actual).size).toBe(actual.length)
  })

  it('keeps the broadcast event map importable', () => {
    const typeCheck: Partial<BroadcastEventMap> = {}
    expect(typeCheck).toEqual({})
  })
})
