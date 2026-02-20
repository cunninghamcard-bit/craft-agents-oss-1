/**
 * Codex Model Fetcher
 *
 * Fetches available models from the OpenAI Codex app-server via model/list.
 * Part of the centralized ModelRefreshService model discovery system.
 */

import type { ModelFetcher, ModelFetchResult, ModelFetcherCredentials } from '@craft-agent/shared/config'
import type { LlmConnection, ModelDefinition } from '@craft-agent/shared/config'
import { AppServerClient, getCodexPath } from '@craft-agent/shared/codex'
import { getCredentialManager } from '@craft-agent/shared/credentials'
import { homedir } from 'os'
import { ipcLog } from '../logger'

const CODEX_MODEL_TIMEOUT_MS = 15_000

export class CodexModelFetcher implements ModelFetcher {
  /** Refresh every 30 minutes */
  readonly refreshIntervalMs = 30 * 60 * 1000

  async fetchModels(
    connection: LlmConnection,
    credentials: ModelFetcherCredentials,
  ): Promise<ModelFetchResult> {
    const codexPath = await getCodexPath()
    const client = new AppServerClient({
      codexPath,
      workDir: homedir(),
    })

    try {
      await Promise.race([
        client.connect(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(
          'Codex app-server failed to start within 15 seconds.',
        )), CODEX_MODEL_TIMEOUT_MS)),
      ])

      // Authenticate based on connection auth type
      const manager = getCredentialManager()
      if (connection.authType === 'oauth') {
        const oauth = await manager.getLlmOAuth(connection.slug)
        if (oauth?.idToken && oauth?.accessToken) {
          await client.accountLoginWithChatGptTokens({
            idToken: oauth.idToken,
            accessToken: oauth.accessToken,
          })
        }
      } else if (connection.authType === 'api_key') {
        if (!credentials.apiKey) {
          throw new Error('API key missing for Codex connection')
        }
        await client.accountLoginWithApiKey(credentials.apiKey)
      }

      // Fetch models with timeout
      const models = await Promise.race([
        client.modelList(),
        new Promise<never>((_, reject) => setTimeout(() => reject(new Error(
          'Codex model listing timed out after 15 seconds.',
        )), CODEX_MODEL_TIMEOUT_MS)),
      ])

      if (!models || models.length === 0) {
        throw new Error('No models returned from Codex model/list')
      }

      // Map to ModelDefinition format
      const modelDefs: ModelDefinition[] = models.map(m => ({
        id: m.model, // actual model slug (e.g., 'gpt-5.3-codex-spark')
        name: m.displayName,
        shortName: m.displayName.replace(/^GPT-[\d.]+ /, ''), // Strip "GPT-X.Y " prefix
        description: m.description,
        provider: 'openai' as const,
        contextWindow: 128_000, // default; model/list doesn't expose context window
        supportsThinking: m.supportedReasoningEfforts.length > 0,
      }))

      // Find server default
      const serverDefault = models.find(m => m.isDefault)

      ipcLog.info(`Fetched ${modelDefs.length} Codex models: ${modelDefs.map(m => m.id).join(', ')}`)

      return {
        models: modelDefs,
        serverDefault: serverDefault?.model,
      }
    } finally {
      try { await client.disconnect() } catch { /* ignore cleanup errors */ }
    }
  }
}
