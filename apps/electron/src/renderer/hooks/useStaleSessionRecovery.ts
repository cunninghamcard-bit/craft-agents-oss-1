/**
 * Stale Session Recovery Watchdog
 *
 * Safety net for edge cases the reconnect replay protocol cannot catch:
 * - Events lost during React useEffect re-registration
 * - Single dropped event without a full WS disconnect
 * - Server crash mid-stream where disconnect is never signaled cleanly
 *
 * Periodically checks for sessions stuck in isProcessing=true with no
 * recent events, and refreshes them from server-persisted state.
 *
 * Uses a generous 120s threshold to avoid false positives on long tool
 * executions (some tools legitimately run for 60+ seconds).
 */

import { useEffect, useRef } from 'react'
import { getDefaultStore } from 'jotai'
import {
  sessionMetaMapAtom,
  extractSessionMeta,
} from '@/atoms/sessions'

type JotaiStore = ReturnType<typeof getDefaultStore>

const STALE_THRESHOLD_MS = 120_000 // 2 minutes — generous to avoid false positives
const CHECK_INTERVAL_MS = 30_000   // Check every 30s

interface UseStaleSessionRecoveryOptions {
  store: JotaiStore
  updateSessionDirect: (sessionId: string, updater: () => any) => void
  clearStreamingState: (sessionId: string) => void
}

/**
 * Tracks the last time any event was received for each session.
 * If a session has isProcessing=true but no events for STALE_THRESHOLD_MS,
 * it is considered stuck and will be refreshed from the server.
 */
export function useStaleSessionRecovery({
  store,
  updateSessionDirect,
  clearStreamingState,
}: UseStaleSessionRecoveryOptions): {
  /** Call this on every received session event to reset the watchdog timer. */
  trackSessionActivity: (sessionId: string) => void
} {
  const lastEventTimestamps = useRef<Map<string, number>>(new Map())

  const trackSessionActivity = (sessionId: string) => {
    lastEventTimestamps.current.set(sessionId, Date.now())
  }

  useEffect(() => {
    const timer = setInterval(async () => {
      const now = Date.now()
      const allMeta = store.get(sessionMetaMapAtom)

      for (const [sessionId, meta] of allMeta) {
        if (!meta.isProcessing) {
          // Not processing — clean up tracking
          lastEventTimestamps.current.delete(sessionId)
          continue
        }

        const lastEvent = lastEventTimestamps.current.get(sessionId)
        if (!lastEvent) {
          // Processing but no tracked event yet — start tracking
          lastEventTimestamps.current.set(sessionId, now)
          continue
        }

        if (now - lastEvent < STALE_THRESHOLD_MS) {
          continue // Still within threshold
        }

        // Stale — refresh from server
        console.warn(`[StaleRecovery] Session ${sessionId} stuck in processing for ${Math.round((now - lastEvent) / 1000)}s — refreshing`)

        try {
          clearStreamingState(sessionId)
          const fresh = await window.electronAPI.getSessionMessages(sessionId)
          if (fresh) {
            updateSessionDirect(sessionId, () => fresh)
            const metaMap = store.get(sessionMetaMapAtom)
            const newMetaMap = new Map(metaMap)
            newMetaMap.set(sessionId, extractSessionMeta(fresh))
            store.set(sessionMetaMapAtom, newMetaMap)
          }
          // Remove from tracking after successful refresh
          lastEventTimestamps.current.delete(sessionId)
        } catch (err) {
          console.error(`[StaleRecovery] Failed to refresh session ${sessionId}:`, err)
        }
      }
    }, CHECK_INTERVAL_MS)

    return () => clearInterval(timer)
  }, [store, updateSessionDirect, clearStreamingState])

  return { trackSessionActivity }
}
