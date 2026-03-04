#!/usr/bin/env bun
/**
 * @craft-agent/server — standalone headless Craft Agent server.
 *
 * Usage:
 *   CRAFT_SERVER_TOKEN=<secret> bun run packages/server/src/index.ts
 *
 * Environment:
 *   CRAFT_SERVER_TOKEN   — required bearer token for client auth
 *   CRAFT_RPC_HOST       — bind address (default: 127.0.0.1)
 *   CRAFT_RPC_PORT       — bind port (default: 9100)
 *   CRAFT_APP_ROOT       — app root path (default: cwd)
 *   CRAFT_RESOURCES_PATH — resources path (default: cwd/resources)
 *   CRAFT_IS_PACKAGED    — 'true' for production (default: false)
 *   CRAFT_VERSION        — app version (default: 0.0.0-dev)
 *   CRAFT_DEBUG          — 'true' for debug logging
 */

import { join } from 'node:path'
import { startHeadlessServer } from '@craft-agent/server-core/bootstrap'
import { registerCoreRpcHandlers, cleanupSessionFileWatchForClient } from '@craft-agent/server-core/handlers/rpc'
import { SessionManager, setSessionPlatform, setSessionRuntimeHooks } from '@craft-agent/server-core/sessions'
import { initModelRefreshService, setFetcherPlatform } from '@craft-agent/server-core/model-fetchers'
import { setSearchPlatform, setImageProcessor } from '@craft-agent/server-core/services'
import type { HandlerDeps } from '@craft-agent/server-core/handlers'

process.env.CRAFT_IS_PACKAGED ??= 'false'

// In dev (monorepo), bundled assets root is the repo root (4 levels up from this file).
// In packaged mode, use CRAFT_BUNDLED_ASSETS_ROOT env or cwd.
const bundledAssetsRoot = process.env.CRAFT_BUNDLED_ASSETS_ROOT
  ?? join(import.meta.dir, '..', '..', '..', '..')

const instance = await (async () => {
  try {
    return await startHeadlessServer<SessionManager, HandlerDeps>({
      bundledAssetsRoot,
      applyPlatformToSubsystems: (platform) => {
        setFetcherPlatform(platform)
        setSessionPlatform(platform)
        setSessionRuntimeHooks({
          updateBadgeCount: () => {},
          captureException: (error) => {
            const err = error instanceof Error ? error : new Error(String(error))
            platform.captureError?.(err)
          },
        })
        setSearchPlatform(platform)
        setImageProcessor(platform.imageProcessor)
      },
      initModelRefreshService: () => initModelRefreshService(async (slug: string) => {
        const { getCredentialManager } = await import('@craft-agent/shared/credentials')
        const manager = getCredentialManager()
        const [apiKey, oauth] = await Promise.all([
          manager.getLlmApiKey(slug).catch(() => null),
          manager.getLlmOAuth(slug).catch(() => null),
        ])
        return {
          apiKey: apiKey ?? undefined,
          oauthAccessToken: oauth?.accessToken,
          oauthRefreshToken: oauth?.refreshToken,
          oauthIdToken: oauth?.idToken,
        }
      }),
      createSessionManager: () => new SessionManager(),
      createHandlerDeps: ({ sessionManager, platform, oauthFlowStore }) => ({
        sessionManager,
        platform,
        oauthFlowStore,
      }),
      registerAllRpcHandlers: registerCoreRpcHandlers,
      setSessionEventSink: (sessionManager, sink) => {
        sessionManager.setEventSink(sink)
      },
      initializeSessionManager: async (sessionManager) => {
        await sessionManager.initialize()
      },
      cleanupSessionManager: async (sessionManager) => {
        try {
          await sessionManager.flushAllSessions()
        } finally {
          sessionManager.cleanup()
        }
      },
      cleanupClientResources: cleanupSessionFileWatchForClient,
    })
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
})()

console.log(`CRAFT_SERVER_URL=ws://${instance.host}:${instance.port}`)
console.log(`CRAFT_SERVER_TOKEN=${instance.token}`)

const shutdown = async () => {
  await instance.stop()
  process.exit(0)
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
